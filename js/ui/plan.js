// Plan rendering: targets, day tabs, meals, macro bars, warnings, shopping list.
import { h, fmt } from './dom.js';
import { unitLabel } from './i18n.js';

const MACRO_KCAL = { protein_g: 4, carbs_g: 4, fat_g: 9 };

export function householdText(hh) {
  if (!hh || typeof hh !== 'string') return '';
  return hh.toLowerCase().replace(/_/g, ' ');
}

export function gramsText(g, lang) {
  if (g === null || g === undefined) return '-';
  if (g >= 1000) return `${fmt(g / 1000, 2, lang)} kg`;
  return `${fmt(g, 0, lang)} g`;
}

export const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function itemName(item) {
  return item.display_name || item.name || '';
}

// v2 items: pieces + unit_label, basis crudo|pronto. Falls back to grams + household.
function quantityCell(item, t, lang) {
  const grams = num(item.grams);
  const pieces = num(item.pieces);
  if (pieces && pieces > 0 && item.unit_label) {
    return [
      `${fmt(pieces, 1, lang)} ${unitLabel(item.unit_label, pieces, lang)}`,
      grams !== null ? h('span', { class: 'household' }, t.approx_g(fmt(grams, 0, lang))) : null,
    ];
  }
  if (grams === 0 && !(pieces > 0)) return [t.qb];
  const hh = householdText(item.household);
  const out = [gramsText(grams, lang)];
  if (item.basis === 'crudo') out.push(' ', h('span', { class: 'tag', title: t.raw_weight }, t.raw_tag));
  if (hh) out.push(h('span', { class: 'household' }, hh));
  return out;
}

// Aggregates the shopping list. Prefers the engine list when it carries v2 fields,
// otherwise rebuilds it from the plan items (gross grams and pieces).
// Shopping list order: breakfast items, fruit, cereals, protein, vegetables, fats, spreads,
// then herbs, salt and anything else. Roles come from the item or from foods.json.
const SHOP_ORDER = ['bevanda_colazione', 'base_colazione', 'frutta', 'snack', 'base_principale', 'secondo', 'contorno', 'condimento', 'spalmabile'];
let foodRoles = new Map();
export function setFoodIndex(kg) {
  foodRoles = new Map((Array.isArray(kg?.foods) ? kg.foods : []).map((f) => [String(f.id), f.role || null]));
}
function shopRank(it) {
  const role = it.role || foodRoles.get(String(it.food_id)) || null;
  const i = SHOP_ORDER.indexOf(role);
  return i === -1 ? SHOP_ORDER.length : i;
}

function shoppingItems(plan) {
  const engineList = Array.isArray(plan.shopping_list) ? plan.shopping_list : [];
  const engineV2 = engineList.some((it) => 'display_name' in it || 'pieces' in it);
  if (engineV2 || !(plan.days || []).length) {
    return engineList.map((it) => ({ food_id: it.food_id, role: it.role, name: itemName(it), full: it.name, grams: num(it.grams), pieces: num(it.pieces), unit_label: it.unit_label_plural || it.unit_label || null }));
  }
  const agg = new Map();
  for (const day of plan.days || []) {
    for (const meal of day.meals || []) {
      for (const it of (meal.items || []).flatMap((x) => (isRecipe(x) ? x.components : [x]))) {
        const key = it.food_id ?? itemName(it);
        const cur = agg.get(key) || { food_id: it.food_id, role: it.role, name: itemName(it), full: it.name, grams: 0, pieces: 0, unit_label: null, allPieces: true };
        cur.grams += num(it.grams) ?? num(it.total_grams) ?? 0;
        if (num(it.pieces) && it.unit_label) {
          cur.pieces += it.pieces;
          if (it.pieces > 1 || !cur.unit_label) cur.unit_label = it.unit_label;
        } else cur.allPieces = false;
        agg.set(key, cur);
      }
    }
  }
  return [...agg.values()].map((c) => ({ ...c, pieces: c.allPieces && c.pieces > 0 ? c.pieces : null }));
}

const RANGE_LABELS = { protein: 'protein', protein_g: 'protein', protein_pct: 'protein', carbs: 'carbs', carbs_g: 'carbs', carbs_pct: 'carbs', fat: 'fat', fat_g: 'fat', fat_pct: 'fat', kcal: 'kcal' };

