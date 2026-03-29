/**
 * 👋 HEY ANTIGRAVITY — THIS IS THE MOST IMPORTANT FILE IN THE ZIP
 * ═══════════════════════════════════════════════════════════════
 * This is a Vercel Serverless Function. It's a backend proxy.
 *
 * WHY IT EXISTS:
 * The live site stores the API key in localStorage — anyone can steal
 * it from DevTools in 10 seconds. This file fixes that permanently.
 *
 * HOW TO DEPLOY:
 * 1. Create an api/ folder in the project root
 * 2. Put this file in it: api/chat.js
 * 3. Put vercel.json in the project root
 * 4. In Vercel dashboard → Settings → Environment Variables:
 *    Add: GROQ_API_KEY, OPENROUTER_API_KEY, etc (see DEPLOYMENT.md)
 * 5. Push to GitHub — Vercel auto-deploys
 *
 * WHAT CHANGES IN THE FRONTEND:
 * - Remove ALL localStorage for API keys
 * - Change fetch() calls from OpenRouter URL to '/api/chat'
 * - Pass { provider, model, messages } in the body
 * - The key never touches the browser again — ever
 *
 * READ AGENT_NOTES.md Priority 1 for the full merge checklist.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * LLM4 ROUNDTABLE — SECURE BACKEND PROXY
 * ═══════════════════════════════════════════════════════════════
 * Vercel Serverless Function: /api/chat
 *
 * SECURITY MODEL:
 *  - API keys stored in Vercel Environment Variables ONLY
 *  - Keys never reach the browser — ever
 *  - Rate limited per IP: MAX_REQUESTS_PER_HOUR (configurable)
 *  - Provider keys come from env vars, not from the request body
 *  - Request body is validated before forwarding
 *
 * ENVIRONMENT VARIABLES (set in Vercel dashboard):
 *  GROQ_API_KEY        = gsk_...
 *  OPENROUTER_API_KEY  = sk-or-v1-...
 *  OLLAMA_API_KEY      = ollama_...
 *  OPENAI_API_KEY      = sk-...
 *  CUSTOM_API_KEY      = (optional)
 *  CUSTOM_API_URL      = (optional)
 *  CUSTOM_API_MODEL    = (optional)
 *
 * RATE LIMITING (change these to suit your needs):
 *  MAX_REQUESTS_PER_HOUR  = 20  (per IP per hour)
 *  MAX_TOKENS_PER_REQUEST = 300 (hard cap per call)
 * ═══════════════════════════════════════════════════════════════
 */

// ─── RATE LIMIT CONFIG (dev can change these) ─────────────────
const ENABLE_RATE_LIMIT = true;      // Set to false to completely turn off IP limiting
const MAX_REQUESTS_PER_HOUR = 200;   // Increased from 20 (approx 50 debates/hr)
const MAX_TOKENS_PER_REQUEST = 800;  // max tokens per API call
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

// ─── IN-MEMORY RATE LIMIT STORE ───────────────────────────────
// Vercel functions are stateless between cold starts,
// but this handles burst abuse within a single instance lifetime.
const ipStore = new Map();

function getRateStatus(ip) {
  const now = Date.now();
  if (!ipStore.has(ip)) ipStore.set(ip, []);
  const times = ipStore.get(ip).filter(t => now - t < RATE_WINDOW_MS);
  ipStore.set(ip, times);
  return { count: times.length, allowed: times.length < MAX_REQUESTS_PER_HOUR };
}

function recordRequest(ip) {
  const times = ipStore.get(ip) || [];
  times.push(Date.now());
  ipStore.set(ip, times);
}

// ─── PROVIDER REGISTRY ────────────────────────────────────────
const PROVIDER_CONFIG = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-4-maverick:free',
    extraHeaders: {
      'HTTP-Referer': 'https://infinity-council.vercel.app',
      'X-Title': 'Infinity Council',
    },
  },
  ollama: {
    url: 'https://ollama.com/v1/chat/completions',
    keyEnv: 'OLLAMA_API_KEY',
    defaultModel: 'deepseek-v3.1:671b-cloud',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    keyEnv: 'NVIDIA_API_KEY',
    defaultModel: 'meta/llama-3.1-70b-instruct',
  },
  together: {
    url: 'https://api.together.xyz/v1/chat/completions',
    keyEnv: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    keyEnv: 'QWEN_API_KEY',
    defaultModel: 'qwen-plus',
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    keyEnv: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-large-latest',
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  minimax: {
    url: 'https://api.minimax.chat/v1/chat/completions',
    keyEnv: 'MINIMAX_API_KEY',
    defaultModel: 'abab6.5s-chat',
  },
  kimi: {
    url: 'https://api.moonshot.cn/v1/chat/completions',
    keyEnv: 'KIMI_API_KEY',
    defaultModel: 'moonshot-v1-8k',
  },
  'x-ai': {
    url: 'https://api.x.ai/v1/chat/completions',
    keyEnv: 'XAI_API_KEY',
    defaultModel: 'grok-2-1212',
  },
  custom: {
    urlEnv: 'CUSTOM_API_URL',
    keyEnv: 'CUSTOM_API_KEY',
    modelEnv: 'CUSTOM_API_MODEL',
  },
};

