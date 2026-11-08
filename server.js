// GemShield API server — keeps the AI keys off the phone.
// Zero dependencies: plain Node.js 20+ (built-in http + fetch).
//
// Endpoints
//   GET  /health     -> { ok: true }                 (used by Render + app wake-up)
//   POST /analyze    -> body { macro: "<base64 jpeg>", line: "<base64 jpeg>", deviceId?: "..." }
//                       header  x-app-token: <APP_TOKEN>
//                       returns the AI's JSON result (the app normalises it)
//
// Settings (Render → Environment). Only the keys you use are needed.
//   GEMINI_API_KEY      Google AI Studio key
//   ANTHROPIC_API_KEY   Claude Console key
//   AI_PROVIDER         gemini | claude          (default: gemini)
//   GEMINI_MODEL        default gemini-3.6-flash
//   CLAUDE_MODEL        default claude-haiku-5-5
//   CLAUDE_EFFORT       default low
//   APP_TOKEN           any long random text; the app sends the same text
//   LIMIT_PER_DEVICE_PER_HOUR   default 20
//   LIMIT_PER_DAY               default 300  (protects your wallet)
import http from 'node:http';
import { VISION_PROMPT, parseJsonReply } from './prompt.js';

const env = process.env;
const PORT = Number(env.PORT) || 3000;
const PROVIDER = (env.AI_PROVIDER || 'gemini').toLowerCase();
const APP_TOKEN = env.APP_TOKEN || '';
const PER_DEVICE_HOUR = Number(env.LIMIT_PER_DEVICE_PER_HOUR) || 20;
const PER_DAY = Number(env.LIMIT_PER_DAY) || 300;
const MAX_BODY = 6 * 1024 * 1024; // 6 MB
const AI_TIMEOUT_MS = 60_000;

/* ---------------- rate limits (in memory; reset when server restarts) ---------------- */
const hourly = new Map(); // key -> { count, resetAt }
let day = { date: '', count: 0 };

function checkLimits(key) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (day.date !== today) day = { date: today, count: 0 };
  if (day.count >= PER_DAY) return 'Daily limit reached for GemShield. Please try again tomorrow.';

  const h = hourly.get(key);
  if (!h || h.resetAt < now) hourly.set(key, { count: 0, resetAt: now + 3_600_000 });
  const slot = hourly.get(key);
  if (slot.count >= PER_DEVICE_HOUR) return 'Too many checks from this phone. Please wait an hour.';

  slot.count += 1;
  day.count += 1;
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hourly) if (v.resetAt < now) hourly.delete(k);
}, 600_000).unref();

/* ---------------- AI providers ---------------- */
async function readError(res, who) {
  let msg = `${who} error ${res.status}`;
  try {
    const j = await res.json();
    if (j?.error?.message) msg += `: ${j.error.message}`;
  } catch {}
  return msg;
}

async function callGemini(macro, line, signal) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('Server is missing GEMINI_API_KEY.');
  const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Photo 1 — macro photo of the stone:' },
            { inline_data: { mime_type: 'image/jpeg', data: macro } },
            { text: 'Photo 2 — line-doubling test through the back of the stone:' },
            { inline_data: { mime_type: 'image/jpeg', data: line } },
            { text: VISION_PROMPT },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Gemini'));
  const json = await res.json();
  const cand = json?.candidates?.[0];
  if (cand?.finishReason === 'MAX_TOKENS') throw new Error('Gemini reply was cut off. Please try again.');
  const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
  return parseJsonReply(text, 'Gemini');
}

async function callClaude(macro, line, signal) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Server is missing ANTHROPIC_API_KEY.');
  const img = (data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-haiku-5-5',
      max_tokens: 4000,
      output_config: { effort: env.CLAUDE_EFFORT || 'low' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Photo 1 — macro photo of the stone:' },
            img(macro),
            { type: 'text', text: 'Photo 2 — line-doubling test through the back of the stone:' },
            img(line),
            { type: 'text', text: VISION_PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Claude'));
  const json = await res.json();
  if (json?.stop_reason === 'max_tokens') throw new Error('Claude reply was cut off. Please try again.');
  const text = (json?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseJsonReply(text, 'Claude');
}

const PROVIDERS = { gemini: callGemini, claude: callClaude };

/* ---------------- HTTP plumbing ---------------- */
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Photos too large.'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const isB64 = (s) => typeof s === 'string' && s.length > 1000 && /^[A-Za-z0-9+/=\r\n]+$/.test(s.slice(0, 2000));

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return send(res, 200, { ok: true, service: 'gemshield', provider: PROVIDER });
    }

    if (req.method !== 'POST' || url.pathname !== '/analyze') {
      return send(res, 404, { error: 'Not found' });
    }

    if (!APP_TOKEN || req.headers['x-app-token'] !== APP_TOKEN) {
      return send(res, 401, { error: 'Not authorised.' });
    }

    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e.status || 400, { error: e.status ? e.message : 'Bad request.' });
    }
    if (!isB64(data?.macro) || !isB64(data?.line)) {
      return send(res, 400, { error: 'Both photos are required.' });
    }

    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const who = typeof data.deviceId === 'string' && data.deviceId ? `d:${data.deviceId.slice(0, 64)}` : `ip:${ip}`;
    const limitMsg = checkLimits(who);
    if (limitMsg) return send(res, 429, { error: limitMsg });

    const run = PROVIDERS[PROVIDER];
    if (!run) return send(res, 500, { error: `Unknown AI_PROVIDER "${PROVIDER}".` });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    const started = Date.now();
    try {
      const result = await run(data.macro, data.line, ctrl.signal);
      console.log(`[analyze] ${PROVIDER} ok ${Date.now() - started}ms ${result?.stoneId || ''}`);
      return send(res, 200, { ...result, engine: PROVIDER });
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'The AI took too long. Please try again.' : e.message;
      console.error(`[analyze] ${PROVIDER} failed: ${msg}`);
      return send(res, 502, { error: msg });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) send(res, 500, { error: 'Server error.' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`GemShield server on :${PORT} using ${PROVIDER}`));
}
