// GemShield admin page, served at /admin.
// The page contains no secrets. You type your ADMIN_TOKEN once; it is kept only
// in this browser tab (sessionStorage) and is forgotten when the tab is closed.
/**
 * @param {string} apiBase  '' when served by the GemShield server itself (/admin);
 *                          the server's full address when the page is hosted elsewhere
 *                          (e.g. uploaded to ornategems.com).
 */
export function adminPage(apiBase = '') {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>GemShield Admin</title>
<style>
  :root{--brand:#0B3B2E;--gold:#D4A537;--bg:#F4F6F5;--card:#fff;--text:#13201C;--muted:#5B6B66;--border:#E1E7E4;
        --green:#1E9E5A;--red:#D63B3B;--yellow:#E0A100}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
  header{background:var(--brand);color:#fff;padding:14px 18px;display:flex;align-items:center;gap:10px}
  header .logo{width:34px;height:34px;border-radius:10px;border:2px solid var(--gold);display:flex;align-items:center;
        justify-content:center;color:var(--gold);font-size:18px}
  header h1{font-size:18px;margin:0;flex:1}
  header button{background:transparent;color:#fff;border:1px solid #ffffff66;border-radius:8px;padding:6px 10px;cursor:pointer}
  main{max-width:1000px;margin:0 auto;padding:16px}
  .card{background:var(--card);border-radius:14px;padding:16px;margin-bottom:16px;box-shadow:0 4px 14px rgba(11,59,46,.07)}
  h2{font-size:16px;margin:0 0 12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .stat{background:#F7F9F8;border:1px solid var(--border);border-radius:12px;padding:12px}
  .stat .v{font-size:22px;font-weight:800;color:var(--brand)}
  .stat .l{font-size:12px;color:var(--muted);margin-top:2px}
  .stat.live{border-color:var(--green);background:#EEF8F2}
  label{font-size:13px;color:var(--muted);display:block;margin:8px 0 4px}
  input{font-size:16px;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;width:100%}
  input.code{text-transform:uppercase;letter-spacing:1px;font-family:ui-monospace,Consolas,monospace}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .row > div{flex:1;min-width:140px}
  button.act{font-size:15px;font-weight:700;border:0;border-radius:10px;padding:11px 16px;cursor:pointer;white-space:nowrap}
  .primary{background:var(--brand);color:#fff}.gold{background:var(--gold);color:var(--brand)}
  .danger{background:#fff;color:var(--red);border:1.5px solid var(--red)!important}
  .result{margin-top:10px;font-size:14px;padding:10px 12px;border-radius:10px;display:none}
  .ok{display:block;background:#EEF8F2;color:#14613F}.err{display:block;background:#FDEBEB;color:#9B2323}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--border);vertical-align:top}
  th{color:var(--muted);font-weight:600}
  .tag{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:2px 6px}
  .t-live{background:#EEF8F2;color:var(--green)}.t-test{background:#FFF6DB;color:#8A6400}
  .t-paid{background:#EEF8F2;color:var(--green)}.t-created{background:#F1F3F2;color:var(--muted)}
  .mono{font-family:ui-monospace,Consolas,monospace}
  .scroll{overflow-x:auto}
  .muted{color:var(--muted);font-size:13px}
  #login{max-width:420px;margin:40px auto}
  .hidden{display:none}
</style></head>
<body>
<header><div class="logo">◆</div><h1>GemShield Admin</h1>
  <button id="refreshBtn" class="hidden" onclick="loadAll()">↻ Refresh</button>
  <button id="logoutBtn" class="hidden" onclick="logout()">Log out</button></header>
${apiBase ? `<div style="background:#FFF6DB;color:#5B4A00;font-size:12px;padding:6px 18px">Server: ${apiBase} — first load can take up to a minute if the free server is asleep.</div>` : ''}

<main>
  <div id="login" class="card">
    <h2>Sign in</h2>
    <p class="muted">Enter your admin token (the ADMIN_TOKEN setting on Render). It is kept only in this browser tab.</p>
    <label for="tok">Admin token</label>
    <input id="tok" type="password" autocomplete="off" placeholder="adm_...">
    <div style="margin-top:12px"><button class="act primary" onclick="login()">Open admin</button></div>
    <div id="loginMsg" class="result"></div>
  </div>

  <div id="app" class="hidden">
    <div class="card">
      <h2>Overview</h2>
      <div class="grid" id="stats"></div>
      <p class="muted" style="margin-top:10px">Test payments use Razorpay test keys (no real money). Live payments appear once you switch to rzp_live keys.</p>
    </div>

    <div class="card">
      <h2>Customer</h2>
      <div class="row">
        <div><label for="code">Account code (from the customer's home screen)</label>
          <input id="code" class="code" maxlength="12" placeholder="A1B2C3D4"></div>
        <div style="flex:0"><button class="act primary" onclick="lookup()">Look up</button></div>
      </div>
      <div id="lookupMsg" class="result"></div>

      <div class="row" style="margin-top:6px">
        <div><label for="n">Number of reports</label><input id="n" type="number" min="1" value="1"></div>
        <div style="flex:0"><button class="act gold" onclick="adjust(1)" id="addBtn">+ Add reports</button></div>
        <div style="flex:0"><button class="act danger" onclick="adjust(-1)" id="removeBtn">− Remove reports</button></div>
      </div>
      <div id="adjustMsg" class="result"></div>
    </div>

    <div class="card">
      <h2>Customer changed phone</h2>
      <p class="muted">Customer sends both codes on WhatsApp. All remaining reports move from the old phone to the new phone.</p>
      <div class="row">
        <div><label for="from">Old phone code</label><input id="from" class="code" maxlength="12" placeholder="OLD12345"></div>
        <div><label for="to">New phone code</label><input id="to" class="code" maxlength="12" placeholder="NEW67890"></div>
        <div style="flex:0"><button class="act primary" onclick="transfer()" id="transferBtn">Transfer to new phone</button></div>
      </div>
      <div id="transferMsg" class="result"></div>
    </div>

    <div class="card">
      <h2>Recent payments</h2>
      <div class="scroll"><table id="orders"></table></div>
    </div>

    <div class="card">
      <h2>Recent reports</h2>
      <div class="scroll"><table id="reports"></table></div>
    </div>
  </div>
</main>

<script>
  var API = ${JSON.stringify(apiBase.replace(/\/+$/, ''))};
  var KEY = 'gs_admin_token';
  function token() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return window._tok || ''; } }
  function setToken(t) { try { sessionStorage.setItem(KEY, t); } catch (e) { window._tok = t; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function msg(id, text, ok) { var el = document.getElementById(id); el.textContent = text; el.className = 'result ' + (ok ? 'ok' : 'err'); }
  function clean(v) { return String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
  function rupees(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
  function when(d) { if (!d) return ''; var x = new Date(d); return x.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }

  function api(path, body) {
    return fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ 'x-admin-token': token() }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { logout(); throw new Error('Wrong or expired admin token.'); }
        if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
        return j;
      });
    });
  }

  function login() {
    var t = document.getElementById('tok').value.trim();
    if (!t) return msg('loginMsg', 'Please enter the admin token.', false);
    setToken(t);
    api('/admin/stats').then(function () { show(true); loadAll(); })
      .catch(function (e) { msg('loginMsg', e.message, false); });
  }
  function logout() { try { sessionStorage.removeItem(KEY); } catch (e) { window._tok = ''; } show(false); }
  function show(on) {
    document.getElementById('login').classList.toggle('hidden', on);
    document.getElementById('app').classList.toggle('hidden', !on);
    document.getElementById('refreshBtn').classList.toggle('hidden', !on);
    document.getElementById('logoutBtn').classList.toggle('hidden', !on);
  }

  function loadAll() {
    api('/admin/stats').then(function (s) {
      var L = s.payments.live, T = s.payments.test;
      var items = [
        [rupees(L.rupees), 'Live money received (' + L.orders + ' payments)', 'live'],
        [rupees(T.rupees), 'Test payments (' + T.orders + ')', ''],
        [L.reports + T.reports, 'Reports bought (live + test)', ''],
        [s.reportsUsed, 'Reports used (all time)', ''],
        [s.reportsToday, 'Reports used today', ''],
        [s.unusedReports, 'Unused reports on phones', ''],
        [s.phones, 'Phones seen', ''],
        [rupees(s.aiCostInr), 'Actual AI cost so far', '']
      ];
      document.getElementById('stats').innerHTML = items.map(function (i) {
        return '<div class="stat ' + i[2] + '"><div class="v">' + esc(i[0]) + '</div><div class="l">' + esc(i[1]) + '</div></div>';
      }).join('');
    }).catch(function (e) { document.getElementById('stats').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });

    api('/admin/recent').then(function (r) {
      document.getElementById('orders').innerHTML =
        '<tr><th>When</th><th>Code</th><th>Pack</th><th>Amount</th><th>Status</th><th>Mode</th></tr>' +
        (r.orders.length ? r.orders.map(function (o) {
          return '<tr><td>' + esc(when(o.paid_at || o.created_at)) + '</td><td class="mono">' + esc(o.code) + '</td><td>' +
            esc(o.reports) + ' report' + (o.reports == 1 ? '' : 's') + '</td><td>' + rupees(o.amount_paise / 100) +
            '</td><td><span class="tag t-' + esc(o.status) + '">' + (o.status === 'paid' ? 'paid' : 'not paid') + '</span></td>' +
            '<td><span class="tag t-' + esc(o.mode) + '">' + esc(o.mode) + '</span></td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">No payments yet.</td></tr>');
      document.getElementById('reports').innerHTML =
        '<tr><th>When</th><th>Code</th><th>AI said</th><th>Engine</th><th>AI cost</th></tr>' +
        (r.reports.length ? r.reports.map(function (x) {
          return '<tr><td>' + esc(when(x.created_at)) + '</td><td class="mono">' + esc(x.code) + '</td><td>' +
            esc(String(x.stone_id || '').replace(/_/g, ' ')) + '</td><td>' + esc(x.engine) + '</td><td>' + rupees(x.cost_inr) + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="muted">No reports yet.</td></tr>');
    }).catch(function () {});
  }

  function lookup() {
    var c = clean(document.getElementById('code').value);
    if (c.length < 6) return msg('lookupMsg', 'Enter the 8-character account code.', false);
    api('/admin/device?code=' + encodeURIComponent(c)).then(function (a) {
      msg('lookupMsg', 'Account ' + a.code + ': ' + a.reports + ' report(s) left · ' + a.todayLeft + ' of ' + a.dailyLimit + ' left today.', true);
    }).catch(function (e) { msg('lookupMsg', e.message, false); });
  }

  function adjust(sign) {
    var c = clean(document.getElementById('code').value);
    var n = Math.trunc(Number(document.getElementById('n').value) || 0);
    if (c.length < 6) return msg('adjustMsg', 'Enter the account code above first.', false);
    if (n <= 0) return msg('adjustMsg', 'Enter a number of reports (1 or more).', false);
    var verb = sign > 0 ? 'ADD ' + n + ' report(s) to ' : 'REMOVE ' + n + ' report(s) from ';
    if (!confirm(verb + c + '?')) return;
    api('/admin/adjust', { code: c, reports: sign * n }).then(function (a) {
      msg('adjustMsg', 'Done. Account ' + a.code + ' now has ' + a.reports + ' report(s).', true); loadAll();
    }).catch(function (e) { msg('adjustMsg', e.message, false); });
  }

  function transfer() {
    var f = clean(document.getElementById('from').value), t = clean(document.getElementById('to').value);
    if (f.length < 6 || t.length < 6) return msg('transferMsg', 'Enter both account codes.', false);
    if (f === t) return msg('transferMsg', 'Old and new codes are the same.', false);
    if (!confirm('Move ALL reports from ' + f + ' to ' + t + '?')) return;
    api('/admin/transfer', { fromCode: f, toCode: t }).then(function (a) {
      msg('transferMsg', 'Done. New phone ' + a.code + ' now has ' + a.reports + ' report(s). Old phone set to 0.', true); loadAll();
    }).catch(function (e) { msg('transferMsg', e.message, false); });
  }

  document.getElementById('tok').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  if (token()) { api('/admin/stats').then(function () { show(true); loadAll(); }).catch(function () { show(false); }); }
</script>
</body></html>`;
}
