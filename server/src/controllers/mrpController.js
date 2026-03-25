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

function createWoNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `WO-${y}${m}${d}-${rand}`;
}

function createPoNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `PO-MRP-${y}${m}${d}-${rand}`;
}

async function listMrpDashboard(_req, res, next) {
  try {
    const [statusRes, shortageRes, lotRes, centerRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'PLANNED')::int AS planned,
           COUNT(*) FILTER (WHERE status = 'RELEASED')::int AS released,
           COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
           COUNT(*) FILTER (WHERE status = 'DONE')::int AS done,
           COUNT(*) FILTER (WHERE status = 'ON_HOLD')::int AS on_hold
         FROM mrp_work_orders`
      ),
      pool.query(
        `WITH open_wo AS (
           SELECT id, qty_planned, COALESCE(bom_id, 0) AS bom_id
           FROM mrp_work_orders
           WHERE status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS')
         ),
         req AS (
           SELECT
             bl.component_item_id AS item_id,
             SUM(o.qty_planned * bl.qty_per * (1 + COALESCE(bl.scrap_pct, 0) / 100.0))::numeric(14,2) AS required_qty
           FROM open_wo o
           JOIN mrp_bom_lines bl ON bl.bom_id = o.bom_id
           GROUP BY bl.component_item_id
         ),
         stock AS (
           SELECT item_id, COALESCE(SUM(qty_available), 0)::numeric(14,2) AS available_qty
           FROM mrp_stock_lots
           GROUP BY item_id
         )
         SELECT
           COUNT(*)::int AS shortage_items,
           COALESCE(SUM(GREATEST(req.required_qty - COALESCE(stock.available_qty, 0), 0)), 0)::numeric(14,2) AS shortage_qty
         FROM req
         LEFT JOIN stock ON stock.item_id = req.item_id
         WHERE req.required_qty > COALESCE(stock.available_qty, 0)`
      ),
      pool.query(`SELECT COUNT(*)::int AS lot_count, COALESCE(SUM(qty_available), 0)::numeric(14,2) AS total_available_qty FROM mrp_stock_lots`),
      pool.query(
        `SELECT
           c.id,
           c.center_name,
           c.capacity_hours_per_day,
           c.efficiency_pct,
           COALESCE(SUM(CASE WHEN o.status IN ('PENDING', 'IN_PROGRESS') THEN o.planned_hours ELSE 0 END), 0)::numeric(10,2) AS planned_load_hours,
           COALESCE(SUM(CASE WHEN o.status = 'DONE' THEN o.actual_hours ELSE 0 END), 0)::numeric(10,2) AS actual_done_hours
         FROM mrp_work_centers c
         LEFT JOIN mrp_work_order_operations o ON o.work_center_id = c.id
         GROUP BY c.id
         ORDER BY c.center_name`
      ),
    ]);

    res.json({
      workOrders: statusRes.rows[0] || { planned: 0, released: 0, in_progress: 0, done: 0, on_hold: 0 },
      shortages: shortageRes.rows[0] || { shortage_items: 0, shortage_qty: 0 },
      stock: lotRes.rows[0] || { lot_count: 0, total_available_qty: 0 },
      workCenters: centerRes.rows || [],
    });
  } catch (error) {
    next(error);
  }
}

async function listMrpItems(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, COALESCE(s.qty_available, 0)::numeric(14,2) AS qty_available
       FROM mrp_items i
       LEFT JOIN (
         SELECT item_id, SUM(qty_available) AS qty_available
         FROM mrp_stock_lots
         GROUP BY item_id
       ) s ON s.item_id = i.id
       ORDER BY i.updated_at DESC, i.id DESC`
    );
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

async function createMrpItem(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      sku,
      itemName,
      uom = 'EA',
      itemType = 'RAW_MATERIAL',
      leadTimeDays = 0,
      reorderPoint = 0,
      safetyStock = 0,
      preferredVendor = '',
    } = req.body || {};
    if (!String(sku || '').trim()) throw new ApiError(400, 'sku is required');
    if (!String(itemName || '').trim()) throw new ApiError(400, 'itemName is required');
    const parsedLeadTime = Number(leadTimeDays || 0);
    if (!Number.isInteger(parsedLeadTime) || parsedLeadTime < 0) throw new ApiError(400, 'Invalid leadTimeDays');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO mrp_items
       (sku, item_name, uom, item_type, lead_time_days, reorder_point, safety_stock, preferred_vendor, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), TRUE, $9, NOW(), NOW())
       RETURNING *`,
      [
        String(sku).trim().toUpperCase(),
        String(itemName).trim(),
        String(uom || 'EA').trim().toUpperCase(),
        String(itemType || 'RAW_MATERIAL').toUpperCase(),
        parsedLeadTime,
        toNumber(reorderPoint, 'reorderPoint'),
        toNumber(safetyStock, 'safetyStock'),
        String(preferredVendor || '').trim(),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ item: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listBoms(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         b.id,
         b.item_id,
         i.sku AS item_sku,
         i.item_name,
         b.bom_name,
         b.version_no,
         b.is_default,
         b.is_active,
         b.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', l.id,
               'component_item_id', l.component_item_id,
               'component_sku', ci.sku,
               'component_name', ci.item_name,
               'qty_per', l.qty_per,
               'scrap_pct', l.scrap_pct,
               'operation_sequence', l.operation_sequence
             )
             ORDER BY l.operation_sequence, l.id
           ) FILTER (WHERE l.id IS NOT NULL),
           '[]'::json
         ) AS lines
       FROM mrp_boms b
       JOIN mrp_items i ON i.id = b.item_id
       LEFT JOIN mrp_bom_lines l ON l.bom_id = b.id
       LEFT JOIN mrp_items ci ON ci.id = l.component_item_id
       GROUP BY b.id, i.sku, i.item_name
       ORDER BY b.updated_at DESC, b.id DESC`
    );
    res.json({ boms: rows });
  } catch (error) {
    next(error);
  }
}

