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
 * @property {number} bmr       kcal/day, Mifflin-St Jeor
 * @property {number} tdee      kcal/day, bmr * activity factor
 * @property {number} kcal      daily energy target after goal adjustment
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 * @property {number} bmi
 */

/**
 * @typedef {Object} PlanItem
 * @property {string} food_id
 * @property {string} name
 * @property {string} role
 * @property {string} slot       template slot: bevanda, base, frutta, spuntino, proteina, contorno, condimento
 * @property {number} grams
 * @property {number} kcal
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 * @property {string|null} household
 * @property {string} [category] protein category for role "secondo"
 */

export const ENGINE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SEXES = ['m', 'f'];
export const ACTIVITY_FACTORS = {
  // Classic PAL multipliers (McArdle, Katch and Katch; also used by FAO/WHO/UNU 2004 ranges).
  sedentario: 1.2,
  leggero: 1.375,
  moderato: 1.55,
  attivo: 1.725,
  molto_attivo: 1.9,
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

/** Share of the daily kcal target per meal (sums to 1). */
export const MEAL_SHARES = { colazione: 0.25, spuntino: 0.10, pranzo: 0.35, cena: 0.30 };

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

/** Extra items added, in this order, when a day stays more than 3% under target (never fruit). */
const EXTRA_SLOTS = [['spuntino', 'snack'], ['colazione', 'base_colazione'], ['colazione', 'snack'],
  ['pranzo', 'base_principale'], ['cena', 'base_principale'], ['spuntino', 'snack']];

/** Where a protein-dense extra item may be added when the day is short on protein. */
const PROTEIN_EXTRA_SLOTS = [['spuntino', 'snack'], ['spuntino', 'bevanda_colazione'], ['colazione', 'snack']];

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

const kcal100 = (f) => (f.per100g && isNum(f.per100g.kcal) ? f.per100g.kcal : 0);
const prot100 = (f) => (f.per100g && isNum(f.per100g.protein) ? f.per100g.protein : 0);
const nutr = (f, key) => (f.per100g && isNum(f.per100g[key]) ? f.per100g[key] : 0);

/** Grams that deliver `targetKcal`, inside the food's portion bounds. */
function sizeFor(food, targetKcal) {
  const b = bounds(food);
  const k = kcal100(food);
  if (k <= 0) return roundGrams(b.typ, b.min, b.max);
  return roundGrams((targetKcal / k) * 100, b.min, b.max);
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
 * Energy and macro targets.
 *
 * BMR: Mifflin-St Jeor (Mifflin et al., Am J Clin Nutr 1990;51:241-7)
 *   men:   10*kg + 6.25*cm - 5*age + 5
 *   women: 10*kg + 6.25*cm - 5*age - 161
 * TDEE = BMR * activity factor (see ACTIVITY_FACTORS).
 * Goal:
 *   dimagrire: TDEE - min(15% TDEE, 500 kcal), never below max(BMR, 1200 f / 1500 m)
 *   mantenimento: TDEE
 *   massa: TDEE + 10%
 * Protein (g/kg of reference weight): 1.0 mantenimento (above the 0.8-0.9 PRI of
 *   LARN 2014), 1.4 dimagrire (preserve lean mass in deficit), 1.6 massa (Morton et al.,
 *   Br J Sports Med 2018). Reference weight is the actual weight, or for BMI >= 30 the
 *   adjusted weight IBW + 0.4*(actual - IBW) with IBW at BMI 25. Capped at 2.0 g/kg and
 *   at 30% of kcal.
 * Fat: 28% of kcal (LARN 2014 reference range 20-35%, we stay in the 25-30% band).
 * Carbohydrates: the remaining kcal / 4 (Atwater factors 4/4/9).
 * kcal is rounded to 10, macros to whole grams.
 * @param {Profile} profile
 * @returns {Targets}
 */
export function computeTargets(profile) {
  const { sex, age, weight_kg: w, height_cm: h, activity, goal } = profile;
  const bmr = 10 * w + 6.25 * h - 5 * age + (sex === 'm' ? 5 : -161);
  const tdee = bmr * (ACTIVITY_FACTORS[activity] || 1.2);
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
  const ibw = 25 * hm * hm;
  const refW = bmi >= 30 ? ibw + 0.4 * (w - ibw) : w;
  const gPerKg = goal === 'dimagrire' ? 1.4 : goal === 'massa' ? 1.6 : 1.0;
  let protein = Math.min(gPerKg * refW, 2.0 * w, (0.30 * kcal) / 4);
  const fat = (0.28 * kcal) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    protein_g: Math.round(protein),
    carbs_g: Math.round(carbs),
    fat_g: Math.round(fat),
    bmi: r1(bmi),
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
  if (f.role === 'frutta' && mealFoods.some((x) => x.role === 'frutta')) return false;
  if (f.role === 'bevanda_colazione' && mealFoods.some((x) => x.role === 'bevanda_colazione')) return false;
  if (isDairyLike(f) && mealFoods.some(isDairyLike)) return false;
  if (f.role === 'condimento') return !mealFoods.some((x) => x.role === 'condimento');
  if (mealOnly) return true;
  if (dayKeys(f).some((k) => st.keys.has(k))) return false;
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
function scaledRules(diet, days) {
  const rules = CATEGORY_RULES[diet] || CATEGORY_RULES.onnivoro;
  const f = days / 7;
  const min = {}; const max = {};
  for (const [k, v] of Object.entries(rules.min)) min[k] = Math.round(v * f);
  for (const [k, v] of Object.entries(rules.max)) max[k] = Math.max(1, Math.ceil(v * f));
  return { min, max, weight: rules.weight };
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
function buildCategorySchedule(rng, diet, days, available, warnings) {
  const { min, max, weight } = scaledRules(diet, days);
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

  const tiers = [
    (f) => familyOf(f) !== prevId && okDay(f) && (cap == null || uses(f) < cap),
    (f) => familyOf(f) !== prevId && okDay(f),
    (f) => okDay(f),
  ];
  if (!strict) tiers.push(okMeal);
  let cands = [];
  for (const t of tiers) {
    cands = pool.filter(t);
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
  const adj = items.filter((it) => kcal100(it.food) > 0);
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
      it.grams = roundGrams(it.grams + dir * frac * rooms[i], b.min, b.max);
      delta -= itemKcal(it) - before;
    }
  }
  for (let step = 0; step < 60 && Math.abs(delta) > tol; step++) {
    let best = null; let bestAbs = Math.abs(delta);
    for (const it of adj) {
      const b = bounds(it.food);
      for (const d of [5, -5]) {
        const g = roundGrams(it.grams + d, b.min, b.max);
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
  ['secondo', 'contorno'],
  ['frutta'],
  ['condimento'],
];
/** Lowering kcal: starches first, then fats, snacks, fruit and drinks, then the rest. */
const TIERS_DOWN = [
  ['base_principale', 'base_colazione'],
  ['condimento', 'snack', 'frutta', 'bevanda_colazione'],
  ['secondo', 'contorno'],
];

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
  return kcal100(food) > 0 && (prot100(food) * 4) / kcal100(food) >= 0.20;
}

/** Bring protein near the target by resizing protein-dense items (5 g steps). */
function fixProtein(items, targetP) {
  const dense = items.filter((it) => isProteinDense(it.food));
  let p = sumProt(items);
  for (let step = 0; step < 200; step++) {
    if (p >= targetP * 0.97 && p <= targetP * 1.15) break;
    const up = p < targetP * 0.97;
    let best = null; let bestRatio = -1;
    for (const it of dense) {
      const b = bounds(it.food);
      const g = roundGrams(it.grams + (up ? 5 : -5), b.min, b.max);
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
  const fatty = items.filter((it) => isFatty(it.food));
  let f = sumFat(items);
  for (let step = 0; step < 100; step++) {
    if (f >= targetF * 0.85 && f <= targetF * 1.15) break;
    const down = f > targetF * 1.15;
    let best = null; let bestShare = -1;
    for (const it of fatty) {
      const b = bounds(it.food);
      const g = roundGrams(it.grams + (down ? -5 : 5), b.min, b.max);
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

/** @returns {PlanItem} */
function toItem(it, lang) {
  const f = it.food; const g = it.grams;
  const o = {
    food_id: f.id, name: foodName(f, lang), role: f.role, slot: it.slot, grams: Math.round(g),
    kcal: Math.round((kcal100(f) * g) / 100),
    protein_g: r1((nutr(f, 'protein') * g) / 100),
    carbs_g: r1((nutr(f, 'carbs') * g) / 100),
    fat_g: r1((nutr(f, 'fat') * g) / 100),
    household: (f.portion && f.portion.household) || null,
  };
  if (it.category) o.category = it.category;
  if (it.swap_history && it.swap_history.length) o.swap_history = it.swap_history.slice();
  return o;
}

function totalsOf(list) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const x of list) { t.kcal += x.kcal; t.protein_g += x.protein_g; t.carbs_g += x.carbs_g; t.fat_g += x.fat_g; }
  return { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g) };
}

/** Recompute meal, day and week totals and the shopping list (mutates the given clone). */
function finalize(plan) {
  for (const day of plan.days) {
    for (const meal of day.meals) meal.totals = totalsOf(meal.items);
    day.totals = totalsOf(day.meals.map((m) => m.totals));
  }
  plan.week_totals = totalsOf(plan.days.map((d) => d.totals));
  const agg = new Map();
  for (const day of plan.days) for (const meal of day.meals) for (const it of meal.items) {
    const e = agg.get(it.food_id) || { food_id: it.food_id, name: it.name, role: it.role, grams: 0 };
    e.grams += it.grams;
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
  if (day.totals.fat_g < targets.fat_g * 0.70 || day.totals.fat_g > targets.fat_g * 1.30) {
    w.push(`${day.label}: grassi ${Math.round(day.totals.fat_g)} g, lontani dall'obiettivo di ${targets.fat_g} g.`);
  }
  if (day.totals.protein_g < targets.protein_g * PROTEIN_LOW) {
    w.push(`${day.label}: proteine ${Math.round(day.totals.protein_g)} g, sotto l'obiettivo di ${targets.protein_g} g.`);
  }
  return w;
}

function dedupe(arr) { return [...new Set(arr)]; }

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------

/**
 * Generate a weekly plan.
 * @param {Profile} profile
 * @param {KG} kg parsed foods.json
 * @param {{seed?: number}} [opts] opts.seed overrides profile.seed
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
  const schedule = buildCategorySchedule(rng, profile.diet, days, available, warnings);

  const weekUses = new Map();
  const use = (f) => weekUses.set(familyOf(f), (weekUses.get(familyOf(f)) || 0) + 1);
  /** @type {Map<string, Food>} */
  const prevBySlot = new Map();
  const outDays = [];
  const condPools = {};
  for (const meal of ['pranzo', 'cena']) {
    let c = pool(['condimento'], meal).filter(isFat);
    if (!c.length) c = hardFiltered(kg, profile, ['condimento']).filter(isFat);
    condPools[meal] = c;
  }

  for (let d = 0; d < days; d++) {
    const day = newDayState();
    const wMeals = [];
    for (const meal of MEAL_TYPES) {
      const target = targets.kcal * MEAL_SHARES[meal];
      let slots = TEMPLATES[meal];
      if (meal === 'spuntino') {
        slots = target >= SPUNTINO_SPLIT_KCAL
          ? [{ slot: 'frutta', roles: ['frutta'], share: 0.45 }, { slot: 'spuntino', roles: ['snack'], share: 0.55 }]
          : [{ slot: 'spuntino', roles: rng() < 0.5 ? ['frutta'] : ['snack'], share: 1 }];
      }
      const items = [];
      for (const s of slots) {
        let cands = s.slot === 'condimento' ? condPools[meal] : pool(s.roles, meal);
        if (meal === 'spuntino' && !cands.length) cands = pool(['frutta', 'snack'], meal);
        if (s.slot === 'condimento') {
          // Extra virgin olive oil most of the time, other fats otherwise.
          const olive = cands.filter(isOliveOil);
          if (olive.length && (olive.length === cands.length || rng() < 0.75)) cands = olive;
          else if (olive.length) cands = cands.filter((f) => !isOliveOil(f));
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
          meal, prevId: role === 'condimento' || !prev ? null : familyOf(prev), prevFood: prev,
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
        const it = { food, slot: s.slot, grams: sizeFor(food, target * s.share) };
        if (food.role === 'secondo') it.category = proteinCategory(food);
        items.push(it);
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
      const food = pickFood(rng, dense, {
        meal, prevId: null, prevFood: null, day, weekUses, cap: null, strict: true,
        mealFoods: m.items.map((x) => x.food),
      });
      if (!food) continue;
      const snapshot = wMeals.map((x) => x.items.map((it) => it.grams));
      const b = bounds(food);
      const extra = { food, slot: 'extra', grams: roundGrams(b.typ, b.min, b.max) };
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
      shiftByTiers(all, targets.kcal - sumKcal(all), new Set(fatty));
    }
    // High targets: add a snack or bread when portion bounds are not enough (never fruit).
    for (const [meal, role] of EXTRA_SLOTS) {
      const all = wMeals.flatMap((m) => m.items);
      const delta = targets.kcal - sumKcal(all);
      if (delta <= targets.kcal * 0.03) break;
      const r = slotPool(kg, profile, [role], meal, cache);
      if (r.warning || !r.foods.length) continue;
      const m = wMeals.find((x) => x.type === meal);
      let extraPool = r.foods;
      if (role === 'base_principale') {
        const bread = extraPool.filter((f) => /bread|\bpane\b/i.test(`${f.name_en || ''} ${f.name_it || ''} ${f.subgroup || ''}`));
        if (bread.length) extraPool = bread;
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
    {
      // Energy has priority over fat: last unlocked pass if still outside +-4%.
      const all = wMeals.flatMap((m) => m.items);
      const rest = targets.kcal - sumKcal(all);
      if (Math.abs(rest) > targets.kcal * 0.04) shiftByTiers(all, rest, null);
    }
    const label = dayLabel(d, lang);
    outDays.push({
      index: d, label,
      meals: wMeals.map((m) => ({ type: m.type, target_kcal: Math.round(m.target), items: m.items.map((it) => toItem(it, lang)) })),
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
  plan.warnings = dedupe(warnings);
  return plan;
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
 * @returns {Object} new plan
 */
export function swapItem(plan, kg, dayIndex, mealIndex, itemIndex, profile) {
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

  let { foods: pool } = slotPool(kg, profile, [item.role], meal.type, null);
  if (item.role === 'condimento' && (meal.type === 'pranzo' || meal.type === 'cena')) {
    const fats = pool.filter(isFat);
    pool = fats.length ? fats : hardFiltered(kg, profile, ['condimento']).filter(isFat);
  }
  const inMeal = new Set(meal.items.map((x) => x.food_id));
  let history = (item.swap_history || []).concat(item.food_id);
  // Day rules: state of the day and of the meal without the item being replaced.
  const st = newDayState();
  day.meals.forEach((mm, mi) => mm.items.forEach((x, xi) => {
    const f = byId.get(x.food_id);
    if (f && !(mi === mealIndex && xi === itemIndex)) commitDay(f, st);
  }));
  const mealFoods = meal.items.filter((_, xi) => xi !== itemIndex).map((x) => byId.get(x.food_id)).filter(Boolean);
  const strictPool = pool.filter((f) => fitsDay(f, st, mealFoods));
  if (strictPool.length > 1 || (strictPool.length === 1 && strictPool[0].id !== item.food_id)) pool = strictPool;
  else pool = pool.filter((f) => fitsDay(f, st, mealFoods, true));
  const notUsed = (f) => !inMeal.has(f.id);
  let cands = pool.filter((f) => notUsed(f) && !history.includes(f.id));
  if (!cands.length) { history = [item.food_id]; cands = pool.filter((f) => notUsed(f) && f.id !== item.food_id); }

  // Protein quotas: keep red meat cap and required minimums.
  if (item.role === 'secondo' && cands.length) {
    const { min, max } = scaledRules(profile.diet, out.days.length);
    const counts = {};
    out.days.forEach((dd, di) => dd.meals.forEach((mm, mi) => mm.items.forEach((x, xi) => {
      if (x.role !== 'secondo' || (di === dayIndex && mi === mealIndex && xi === itemIndex)) return;
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
  const w = { food: next, slot: item.slot, grams: sizeFor(next, item.kcal), swap_history: history };
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

  finalize(out);
  const label = day.label;
  out.warnings = dedupe([...(out.warnings || []).filter((s) => !s.startsWith(`${label}: `)), ...dayWarnings(day, targets)]);
  return out;
}
