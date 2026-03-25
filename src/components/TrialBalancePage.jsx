import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BarChartCard, DonutChartCard } from './ReportingCharts';

function money(v) {
  return Number(v || 0).toFixed(2);
}

export default function TrialBalancePage({ refreshSignal = 0 }) {
  const { user } = useAuth();
  const isOutletUser = Boolean(user?.outlet_name);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    search: '',
    outlet: '',
  });
  const [data, setData] = useState({ accounts: [], totals: {} });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.from) p.set('from', filters.from);
    if (filters.to) p.set('to', filters.to);
    if (filters.search) p.set('search', filters.search);
    if (!isOutletUser && filters.outlet) p.set('outlet', filters.outlet);
    return p.toString();
  }, [filters, isOutletUser]);

  const visualData = useMemo(() => {
    const accounts = data.accounts || [];
    const topDebitBalances = accounts
      .map((a) => ({ label: a.customer_name || a.customer_number || 'Unknown', value: Number(a.balance_debit || 0) }))
      .filter((a) => a.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const topCreditBalances = accounts
      .map((a) => ({ label: a.customer_name || a.customer_number || 'Unknown', value: Number(a.balance_credit || 0) }))
      .filter((a) => a.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const totalDebit = Number(data.totals?.total_debit || 0);
    const totalCredit = Number(data.totals?.total_credit || 0);
    return {
      topDebitBalances,
      topCreditBalances,
      totalsMix: [
        { label: 'Total Debit', value: totalDebit },
        { label: 'Total Credit', value: totalCredit },
      ],
    };
  }, [data.accounts, data.totals]);

  useEffect(() => {
    api.get(`/finance/trial-balance?${query}`).then(({ data: payload }) => {
      setData(payload || { accounts: [], totals: {} });
    });
  }, [query, refreshSignal]);

  return (
    <section>
      <h2>Trial Balance</h2>
      {data.scoped_outlet && <p>Outlet Scope: {data.scoped_outlet}</p>}

      <div className="card filter-grid">
        <input type="date" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} />
        <input type="date" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} />
        <input placeholder="Search customer / number" value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
        {!isOutletUser && (
          <input placeholder="Outlet" value={filters.outlet} onChange={(e) => setFilters((p) => ({ ...p, outlet: e.target.value }))} />
        )}
      </div>

      <div className="chart-grid two-col">
        <DonutChartCard title="Debit vs Credit Mix" data={visualData.totalsMix} totalLabel="Total" />
        <BarChartCard title="Top Debit Balances" data={visualData.topDebitBalances} yLabel="Customer debit balance" format="currency" />
      </div>

      <div className="chart-grid one-col">
        <BarChartCard title="Top Credit Balances" data={visualData.topCreditBalances} yLabel="Customer credit balance" format="currency" />
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Number</th>
              <th>Outlet</th>
              <th>Total Debit</th>
              <th>Total Credit</th>
              <th>Balance (Dr)</th>
              <th>Balance (Cr)</th>
            </tr>
          </thead>
          <tbody>
            {(data.accounts || []).map((a) => (
              <tr key={a.account_id}>
                <td>{a.customer_name}</td>
                <td>{a.customer_number}</td>
                <td>{a.outlet_name}</td>
                <td>{money(a.total_debit)}</td>
                <td>{money(a.total_credit)}</td>
                <td>{money(a.balance_debit)}</td>
                <td>{money(a.balance_credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3}>Total</th>
              <th>{money(data.totals?.total_debit)}</th>
              <th>{money(data.totals?.total_credit)}</th>
              <th>{money(data.totals?.balance_debit)}</th>
              <th>{money(data.totals?.balance_credit)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