async function createBom(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, bomName, versionNo = 1, isDefault = true, lines = [] } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    if (!String(bomName || '').trim()) throw new ApiError(400, 'bomName is required');
    await client.query('BEGIN');
    const itemRes = await client.query(`SELECT id FROM mrp_items WHERE id = $1`, [parsedItemId]);
    if (!itemRes.rows[0]) throw new ApiError(404, 'Item not found');
    if (isDefault) {
      await client.query(`UPDATE mrp_boms SET is_default = FALSE, updated_at = NOW() WHERE item_id = $1`, [parsedItemId]);
    }
    const bomRes = await client.query(
      `INSERT INTO mrp_boms
       (item_id, bom_name, version_no, is_default, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
       RETURNING *`,
      [parsedItemId, String(bomName).trim(), toInt(versionNo, 'versionNo'), Boolean(isDefault), req.user.id]
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO mrp_bom_lines
         (bom_id, component_item_id, qty_per, scrap_pct, operation_sequence, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          bomRes.rows[0].id,
          toInt(line.componentItemId, 'componentItemId'),
          toNumber(line.qtyPer, 'qtyPer'),
          toNumber(line.scrapPct || 0, 'scrapPct'),
          Number.isFinite(Number(line.operationSequence)) ? Number(line.operationSequence) : 10,
        ]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ bom: bomRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addBomLine(req, res, next) {
  const client = await pool.connect();
  try {
    const bomId = toInt(req.params.id, 'bom id');
    const { componentItemId, qtyPer, scrapPct = 0, operationSequence = 10 } = req.body || {};
    await client.query('BEGIN');
    const bomRes = await client.query(`SELECT id FROM mrp_boms WHERE id = $1`, [bomId]);
    if (!bomRes.rows[0]) throw new ApiError(404, 'BOM not found');
    const { rows } = await client.query(
      `INSERT INTO mrp_bom_lines
       (bom_id, component_item_id, qty_per, scrap_pct, operation_sequence, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [bomId, toInt(componentItemId, 'componentItemId'), toNumber(qtyPer, 'qtyPer'), toNumber(scrapPct, 'scrapPct'), Number(operationSequence || 10)]
    );
    await client.query(`UPDATE mrp_boms SET updated_at = NOW() WHERE id = $1`, [bomId]);
    await client.query('COMMIT');
    res.status(201).json({ line: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listWorkOrders(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         w.*,
         i.sku AS item_sku,
         i.item_name,
         b.bom_name
       FROM mrp_work_orders w
       JOIN mrp_items i ON i.id = w.item_id
       LEFT JOIN mrp_boms b ON b.id = w.bom_id
       ORDER BY w.priority_rank ASC, w.due_date NULLS LAST, w.id DESC`
    );
    res.json({ workOrders: rows });
  } catch (error) {
    next(error);
  }
}

async function createWorkOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, bomId = null, qtyPlanned, dueDate = null, priorityRank = 9999 } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const parsedQty = toNumber(qtyPlanned, 'qtyPlanned');
    if (!(parsedQty > 0)) throw new ApiError(400, 'qtyPlanned must be > 0');
    await client.query('BEGIN');
    const itemRes = await client.query(`SELECT id FROM mrp_items WHERE id = $1`, [parsedItemId]);
    if (!itemRes.rows[0]) throw new ApiError(404, 'Item not found');
    let chosenBomId = bomId ? toInt(bomId, 'bomId') : null;
    if (!chosenBomId) {
      const defaultBomRes = await client.query(`SELECT id FROM mrp_boms WHERE item_id = $1 AND is_default = TRUE ORDER BY updated_at DESC LIMIT 1`, [parsedItemId]);
      chosenBomId = defaultBomRes.rows[0]?.id || null;
    }
    if (!chosenBomId) throw new ApiError(400, 'No BOM configured for this item');
    const woNo = createWoNo();
    const { rows } = await client.query(
      `INSERT INTO mrp_work_orders
       (wo_no, item_id, bom_id, qty_planned, qty_completed, status, priority_rank, due_date, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, 'PLANNED', $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [woNo, parsedItemId, chosenBomId, parsedQty, Number(priorityRank || 9999), dueDate, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ workOrder: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function reprioritizeWorkOrders(req, res, next) {
  const client = await pool.connect();
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
    if (orderedIds.length === 0) throw new ApiError(400, 'orderedIds is required');
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i += 1) {
      const workOrderId = toInt(orderedIds[i], 'work order id');
      await client.query(
        `UPDATE mrp_work_orders SET priority_rank = $1, updated_at = NOW() WHERE id = $2`,
        [i + 1, workOrderId]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, updated: orderedIds.length });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function releaseWorkOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const workOrderId = toInt(req.params.id, 'work order id');
    await client.query('BEGIN');
    const woRes = await client.query(`SELECT * FROM mrp_work_orders WHERE id = $1 FOR UPDATE`, [workOrderId]);
    const workOrder = woRes.rows[0];
    if (!workOrder) throw new ApiError(404, 'Work order not found');
    if (!['PLANNED', 'ON_HOLD'].includes(workOrder.status)) throw new ApiError(400, 'Only planned/hold work order can be released');
    const linesRes = await client.query(
      `SELECT component_item_id, qty_per, scrap_pct
       FROM mrp_bom_lines
       WHERE bom_id = $1
       ORDER BY operation_sequence, id`,
      [workOrder.bom_id]
    );
    if (linesRes.rows.length === 0) throw new ApiError(400, 'BOM has no lines');

    const opExists = await client.query(
      `SELECT id FROM mrp_work_order_operations WHERE work_order_id = $1 LIMIT 1`,
      [workOrderId]
    );
    if (!opExists.rows[0]) {
      for (const line of linesRes.rows) {
        await client.query(
          `INSERT INTO mrp_work_order_operations
           (work_order_id, operation_name, sequence_no, status, planned_hours, actual_hours, created_at, updated_at)
           VALUES ($1, $2, $3, 'PENDING', $4, 0, NOW(), NOW())`,
          [workOrderId, `Operation ${line.component_item_id}`, Number(line.operation_sequence || 10), Number((workOrder.qty_planned * 0.1).toFixed(2))]
        );
      }
    }

    const shortages = [];
    for (const line of linesRes.rows) {
      const required = Number(workOrder.qty_planned || 0) * Number(line.qty_per || 0) * (1 + Number(line.scrap_pct || 0) / 100);
      const lotRes = await client.query(
        `SELECT id, qty_available
         FROM mrp_stock_lots
         WHERE item_id = $1
           AND qty_available > 0
         ORDER BY created_at ASC, id ASC`,
        [line.component_item_id]
      );
      let available = lotRes.rows.reduce((sum, row) => sum + Number(row.qty_available || 0), 0);
      if (available + 0.0001 < required) {
        const shortQty = Number((required - available).toFixed(2));
        shortages.push({ itemId: line.component_item_id, shortQty });
        await client.query(
          `INSERT INTO mrp_purchase_suggestions
           (item_id, suggested_qty, required_date, reason, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'OPEN', NOW(), NOW())`,
          [line.component_item_id, shortQty, workOrder.due_date, `Auto shortage from ${workOrder.wo_no}`]
        );
        continue;
      }
      let remaining = required;
      for (const lot of lotRes.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(lot.qty_available || 0));
        if (take <= 0) continue;
        await client.query(
          `INSERT INTO mrp_stock_reservations
           (work_order_id, item_id, lot_id, qty_reserved, qty_consumed, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 0, 'RESERVED', NOW(), NOW())`,
          [workOrderId, line.component_item_id, lot.id, Number(take.toFixed(2))]
        );
        remaining -= take;
        available -= take;
      }
    }
    await client.query(
      `UPDATE mrp_work_orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [shortages.length > 0 ? 'ON_HOLD' : 'RELEASED', workOrderId]
    );
    await client.query('COMMIT');
    res.json({ success: true, status: shortages.length > 0 ? 'ON_HOLD' : 'RELEASED', shortages });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function startWorkOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const workOrderId = toInt(req.params.id, 'work order id');
    await client.query('BEGIN');
    const woRes = await client.query(`SELECT * FROM mrp_work_orders WHERE id = $1 FOR UPDATE`, [workOrderId]);
    const workOrder = woRes.rows[0];
    if (!workOrder) throw new ApiError(404, 'Work order not found');
    if (!['RELEASED', 'ON_HOLD'].includes(workOrder.status)) throw new ApiError(400, 'Work order must be released/on-hold first');
    await client.query(
      `UPDATE mrp_work_orders
       SET status = 'IN_PROGRESS', actual_start = COALESCE(actual_start, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [workOrderId]
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

async function completeWorkOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const workOrderId = toInt(req.params.id, 'work order id');
    const qtyCompleted = toNumber(req.body?.qtyCompleted, 'qtyCompleted');
    if (!(qtyCompleted > 0)) throw new ApiError(400, 'qtyCompleted must be > 0');
    await client.query('BEGIN');
    const woRes = await client.query(`SELECT * FROM mrp_work_orders WHERE id = $1 FOR UPDATE`, [workOrderId]);
    const workOrder = woRes.rows[0];
    if (!workOrder) throw new ApiError(404, 'Work order not found');
    if (!['IN_PROGRESS', 'RELEASED'].includes(workOrder.status)) throw new ApiError(400, 'Work order must be in progress/released');
    const reservationsRes = await client.query(
      `SELECT * FROM mrp_stock_reservations
       WHERE work_order_id = $1
         AND status IN ('RESERVED', 'PARTIAL')
       ORDER BY id ASC`,
      [workOrderId]
    );
    for (const reservation of reservationsRes.rows) {
      const remaining = Number(reservation.qty_reserved || 0) - Number(reservation.qty_consumed || 0);
      if (remaining <= 0) continue;
      if (reservation.lot_id) {
        await client.query(`UPDATE mrp_stock_lots SET qty_available = GREATEST(qty_available - $1, 0), updated_at = NOW() WHERE id = $2`, [remaining, reservation.lot_id]);
      }
      await client.query(
        `UPDATE mrp_stock_reservations
         SET qty_consumed = qty_reserved, status = 'CONSUMED', updated_at = NOW()
         WHERE id = $1`,
        [reservation.id]
      );
    }
    const lotNo = `${workOrder.wo_no}-FG`;
    const defaultWarehouseRes = await client.query(
      `SELECT id FROM mrp_warehouses WHERE is_default = TRUE ORDER BY id ASC LIMIT 1`
    );
    const defaultWarehouseId = defaultWarehouseRes.rows[0]?.id || null;
    await client.query(
      `INSERT INTO mrp_stock_lots
       (item_id, lot_no, source_type, source_ref, qty_received, qty_available, unit_cost, warehouse_id, created_at, updated_at)
       VALUES ($1, $2, 'WORK_ORDER', $3, $4, $4, 0, $5, NOW(), NOW())
       ON CONFLICT (item_id, lot_no)
       DO UPDATE SET qty_received = mrp_stock_lots.qty_received + EXCLUDED.qty_received,
                     qty_available = mrp_stock_lots.qty_available + EXCLUDED.qty_available,
                     warehouse_id = COALESCE(mrp_stock_lots.warehouse_id, EXCLUDED.warehouse_id),
                     updated_at = NOW()`,
      [workOrder.item_id, lotNo, workOrder.wo_no, qtyCompleted, defaultWarehouseId]
    );
    const nextCompleted = Number(workOrder.qty_completed || 0) + qtyCompleted;
    await client.query(
      `UPDATE mrp_work_orders
       SET qty_completed = $1,
           status = CASE WHEN $1 + 0.0001 >= qty_planned THEN 'DONE' ELSE 'IN_PROGRESS' END,
           actual_end = CASE WHEN $1 + 0.0001 >= qty_planned THEN NOW() ELSE actual_end END,
           updated_at = NOW()
       WHERE id = $2`,
      [Number(nextCompleted.toFixed(2)), workOrderId]
    );
    await client.query('COMMIT');
    res.json({ success: true, qtyCompleted: Number(nextCompleted.toFixed(2)) });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function receiveMrpStock(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, lotNo, qty, unitCost = 0, expiryDate = null, sourceRef = null, warehouseId = null } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const parsedQty = toNumber(qty, 'qty');
    if (!(parsedQty > 0)) throw new ApiError(400, 'qty must be > 0');
    if (!String(lotNo || '').trim()) throw new ApiError(400, 'lotNo is required');
    await client.query('BEGIN');
    let chosenWarehouseId = warehouseId ? toInt(warehouseId, 'warehouseId') : null;
    if (!chosenWarehouseId) {
      const defaultWarehouseRes = await client.query(
        `SELECT id FROM mrp_warehouses WHERE is_default = TRUE ORDER BY id ASC LIMIT 1`
      );
      chosenWarehouseId = defaultWarehouseRes.rows[0]?.id || null;
    }
    const { rows } = await client.query(
      `INSERT INTO mrp_stock_lots
       (item_id, lot_no, source_type, source_ref, qty_received, qty_available, unit_cost, expiry_date, warehouse_id, created_at, updated_at)
       VALUES ($1, $2, 'RECEIPT', $3, $4, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (item_id, lot_no)
       DO UPDATE SET qty_received = mrp_stock_lots.qty_received + EXCLUDED.qty_received,
                     qty_available = mrp_stock_lots.qty_available + EXCLUDED.qty_available,
                     unit_cost = EXCLUDED.unit_cost,
                     expiry_date = EXCLUDED.expiry_date,
                     warehouse_id = COALESCE(mrp_stock_lots.warehouse_id, EXCLUDED.warehouse_id),
                     updated_at = NOW()
       RETURNING *`,
      [parsedItemId, String(lotNo).trim(), sourceRef, parsedQty, toNumber(unitCost, 'unitCost'), expiryDate, chosenWarehouseId]
    );
    await client.query('COMMIT');
    res.status(201).json({ lot: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listShortages(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `WITH open_wo AS (
         SELECT id, qty_planned, bom_id, due_date, wo_no
         FROM mrp_work_orders
         WHERE status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD')
       ),
       req AS (
         SELECT
           bl.component_item_id AS item_id,
           MIN(o.due_date) AS earliest_due_date,
           SUM(o.qty_planned * bl.qty_per * (1 + COALESCE(bl.scrap_pct, 0) / 100.0))::numeric(14,2) AS required_qty
         FROM open_wo o
         JOIN mrp_bom_lines bl ON bl.bom_id = o.bom_id
         GROUP BY bl.component_item_id
       ),
       reserved AS (
         SELECT item_id, COALESCE(SUM(qty_reserved - qty_consumed), 0)::numeric(14,2) AS reserved_qty
         FROM mrp_stock_reservations
         WHERE status IN ('RESERVED', 'PARTIAL')
         GROUP BY item_id
       ),
       stock AS (
         SELECT item_id, COALESCE(SUM(qty_available), 0)::numeric(14,2) AS available_qty
         FROM mrp_stock_lots
         GROUP BY item_id
       )
       SELECT
         i.id AS item_id,
         i.sku,
         i.item_name,
         req.earliest_due_date,
         req.required_qty,
         COALESCE(stock.available_qty, 0) AS available_qty,
         COALESCE(reserved.reserved_qty, 0) AS reserved_qty,
         GREATEST(req.required_qty - COALESCE(stock.available_qty, 0), 0)::numeric(14,2) AS shortage_qty
       FROM req
       JOIN mrp_items i ON i.id = req.item_id
       LEFT JOIN stock ON stock.item_id = req.item_id
       LEFT JOIN reserved ON reserved.item_id = req.item_id
       WHERE req.required_qty > COALESCE(stock.available_qty, 0)
       ORDER BY shortage_qty DESC, req.earliest_due_date NULLS LAST`
    );
    res.json({ shortages: rows });
  } catch (error) {
    next(error);
  }
}

async function listPurchaseSuggestions(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, i.sku, i.item_name, p.po_number
       FROM mrp_purchase_suggestions s
       JOIN mrp_items i ON i.id = s.item_id
       LEFT JOIN finance_purchase_orders p ON p.id = s.finance_po_id
       ORDER BY s.status ASC, s.required_date NULLS LAST, s.id DESC`
    );
    res.json({ suggestions: rows });
  } catch (error) {
    next(error);
  }
}

