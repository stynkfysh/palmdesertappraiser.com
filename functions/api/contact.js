/**
 * Cloudflare Pages Function — Contact Form Handler
 * Sends email via Resend API when the contact form is submitted.
 *
 * Environment variables required (set in Cloudflare Pages dashboard):
 *   RESEND_API_KEY  — Your Resend API key
 *   TO_EMAIL        — Destination email (e.g. contact@brianward.com)
 *   FROM_EMAIL      — Verified sender (e.g. noreply@palmdesertappraiser.com)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers — allow Pages preview domains and production
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin =
    origin.endsWith('.pages.dev') ||
    origin.endsWith('palmdesertappraiser.com')
      ? origin
      : 'https://www.palmdesertappraiser.com';

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { name, email, phone, property_address, appraisal_type, message } = body;

    // Basic validation
    if (!name || !email || !appraisal_type) {
      return new Response(
        JSON.stringify({ error: 'Name, email, and appraisal type are required.' }),
        { status: 400, headers }
      );
    }

    const SITE_NAME = 'palmdesertappraiser.com';

    // Build email body
    const emailHtml = `
      <h2>New Appraisal Request</h2>
      <p style="font-size:15px;background:#1a5276;color:#fff;padding:10px 14px;border-radius:4px;font-family:Arial,sans-serif;margin:0 0 14px;max-width:600px;">
        Submitted from website: <strong>${SITE_NAME}</strong>
      </p>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #ddd;">Source Website</td><td style="padding:8px;border-bottom:1px solid #ddd;">${SITE_NAME}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #ddd;">Name</td><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #ddd;">Email</td><td style="padding:8px;border-bottom:1px solid #ddd;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #ddd;">Phone</td><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(phone || 'Not provided')}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #ddd;">Property Address</td><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(property_address || 'Not provided')}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #ddd;">Appraisal Type</td><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(appraisal_type)}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #ddd;">Additional Info</td><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(message || 'None')}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#888;">Sent from palmdesertappraiser.com contact form</p>
    `;

    const toEmail = env.TO_EMAIL || 'contact@brianward.com';
    const fromEmail = env.FROM_EMAIL || 'Palm Desert Appraiser <contact@brianward.com>';

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject: `[${SITE_NAME}] New Appraisal Request — ${appraisal_type} — ${name}`,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend API error:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email. Please try again.' }),
        { status: 500, headers }
      );
    }

    // Confirmation to the submitter — CLEAN submissions only.
    //
    // Form spam carries harvested third-party addresses, so auto-replying to
    // an unverified submission means mailing a stranger from our domain and
    // spending a second Resend credit on the spammer's behalf.
    const digits = String(phone || '').replace(/\D/g, '');
    const domain = String(email).split('@')[1]?.toLowerCase() || '';
    const looksLikeSpam =
      body.website ||                                            // honeypot
      (digits.length === 11 && digits[0] !== '1') ||              // non-US pattern
      digits.length > 11 ||
      ['bk.ru', 'mail.ru', 'list.ru', 'inbox.ru', 'rambler.ru', 'yandex.ru']
        .includes(domain) ||
      /[Ѐ-ӿ]/.test(`${name} ${message} ${property_address}`) ||    // Cyrillic
      /https?:\/\/|\[url/i.test(String(message || ''));           // link in message

    if (looksLikeSpam) {
      console.log(JSON.stringify({ autoReplySuppressed: true, name, email }));
    }

    if (!looksLikeSpam) try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          reply_to: 'brian@brianward.com',
          subject: `We received your appraisal request — ${SITE_NAME}`,
          html: buildAutoReplyHtml(SITE_NAME, {
            Name: name,
            Email: email,
            Phone: phone,
            'Property Address': property_address,
            'Appraisal Type': appraisal_type,
            'Additional Info': message,
          }),
        }),
      });
    } catch (replyErr) {
      console.error('Auto-reply failed (request still received):', replyErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Your request has been submitted.' }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error('Contact form error:', err);
    return new Response(
      JSON.stringify({ error: 'Server error. Please call (760) 534-5449.' }),
      { status: 500, headers }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions(context) {
  const origin = context.request.headers.get('Origin') || '';
  const allowedOrigin =
    origin.endsWith('.pages.dev') ||
    origin.endsWith('palmdesertappraiser.com')
      ? origin
      : 'https://www.palmdesertappraiser.com';

  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function buildAutoReplyHtml(siteName, fields) {
  const rows = Object.keys(fields)
    .filter(function (k) { return fields[k]; })
    .map(function (k) {
      return `<tr><td style="padding:6px 12px;font-weight:600;width:150px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 12px;">${escapeHtml(fields[k])}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#1a5276;border-bottom:2px solid #1a5276;padding-bottom:10px;">We received your request</h2>

  <p>Hi ${escapeHtml(fields.Name)},</p>

  <p>Thank you for contacting Brian Ward Appraisal through <strong>${escapeHtml(siteName)}</strong>. Your request has been received.</p>

  <p>Brian will get back to you within <strong>24 business hours</strong>. If your matter is time-sensitive, you can reply directly to this email or call <strong>(858) 215-1553</strong>.</p>

  <h3 style="color:#555;margin-top:24px;">What you sent us</h3>
  <table style="width:100%;border-collapse:collapse;background:#f9f9f9;border-radius:6px;">${rows}</table>

  <p style="margin-top:24px;">Thank you,<br>
  <strong>Brian Ward</strong><br>
  California Certified Residential Real Estate Appraiser<br>
  License No. AR036053</p>

  <p style="margin-top:30px;padding-top:16px;border-top:1px solid #ddd;font-size:13px;color:#888;">
    This is an automatic confirmation that your submission on ${escapeHtml(siteName)} was received.
    You do not need to submit the form again.
  </p>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