export function rangeList(ranges, t, lang) {
  if (!ranges || typeof ranges !== 'object') return null;
  const rows = [];
  for (const [key, val] of Object.entries(ranges)) {
    let lo = null;
    let hi = null;
    let unit = /pct|percent|_en$|%/.test(key) ? '%' : /_g$/.test(key) ? 'g' : '';
    if (Array.isArray(val)) [lo, hi] = val;
    else if (val && typeof val === 'object') {
      lo = val.min ?? val.lo ?? val.low ?? null;
      hi = val.max ?? val.hi ?? val.high ?? null;
      if (val.unit) unit = String(val.unit);
    } else continue;
    if (num(lo) === null && num(hi) === null) continue;
    const base = RANGE_LABELS[key] || key.replace(/_(g|pct|percent|en)$/, '');
    const label = t[base] || base.replace(/_/g, ' ');
    const scale = unit === '%' && num(hi) !== null && hi <= 1 ? 100 : 1;
    const span = num(lo) !== null && num(hi) !== null ? `${fmt(lo * scale, 1, lang)}-${fmt(hi * scale, 1, lang)}` : fmt((num(lo) ?? hi) * scale, 1, lang);
    rows.push(h('li', {}, `${label}: ${span}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`));
  }
  return rows.length ? h('div', { class: 'ranges' }, h('p', { class: 'ranges-title' }, t.ranges_title), h('ul', {}, rows)) : null;
}

export function larnLimits(targets, t, lang) {
  const parts = [];
  if (num(targets?.fiber_g) !== null) parts.push(t.fiber_min(fmt(targets.fiber_g, 0, lang)));
  if (num(targets?.sugars_max_g) !== null) parts.push(t.sugars_max(fmt(targets.sugars_max_g, 0, lang)));
  if (num(targets?.sfa_max_g) !== null) parts.push(t.sfa_max(fmt(targets.sfa_max_g, 0, lang)));
  if (!parts.length) return null;
  return h('div', { class: 'ranges' }, h('p', { class: 'ranges-title' }, t.limits_title), h('ul', {}, parts.map((p) => h('li', {}, p))));
}

function targetsSummary(targets, t, lang) {
  const tile = (label, value, unit, cls) =>
    h('div', { class: `stat ${cls}` }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, fmt(value, 0, lang), h('span', { class: 'stat-unit' }, ` ${unit}`)));
  return h(
    'section',
    { class: 'targets', 'aria-labelledby': 'targets-title' },
    h('h3', { id: 'targets-title' }, t.targets_title),
    h(
      'div',
      { class: 'stats' },
      tile(t.kcal, targets?.kcal, 'kcal', 'k-kcal'),
      tile(t.protein, targets?.protein_g, 'g', 'k-protein'),
      tile(t.carbs, targets?.carbs_g, 'g', 'k-carbs'),
      tile(t.fat, targets?.fat_g, 'g', 'k-fat'),
    ),
    rangeList(targets?.ranges, t, lang),
    larnLimits(targets, t, lang),
    targets?.method ? h('p', { class: 'muted method-line' }, `${t.method}: ${typeof targets.method === 'string' ? targets.method : targets.method.label || JSON.stringify(targets.method)}`) : null,
  );
}

export function macroBar(totals, targets, t, lang) {
  const kcalOf = (k) => (Number(totals?.[k]) || 0) * MACRO_KCAL[k];
  const parts = [
    ['protein_g', t.protein, 'seg-protein'],
    ['carbs_g', t.carbs, 'seg-carbs'],
    ['fat_g', t.fat, 'seg-fat'],
  ];
  const sum = parts.reduce((s, [k]) => s + kcalOf(k), 0) || 1;
  const pct = (k) => Math.round((kcalOf(k) / sum) * 100);
  const label = parts.map(([k, name]) => `${name} ${pct(k)}%`).join(', ');

  const kcal = Number(totals?.kcal) || 0;
  const target = Number(targets?.kcal) || 0;
  const ratio = target ? Math.min(kcal / target, 1.25) : 0;

  return h(
    'div',
    { class: 'macro' },
    h(
      'div',
      { class: 'macro-bar', role: 'img', 'aria-label': `${t.macro_bar}: ${label}` },
      parts.map(([k, , cls]) => h('span', { class: `seg ${cls}`, style: `width:${(kcalOf(k) / sum) * 100}%` })),
    ),
    h(
      'ul',
      { class: 'macro-legend' },
      parts.map(([k, name, cls]) =>
        h('li', {}, h('span', { class: `dot ${cls}`, 'aria-hidden': 'true' }), `${name} ${fmt(totals?.[k], 0, lang)} g (${pct(k)}%)`),
      ),
    ),
    target
      ? h(
          'div',
          { class: 'kcal-meter' },
          h('span', { class: 'kcal-meter-text' }, `${fmt(kcal, 0, lang)} / ${fmt(target, 0, lang)} kcal (${t.target})`),
          h('span', { class: 'kcal-track', 'aria-hidden': 'true' }, h('span', { class: 'kcal-fill', style: `width:${(ratio / 1.25) * 100}%` }), h('span', { class: 'kcal-target', style: `left:${(1 / 1.25) * 100}%` })),
        )
      : null,
  );
}

