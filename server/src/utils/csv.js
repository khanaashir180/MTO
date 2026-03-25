const { stringify } = require('csv-stringify/sync');

function buildLateOrdersCsv(rows) {
  return stringify(rows, {
    header: true,
    columns: [
      { key: 'production_order_no', header: 'Order No' },
      { key: 'customer_name', header: 'Customer Name' },
      { key: 'ordered_from', header: 'Outlet' },
      { key: 'due_date', header: 'Due Date' },
      { key: 'status', header: 'Status' },
      { key: 'current_stage', header: 'Current Stage' },
      { key: 'days_late', header: 'Days Late' },
    ],
  });
}

module.exports = { buildLateOrdersCsv };
