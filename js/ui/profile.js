// Profile form. Values live only in memory (the `state` object passed in).
import { h, nextId } from './dom.js';

const ACTIVITIES = ['sedentario', 'leggero', 'moderato', 'attivo', 'molto_attivo'];
const GOALS = ['dimagrire', 'mantenimento', 'massa'];
const DIETS = ['onnivoro', 'vegetariano', 'vegano'];
const DEFAULT_SEASONS = ['inverno', 'primavera', 'estate', 'autunno'];

export function randomSeed() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] % 99999) + 1;
  } catch {
    return Math.floor(Math.random() * 99999) + 1;
  }
}

export function defaultProfileValues(season) {
  return {
    sex: '',
    age: '',
    weight_kg: '',
    height_cm: '',
    activity: 'leggero',
    goal: 'mantenimento',
    season,
    diet: 'onnivoro',
    allergens: [],
    days: 7,
    seed: randomSeed(),
    useRecipes: true,
  };
}

// Converts raw form values into the engine Profile shape.
export function toProfile(v, lang) {
  const num = (x) => (x === '' || x === null || x === undefined ? NaN : Number(x));
  return {
    sex: v.sex,
    age: num(v.age),
    weight_kg: num(v.weight_kg),
    height_cm: num(v.height_cm),
    activity: v.activity,
    goal: v.goal,
    season: v.season,
    diet: v.diet,
    allergens: [...v.allergens],
    exclude_food_ids: [],
    days: num(v.days),
    seed: Number.isFinite(num(v.seed)) ? num(v.seed) : 1,
    lang,
  };
}

function field(labelText, control, hint) {
  const hintId = hint ? nextId('hint') : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  return h(
    'div',
    { class: 'field' },
    h('label', { for: control.id }, labelText),
    control,
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
  );
}

function select(id, name, options, value) {
  const el = h('select', { id, name });
  for (const [val, label] of options) {
    el.append(h('option', { value: val, selected: val === value }, label));
  }
  return el;
}

function radioGroup(legend, name, options, value, required) {
  return h(
    'fieldset',
    { class: 'field fieldset-inline' },
    h('legend', {}, legend),
    h(
      'div',
      { class: 'radio-row' },
      options.map(([val, label]) => {
        const id = nextId(name);
        return h(
          'div',
          { class: 'check-row' },
          h('input', { type: 'radio', id, name, value: val, checked: val === value, required }),
          h('label', { for: id }, label),
        );
      }),
    ),
  );
}

export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 8;

export function defaultMember(index, base = {}) {
  return {
    label: '',
    sex: '',
    age: '',
    weight_kg: '',
    height_cm: '',
    activity: base.activity || 'leggero',
    goal: base.goal || 'mantenimento',
    diet: base.diet || 'onnivoro',
    allergens: [...(base.allergens || [])],
    _key: `m${Date.now().toString(36)}${index}${Math.random().toString(36).slice(2, 6)}`,
  };
}

export function memberLabel(m, i, t) {
  return (m.label || '').trim() || t.person_n(i + 1);
}

