// Family plan view: same menu for everyone, one dose column per member.
// On wide screens doses sit in columns; on phones each row lists "Marco 100 g · Anna 70 g".
import { h, fmt } from './dom.js';
import { unitLabel } from './i18n.js';
import { num, gramsText, householdText, macroBar, macroShort, dayTabs, shoppingList, swapButton } from './plan.js';

function memberName(plan, i, t) {
  const m = plan.members?.[i];
  return (m && String(m.label || '').trim()) || t.person_n(i + 1);
}

function perMember(item, i) {
  const list = Array.isArray(item?.per_member) ? item.per_member : [];
  return list.find((x) => x && x.member === i) || list[i] || null;
}

function doseCell(item, pm, who, t, lang, pinch = false) {
  const pieces = pm ? num(pm.pieces) : null;
  const grams = pm ? num(pm.grams) : null;
  // A component that rounds to 0 g for everyone (pepper, a pinch of salt) is "q.b.", not missing.
  if (pinch) return h('li', { class: 'dose' }, h('span', { class: 'who' }, who), h('span', { class: 'dose-main' }, t.qb));
  // Dose 0 (or no entry): "-" in the column, omitted from the stacked phone list.
  if (!pm || ((grams === null || grams === 0) && !(pieces > 0))) {
    return h('li', { class: 'dose dose-none' }, h('span', { class: 'visually-hidden' }, t.not_planned(who)), h('span', { class: 'dose-main', 'aria-hidden': 'true' }, '-'));
  }
  const unit = pm.unit_label || item.unit_label;
  const main = pieces && pieces > 0 && unit ? `${fmt(pieces, 1, lang)} ${unitLabel(unit, pieces, lang)}` : gramsText(grams, lang);
  const sub = [];
  if (pieces && pieces > 0 && unit && grams !== null) sub.push(t.approx_g(fmt(grams, 0, lang)));
  if (num(pm.kcal) !== null) sub.push(`${fmt(pm.kcal, 0, lang)} kcal`);
  return h(
    'li',
    { class: 'dose' },
    h('span', { class: 'who' }, who),
    h('span', { class: 'dose-main' }, main),
    sub.length ? h('span', { class: 'dose-sub' }, sub.join(' · ')) : null,
  );
}

function headRow(plan, n, t, firstLabel) {
  return h(
    'div',
    { class: 'fam-row fam-head', 'aria-hidden': 'true' },
    h('span', {}, firstLabel),
    Array.from({ length: n }, (_, i) => h('span', { class: 'fam-col' }, memberName(plan, i, t))),
    h('span', {}),
  );
}

function componentRows(item, plan, n, t, lang) {
  const base = perMember(item, 0)?.components || item.components || [];
  return base.map((c, ci) => {
    const name = c.display_name || c.name || '';
    const compOf = (i) => {
      const comps = perMember(item, i)?.components || [];
      return comps.find((x) => x && x.food_id === c.food_id) || comps[ci] || null;
    };
    const pinch = Array.from({ length: n }, (_, i) => compOf(i)).every((pc) => !pc || !(num(pc.grams) > 0));
    return h(
      'div',
      { class: 'fam-row fam-comp' },
      h('div', { class: 'fam-name', title: c.name && c.name !== name ? c.name : null }, name, c.basis === 'crudo' ? [' ', h('span', { class: 'tag', title: t.raw_weight }, t.raw_tag)] : null),
      h(
        'ul',
        { class: 'doses' },
        Array.from({ length: n }, (_, i) => doseCell(c, compOf(i), memberName(plan, i, t), t, lang, pinch)),
      ),
      h('span', {}),
    );
  });
}

