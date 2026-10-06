// llm.js: optional "chiarimenti" (clarifications) about a plan, using the user's own API key.
//
// The site is static: this module calls the chosen provider directly from the browser
// with the key the user pasted. The key is passed per call and is only ever placed in
// the request headers sent to the provider endpoint. This module never logs it, never
// stores it (no web storage of any kind, no cookies) and never puts it in a URL
// or request body.
//
// The model only explains. It must not produce a new or modified plan, and the UI never
// applies model output to the plan.

export const LLM_VERSION = "1.0.0";

// Model lists are plain data: edit them here when providers release or retire models.
// maxTokens is the per-answer output cap; effort is sent only where the model supports it.
export const PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    endpoint: "https://api.anthropic.com/v1/messages",
    keyHint: "sk-ant-...",
    keysUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-haiku-4-5",
    models: [
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (veloce, economico)", maxTokens: 1024 },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (equilibrato)", maxTokens: 2048, effort: "low" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 (il più capace, più costoso)", maxTokens: 2048, effort: "low" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    endpoint: "https://api.openai.com/v1/chat/completions",
    keyHint: "sk-...",
    keysUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4.1-mini",
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini (veloce, economico)", maxTokens: 1024 },
      { id: "gpt-4o-mini", label: "GPT-4o mini (economico)", maxTokens: 1024 },
      { id: "gpt-5-mini", label: "GPT-5 mini (ragionamento)", maxTokens: 4096, reasoning: "minimal" },
      { id: "gpt-5-nano", label: "GPT-5 nano (ragionamento, minimo costo)", maxTokens: 4096, reasoning: "minimal" },
    ],
  },
];

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 4000;

// ---------------------------------------------------------------------------
// Errors

const MESSAGES = {
  NO_KEY: "Inserisci una chiave API per usare i chiarimenti.",
  BAD_PROVIDER: "Fornitore non supportato.",
  NO_PLAN: "Genera prima un piano: i chiarimenti riguardano il piano mostrato.",
  NO_QUESTION: "Scrivi una domanda.",
  QUESTION_TOO_LONG: `La domanda è troppo lunga (massimo ${MAX_QUESTION_CHARS} caratteri).`,
  AUTH: "Chiave API non valida o revocata (errore 401). Controlla di averla copiata per intero e che sia del fornitore selezionato.",
  FORBIDDEN: "La chiave non ha i permessi per questo modello o questa richiesta (errore 403). Controlla le impostazioni del tuo account presso il fornitore.",
  NOT_FOUND: "Modello non disponibile per questa chiave (errore 404). Scegli un altro modello.",
  BAD_REQUEST: "Il fornitore ha rifiutato la richiesta (errore 400). Prova un altro modello o riformula la domanda.",
  BILLING: "Credito esaurito o fatturazione non attiva sul tuo account presso il fornitore. Ricarica il credito dalla console del fornitore.",
  RATE_LIMIT: "Troppe richieste o limite di utilizzo raggiunto (errore 429). Attendi qualche secondo e riprova.",
  QUOTA: "Quota esaurita sul tuo account presso il fornitore (errore 429). Controlla piano e credito nella console del fornitore.",
  SERVER: "Il servizio del fornitore non è disponibile al momento (errore del server). Riprova tra poco.",
  NETWORK: "Impossibile contattare il fornitore. Controlla la connessione; anche estensioni del browser, firewall aziendali o blocchi CORS possono impedire la chiamata.",
  ABORTED: "Richiesta annullata.",
  EMPTY: "Il modello non ha restituito testo. Riprova o scegli un altro modello.",
  REFUSAL: "Il modello ha rifiutato di rispondere a questa domanda.",
  HTTP: "Errore imprevisto dal fornitore.",
};

function llmError(code, extra = {}) {
  const err = new Error(MESSAGES[code] || MESSAGES.HTTP);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

// Remove anything that looks like a key from provider text before exposing it as detail.
function redact(text, apiKey) {
  let s = String(text || "");
  if (apiKey) s = s.split(apiKey).join("[chiave]");
  return s.replace(/sk-[A-Za-z0-9_\-*]{4,}/g, "[chiave]").slice(0, 300);
}

async function mapHttpError(res, apiKey) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const providerMsg = body?.error?.message || "";
  const providerType = body?.error?.type || body?.error?.code || "";
  const lower = `${providerMsg} ${providerType}`.toLowerCase();
  const extra = { status: res.status, detail: redact(providerMsg, apiKey) };
  const s = res.status;
  if (s === 401) return llmError("AUTH", extra);
  if (s === 403) return llmError("FORBIDDEN", extra);
  if (s === 404) return llmError("NOT_FOUND", extra);
  if (s === 429) {
    if (lower.includes("insufficient_quota") || lower.includes("quota")) return llmError("QUOTA", extra);
    return llmError("RATE_LIMIT", extra);
  }
  if (s === 402 || lower.includes("credit balance") || lower.includes("billing")) return llmError("BILLING", extra);
  if (s >= 500) return llmError("SERVER", extra);
  if (s === 400) return llmError("BAD_REQUEST", extra);
  return llmError("HTTP", extra);
}