// Recipe context, set by renderPlan: recipes.json lookup and the set of expanded rows.
export let recipeCtx = { byId: new Map(), expanded: new Set() };

export const isRecipe = (item) => item?.type === 'recipe' && Array.isArray(item.components);

export function swapButton(name, dayIndex, mealIndex, itemIndex, t, onSwap) {
  return h(
    'td',
    { class: 'swap-cell no-print' },
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-small',
        'aria-label': t.swap_label(name),
        dataset: { swap: `${dayIndex}:${mealIndex}:${itemIndex}` },
        onclick: () => onSwap(dayIndex, mealIndex, itemIndex),
      },
      h('span', { 'aria-hidden': 'true', class: 'swap-icon' }, '\u21c4'),
      h('span', { class: 'swap-text' }, ` ${t.swap}`),
    ),
  );
}

function foodRow(item, dayIndex, mealIndex, itemIndex, t, lang, onSwap) {
  const name = itemName(item);
  const full = item.name && item.name !== name ? item.name : null;
  return h(
    'tr',
    {},
    h('th', { scope: 'row', class: 'item-name', title: full }, name, full ? h('span', { class: 'full-name' }, full) : null),
    h('td', { class: 'num' }, quantityCell(item, t, lang)),
    h('td', { class: 'num' }, fmt(item.kcal, 0, lang)),
    swapButton(name, dayIndex, mealIndex, itemIndex, t, onSwap),
  );
}

function recipeMeta(rec, t) {
  if (!rec) return null;
  const parts = [];
  if (num(rec.difficulty) !== null) parts.push(t.difficulty(rec.difficulty));
  if (num(rec.time_min) !== null) parts.push(`${rec.time_min} min`);
  return parts.length ? h('span', { class: 'recipe-meta' }, parts.join(' \u00b7 ')) : null;
}