// Personal fields (sex, age, weight, height, activity, goal, diet, allergens), used for
// the single profile and for each family member card. Reads back through the returned reader.
function personFields(v, t, allergens, prefix) {
  const ctl = {};
  ctl.age = h('input', { id: nextId(`${prefix}age`), type: 'number', inputmode: 'numeric', min: 18, max: 80, step: 1, value: v.age, required: true, autocomplete: 'off' });
  ctl.weight_kg = h('input', { id: nextId(`${prefix}weight`), type: 'number', inputmode: 'decimal', min: 30, max: 300, step: 0.1, value: v.weight_kg, required: true, autocomplete: 'off' });
  ctl.height_cm = h('input', { id: nextId(`${prefix}height`), type: 'number', inputmode: 'numeric', min: 120, max: 230, step: 1, value: v.height_cm, required: true, autocomplete: 'off' });
  ctl.activity = select(nextId(`${prefix}activity`), `${prefix}activity`, ACTIVITIES.map((a) => [a, t.activity_opts[a]]), v.activity);
  ctl.goal = select(nextId(`${prefix}goal`), `${prefix}goal`, GOALS.map((g) => [g, t.goal_opts[g]]), v.goal);
  ctl.diet = select(nextId(`${prefix}diet`), `${prefix}diet`, DIETS.map((d) => [d, t.diet_opts[d]]), v.diet);
  const sexName = nextId(`${prefix}sex`);
  const sexGroup = radioGroup(t.sex, sexName, [['f', t.sex_f], ['m', t.sex_m]], v.sex, true);

  const allergenBoxes = allergens.map((a) => {
    const id = nextId(`${prefix}allergen`);
    const box = h('input', { type: 'checkbox', id, value: a, checked: v.allergens.includes(a) });
    return { box, row: h('div', { class: 'check-row' }, box, h('label', { for: id }, t.allergen_names[a] || a.replace(/_/g, ' '))) };
  });

  const nodes = [
    h(
      'div',
      { class: 'grid' },
      sexGroup,
      field(t.age, ctl.age),
      field(t.weight, ctl.weight_kg),
      field(t.height, ctl.height_cm),
      field(t.activity, ctl.activity),
      field(t.goal, ctl.goal),
      field(t.diet, ctl.diet),
    ),
    allergenBoxes.length
      ? h('fieldset', { class: 'field allergens' }, h('legend', {}, t.allergens), h('div', { class: 'check-grid' }, allergenBoxes.map((x) => x.row)))
      : null,
  ];

  const read = () => {
    const checked = sexGroup.querySelector('input:checked');
    v.sex = checked ? checked.value : '';
    v.age = ctl.age.value;
    v.weight_kg = ctl.weight_kg.value;
    v.height_cm = ctl.height_cm.value;
    v.activity = ctl.activity.value;
    v.goal = ctl.goal.value;
    v.diet = ctl.diet.value;
    v.allergens = allergenBoxes.filter((x) => x.box.checked).map((x) => x.box.value);
  };
  return { nodes, read };
}

/**
 * Renders the profile form (single person or family).
 * @param {object} p
 * @param {object} p.values  mutable in-memory values (personal fields + shared season/days/seed/useRecipes)
 * @param {object} p.family  mutable {mode:'single'|'family', members:[...]}
 * @param {boolean} p.familyAvailable  engine exposes generateFamilyPlan
 * @param {function} p.validate   () => {ok, errors}
 * @param {function} p.onModeChange () => void (re-render)
 */
