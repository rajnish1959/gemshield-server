// GemShield API server — keeps AI keys off the phone, sells report credits
// through Razorpay, and only runs the AI for paid reports.
// Needs Node.js 20+. One dependency: pg (Postgres client).
//
// App endpoints (header x-app-token required):
//   GET  /account?deviceId=...      balance, prices, today's remaining reports
//   POST /pay/create                { deviceId, kind: "single" | "shop" | "pro", returnUrl } -> { url }
//   POST /analyze                   { deviceId, macro, line, lang: "en" | "hi" }  (uses 1 report)
// Browser endpoints (payment page):
//   GET  /pay/checkout/:orderId     Razorpay checkout page
//   POST /pay/verify                called by the checkout page after payment
// Admin endpoints (header x-admin-token):
//   GET  /admin/device?code=XXXXXXXX
//   POST /admin/transfer            { fromCode, toCode }
//   POST /admin/adjust              { code, reports }   (+ or -)
//   GET  /admin/costs               real AI cost per report so far
// Health: GET /health
import http from 'node:http';
import { config } from './config.js';
import * as db from './db.js';
import * as rzp from './razorpay.js';
import { analyze } from './ai.js';
import { checkoutPage, messagePage } from './pages.js';

const MAX_BODY = 6 * 1024 * 1024;
const AI_TIMEOUT_MS = 60_000;

