// Diet planner engine: pure ES module, no DOM, no fetch, no storage.
// Port and extension of the legacy Python planner (diet_engine.py, diet_planner.py).
// Input: a profile (see docs/CONTRACT.md) and the parsed web/data/foods.json.
// Output: a plain JSON weekly plan, deterministic for the same profile + seed + kg.

/** @typedef {"m"|"f"} Sex */
/** @typedef {"sedentario"|"leggero"|"moderato"|"attivo"|"molto_attivo"} Activity */
/** @typedef {"dimagrire"|"mantenimento"|"massa"} Goal */
/** @typedef {"inverno"|"primavera"|"estate"|"autunno"} Season */
/** @typedef {"onnivoro"|"vegetariano"|"vegano"} Diet */
/** @typedef {"colazione"|"spuntino"|"pranzo"|"cena"} MealType */

/**
 * @typedef {Object} Profile
 * @property {Sex} sex
 * @property {number} age
 * @property {number} weight_kg
 * @property {number} height_cm
 * @property {Activity} activity
 * @property {Goal} goal
 * @property {Season} season
 * @property {Diet} diet
 * @property {string[]} [allergens]
 * @property {string[]} [exclude_food_ids]
 * @property {number} [days]
 * @property {number} [seed]
 * @property {"it"|"en"} [lang]
 */

/**
 * @typedef {Object} Food
 * @property {string} id
 * @property {string} name_it
 * @property {string} [name_en]
 * @property {string} [group]
 * @property {string} [subgroup]
 * @property {string|null} role
 * @property {Record<MealType, number>} meals
 * @property {Season[]} seasons
 * @property {{typical_g:number,min_g:number,max_g:number,household:string|null}} portion
 * @property {{kcal:number,protein:number|null,carbs:number|null,fat:number|null}} per100g
 * @property {{vegan:boolean|null,vegetarian:boolean|null}} diet
 * @property {string[]} allergens
 * @property {string[]} [pairs_with]
 * @property {string[]} [substitutes]
 * @property {boolean} [common]
 */

/** @typedef {{version:string, foods:Food[]}} KG */

/**
 * @typedef {Object} Targets
 * @property {number} bmr       kcal/day, LARN 2014 (FAO/WHO/UNU 1985 equations)
 * @property {number} tdee      kcal/day, bmr * LAF
 * @property {number} kcal      daily energy target after goal adjustment
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 * @property {number} bmi
 * @property {number} fiber_g      LARN SDT minimum
 * @property {number} sugars_max_g 15% En
 * @property {number} sfa_max_g    10% En
 * @property {number} laf
 * @property {string} method
 */

/**
 * @typedef {Object} PlanItem
 * @property {string} food_id
 * @property {string} name
 * @property {string} role
 * @property {string} display_name short everyday name (display_name_it/en, fallback name_it)
 * @property {string} slot       template slot: bevanda, base, frutta, spuntino, proteina, contorno, condimento, extra
 * @property {number} grams      gross weight as bought (raw rice, whole fruit)
 * @property {"crudo"|"pronto"} basis
 * @property {number} edible_g   grams * edible_fraction; nutrients are computed on this
 * @property {number|null} pieces  half-piece steps when the food has a unit
 * @property {string|null} unit_label
 * @property {number|null} sugars_g
 * @property {number|null} fiber_g
 * @property {number|null} sfa_g
 * @property {number} kcal
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 * @property {string|null} household
 * @property {string} [category] protein category for role "secondo"
 */

export const ENGINE_VERSION = '2.0.0';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SEXES = ['m', 'f'];
/**
 * LAF (livello di attività fisica) per activity level. LARN 2014 (SINU, IV revisione)
 * computes adult energy requirements as MB x LAF over four levels, from 1.45
 * (sedentary, hypokinetic profile) to 2.10 (marked physical exertion): 1.45, 1.60,
 * 1.75, 2.10. Our enum has five levels: "leggero" is the midpoint between the first two
 * LARN levels (our interpolation, not a LARN value).
 */
export const ACTIVITY_FACTORS = {
  sedentario: 1.45,
  leggero: 1.53,
  moderato: 1.60,
  attivo: 1.75,
  molto_attivo: 2.10,
};
export const GOALS = ['dimagrire', 'mantenimento', 'massa'];
export const SEASONS = ['inverno', 'primavera', 'estate', 'autunno'];
export const DIETS = ['onnivoro', 'vegetariano', 'vegano'];
export const ALLERGENS = ['glutine', 'crostacei', 'uova', 'pesce', 'arachidi', 'soia', 'latte',
  'frutta_a_guscio', 'sedano', 'senape', 'sesamo', 'solfiti', 'lupini', 'molluschi'];
export const MEAL_TYPES = ['colazione', 'spuntino', 'pranzo', 'cena'];
const ROLE_ORDER = ['bevanda_colazione', 'base_colazione', 'frutta', 'snack', 'base_principale',
  'secondo', 'contorno', 'condimento'];

