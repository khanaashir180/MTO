const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const sharp = require('sharp');
const pool = require('../config/db');
const { ApiError } = require('../utils/errors');
const { buildLateOrdersCsv } = require('../utils/csv');
const { streamLateOrdersPdf } = require('../utils/pdf');
const { secureUploadedFile } = require('../utils/fileSecurity');
const { postOrderLedgerEntries, ensureAccount } = require('./financeController');

function toPublicUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

function buildProductionOrderNo(orderId, orderType = 'MTO') {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const normalizedOrderType = String(orderType || 'MTO').trim().toUpperCase();
  const prefix = normalizedOrderType === 'REFURBISHMENT'
    ? 'RF'
    : normalizedOrderType === 'RETURN'
      ? 'RT'
      : 'PO';
  return `${prefix}-${y}${m}${d}-${String(orderId).padStart(6, '0')}`;
}

function buildRecoveryReferenceNo(baseProductionOrderNo, caseType = 'REPLACEMENT', replacementSequence = 1) {
  const base = String(baseProductionOrderNo || '').trim();
  if (!base) return '';
  const normalizedCaseType = String(caseType || 'REPLACEMENT').trim().toUpperCase() === 'REMAKE'
    ? 'REPLACEMENT'
    : String(caseType || 'REPLACEMENT').trim().toUpperCase();
  const suffix = normalizedCaseType === 'REPAIR'
      ? 'P'
      : 'R';
  return `${base}-${suffix}${Math.max(1, Number(replacementSequence) || 1)}`;
}

function normalizeRecoveryCaseType(caseType) {
  const normalized = String(caseType || 'REPLACEMENT').trim().toUpperCase();
  return normalized === 'REMAKE' ? 'REPLACEMENT' : normalized;
}

function getImageTitle(imageType) {
  const map = {
    DESIGN_REFERENCE: 'Design Reference',
    COLOUR_REFERENCE: 'Colour Reference',
    SOLE_REFERENCE: 'Sole Reference',
    ADDITIONAL_REFERENCE: 'Additional Reference',
  };
  return map[imageType] || imageType;
}

function resolveStoredImagePath(image) {
  if (image.path && fs.existsSync(image.path)) {
    return image.path;
  }

  if (image.url) {
    const filename = image.url.split('/').pop();
    if (filename) {
      const fallbackPath = path.resolve(__dirname, '..', '..', 'uploads', filename);
      if (fs.existsSync(fallbackPath)) {
        return fallbackPath;
      }
    }
  }

  return null;
}

async function getPdfEmbeddableImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.webp') {
    return sharp(imagePath).png().toBuffer();
  }
  return imagePath;
}

async function buildBarcodePng(barcodeValue) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: barcodeValue,
    scale: 2,
    height: 12,
    includetext: true,
    textxalign: 'center',
  });
}

async function fetchOrderSnapshot(client, orderId) {
  const { rows } = await client.query(
    `SELECT o.id, o.production_order_no, o.customer_name, o.customer_number, o.customer_address, o.delivery_address,
            o.ordered_from, o.order_date, o.due_date, o.status, o.current_stage_id, o.comments, o.production_flow, o.order_type,
            op.product_name, op.size, op.colour, op.last_number, op.sole,
            op.upper_material, op.lining_material, op.edge_colour, op.socks, op.welt, op.stamp,
            r.item_condition, r.refurbishment_type, r.issue_description, r.work_requested, r.accessories_received,
            ret.return_condition, ret.return_reason, ret.return_request, ret.accessories_received AS return_accessories_received,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'type', pi.image_type,
                  'url', pi.file_url,
                  'name', pi.original_name
                ) ORDER BY pi.id
              ) FILTER (WHERE pi.id IS NOT NULL),
              '[]'
            ) AS images
     FROM orders o
     JOIN order_products op ON op.order_id = o.id
     LEFT JOIN order_refurbishments r ON r.order_id = o.id
     LEFT JOIN order_returns ret ON ret.order_id = o.id
     LEFT JOIN product_images pi ON pi.product_id = op.id
     WHERE o.id = $1
     GROUP BY o.id, op.id, r.id, ret.id`,
    [orderId]
  );
  return rows[0] || null;
}

