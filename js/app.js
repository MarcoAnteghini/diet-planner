// Entry point of the static web app. No build step, no framework.
// Profile data lives only in memory; nothing is sent anywhere except the optional
// LLM call that the user starts with their own API key.
import * as engine from './engine.js';
import { LEGAL, LEGAL_VERSION } from './legal.js';
import { h, clear, announce } from './ui/dom.js';
import { strings, seasonFromDate } from './ui/i18n.js';
import { hasConsent, renderConsent } from './ui/consent.js';
import { defaultProfileValues, renderProfileForm, toProfile, memberLabel } from './ui/profile.js';
import { renderFamilyPlan } from './ui/family.js';
import { renderPlan, setFoodIndex } from './ui/plan.js';
import { createChatState, renderChat } from './ui/chat.js';

const state = {
  lang: document.documentElement.lang === 'en' ? 'en' : 'it',
  kg: null,
  recipes: null, // parsed recipes.json, optional
  expandedRecipes: new Set(),
  dataNotice: null, // 'sample' | 'error' | null
  consent: hasConsent(LEGAL_VERSION),
  values: defaultProfileValues(seasonFromDate()),
  family: { mode: 'single', members: [] }, // members only in memory, never stored
  familyMembers: null, // engine members used for the current family plan
  profile: null, // profile used for the current plan
  plan: null,
  activeDay: 0,
  view: 'menu',
  llm: null,
  chat: createChatState(),
};

const $ = (id) => document.getElementById(id);
const ui = {
  title: $('app-title'),
  subtitle: $('app-subtitle'),
  langBtn: $('lang-toggle'),
  skip: $('skip-link'),
  banner: $('banner'),
  notice: $('notice'),
  consent: $('consent'),
  profile: $('profile'),
  plan: $('plan'),
  chat: $('chat'),
  footer: $('footer'),
  live: $('live'),
};

const t = () => strings(state.lang);
const legal = () => (LEGAL && (LEGAL[state.lang] || LEGAL.it)) || {};

// ---------- data ----------

function dataUrl(attr, fallback) {
  const override = document.documentElement.dataset[attr];
  return new URL(override || fallback, override ? document.baseURI : import.meta.url).href;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  try {
    state.kg = await fetchJson(dataUrl('foods', '../data/foods.json'));
    state.dataNotice = null;
  } catch {
    try {
      state.kg = await fetchJson(dataUrl('foodsSample', '../data/foods.sample.json'));
      state.dataNotice = 'sample';
    } catch {
      state.kg = null;
      state.dataNotice = 'error';
    }
  }
}

// Recipes are optional: any failure means "no recipes", silently.
async function loadRecipes() {
  try {
    const data = await fetchJson(dataUrl('recipes', '../data/recipes.json'));
    state.recipes = data && Array.isArray(data.recipes) && data.recipes.length ? data : null;
  } catch {
    state.recipes = null;
  }
}

function planOpts() {
  const useRecipes = !!state.recipes && state.values.useRecipes !== false;
  return { recipes: useRecipes ? state.recipes : null, useRecipes };
}

async function loadLlm() {
  try {
    state.llm = await import('./llm.js');
  } catch (err) {
    console.warn('llm.js not available', err);
    state.llm = null;
  }
}

// ---------- actions ----------

const familyAvailable = () => typeof engine.generateFamilyPlan === 'function' && typeof engine.swapFamilyItem === 'function';
const isFamilyMode = () => familyAvailable() && state.family.mode === 'family';

function validateOne(values) {
  try {
    const res = engine.validateProfile(toProfile(values, state.lang));
    return { ok: !!res?.ok, errors: Array.isArray(res?.errors) ? res.errors : [] };
  } catch (err) {
    return { ok: false, errors: [String(err?.message || err)] };
  }
}

// Shared fields (season, days, seed) come from the main form values.
function memberProfiles() {
  const shared = { season: state.values.season, days: state.values.days, seed: state.values.seed };
  return state.family.members.map((m, i) => ({ label: memberLabel(m, i, t()), ...toProfile({ ...m, ...shared }, state.lang) }));
}

