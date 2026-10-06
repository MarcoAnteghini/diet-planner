// Plan rendering: targets, day tabs, meals, macro bars, warnings, shopping list.
import { h, fmt } from './dom.js';

const MACRO_KCAL = { protein_g: 4, carbs_g: 4, fat_g: 9 };

function householdText(hh) {
  if (!hh || typeof hh !== 'string') return '';
  return hh.toLowerCase().replace(/_/g, ' ');
}

function gramsText(g, lang) {
  if (g === null || g === undefined) return '-';
  if (g >= 1000) return `${fmt(g / 1000, 2, lang)} kg`;
  return `${fmt(g, 0, lang)} g`;
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
  );
}

function macroBar(totals, targets, t, lang) {
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

function mealCard(meal, dayIndex, mealIndex, t, lang, onSwap) {
  const title = t.meal_names[meal.type] || meal.type;
  const rows = (meal.items || []).map((item, itemIndex) => {
    const hh = householdText(item.household);
    return h(
      'tr',
      {},
      h('th', { scope: 'row', class: 'item-name' }, item.name),
      h('td', { class: 'num' }, gramsText(item.grams, lang), hh ? h('span', { class: 'household' }, hh) : null),
      h('td', { class: 'num' }, fmt(item.kcal, 0, lang)),
      h(
        'td',
        { class: 'swap-cell no-print' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            'aria-label': t.swap_label(item.name),
            dataset: { swap: `${dayIndex}:${mealIndex}:${itemIndex}` },
            onclick: () => onSwap(dayIndex, mealIndex, itemIndex),
          },
          h('span', { 'aria-hidden': 'true', class: 'swap-icon' }, '⇄ '),
          t.swap,
        ),
      ),
    );
  });

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

function macroShort(totals, t, lang) {
  if (!totals) return '';
  const f = lang === 'en' ? 'F' : 'G';
  return `P ${fmt(totals.protein_g, 0, lang)} g · C ${fmt(totals.carbs_g, 0, lang)} g · ${f} ${fmt(totals.fat_g, 0, lang)} g`;
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

function dayTabs(plan, activeDay, t, onDayChange) {
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

function shoppingList(plan, t, lang) {
  const items = [...(plan.shopping_list || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), lang));
  return h(
    'section',
    { class: 'shopping', 'aria-labelledby': 'shopping-title' },
    h('h3', { id: 'shopping-title' }, t.tab_shopping),
    h('p', { class: 'muted' }, t.shopping_total((plan.days || []).length)),
    h(
      'ul',
      { class: 'shopping-list' },
      items.map((it) => h('li', {}, h('span', { class: 'shop-name' }, it.name), h('span', { class: 'shop-qty' }, gramsText(it.grams, lang)))),
    ),
  );
}

/**
 * Renders the whole plan section.
 */
export function renderPlan({ plan, t, lang, activeDay, view, onSwap, onDayChange, onViewChange, onDownload }) {
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
    ),
    h('div', { class: `view view-shopping ${view === 'shopping' ? '' : 'screen-hidden'}` }, shoppingList(plan, t, lang)),
  );
}
