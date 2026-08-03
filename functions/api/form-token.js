// Issues the short-lived signed token the contact form must present.
const ALLOWED = ['https://palmdesertappraiser.com', 'https://www.palmdesertappraiser.com'];

function corsFor(request) {
  const o = request.headers.get('Origin') || '';
  const allow = (ALLOWED.includes(o) || o.endsWith('.pages.dev')) ? o : ALLOWED[1];
  return { 'Access-Control-Allow-Origin': allow };
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const secret = env.FORM_SECRET || env.RESEND_API_KEY || 'fallback-secret';
  const ts = Date.now();
  const nonce = crypto.randomUUID();
  const sig = await hmac(secret, `${ts}.${nonce}`);
  return new Response(JSON.stringify({ token: `${ts}.${nonce}.${sig}` }), {
    headers: { ...corsFor(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions(context) {
  return new Response(null, {
    headers: {
      ...corsFor(context.request),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
