// HTML pages shown in the phone's browser during payment.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const shell = (title, body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F4F6F5;color:#13201C;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:#fff;border-radius:18px;padding:28px 22px;max-width:360px;width:88%;text-align:center;
        box-shadow:0 6px 24px rgba(11,59,46,.12)}
  .logo{font-size:30px;color:#D4A537;background:#0B3B2E;width:56px;height:56px;border-radius:16px;
        display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  h1{font-size:20px;margin:6px 0}
  p{color:#5B6B66;font-size:14px;line-height:1.45}
  .price{font-size:28px;font-weight:800;color:#0B3B2E;margin:10px 0}
  a.btn,button{display:block;width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:15px;
        font-size:16px;font-weight:700;margin-top:12px;text-decoration:none}
  .gold{background:#D4A537;color:#0B3B2E}.dark{background:#0B3B2E;color:#fff}
  .small{font-size:12px;color:#5B6B66;margin-top:14px}
  .big{font-size:18px;padding:18px;line-height:1.35}
  .closeTip{display:flex;gap:12px;align-items:center;text-align:left;background:#FFF6DB;border:2px solid #D4A537;
        border-radius:14px;padding:14px;margin-top:14px;font-size:15px;color:#13201C;line-height:1.4}
  .arrow{font-size:40px;color:#0B3B2E;font-weight:900;line-height:1}
  .hi{font-size:14px;font-weight:600}
  .tick{width:72px;height:72px;border-radius:36px;background:#1E9E5A;color:#fff;font-size:42px;font-weight:900;
        display:flex;align-items:center;justify-content:center;margin:4px auto 10px}
  .tick.warn{background:#E0A100}
  .spin{width:48px;height:48px;border:5px solid #E1E7E4;border-top-color:#0B3B2E;border-radius:50%;
        margin:10px auto;animation:sp 0.9s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
</style></head><body><div class="card"><div class="logo">◆</div>${body}</div></body></html>`;

const withParam = (u, p) => u + (u.includes('?') ? '&' : '?') + p;

// Android apps that can receive the "return to app" link.
const ANDROID_PACKAGES = {
  gemshield: 'in.ornategems.gemshield', // the GemShield APK
  exp: 'host.exp.exponent', // Expo Go (testing)
  exps: 'host.exp.exponent',
};

/**
 * Android "intent://" form of an app link. Chrome and most Android browsers
 * open the app reliably from this when the user taps it, unlike a bare
 * custom-scheme link inside a payment window.
 */
function androidIntent(url) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(url);
  if (!m) return url;
  const scheme = m[1].toLowerCase();
  const pkg = ANDROID_PACKAGES[scheme];
  return `intent://${m[2]}#Intent;scheme=${scheme};${pkg ? `package=${pkg};` : ''}end`;
}

/**
 * How to get back to the app. Closing the window (✕) always works on Android,
 * so it is the main instruction; the app button is offered as a second option.
 */
function returnButtons(url) {
  return `<div class="closeTip">
         <div class="arrow">↖</div>
         <div><b>Tap ✕ at the top-left to return to GemShield</b><br>
         <span class="hi">GemShield पर लौटने के लिए ऊपर बाईं ओर ✕ दबाएँ</span></div>
       </div>
       <p class="small">Your report will start automatically. · आपकी रिपोर्ट अपने-आप शुरू होगी।</p>
       <a class="btn dark" href="${esc(androidIntent(url))}">Or open GemShield · या GemShield खोलें</a>`;
}

export function checkoutPage({ keyId, orderId, amountPaise, label, businessName, returnUrl }) {
  const rupees = (amountPaise / 100).toLocaleString('en-IN');
  const opts = {
    key: keyId,
    order_id: orderId,
    amount: amountPaise,
    currency: 'INR',
    name: businessName,
    description: label,
    theme: { color: '#0B3B2E' },
  };
  const back = (st) => withParam(returnUrl, `status=${st}`);
  return shell(
    'GemShield payment',
    `<div id="payView">
       <h1>GemShield</h1>
       <p>${esc(label)}</p>
       <div class="price">₹${esc(rupees)}</div>
       <button class="gold" id="pay">Pay securely · सुरक्षित भुगतान करें</button>
       <a class="btn dark" href="${esc(back('cancel'))}">Cancel · रद्द करें</a>
       <p class="small">One-time payment. Non-refundable. Payments by Razorpay (UPI, cards, net banking).<br>
       एक बार का भुगतान। वापसी योग्य नहीं। भुगतान Razorpay द्वारा (UPI, कार्ड, नेट बैंकिंग)।</p>
       <p id="msg" class="small"></p>
     </div>

     <div id="waitView" style="display:none">
       <div class="spin"></div>
       <h1>Confirming payment…</h1>
       <p>भुगतान की पुष्टि हो रही है… Please wait a few seconds.</p>
     </div>

     <div id="doneView" style="display:none">
       <div class="tick">✓</div>
       <h1>Payment successful</h1>
       <p>भुगतान सफल। Your reports are added. Go back to the app to see your report.<br>
       आपकी रिपोर्ट जुड़ गई हैं। रिपोर्ट देखने के लिए ऐप पर वापस जाएँ।</p>
       ${returnButtons(back('paid'))}
       <p class="small"><b>Do not pay again. · दोबारा भुगतान न करें।</b></p>
     </div>

     <div id="checkView" style="display:none">
       <div class="tick warn">!</div>
       <h1>Payment received</h1>
       <p>We are still confirming it with the bank. Go back to the app and tap "I have already paid" in a minute.<br>
       बैंक से पुष्टि हो रही है। ऐप पर वापस जाएँ और एक मिनट बाद "मैं भुगतान कर चुका हूँ" दबाएँ।</p>
       ${returnButtons(back('check'))}
       <p class="small"><b>Do not pay again. · दोबारा भुगतान न करें।</b></p>
     </div>

     <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
     <script>
       var opts = ${JSON.stringify(opts)};
       function show(id) {
         ['payView', 'waitView', 'doneView', 'checkView'].forEach(function (v) {
           document.getElementById(v).style.display = v === id ? 'block' : 'none';
         });
       }
       opts.handler = function (r) {
         show('waitView');
         fetch('/pay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ order_id: r.razorpay_order_id, payment_id: r.razorpay_payment_id, signature: r.razorpay_signature }) })
           .then(function (x) { return x.json(); })
           .then(function (j) { show(j.ok ? 'doneView' : 'checkView'); })
           .catch(function () { show('checkView'); });
       };
       opts.modal = { ondismiss: function () { document.getElementById('msg').textContent = 'Payment not completed. Tap "Pay securely" to try again. / भुगतान पूरा नहीं हुआ। फिर से प्रयास करें।'; } };
       var rzp = new Razorpay(opts);
       rzp.on('payment.failed', function () { document.getElementById('msg').textContent = 'Payment failed. You can try again. / भुगतान विफल रहा। फिर से प्रयास करें।'; });
       document.getElementById('pay').onclick = function () { rzp.open(); };
       setTimeout(function () { rzp.open(); }, 400);
     </script>`
  );
}

export function messagePage(title, text, returnUrl) {
  const btn = returnUrl ? returnButtons(withParam(returnUrl, 'status=paid')) : '';
  return shell(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>${btn}`);
}