function validate() {
  if (!isFamilyMode()) return validateOne(state.values);
  const errors = [];
  const shared = { season: state.values.season, days: state.values.days, seed: state.values.seed };
  state.family.members.forEach((m, i) => {
    const r = validateOne({ ...m, ...shared });
    for (const e of r.errors) errors.push(`${memberLabel(m, i, t())}: ${e}`);
  });
  return { ok: errors.length === 0, errors };
}

function generate() {
  if (!state.kg) return;
  const family = isFamilyMode();
  const profile = toProfile(state.values, state.lang);
  try {
    if (family) {
      const members = memberProfiles();
      state.plan = engine.generateFamilyPlan(members, state.kg, planOpts());
      state.familyMembers = members;
    } else {
      state.plan = engine.generatePlan(profile, state.kg, planOpts());
      state.familyMembers = null;
    }
    state.expandedRecipes = new Set();
    state.profile = family ? null : profile;
    state.planOpts = planOpts();
    state.activeDay = 0;
    state.view = 'menu';
    renderPlanSection();
    const heading = document.getElementById('plan-title');
    if (heading) heading.focus();
    announce(ui.live, t().plan_generated(state.plan?.days?.length || 0));
  } catch (err) {
    console.error(err);
    state.plan = null;
    clear(ui.plan).append(h('div', { class: 'card callout callout-error', role: 'alert' }, `${t().engine_error} ${err?.message || err}`));
  }
}

function swap(d, m, i) {
  if (!state.plan) return;
  const before = state.plan.days?.[d]?.meals?.[m]?.items?.[i];
  try {
    const opts = state.planOpts || planOpts();
    const next = state.plan?.meta?.family
      ? engine.swapFamilyItem(state.plan, state.kg, d, m, i, state.familyMembers, opts)
      : engine.swapItem(state.plan, state.kg, d, m, i, state.profile, opts);
    const after = next?.days?.[d]?.meals?.[m]?.items?.[i];
    const same = before && after && (before.type === 'recipe' ? after.recipe_id === before.recipe_id : after.food_id === before.food_id);
    if (!next || !after || same) {
      announce(ui.live, t().swap_none);
      return;
    }
    state.plan = next;
    renderPlanSection();
    const btn = ui.plan.querySelector(`[data-swap="${d}:${m}:${i}"]`);
    if (btn) btn.focus();
    announce(ui.live, t().swapped(before?.display_name || before?.name || '', after.display_name || after.name));
  } catch (err) {
    console.error(err);
    announce(ui.live, `${t().engine_error} ${err?.message || err}`);
  }
}

