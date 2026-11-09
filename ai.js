// Calls Gemini or Claude with the two photos. Switch with AI_PROVIDER on Render.
import { config } from './config.js';
import { buildPrompt, parseJsonReply } from './prompt.js';

async function readError(res, who) {
  let msg = `${who} error ${res.status}`;
  try {
    const j = await res.json();
    if (j?.error?.message) msg += `: ${j.error.message}`;
  } catch {}
  return msg;
}

async function callGemini(macro, line, signal, lang) {
  if (!config.geminiKey) throw new Error('Server is missing GEMINI_API_KEY.');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Photo 1 — macro photo of the stone:' },
              { inline_data: { mime_type: 'image/jpeg', data: macro } },
              { text: 'Photo 2 — line-doubling test through the back of the stone:' },
              { inline_data: { mime_type: 'image/jpeg', data: line } },
              { text: buildPrompt(lang) },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(await readError(res, 'Gemini'));
  const json = await res.json();
  const cand = json?.candidates?.[0];
  if (cand?.finishReason === 'MAX_TOKENS') throw new Error('Gemini reply was cut off. Please try again.');
  const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
  const u = json?.usageMetadata || {};
  const usage = {
    inputTokens: u.promptTokenCount || 0,
    outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), // thinking billed as output
  };
  return { result: parseJsonReply(text, 'Gemini'), usage };
}

async function callClaude(macro, line, signal, lang) {
  if (!config.anthropicKey) throw new Error('Server is missing ANTHROPIC_API_KEY.');
  const img = (data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.claudeModel,
      max_tokens: 4000,
      output_config: { effort: config.claudeEffort },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Photo 1 — macro photo of the stone:' },
            img(macro),
            { type: 'text', text: 'Photo 2 — line-doubling test through the back of the stone:' },
            img(line),
            { type: 'text', text: buildPrompt(lang) },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Claude'));
  const json = await res.json();
  if (json?.stop_reason === 'max_tokens') throw new Error('Claude reply was cut off. Please try again.');
  const text = (json?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const usage = { inputTokens: json?.usage?.input_tokens || 0, outputTokens: json?.usage?.output_tokens || 0 };
  return { result: parseJsonReply(text, 'Claude'), usage };
}

const PROVIDERS = { gemini: callGemini, claude: callClaude };

/** Price list in US$ per 1M tokens (input, output). Update if prices change. */
const PRICES = {
  gemini: { in: config.geminiPriceIn, out: config.geminiPriceOut },
  claude: { in: config.claudePriceIn, out: config.claudePriceOut },
};

/** Returns { result, usage: { inputTokens, outputTokens, costInr } } */
export async function analyze(macro, line, signal, lang = 'en') {
  const run = PROVIDERS[config.aiProvider];
  if (!run) throw new Error(`Unknown AI_PROVIDER "${config.aiProvider}".`);
  const { result, usage } = await run(macro, line, signal, lang);
  const p = PRICES[config.aiProvider];
  const usd = (usage.inputTokens * p.in + usage.outputTokens * p.out) / 1e6;
  usage.costInr = Math.round(usd * config.usdToInr * 10000) / 10000;
  return { result, usage };
}