async function writeChangeLog(client, { orderId, userId, source, beforeData, afterData }) {
  await client.query(
    `INSERT INTO order_change_logs (order_id, changed_by, change_source, before_data, after_data)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [orderId, userId, source, JSON.stringify(beforeData || {}), JSON.stringify(afterData || {})]
  );
}

async function assertActiveOutlet(client, outletName) {
  const name = String(outletName || '').trim();
  if (!name) {
    throw new ApiError(400, 'Ordered From outlet is required');
  }
  const { rows } = await client.query(
    `SELECT id FROM outlets WHERE is_active = true AND LOWER(name) = LOWER($1) LIMIT 1`,
    [name]
  );
  if (!rows[0]) {
    throw new ApiError(400, 'Selected outlet is not active');
  }
}

function getRetailOutletScope(req) {
  if (['RETAIL', 'SHOP_MANAGER'].includes(req.user?.role) && req.user?.outlet_name) {
    return String(req.user.outlet_name);
  }
  return null;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildCustomerNumberCandidates(customerNumber, customerCountryCode = '') {
  const rawDigits = digitsOnly(customerNumber);
  const countryDigits = digitsOnly(customerCountryCode);
  if (!rawDigits) return [];
  const candidates = new Set([rawDigits]);
  let localDigits = rawDigits;
  if (countryDigits && rawDigits.startsWith(countryDigits) && rawDigits.length > countryDigits.length) {
    localDigits = rawDigits.slice(countryDigits.length);
  }
  if (localDigits.startsWith('0')) {
    candidates.add(localDigits.slice(1));
  } else {
    candidates.add(`0${localDigits}`);
  }
  if (countryDigits) {
    candidates.add(`${countryDigits}${localDigits.replace(/^0+/, '')}`);
  }
  return Array.from(candidates).filter((entry) => entry.length >= 7);
}

function buildCustomerLocalTail(customerNumber, customerCountryCode = '') {
  const countryDigits = digitsOnly(customerCountryCode);
  let localDigits = digitsOnly(customerNumber);
  if (countryDigits && localDigits.startsWith(countryDigits) && localDigits.length > countryDigits.length) {
    localDigits = localDigits.slice(countryDigits.length);
  }
  localDigits = localDigits.replace(/^0+/, '');
  return localDigits.length >= 7 ? localDigits : '';
}

function normalizeCustomerNumber(customerNumber, customerCountryCode = '') {
  const countryDigits = digitsOnly(customerCountryCode);
  let localDigits = digitsOnly(customerNumber);
  if (countryDigits && localDigits.startsWith(countryDigits) && localDigits.length > countryDigits.length) {
    localDigits = localDigits.slice(countryDigits.length);
  }
  localDigits = localDigits.replace(/^0+/, '');
  if (!countryDigits || !localDigits) return '';
  return `+${countryDigits}${localDigits}`;
}

function isValidCustomerName(customerName) {
  const normalized = String(customerName || '').trim();
  const digitCount = (normalized.match(/\d/g) || []).length;
  return Boolean(normalized)
    && /[A-Za-z]/.test(normalized)
    && digitCount <= 3
    && !/\d{4,}/.test(normalized);
}

async function findCustomerAccountByNumber(client, customerNumber, customerCountryCode = '') {
  const candidates = buildCustomerNumberCandidates(customerNumber, customerCountryCode);
  const localTail = buildCustomerLocalTail(customerNumber, customerCountryCode);
  if (!candidates.length) return null;
  const { rows } = await client.query(
    `SELECT id, customer_name, customer_number, customer_address, outlet_name, updated_at
     FROM customer_accounts
     WHERE regexp_replace(customer_number, '[^0-9]', '', 'g') = ANY($1::text[])
        OR ($2 <> '' AND RIGHT(regexp_replace(customer_number, '[^0-9]', '', 'g'), LENGTH($2)) = $2)
     LIMIT 1`,
    [candidates, localTail]
  );
  return rows[0] || null;
}

function buildCustomerCriticality(history) {
  const totalOrders = Number(history?.total_orders || 0);
  const totalSpend = Number(history?.total_spend || 0);
  const openOrders = Number(history?.open_orders || 0);
  const activeRecoveryCases = Number(history?.active_recovery_cases || 0);

  if (totalOrders >= 10 || totalSpend >= 500000 || activeRecoveryCases >= 2 || openOrders >= 4) {
    return {
      level: 'HIGH',
      note: 'High-value or high-touch customer. Review history carefully before booking.',
    };
  }
  if (totalOrders >= 4 || totalSpend >= 100000 || activeRecoveryCases >= 1 || openOrders >= 2) {
    return {
      level: 'MEDIUM',
      note: 'Established customer. Check recent orders and open commitments before promising delivery.',
    };
  }
  return {
    level: 'STANDARD',
    note: 'Low recorded history. Proceed with normal booking checks.',
  };
}

async function getCapacityForDate(client, dueDate, orderType = 'MTO') {
  const normalizedOrderType = String(orderType || 'MTO').trim().toUpperCase();
  const capacityRes = await client.query(
    `SELECT id, capacity_date, order_type, capacity_limit, notes
     FROM retail_order_capacity
     WHERE capacity_date = $1::date
       AND order_type = $2
     LIMIT 1`,
    [dueDate, normalizedOrderType]
  );
  const bookedRes = await client.query(
    `SELECT COUNT(*)::int AS booked_count
     FROM orders
     WHERE due_date = $1::date
       AND order_type = $2`,
    [dueDate, normalizedOrderType]
  );
  const capacity = capacityRes.rows[0] || null;
  const bookedCount = Number(bookedRes.rows[0]?.booked_count || 0);
  const capacityLimit = capacity ? Number(capacity.capacity_limit || 0) : null;
  return {
    date: dueDate,
    order_type: normalizedOrderType,
    capacity_limit: capacityLimit,
    booked_count: bookedCount,
    remaining_capacity: capacityLimit === null ? null : Math.max(0, capacityLimit - bookedCount),
    is_full: capacityLimit === null ? false : bookedCount >= capacityLimit,
    notes: capacity?.notes || null,
  };
}

async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      customerName,
      customerNumber,
      customerCountryCode = '',
      customerAddress,
      deliveryAddress = '',
      orderDate,
      dueDate,
      orderedFrom,
      productPrice,
      advancePaid,
      advancePaymentAccountId,
      splitPaymentEnabled,
      splitAdvancePaidPrimary,
      splitAdvancePaidSecondary,
      splitAdvancePaymentAccountIdSecondary,
      comments,
      orderType,
      productionFlow,
      productName,
      size,
      colour,
      lastNumber,
      sole,
      upperMaterial,
      liningMaterial,
      edgeColour,
      socks,
      welt,
      stamp,
      itemCondition,
      refurbishmentType,
      issueDescription,
      workRequested,
      accessoriesReceived,
      returnCondition,
      returnReason,
      returnRequest,
      returnAccessoriesReceived,
    } = req.body;

    const normalizedCustomerNumber = normalizeCustomerNumber(customerNumber, customerCountryCode);
    const existingCustomer = await findCustomerAccountByNumber(client, customerNumber, customerCountryCode);
    const resolvedCustomerName = existingCustomer?.customer_name || customerName;
    const resolvedCustomerAddress = existingCustomer?.customer_address || customerAddress;
    const resolvedDeliveryAddress = String(deliveryAddress || resolvedCustomerAddress || '').trim();

    if (!isValidCustomerName(resolvedCustomerName)) {
      throw new ApiError(400, 'Customer name must contain letters and cannot be a numeric string');
    }
    if (!normalizedCustomerNumber || !resolvedCustomerAddress || !resolvedDeliveryAddress || !orderDate || !dueDate || !productName) {
      throw new ApiError(400, 'Missing required order fields');
    }
    const normalizedOrderType = String(orderType || 'MTO').toUpperCase();
    if (!['MTO', 'REFURBISHMENT', 'RETURN'].includes(normalizedOrderType)) {
      throw new ApiError(400, 'Invalid order type');
    }
    const normalizedProductionFlow = String(productionFlow || 'BESPOKE').toUpperCase();
    if (!['BESPOKE', 'EMBROIDERY', 'LASER', 'MTO'].includes(normalizedProductionFlow)) {
      throw new ApiError(400, 'Invalid production flow');
    }
    const effectiveOutlet = req.user.outlet_name || orderedFrom;
    await assertActiveOutlet(client, effectiveOutlet);
    const today = new Date().toISOString().slice(0, 10);
    if (orderDate < today) {
      throw new ApiError(400, 'Order date cannot be before today');
    }
    if (normalizedOrderType === 'MTO') {
      const capacityStatus = await getCapacityForDate(client, dueDate, normalizedOrderType);
      if (capacityStatus.capacity_limit !== null && capacityStatus.booked_count >= capacityStatus.capacity_limit) {
        throw new ApiError(400, `MTO booking capacity is full for ${dueDate}. Capacity ${capacityStatus.capacity_limit}, booked ${capacityStatus.booked_count}.`);
      }
    }
    const price = Number(productPrice || 0);
    const splitEnabled = normalizedOrderType === 'MTO' && String(splitPaymentEnabled || '').toLowerCase() === 'true';
    const primaryAdvance = splitEnabled ? Number(splitAdvancePaidPrimary || 0) : Number(advancePaid || 0);
    const secondaryAdvance = splitEnabled ? Number(splitAdvancePaidSecondary || 0) : 0;
    const advance = splitEnabled ? (primaryAdvance + secondaryAdvance) : primaryAdvance;
    if (Number.isNaN(price) || price < 0) throw new ApiError(400, 'Invalid product price');
    if (Number.isNaN(advance) || advance < 0) throw new ApiError(400, 'Invalid advance value');
    if (splitEnabled && (Number.isNaN(primaryAdvance) || Number.isNaN(secondaryAdvance) || primaryAdvance < 0 || secondaryAdvance < 0)) {
      throw new ApiError(400, 'Invalid split payment values');
    }
    if (advance > price) throw new ApiError(400, 'Advance cannot exceed price');
    const parsedAdvanceAccountId = advancePaymentAccountId ? Number(advancePaymentAccountId) : null;
    const parsedSecondaryAdvanceAccountId = splitAdvancePaymentAccountIdSecondary ? Number(splitAdvancePaymentAccountIdSecondary) : null;
    if (parsedAdvanceAccountId && (!Number.isInteger(parsedAdvanceAccountId) || parsedAdvanceAccountId <= 0)) {
      throw new ApiError(400, 'Invalid advance payment account');
    }
    if (parsedSecondaryAdvanceAccountId && (!Number.isInteger(parsedSecondaryAdvanceAccountId) || parsedSecondaryAdvanceAccountId <= 0)) {
      throw new ApiError(400, 'Invalid second advance payment account');
    }
    if (primaryAdvance > 0 && !parsedAdvanceAccountId) {
      throw new ApiError(400, 'Advance payment account is required when advance is entered');
    }
    if (splitEnabled && secondaryAdvance > 0 && !parsedSecondaryAdvanceAccountId) {
      throw new ApiError(400, 'Second payment account is required for second split amount');
    }

    await client.query('BEGIN');
    if (parsedAdvanceAccountId) {
      const advanceAccount = await client.query(
        `SELECT id FROM payment_accounts WHERE id = $1 AND is_active = true`,
        [parsedAdvanceAccountId]
      );
      if (!advanceAccount.rows[0]) throw new ApiError(400, 'Selected advance payment account is not active');
    }
    if (parsedSecondaryAdvanceAccountId) {
      const secondAdvanceAccount = await client.query(
        `SELECT id FROM payment_accounts WHERE id = $1 AND is_active = true`,
        [parsedSecondaryAdvanceAccountId]
      );
      if (!secondAdvanceAccount.rows[0]) throw new ApiError(400, 'Selected second advance payment account is not active');
    }
    const nextOrderId = await client.query(`SELECT nextval('orders_id_seq') AS id`);
    const orderId = nextOrderId.rows[0].id;
    const productionOrderNo = buildProductionOrderNo(orderId, normalizedOrderType);

    const firstStage = await client.query('SELECT id FROM production_stages ORDER BY sequence LIMIT 1');
    const stageId = firstStage.rows[0].id;

    const orderInsert = await client.query(
      `INSERT INTO orders (
        id, production_order_no, customer_name, customer_number, customer_address, delivery_address, ordered_from,
        order_date, due_date, product_price, advance_paid, advance_payment_account_id, balance_payment_account_id,
        comments, order_type, production_flow, status, current_stage_id, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'PENDING',$17,$18)
      RETURNING *`,
      [
        orderId,
        productionOrderNo,
        resolvedCustomerName,
        normalizedCustomerNumber,
        resolvedCustomerAddress,
        resolvedDeliveryAddress,
        effectiveOutlet,
        orderDate,
        dueDate,
        price,
        advance,
        parsedAdvanceAccountId,
        null,
        comments || null,
        normalizedOrderType,
        normalizedProductionFlow,
        stageId,
        req.user.id,
      ]
    );

    const order = orderInsert.rows[0];
    const barcode = `${productionOrderNo}-${Date.now().toString().slice(-6)}`;

    const productInsert = await client.query(
      `INSERT INTO order_products (
        order_id, product_name, size, colour, last_number, sole,
        upper_material, lining_material, edge_colour, socks, welt, stamp, barcode
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        order.id,
        productName,
        size,
        colour,
        lastNumber,
        sole,
        upperMaterial,
        liningMaterial,
        edgeColour,
        socks,
        welt,
        stamp,
        barcode,
      ]
    );

    const product = productInsert.rows[0];

    if (normalizedOrderType === 'REFURBISHMENT') {
      await client.query(
        `INSERT INTO order_refurbishments (
           order_id, item_condition, refurbishment_type, issue_description, work_requested, accessories_received
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id,
          itemCondition || null,
          refurbishmentType || null,
          issueDescription || null,
          workRequested || null,
          accessoriesReceived || null,
        ]
      );
    }
    if (normalizedOrderType === 'RETURN') {
      await client.query(
        `INSERT INTO order_returns (
           order_id, return_condition, return_reason, return_request, accessories_received
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          order.id,
          returnCondition || null,
          returnReason || null,
          returnRequest || null,
          returnAccessoriesReceived || null,
        ]
      );
    }

    const images = [];
    const imageTypeMap = {
      designReference: 'DESIGN_REFERENCE',
      colourReference: 'COLOUR_REFERENCE',
      soleReference: 'SOLE_REFERENCE',
      additionalReference: 'ADDITIONAL_REFERENCE',
    };

    for (const [fieldName, imageType] of Object.entries(imageTypeMap)) {
      const fileList = req.files?.[fieldName] || [];
      for (const file of fileList) {
        await secureUploadedFile(file, { mode: 'image' });
        images.push({
          productId: product.id,
          imageType,
          filePath: path.normalize(file.path),
          fileUrl: toPublicUrl(req, file.filename),
          originalName: file.originalname,
        });
      }
    }

    for (const image of images) {
      await client.query(
        `INSERT INTO product_images (product_id, image_type, file_path, file_url, original_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [image.productId, image.imageType, image.filePath, image.fileUrl, image.originalName]
      );
    }

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'ENTERED', $3, 'Order created')`,
      [order.id, stageId, req.user.id]
    );
    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'IN_PROGRESS', $3, 'Order entered stage')`,
      [order.id, stageId, req.user.id]
    );

    await postOrderLedgerEntries({
      client,
      orderId: order.id,
      productionOrderNo,
      orderDate,
      customerName: resolvedCustomerName,
      customerNumber: normalizedCustomerNumber,
      customerAddress: resolvedCustomerAddress,
      outletName: effectiveOutlet,
      productPrice: price,
      advancePaid: advance,
      advancePaymentAccountId: parsedAdvanceAccountId,
      advanceBreakup: splitEnabled
        ? [
          { amount: primaryAdvance, paymentAccountId: parsedAdvanceAccountId, label: 'Split 1' },
          { amount: secondaryAdvance, paymentAccountId: parsedSecondaryAdvanceAccountId, label: 'Split 2' },
        ]
        : [
          { amount: advance, paymentAccountId: parsedAdvanceAccountId, label: 'Primary' },
        ],
      createdBy: req.user.id,
    });

    await client.query('COMMIT');

    const payload = { order, product, images };
    req.io?.emit?.('order:created', payload);
    res.status(201).json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return next(new ApiError(409, 'Production Order Number must be unique'));
    }
    next(error);
  } finally {
    client.release();
  }
}

async function getRetailOrderCapacity(req, res, next) {
  try {
    const orderType = String(req.query?.orderType || 'MTO').trim().toUpperCase();
    const dateFrom = String(req.query?.dateFrom || '').trim();
    const dateTo = String(req.query?.dateTo || '').trim();
    const singleDate = String(req.query?.date || '').trim();

    let fromDate = dateFrom;
    let toDate = dateTo;
    if (singleDate) {
      fromDate = singleDate;
      toDate = singleDate;
    }
    if (!fromDate || !toDate) {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
      fromDate = fromDate || monthStart;
      toDate = toDate || monthEnd;
    }

    const { rows } = await pool.query(
      `WITH dates AS (
         SELECT generate_series($1::date, $2::date, interval '1 day')::date AS capacity_date
       ),
       booked AS (
         SELECT due_date AS capacity_date, COUNT(*)::int AS booked_count
         FROM orders
         WHERE due_date BETWEEN $1::date AND $2::date
           AND order_type = $3
         GROUP BY due_date
       )
       SELECT d.capacity_date,
              $3::varchar AS order_type,
              c.capacity_limit,
              c.notes,
              COALESCE(b.booked_count, 0) AS booked_count
       FROM dates d
       LEFT JOIN retail_order_capacity c
         ON c.capacity_date = d.capacity_date
        AND c.order_type = $3
       LEFT JOIN booked b
         ON b.capacity_date = d.capacity_date
       ORDER BY d.capacity_date ASC`,
      [fromDate, toDate, orderType]
    );

    res.json({
      capacities: rows.map((row) => ({
        date: String(row.capacity_date).slice(0, 10),
        order_type: row.order_type,
        capacity_limit: row.capacity_limit === null ? null : Number(row.capacity_limit),
        booked_count: Number(row.booked_count || 0),
        remaining_capacity: row.capacity_limit === null ? null : Math.max(0, Number(row.capacity_limit) - Number(row.booked_count || 0)),
        is_full: row.capacity_limit === null ? false : Number(row.booked_count || 0) >= Number(row.capacity_limit),
        notes: row.notes || null,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function lookupCustomerByNumber(req, res, next) {
  try {
    const customerNumber = String(req.query?.customerNumber || '').trim();
    const customerCountryCode = String(req.query?.customerCountryCode || '').trim();
    if (!customerNumber) {
      return res.status(400).json({ message: 'customerNumber is required' });
    }

    const candidates = buildCustomerNumberCandidates(customerNumber, customerCountryCode);
    const customer = await findCustomerAccountByNumber(pool, customerNumber, customerCountryCode);
    if (!customer) {
      return res.json({
        exists: false,
        customer: null,
        message: 'New customer number',
      });
    }

    const [historyRes, recentOrdersRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_orders,
           COUNT(*) FILTER (WHERE UPPER(COALESCE(order_type, 'MTO')) = 'MTO')::int AS mto_orders,
           COUNT(*) FILTER (WHERE UPPER(COALESCE(order_type, 'MTO')) = 'REFURBISHMENT')::int AS refurbishment_orders,
           COUNT(*) FILTER (WHERE UPPER(COALESCE(order_type, 'MTO')) = 'RETURN')::int AS return_orders,
           COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'SHIPPED'))::int AS open_orders,
           COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('COMPLETED', 'SHIPPED'))::int AS late_orders,
           COALESCE(SUM(product_price), 0)::numeric(12,2) AS total_spend,
           COALESCE(SUM(product_price - advance_paid), 0)::numeric(12,2) AS outstanding_balance,
           MAX(order_date) AS last_order_date,
           MAX(created_at) AS last_booked_at
         FROM orders
         WHERE regexp_replace(customer_number, '[^0-9]', '', 'g') = ANY($1::text[])`,
        [candidates]
      ),
      pool.query(
        `SELECT
           o.id,
           o.production_order_no,
           o.order_type,
           o.status,
           o.order_date,
           o.due_date,
           o.ordered_from,
           o.product_price,
           o.advance_paid,
           (o.product_price - o.advance_paid)::numeric(12,2) AS balance
         FROM orders o
         WHERE regexp_replace(o.customer_number, '[^0-9]', '', 'g') = ANY($1::text[])
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 6`,
        [candidates]
      ),
    ]);

    const recoveryRes = await pool.query(
      `SELECT COUNT(*)::int AS active_recovery_cases
       FROM retail_recovery_cases rc
       JOIN orders o ON o.id = rc.order_id
       WHERE regexp_replace(o.customer_number, '[^0-9]', '', 'g') = ANY($1::text[])
         AND COALESCE(rc.workflow_status, 'OPEN') NOT IN ('CLOSED', 'REJECTED')`,
      [candidates]
    );

    const history = {
      ...(historyRes.rows[0] || {}),
      active_recovery_cases: Number(recoveryRes.rows[0]?.active_recovery_cases || 0),
    };
    const criticality = buildCustomerCriticality(history);

    res.json({
      exists: true,
      customer,
      history,
      criticality,
      recentOrders: recentOrdersRes.rows || [],
      message: 'Existing CRM customer found',
    });
  } catch (error) {
    next(error);
  }
}

