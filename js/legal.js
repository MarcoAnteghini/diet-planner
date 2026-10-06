// Legal texts for the diet planner web tool (Italian first, English second).
// Plain-language texts, not legal advice. See docs/LEGAL.md before changing them.
// Bump LEGAL_VERSION whenever a change affects what the user accepts
// (the consent gate asks again when the stored legal_version differs).

export const LEGAL_VERSION = "1.0.0";
export const LEGAL_UPDATED = "2026-10-06";
export const CONTACT_EMAIL = "[EMAIL DI CONTATTO]";

const CIQUAL_URL = "https://ciqual.anses.fr/";
const ETALAB_URL = "https://www.etalab.gouv.fr/licence-ouverte-open-licence/";
const ANTHROPIC_PRIVACY_URL = "https://www.anthropic.com/legal/privacy";
const OPENAI_PRIVACY_URL = "https://openai.com/policies/eu-privacy-policy";
const ED_MAP_URL = "https://www.disturbialimentarionline.it/";

const a = (href, text) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

const it = {
  banner_short:
    "I piani sono indicativi e non sostituiscono il parere di un medico o di un dietista.",

  consent_label:
    "Ho letto l'avviso e l'informativa privacy. Ho capito che il piano è solo indicativo, non è un consiglio medico e che devo controllare le etichette per gli allergeni.",

  consent_required_error:
    "Per generare un piano devi prima leggere l'avviso e spuntare la casella di accettazione.",

  disclaimer_html: `
<h2>Avviso importante</h2>
<p>Questo strumento genera piani alimentari settimanali <strong>indicativi</strong>, a scopo informativo ed educativo.</p>
<ul>
  <li><strong>Non è un consiglio medico.</strong> Non fa diagnosi, non cura e non tratta alcuna condizione di salute.</li>
  <li><strong>Non è un dispositivo medico</strong> e non è stato valutato come tale.</li>
  <li><strong>Non sostituisce</strong> un medico, un dietista, un biologo nutrizionista o un altro professionista sanitario. Prima di cambiare in modo importante la tua alimentazione, parlane con un professionista.</li>
</ul>
<h3>Quanto sono affidabili i numeri</h3>
<p>Il fabbisogno calorico è stimato con una formula valida in media sulla popolazione (Mifflin-St Jeor) e con un fattore di attività. Per una singola persona l'errore può essere ampio. I valori nutrizionali degli alimenti vengono da tabelle di composizione: il cibo reale cambia per varietà, stagione, marca e cottura. Considera calorie e grammi come un ordine di grandezza, non come valori esatti.</p>
<h3>Allergie e intolleranze</h3>
<p>Gli allergeni sono assegnati agli alimenti in modo <strong>automatico</strong> e possono essere sbagliati o incompleti. Il filtro allergeni riduce il rischio ma non lo elimina. <strong>Controlla sempre l'etichetta</strong> dei prodotti che compri. Se hai un'allergia grave non affidarti a questo strumento per escludere un allergene.</p>
<h3>Stato dei dati</h3>
<p>La classificazione degli alimenti (ruolo nel pasto, stagionalità, porzioni, dieta, allergeni) è stata prodotta in modo automatico ed è <strong>in attesa di revisione da parte di un professionista</strong>. Può contenere errori.</p>
<h3>Responsabilità</h3>
<p>Lo strumento è gratuito e fornito così com'è, senza garanzie. Nei limiti consentiti dalla legge applicabile, l'autore non risponde di danni derivanti dall'uso dei piani o delle informazioni mostrate. Restano salvi i diritti che la legge non permette di escludere.</p>
<h3>Fonti dei dati</h3>
<p>Composizione degli alimenti: Anses. 2020. Tabella di composizione nutrizionale degli alimenti Ciqual (${a(CIQUAL_URL, "ciqual.anses.fr")}), versione 2020, rilasciata con ${a(ETALAB_URL, "Licence Ouverte / Open Licence (Etalab)")}. I dati sono stati tradotti, selezionati e rielaborati dall'autore; ANSES non ha verificato né approvato questo strumento. Altre informazioni (porzioni, abbinamenti) provengono da un database interno YouMeals.</p>
`,

  not_suitable_html: `
<h2>Chi non dovrebbe usarlo senza un professionista</h2>
<p>Lo strumento è pensato per adulti sani tra 18 e 80 anni. <strong>Non usarlo senza la supervisione di un medico o di un dietista</strong> se:</p>
<ul>
  <li>hai meno di 18 anni;</li>
  <li>sei in gravidanza o allatti;</li>
  <li>hai o hai avuto un disturbo alimentare (anoressia, bulimia, binge eating o altri);</li>
  <li>hai il diabete o altri disturbi del metabolismo;</li>
  <li>hai malattie dei reni, del fegato o del cuore;</li>
  <li>hai allergie alimentari gravi;</li>
  <li>prendi farmaci che interagiscono con l'alimentazione (per esempio anticoagulanti, insulina, diuretici);</li>
  <li>sei un atleta agonista;</li>
  <li>il tuo indice di massa corporea (BMI) è sotto 18,5 o sopra 30;</li>
  <li>sei una persona anziana con fragilità, perdita di peso non voluta o poco appetito.</li>
</ul>
<p>Se il rapporto con il cibo o con il peso ti fa stare male, puoi chiamare il numero verde <strong>SOS Disturbi Alimentari 800 180 969</strong> (gratuito e anonimo, promosso dal Ministero della Salute). La mappa dei servizi di cura in Italia è su ${a(ED_MAP_URL, "disturbialimentarionline.it")}. In caso di emergenza chiama il 112.</p>
`,

  privacy_html: `
<h2>Informativa privacy</h2>
<p>Questa informativa spiega quali dati tratta lo strumento, ai sensi del Regolamento (UE) 2016/679 (GDPR).</p>
<h3>Chi è il titolare</h3>
<p>Marco Anteghini, ricercatore, persona fisica. Contatto: ${CONTACT_EMAIL}.</p>
<h3>Quali dati inserisci e dove finiscono</h3>
<p>Per calcolare il piano inserisci sesso, età, peso, altezza, livello di attività, obiettivo, tipo di dieta e allergie. Alcuni di questi dati (per esempio peso, allergie, scelte alimentari legate alla salute) possono essere <strong>dati relativi alla salute</strong>, che il GDPR protegge in modo speciale (art. 9).</p>
<p><strong>Tutti i calcoli avvengono nel tuo browser.</strong> Lo strumento non invia il tuo profilo a nessun server e non lo salva. L'autore non riceve, non vede e non conserva i tuoi dati. Quando chiudi o ricarichi la pagina, il profilo viene perso.</p>
<h3>Cosa resta salvato sul tuo dispositivo</h3>
<ul>
  <li>Nel <code>localStorage</code> del browser: solo un record dell'accettazione dell'avviso, con la versione dei testi e la data (<code>{legal_version, accepted_at}</code>). Serve a non chiederti di nuovo il consenso a ogni visita.</li>
  <li>Nel <code>sessionStorage</code>, solo se spunti la casella apposita: la tua chiave API, che viene cancellata alla chiusura della scheda.</li>
</ul>
<p>Puoi cancellare questi dati in qualsiasi momento dalle impostazioni del browser (dati dei siti). Non usiamo cookie, strumenti di analisi o pubblicità.</p>
<h3>Base giuridica</h3>
<p>L'autore non tratta i dati del profilo, perché restano sul tuo dispositivo. Il record dell'accettazione è salvato solo sul tuo dispositivo perché è necessario per far funzionare lo strumento come lo hai richiesto. Per i log del server di hosting la base è il legittimo interesse a tenere il sito sicuro e funzionante (art. 6, par. 1, lett. f).</p>
<h3>Hosting</h3>
<p>Il sito è statico ed è ospitato da un fornitore di hosting (GitHub Pages, servizio di GitHub Inc.). Come accade per quasi tutti i siti, il fornitore può registrare nei propri log tecnici dati come l'indirizzo IP, data e ora della richiesta e tipo di browser, per motivi di sicurezza e funzionamento. Questi log sono gestiti dal fornitore secondo la sua informativa; l'autore non li usa per identificarti.</p>
<h3>Funzione facoltativa di spiegazione con intelligenza artificiale</h3>
<p>Se scegli di inserire la tua chiave API di Anthropic o di OpenAI, il piano generato e le tue domande vengono inviati <strong>direttamente dal tuo browser</strong> al fornitore che hai scelto, sul tuo account e a tuo carico. Il piano può contenere informazioni da cui si ricavano dati sulla salute (calorie, allergie, dieta). Usando questa funzione scegli tu di condividerli con il fornitore, che li tratta come titolare autonomo secondo le proprie condizioni:</p>
<ul>
  <li>Anthropic: ${a(ANTHROPIC_PRIVACY_URL, "informativa privacy di Anthropic")}</li>
  <li>OpenAI: ${a(OPENAI_PRIVACY_URL, "informativa privacy di OpenAI per l'Europa")}</li>
</ul>
<p>L'autore non riceve né la tua chiave né i messaggi scambiati. Se non usi questa funzione, nessun dato lascia il tuo browser.</p>
<h3>I tuoi diritti</h3>
<p>Hai diritto di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità (articoli 15-22 GDPR). Dato che l'autore non conserva i tuoi dati, nella pratica li controlli tu dal browser. Per qualsiasi domanda scrivi a ${CONTACT_EMAIL}. Puoi anche presentare reclamo al ${a("https://www.garanteprivacy.it/", "Garante per la protezione dei dati personali")}.</p>
`,

  llm_notice_html: `
<p><strong>Come funziona la chiave API.</strong> La chiave resta nel tuo browser e viene inviata solo al fornitore che scegli (Anthropic o OpenAI), insieme al piano e alle tue domande. L'uso è sul tuo account e i costi sono a tuo carico. Non incollare la chiave su un computer condiviso. L'assistente spiega il piano ma non lo modifica, e può sbagliare: verifica le risposte importanti con un professionista.</p>
`,

  footer_html: `
<p>Piani indicativi, non consiglio medico. Dati sugli alimenti: Anses, Ciqual 2020 (${a(CIQUAL_URL, "ciqual.anses.fr")}), ${a(ETALAB_URL, "Licence Ouverte")}, rielaborati. <a href="legal.html">Avviso legale e privacy</a> · Testi v${LEGAL_VERSION}, aggiornati il ${LEGAL_UPDATED}.</p>
`,
};