export function renderProfileForm({ values, family, familyAvailable = false, t, kg, validate, onSubmit, onNewVariant, onModeChange, recipesAvailable = false }) {
  const allergens = Array.isArray(kg?.allergens) ? kg.allergens : [];
  const seasons = Array.isArray(kg?.seasons) && kg.seasons.length ? kg.seasons : DEFAULT_SEASONS;
  const isFamily = familyAvailable && family?.mode === 'family';

  const errorsBox = h('div', { class: 'error-summary', role: 'alert', 'aria-live': 'assertive', hidden: true, tabindex: '-1' });

  const days = h('input', { id: nextId('days'), name: 'days', type: 'number', inputmode: 'numeric', min: 1, max: 7, step: 1, value: values.days, required: true });
  const seed = h('input', { id: nextId('seed'), name: 'seed', type: 'number', inputmode: 'numeric', min: 1, step: 1, value: values.seed });
  const season = select(nextId('season'), 'season', seasons.map((x) => [x, t.season_opts[x] || x]), values.season);
  const recipesBox = recipesAvailable ? h('input', { type: 'checkbox', id: nextId('recipes'), name: 'use_recipes', checked: values.useRecipes !== false }) : null;
  const variantBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, t.new_variant);

  // Mode switch
  const modeSwitch = familyAvailable
    ? h(
        'fieldset',
        { class: 'mode-switch' },
        h('legend', { class: 'visually-hidden' }, t.mode_label),
        [['single', t.mode_single], ['family', t.mode_family]].map(([val, label]) => {
          const id = nextId('mode');
          const input = h('input', { type: 'radio', id, name: 'mode', value: val, checked: (isFamily ? 'family' : 'single') === val, class: 'visually-hidden' });
          input.addEventListener('change', () => {
            readAll();
            family.mode = val;
            if (val === 'family' && family.members.length < MIN_MEMBERS) {
              // First member starts from the single profile so nothing typed is lost.
              if (!family.members.length) family.members.push({ ...defaultMember(0), ...pick(values), label: '' });
              while (family.members.length < MIN_MEMBERS) family.members.push(defaultMember(family.members.length, values));
            }
            onModeChange();
          });
          return h('span', { class: 'mode-opt' }, input, h('label', { for: id }, label));
        }),
      )
    : null;

  let readers = [];
  let personBlock;
  if (!isFamily) {
    const pf = personFields(values, t, allergens, 'p-');
    readers.push(pf.read);
    personBlock = pf.nodes;
  } else {
    personBlock = [
      h('div', { class: 'callout callout-info family-note' }, h('p', {}, t.family_note), h('p', {}, t.family_adults)),
      h(
        'div',
        { class: 'members' },
        family.members.map((m, i) => {
          const pf = personFields(m, t, allergens, `m${i}-`);
          const labelInput = h('input', { type: 'text', id: nextId('label'), value: m.label, placeholder: t.person_n(i + 1), maxlength: 30, autocomplete: 'off' });
          readers.push(() => {
            m.label = labelInput.value;
            pf.read();
          });
          const removeBtn = h('button', { type: 'button', class: 'btn btn-link remove-member', disabled: family.members.length <= MIN_MEMBERS }, t.remove_member(memberLabel(m, i, t)));
          removeBtn.addEventListener('click', () => {
            readAll();
            family.members.splice(i, 1);
            onModeChange();
          });
          return h(
            'fieldset',
            { class: 'member-card' },
            h('legend', {}, memberLabel(m, i, t)),
            h('div', { class: 'field member-label' }, h('label', { for: labelInput.id }, t.member_name), labelInput),
            pf.nodes,
            h('div', { class: 'member-actions' }, removeBtn),
          );
        }),
      ),
      h(
        'div',
        { class: 'actions' },
        (() => {
          const addBtn = h('button', { type: 'button', class: 'btn btn-secondary', disabled: family.members.length >= MAX_MEMBERS }, t.add_member);
          addBtn.addEventListener('click', () => {
            readAll();
            family.members.push(defaultMember(family.members.length, family.members[0]));
            onModeChange(family.members.length - 1);
          });
          return addBtn;
        })(),
        h('span', { class: 'hint' }, t.members_range(MIN_MEMBERS, MAX_MEMBERS)),
      ),
    ];
  }

  const form = h(
    'form',
    { class: 'card profile-form', novalidate: true, 'aria-labelledby': 'profile-title' },
    h('div', { class: 'form-head' }, h('h2', { id: 'profile-title' }, isFamily ? t.family_title : t.profile_title), modeSwitch),
    errorsBox,
    personBlock,
    h(
      'fieldset',
      { class: 'field shared' },
      isFamily ? h('legend', {}, t.shared_title) : h('legend', { class: 'visually-hidden' }, t.shared_title),
      h('div', { class: 'grid' }, field(t.season, season), field(t.days, days)),
      recipesBox
        ? h(
            'div',
            { class: 'field recipes-opt' },
            h('div', { class: 'check-row' }, recipesBox, h('label', { for: recipesBox.id }, t.use_recipes)),
            h('p', { class: 'hint' }, t.use_recipes_hint),
          )
        : null,
      h('div', { class: 'seed-row' }, field(t.seed, seed, t.seed_hint), variantBtn),
    ),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, t.generate)),
    h('p', { class: 'privacy-note' }, t.privacy_note),
  );

  function readAll() {
    for (const r of readers) r();
    values.season = season.value;
    values.days = days.value;
    values.seed = seed.value;
    if (recipesBox) values.useRecipes = recipesBox.checked;
  }

  let touched = false;
  const showErrors = (result, focus) => {
    while (errorsBox.firstChild) errorsBox.removeChild(errorsBox.firstChild);
    if (result.ok) {
      errorsBox.hidden = true;
      return;
    }
    errorsBox.append(h('p', {}, h('strong', {}, t.errors_title)), h('ul', {}, result.errors.map((e) => h('li', {}, e))));
    errorsBox.hidden = false;
    if (focus) errorsBox.focus();
  };

  const onEdit = (ev) => {
    if (ev.target && ev.target.name === 'mode') return;
    readAll();
    if (touched) showErrors(validate(), false);
  };
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);

  variantBtn.addEventListener('click', () => {
    values.seed = randomSeed();
    seed.value = values.seed;
    readAll();
    onNewVariant();
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    readAll();
    touched = true;
    const result = validate();
    showErrors(result, true);
    if (result.ok) onSubmit();
  });

  return form;
}

function pick(v) {
  const { sex, age, weight_kg, height_cm, activity, goal, diet, allergens } = v;
  return { sex, age, weight_kg, height_cm, activity, goal, diet, allergens: [...(allergens || [])] };
}