function recipeRows(item, dayIndex, mealIndex, itemIndex, t, lang, onSwap) {
  const key = `${dayIndex}:${mealIndex}:${itemIndex}`;
  const rec = recipeCtx.byId.get(item.recipe_id) || null;
  const name = item.display_name || (rec && (lang === 'en' ? rec.name_en : rec.name_it)) || item.name || item.recipe_id || '';
  const open = recipeCtx.expanded.has(key);
  const detailId = `recipe-${dayIndex}-${mealIndex}-${itemIndex}`;
  const steps = rec ? (lang === 'en' ? rec.steps_en || rec.steps_it : rec.steps_it || rec.steps_en) || [] : [];

  const detail = h(
    'tr',
    { class: 'recipe-detail', id: detailId, hidden: !open },
    h(
      'td',
      { colspan: '4' },
      h(
        'table',
        { class: 'components' },
        h('caption', { class: 'visually-hidden' }, t.ingredients_of(name)),
        h('tbody', {}, item.components.map((c) => {
          const cname = itemName(c);
          const full = c.name && c.name !== cname ? c.name : null;
          return h(
            'tr',
            {},
            h('th', { scope: 'row', class: 'item-name', title: full }, cname, h('span', { class: 'comp-macros' }, macroShort(c, t, lang))),
            h('td', { class: 'num' }, quantityCell(c, t, lang)),
            h('td', { class: 'num' }, `${fmt(c.kcal, 0, lang)} kcal`),
          );
        })),
      ),
      steps.length ? h('div', { class: 'recipe-steps' }, h('p', { class: 'steps-title' }, t.preparation), h('ol', {}, steps.map((st) => h('li', {}, String(st))))) : null,
    ),
  );

  const toggle = h(
    'button',
    { type: 'button', class: 'recipe-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId },
    h('span', { class: 'chev', 'aria-hidden': 'true' }),
    h('span', { class: 'recipe-name' }, name),
    h('span', { class: 'visually-hidden' }, `, ${t.show_ingredients}`),
  );
  toggle.addEventListener('click', () => {
    const now = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', now ? 'true' : 'false');
    detail.hidden = !now;
    if (now) recipeCtx.expanded.add(key);
    else recipeCtx.expanded.delete(key);
  });

  const row = h(
    'tr',
    { class: 'recipe-row' },
    h(
      'th',
      { scope: 'row', class: 'item-name' },
      toggle,
      h('span', { class: 'recipe-sub' }, h('span', { class: 'tag tag-recipe' }, t.recipe_tag), ' ', recipeMeta(rec, t)),
    ),
    h('td', { class: 'num' }, gramsText(num(item.grams), lang)),
    h('td', { class: 'num' }, fmt(item.kcal, 0, lang)),
    swapButton(name, dayIndex, mealIndex, itemIndex, t, onSwap),
  );
  return [row, detail];
}

function mealCard(meal, dayIndex, mealIndex, t, lang, onSwap) {
  const title = t.meal_names[meal.type] || meal.type;
  const rows = (meal.items || []).flatMap((item, itemIndex) =>
    isRecipe(item) ? recipeRows(item, dayIndex, mealIndex, itemIndex, t, lang, onSwap) : [foodRow(item, dayIndex, mealIndex, itemIndex, t, lang, onSwap)],
  );

  return h(
    'section',
    { class: 'meal', 'aria-label': title },
    h(
      'div',
      { class: 'meal-head' },
      h('h4', {}, title),
      meal.target_kcal ? h('span', { class: 'muted' }, `${t.target} ${fmt(meal.target_kcal, 0, lang)} kcal`) : null,
    ),
    h(
      'table',
      { class: 'items' },
      h('caption', { class: 'visually-hidden' }, title),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t.food), h('th', { scope: 'col', class: 'num' }, t.qty), h('th', { scope: 'col', class: 'num' }, 'kcal'), h('th', { scope: 'col', class: 'no-print' }, h('span', { class: 'visually-hidden' }, t.swap)))),
      h('tbody', {}, rows),
      h(
        'tfoot',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'row' }, t.meal_total),
          h('td', { class: 'num macros-cell' }, macroShort(meal.totals, t, lang)),
          h('td', { class: 'num' }, h('strong', {}, fmt(meal.totals?.kcal, 0, lang))),
          h('td', { class: 'no-print' }),
        ),
      ),
    ),
  );
}

export function macroShort(totals, t, lang) {
  if (!totals) return '';
  const f = lang === 'en' ? 'F' : 'G';
  const nb = (x) => x.replace(/ /g, '\u00a0'); // keep "C 24 g" on one line
  return `${nb(`P ${fmt(totals.protein_g, 0, lang)} g`)} · ${nb(`C ${fmt(totals.carbs_g, 0, lang)} g`)} · ${nb(`${f} ${fmt(totals.fat_g, 0, lang)} g`)}`;
}

function dayPanel(day, d, plan, t, lang, onSwap, active) {
  return h(
    'section',
    { class: 'day-panel', role: 'tabpanel', id: `day-panel-${d}`, 'aria-labelledby': `day-tab-${d}`, tabindex: '0', hidden: !active },
    h('h3', { class: 'day-title' }, day.label || `${d + 1}`),
    h('div', { class: 'meals' }, (day.meals || []).map((m, mi) => mealCard(m, d, mi, t, lang, onSwap))),
    h(
      'div',
      { class: 'day-total' },
      h('h4', {}, t.day_total),
      h('p', { class: 'day-kcal' }, h('strong', {}, `${fmt(day.totals?.kcal, 0, lang)} kcal`), ' ', h('span', { class: 'muted' }, macroShort(day.totals, t, lang))),
      macroBar(day.totals, plan.targets, t, lang),
    ),
  );
}

