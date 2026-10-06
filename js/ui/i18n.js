// UI strings. Legal text lives in legal.js; these are only interface labels.

const STRINGS = {
  it: {
    app_title: 'Piano alimentare settimanale',
    app_subtitle: 'Uno strumento sperimentale che compone menu equilibrati da una base di dati sugli alimenti. Funziona interamente nel tuo browser.',
    lang_toggle: 'English',
    lang_toggle_label: 'Switch to English',
    skip: 'Vai al contenuto',

    consent_title: 'Prima di iniziare',
    consent_continue: 'Continua',
    consent_who_not: 'Chi non dovrebbe usare questo strumento',

    loading_data: 'Caricamento della base dati sugli alimenti...',
    data_error: 'Impossibile caricare la base dati sugli alimenti. Ricarica la pagina o riprova più tardi.',
    data_sample_notice: 'Sto usando un piccolo campione di alimenti (foods.sample.json) perché la base dati completa non è disponibile. I piani saranno poco vari.',
    data_info: (n, v) => `${n} alimenti, versione dati ${v}`,

    profile_title: 'Il tuo profilo',
    sex: 'Sesso',
    sex_m: 'Uomo',
    sex_f: 'Donna',
    age: 'Età (anni)',
    weight: 'Peso (kg)',
    height: 'Altezza (cm)',
    activity: 'Livello di attività',
    activity_opts: {
      sedentario: 'Sedentario',
      leggero: 'Leggero (1-2 allenamenti a settimana)',
      moderato: 'Moderato (3-4 a settimana)',
      attivo: 'Attivo (5-6 a settimana)',
      molto_attivo: 'Molto attivo (lavoro fisico o sport intenso)',
    },
    goal: 'Obiettivo',
    goal_opts: { dimagrire: 'Perdere peso', mantenimento: 'Mantenere il peso', massa: 'Aumentare la massa' },
    season: 'Stagione',
    season_opts: { inverno: 'Inverno', primavera: 'Primavera', estate: 'Estate', autunno: 'Autunno' },
    diet: 'Tipo di alimentazione',
    diet_opts: { onnivoro: 'Onnivora', vegetariano: 'Vegetariana', vegano: 'Vegana' },
    allergens: 'Allergeni da escludere',
    allergen_names: {
      glutine: 'Glutine', crostacei: 'Crostacei', uova: 'Uova', pesce: 'Pesce', arachidi: 'Arachidi',
      soia: 'Soia', latte: 'Latte', frutta_a_guscio: 'Frutta a guscio', sedano: 'Sedano', senape: 'Senape',
      sesamo: 'Sesamo', solfiti: 'Solfiti', lupini: 'Lupini', molluschi: 'Molluschi',
    },
    days: 'Numero di giorni',
    seed: 'Variante (numero)',
    seed_hint: 'Lo stesso numero con lo stesso profilo produce sempre lo stesso piano.',
    new_variant: 'Nuova variante',
    generate: 'Genera il piano',
    privacy_note: 'I dati del profilo restano in questa pagina: non vengono salvati né inviati a nessun server.',
    errors_title: 'Controlla questi campi:',

    plan_title: 'Il tuo piano',
    targets_title: 'Obiettivi giornalieri',
    kcal: 'Energia',
    protein: 'Proteine',
    carbs: 'Carboidrati',
    fat: 'Grassi',
    tab_plan: 'Menu',
    tab_shopping: 'Lista della spesa',
    days_label: 'Giorni del piano',
    meal_names: { colazione: 'Colazione', spuntino: 'Spuntino', pranzo: 'Pranzo', cena: 'Cena' },
    food: 'Alimento',
    qty: 'Quantità',
    meal_total: 'Totale pasto',
    day_total: 'Totale giorno',
    target: 'obiettivo',
    swap: 'Cambia',
    swap_label: (name) => `Sostituisci ${name}`,
    swapped: (oldName, newName) => `${oldName} sostituito con ${newName}`,
    swap_none: 'Nessuna alternativa disponibile per questo alimento.',
    macro_bar: 'Ripartizione dell\'energia tra i macronutrienti',
    warnings: 'Avvisi',
    shopping_total: (d) => `Quantità totali per ${d} ${d === 1 ? 'giorno' : 'giorni'}.`,
    print: 'Stampa',
    download_json: 'Scarica JSON',
    plan_generated: (d) => `Piano generato per ${d} ${d === 1 ? 'giorno' : 'giorni'}.`,
    engine_error: 'Non è stato possibile generare il piano:',
    meta_line: (m) => `Variante ${m.seed}, stagione ${m.season}, motore ${m.engine_version}, dati ${m.kg_version}`,

    chat_title: 'Chiarimenti (facoltativo)',
    chat_intro: 'Puoi fare domande sul piano a un modello linguistico usando una tua chiave API. Le risposte spiegano soltanto: il piano non viene mai modificato.',
    provider: 'Fornitore',
    model: 'Modello',
    api_key: 'Chiave API',
    remember_session: 'Ricorda per questa sessione',
    remember_hint: 'Se attivo, la chiave resta nel browser finché non chiudi la scheda.',
    test_key: 'Verifica chiave',
    key_testing: 'Verifica in corso...',
    key_ok: 'Chiave valida.',
    key_bad: 'Chiave non valida:',
    key_missing: 'Inserisci una chiave API.',
    question: 'La tua domanda',
    question_ph: 'Per esempio: perché a cena c\'è il pesce? Con cosa posso sostituire lo yogurt?',
    ask: 'Chiedi',
    cancel: 'Annulla',
    clear_chat: 'Cancella conversazione',
    asking: 'In attesa della risposta...',
    cancelled: 'Richiesta annullata.',
    need_plan: 'Genera prima un piano.',
    you: 'Tu',
    assistant: 'Assistente',
    llm_error: 'Errore:',
    llm_unavailable: 'Il modulo per i chiarimenti non è disponibile.',
    usage: (u) => `Token: ${u.input_tokens ?? u.prompt_tokens ?? '?'} in, ${u.output_tokens ?? u.completion_tokens ?? '?'} out`,
    legal_link: 'Note legali e privacy',
    truncated: 'Risposta interrotta per lunghezza.',
    approx_g: (g) => `circa ${g} g`,
    raw_tag: 'crudo',
    raw_weight: 'peso a crudo',
    basis_note: 'Le quantità si riferiscono al peso a crudo e, per la frutta, al frutto intero.',
    shopping_gross: 'Pesi lordi, come si acquistano.',
    ranges_title: 'Intervalli di riferimento usati (LARN):',
    limits_title: 'Riferimenti LARN giornalieri:',
    fiber_min: (g) => `fibra almeno ${g} g`,
    sugars_max: (g) => `zuccheri al massimo ${g} g`,
    sfa_max: (g) => `grassi saturi al massimo ${g} g`,
    method: 'Calcolo del fabbisogno',
    sources_line: 'Porzioni e fabbisogni secondo LARN 2014 (SINU) e Linee guida CREA 2018.',
    recipe_tag: 'ricetta',
    difficulty: (d) => ({ 1: 'facile', 2: 'media difficoltà', 3: 'impegnativa' }[d] || `difficoltà ${d}`),
    show_ingredients: 'mostra ingredienti e preparazione',
    ingredients_of: (n) => `Ingredienti di ${n}`,
    preparation: 'Preparazione',
    use_recipes: 'Proponi ricette per pranzo e cena',
    use_recipes_hint: 'Se disattivato, pranzo e cena sono composti da singoli alimenti.',
    get_key: (name) => `Dove ottenere una chiave ${name} (si apre in una nuova scheda)`,
  },
  en: {
    app_title: 'Weekly meal plan',
    app_subtitle: 'An experimental tool that builds balanced menus from a food database. It runs entirely in your browser.',
    lang_toggle: 'Italiano',
    lang_toggle_label: 'Passa all\'italiano',
    skip: 'Skip to content',

    consent_title: 'Before you start',
    consent_continue: 'Continue',
    consent_who_not: 'Who should not use this tool',

    loading_data: 'Loading the food database...',
    data_error: 'Could not load the food database. Reload the page or try again later.',
    data_sample_notice: 'Using a small food sample (foods.sample.json) because the full database is not available. Plans will have little variety.',
    data_info: (n, v) => `${n} foods, data version ${v}`,

    profile_title: 'Your profile',
    sex: 'Sex',
    sex_m: 'Male',
    sex_f: 'Female',
    age: 'Age (years)',
    weight: 'Weight (kg)',
    height: 'Height (cm)',
    activity: 'Activity level',
    activity_opts: {
      sedentario: 'Sedentary',
      leggero: 'Light (1-2 workouts a week)',
      moderato: 'Moderate (3-4 a week)',
      attivo: 'Active (5-6 a week)',
      molto_attivo: 'Very active (physical job or intense sport)',
    },
    goal: 'Goal',
    goal_opts: { dimagrire: 'Lose weight', mantenimento: 'Maintain weight', massa: 'Gain mass' },
    season: 'Season',
    season_opts: { inverno: 'Winter', primavera: 'Spring', estate: 'Summer', autunno: 'Autumn' },
    diet: 'Diet',
    diet_opts: { onnivoro: 'Omnivore', vegetariano: 'Vegetarian', vegano: 'Vegan' },
    allergens: 'Allergens to exclude',
    allergen_names: {
      glutine: 'Gluten', crostacei: 'Crustaceans', uova: 'Eggs', pesce: 'Fish', arachidi: 'Peanuts',
      soia: 'Soy', latte: 'Milk', frutta_a_guscio: 'Tree nuts', sedano: 'Celery', senape: 'Mustard',
      sesamo: 'Sesame', solfiti: 'Sulphites', lupini: 'Lupin', molluschi: 'Molluscs',
    },
    days: 'Number of days',
    seed: 'Variant (number)',
    seed_hint: 'The same number with the same profile always gives the same plan.',
    new_variant: 'New variant',
    generate: 'Generate plan',
    privacy_note: 'Profile data stays in this page: it is never saved or sent to any server.',
    errors_title: 'Please check these fields:',

    plan_title: 'Your plan',
    targets_title: 'Daily targets',
    kcal: 'Energy',
    protein: 'Protein',
    carbs: 'Carbohydrates',
    fat: 'Fat',
    tab_plan: 'Menu',
    tab_shopping: 'Shopping list',
    days_label: 'Plan days',
    meal_names: { colazione: 'Breakfast', spuntino: 'Snack', pranzo: 'Lunch', cena: 'Dinner' },
    food: 'Food',
    qty: 'Amount',
    meal_total: 'Meal total',
    day_total: 'Day total',
    target: 'target',
    swap: 'Swap',
    swap_label: (name) => `Replace ${name}`,
    swapped: (oldName, newName) => `${oldName} replaced with ${newName}`,
    swap_none: 'No alternative available for this food.',
    macro_bar: 'Energy split across macronutrients',
    warnings: 'Warnings',
    shopping_total: (d) => `Total amounts for ${d} ${d === 1 ? 'day' : 'days'}.`,
    print: 'Print',
    download_json: 'Download JSON',
    plan_generated: (d) => `Plan generated for ${d} ${d === 1 ? 'day' : 'days'}.`,
    engine_error: 'The plan could not be generated:',
    meta_line: (m) => `Variant ${m.seed}, season ${m.season}, engine ${m.engine_version}, data ${m.kg_version}`,

    chat_title: 'Questions (optional)',
    chat_intro: 'You can ask a language model about the plan using your own API key. Answers only explain: the plan is never changed.',
    provider: 'Provider',
    model: 'Model',
    api_key: 'API key',
    remember_session: 'Remember for this session',
    remember_hint: 'When on, the key stays in the browser until you close the tab.',
    test_key: 'Check key',
    key_testing: 'Checking...',
    key_ok: 'Key is valid.',
    key_bad: 'Key not valid:',
    key_missing: 'Enter an API key.',
    question: 'Your question',
    question_ph: 'For example: why is there fish at dinner? What can I use instead of yogurt?',
    ask: 'Ask',
    cancel: 'Cancel',
    clear_chat: 'Clear conversation',
    asking: 'Waiting for the answer...',
    cancelled: 'Request cancelled.',
    need_plan: 'Generate a plan first.',
    you: 'You',
    assistant: 'Assistant',
    llm_error: 'Error:',
    llm_unavailable: 'The questions module is not available.',
    usage: (u) => `Tokens: ${u.input_tokens ?? u.prompt_tokens ?? '?'} in, ${u.output_tokens ?? u.completion_tokens ?? '?'} out`,
    legal_link: 'Legal notes and privacy',
    truncated: 'Answer cut short for length.',
    approx_g: (g) => `about ${g} g`,
    raw_tag: 'raw',
    raw_weight: 'raw weight',
    basis_note: 'Amounts refer to raw weight and, for fruit, to the whole fruit.',
    shopping_gross: 'Gross weights, as bought.',
    ranges_title: 'Reference ranges used (LARN):',
    limits_title: 'Daily LARN references:',
    fiber_min: (g) => `fibre at least ${g} g`,
    sugars_max: (g) => `sugars at most ${g} g`,
    sfa_max: (g) => `saturated fat at most ${g} g`,
    method: 'Energy requirement method',
    sources_line: 'Portions and requirements follow LARN 2014 (SINU) and the CREA 2018 dietary guidelines.',
    recipe_tag: 'recipe',
    difficulty: (d) => ({ 1: 'easy', 2: 'medium', 3: 'harder' }[d] || `difficulty ${d}`),
    show_ingredients: 'show ingredients and preparation',
    ingredients_of: (n) => `Ingredients of ${n}`,
    preparation: 'Preparation',
    use_recipes: 'Suggest recipes for lunch and dinner',
    use_recipes_hint: 'When off, lunch and dinner are made of single foods.',
    get_key: (name) => `Where to get a ${name} key (opens in a new tab)`,
  },
};

