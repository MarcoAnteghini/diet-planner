// "Chiarimenti" panel. The API key stays in memory; optional sessionStorage only
// when the user ticks "ricorda per questa sessione". Model output is rendered as
// text with a tiny safe markdown subset and never changes the plan.
import { h, clear, nextId, renderSafeText, safeStorage, announce } from './dom.js';

const SESSION_KEY = 'diet.llm';

export function createChatState() {
  const saved = safeStorage('session').get(SESSION_KEY);
  return {
    provider: saved?.provider || null,
    model: saved?.model || null,
    apiKey: saved?.apiKey || '',
    remember: !!saved?.apiKey,
    open: false,
    history: [], // [{role:'user'|'assistant', content, usage?, error?}]
    busy: false,
    controller: null,
    keyStatus: null, // {ok, text}
  };
}

function modelId(m) {
  return typeof m === 'string' ? m : m?.id;
}
function modelLabel(m) {
  return typeof m === 'string' ? m : m?.label || m?.id;
}

function persist(state) {
  const store = safeStorage('session');
  if (state.remember && state.apiKey) {
    store.set(SESSION_KEY, { provider: state.provider, model: state.model, apiKey: state.apiKey });
  } else {
    store.remove(SESSION_KEY);
  }
}

/**
 * @param {object} p
 * @param {object} p.state    from createChatState
 * @param {object|null} p.llm the llm.js module, or null when unavailable
 * @param {object} p.legal    LEGAL[lang]
 * @param {object} p.t
 * @param {string} p.lang
 * @param {function} p.getPlan () => Plan|null
 */