/* ---------- small helpers ---------- */
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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
async function readJson(req) {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : 'Bad request.'), { status: e.status || 400 });
  }
}
const validDevice = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id);
const isB64 = (s) => typeof s === 'string' && s.length > 1000 && /^[A-Za-z0-9+/=\r\n]+$/.test(s.slice(0, 2000));
const accountCode = (id) => String(id).slice(0, 8).toUpperCase();
const baseUrl = (req) => `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

/* ---------- anti-hammering (memory) + wallet safety net ---------- */
const hourly = new Map();
let globalDay = { date: '', count: 0 };
function hammerCheck(deviceId) {
  const now = Date.now();
  const d = db.today();
  if (globalDay.date !== d) globalDay = { date: d, count: 0 };
  if (globalDay.count >= config.globalDaily) return 'GemShield is very busy today. Please try again tomorrow.';
  let h = hourly.get(deviceId);
  if (!h || h.resetAt < now) hourly.set(deviceId, (h = { count: 0, resetAt: now + 3_600_000 }));
  if (h.count >= config.perDeviceHourly) return 'Too many attempts from this phone. Please wait an hour.';
  h.count += 1;
  globalDay.count += 1;
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hourly) if (v.resetAt < now) hourly.delete(k);
}, 600_000).unref();

/* ---------- products ---------- */
function productList() {
  return [
    { kind: 'single', reports: 1, price: config.priceSingle },
    { kind: 'shop', reports: config.shopReports, price: config.priceShop },
    { kind: 'pro', reports: config.proReports, price: config.pricePro },
  ].filter((p) => p.reports > 0 && p.price > 0);
}
function product(kind) {
  const p = productList().find((x) => x.kind === kind);
  if (!p) return null;
  return { ...p, rupees: p.price, label: p.reports === 1 ? 'GemShield — 1 full report' : `GemShield — ${p.reports} reports` };
}

/** Checks Razorpay for any of this phone's unfinished orders that were actually paid. */
async function reconcile(deviceId) {
  if (!config.rzpKeyId) return;
  for (const order of await db.pendingOrders(deviceId)) {
    try {
      const list = await rzp.fetchOrderPayments(order.order_id);
      for (const p of list?.items || []) {
        if (await rzp.confirmPayment(p, order.order_id, order.amount_paise)) {
          await db.markPaidAndGrant(order.order_id, p.id);
          break;
        }
      }
    } catch (e) {
      console.error('[reconcile]', order.order_id, e.message);
    }
  }
}

async function accountInfo(deviceId) {
  const dev = await db.getDevice(deviceId);
  const used = await db.usedToday(deviceId);
  const todayLeft = Math.max(0, config.dailyLimit - used);
  return {
    code: accountCode(deviceId),
    reports: dev.credits,
    todayLeft,
    dailyLimit: config.dailyLimit,
    canAnalyze: dev.credits > 0 && todayLeft > 0,
    products: productList(),
  };
}

/* ---------- routes ---------- */
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const appOk = config.appToken && req.headers['x-app-token'] === config.appToken;

  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    return send(res, 200, { ok: true, service: 'gemshield', provider: config.aiProvider });
  }

  /* --- account --- */
  if (req.method === 'GET' && path === '/account') {
    if (!appOk) return send(res, 401, { error: 'Not authorised.' });
    const deviceId = url.searchParams.get('deviceId');
    if (!validDevice(deviceId)) return send(res, 400, { error: 'Invalid phone ID.' });
    await reconcile(deviceId);
    return send(res, 200, await accountInfo(deviceId));
  }

  /* --- start a payment --- */
  if (req.method === 'POST' && path === '/pay/create') {
    if (!appOk) return send(res, 401, { error: 'Not authorised.' });
    const { deviceId, kind, returnUrl } = await readJson(req);
    const prod = product(kind);
    // Only allow returning to the GemShield app (APK) or Expo Go during testing.
    const safeReturn = typeof returnUrl === 'string' && /^(gemshield|exp|exps):\/\/[^\s"'<>]*$/.test(returnUrl) ? returnUrl : null;
    if (!validDevice(deviceId) || !prod) return send(res, 400, { error: 'Bad request.' });
    const amountPaise = Math.round(prod.rupees * 100);
    const order = await rzp.createOrder(amountPaise, `gs_${Date.now()}`, { deviceId, kind });
    await db.createOrderRow(order.id, deviceId, prod.kind, prod.reports, amountPaise, safeReturn);
    return send(res, 200, { url: `${baseUrl(req)}/pay/checkout/${order.id}`, orderId: order.id });
  }

  /* --- payment page (opened in the phone's browser) --- */
  if (req.method === 'GET' && path.startsWith('/pay/checkout/')) {
    const orderId = decodeURIComponent(path.slice('/pay/checkout/'.length));
    const order = await db.getOrderRow(orderId);
    if (!order) return sendHtml(res, 404, messagePage('Payment not found', 'Please go back to the GemShield app and try again.'));
    if (order.status === 'paid') {
      return sendHtml(res, 200, messagePage('Already paid', 'This payment is complete. Go back to the GemShield app.'));
    }
    const prod = product(order.kind);
    return sendHtml(
      res,
      200,
      checkoutPage({
        keyId: config.rzpKeyId,
        orderId,
        amountPaise: order.amount_paise,
        label: prod?.label || 'GemShield reports',
        businessName: config.businessName,
        returnUrl: order.return_url || config.appReturnUrl,
      })
    );
  }

  /* --- payment confirmation from the checkout page --- */
  if (req.method === 'POST' && path === '/pay/verify') {
    const { order_id, payment_id, signature } = await readJson(req);
    const order = await db.getOrderRow(order_id);
    if (!order || !rzp.signatureOk(order_id, payment_id, signature)) return send(res, 400, { ok: false });
    const payment = await rzp.fetchPayment(payment_id);
    if (!(await rzp.confirmPayment(payment, order_id, order.amount_paise))) return send(res, 400, { ok: false });
    await db.markPaidAndGrant(order_id, payment_id);
    console.log(`[pay] ${order.kind} paid for ${accountCode(order.device_id)}`);
    return send(res, 200, { ok: true });
  }

  /* --- analyse (uses 1 report) --- */
  if (req.method === 'POST' && path === '/analyze') {
    if (!appOk) return send(res, 401, { error: 'Not authorised.' });
    const data = await readJson(req);
    if (!validDevice(data.deviceId)) return send(res, 400, { error: 'Invalid phone ID.' });
    if (!isB64(data.macro) || !isB64(data.line)) return send(res, 400, { error: 'Both photos are required.' });

    const info = await accountInfo(data.deviceId);
    if (info.reports <= 0) return send(res, 402, { error: 'Please buy a report to see the result.', code: 'PAYMENT_REQUIRED' });
    if (info.todayLeft <= 0) {
      return send(res, 429, { error: `Daily limit of ${config.dailyLimit} reports reached. Please continue tomorrow.`, code: 'DAILY_LIMIT' });
    }
    const hammer = hammerCheck(data.deviceId);
    if (hammer) return send(res, 429, { error: hammer, code: 'RATE_LIMIT' });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    const started = Date.now();
    let result, usage;
    try {
      const lang = data.lang === 'hi' ? 'hi' : 'en';
      ({ result, usage } = await analyze(data.macro, data.line, ctrl.signal, lang));
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'The AI took too long. Please try again — your report was not used.' : `${e.message} Your report was not used.`;
      console.error(`[analyze] ${config.aiProvider} failed: ${e.message}`);
      return send(res, 502, { error: msg });
    } finally {
      clearTimeout(timer);
    }
    // Only now — after a successful result — is the report used.
    if (!(await db.useReport(data.deviceId))) {
      return send(res, 402, { error: 'Please buy a report to see the result.', code: 'PAYMENT_REQUIRED' });
    }
    await db.logReport(data.deviceId, config.aiProvider, result?.stoneId, usage).catch(() => {});
    console.log(
      `[analyze] ${config.aiProvider} ok ${Date.now() - started}ms ${accountCode(data.deviceId)} ` +
        `tokens in=${usage.inputTokens} out=${usage.outputTokens} cost=₹${usage.costInr}`
    );
    return send(res, 200, { ...result, engine: config.aiProvider, account: await accountInfo(data.deviceId) });
  }

  /* --- admin (you only) --- */
  if (path.startsWith('/admin/')) {
    if (!config.adminToken || req.headers['x-admin-token'] !== config.adminToken) return send(res, 401, { error: 'Not authorised.' });
    const one = async (code) => {
      const rows = await db.findByCode(code);
      if (rows.length !== 1) throw Object.assign(new Error(`Account code ${code} not found (or not unique).`), { status: 404 });
      return rows[0].device_id;
    };
    if (req.method === 'GET' && path === '/admin/device') {
      const id = await one(url.searchParams.get('code'));
      return send(res, 200, await accountInfo(id));
    }
    if (req.method === 'GET' && path === '/admin/costs') {
      return send(res, 200, { currency: 'INR', byEngine: await db.costSummary() });
    }
    if (req.method === 'POST' && path === '/admin/transfer') {
      const { fromCode, toCode } = await readJson(req);
      const dev = await db.transferCredits(await one(fromCode), await one(toCode));
      return send(res, 200, { ok: true, code: accountCode(dev.device_id), reports: dev.credits });
    }
    if (req.method === 'POST' && path === '/admin/adjust') {
      const { code, reports } = await readJson(req);
      const dev = await db.adjustCredits(await one(code), Math.trunc(Number(reports) || 0));
      return send(res, 200, { ok: true, code: accountCode(dev.device_id), reports: dev.credits });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

export const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error('[server]', e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? `Server error: ${e.message}` : e.message });
  }
});

export async function start() {
  await db.initDb();
  server.listen(config.port, () => console.log(`GemShield server on :${config.port} using ${config.aiProvider}`));
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((e) => {
    console.error('Failed to start:', e.message);
    process.exit(1);
  });
}
