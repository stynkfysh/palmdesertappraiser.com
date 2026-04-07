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

    // Build email body
    const emailHtml = `
      <h2>New Appraisal Request</h2>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">
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
        subject: `New Appraisal Request — ${appraisal_type} — ${name}`,
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