function itemRow(item, plan, n, d, m, i, t, lang, onSwap, ctx) {
  const isRecipe = item.type === 'recipe';
  const name = item.display_name || item.name || item.recipe_id || '';
  const rec = isRecipe ? ctx.byId.get(item.recipe_id) : null;
  const key = `${d}:${m}:${i}`;
  const detailId = `fam-recipe-${d}-${m}-${i}`;
  const open = ctx.expanded.has(key);

  const tags = [];
  if (isRecipe) tags.push(h('span', { class: 'tag tag-recipe' }, t.recipe_tag));
  if (!isRecipe && item.basis === 'crudo') tags.push(h('span', { class: 'tag', title: t.raw_weight }, t.raw_tag));
  const meta = [];
  if (rec && num(rec.difficulty) !== null) meta.push(t.difficulty(rec.difficulty));
  if (rec && num(rec.time_min) !== null) meta.push(`${rec.time_min} min`);
  const hh = !isRecipe ? householdText(item.household) : '';

  let nameEl;
  let detail = null;
  if (isRecipe) {
    const toggle = h(
      'button',
      { type: 'button', class: 'recipe-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId },
      h('span', { class: 'chev', 'aria-hidden': 'true' }),
      h('span', { class: 'recipe-name' }, name),
      h('span', { class: 'visually-hidden' }, `, ${t.show_ingredients}`),
    );
    const steps = rec ? (lang === 'en' ? rec.steps_en || rec.steps_it : rec.steps_it || rec.steps_en) || [] : [];
    detail = h(
      'div',
      { class: 'fam-detail recipe-detail-block', id: detailId, hidden: !open },
      h('p', { class: 'visually-hidden' }, t.ingredients_of(name)),
      componentRows(item, plan, n, t, lang),
      steps.length ? h('div', { class: 'recipe-steps' }, h('p', { class: 'steps-title' }, t.preparation), h('ol', {}, steps.map((st) => h('li', {}, String(st))))) : null,
    );
    toggle.addEventListener('click', () => {
      const now = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', now ? 'true' : 'false');
      detail.hidden = !now;
      if (now) ctx.expanded.add(key);
      else ctx.expanded.delete(key);
    });
    nameEl = toggle;
  } else {
    nameEl = h('span', { class: 'fam-food', title: item.name && item.name !== name ? item.name : null }, name);
  }

  const row = h(
    'div',
    { class: `fam-row${isRecipe ? ' fam-recipe' : ''}` },
    h(
      'div',
      { class: 'fam-name' },
      nameEl,
      tags.length || meta.length || hh
        ? h('span', { class: isRecipe ? 'recipe-sub' : 'item-sub' }, tags, tags.length ? ' ' : '', [meta.join(' · '), hh].filter(Boolean).join(' · '))
        : null,
    ),
    h('ul', { class: 'doses', 'aria-label': t.doses_for(name) }, Array.from({ length: n }, (_, k) => doseCell(item, perMember(item, k), memberName(plan, k, t), t, lang))),
    // swapButton returns a <td>; reuse its button only.
    h('div', { class: 'fam-swap no-print' }, swapButton(name, d, m, i, t, onSwap).firstChild),
  );
  return detail ? [row, detail] : [row];
}

function mealBlock(meal, plan, n, d, m, t, lang, onSwap, ctx) {
  const title = t.meal_names[meal.type] || meal.type;
  return h(
    'section',
    { class: 'meal fam-meal', 'aria-label': title },
    h('div', { class: 'meal-head' }, h('h4', {}, title)),
    h(
      'div',
      { class: 'fam-table', style: `--n:${n}` },
      headRow(plan, n, t, t.food),
      (meal.items || []).flatMap((item, i) => itemRow(item, plan, n, d, m, i, t, lang, onSwap, ctx)),
    ),
  );
}

function dayTotals(day, plan, n, t, lang) {
  const totals = Array.isArray(day.per_member_totals) ? day.per_member_totals : [];
  return h(
    'div',
    { class: 'day-total' },
    h('h4', {}, t.day_total),
    h(
      'ul',
      { class: 'member-totals' },
      Array.from({ length: n }, (_, i) => {
        const tot = totals.find((x) => x && x.member === i) || totals[i];
        if (!tot) return null;
        const targets = plan.members?.[i]?.targets;
        return h(
          'li',
          {},
          h('p', { class: 'day-kcal' }, h('strong', {}, `${memberName(plan, i, t)}: ${fmt(tot.kcal, 0, lang)} kcal`), ' ', h('span', { class: 'muted' }, macroShort(tot, t, lang))),
          macroBar(tot, targets, t, lang),
        );
      }),
    ),
  );
}

function membersSummary(plan, t, lang) {
  const members = Array.isArray(plan.members) ? plan.members : [];
  return h(
    'section',
    { class: 'targets', 'aria-labelledby': 'targets-title' },
    h('h3', { id: 'targets-title' }, t.members_targets),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'member-targets' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t.member_col), h('th', { scope: 'col', class: 'num' }, 'kcal'), h('th', { scope: 'col', class: 'num' }, t.protein), h('th', { scope: 'col', class: 'num' }, t.carbs), h('th', { scope: 'col', class: 'num' }, t.fat))),
        h(
          'tbody',
          {},
          members.map((mb, i) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, memberName(plan, i, t)),
              h('td', { class: 'num' }, fmt(mb.targets?.kcal, 0, lang)),
              h('td', { class: 'num' }, `${fmt(mb.targets?.protein_g, 0, lang)} g`),
              h('td', { class: 'num' }, `${fmt(mb.targets?.carbs_g, 0, lang)} g`),
              h('td', { class: 'num' }, `${fmt(mb.targets?.fat_g, 0, lang)} g`),
            ),
          ),
        ),
      ),
    ),
    members[0]?.targets?.method ? h('p', { class: 'muted method-line' }, `${t.method}: ${members[0].targets.method}`) : null,
  );
}

