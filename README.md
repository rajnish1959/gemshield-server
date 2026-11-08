# GemShield Server

A tiny Node.js server that keeps the AI keys (Gemini / Claude) off the phone.
The app sends the two stone photos here; the server asks the AI and returns the result.

- No dependencies. Needs Node.js 20 or newer.
- `GET /health` returns `{ ok: true }`
- `POST /analyze` requires the header `x-app-token` and returns the AI's JSON result

## Settings (Render → your service → Environment)

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | your Google AI Studio key |
| `ANTHROPIC_API_KEY` | (optional) your Claude Console key |
| `AI_PROVIDER` | `gemini` or `claude` |
| `APP_TOKEN` | long random text; the app's `.env` must have the same value in `EXPO_PUBLIC_APP_TOKEN` |
| `LIMIT_PER_DEVICE_PER_HOUR` | optional, default 20 |
| `LIMIT_PER_DAY` | optional, default 300 |

To switch between AIs, change `AI_PROVIDER` on Render. No new APK is needed.

## Render settings
- Runtime: **Node**
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Instance type: **Free**. It sleeps after about 15 minutes idle; the first scan afterwards can take up to a minute while it wakes. The app pings the server as soon as a scan starts.

## Run on your laptop (optional)
```
set GEMINI_API_KEY=AIza...
set APP_TOKEN=test123
npm start
```