const DAY_LABELS = {
  it: ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

/**
 * Share of the daily kcal target per meal (sums to 1). Italian dietetic practice based on
 * LARN 2014 suggests colazione 15-20%, spuntino 5% + merenda 5-10%, pranzo 35-40%,
 * cena 30-35%. We have one snack, so it takes both small snacks (10%).
 */
export const MEAL_SHARES = { colazione: 0.20, spuntino: 0.10, pranzo: 0.40, cena: 0.30 };

/**
 * LARN 2014 (SINU, IV revisione) reference intakes used for targets and warnings.
 * Carbohydrates RI 45-60% En, sugars SDT < 15% En, fiber SDT >= 25 g/day (adults),
 * total fat RI 20-35% En, saturated fat SDT < 10% En, protein PRI 0.9 g/kg/day
 * (adults 18-59), 1.1 g/kg/day from 60 years. Reference body weight: BMI 22.5.
 */
export const LARN = {
  carbs_pct: [45, 60], sugars_pct_max: 15, fiber_g_min: 25, fat_pct: [20, 35], sfa_pct_max: 10,
  fat_pct_target: 30, protein_pri: 0.9, protein_pri_60: 1.1, bmi_ref: 22.5,
};

/**
 * Meal templates. Each slot draws one food from `roles` and gets `share` of the meal kcal.
 * Spuntino is built per day (one item, or fruit + snack when the budget is large).
 */
const TEMPLATES = {
  colazione: [
    { slot: 'bevanda', roles: ['bevanda_colazione'], share: 0.30 },
    { slot: 'base', roles: ['base_colazione'], share: 0.50 },
    { slot: 'frutta', roles: ['frutta'], share: 0.20 },
  ],
  pranzo: [
    { slot: 'base', roles: ['base_principale'], share: 0.45 },
    { slot: 'proteina', roles: ['secondo'], share: 0.30 },
    { slot: 'contorno', roles: ['contorno'], share: 0.10 },
    { slot: 'condimento', roles: ['condimento'], share: 0.15 },
  ],
  cena: [
    { slot: 'proteina', roles: ['secondo'], share: 0.40 },
    { slot: 'contorno', roles: ['contorno'], share: 0.10 },
    { slot: 'base', roles: ['base_principale'], share: 0.32 },
    { slot: 'condimento', roles: ['condimento'], share: 0.18 },
  ],
};
/** Spuntino gets two items (fruit + snack) when its budget reaches this many kcal. */
const SPUNTINO_SPLIT_KCAL = 220;

/**
 * Extra items added, in this order, when a day stays more than 3% under target, after the
 * existing bases were raised within bounds: a plain snack, then bread at lunch and dinner.
 * Never at breakfast (max 3 items), never fruit, spuntino max 2 items. Walked twice.
 */
const EXTRA_SLOTS = [['spuntino', 'snack'], ['pranzo', 'base_principale'], ['cena', 'base_principale']];
/** Maximum items per meal: breakfast is drink + base + fruit (or yogurt), snack 1-2 items. */
const MAX_ITEMS = { colazione: 3, spuntino: 2, pranzo: 6, cena: 6 };
/** Number of plan items in a working meal: a recipe and its components count as one. */
function mealCount(m) {
  const keys = new Set();
  let n = 0;
  for (const it of m.items) { if (it.rc) keys.add(it.rc.key); else n++; }
  return n + keys.size;
}

/** Where a protein-dense extra item may be added when the day is short on protein. */
const PROTEIN_EXTRA_SLOTS = [['spuntino', 'snack'], ['spuntino', 'bevanda_colazione']];

/** Minimum meal suitability score (0..10) for a food to be used in a meal. */
const MIN_MEAL_SCORE = 5;
/** If the common pool for a slot has fewer foods than this, non common foods are added. */
const MIN_POOL = 3;

/** Weekly caps per food (for 7 days, scaled by days/7). null = no cap. */
const WEEKLY_CAP_BY_ROLE = {
  bevanda_colazione: null, base_colazione: 4, frutta: 3, snack: 3,
  base_principale: 4, secondo: 2, contorno: 3, condimento: null,
};

/**
 * Protein source quotas per 7 days for the "proteina" slots (pranzo + cena), scaled by days/7.
 * Based on Italian guidelines (CREA, Linee guida per una sana alimentazione 2018):
 * red + processed meat at most 2/week, fish at least 2/week, legumes at least 3/week,
 * eggs and cheese up to 2-4/week.
 */
const CATEGORY_RULES = {
  onnivoro: {
    min: { pesce: 2, legumi: 3 },
    max: { carne_rossa: 2, salumi: 1, uova: 3, formaggi: 3 },
    weight: { carne_bianca: 3, pesce: 2, legumi: 2, uova: 1, formaggi: 1, carne_rossa: 1,
      salumi: 0.5, proteine_vegetali: 0.5, altro: 0.3 },
  },
  vegetariano: {
    min: { legumi: 4 },
    max: { uova: 4, formaggi: 4 },
    weight: { legumi: 3, uova: 1.5, formaggi: 1.5, proteine_vegetali: 1.5, altro: 0.3 },
  },
  vegano: {
    min: { legumi: 5 },
    max: {},
    weight: { legumi: 3, proteine_vegetali: 2, altro: 0.5 },
  },
};
/** red meat and processed meat share one cap */
const RED_GROUP = ['carne_rossa', 'salumi'];

const KCAL_TOLERANCE = 0.05;   // daily kcal must land within +-5% of target
const PROTEIN_LOW = 0.90;      // warn below 90% of the protein target

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** mulberry32 PRNG: tiny, fast, good enough for menu variety. Returns floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic string hash (FNV-1a) used to derive seeds. */
function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const deepClone = (o) => JSON.parse(JSON.stringify(o));

function weightedPick(rng, entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  if (total <= 0) return entries.length ? entries[0].v : null;
  let x = rng() * total;
  for (const e of entries) { x -= e.w; if (x < 0) return e.v; }
  return entries[entries.length - 1].v;
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Portion bounds of a food, with defensive defaults. */
function bounds(food) {
  const p = food.portion || {};
  const typ = isNum(p.typical_g) && p.typical_g > 0 ? p.typical_g : 100;
  const min = isNum(p.min_g) && p.min_g > 0 ? p.min_g : Math.max(5, Math.round(typ * 0.5));
  const max = isNum(p.max_g) && p.max_g >= min ? p.max_g : Math.max(min, Math.round(typ * 1.5));
  return { min, max, typ: clamp(typ, min, max) };
}

/** Round to a multiple of 5 g, staying inside [min, max]. */
export function roundGrams(g, min, max) {
  const lo = Math.ceil(min / 5) * 5;
  const hi = Math.floor(max / 5) * 5;
  if (lo > hi) return Math.round(clamp(g, min, max));
  return clamp(Math.round(g / 5) * 5, lo, hi);
}

/**
 * Weights are gross, as bought (contract v2): per100g refers to the edible part, so
 * nutrients = grams * edible_fraction * per100g / 100. The helpers below return values
 * per 100 g of GROSS weight. Defaults: edible_fraction 1, weight_basis "pronto", priority 5.
 */
const edibleFraction = (f) => (isNum(f.edible_fraction) && f.edible_fraction > 0 && f.edible_fraction <= 1 ? f.edible_fraction : 1);
const nutr = (f, key) => (f.per100g && isNum(f.per100g[key]) ? f.per100g[key] * edibleFraction(f) : 0);
const kcal100 = (f) => nutr(f, 'kcal');
const prot100 = (f) => nutr(f, 'protein');
const priorityOf = (f) => (isNum(f.priority) ? clamp(f.priority, 0, 10) : 5);
/** Saturated fat per 100 g edible, if the KG provides it under any common key. */
const SFA_KEYS = ['sfa', 'saturated', 'saturated_fat', 'fat_saturated', 'fasat'];
function sfaKey(f) { return f.per100g ? SFA_KEYS.find((k) => isNum(f.per100g[k])) : undefined; }

/** One piece (fruit, egg, roll, pot) when the KG gives it. */
function unitOf(f) { const u = f.unit; return u && isNum(u.grams) && u.grams > 0 ? u : null; }
/**
 * Piece step for unit foods: whole pieces (fruit, eggs, yogurt pots), half pieces only for
 * bread rolls; null when no step fits the bounds (then 5 g rounding).
 */
function pieceStep(f) {
  const u = unitOf(f);
  if (!u) return null;
  const b = bounds(f);
  const fit = (st) => ({ st, lo: Math.max(1, Math.ceil(b.min / st - 1e-9)), hi: Math.floor(b.max / st + 1e-9) });
  // whole pieces (fruit, eggs, yogurt pots); half pieces only for bread rolls
  const whole = fit(u.grams);
  if (isBread(f)) {
    const half = fit(u.grams / 2);
    if (half.lo <= half.hi) return half;
  }
  return whole.lo <= whole.hi ? whole : null;
}
/** Smallest grams step of a food: one (or half a) piece for unit foods, else 5 g. */
function stepOf(f) { const p = pieceStep(f); return p ? p.st : 5; }

/**
 * Round grams for a food inside its portion bounds: whole pieces (or half pieces) for
 * unit foods, multiples of 5 g otherwise.
 */
export function roundFood(food, g) {
  const p = pieceStep(food);
  if (p) return Math.round(clamp(Math.round(g / p.st), p.lo, p.hi) * p.st);
  const b = bounds(food);
  return roundGrams(g, b.min, b.max);
}

/** LARN standard portion (grams, as bought) per food, filled from kg.larn by indexLarn. */
const LARN_PORTION = new WeakMap();

/**
 * Grams that deliver `targetKcal`, inside the food's portion bounds. When a LARN standard
 * portion is known, snap to the nearest half-portion multiple if that is within 20%.
 */
function sizeFor(food, targetKcal) {
  const b = bounds(food);
  const k = kcal100(food);
  let g = k > 0 ? (targetKcal / k) * 100 : b.typ;
  const lp = LARN_PORTION.get(food);
  if (lp && !unitOf(food)) {
    const m = Math.round(g / (lp / 2)) * (lp / 2);
    if (m >= b.min && m <= b.max && Math.abs(m - g) <= 0.2 * g) g = m;
  }
  return roundFood(food, g);
}

/**
 * Protein source category of a food (meaningful for role "secondo").
 * Keyword based on English and Italian names, CIQUAL group and subgroup.
 * @param {Food} food
 * @returns {string}
 */
export function proteinCategory(food) {
  // Names and subgroup first: CIQUAL groups such as "meat, egg and fish" are too broad.
  const t = [food.name_en, food.name_it, food.subgroup].filter(Boolean).join(' | ').toLowerCase();
  const al = food.allergens || [];
  const c = categoryFromText(t, al);
  if (c !== 'altro') return c;
  // group only as a last hint, and only for protein foods: "fruits, vegetables, legumes
  // and nuts" would otherwise make every vegetable a legume
  if (food.role !== 'secondo') return 'altro';
  return categoryFromText(String(food.group || '').toLowerCase(), []);
}

function categoryFromText(t, al) {
  if (/tofu|tempeh|seitan|soy protein|soya protein|textured|proteine vegetali|mopur/.test(t)) return 'proteine_vegetali';
  if (al.includes('pesce') || al.includes('crostacei') || al.includes('molluschi') ||
    /\bfish|salmon|tuna|\bcod\b|shrimp|prawn|crustac|mollus|seafood|sardin|anchov|mackerel|trout|sea bream|sea bass|squid|octopus|mussel|clam|pesce|merluzzo|salmone|tonno|gamber|alici|acciugh|sgombro/.test(t)) return 'pesce';
  if (/cold cut|\bham\b|salami|sausage|bacon|mortadella|bresaola|prosciutto|wurstel|frankfurter|cured meat|cotechino|speck|salsiccia|salume/.test(t)) return 'salumi';
  if (/beef|veal|pork|lamb|mutton|horse|goat|\bgame\b|venison|manzo|maiale|vitell|agnello|cavallo|bovin/.test(t)) return 'carne_rossa';
  if (/chicken|turkey|poultry|rabbit|duck|guinea fowl|pollo|tacchino|coniglio|anatra/.test(t)) return 'carne_bianca';
  if (/\beggs?\b|\buov|omelet|frittata/.test(t)) return 'uova';
  if (/cheese|mozzarella|ricotta|formagg|parmesan|parmigiano|stracchino|feta|cottage/.test(t)) return 'formaggi';
  if (/legum|lentil|chickpea|\bbeans?\b|\bpeas?\b|lenticch|\bceci|fagiol|pisell|fave|lupin|edamame|pulses/.test(t)) return 'legumi';
  return 'altro';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a profile. Supported population: adults 18-80.
 * Decision on BMI: below 16 or above 40 is an error (out of scope for an automatic
 * tool, medical follow-up needed). BMI below 18.5 with goal "dimagrire" is also an
 * error. BMI 16-18.5 and 35-40 pass with a warning.
 * @param {Profile} profile
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 */
export function validateProfile(profile) {
  const errors = [];
  const warnings = [];
  if (!profile || typeof profile !== 'object') {
    return { ok: false, errors: ['Profilo mancante o non valido.'], warnings };
  }
  const p = profile;
  if (!SEXES.includes(p.sex)) errors.push('Sesso non valido: usare "m" o "f".');
  if (!isNum(p.age) || !Number.isInteger(p.age)) errors.push("L'età deve essere un numero intero di anni.");
  else if (p.age < 18 || p.age > 80) errors.push("Età fuori dall'intervallo supportato (18-80 anni).");
  if (!isNum(p.weight_kg)) errors.push('Il peso deve essere un numero (kg).');
  else if (p.weight_kg < 35 || p.weight_kg > 250) errors.push('Peso non plausibile: inserire un valore tra 35 e 250 kg.');
  if (!isNum(p.height_cm)) errors.push("L'altezza deve essere un numero (cm).");
  else if (p.height_cm < 130 || p.height_cm > 230) errors.push('Altezza non plausibile: inserire un valore tra 130 e 230 cm.');
  if (!(p.activity in ACTIVITY_FACTORS)) errors.push(`Livello di attività non valido: usare uno tra ${Object.keys(ACTIVITY_FACTORS).join(', ')}.`);
  if (!GOALS.includes(p.goal)) errors.push(`Obiettivo non valido: usare uno tra ${GOALS.join(', ')}.`);
  if (!SEASONS.includes(p.season)) errors.push(`Stagione non valida: usare una tra ${SEASONS.join(', ')}.`);
  if (!DIETS.includes(p.diet)) errors.push(`Regime alimentare non valido: usare uno tra ${DIETS.join(', ')}.`);
  if (p.allergens !== undefined && p.allergens !== null) {
    if (!Array.isArray(p.allergens)) errors.push('Gli allergeni devono essere una lista.');
    else {
      const bad = p.allergens.filter((a) => !ALLERGENS.includes(a));
      if (bad.length) errors.push(`Allergeni non riconosciuti: ${bad.join(', ')}.`);
    }
  }
  if (p.exclude_food_ids !== undefined && p.exclude_food_ids !== null &&
    (!Array.isArray(p.exclude_food_ids) || p.exclude_food_ids.some((x) => typeof x !== 'string'))) {
    errors.push('Gli alimenti esclusi devono essere una lista di codici (stringhe).');
  }
  if (p.days !== undefined && p.days !== null &&
    (!Number.isInteger(p.days) || p.days < 1 || p.days > 14)) {
    errors.push('Il numero di giorni deve essere un intero tra 1 e 14.');
  }
  if (p.seed !== undefined && p.seed !== null && !Number.isInteger(p.seed)) {
    errors.push('Il seme (seed) deve essere un numero intero.');
  }
  if (p.lang !== undefined && p.lang !== null && !['it', 'en'].includes(p.lang)) {
    errors.push('Lingua non valida: usare "it" o "en".');
  }
  if (isNum(p.weight_kg) && isNum(p.height_cm) && p.height_cm > 0) {
    const bmi = p.weight_kg / (p.height_cm / 100) ** 2;
    if (bmi < 16) errors.push(`IMC ${r1(bmi)}: sottopeso grave. Questo strumento non è adatto, rivolgiti a un medico.`);
    else if (bmi > 40) errors.push(`IMC ${r1(bmi)}: obesità grave. Questo strumento non è adatto, rivolgiti a un medico.`);
    else {
      if (bmi < 18.5 && p.goal === 'dimagrire') errors.push(`IMC ${r1(bmi)}: sei sottopeso, l'obiettivo "dimagrire" non è consentito.`);
      else if (bmi < 18.5) warnings.push(`IMC ${r1(bmi)}: sottopeso. Valuta il piano con un professionista della nutrizione.`);
      if (bmi >= 35) warnings.push(`IMC ${r1(bmi)}: obesità di grado II. Si consiglia di seguire il piano con un medico.`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/**
 * LARN 2014 basal metabolic rate (MB), kcal/day, from body weight by sex and age band.
 * LARN 2014 adopts the FAO/WHO/UNU 1985 (Schofield) equations, with Italian bands for
 * the elderly (60-74, >=75):
 *   men   18-29: 15.3*kg + 679   30-59: 11.6*kg + 879   60-74: 11.9*kg + 700   >=75: 8.4*kg + 819
 *   women 18-29: 14.7*kg + 496   30-59: 8.7*kg + 829    60-74: 9.2*kg + 688    >=75: 9.8*kg + 624
 * Source: SINU, LARN IV revisione 2014, energy chapter; equations as tabulated in the
 * SIE review "Fabbisogno energetico" (Tabella 1, "LARN (FAO/WHO/UNU, 1985)").
 * @param {Sex} sex @param {number} age @param {number} kg
 */
export function larnBmr(sex, age, kg) {
  const m = sex === 'm';
  if (age < 30) return m ? 15.3 * kg + 679 : 14.7 * kg + 496;
  if (age < 60) return m ? 11.6 * kg + 879 : 8.7 * kg + 829;
  if (age < 75) return m ? 11.9 * kg + 700 : 9.2 * kg + 688;
  return m ? 8.4 * kg + 819 : 9.8 * kg + 624;
}

/** Mifflin-St Jeor BMR (Mifflin et al., Am J Clin Nutr 1990), kept for comparison only. */
export function mifflinBmr(sex, age, kg, cm) {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161);
}

/**
 * Energy and macro targets following LARN 2014 (SINU, IV revisione).
 *
 * Energy: MB from larnBmr() on the actual body weight, times LAF (ACTIVITY_FACTORS).
 *   The Schofield equations are weight based and were derived on actual weights, so the
 *   actual weight is used for energy.
 * Goal (our choice, not LARN): dimagrire = TDEE - min(15%, 500 kcal), never below
 *   max(MB, 1200 f / 1500 m); massa = TDEE + 10%.
 * Protein: LARN PRI 0.9 g/kg/day (18-59 y), 1.1 g/kg/day (>= 60 y), on the reference
 *   weight: the actual weight when BMI is 18.5-25, otherwise the weight at BMI 22.5
 *   (LARN example weights use BMI 22.5). Goal factor, modest and documented: dimagrire
 *   x1.3 (about 1.2 g/kg, preserves lean mass in deficit), massa x1.5 (about 1.35 g/kg),
 *   capped at 2.0 g/kg and 25% En.
 * Fat: 30% En (LARN RI 20-35% En). If carbohydrates would exceed 60% En, fat rises
 *   up to 35% En; carbohydrates take the rest (LARN RI 45-60% En).
 * Sugars max 15% En, fiber >= 25 g/day, saturated fat max 10% En (LARN SDT).
 * Atwater factors 4/4/9. kcal rounded to 10, macros to whole grams.
 * @param {Profile} profile
 * @returns {Targets}
 */
export function computeTargets(profile) {
  const { sex, age, weight_kg: w, height_cm: h, activity, goal } = profile;
  const laf = ACTIVITY_FACTORS[activity] || ACTIVITY_FACTORS.sedentario;
  const bmr = larnBmr(sex, age, w);
  const tdee = bmr * laf;
  let kcal = tdee;
  if (goal === 'dimagrire') {
    kcal = tdee - Math.min(0.15 * tdee, 500);
    kcal = Math.max(kcal, bmr, sex === 'm' ? 1500 : 1200);
  } else if (goal === 'massa') {
    kcal = tdee * 1.10;
  }
  kcal = Math.round(kcal / 10) * 10;

  const hm = h / 100;
  const bmi = w / (hm * hm);
  const refW = bmi >= 18.5 && bmi <= 25 ? w : LARN.bmi_ref * hm * hm;
  const pri = age >= 60 ? LARN.protein_pri_60 : LARN.protein_pri;
  const factor = goal === 'dimagrire' ? 1.3 : goal === 'massa' ? 1.5 : 1.0;
  const protein = Math.min(pri * factor * refW, 2.0 * refW, (0.25 * kcal) / 4);
  const protPct = (protein * 4 * 100) / kcal;
  const fatPct = clamp(Math.max(LARN.fat_pct_target, 100 - protPct - LARN.carbs_pct[1]), LARN.fat_pct[0], LARN.fat_pct[1]);
  const fat = (fatPct / 100 * kcal) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    protein_g: Math.round(protein),
    carbs_g: Math.round(carbs),
    fat_g: Math.round(fat),
    fiber_g: LARN.fiber_g_min,
    sugars_max_g: Math.round((LARN.sugars_pct_max / 100 * kcal) / 4),
    sfa_max_g: Math.round((LARN.sfa_pct_max / 100 * kcal) / 9),
    laf,
    bmi: r1(bmi),
    method: 'LARN 2014: MB FAO/WHO/UNU 1985 (Schofield) x LAF',
  };
}

// ---------------------------------------------------------------------------
// Food pools
// ---------------------------------------------------------------------------

function dietOk(food, diet) {
  if (diet === 'vegano') return !!(food.diet && food.diet.vegan === true);
  if (diet === 'vegetariano') return !!(food.diet && (food.diet.vegetarian === true || food.diet.vegan === true));
  return true;
}
function inSeason(food, season) {
  return !Array.isArray(food.seasons) || food.seasons.length === 0 || food.seasons.includes(season);
}
const mealScore = (food, meal) => (food.meals && isNum(food.meals[meal]) ? food.meals[meal] : 0);

/**
 * Foods allowed by the hard constraints (role, diet, allergens, exclusions, valid kcal).
 * @param {KG} kg @param {Profile} profile @param {string[]} roles
 */
function hardFiltered(kg, profile, roles) {
  const allergens = new Set(profile.allergens || []);
  const excluded = new Set(profile.exclude_food_ids || []);
  return (kg.foods || []).filter((f) => f && roles.includes(f.role) &&
    kcal100(f) >= 0 && f.per100g && isNum(f.per100g.kcal) &&
    !excluded.has(f.id) && dietOk(f, profile.diet) &&
    !(f.allergens || []).some((a) => allergens.has(a)) &&
    !(f.role === 'condimento' && isSauce(f)));
}

/** Ready sauces and tomato products are never a condimento, even if the KG says so. */
const SAUCE_RE = /rag[uù]|\bsals[ae]|\bsauce|pomodor|tomato|pelat|passata|\bpesto|\bpesti\b/i;
function isSauce(f) { return SAUCE_RE.test(`${f.name_it || ''} ${f.name_en || ''}`); }
/** Oils, butter, tahini and similar: at least 50 g fat per 100 g. */
function isFat(f) { return nutr(f, 'fat') >= 50; }
function isOliveOil(f) {
  const n = `${f.name_it || ''} ${f.name_en || ''}`;
  return /olio d'oliva|olio di oliva|olive oil|extravergine/i.test(n) && !/mix|combinat|blend/i.test(n) && nutr(f, 'fat') >= 90;
}

// ---------------------------------------------------------------------------
// Variety inside a day
// ---------------------------------------------------------------------------

/** Family key: food.family when present, otherwise the food id. */
export function familyOf(food) { return (food && food.family) || (food && food.id); }
/** Name stem (Italian name before the first comma), a safety net while "family" is missing. */
function nameStem(food) {
  return String(food.name_it || '').toLowerCase().split(',')[0].replace(/\(.*?\)/g, '').trim();
}
const DAIRY_RE = /yogurt|yoghurt|dessert|kefir|skyr|budino|latte fermentato|fermented milk/i;
function isDairyLike(f) { return DAIRY_RE.test(`${f.name_it || ''} ${f.name_en || ''}`); }
function isDrinkOrDessert(f) { return f.role === 'bevanda_colazione' || isDairyLike(f); }
function isSoy(f) { return /\bsoia|\bsoy/i.test(`${f.name_it || ''} ${f.name_en || ''}`); }

/** Bread (LARN group "pane", family "pane", or the word pane/bread in the name). */
function isBread(f) {
  return f.larn_group === 'pane' || f.family === 'pane' || /^pane\b|\bbread\b/i.test(`${f.name_it || ''}|${f.name_en || ''}`.replace('|', ' '));
}

function newDayState() { return { keys: new Set(), fruit: 0, drinkDairy: 0, soy: 0 }; }
function dayKeys(f) { const k = ['f:' + familyOf(f)]; const st = nameStem(f); if (st) k.push('s:' + st); return k; }

/**
 * Day and meal rules: no family twice in a day (condimento excepted), at most one fruit
 * per meal and 3 per day, one breakfast drink and one yogurt or dessert per meal, at most
 * 2 drinks or desserts per day of which at most 1 soy based.
 * @param {boolean} [mealOnly] check only the per-meal rules
 */
function fitsDay(f, st, mealFoods, mealOnly = false) {
  if (mealFoods.some((x) => x.id === f.id)) return false;
  // never two foods of the same LARN group (or two breads) in one meal
  if (f.larn_group && mealFoods.some((x) => x.larn_group === f.larn_group)) return false;
  if (isBread(f) && mealFoods.some(isBread)) return false;
  if (f.role === 'frutta' && mealFoods.some((x) => x.role === 'frutta')) return false;
  if (f.role === 'bevanda_colazione' && mealFoods.some((x) => x.role === 'bevanda_colazione')) return false;
  if (isDairyLike(f) && mealFoods.some(isDairyLike)) return false;
  if (f.role === 'condimento') return !mealFoods.some((x) => x.role === 'condimento');
  if (mealOnly) return true;
  // bread may come with both lunch and dinner
  if (!isBread(f) && dayKeys(f).some((k) => st.keys.has(k))) return false;
  if (f.role === 'frutta' && st.fruit >= 3) return false;
  if (isDrinkOrDessert(f) && st.drinkDairy >= 2) return false;
  if (isDrinkOrDessert(f) && isSoy(f) && st.soy >= 1) return false;
  return true;
}
function commitDay(f, st) {
  if (f.role === 'condimento') return;
  for (const k of dayKeys(f)) st.keys.add(k);
  if (f.role === 'frutta') st.fruit++;
  if (isDrinkOrDessert(f)) { st.drinkDairy++; if (isSoy(f)) st.soy++; }
}

/**
 * Candidate pool for a slot, with soft constraints relaxed step by step.
 * Returns the foods and an optional warning describing the relaxation.
 * @returns {{foods: Food[], warning: string|null}}
 */
function slotPool(kg, profile, roles, meal, cache) {
  const key = roles.join('+') + '@' + meal;
  if (cache && cache.has(key)) return cache.get(key);
  const base = hardFiltered(kg, profile, roles);
  const season = profile.season;
  const suit = base.filter((f) => mealScore(f, meal) >= MIN_MEAL_SCORE && inSeason(f, season));
  const roleLabel = roles.join('/');
  let res;
  const common = suit.filter((f) => f.common === true);
  if (common.length >= MIN_POOL) res = { foods: common, warning: null };
  else if (common.length > 0) res = { foods: suit, warning: null };
  else if (suit.length > 0) {
    res = { foods: suit, warning: `Nessun alimento comune per ${roleLabel} a ${meal}: uso anche alimenti meno comuni.` };
  } else {
    const anyScore = base.filter((f) => mealScore(f, meal) > 0 && inSeason(f, season));
    if (anyScore.length) {
      res = { foods: anyScore, warning: `Pochi alimenti adatti per ${roleLabel} a ${meal}: uso alimenti meno tipici per questo pasto.` };
    } else {
      const offSeason = base.filter((f) => mealScore(f, meal) >= MIN_MEAL_SCORE);
      if (offSeason.length) {
        res = { foods: offSeason, warning: `Nessun alimento di stagione per ${roleLabel} a ${meal}: uso alimenti fuori stagione.` };
      } else {
        res = { foods: [], warning: `Nessun alimento disponibile per ${roleLabel} a ${meal} con i vincoli scelti: la portata è stata omessa.` };
      }
    }
  }
  if (cache) cache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------
// Protein category schedule
// ---------------------------------------------------------------------------

/** Scaled min/max quotas for the given number of days. */
function scaledRules(diet, days, larnFreq) {
  const rules = CATEGORY_RULES[diet] || CATEGORY_RULES.onnivoro;
  const rmin = { ...rules.min }; const rmax = { ...rules.max };
  if (larnFreq) {
    // kg.larn weekly frequencies replace the built-in ones: min and max for omnivores,
    // only the caps (eggs, cheese) for vegetarians, nothing for vegans.
    for (const [cat, fr] of Object.entries(larnFreq)) {
      if (diet === 'onnivoro') {
        if (isNum(fr.min) && cat in rmin) rmin[cat] = fr.min;
        if (isNum(fr.max) && (cat in rmax || cat === 'carne_bianca')) rmax[cat] = fr.max;
      } else if (diet === 'vegetariano' && isNum(fr.max) && cat in rmax) rmax[cat] = fr.max;
    }
  }
  const f = days / 7;
  const min = {}; const max = {};
  for (const [k, v] of Object.entries(rmin)) min[k] = Math.round(v * f);
  for (const [k, v] of Object.entries(rmax)) max[k] = Math.max(1, Math.ceil(v * f));
  return { min, max, weight: rules.weight };
}

// ---------------------------------------------------------------------------
// kg.larn (optional): standard portions and weekly frequencies per LARN/CREA group
// ---------------------------------------------------------------------------

const normKey = (k) => String(k || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/** Our protein categories and the LARN/CREA group keys that may describe them. */
const LARN_CATEGORY_KEYS = {
  pesce: ['pesce', 'pesce_e_prodotti_della_pesca', 'prodotti_ittici', 'pesce_molluschi_crostacei'],
  legumi: ['legumi', 'legumi_secchi', 'legumi_freschi'],
  carne_rossa: ['carne_rossa', 'carni_rosse', 'carne_rossa_fresca'],
  salumi: ['salumi', 'carni_trasformate', 'carne_trasformata', 'carni_conservate'],
  carne_bianca: ['carne_bianca', 'carni_bianche', 'pollame'],
  uova: ['uova', 'uovo'],
  formaggi: ['formaggi', 'formaggio', 'formaggio_fresco', 'formaggio_stagionato', 'formaggi_stagionati', 'latte_e_derivati_formaggi'],
};

function larnEntries(kg) {
  const L = kg && kg.larn;
  if (!L || typeof L !== 'object') return new Map();
  let g = L.groups ?? L.gruppi ?? L;
  const m = new Map();
  if (Array.isArray(g)) {
    for (const e of g) if (e && typeof e === 'object') m.set(normKey(e.key ?? e.group ?? e.id ?? e.name), e);
  } else if (g && typeof g === 'object') {
    for (const [k, e] of Object.entries(g)) if (e && typeof e === 'object') m.set(normKey(k), e);
  }
  return m;
}
function larnPortionOfEntry(e) {
  for (const k of ['portion_g', 'standard_portion_g', 'porzione_g', 'portion_grams', 'grams', 'g']) if (isNum(e[k]) && e[k] > 0) return e[k];
  if (isNum(e.portion) && e.portion > 0) return e.portion;
  if (e.portion && typeof e.portion === 'object') return larnPortionOfEntry(e.portion);
  return null;
}
function parseRange(v) {
  if (isNum(v)) return { min: v, max: v };
  if (Array.isArray(v) && v.length && v.every(isNum)) return { min: v[0], max: v[v.length - 1] };
  if (v && typeof v === 'object') {
    const min = v.min ?? v.min_week ?? v.da; const max = v.max ?? v.max_week ?? v.a;
    if (isNum(min) || isNum(max)) return { min: isNum(min) ? min : null, max: isNum(max) ? max : null };
  }
  if (typeof v === 'string') {
    const n = v.match(/\d+(?:[.,]\d+)?/g);
    if (n) { const a = n.map((x) => Number(x.replace(',', '.'))); return { min: a[0], max: a[a.length - 1] }; }
  }
  return null;
}
function larnWeeklyOfEntry(e) {
  if (isNum(e.freq_week_min) || isNum(e.freq_week_max)) {
    return { min: isNum(e.freq_week_min) ? e.freq_week_min : null, max: isNum(e.freq_week_max) ? e.freq_week_max : null };
  }
  if (isNum(e.weekly_min) || isNum(e.weekly_max)) return { min: isNum(e.weekly_min) ? e.weekly_min : null, max: isNum(e.weekly_max) ? e.weekly_max : null };
  for (const k of ['weekly', 'per_week', 'week', 'frequency_week', 'weekly_frequency', 'weekly_portions', 'frequenza_settimanale', 'settimanale']) {
    if (e[k] !== undefined) { const r = parseRange(e[k]); if (r) return r; }
  }
  const fr = e.frequency ?? e.frequenza;
  if (fr && typeof fr === 'object') {
    for (const k of ['week', 'weekly', 'settimana', 'settimanale']) if (fr[k] !== undefined) { const r = parseRange(fr[k]); if (r) return r; }
  }
  return null;
}

const LARN_INDEX = new WeakMap();
/**
 * Read kg.larn once per kg: fills LARN_PORTION for foods with a larn_group and returns
 * weekly frequencies per protein category (or null when kg.larn is absent).
 */
function indexLarn(kg) {
  if (!kg || typeof kg !== 'object') return null;
  if (LARN_INDEX.has(kg)) return LARN_INDEX.get(kg);
  const entries = larnEntries(kg);
  let freq = null;
  if (entries.size) {
    for (const f of kg.foods || []) {
      if (!f || !f.larn_group) continue;
      const e = entries.get(normKey(f.larn_group));
      const p = e && larnPortionOfEntry(e);
      // snap only when the group portion uses the same weight basis and the grams are net
      const basisOk = !e || !e.basis || e.basis === 'any' || e.basis === basisOf(f);
      if (p && basisOk && edibleFraction(f) === 1) LARN_PORTION.set(f, p);
    }
    // Frequencies are shared by "freq_group" (CREA 2018 groups); fall back to the group key.
    const byFreqGroup = new Map();
    for (const [k, e] of entries) {
      const fg = normKey(e.freq_group || k);
      if (!byFreqGroup.has(fg)) { const r = larnWeeklyOfEntry(e); if (r) byFreqGroup.set(fg, r); }
      if (!byFreqGroup.has(k)) { const r = larnWeeklyOfEntry(e); if (r) byFreqGroup.set(k, r); }
    }
    for (const [cat, keys] of Object.entries(LARN_CATEGORY_KEYS)) {
      for (const k of keys) {
        const r = byFreqGroup.get(k);
        if (r) { freq = freq || {}; freq[cat] = r; break; }
      }
    }
  }
  LARN_INDEX.set(kg, freq);
  return freq;
}

function countOf(counts, cat) {
  if (cat === 'carne_rossa') return (counts.carne_rossa || 0) + (counts.salumi || 0);
  return counts[cat] || 0;
}
function underMax(counts, max, cat) {
  if (RED_GROUP.includes(cat)) {
    const red = (counts.carne_rossa || 0) + (counts.salumi || 0);
    if (isNum(max.carne_rossa) && red >= max.carne_rossa) return false;
  }
  return !isNum(max[cat]) || (counts[cat] || 0) < max[cat];
}

/**
 * Build the sequence of protein categories for all "proteina" slots
 * (index 2*day for pranzo, 2*day+1 for cena).
 */
function buildCategorySchedule(rng, diet, days, available, warnings, larnFreq) {
  const { min, max, weight } = scaledRules(diet, days, larnFreq);
  const n = days * 2;
  const seq = [];
  const counts = {};
  for (const [cat, m] of Object.entries(min)) {
    if (!available.has(cat)) {
      if (m > 0) warnings.push(`Impossibile includere ${cat.replace('_', ' ')} almeno ${m} volte: nessun alimento disponibile con i vincoli scelti.`);
      continue;
    }
    for (let i = 0; i < m && seq.length < n; i++) { seq.push(cat); counts[cat] = (counts[cat] || 0) + 1; }
  }
  let relaxed = false;
  while (seq.length < n) {
    let opts = [...available].filter((c) => underMax(counts, max, c))
      .map((c) => ({ v: c, w: weight[c] ?? 0.3 })).sort((a, b) => a.v.localeCompare(b.v));
    if (!opts.length) {
      relaxed = true;
      opts = [...available].map((c) => ({ v: c, w: weight[c] ?? 0.3 })).sort((a, b) => a.v.localeCompare(b.v));
    }
    if (!opts.length) break;
    const c = weightedPick(rng, opts);
    seq.push(c); counts[c] = (counts[c] || 0) + 1;
  }
  if (relaxed) warnings.push('Varietà delle fonti proteiche limitata dai vincoli: alcuni limiti settimanali sono stati superati.');
  let s = shuffle(rng, seq);
  // Repair: avoid the same category at pranzo and cena of the same day.
  for (let pass = 0; pass < 3; pass++) {
    for (let d = 0; d < days; d++) {
      const i = 2 * d; const j = i + 1;
      if (j >= s.length || s[i] !== s[j]) continue;
      for (let k = 0; k < s.length; k++) {
        if (Math.floor(k / 2) === d || s[k] === s[j]) continue;
        const other = k % 2 === 0 ? k + 1 : k - 1;
        if (other < s.length && s[other] === s[j]) continue;
        [s[j], s[k]] = [s[k], s[j]];
        break;
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Food picking
// ---------------------------------------------------------------------------

/**
 * Choose a food for a slot with weighted randomness.
 * High priority foods come first (priority band, then weight (priority + 1)^2).
 * Rules, relaxed in this order if they empty the pool: weekly cap per family, not the
 * same family as the previous day in the same slot (condimento excepted), the day rules
 * of fitsDay (dropped only for template slots as a last resort; per-meal rules always hold).
 * Weights: meal suitability, fewer uses this week, pairs_with with items already in
 * the meal, substitutes of yesterday's pick.
 */
function pickFood(rng, pool, ctx) {
  const { meal, prevId, day, weekUses, cap, mealFoods, strict } = ctx;
  if (!pool.length) return null;
  const uses = (f) => weekUses.get(familyOf(f)) || 0;
  const okDay = (f) => fitsDay(f, day, mealFoods);
  const okMeal = (f) => fitsDay(f, day, mealFoods, true);
  const pairIds = new Set();
  for (const f of mealFoods) for (const id of f.pairs_with || []) pairIds.add(id);
  const mealIds = new Set(mealFoods.map((f) => f.id));
  const prevFood = ctx.prevFood;
  const subs = new Set(prevFood ? prevFood.substitutes || [] : []);

  // Priority band: the most common foods of the pool (priority within 2 of the best).
  const maxP = pool.reduce((m, f) => Math.max(m, priorityOf(f)), 0);
  // drinks and fats: only the best priority (partially skimmed milk, extra virgin olive
  // oil) unless excluded; variety-driven roles use a window of 2 points
  const exact = pool.length && ['bevanda_colazione', 'condimento'].includes(pool[0].role);
  const top = pool.filter((f) => (exact ? priorityOf(f) === maxP : priorityOf(f) >= maxP - 2));
  const t1 = (f) => familyOf(f) !== prevId && okDay(f) && (cap == null || uses(f) < cap);
  const t2 = (f) => familyOf(f) !== prevId && okDay(f);
  const t3 = (f) => okDay(f);
  const steps = exact
    ? [[top, t1], [top, t2], [top, t3], [pool, t1], [pool, t3]]
    : [[top, t1], [pool, t1], [top, t2], [pool, t2], [top, t3], [pool, t3]];
  if (!strict) steps.push([top, okMeal], [pool, okMeal]);
  let cands = [];
  for (const [band, t] of steps) {
    cands = band.filter(t);
    if (cands.length) break;
  }
  if (!cands.length) return null;
  const entries = cands.map((f) => {
    const u = uses(f);
    let w = Math.max(1, mealScore(f, meal)) / 10;
    w *= 1 / ((1 + u) * (1 + u));
    if (pairIds.has(f.id) || (f.pairs_with || []).some((id) => mealIds.has(id))) w *= 2.5;
    if (subs.has(f.id)) w *= 1.5;
    if (f.common === true) w *= 1.5;
    w *= (priorityOf(f) + 1) ** 2;
    return { v: f, w };
  });
  return weightedPick(rng, entries);
}

// ---------------------------------------------------------------------------
// Portion correction
// ---------------------------------------------------------------------------

/** @typedef {{food: Food, slot: string, grams: number, category?: string, swap_history?: string[]}} WItem */

const itemKcal = (it) => (kcal100(it.food) * it.grams) / 100;
const itemProt = (it) => (prot100(it.food) * it.grams) / 100;
const sumKcal = (items) => items.reduce((s, it) => s + itemKcal(it), 0);
const sumProt = (items) => items.reduce((s, it) => s + itemProt(it), 0);

/**
 * Move kcal of `items` by `delta` (positive = add) changing grams within bounds.
 * Proportional pass on the available room, then greedy 5 g steps.
 * Returns the remaining delta.
 */
function shiftKcal(items, delta, tol = 8) {
  const adj = items.filter((it) => !it.locked && kcal100(it.food) > 0 && it.food.role !== 'contorno');
  if (!adj.length) return delta;
  for (let iter = 0; iter < 4 && Math.abs(delta) > tol; iter++) {
    const dir = Math.sign(delta);
    const rooms = adj.map((it) => {
      const b = bounds(it.food);
      return dir > 0 ? (b.max - it.grams) : (it.grams - b.min);
    });
    const roomK = adj.reduce((s, it, i) => s + (rooms[i] * kcal100(it.food)) / 100, 0);
    if (roomK < 1) break;
    const frac = Math.min(1, Math.abs(delta) / roomK);
    for (let i = 0; i < adj.length; i++) {
      const it = adj[i]; const b = bounds(it.food);
      const before = itemKcal(it);
      it.grams = roundFood(it.food, it.grams + dir * frac * rooms[i]);
      delta -= itemKcal(it) - before;
    }
  }
  for (let step = 0; step < 60 && Math.abs(delta) > tol; step++) {
    let best = null; let bestAbs = Math.abs(delta);
    for (const it of adj) {
      const b = bounds(it.food);
      const st = stepOf(it.food);
      for (const d of [st, -st]) {
        const g = roundFood(it.food, it.grams + d);
        if (g === it.grams) continue;
        const nd = delta - ((g - it.grams) * kcal100(it.food)) / 100;
        if (Math.abs(nd) < bestAbs - 0.5) { bestAbs = Math.abs(nd); best = { it, g, nd }; }
      }
    }
    if (!best) break;
    best.it.grams = best.g; delta = best.nd;
  }
  return delta;
}

/** Raising kcal: starches and bread first, then snacks and drinks, fruit and oil last. */
const TIERS_UP = [
  ['base_principale', 'base_colazione'],
  ['snack'],
  ['bevanda_colazione'],
  ['secondo'],
  ['frutta'],
  ['condimento'],
];
/** Lowering kcal: starches first, then fats, snacks, fruit and drinks, then the rest. */
const TIERS_DOWN = [
  ['base_principale', 'base_colazione'],
  ['condimento', 'snack', 'frutta', 'bevanda_colazione'],
  ['secondo'],
];
// Vegetables (contorno) stay at their LARN portion (typical_g): they are never resized to
// fill or trim kcal.

/** Shift kcal through role tiers, keeping every portion inside its bounds. */
function shiftByTiers(items, delta, exclude) {
  for (const roles of (delta > 0 ? TIERS_UP : TIERS_DOWN)) {
    if (Math.abs(delta) <= 8) break;
    delta = shiftKcal(items.filter((it) => roles.includes(it.food.role) && !(exclude && exclude.has(it))), delta);
  }
  return delta;
}

/** At least 20% of the food's kcal from protein (legumes, meat, fish, eggs, dairy, tofu). */
function isProteinDense(food) {
  if (food.role === 'contorno') return false;   // vegetables stay at their LARN portion
  return kcal100(food) > 0 && (prot100(food) * 4) / kcal100(food) >= 0.20;
}

/** Bring protein near the target by resizing protein-dense items (5 g steps). */
function fixProtein(items, targetP) {
  const dense = items.filter((it) => !it.locked && isProteinDense(it.food));
  let p = sumProt(items);
  for (let step = 0; step < 200; step++) {
    if (p >= targetP * 0.97 && p <= targetP * 1.15) break;
    const up = p < targetP * 0.97;
    let best = null; let bestRatio = -1;
    for (const it of dense) {
      const b = bounds(it.food);
      const g = roundFood(it.food, it.grams + (up ? 1 : -1) * stepOf(it.food));
      if (g === it.grams) continue;
      const ratio = prot100(it.food) / kcal100(it.food);
      if (ratio > bestRatio) { bestRatio = ratio; best = { it, g }; }
    }
    if (!best) break;
    p += ((best.g - best.it.grams) * prot100(best.it.food)) / 100;
    best.it.grams = best.g;
    if (!up && p <= targetP * 1.05) break;
  }
  return dense;
}

const sumFat = (items) => items.reduce((s, it) => s + (nutr(it.food, 'fat') * it.grams) / 100, 0);
/** More than half of the kcal from fat (oils, butter, nuts, many cheeses). */
const isFatty = (f) => kcal100(f) > 0 && (nutr(f, 'fat') * 9) / kcal100(f) > 0.5;

/**
 * Bring fat toward 85-115% of target by resizing fatty items in 5 g steps
 * (largest fat share first), within bounds. Kcal is rebalanced by the caller.
 */
function fixFat(items, targetF) {
  const fatty = items.filter((it) => !it.locked && isFatty(it.food));
  let f = sumFat(items);
  for (let step = 0; step < 100; step++) {
    if (f >= targetF * 0.85 && f <= targetF * 1.15) break;
    const down = f > targetF * 1.15;
    let best = null; let bestShare = -1;
    for (const it of fatty) {
      const b = bounds(it.food);
      const g = roundFood(it.food, it.grams + (down ? -1 : 1) * stepOf(it.food));
      if (g === it.grams) continue;
      // raising fat: only true fats (condimento); lowering: anything fatty
      if (!down && it.food.role !== 'condimento') continue;
      const share = nutr(it.food, 'fat') / Math.max(1, kcal100(it.food));
      if (share > bestShare) { bestShare = share; best = { it, g }; }
    }
    if (!best) break;
    f += ((best.g - best.it.grams) * nutr(best.it.food, 'fat')) / 100;
    best.it.grams = best.g;
  }
  return fatty;
}

const STARCH_ROLES = ['base_principale', 'base_colazione'];
const sumCarbs = (items) => items.reduce((s, it) => s + (nutr(it.food, 'carbs') * it.grams) / 100, 0);

/**
 * LARN carbohydrates 45-60% En: when the day is below ~48% En, move energy from
 * non-starch items (fats, snacks, protein foods, drinks) to starches, within bounds.
 */
function fixCarbs(items, targets) {
  for (let iter = 0; iter < 3; iter++) {
    const kcal = sumKcal(items) || 1;
    const pct = (sumCarbs(items) * 4 * 100) / kcal;
    if (pct >= 48) return;
    const need = ((50 - pct) / 100) * kcal;           // kcal to move into starches
    const starch = items.filter((it) => STARCH_ROLES.includes(it.food.role));
    const before = sumKcal(starch);
    shiftKcal(starch, need);
    const added = sumKcal(starch) - before;
    if (added < 10) return;
    const others = items.filter((it) => !STARCH_ROLES.includes(it.food.role) && it.food.role !== 'contorno');
    // remove from fats and snacks first, then protein foods, then drinks and fruit
    let rest = -added;
    for (const roles of [['condimento', 'snack'], ['secondo'], ['bevanda_colazione', 'frutta']]) {
      if (Math.abs(rest) <= 8) break;
      rest = shiftKcal(others.filter((it) => roles.includes(it.food.role)), rest);
    }
    if (Math.abs(rest) > 8) shiftKcal(starch, rest);  // could not compensate: give it back
  }
}

const sumSugars = (items) => items.reduce((s, it) => s + (nutr(it.food, 'sugars') * it.grams) / 100, 0);
/** More than 40% of the food's kcal from sugars (fruit, juices, jams, sweets). */
const isSweet = (f) => kcal100(f) > 0 && (nutr(f, 'sugars') * 4) / kcal100(f) > 0.4;

/** LARN sugars < 15% En: shrink sweet items toward their minimum, energy goes to starches. */
function fixSugars(items) {
  for (let iter = 0; iter < 3; iter++) {
    const kcal = sumKcal(items) || 1;
    const pct = (sumSugars(items) * 4 * 100) / kcal;
    if (pct < 14) return;
    const sweet = items.filter((it) => isSweet(it.food) && !STARCH_ROLES.includes(it.food.role) && it.food.role !== 'contorno');
    const cut = ((pct - 13) / 100) * kcal / 0.7;   // sweet items are roughly 70% sugar energy
    const before = sumKcal(sweet);
    shiftKcal(sweet, -cut);
    const removed = before - sumKcal(sweet);
    if (removed < 10) return;
    const starch = items.filter((it) => STARCH_ROLES.includes(it.food.role) && !isSweet(it.food));
    const rest = shiftKcal(starch, removed);
    if (rest > 8) shiftKcal(items.filter((it) => !isSweet(it.food) && it.food.role !== 'contorno'), rest);
  }
}

/**
 * Day correction: meals toward their own target, protein toward target, fat toward
 * target, then the whole day toward the kcal target, keeping every portion inside its
 * bounds. Protein-dense and fatty items are locked in the kcal pass when possible.
 */
function correctDay(meals, targets) {
  for (const m of meals) shiftByTiers(m.items, m.target - sumKcal(m.items));
  const all = meals.flatMap((m) => m.items);
  const dense = fixProtein(all, targets.protein_g);
  const fatty = fixFat(all, targets.fat_g);
  fixCarbs(all, targets);
  fixSugars(all);
  const lock = new Set([...dense, ...fatty]);
  let delta = targets.kcal - sumKcal(all);
  delta = shiftByTiers(all, delta, lock);
  if (Math.abs(delta) > targets.kcal * 0.02) delta = shiftByTiers(all, delta, new Set(dense));
  if (Math.abs(delta) > targets.kcal * 0.02) shiftByTiers(all, delta, null);
}

// ---------------------------------------------------------------------------
// Output assembly
// ---------------------------------------------------------------------------

function foodName(food, lang) {
  return lang === 'en' ? (food.name_en || food.name_it) : (food.name_it || food.name_en);
}
function displayName(food, lang) {
  if (lang === 'en') return food.display_name_en || food.name_en || food.display_name_it || food.name_it;
  return food.display_name_it || food.name_it || food.name_en;
}
const basisOf = (f) => (f.weight_basis === 'crudo' || f.weight_basis === 'pronto' ? f.weight_basis : 'pronto');
/** grams * per100g(edible) * edible_fraction / 100, or null when the KG has no value. */
function nutrOrNull(f, key, g) {
  return f.per100g && isNum(f.per100g[key]) ? r1((nutr(f, key) * g) / 100) : null;
}

/** @returns {PlanItem} */
function toItem(it, lang) {
  const f = it.food; const g = Math.round(it.grams);
  const u = unitOf(f);
  const sk = sfaKey(f);
  const o = {
    type: 'food',
    food_id: f.id, name: foodName(f, lang), display_name: displayName(f, lang),
    role: f.role, slot: it.slot,
    grams: g,                                   // gross, as bought
    basis: basisOf(f),                          // "crudo" | "pronto"
    edible_g: Math.round(g * edibleFraction(f)),
    pieces: u ? Math.round((g / u.grams) * 2) / 2 : null,
    unit_label: u ? (lang === 'en' ? (u.en || u.it || null) : (u.it || u.en || null)) : null,
    kcal: Math.round((kcal100(f) * g) / 100),
    protein_g: r1((nutr(f, 'protein') * g) / 100),
    carbs_g: r1((nutr(f, 'carbs') * g) / 100),
    fat_g: r1((nutr(f, 'fat') * g) / 100),
    sugars_g: nutrOrNull(f, 'sugars', g),
    fiber_g: nutrOrNull(f, 'fiber', g),
    sfa_g: sk ? r1((nutr(f, sk) * g) / 100) : null,
    household: (f.portion && f.portion.household) || null,
  };
  if (it.category) o.category = it.category;
  if (it.swap_history && it.swap_history.length) o.swap_history = it.swap_history.slice();
  return o;
}

/**
 * Sum totals. sugars_g, fiber_g, sfa_g sum the items that have a value; `_cov` keeps the
 * share of kcal covered by data so LARN checks run only on well covered days.
 */
function totalsOf(list) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, sugars_g: 0, fiber_g: 0, sfa_g: 0 };
  const cov = { sugars_g: 0, fiber_g: 0, sfa_g: 0 };
  for (const x of list) {
    t.kcal += x.kcal; t.protein_g += x.protein_g; t.carbs_g += x.carbs_g; t.fat_g += x.fat_g;
    for (const k of ['sugars_g', 'fiber_g', 'sfa_g']) {
      if (x[k] === null || x[k] === undefined) continue;
      t[k] += x[k];
      cov[k] += x._cov ? x._cov[k] * x.kcal : x.kcal;
    }
  }
  const out = { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g) };
  for (const k of ['sugars_g', 'fiber_g', 'sfa_g']) out[k] = cov[k] > 0 ? r1(t[k]) : null;
  Object.defineProperty(out, '_cov', {
    value: Object.fromEntries(Object.entries(cov).map(([k, v]) => [k, t.kcal > 0 ? v / t.kcal : 0])),
    enumerable: false,
  });
  return out;
}

/** LARN profile of a day: %En of macros, sugars %En, fiber g, SFA %En (null if data is thin). */
function larnProfile(totals) {
  const k = totals.kcal || 1;
  const cov = totals._cov || {};
  const ok = (key) => totals[key] !== null && (cov[key] ?? 1) >= 0.8;
  return {
    protein_pct: r1((totals.protein_g * 4 * 100) / k),
    carbs_pct: r1((totals.carbs_g * 4 * 100) / k),
    fat_pct: r1((totals.fat_g * 9 * 100) / k),
    sugars_pct: ok('sugars_g') ? r1((totals.sugars_g * 4 * 100) / k) : null,
    fiber_g: ok('fiber_g') ? totals.fiber_g : null,
    sfa_pct: ok('sfa_g') ? r1((totals.sfa_g * 9 * 100) / k) : null,
  };
}

/** Recompute meal, day and week totals and the shopping list (mutates the given clone). */
function finalize(plan) {
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const it of meal.items) if (it.type === 'recipe') recipeTotals(it);
      meal.totals = totalsOf(meal.items);
    }
    day.totals = totalsOf(day.meals.map((m) => m.totals));
    day.larn = larnProfile(day.totals);
  }
  plan.week_totals = totalsOf(plan.days.map((d) => d.totals));
  const agg = new Map();
  for (const day of plan.days) for (const meal of day.meals) for (const it of flatItems(meal)) {
    const e = agg.get(it.food_id) || {
      food_id: it.food_id, name: it.name, display_name: it.display_name, role: it.role,
      basis: it.basis, grams: 0, pieces: it.pieces === null ? null : 0, unit_label: it.unit_label,
    };
    e.grams += it.grams;
    if (e.pieces !== null && it.pieces !== null) e.pieces += it.pieces;
    agg.set(it.food_id, e);
  }
  plan.shopping_list = [...agg.values()].sort((a, b) =>
    (ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)) || a.name.localeCompare(b.name, 'it'));
  return plan;
}

/** Per-day tolerance warnings. Prefixed with the day label so swapItem can refresh them. */
function dayWarnings(day, targets) {
  const w = [];
  const k = day.totals.kcal;
  if (Math.abs(k - targets.kcal) > targets.kcal * KCAL_TOLERANCE) {
    w.push(`${day.label}: ${k} kcal contro un obiettivo di ${targets.kcal} kcal (oltre il 5%), limiti di porzione raggiunti.`);
  }
  if (day.totals.protein_g < targets.protein_g * PROTEIN_LOW) {
    w.push(`${day.label}: proteine ${Math.round(day.totals.protein_g)} g, sotto l'obiettivo di ${targets.protein_g} g.`);
  }
  return w;
}

/**
 * LARN 2014 range checks over the plan, one warning per nutrient listing the days out of
 * range. All start with "LARN:" so swapItem can recompute them.
 */
function larnWarnings(plan) {
  const checks = [
    ['carbs_pct', (v) => v < LARN.carbs_pct[0] || v > LARN.carbs_pct[1], 'carboidrati fuori dal 45-60% dell\'energia', (v) => `${v}%`],
    ['fat_pct', (v) => v < LARN.fat_pct[0] || v > LARN.fat_pct[1], 'grassi fuori dal 20-35% dell\'energia', (v) => `${v}%`],
    ['sugars_pct', (v) => v >= LARN.sugars_pct_max, 'zuccheri oltre il 15% dell\'energia', (v) => `${v}%`],
    ['fiber_g', (v) => v < LARN.fiber_g_min, 'fibra sotto 25 g', (v) => `${Math.round(v)} g`],
    ['sfa_pct', (v) => v >= LARN.sfa_pct_max, 'grassi saturi oltre il 10% dell\'energia', (v) => `${v}%`],
  ];
  const out = [];
  for (const [key, bad, text, fmt] of checks) {
    const days = plan.days.filter((d) => d.larn && d.larn[key] !== null && bad(d.larn[key]));
    if (!days.length) continue;
    out.push(`LARN: ${text} in ${days.length} ${days.length === 1 ? 'giorno' : 'giorni'} (${days.map((d) => `${d.label} ${fmt(d.larn[key])}`).join(', ')}).`);
  }
  return out;
}

function dedupe(arr) { return [...new Set(arr)]; }

// ---------------------------------------------------------------------------
// Recipes (contract section 6, optional)
// ---------------------------------------------------------------------------

/** Protein categories that count toward the weekly quotas when present in a recipe. */
const QUOTA_CATEGORIES = new Set(['pesce', 'legumi', 'carne_rossa', 'salumi', 'carne_bianca', 'uova', 'formaggi', 'proteine_vegetali']);
const RECIPE_SCALE = [0.75, 1.5];
/** Weekly cap per recipe (for 7 days) and probability of trying a recipe for a main meal. */
const RECIPE_WEEKLY_MAX = 2;
const RECIPE_TRY = 0.85;

/** Ingredient foods of a recipe, or null when an ingredient is missing from the KG. */
function recipeParts(recipe, byId) {
  if (!recipe || !Array.isArray(recipe.ingredients) || !recipe.ingredients.length) return null;
  const parts = [];
  for (const ing of recipe.ingredients) {
    const food = byId.get(String(ing.food_id));
    if (!food || !isNum(ing.grams) || ing.grams <= 0 || !food.per100g || !isNum(food.per100g.kcal)) return null;
    // minor: herbs, spices, salt (role "aroma" or under 10 g) are ignored by the day rules
    parts.push({ food, grams: ing.grams, scalable: ing.scalable !== false, role: ing.role || null,
      minor: ing.role === 'aroma' || ing.grams < 10 });
  }
  return parts;
}

/**
 * Hard constraints for a recipe: meal, season, diet, allergens and exclude_food_ids,
 * checked on the recipe fields and again on every ingredient food.
 */
function recipeAllowed(recipe, parts, profile, meal) {
  if (!parts) return false;
  if (Array.isArray(recipe.meals) && !recipe.meals.includes(meal)) return false;
  if (Array.isArray(recipe.seasons) && recipe.seasons.length && !recipe.seasons.includes(profile.season)) return false;
  const allergens = new Set(profile.allergens || []);
  const excluded = new Set(profile.exclude_food_ids || []);
  if ((recipe.allergens || []).some((a) => allergens.has(a))) return false;
  if (profile.diet === 'vegano' && !(recipe.diet && recipe.diet.vegan === true)) return false;
  if (profile.diet === 'vegetariano' && !(recipe.diet && (recipe.diet.vegetarian === true || recipe.diet.vegan === true))) return false;
  for (const { food } of parts) {
    if (excluded.has(food.id) || !dietOk(food, profile.diet)) return false;
    if ((food.allergens || []).some((a) => allergens.has(a))) return false;
  }
  return true;
}

/**
 * Protein categories of a recipe that count as a portion: a protein ingredient
 * (role secondo, or a quota category) with at least half a LARN portion, or 30 g.
 */
function recipeCategories(parts) {
  const cats = new Set();
  for (const { food, grams } of parts) {
    // category from the LARN group when the KG has it, else from the food (secondo only)
    let c = null;
    if (food.larn_group) {
      const g = normKey(food.larn_group);
      for (const [cat, keys] of Object.entries(LARN_CATEGORY_KEYS)) if (keys.includes(g)) { c = cat; break; }
      if (!c && g === 'proteine_vegetali') c = 'proteine_vegetali';
      if (!c && g === 'pesce_conservato') c = 'pesce';
    } else if (food.role === 'secondo') c = proteinCategory(food);
    if (!c || !QUOTA_CATEGORIES.has(c)) continue;
    const lp = LARN_PORTION.get(food);
    const net = grams * edibleFraction(food);
    if (net >= (lp ? lp * 0.5 : 30)) cats.add(c);
  }
  return cats;
}

/** Recipe grams: scalable ingredients scaled, then 5 g steps (1 g under 20 g). */
function recipeGrams(g, scale, scalable) {
  if (!scalable) return g;
  const x = g * scale;
  return x >= 20 ? Math.max(5, Math.round(x / 5) * 5) : Math.max(1, Math.round(x));
}

/** Scale (0.75..1.5, step 0.05) so that the recipe delivers `targetKcal`. */
function recipeScale(parts, targetKcal) {
  let fixed = 0; let scal = 0;
  for (const p of parts) { const k = (kcal100(p.food) * p.grams) / 100; if (p.scalable) scal += k; else fixed += k; }
  if (scal <= 0) return 1;
  return Math.round(clamp((targetKcal - fixed) / scal, RECIPE_SCALE[0], RECIPE_SCALE[1]) * 20) / 20;
}

/** Working items (locked, tagged with rc) for a recipe at a given scale. */
function recipeWItems(recipe, parts, scale, key, eff, category) {
  const rc = { key, recipe, scale, covers: eff, category };
  return parts.map((p) => ({
    food: p.food, slot: 'recipe', grams: recipeGrams(p.grams, scale, p.scalable),
    locked: true, rc, base: p.grams, scalable: p.scalable, minor: p.minor,
  }));
}

/** Slots the recipe takes: its covers, plus secondo when it brings the meal's protein. */
function effectiveCovers(recipe, parts, cats) {
  const eff = new Set(recipe.covers || []);
  if (cats.size) eff.add('secondo');
  if (parts.some((p) => p.food.role === 'condimento' || isFat(p.food))) eff.add('condimento');
  return eff;
}

/** Template share of the meal kcal for a set of covered roles. */
function coveredShare(meal, eff) {
  const t = TEMPLATES[meal] || [];
  const sh = t.filter((x) => eff.has(x.roles[0])).reduce((a, x) => a + x.share, 0);
  return sh > 0 ? sh : 0.4;
}

/** Potatoes (LARN group "patate" or the name). */
function isPotato(f) { return f.larn_group === 'patate' || /patat|potato/i.test(`${f.name_it || ''} ${f.name_en || ''}`); }
/** Plain raw grain (pasta, rice, spelt...): needs its own dressing when served alone. */
function isPlainGrain(f) { return f.role === 'base_principale' && basisOf(f) === 'crudo' && !isBread(f) && !isPotato(f); }
/** Grams of fats (oil, butter) in a list of working items. */
const fatGrams = (items) => items.filter((it) => isFat(it.food)).reduce((a, it) => a + it.grams, 0);
/** Max total oil in a meal with two recipes (g). */
const MEAL_OIL_MAX = 20;

/** Recipe display name by language. */
function recipeName(r, lang) { return lang === 'en' ? (r.name_en || r.name_it) : (r.name_it || r.name_en); }

/** Group working items into plan items: recipe components become one recipe item. */
function toMealItems(items, lang) {
  const out = []; const groups = new Map();
  for (const it of items) {
    if (!it.rc) { out.push(toItem(it, lang)); continue; }
    let g = groups.get(it.rc.key);
    if (!g) {
      const r = it.rc.recipe;
      g = {
        type: 'recipe', recipe_id: r.id, name: recipeName(r, lang), display_name: recipeName(r, lang),
        role: (r.covers && r.covers[0]) || 'base_principale', covers: (r.covers || []).slice(),
        scale: it.rc.scale, slot: 'recipe', components: [],
      };
      if (it.rc.category) g.category = it.rc.category;
      if (it.rc.swap_history) g.swap_history = it.rc.swap_history.slice();
      groups.set(it.rc.key, g); out.push(g);
    }
    g.components.push(toItem({ food: it.food, slot: 'recipe', grams: it.grams }, lang));
  }
  return out;
}

/** Recompute a recipe item's totals from its components (mutates). */
function recipeTotals(item) {
  const t = totalsOf(item.components);
  item.grams = item.components.reduce((a, c) => a + c.grams, 0);
  item.kcal = t.kcal; item.protein_g = t.protein_g; item.carbs_g = t.carbs_g; item.fat_g = t.fat_g;
  item.sugars_g = t.sugars_g; item.fiber_g = t.fiber_g; item.sfa_g = t.sfa_g;
  Object.defineProperty(item, '_cov', { value: t._cov, enumerable: false, configurable: true });
  return item;
}

/** Food-level items of a plan meal (recipe components flattened). */
function flatItems(meal) {
  return meal.items.flatMap((x) => (x.type === 'recipe' ? x.components : [x]));
}

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------

/**
 * Generate a weekly plan.
 * @param {Profile} profile
 * @param {KG} kg parsed foods.json
 * @param {{seed?: number, recipes?: Object, useRecipes?: boolean}} [opts] opts.seed overrides
 *   profile.seed; opts.recipes is the parsed recipes.json (optional), used for pranzo and
 *   cena unless opts.useRecipes is false. Without recipes the plan is unchanged.
 * @returns {Object} Plan (see docs/CONTRACT.md)
 * @throws {Error} with `.errors` when the profile is invalid
 */
export function generatePlan(profile, kg, opts = {}) {
  const v = validateProfile(profile);
  if (!v.ok) {
    const e = new Error(v.errors.join(' '));
    /** @type {any} */ (e).errors = v.errors;
    throw e;
  }
  if (!kg || !Array.isArray(kg.foods)) throw new Error('Database alimenti non valido: manca la lista "foods".');
  const days = profile.days ?? 7;
  const seed = isNum(opts.seed) ? opts.seed : (isNum(profile.seed) ? profile.seed : 42);
  const lang = profile.lang === 'en' ? 'en' : 'it';
  const rng = mulberry32(hashString(`${seed}|${profile.diet}|${profile.season}|${(profile.allergens || []).join(',')}`) ^ seed);
  const targets = computeTargets(profile);
  const warnings = [...v.warnings];
  const cache = new Map();
  const pool = (roles, meal) => {
    const r = slotPool(kg, profile, roles, meal, cache);
    if (r.warning) warnings.push(r.warning);
    return r.foods;
  };

  // Protein category schedule from what is actually available for pranzo/cena.
  const protPools = { pranzo: pool(['secondo'], 'pranzo'), cena: pool(['secondo'], 'cena') };
  const available = new Set([...protPools.pranzo, ...protPools.cena].map(proteinCategory));
  const larnFreq = indexLarn(kg);
  const schedule = buildCategorySchedule(rng, profile.diet, days, available, warnings, larnFreq);

  const weekUses = new Map();
  const use = (f) => weekUses.set(familyOf(f), (weekUses.get(familyOf(f)) || 0) + 1);
  /** @type {Map<string, Food>} */
  const prevBySlot = new Map();
  const outDays = [];
  // Recipes: valid per meal, checked once.
  const recipesOn = !!(opts.recipes && Array.isArray(opts.recipes.recipes) && opts.useRecipes !== false);
  const byId = recipesOn ? new Map(kg.foods.map((f) => [f.id, f])) : null;
  const recipePool = { pranzo: [], cena: [] };
  if (recipesOn) {
    for (const r of opts.recipes.recipes) {
      const parts = recipeParts(r, byId);
      for (const meal of ['pranzo', 'cena']) {
        if (recipeAllowed(r, parts, profile, meal)) {
          const cats = recipeCategories(parts);
          if (cats.size > 1) continue;
          if (!cats.size && (r.covers || []).includes('secondo')) continue;
          recipePool[meal].push({ r, parts, cats, cat: cats.size ? [...cats][0] : null, eff: effectiveCovers(r, parts, cats) });
        }
      }
    }
  }
  const recipeUses = new Map();
  let prevDayRecipes = new Set();
  const recipeCap = Math.max(1, Math.ceil((RECIPE_WEEKLY_MAX * days) / 7));
  let recipeKey = 0;

  const condPools = {};
  for (const meal of ['pranzo', 'cena']) {
    let c = pool(['condimento'], meal).filter(isFat);
    if (!c.length) c = hardFiltered(kg, profile, ['condimento']).filter(isFat);
    condPools[meal] = c;
  }

  for (let d = 0; d < days; d++) {
    const day = newDayState();
    const wMeals = [];
    const todayRecipes = new Set();
    for (const meal of MEAL_TYPES) {
      const target = targets.kcal * MEAL_SHARES[meal];
      let slots = TEMPLATES[meal];
      if (meal === 'spuntino') {
        slots = target >= SPUNTINO_SPLIT_KCAL
          ? [{ slot: 'frutta', roles: ['frutta'], share: 0.45 }, { slot: 'spuntino', roles: ['snack'], share: 0.55 }]
          : [{ slot: 'spuntino', roles: rng() < 0.5 ? ['frutta'] : ['snack'], share: 1 }];
      }
      const items = [];
      let covered = null;
      if (recipesOn && recipePool[meal] && recipePool[meal].length && rng() < RECIPE_TRY) {
        const sched = schedule[2 * d + (meal === 'cena' ? 1 : 0)];
        const cands = recipePool[meal].filter((x) => {
          if ((recipeUses.get(x.r.id) || 0) >= recipeCap || prevDayRecipes.has(x.r.id) || todayRecipes.has(x.r.id)) return false;
          if (x.cat && x.cat !== sched) return false;          // keeps the weekly protein quotas
          return x.parts.every((p) => p.minor || p.food.role === 'condimento' || isFat(p.food) || isBread(p.food) ||
            !dayKeys(p.food).some((k) => day.keys.has(k)));
        });
        if (cands.length) {
          const pick = weightedPick(rng, cands.map((x) => ({
            v: x, w: (priorityOf(x.r) + 1) ** 2 * (x.r.light === true ? 2 : 1) / (1 + (recipeUses.get(x.r.id) || 0)) ** 2,
          })));
          const scale = recipeScale(pick.parts, target * coveredShare(meal, pick.eff));
          const comps = recipeWItems(pick.r, pick.parts, scale, `r${recipeKey++}`, pick.eff, pick.cat);
          for (const c of comps) { items.push(c); if (!c.minor) { commitDay(c.food, day); use(c.food); } }
          covered = pick.eff;
          recipeUses.set(pick.r.id, (recipeUses.get(pick.r.id) || 0) + 1);
          todayRecipes.add(pick.r.id);
          // A secondo or contorno recipe leaves the base to fill: try a primo recipe first
          // (primo + secondo), no protein, no overlapping slots except the dressing, oil in
          // the meal at most MEAL_OIL_MAX g.
          if (!covered.has('base_principale')) {
            const oil = fatGrams(items);
            const primi = cands.filter((x) => x !== pick && !x.cat && x.eff.has('base_principale') &&
              ![...x.eff].some((r) => r !== 'condimento' && covered.has(r)) &&
              x.parts.every((p) => p.minor || p.food.role === 'condimento' || isFat(p.food) || isBread(p.food) ||
                !dayKeys(p.food).some((k) => day.keys.has(k))) &&
              oil + x.parts.filter((p) => isFat(p.food)).reduce((a, p) => a + p.grams, 0) <= MEAL_OIL_MAX);
            if (primi.length) {
              const p2 = weightedPick(rng, primi.map((x) => ({
                v: x, w: (priorityOf(x.r) + 1) ** 2 * (x.r.light === true ? 2 : 1) / (1 + (recipeUses.get(x.r.id) || 0)) ** 2,
              })));
              const sc2 = recipeScale(p2.parts, target * coveredShare(meal, new Set(['base_principale'])));
              for (const c of recipeWItems(p2.r, p2.parts, sc2, `r${recipeKey++}`, p2.eff, null)) { items.push(c); if (!c.minor) { commitDay(c.food, day); use(c.food); } }
              for (const r of p2.eff) covered.add(r);
              recipeUses.set(p2.r.id, (recipeUses.get(p2.r.id) || 0) + 1);
              todayRecipes.add(p2.r.id);
            }
          }
        }
      }
      let needDressing = false;
      for (const s of slots) {
        if (covered && covered.has(s.roles[0]) && !(s.slot === 'condimento' && needDressing)) continue;
        let cands = s.slot === 'condimento' ? condPools[meal] : pool(s.roles, meal);
        // next to a recipe, prefer bread or potatoes to a plain grain as the base
        if (covered && s.slot === 'base') {
          const easy = cands.filter((f) => !isPlainGrain(f));
          if (easy.length) cands = easy;
        }
        if (meal === 'spuntino' && !cands.length) cands = pool(['frutta', 'snack'], meal);
        if (s.slot === 'condimento') {
          // Extra virgin olive oil most of the time, other fats otherwise.
          // With priorities in the KG the top-priority fat wins (pickFood); without them,
          // extra virgin olive oil 75% of the time.
          const olive = cands.filter(isOliveOil);
          if (!cands.some((f) => isNum(f.priority))) {
            if (olive.length && (olive.length === cands.length || rng() < 0.75)) cands = olive;
            else if (olive.length) cands = cands.filter((f) => !isOliveOil(f));
          }
        }
        let category;
        if (s.slot === 'proteina') {
          category = schedule[2 * d + (meal === 'cena' ? 1 : 0)];
          const inCat = cands.filter((f) => proteinCategory(f) === category);
          if (inCat.length) cands = inCat;
          else if (category) {
            const otherMeal = protPools[meal === 'cena' ? 'pranzo' : 'cena'].filter((f) => proteinCategory(f) === category);
            if (otherMeal.length) cands = otherMeal;
          }
        }
        const role = s.roles[0];
        const key = `${meal}:${s.slot}`;
        const prev = prevBySlot.get(key);
        const capBase = WEEKLY_CAP_BY_ROLE[role];
        const cap = capBase == null ? null : Math.max(1, Math.ceil((capBase * days) / 7));
        const mealFoods = items.map((x) => x.food);
        let food = pickFood(rng, cands, {
          // condimento and breakfast drink may repeat daily (olive oil, milk every morning)
          meal, prevId: role === 'condimento' || role === 'bevanda_colazione' || !prev ? null : familyOf(prev), prevFood: prev,
          day, weekUses, cap: s.slot === 'proteina' ? Math.max(cap ?? 2, 2) : cap, mealFoods,
        });
        if (!food && s.slot === 'proteina') {
          // Category could not respect the day rules: any protein source that does.
          food = pickFood(rng, pool(s.roles, meal), { meal, prevId: null, prevFood: prev, day, weekUses, cap: null, mealFoods });
        }
        if (!food) continue;
        prevBySlot.set(key, food);
        commitDay(food, day);
        use(food);
        /** @type {WItem} */
        const it = { food, slot: s.slot, grams: role === 'contorno' ? roundFood(food, bounds(food).typ) : sizeFor(food, target * s.share) };
        if (food.role === 'secondo') it.category = proteinCategory(food);
        if (covered && s.slot === 'condimento' && needDressing) {
          // dressing for a plain grain next to a recipe: 5-10 g, kept fixed
          it.grams = roundFood(food, clamp(MEAL_OIL_MAX - fatGrams(items), 5, 10));
          it.locked = true;
        }
        items.push(it);
        if (covered && s.slot === 'base' && isPlainGrain(food)) needDressing = true;
      }
      wMeals.push({ type: meal, target, items });
    }
    correctDay(wMeals, targets);
    // Protein still short: add one protein-dense item (yogurt, soy yogurt, ...) as a snack.
    for (const [meal, role] of PROTEIN_EXTRA_SLOTS) {
      const all = wMeals.flatMap((m) => m.items);
      if (sumProt(all) >= targets.protein_g * 0.92) break;
      const r = slotPool(kg, profile, [role], meal, cache);
      const dense = r.warning ? [] : r.foods.filter(isProteinDense);
      if (!dense.length) continue;
      const m = wMeals.find((x) => x.type === meal);
      if (mealCount(m) >= MAX_ITEMS[meal]) continue;
      const food = pickFood(rng, dense, {
        meal, prevId: null, prevFood: null, day, weekUses, cap: null, strict: true,
        mealFoods: m.items.map((x) => x.food),
      });
      if (!food) continue;
      const snapshot = wMeals.map((x) => x.items.map((it) => it.grams));
      const b = bounds(food);
      const extra = { food, slot: 'extra', grams: roundFood(food, b.typ) };
      m.items.push(extra);
      fixProtein(all.concat(extra), targets.protein_g);
      const items = wMeals.flatMap((x) => x.items);
      const rest = shiftByTiers(items, targets.kcal - sumKcal(items), new Set(items.filter((x) => isProteinDense(x.food))));
      if (Math.abs(rest) > targets.kcal * 0.02) shiftByTiers(items, rest, null);
      if (Math.abs(targets.kcal - sumKcal(items)) > targets.kcal * 0.04) {
        // Energy budget too tight for the extra item: undo it.
        m.items.pop();
        wMeals.forEach((x, i) => x.items.forEach((it, j) => { it.grams = snapshot[i][j]; }));
        continue;
      }
      commitDay(food, day);
      use(food);
    }
    {
      // Fat check, then kcal again with fatty items locked.
      const all = wMeals.flatMap((m) => m.items);
      const fatty = fixFat(all, targets.fat_g);
      fixCarbs(all, targets);
      fixSugars(all);
      shiftByTiers(all, targets.kcal - sumKcal(all), new Set([...fatty, ...all.filter((x) => isSweet(x.food))]));
    }
    // High targets: add a snack or bread when portion bounds are not enough (never fruit).
    for (const [meal, role] of [...EXTRA_SLOTS, ...EXTRA_SLOTS]) {
      const all = wMeals.flatMap((m) => m.items);
      const delta = targets.kcal - sumKcal(all);
      if (delta <= targets.kcal * 0.03) break;
      const r = slotPool(kg, profile, [role], meal, cache);
      if (r.warning || !r.foods.length) continue;
      const m = wMeals.find((x) => x.type === meal);
      if (mealCount(m) >= MAX_ITEMS[meal]) continue;
      let extraPool = r.foods;
      if (role === 'base_principale') {
        // bread first; a meal that already has bread gets its bread raised by the kcal
        // shift and, if still short, a second starch of another LARN group (potatoes, rice)
        const hasBread = m.items.some((x) => isBread(x.food));
        const bread = extraPool.filter(isBread);
        if (hasBread) extraPool = extraPool.filter((f) => !isBread(f) && !isPlainGrain(f));
        else if (bread.length) extraPool = bread;
      } else if (role === 'snack') {
        // neither fatty (nuts) nor sweet (dried fruit, sweets): crackers, grissini, yogurt
        const plain = extraPool.filter((f) => !isFatty(f) && !isSweet(f));
        const notSweet = extraPool.filter((f) => !isSweet(f));
        extraPool = plain.length ? plain : notSweet.length ? notSweet : extraPool;
      }
      const capBase = WEEKLY_CAP_BY_ROLE[role];
      const food = pickFood(rng, extraPool, {
        meal, prevId: null, prevFood: null, day, weekUses, strict: true,
        cap: capBase == null ? null : Math.max(1, Math.ceil((capBase * days) / 7)) + 1,
        mealFoods: m.items.map((x) => x.food),
      });
      if (!food) continue;
      commitDay(food, day);
      use(food);
      m.items.push({ food, slot: 'extra', grams: sizeFor(food, delta) });
      const items = wMeals.flatMap((x) => x.items);
      const fatLock = sumFat(items) > targets.fat_g * 1.1 ? new Set(items.filter((x) => isFatty(x.food))) : null;
      shiftByTiers(items, targets.kcal - sumKcal(items), fatLock);
    }
    if (recipesOn) rescaleRecipes(wMeals, targets);
    {
      // Energy has priority over fat: last unlocked pass if still outside +-4%.
      const all = wMeals.flatMap((m) => m.items);
      const rest = targets.kcal - sumKcal(all);
      if (Math.abs(rest) > targets.kcal * 0.04) shiftByTiers(all, rest, null);
    }
    prevDayRecipes = todayRecipes;
    const label = dayLabel(d, lang);
    outDays.push({
      index: d, label,
      meals: wMeals.map((m) => ({ type: m.type, target_kcal: Math.round(m.target), items: toMealItems(m.items, lang) })),
    });
  }

  const plan = finalize({
    meta: {
      engine_version: ENGINE_VERSION, kg_version: kg.version ?? null, seed,
      season: profile.season, diet: profile.diet, days, lang,
    },
    targets,
    days: outDays,
    week_totals: null,
    shopping_list: [],
    warnings: [],
  });
  for (const day of plan.days) warnings.push(...dayWarnings(day, targets));
  warnings.push(...larnWarnings(plan));
  plan.warnings = dedupe(warnings);
  return plan;
}

/** Day still more than 3% off: move recipe scales (within 0.75..1.5) to close the gap. */
function rescaleRecipes(wMeals, targets) {
  const all = wMeals.flatMap((m) => m.items);
  const delta = targets.kcal - sumKcal(all);
  if (Math.abs(delta) <= targets.kcal * 0.03) return;
  const groups = new Map();
  for (const it of all) if (it.rc) { if (!groups.has(it.rc.key)) groups.set(it.rc.key, []); groups.get(it.rc.key).push(it); }
  let scal = 0;
  for (const comps of groups.values()) for (const c of comps) if (c.scalable) scal += (kcal100(c.food) * c.base) / 100;
  if (scal <= 0) return;
  const ds = delta / scal;
  for (const comps of groups.values()) {
    const rc = comps[0].rc;
    rc.scale = Math.round(clamp(rc.scale + ds, RECIPE_SCALE[0], RECIPE_SCALE[1]) * 20) / 20;
    for (const c of comps) c.grams = recipeGrams(c.base, rc.scale, c.scalable);
  }
}

function dayLabel(d, lang) {
  const labels = DAY_LABELS[lang] || DAY_LABELS.it;
  const base = labels[d % 7];
  if (d < 7) return base;
  return lang === 'en' ? `${base} (week ${Math.floor(d / 7) + 1})` : `${base} (settimana ${Math.floor(d / 7) + 1})`;
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------

/**
 * Replace one item with a valid alternative of the same role. Constraints of the
 * profile are respected, food.substitutes are preferred, then foods with the most
 * similar kcal density and protein share. Successive swaps of the same item cycle
 * through alternatives (swap_history). Grams are sized to keep the item's kcal and
 * the day is corrected if it leaves the +-5% band. The input plan is not mutated.
 * @param {Object} plan
 * @param {KG} kg
 * @param {number} dayIndex
 * @param {number} mealIndex
 * @param {number} itemIndex
 * @param {Profile} profile
 * @param {{recipes?: Object}} [opts] parsed recipes.json, needed to swap a recipe item for
 *   another recipe; without it a recipe item is replaced by foods for its slots
 * @returns {Object} new plan
 */
export function swapItem(plan, kg, dayIndex, mealIndex, itemIndex, profile, opts = {}) {
  const out = deepClone(plan);
  const day = out.days && out.days[dayIndex];
  const meal = day && day.meals[mealIndex];
  const item = meal && meal.items[itemIndex];
  if (!item) throw new Error('Elemento da sostituire non trovato nel piano.');
  const v = validateProfile(profile);
  if (!v.ok) { const e = new Error(v.errors.join(' ')); /** @type {any} */ (e).errors = v.errors; throw e; }
  const byId = new Map(kg.foods.map((f) => [f.id, f]));
  const current = byId.get(item.food_id);
  const lang = (out.meta && out.meta.lang) || (profile.lang === 'en' ? 'en' : 'it');
  const targets = out.targets || computeTargets(profile);
  indexLarn(kg); // standard portions for sizeFor

  if (item.type === 'recipe') {
    swapRecipe(out, kg, byId, day, meal, itemIndex, item, profile, opts, lang);
    return finishSwap(out, day, targets);
  }

  let { foods: pool } = slotPool(kg, profile, [item.role], meal.type, null);
  if (item.role === 'condimento' && (meal.type === 'pranzo' || meal.type === 'cena')) {
    const fats = pool.filter(isFat);
    pool = fats.length ? fats : hardFiltered(kg, profile, ['condimento']).filter(isFat);
  }
  const inMeal = new Set(flatItems(meal).map((x) => x.food_id));
  let history = (item.swap_history || []).concat(item.food_id);
  // Day rules: state of the day and of the meal without the item being replaced.
  const st = newDayState();
  day.meals.forEach((mm, mi) => mm.items.forEach((x, xi) => {
    if (mi === mealIndex && xi === itemIndex) return;
    for (const y of x.type === 'recipe' ? x.components : [x]) { const f = byId.get(y.food_id); if (f && !(x.type === 'recipe' && y.grams < 10)) commitDay(f, st); }
  }));
  const mealFoods = meal.items.filter((_, xi) => xi !== itemIndex)
    .flatMap((x) => (x.type === 'recipe' ? x.components : [x])).map((x) => byId.get(x.food_id)).filter(Boolean);
  const strictPool = pool.filter((f) => fitsDay(f, st, mealFoods));
  if (strictPool.length > 1 || (strictPool.length === 1 && strictPool[0].id !== item.food_id)) pool = strictPool;
  else pool = pool.filter((f) => fitsDay(f, st, mealFoods, true));
  const notUsed = (f) => !inMeal.has(f.id);
  let cands = pool.filter((f) => notUsed(f) && !history.includes(f.id));
  if (!cands.length) { history = [item.food_id]; cands = pool.filter((f) => notUsed(f) && f.id !== item.food_id); }

  // Protein quotas: keep red meat cap and required minimums.
  if (item.role === 'secondo' && cands.length) {
    const { min, max } = scaledRules(profile.diet, out.days.length, indexLarn(kg));
    const counts = {};
    out.days.forEach((dd, di) => dd.meals.forEach((mm, mi) => mm.items.forEach((x, xi) => {
      if (di === dayIndex && mi === mealIndex && xi === itemIndex) return;
      if (x.type === 'recipe') { if (x.category) counts[x.category] = (counts[x.category] || 0) + 1; return; }
      if (x.role !== 'secondo') return;
      const c = x.category || (byId.get(x.food_id) ? proteinCategory(byId.get(x.food_id)) : 'altro');
      counts[c] = (counts[c] || 0) + 1;
    })));
    const oldCat = item.category || (current ? proteinCategory(current) : null);
    const ok = cands.filter((f) => underMax(counts, max, proteinCategory(f)));
    if (ok.length) cands = ok;
    if (oldCat && isNum(min[oldCat]) && countOf(counts, oldCat) < min[oldCat]) {
      const same = cands.filter((f) => proteinCategory(f) === oldCat);
      if (same.length) cands = same;
    }
  }
  if (!cands.length) {
    out.warnings = dedupe([...(out.warnings || []), `Nessuna alternativa disponibile per ${item.name} con i vincoli scelti.`]);
    return out;
  }

  const subs = current ? current.substitutes || [] : [];
  const dens = (f) => kcal100(f);
  const pshare = (f) => (kcal100(f) > 0 ? (prot100(f) * 4) / kcal100(f) : 0);
  const ref = current || cands[0];
  const score = (f) => {
    const si = subs.indexOf(f.id);
    if (si >= 0) return -1000 + si;
    return Math.abs(Math.log((dens(f) + 1) / (dens(ref) + 1))) + 2 * Math.abs(pshare(f) - pshare(ref)) - (f.common ? 0.05 : 0);
  };
  cands.sort((a, b) => (score(a) - score(b)) || a.id.localeCompare(b.id));
  const next = cands[0];

  /** @type {WItem} */
  const w = { food: next, slot: item.slot, grams: next.role === 'contorno' ? roundFood(next, bounds(next).typ) : sizeFor(next, item.kcal), swap_history: history };
  if (next.role === 'secondo') w.category = proteinCategory(next);
  meal.items[itemIndex] = toItem(w, lang);

  // Re-correct the day if needed, keeping the new item fixed.
  const dayKcal = day.meals.reduce((s, m) => s + m.items.reduce((t, x) => t + x.kcal, 0), 0);
  if (Math.abs(dayKcal - targets.kcal) > targets.kcal * 0.03) {
    const wMeals = day.meals.map((m) => ({
      type: m.type, target: m.target_kcal,
      items: m.items.map((x) => ({ food: byId.get(x.food_id), slot: x.slot, grams: x.grams, category: x.category, swap_history: x.swap_history })),
    }));
    if (wMeals.every((m) => m.items.every((x) => x.food))) {
      const fixed = wMeals[mealIndex].items[itemIndex];
      const all = wMeals.flatMap((m) => m.items);
      shiftByTiers(all, targets.kcal - sumKcal(all), new Set([fixed]));
      day.meals = day.meals.map((m, mi) => ({ ...m, items: wMeals[mi].items.map((x) => toItem(x, lang)) }));
    }
  }

  return finishSwap(out, day, targets);
}

/** Totals, shopping list and warnings after a swap (mutates the clone). */
function finishSwap(out, day, targets) {
  finalize(out);
  const label = day.label;
  out.warnings = dedupe([
    ...(out.warnings || []).filter((s) => !s.startsWith(`${label}: `) && !s.startsWith('LARN:')),
    ...dayWarnings(day, targets), ...larnWarnings(out),
  ]);
  return out;
}

/**
 * Swap a recipe item for another valid recipe with the same covers and the same protein
 * category (weekly quotas unchanged), scaled to the old kcal. If there is none, the recipe
 * is replaced by foods for its slots. Mutates the clone.
 */
function swapRecipe(out, kg, byId, day, meal, itemIndex, item, profile, opts, lang) {
  const recipes = opts && opts.recipes && Array.isArray(opts.recipes.recipes) ? opts.recipes.recipes : [];
  const coversKey = (c) => [...(c || [])].sort().join('+');
  let history = (item.swap_history || []).concat(item.recipe_id);
  const st = newDayState();
  const sameDay = new Set();
  day.meals.forEach((mm) => mm.items.forEach((x) => {
    if (x === item) return;
    if (x.type === 'recipe') sameDay.add(x.recipe_id);
    for (const y of x.type === 'recipe' ? x.components : [x]) { const f = byId.get(y.food_id); if (f && !(x.type === 'recipe' && y.grams < 10)) commitDay(f, st); }
  }));
  const oldCat = item.category || null;
  const cands = recipes.map((r) => ({ r, parts: recipeParts(r, byId) }))
    .filter((x) => x.r.id !== item.recipe_id && !sameDay.has(x.r.id) && coversKey(x.r.covers) === coversKey(item.covers) &&
      recipeAllowed(x.r, x.parts, profile, meal.type))
    .map((x) => ({ ...x, cats: recipeCategories(x.parts) }))
    .filter((x) => x.cats.size <= 1 && (x.cats.size ? [...x.cats][0] : null) === oldCat)
    .filter((x) => x.parts.every((p) => p.minor || p.food.role === 'condimento' || isFat(p.food) || isBread(p.food) ||
      !dayKeys(p.food).some((k) => st.keys.has(k))));
  let fresh = cands.filter((x) => !history.includes(x.r.id));
  if (!fresh.length && cands.length) { fresh = cands; history = [item.recipe_id]; }
  if (fresh.length) {
    const w = (x) => (priorityOf(x.r) + 1) ** 2 * (x.r.light === true ? 2 : 1);
    fresh.sort((a, b) => (w(b) - w(a)) || String(a.r.id).localeCompare(String(b.r.id)));
    const x = fresh[0];
    const scale = recipeScale(x.parts, item.kcal);
    const comps = recipeWItems(x.r, x.parts, scale, 'swap', effectiveCovers(x.r, x.parts, x.cats), x.cat || null);
    comps[0].rc.swap_history = history;
    meal.items[itemIndex] = toMealItems(comps, lang)[0];
    return;
  }
  // Fallback: foods for the recipe slots (template order), sized on the old recipe kcal.
  const old = recipes.find((r) => r.id === item.recipe_id);
  const oldParts = old ? recipeParts(old, byId) : null;
  const eff = old && oldParts ? effectiveCovers(old, oldParts, recipeCategories(oldParts)) : new Set(item.covers || []);
  if (oldCat) eff.add('secondo');
  const slots = (TEMPLATES[meal.type] || []).filter((x) => eff.has(x.roles[0]));
  const totalShare = slots.reduce((a, x) => a + x.share, 0) || 1;
  const mealFoods = meal.items.filter((x) => x !== item)
    .flatMap((x) => (x.type === 'recipe' ? x.components : [x])).map((x) => byId.get(x.food_id)).filter(Boolean);
  const newItems = [];
  for (const sl of slots) {
    const role = sl.roles[0];
    let pool = slotPool(kg, profile, [role], meal.type, null).foods;
    if (role === 'condimento') { const fats = pool.filter(isFat); pool = fats.length ? fats : hardFiltered(kg, profile, ['condimento']).filter(isFat); }
    if (role === 'secondo' && oldCat) { const same = pool.filter((f) => proteinCategory(f) === oldCat); if (same.length) pool = same; }
    const ok = pool.filter((f) => fitsDay(f, st, mealFoods));
    const list = (ok.length ? ok : pool).slice().sort((a, b) => (priorityOf(b) - priorityOf(a)) || a.id.localeCompare(b.id));
    const food = list[0];
    if (!food) continue;
    commitDay(food, st); mealFoods.push(food);
    const wi = { food, slot: sl.slot, grams: role === 'contorno' ? roundFood(food, bounds(food).typ) : sizeFor(food, (item.kcal * sl.share) / totalShare) };
    if (role === 'secondo') wi.category = proteinCategory(food);
    newItems.push(toItem(wi, lang));
  }
  if (!newItems.length) {
    out.warnings = dedupe([...(out.warnings || []), `Nessuna alternativa disponibile per ${item.name} con i vincoli scelti.`]);
    return;
  }
  meal.items.splice(itemIndex, 1, ...newItems);
}
