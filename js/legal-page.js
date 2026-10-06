import { LEGAL, LEGAL_VERSION, LEGAL_UPDATED } from "./legal.js";

  const UI = {
    it: {
      title: "Avviso legale e privacy",
      back: "← Torna allo strumento",
      meta: `Versione dei testi ${LEGAL_VERSION}, ultimo aggiornamento ${LEGAL_UPDATED}.`,
      toc: "Indice",
      sections: { disclaimer: "Avviso", not_suitable: "Chi non dovrebbe usarlo", privacy: "Privacy", llm: "Chiave API e AI" },
      llm_title: "Chiave API e assistente AI",
    },
    en: {
      title: "Legal notice and privacy",
      back: "← Back to the tool",
      meta: `Text version ${LEGAL_VERSION}, last updated ${LEGAL_UPDATED}.`,
      toc: "Contents",
      sections: { disclaimer: "Notice", not_suitable: "Who should not use it", privacy: "Privacy", llm: "API key and AI" },
      llm_title: "API key and AI assistant",
    },
  };

  const $ = (id) => document.getElementById(id);

  function render(lang) {
    const t = LEGAL[lang], u = UI[lang];
    document.documentElement.lang = lang;
    document.title = u.title;
    $("title").textContent = u.title;
    $("back").textContent = u.back;
    $("meta").textContent = u.meta;
    $("toc").setAttribute("aria-label", u.toc);
    $("toc").innerHTML = "<ul>" + Object.entries(u.sections)
      .map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("") + "</ul>";
    $("content").innerHTML =
      `<section class="warn"><p><strong>${t.banner_short}</strong></p></section>` +
      `<section id="disclaimer">${t.disclaimer_html}</section>` +
      `<section id="not_suitable" class="warn">${t.not_suitable_html}</section>` +
      `<section id="privacy">${t.privacy_html}</section>` +
      `<section id="llm"><h2>${u.llm_title}</h2>${t.llm_notice_html}</section>`;
    $("footer").innerHTML = t.footer_html;
    document.querySelectorAll(".lang button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    history.replaceState(null, "", `?lang=${lang}${location.hash}`);
  }

  let initial = "it";
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "it" || q === "en") initial = q;
  document.querySelectorAll(".lang button").forEach((b) =>
    b.addEventListener("click", () => render(b.dataset.lang)));
  render(initial);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
