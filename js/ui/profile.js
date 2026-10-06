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

/**
 * Renders the profile form.
 * @param {object} p
 * @param {object} p.values  mutable in-memory values
 * @param {object} p.t       UI strings
 * @param {object} p.kg      parsed foods.json (for allergens and seasons)
 * @param {function} p.validate   (values) => {ok, errors}
 * @param {function} p.onSubmit   () => void
 * @param {function} p.onNewVariant () => void
 */
export function renderProfileForm({ values, t, kg, validate, onSubmit, onNewVariant }) {
  const allergens = Array.isArray(kg?.allergens) ? kg.allergens : [];
  const seasons = Array.isArray(kg?.seasons) && kg.seasons.length ? kg.seasons : DEFAULT_SEASONS;

  const errorsBox = h('div', { class: 'error-summary', role: 'alert', 'aria-live': 'assertive', hidden: true, tabindex: '-1' });

  const age = h('input', { id: nextId('age'), name: 'age', type: 'number', inputmode: 'numeric', min: 18, max: 80, step: 1, value: values.age, required: true, autocomplete: 'off' });
  const weight = h('input', { id: nextId('weight'), name: 'weight_kg', type: 'number', inputmode: 'decimal', min: 30, max: 300, step: 0.1, value: values.weight_kg, required: true, autocomplete: 'off' });
  const height = h('input', { id: nextId('height'), name: 'height_cm', type: 'number', inputmode: 'numeric', min: 120, max: 230, step: 1, value: values.height_cm, required: true, autocomplete: 'off' });
  const days = h('input', { id: nextId('days'), name: 'days', type: 'number', inputmode: 'numeric', min: 1, max: 7, step: 1, value: values.days, required: true });
  const seed = h('input', { id: nextId('seed'), name: 'seed', type: 'number', inputmode: 'numeric', min: 1, step: 1, value: values.seed });

  const variantBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, t.new_variant);

  const form = h(
    'form',
    { class: 'card profile-form', novalidate: true, 'aria-labelledby': 'profile-title' },
    h('h2', { id: 'profile-title' }, t.profile_title),
    errorsBox,
    h(
      'div',
      { class: 'grid' },
      radioGroup(t.sex, 'sex', [['f', t.sex_f], ['m', t.sex_m]], values.sex, true),
      field(t.age, age),
      field(t.weight, weight),
      field(t.height, height),
      field(t.activity, select(nextId('activity'), 'activity', ACTIVITIES.map((a) => [a, t.activity_opts[a]]), values.activity)),
      field(t.goal, select(nextId('goal'), 'goal', GOALS.map((g) => [g, t.goal_opts[g]]), values.goal)),
      field(t.season, select(nextId('season'), 'season', seasons.map((s) => [s, t.season_opts[s] || s]), values.season)),
      field(t.diet, select(nextId('diet'), 'diet', DIETS.map((d) => [d, t.diet_opts[d]]), values.diet)),
      field(t.days, days),
    ),
    allergens.length
      ? h(
          'fieldset',
          { class: 'field allergens' },
          h('legend', {}, t.allergens),
          h(
            'div',
            { class: 'check-grid' },
            allergens.map((a) => {
              const id = nextId('allergen');
              return h(
                'div',
                { class: 'check-row' },
                h('input', { type: 'checkbox', id, name: 'allergens', value: a, checked: values.allergens.includes(a) }),
                h('label', { for: id }, t.allergen_names[a] || a.replace(/_/g, ' ')),
              );
            }),
          ),
        )
      : null,
    h(
      'div',
      { class: 'seed-row' },
      field(t.seed, seed, t.seed_hint),
      variantBtn,
    ),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, t.generate)),
    h('p', { class: 'privacy-note' }, t.privacy_note),
  );

  const readForm = () => {
    const fd = new FormData(form);
    values.sex = fd.get('sex') || '';
    values.age = fd.get('age') ?? '';
    values.weight_kg = fd.get('weight_kg') ?? '';
    values.height_cm = fd.get('height_cm') ?? '';
    values.activity = fd.get('activity');
    values.goal = fd.get('goal');
    values.season = fd.get('season');
    values.diet = fd.get('diet');
    values.allergens = fd.getAll('allergens');
    values.days = fd.get('days') ?? '';
    values.seed = fd.get('seed') ?? '';
  };

  let touched = false;
  const showErrors = (result, focus) => {
    clearChildren(errorsBox);
    if (result.ok) {
      errorsBox.hidden = true;
      return;
    }
    errorsBox.append(h('p', {}, h('strong', {}, t.errors_title)), h('ul', {}, result.errors.map((e) => h('li', {}, e))));
    errorsBox.hidden = false;
    if (focus) errorsBox.focus();
  };

  form.addEventListener('input', () => {
    readForm();
    if (touched) showErrors(validate(values), false);
  });
  form.addEventListener('change', () => {
    readForm();
    if (touched) showErrors(validate(values), false);
  });

  variantBtn.addEventListener('click', () => {
    values.seed = randomSeed();
    seed.value = values.seed;
    onNewVariant();
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    readForm();
    touched = true;
    const result = validate(values);
    showErrors(result, true);
    if (result.ok) onSubmit();
  });

  return form;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