export function renderChat({ state, llm, legal, t, lang, getPlan }) {
  const details = h('details', { class: 'card chat no-print', open: state.open });
  details.addEventListener('toggle', () => {
    state.open = details.open;
  });
  details.append(h('summary', {}, h('h2', { class: 'summary-title' }, t.chat_title)));

  const body = h('div', { class: 'chat-body' });
  details.append(body);

  if (!llm || !Array.isArray(llm.PROVIDERS) || !llm.PROVIDERS.length) {
    body.append(h('p', { class: 'callout callout-warn' }, t.llm_unavailable));
    return details;
  }

  const providers = llm.PROVIDERS;
  if (!providers.some((p) => p.id === state.provider)) state.provider = providers[0].id;
  const currentProvider = () => providers.find((p) => p.id === state.provider) || providers[0];
  const ensureModel = () => {
    const p = currentProvider();
    const ids = (p.models || []).map(modelId);
    if (!ids.includes(state.model)) state.model = p.defaultModel || ids[0] || '';
  };
  ensureModel();

  const providerSel = h('select', { id: nextId('provider') });
  for (const p of providers) providerSel.append(h('option', { value: p.id, selected: p.id === state.provider }, p.label || p.id));

  const modelSel = h('select', { id: nextId('model') });
  const fillModels = () => {
    clear(modelSel);
    for (const m of currentProvider().models || []) {
      modelSel.append(h('option', { value: modelId(m), selected: modelId(m) === state.model }, modelLabel(m)));
    }
  };
  fillModels();

  const noticeId = nextId('llm-notice');
  const keyInput = h('input', {
    id: nextId('apikey'),
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
    autocapitalize: 'off',
    'aria-describedby': noticeId,
    value: state.apiKey,
  });
  const rememberBox = h('input', { type: 'checkbox', id: nextId('remember'), checked: state.remember });
  const rememberHintId = nextId('remember-hint');
  rememberBox.setAttribute('aria-describedby', rememberHintId);

  const keyStatus = h('p', { class: 'key-status', role: 'status', 'aria-live': 'polite' });
  const showKeyStatus = () => {
    keyStatus.textContent = state.keyStatus ? state.keyStatus.text : '';
    keyStatus.className = `key-status ${state.keyStatus ? (state.keyStatus.ok ? 'ok' : 'bad') : ''}`;
  };
  showKeyStatus();

  const keysLink = h('p', { class: 'hint' });
  const updateKeyHelp = () => {
    const p = currentProvider();
    keyInput.placeholder = p.keyHint || '';
    clear(keysLink);
    if (p.keysUrl) {
      keysLink.append(h('a', { href: p.keysUrl, target: '_blank', rel: 'noopener noreferrer' }, t.get_key(p.label || p.id)));
    }
  };
  updateKeyHelp();

  const testBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, t.test_key);

  providerSel.addEventListener('change', () => {
    state.provider = providerSel.value;
    state.model = null;
    ensureModel();
    fillModels();
    updateKeyHelp();
    state.keyStatus = null;
    showKeyStatus();
    persist(state);
  });
  modelSel.addEventListener('change', () => {
    state.model = modelSel.value;
    persist(state);
  });
  keyInput.addEventListener('input', () => {
    state.apiKey = keyInput.value.trim();
    state.keyStatus = null;
    showKeyStatus();
    persist(state);
  });
  rememberBox.addEventListener('change', () => {
    state.remember = rememberBox.checked;
    persist(state);
  });

  testBtn.addEventListener('click', async () => {
    if (!state.apiKey) {
      state.keyStatus = { ok: false, text: t.key_missing };
      showKeyStatus();
      keyInput.focus();
      return;
    }
    testBtn.disabled = true;
    state.keyStatus = { ok: true, text: t.key_testing };
    showKeyStatus();
    try {
      const res = await llm.testKey({ provider: state.provider, apiKey: state.apiKey, model: state.model });
      state.keyStatus = res?.ok ? { ok: true, text: t.key_ok } : { ok: false, text: `${t.key_bad} ${String(res?.error?.message || res?.error || '').replace(/^Error:\s*/, '')}`.trim() };
    } catch (err) {
      state.keyStatus = { ok: false, text: `${t.key_bad} ${err?.message || err}` };
    } finally {
      testBtn.disabled = false;
      showKeyStatus();
    }
  });

  // Conversation
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const status = h('p', { class: 'chat-status muted', role: 'status', 'aria-live': 'polite' });
  const qId = nextId('question');
  const question = h('textarea', { id: qId, rows: 3, placeholder: t.question_ph });
  const askBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, t.ask);
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-secondary', hidden: !state.busy }, t.cancel);
  const clearBtn = h('button', { type: 'button', class: 'btn btn-link' }, t.clear_chat);

  const renderLog = () => {
    clear(log);
    for (const msg of state.history) {
      const who = msg.role === 'user' ? t.you : t.assistant;
      const content = h('div', { class: 'msg-content' });
      if (msg.role === 'assistant' && !msg.error) content.append(renderSafeText(msg.content));
      else content.textContent = msg.content; // user text and errors as plain text
      log.append(
        h(
          'div',
          { class: `msg msg-${msg.role}${msg.error ? ' msg-error' : ''}` },
          h('p', { class: 'msg-who' }, who),
          content,
          msg.truncated ? h('p', { class: 'msg-usage muted' }, t.truncated) : null,
          msg.usage ? h('p', { class: 'msg-usage muted' }, t.usage(msg.usage)) : null,
        ),
      );
    }
    clearBtn.hidden = state.history.length === 0;
    log.hidden = state.history.length === 0;
  };
  renderLog();

  const setBusy = (busy) => {
    state.busy = busy;
    askBtn.disabled = busy;
    cancelBtn.hidden = !busy;
    question.disabled = busy;
    status.textContent = busy ? t.asking : '';
  };

  cancelBtn.addEventListener('click', () => {
    if (state.controller) state.controller.abort();
  });
  clearBtn.addEventListener('click', () => {
    state.history = [];
    renderLog();
    question.focus();
  });

  const form = h(
    'form',
    { class: 'ask-form', novalidate: true },
    h('label', { for: qId }, t.question),
    question,
    h('div', { class: 'actions' }, askBtn, cancelBtn, clearBtn),
    status,
  );
  question.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (state.busy) return;
    const plan = getPlan();
    const q = question.value.trim();
    if (!plan) {
      announce(status, t.need_plan);
      return;
    }
    if (!state.apiKey) {
      state.keyStatus = { ok: false, text: t.key_missing };
      showKeyStatus();
      keyInput.focus();
      return;
    }
    if (!q) {
      question.focus();
      return;
    }
    const history = state.history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    state.history.push({ role: 'user', content: q });
    renderLog();
    question.value = '';
    const controller = new AbortController();
    state.controller = controller;
    setBusy(true);
    try {
      // Pass a deep copy so nothing downstream can touch the live plan.
      const res = await llm.askAboutPlan({
        provider: state.provider,
        apiKey: state.apiKey,
        model: state.model,
        plan: structuredClone(plan),
        question: q,
        history,
        lang,
        signal: controller.signal,
      });
      state.history.push({ role: 'assistant', content: String(res?.text ?? ''), usage: res?.usage || null, truncated: !!res?.truncated });
    } catch (err) {
      const aborted = err?.code === 'ABORTED' || err?.name === 'AbortError' || controller.signal.aborted;
      state.history.push({ role: 'assistant', error: true, content: aborted ? t.cancelled : `${t.llm_error} ${err?.message || err}` });
    } finally {
      state.controller = null;
      setBusy(false);
      renderLog();
      question.focus();
    }
  });

  body.append(
    h('p', {}, t.chat_intro),
    h(
      'div',
      { class: 'grid grid-2' },
      h('div', { class: 'field' }, h('label', { for: providerSel.id }, t.provider), providerSel),
      h('div', { class: 'field' }, h('label', { for: modelSel.id }, t.model), modelSel),
    ),
    h(
      'div',
      { class: 'field key-field' },
      h('label', { for: keyInput.id }, t.api_key),
      h('div', { class: 'key-row' }, keyInput, testBtn),
      keyStatus,
      keysLink,
      h('div', { class: 'callout callout-info legal-text', id: noticeId, trustedHtml: legal.llm_notice_html || '' }),
    ),
    h(
      'div',
      { class: 'check-row' },
      rememberBox,
      h('label', { for: rememberBox.id }, t.remember_session),
    ),
    h('p', { class: 'hint', id: rememberHintId }, t.remember_hint),
    log,
    form,
  );
  if (state.busy) setBusy(true);
  return details;
}