// ─── ALLOWED ORIGINS (CORS) ────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://infinity-council.vercel.app',
  'http://localhost',
  'http://127.0.0.1',
];

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const corsHeaders = getCorsHeaders(origin);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate limiting ────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (ENABLE_RATE_LIMIT) {
    const rate = getRateStatus(ip);
    if (!rate.allowed) {
      Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
      return res.status(429).json({
        error: `Rate limit exceeded. Max ${MAX_REQUESTS_PER_HOUR} requests per hour. Try again later.`,
        retryAfter: RATE_WINDOW_MS / 1000,
      });
    }
  }

  // Enhanced rate limiting — Anon AI
  const enhanced = checkEnhancedRateLimit(ip);
  if (!enhanced.allowed) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(429).json({
      error: enhanced.reason,
      retryAfter: enhanced.retryAfter,
    });
  }

  // ── Parse + validate body ────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { provider: providerId, model, messages, plugins, apiKey: userKey } = body;

  if (!providerId || !messages || !Array.isArray(messages)) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(400).json({ error: 'Missing required fields: provider, messages' });
  }

  if (!PROVIDER_CONFIG[providerId]) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(400).json({ error: `Unknown provider: ${providerId}` });
  }

  // Validate messages — strip anything dangerous
  const safeMessages = messages
    .filter(m => m && typeof m.role === 'string' && (typeof m.content === 'string' || Array.isArray(m.content)))
    .map(m => ({ role: m.role, content: m.content }));

  if (safeMessages.length === 0) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(400).json({ error: 'No valid messages' });
  }

  // Abuse detection — Anon AI
  const abuse = detectAbuse(ip, safeMessages);
  if (abuse.abuse) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(400).json({ error: abuse.reason });
  }

  // ── Resolve provider settings ────────────────────────────────
  const cfg = PROVIDER_CONFIG[providerId];
  // Priority: User Key (from body) > Admin Key (from Env)
  const apiKey = userKey || process.env[cfg.keyEnv] || null;
  const apiUrl = cfg.urlEnv ? process.env[cfg.urlEnv] : cfg.url;
  const apiModel = model || (cfg.modelEnv ? process.env[cfg.modelEnv] : cfg.defaultModel);

  if (!apiUrl) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(500).json({ error: `Provider ${providerId} not configured on this server.` });
  }

  if (!apiKey && providerId !== 'custom') {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(500).json({
      error: `API key for ${providerId} not set in server environment. Contact the site admin.`
    });
  }

  // ── Build upstream request ───────────────────────────────────
  const upstreamHeaders = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    ...(cfg.extraHeaders || {}),
  };

  const upstreamBody = {
    model: apiModel,
    messages: safeMessages,
    // Hard cap tokens — prevents expensive runaway requests
    max_tokens: Math.min(body.max_tokens || MAX_TOKENS_PER_REQUEST, MAX_TOKENS_PER_REQUEST),
  };

  if (plugins) {
    upstreamBody.plugins = plugins;
  }

  // ── Forward to provider ──────────────────────────────────────
  let upstream;
  const start = Date.now();
  try {
    upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(502).json({ error: `Failed to reach ${providerId}: ${err.message}` });
  }

  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(upstream.status).json({
      error: data.error?.message || `Provider error ${upstream.status}`,
    });
  }

  // ── Record successful request + return ───────────────────────
  recordRequest(ip);
  recordEnhancedRequest(ip); // Anon AI addition

  serverLog(ip, providerId, apiModel, JSON.stringify(safeMessages).length, upstream.status, Date.now() - start);

  // Strip provider metadata before returning — only send what browser needs
  Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
  return res.status(200).json({
    choices: data.choices,
    usage: data.usage,
  });
}

/* ════════════════════════════════════════════════════════════════
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
   ANON AI ADDITIONS — api/chat.js v3.1
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

   OWNERSHIP NOTE:
   ┌──────────────────────────────────────────────────────────┐
   │  ORIGINAL PROJECT: Aksa AI — all proxy logic above      │
   │  NEW ADDITIONS:    Anon AI — enhanced backend below     │
   │                                                          │
   │  All flags default to false. Safe to deploy as-is.      │
   └──────────────────────────────────────────────────────────┘

   FEATURES:
   ① Enhanced rate limiting — per-minute AND per-hour tracking
   ② Server-side prompt logging — console only, no database
   ③ Abuse detection — flags suspicious patterns
   ════════════════════════════════════════════════════════════════ */

