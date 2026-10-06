// Consent gate. Only {legal_version, accepted_at} is remembered in localStorage.
import { h, safeStorage, nextId } from './dom.js';

const KEY = 'diet.consent';

export function hasConsent(legalVersion) {
  const saved = safeStorage('local').get(KEY);
  return !!(saved && saved.legal_version === legalVersion && saved.accepted_at);
}

export function saveConsent(legalVersion) {
  safeStorage('local').set(KEY, { legal_version: legalVersion, accepted_at: new Date().toISOString() });
}

export function renderConsent({ legal, legalVersion, t, onAccept }) {
  const boxId = nextId('consent');
  const errId = nextId('consent-err');
  const error = h('p', { id: errId, class: 'field-error', role: 'alert', hidden: true }, legal.consent_required_error || '');
  const checkbox = h('input', { type: 'checkbox', id: boxId, 'aria-describedby': errId });
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) error.hidden = true;
  });

  const form = h(
    'form',
    { class: 'card consent', 'aria-labelledby': `${boxId}-title`, novalidate: true },
    h('h2', { id: `${boxId}-title`, tabindex: '-1' }, t.consent_title),
    h('div', { class: 'legal-text', trustedHtml: legal.disclaimer_html || '' }),
    h(
      'div',
      { class: 'callout callout-warn' },
      h('h3', {}, t.consent_who_not),
      h('div', { class: 'legal-text', trustedHtml: legal.not_suitable_html || '' }),
    ),
    h('div', { class: 'check-row consent-check' }, checkbox, h('label', { for: boxId }, legal.consent_label || '')),
    error,
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, t.consent_continue)),
  );

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!checkbox.checked) {
      error.hidden = false;
      checkbox.setAttribute('aria-invalid', 'true');
      checkbox.focus();
      return;
    }
    saveConsent(legalVersion);
    onAccept();
  });
  return form;
}