function getProvider(id) {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw llmError("BAD_PROVIDER");
  return p;
}

function getModel(provider, modelId) {
  const id = modelId || provider.defaultModel;
  // Unknown ids are allowed (the user may type a newer model), with safe defaults.
  return provider.models.find((m) => m.id === id) || { id, label: id, maxTokens: 1024 };
}

function checkKey(apiKey) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw llmError("NO_KEY");
  return apiKey.trim();
}

// ---------------------------------------------------------------------------
// Plan compaction and prompts

const r0 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : null);

// Keeps only what the model needs to explain the plan: targets, and for each day the
// meals with [name, grams, kcal] per item. Drops ids, roles, macros per item, shopping list.
export function compactPlan(plan) {
  if (!plan || !Array.isArray(plan.days)) return null;
  const t = plan.targets || {};
  return {
    target: { kcal: r0(t.kcal), protein_g: r0(t.protein_g), carbs_g: r0(t.carbs_g), fat_g: r0(t.fat_g) },
    season: plan.meta?.season ?? null,
    diet: plan.meta?.diet ?? null,
    days: plan.days.map((d) => ({
      day: d.label ?? (typeof d.index === "number" ? d.index + 1 : null),
      kcal: r0(d.totals?.kcal),
      meals: (d.meals || []).map((m) => ({
        meal: m.type,
        items: (m.items || []).map((it) => [it.name, r0(it.grams), r0(it.kcal)]),
      })),
    })),
  };
}

const RULES = {
  it: `Sei l'assistente per i "chiarimenti" di uno strumento che genera piani alimentari settimanali. Il piano qui sotto è stato prodotto da un calcolatore deterministico a partire da obiettivi calcolati (kcal e macronutrienti) e da una base di dati sugli alimenti.

Regole:
- Non modificare alimenti, grammi o kcal del piano. Non produrre un nuovo piano né una versione modificata del piano, neanche parziale, neanche se l'utente lo chiede.
- Puoi spiegare perché il piano contiene certe scelte, dare idee di cottura e ricette usando gli ingredienti elencati, spiegare nutrienti, porzioni e concetti generali di nutrizione.
- Se l'utente vuole sostituire un alimento, suggerisci di usare il pulsante "Sostituisci" accanto all'alimento nel piano: lo strumento ricalcola la sostituzione in modo coerente.
- Queste sono informazioni generali, non consigli medici. In caso di patologie, gravidanza o allattamento, disturbi alimentari, minori, terapie farmacologiche o dubbi sulla salute, raccomanda di rivolgersi a un medico o a un dietista.
- Rispondi in italiano, in modo breve e chiaro (di norma meno di 200 parole). Non inventare valori nutrizionali precisi che non sono nel piano.

Formato del piano (JSON compatto): "target" sono gli obiettivi giornalieri; ogni giorno ha "kcal" totali e "meals"; ogni alimento è [nome, grammi, kcal].`,
  en: `You are the "clarifications" assistant of a tool that generates weekly meal plans. The plan below was produced by a deterministic calculator from computed targets (kcal and macronutrients) and a food database.

Rules:
- Do not change foods, grams or kcal in the plan. Do not produce a new plan or a modified plan, not even in part, even if the user asks.
- You may explain why the plan contains certain choices, give cooking ideas and recipes using the listed ingredients, explain nutrients, portions and general nutrition concepts.
- If the user wants to replace a food, suggest using the "Swap" button next to that food in the plan: the tool recomputes the substitution consistently.
- This is general information, not medical advice. For medical conditions, pregnancy or breastfeeding, eating disorders, minors, medication or health concerns, recommend seeing a doctor or a registered dietitian.
- Answer in English, briefly and clearly (usually under 200 words). Do not invent precise nutrient values that are not in the plan.

Plan format (compact JSON): "target" holds the daily targets; each day has total "kcal" and "meals"; each food is [name, grams, kcal].`,
};

export function buildSystemPrompt(plan, lang = "it") {
  const rules = RULES[lang === "en" ? "en" : "it"];
  const label = lang === "en" ? "PLAN" : "PIANO";
  return `${rules}\n\n${label}:\n${JSON.stringify(compactPlan(plan))}`;
}

