const {
  ensureAccount,
  postOrderLedgerEntries,
} = require('../src/services/customerLedgerService');

function createMockClient(results = []) {
  return {
    query: jest.fn()
      .mockImplementation(() => Promise.resolve(results.shift() || { rows: [] })),
  };
}

describe('customerLedgerService', () => {
  test('ensureAccount updates an existing global customer account', async () => {
    const client = createMockClient([{ rows: [{ id: 42 }] }, { rows: [] }]);

    const accountId = await ensureAccount({
      client,
      customerName: 'Updated Customer',
      customerNumber: '+923001234567',
      customerAddress: 'Updated address',
      outletName: 'Outlet 1',
    });

    expect(accountId).toBe(42);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[1][0]).toMatch(/UPDATE customer_accounts/);
    expect(client.query.mock.calls[1][1]).toEqual([
      'Updated Customer',
      'Updated address',
      'Outlet 1',
      42,
    ]);
  });

  test('postOrderLedgerEntries creates order debit and split advance credits once per order', async () => {
    const client = createMockClient([
      { rows: [] },
      { rows: [{ id: 77 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);

    const accountId = await postOrderLedgerEntries({
      client,
      orderId: 1001,
      productionOrderNo: 'PO-20260416-001001',
      orderDate: '2026-04-16',
      customerName: 'Ledger Customer',
      customerNumber: '+923001234568',
      customerAddress: 'Ledger address',
      outletName: 'Outlet 1',
      productPrice: 5000,
      advancePaid: 1500,
      advanceBreakup: [
        { amount: 1000, paymentAccountId: 5, label: 'Cash' },
        { amount: 500, paymentAccountId: 6, label: 'Card' },
      ],
      createdBy: 9,
    });

    expect(accountId).toBe(77);
    const sqlStatements = client.query.mock.calls.map(([sql]) => sql);
    expect(sqlStatements.filter((sql) => /INSERT INTO customer_ledger_entries/.test(sql))).toHaveLength(3);
    expect(client.query.mock.calls[4][1]).toEqual([
      77,
      '2026-04-16',
      1000,
      1001,
      5,
      'Advance received (Cash): PO-20260416-001001',
      9,
    ]);
    expect(client.query.mock.calls[5][1]).toEqual([
      77,
      '2026-04-16',
      500,
      1001,
      6,
      'Advance received (Card): PO-20260416-001001',
      9,
    ]);
  });
});
