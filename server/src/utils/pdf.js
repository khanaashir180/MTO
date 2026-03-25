const fs = require('fs');
const PDFDocument = require('pdfkit');

function streamLateOrdersPdf(res, lateOrders) {
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="late-orders-report.pdf"');

  doc.pipe(res);
  doc.fontSize(16).text('Late Orders Report', { underline: true });
  doc.moveDown();

  lateOrders.forEach((order) => {
    doc
      .fontSize(10)
      .text(
        `${order.production_order_no} | ${order.customer_name} | Due ${new Date(order.due_date).toISOString().slice(0, 10)} | Stage ${order.current_stage || 'N/A'} | Status ${order.status}`
      );
  });

  doc.end();
}

module.exports = { streamLateOrdersPdf };
