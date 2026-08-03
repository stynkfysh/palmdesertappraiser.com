/**
 * Cloudflare Pages Function — Contact Form Handler
 * Sends email via Resend API when the contact form is submitted.
 *
 * Environment variables required (set in Cloudflare Pages dashboard):
 *   RESEND_API_KEY  — Your Resend API key
 *   TO_EMAIL        — Destination email (e.g. contact@brianward.com)
 *   FROM_EMAIL      — Verified sender (e.g. noreply@palmdesertappraiser.com)
 */

// ---------------------------------------------------------------------------
// Spam scoring. Shared by every Brian Ward site's contact endpoint.
//
// Design rule: a real lead must never be silently lost. Scores land in three
// bands -- deliver, deliver-but-flag, drop -- and only overwhelming evidence
// reaches the drop band. Anything uncertain is still delivered, just marked.
//
// The auto-reply is gated on the CLEAN band only. Spammers submit harvested
// third-party addresses, so replying to an unverified submission means mailing
// strangers on the attacker's behalf and burning the sending domain.
// ---------------------------------------------------------------------------

const CLEAN = 'clean';
const SUSPECT = 'suspect';
const SPAM = 'spam';

const DROP_AT = 90;
const FLAG_AT = 50;

// Free-mail domains heavily used by form-spam tooling.
const BAD_EMAIL_DOMAINS = [
  'bk.ru', 'mail.ru', 'list.ru', 'inbox.ru', 'rambler.ru', 'yandex.ru',
  'internet.ru', 'bigpind.com', 'outllook.com',
];

// Placeholder locality tokens seen across this campaign.
const JUNK_PLACES = [
  'leo', 'tro', 'mtskheta', 'lilongwe', 'porsgrunn', 'shekhupura',
  'lac la biche', 'tbilisi', 'kralupy', 'gujranwala',
];

const VALID_PURPOSES = [
  // brianward.com and the market-area sites
  'bankruptcy', 'date-of-death', 'divorce', 'estate', 'tax', 'before-buying',
  'before-selling', 'family-transaction', 'insurance-dispute', 'pmi-removal',
  'bonds', 'other',
  // date-of-death.com
  'step-up', 'trust', 'gift-tax', 'estate-tax',
];

function scoreSubmission(f) {
  const reasons = [];
  let score = 0;
  const add = (n, why) => { score += n; reasons.push(`${why} (+${n})`); };

  const name = (f.name || '').trim();
  const email = (f.email || '').trim();
  const phone = (f.phone || '').trim();
  const street = (f.street || '').trim();
  const city = (f.city || '').trim();
  const zip = (f.zip || '').trim();
  const message = (f.message || '').trim();
  const purpose = (f.purpose || '').trim();
  const all = [name, email, phone, street, city, zip, message].join(' ');

  // --- Hard signal: only an automated client fills a hidden field ---
  if (f.honeypot) add(100, 'hidden honeypot field was filled');

  // --- Cloudflare Turnstile (skipped entirely when not configured) ---
  if (f.turnstile === 'failed') add(60, 'failed Cloudflare Turnstile');
  if (f.turnstile === 'passed') {
    // Strong proof of a real browser and a real person.
    score -= 40;
    reasons.push('passed Cloudflare Turnstile (-40)');
  }

  // --- Proof the submission came from a real page load ---
  // Deliberately NOT stacked on top of a Turnstile failure. Both the token
  // and the Turnstile widget depend on JavaScript, so a visitor with scripts
  // blocked fails both at once. Charging for both would push an ordinary
  // client over the drop threshold on a single underlying cause and lose a
  // real lead. Counted only when Turnstile has not already spoken.
  if (!f.tokenValid && f.turnstile !== 'passed' && f.turnstile !== 'failed') {
    add(40, 'no valid form token (posted directly to the API)');
  }
  if (f.dwellMs != null && f.dwellMs < 3000) add(40, 'submitted under 3s after page load');

  // --- Non-Latin script in a California appraisal form ---
  if (/[Ѐ-ӿ؀-ۿ一-鿿]/.test(all)) add(50, 'non-Latin script');

  // --- Contact details ---
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] !== '1') add(35, 'phone is 11 digits not starting with 1');
  else if (digits.length > 11) add(25, 'phone has more than 11 digits');

  const domain = (email.split('@')[1] || '').toLowerCase();
  if (BAD_EMAIL_DOMAINS.includes(domain)) add(40, `email domain ${domain}`);

  if (name && !/\s/.test(name) && name.length >= 8) add(25, 'single-token name');

  // --- Address plausibility ---
  if (street && city && street.toLowerCase() === city.toLowerCase()) {
    add(30, 'street and city are identical');
  }
  if (street && !/\d/.test(street)) add(25, 'street address contains no number');
  if (JUNK_PLACES.includes(city.toLowerCase()) || JUNK_PLACES.includes(street.toLowerCase())) {
    add(30, 'known placeholder locality');
  }
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) add(20, 'zip is not a US 5-digit code');

  // --- Payload ---
  if (/https?:\/\/|www\.|\[url|\[link|<a\s/i.test(message)) add(35, 'message contains a link');
  if (purpose && !VALID_PURPOSES.includes(purpose.toLowerCase().replace(/\s+/g, '-'))) {
    add(20, 'appraisal purpose is not one of the form options');
  }

  if (score < 0) score = 0;

  let verdict = CLEAN;
  if (score >= DROP_AT) verdict = SPAM;
  else if (score >= FLAG_AT) verdict = SUSPECT;

  return { score, verdict, reasons };
}

// --- Cloudflare Turnstile -------------------------------------------------
// Free, unlimited. Managed mode: real visitors normally see a brief self-
// resolving box and never click anything.
//
// Two deliberate design choices:
//
// 1. DORMANT UNTIL CONFIGURED. With no TURNSTILE_SECRET_KEY set, this is a
//    no-op and scoring behaves exactly as before. Deploying the code cannot
//    break a form before the keys exist.
//
// 2. FAILURE IS SCORED, NOT FATAL. A failed or missing Turnstile token adds
//    weight rather than hard-rejecting, so a real client on a flaky network or
//    with a blocked third-party script still reaches Brian, flagged. Losing a
//    genuine estate lead costs far more than glancing at a flagged one.
//
// Two secrets are supported because the free plan caps a widget at 10
// hostnames and the brianward.com endpoint serves more than that across the
// market-area sites.

async function verifyTurnstile(token, ip, env) {
  const secrets = [env.TURNSTILE_SECRET_KEY, env.TURNSTILE_SECRET_KEY_2].filter(Boolean);
  if (!secrets.length) return 'unconfigured';
  if (!token) return 'failed';

  for (const secret of secrets) {
    try {
      const body = new FormData();
      body.append('secret', secret);
      body.append('response', token);
      if (ip) body.append('remoteip', ip);
      const r = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body }
      );
      const d = await r.json();
      if (d.success) return 'passed';
    } catch (e) {
      // Network trouble reaching Cloudflare must not decide the outcome.
      console.error('Turnstile verify error:', e.message);
      return 'unconfigured';
    }
  }
  return 'failed';
}