// Cleans the conversation history: only user/assistant string turns, last N messages,
// starting with a user turn, consecutive same-role turns merged, long turns truncated.
export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const h of history) {
    if (!h || (h.role !== "user" && h.role !== "assistant")) continue;
    if (typeof h.content !== "string" || !h.content.trim()) continue;
    const content = h.content.slice(0, MAX_HISTORY_CHARS);
    const last = out[out.length - 1];
    if (last && last.role === h.role) last.content += `\n\n${content}`;
    else out.push({ role: h.role, content });
  }
  let trimmed = out.slice(-MAX_HISTORY_MESSAGES);
  while (trimmed.length && trimmed[0].role !== "user") trimmed = trimmed.slice(1);
  // The new question is a user turn: history must end with an assistant turn.
  if (trimmed.length && trimmed[trimmed.length - 1].role === "user") trimmed = trimmed.slice(0, -1);
  return trimmed;
}

// ---------------------------------------------------------------------------
// Provider requests

function buildRequest(provider, model, apiKey, system, messages, maxTokens) {
  if (provider.id === "anthropic") {
    const body = { model: model.id, max_tokens: maxTokens, system, messages };
    if (model.effort) body.output_config = { effort: model.effort };
    return {
      url: provider.endpoint,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      },
    };
  }
  // OpenAI Chat Completions
  const body = {
    model: model.id,
    max_completion_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...messages],
  };
  if (model.reasoning) body.reasoning_effort = model.reasoning;
  return {
    url: provider.endpoint,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    },
  };
}

function parseResponse(provider, data) {
  if (provider.id === "anthropic") {
    if (data?.stop_reason === "refusal") throw llmError("REFUSAL");
    const text = (data?.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const u = data?.usage || {};
    return {
      text,
      usage: { input_tokens: u.input_tokens ?? null, output_tokens: u.output_tokens ?? null },
      truncated: data?.stop_reason === "max_tokens",
    };
  }
  const choice = data?.choices?.[0];
  if (choice?.message?.refusal) throw llmError("REFUSAL");
  const text = String(choice?.message?.content || "").trim();
  const u = data?.usage || {};
  return {
    text,
    usage: { input_tokens: u.prompt_tokens ?? null, output_tokens: u.completion_tokens ?? null },
    truncated: choice?.finish_reason === "length",
  };
}

async function send(provider, req, apiKey, signal) {
  let res;
  try {
    res = await fetch(req.url, { ...req.init, signal });
  } catch (e) {
    if (e?.name === "AbortError" || signal?.aborted) throw llmError("ABORTED");
    throw llmError("NETWORK");
  }
  if (!res.ok) throw await mapHttpError(res, apiKey);
  try {
    return await res.json();
  } catch (e) {
    if (e?.name === "AbortError" || signal?.aborted) throw llmError("ABORTED");
    throw llmError("HTTP", { status: res.status });
  }
}

// ---------------------------------------------------------------------------
// Public API

export async function askAboutPlan({ provider, apiKey, model, plan, question, history = [], lang = "it", signal } = {}) {
  const p = getProvider(provider || "anthropic");
  const key = checkKey(apiKey);
  if (!plan || !Array.isArray(plan.days)) throw llmError("NO_PLAN");
  const q = typeof question === "string" ? question.trim() : "";
  if (!q) throw llmError("NO_QUESTION");
  if (q.length > MAX_QUESTION_CHARS) throw llmError("QUESTION_TOO_LONG");
  if (signal?.aborted) throw llmError("ABORTED");

  const m = getModel(p, model);
  const system = buildSystemPrompt(plan, lang);
  const messages = [...normalizeHistory(history), { role: "user", content: q }];
  const req = buildRequest(p, m, key, system, messages, m.maxTokens || 1024);
  const data = await send(p, req, key, signal);
  const out = parseResponse(p, data);
  if (!out.text) throw llmError("EMPTY");
  return out;
}

// Minimal call (a few tokens) to check that key and model work.
// Never throws: returns { ok: true } or { ok: false, error } where error has message and code.
export async function testKey({ provider, apiKey, model, signal } = {}) {
  try {
    const p = getProvider(provider || "anthropic");
    const key = checkKey(apiKey);
    const m = getModel(p, model);
    // Reasoning models spend tokens before answering: give them a little room.
    const maxTokens = m.reasoning || m.effort ? 64 : 1;
    const req = buildRequest(p, m, key, "Reply with: ok", [{ role: "user", content: "ok" }], maxTokens);
    await send(p, req, key, signal);
    return { ok: true, error: null };
  } catch (e) {
    const error = e?.code ? e : llmError("HTTP");
    return { ok: false, error };
  }
}
