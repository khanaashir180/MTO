const pool = require('../config/db');

async function sendInviteEmail({ userId, emailTo, subject, body }) {
  let deliveryStatus = 'PENDING_NO_TRANSPORT';
  let transportResponse = null;

  const webhookUrl = process.env.MTO_EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo, subject, body }),
      });
      transportResponse = { ok: response.ok, status: response.status };
      deliveryStatus = response.ok ? 'SENT' : 'FAILED';
    } catch (error) {
      deliveryStatus = 'FAILED';
      transportResponse = { message: error.message };
    }
  }

  await pool.query(
    `INSERT INTO user_invite_emails
     (user_id, email_to, subject, body, delivery_status, transport_response, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
    [userId, emailTo, subject, body, deliveryStatus, JSON.stringify(transportResponse)]
  );

  return { deliveryStatus, transportResponse };
}

module.exports = { sendInviteEmail };