const en = {
  banner_short:
    "Plans are indicative only and do not replace advice from a doctor or dietitian.",

  consent_label:
    "I have read the notice and the privacy information. I understand the plan is indicative only, is not medical advice, and that I must check food labels for allergens.",

  consent_required_error:
    "Before generating a plan, please read the notice and tick the acceptance box.",

  disclaimer_html: `
<h2>Important notice</h2>
<p>This tool generates <strong>indicative</strong> weekly meal plans for information and education only.</p>
<ul>
  <li><strong>It is not medical advice.</strong> It does not diagnose, cure or treat any health condition.</li>
  <li><strong>It is not a medical device</strong> and has not been assessed as one.</li>
  <li><strong>It does not replace</strong> a doctor, dietitian, nutritionist or other health professional. Talk to a professional before making major changes to what you eat.</li>
</ul>
<h3>How reliable the numbers are</h3>
<p>Energy needs are estimated with a formula that works on average across the population (Mifflin-St Jeor) and an activity factor. For one person the error can be large. Food values come from composition tables, while real food varies with variety, season, brand and cooking. Treat calories and grams as a rough guide, not exact figures.</p>
<h3>Allergies and intolerances</h3>
<p>Allergens are assigned to foods <strong>automatically</strong> and may be wrong or incomplete. The allergen filter lowers the risk but does not remove it. <strong>Always check the label</strong> of the products you buy. If you have a severe allergy, do not rely on this tool to exclude an allergen.</p>
<h3>Data status</h3>
<p>The food classification (meal role, season, portions, diet, allergens) was produced automatically and is <strong>awaiting review by a professional</strong>. It may contain errors.</p>
<h3>Liability</h3>
<p>The tool is free and provided as is, without warranties. To the extent permitted by applicable law, the author is not liable for any damage arising from the use of the plans or the information shown. Rights that the law does not allow to be excluded are not affected.</p>
<h3>Data sources</h3>
<p>Food composition: Anses. 2020. Ciqual French food composition table (${a(CIQUAL_URL, "ciqual.anses.fr")}), 2020 version, released under the ${a(ETALAB_URL, "Licence Ouverte / Open Licence (Etalab)")}. The data were translated, selected and reworked by the author; ANSES has not reviewed or endorsed this tool. Other information (portions, pairings) comes from an internal YouMeals database.</p>
`,

  not_suitable_html: `
<h2>Who should not use it without a professional</h2>
<p>The tool is meant for healthy adults aged 18 to 80. <strong>Do not use it without supervision from a doctor or dietitian</strong> if you:</p>
<ul>
  <li>are under 18;</li>
  <li>are pregnant or breastfeeding;</li>
  <li>have or have had an eating disorder (anorexia, bulimia, binge eating or others);</li>
  <li>have diabetes or another metabolic condition;</li>
  <li>have kidney, liver or heart disease;</li>
  <li>have severe food allergies;</li>
  <li>take medication that interacts with diet (for example anticoagulants, insulin, diuretics);</li>
  <li>are a competitive athlete;</li>
  <li>have a body mass index (BMI) below 18.5 or above 30;</li>
  <li>are an older adult with frailty, unwanted weight loss or poor appetite.</li>
</ul>
<p>If food or weight is causing you distress, in Italy you can call the free and anonymous helpline <strong>SOS Disturbi Alimentari 800 180 969</strong>, promoted by the Italian Ministry of Health. A map of care services in Italy is at ${a(ED_MAP_URL, "disturbialimentarionline.it")}. Elsewhere, contact your doctor or local health service. In an emergency call 112.</p>
`,

  privacy_html: `
<h2>Privacy information</h2>
<p>This notice explains what data the tool processes, under the EU General Data Protection Regulation 2016/679 (GDPR).</p>
<h3>Who is responsible</h3>
<p>Marco Anteghini, researcher, acting as an individual. Contact: ${CONTACT_EMAIL}.</p>
<h3>What you enter and where it goes</h3>
<p>To compute a plan you enter sex, age, weight, height, activity level, goal, diet type and allergies. Some of these (for example weight, allergies, health related food choices) can be <strong>data concerning health</strong>, which the GDPR treats as a special category (Art. 9).</p>
<p><strong>All calculations run in your browser.</strong> The tool does not send your profile to any server and does not save it. The author does not receive, see or keep your data. When you close or reload the page, the profile is gone.</p>
<h3>What stays on your device</h3>
<ul>
  <li>In the browser <code>localStorage</code>: only a record that you accepted the notice, with the text version and date (<code>{legal_version, accepted_at}</code>), so you are not asked again on every visit.</li>
  <li>In <code>sessionStorage</code>, only if you tick the box for it: your API key, which is deleted when you close the tab.</li>
</ul>
<p>You can delete these at any time from your browser settings (site data). There are no cookies, analytics or ads.</p>
<h3>Legal basis</h3>
<p>The author does not process your profile data, because it stays on your device. The acceptance record is kept only on your device because it is needed to run the tool as you requested. For the hosting server logs the basis is the legitimate interest in keeping the site secure and working (Art. 6(1)(f)).</p>
<h3>Hosting</h3>
<p>The site is static and served by a hosting provider (GitHub Pages, a service of GitHub Inc.). As with almost any website, the provider may record technical data such as IP address, time of the request and browser type in its logs, for security and operation. These logs are handled by the provider under its own privacy policy; the author does not use them to identify you.</p>
<h3>Optional AI explanation feature</h3>
<p>If you choose to enter your own Anthropic or OpenAI API key, the generated plan and your questions are sent <strong>directly from your browser</strong> to the provider you picked, under your account and at your cost. The plan can reveal health related information (calories, allergies, diet). By using this feature you choose to share it with that provider, which handles it as an independent controller under its own terms:</p>
<ul>
  <li>Anthropic: ${a(ANTHROPIC_PRIVACY_URL, "Anthropic privacy policy")}</li>
  <li>OpenAI: ${a(OPENAI_PRIVACY_URL, "OpenAI Europe privacy policy")}</li>
</ul>
<p>The author receives neither your key nor the messages. If you do not use this feature, no data leaves your browser.</p>
<h3>Your rights</h3>
<p>You have the rights of access, rectification, erasure, restriction, objection and portability (GDPR Articles 15 to 22). Since the author keeps no data about you, in practice you control it from your browser. For any question write to ${CONTACT_EMAIL}. You can also lodge a complaint with your data protection authority; in Italy this is the ${a("https://www.garanteprivacy.it/", "Garante per la protezione dei dati personali")}.</p>
`,

  llm_notice_html: `
<p><strong>About your API key.</strong> The key stays in your browser and is sent only to the provider you choose (Anthropic or OpenAI), together with the plan and your questions. Usage runs on your account and costs are yours. Do not paste your key on a shared computer. The assistant explains the plan but cannot change it, and it can be wrong: check important answers with a professional.</p>
`,

  footer_html: `
<p>Indicative plans, not medical advice. Food data: Anses, Ciqual 2020 (${a(CIQUAL_URL, "ciqual.anses.fr")}), ${a(ETALAB_URL, "Licence Ouverte")}, reworked. <a href="legal.html">Legal notice and privacy</a> · Texts v${LEGAL_VERSION}, last updated ${LEGAL_UPDATED}.</p>
`,
};

export const LEGAL = { it, en };
export default LEGAL;
