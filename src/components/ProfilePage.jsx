import { useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [profileName, setProfileName] = useState(user?.full_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState('');

  async function saveProfile() {
    try {
      await api.put('/auth/me/profile', { fullName: profileName });
      const saved = { ...(user || {}), full_name: profileName };
      sessionStorage.setItem('mto_user', JSON.stringify(saved));
      setMessage('Profile updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update profile');
    }
  }

  async function changePassword() {
    try {
      await api.post('/auth/me/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password changed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to change password');
    }
  }

  async function requestEmailChange() {
    try {
      const { data } = await api.post('/auth/me/request-email-change', { newEmail });
      setMessage(`Email change requested${data.confirmLink ? `: ${data.confirmLink}` : ''}`);
      setNewEmail('');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to request email change');
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>My Profile</h1>
          <p>{user?.full_name} ({user?.role})</p>
        </div>
        <div className="actions-cell">
          <button type="button" className="button-secondary" onClick={() => window.history.back()}>Back</button>
          <button type="button" onClick={logout}>Logout</button>
        </div>
      </header>
      <section className="card">
        <h3>Profile</h3>
        <div className="grid two">
          <label>Full Name<input value={profileName} onChange={(e) => setProfileName(e.target.value)} /></label>
          <label>Email<input value={user?.email || ''} disabled /></label>
        </div>
        <div className="actions-cell">
          <button type="button" onClick={saveProfile}>Save Profile</button>
        </div>
      </section>
      <section className="card">
        <h3>Change Password</h3>
        <div className="grid two">
          <label>Current Password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label>New Password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        </div>
        <div className="actions-cell">
          <button type="button" onClick={changePassword}>Change Password</button>
        </div>
      </section>
      <section className="card">
        <h3>Request Email Change</h3>
        <div className="grid two">
          <label>New Email<input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
        </div>
        <div className="actions-cell">
          <button type="button" onClick={requestEmailChange}>Request Email Change</button>
        </div>
      </section>
      {message ? <section className="card"><p>{message}</p></section> : null}
    </main>
  );
}
