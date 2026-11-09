# GemShield Server

Keeps the AI keys and Razorpay secret off the phone, sells report credits, and
runs the AI **only for paid reports**.

- Node.js 20+. One dependency: `pg` (Postgres).
- Database: any Postgres, e.g. a **Neon** free database. Tables (all starting `gs_`) are created automatically.

## Products
| Pack | Default price | Gives |
|---|---|---|
| Single | ₹49 | 1 report |
| Shop | ₹149 | 5 reports |
| Pro | ₹999 | 50 reports |

Reports never expire. Every phone can use at most **10 reports a day** (`DAILY_LIMIT`). A report is used only when the AI analysis succeeds.
Reports are written in **English or Hindi**, following the language switch in the app.

## Settings (Render → Environment)
| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (`postgresql://...`) |
| `APP_TOKEN` | same text as `EXPO_PUBLIC_APP_TOKEN` in the app |
| `ADMIN_TOKEN` | your own secret text, for the admin commands below |
| `RAZORPAY_KEY_ID` | `rzp_test_...` while testing, `rzp_live_...` when live |
| `RAZORPAY_KEY_SECRET` | the matching secret |
| `AI_PROVIDER` | `gemini` or `claude` (main AI) |
| `AI_FALLBACK` | optional: the other AI (`claude` or `gemini`), used automatically if the main AI is busy or failing |
| `MAX_IMAGE_SIDE` | optional, default 1568 (photo size in pixels the app sends) |
| `ANTHROPIC_API_KEY` | Claude key (if `AI_PROVIDER=claude`) |
| `GEMINI_API_KEY` | Gemini key (if `AI_PROVIDER=gemini`) |
| `PRICE_SINGLE_INR` | optional, default 49 |
| `PRICE_SHOP_INR` / `SHOP_REPORTS` | optional, default 149 / 5 |
| `PRICE_PRO_INR` / `PRO_REPORTS` | optional, default 999 / 50 |
| `DAILY_LIMIT` | optional, default 10 |
| `BUSINESS_NAME` | optional, default ORNATEGEMSINDIA (shown on the Razorpay page) |

Changing prices, pack size or the AI needs **no new APK**. The app reads them from the server.

## Real AI cost
Every report logs its actual tokens and cost in rupees in the Render logs, for example:
`[analyze] claude ok 4200ms ABCD1234 tokens in=3120 out=410 cost=₹0.0455`

For a summary, run this in Command Prompt (replace the address and admin token):
```
curl -H "x-admin-token: YOUR_ADMIN_TOKEN" https://gemshield-server.onrender.com/admin/costs
```

## Admin: helping a customer
Customers see an **Account code** (8 characters) on the app's home screen.

Check a phone's balance:
```
curl -H "x-admin-token: YOUR_ADMIN_TOKEN" "https://gemshield-server.onrender.com/admin/device?code=ABCD1234"
```
Move reports to a new phone (customer sends both codes on WhatsApp):
```
curl -X POST -H "x-admin-token: YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"fromCode\":\"OLDCODE1\",\"toCode\":\"NEWCODE2\"}" https://gemshield-server.onrender.com/admin/transfer
```
Add (or remove, with a minus number) reports:
```
curl -X POST -H "x-admin-token: YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"code\":\"ABCD1234\",\"reports\":1}" https://gemshield-server.onrender.com/admin/adjust
```

## Render settings
- Runtime: Node · Build: `npm install` · Start: `npm start` · Health check path: `/health`
- Free instance sleeps after about 15 minutes idle. The first request afterwards can take up to a minute; the app wakes it as soon as a scan starts.