export function strings(lang) {
  return STRINGS[lang] || STRINGS.it;
}

export function seasonFromDate(date = new Date()) {
  const m = date.getMonth(); // 0 = January
  if (m === 11 || m <= 1) return 'inverno';
  if (m <= 4) return 'primavera';
  if (m <= 7) return 'estate';
  return 'autunno';
}

// Plural of a unit label ("mela" -> "mele", "fetta biscottata" -> "fette biscottate").
// The data only carries the singular; this covers the regular cases.
const IT_IRREGULAR = { uovo: 'uova', paio: 'paia', yogurt: 'yogurt', kiwi: 'kiwi' };
function pluralIt(word) {
  const w = word.toLowerCase();
  if (IT_IRREGULAR[w]) return IT_IRREGULAR[w];
  if (/(ca|ga)$/.test(w)) return `${word.slice(0, -1)}he`;
  if (/(co|go)$/.test(w) && w.length > 4) return `${word.slice(0, -1)}hi`;
  if (/[^aeiou](cia|gia)$/.test(w)) return `${word.slice(0, -2)}e`; // arancia -> arance
  if (/(cia|gia)$/.test(w)) return `${word.slice(0, -1)}e`; // ciliegia -> ciliegie
  if (/io$/.test(w)) return `${word.slice(0, -1)}`;
  if (/a$/.test(w)) return `${word.slice(0, -1)}e`;
  if (/[oe]$/.test(w)) return `${word.slice(0, -1)}i`;
  return word; // consonant, accented or -i endings stay the same
}
function pluralEn(word) {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
export function unitLabel(label, count, lang) {
  if (!label || !(count > 1)) return label || '';
  if (lang === 'en') {
    const parts = label.split(' ');
    parts[parts.length - 1] = pluralEn(parts[parts.length - 1]);
    return parts.join(' ');
  }
  return label.split(' ').map((w) => (/^(di|da|al|con|in|e)$/i.test(w) ? w : pluralIt(w))).join(' ');
}