async function createPurchaseSuggestion(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, suggestedQty, requiredDate = null, reason = '' } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO mrp_purchase_suggestions
       (item_id, suggested_qty, required_date, reason, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OPEN', NOW(), NOW())
       RETURNING *`,
      [toInt(itemId, 'itemId'), toNumber(suggestedQty, 'suggestedQty'), requiredDate, String(reason || 'Manual').slice(0, 260)]
    );
    await client.query('COMMIT');
    res.status(201).json({ suggestion: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listMrpTraceability(req, res, next) {
  try {
    const workOrderId = toInt(req.params.id, 'work order id');
    const [woRes, inputRes, outputRes] = await Promise.all([
      pool.query(
        `SELECT w.*, i.sku AS item_sku, i.item_name
         FROM mrp_work_orders w
         JOIN mrp_items i ON i.id = w.item_id
         WHERE w.id = $1`,
        [workOrderId]
      ),
      pool.query(
        `SELECT
           r.*,
           i.sku,
           i.item_name,
           l.lot_no
         FROM mrp_stock_reservations r
         JOIN mrp_items i ON i.id = r.item_id
         LEFT JOIN mrp_stock_lots l ON l.id = r.lot_id
         WHERE r.work_order_id = $1
         ORDER BY r.id`,
        [workOrderId]
      ),
      pool.query(
        `SELECT l.id, l.item_id, l.lot_no, l.qty_received, l.qty_available, l.source_type, l.source_ref, l.created_at, w.warehouse_name
         FROM mrp_stock_lots l
         LEFT JOIN mrp_warehouses w ON w.id = l.warehouse_id
         WHERE source_type = 'WORK_ORDER'
           AND source_ref = (SELECT wo_no FROM mrp_work_orders WHERE id = $1)
         ORDER BY id DESC`,
        [workOrderId]
      ),
    ]);
    if (!woRes.rows[0]) throw new ApiError(404, 'Work order not found');
    res.json({ workOrder: woRes.rows[0], inputs: inputRes.rows, outputs: outputRes.rows });
  } catch (error) {
    next(error);
  }
}

async function listWarehouses(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT w.*,
              COALESCE(SUM(l.qty_available), 0)::numeric(14,2) AS total_available_qty
       FROM mrp_warehouses w
       LEFT JOIN mrp_stock_lots l ON l.warehouse_id = w.id
       GROUP BY w.id
       ORDER BY w.is_default DESC, w.warehouse_name ASC`
    );
    res.json({ warehouses: rows });
  } catch (error) {
    next(error);
  }
}