async function upsertRetailOrderCapacity(req, res, next) {
  try {
    const capacityDate = String(req.body?.capacityDate || '').trim();
    const orderType = String(req.body?.orderType || 'MTO').trim().toUpperCase();
    const capacityLimit = Number(req.body?.capacityLimit);
    const notes = String(req.body?.notes || '').trim();
    if (!capacityDate) {
      return res.status(400).json({ message: 'capacityDate is required' });
    }
    if (!Number.isInteger(capacityLimit) || capacityLimit < 0) {
      return res.status(400).json({ message: 'capacityLimit must be a non-negative integer' });
    }

    const saved = await pool.query(
      `INSERT INTO retail_order_capacity
       (capacity_date, order_type, capacity_limit, notes, created_by, updated_by, created_at, updated_at)
       VALUES ($1::date, $2, $3, $4, $5, $5, NOW(), NOW())
       ON CONFLICT (capacity_date, order_type)
       DO UPDATE SET
         capacity_limit = EXCLUDED.capacity_limit,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [capacityDate, orderType, capacityLimit, notes || null, req.user.id]
    );

    res.json({ capacity: saved.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function getRetailDashboard(req, res, next) {
  try {
    const { dateFrom, dateTo, outlet, outlets, status, search } = req.query;
    const scopedOutlet = getRetailOutletScope(req);

    const filters = [];
    const values = [];

    if (dateFrom) {
      values.push(dateFrom);
      filters.push(`o.order_date >= $${values.length}`);
    }
    if (dateTo) {
      values.push(dateTo);
      filters.push(`o.order_date <= $${values.length}`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      filters.push(`LOWER(o.ordered_from) = LOWER($${values.length})`);
    } else if (outlets) {
      const outletList = outlets
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (outletList.length) {
        values.push(outletList);
        filters.push(`o.ordered_from = ANY($${values.length})`);
      }
    } else if (outlet) {
      values.push(outlet);
      filters.push(`o.ordered_from = $${values.length}`);
    }
    if (status) {
      values.push(status);
      filters.push(`o.status = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      filters.push(`(o.production_order_no ILIKE $${values.length} OR o.customer_name ILIKE $${values.length})`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const { rows: orders } = await pool.query(
      `SELECT o.id, o.production_order_no, o.customer_name, o.ordered_from, o.order_date, o.due_date,
              o.status, o.completed_at, o.created_at, o.order_type, o.production_flow, o.product_price,
              ps.name AS current_stage,
              u.full_name AS created_by_name,
              (
                SELECT MIN(h.scanned_at)
                FROM order_stage_history h
                WHERE h.order_id = o.id
              ) AS factory_released_at,
              CASE WHEN o.due_date < CURRENT_DATE AND o.status NOT IN ('COMPLETED','SHIPPED') THEN true ELSE false END AS is_late
       FROM orders o
       LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
       LEFT JOIN users u ON u.id = o.created_by
       ${whereClause}
       ORDER BY o.created_at DESC`,
      values
    );

    const { rows: summaryRows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','SHIPPED'))::int AS pending_in_production,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
         COUNT(*) FILTER (WHERE status = 'SHIPPED')::int AS shipped,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('COMPLETED','SHIPPED'))::int AS late_orders
       FROM orders o
       ${whereClause}`,
      values
    );

    res.json({ orders, summary: summaryRows[0] });
  } catch (error) {
    next(error);
  }
}

async function getOrderDetails(req, res, next) {
  try {
    const { id } = req.params;
    const scopedOutlet = getRetailOutletScope(req);
    const values = [id];
    let scopeClause = '';
    if (scopedOutlet) {
      values.push(scopedOutlet);
      scopeClause = `AND LOWER(o.ordered_from) = LOWER($${values.length})`;
    }

    const { rows } = await pool.query(
      `SELECT o.*, ps.name AS current_stage, op.*,
              r.item_condition, r.refurbishment_type, r.issue_description, r.work_requested, r.accessories_received,
              ret.return_condition, ret.return_reason, ret.return_request, ret.accessories_received AS return_accessories_received,
              COALESCE(
                JSON_AGG(JSON_BUILD_OBJECT('id', pi.id, 'type', pi.image_type, 'url', pi.file_url, 'name', pi.original_name, 'path', pi.file_path))
                FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       LEFT JOIN order_refurbishments r ON r.order_id = o.id
       LEFT JOIN order_returns ret ON ret.order_id = o.id
       LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
       LEFT JOIN product_images pi ON pi.product_id = op.id
       WHERE o.id = $1
       ${scopeClause}
       GROUP BY o.id, ps.name, op.id, r.id, ret.id`,
      values
    );

    if (!rows[0]) return res.status(404).json({ message: 'Order not found' });

    const order = rows[0];
    const replacementResult = await pool.query(
      `SELECT
         rc.*,
         latest_note.note_text AS latest_note_text,
         latest_note.note_type AS latest_note_type,
         latest_note.created_at AS latest_note_created_at,
         latest_note.actor_name AS latest_note_actor_name,
         attachment_stats.attachment_count,
         attachment_stats.attachments_json
       FROM retail_recovery_cases rc
       LEFT JOIN LATERAL (
         SELECT
           n.note_text,
           n.note_type,
           n.created_at,
           u.full_name AS actor_name
         FROM retail_recovery_case_notes n
         LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.recovery_case_id = rc.id
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT 1
       ) latest_note ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS attachment_count,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'id', a.id,
                 'file_name', a.file_name,
                 'file_url', a.file_url,
                 'note', a.note,
                 'created_at', a.created_at
               )
               ORDER BY a.created_at DESC, a.id DESC
             ),
             '[]'::json
           ) AS attachments_json
         FROM retail_recovery_case_attachments a
         WHERE a.recovery_case_id = rc.id
       ) attachment_stats ON TRUE
       WHERE rc.original_order_id = $1
       ORDER BY rc.replacement_sequence DESC, rc.created_at DESC, rc.id DESC`,
      [id]
    );
    const replacementNotesResult = await pool.query(
      `SELECT
         n.id,
         n.recovery_case_id,
         n.note_type,
         n.note_text,
         n.created_at,
         u.full_name AS actor_name
       FROM retail_recovery_case_notes n
       LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.recovery_case_id IN (
         SELECT id
         FROM retail_recovery_cases
         WHERE original_order_id = $1
       )
       ORDER BY n.created_at DESC, n.id DESC`,
      [id]
    );
    const replacementAuditResult = await pool.query(
      `SELECT
         a.id,
         a.recovery_case_id,
         a.change_type,
         a.before_data,
         a.after_data,
         a.created_at,
         u.full_name AS changed_by_name
       FROM retail_recovery_case_audit a
       LEFT JOIN users u ON u.id = a.changed_by
       WHERE a.recovery_case_id IN (
         SELECT id
         FROM retail_recovery_cases
         WHERE original_order_id = $1
       )
       ORDER BY a.created_at DESC, a.id DESC`,
      [id]
    );

    const replacementCases = replacementResult.rows.map((item) => ({
      ...item,
      case_type: normalizeRecoveryCaseType(item.case_type),
      recovery_reference_no: buildRecoveryReferenceNo(
        item.production_order_no,
        normalizeRecoveryCaseType(item.case_type),
        item.replacement_sequence
      ),
    }));
    const replacementNotes = replacementNotesResult.rows;
    const replacementAudit = replacementAuditResult.rows;
    const activeReplacementCase = replacementCases.find((item) => !['CLOSED', 'REJECTED'].includes(String(item.workflow_status || '').toUpperCase()))
      || replacementCases[0]
      || null;
    const replacementSummary = {
      has_replacements: replacementCases.length > 0,
      total_replacements: replacementCases.length,
      open_replacements: replacementCases.filter((item) => !['CLOSED', 'REJECTED'].includes(String(item.workflow_status || '').toUpperCase())).length,
      max_replacement_sequence: replacementCases.reduce((max, item) => Math.max(max, Number(item.replacement_sequence || 0)), 0),
      total_replacement_notes: replacementNotes.length,
      total_replacement_audit_events: replacementAudit.length,
      latest_case_id: activeReplacementCase?.id || null,
      latest_case_type: activeReplacementCase?.case_type || null,
      latest_reason_code: activeReplacementCase?.reason_code || null,
      latest_root_cause_bucket: activeReplacementCase?.root_cause_bucket || null,
      latest_owner_name: activeReplacementCase?.owner_name || null,
      latest_priority_level: activeReplacementCase?.priority_level || null,
      latest_workflow_status: activeReplacementCase?.workflow_status || null,
      latest_promised_resolution_date: activeReplacementCase?.promised_resolution_date || null,
      latest_financial_resolution_type: activeReplacementCase?.financial_resolution_type || null,
      latest_estimated_cost: activeReplacementCase?.estimated_cost || null,
      latest_customer_satisfaction_status: activeReplacementCase?.customer_satisfaction_status || null,
      latest_notes: activeReplacementCase?.notes || null,
      latest_note_text: activeReplacementCase?.latest_note_text || null,
      latest_note_type: activeReplacementCase?.latest_note_type || null,
      latest_note_created_at: activeReplacementCase?.latest_note_created_at || null,
      latest_note_actor_name: activeReplacementCase?.latest_note_actor_name || null,
      attachment_count: Number(activeReplacementCase?.attachment_count || 0),
      resolution_brief: activeReplacementCase
        ? [
            activeReplacementCase.reason_code ? `Problem: ${activeReplacementCase.reason_code}` : null,
            activeReplacementCase.root_cause_bucket ? `Root cause: ${activeReplacementCase.root_cause_bucket}` : null,
            activeReplacementCase.notes ? `Action required: ${activeReplacementCase.notes}` : null,
            activeReplacementCase.financial_resolution_type ? `Resolution path: ${activeReplacementCase.financial_resolution_type}` : null,
            activeReplacementCase.owner_name ? `Owner: ${activeReplacementCase.owner_name}` : null,
          ].filter(Boolean).join(' | ')
        : null,
    };

    res.json({
      ...order,
      replacement_summary: replacementSummary,
      replacement_cases: replacementCases.map((item) => ({
        id: item.id,
        case_type: item.case_type,
        reason_code: item.reason_code,
        root_cause_bucket: item.root_cause_bucket,
        complaint_channel: item.complaint_channel,
        owner_name: item.owner_name,
        promised_resolution_date: item.promised_resolution_date,
        estimated_cost: item.estimated_cost,
        financial_resolution_type: item.financial_resolution_type,
        customer_satisfaction_status: item.customer_satisfaction_status,
        customer_value_band: item.customer_value_band,
        priority_level: item.priority_level,
        workflow_status: item.workflow_status,
        notes: item.notes,
        first_time_fix: item.first_time_fix,
        closed_cleanly: item.closed_cleanly,
        approval_status: item.approval_status,
        replacement_sequence: item.replacement_sequence,
        recovery_reference_no: item.recovery_reference_no,
        created_at: item.created_at,
        updated_at: item.updated_at,
        latest_note_text: item.latest_note_text,
        latest_note_type: item.latest_note_type,
        latest_note_created_at: item.latest_note_created_at,
        latest_note_actor_name: item.latest_note_actor_name,
        attachment_count: Number(item.attachment_count || 0),
        attachments: item.attachments_json || [],
      })),
      replacement_notes: replacementNotes,
      replacement_audit: replacementAudit,
    });
  } catch (error) {
    next(error);
  }
}

async function updateOrderDetails(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      customerName,
      customerNumber,
      customerCountryCode,
      customerAddress,
      deliveryAddress,
      orderDate,
      dueDate,
      orderedFrom,
      comments,
      productionFlow,
      productName,
      size,
      colour,
      lastNumber,
      sole,
      upperMaterial,
      liningMaterial,
      edgeColour,
      socks,
      welt,
      stamp,
    } = req.body;

    await client.query('BEGIN');
    const beforeSnapshot = await fetchOrderSnapshot(client, id);

    const orderState = await client.query(
      `SELECT o.id, o.current_stage_id, ps.name AS current_stage_name, o.ordered_from
       FROM orders o
       LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE o.id = $1`,
      [id]
    );
    const current = orderState.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }
    const scopedOutlet = getRetailOutletScope(req);
    if (scopedOutlet && String(current.ordered_from || '').toLowerCase() !== scopedOutlet.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden for this outlet' });
    }

    if (req.user.role === 'PRODUCTION_SUPERVISOR') {
      const stageResult = await client.query(
        `SELECT name FROM production_stages WHERE id = $1`,
        [req.user.stage_access]
      );
      const supervisorStageName = stageResult.rows[0]?.name;
      if (supervisorStageName !== 'Verification') {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Only Verification supervisor can edit order details' });
      }
      if (Number(current.current_stage_id) !== Number(req.user.stage_access)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Order is not currently in your stage' });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    if (orderDate && orderDate < today) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order date cannot be before today' });
    }
    if (productionFlow) {
      const flow = String(productionFlow).toUpperCase();
      if (!['BESPOKE', 'EMBROIDERY', 'LASER', 'MTO'].includes(flow)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid production flow' });
      }
    }
    if (orderedFrom) {
      if (req.user.outlet_name && String(req.user.outlet_name).toLowerCase() !== String(orderedFrom).toLowerCase()) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Outlet user can only book orders for assigned outlet' });
      }
      await assertActiveOutlet(client, orderedFrom);
    }

    const normalizedCustomerNumber = customerNumber
      ? normalizeCustomerNumber(customerNumber, customerCountryCode)
      : '';
    if (customerName && !isValidCustomerName(customerName)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Customer name must contain letters and cannot be a numeric string' });
    }

    await client.query(
      `UPDATE orders
       SET customer_name = COALESCE($1, customer_name),
           customer_number = COALESCE($2, customer_number),
           customer_address = COALESCE($3, customer_address),
           delivery_address = COALESCE($4, delivery_address),
           order_date = COALESCE($5, order_date),
           due_date = COALESCE($6, due_date),
           ordered_from = COALESCE($7, ordered_from),
           comments = COALESCE($8, comments),
           production_flow = COALESCE($9, production_flow),
           updated_at = NOW()
       WHERE id = $10`,
      [
        customerName,
        normalizedCustomerNumber || null,
        customerAddress,
        deliveryAddress,
        orderDate,
        dueDate,
        orderedFrom,
        comments,
        productionFlow ? String(productionFlow).toUpperCase() : null,
        id,
      ]
    );

    await client.query(
      `UPDATE order_products
       SET product_name = COALESCE($1, product_name),
           size = COALESCE($2, size),
           colour = COALESCE($3, colour),
           last_number = COALESCE($4, last_number),
           sole = COALESCE($5, sole),
           upper_material = COALESCE($6, upper_material),
           lining_material = COALESCE($7, lining_material),
           edge_colour = COALESCE($8, edge_colour),
           socks = COALESCE($9, socks),
           welt = COALESCE($10, welt),
           stamp = COALESCE($11, stamp)
       WHERE order_id = $12`,
      [productName, size, colour, lastNumber, sole, upperMaterial, liningMaterial, edgeColour, socks, welt, stamp, id]
    );

    const { rows } = await client.query(
      `SELECT o.*, ps.name AS current_stage, op.*
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE o.id = $1`,
      [id]
    );
    const afterSnapshot = await fetchOrderSnapshot(client, id);
    if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
      await writeChangeLog(client, {
        orderId: Number(id),
        userId: req.user.id,
        source: 'ORDER_DETAILS_UPDATE',
        beforeData: beforeSnapshot,
        afterData: afterSnapshot,
      });
    }

    await client.query('COMMIT');
    res.json({ order: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateOrderImages(req, res, next) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const imageTypeByField = {
      designReference: 'DESIGN_REFERENCE',
      colourReference: 'COLOUR_REFERENCE',
      soleReference: 'SOLE_REFERENCE',
      additionalReference: 'ADDITIONAL_REFERENCE',
    };

    await client.query('BEGIN');
    const beforeSnapshot = await fetchOrderSnapshot(client, id);

    const orderState = await client.query(
      `SELECT o.id, o.current_stage_id, op.id AS product_id, o.ordered_from
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       WHERE o.id = $1`,
      [id]
    );
    const current = orderState.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }
    const scopedOutlet = getRetailOutletScope(req);
    if (scopedOutlet && String(current.ordered_from || '').toLowerCase() !== scopedOutlet.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden for this outlet' });
    }

    if (req.user.role === 'PRODUCTION_SUPERVISOR') {
      const stageResult = await client.query(
        `SELECT name FROM production_stages WHERE id = $1`,
        [req.user.stage_access]
      );
      const supervisorStageName = stageResult.rows[0]?.name;
      if (supervisorStageName !== 'Verification' || Number(current.current_stage_id) !== Number(req.user.stage_access)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Only Verification supervisor can change images for orders in Verification' });
      }
    }

    const removeTypes = String(req.body.removeTypes || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    for (const imageType of removeTypes) {
      const existing = await client.query(
        `SELECT id, file_path FROM product_images WHERE product_id = $1 AND image_type = $2`,
        [current.product_id, imageType]
      );
      for (const row of existing.rows) {
        if (row.file_path && fs.existsSync(row.file_path)) {
          try { fs.unlinkSync(row.file_path); } catch (_e) {}
        }
      }
      await client.query(`DELETE FROM product_images WHERE product_id = $1 AND image_type = $2`, [current.product_id, imageType]);
    }

    for (const [fieldName, imageType] of Object.entries(imageTypeByField)) {
      const file = req.files?.[fieldName]?.[0];
      if (!file) continue;
      await secureUploadedFile(file, { mode: 'image' });

      const existing = await client.query(
        `SELECT id, file_path FROM product_images WHERE product_id = $1 AND image_type = $2`,
        [current.product_id, imageType]
      );
      for (const row of existing.rows) {
        if (row.file_path && fs.existsSync(row.file_path)) {
          try { fs.unlinkSync(row.file_path); } catch (_e) {}
        }
      }
      await client.query(`DELETE FROM product_images WHERE product_id = $1 AND image_type = $2`, [current.product_id, imageType]);

      await client.query(
        `INSERT INTO product_images (product_id, image_type, file_path, file_url, original_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          current.product_id,
          imageType,
          path.normalize(file.path),
          toPublicUrl(req, file.filename),
          file.originalname,
        ]
      );
    }

    const { rows } = await client.query(
      `SELECT id, image_type AS type, file_url AS url, original_name AS name
       FROM product_images
       WHERE product_id = $1
       ORDER BY id`,
      [current.product_id]
    );
    const afterSnapshot = await fetchOrderSnapshot(client, id);
    if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
      await writeChangeLog(client, {
        orderId: Number(id),
        userId: req.user.id,
        source: 'ORDER_IMAGES_UPDATE',
        beforeData: beforeSnapshot,
        afterData: afterSnapshot,
      });
    }

    await client.query('COMMIT');
    res.json({ images: rows });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function downloadOrderPdf(req, res, next) {
  try {
    const { id } = req.params;
    const scopedOutlet = getRetailOutletScope(req);
    const values = [id];
    let scopeClause = '';
    if (scopedOutlet) {
      values.push(scopedOutlet);
      scopeClause = `AND LOWER(o.ordered_from) = LOWER($${values.length})`;
    }
    const { rows } = await pool.query(
      `SELECT o.*, ps.name AS current_stage, op.*,
              r.item_condition, r.refurbishment_type, r.issue_description, r.work_requested, r.accessories_received,
              ret.return_condition, ret.return_reason, ret.return_request, ret.accessories_received AS return_accessories_received,
              COALESCE(
                JSON_AGG(JSON_BUILD_OBJECT('id', pi.id, 'type', pi.image_type, 'url', pi.file_url, 'name', pi.original_name, 'path', pi.file_path))
                FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       LEFT JOIN order_refurbishments r ON r.order_id = o.id
       LEFT JOIN order_returns ret ON ret.order_id = o.id
       LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
       LEFT JOIN product_images pi ON pi.product_id = op.id
       WHERE o.id = $1
       ${scopeClause}
       GROUP BY o.id, ps.name, op.id, r.id, ret.id`,
      values
    );

    const order = rows[0];
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="order-${order.production_order_no}.pdf"`);

    doc.pipe(res);
    const margin = 28;
    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - margin * 2;
    const leftW = 330;
    const rightW = usableWidth - leftW - 10;
    const leftX = margin;
    const rightX = leftX + leftW + 10;
    const topY = margin;

    const orderType = String(order.order_type || 'MTO').toUpperCase();
    const docTitle = orderType === 'REFURBISHMENT'
      ? 'IOT (Refurbishment Tracker)'
      : orderType === 'RETURN'
        ? 'IOT (Return Tracker)'
        : 'IOT (Internal Order Tracker)';
    doc.fontSize(14).text(docTitle, margin, 12, { align: 'center' });

    // Top-left: customer details
    doc.fontSize(9);
    doc.text(`Name: ${order.customer_name}`, leftX + 8, topY + 12, { width: leftW - 16 });
    doc.text(`Number: ${order.customer_number}`, leftX + 8, topY + 26, { width: leftW - 16 });
    doc.text(`Address: ${order.customer_address}`, leftX + 8, topY + 40, { width: leftW - 16, height: 40 });

    // Top-right: barcode, production order, and order details
    try {
      const barcodePng = await buildBarcodePng(order.barcode);
      doc.image(barcodePng, rightX + 8, topY + 8, { fit: [rightW - 16, 44] });
    } catch (_error) {
      doc.fontSize(8).fillColor('#6B7280').text('(barcode unavailable)', rightX + 8, topY + 20);
    }
    doc
      .fontSize(9)
      .fillColor('#111827')
      .text(`Production Order: ${order.production_order_no}`, rightX + 8, topY + 58, { width: rightW - 16 });
    doc.text(`Order Date: ${order.order_date?.toISOString?.().slice(0, 10) || order.order_date}`, rightX + 8, topY + 72, { width: rightW - 16 });
    doc.text(`Due Date: ${order.due_date?.toISOString?.().slice(0, 10) || order.due_date}`, rightX + 8, topY + 84, { width: rightW - 16 });
    doc.text(`Ordered From: ${order.ordered_from}`, rightX + 8, topY + 96, { width: rightW - 16 });
    if (orderType === 'REFURBISHMENT' || orderType === 'RETURN') {
      doc.text(`Order Type: ${orderType}`, rightX + 8, topY + 108, { width: rightW - 16 });
    } else {
      const flow = String(order.production_flow || 'BESPOKE').toUpperCase();
      const mark = (name) => (flow === name ? '[X]' : '[ ]');
      doc.text(`Flow: ${mark('BESPOKE')} Bespoke  ${mark('EMBROIDERY')} Embroidery  ${mark('LASER')} Laser  ${mark('MTO')} MTO`, rightX + 8, topY + 108, { width: rightW - 16 });
    }

    const productTop = topY + 140;
    const tableW = Math.floor(usableWidth * 0.6);
    const tableX = margin;
    const tableGap = 12;
    const rightRefX = tableX + tableW + tableGap;
    const rightRefW = usableWidth - tableW - tableGap;
    const productRows = orderType === 'REFURBISHMENT' ? [
      ['Item Name', order.product_name || '-'],
      ['Item Condition', order.item_condition || '-'],
      ['Refurbishment Type', order.refurbishment_type || '-'],
      ['Issue Description', order.issue_description || '-'],
      ['Work Requested', order.work_requested || '-'],
      ['Accessories Received', order.accessories_received || '-'],
      ['Size', order.size || '-'],
      ['Colour', order.colour || '-'],
      ['Sole', order.sole || '-'],
      ['Stamp', order.stamp || '-'],
    ] : orderType === 'RETURN' ? [
      ['Item Name', order.product_name || '-'],
      ['Return Condition', order.return_condition || '-'],
      ['Return Reason', order.return_reason || '-'],
      ['Return Request', order.return_request || '-'],
      ['Accessories Received', order.return_accessories_received || '-'],
      ['Size', order.size || '-'],
      ['Colour', order.colour || '-'],
      ['Sole', order.sole || '-'],
      ['Stamp', order.stamp || '-'],
    ] : [
      ['Product Name', order.product_name || '-'],
      ['Size', order.size || '-'],
      ['Colour', order.colour || '-'],
      ['Last Number', order.last_number || '-'],
      ['Sole', order.sole || '-'],
      ['Upper Material', order.upper_material || '-'],
      ['Lining Material', order.lining_material || '-'],
      ['Edge Colour', order.edge_colour || '-'],
      ['Socks', order.socks || '-'],
      ['Welt', order.welt || '-'],
      ['Stamp', order.stamp || '-'],
    ];
    const rowHeight = 14;
    const keyWidth = 120;
    doc.lineWidth(0.6).strokeColor('#D1D5DB');
    const tableH = rowHeight * productRows.length;
    doc.rect(tableX, productTop, tableW, tableH).stroke();
    for (let i = 1; i < productRows.length; i += 1) {
      const y = productTop + i * rowHeight;
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).stroke();
    }
    doc.moveTo(tableX + keyWidth, productTop).lineTo(tableX + keyWidth, productTop + tableH).stroke();
    doc.fillColor('#111827');
    productRows.forEach(([key, value], idx) => {
      const y = productTop + idx * rowHeight + 2.2;
      doc.font('Helvetica-Bold').fontSize(9.1).text(String(key), tableX + 4, y, { width: keyWidth - 8 });
      doc.font('Helvetica').fontSize(9.1).text(String(value), tableX + keyWidth + 4, y, { width: tableW - keyWidth - 8 });
    });

    const refsByType = (order.images || []).reduce((acc, img) => {
      if (!acc[img.type]) acc[img.type] = img;
      return acc;
    }, {});

    // Two larger reference images at right of table.
    const rightSlotGap = 10;
    const rightSlotH = 170;
    const rightSlots = [
      { type: 'DESIGN_REFERENCE', title: 'Design Reference' },
      { type: 'COLOUR_REFERENCE', title: 'Colour Reference' },
    ];
    for (let idx = 0; idx < rightSlots.length; idx += 1) {
      const slot = rightSlots[idx];
      const image = refsByType[slot.type];
      const y = productTop + idx * (rightSlotH + rightSlotGap);
      if (!image) continue;
      doc.fontSize(8.5).fillColor('#111827').text(slot.title, rightRefX + 4, y + 2);
      const imagePath = resolveStoredImagePath(image);
      if (!imagePath) {
        // No title/placeholder when not usable, per IOT requirement.
        continue;
      }
      try {
        const embeddableImage = await getPdfEmbeddableImage(imagePath);
        doc.image(embeddableImage, rightRefX + 4, y + 14, { fit: [rightRefW - 8, rightSlotH - 22] });
      } catch (_error) {
        doc.fontSize(8).fillColor('#B91C1C').text('Cannot render', rightRefX + 4, y + rightSlotH / 2);
      }
    }

    // Remaining two references below.
    const commentsTop = productTop + tableH + 6;
    const commentsText = order.comments && String(order.comments).trim() ? String(order.comments).trim() : '-';
    doc.font('Helvetica-Bold').fontSize(9.3).fillColor('#111827').text('Comments:', tableX, commentsTop, { width: tableW });
    doc.font('Helvetica').fontSize(8.8).text(commentsText, tableX, commentsTop + 12, { width: tableW, height: 56 });

    const bottomTop = Math.max(productTop + rightSlotH * 2 + rightSlotGap + 10, commentsTop + 60);
    const boxGap = 10;
    const boxW = (usableWidth - boxGap) / 2;
    const boxH = 220;
    const bottomSlots = [
      { type: 'SOLE_REFERENCE', title: 'Sole Reference' },
      { type: 'ADDITIONAL_REFERENCE', title: 'Additional Reference' },
    ];

    for (let i = 0; i < bottomSlots.length; i += 1) {
      const slot = bottomSlots[i];
      const col = i % 2;
      const x = margin + col * (boxW + boxGap);
      const y = bottomTop;
      const image = refsByType[slot.type];
      if (!image) continue;
      doc.fontSize(8.5).fillColor('#111827').text(slot.title, x + 6, y + 5);

      const imagePath = resolveStoredImagePath(image);
      if (!imagePath) {
        // No title/placeholder when not usable, per IOT requirement.
        continue;
      }

      try {
        const embeddableImage = await getPdfEmbeddableImage(imagePath);
        doc.image(embeddableImage, x + 6, y + 18, { fit: [boxW - 12, boxH - 24] });
      } catch (_error) {
        doc.fontSize(8).fillColor('#B91C1C').text('Cannot render', x + 6, y + 54);
      }
    }

    doc.end();
  } catch (error) {
    next(error);
  }
}

async function downloadCustomerReferencePdf(req, res, next) {
  try {
    const { id } = req.params;
    const scopedOutlet = getRetailOutletScope(req);
    const values = [id];
    let scopeClause = '';
    if (scopedOutlet) {
      values.push(scopedOutlet);
      scopeClause = `AND LOWER(o.ordered_from) = LOWER($${values.length})`;
    }
    const { rows } = await pool.query(
      `SELECT o.*, op.product_name, op.size, op.colour
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       WHERE o.id = $1
       ${scopeClause}`,
      values
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="customer-reference-${order.production_order_no}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('Customer Order Reference', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(11).text(`Reference No: ${order.production_order_no}`);
    doc.text(`Customer Name: ${order.customer_name}`);
    doc.text(`Customer Number: ${order.customer_number}`);
    doc.text(`Customer Address: ${order.customer_address}`);
    doc.moveDown(0.5);
    doc.text(`Product: ${order.product_name}`);
    doc.text(`Size: ${order.size || '-'}`);
    doc.text(`Colour: ${order.colour || '-'}`);
    doc.text(`Order Date: ${order.order_date?.toISOString?.().slice(0, 10) || order.order_date}`);
    doc.text(`Due Date: ${order.due_date?.toISOString?.().slice(0, 10) || order.due_date}`);
    doc.text(`Outlet: ${order.ordered_from}`);
    doc.moveDown(0.5);
    doc.text(`Price: ${Number(order.product_price || 0).toFixed(2)}`);
    doc.text(`Advance Paid: ${Number(order.advance_paid || 0).toFixed(2)}`);
    doc.text(`Balance: ${(Number(order.product_price || 0) - Number(order.advance_paid || 0)).toFixed(2)}`);
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#4B5563').text('Keep this document for future order status reference.');

    doc.end();
  } catch (error) {
    next(error);
  }
}

async function getLateOrders(req, res, next) {
  try {
    const scopedOutlet = getRetailOutletScope(req);
    const values = [];
    let outletClause = '';
    if (scopedOutlet) {
      values.push(scopedOutlet);
      outletClause = ` AND LOWER(o.ordered_from) = LOWER($${values.length})`;
    }
    const { rows } = await pool.query(
      `SELECT o.production_order_no, o.customer_name, o.ordered_from, o.due_date, o.status,
              ps.name AS current_stage,
              GREATEST((CURRENT_DATE - o.due_date), 0) AS days_late
       FROM orders o
       LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE o.due_date < CURRENT_DATE AND o.status NOT IN ('COMPLETED', 'SHIPPED')
       ${outletClause}
       ORDER BY o.due_date ASC`,
      values
    );

    const format = (req.query.format || 'json').toLowerCase();
    if (format === 'csv') {
      const csv = buildLateOrdersCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="late-orders-report.csv"');
      return res.send(csv);
    }
    if (format === 'pdf') {
      return streamLateOrdersPdf(res, rows);
    }

    return res.json({ lateOrders: rows });
  } catch (error) {
    next(error);
  }
}

async function getOrderCounts(req, res, next) {
  try {
    const { from, to } = req.query;
    const scopedOutlet = getRetailOutletScope(req);
    const values = [];
    const filters = [];

    if (from) {
      values.push(from);
      filters.push(`order_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      filters.push(`order_date <= $${values.length}`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      filters.push(`LOWER(ordered_from) = LOWER($${values.length})`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS total
       FROM orders
       ${whereClause}
       GROUP BY status
       ORDER BY status`,
      values
    );

    res.json({ counts: rows });
  } catch (error) {
    next(error);
  }
}

async function getSalesReport(req, res, next) {
  try {
    const { dateFrom, dateTo, status, search, outlet } = req.query;
    const scopedOutlet = getRetailOutletScope(req);
    const values = [];
    const filters = [];

    if (dateFrom) {
      values.push(dateFrom);
      filters.push(`o.order_date >= $${values.length}`);
    }
    if (dateTo) {
      values.push(dateTo);
      filters.push(`o.order_date <= $${values.length}`);
    }
    if (status) {
      values.push(status);
      filters.push(`o.status = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      filters.push(`(o.production_order_no ILIKE $${values.length} OR o.customer_name ILIKE $${values.length})`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      filters.push(`LOWER(o.ordered_from) = LOWER($${values.length})`);
    } else if (outlet) {
      values.push(outlet);
      filters.push(`LOWER(o.ordered_from) = LOWER($${values.length})`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         o.id,
         o.production_order_no,
         o.customer_name,
         o.ordered_from,
         o.order_date,
         o.due_date,
         o.status,
         COALESCE(o.product_price, 0)::numeric(12,2) AS product_price,
         COALESCE(o.advance_paid, 0)::numeric(12,2) AS advance_paid,
         (COALESCE(o.product_price, 0) - COALESCE(o.advance_paid, 0))::numeric(12,2) AS balance
       FROM orders o
       ${whereClause}
       ORDER BY o.order_date DESC, o.created_at DESC`,
      values
    );

    const summary = rows.reduce((acc, row) => {
      const price = Number(row.product_price || 0);
      const advance = Number(row.advance_paid || 0);
      acc.total_orders += 1;
      acc.total_sales += price;
      acc.total_advance += advance;
      acc.total_balance += (price - advance);
      if (String(row.status) === 'COMPLETED') acc.completed_orders += 1;
      if (!['COMPLETED', 'SHIPPED'].includes(String(row.status))) acc.pending_orders += 1;
      return acc;
    }, {
      total_orders: 0,
      total_sales: 0,
      total_advance: 0,
      total_balance: 0,
      completed_orders: 0,
      pending_orders: 0,
      average_order_value: 0,
    });
    summary.average_order_value = summary.total_orders > 0
      ? summary.total_sales / summary.total_orders
      : 0;

    res.json({ summary, orders: rows, scoped_outlet: scopedOutlet || null });
  } catch (error) {
    next(error);
  }
}

async function getStoreDeliveryDashboard(req, res, next) {
  try {
    const scopedOutlet = getRetailOutletScope(req);
    const followupDate = req.query.date || new Date().toISOString().slice(0, 10);
    const values = [followupDate];
    let outletClause = '';
    if (scopedOutlet) {
      values.push(scopedOutlet);
      outletClause = ` AND LOWER(o.ordered_from) = LOWER($${values.length})`;
    }

    const { rows: pendingDeliveries } = await pool.query(
      `SELECT
         o.id,
         o.production_order_no,
         o.customer_name,
         o.customer_number,
         o.ordered_from,
         o.order_date,
         o.due_date,
         o.status,
         o.received_in_store_at,
         o.product_price,
         o.advance_paid,
         COALESCE(ledger.total_debit, 0)::numeric(12,2) AS ledger_total_debit,
         COALESCE(ledger.total_credit, 0)::numeric(12,2) AS ledger_total_credit,
         (COALESCE(ledger.total_debit, 0) - COALESCE(ledger.total_credit, 0))::numeric(12,2) AS outstanding_balance,
         td.customer_status AS today_update_status,
         td.notes AS today_update_notes,
         td.updated_at AS today_update_at,
         lu.update_date AS last_update_date,
         lu.customer_status AS last_update_status,
         lu.notes AS last_update_notes,
         lu.updated_at AS last_update_at
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT
           SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END) AS total_debit,
           SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END) AS total_credit
         FROM customer_ledger_entries le
         WHERE le.reference_order_id = o.id
       ) ledger ON true
       LEFT JOIN LATERAL (
         SELECT u.customer_status, u.notes, u.updated_at
         FROM retail_delivery_updates u
         WHERE u.order_id = o.id
           AND u.update_date = $1::date
         ORDER BY u.updated_at DESC
         LIMIT 1
       ) td ON true
       LEFT JOIN LATERAL (
         SELECT u.update_date, u.customer_status, u.notes, u.updated_at
         FROM retail_delivery_updates u
         WHERE u.order_id = o.id
         ORDER BY u.update_date DESC, u.updated_at DESC
         LIMIT 1
       ) lu ON true
       WHERE o.received_in_store_at IS NOT NULL
         AND o.delivered_to_customer_at IS NULL
         ${outletClause}
       ORDER BY o.due_date ASC, o.received_in_store_at ASC, o.id ASC`,
      values
    );

    const awaitingValues = [];
    let awaitingOutletClause = '';
    if (scopedOutlet) {
      awaitingValues.push(scopedOutlet);
      awaitingOutletClause = ` AND LOWER(o.ordered_from) = LOWER($${awaitingValues.length})`;
    }
    const { rows: awaitingReceive } = await pool.query(
      `SELECT
         o.id,
         o.production_order_no,
         o.customer_name,
         o.customer_number,
         o.ordered_from,
         o.order_date,
         o.due_date,
         o.status
       FROM orders o
       WHERE o.received_in_store_at IS NULL
         AND o.delivered_to_customer_at IS NULL
         AND o.status IN ('COMPLETED', 'SHIPPED')
         ${awaitingOutletClause}
       ORDER BY o.due_date ASC, o.created_at ASC, o.id ASC`,
      awaitingValues
    );

    const updatedToday = pendingDeliveries.filter((x) => x.today_update_status).length;
    const pendingWithoutTodayUpdate = pendingDeliveries.length - updatedToday;
    res.json({
      date: followupDate,
      scoped_outlet: scopedOutlet || null,
      summary: {
        awaiting_receive: awaitingReceive.length,
        pending_customer_delivery: pendingDeliveries.length,
        updated_today: updatedToday,
        pending_today_update: pendingWithoutTodayUpdate,
      },
      awaiting_receive: awaitingReceive,
      pending_deliveries: pendingDeliveries,
    });
  } catch (error) {
    next(error);
  }
}

async function markOrderReceivedInStore(req, res, next) {
  const client = await pool.connect();
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ApiError(400, 'Invalid order id');
    const scopedOutlet = getRetailOutletScope(req);

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, ordered_from, status, current_stage_id, received_in_store_at, delivered_to_customer_at
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    const order = rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }
    if (scopedOutlet && String(order.ordered_from || '').toLowerCase() !== scopedOutlet.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden for this outlet' });
    }
    if (order.delivered_to_customer_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order is already delivered to customer' });
    }
    if (!['COMPLETED', 'SHIPPED'].includes(String(order.status || ''))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only completed/shipped orders can be marked as received in store' });
    }

    const updated = await client.query(
      `UPDATE orders
       SET received_in_store_at = COALESCE(received_in_store_at, NOW()),
           received_in_store_by = COALESCE(received_in_store_by, $1),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, production_order_no, received_in_store_at, ordered_from`,
      [req.user.id, orderId]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'RETAIL_STORE_RECEIVED', $3, $4)`,
      [orderId, order.current_stage_id, req.user.id, 'Marked as received in store']
    );

    await client.query('COMMIT');
    req.io.emit('order:store-received', { orderId, receivedBy: req.user.id });
    req.io.emit('stage:updated', { orderId, action: 'RETAIL_STORE_RECEIVED' });
    res.json({ order: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function upsertDailyCustomerDeliveryUpdate(req, res, next) {
  const client = await pool.connect();
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ApiError(400, 'Invalid order id');
    const scopedOutlet = getRetailOutletScope(req);
    const {
      updateDate,
      customerStatus,
      notes,
    } = req.body || {};
    const normalizedStatus = String(customerStatus || '').trim().toUpperCase();
    if (!normalizedStatus) throw new ApiError(400, 'customerStatus is required');
    const date = updateDate || new Date().toISOString().slice(0, 10);

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, ordered_from, current_stage_id, received_in_store_at, delivered_to_customer_at
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    const order = rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }
    if (scopedOutlet && String(order.ordered_from || '').toLowerCase() !== scopedOutlet.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden for this outlet' });
    }
    if (!order.received_in_store_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order is not marked as received in store' });
    }
    if (order.delivered_to_customer_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order is already delivered to customer' });
    }

    const updateResult = await client.query(
      `INSERT INTO retail_delivery_updates (order_id, update_date, customer_status, notes, updated_by, updated_at)
       VALUES ($1, $2::date, $3, $4, $5, NOW())
       ON CONFLICT (order_id, update_date)
       DO UPDATE SET
         customer_status = EXCLUDED.customer_status,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [orderId, date, normalizedStatus, notes || null, req.user.id]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'RETAIL_CUSTOMER_UPDATE', $3, $4)`,
      [orderId, order.current_stage_id, req.user.id, `${normalizedStatus}: ${String(notes || '').trim()}`]
    );

    await client.query('COMMIT');
    req.io.emit('order:customer-update', { orderId, updateDate: date });
    req.io.emit('stage:updated', { orderId, action: 'RETAIL_CUSTOMER_UPDATE' });
    res.json({ update: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function markOrderDeliveredToCustomer(req, res, next) {
  const client = await pool.connect();
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ApiError(400, 'Invalid order id');
    const scopedOutlet = getRetailOutletScope(req);
    const {
      updateDate,
      notes,
      balanceReceived,
      paymentAccountId,
    } = req.body || {};
    const date = updateDate || new Date().toISOString().slice(0, 10);
    const parsedBalanceReceived = Number(balanceReceived || 0);
    const parsedPaymentAccountId = paymentAccountId ? Number(paymentAccountId) : null;
    if (Number.isNaN(parsedBalanceReceived) || parsedBalanceReceived < 0) {
      throw new ApiError(400, 'Invalid balance received value');
    }
    if (parsedPaymentAccountId && (!Number.isInteger(parsedPaymentAccountId) || parsedPaymentAccountId <= 0)) {
      throw new ApiError(400, 'Invalid payment account');
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, ordered_from, status, current_stage_id, received_in_store_at, delivered_to_customer_at,
              customer_name, customer_number, customer_address, product_price, order_date
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    const order = rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }
    if (scopedOutlet && String(order.ordered_from || '').toLowerCase() !== scopedOutlet.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden for this outlet' });
    }
    if (!order.received_in_store_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order must be marked received in store before delivery' });
    }
    if (order.delivered_to_customer_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Order is already delivered to customer' });
    }
    if (parsedBalanceReceived > 0 && !parsedPaymentAccountId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Payment account is required when receiving balance' });
    }
    if (parsedPaymentAccountId) {
      const accountExists = await client.query(
        `SELECT id FROM payment_accounts WHERE id = $1 AND is_active = true`,
        [parsedPaymentAccountId]
      );
      if (!accountExists.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Selected payment account is not active' });
      }
    }

    const accountId = await ensureAccount({
      client,
      customerName: order.customer_name,
      customerNumber: order.customer_number,
      customerAddress: order.customer_address,
      outletName: order.ordered_from,
    });
    const ledgerTotals = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_debit,
         COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_credit
       FROM customer_ledger_entries
       WHERE account_id = $1
         AND reference_order_id = $2`,
      [accountId, orderId]
    );
    const totalDebit = Number(ledgerTotals.rows[0]?.total_debit || 0);
    const totalCredit = Number(ledgerTotals.rows[0]?.total_credit || 0);
    const outstandingBalance = Number((totalDebit - totalCredit).toFixed(2));
    if (outstandingBalance > 0) {
      if (!(parsedBalanceReceived > 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Balance amount required before delivery. Pending balance: ${outstandingBalance.toFixed(2)}` });
      }
      if (Number(parsedBalanceReceived.toFixed(2)) !== outstandingBalance) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Entered balance must equal pending balance (${outstandingBalance.toFixed(2)})` });
      }
    }
    if (outstandingBalance <= 0 && parsedBalanceReceived > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No pending balance on this order' });
    }

    if (parsedBalanceReceived > 0) {
      await client.query(
        `INSERT INTO customer_ledger_entries
         (account_id, entry_date, entry_type, category, amount, reference_order_id, payment_account_id, notes, created_by, verification_status, created_at)
         VALUES ($1, $2, 'CREDIT', 'RECEIPT', $3, $4, $5, $6, $7, 'PENDING', NOW())`,
        [
          accountId,
          date,
          parsedBalanceReceived,
          orderId,
          parsedPaymentAccountId,
          `Balance received at delivery: ${order.id}`,
          req.user.id,
        ]
      );
    }

    const updated = await client.query(
      `UPDATE orders
       SET delivered_to_customer_at = NOW(),
           delivered_to_customer_by = $1,
           status = CASE WHEN status = 'COMPLETED' THEN 'SHIPPED' ELSE status END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, production_order_no, delivered_to_customer_at, ordered_from`,
      [req.user.id, orderId]
    );

    await client.query(
      `INSERT INTO retail_delivery_updates (order_id, update_date, customer_status, notes, updated_by, updated_at)
       VALUES ($1, $2::date, 'DELIVERED', $3, $4, NOW())
       ON CONFLICT (order_id, update_date)
       DO UPDATE SET
         customer_status = 'DELIVERED',
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [orderId, date, notes || 'Delivered to customer', req.user.id]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'RETAIL_DELIVERED', $3, $4)`,
      [orderId, order.current_stage_id, req.user.id, String(notes || 'Delivered to customer').trim()]
    );

    await client.query('COMMIT');
    req.io.emit('order:delivered', { orderId, deliveredBy: req.user.id });
    req.io.emit('stage:updated', { orderId, action: 'RETAIL_DELIVERED' });
    res.json({ order: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getChangeLogs(req, res, next) {
  try {
    const { orderId, limit = 100 } = req.query;
    const values = [];
    let whereClause = '';

    if (orderId) {
      values.push(Number(orderId));
      whereClause = `WHERE l.order_id = $${values.length}`;
    }

    values.push(Math.min(Number(limit) || 100, 500));
    const { rows } = await pool.query(
      `SELECT l.id, l.order_id, l.change_source, l.before_data, l.after_data, l.changed_at,
              u.full_name AS changed_by_name, u.email AS changed_by_email
       FROM order_change_logs l
       LEFT JOIN users u ON u.id = l.changed_by
       ${whereClause}
       ORDER BY l.changed_at DESC
       LIMIT $${values.length}`,
      values
    );

    res.json({ logs: rows });
  } catch (error) {
    next(error);
  }
}

async function writeRecoveryAudit(client, { recoveryCaseId, changedBy, changeType, beforeData = null, afterData = null }) {
  await client.query(
    `INSERT INTO retail_recovery_case_audit
     (recovery_case_id, change_type, changed_by, before_data, after_data, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())`,
    [recoveryCaseId, changeType, changedBy || null, JSON.stringify(beforeData), JSON.stringify(afterData)]
  );
}

async function createRecoveryNotification(client, { recoveryCaseId = null, notificationType, title, message, assignedRole = 'RETAIL_HEAD' }) {
  await client.query(
    `INSERT INTO retail_recovery_notifications
     (recovery_case_id, notification_type, title, message, assigned_role, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [recoveryCaseId, notificationType, title, message, assignedRole]
  );
}

async function runRecoveryEscalationSweep(client) {
  const thresholdRes = await client.query(
    `SELECT setting_value
     FROM retail_recovery_settings
     WHERE setting_key = 'KPI_TARGETS'
     LIMIT 1`
  );
  const maxOpenCaseDays = Number(thresholdRes.rows[0]?.setting_value?.max_open_case_days || 7);

  const overdueRes = await client.query(
    `SELECT rc.id, rc.order_id, rc.status, rc.workflow_status, rc.escalation_level,
            rc.promised_resolution_date, rc.created_at, rc.last_escalated_at, o.production_order_no
     FROM retail_recovery_cases rc
     JOIN orders o ON o.id = rc.order_id
     WHERE COALESCE(rc.workflow_status, 'OPEN') NOT IN ('CLOSED', 'REJECTED')
       AND (
         (rc.promised_resolution_date IS NOT NULL AND rc.promised_resolution_date < CURRENT_DATE)
         OR (DATE_PART('day', NOW() - rc.created_at) > $1)
       )`,
    [maxOpenCaseDays]
  );

  for (const row of overdueRes.rows) {
    const nextEscalation = Math.max(1, Number(row.escalation_level || 0));
    if (Number(row.escalation_level || 0) >= nextEscalation && row.last_escalated_at) continue;
    await client.query(
      `UPDATE retail_recovery_cases
       SET escalation_level = GREATEST(COALESCE(escalation_level, 0), 1),
           last_escalated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    await createRecoveryNotification(client, {
      recoveryCaseId: row.id,
      notificationType: 'AUTO_ESCALATED',
      title: `Replacement case auto-escalated: ${row.production_order_no}`,
      message: 'An overdue replacement case was escalated automatically based on SLA rules.',
    });
  }
}

async function getRetailRecoveryDashboard(req, res, next) {
  try {
    const client = await pool.connect();
    try {
      await runRecoveryEscalationSweep(client);
      const [
        casesRes,
        notesRes,
        deliveryRes,
        attachmentsRes,
        auditRes,
        reasonsRes,
        financialResolutionsRes,
        settingsRes,
        notificationsRes,
      ] = await Promise.all([
        client.query(
        `SELECT
           rc.*,
           o.production_order_no,
           o.customer_name,
           o.ordered_from,
           o.order_date,
           o.due_date,
           o.product_price,
           o.status AS order_status,
           o.completed_at,
           u.full_name AS created_by_name
         FROM retail_recovery_cases rc
         JOIN orders o ON o.id = rc.order_id
         LEFT JOIN users u ON u.id = rc.created_by
         ORDER BY rc.created_at DESC, rc.id DESC`
        ),
        client.query(
        `SELECT
           n.id,
           n.recovery_case_id,
           n.note_type,
           n.note_text,
           n.created_at,
           u.full_name AS actor_name
         FROM retail_recovery_case_notes n
         LEFT JOIN users u ON u.id = n.actor_id
         ORDER BY n.created_at DESC, n.id DESC`
        ),
        client.query(
        `SELECT
           o.id,
           o.production_order_no,
           o.customer_name,
           o.ordered_from,
           o.status,
           u.customer_status,
           u.notes,
           u.update_date
         FROM retail_delivery_updates u
         JOIN orders o ON o.id = u.order_id
         ORDER BY u.updated_at DESC, u.id DESC
         LIMIT 1000`
        ),
        client.query(
        `SELECT
           a.id,
           a.recovery_case_id,
           a.file_name,
           a.file_url,
           a.note,
           a.created_at,
           u.full_name AS uploaded_by_name
         FROM retail_recovery_case_attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         ORDER BY a.created_at DESC, a.id DESC`
        ),
        client.query(
        `SELECT
           a.id,
           a.recovery_case_id,
           a.change_type,
           a.before_data,
           a.after_data,
           a.created_at,
           u.full_name AS changed_by_name
         FROM retail_recovery_case_audit a
         LEFT JOIN users u ON u.id = a.changed_by
         ORDER BY a.created_at DESC, a.id DESC`
        ),
        client.query(
        `SELECT id, code, label, sla_days, is_active
         FROM retail_recovery_reason_master
         WHERE is_active = true
         ORDER BY label`
        ),
        client.query(
        `SELECT id, code, label, is_active
         FROM retail_recovery_financial_resolution_master
         WHERE is_active = true
         ORDER BY label`
        ),
        client.query(
        `SELECT setting_key, setting_value, updated_at
         FROM retail_recovery_settings`
        ),
        client.query(
        `SELECT id, recovery_case_id, notification_type, title, message, assigned_role, is_read, created_at
         FROM retail_recovery_notifications
         ORDER BY created_at DESC, id DESC
         LIMIT 200`
        ),
      ]);

      res.json({
        cases: casesRes.rows.map((row) => ({
          ...row,
          case_type: normalizeRecoveryCaseType(row.case_type),
          recovery_reference_no: buildRecoveryReferenceNo(
            row.production_order_no,
            normalizeRecoveryCaseType(row.case_type),
            row.replacement_sequence
          ),
        })),
        notes: notesRes.rows,
        delivery_updates: deliveryRes.rows,
        attachments: attachmentsRes.rows,
        audit: auditRes.rows,
        reason_master: reasonsRes.rows,
        financial_resolution_master: financialResolutionsRes.rows,
        settings: settingsRes.rows,
        notifications: notificationsRes.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

async function createRetailRecoveryCase(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      orderId,
      productionOrderNo,
      caseType,
      reasonCode,
      rootCauseBucket = null,
      complaintChannel = null,
      ownerName = null,
      promisedResolutionDate = null,
      estimatedCost = 0,
      financialResolutionType = 'REPLACEMENT_ONLY',
      customerSatisfactionStatus = 'PENDING',
      customerValueBand = 'STANDARD',
      priorityLevel = 'STANDARD',
      workflowStatus = 'OPEN',
      notes = '',
    } = req.body || {};

    const normalizedProductionOrderNo = String(productionOrderNo || '').trim();
    let resolvedOrderId = Number(orderId);
    if ((!Number.isInteger(resolvedOrderId) || resolvedOrderId <= 0) && normalizedProductionOrderNo) {
      const orderLookup = await client.query(
        `SELECT id
         FROM orders
         WHERE production_order_no = $1
         LIMIT 1`,
        [normalizedProductionOrderNo]
      );
      resolvedOrderId = Number(orderLookup.rows[0]?.id || 0);
    }
    if (!Number.isInteger(resolvedOrderId) || resolvedOrderId <= 0) {
      return res.status(400).json({ message: 'A valid booked order number is required' });
    }
    if (!String(caseType || '').trim()) return res.status(400).json({ message: 'caseType is required' });
    if (!String(reasonCode || '').trim()) return res.status(400).json({ message: 'reasonCode is required' });

    await client.query('BEGIN');
    const orderRes = await client.query(
      `SELECT id, production_order_no
       FROM orders
       WHERE id = $1
       LIMIT 1`,
      [resolvedOrderId]
    );
    if (!orderRes.rows[0]) {
      throw new ApiError(400, 'Replacement can only be created against an existing booked order');
    }
    const normalizedCaseType = normalizeRecoveryCaseType(caseType);
    const sequenceRes = await client.query(
      `SELECT COUNT(*)::int AS existing_count,
              MAX(id) AS latest_case_id
       FROM retail_recovery_cases
       WHERE original_order_id = $1
         AND case_type = $2`,
      [resolvedOrderId, normalizedCaseType]
    );
    const existingCount = Number(sequenceRes.rows[0]?.existing_count || 0);
    const replacementSequence = existingCount + 1;
    const priorRecoveryCaseId = sequenceRes.rows[0]?.latest_case_id ? Number(sequenceRes.rows[0].latest_case_id) : null;
    const settingsRes = await client.query(
      `SELECT setting_value
       FROM retail_recovery_settings
       WHERE setting_key = 'HIGH_COST_APPROVAL_THRESHOLD'
       LIMIT 1`
    );
    const approvalThreshold = Number(settingsRes.rows[0]?.setting_value?.amount || 25000);
    const estimatedCostValue = Number(estimatedCost || 0);
    const approvalStatus = estimatedCostValue >= approvalThreshold ? 'PENDING_APPROVAL' : 'NOT_REQUIRED';
    const inserted = await client.query(
      `INSERT INTO retail_recovery_cases
       (order_id, case_type, reason_code, root_cause_bucket, complaint_channel, owner_name, promised_resolution_date,
        estimated_cost, financial_resolution_type, customer_satisfaction_status, customer_value_band, priority_level,
        workflow_status, approval_status, notes, original_order_id, prior_recovery_case_id, replacement_sequence,
        created_by, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $1, $16, $17, $18, $18, NOW(), NOW())
       RETURNING *`,
      [
        resolvedOrderId,
        normalizedCaseType,
        String(reasonCode).trim().toUpperCase(),
        rootCauseBucket ? String(rootCauseBucket).trim().toUpperCase() : null,
        complaintChannel ? String(complaintChannel).trim().toUpperCase() : null,
        ownerName ? String(ownerName).trim() : null,
        promisedResolutionDate || null,
        estimatedCostValue,
        String(financialResolutionType || 'REPLACEMENT_ONLY').trim().toUpperCase(),
        String(customerSatisfactionStatus || 'PENDING').trim().toUpperCase(),
        String(customerValueBand || 'STANDARD').trim().toUpperCase(),
        String(priorityLevel || 'STANDARD').trim().toUpperCase(),
        String(workflowStatus || 'OPEN').trim().toUpperCase(),
        approvalStatus,
        notes ? String(notes) : null,
        priorRecoveryCaseId,
        replacementSequence,
        req.user.id,
      ]
    );

    if (String(notes || '').trim()) {
      await client.query(
        `INSERT INTO retail_recovery_case_notes
         (recovery_case_id, note_type, note_text, actor_id, created_at)
         VALUES ($1, 'COMMENT', $2, $3, NOW())`,
        [inserted.rows[0].id, String(notes).trim(), req.user.id]
      );
    }

    await writeRecoveryAudit(client, {
      recoveryCaseId: inserted.rows[0].id,
      changedBy: req.user.id,
      changeType: 'CASE_CREATED',
      beforeData: null,
      afterData: inserted.rows[0],
    });
    if (approvalStatus === 'PENDING_APPROVAL') {
      await createRecoveryNotification(client, {
        recoveryCaseId: inserted.rows[0].id,
        notificationType: 'HIGH_COST_APPROVAL_REQUIRED',
        title: `Replacement approval required: ${inserted.rows[0].id}`,
        message: `Estimated replacement cost ${estimatedCostValue.toFixed(2)} exceeds approval threshold.`,
      });
    }
    await client.query('COMMIT');
    const responseCase = {
      ...inserted.rows[0],
      production_order_no: orderRes.rows[0].production_order_no,
      recovery_reference_no: buildRecoveryReferenceNo(
        orderRes.rows[0].production_order_no,
        normalizeRecoveryCaseType(inserted.rows[0].case_type),
        inserted.rows[0].replacement_sequence
      ),
    };
    res.status(201).json({ recoveryCase: responseCase, replacementCase: responseCase });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateRetailRecoveryCase(req, res, next) {
  const client = await pool.connect();
  try {
    const recoveryCaseId = Number(req.params.id);
    if (!Number.isInteger(recoveryCaseId) || recoveryCaseId <= 0) {
      return res.status(400).json({ message: 'Valid replacement case id is required' });
    }
    const {
      status,
      ownerName,
      escalationLevel,
      promisedResolutionDate,
      estimatedCost,
      financialResolutionType,
      customerSatisfactionStatus,
      workflowStatus,
      priorityLevel,
      customerValueBand,
      firstTimeFix,
      closedCleanly,
      approvalStatus,
      notes,
      noteType = 'COMMENT',
      resolvedAt,
      approvedAt,
    } = req.body || {};

    await client.query('BEGIN');
    const beforeRes = await client.query(`SELECT * FROM retail_recovery_cases WHERE id = $1`, [recoveryCaseId]);
    if (!beforeRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Replacement case not found' });
    }
    const beforeRow = beforeRes.rows[0];
    const reopenedIncrement = beforeRow.workflow_status === 'CLOSED'
      && workflowStatus
      && String(workflowStatus).trim().toUpperCase() !== 'CLOSED'
      ? 1
      : 0;

    const updated = await client.query(
      `UPDATE retail_recovery_cases
       SET status = COALESCE($2, status),
           owner_name = COALESCE($3, owner_name),
           escalation_level = COALESCE($4, escalation_level),
           promised_resolution_date = COALESCE($5::date, promised_resolution_date),
           estimated_cost = COALESCE($6, estimated_cost),
           financial_resolution_type = COALESCE($7, financial_resolution_type),
           customer_satisfaction_status = COALESCE($8, customer_satisfaction_status),
           resolved_at = COALESCE($9::timestamp, resolved_at),
           approved_at = COALESCE($10::timestamp, approved_at),
           workflow_status = COALESCE($11, workflow_status),
           priority_level = COALESCE($12, priority_level),
           customer_value_band = COALESCE($13, customer_value_band),
           first_time_fix = COALESCE($14, first_time_fix),
           closed_cleanly = COALESCE($15, closed_cleanly),
           approval_status = COALESCE($16, approval_status),
           reopened_count = reopened_count + $17,
           updated_by = $18,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        recoveryCaseId,
        status ? String(status).trim().toUpperCase() : null,
        ownerName ? String(ownerName).trim() : null,
        escalationLevel !== undefined ? Number(escalationLevel) : null,
        promisedResolutionDate || null,
        estimatedCost !== undefined ? Number(estimatedCost) : null,
        financialResolutionType ? String(financialResolutionType).trim().toUpperCase() : null,
        customerSatisfactionStatus ? String(customerSatisfactionStatus).trim().toUpperCase() : null,
        resolvedAt || null,
        approvedAt || null,
        workflowStatus ? String(workflowStatus).trim().toUpperCase() : null,
        priorityLevel ? String(priorityLevel).trim().toUpperCase() : null,
        customerValueBand ? String(customerValueBand).trim().toUpperCase() : null,
        firstTimeFix !== undefined ? Boolean(firstTimeFix) : null,
        closedCleanly !== undefined ? Boolean(closedCleanly) : null,
        approvalStatus ? String(approvalStatus).trim().toUpperCase() : null,
        reopenedIncrement,
        req.user.id,
      ]
    );

    if (String(notes || '').trim()) {
      await client.query(
        `INSERT INTO retail_recovery_case_notes
         (recovery_case_id, note_type, note_text, actor_id, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [recoveryCaseId, String(noteType || 'COMMENT').trim().toUpperCase(), String(notes).trim(), req.user.id]
      );
    }

    await writeRecoveryAudit(client, {
      recoveryCaseId,
      changedBy: req.user.id,
      changeType: 'CASE_UPDATED',
      beforeData: beforeRow,
      afterData: updated.rows[0],
    });
    if (approvalStatus && String(approvalStatus).trim().toUpperCase() === 'APPROVED') {
      await createRecoveryNotification(client, {
        recoveryCaseId,
        notificationType: 'RECOVERY_APPROVED',
        title: `Replacement case approved: ${updated.rows[0].id}`,
        message: 'A high-cost replacement case was approved.',
      });
    }
    await client.query('COMMIT');
    res.json({ recoveryCase: updated.rows[0], replacementCase: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function uploadRetailRecoveryAttachment(req, res, next) {
  try {
    const recoveryCaseId = Number(req.params.id);
    if (!Number.isInteger(recoveryCaseId) || recoveryCaseId <= 0) {
      return res.status(400).json({ message: 'Valid replacement case id is required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Attachment file is required' });
    }
    await secureUploadedFile(req.file, { mode: 'attachment' });
    const note = String(req.body?.note || '').trim() || null;
    const inserted = await pool.query(
      `INSERT INTO retail_recovery_case_attachments
       (recovery_case_id, file_name, file_url, note, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        recoveryCaseId,
        req.file.originalname,
        toPublicUrl(req, req.file.filename),
        note,
        req.user.id,
      ]
    );
    res.status(201).json({ attachment: inserted.rows[0], replacementAttachment: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function upsertRetailRecoverySetting(req, res, next) {
  try {
    const { settingKey, settingValue } = req.body || {};
    if (!String(settingKey || '').trim()) {
      return res.status(400).json({ message: 'settingKey is required' });
    }
    const saved = await pool.query(
      `INSERT INTO retail_recovery_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [String(settingKey).trim().toUpperCase(), JSON.stringify(settingValue || {}), req.user.id]
    );
    res.json({ setting: saved.rows[0], replacementSetting: saved.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function upsertRetailRecoveryReason(req, res, next) {
  try {
    const { code, label, slaDays = 7, isActive = true } = req.body || {};
    if (!String(code || '').trim() || !String(label || '').trim()) {
      return res.status(400).json({ message: 'code and label are required' });
    }
    const saved = await pool.query(
      `INSERT INTO retail_recovery_reason_master (code, label, sla_days, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code)
       DO UPDATE SET label = EXCLUDED.label, sla_days = EXCLUDED.sla_days, is_active = EXCLUDED.is_active
       RETURNING *`,
      [
        String(code).trim().toUpperCase(),
        String(label).trim(),
        Number(slaDays || 7),
        Boolean(isActive),
      ]
    );
    res.json({ reason: saved.rows[0], replacementReason: saved.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function upsertRetailRecoveryFinancialResolution(req, res, next) {
  try {
    const { code, label, isActive = true } = req.body || {};
    if (!String(code || '').trim() || !String(label || '').trim()) {
      return res.status(400).json({ message: 'code and label are required' });
    }
    const saved = await pool.query(
      `INSERT INTO retail_recovery_financial_resolution_master (code, label, is_active)
       VALUES ($1, $2, $3)
       ON CONFLICT (code)
       DO UPDATE SET label = EXCLUDED.label, is_active = EXCLUDED.is_active
       RETURNING *`,
      [
        String(code).trim().toUpperCase(),
        String(label).trim(),
        Boolean(isActive),
      ]
    );
    res.json({ financialResolution: saved.rows[0], replacementFinancialResolution: saved.rows[0] });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  getRetailDashboard,
  getOrderDetails,
  updateOrderDetails,
  updateOrderImages,
  getChangeLogs,
  downloadOrderPdf,
  downloadCustomerReferencePdf,
  getLateOrders,
  getOrderCounts,
  getSalesReport,
  getStoreDeliveryDashboard,
  markOrderReceivedInStore,
  upsertDailyCustomerDeliveryUpdate,
  markOrderDeliveredToCustomer,
  getRetailReplacementDashboard: getRetailRecoveryDashboard,
  createRetailReplacementCase: createRetailRecoveryCase,
  updateRetailReplacementCase: updateRetailRecoveryCase,
  uploadRetailReplacementAttachment: uploadRetailRecoveryAttachment,
  upsertRetailReplacementSetting: upsertRetailRecoverySetting,
  upsertRetailReplacementReason: upsertRetailRecoveryReason,
  upsertRetailReplacementFinancialResolution: upsertRetailRecoveryFinancialResolution,
  getRetailRecoveryDashboard,
  createRetailRecoveryCase,
  updateRetailRecoveryCase,
  uploadRetailRecoveryAttachment,
  upsertRetailRecoverySetting,
  upsertRetailRecoveryReason,
  upsertRetailRecoveryFinancialResolution,
  getRetailOrderCapacity,
  lookupCustomerByNumber,
  upsertRetailOrderCapacity,
};
