import api from '../api/client';

export default function LateReportView() {
  async function download(format) {
    const response = await api.get(`/orders/reports/late?format=${format}`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: response.headers['content-type'] });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = format === 'csv' ? 'late-orders-report.csv' : 'late-orders-report.pdf';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="card report-actions">
      <h3>Late Orders Report</h3>
      <button onClick={() => download('csv')}>Download CSV</button>
      <button onClick={() => download('pdf')}>Download PDF</button>
    </div>
  );
}
