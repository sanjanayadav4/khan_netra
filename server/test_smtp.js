/**
 * KhanNetra — SMTP Connection & Email Test
 * Run: node test_smtp.js your@email.com
 *
 * This sends a real test email to confirm SMTP is configured correctly.
 * Safe to run multiple times. Does NOT affect any database.
 */
'use strict';
require('dotenv').config();
const nodemailer = require('nodemailer');

const recipient = process.argv[2];

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   KhanNetra SMTP Configuration Test     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── Check env vars
  const cfg = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  };

  console.log('Configuration:');
  console.log('  SMTP_HOST:', cfg.host  || '❌ NOT SET');
  console.log('  SMTP_PORT:', cfg.port);
  console.log('  SMTP_USER:', cfg.user  || '❌ NOT SET');
  console.log('  SMTP_PASS:', cfg.pass  ? `✅ SET (${cfg.pass.length} characters)` : '❌ NOT SET');
  console.log('  SMTP_FROM:', cfg.from  || `(will use SMTP_USER)`);
  console.log('  CLIENT_URL:', process.env.CLIENT_URL || 'http://localhost:3000');

  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.log('\n❌ SMTP not fully configured.');
    console.log('   Add these lines to server/.env (uncomment and fill in real values):\n');
    console.log('   SMTP_HOST=smtp.gmail.com');
    console.log('   SMTP_PORT=587');
    console.log('   SMTP_USER=your_gmail@gmail.com');
    console.log('   SMTP_PASS=your_16_char_app_password');
    console.log('   SMTP_FROM=KhanNetra DGMS <your_gmail@gmail.com>\n');
    console.log('   Get App Password: https://myaccount.google.com/apppasswords');
    process.exit(1);
  }

  if (!recipient) {
    console.log('\n⚠️  No recipient specified.');
    console.log('   Usage: node test_smtp.js yourname@gmail.com\n');
    process.exit(1);
  }

  // ── Create transport
  console.log('\nCreating SMTP transport...');
  const transport = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.port === 465,
    auth:   { user: cfg.user, pass: cfg.pass },
    tls:    { rejectUnauthorized: false },
  });

  // ── Verify connection
  console.log('Verifying SMTP connection...');
  try {
    await transport.verify();
    console.log('✅ SMTP connection verified successfully!\n');
  } catch (err) {
    console.error('❌ SMTP connection failed:', err.message);
    console.log('\nCommon fixes:');
    console.log('  • Make sure SMTP_PASS is a Gmail App Password (not your login password)');
    console.log('  • Get App Password at: https://myaccount.google.com/apppasswords');
    console.log('  • Make sure 2-Step Verification is ON for the Gmail account');
    console.log('  • If using port 465, set SMTP_PORT=465 in .env');
    process.exit(1);
  }

  // ── Send test email
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const fakeToken = 'test_token_' + Date.now();
  const verifyUrl = `${clientUrl}/verify-email?token=${fakeToken}`;

  console.log(`Sending test email to: ${recipient}`);
  const from = cfg.from || `KhanNetra DGMS <${cfg.user}>`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .card { max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 28px; border: 2px solid #f59e0b; }
    h2 { color: #1a2e48; margin: 0 0 12px; }
    p { color: #444; font-size: 14px; line-height: 1.6; }
    .badge { background: #f59e0b; color: #060e1c; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 13px; }
    .btn { display: inline-block; background: #f59e0b; color: #060e1c; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 16px 0; }
    .info { background: #f8f9fa; border-radius: 8px; padding: 12px; font-size: 12px; color: #666; font-family: monospace; word-break: break-all; }
    .footer { margin-top: 20px; font-size: 11px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <p><span class="badge">✅ SMTP TEST</span></p>
    <h2>KhanNetra DGMS — Email Test</h2>
    <p>This is a <strong>test email</strong> confirming that your Gmail SMTP is correctly configured for KhanNetra DGMS email verification.</p>
    <p><strong>Configuration used:</strong></p>
    <div class="info">
      Host: ${cfg.host}:${cfg.port}<br/>
      From: ${from}<br/>
      Sent at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
    </div>
    <p>This is what a real verification email looks like (with a test link):</p>
    <a href="${verifyUrl}" class="btn">✉️ Verify Email (TEST ONLY)</a>
    <p style="font-size:12px;color:#999;">⚠️ This test link is not valid — it is only for visual confirmation.</p>
    <div class="footer">🔒 KhanNetra · DGMS · Ministry of Coal, Govt. of India</div>
  </div>
</body>
</html>`;

  try {
    const info = await transport.sendMail({
      from,
      to:      recipient,
      subject: `✅ KhanNetra SMTP Test — ${new Date().toLocaleTimeString('en-IN')}`,
      html,
      text: `KhanNetra SMTP Test\n\nSMTP is working!\nHost: ${cfg.host}:${cfg.port}\nFrom: ${from}\nSent at: ${new Date().toISOString()}`,
    });

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   ✅  TEST EMAIL SENT SUCCESSFULLY!      ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`\n  Message ID : ${info.messageId}`);
    console.log(`  Sent to    : ${recipient}`);
    console.log(`  Check your Gmail inbox (and spam folder).`);
    console.log('\n  Gmail SMTP is working. Registration emails will be sent automatically.');
    console.log('  Restart the server to apply the new .env settings.\n');
  } catch (err) {
    console.error('\n❌ Failed to send test email:', err.message);
    process.exit(1);
  }
}

main();
