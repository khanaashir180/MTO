import { useState } from 'react';
import api from '../api/client';

export default function ConfirmEmailChangePage() {
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const token = new URLSearchParams(window.location.search).get('token') || '';

  async function confirm() {
    try {
      await api.post('/auth/confirm-email-change', { token });
      setDone(true);
      setMessage('Email change confirmed. You can now log in with the new email.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to confirm email change');
    }
  }

  return (
    <main className="app-shell">
      <section className="card login-card">
        <h2>Confirm Email Change</h2>
        <p>Use this to confirm your new email address.</p>
        <div className="actions-cell">
          <button type="button" onClick={confirm} disabled={done || !token}>Confirm Email</button>
        </div>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
