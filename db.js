// Database layer (Postgres, e.g. Neon free tier). Tables are created
// automatically on start-up. All table names start with gs_ so they can
// safely share a database with other projects.
//
// Model: every purchase adds report credits to a phone; each report uses one.
import pg from 'pg';
import { config } from './config.js';

let pool = null;

/** For tests: inject a pg-compatible Pool. */
export function setPool(p) {
  pool = p;
}

export function getPool() {
  if (!pool) {
    if (!config.databaseUrl) throw new Error('Server is missing DATABASE_URL.');
    pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false }, max: 5 });
  }
  return pool;
}

const q = (text, params) => getPool().query(text, params);

export async function initDb() {
  await q(`CREATE TABLE IF NOT EXISTS gs_devices (
    device_id  TEXT PRIMARY KEY,
    credits    INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS gs_orders (
    order_id     TEXT PRIMARY KEY,
    device_id    TEXT NOT NULL,
    kind         TEXT NOT NULL,
    reports      INTEGER NOT NULL,
    amount_paise INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'created',
    payment_id   TEXT,
    return_url   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at      TIMESTAMPTZ
  )`);
  await q(`CREATE TABLE IF NOT EXISTS gs_usage (
    device_id TEXT NOT NULL,
    day       TEXT NOT NULL,
    count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (device_id, day)
  )`);
  await q(`CREATE TABLE IF NOT EXISTS gs_reports (
    id         SERIAL PRIMARY KEY,
    device_id  TEXT NOT NULL,
    engine     TEXT,
    stone_id   TEXT,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    cost_inr   NUMERIC(10,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

/** Today's date in India (IST), used for the daily limit. */
export const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export async function getDevice(deviceId) {
  await q(`INSERT INTO gs_devices (device_id) VALUES ($1) ON CONFLICT (device_id) DO NOTHING`, [deviceId]);
  const { rows } = await q(`SELECT device_id, credits FROM gs_devices WHERE device_id = $1`, [deviceId]);
  return rows[0];
}

export async function usedToday(deviceId) {
  const { rows } = await q(`SELECT count FROM gs_usage WHERE device_id = $1 AND day = $2`, [deviceId, today()]);
  return rows[0]?.count || 0;
}

/** Uses one report credit and counts it for today. Returns false if none left. */
export async function useReport(deviceId) {
  const { rows } = await q(
    `UPDATE gs_devices SET credits = credits - 1 WHERE device_id = $1 AND credits > 0 RETURNING credits`,
    [deviceId]
  );
  if (!rows.length) return false;
  await q(
    `INSERT INTO gs_usage (device_id, day, count) VALUES ($1, $2, 1)
     ON CONFLICT (device_id, day) DO UPDATE SET count = gs_usage.count + 1`,
    [deviceId, today()]
  );
  return true;
}

export async function logReport(deviceId, engine, stoneId, usage = {}) {
  await q(
    `INSERT INTO gs_reports (device_id, engine, stone_id, input_tokens, output_tokens, cost_inr) VALUES ($1, $2, $3, $4, $5, $6)`,
    [deviceId, engine, stoneId || null, usage.inputTokens || 0, usage.outputTokens || 0, usage.costInr || 0]
  );
}

/** Admin: real AI cost summary. */
export async function costSummary() {
  const { rows } = await q(
    `SELECT engine, COUNT(*) AS reports, AVG(input_tokens) AS ai, AVG(output_tokens) AS ao,
            AVG(cost_inr) AS ac, SUM(cost_inr) AS tc
     FROM gs_reports GROUP BY engine`
  );
  const r = (v, d) => Math.round(Number(v || 0) * 10 ** d) / 10 ** d;
  return rows.map((x) => ({
    engine: x.engine,
    reports: Number(x.reports),
    avgInputTokens: r(x.ai, 0),
    avgOutputTokens: r(x.ao, 0),
    avgCostInrPerReport: r(x.ac, 4),
    totalCostInr: r(x.tc, 2),
  }));
}

export async function createOrderRow(orderId, deviceId, kind, reports, amountPaise, returnUrl) {
  await q(
    `INSERT INTO gs_orders (order_id, device_id, kind, reports, amount_paise, return_url) VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, deviceId, kind, reports, amountPaise, returnUrl || null]
  );
}

export async function getOrderRow(orderId) {
  const { rows } = await q(`SELECT * FROM gs_orders WHERE order_id = $1`, [orderId]);
  return rows[0] || null;
}

export async function pendingOrders(deviceId) {
  const { rows } = await q(
    `SELECT * FROM gs_orders WHERE device_id = $1 AND status = 'created' AND created_at > now() - interval '2 days'`,
    [deviceId]
  );
  return rows;
}

/**
 * Marks an order paid and adds its reports to the phone — exactly once,
 * even if called several times (payment page + later check).
 */
export async function markPaidAndGrant(orderId, paymentId) {
  const { rows } = await q(
    `UPDATE gs_orders SET status = 'paid', payment_id = $2, paid_at = now()
     WHERE order_id = $1 AND status <> 'paid' RETURNING device_id, reports`,
    [orderId, paymentId]
  );
  if (!rows.length) return false; // already granted
  const { device_id, reports } = rows[0];
  await getDevice(device_id);
  await q(`UPDATE gs_devices SET credits = credits + $2 WHERE device_id = $1`, [device_id, reports]);
  return true;
}

/** Admin: find a phone by the account code shown in the app (first 8 characters). */
export async function findByCode(code) {
  const clean = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length < 6) return [];
  const { rows } = await q(`SELECT device_id, credits FROM gs_devices WHERE upper(device_id) LIKE $1 LIMIT 2`, [`${clean}%`]);
  return rows;
}

/** Admin: move all remaining reports from an old phone to a new phone. */
export async function transferCredits(fromId, toId) {
  const from = await getDevice(fromId);
  await getDevice(toId);
  await q(`UPDATE gs_devices SET credits = credits + $2 WHERE device_id = $1`, [toId, from.credits]);
  await q(`UPDATE gs_devices SET credits = 0 WHERE device_id = $1`, [fromId]);
  return getDevice(toId);
}

/** Admin: add (or remove, with a negative number) reports for a phone. */
export async function adjustCredits(deviceId, delta) {
  await getDevice(deviceId);
  await q(`UPDATE gs_devices SET credits = GREATEST(0, credits + $2) WHERE device_id = $1`, [deviceId, delta]);
  return getDevice(deviceId);
}
