const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

function toNumber(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

function createNo(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const r = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `${prefix}-${y}${m}${d}-${r}`;
}

async function upsertBalance(client, { itemId, warehouseId, binId = null, qtyDelta = 0, reserveDelta = 0, reorderLevel = null }) {
  await client.query(
    `INSERT INTO rms_item_balances
     (item_id, warehouse_id, bin_id, qty_on_hand, qty_reserved, reorder_level, min_level, max_level, updated_at)
     VALUES ($1, $2, $3, GREATEST($4, 0), GREATEST($5, 0), COALESCE($6, 0), 0, 0, NOW())
     ON CONFLICT (item_id, warehouse_id, bin_id)
     DO UPDATE SET
       qty_on_hand = GREATEST(rms_item_balances.qty_on_hand + $4, 0),
       qty_reserved = GREATEST(rms_item_balances.qty_reserved + $5, 0),
       reorder_level = COALESCE($6, rms_item_balances.reorder_level),
       updated_at = NOW()`,
    [itemId, warehouseId, binId, Number(qtyDelta || 0), Number(reserveDelta || 0), reorderLevel]
  );
}

async function postTxn(client, payload) {
  const txnNo = createNo('RMS-TXN');
  const amount = Number((Number(payload.qty || 0) * Number(payload.unitCost || 0)).toFixed(2));
  const { rows } = await client.query(
    `INSERT INTO rms_transactions
     (txn_no, txn_type, item_id, warehouse_id, bin_id, qty, unit_cost, amount, direction, reference_type, reference_id, reference_no, notes, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, ''), $11, NULLIF($12, ''), NULLIF($13, ''), $14, NOW())
     RETURNING *`,
    [
      txnNo,
      payload.txnType,
      payload.itemId,
      payload.warehouseId,
      payload.binId || null,
      payload.qty,
      payload.unitCost || 0,
      amount,
      payload.direction,
      payload.referenceType || null,
      payload.referenceId || null,
      payload.referenceNo || null,
      payload.notes || null,
      payload.userId,
    ]
  );
  const txn = rows[0];
  const prevLayerRes = await client.query(
    `SELECT running_qty, running_value
     FROM rms_valuation_layers
     WHERE item_id = $1
       AND (warehouse_id IS NOT DISTINCT FROM $2)
     ORDER BY id DESC
     LIMIT 1`,
    [payload.itemId, payload.warehouseId || null]
  );
  const prevQty = Number(prevLayerRes.rows[0]?.running_qty || 0);
  const prevValue = Number(prevLayerRes.rows[0]?.running_value || 0);
  const signedQty = payload.direction === 'IN' ? Number(payload.qty || 0) : -Number(payload.qty || 0);
  const unitCost = Number(payload.unitCost || 0);
  const signedValue = signedQty * unitCost;
  const runningQty = Number((prevQty + signedQty).toFixed(2));
  const runningValue = Number((prevValue + signedValue).toFixed(2));
  await client.query(
    `INSERT INTO rms_valuation_layers
     (item_id, warehouse_id, transaction_id, layer_type, qty, unit_cost, layer_value, running_qty, running_value, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      payload.itemId,
      payload.warehouseId || null,
      txn.id,
      payload.txnType.includes('ADJUSTMENT') ? 'ADJUSTMENT' : (payload.direction === 'IN' ? 'IN' : 'OUT'),
      Number(payload.qty || 0),
      unitCost,
      Number((signedQty * unitCost).toFixed(2)),
      runningQty,
      runningValue,
    ]
  );
  return txn;
}

async function listRawStoreOverview(_req, res, next) {
  try {
    const [kpiRes, whRes, txnRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(DISTINCT b.item_id)::int AS sku_count,
           COUNT(*)::int AS balance_rows,
           COALESCE(SUM(b.qty_on_hand), 0)::numeric(14,2) AS qty_on_hand,
           COUNT(*) FILTER (WHERE b.qty_on_hand <= COALESCE(NULLIF(b.reorder_level, 0), i.reorder_point))::int AS below_reorder
         FROM rms_item_balances b
         JOIN mrp_items i ON i.id = b.item_id`
      ),
      pool.query(
        `SELECT w.id, w.warehouse_name, COALESCE(SUM(b.qty_on_hand), 0)::numeric(14,2) AS qty_on_hand
         FROM mrp_warehouses w
         LEFT JOIN rms_item_balances b ON b.warehouse_id = w.id
         GROUP BY w.id
         ORDER BY w.warehouse_name`
      ),
      pool.query(
        `SELECT txn_type, COUNT(*)::int AS txn_count
         FROM rms_transactions
         WHERE created_at >= CURRENT_DATE - interval '30 day'
         GROUP BY txn_type
         ORDER BY txn_count DESC`
      ),
    ]);
    res.json({
      kpis: kpiRes.rows[0] || { sku_count: 0, balance_rows: 0, qty_on_hand: 0, below_reorder: 0 },
      warehouses: whRes.rows || [],
      txnMix: txnRes.rows || [],
    });
  } catch (error) {
    next(error);
  }
}

async function listRawStoreItems(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, sku, item_name, item_type, reorder_point, preferred_vendor
       FROM mrp_items
       WHERE active = TRUE
       ORDER BY sku ASC`
    );
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

async function listRawStoreWarehouses(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, warehouse_code, warehouse_name, is_default
       FROM mrp_warehouses
       ORDER BY is_default DESC, warehouse_name ASC`
    );
    res.json({ warehouses: rows });
  } catch (error) {
    next(error);
  }
}

async function listRawStoreBalances(req, res, next) {
  try {
    const warehouseId = req.query.warehouseId ? toInt(req.query.warehouseId, 'warehouseId') : null;
    const where = warehouseId ? 'WHERE b.warehouse_id = $1' : '';
    const values = warehouseId ? [warehouseId] : [];
    const { rows } = await pool.query(
      `SELECT
         b.id,
         b.item_id,
         i.sku,
         i.item_name,
         b.warehouse_id,
         w.warehouse_name,
         b.bin_id,
         bn.bin_code,
         b.qty_on_hand,
         b.qty_reserved,
         b.reorder_level,
         i.reorder_point,
         b.updated_at
       FROM rms_item_balances b
       JOIN mrp_items i ON i.id = b.item_id
       JOIN mrp_warehouses w ON w.id = b.warehouse_id
       LEFT JOIN rms_bins bn ON bn.id = b.bin_id
       ${where}
       ORDER BY i.sku ASC, w.warehouse_name ASC`,
      values
    );
    res.json({ balances: rows });
  } catch (error) {
    next(error);
  }
}

async function listRawStoreTransactions(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 200), 1000));
    const { rows } = await pool.query(
      `SELECT
         t.*,
         i.sku,
         i.item_name,
         w.warehouse_name,
         b.bin_code,
         u.full_name AS created_by_name
       FROM rms_transactions t
       JOIN mrp_items i ON i.id = t.item_id
       JOIN mrp_warehouses w ON w.id = t.warehouse_id
       LEFT JOIN rms_bins b ON b.id = t.bin_id
       LEFT JOIN users u ON u.id = t.created_by
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ transactions: rows });
  } catch (error) {
    next(error);
  }
}

async function listRawStoreBins(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, w.warehouse_name
       FROM rms_bins b
       JOIN mrp_warehouses w ON w.id = b.warehouse_id
       ORDER BY w.warehouse_name ASC, b.bin_code ASC`
    );
    res.json({ bins: rows });
  } catch (error) {
    next(error);
  }
}