export function renderFamilyPlan({ plan, t, lang, activeDay, view, onSwap, onDayChange, onViewChange, onDownload, recipes, expanded }) {
  const n = Math.max(1, Array.isArray(plan.members) ? plan.members.length : num(plan.meta?.members) || 1);
  const byId = new Map();
  for (const r of Array.isArray(recipes?.recipes) ? recipes.recipes : []) if (r && r.id) byId.set(r.id, r);
  const ctx = { byId, expanded: expanded instanceof Set ? expanded : new Set() };
  const warnings = (plan.warnings || []).filter(Boolean);

  const viewTab = (id, label) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': view === id ? 'true' : 'false', onclick: () => onViewChange(id) }, label);

  return h(
    'section',
    { class: 'card plan family-plan', 'aria-labelledby': 'plan-title' },
    h(
      'div',
      { class: 'plan-head' },
      h('h2', { id: 'plan-title', tabindex: '-1' }, t.family_plan_title),
      h(
        'div',
        { class: 'plan-actions no-print' },
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => window.print() }, t.print),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: onDownload }, t.download_json),
      ),
    ),
    plan.meta ? h('p', { class: 'muted meta-line' }, t.meta_line(plan.meta)) : null,
    h('p', { class: 'muted' }, t.family_note),
    membersSummary(plan, t, lang),
    warnings.length ? h('div', { class: 'callout callout-warn', role: 'note' }, h('h3', {}, t.warnings), h('ul', {}, warnings.map((w) => h('li', {}, String(w))))) : null,
    h('div', { class: 'segmented no-print', role: 'group', 'aria-label': t.family_plan_title }, viewTab('menu', t.tab_plan), viewTab('shopping', t.tab_shopping)),
    h(
      'div',
      { class: `view view-menu ${view === 'menu' ? '' : 'screen-hidden'}` },
      dayTabs(plan, activeDay, t, onDayChange),
      (plan.days || []).map((day, d) =>
        h(
          'section',
          { class: 'day-panel', role: 'tabpanel', id: `day-panel-${d}`, 'aria-labelledby': `day-tab-${d}`, tabindex: '0', hidden: d !== activeDay },
          h('h3', { class: 'day-title' }, day.label || `${d + 1}`),
          h('div', { class: 'fam-meals' }, (day.meals || []).map((meal, m) => mealBlock(meal, plan, n, d, m, t, lang, onSwap, ctx))),
          dayTotals(day, plan, n, t, lang),
        ),
      ),
      h('p', { class: 'muted basis-note' }, t.basis_note),
    ),
    h('div', { class: `view view-shopping ${view === 'shopping' ? '' : 'screen-hidden'}` }, h('p', { class: 'muted' }, t.family_shopping), shoppingList(plan, t, lang)),
  );
}
