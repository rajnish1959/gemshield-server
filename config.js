// All settings come from Render → Environment. Defaults in brackets.
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(env.PORT, 3000),

  // Security
  appToken: env.APP_TOKEN || '',          // shared with the app
  adminToken: env.ADMIN_TOKEN || '',      // for you only (account transfers)
  // Websites allowed to use the admin page from outside this server (comma-separated).
  adminOrigins: (env.ADMIN_ORIGINS || 'https://ornategems.com,https://www.ornategems.com')
    .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
  // Websites allowed to use GemShield in the browser (the web version at ornategems.com/gemshield/app/).
  webOrigins: (env.WEB_ORIGINS || 'https://ornategems.com,https://www.ornategems.com')
    .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),

  // AI
  aiProvider: (env.AI_PROVIDER || 'gemini').toLowerCase(),
  aiFallback: (env.AI_FALLBACK || '').toLowerCase(), // e.g. 'claude' — used if the main AI keeps failing
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-3.6-flash',
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  claudeModel: env.CLAUDE_MODEL || 'claude-haiku-5-5',
  claudeEffort: env.CLAUDE_EFFORT || 'low',
  // Price list (US$ per 1M tokens) — only used to log the real cost of each scan.
  geminiPriceIn: num(env.GEMINI_PRICE_IN, 1.5),
  geminiPriceOut: num(env.GEMINI_PRICE_OUT, 7.5),
  claudePriceIn: num(env.CLAUDE_PRICE_IN, 0.1),
  claudePriceOut: num(env.CLAUDE_PRICE_OUT, 0.5),
  usdToInr: num(env.USD_TO_INR, 88),

  // Database (Neon Postgres connection string)
  databaseUrl: env.DATABASE_URL || '',
  // Optional: address the payment page is served from, e.g. https://pay.ornategems.com
  // (must be a website registered with Razorpay). Empty = use the address the app called.
  payBaseUrl: (env.PAY_BASE_URL || '').trim().replace(/\/+$/, ''),

  // Razorpay
  rzpKeyId: env.RAZORPAY_KEY_ID || '',
  rzpKeySecret: env.RAZORPAY_KEY_SECRET || '',
  businessName: env.BUSINESS_NAME || 'ORNATEGEMSINDIA',

  // Products (₹). Every purchase adds report credits to the phone.
  priceSingle: num(env.PRICE_SINGLE_INR, 49),   // 1 report
  priceShop: num(env.PRICE_SHOP_INR, 149),      // shopping pack
  shopReports: num(env.SHOP_REPORTS, 5),
  pricePro: num(env.PRICE_PRO_INR, 999),        // pro / astrologer pack
  proReports: num(env.PRO_REPORTS, 50),
  dailyLimit: num(env.DAILY_LIMIT, 10),
  imageMaxSide: num(env.MAX_IMAGE_SIDE, 1568),       // photo size the app sends (pixels, longest side)              // max reports per phone per day
  perDeviceHourly: num(env.LIMIT_PER_DEVICE_PER_HOUR, 20), // anti-hammering
  globalDaily: num(env.LIMIT_PER_DAY, 1000),               // wallet safety net

  // Where the payment page sends the user back to
  appReturnUrl: env.APP_RETURN_URL || 'gemshield://paid',
};