// --- Form token: proves a real browser loaded the page before submitting ----
// HMAC-signed timestamp. Bots that POST straight at the endpoint have none.

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function formSecret(env) {
  return env.FORM_SECRET || env.RESEND_API_KEY || 'fallback-secret';
}

async function issueToken(env) {
  const ts = Date.now();
  const nonce = crypto.randomUUID();
  const sig = await hmac(formSecret(env), `${ts}.${nonce}`);
  return `${ts}.${nonce}.${sig}`;
}

// Returns { valid, dwellMs }
async function verifyToken(token, env) {
  if (!token || typeof token !== 'string') return { valid: false, dwellMs: null };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, dwellMs: null };
  const [ts, nonce, sig] = parts;
  const expected = await hmac(formSecret(env), `${ts}.${nonce}`);
  if (sig !== expected) return { valid: false, dwellMs: null };
  const age = Date.now() - Number(ts);
  if (!(age >= 0 && age < 7200000)) return { valid: false, dwellMs: age };
  return { valid: true, dwellMs: age };
}

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

    const turnstile = await verifyTurnstile(
      body['cf-turnstile-response'] || body.cf_turnstile_response,
      request.headers.get('CF-Connecting-IP'),
      env
    );
    const { valid: tokenValid, dwellMs } = await verifyToken(body._token, env);
    const { score: spamScore, verdict, reasons: spamReasons } = scoreSubmission({
      name, email, phone,
      street: property_address, message,
      purpose: appraisal_type,
      honeypot: body.website || body.company_url,
      tokenValid, dwellMs, turnstile,
    });

    // Drop outright: no notification, no auto-reply, no Resend credit spent.
    if (verdict === SPAM) {
      console.log(JSON.stringify({
        blocked: true, site: SITE_NAME, name, email,
        score: spamScore, reasons: spamReasons,
      }));
      return new Response(
        JSON.stringify({ success: true, message: 'Your request has been submitted.' }),
        { status: 200, headers }
      );
    }

    const flagged = verdict === SUSPECT;

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
        subject: `${flagged ? '[POSSIBLE SPAM] ' : ''}[${SITE_NAME}] New Appraisal Request — ${appraisal_type} — ${name}`,
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

    if (verdict === CLEAN) try {
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
