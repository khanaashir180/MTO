async function ensureAccount({
  client,
  customerName,
  customerNumber,
  customerAddress,
  outletName,
}) {
  const existing = await client.query(
    `SELECT id
     FROM customer_accounts
     WHERE LOWER(customer_number) = LOWER($1)
     LIMIT 1`,
    [customerNumber]
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE customer_accounts
       SET customer_name = $1,
           customer_address = $2,
           outlet_name = COALESCE($3, outlet_name),
           updated_at = NOW()
       WHERE id = $4`,
      [customerName, customerAddress || null, outletName || null, id]
    );
    return id;
  }

  const created = await client.query(
    `INSERT INTO customer_accounts (customer_name, customer_number, customer_address, outlet_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id`,
    [customerName, customerNumber, customerAddress || null, outletName]
  );
  return created.rows[0].id;
}

async function postOrderLedgerEntries({
  client,
  orderId,
  productionOrderNo,
  orderDate,
  customerName,
  customerNumber,
  customerAddress,
  outletName,
  productPrice,
  advancePaid,
  advancePaymentAccountId,
  advanceBreakup = null,
  createdBy,
}) {
  const accountId = await ensureAccount({
    client,
    customerName,
    customerNumber,
    customerAddress,
    outletName,
  });

  const existingOrderEntry = await client.query(
    `SELECT id
     FROM customer_ledger_entries
     WHERE reference_order_id = $1 AND category = 'ORDER'
     LIMIT 1`,
    [orderId]
  );
  if (!existingOrderEntry.rows[0]) {
    await client.query(
      `INSERT INTO customer_ledger_entries
       (account_id, entry_date, entry_type, category, amount, reference_order_id, notes, created_by, created_at)
       VALUES ($1, $2, 'DEBIT', 'ORDER', $3, $4, $5, $6, NOW())`,
      [accountId, orderDate, Number(productPrice || 0), orderId, `Order posted: ${productionOrderNo}`, createdBy]
    );
  }

  if (Number(advancePaid || 0) > 0) {
    const splits = Array.isArray(advanceBreakup) && advanceBreakup.length
      ? advanceBreakup
      : [{ amount: Number(advancePaid || 0), paymentAccountId: advancePaymentAccountId || null, label: 'Primary' }];
    for (let i = 0; i < splits.length; i += 1) {
      const split = splits[i];
      const amount = Number(split?.amount || 0);
      if (!(amount > 0)) continue;
      await client.query(
        `INSERT INTO customer_ledger_entries
         (account_id, entry_date, entry_type, category, amount, reference_order_id, payment_account_id, notes, created_by, created_at)
         VALUES ($1, $2, 'CREDIT', 'ADVANCE', $3, $4, $5, $6, $7, NOW())`,
        [
          accountId,
          orderDate,
          amount,
          orderId,
          split?.paymentAccountId || null,
          `Advance received (${split?.label || `Split ${i + 1}`}): ${productionOrderNo}`,
          createdBy,
        ]
      );
    }
  }

  return accountId;
}

module.exports = {
  ensureAccount,
  postOrderLedgerEntries,
};
