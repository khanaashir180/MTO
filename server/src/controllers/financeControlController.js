const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function addFinanceAudit(area, action, entityType, entityId, payload, userId) {
  try {
    await pool.query(
      `INSERT INTO finance_audit_logs (area, action, entity_type, entity_id, payload_json, performed_by, performed_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())`,
      [area, action, entityType, entityId || null, JSON.stringify(payload || {}), userId || null]
    );
  } catch (_) {
    // best effort
  }
}

async function listBankRules(_req, res, next) {
  try {
    const [rulesRes, logsRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_bank_rules ORDER BY priority ASC, id DESC`),
      pool.query(`SELECT bl.*, br.rule_name FROM finance_bank_match_logs bl LEFT JOIN finance_bank_rules br ON br.id = bl.rule_id ORDER BY bl.created_at DESC, bl.id DESC LIMIT 500`),
    ]);
    res.json({ rules: rulesRes.rows, matchLogs: logsRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createBankRule(req, res, next) {
  const client = await pool.connect();
  try {
    const { ruleName, condition = {}, action = {}, priority = 100, active = true } = req.body || {};
    if (!String(ruleName || '').trim()) throw new ApiError(400, 'ruleName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_bank_rules
       (rule_name, condition_json, action_json, priority, active, created_by, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [String(ruleName).trim(), JSON.stringify(condition || {}), JSON.stringify(action || {}), Number(priority || 100), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    await addFinanceAudit('BANK_RULES', 'CREATE', 'BANK_RULE', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ rule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

function conditionMatched(condition, tx) {
  if (condition.referenceContains && !String(tx.reference_no || '').toUpperCase().includes(String(condition.referenceContains).toUpperCase())) return false;
  if (condition.memoContains && !String(tx.memo || '').toUpperCase().includes(String(condition.memoContains).toUpperCase())) return false;
  if (condition.amountLte !== undefined && Number(tx.amount || 0) > Number(condition.amountLte)) return false;
  if (condition.amountGte !== undefined && Number(tx.amount || 0) < Number(condition.amountGte)) return false;
  return true;
}

async function runBankRuleEngine(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const [rulesRes, txRes] = await Promise.all([
      client.query(`SELECT * FROM finance_bank_rules WHERE active = TRUE ORDER BY priority ASC, id ASC`),
      client.query(`SELECT * FROM finance_bank_transactions WHERE match_type = 'UNMATCHED' ORDER BY tx_date ASC, id ASC LIMIT 500`),
    ]);
    let matched = 0;
    let excluded = 0;
    for (const tx of txRes.rows) {
      let appliedRule = null;
      let result = 'NO_MATCH';
      let detail = {};
      for (const rule of rulesRes.rows) {
        const condition = rule.condition_json || {};
        if (!conditionMatched(condition, tx)) continue;
        const action = rule.action_json || {};
        appliedRule = rule.id;
        if (action.action === 'EXCLUDE') {
          await client.query(`UPDATE finance_bank_transactions SET match_type = 'EXCLUDED', updated_at = NOW() WHERE id = $1`, [tx.id]);
          result = 'EXCLUDED';
          excluded += 1;
          detail = { action: 'EXCLUDE' };
        } else if (action.action === 'MATCH_INVOICE') {
          const inv = await client.query(
            `SELECT id FROM finance_invoices WHERE invoice_number = $1 LIMIT 1`,
            [String(tx.reference_no || '').trim()]
          );
          if (inv.rows[0]) {
            await client.query(
              `UPDATE finance_bank_transactions
               SET match_type = 'MATCHED', matched_entity_type = 'INVOICE', matched_entity_id = $1, updated_at = NOW()
               WHERE id = $2`,
              [inv.rows[0].id, tx.id]
            );
            result = 'MATCHED';
            matched += 1;
            detail = { action: 'MATCH_INVOICE', invoiceId: inv.rows[0].id };
          }
        }
        break;
      }
      await client.query(
        `INSERT INTO finance_bank_match_logs (bank_tx_id, rule_id, match_result, detail_json, created_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())`,
        [tx.id, appliedRule, result, JSON.stringify(detail)]
      );
    }
    await client.query('COMMIT');
    await addFinanceAudit('BANK_RULES', 'RUN_ENGINE', 'BANK_TX_BATCH', null, { matched, excluded }, req.user.id);
    res.json({ ok: true, processed: txRes.rows.length, matched, excluded });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listReportAutomation(_req, res, next) {
  try {
    const [presetRes, scheduleRes, exportRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_report_presets ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT rs.*, rp.preset_name FROM finance_report_schedules rs JOIN finance_report_presets rp ON rp.id = rs.preset_id ORDER BY rs.updated_at DESC, rs.id DESC`),
      pool.query(`SELECT re.*, rp.preset_name FROM finance_report_exports re LEFT JOIN finance_report_presets rp ON rp.id = re.preset_id ORDER BY re.exported_at DESC, re.id DESC LIMIT 500`),
    ]);
    res.json({ presets: presetRes.rows, schedules: scheduleRes.rows, exports: exportRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createReportPreset(req, res, next) {
  const client = await pool.connect();
  try {
    const { presetName, reportType = 'FINANCIAL', definition = {}, isShared = false } = req.body || {};
    if (!String(presetName || '').trim()) throw new ApiError(400, 'presetName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_report_presets
       (preset_name, report_type, definition_json, is_shared, owner_id, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), NOW())
       RETURNING *`,
      [String(presetName).trim(), String(reportType).toUpperCase(), JSON.stringify(definition || {}), Boolean(isShared), req.user.id]
    );
    await client.query('COMMIT');
    await addFinanceAudit('REPORTS', 'CREATE', 'REPORT_PRESET', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ preset: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createReportSchedule(req, res, next) {
  const client = await pool.connect();
  try {
    const { presetId, scheduleType = 'MONTHLY', nextRunDate, deliveryChannel = 'IN_APP', active = true } = req.body || {};
    if (!nextRunDate) throw new ApiError(400, 'nextRunDate is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_report_schedules
       (preset_id, schedule_type, next_run_date, delivery_channel, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [toInt(presetId, 'presetId'), String(scheduleType).toUpperCase(), nextRunDate, String(deliveryChannel).toUpperCase(), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ schedule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function exportReport(req, res, next) {
  const client = await pool.connect();
  try {
    const { presetId = null, exportFormat = 'CSV', exportScope = {} } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_report_exports
       (preset_id, export_format, export_scope, exported_by, exported_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       RETURNING *`,
      [presetId ? toInt(presetId, 'presetId') : null, String(exportFormat).toUpperCase(), JSON.stringify(exportScope || {}), req.user.id]
    );
    await client.query('COMMIT');
    await addFinanceAudit('REPORTS', 'EXPORT', 'REPORT_EXPORT', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ exportLog: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listInventoryLots(req, res, next) {
  try {
    const itemId = req.query?.itemId ? Number(req.query.itemId) : null;
    const values = [];
    const filters = [];
    if (Number.isInteger(itemId) && itemId > 0) {
      values.push(itemId);
      filters.push(`l.item_id = $1`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT l.*, i.sku, i.item_name
       FROM finance_inventory_lots l
       JOIN finance_inventory_items i ON i.id = l.item_id
       ${whereClause}
       ORDER BY l.received_date ASC, l.id ASC`,
      values
    );
    res.json({ lots: rows });
  } catch (error) {
    next(error);
  }
}

async function receiveInventoryLot(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, lotNumber, receivedDate = null, qtyReceived, unitCost = 0, expiryDate = null } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const qty = Number(qtyReceived || 0);
    if (!(qty > 0)) throw new ApiError(400, 'qtyReceived must be > 0');
    if (!String(lotNumber || '').trim()) throw new ApiError(400, 'lotNumber is required');
    await client.query('BEGIN');
    const lotRes = await client.query(
      `INSERT INTO finance_inventory_lots
       (item_id, lot_number, received_date, qty_received, qty_available, unit_cost, expiry_date, created_by, created_at)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $4, $5, $6, $7, NOW())
       ON CONFLICT (item_id, lot_number)
       DO UPDATE SET qty_received = finance_inventory_lots.qty_received + EXCLUDED.qty_received,
                     qty_available = finance_inventory_lots.qty_available + EXCLUDED.qty_available,
                     unit_cost = EXCLUDED.unit_cost
       RETURNING *`,
      [parsedItemId, String(lotNumber).trim(), receivedDate, qty, Number(unitCost || 0), expiryDate, req.user.id]
    );
    await client.query(
      `INSERT INTO finance_inventory_movements
       (item_id, movement_date, movement_type, qty, unit_cost, notes, created_by, created_at)
       VALUES ($1, COALESCE($2, CURRENT_DATE), 'PURCHASE', $3, $4, $5, $6, NOW())`,
      [parsedItemId, receivedDate, qty, Number(unitCost || 0), `Lot received: ${String(lotNumber).trim()}`, req.user.id]
    );
    await client.query(
      `UPDATE finance_inventory_items
       SET qty_on_hand = qty_on_hand + $1,
           avg_unit_cost = CASE WHEN (qty_on_hand + $1) > 0 THEN ((qty_on_hand * avg_unit_cost) + ($1 * $2)) / (qty_on_hand + $1) ELSE avg_unit_cost END,
           updated_at = NOW()
       WHERE id = $3`,
      [qty, Number(unitCost || 0), parsedItemId]
    );
    await client.query('COMMIT');
    await addFinanceAudit('INVENTORY', 'LOT_RECEIVE', 'INVENTORY_LOT', lotRes.rows[0].id, lotRes.rows[0], req.user.id);
    res.status(201).json({ lot: lotRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function issueInventoryWithCogs(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, qty, movementDate = null, notes = '' } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const requiredQty = Number(qty || 0);
    if (!(requiredQty > 0)) throw new ApiError(400, 'qty must be > 0');
    await client.query('BEGIN');
    const itemRes = await client.query(`SELECT * FROM finance_inventory_items WHERE id = $1 FOR UPDATE`, [parsedItemId]);
    const item = itemRes.rows[0];
    if (!item) throw new ApiError(404, 'Inventory item not found');
    if (Number(item.qty_on_hand || 0) < requiredQty) throw new ApiError(400, 'Insufficient stock');
    const movementRes = await client.query(
      `INSERT INTO finance_inventory_movements
       (item_id, movement_date, movement_type, qty, unit_cost, notes, created_by, created_at)
       VALUES ($1, COALESCE($2, CURRENT_DATE), 'SALE', $3, 0, $4, $5, NOW())
       RETURNING *`,
      [parsedItemId, movementDate, requiredQty, notes || null, req.user.id]
    );
    let remaining = requiredQty;
    let totalCogs = 0;
    const lotsRes = await client.query(
      `SELECT * FROM finance_inventory_lots
       WHERE item_id = $1 AND qty_available > 0
       ORDER BY received_date ASC, id ASC
       FOR UPDATE`,
      [parsedItemId]
    );
    for (const lot of lotsRes.rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(lot.qty_available || 0));
      const unitCost = Number(lot.unit_cost || 0);
      const cogs = Number((take * unitCost).toFixed(2));
      remaining -= take;
      totalCogs += cogs;
      await client.query(`UPDATE finance_inventory_lots SET qty_available = qty_available - $1 WHERE id = $2`, [take, lot.id]);
      await client.query(
        `INSERT INTO finance_inventory_issue_allocations
         (movement_id, lot_id, qty, unit_cost, cogs_amount, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [movementRes.rows[0].id, lot.id, take, unitCost, cogs]
      );
    }
    if (remaining > 0) throw new ApiError(400, 'Insufficient lot quantity');
    await client.query(
      `INSERT INTO finance_cogs_journal (movement_id, item_id, cogs_amount, entry_date, created_by, created_at)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, NOW())`,
      [movementRes.rows[0].id, parsedItemId, Number(totalCogs.toFixed(2)), movementDate, req.user.id]
    );
    await client.query(`UPDATE finance_inventory_items SET qty_on_hand = qty_on_hand - $1, updated_at = NOW() WHERE id = $2`, [requiredQty, parsedItemId]);
    await client.query('COMMIT');
    await addFinanceAudit('INVENTORY', 'ISSUE_COGS', 'INVENTORY_MOVEMENT', movementRes.rows[0].id, { totalCogs }, req.user.id);
    res.status(201).json({ movement: movementRes.rows[0], totalCogs: Number(totalCogs.toFixed(2)) });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPayrollCompliance(_req, res, next) {
  try {
    const [settingsRes, filingsRes] = await Promise.all([
      pool.query(`SELECT pts.*, p.name AS payment_account_name FROM finance_payroll_tax_settings pts LEFT JOIN payment_accounts p ON p.id = pts.payment_account_id ORDER BY pts.updated_at DESC, pts.id DESC`),
      pool.query(`SELECT pf.*, pr.run_label FROM finance_payroll_filings pf LEFT JOIN finance_payroll_runs pr ON pr.id = pf.payroll_run_id ORDER BY pf.created_at DESC, pf.id DESC`),
    ]);
    res.json({ taxSettings: settingsRes.rows, filings: filingsRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createPayrollTaxSetting(req, res, next) {
  const client = await pool.connect();
  try {
    const { countryCode = 'US', taxAuthority, filingFrequency = 'MONTHLY', paymentAccountId = null } = req.body || {};
    if (!String(taxAuthority || '').trim()) throw new ApiError(400, 'taxAuthority is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payroll_tax_settings
       (country_code, tax_authority, filing_frequency, payment_account_id, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
       RETURNING *`,
      [String(countryCode || 'US').toUpperCase(), String(taxAuthority).trim(), String(filingFrequency || 'MONTHLY').toUpperCase(), paymentAccountId ? toInt(paymentAccountId, 'paymentAccountId') : null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ taxSetting: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function submitPayrollFiling(req, res, next) {
  const client = await pool.connect();
  try {
    const { payrollRunId = null, periodLabel, taxAuthority, taxDue = 0, payload = {}, referenceNo = '' } = req.body || {};
    if (!String(periodLabel || '').trim()) throw new ApiError(400, 'periodLabel is required');
    if (!String(taxAuthority || '').trim()) throw new ApiError(400, 'taxAuthority is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payroll_filings
       (payroll_run_id, period_label, tax_authority, filing_status, tax_due, reference_no, payload_json, filed_by, filed_at, created_at)
       VALUES ($1, $2, $3, 'FILED', $4, $5, $6::jsonb, $7, NOW(), NOW())
       RETURNING *`,
      [payrollRunId ? toInt(payrollRunId, 'payrollRunId') : null, String(periodLabel).trim(), String(taxAuthority).trim(), Number(taxDue || 0), referenceNo || null, JSON.stringify(payload || {}), req.user.id]
    );
    await client.query('COMMIT');
    await addFinanceAudit('PAYROLL', 'FILE_TAX', 'PAYROLL_FILING', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ filing: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listAccountingControls(_req, res, next) {
  try {
    const [policyRes, approvalRes, auditRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_accounting_approval_policies ORDER BY entity_type ASC, threshold_amount DESC`),
      pool.query(`SELECT a.*, u1.full_name AS requested_by_name, u2.full_name AS approver_name FROM finance_accounting_approvals a LEFT JOIN users u1 ON u1.id = a.requested_by LEFT JOIN users u2 ON u2.id = a.approver_id ORDER BY a.requested_at DESC, a.id DESC`),
      pool.query(`SELECT al.*, u.full_name AS performed_by_name FROM finance_audit_logs al LEFT JOIN users u ON u.id = al.performed_by ORDER BY al.performed_at DESC, al.id DESC LIMIT 1000`),
    ]);
    res.json({ policies: policyRes.rows, approvals: approvalRes.rows, audits: auditRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createApprovalPolicy(req, res, next) {
  const client = await pool.connect();
  try {
    const { entityType, thresholdAmount = 0, approverRole = 'FINANCE', active = true } = req.body || {};
    if (!String(entityType || '').trim()) throw new ApiError(400, 'entityType is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_accounting_approval_policies
       (entity_type, threshold_amount, approver_role, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [String(entityType).toUpperCase(), Number(thresholdAmount || 0), String(approverRole).toUpperCase(), Boolean(active), req.user.id]
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

async function requestAccountingApproval(req, res, next) {
  const client = await pool.connect();
  try {
    const { entityType, entityId, thresholdAmount = 0 } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_accounting_approvals
       (entity_type, entity_id, requested_by, threshold_amount, status, requested_at)
       VALUES ($1, $2, $3, $4, 'PENDING', NOW())
       RETURNING *`,
      [String(entityType).toUpperCase(), toInt(entityId, 'entityId'), req.user.id, Number(thresholdAmount || 0)]
    );
    await client.query('COMMIT');
    await addFinanceAudit('CONTROLS', 'REQUEST_APPROVAL', 'ACCOUNTING_APPROVAL', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ approval: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function decideAccountingApproval(req, res, next) {
  const client = await pool.connect();
  try {
    const approvalId = toInt(req.params.id, 'approval id');
    const status = String(req.body?.status || '').toUpperCase();
    const decisionNote = String(req.body?.decisionNote || '');
    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) throw new ApiError(400, 'Invalid status');
    await client.query('BEGIN');
    await client.query(
      `UPDATE finance_accounting_approvals
       SET status = $1, approver_id = $2, decision_note = $3, decided_at = NOW()
       WHERE id = $4`,
      [status, req.user.id, decisionNote || null, approvalId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_accounting_approvals WHERE id = $1`, [approvalId]);
    await client.query('COMMIT');
    await addFinanceAudit('CONTROLS', 'DECIDE_APPROVAL', 'ACCOUNTING_APPROVAL', approvalId, { status }, req.user.id);
    res.json({ approval: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCloseBooks(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT cb.*, u1.full_name AS closed_by_name, u2.full_name AS reopened_by_name
       FROM finance_close_books_periods cb
       LEFT JOIN users u1 ON u1.id = cb.closed_by
       LEFT JOIN users u2 ON u2.id = cb.reopened_by
       ORDER BY cb.period_month DESC, cb.id DESC
       LIMIT 36`
    );
    res.json({ periods: rows });
  } catch (error) {
    next(error);
  }
}

async function upsertCloseBooksPeriod(req, res, next) {
  const client = await pool.connect();
  try {
    const { periodMonth, checklist = {} } = req.body || {};
    if (!periodMonth) throw new ApiError(400, 'periodMonth is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_close_books_periods
       (period_month, status, checklist_json, created_by, created_at, updated_at)
       VALUES (date_trunc('month', $1::date)::date, 'OPEN', $2::jsonb, $3, NOW(), NOW())
       ON CONFLICT (period_month)
       DO UPDATE SET checklist_json = EXCLUDED.checklist_json, updated_at = NOW()
       RETURNING *`,
      [periodMonth, JSON.stringify(checklist || {}), req.user.id]
    );
    await client.query('COMMIT');
    await addFinanceAudit('CLOSE_BOOKS', 'UPSERT_PERIOD', 'CLOSE_BOOKS_PERIOD', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ period: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function closeBooksPeriod(req, res, next) {
  const client = await pool.connect();
  try {
    const periodId = toInt(req.params.id, 'period id');
    await client.query('BEGIN');
    const found = await client.query(`SELECT * FROM finance_close_books_periods WHERE id = $1 FOR UPDATE`, [periodId]);
    const period = found.rows[0];
    if (!period) throw new ApiError(404, 'Close books period not found');
    if (String(period.status || '').toUpperCase() === 'CLOSED') throw new ApiError(409, 'Period is already closed');
    const checklist = period.checklist_json || {};
    const pendingItem = Object.entries(checklist).find(([, value]) => !Boolean(value));
    if (pendingItem) throw new ApiError(400, `Checklist item "${pendingItem[0]}" is pending`);
    await client.query(
      `UPDATE finance_close_books_periods
       SET status = 'CLOSED', closed_by = $1, closed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, periodId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_close_books_periods WHERE id = $1`, [periodId]);
    await client.query('COMMIT');
    await addFinanceAudit('CLOSE_BOOKS', 'CLOSE_PERIOD', 'CLOSE_BOOKS_PERIOD', periodId, rows[0], req.user.id);
    res.json({ period: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function reopenBooksPeriod(req, res, next) {
  const client = await pool.connect();
  try {
    const periodId = toInt(req.params.id, 'period id');
    await client.query('BEGIN');
    await client.query(
      `UPDATE finance_close_books_periods
       SET status = 'OPEN', reopened_by = $1, reopened_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, periodId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_close_books_periods WHERE id = $1`, [periodId]);
    await client.query('COMMIT');
    await addFinanceAudit('CLOSE_BOOKS', 'REOPEN_PERIOD', 'CLOSE_BOOKS_PERIOD', periodId, rows[0], req.user.id);
    res.json({ period: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listFixedAssets(_req, res, next) {
  try {
    const [assetsRes, depRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_fixed_assets ORDER BY updated_at DESC, id DESC`),
      pool.query(
        `SELECT d.*, fa.asset_name
         FROM finance_fixed_asset_depreciation_runs d
         JOIN finance_fixed_assets fa ON fa.id = d.asset_id
         ORDER BY d.period_month DESC, d.id DESC
         LIMIT 500`
      ),
    ]);
    res.json({ assets: assetsRes.rows, depreciationRuns: depRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createFixedAsset(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      assetCode,
      assetName,
      category = '',
      purchaseDate = null,
      cost = 0,
      salvageValue = 0,
      usefulLifeMonths = 36,
      depreciationMethod = 'STRAIGHT_LINE',
      currencyCode = 'USD',
    } = req.body || {};
    if (!String(assetCode || '').trim()) throw new ApiError(400, 'assetCode is required');
    if (!String(assetName || '').trim()) throw new ApiError(400, 'assetName is required');
    const parsedCost = Number(cost || 0);
    const parsedSalvage = Number(salvageValue || 0);
    if (parsedCost < 0 || parsedSalvage < 0) throw new ApiError(400, 'cost and salvageValue must be >= 0');
    if (parsedSalvage > parsedCost) throw new ApiError(400, 'salvageValue cannot exceed cost');
    const life = toInt(usefulLifeMonths, 'usefulLifeMonths');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_fixed_assets
       (asset_code, asset_name, category, purchase_date, cost, salvage_value, useful_life_months, depreciation_method, currency_code, status, accumulated_depreciation, net_book_value, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9, 'ACTIVE', 0, $5, $10, NOW(), NOW())
       RETURNING *`,
      [
        String(assetCode).trim(),
        String(assetName).trim(),
        category || null,
        purchaseDate,
        parsedCost,
        parsedSalvage,
        life,
        String(depreciationMethod || 'STRAIGHT_LINE').toUpperCase(),
        String(currencyCode || 'USD').toUpperCase(),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    await addFinanceAudit('FIXED_ASSETS', 'CREATE_ASSET', 'FIXED_ASSET', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ asset: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function postAssetDepreciationRun(req, res, next) {
  const client = await pool.connect();
  try {
    const { periodMonth, assetId = null } = req.body || {};
    if (!periodMonth) throw new ApiError(400, 'periodMonth is required');
    await client.query('BEGIN');
    const filterSql = assetId ? 'AND id = $2' : '';
    const values = assetId ? [periodMonth, toInt(assetId, 'assetId')] : [periodMonth];
    const assetsRes = await client.query(
      `SELECT * FROM finance_fixed_assets
       WHERE status = 'ACTIVE'
         AND purchase_date <= (date_trunc('month', $1::date) + interval '1 month - 1 day')::date
         ${filterSql}
       ORDER BY id ASC
       FOR UPDATE`,
      values
    );
    const processed = [];
    for (const asset of assetsRes.rows) {
      const exists = await client.query(
        `SELECT 1 FROM finance_fixed_asset_depreciation_runs
         WHERE asset_id = $1 AND period_month = date_trunc('month', $2::date)::date`,
        [asset.id, periodMonth]
      );
      if (exists.rows[0]) continue;
      const depreciableBase = Number(asset.cost || 0) - Number(asset.salvage_value || 0);
      if (depreciableBase <= 0) continue;
      const monthly = depreciableBase / Number(asset.useful_life_months || 1);
      const remaining = Number(asset.net_book_value || 0) - Number(asset.salvage_value || 0);
      const amount = Number(Math.max(Math.min(monthly, remaining), 0).toFixed(2));
      if (amount <= 0) continue;
      await client.query(
        `INSERT INTO finance_fixed_asset_depreciation_runs
         (asset_id, period_month, depreciation_amount, posted_by, posted_at, created_at)
         VALUES ($1, date_trunc('month', $2::date)::date, $3, $4, NOW(), NOW())`,
        [asset.id, periodMonth, amount, req.user.id]
      );
      await client.query(
        `UPDATE finance_fixed_assets
         SET accumulated_depreciation = accumulated_depreciation + $1,
             net_book_value = net_book_value - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [amount, asset.id]
      );
      processed.push({ assetId: asset.id, amount });
    }
    await client.query('COMMIT');
    await addFinanceAudit('FIXED_ASSETS', 'RUN_DEPRECIATION', 'DEPRECIATION_BATCH', null, { periodMonth, processedCount: processed.length }, req.user.id);
    res.json({ ok: true, periodMonth, processed });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listFxCenter(_req, res, next) {
  try {
    const [ratesRes, revalRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_fx_rates ORDER BY rate_date DESC, currency_code ASC LIMIT 500`),
      pool.query(`SELECT * FROM finance_fx_revaluation_runs ORDER BY period_end_date DESC, id DESC LIMIT 500`),
    ]);
    res.json({ rates: ratesRes.rows, revaluations: revalRes.rows });
  } catch (error) {
    next(error);
  }
}

async function upsertFxRate(req, res, next) {
  const client = await pool.connect();
  try {
    const { currencyCode, rateDate, rateToUsd, source = 'MANUAL' } = req.body || {};
    if (!String(currencyCode || '').trim()) throw new ApiError(400, 'currencyCode is required');
    if (!rateDate) throw new ApiError(400, 'rateDate is required');
    if (!(Number(rateToUsd || 0) > 0)) throw new ApiError(400, 'rateToUsd must be > 0');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_fx_rates
       (currency_code, rate_date, rate_to_usd, source, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (currency_code, rate_date)
       DO UPDATE SET rate_to_usd = EXCLUDED.rate_to_usd, source = EXCLUDED.source, updated_at = NOW()
       RETURNING *`,
      [String(currencyCode).toUpperCase(), rateDate, Number(rateToUsd), String(source || 'MANUAL').toUpperCase(), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ rate: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runFxRevaluation(req, res, next) {
  const client = await pool.connect();
  try {
    const { periodEndDate, currencyCode } = req.body || {};
    if (!periodEndDate) throw new ApiError(400, 'periodEndDate is required');
    if (!String(currencyCode || '').trim()) throw new ApiError(400, 'currencyCode is required');
    await client.query('BEGIN');
    const cc = String(currencyCode).toUpperCase();
    const currentRateRes = await client.query(
      `SELECT rate_to_usd
       FROM finance_fx_rates
       WHERE currency_code = $1 AND rate_date <= $2
       ORDER BY rate_date DESC
       LIMIT 1`,
      [cc, periodEndDate]
    );
    const priorRateRes = await client.query(
      `SELECT rate_to_usd
       FROM finance_fx_rates
       WHERE currency_code = $1 AND rate_date < $2
       ORDER BY rate_date DESC
       LIMIT 1`,
      [cc, periodEndDate]
    );
    const currentRate = Number(currentRateRes.rows[0]?.rate_to_usd || 0);
    const priorRate = Number(priorRateRes.rows[0]?.rate_to_usd || currentRate || 0);
    if (!(currentRate > 0)) throw new ApiError(400, 'No FX rate found for selected period');
    const openAmountRes = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('SENT', 'PARTIAL') THEN total ELSE 0 END), 0)
         + COALESCE((SELECT SUM(CASE WHEN status IN ('OPEN', 'PARTIAL') THEN total ELSE 0 END) FROM finance_bills), 0) AS open_amount
       FROM finance_invoices`
    );
    const openAmount = Number(openAmountRes.rows[0]?.open_amount || 0);
    const gainLoss = Number((openAmount * (currentRate - priorRate)).toFixed(2));
    const { rows } = await client.query(
      `INSERT INTO finance_fx_revaluation_runs
       (period_end_date, currency_code, open_amount, booked_rate, revalued_rate, unrealized_gain_loss, posted_by, posted_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [periodEndDate, cc, openAmount, priorRate, currentRate, gainLoss, req.user.id]
    );
    await client.query('COMMIT');
    await addFinanceAudit('FX', 'RUN_REVALUATION', 'FX_REVALUATION', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ revaluation: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listArCollections(_req, res, next) {
  try {
    const [runsRes, itemsRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_ar_collection_runs ORDER BY run_date DESC, id DESC LIMIT 100`),
      pool.query(
        `SELECT i.*, inv.invoice_number, ca.customer_name
         FROM finance_ar_collection_items i
         JOIN finance_invoices inv ON inv.id = i.invoice_id
         JOIN customer_accounts ca ON ca.id = i.account_id
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT 500`
      ),
    ]);
    res.json({ runs: runsRes.rows, items: itemsRes.rows });
  } catch (error) {
    next(error);
  }
}

async function runArCollectionSweep(req, res, next) {
  const client = await pool.connect();
  try {
    const minOverdueDays = Number(req.body?.minOverdueDays || 1);
    if (minOverdueDays < 1) throw new ApiError(400, 'minOverdueDays must be >= 1');
    await client.query('BEGIN');
    const overdueRes = await client.query(
      `SELECT id, account_id, total, due_date
       FROM finance_invoices
       WHERE status IN ('SENT', 'PARTIAL')
         AND due_date IS NOT NULL
         AND due_date <= (CURRENT_DATE - $1::int)`,
      [minOverdueDays]
    );
    const runRes = await client.query(
      `INSERT INTO finance_ar_collection_runs (run_date, min_overdue_days, generated_count, created_by, created_at)
       VALUES (CURRENT_DATE, $1, 0, $2, NOW())
       RETURNING *`,
      [minOverdueDays, req.user.id]
    );
    const runId = runRes.rows[0].id;
    let generated = 0;
    for (const invoice of overdueRes.rows) {
      const days = Math.max(0, Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)));
      const reminderLevel = days >= 30 ? 'FINAL' : days >= 15 ? 'FIRM' : 'SOFT';
      await client.query(
        `INSERT INTO finance_ar_collection_items
         (run_id, invoice_id, account_id, days_overdue, balance_due, reminder_level, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [runId, invoice.id, invoice.account_id, days, Number(invoice.total || 0), reminderLevel]
      );
      generated += 1;
    }
    await client.query(`UPDATE finance_ar_collection_runs SET generated_count = $1 WHERE id = $2`, [generated, runId]);
    await client.query('COMMIT');
    await addFinanceAudit('AR_COLLECTIONS', 'RUN_SWEEP', 'AR_COLLECTION_RUN', runId, { minOverdueDays, generated }, req.user.id);
    res.status(201).json({ run: { ...runRes.rows[0], generated_count: generated } });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listBankFeedCenter(_req, res, next) {
  try {
    const [connectorsRes, runsRes, entriesRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_bank_feed_connectors ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT r.*, c.connector_name FROM finance_bank_feed_import_runs r JOIN finance_bank_feed_connectors c ON c.id = r.connector_id ORDER BY r.started_at DESC, r.id DESC LIMIT 100`),
      pool.query(`SELECT e.*, c.connector_name FROM finance_bank_feed_entries e JOIN finance_bank_feed_connectors c ON c.id = e.connector_id ORDER BY e.created_at DESC, e.id DESC LIMIT 500`),
    ]);
    res.json({ connectors: connectorsRes.rows, importRuns: runsRes.rows, entries: entriesRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createBankFeedConnector(req, res, next) {
  const client = await pool.connect();
  try {
    const { connectorName, provider = 'MANUAL', status = 'ACTIVE', config = {} } = req.body || {};
    if (!String(connectorName || '').trim()) throw new ApiError(400, 'connectorName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_bank_feed_connectors
       (connector_name, provider, status, config_json, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW(), NOW())
       RETURNING *`,
      [String(connectorName).trim(), String(provider || 'MANUAL').toUpperCase(), String(status || 'ACTIVE').toUpperCase(), JSON.stringify(config || {}), req.user.id]
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

async function runBankFeedImport(req, res, next) {
  const client = await pool.connect();
  try {
    const { connectorId, entries = [] } = req.body || {};
    const parsedConnectorId = toInt(connectorId, 'connectorId');
    if (!Array.isArray(entries) || entries.length === 0) throw new ApiError(400, 'entries are required');
    await client.query('BEGIN');
    const connectorRes = await client.query(`SELECT * FROM finance_bank_feed_connectors WHERE id = $1 FOR UPDATE`, [parsedConnectorId]);
    if (!connectorRes.rows[0]) throw new ApiError(404, 'Bank feed connector not found');
    const runRes = await client.query(
      `INSERT INTO finance_bank_feed_import_runs
       (connector_id, run_status, imported_count, duplicate_count, started_at, created_by)
       VALUES ($1, 'STARTED', 0, 0, NOW(), $2)
       RETURNING *`,
      [parsedConnectorId, req.user.id]
    );
    let imported = 0;
    let duplicate = 0;
    for (const entry of entries) {
      const extTxId = String(entry.extTxId || '').trim();
      if (!extTxId) continue;
      const txDate = entry.txDate || new Date().toISOString().slice(0, 10);
      const amount = Number(entry.amount || 0);
      const currencyCode = String(entry.currencyCode || 'USD').toUpperCase();
      const description = entry.description || null;
      const referenceNo = entry.referenceNo || null;
      const payeeName = entry.payeeName || null;
      try {
        const feedInsert = await client.query(
          `INSERT INTO finance_bank_feed_entries
           (connector_id, ext_tx_id, tx_date, amount, currency_code, description, reference_no, payee_name, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (connector_id, ext_tx_id) DO NOTHING
           RETURNING *`,
          [parsedConnectorId, extTxId, txDate, amount, currencyCode, description, referenceNo, payeeName]
        );
        if (!feedInsert.rows[0]) {
          duplicate += 1;
          continue;
        }
        imported += 1;
        let confidence = 0;
        let matchedBankTxId = null;
        const matchRes = await client.query(
          `SELECT id
           FROM finance_bank_transactions
           WHERE tx_date = $1
             AND amount = $2
             AND (
               ($3 IS NOT NULL AND reference_no = $3)
               OR ($4 IS NOT NULL AND payee_name ILIKE ('%' || $4 || '%'))
             )
           ORDER BY id DESC
           LIMIT 1`,
          [txDate, amount, referenceNo, payeeName]
        );
        if (matchRes.rows[0]) {
          matchedBankTxId = matchRes.rows[0].id;
          confidence = referenceNo ? 95 : 80;
        }
        await client.query(
          `UPDATE finance_bank_feed_entries
           SET linked_bank_tx_id = $1, match_confidence = $2
           WHERE id = $3`,
          [matchedBankTxId, confidence, feedInsert.rows[0].id]
        );
      } catch (_) {
        duplicate += 1;
      }
    }
    await client.query(
      `UPDATE finance_bank_feed_import_runs
       SET run_status = 'COMPLETED', imported_count = $1, duplicate_count = $2, completed_at = NOW()
       WHERE id = $3`,
      [imported, duplicate, runRes.rows[0].id]
    );
    await client.query(`UPDATE finance_bank_feed_connectors SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1`, [parsedConnectorId]);
    await client.query('COMMIT');
    await addFinanceAudit('BANK_FEEDS', 'IMPORT', 'BANK_FEED_RUN', runRes.rows[0].id, { imported, duplicate }, req.user.id);
    res.status(201).json({ run: { ...runRes.rows[0], run_status: 'COMPLETED', imported_count: imported, duplicate_count: duplicate } });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listSalesTaxCenter(_req, res, next) {
  try {
    const [jurisRes, nexusRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_sales_tax_jurisdictions ORDER BY country_code ASC, jurisdiction_code ASC`),
      pool.query(`SELECT n.*, j.jurisdiction_code, j.region_name FROM finance_sales_tax_nexus n JOIN finance_sales_tax_jurisdictions j ON j.id = n.jurisdiction_id ORDER BY n.outlet_name ASC, n.id DESC`),
    ]);
    res.json({ jurisdictions: jurisRes.rows, nexus: nexusRes.rows });
  } catch (error) {
    next(error);
  }
}

async function upsertSalesTaxJurisdiction(req, res, next) {
  const client = await pool.connect();
  try {
    const { jurisdictionCode, countryCode = 'US', regionName, taxRatePercent = 0, active = true } = req.body || {};
    if (!String(jurisdictionCode || '').trim()) throw new ApiError(400, 'jurisdictionCode is required');
    if (!String(regionName || '').trim()) throw new ApiError(400, 'regionName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_sales_tax_jurisdictions
       (jurisdiction_code, country_code, region_name, tax_rate_percent, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (jurisdiction_code)
       DO UPDATE SET country_code = EXCLUDED.country_code,
                     region_name = EXCLUDED.region_name,
                     tax_rate_percent = EXCLUDED.tax_rate_percent,
                     active = EXCLUDED.active,
                     updated_at = NOW()
       RETURNING *`,
      [String(jurisdictionCode).toUpperCase(), String(countryCode).toUpperCase(), String(regionName).trim(), Number(taxRatePercent || 0), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ jurisdiction: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function upsertSalesTaxNexus(req, res, next) {
  const client = await pool.connect();
  try {
    const { jurisdictionId, outletName, active = true } = req.body || {};
    if (!String(outletName || '').trim()) throw new ApiError(400, 'outletName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_sales_tax_nexus
       (jurisdiction_id, outlet_name, active, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (jurisdiction_id, outlet_name)
       DO UPDATE SET active = EXCLUDED.active
       RETURNING *`,
      [toInt(jurisdictionId, 'jurisdictionId'), String(outletName).trim(), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ nexus: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function previewSalesTax(req, res, next) {
  try {
    const { outletName, jurisdictionCode = '', amount = 0 } = req.body || {};
    if (!String(outletName || '').trim()) throw new ApiError(400, 'outletName is required');
    const parsedAmount = Number(amount || 0);
    const rows = await pool.query(
      `SELECT j.*
       FROM finance_sales_tax_jurisdictions j
       JOIN finance_sales_tax_nexus n ON n.jurisdiction_id = j.id
       WHERE n.outlet_name = $1
         AND n.active = TRUE
         AND j.active = TRUE
         AND ($2 = '' OR j.jurisdiction_code = $2)
       ORDER BY j.tax_rate_percent DESC
       LIMIT 1`,
      [String(outletName).trim(), String(jurisdictionCode || '').toUpperCase()]
    );
    const jurisdiction = rows.rows[0];
    if (!jurisdiction) {
      res.json({ taxRatePercent: 0, taxAmount: 0, total: parsedAmount, jurisdiction: null });
      return;
    }
    const rate = Number(jurisdiction.tax_rate_percent || 0);
    const taxAmount = Number(((parsedAmount * rate) / 100).toFixed(2));
    res.json({
      taxRatePercent: rate,
      taxAmount,
      total: Number((parsedAmount + taxAmount).toFixed(2)),
      jurisdiction,
    });
  } catch (error) {
    next(error);
  }
}

async function listPayrollCompliancePlus(_req, res, next) {
  try {
    const [scheduleRes, componentRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_payroll_schedules ORDER BY next_pay_date ASC, id ASC`),
      pool.query(`SELECT * FROM finance_payroll_components ORDER BY component_type ASC, component_name ASC`),
    ]);
    res.json({ schedules: scheduleRes.rows, components: componentRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createPayrollSchedule(req, res, next) {
  const client = await pool.connect();
  try {
    const { scheduleName, frequency = 'MONTHLY', nextPayDate, active = true } = req.body || {};
    if (!String(scheduleName || '').trim()) throw new ApiError(400, 'scheduleName is required');
    if (!nextPayDate) throw new ApiError(400, 'nextPayDate is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payroll_schedules
       (schedule_name, frequency, next_pay_date, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [String(scheduleName).trim(), String(frequency).toUpperCase(), nextPayDate, Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ schedule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPayrollComponent(req, res, next) {
  const client = await pool.connect();
  try {
    const { componentName, componentType = 'EARNING', calcType = 'PERCENT', defaultValue = 0, active = true } = req.body || {};
    if (!String(componentName || '').trim()) throw new ApiError(400, 'componentName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payroll_components
       (component_name, component_type, calc_type, default_value, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [String(componentName).trim(), String(componentType).toUpperCase(), String(calcType).toUpperCase(), Number(defaultValue || 0), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ component: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listArApOps(_req, res, next) {
  try {
    const [disputesRes, memoRes, refundRes] = await Promise.all([
      pool.query(
        `SELECT d.*, i.invoice_number, a.customer_name
         FROM finance_ar_disputes d
         JOIN finance_invoices i ON i.id = d.invoice_id
         JOIN customer_accounts a ON a.id = d.account_id
         ORDER BY d.raised_at DESC, d.id DESC`
      ),
      pool.query(
        `SELECT m.*, i.invoice_number, a.customer_name
         FROM finance_credit_memos m
         LEFT JOIN finance_invoices i ON i.id = m.invoice_id
         JOIN customer_accounts a ON a.id = m.account_id
         ORDER BY m.updated_at DESC, m.id DESC`
      ),
      pool.query(
        `SELECT r.*, m.memo_number, p.name AS payment_account_name
         FROM finance_refunds r
         JOIN finance_credit_memos m ON m.id = r.credit_memo_id
         LEFT JOIN payment_accounts p ON p.id = r.payment_account_id
         ORDER BY r.created_at DESC, r.id DESC`
      ),
    ]);
    res.json({ disputes: disputesRes.rows, creditMemos: memoRes.rows, refunds: refundRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createArDispute(req, res, next) {
  const client = await pool.connect();
  try {
    const { invoiceId, disputeReason } = req.body || {};
    if (!String(disputeReason || '').trim()) throw new ApiError(400, 'disputeReason is required');
    await client.query('BEGIN');
    const inv = await client.query(`SELECT id, account_id FROM finance_invoices WHERE id = $1`, [toInt(invoiceId, 'invoiceId')]);
    if (!inv.rows[0]) throw new ApiError(404, 'Invoice not found');
    const { rows } = await client.query(
      `INSERT INTO finance_ar_disputes
       (invoice_id, account_id, dispute_reason, status, raised_by, raised_at)
       VALUES ($1, $2, $3, 'OPEN', $4, NOW())
       RETURNING *`,
      [inv.rows[0].id, inv.rows[0].account_id, String(disputeReason).trim(), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ dispute: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createCreditMemo(req, res, next) {
  const client = await pool.connect();
  try {
    const { invoiceId = null, accountId, amount = 0, reason = '' } = req.body || {};
    const parsedAmount = Number(amount || 0);
    if (!(parsedAmount > 0)) throw new ApiError(400, 'amount must be > 0');
    await client.query('BEGIN');
    const memoNumber = `CM-${Date.now()}`;
    let resolvedAccountId = toInt(accountId, 'accountId');
    if (invoiceId) {
      const inv = await client.query(`SELECT account_id FROM finance_invoices WHERE id = $1`, [toInt(invoiceId, 'invoiceId')]);
      if (!inv.rows[0]) throw new ApiError(404, 'Invoice not found');
      resolvedAccountId = inv.rows[0].account_id;
    }
    const { rows } = await client.query(
      `INSERT INTO finance_credit_memos
       (memo_number, invoice_id, account_id, amount, reason, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, NOW(), NOW())
       RETURNING *`,
      [memoNumber, invoiceId ? toInt(invoiceId, 'invoiceId') : null, resolvedAccountId, parsedAmount, reason || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ creditMemo: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createRefund(req, res, next) {
  const client = await pool.connect();
  try {
    const { creditMemoId, amount = 0, refundDate = null, paymentAccountId = null, referenceNo = '' } = req.body || {};
    const parsedAmount = Number(amount || 0);
    if (!(parsedAmount > 0)) throw new ApiError(400, 'amount must be > 0');
    await client.query('BEGIN');
    const memoId = toInt(creditMemoId, 'creditMemoId');
    const memoRes = await client.query(`SELECT * FROM finance_credit_memos WHERE id = $1 FOR UPDATE`, [memoId]);
    const memo = memoRes.rows[0];
    if (!memo) throw new ApiError(404, 'Credit memo not found');
    if (parsedAmount > Number(memo.amount || 0)) throw new ApiError(400, 'Refund amount exceeds credit memo amount');
    const { rows } = await client.query(
      `INSERT INTO finance_refunds
       (credit_memo_id, refund_date, amount, payment_account_id, reference_no, created_by, created_at)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, NOW())
       RETURNING *`,
      [memoId, refundDate, parsedAmount, paymentAccountId ? toInt(paymentAccountId, 'paymentAccountId') : null, referenceNo || null, req.user.id]
    );
    await client.query(`UPDATE finance_credit_memos SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1`, [memoId]);
    await client.query('COMMIT');
    res.status(201).json({ refund: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPhase2Overview(_req, res, next) {
  try {
    const [
      mcRes,
      settleRes,
      assetEventRes,
      wsRes,
      taskRes,
      adjRes,
      filingRes,
    ] = await Promise.all([
      pool.query(`SELECT * FROM finance_multi_currency_ledger ORDER BY entry_date DESC, id DESC LIMIT 500`),
      pool.query(`SELECT * FROM finance_fx_settlement_runs ORDER BY settlement_date DESC, id DESC LIMIT 200`),
      pool.query(`SELECT e.*, a.asset_name FROM finance_fixed_asset_events e JOIN finance_fixed_assets a ON a.id = e.asset_id ORDER BY e.event_date DESC, e.id DESC LIMIT 200`),
      pool.query(`SELECT w.*, u.full_name AS owner_name FROM finance_month_end_workspaces w LEFT JOIN users u ON u.id = w.owner_id ORDER BY w.period_month DESC, w.id DESC LIMIT 48`),
      pool.query(`SELECT t.*, u.full_name AS assignee_name FROM finance_month_end_tasks t LEFT JOIN users u ON u.id = t.assigned_to ORDER BY t.updated_at DESC, t.id DESC LIMIT 500`),
      pool.query(`SELECT a.*, d.name AS debit_name, c.name AS credit_name, u1.full_name AS requested_name, u2.full_name AS approved_name FROM finance_adjusting_entries a LEFT JOIN finance_chart_of_accounts d ON d.id = a.debit_account_id LEFT JOIN finance_chart_of_accounts c ON c.id = a.credit_account_id LEFT JOIN users u1 ON u1.id = a.requested_by LEFT JOIN users u2 ON u2.id = a.approved_by ORDER BY a.updated_at DESC, a.id DESC LIMIT 500`),
      pool.query(`SELECT * FROM finance_filing_calendar ORDER BY due_date ASC, id DESC LIMIT 500`),
    ]);
    res.json({
      multiCurrencyEntries: mcRes.rows,
      fxSettlements: settleRes.rows,
      fixedAssetEvents: assetEventRes.rows,
      monthEndWorkspaces: wsRes.rows,
      monthEndTasks: taskRes.rows,
      adjustingEntries: adjRes.rows,
      filingCalendar: filingRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function createMultiCurrencyEntry(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      sourceType = 'JOURNAL',
      sourceId = null,
      entrySide = 'DEBIT',
      currencyCode = 'USD',
      amountForeign = 0,
      fxRateToUsd = 1,
      entryDate = null,
      realized = false,
    } = req.body || {};
    if (!(Number(amountForeign || 0) > 0)) throw new ApiError(400, 'amountForeign must be > 0');
    if (!(Number(fxRateToUsd || 0) > 0)) throw new ApiError(400, 'fxRateToUsd must be > 0');
    const amountBase = Number((Number(amountForeign) * Number(fxRateToUsd)).toFixed(2));
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_multi_currency_ledger
       (source_type, source_id, entry_side, currency_code, amount_foreign, fx_rate_to_usd, amount_base, entry_date, realized, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_DATE), $9, $10, NOW())
       RETURNING *`,
      [
        String(sourceType).toUpperCase(),
        sourceId ? Number(sourceId) : null,
        String(entrySide).toUpperCase(),
        String(currencyCode).toUpperCase(),
        Number(amountForeign),
        Number(fxRateToUsd),
        amountBase,
        entryDate,
        Boolean(realized),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    await addFinanceAudit('MULTICURRENCY', 'CREATE_ENTRY', 'MC_ENTRY', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ entry: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runFxSettlement(req, res, next) {
  const client = await pool.connect();
  try {
    const { currencyCode, settlementDate, amountForeign, bookedRate, settlementRate } = req.body || {};
    if (!currencyCode || !settlementDate) throw new ApiError(400, 'currencyCode and settlementDate are required');
    const af = Number(amountForeign || 0);
    const br = Number(bookedRate || 0);
    const sr = Number(settlementRate || 0);
    if (!(af > 0 && br > 0 && sr > 0)) throw new ApiError(400, 'amountForeign, bookedRate, settlementRate must be > 0');
    const realizedGainLoss = Number((af * (sr - br)).toFixed(2));
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_fx_settlement_runs
       (currency_code, settlement_date, amount_foreign, booked_rate, settlement_rate, realized_gain_loss, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [String(currencyCode).toUpperCase(), settlementDate, af, br, sr, realizedGainLoss, req.user.id]
    );
    await client.query('COMMIT');
    await addFinanceAudit('FX', 'RUN_SETTLEMENT', 'FX_SETTLEMENT', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ settlement: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createFixedAssetEvent(req, res, next) {
  const client = await pool.connect();
  try {
    const { assetId, eventType, eventDate = null, amount = 0, note = '' } = req.body || {};
    const parsedAssetId = toInt(assetId, 'assetId');
    const parsedAmount = Number(amount || 0);
    if (parsedAmount < 0) throw new ApiError(400, 'amount must be >= 0');
    const type = String(eventType || '').toUpperCase();
    if (!['DISPOSAL', 'IMPAIRMENT', 'TRANSFER'].includes(type)) throw new ApiError(400, 'Invalid eventType');
    await client.query('BEGIN');
    const assetRes = await client.query(`SELECT * FROM finance_fixed_assets WHERE id = $1 FOR UPDATE`, [parsedAssetId]);
    const asset = assetRes.rows[0];
    if (!asset) throw new ApiError(404, 'Fixed asset not found');
    const { rows } = await client.query(
      `INSERT INTO finance_fixed_asset_events
       (asset_id, event_type, event_date, amount, note, created_by, created_at)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, NOW())
       RETURNING *`,
      [parsedAssetId, type, eventDate, parsedAmount, note || null, req.user.id]
    );
    if (type === 'IMPAIRMENT' && parsedAmount > 0) {
      await client.query(
        `UPDATE finance_fixed_assets
         SET net_book_value = GREATEST(net_book_value - $1, 0), updated_at = NOW()
         WHERE id = $2`,
        [parsedAmount, parsedAssetId]
      );
    }
    if (type === 'DISPOSAL') {
      await client.query(`UPDATE finance_fixed_assets SET status = 'DISPOSED', updated_at = NOW() WHERE id = $1`, [parsedAssetId]);
    }
    await client.query('COMMIT');
    await addFinanceAudit('FIXED_ASSETS', 'CREATE_EVENT', 'FIXED_ASSET_EVENT', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ event: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createMonthEndWorkspace(req, res, next) {
  const client = await pool.connect();
  try {
    const { periodMonth, ownerId = null, notes = '' } = req.body || {};
    if (!periodMonth) throw new ApiError(400, 'periodMonth is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_month_end_workspaces
       (period_month, status, owner_id, notes, created_by, created_at, updated_at)
       VALUES (date_trunc('month', $1::date)::date, 'OPEN', $2, $3, $4, NOW(), NOW())
       ON CONFLICT (period_month)
       DO UPDATE SET owner_id = EXCLUDED.owner_id, notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [periodMonth, ownerId ? Number(ownerId) : null, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ workspace: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createMonthEndTask(req, res, next) {
  const client = await pool.connect();
  try {
    const { workspaceId, taskName, assignedTo = null, dueDate = null } = req.body || {};
    if (!String(taskName || '').trim()) throw new ApiError(400, 'taskName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_month_end_tasks
       (workspace_id, task_name, status, assigned_to, due_date, created_by, created_at, updated_at)
       VALUES ($1, $2, 'OPEN', $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [toInt(workspaceId, 'workspaceId'), String(taskName).trim(), assignedTo ? Number(assignedTo) : null, dueDate, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ task: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateMonthEndTaskStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const taskId = toInt(req.params.id, 'task id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['OPEN', 'IN_PROGRESS', 'DONE'].includes(status)) throw new ApiError(400, 'Invalid status');
    await client.query('BEGIN');
    await client.query(`UPDATE finance_month_end_tasks SET status = $1, updated_at = NOW() WHERE id = $2`, [status, taskId]);
    const { rows } = await client.query(`SELECT * FROM finance_month_end_tasks WHERE id = $1`, [taskId]);
    await client.query('COMMIT');
    res.json({ task: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createAdjustingEntry(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      workspaceId,
      entryDate = null,
      description,
      debitAccountId = null,
      creditAccountId = null,
      amount = 0,
    } = req.body || {};
    if (!String(description || '').trim()) throw new ApiError(400, 'description is required');
    const parsedAmount = Number(amount || 0);
    if (!(parsedAmount > 0)) throw new ApiError(400, 'amount must be > 0');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_adjusting_entries
       (workspace_id, entry_date, description, debit_account_id, credit_account_id, amount, status, requested_by, created_at, updated_at)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, 'PENDING', $7, NOW(), NOW())
       RETURNING *`,
      [toInt(workspaceId, 'workspaceId'), entryDate, String(description).trim(), debitAccountId ? Number(debitAccountId) : null, creditAccountId ? Number(creditAccountId) : null, parsedAmount, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ adjustingEntry: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function decideAdjustingEntry(req, res, next) {
  const client = await pool.connect();
  try {
    const entryId = toInt(req.params.id, 'entry id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'POSTED'].includes(status)) throw new ApiError(400, 'Invalid status');
    await client.query('BEGIN');
    await client.query(
      `UPDATE finance_adjusting_entries
       SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [status, req.user.id, entryId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_adjusting_entries WHERE id = $1`, [entryId]);
    await client.query('COMMIT');
    res.json({ adjustingEntry: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createFilingCalendar(req, res, next) {
  const client = await pool.connect();
  try {
    const { filingType = 'OTHER', authority, periodLabel, dueDate, amountDue = 0 } = req.body || {};
    if (!String(authority || '').trim()) throw new ApiError(400, 'authority is required');
    if (!String(periodLabel || '').trim()) throw new ApiError(400, 'periodLabel is required');
    if (!dueDate) throw new ApiError(400, 'dueDate is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_filing_calendar
       (filing_type, authority, period_label, due_date, status, amount_due, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, NOW(), NOW())
       RETURNING *`,
      [String(filingType).toUpperCase(), String(authority).trim(), String(periodLabel).trim(), dueDate, Number(amountDue || 0), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ filing: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateFilingCalendarStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const filingId = toInt(req.params.id, 'filing id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['PENDING', 'PREPARED', 'FILED', 'PAID', 'LATE'].includes(status)) throw new ApiError(400, 'Invalid status');
    await client.query('BEGIN');
    await client.query(`UPDATE finance_filing_calendar SET status = $1, updated_at = NOW() WHERE id = $2`, [status, filingId]);
    const { rows } = await client.query(`SELECT * FROM finance_filing_calendar WHERE id = $1`, [filingId]);
    await client.query('COMMIT');
    res.json({ filing: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listMaturityAutomation(_req, res, next) {
  try {
    const [jobsRes, retryRes, taxRes, batchRes, intentRes, allocRes, campRes, dunningRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_ops_jobs ORDER BY created_at DESC, id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_bank_feed_retry_queue ORDER BY updated_at DESC, id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_tax_returns ORDER BY period_end DESC, id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_payroll_filing_batches ORDER BY created_at DESC, id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_payment_intents ORDER BY created_at DESC, id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_payment_allocations ORDER BY created_at DESC, id DESC LIMIT 500`),
      pool.query(`SELECT * FROM finance_dunning_campaigns ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT dr.*, dc.campaign_name FROM finance_dunning_runs dr JOIN finance_dunning_campaigns dc ON dc.id = dr.campaign_id ORDER BY dr.created_at DESC, dr.id DESC LIMIT 200`),
    ]);
    res.json({
      jobs: jobsRes.rows,
      retryQueue: retryRes.rows,
      taxReturns: taxRes.rows,
      payrollBatches: batchRes.rows,
      paymentIntents: intentRes.rows,
      paymentAllocations: allocRes.rows,
      dunningCampaigns: campRes.rows,
      dunningRuns: dunningRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function createOpsJob(req, res, next) {
  const client = await pool.connect();
  try {
    const { jobType, payload = {} } = req.body || {};
    if (!String(jobType || '').trim()) throw new ApiError(400, 'jobType is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_ops_jobs (job_type, status, payload_json, result_json, attempts, created_by, created_at)
       VALUES ($1, 'QUEUED', $2::jsonb, '{}'::jsonb, 0, $3, NOW())
       RETURNING *`,
      [String(jobType).toUpperCase(), JSON.stringify(payload || {}), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ job: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runOpsJob(req, res, next) {
  const client = await pool.connect();
  try {
    const jobId = toInt(req.params.id, 'job id');
    await client.query('BEGIN');
    const jobRes = await client.query(`SELECT * FROM finance_ops_jobs WHERE id = $1 FOR UPDATE`, [jobId]);
    const job = jobRes.rows[0];
    if (!job) throw new ApiError(404, 'Ops job not found');
    const attempts = Number(job.attempts || 0) + 1;
    await client.query(`UPDATE finance_ops_jobs SET status='RUNNING', attempts=$1, started_at=NOW() WHERE id = $2`, [attempts, jobId]);
    let result = { ok: true, jobType: job.job_type };
    if (job.job_type === 'BANK_FEED_RETRY_SWEEP') {
      const pending = await client.query(`SELECT id FROM finance_bank_feed_retry_queue WHERE status='PENDING' LIMIT 50`);
      for (const row of pending.rows) {
        await client.query(`UPDATE finance_bank_feed_retry_queue SET status='DONE', attempts=attempts+1, updated_at=NOW() WHERE id=$1`, [row.id]);
      }
      result = { ok: true, processedRetries: pending.rows.length };
    }
    await client.query(
      `UPDATE finance_ops_jobs
       SET status='COMPLETED', completed_at=NOW(), result_json=$1::jsonb
       WHERE id = $2`,
      [JSON.stringify(result), jobId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_ops_jobs WHERE id=$1`, [jobId]);
    await client.query('COMMIT');
    res.json({ job: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function queueBankFeedRetry(req, res, next) {
  const client = await pool.connect();
  try {
    const { importRunId, reason = '' } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_bank_feed_retry_queue
       (import_run_id, status, reason, attempts, created_by, created_at, updated_at)
       VALUES ($1, 'PENDING', $2, 0, $3, NOW(), NOW())
       RETURNING *`,
      [toInt(importRunId, 'importRunId'), reason || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ retry: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runBankFeedRetry(req, res, next) {
  const client = await pool.connect();
  try {
    const retryId = toInt(req.params.id, 'retry id');
    await client.query('BEGIN');
    const retryRes = await client.query(`SELECT * FROM finance_bank_feed_retry_queue WHERE id=$1 FOR UPDATE`, [retryId]);
    const retry = retryRes.rows[0];
    if (!retry) throw new ApiError(404, 'Retry record not found');
    await client.query(`UPDATE finance_bank_feed_retry_queue SET status='RUNNING', attempts=attempts+1, updated_at=NOW() WHERE id=$1`, [retryId]);
    await client.query(`UPDATE finance_bank_feed_import_runs SET run_status='COMPLETED', completed_at=NOW() WHERE id=$1`, [retry.import_run_id]);
    await client.query(`UPDATE finance_bank_feed_retry_queue SET status='DONE', updated_at=NOW() WHERE id=$1`, [retryId]);
    const { rows } = await client.query(`SELECT * FROM finance_bank_feed_retry_queue WHERE id=$1`, [retryId]);
    await client.query('COMMIT');
    res.json({ retry: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createTaxReturn(req, res, next) {
  const client = await pool.connect();
  try {
    const { filingType = 'SALES_TAX', authority, periodStart, periodEnd } = req.body || {};
    if (!authority || !periodStart || !periodEnd) throw new ApiError(400, 'authority, periodStart and periodEnd are required');
    await client.query('BEGIN');
    let taxableAmount = 0;
    let taxDue = 0;
    if (String(filingType).toUpperCase() === 'SALES_TAX') {
      const invRes = await client.query(
        `SELECT COALESCE(SUM(subtotal),0) AS taxable, COALESCE(SUM(tax_total),0) AS tax_due
         FROM finance_invoices
         WHERE issue_date BETWEEN $1 AND $2`,
        [periodStart, periodEnd]
      );
      taxableAmount = Number(invRes.rows[0]?.taxable || 0);
      taxDue = Number(invRes.rows[0]?.tax_due || 0);
    } else if (String(filingType).toUpperCase() === 'PAYROLL_TAX') {
      const payRes = await client.query(
        `SELECT COALESCE(SUM(total_gross),0) AS taxable, COALESCE(SUM(total_tax),0) AS tax_due
         FROM finance_payroll_runs
         WHERE period_start >= $1 AND period_end <= $2`,
        [periodStart, periodEnd]
      );
      taxableAmount = Number(payRes.rows[0]?.taxable || 0);
      taxDue = Number(payRes.rows[0]?.tax_due || 0);
    }
    const { rows } = await client.query(
      `INSERT INTO finance_tax_returns
       (filing_type, authority, period_start, period_end, taxable_amount, tax_due, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PREPARED', NOW(), NOW())
       RETURNING *`,
      [String(filingType).toUpperCase(), String(authority), periodStart, periodEnd, taxableAmount, taxDue]
    );
    await client.query('COMMIT');
    res.status(201).json({ taxReturn: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateTaxReturnStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const taxReturnId = toInt(req.params.id, 'tax return id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['DRAFT', 'PREPARED', 'FILED', 'PAID', 'VOID'].includes(status)) throw new ApiError(400, 'Invalid status');
    await client.query('BEGIN');
    const cols = [];
    if (status === 'PREPARED') cols.push(`prepared_by = ${Number(req.user.id)}`, `prepared_at = NOW()`);
    if (status === 'FILED') cols.push(`filed_by = ${Number(req.user.id)}`, `filed_at = NOW()`);
    if (status === 'PAID') cols.push(`paid_by = ${Number(req.user.id)}`, `paid_at = NOW()`);
    await client.query(
      `UPDATE finance_tax_returns
       SET status = $1, updated_at = NOW()${cols.length ? `, ${cols.join(', ')}` : ''}
       WHERE id = $2`,
      [status, taxReturnId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_tax_returns WHERE id = $1`, [taxReturnId]);
    await client.query('COMMIT');
    res.json({ taxReturn: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPayrollBatch(req, res, next) {
  const client = await pool.connect();
  try {
    const { periodLabel, filingAuthority } = req.body || {};
    if (!periodLabel || !filingAuthority) throw new ApiError(400, 'periodLabel and filingAuthority are required');
    await client.query('BEGIN');
    const agg = await client.query(
      `SELECT COUNT(*) AS run_count, COALESCE(SUM(total_gross),0) AS gross, COALESCE(SUM(total_tax),0) AS tax, COALESCE(SUM(total_net),0) AS net
       FROM finance_payroll_runs
       WHERE run_label ILIKE ('%' || $1 || '%')`,
      [String(periodLabel)]
    );
    const { rows } = await client.query(
      `INSERT INTO finance_payroll_filing_batches
       (period_label, filing_authority, run_count, gross_amount, tax_amount, net_amount, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PREPARED', $7, NOW(), NOW())
       RETURNING *`,
      [
        String(periodLabel),
        String(filingAuthority),
        Number(agg.rows[0]?.run_count || 0),
        Number(agg.rows[0]?.gross || 0),
        Number(agg.rows[0]?.tax || 0),
        Number(agg.rows[0]?.net || 0),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ payrollBatch: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPaymentIntent(req, res, next) {
  const client = await pool.connect();
  try {
    const { entityType, entityId, intendedAmount, paymentDate = null, currencyCode = 'USD' } = req.body || {};
    if (!entityType || !entityId || !(Number(intendedAmount || 0) > 0)) throw new ApiError(400, 'entityType, entityId and intendedAmount are required');
    await client.query('BEGIN');
    let accountId = null;
    let vendorId = null;
    const type = String(entityType).toUpperCase();
    if (type === 'INVOICE') {
      const inv = await client.query(`SELECT account_id FROM finance_invoices WHERE id = $1`, [toInt(entityId, 'entityId')]);
      accountId = inv.rows[0]?.account_id || null;
    } else if (type === 'BILL') {
      const bill = await client.query(`SELECT vendor_id FROM finance_bills WHERE id = $1`, [toInt(entityId, 'entityId')]);
      vendorId = bill.rows[0]?.vendor_id || null;
    } else {
      throw new ApiError(400, 'entityType must be INVOICE or BILL');
    }
    const { rows } = await client.query(
      `INSERT INTO finance_payment_intents
       (entity_type, entity_id, account_id, vendor_id, intended_amount, currency_code, payment_date, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), 'PENDING', $8, NOW(), NOW())
       RETURNING *`,
      [type, toInt(entityId, 'entityId'), accountId, vendorId, Number(intendedAmount), String(currencyCode).toUpperCase(), paymentDate, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ paymentIntent: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function autoApplyPaymentIntent(req, res, next) {
  const client = await pool.connect();
  try {
    const intentId = toInt(req.params.id, 'payment intent id');
    await client.query('BEGIN');
    const intentRes = await client.query(`SELECT * FROM finance_payment_intents WHERE id = $1 FOR UPDATE`, [intentId]);
    const intent = intentRes.rows[0];
    if (!intent) throw new ApiError(404, 'Payment intent not found');
    const amount = Number(intent.intended_amount || 0);
    await client.query(
      `INSERT INTO finance_payment_allocations
       (payment_intent_id, entity_type, entity_id, applied_amount, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [intentId, intent.entity_type, intent.entity_id, amount]
    );
    if (intent.entity_type === 'INVOICE') {
      const invRes = await client.query(`SELECT total FROM finance_invoices WHERE id = $1`, [intent.entity_id]);
      const total = Number(invRes.rows[0]?.total || 0);
      const status = amount >= total ? 'PAID' : 'PARTIAL';
      await client.query(`UPDATE finance_invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [status, intent.entity_id]);
      await client.query(`UPDATE finance_payment_intents SET status = $1, updated_at = NOW() WHERE id = $2`, [status === 'PAID' ? 'APPLIED' : 'PARTIAL', intentId]);
    } else {
      const billRes = await client.query(`SELECT total FROM finance_bills WHERE id = $1`, [intent.entity_id]);
      const total = Number(billRes.rows[0]?.total || 0);
      const status = amount >= total ? 'PAID' : 'PARTIAL';
      await client.query(`UPDATE finance_bills SET status = $1, updated_at = NOW() WHERE id = $2`, [status, intent.entity_id]);
      await client.query(`UPDATE finance_payment_intents SET status = $1, updated_at = NOW() WHERE id = $2`, [status === 'PAID' ? 'APPLIED' : 'PARTIAL', intentId]);
    }
    const { rows } = await client.query(`SELECT * FROM finance_payment_intents WHERE id = $1`, [intentId]);
    await client.query('COMMIT');
    res.json({ paymentIntent: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createDunningCampaign(req, res, next) {
  const client = await pool.connect();
  try {
    const { campaignName, minOverdueDays = 7, reminderChannel = 'EMAIL', active = true } = req.body || {};
    if (!campaignName) throw new ApiError(400, 'campaignName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_dunning_campaigns
       (campaign_name, min_overdue_days, reminder_channel, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (campaign_name)
       DO UPDATE SET min_overdue_days = EXCLUDED.min_overdue_days,
                     reminder_channel = EXCLUDED.reminder_channel,
                     active = EXCLUDED.active,
                     updated_at = NOW()
       RETURNING *`,
      [String(campaignName), Number(minOverdueDays || 7), String(reminderChannel).toUpperCase(), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ campaign: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runDunningCampaign(req, res, next) {
  const client = await pool.connect();
  try {
    const campaignId = toInt(req.params.id, 'campaign id');
    await client.query('BEGIN');
    const campRes = await client.query(`SELECT * FROM finance_dunning_campaigns WHERE id=$1`, [campaignId]);
    const campaign = campRes.rows[0];
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    const overdueRes = await client.query(
      `SELECT id, account_id, total, due_date
       FROM finance_invoices
       WHERE status IN ('SENT', 'PARTIAL')
         AND due_date IS NOT NULL
         AND due_date <= (CURRENT_DATE - $1::int)`,
      [Number(campaign.min_overdue_days || 7)]
    );
    const runRes = await client.query(
      `INSERT INTO finance_dunning_runs (campaign_id, run_date, targeted_count, status, created_by, created_at)
       VALUES ($1, CURRENT_DATE, 0, 'COMPLETED', $2, NOW())
       RETURNING *`,
      [campaignId, req.user.id]
    );
    let targeted = 0;
    for (const inv of overdueRes.rows) {
      const days = Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)));
      const level = days >= 30 ? 'FINAL' : days >= 15 ? 'FIRM' : 'SOFT';
      await client.query(
        `INSERT INTO finance_dunning_run_items
         (run_id, invoice_id, account_id, days_overdue, balance_due, reminder_level, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [runRes.rows[0].id, inv.id, inv.account_id, days, Number(inv.total || 0), level]
      );
      targeted += 1;
    }
    await client.query(`UPDATE finance_dunning_runs SET targeted_count = $1 WHERE id = $2`, [targeted, runRes.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ run: { ...runRes.rows[0], targeted_count: targeted } });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listFinalParityOverview(_req, res, next) {
  try {
    const [connections, syncRuns, gateways, links, txns, chargebacks, templates, dispatchLogs, clients, access, exceptions, taxRules, payrollRules] = await Promise.all([
      pool.query(`SELECT * FROM finance_bank_provider_connections ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT r.*, c.connector_label FROM finance_bank_sync_runs r JOIN finance_bank_provider_connections c ON c.id = r.connection_id ORDER BY r.started_at DESC, r.id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_payment_gateways ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT l.*, g.gateway_name FROM finance_payment_links l LEFT JOIN finance_payment_gateways g ON g.id = l.gateway_id ORDER BY l.updated_at DESC, l.id DESC LIMIT 300`),
      pool.query(`SELECT t.*, g.gateway_name FROM finance_payment_transactions t LEFT JOIN finance_payment_gateways g ON g.id = t.gateway_id ORDER BY t.processed_at DESC, t.id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_chargebacks ORDER BY opened_at DESC, id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_document_templates ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT d.*, t.template_name FROM finance_document_dispatch_logs d LEFT JOIN finance_document_templates t ON t.id = d.template_id ORDER BY d.sent_at DESC, d.id DESC LIMIT 400`),
      pool.query(`SELECT * FROM finance_practice_clients ORDER BY created_at DESC, id DESC`),
      pool.query(`SELECT a.*, c.client_name, u.full_name FROM finance_practice_access a JOIN finance_practice_clients c ON c.id = a.client_id JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC, a.id DESC`),
      pool.query(`SELECT e.*, u1.full_name AS requested_name, u2.full_name AS approved_name FROM finance_period_exception_approvals e LEFT JOIN users u1 ON u1.id = e.requested_by LEFT JOIN users u2 ON u2.id = e.approved_by ORDER BY e.requested_at DESC, e.id DESC LIMIT 300`),
      pool.query(`SELECT * FROM finance_tax_rule_sets ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT * FROM finance_payroll_rule_sets ORDER BY updated_at DESC, id DESC`),
    ]);
    res.json({
      bankProviderConnections: connections.rows,
      bankSyncRuns: syncRuns.rows,
      paymentGateways: gateways.rows,
      paymentLinks: links.rows,
      paymentTransactions: txns.rows,
      chargebacks: chargebacks.rows,
      documentTemplates: templates.rows,
      documentDispatchLogs: dispatchLogs.rows,
      practiceClients: clients.rows,
      practiceAccess: access.rows,
      periodExceptions: exceptions.rows,
      taxRuleSets: taxRules.rows,
      payrollRuleSets: payrollRules.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function createBankProviderConnection(req, res, next) {
  const client = await pool.connect();
  try {
    const { providerName, connectorLabel, authMode = 'OAUTH2', token = {}, status = 'ACTIVE' } = req.body || {};
    if (!providerName || !connectorLabel) throw new ApiError(400, 'providerName and connectorLabel are required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_bank_provider_connections
       (provider_name, connector_label, auth_mode, token_json, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW())
       RETURNING *`,
      [String(providerName), String(connectorLabel), String(authMode).toUpperCase(), JSON.stringify(token || {}), String(status).toUpperCase(), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ connection: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runBankProviderSync(req, res, next) {
  const client = await pool.connect();
  try {
    const connectionId = toInt(req.params.id, 'connection id');
    const webhookEventRef = String(req.body?.webhookEventRef || '');
    await client.query('BEGIN');
    const connRes = await client.query(`SELECT * FROM finance_bank_provider_connections WHERE id=$1 FOR UPDATE`, [connectionId]);
    if (!connRes.rows[0]) throw new ApiError(404, 'Connection not found');
    const importedCount = Number(req.body?.importedCount || 0);
    const failedCount = Number(req.body?.failedCount || 0);
    const { rows } = await client.query(
      `INSERT INTO finance_bank_sync_runs
       (connection_id, run_status, imported_count, failed_count, webhook_event_ref, started_at, completed_at, created_by)
       VALUES ($1, 'COMPLETED', $2, $3, $4, NOW(), NOW(), $5)
       RETURNING *`,
      [connectionId, importedCount, failedCount, webhookEventRef || null, req.user.id]
    );
    await client.query(`UPDATE finance_bank_provider_connections SET last_synced_at = NOW(), updated_at = NOW() WHERE id=$1`, [connectionId]);
    await client.query('COMMIT');
    res.status(201).json({ syncRun: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPaymentGateway(req, res, next) {
  const client = await pool.connect();
  try {
    const { gatewayName, provider, config = {}, active = true } = req.body || {};
    if (!gatewayName || !provider) throw new ApiError(400, 'gatewayName and provider are required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payment_gateways
       (gateway_name, provider, config_json, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), NOW())
       ON CONFLICT (gateway_name)
       DO UPDATE SET provider = EXCLUDED.provider, config_json = EXCLUDED.config_json, active = EXCLUDED.active, updated_at = NOW()
       RETURNING *`,
      [String(gatewayName), String(provider), JSON.stringify(config || {}), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ gateway: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPaymentLink(req, res, next) {
  const client = await pool.connect();
  try {
    const { entityType, entityId, gatewayId = null, amount, currencyCode = 'USD', expiresAt = null } = req.body || {};
    if (!entityType || !entityId || !(Number(amount || 0) > 0)) throw new ApiError(400, 'entityType, entityId, amount are required');
    const linkCode = `PL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payment_links
       (entity_type, entity_id, gateway_id, link_code, amount, currency_code, status, expires_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8, NOW(), NOW())
       RETURNING *`,
      [String(entityType).toUpperCase(), toInt(entityId, 'entityId'), gatewayId ? Number(gatewayId) : null, linkCode, Number(amount), String(currencyCode).toUpperCase(), expiresAt, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ paymentLink: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function capturePaymentLink(req, res, next) {
  const client = await pool.connect();
  try {
    const linkId = toInt(req.params.id, 'payment link id');
    await client.query('BEGIN');
    const linkRes = await client.query(`SELECT * FROM finance_payment_links WHERE id=$1 FOR UPDATE`, [linkId]);
    const link = linkRes.rows[0];
    if (!link) throw new ApiError(404, 'Payment link not found');
    if (link.status !== 'OPEN') throw new ApiError(409, 'Payment link is not open');
    const txRef = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const tx = await client.query(
      `INSERT INTO finance_payment_transactions
       (payment_link_id, gateway_id, transaction_ref, amount, status, processed_at, created_by)
       VALUES ($1, $2, $3, $4, 'SUCCESS', NOW(), $5)
       RETURNING *`,
      [linkId, link.gateway_id, txRef, Number(link.amount), req.user.id]
    );
    await client.query(`UPDATE finance_payment_links SET status='PAID', updated_at=NOW() WHERE id=$1`, [linkId]);
    if (link.entity_type === 'INVOICE') {
      await client.query(`UPDATE finance_invoices SET status='PAID', updated_at=NOW() WHERE id=$1`, [link.entity_id]);
    } else if (link.entity_type === 'BILL') {
      await client.query(`UPDATE finance_bills SET status='PAID', updated_at=NOW() WHERE id=$1`, [link.entity_id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ transaction: tx.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createChargeback(req, res, next) {
  const client = await pool.connect();
  try {
    const { paymentTransactionId, amount, reason = '' } = req.body || {};
    if (!paymentTransactionId || !(Number(amount || 0) > 0)) throw new ApiError(400, 'paymentTransactionId and amount are required');
    await client.query('BEGIN');
    const txId = toInt(paymentTransactionId, 'paymentTransactionId');
    const { rows } = await client.query(
      `INSERT INTO finance_chargebacks
       (payment_transaction_id, amount, reason, status, opened_at, created_by)
       VALUES ($1, $2, $3, 'OPEN', NOW(), $4)
       RETURNING *`,
      [txId, Number(amount), reason || null, req.user.id]
    );
    await client.query(`UPDATE finance_payment_transactions SET status='CHARGEBACK' WHERE id=$1`, [txId]);
    await client.query('COMMIT');
    res.status(201).json({ chargeback: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createDocumentTemplate(req, res, next) {
  const client = await pool.connect();
  try {
    const { templateName, documentType, subjectTemplate = '', bodyTemplate, active = true } = req.body || {};
    if (!templateName || !documentType || !bodyTemplate) throw new ApiError(400, 'templateName, documentType, bodyTemplate are required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_document_templates
       (template_name, document_type, subject_template, body_template, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (template_name)
       DO UPDATE SET document_type = EXCLUDED.document_type,
                     subject_template = EXCLUDED.subject_template,
                     body_template = EXCLUDED.body_template,
                     active = EXCLUDED.active,
                     updated_at = NOW()
       RETURNING *`,
      [String(templateName), String(documentType).toUpperCase(), subjectTemplate || null, bodyTemplate, Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ template: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function dispatchDocument(req, res, next) {
  const client = await pool.connect();
  try {
    const { templateId = null, entityType, entityId = null, recipient, channel = 'EMAIL', metadata = {} } = req.body || {};
    if (!entityType || !recipient) throw new ApiError(400, 'entityType and recipient are required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_document_dispatch_logs
       (template_id, entity_type, entity_id, recipient, channel, status, metadata_json, sent_by, sent_at)
       VALUES ($1, $2, $3, $4, $5, 'SENT', $6::jsonb, $7, NOW())
       RETURNING *`,
      [templateId ? Number(templateId) : null, String(entityType).toUpperCase(), entityId ? Number(entityId) : null, String(recipient), String(channel).toUpperCase(), JSON.stringify(metadata || {}), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ dispatch: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPracticeClient(req, res, next) {
  const client = await pool.connect();
  try {
    const { clientName, legalEntity = '', active = true } = req.body || {};
    if (!clientName) throw new ApiError(400, 'clientName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_practice_clients
       (client_name, legal_entity, active, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [String(clientName), legalEntity || null, Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ practiceClient: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function grantPracticeAccess(req, res, next) {
  const client = await pool.connect();
  try {
    const { clientId, userId, roleLabel = 'ACCOUNTANT', active = true } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_practice_access
       (client_id, user_id, role_label, active, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_id, user_id)
       DO UPDATE SET role_label = EXCLUDED.role_label, active = EXCLUDED.active
       RETURNING *`,
      [toInt(clientId, 'clientId'), toInt(userId, 'userId'), String(roleLabel), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ practiceAccess: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function requestPeriodException(req, res, next) {
  const client = await pool.connect();
  try {
    const { periodMonth, exceptionType = 'OTHER', reason } = req.body || {};
    if (!periodMonth || !reason) throw new ApiError(400, 'periodMonth and reason are required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_period_exception_approvals
       (period_month, exception_type, reason, requested_by, status, requested_at)
       VALUES (date_trunc('month', $1::date)::date, $2, $3, $4, 'PENDING', NOW())
       RETURNING *`,
      [periodMonth, String(exceptionType).toUpperCase(), String(reason), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ periodException: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function decidePeriodException(req, res, next) {
  const client = await pool.connect();
  try {
    const exceptionId = toInt(req.params.id, 'exception id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(status)) throw new ApiError(400, 'Invalid status');
    await client.query('BEGIN');
    await client.query(
      `UPDATE finance_period_exception_approvals
       SET status = $1, approved_by = $2, decided_at = NOW()
       WHERE id = $3`,
      [status, req.user.id, exceptionId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_period_exception_approvals WHERE id = $1`, [exceptionId]);
    await client.query('COMMIT');
    res.json({ periodException: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createTaxRuleSet(req, res, next) {
  const client = await pool.connect();
  try {
    const { ruleName, jurisdictionCode = '', rule = {}, active = true } = req.body || {};
    if (!ruleName) throw new ApiError(400, 'ruleName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_tax_rule_sets
       (rule_name, jurisdiction_code, rule_json, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), NOW())
       ON CONFLICT (rule_name)
       DO UPDATE SET jurisdiction_code = EXCLUDED.jurisdiction_code,
                     rule_json = EXCLUDED.rule_json,
                     active = EXCLUDED.active,
                     updated_at = NOW()
       RETURNING *`,
      [String(ruleName), jurisdictionCode ? String(jurisdictionCode).toUpperCase() : null, JSON.stringify(rule || {}), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ taxRuleSet: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPayrollRuleSet(req, res, next) {
  const client = await pool.connect();
  try {
    const { ruleName, countryCode = 'US', rule = {}, active = true } = req.body || {};
    if (!ruleName) throw new ApiError(400, 'ruleName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payroll_rule_sets
       (rule_name, country_code, rule_json, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), NOW())
       ON CONFLICT (rule_name)
       DO UPDATE SET country_code = EXCLUDED.country_code,
                     rule_json = EXCLUDED.rule_json,
                     active = EXCLUDED.active,
                     updated_at = NOW()
       RETURNING *`,
      [String(ruleName), String(countryCode).toUpperCase(), JSON.stringify(rule || {}), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ payrollRuleSet: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listBankRules,
  createBankRule,
  runBankRuleEngine,
  listReportAutomation,
  createReportPreset,
  createReportSchedule,
  exportReport,
  listInventoryLots,
  receiveInventoryLot,
  issueInventoryWithCogs,
  listPayrollCompliance,
  createPayrollTaxSetting,
  submitPayrollFiling,
  listAccountingControls,
  createApprovalPolicy,
  requestAccountingApproval,
  decideAccountingApproval,
  listCloseBooks,
  upsertCloseBooksPeriod,
  closeBooksPeriod,
  reopenBooksPeriod,
  listFixedAssets,
  createFixedAsset,
  postAssetDepreciationRun,
  listFxCenter,
  upsertFxRate,
  runFxRevaluation,
  listArCollections,
  runArCollectionSweep,
  listBankFeedCenter,
  createBankFeedConnector,
  runBankFeedImport,
  listSalesTaxCenter,
  upsertSalesTaxJurisdiction,
  upsertSalesTaxNexus,
  previewSalesTax,
  listPayrollCompliancePlus,
  createPayrollSchedule,
  createPayrollComponent,
  listArApOps,
  createArDispute,
  createCreditMemo,
  createRefund,
  listPhase2Overview,
  createMultiCurrencyEntry,
  runFxSettlement,
  createFixedAssetEvent,
  createMonthEndWorkspace,
  createMonthEndTask,
  updateMonthEndTaskStatus,
  createAdjustingEntry,
  decideAdjustingEntry,
  createFilingCalendar,
  updateFilingCalendarStatus,
  listMaturityAutomation,
  createOpsJob,
  runOpsJob,
  queueBankFeedRetry,
  runBankFeedRetry,
  createTaxReturn,
  updateTaxReturnStatus,
  createPayrollBatch,
  createPaymentIntent,
  autoApplyPaymentIntent,
  createDunningCampaign,
  runDunningCampaign,
  listFinalParityOverview,
  createBankProviderConnection,
  runBankProviderSync,
  createPaymentGateway,
  createPaymentLink,
  capturePaymentLink,
  createChargeback,
  createDocumentTemplate,
  dispatchDocument,
  createPracticeClient,
  grantPracticeAccess,
  requestPeriodException,
  decidePeriodException,
  createTaxRuleSet,
  createPayrollRuleSet,
};
