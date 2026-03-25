const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function listInventoryItems(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, sku, item_name, item_type, valuation_method, qty_on_hand, avg_unit_cost, sales_price, active, updated_at
       FROM finance_inventory_items
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

async function createInventoryItem(req, res, next) {
  const client = await pool.connect();
  try {
    const { sku, itemName, itemType = 'PRODUCT', valuationMethod = 'FIFO', salesPrice = 0 } = req.body || {};
    if (!String(sku || '').trim()) throw new ApiError(400, 'sku is required');
    if (!String(itemName || '').trim()) throw new ApiError(400, 'itemName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_inventory_items
       (sku, item_name, item_type, valuation_method, qty_on_hand, avg_unit_cost, sales_price, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, 0, $5, TRUE, $6, NOW(), NOW())
       RETURNING *`,
      [String(sku).trim(), String(itemName).trim(), String(itemType).toUpperCase(), String(valuationMethod).toUpperCase(), Number(salesPrice || 0), req.user.id]
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

async function createInventoryMovement(req, res, next) {
  const client = await pool.connect();
  try {
    const { itemId, movementDate = null, movementType, qty, unitCost = 0, notes = '' } = req.body || {};
    const parsedItemId = toInt(itemId, 'itemId');
    const parsedQty = Number(qty || 0);
    if (!(parsedQty > 0)) throw new ApiError(400, 'qty must be > 0');
    const type = String(movementType || '').toUpperCase();
    if (!['PURCHASE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(type)) throw new ApiError(400, 'Invalid movementType');
    await client.query('BEGIN');
    const itemRes = await client.query(`SELECT * FROM finance_inventory_items WHERE id = $1 FOR UPDATE`, [parsedItemId]);
    const item = itemRes.rows[0];
    if (!item) throw new ApiError(404, 'Inventory item not found');
    let qtyOnHand = Number(item.qty_on_hand || 0);
    let avgCost = Number(item.avg_unit_cost || 0);
    const cost = Number(unitCost || 0);
    if (type === 'PURCHASE' || type === 'ADJUSTMENT_IN') {
      const newQty = qtyOnHand + parsedQty;
      avgCost = newQty > 0 ? ((qtyOnHand * avgCost) + (parsedQty * cost)) / newQty : avgCost;
      qtyOnHand = newQty;
    } else {
      if (qtyOnHand < parsedQty) throw new ApiError(400, 'Insufficient stock for movement');
      qtyOnHand -= parsedQty;
    }
    await client.query(
      `INSERT INTO finance_inventory_movements
       (item_id, movement_date, movement_type, qty, unit_cost, notes, created_by, created_at)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, NOW())`,
      [parsedItemId, movementDate, type, parsedQty, cost, notes || null, req.user.id]
    );
    await client.query(
      `UPDATE finance_inventory_items
       SET qty_on_hand = $1, avg_unit_cost = $2, updated_at = NOW()
       WHERE id = $3`,
      [qtyOnHand, Number(avgCost.toFixed(4)), parsedItemId]
    );
    const updated = await client.query(`SELECT * FROM finance_inventory_items WHERE id = $1`, [parsedItemId]);
    await client.query('COMMIT');
    res.status(201).json({ item: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getInventoryValuation(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) AS item_count,
         COALESCE(SUM(qty_on_hand), 0)::numeric(12,2) AS total_qty,
         COALESCE(SUM(qty_on_hand * avg_unit_cost), 0)::numeric(14,2) AS inventory_value
       FROM finance_inventory_items
       WHERE active = TRUE`
    );
    res.json({ valuation: rows[0] || { item_count: 0, total_qty: 0, inventory_value: 0 } });
  } catch (error) {
    next(error);
  }
}

async function listBudgets(req, res, next) {
  try {
    const year = req.query?.year ? Number(req.query.year) : null;
    const values = [];
    let whereClause = '';
    if (Number.isInteger(year)) {
      values.push(year);
      whereClause = `WHERE b.fiscal_year = $1`;
    }
    const { rows } = await pool.query(
      `SELECT b.*, c.class_name, l.location_name
       FROM finance_budgets b
       LEFT JOIN finance_class_tags c ON c.id = b.class_id
       LEFT JOIN finance_location_tags l ON l.id = b.location_id
       ${whereClause}
       ORDER BY b.fiscal_year DESC, b.updated_at DESC, b.id DESC`,
      values
    );
    res.json({ budgets: rows });
  } catch (error) {
    next(error);
  }
}