async function createRawStoreBin(req, res, next) {
  const client = await pool.connect();
  try {
    const { warehouseId, binCode, binName, zoneName = '' } = req.body || {};
    if (!String(binCode || '').trim()) throw new ApiError(400, 'binCode is required');
    if (!String(binName || '').trim()) throw new ApiError(400, 'binName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO rms_bins
       (warehouse_id, bin_code, bin_name, zone_name, active, created_at, updated_at)
       VALUES ($1, $2, $3, NULLIF($4, ''), TRUE, NOW(), NOW())
       RETURNING *`,
      [toInt(warehouseId, 'warehouseId'), String(binCode).trim().toUpperCase(), String(binName).trim(), String(zoneName || '').trim()]
    );
    await client.query('COMMIT');
    res.status(201).json({ bin: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listRawStoreGrns(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT g.*, v.vendor_name, w.warehouse_name
       FROM rms_grns g
       LEFT JOIN finance_vendors v ON v.id = g.vendor_id
       JOIN mrp_warehouses w ON w.id = g.warehouse_id
       ORDER BY g.grn_date DESC, g.id DESC`
    );
    res.json({ grns: rows });
  } catch (error) {
    next(error);
  }
}

async function createRawStoreGrn(req, res, next) {
  const client = await pool.connect();
  try {
    const { vendorId = null, warehouseId, grnDate = null, notes = '', lines = [] } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) throw new ApiError(400, 'lines are required');
    const parsedWarehouseId = toInt(warehouseId, 'warehouseId');
    const grnNo = createNo('GRN');
    await client.query('BEGIN');
    const grnRes = await client.query(
      `INSERT INTO rms_grns
       (grn_no, vendor_id, warehouse_id, grn_date, status, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), 'POSTED', NULLIF($5, ''), $6, NOW(), NOW())
       RETURNING *`,
      [grnNo, vendorId ? toInt(vendorId, 'vendorId') : null, parsedWarehouseId, grnDate, notes, req.user.id]
    );
    for (const line of lines) {
      const itemId = toInt(line.itemId, 'itemId');
      let binId = line.binId ? toInt(line.binId, 'binId') : null;
      const qty = toNumber(line.qtyReceived, 'qtyReceived');
      const unitCost = toNumber(line.unitCost || 0, 'unitCost');
      if (!(qty > 0)) throw new ApiError(400, 'qtyReceived must be > 0');
      if (!binId) {
        const putawayRes = await client.query(
          `SELECT r.preferred_bin_id
           FROM rms_putaway_rules r
           JOIN mrp_items i ON i.id = $1
           WHERE r.warehouse_id = $2
             AND r.active = TRUE
             AND (
               r.item_id = $1
               OR (r.item_id IS NULL AND r.item_type = i.item_type)
               OR (r.item_id IS NULL AND r.item_type IS NULL)
             )
           ORDER BY CASE WHEN r.item_id = $1 THEN 1 WHEN r.item_type = i.item_type THEN 2 ELSE 3 END, r.priority_rank ASC
           LIMIT 1`,
          [itemId, parsedWarehouseId]
        );
        binId = putawayRes.rows[0]?.preferred_bin_id || null;
      }
      await client.query(
        `INSERT INTO rms_grn_lines
         (grn_id, item_id, bin_id, lot_no, expiry_date, qty_received, unit_cost, created_at)
         VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, NOW())`,
        [grnRes.rows[0].id, itemId, binId, String(line.lotNo || '').trim(), line.expiryDate || null, qty, unitCost]
      );
      const itemRes = await client.query(`SELECT reorder_point FROM mrp_items WHERE id = $1`, [itemId]);
      await upsertBalance(client, {
        itemId,
        warehouseId: parsedWarehouseId,
        binId,
        qtyDelta: qty,
        reorderLevel: itemRes.rows[0]?.reorder_point || 0,
      });
      const lotNo = String(line.lotNo || '').trim() || `${grnNo}-${itemId}`;
      await client.query(
        `INSERT INTO mrp_stock_lots
         (item_id, lot_no, source_type, source_ref, qty_received, qty_available, unit_cost, expiry_date, warehouse_id, created_at, updated_at)
         VALUES ($1, $2, 'RECEIPT', $3, $4, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (item_id, lot_no)
         DO UPDATE SET qty_received = mrp_stock_lots.qty_received + EXCLUDED.qty_received,
                       qty_available = mrp_stock_lots.qty_available + EXCLUDED.qty_available,
                       unit_cost = EXCLUDED.unit_cost,
                       updated_at = NOW()`,
        [itemId, lotNo, grnNo, qty, unitCost, line.expiryDate || null, parsedWarehouseId]
      );
      await postTxn(client, {
        txnType: 'GRN',
        itemId,
        warehouseId: parsedWarehouseId,
        binId,
        qty,
        unitCost,
        direction: 'IN',
        referenceType: 'GRN',
        referenceId: grnRes.rows[0].id,
        referenceNo: grnNo,
        notes: notes || 'Goods receipt',
        userId: req.user.id,
      });
    }
    await client.query('COMMIT');
    res.status(201).json({ grn: grnRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPutawayRules(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, w.warehouse_name, i.sku, i.item_name, b.bin_code
       FROM rms_putaway_rules r
       JOIN mrp_warehouses w ON w.id = r.warehouse_id
       LEFT JOIN mrp_items i ON i.id = r.item_id
       JOIN rms_bins b ON b.id = r.preferred_bin_id
       ORDER BY w.warehouse_name, r.priority_rank`
    );
    res.json({ rules: rows });
  } catch (error) {
    next(error);
  }
}

async function createPutawayRule(req, res, next) {
  const client = await pool.connect();
  try {
    const { warehouseId, itemId = null, itemType = null, preferredBinId, priorityRank = 100 } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO rms_putaway_rules
       (warehouse_id, item_id, item_type, preferred_bin_id, priority_rank, active, created_at, updated_at)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, TRUE, NOW(), NOW())
       RETURNING *`,
      [toInt(warehouseId, 'warehouseId'), itemId ? toInt(itemId, 'itemId') : null, itemType ? String(itemType).toUpperCase() : '', toInt(preferredBinId, 'preferredBinId'), Number(priorityRank || 100)]
    );
    await client.query('COMMIT');
    res.status(201).json({ rule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createCycleCount(req, res, next) {
  const client = await pool.connect();
  try {
    const { warehouseId, itemIds = [], countDate = null } = req.body || {};
    const parsedWarehouseId = toInt(warehouseId, 'warehouseId');
    const parsedItemIds = Array.isArray(itemIds) ? itemIds.map((id) => toInt(id, 'itemId')) : [];
    await client.query('BEGIN');
    const countNo = createNo('CNT');
    const countRes = await client.query(
      `INSERT INTO rms_cycle_counts
       (count_no, warehouse_id, count_date, status, created_by, created_at, updated_at)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), 'OPEN', $4, NOW(), NOW())
       RETURNING *`,
      [countNo, parsedWarehouseId, countDate, req.user.id]
    );
    const balanceRes = await client.query(
      `SELECT item_id, bin_id, qty_on_hand
       FROM rms_item_balances
       WHERE warehouse_id = $1
         ${parsedItemIds.length > 0 ? 'AND item_id = ANY($2)' : ''}
       ORDER BY item_id, bin_id`,
      parsedItemIds.length > 0 ? [parsedWarehouseId, parsedItemIds] : [parsedWarehouseId]
    );
    for (const row of balanceRes.rows) {
      await client.query(
        `INSERT INTO rms_cycle_count_lines
         (cycle_count_id, item_id, bin_id, system_qty, counted_qty, variance_qty, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, 0, NOW(), NOW())`,
        [countRes.rows[0].id, row.item_id, row.bin_id, row.qty_on_hand]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ cycleCount: countRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCycleCounts(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, w.warehouse_name,
              COUNT(l.id)::int AS line_count,
              COUNT(l.id) FILTER (WHERE l.counted_qty IS NOT NULL)::int AS counted_lines
       FROM rms_cycle_counts c
       JOIN mrp_warehouses w ON w.id = c.warehouse_id
       LEFT JOIN rms_cycle_count_lines l ON l.cycle_count_id = c.id
       GROUP BY c.id, w.warehouse_name
       ORDER BY c.created_at DESC, c.id DESC`
    );
    res.json({ counts: rows });
  } catch (error) {
    next(error);
  }
}

async function listCycleCountPolicies(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, w.warehouse_name, i.sku, i.item_name
       FROM rms_cycle_count_policies p
       JOIN mrp_warehouses w ON w.id = p.warehouse_id
       LEFT JOIN mrp_items i ON i.id = p.item_id
       ORDER BY w.warehouse_name, p.frequency_days ASC`
    );
    res.json({ policies: rows });
  } catch (error) {
    next(error);
  }
}

async function upsertCycleCountPolicy(req, res, next) {
  const client = await pool.connect();
  try {
    const { warehouseId, itemId = null, abcClass = null, frequencyDays = 30 } = req.body || {};
    const parsedWarehouseId = toInt(warehouseId, 'warehouseId');
    const parsedFrequency = toInt(frequencyDays, 'frequencyDays');
    await client.query('BEGIN');
    if (itemId) {
      const { rows } = await client.query(
        `INSERT INTO rms_cycle_count_policies
         (warehouse_id, item_id, abc_class, frequency_days, active, created_at, updated_at)
         VALUES ($1, $2, NULLIF($3, ''), $4, TRUE, NOW(), NOW())
         ON CONFLICT (warehouse_id, item_id)
         DO UPDATE SET abc_class = EXCLUDED.abc_class, frequency_days = EXCLUDED.frequency_days, active = TRUE, updated_at = NOW()
         RETURNING *`,
        [parsedWarehouseId, toInt(itemId, 'itemId'), String(abcClass || '').toUpperCase(), parsedFrequency]
      );
      await client.query('COMMIT');
      return res.status(201).json({ policy: rows[0] });
    }
    const { rows } = await client.query(
      `INSERT INTO rms_cycle_count_policies
       (warehouse_id, item_id, abc_class, frequency_days, active, created_at, updated_at)
       VALUES ($1, NULL, NULLIF($2, ''), $3, TRUE, NOW(), NOW())
       RETURNING *`,
      [parsedWarehouseId, String(abcClass || '').toUpperCase(), parsedFrequency]
    );
    await client.query('COMMIT');
    res.status(201).json({ policy: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function postCycleCount(req, res, next) {
  const client = await pool.connect();
  try {
    const cycleCountId = toInt(req.params.id, 'cycle count id');
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    await client.query('BEGIN');
    const countRes = await client.query(`SELECT * FROM rms_cycle_counts WHERE id = $1 FOR UPDATE`, [cycleCountId]);
    const count = countRes.rows[0];
    if (!count) throw new ApiError(404, 'Cycle count not found');
    if (count.status !== 'OPEN') throw new ApiError(400, 'Cycle count is not open');
    for (const line of lines) {
      const lineId = toInt(line.id, 'line id');
      const countedQty = Number(line.countedQty);
      if (!Number.isFinite(countedQty) || countedQty < 0) throw new ApiError(400, 'Invalid countedQty');
      const lineRes = await client.query(
        `SELECT * FROM rms_cycle_count_lines WHERE id = $1 AND cycle_count_id = $2 FOR UPDATE`,
        [lineId, cycleCountId]
      );
      const current = lineRes.rows[0];
      if (!current) continue;
      const variance = Number((countedQty - Number(current.system_qty || 0)).toFixed(2));
      await client.query(
        `UPDATE rms_cycle_count_lines
         SET counted_qty = $1, variance_qty = $2, updated_at = NOW()
         WHERE id = $3`,
        [countedQty, variance, lineId]
      );
      if (variance !== 0) {
        await upsertBalance(client, {
          itemId: current.item_id,
          warehouseId: count.warehouse_id,
          binId: current.bin_id,
          qtyDelta: variance,
        });
        await postTxn(client, {
          txnType: 'COUNT',
          itemId: current.item_id,
          warehouseId: count.warehouse_id,
          binId: current.bin_id,
          qty: Math.abs(variance),
          unitCost: 0,
          direction: variance > 0 ? 'IN' : 'OUT',
          referenceType: 'CYCLE_COUNT',
          referenceId: cycleCountId,
          referenceNo: count.count_no,
          notes: 'Cycle count variance',
          userId: req.user.id,
        });
      }
    }
    await client.query(
      `UPDATE rms_cycle_counts
       SET status = 'POSTED', posted_by = $1, posted_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, cycleCountId]
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listReplenishmentRules(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, i.sku, i.item_name, w.warehouse_name, v.vendor_name
       FROM rms_replenishment_rules r
       JOIN mrp_items i ON i.id = r.item_id
       JOIN mrp_warehouses w ON w.id = r.warehouse_id
       LEFT JOIN finance_vendors v ON v.id = r.preferred_vendor_id
       ORDER BY w.warehouse_name, i.sku`
    );
    res.json({ rules: rows });
  } catch (error) {
    next(error);
  }
}

async function upsertReplenishmentRule(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, warehouseId, minQty = 0, maxQty = 0, multipleQty = 1, leadTimeDays = 0, preferredVendorId = null } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO rms_replenishment_rules
       (item_id, warehouse_id, min_qty, max_qty, multiple_qty, lead_time_days, preferred_vendor_id, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW())
       ON CONFLICT (item_id, warehouse_id)
       DO UPDATE SET min_qty = EXCLUDED.min_qty,
                     max_qty = EXCLUDED.max_qty,
                     multiple_qty = EXCLUDED.multiple_qty,
                     lead_time_days = EXCLUDED.lead_time_days,
                     preferred_vendor_id = EXCLUDED.preferred_vendor_id,
                     active = TRUE,
                     updated_at = NOW()
       RETURNING *`,
      [toInt(itemId, 'itemId'), toInt(warehouseId, 'warehouseId'), toNumber(minQty, 'minQty'), toNumber(maxQty, 'maxQty'), Math.max(toNumber(multipleQty, 'multipleQty'), 1), toInt(Number(leadTimeDays || 0) + 1, 'leadTimeDays') - 1, preferredVendorId ? toInt(preferredVendorId, 'preferredVendorId') : null]
    );
    await client.query('COMMIT');
    res.status(201).json({ rule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function generateReplenishmentSuggestions(req, res, next) {
  const client = await pool.connect();
  try {
    const warehouseId = req.body?.warehouseId ? toInt(req.body.warehouseId, 'warehouseId') : null;
    await client.query('BEGIN');
    const rulesRes = await client.query(
      `SELECT r.*, i.reorder_point
       FROM rms_replenishment_rules r
       JOIN mrp_items i ON i.id = r.item_id
       WHERE r.active = TRUE
         ${warehouseId ? 'AND r.warehouse_id = $1' : ''}`,
      warehouseId ? [warehouseId] : []
    );
    const created = [];
    for (const rule of rulesRes.rows) {
      const balRes = await client.query(
        `SELECT COALESCE(SUM(qty_on_hand), 0)::numeric(14,2) AS on_hand
         FROM rms_item_balances
         WHERE item_id = $1 AND warehouse_id = $2`,
        [rule.item_id, rule.warehouse_id]
      );
      const onHand = Number(balRes.rows[0]?.on_hand || 0);
      const minQty = Number(rule.min_qty || rule.reorder_point || 0);
      const maxQty = Number(rule.max_qty || 0);
      if (onHand > minQty) continue;
      let suggested = Math.max(maxQty - onHand, minQty - onHand, 0);
      const multiple = Math.max(Number(rule.multiple_qty || 1), 1);
      suggested = Math.ceil(suggested / multiple) * multiple;
      if (!(suggested > 0)) continue;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Number(rule.lead_time_days || 0));
      const sugRes = await client.query(
        `INSERT INTO mrp_purchase_suggestions
         (item_id, suggested_qty, required_date, reason, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'OPEN', NOW(), NOW())
         RETURNING *`,
        [rule.item_id, suggested, dueDate.toISOString().slice(0, 10), `Replenishment rule WH#${rule.warehouse_id}`]
      );
      created.push(sugRes.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ createdCount: created.length, suggestions: created });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPickWave(req, res, next) {
  const client = await pool.connect();
  try {
    const { warehouseId, requisitionIds = [] } = req.body || {};
    const parsedWarehouseId = toInt(warehouseId, 'warehouseId');
    const reqIds = Array.isArray(requisitionIds) ? requisitionIds.map((id) => toInt(id, 'requisitionId')) : [];
    await client.query('BEGIN');
    const waveNo = createNo('WAVE');
    const waveRes = await client.query(
      `INSERT INTO rms_pick_waves
       (wave_no, warehouse_id, status, created_by, created_at, updated_at)
       VALUES ($1, $2, 'OPEN', $3, NOW(), NOW())
       RETURNING *`,
      [waveNo, parsedWarehouseId, req.user.id]
    );
    const linesRes = await client.query(
      `SELECT l.*, r.warehouse_id
       FROM rms_requisition_lines l
       JOIN rms_requisitions r ON r.id = l.requisition_id
       WHERE r.warehouse_id = $1
         AND r.status IN ('APPROVED', 'PARTIAL')
         AND l.line_status IN ('OPEN', 'PARTIAL')
         ${reqIds.length > 0 ? 'AND l.requisition_id = ANY($2)' : ''}`,
      reqIds.length > 0 ? [parsedWarehouseId, reqIds] : [parsedWarehouseId]
    );
    for (const line of linesRes.rows) {
      const toPick = Number(line.qty_requested || 0) - Number(line.qty_issued || 0);
      if (toPick <= 0) continue;
      await client.query(
        `INSERT INTO rms_pick_wave_lines
         (wave_id, requisition_line_id, item_id, bin_id, qty_to_pick, qty_picked, line_status)
         VALUES ($1, $2, $3, $4, $5, 0, 'OPEN')`,
        [waveRes.rows[0].id, line.id, line.item_id, line.bin_id, toPick]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ wave: waveRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPickWaves(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         w.*,
         wh.warehouse_name,
         COUNT(l.id)::int AS line_count,
         COUNT(l.id) FILTER (WHERE l.line_status = 'PICKED')::int AS picked_lines
       FROM rms_pick_waves w
       JOIN mrp_warehouses wh ON wh.id = w.warehouse_id
       LEFT JOIN rms_pick_wave_lines l ON l.wave_id = w.id
       GROUP BY w.id, wh.warehouse_name
       ORDER BY w.created_at DESC`
    );
    res.json({ waves: rows });
  } catch (error) {
    next(error);
  }
}

async function runBarcodeAction(req, res, next) {
  const client = await pool.connect();
  try {
    const { barcode, action, warehouseId = null, toWarehouseId = null, qty = 1 } = req.body || {};
    const code = String(barcode || '').trim().toUpperCase();
    if (!code) throw new ApiError(400, 'barcode is required');
    const normalizedAction = String(action || '').toUpperCase();
    if (!['LOOKUP', 'ISSUE', 'RECEIVE', 'TRANSFER'].includes(normalizedAction)) throw new ApiError(400, 'Invalid action');
    await client.query('BEGIN');
    const itemRes = await client.query(
      `SELECT id, sku, item_name, reorder_point
       FROM mrp_items
       WHERE UPPER(sku) = $1`,
      [code]
    );
    const item = itemRes.rows[0];
    if (!item) throw new ApiError(404, 'Barcode item not found');
    if (normalizedAction === 'LOOKUP') {
      const balRes = await client.query(
        `SELECT warehouse_id, SUM(qty_on_hand)::numeric(14,2) AS qty_on_hand
         FROM rms_item_balances
         WHERE item_id = $1
         GROUP BY warehouse_id`,
        [item.id]
      );
      await client.query('COMMIT');
      return res.json({ item, balances: balRes.rows });
    }
    const parsedQty = toNumber(qty, 'qty');
    if (!(parsedQty > 0)) throw new ApiError(400, 'qty must be > 0');
    if (!warehouseId) throw new ApiError(400, 'warehouseId is required');
    const fromWh = toInt(warehouseId, 'warehouseId');
    if (normalizedAction === 'ISSUE') {
      await upsertBalance(client, { itemId: item.id, warehouseId: fromWh, qtyDelta: -parsedQty });
      await postTxn(client, {
        txnType: 'ISSUE',
        itemId: item.id,
        warehouseId: fromWh,
        qty: parsedQty,
        unitCost: 0,
        direction: 'OUT',
        referenceType: 'BARCODE',
        referenceNo: code,
        notes: 'Barcode issue',
        userId: req.user.id,
      });
    } else if (normalizedAction === 'RECEIVE') {
      await upsertBalance(client, { itemId: item.id, warehouseId: fromWh, qtyDelta: parsedQty, reorderLevel: item.reorder_point });
      await postTxn(client, {
        txnType: 'GRN',
        itemId: item.id,
        warehouseId: fromWh,
        qty: parsedQty,
        unitCost: 0,
        direction: 'IN',
        referenceType: 'BARCODE',
        referenceNo: code,
        notes: 'Barcode receive',
        userId: req.user.id,
      });
    } else if (normalizedAction === 'TRANSFER') {
      if (!toWarehouseId) throw new ApiError(400, 'toWarehouseId is required');
      const toWh = toInt(toWarehouseId, 'toWarehouseId');
      await upsertBalance(client, { itemId: item.id, warehouseId: fromWh, qtyDelta: -parsedQty });
      await upsertBalance(client, { itemId: item.id, warehouseId: toWh, qtyDelta: parsedQty });
      await postTxn(client, {
        txnType: 'TRANSFER_OUT',
        itemId: item.id,
        warehouseId: fromWh,
        qty: parsedQty,
        unitCost: 0,
        direction: 'OUT',
        referenceType: 'BARCODE',
        referenceNo: code,
        notes: `Barcode transfer to WH ${toWh}`,
        userId: req.user.id,
      });
      await postTxn(client, {
        txnType: 'TRANSFER_IN',
        itemId: item.id,
        warehouseId: toWh,
        qty: parsedQty,
        unitCost: 0,
        direction: 'IN',
        referenceType: 'BARCODE',
        referenceNo: code,
        notes: `Barcode transfer from WH ${fromWh}`,
        userId: req.user.id,
      });
    }
    await client.query('COMMIT');
    res.json({ success: true, action: normalizedAction, item });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function issueRawMaterial(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, warehouseId, binId = null, qty, unitCost = 0, referenceNo = '', notes = '' } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const parsedWarehouseId = toInt(warehouseId, 'warehouseId');
    const parsedBinId = binId ? toInt(binId, 'binId') : null;
    const parsedQty = toNumber(qty, 'qty');
    if (!(parsedQty > 0)) throw new ApiError(400, 'qty must be > 0');
    await client.query('BEGIN');
    const balRes = await client.query(
      `SELECT qty_on_hand
       FROM rms_item_balances
       WHERE item_id = $1 AND warehouse_id = $2 AND (bin_id IS NOT DISTINCT FROM $3)
       FOR UPDATE`,
      [parsedItemId, parsedWarehouseId, parsedBinId]
    );
    const onHand = Number(balRes.rows[0]?.qty_on_hand || 0);
    if (onHand + 0.0001 < parsedQty) throw new ApiError(400, 'Insufficient stock');
    await upsertBalance(client, { itemId: parsedItemId, warehouseId: parsedWarehouseId, binId: parsedBinId, qtyDelta: -parsedQty });
    await postTxn(client, {
      txnType: 'ISSUE',
      itemId: parsedItemId,
      warehouseId: parsedWarehouseId,
      binId: parsedBinId,
      qty: parsedQty,
      unitCost: toNumber(unitCost, 'unitCost'),
      direction: 'OUT',
      referenceType: 'ISSUE',
      referenceNo,
      notes,
      userId: req.user.id,
    });
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function transferRawMaterial(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, fromWarehouseId, fromBinId = null, toWarehouseId, toBinId = null, qty, unitCost = 0, notes = '' } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const fromWh = toInt(fromWarehouseId, 'fromWarehouseId');
    const toWh = toInt(toWarehouseId, 'toWarehouseId');
    const fromB = fromBinId ? toInt(fromBinId, 'fromBinId') : null;
    const toB = toBinId ? toInt(toBinId, 'toBinId') : null;
    const parsedQty = toNumber(qty, 'qty');
    if (!(parsedQty > 0)) throw new ApiError(400, 'qty must be > 0');
    await client.query('BEGIN');
    const balRes = await client.query(
      `SELECT qty_on_hand
       FROM rms_item_balances
       WHERE item_id = $1 AND warehouse_id = $2 AND (bin_id IS NOT DISTINCT FROM $3)
       FOR UPDATE`,
      [parsedItemId, fromWh, fromB]
    );
    const onHand = Number(balRes.rows[0]?.qty_on_hand || 0);
    if (onHand + 0.0001 < parsedQty) throw new ApiError(400, 'Insufficient stock for transfer');
    const transferNo = createNo('TRF');
    const transferRes = await client.query(
      `INSERT INTO rms_stock_transfers
       (transfer_no, item_id, from_warehouse_id, from_bin_id, to_warehouse_id, to_bin_id, qty, status, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'POSTED', NULLIF($8, ''), $9, NOW(), NOW())
       RETURNING *`,
      [transferNo, parsedItemId, fromWh, fromB, toWh, toB, parsedQty, notes, req.user.id]
    );
    await upsertBalance(client, { itemId: parsedItemId, warehouseId: fromWh, binId: fromB, qtyDelta: -parsedQty });
    await upsertBalance(client, { itemId: parsedItemId, warehouseId: toWh, binId: toB, qtyDelta: parsedQty });
    await postTxn(client, {
      txnType: 'TRANSFER_OUT',
      itemId: parsedItemId,
      warehouseId: fromWh,
      binId: fromB,
      qty: parsedQty,
      unitCost: toNumber(unitCost, 'unitCost'),
      direction: 'OUT',
      referenceType: 'TRANSFER',
      referenceId: transferRes.rows[0].id,
      referenceNo: transferNo,
      notes,
      userId: req.user.id,
    });
    await postTxn(client, {
      txnType: 'TRANSFER_IN',
      itemId: parsedItemId,
      warehouseId: toWh,
      binId: toB,
      qty: parsedQty,
      unitCost: toNumber(unitCost, 'unitCost'),
      direction: 'IN',
      referenceType: 'TRANSFER',
      referenceId: transferRes.rows[0].id,
      referenceNo: transferNo,
      notes,
      userId: req.user.id,
    });
    await client.query('COMMIT');
    res.json({ transfer: transferRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function adjustRawMaterial(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, warehouseId, binId = null, adjustmentQty, unitCost = 0, notes = '' } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const parsedWarehouseId = toInt(warehouseId, 'warehouseId');
    const parsedBinId = binId ? toInt(binId, 'binId') : null;
    const delta = Number(adjustmentQty || 0);
    if (!Number.isFinite(delta) || delta === 0) throw new ApiError(400, 'adjustmentQty cannot be 0');
    await client.query('BEGIN');
    if (delta < 0) {
      const balRes = await client.query(
        `SELECT qty_on_hand FROM rms_item_balances
         WHERE item_id = $1 AND warehouse_id = $2 AND (bin_id IS NOT DISTINCT FROM $3)
         FOR UPDATE`,
        [parsedItemId, parsedWarehouseId, parsedBinId]
      );
      const onHand = Number(balRes.rows[0]?.qty_on_hand || 0);
      if (onHand + 0.0001 < Math.abs(delta)) throw new ApiError(400, 'Adjustment exceeds on-hand quantity');
    }
    await upsertBalance(client, { itemId: parsedItemId, warehouseId: parsedWarehouseId, binId: parsedBinId, qtyDelta: delta });
    await postTxn(client, {
      txnType: delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      itemId: parsedItemId,
      warehouseId: parsedWarehouseId,
      binId: parsedBinId,
      qty: Math.abs(delta),
      unitCost: toNumber(unitCost, 'unitCost'),
      direction: delta > 0 ? 'IN' : 'OUT',
      referenceType: 'ADJUSTMENT',
      notes,
      userId: req.user.id,
    });
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listRawStoreRequisitions(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, w.warehouse_name, u.full_name AS requester_name, a.full_name AS approved_by_name
       FROM rms_requisitions r
       JOIN mrp_warehouses w ON w.id = r.warehouse_id
       LEFT JOIN users u ON u.id = r.requester_id
       LEFT JOIN users a ON a.id = r.approved_by
       ORDER BY r.created_at DESC, r.id DESC`
    );
    res.json({ requisitions: rows });
  } catch (error) {
    next(error);
  }
}

async function createRawStoreRequisition(req, res, next) {
  const client = await pool.connect();
  try {
    const { warehouseId, neededBy = null, notes = '', lines = [] } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) throw new ApiError(400, 'lines are required');
    const reqNo = createNo('REQ');
    const parsedWarehouseId = toInt(warehouseId, 'warehouseId');
    await client.query('BEGIN');
    const reqRes = await client.query(
      `INSERT INTO rms_requisitions
       (req_no, requester_id, warehouse_id, needed_by, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OPEN', NULLIF($5, ''), NOW(), NOW())
       RETURNING *`,
      [reqNo, req.user.id, parsedWarehouseId, neededBy, notes]
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO rms_requisition_lines
         (requisition_id, item_id, bin_id, qty_requested, qty_issued, line_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, 'OPEN', NOW(), NOW())`,
        [reqRes.rows[0].id, toInt(line.itemId, 'itemId'), line.binId ? toInt(line.binId, 'binId') : null, toNumber(line.qtyRequested, 'qtyRequested')]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ requisition: reqRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function approveRawStoreRequisition(req, res, next) {
  const client = await pool.connect();
  try {
    const requisitionId = toInt(req.params.id, 'requisition id');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE rms_requisitions
       SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.id, requisitionId]
    );
    if (!rows[0]) throw new ApiError(404, 'Requisition not found');
    await client.query('COMMIT');
    res.json({ requisition: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function issueRawStoreRequisition(req, res, next) {
  const client = await pool.connect();
  try {
    const requisitionId = toInt(req.params.id, 'requisition id');
    await client.query('BEGIN');
    const reqRes = await client.query(
      `SELECT * FROM rms_requisitions WHERE id = $1 FOR UPDATE`,
      [requisitionId]
    );
    const requisition = reqRes.rows[0];
    if (!requisition) throw new ApiError(404, 'Requisition not found');
    if (!['APPROVED', 'PARTIAL'].includes(requisition.status)) throw new ApiError(400, 'Requisition must be approved/partial');
    const linesRes = await client.query(
      `SELECT * FROM rms_requisition_lines WHERE requisition_id = $1 ORDER BY id ASC`,
      [requisitionId]
    );
    for (const line of linesRes.rows) {
      const remaining = Number(line.qty_requested || 0) - Number(line.qty_issued || 0);
      if (remaining <= 0) continue;
      const balRes = await client.query(
        `SELECT qty_on_hand
         FROM rms_item_balances
         WHERE item_id = $1 AND warehouse_id = $2 AND (bin_id IS NOT DISTINCT FROM $3)
         FOR UPDATE`,
        [line.item_id, requisition.warehouse_id, line.bin_id]
      );
      const onHand = Number(balRes.rows[0]?.qty_on_hand || 0);
      const issueQty = Math.min(onHand, remaining);
      if (issueQty <= 0) continue;
      await upsertBalance(client, {
        itemId: line.item_id,
        warehouseId: requisition.warehouse_id,
        binId: line.bin_id,
        qtyDelta: -issueQty,
      });
      const nextIssued = Number(line.qty_issued || 0) + issueQty;
      const fulfilled = nextIssued + 0.0001 >= Number(line.qty_requested || 0);
      await client.query(
        `UPDATE rms_requisition_lines
         SET qty_issued = $1, line_status = $2, updated_at = NOW()
         WHERE id = $3`,
        [Number(nextIssued.toFixed(2)), fulfilled ? 'FULFILLED' : 'PARTIAL', line.id]
      );
      await postTxn(client, {
        txnType: 'ISSUE',
        itemId: line.item_id,
        warehouseId: requisition.warehouse_id,
        binId: line.bin_id,
        qty: issueQty,
        unitCost: 0,
        direction: 'OUT',
        referenceType: 'REQUISITION',
        referenceId: requisitionId,
        referenceNo: requisition.req_no,
        notes: 'Requisition issue',
        userId: req.user.id,
      });
    }
    const rollup = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE line_status = 'FULFILLED')::int AS fulfilled_lines,
         COUNT(*)::int AS total_lines
       FROM rms_requisition_lines
       WHERE requisition_id = $1`,
      [requisitionId]
    );
    const fulfilledLines = Number(rollup.rows[0]?.fulfilled_lines || 0);
    const totalLines = Number(rollup.rows[0]?.total_lines || 0);
    const nextStatus = fulfilledLines === totalLines ? 'FULFILLED' : 'PARTIAL';
    await client.query(`UPDATE rms_requisitions SET status = $1, updated_at = NOW() WHERE id = $2`, [nextStatus, requisitionId]);
    await client.query('COMMIT');
    res.json({ success: true, status: nextStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listRawStoreReorderSuggestions(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         b.item_id,
         i.sku,
         i.item_name,
         b.warehouse_id,
         w.warehouse_name,
         b.qty_on_hand,
         COALESCE(NULLIF(b.reorder_level, 0), i.reorder_point) AS reorder_level,
         GREATEST(COALESCE(NULLIF(b.reorder_level, 0), i.reorder_point) - b.qty_on_hand, 0)::numeric(14,2) AS suggested_qty
       FROM rms_item_balances b
       JOIN mrp_items i ON i.id = b.item_id
       JOIN mrp_warehouses w ON w.id = b.warehouse_id
       WHERE b.qty_on_hand <= COALESCE(NULLIF(b.reorder_level, 0), i.reorder_point)
       ORDER BY suggested_qty DESC, i.sku`
    );
    res.json({ suggestions: rows });
  } catch (error) {
    next(error);
  }
}

async function getRawStoreAgingReport(req, res, next) {
  try {
    const warehouseId = req.query.warehouseId ? toInt(req.query.warehouseId, 'warehouseId') : null;
    const values = [];
    let where = '';
    if (warehouseId) {
      values.push(warehouseId);
      where = 'WHERE b.warehouse_id = $1';
    }
    const { rows } = await pool.query(
      `WITH last_txn AS (
         SELECT item_id, warehouse_id, MAX(created_at) AS last_txn_at
         FROM rms_transactions
         GROUP BY item_id, warehouse_id
       )
       SELECT
         b.item_id,
         i.sku,
         i.item_name,
         b.warehouse_id,
         w.warehouse_name,
         b.qty_on_hand,
         lt.last_txn_at,
         CASE
           WHEN lt.last_txn_at IS NULL THEN 'NO_MOVE'
           WHEN CURRENT_DATE - DATE(lt.last_txn_at) <= 30 THEN '0_30'
           WHEN CURRENT_DATE - DATE(lt.last_txn_at) <= 60 THEN '31_60'
           WHEN CURRENT_DATE - DATE(lt.last_txn_at) <= 90 THEN '61_90'
           ELSE '90_PLUS'
         END AS aging_bucket
       FROM rms_item_balances b
       JOIN mrp_items i ON i.id = b.item_id
       JOIN mrp_warehouses w ON w.id = b.warehouse_id
       LEFT JOIN last_txn lt ON lt.item_id = b.item_id AND lt.warehouse_id = b.warehouse_id
       ${where}
       ORDER BY b.qty_on_hand DESC, i.sku ASC`,
      values
    );
    const summary = rows.reduce((acc, row) => {
      const key = row.aging_bucket || 'NO_MOVE';
      if (!acc[key]) acc[key] = { bucket: key, sku_count: 0, qty: 0 };
      acc[key].sku_count += 1;
      acc[key].qty += Number(row.qty_on_hand || 0);
      return acc;
    }, {});
    res.json({ summary: Object.values(summary), rows });
  } catch (error) {
    next(error);
  }
}

async function getRawStoreMinMaxReport(req, res, next) {
  try {
    const warehouseId = req.query.warehouseId ? toInt(req.query.warehouseId, 'warehouseId') : null;
    const values = [];
    let where = 'WHERE r.active = TRUE';
    if (warehouseId) {
      values.push(warehouseId);
      where += ` AND r.warehouse_id = $${values.length}`;
    }
    const { rows } = await pool.query(
      `SELECT
         r.id,
         r.item_id,
         i.sku,
         i.item_name,
         r.warehouse_id,
         w.warehouse_name,
         r.min_qty,
         r.max_qty,
         r.multiple_qty,
         r.lead_time_days,
         COALESCE(SUM(b.qty_on_hand), 0)::numeric(14,2) AS on_hand_qty,
         CASE
           WHEN COALESCE(SUM(b.qty_on_hand), 0) < r.min_qty THEN 'BELOW_MIN'
           WHEN COALESCE(SUM(b.qty_on_hand), 0) > r.max_qty AND r.max_qty > 0 THEN 'ABOVE_MAX'
           ELSE 'IN_RANGE'
         END AS state
       FROM rms_replenishment_rules r
       JOIN mrp_items i ON i.id = r.item_id
       JOIN mrp_warehouses w ON w.id = r.warehouse_id
       LEFT JOIN rms_item_balances b ON b.item_id = r.item_id AND b.warehouse_id = r.warehouse_id
       ${where}
       GROUP BY r.id, i.sku, i.item_name, w.warehouse_name
       ORDER BY state DESC, i.sku ASC`,
      values
    );
    res.json({ rows });
  } catch (error) {
    next(error);
  }
}

async function getRawStoreMovementReport(req, res, next) {
  try {
    const from = req.query.from || new Date(Date.now() - (1000 * 60 * 60 * 24 * 30)).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT
         DATE(created_at) AS txn_date,
         txn_type,
         direction,
         COUNT(*)::int AS txn_count,
         COALESCE(SUM(qty), 0)::numeric(14,2) AS qty_total
       FROM rms_transactions
       WHERE DATE(created_at) BETWEEN $1::date AND $2::date
       GROUP BY DATE(created_at), txn_type, direction
       ORDER BY txn_date DESC, txn_type`,
      [from, to]
    );
    res.json({ from, to, rows });
  } catch (error) {
    next(error);
  }
}

async function listRoutingRules(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.*,
         i.sku,
         i.item_name,
         sw.warehouse_name AS source_warehouse_name,
         sb.bin_code AS source_bin_code,
         dw.warehouse_name AS destination_warehouse_name,
         db.bin_code AS destination_bin_code
       FROM rms_routing_rules r
       LEFT JOIN mrp_items i ON i.id = r.item_id
       LEFT JOIN mrp_warehouses sw ON sw.id = r.source_warehouse_id
       LEFT JOIN rms_bins sb ON sb.id = r.source_bin_id
       LEFT JOIN mrp_warehouses dw ON dw.id = r.destination_warehouse_id
       LEFT JOIN rms_bins db ON db.id = r.destination_bin_id
       ORDER BY r.active DESC, r.priority_rank ASC, r.id DESC`
    );
    res.json({ rules: rows });
  } catch (error) {
    next(error);
  }
}

async function createRoutingRule(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      ruleName,
      itemId = null,
      itemType = null,
      sourceWarehouseId = null,
      sourceBinId = null,
      destinationWarehouseId = null,
      destinationBinId = null,
      routeAction = 'TRANSFER',
      priorityRank = 100,
    } = req.body || {};
    if (!String(ruleName || '').trim()) throw new ApiError(400, 'ruleName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO rms_routing_rules
       (rule_name, item_id, item_type, source_warehouse_id, source_bin_id, destination_warehouse_id, destination_bin_id, route_action, priority_rank, active, created_at, updated_at)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, $9, TRUE, NOW(), NOW())
       RETURNING *`,
      [
        String(ruleName).trim(),
        itemId ? toInt(itemId, 'itemId') : null,
        itemType ? String(itemType).toUpperCase() : '',
        sourceWarehouseId ? toInt(sourceWarehouseId, 'sourceWarehouseId') : null,
        sourceBinId ? toInt(sourceBinId, 'sourceBinId') : null,
        destinationWarehouseId ? toInt(destinationWarehouseId, 'destinationWarehouseId') : null,
        destinationBinId ? toInt(destinationBinId, 'destinationBinId') : null,
        String(routeAction || 'TRANSFER').toUpperCase(),
        Number(priorityRank || 100),
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ rule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function resolveRoutingRule(req, res, next) {
  try {
    const itemId = toInt(req.query.itemId, 'itemId');
    const sourceWarehouseId = req.query.sourceWarehouseId ? toInt(req.query.sourceWarehouseId, 'sourceWarehouseId') : null;
    const sourceBinId = req.query.sourceBinId ? toInt(req.query.sourceBinId, 'sourceBinId') : null;
    const itemRes = await pool.query(`SELECT item_type FROM mrp_items WHERE id = $1`, [itemId]);
    const itemType = itemRes.rows[0]?.item_type || null;
    const { rows } = await pool.query(
      `SELECT *
       FROM rms_routing_rules
       WHERE active = TRUE
         AND (item_id = $1 OR (item_id IS NULL AND (item_type = $2 OR item_type IS NULL)))
         AND (source_warehouse_id IS NULL OR source_warehouse_id = $3)
         AND (source_bin_id IS NULL OR source_bin_id = $4)
       ORDER BY CASE WHEN item_id = $1 THEN 1 WHEN item_type = $2 THEN 2 ELSE 3 END, priority_rank ASC
       LIMIT 1`,
      [itemId, itemType, sourceWarehouseId, sourceBinId]
    );
    res.json({ rule: rows[0] || null });
  } catch (error) {
    next(error);
  }
}

async function runProcurementScheduler(req, res, next) {
  const client = await pool.connect();
  try {
    const warehouseId = req.body?.warehouseId ? toInt(req.body.warehouseId, 'warehouseId') : null;
    await client.query('BEGIN');
    const runNo = createNo('PROC');
    const result = await generateReplenishmentSuggestions(
      { body: { warehouseId }, user: req.user },
      { json: (payload) => payload },
      next
    );
    const createdCount = Number(result?.createdCount || 0);
    const { rows } = await client.query(
      `INSERT INTO rms_procurement_runs
       (run_no, warehouse_id, status, created_suggestions, notes, triggered_by, created_at)
       VALUES ($1, $2, 'SUCCESS', $3, $4, $5, NOW())
       RETURNING *`,
      [runNo, warehouseId, createdCount, 'Scheduled replenishment run', req.user.id]
    );
    await client.query('COMMIT');
    res.json({ run: rows[0], createdCount });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listProcurementRuns(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, w.warehouse_name, u.full_name AS triggered_by_name
       FROM rms_procurement_runs p
       LEFT JOIN mrp_warehouses w ON w.id = p.warehouse_id
       LEFT JOIN users u ON u.id = p.triggered_by
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 200`
    );
    res.json({ runs: rows });
  } catch (error) {
    next(error);
  }
}

async function getValuationReport(req, res, next) {
  try {
    const itemId = req.query.itemId ? toInt(req.query.itemId, 'itemId') : null;
    const warehouseId = req.query.warehouseId ? toInt(req.query.warehouseId, 'warehouseId') : null;
    const values = [];
    const clauses = [];
    if (itemId) {
      values.push(itemId);
      clauses.push(`l.item_id = $${values.length}`);
    }
    if (warehouseId) {
      values.push(warehouseId);
      clauses.push(`l.warehouse_id = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         l.*,
         i.sku,
         i.item_name,
         w.warehouse_name
       FROM rms_valuation_layers l
       JOIN mrp_items i ON i.id = l.item_id
       LEFT JOIN mrp_warehouses w ON w.id = l.warehouse_id
       ${where}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 800`,
      values
    );
    const summaryMap = {};
    for (const row of rows) {
      const key = `${row.item_id}-${row.warehouse_id || 0}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          item_id: row.item_id,
          sku: row.sku,
          item_name: row.item_name,
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouse_name,
          closing_qty: row.running_qty,
          closing_value: row.running_value,
          avg_cost: Number(row.running_qty || 0) === 0 ? 0 : Number((Number(row.running_value || 0) / Number(row.running_qty || 1)).toFixed(4)),
        };
      }
    }
    res.json({ summary: Object.values(summaryMap), rows });
  } catch (error) {
    next(error);
  }
}

async function getScannerQueue(req, res, next) {
  try {
    const warehouseId = req.query.warehouseId ? toInt(req.query.warehouseId, 'warehouseId') : null;
    const values = [];
    let where = `WHERE w.status IN ('OPEN', 'PICKING')`;
    if (warehouseId) {
      values.push(warehouseId);
      where += ` AND w.warehouse_id = $${values.length}`;
    }
    const { rows } = await pool.query(
      `SELECT
         w.id AS wave_id,
         w.wave_no,
         w.status AS wave_status,
         l.id AS line_id,
         l.item_id,
         i.sku,
         i.item_name,
         l.bin_id,
         b.bin_code,
         l.qty_to_pick,
         l.qty_picked,
         l.line_status
       FROM rms_pick_waves w
       JOIN rms_pick_wave_lines l ON l.wave_id = w.id
       JOIN mrp_items i ON i.id = l.item_id
       LEFT JOIN rms_bins b ON b.id = l.bin_id
       ${where}
       ORDER BY w.created_at DESC, l.id ASC`,
      values
    );
    res.json({ queue: rows });
  } catch (error) {
    next(error);
  }
}

async function scanPickLine(req, res, next) {
  const client = await pool.connect();
  try {
    const { waveLineId, barcode, qty = 1 } = req.body || {};
    const lineId = toInt(waveLineId, 'waveLineId');
    const code = String(barcode || '').trim().toUpperCase();
    if (!code) throw new ApiError(400, 'barcode is required');
    const parsedQty = toNumber(qty, 'qty');
    if (!(parsedQty > 0)) throw new ApiError(400, 'qty must be > 0');
    await client.query('BEGIN');
    const lineRes = await client.query(
      `SELECT l.*, w.warehouse_id, i.sku
       FROM rms_pick_wave_lines l
       JOIN rms_pick_waves w ON w.id = l.wave_id
       JOIN mrp_items i ON i.id = l.item_id
       WHERE l.id = $1
       FOR UPDATE`,
      [lineId]
    );
    const line = lineRes.rows[0];
    if (!line) throw new ApiError(404, 'Wave line not found');
    if (String(line.sku || '').toUpperCase() !== code) throw new ApiError(400, 'Scanned barcode does not match wave line SKU');
    const remaining = Number(line.qty_to_pick || 0) - Number(line.qty_picked || 0);
    if (remaining <= 0) throw new ApiError(400, 'Wave line already picked');
    const pickQty = Math.min(parsedQty, remaining);
    await upsertBalance(client, {
      itemId: line.item_id,
      warehouseId: line.warehouse_id,
      binId: line.bin_id,
      qtyDelta: -pickQty,
    });
    const nextPicked = Number(line.qty_picked || 0) + pickQty;
    const pickedDone = nextPicked + 0.0001 >= Number(line.qty_to_pick || 0);
    await client.query(
      `UPDATE rms_pick_wave_lines
       SET qty_picked = $1, line_status = $2
       WHERE id = $3`,
      [Number(nextPicked.toFixed(2)), pickedDone ? 'PICKED' : 'PARTIAL', lineId]
    );
    await postTxn(client, {
      txnType: 'ISSUE',
      itemId: line.item_id,
      warehouseId: line.warehouse_id,
      binId: line.bin_id,
      qty: pickQty,
      unitCost: 0,
      direction: 'OUT',
      referenceType: 'PICK_WAVE',
      referenceId: line.wave_id,
      referenceNo: `WAVE-${line.wave_id}`,
      notes: 'Scanner pick',
      userId: req.user.id,
    });
    await client.query(
      `UPDATE rms_pick_waves
       SET status = CASE
         WHEN EXISTS (SELECT 1 FROM rms_pick_wave_lines WHERE wave_id = $1 AND line_status <> 'PICKED') THEN 'PICKING'
         ELSE 'DONE'
       END,
       updated_at = NOW()
       WHERE id = $1`,
      [line.wave_id]
    );
    await client.query('COMMIT');
    res.json({ success: true, pickedQty: pickQty });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listRawStoreOverview,
  listRawStoreItems,
  listRawStoreWarehouses,
  listRawStoreBalances,
  listRawStoreTransactions,
  listRawStoreBins,
  createRawStoreBin,
  listRawStoreGrns,
  createRawStoreGrn,
  issueRawMaterial,
  transferRawMaterial,
  adjustRawMaterial,
  listRawStoreRequisitions,
  createRawStoreRequisition,
  approveRawStoreRequisition,
  issueRawStoreRequisition,
  listRawStoreReorderSuggestions,
  listPutawayRules,
  createPutawayRule,
  createCycleCount,
  listCycleCounts,
  listCycleCountPolicies,
  upsertCycleCountPolicy,
  postCycleCount,
  listReplenishmentRules,
  upsertReplenishmentRule,
  generateReplenishmentSuggestions,
  createPickWave,
  listPickWaves,
  runBarcodeAction,
  getRawStoreAgingReport,
  getRawStoreMinMaxReport,
  getRawStoreMovementReport,
  listRoutingRules,
  createRoutingRule,
  resolveRoutingRule,
  runProcurementScheduler,
  listProcurementRuns,
  getValuationReport,
  getScannerQueue,
  scanPickLine,
};