function downloadJson() {
  if (!state.plan) return;
  const blob = new Blob([JSON.stringify(state.plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `piano-alimentare-${state.plan?.meta?.seed ?? 'export'}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- rendering ----------

function renderChrome() {
  const s = t();
  const L = legal();
  document.documentElement.lang = state.lang;
  document.title = s.app_title;
  ui.title.textContent = s.app_title;
  ui.subtitle.textContent = `${s.app_subtitle} ${s.sources_line}`;
  ui.skip.textContent = s.skip;
  ui.langBtn.textContent = s.lang_toggle;
  ui.langBtn.setAttribute('aria-label', s.lang_toggle_label);
  ui.langBtn.setAttribute('lang', state.lang === 'it' ? 'en' : 'it');

  clear(ui.banner);
  if (L.banner_short) {
    ui.banner.append(h('div', { class: 'banner-inner', trustedHtml: L.banner_short }));
    ui.banner.hidden = false;
  } else ui.banner.hidden = true;

  clear(ui.footer);
  ui.footer.append(h('div', { class: 'legal-text', trustedHtml: L.footer_html || '' }));
  // Always keep an explicit link to the legal page, even if footer_html lacks one.
  if (!ui.footer.querySelector('a[href*="legal.html"]')) {
    ui.footer.append(h('p', {}, h('a', { href: 'legal.html' }, s.legal_link)));
  }
  syncLegalLinks();
}

// legal.html accepts ?lang=it|en: keep links in the page language.
function syncLegalLinks() {
  for (const a of document.querySelectorAll('a[href^="legal.html"]')) {
    a.setAttribute('href', `legal.html?lang=${state.lang}`);
  }
}

function renderNotice() {
  clear(ui.notice);
  const s = t();
  if (state.dataNotice === 'sample') {
    ui.notice.append(h('div', { class: 'callout callout-info', role: 'status' }, s.data_sample_notice));
  } else if (state.dataNotice === 'error') {
    ui.notice.append(h('div', { class: 'callout callout-error', role: 'alert' }, s.data_error));
  }
}

function renderProfileSection() {
  clear(ui.profile);
  if (!state.consent || !state.kg) return;
  ui.profile.append(
    renderProfileForm({
      values: state.values,
      t: t(),
      kg: state.kg,
      family: state.family,
      familyAvailable: familyAvailable(),
      validate,
      onSubmit: generate,
      recipesAvailable: !!state.recipes,
      onNewVariant: () => {
        if (state.plan && validate().ok) generate();
      },
      onModeChange: (focusMember) => {
        renderProfileSection();
        if (typeof focusMember === 'number') {
          const card = ui.profile.querySelectorAll('.member-card')[focusMember];
          const input = card && card.querySelector('input');
          if (input) input.focus();
        } else {
          const checked = ui.profile.querySelector('.mode-switch input:checked');
          if (checked) checked.focus();
        }
      },
    }),
  );
  const foods = Array.isArray(state.kg.foods) ? state.kg.foods.length : 0;
  ui.profile.append(h('p', { class: 'muted data-info' }, t().data_info(foods, state.kg.version || '?')));
}

function renderPlanSection() {
  clear(ui.plan);
  if (!state.consent || !state.plan) return;
  const render = state.plan?.meta?.family ? renderFamilyPlan : renderPlan;
  ui.plan.append(
    render({
      plan: state.plan,
      t: t(),
      lang: state.lang,
      activeDay: state.activeDay,
      view: state.view,
      onSwap: swap,
      onDayChange: (d, focus) => {
        state.activeDay = d;
        renderPlanSection();
        if (focus) {
          const tab = document.getElementById(`day-tab-${d}`);
          if (tab) tab.focus();
        }
      },
      onViewChange: (v) => {
        state.view = v;
        renderPlanSection();
        const btn = ui.plan.querySelector('.segmented [aria-pressed="true"]');
        if (btn) btn.focus();
      },
      onDownload: downloadJson,
      recipes: state.recipes,
      expanded: state.expandedRecipes,
    }),
  );
}

function renderChatSection() {
  clear(ui.chat);
  if (!state.consent || !state.kg) return;
  ui.chat.append(renderChat({ state: state.chat, llm: state.llm, legal: legal(), t: t(), lang: state.lang, getPlan: () => state.plan }));
}

function renderAll() {
  renderChrome();
  renderNotice();
  clear(ui.consent);
  if (!state.consent) {
    ui.consent.append(
      renderConsent({
        legal: legal(),
        legalVersion: LEGAL_VERSION,
        t: t(),
        onAccept: () => {
          state.consent = true;
          renderAll();
          const first = ui.profile.querySelector('input, select');
          if (first) first.focus();
        },
      }),
    );
  }
  renderProfileSection();
  renderPlanSection();
  renderChatSection();
  syncLegalLinks();
}

ui.langBtn.addEventListener('click', () => {
  state.lang = state.lang === 'it' ? 'en' : 'it';
  if (state.profile) state.profile = { ...state.profile, lang: state.lang };
  if (state.familyMembers) state.familyMembers = state.familyMembers.map((m) => ({ ...m, lang: state.lang }));
  renderAll();
  ui.langBtn.focus();
});

// ---------- boot ----------

(async function boot() {
  ui.notice.append(h('p', { class: 'muted', role: 'status' }, t().loading_data));
  renderChrome();
  await Promise.all([loadData(), loadLlm()]);
  if (state.kg) {
    setFoodIndex(state.kg);
    await loadRecipes();
  }
  renderAll();
})();