async function createBudget(req, res, next) {
  const client = await pool.connect();
  try {
    const { budgetName, fiscalYear, classId = null, locationId = null, revenueTarget = 0, expenseTarget = 0, status = 'DRAFT' } = req.body || {};
    if (!String(budgetName || '').trim()) throw new ApiError(400, 'budgetName is required');
    if (!Number.isInteger(Number(fiscalYear))) throw new ApiError(400, 'fiscalYear is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_budgets
       (budget_name, fiscal_year, class_id, location_id, revenue_target, expense_target, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        String(budgetName).trim(),
        Number(fiscalYear),
        classId ? toInt(classId, 'classId') : null,
        locationId ? toInt(locationId, 'locationId') : null,
        Number(revenueTarget || 0),
        Number(expenseTarget || 0),
        String(status || 'DRAFT').toUpperCase(),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ budget: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listProjects(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, a.customer_name, c.class_name, l.location_name
       FROM finance_projects p
       LEFT JOIN customer_accounts a ON a.id = p.customer_account_id
       LEFT JOIN finance_class_tags c ON c.id = p.class_id
       LEFT JOIN finance_location_tags l ON l.id = p.location_id
       ORDER BY p.updated_at DESC, p.id DESC`
    );
    res.json({ projects: rows });
  } catch (error) {
    next(error);
  }
}

async function createProject(req, res, next) {
  const client = await pool.connect();
  try {
    const { projectCode, projectName, customerAccountId = null, classId = null, locationId = null, startDate = null, endDate = null, budgetAmount = 0 } = req.body || {};
    if (!String(projectCode || '').trim()) throw new ApiError(400, 'projectCode is required');
    if (!String(projectName || '').trim()) throw new ApiError(400, 'projectName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_projects
       (project_code, project_name, customer_account_id, class_id, location_id, start_date, end_date, status, budget_amount, actual_cost, actual_revenue, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, 0, 0, $9, NOW(), NOW())
       RETURNING *`,
      [
        String(projectCode).trim(),
        String(projectName).trim(),
        customerAccountId ? toInt(customerAccountId, 'customerAccountId') : null,
        classId ? toInt(classId, 'classId') : null,
        locationId ? toInt(locationId, 'locationId') : null,
        startDate,
        endDate,
        Number(budgetAmount || 0),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ project: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addProjectEntry(req, res, next) {
  const client = await pool.connect();
  try {
    const projectId = toInt(req.params.id, 'project id');
    const { entryDate = null, entryType, amount = 0, notes = '' } = req.body || {};
    const type = String(entryType || '').toUpperCase();
    if (!['COST', 'REVENUE', 'TIME'].includes(type)) throw new ApiError(400, 'Invalid entryType');
    const value = Number(amount || 0);
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO finance_project_entries
       (project_id, entry_date, entry_type, amount, notes, created_by, created_at)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, NOW())`,
      [projectId, entryDate, type, value, notes || null, req.user.id]
    );
    await client.query(
      `UPDATE finance_projects
       SET actual_cost = actual_cost + CASE WHEN $1 = 'COST' THEN $2 ELSE 0 END,
           actual_revenue = actual_revenue + CASE WHEN $1 = 'REVENUE' THEN $2 ELSE 0 END,
           updated_at = NOW()
       WHERE id = $3`,
      [type, value, projectId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_projects WHERE id = $1`, [projectId]);
    await client.query('COMMIT');
    res.status(201).json({ project: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listClasses(_req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT * FROM finance_class_tags ORDER BY class_name ASC`);
    res.json({ classes: rows });
  } catch (error) {
    next(error);
  }
}

async function createClass(req, res, next) {
  const client = await pool.connect();
  try {
    const { className, description = '' } = req.body || {};
    if (!String(className || '').trim()) throw new ApiError(400, 'className is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_class_tags (class_name, description, active, created_by, created_at, updated_at)
       VALUES ($1, $2, TRUE, $3, NOW(), NOW())
       RETURNING *`,
      [String(className).trim(), description || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ classTag: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listLocations(_req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT * FROM finance_location_tags ORDER BY location_name ASC`);
    res.json({ locations: rows });
  } catch (error) {
    next(error);
  }
}

async function createLocation(req, res, next) {
  const client = await pool.connect();
  try {
    const { locationName, description = '' } = req.body || {};
    if (!String(locationName || '').trim()) throw new ApiError(400, 'locationName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_location_tags (location_name, description, active, created_by, created_at, updated_at)
       VALUES ($1, $2, TRUE, $3, NOW(), NOW())
       RETURNING *`,
      [String(locationName).trim(), description || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ locationTag: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPayrollProfiles(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, employee_user_id, employee_code, full_name, salary_type, base_salary, tax_percent, active, updated_at
       FROM finance_payroll_profiles
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ profiles: rows });
  } catch (error) {
    next(error);
  }
}

async function createPayrollProfile(req, res, next) {
  const client = await pool.connect();
  try {
    const { employeeUserId = null, employeeCode, fullName, salaryType = 'MONTHLY', baseSalary = 0, taxPercent = 0 } = req.body || {};
    if (!String(employeeCode || '').trim()) throw new ApiError(400, 'employeeCode is required');
    if (!String(fullName || '').trim()) throw new ApiError(400, 'fullName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_payroll_profiles
       (employee_user_id, employee_code, full_name, salary_type, base_salary, tax_percent, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, NOW(), NOW())
       RETURNING *`,
      [
        employeeUserId ? toInt(employeeUserId, 'employeeUserId') : null,
        String(employeeCode).trim(),
        String(fullName).trim(),
        String(salaryType || 'MONTHLY').toUpperCase(),
        Number(baseSalary || 0),
        Number(taxPercent || 0),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ profile: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPayrollRuns(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, run_label, period_start, period_end, status, total_gross, total_tax, total_net, updated_at
       FROM finance_payroll_runs
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ runs: rows });
  } catch (error) {
    next(error);
  }
}

async function createPayrollRun(req, res, next) {
  const client = await pool.connect();
  try {
    const { runLabel, periodStart, periodEnd } = req.body || {};
    if (!String(runLabel || '').trim()) throw new ApiError(400, 'runLabel is required');
    if (!periodStart || !periodEnd) throw new ApiError(400, 'periodStart and periodEnd are required');
    await client.query('BEGIN');
    const runRes = await client.query(
      `INSERT INTO finance_payroll_runs
       (run_label, period_start, period_end, status, total_gross, total_tax, total_net, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'DRAFT', 0, 0, 0, $4, NOW(), NOW())
       RETURNING *`,
      [String(runLabel).trim(), periodStart, periodEnd, req.user.id]
    );
    const runId = runRes.rows[0].id;
    const profilesRes = await client.query(`SELECT id, base_salary, tax_percent FROM finance_payroll_profiles WHERE active = TRUE`);
    let totalGross = 0;
    let totalTax = 0;
    for (const profile of profilesRes.rows) {
      const gross = Number(profile.base_salary || 0);
      const tax = Number((gross * (Number(profile.tax_percent || 0) / 100)).toFixed(2));
      const net = Number((gross - tax).toFixed(2));
      totalGross += gross;
      totalTax += tax;
      await client.query(
        `INSERT INTO finance_payroll_run_lines
         (payroll_run_id, payroll_profile_id, gross_amount, tax_amount, net_amount, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [runId, profile.id, gross, tax, net]
      );
    }
    await client.query(
      `UPDATE finance_payroll_runs
       SET total_gross = $1, total_tax = $2, total_net = $3, updated_at = NOW()
       WHERE id = $4`,
      [Number(totalGross.toFixed(2)), Number(totalTax.toFixed(2)), Number((totalGross - totalTax).toFixed(2)), runId]
    );
    const updated = await client.query(`SELECT * FROM finance_payroll_runs WHERE id = $1`, [runId]);
    await client.query('COMMIT');
    res.status(201).json({ run: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updatePayrollRunStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const runId = toInt(req.params.id, 'run id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['DRAFT', 'POSTED', 'PAID', 'CANCELLED'].includes(status)) throw new ApiError(400, 'Invalid payroll status');
    await client.query('BEGIN');
    await client.query(`UPDATE finance_payroll_runs SET status = $1, updated_at = NOW() WHERE id = $2`, [status, runId]);
    const { rows } = await client.query(`SELECT * FROM finance_payroll_runs WHERE id = $1`, [runId]);
    await client.query('COMMIT');
    res.json({ run: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listInventoryItems,
  createInventoryItem,
  createInventoryMovement,
  getInventoryValuation,
  listBudgets,
  createBudget,
  listProjects,
  createProject,
  addProjectEntry,
  listClasses,
  createClass,
  listLocations,
  createLocation,
  listPayrollProfiles,
  createPayrollProfile,
  listPayrollRuns,
  createPayrollRun,
  updatePayrollRunStatus,
};