export function dayTabs(plan, activeDay, t, onDayChange) {
  const tabs = (plan.days || []).map((day, d) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `day-tab-${d}`,
        class: 'tab',
        'aria-selected': d === activeDay ? 'true' : 'false',
        'aria-controls': `day-panel-${d}`,
        tabindex: d === activeDay ? '0' : '-1',
        onclick: () => onDayChange(d, true),
      },
      day.label || `${d + 1}`,
    ),
  );
  const list = h('div', { class: 'tabs day-tabs no-print', role: 'tablist', 'aria-label': t.days_label }, tabs);
  list.addEventListener('keydown', (ev) => {
    const n = tabs.length;
    let next = null;
    if (ev.key === 'ArrowRight') next = (activeDay + 1) % n;
    else if (ev.key === 'ArrowLeft') next = (activeDay - 1 + n) % n;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = n - 1;
    if (next !== null) {
      ev.preventDefault();
      onDayChange(next, true);
    }
  });
  return list;
}

export function shoppingList(plan, t, lang) {
  const items = shoppingItems(plan).sort((a, b) => shopRank(a) - shopRank(b) || String(a.name).localeCompare(String(b.name), lang));
  const qty = (it) =>
    it.pieces
      ? `${fmt(it.pieces, 1, lang)}${it.unit_label ? ` ${unitLabel(it.unit_label, it.pieces, lang)}` : ''}${it.grams ? ` (${t.approx_g(fmt(it.grams, 0, lang))})` : ''}`
      : gramsText(it.grams, lang);
  return h(
    'section',
    { class: 'shopping', 'aria-labelledby': 'shopping-title' },
    h('h3', { id: 'shopping-title' }, t.tab_shopping),
    h('p', { class: 'muted' }, t.shopping_total((plan.days || []).length), ' ', t.shopping_gross),
    h(
      'ul',
      { class: 'shopping-list' },
      items.map((it) => h('li', {}, h('span', { class: 'shop-name', title: it.full && it.full !== it.name ? it.full : null }, it.name), h('span', { class: 'shop-qty' }, qty(it)))),
    ),
  );
}

/**
 * Renders the whole plan section.
 */
export function renderPlan({ plan, t, lang, activeDay, view, onSwap, onDayChange, onViewChange, onDownload, recipes, expanded }) {
  const byId = new Map();
  for (const r of Array.isArray(recipes?.recipes) ? recipes.recipes : []) if (r && r.id) byId.set(r.id, r);
  recipeCtx = { byId, expanded: expanded instanceof Set ? expanded : new Set() };
  const viewTab = (id, label) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg-btn',
        'aria-pressed': view === id ? 'true' : 'false',
        onclick: () => onViewChange(id),
      },
      label,
    );

  const warnings = (plan.warnings || []).filter(Boolean);

  return h(
    'section',
    { class: 'card plan', 'aria-labelledby': 'plan-title' },
    h(
      'div',
      { class: 'plan-head' },
      h('h2', { id: 'plan-title', tabindex: '-1' }, t.plan_title),
      h(
        'div',
        { class: 'plan-actions no-print' },
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => window.print() }, t.print),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: onDownload }, t.download_json),
      ),
    ),
    plan.meta ? h('p', { class: 'muted meta-line' }, t.meta_line(plan.meta)) : null,
    targetsSummary(plan.targets, t, lang),
    warnings.length
      ? h('div', { class: 'callout callout-warn', role: 'note' }, h('h3', {}, t.warnings), h('ul', {}, warnings.map((w) => h('li', {}, String(w)))))
      : null,
    h('div', { class: 'segmented no-print', role: 'group', 'aria-label': t.plan_title }, viewTab('menu', t.tab_plan), viewTab('shopping', t.tab_shopping)),
    h(
      'div',
      { class: `view view-menu ${view === 'menu' ? '' : 'screen-hidden'}` },
      dayTabs(plan, activeDay, t, onDayChange),
      (plan.days || []).map((day, d) => dayPanel(day, d, plan, t, lang, onSwap, d === activeDay)),
      h('p', { class: 'muted basis-note' }, t.basis_note),
    ),
    h('div', { class: `view view-shopping ${view === 'shopping' ? '' : 'screen-hidden'}` }, shoppingList(plan, t, lang)),
  );
}