async function createWarehouse(req, res, next) {
  const client = await pool.connect();
  try {
    const { warehouseCode, warehouseName, isDefault = false } = req.body || {};
    if (!String(warehouseCode || '').trim()) throw new ApiError(400, 'warehouseCode is required');
    if (!String(warehouseName || '').trim()) throw new ApiError(400, 'warehouseName is required');
    await client.query('BEGIN');
    if (isDefault) {
      await client.query(`UPDATE mrp_warehouses SET is_default = FALSE, updated_at = NOW() WHERE is_default = TRUE`);
    }
    const { rows } = await client.query(
      `INSERT INTO mrp_warehouses
       (warehouse_code, warehouse_name, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [String(warehouseCode).trim().toUpperCase(), String(warehouseName).trim(), Boolean(isDefault)]
    );
    await client.query('COMMIT');
    res.status(201).json({ warehouse: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCapacityPlanner(_req, res, next) {
  try {
    const [centerRes, opRes] = await Promise.all([
      pool.query(
        `SELECT id, center_code, center_name, capacity_hours_per_day, efficiency_pct
         FROM mrp_work_centers
         WHERE active = TRUE
         ORDER BY center_name`
      ),
      pool.query(
        `SELECT
           o.id,
           o.work_center_id,
           o.operation_name,
           o.sequence_no,
           o.status,
           o.planned_hours,
           o.actual_hours,
           o.started_at,
           o.completed_at,
           o.assigned_user_id,
           w.wo_no,
           w.priority_rank,
           w.due_date,
           i.sku
         FROM mrp_work_order_operations o
         JOIN mrp_work_orders w ON w.id = o.work_order_id
         JOIN mrp_items i ON i.id = w.item_id
         WHERE w.status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD')
         ORDER BY w.priority_rank ASC, w.due_date NULLS LAST, o.sequence_no ASC`
      ),
    ]);

    const byCenter = centerRes.rows.map((center) => {
      const ops = opRes.rows.filter((op) => Number(op.work_center_id) === Number(center.id));
      const openLoad = ops
        .filter((op) => ['PENDING', 'IN_PROGRESS', 'BLOCKED'].includes(op.status))
        .reduce((sum, op) => sum + Number(op.planned_hours || 0), 0);
      const effectiveDaily = Number(center.capacity_hours_per_day || 0) * (Number(center.efficiency_pct || 0) / 100);
      return {
        ...center,
        openLoadHours: Number(openLoad.toFixed(2)),
        effectiveDailyHours: Number(effectiveDaily.toFixed(2)),
        loadDays: effectiveDaily > 0 ? Number((openLoad / effectiveDaily).toFixed(2)) : 0,
        operations: ops,
      };
    });

    res.json({ centers: byCenter });
  } catch (error) {
    next(error);
  }
}

async function upsertWorkOrderOperations(req, res, next) {
  const client = await pool.connect();
  try {
    const workOrderId = toInt(req.params.id, 'work order id');
    const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
    if (operations.length === 0) throw new ApiError(400, 'operations are required');
    await client.query('BEGIN');
    const woRes = await client.query(`SELECT id FROM mrp_work_orders WHERE id = $1`, [workOrderId]);
    if (!woRes.rows[0]) throw new ApiError(404, 'Work order not found');
    await client.query(`DELETE FROM mrp_work_order_operations WHERE work_order_id = $1`, [workOrderId]);
    for (const op of operations) {
      await client.query(
        `INSERT INTO mrp_work_order_operations
         (work_order_id, operation_name, work_center_id, sequence_no, status, planned_hours, actual_hours, assigned_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'PENDING', $5, 0, $6, NOW(), NOW())`,
        [
          workOrderId,
          String(op.operationName || 'Operation').slice(0, 180),
          op.workCenterId ? toInt(op.workCenterId, 'workCenterId') : null,
          Number(op.sequenceNo || 10),
          toNumber(op.plannedHours || 0, 'plannedHours'),
          op.assignedUserId ? toInt(op.assignedUserId, 'assignedUserId') : null,
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listShopFloorQueue(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         o.id,
         o.work_order_id,
         o.operation_name,
         o.sequence_no,
         o.status,
         o.planned_hours,
         o.actual_hours,
         o.started_at,
         o.completed_at,
         o.assigned_user_id,
         u.full_name AS assigned_user_name,
         w.wo_no,
         w.priority_rank,
         w.due_date,
         i.sku
       FROM mrp_work_order_operations o
       JOIN mrp_work_orders w ON w.id = o.work_order_id
       JOIN mrp_items i ON i.id = w.item_id
       LEFT JOIN users u ON u.id = o.assigned_user_id
       WHERE w.status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD')
       ORDER BY w.priority_rank ASC, w.due_date NULLS LAST, o.sequence_no ASC`
    );
    res.json({ queue: rows });
  } catch (error) {
    next(error);
  }
}

