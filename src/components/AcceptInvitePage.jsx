import { useState } from 'react';
import api from '../api/client';

export default function AcceptInvitePage() {
  const search = new URLSearchParams(window.location.search);
  const token = search.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (!token) {
      setMessage('Invite token is missing.');
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      setMessage('');
      const { data } = await api.post('/auth/accept-invite', { token, password });
      sessionStorage.setItem('mto_token', data.accessToken || data.token);
      if (data.refreshToken) {
        sessionStorage.setItem('mto_refresh_token', data.refreshToken);
      }
      sessionStorage.setItem('mto_user', JSON.stringify(data.user));
      window.location.href = '/';
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to accept invite');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="card login-card">
        <h2>Confirm Account</h2>
        <p>Set your own password. This password is not visible to the super admin.</p>
        <form onSubmit={onSubmit} className="grid two">
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Confirm Password
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </label>
          <div className="actions-cell">
            <button type="submit" disabled={submitting}>{submitting ? 'Confirming...' : 'Confirm Account'}</button>
          </div>
        </form>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
