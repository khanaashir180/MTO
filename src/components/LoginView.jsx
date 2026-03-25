import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const demoUsers = [
  { label: 'Shop Manager', role: 'SHOP_MANAGER', stage: '-', email: 'shopmanager@example.com' },
  { label: 'Retail Head', role: 'RETAIL_HEAD', stage: '-', email: 'retailhead@example.com' },
  { label: 'Verification Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Verification', email: 'verification@example.com' },
  { label: 'Bespoke Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Bespoke', email: 'lastmod@example.com' },
  { label: 'Model Room Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Model Room', email: 'modelroom@example.com' },
  { label: 'Embroidery Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Embroidery', email: 'embroidery@example.com' },
  { label: 'Laser Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Laser', email: 'laser@example.com' },
  { label: 'Cutting Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Cutting', email: 'cutting@example.com' },
  { label: 'Closing Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Closing', email: 'closing@example.com' },
  { label: 'Sole Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Sole', email: 'sole@example.com' },
  { label: 'Lasting Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Lasting', email: 'lasting@example.com' },
  { label: 'Finishing Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Finishing', email: 'finishing@example.com' },
  { label: 'QC Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'QC', email: 'qc@example.com' },
  { label: 'Packing Supervisor', role: 'PRODUCTION_SUPERVISOR', stage: 'Packing', email: 'packing@example.com' },
  { label: 'Production Manager', role: 'PRODUCTION_MANAGER', stage: '-', email: 'manager@example.com' },
  { label: 'Super User', role: 'SUPER_USER', stage: '-', email: 'super@example.com' },
  { label: 'Finance User', role: 'FINANCE', stage: '-', email: 'finance@example.com' },
  { label: 'Customer Service User', role: 'CUSTOMER_SERVICE', stage: '-', email: 'service@example.com' },
];

export default function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('retail@example.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    try {
      setError('');
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  }

  return (
    <div className="login-shell">
      <div className="login-layout">
        <aside className="login-brand-panel">
          <p className="login-kicker">MTO Platform</p>
          <h1>Production + Retail Control Center</h1>
          <p>
            Manage bespoke workflow, shop operations, retail-head oversight, finance, and CRM operations
            from a single operations cockpit.
          </p>
        </aside>
        <form className="card login-card" onSubmit={onSubmit}>
          <h2>Sign In</h2>
          <p className="login-caption">Seeded demo users still use <strong>password123</strong>. Invited users must confirm by email and set their own password.</p>

          <label>Email or Outlet Username</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />

          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <p className="error">{error}</p>}
          <button type="submit">Sign In</button>

          <div className="demo-user-list">
            {demoUsers.map((userInfo) => (
              <p key={userInfo.email}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setEmail(userInfo.email);
                    setPassword('password123');
                  }}
                >
                  Use
                </button>{' '}
                <strong>{userInfo.label}</strong> ({userInfo.role}{userInfo.stage !== '-' ? ` | ${userInfo.stage}` : ''}): {userInfo.email}
              </p>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
