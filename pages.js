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
</style></head><body><div class="card"><div class="logo">◆</div>${body}</div></body></html>`;

const withParam = (u, p) => u + (u.includes('?') ? '&' : '?') + p;

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
  return shell(
    'GemShield payment',
    `<h1>GemShield</h1>
     <p>${esc(label)}</p>
     <div class="price">₹${esc(rupees)}</div>
     <button class="gold" id="pay">Pay securely · सुरक्षित भुगतान करें</button>
     <a class="btn dark" href="${esc(withParam(returnUrl, 'status=cancel'))}">Cancel · रद्द करें</a>
     <p class="small">One-time payment. Non-refundable. Payments by Razorpay (UPI, cards, net banking).<br>
     एक बार का भुगतान। वापसी योग्य नहीं। भुगतान Razorpay द्वारा (UPI, कार्ड, नेट बैंकिंग)।</p>
     <p id="msg" class="small"></p>
     <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
     <script>
       var RETURN = ${JSON.stringify(returnUrl)};
       var SEP = RETURN.indexOf('?') === -1 ? '?' : '&';
       var opts = ${JSON.stringify(opts)};
       opts.handler = function (r) {
         document.getElementById('msg').textContent = 'Confirming payment… / भुगतान की पुष्टि हो रही है…';
         fetch('/pay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ order_id: r.razorpay_order_id, payment_id: r.razorpay_payment_id, signature: r.razorpay_signature }) })
           .then(function (x) { return x.json(); })
           .then(function (j) { location.href = RETURN + SEP + (j.ok ? 'status=paid' : 'status=check'); })
           .catch(function () { location.href = RETURN + SEP + 'status=check'; });
       };
       opts.modal = { ondismiss: function () { document.getElementById('msg').textContent = 'Payment not completed. Tap "Pay securely" to try again. / भुगतान पूरा नहीं हुआ। फिर से प्रयास करें।'; } };
       var rzp = new Razorpay(opts);
       rzp.on('payment.failed', function () { document.getElementById('msg').textContent = 'Payment failed. You can try again. / भुगतान विफल रहा। फिर से प्रयास करें।'; });
       document.getElementById('pay').onclick = function () { rzp.open(); };
       setTimeout(function () { rzp.open(); }, 400);
     </script>`
  );
}

export function messagePage(title, text) {
  return shell(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`);
}