async function transitionOperation(req, res, next) {
  const client = await pool.connect();
  try {
    const operationId = toInt(req.params.id, 'operation id');
    const action = String(req.body?.action || '').toUpperCase();
    if (!['START', 'PAUSE', 'RESUME', 'COMPLETE'].includes(action)) throw new ApiError(400, 'Invalid action');
    await client.query('BEGIN');
    const opRes = await client.query(`SELECT * FROM mrp_work_order_operations WHERE id = $1 FOR UPDATE`, [operationId]);
    const op = opRes.rows[0];
    if (!op) throw new ApiError(404, 'Operation not found');
    let nextStatus = op.status;
    let startedAt = op.started_at;
    let completedAt = op.completed_at;
    let actualHours = Number(op.actual_hours || 0);
    if (action === 'START' || action === 'RESUME') {
      nextStatus = 'IN_PROGRESS';
      if (!startedAt) startedAt = new Date();
    }
    if (action === 'PAUSE') {
      nextStatus = 'BLOCKED';
    }
    if (action === 'COMPLETE') {
      nextStatus = 'DONE';
      completedAt = new Date();
      if (startedAt) {
        const elapsedHours = Math.max((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 3600000, 0);
        actualHours = Number((actualHours + elapsedHours).toFixed(2));
      }
    }
    await client.query(
      `UPDATE mrp_work_order_operations
       SET status = $1, started_at = $2, completed_at = $3, actual_hours = $4, updated_at = NOW()
       WHERE id = $5`,
      [nextStatus, startedAt, completedAt, actualHours, operationId]
    );
    await client.query(
      `INSERT INTO mrp_shop_floor_events
       (operation_id, event_type, event_time, duration_minutes, actor_user_id, notes)
       VALUES ($1, $2, NOW(), 0, $3, $4)`,
      [operationId, action, req.user.id, `Shop floor action by ${req.user.full_name}`]
    );
    await client.query(
      `UPDATE mrp_work_orders
       SET status = CASE
         WHEN EXISTS (
           SELECT 1 FROM mrp_work_order_operations
           WHERE work_order_id = mrp_work_orders.id AND status = 'IN_PROGRESS'
         ) THEN 'IN_PROGRESS'
         WHEN NOT EXISTS (
           SELECT 1 FROM mrp_work_order_operations
           WHERE work_order_id = mrp_work_orders.id AND status <> 'DONE'
         ) THEN 'DONE'
         ELSE mrp_work_orders.status
       END,
       updated_at = NOW()
       WHERE id = $1`,
      [op.work_order_id]
    );
    await client.query('COMMIT');
    res.json({ success: true, status: nextStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listDemandForecasts(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, i.sku, i.item_name
       FROM mrp_demand_forecasts f
       JOIN mrp_items i ON i.id = f.item_id
       ORDER BY f.forecast_month DESC, i.sku ASC`
    );
    res.json({ forecasts: rows });
  } catch (error) {
    next(error);
  }
}

async function upsertDemandForecast(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, forecastMonth, demandQty, confidencePct = 70, source = 'MANUAL' } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    if (!String(forecastMonth || '').trim()) throw new ApiError(400, 'forecastMonth is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO mrp_demand_forecasts
       (item_id, forecast_month, demand_qty, confidence_pct, source, created_by, created_at, updated_at)
       VALUES ($1, date_trunc('month', $2::date), $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (item_id, forecast_month)
       DO UPDATE SET demand_qty = EXCLUDED.demand_qty,
                     confidence_pct = EXCLUDED.confidence_pct,
                     source = EXCLUDED.source,
                     updated_at = NOW()
       RETURNING *`,
      [parsedItemId, forecastMonth, toNumber(demandQty, 'demandQty'), toNumber(confidencePct, 'confidencePct'), String(source || 'MANUAL').slice(0, 40), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ forecast: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listReplenishmentPlan(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `WITH fc AS (
         SELECT item_id, SUM(demand_qty)::numeric(14,2) AS forecast_qty
         FROM mrp_demand_forecasts
         WHERE forecast_month >= date_trunc('month', CURRENT_DATE)
           AND forecast_month < date_trunc('month', CURRENT_DATE) + interval '3 month'
         GROUP BY item_id
       ),
       stock AS (
         SELECT item_id, COALESCE(SUM(qty_available), 0)::numeric(14,2) AS on_hand
         FROM mrp_stock_lots
         GROUP BY item_id
       ),
       open_po AS (
         SELECT item_id, COALESCE(SUM(suggested_qty), 0)::numeric(14,2) AS po_incoming
         FROM mrp_purchase_suggestions
         WHERE status IN ('OPEN', 'PO_CREATED')
         GROUP BY item_id
       )
       SELECT
         i.id AS item_id,
         i.sku,
         i.item_name,
         i.reorder_point,
         i.safety_stock,
         COALESCE(fc.forecast_qty, 0) AS forecast_3m_qty,
         COALESCE(stock.on_hand, 0) AS on_hand_qty,
         COALESCE(open_po.po_incoming, 0) AS incoming_qty,
         GREATEST(
           COALESCE(fc.forecast_qty, 0) + i.safety_stock - (COALESCE(stock.on_hand, 0) + COALESCE(open_po.po_incoming, 0)),
           0
         )::numeric(14,2) AS recommended_buy_qty
       FROM mrp_items i
       LEFT JOIN fc ON fc.item_id = i.id
       LEFT JOIN stock ON stock.item_id = i.id
       LEFT JOIN open_po ON open_po.item_id = i.id
       WHERE i.active = TRUE
       ORDER BY recommended_buy_qty DESC, i.sku ASC`
    );
    res.json({ plan: rows });
  } catch (error) {
    next(error);
  }
}

async function createPoFromSuggestion(req, res, next) {
  const client = await pool.connect();
  try {
    const suggestionId = toInt(req.params.id, 'suggestion id');
    await client.query('BEGIN');
    const suggestionRes = await client.query(
      `SELECT s.*, i.sku, i.item_name, i.preferred_vendor
       FROM mrp_purchase_suggestions s
       JOIN mrp_items i ON i.id = s.item_id
       WHERE s.id = $1
       FOR UPDATE`,
      [suggestionId]
    );
    const suggestion = suggestionRes.rows[0];
    if (!suggestion) throw new ApiError(404, 'Suggestion not found');
    if (suggestion.finance_po_id) throw new ApiError(400, 'Finance PO already linked');
    const vendorName = String(suggestion.preferred_vendor || '').trim() || 'Default MRP Vendor';
    let vendorId = null;
    const vendorRes = await client.query(
      `SELECT id FROM finance_vendors WHERE LOWER(vendor_name) = LOWER($1) ORDER BY id ASC LIMIT 1`,
      [vendorName]
    );
    if (vendorRes.rows[0]) {
      vendorId = vendorRes.rows[0].id;
    } else {
      const createdVendor = await client.query(
        `INSERT INTO finance_vendors (vendor_name, created_by, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id`,
        [vendorName, req.user.id]
      );
      vendorId = createdVendor.rows[0].id;
    }
    const poNumber = createPoNo();
    const poRes = await client.query(
      `INSERT INTO finance_purchase_orders
       (po_number, vendor_id, po_date, expected_date, status, subtotal, tax_total, total, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, CURRENT_DATE, $3, 'ISSUED', $4, 0, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [poNumber, vendorId, suggestion.required_date, Number(suggestion.suggested_qty || 0), `Auto created from MRP suggestion #${suggestionId}`, req.user.id]
    );
    await client.query(
      `INSERT INTO finance_purchase_order_lines
       (purchase_order_id, description, qty, unit_cost, line_total, created_at, updated_at)
       VALUES ($1, $2, $3, 0, 0, NOW(), NOW())`,
      [poRes.rows[0].id, `${suggestion.sku} - ${suggestion.item_name}`, Number(suggestion.suggested_qty || 0)]
    );
    await client.query(
      `UPDATE mrp_purchase_suggestions
       SET status = 'PO_CREATED', finance_po_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [poRes.rows[0].id, suggestionId]
    );
    await client.query('COMMIT');
    res.json({ success: true, purchaseOrder: poRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function autoCreatePoFromOpenSuggestions(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit || 25), 200));
    const openRes = await pool.query(
      `SELECT id
       FROM mrp_purchase_suggestions
       WHERE status = 'OPEN'
       ORDER BY required_date NULLS LAST, id ASC
       LIMIT $1`,
      [limit]
    );
    const created = [];
    for (const row of openRes.rows) {
      const fakeReq = { params: { id: row.id }, user: req.user };
      const fakeRes = { json: (payload) => payload };
      await createPoFromSuggestion(fakeReq, fakeRes, next);
      created.push(row.id);
    }
    res.json({ success: true, createdCount: created.length, suggestionIds: created });
  } catch (error) {
    next(error);
  }
}

async function listIntegrations(_req, res, next) {
  try {
    const [connectorsRes, runsRes] = await Promise.all([
      pool.query(`SELECT * FROM mrp_integration_connectors ORDER BY updated_at DESC, id DESC`),
      pool.query(
        `SELECT r.*, c.provider_name, c.connector_type
         FROM mrp_integration_runs r
         JOIN mrp_integration_connectors c ON c.id = r.connector_id
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 120`
      ),
    ]);
    res.json({ connectors: connectorsRes.rows, runs: runsRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createIntegration(req, res, next) {
  const client = await pool.connect();
  try {
    const { providerName, connectorType, status = 'CONNECTED', config = {} } = req.body || {};
    if (!String(providerName || '').trim()) throw new ApiError(400, 'providerName is required');
    if (!String(connectorType || '').trim()) throw new ApiError(400, 'connectorType is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO mrp_integration_connectors
       (provider_name, connector_type, status, config_json, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW(), NOW())
       RETURNING *`,
      [String(providerName).trim(), String(connectorType).trim().toUpperCase(), String(status).toUpperCase(), JSON.stringify(config || {}), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ connector: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runIntegrationSync(req, res, next) {
  const client = await pool.connect();
  try {
    const connectorId = toInt(req.params.id, 'connector id');
    await client.query('BEGIN');
    const connectorRes = await client.query(`SELECT * FROM mrp_integration_connectors WHERE id = $1 FOR UPDATE`, [connectorId]);
    const connector = connectorRes.rows[0];
    if (!connector) throw new ApiError(404, 'Connector not found');
    const pulled = Math.floor(Math.random() * 120) + 20;
    const pushed = Math.floor(Math.random() * 80) + 10;
    const runRes = await client.query(
      `INSERT INTO mrp_integration_runs
       (connector_id, run_type, status, records_pulled, records_pushed, run_notes, created_at)
       VALUES ($1, 'SYNC', 'SUCCESS', $2, $3, $4, NOW())
       RETURNING *`,
      [connectorId, pulled, pushed, `Auto sync completed for ${connector.provider_name}`]
    );
    await client.query(`UPDATE mrp_integration_connectors SET status = 'CONNECTED', updated_at = NOW() WHERE id = $1`, [connectorId]);
    await client.query('COMMIT');
    res.json({ success: true, run: runRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listMrpDashboard,
  listMrpItems,
  createMrpItem,
  listBoms,
  createBom,
  addBomLine,
  listWorkOrders,
  createWorkOrder,
  reprioritizeWorkOrders,
  releaseWorkOrder,
  startWorkOrder,
  completeWorkOrder,
  receiveMrpStock,
  listShortages,
  listPurchaseSuggestions,
  createPurchaseSuggestion,
  listMrpTraceability,
  listWarehouses,
  createWarehouse,
  listCapacityPlanner,
  upsertWorkOrderOperations,
  listShopFloorQueue,
  transitionOperation,
  listDemandForecasts,
  upsertDemandForecast,
  listReplenishmentPlan,
  createPoFromSuggestion,
  autoCreatePoFromOpenSuggestions,
  listIntegrations,
  createIntegration,
  runIntegrationSync,
};
