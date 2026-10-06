// Small DOM helpers. Text is always set with textContent unless the caller
// explicitly passes trusted HTML (only our own legal.js strings).

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'trustedHtml') {
      node.innerHTML = value; // only for strings coming from legal.js
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let uid = 0;
export function nextId(prefix = 'id') {
  uid += 1;
  return `${prefix}-${uid}`;
}

export function fmt(n, digits = 0, lang = 'it') {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString(lang === 'en' ? 'en-GB' : 'it-IT', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

// Safe rendering of model output: a tiny markdown subset built with DOM nodes.
// Supports paragraphs, "-"/"*"/"1." lists, "#" headings and **bold**.
// Nothing from the model is ever passed to innerHTML.
export function renderSafeText(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let list = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      frag.append(h('p', {}, inline(para.join(' '))));
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      frag.append(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tagName.toLowerCase() !== tag) {
        flushList();
        list = h(tag);
      }
      list.append(h('li', {}, inline((bullet || numbered)[1])));
    } else if (heading) {
      flushPara();
      flushList();
      frag.append(h('p', { class: 'chat-heading' }, h('strong', {}, heading[1])));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return frag;
}

function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p !== '')
    .map((p) => (/^\*\*[^*]+\*\*$/.test(p) ? h('strong', {}, p.slice(2, -2)) : document.createTextNode(p)));
}

export function safeStorage(kind) {
  try {
    const store = kind === 'session' ? window.sessionStorage : window.localStorage;
    const probe = '__diet_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return {
      get(key) {
        try {
          const v = store.getItem(key);
          return v === null ? null : JSON.parse(v);
        } catch {
          return null;
        }
      },
      set(key, value) {
        try {
          store.setItem(key, JSON.stringify(value));
          return true;
        } catch {
          return false;
        }
      },
      remove(key) {
        try {
          store.removeItem(key);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return { get: () => null, set: () => false, remove: () => {} };
  }
}

export function announce(region, message) {
  if (!region) return;
  region.textContent = '';
  // Next frame so screen readers pick up the change.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}