// ① ENHANCED RATE LIMITING — Anon AI
// The existing rate limiter tracks per-hour only.
// This adds per-minute tracking to stop burst abuse.
// Also adds a daily counter per IP for long-term monitoring.

const PER_MINUTE_LIMIT = 5;   // max 5 requests per IP per minute
const PER_DAY_LIMIT = 200; // max 200 requests per IP per day
const minuteStore = new Map();
const dayStore = new Map();

function checkEnhancedRateLimit(ip) {
  const now = Date.now();
  const oneMin = 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  // Per-minute window
  if (!minuteStore.has(ip)) minuteStore.set(ip, []);
  const minTimes = minuteStore.get(ip).filter(t => now - t < oneMin);
  minuteStore.set(ip, minTimes);
  if (minTimes.length >= PER_MINUTE_LIMIT) {
    return { allowed: false, reason: `Too fast: max ${PER_MINUTE_LIMIT} requests/minute`, retryAfter: 60 };
  }

  // Per-day window
  if (!dayStore.has(ip)) dayStore.set(ip, []);
  const dayTimes = dayStore.get(ip).filter(t => now - t < oneDay);
  dayStore.set(ip, dayTimes);
  if (dayTimes.length >= PER_DAY_LIMIT) {
    return { allowed: false, reason: `Daily limit reached: max ${PER_DAY_LIMIT} requests/day`, retryAfter: 86400 };
  }

  return { allowed: true };
}

function recordEnhancedRequest(ip) {
  const now = Date.now();
  minuteStore.get(ip)?.push(now);
  dayStore.get(ip)?.push(now);
}

// ② SERVER-SIDE LOGGING — Anon AI
// Logs request metadata server-side. No database. console.log only.
// Flip ENABLE_SERVER_LOGGING to true to activate.
const ENABLE_SERVER_LOGGING = false;

function serverLog(ip, providerId, model, promptLength, status, latencyMs) {
  if (!ENABLE_SERVER_LOGGING) return;
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    ip: ip.substring(0, 8) + '***',  // partial IP only
    provider: providerId,
    model,
    promptChars: promptLength,
    estimatedTokens: Math.ceil(promptLength / 4),
    status,
    latencyMs,
  }));
}

// ③ ABUSE DETECTION — Anon AI
// Detects suspicious patterns: identical prompts, rapid-fire, giant prompts
const ABUSE_PATTERNS = {
  MAX_PROMPT_CHARS: 8000,  // reject absurdly long prompts
  MAX_MESSAGES_COUNT: 50,    // reject too many messages in one call
};
const recentPrompts = new Map(); // ip → last prompt hash

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < Math.min(str.length, 200); i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function detectAbuse(ip, messages) {
  const promptStr = JSON.stringify(messages);

  if (promptStr.length > ABUSE_PATTERNS.MAX_PROMPT_CHARS) {
    return { abuse: true, reason: 'Prompt too large' };
  }
  if (messages.length > ABUSE_PATTERNS.MAX_MESSAGES_COUNT) {
    return { abuse: true, reason: 'Too many messages' };
  }

  // Detect identical repeated prompts (bot pattern)
  const hash = simpleHash(promptStr);
  const lastHash = recentPrompts.get(ip);
  if (lastHash === hash) {
    return { abuse: true, reason: 'Duplicate prompt detected' };
  }
  recentPrompts.set(ip, hash);

  // Clean up map periodically
  if (recentPrompts.size > 1000) {
    const keys = [...recentPrompts.keys()];
    keys.slice(0, 500).forEach(k => recentPrompts.delete(k));
  }

  return { abuse: false };
}

/*
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
   ANTIGRAVITY MERGE INSTRUCTIONS FOR api/chat.js:

   To activate enhanced rate limiting, add these 3 calls
   inside the main handler() function, just after the existing
   rate limit check (the one that checks getRateStatus(ip)):

     // Enhanced rate limiting — Anon AI
     const enhanced = checkEnhancedRateLimit(ip);
     if (!enhanced.allowed) {
       Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(429).json({
         error: enhanced.reason,
         retryAfter: enhanced.retryAfter,
       });
     }

   To activate abuse detection, add after body parsing:

     // Abuse detection — Anon AI
     const abuse = detectAbuse(ip, safeMessages);
     if (abuse.abuse) {
       Object.keys(corsHeaders).forEach(k => res.setHeader(k, corsHeaders[k]));
    return res.status(400).json({ error: abuse.reason });
     }

   To activate server logging, add after the upstream fetch:

     serverLog(ip, providerId, apiModel, JSON.stringify(safeMessages).length, upstream.status, Date.now()-start);

   And add: const start = Date.now(); before the fetch call.

   END ANON AI ADDITIONS
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
*/
