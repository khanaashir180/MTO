import { useEffect, useMemo, useState } from 'react';
import Barcode from 'react-barcode';

const REF_SLOTS = [
  { type: 'DESIGN_REFERENCE', title: 'Design Reference' },
  { type: 'COLOUR_REFERENCE', title: 'Colour Reference' },
  { type: 'SOLE_REFERENCE', title: 'Sole Reference' },
  { type: 'ADDITIONAL_REFERENCE', title: 'Additional Reference' },
];

export default function A4PrintableOrderView({ order, onClose }) {
  const [loadedCount, setLoadedCount] = useState(0);
  const [erroredCount, setErroredCount] = useState(0);

  const refsByType = ((order?.images) || []).reduce((acc, img) => {
    if (!acc[img.type]) acc[img.type] = img;
    return acc;
  }, {});
  const totalImages = useMemo(() => Object.values(refsByType).length, [refsByType]);
  const readyForPrint = loadedCount + erroredCount >= totalImages;

  useEffect(() => {
    setLoadedCount(0);
    setErroredCount(0);
  }, [order?.id]);

  if (!order) return null;
  const orderType = String(order.order_type || 'MTO').toUpperCase();
  const flow = String(order.production_flow || 'BESPOKE').toUpperCase();
  const flowMark = (name) => (flow === name ? '[X]' : '[ ]');

  return (
    <div className="print-overlay">
      <div className="print-toolbar">
        <button onClick={onClose}>Close</button>
        <button onClick={() => window.print()} disabled={!readyForPrint}>
          {readyForPrint ? 'Print A4' : 'Loading Images...'}
        </button>
      </div>

      <article className="a4-sheet">
        <h2 className="a4-title">
          {orderType === 'REFURBISHMENT'
            ? 'IOT (Refurbishment Tracker)'
            : orderType === 'RETURN'
              ? 'IOT (Return Tracker)'
              : 'IOT (Internal Order Tracker)'}
        </h2>
        <div className="a4-top-layout">
          <section className="a4-block">
            <p><strong>Name:</strong> {order.customer_name}</p>
            <p><strong>Number:</strong> {order.customer_number}</p>
            <p><strong>Address:</strong> {order.customer_address}</p>
          </section>
          <div className="print-barcode-box a4-block">
            <Barcode value={order.barcode} format="CODE128" width={1.25} height={46} displayValue />
            <p><strong>Production Order:</strong> {order.production_order_no}</p>
            <p><strong>Order Date:</strong> {order.order_date?.slice(0, 10)}</p>
            <p><strong>Due Date:</strong> {order.due_date?.slice(0, 10)}</p>
            <p><strong>Ordered From:</strong> {order.ordered_from}</p>
            {orderType === 'REFURBISHMENT' || orderType === 'RETURN' ? (
              <p><strong>Order Type:</strong> {orderType}</p>
            ) : (
              <p><strong>Flow:</strong> {flowMark('BESPOKE')} Bespoke {flowMark('EMBROIDERY')} Embroidery {flowMark('LASER')} Laser {flowMark('MTO')} MTO</p>
            )}
          </div>
        </div>

        <div className="a4-product-ref-top">
          <section className="a4-block">
            <table className="product-info-table">
              <tbody>
                {orderType === 'REFURBISHMENT' ? (
                  <>
                    <tr><th>Item Name</th><td>{order.product_name}</td></tr>
                    <tr><th>Item Condition</th><td>{order.item_condition}</td></tr>
                    <tr><th>Refurbishment Type</th><td>{order.refurbishment_type}</td></tr>
                    <tr><th>Issue Description</th><td>{order.issue_description}</td></tr>
                    <tr><th>Work Requested</th><td>{order.work_requested}</td></tr>
                    <tr><th>Accessories Received</th><td>{order.accessories_received}</td></tr>
                    <tr><th>Size</th><td>{order.size}</td></tr>
                    <tr><th>Colour</th><td>{order.colour}</td></tr>
                    <tr><th>Sole</th><td>{order.sole}</td></tr>
                    <tr><th>Stamp</th><td>{order.stamp}</td></tr>
                  </>
                ) : orderType === 'RETURN' ? (
                  <>
                    <tr><th>Item Name</th><td>{order.product_name}</td></tr>
                    <tr><th>Return Condition</th><td>{order.return_condition}</td></tr>
                    <tr><th>Return Reason</th><td>{order.return_reason}</td></tr>
                    <tr><th>Return Request</th><td>{order.return_request}</td></tr>
                    <tr><th>Accessories Received</th><td>{order.return_accessories_received}</td></tr>
                    <tr><th>Size</th><td>{order.size}</td></tr>
                    <tr><th>Colour</th><td>{order.colour}</td></tr>
                    <tr><th>Sole</th><td>{order.sole}</td></tr>
                    <tr><th>Stamp</th><td>{order.stamp}</td></tr>
                  </>
                ) : (
                  <>
                    <tr><th>Product Name</th><td>{order.product_name}</td></tr>
                    <tr><th>Size</th><td>{order.size}</td></tr>
                    <tr><th>Colour</th><td>{order.colour}</td></tr>
                    <tr><th>Last Number</th><td>{order.last_number}</td></tr>
                    <tr><th>Sole</th><td>{order.sole}</td></tr>
                    <tr><th>Upper</th><td>{order.upper_material}</td></tr>
                    <tr><th>Lining</th><td>{order.lining_material}</td></tr>
                    <tr><th>Edge</th><td>{order.edge_colour}</td></tr>
                    <tr><th>Socks</th><td>{order.socks}</td></tr>
                    <tr><th>Welt</th><td>{order.welt}</td></tr>
                    <tr><th>Stamp</th><td>{order.stamp}</td></tr>
                  </>
                )}
              </tbody>
            </table>
            <div className="iot-comments-print">
              <strong>Comments:</strong> {order.comments?.trim() ? order.comments : '-'}
            </div>
          </section>
          <div className="a4-right-ref-stack">
            {['DESIGN_REFERENCE', 'COLOUR_REFERENCE'].map((type) => {
              const slot = REF_SLOTS.find((s) => s.type === type);
              const image = refsByType[type];
              if (!image) return null;
              return (
                <figure key={type} className="reference-slot">
                  <figcaption>{slot.title}</figcaption>
                  <img
                    src={image.url}
                    alt={slot.title}
                    loading="eager"
                    decoding="sync"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onLoad={() => setLoadedCount((c) => c + 1)}
                    onError={() => setErroredCount((c) => c + 1)}
                  />
                </figure>
              );
            })}
          </div>
        </div>

        <div className="a4-bottom-ref-row">
          {['SOLE_REFERENCE', 'ADDITIONAL_REFERENCE'].map((type) => {
            const slot = REF_SLOTS.find((s) => s.type === type);
            const image = refsByType[type];
            if (!image) return null;
            return (
              <figure key={type} className="reference-slot">
                <figcaption>{slot.title}</figcaption>
                <img
                  src={image.url}
                  alt={slot.title}
                  loading="eager"
                  decoding="sync"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onLoad={() => setLoadedCount((c) => c + 1)}
                  onError={() => setErroredCount((c) => c + 1)}
                />
              </figure>
            );
          })}
        </div>
      </article>
    </div>
  );
}
