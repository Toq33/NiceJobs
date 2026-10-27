/**
 * NiceJobs - Hospitality Careers, Connected
 * Master Frontend Controller & Router (Phase 2)
 * Palette: Main Theme Blue | Sub Themes: Orange & White
 */

// Permanently eradicate demo persona bar from DOM under all conditions
function purgeDemoBarPermanently() {
  if (typeof document === 'undefined') return;
  const elements = document.querySelectorAll('.demo-bar, .role-switcher, .demo-bar-left, .demo-bar-right, #btn-toggle-demo-data, #role-status-text, [aria-label*="Demo Persona Switcher"]');
  elements.forEach(el => el.remove());
}
purgeDemoBarPermanently();
document.addEventListener('DOMContentLoaded', purgeDemoBarPermanently);

// ==========================================================================
// High-concurrency In-flight Request Deduplication
// Transparently deduplicates identical in-flight GET requests to eliminate redundant HTTP round-trips
// ==========================================================================
const _inflightGetRequests = new Map();
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(url, options) {
    const method = (options && options.method ? options.method.toUpperCase() : 'GET');
    if (method === 'GET' && typeof url === 'string') {
      if (_inflightGetRequests.has(url)) {
        return _inflightGetRequests.get(url).then(res => res.clone());
      }
      const promise = originalFetch(url, options)
        .finally(() => {
          _inflightGetRequests.delete(url);
        });
      _inflightGetRequests.set(url, promise);
      return promise.then(res => res.clone());
    }
    return originalFetch(url, options);
  };
}
// ==========================================================================
// Strict Autofill Policy Enforcer
// Policy: Do NOT suggest autofill in any text box except emails, cell, and login email/pass
// ==========================================================================

function isAutofillAllowedInput(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') return false;

  const type = (el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();

  // Non-textual types that do not have text suggestions
  if (['hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'reset', 'range', 'color', 'image'].includes(type)) {
    return false;
  }

  // 1. Password / Login pass (ALLOWED)
  if (type === 'password') return true;

  // 2. Emails (ALLOWED)
  if (type === 'email') return true;

  const id = (el.id || '').toLowerCase();
  const name = (el.name || '').toLowerCase();
  const cls = (el.className || '').toLowerCase();
  const placeholder = (el.placeholder || '').toLowerCase();
  const auto = (el.getAttribute('autocomplete') || '').toLowerCase();

  // Explicit email fields (e.g. cand-email, login-email, biz-email)
  if (id.includes('email') || name.includes('email') || cls.includes('email') || auto.includes('email') || placeholder.includes('email')) {
    return true;
  }

  // 3. Cell / Phone numbers (ALLOWED)
  if (type === 'tel') return true;
  if (id.includes('phone') || id.includes('cell') || id.includes('mobile') ||
      name.includes('phone') || name.includes('cell') || name.includes('mobile') ||
      cls.includes('phone') || cls.includes('cell') || cls.includes('mobile') ||
      placeholder.includes('phone') || placeholder.includes('cell') || placeholder.includes('mobile') ||
      auto.includes('tel')) {
    return true;
  }

  // 4. Login email / password / username credentials (ALLOWED)
  if (id.includes('login-identifier') || id.includes('login-user') ||
      (id.includes('login') && (id.includes('user') || id.includes('pass') || id.includes('pwd') || id.includes('ident'))) ||
      auto === 'username' || auto === 'current-password' || auto === 'new-password') {
    return true;
  }

  return false;
}

function enforceAutofillPolicy(root = document) {
  if (typeof document === 'undefined') return;
  try {
    const scope = (root && root.querySelectorAll) ? root : document;
    const elements = scope.querySelectorAll('input, textarea');
    elements.forEach(el => {
      const type = (el.getAttribute('type') || (el.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text')).toLowerCase();
      if (['hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'reset'].includes(type)) return;

      if (!isAutofillAllowedInput(el)) {
        // Strictly disable autofill suggestions on all non-whitelisted text boxes
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('spellcheck', 'false');
        el.setAttribute('aria-autocomplete', 'none');
        el.setAttribute('data-lpignore', 'true');
        el.setAttribute('data-1p-ignore', 'true');
        el.setAttribute('data-form-type', 'other');
      } else {
        // Whitelisted (emails, cell, login email/pass)
        if (type === 'email' && (!el.getAttribute('autocomplete') || el.getAttribute('autocomplete') === 'off')) {
          el.setAttribute('autocomplete', 'email');
        } else if (type === 'tel' && (!el.getAttribute('autocomplete') || el.getAttribute('autocomplete') === 'off')) {
          el.setAttribute('autocomplete', 'tel');
        }
      }
    });

    // Also ensure forms containing non-whitelisted text fields have autocomplete="off" by default
    const forms = scope.querySelectorAll('form');
    forms.forEach(form => {
      const isPureLoginForm = form.id && (form.id.includes('login') || form.id.includes('auth-step'));
      if (!isPureLoginForm && !form.getAttribute('autocomplete')) {
        form.setAttribute('autocomplete', 'off');
      }
    });
  } catch (err) {}
}

// 1. Immediate execution
if (typeof document !== 'undefined') {
  enforceAutofillPolicy(document);

  // 2. Lifecycle triggers
  document.addEventListener('DOMContentLoaded', () => enforceAutofillPolicy(document));
  window.addEventListener('load', () => enforceAutofillPolicy(document));

  // 3. Capturing focusin listener (intercepts clicks/tabs before browser suggestion menu opens)
  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (!isAutofillAllowedInput(target)) {
        target.setAttribute('autocomplete', 'off');
        target.setAttribute('autocorrect', 'off');
        target.setAttribute('autocapitalize', 'off');
        target.setAttribute('spellcheck', 'false');
        target.setAttribute('aria-autocomplete', 'none');
        target.setAttribute('data-lpignore', 'true');
        target.setAttribute('data-1p-ignore', 'true');
        target.setAttribute('data-form-type', 'other');
      }
    }
  }, true);

  // 4. MutationObserver for dynamic modals, screens, tabs, and step transitions
  if (typeof MutationObserver !== 'undefined') {
    const autofillObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Node.ELEMENT_NODE
              enforceAutofillPolicy(node);
            }
          });
        }
      }
    });
    if (document.documentElement) {
      autofillObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
}
window.enforceAutofillPolicy = enforceAutofillPolicy;
window.isAutofillAllowedInput = isAutofillAllowedInput;

// ==========================================================================
// Modern Clean Vector SVG Icon System (No Childish Emojis)
// ==========================================================================
function svgIcon(name, customClass = '', size = 16) {
  const cls = customClass ? `class="${customClass}" ` : '';
  const s = size;
  const icons = {
    hotel: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3"/></svg>`,
    candidate: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    user: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    users: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    admin: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    shield: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    shieldCheck: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
    guest: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    globe: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    search: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    mapPin: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    briefcase: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    bell: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    clock: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    calendar: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    dollar: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    star: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    starFilled: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    share: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
    fileText: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    eye: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    phone: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    smartphone: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
    mail: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    lock: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    key: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5L11 9l-1.5-1.5L8 9 2 15v7h7l6-6-1.5-1.5 1.5-1.5 1.5 1.5 3.5-3.5a5.5 5.5 0 1 0-7.78-7.78z"/></svg>`,
    check: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    checkCircle: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    x: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    paperclip: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    messageCircle: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
    whatsapp: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="m8.5 9.5 1 2 2 1"/></svg>`,
    clipboard: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    alertCircle: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    trash: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    edit: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    sparkles: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
    zap: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    home: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    utensils: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v20M2 2v8a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4V2M6 2v14M6 16v6M18 2a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3z"/></svg>`,
    award: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
    download: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    refresh: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    sliders: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    trendingUp: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    bookOpen: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    bookmark: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    camera: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    mic: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    play: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    pause: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    send: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    arrowLeft: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    arrowRight: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    chevronLeft: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevronRight: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    chevronDown: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    chevronUp: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
    image: `<svg ${cls}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
  };
  return icons[name] || '';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Open';
  if (typeof dateStr !== 'string') return String(dateStr);
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const y = match[1];
    const m = months[parseInt(match[2], 10) - 1] || match[2];
    const d = parseInt(match[3], 10);
    return `${d} ${m} ${y}`;
  }
  return dateStr;
}

function formatStatusLabel(status) {
  if (!status) return '';
  const map = {
    'under_review': 'Under Review',
    'shortlisted': 'Shortlisted',
    'interview_scheduled': 'Interview Scheduled',
    'rejected': 'Rejected',
    'hired': 'Hired',
    'active': 'Active',
    'closed': 'Closed',
    'pending': 'Pending'
  };
  if (map[status]) return map[status];
  return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const DEFAULT_AVATAR_PREVIEW = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'><rect width='100' height='100' fill='%23ffffff'/><circle cx='50' cy='36' r='16' fill='%23000000'/><path d='M22 84 C22 66, 35 60, 50 60 C65 60, 78 66, 78 84 Z' fill='%23000000'/></svg>";
const DEFAULT_HOTEL_LOGO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'><rect width='100' height='100' rx='16' fill='%23ffffff'/><path d='M28 80 V22 H72 V80 H28 Z M38 32 H46 V40 H38 V32 Z M38 46 H46 V54 H38 V46 Z M38 60 H46 V68 H38 V60 Z M54 32 H62 V40 H54 V32 Z M54 46 H62 V54 H54 V46 Z M54 60 H62 V68 H54 V60 Z' fill='%23000000'/></svg>";

// Application State Store
const state = {
  currentRole: 'guest', // 'jobseeker', 'recruiter', 'admin', 'guest'
  demoDataHidden: true,
  currentUser: null,
  currentScreen: 'home',
  activeJobId: null,
  activeHotelId: null,
  activeAppId: null,
  activeBlogId: null,
  activeConvId: null,
  inboxMobileView: 'threads', // 'threads' or 'chat' on mobile
  
  // Search & Filter State
  search: {
    query: '',
    location: '',
    department: '',
    designation: '',
    accommodation: false,
    duty_meals: false,
    urgent_only: false
  },

  // Cached Data
  jobs: [],
  businesses: [],
  applications: [],
  notifications: [],
  conversations: [],
  savedJobs: [],
  blogs: [],
  profile: null
};
window.state = state;

// ==========================================================================
// Hospitality Schemas & Constant Catalogs
// ==========================================================================

const HOTEL_ALL_DEPARTMENTS = [
  "Front Office & Guest Services",
  "Housekeeping & Laundry",
  "Food & Beverage Service",
  "Culinary / Kitchen & Bakery",
  "Events, Banquets & Catering",
  "Sales, Marketing & PR",
  "Engineering & Maintenance",
  "Finance, Accounts & Purchasing",
  "Human Resources & Training",
  "Security, Safety & Loss Prevention",
  "Spa, Wellness & Fitness",
  "Recreation, Water Sports & Eco-Tours",
  "Concierge, Butler & VIP Services",
  "Revenue Management & Reservations",
  "Information Technology (IT & Telecom)",
  "Executive Office / General Management"
];

const SEARCH_LOCATIONS = [
  { value: '', label: 'All Locations', shortLabel: 'All Locations' },
  { value: 'Dhaka', label: 'Dhaka', shortLabel: 'Dhaka' },
  { value: 'Chattogram', label: 'Chattogram', shortLabel: 'Chattogram' },
  { value: "Cox's Bazar", label: "Cox's Bazar", shortLabel: "Cox's Bazar" },
  { value: 'Sylhet', label: 'Sylhet', shortLabel: 'Sylhet' },
  { value: 'Rajshahi', label: 'Rajshahi', shortLabel: 'Rajshahi' },
  { value: 'Khulna', label: 'Khulna', shortLabel: 'Khulna' },
  { value: 'Barishal', label: 'Barishal', shortLabel: 'Barishal' }
];

const SEARCH_DESIGNATIONS = [
  { value: '', label: 'All Designations', shortLabel: 'All Designations' },
  // Executive & General Management
  { value: 'General Manager', label: 'General Manager', shortLabel: 'General Manager' },
  { value: 'Hotel Manager', label: 'Hotel Manager / Resident Manager', shortLabel: 'Hotel Manager' },
  { value: 'Executive Assistant Manager', label: 'Executive Assistant Manager (EAM)', shortLabel: 'EAM' },
  { value: 'Director of Operations', label: 'Director of Operations', shortLabel: 'Operations Dir.' },
  { value: 'Operations Manager', label: 'Operations Manager', shortLabel: 'Operations Mgr.' },

  // Front Office & Guest Experience
  { value: 'Front Office Manager', label: 'Front Office Manager', shortLabel: 'FOM' },
  { value: 'Assistant Front Office Manager', label: 'Assistant Front Office Manager', shortLabel: 'Asst. FOM' },
  { value: 'Duty Manager', label: 'Duty Manager', shortLabel: 'Duty Manager' },
  { value: 'Night Auditor', label: 'Night Auditor', shortLabel: 'Night Auditor' },
  { value: 'Front Desk Supervisor', label: 'Front Desk Supervisor', shortLabel: 'Front Desk Sup.' },
  { value: 'Front Desk Agent', label: 'Front Desk Agent / Receptionist', shortLabel: 'Front Desk' },
  { value: 'Guest Relations Executive', label: 'Guest Relations Executive', shortLabel: 'Guest Relations' },
  { value: 'Concierge', label: 'Concierge / Bell Captain', shortLabel: 'Concierge' },
  { value: 'Bell Attendant', label: 'Bell Attendant / Porter / Valet', shortLabel: 'Bell Attendant' },

  // Housekeeping & Laundry
  { value: 'Executive Housekeeper', label: 'Executive Housekeeper', shortLabel: 'Exec. Housekeeper' },
  { value: 'Assistant Executive Housekeeper', label: 'Assistant Executive Housekeeper', shortLabel: 'Asst. Housekeeper' },
  { value: 'Housekeeping Supervisor', label: 'Housekeeping Supervisor', shortLabel: 'HK Supervisor' },
  { value: 'Housekeeping Attendant', label: 'Housekeeping Attendant / Room Attendant', shortLabel: 'HK Attendant' },
  { value: 'Public Area Attendant', label: 'Public Area Attendant', shortLabel: 'Public Area' },
  { value: 'Laundry Manager', label: 'Laundry Manager / Supervisor', shortLabel: 'Laundry Mgr.' },
  { value: 'Laundry Attendant', label: 'Laundry Attendant', shortLabel: 'Laundry Attendant' },

  // Food & Beverage Service
  { value: 'Director of Food & Beverage', label: 'Director of Food & Beverage', shortLabel: 'F&B Director' },
  { value: 'F&B Manager', label: 'Food & Beverage Manager', shortLabel: 'F&B Manager' },
  { value: 'Assistant F&B Manager', label: 'Assistant F&B Manager', shortLabel: 'Asst. F&B Mgr.' },
  { value: 'Restaurant Manager', label: 'Restaurant / Outlet Manager', shortLabel: 'Restaurant Mgr.' },
  { value: 'Banquet Manager', label: 'Banquet Manager / Supervisor', shortLabel: 'Banquet Mgr.' },
  { value: 'F&B Captain', label: 'F&B Captain / Lead Server', shortLabel: 'F&B Captain' },
  { value: 'Server', label: 'Waiter / Waitress / Server', shortLabel: 'Server' },
  { value: 'Bartender', label: 'Bartender / Mixologist / Barista', shortLabel: 'Bartender' },
  { value: 'Hostess', label: 'Hostess / Welcomer', shortLabel: 'Hostess' },

  // Culinary / Kitchen & Bakery
  { value: 'Executive Chef', label: 'Executive Chef', shortLabel: 'Executive Chef' },
  { value: 'Executive Sous Chef', label: 'Executive Sous Chef', shortLabel: 'Exec. Sous Chef' },
  { value: 'Sous Chef', label: 'Sous Chef', shortLabel: 'Sous Chef' },
  { value: 'Chef de Partie', label: 'Chef de Partie (CDP)', shortLabel: 'CDP' },
  { value: 'Demi Chef de Partie', label: 'Demi Chef de Partie', shortLabel: 'Demi CDP' },
  { value: 'Commis Chef', label: 'Commis Chef (Commis I, II, III)', shortLabel: 'Commis Chef' },
  { value: 'Pastry Chef', label: 'Pastry Chef / Baker', shortLabel: 'Pastry Chef' },
  { value: 'Kitchen Steward', label: 'Kitchen Steward / Dishwasher', shortLabel: 'Steward' },

  // Sales, Marketing & Revenue
  { value: 'Director of Sales & Marketing', label: 'Director of Sales & Marketing', shortLabel: 'Sales Director' },
  { value: 'Sales Manager', label: 'Sales Manager / Corporate Sales', shortLabel: 'Sales Manager' },
  { value: 'Sales Executive', label: 'Sales Executive / Coordinator', shortLabel: 'Sales Executive' },
  { value: 'Marketing Executive', label: 'Marketing & Digital PR Executive', shortLabel: 'Marketing Exec.' },
  { value: 'Revenue Manager', label: 'Revenue Manager', shortLabel: 'Revenue Mgr.' },
  { value: 'Reservations Manager', label: 'Reservations Manager / Agent', shortLabel: 'Reservations' },

  // Human Resources & Training
  { value: 'Director of Human Resources', label: 'Director of Human Resources', shortLabel: 'HR Director' },
  { value: 'HR Manager', label: 'Human Resources Manager', shortLabel: 'HR Manager' },
  { value: 'HR Executive', label: 'HR Executive / Training Officer', shortLabel: 'HR Executive' },

  // Finance & Accounts
  { value: 'Financial Controller', label: 'Financial Controller / Chief Accountant', shortLabel: 'Financial Controller' },
  { value: 'Accounts Officer', label: 'Accounts Officer / General Cashier', shortLabel: 'Accounts Officer' },
  { value: 'Purchasing Manager', label: 'Purchasing / Procurement Manager', shortLabel: 'Purchasing Mgr.' },

  // Engineering & Maintenance
  { value: 'Chief Engineer', label: 'Chief Engineer / Director of Engineering', shortLabel: 'Chief Engineer' },
  { value: 'Duty Engineer', label: 'Duty Engineer / Maintenance Technician', shortLabel: 'Duty Engineer' },
  { value: 'Electrician', label: 'Electrician / HVAC Technician', shortLabel: 'Technician' },

  // Security & Safety
  { value: 'Chief Security Officer', label: 'Chief Security Officer', shortLabel: 'Security Head' },
  { value: 'Security Supervisor', label: 'Security Supervisor / Guard', shortLabel: 'Security Sup.' },

  // Spa, Wellness & Recreation
  { value: 'Spa Manager', label: 'Spa & Wellness Manager', shortLabel: 'Spa Manager' },
  { value: 'Spa Therapist', label: 'Spa Therapist / Masseur', shortLabel: 'Spa Therapist' },
  { value: 'Fitness Instructor', label: 'Fitness Instructor / Gym Trainer', shortLabel: 'Fitness Trainer' },

  // IT & Telecom
  { value: 'IT Manager', label: 'IT Manager / Systems Administrator', shortLabel: 'IT Manager' }
];

function getSearchLocationLabel(val, isCandidate = true) {
  const match = SEARCH_LOCATIONS.find(l => l.value === val);
  if (!match) return isCandidate ? 'All Locations' : 'Location';
  return isCandidate ? match.label : match.shortLabel;
}

function getSearchDepartmentLabel(val) {
  if (!val) return 'All Departments';
  return val;
}

function getSearchDesignationLabel(val) {
  const match = SEARCH_DESIGNATIONS.find(d => d.value === val);
  return match ? match.label : 'All Designations';
}

const HOTEL_EDUCATION_DEGREES = [
  "Secondary School Certificate (SSC)",
  "Higher Secondary Certificate (HSC)",
  "Diploma in Hospitality & Tourism Management",
  "Diploma in Culinary Arts & Food Safety",
  "Bachelor's Degree",
  "Master's Degree",
  "PhD / Doctorate",
  "AHLEI Certified Hospitality Professional",
  "Vocational / Trade Training Certificate"
];

const BANGLADESH_DEGREES = [
  "SSC / Secondary School Certificate",
  "HSC / Higher Secondary Certificate",
  "Diploma in Hospitality & Tourism Management (NHTTI)",
  "Diploma in Culinary Arts & Food Safety (BHTTI)",
  "Bachelor of Hotel Management (BHM)",
  "BBA in Tourism & Hospitality Management",
  "Bachelor of Business Administration (BBA)",
  "BA / B.Sc / B.Com (National / Public / Private University)",
  "AHLEI Certified Hospitality Supervisor (CHS)",
  "AHLEI Food & Beverage Management Certificate",
  "MBA in Hospitality & Tourism Management",
  "Master of Business Administration (MBA)",
  "Master of Hotel Management (MHM)",
  "Other Hospitality / University Degree"
];

const HOTEL_SKILLS_SCHEMA = [
  // Front Office & Concierge
  "Opera PMS", "Amadeus CRS", "Front Desk Administration", "Check-in / Check-out", "Guest Relations",
  "VIP Concierge", "Night Audit", "Keycard Systems", "Reservation Systems", "Telephone Etiquette",
  "Complaint Resolution", "Luggage & Bell Services", "Airport Transfers", "Butler Service",
  // Food & Beverage Service
  "Micros POS", "Fine Dining Service", "Table Etiquette", "Banquet Operations", "Bartending & Mixology",
  "Sommelier & Wine Service", "Barista & Coffee Art", "Cocktail Crafting", "Buffet Setup & Flow",
  "In-Room Dining (Room Service)", "Order Taking & Upselling", "POS Billing & Cashiering",
  // Culinary & Kitchen
  "Food Safety HACCP", "Continental Cuisine", "Bengali Traditional Fine Dining", "Pan-Asian & Chinese Cuisine",
  "Italian & Wood-Fired Pizza", "Pastry & Bakery", "Culinary Prep & Knife Skills", "Menu Engineering & Costing",
  "Sous Vide Cooking", "Garde Manger / Cold Kitchen", "Tandoor & Kebab Making", "Butchery & Seafood Processing",
  "Kitchen Hygiene & Sanitization", "Kitchen Inventory Control",
  // Housekeeping & Laundry
  "Housekeeping Standards", "Room Inspection Audits", "Turndown Service", "Linen & Laundry Operations",
  "Public Area Sanitization", "Chemical Safety & Dilution", "Stain Removal & Fabric Care", "Minibar Restocking",
  "Uniform Room Coordination",
  // Engineering & Maintenance
  "HVAC & Chiller Plants", "Building Management Systems (BMS)", "Diesel Generator Maintenance",
  "Plumbing & Water Treatment", "Electrical Substation Operations", "Fire Alarm & Sprinkler Systems",
  "Kitchen Equipment Maintenance", "Swimming Pool Chemistry & Filtration", "Boiler Operations",
  // Sales, Events & Revenue
  "Hotel Revenue Management", "Hospitality Corporate Sales", "Wedding & Banquet Sales", "MICE Event Planning",
  "OTA & Channel Management", "Digital Marketing & PR", "Contract Negotiation", "Group Reservations",
  // Security & Safety
  "CCTV Monitoring & Surveillance", "Loss Prevention & Access Control", "Fire Safety & Evacuation",
  "First Aid & CPR Certification", "VIP Protection & Escort", "Incident Investigation",
  // Spa, Wellness & Recreation
  "Spa & Wellness Therapy", "Ayurvedic Massage", "Swedish & Deep Tissue Massage", "Fitness & Gym Training",
  "Pool Lifeguard Certification", "Eco-Tour Guiding", "Water Sports Instruction",
  // IT & Management
  "Fidelio PMS", "Micros Simphony", "Hotel Network & Wi-Fi Systems", "Staff Roster Management",
  "Hospitality Supervisory Skills", "Customer Satisfaction (CSAT)", "Budgeting & Cost Control"
];

const HOTEL_FEATURES_SCHEMA = [
  "Infinity Swimming Pool", "Luxury Spa & Wellness Center", "24/7 Fitness Center & Gym",
  "Multi-Cuisine Fine Dining Restaurant", "Rooftop Sky Bar & Lounge", "Executive Boardroom & Business Center",
  "Grand Ballroom & Convention Hall", "Private Sea Beach Access", "Complimentary Airport Shuttle",
  "High-Speed Optical Fiber Wi-Fi", "Valet Parking", "Kids Splash Zone & Play Area",
  "24-Hour In-Room Dining", "Dedicated Butler Service", "Helipad Facility", "Steam & Sauna Bath",
];

const HOTEL_BENEFITS_SCHEMA = [
  // Compensation & Financial Bonuses
  "Service Charge Distribution (100% Shared)",
  "Festival Bonus (2x Yearly)",
  "Performance Incentive Bonus",
  "Provident Fund (PF)",
  "Gratuity Scheme",
  "Daily Cash Tips / Gratuity Payout",
  "Annual Performance Salary Increment",
  "Overtime (OT) Allowance",
  // Housing, Living & Transport
  "Complimentary Staff Accommodation",
  "Subsidized Shared Housing",
  "House Rent Allowance (HRA)",
  "Relocation Assistance & Flight Ticket",
  "Staff Pick & Drop Shuttle Transport",
  "Late Night Safe Drop Service",
  // Meals & Dining
  "Free Duty Meals (3 Meals / Shift)",
  "Subsidized Executive Dining",
  "Discounted Staff F&B across Outlets",
  "Complimentary Coffee & Tea Station",
  // Health, Medical & Wellness
  "Comprehensive Health & Medical Insurance",
  "Life & Accidental Insurance",
  "Doctor On-Call & Medical Reimbursement",
  "Annual Executive Health Checkup",
  "Free Access to Hotel Fitness Gym & Pool",
  "Spa & Wellness Discounts",
  // Paid Leaves & Stay Privileges
  "Paid Annual Leave (20+ Days)",
  "Maternity & Paternity Paid Leave",
  "Casual & Medical Sick Leave",
  "Employee Hotel Stay Discounts (Global Brand Rate)",
  "Friends & Family Room Discount Vouchers",
  "Compensatory Off (C-Off) for Holidays",
  // Training, Uniform & Work Gear
  "International Hotel Brand Certification",
  "Cross-Department Training Program",
  "Hospitality Language Courses",
  "Complimentary Dry Cleaning & Laundered Uniforms",
  "Safety Shoes & Grooming Kit Provided"
];

function getBenefitIcon(b) {
  const bl = (b || '').toLowerCase();
  if (bl.includes('service charge') || bl.includes('bonus') || bl.includes('salary') || bl.includes('pf') || bl.includes('gratuity') || bl.includes('tip') || bl.includes('overtime') || bl.includes('incentive') || bl.includes('fund')) return 'dollar';
  if (bl.includes('accommodation') || bl.includes('housing') || bl.includes('rent') || bl.includes('house')) return 'home';
  if (bl.includes('meal') || bl.includes('dining') || bl.includes('f&b') || bl.includes('food') || bl.includes('coffee') || bl.includes('tea')) return 'utensils';
  if (bl.includes('insurance') || bl.includes('medical') || bl.includes('doctor') || bl.includes('health') || bl.includes('safety') || bl.includes('shoe')) return 'shield';
  if (bl.includes('transport') || bl.includes('shuttle') || bl.includes('drop') || bl.includes('flight') || bl.includes('relocation')) return 'mapPin';
  if (bl.includes('leave') || bl.includes('holiday') || bl.includes('vacation') || bl.includes('day')) return 'calendar';
  if (bl.includes('training') || bl.includes('course') || bl.includes('certification') || bl.includes('program')) return 'award';
  if (bl.includes('stay') || bl.includes('room') || bl.includes('discount') || bl.includes('voucher') || bl.includes('perk')) return 'starFilled';
  return 'checkCircle';
}

const HOTEL_LANGUAGES_PRESETS = [
  { name: "Bengali", level: "Native" },
  { name: "English", level: "Professional" },
  { name: "English", level: "Fluent" },
  { name: "Arabic", level: "Conversational" },
  { name: "Hindi / Urdu", level: "Conversational" },
  { name: "Mandarin Chinese", level: "Basic" },
  { name: "French", level: "Basic" },
  { name: "German", level: "Basic" }
];

const PREF_LOCATIONS_POOL = [
  'Dhaka', "Cox's Bazar", 'Chattogram (Chittagong)', 'Sylhet', 'Moulvibazar (Sreemangal)',
  'Gazipur', 'Patuakhali (Kuakata)', 'Khulna', 'Rajshahi', 'Rangpur', 'Barishal',
  'Mymensingh', 'Cumilla (Comilla)', 'Bogura', 'Jashore (Jessore)', 'Bandarban',
  'Rangamati', 'Dinajpur', 'Feni', 'Tangail'
];

const HOTEL_TYPES_SCHEMA = [
  "5-Star International Luxury Hotel",
  "5-Star Palace & Heritage Grand Hotel",
  "4-Star Premium Business Hotel",
  "3-Star Midscale City Hotel",
  "Boutique Heritage Hotel",
  "Boutique Lifestyle Hotel & Suites",
  "Coastal Beach Resort & Spa",
  "Private Island Resort",
  "Eco-Resort & Rainforest Nature Lodge",
  "Hilltop & Mountain Mist Resort",
  "Tea Garden & Estate Bungalow Resort",
  "Haor & Wetland Floating Eco-Resort",
  "Riverfront & Estuary Resort",
  "Safari & Wildlife Sanctuary Lodge",
  "Luxury Glamping & Canopy Camp",
  "Golf & Country Club Resort",
  "Wellness, Ayurvedic & Hot Spring Sanctuary",
  "All-Inclusive Luxury Family Resort & Waterpark",
  "Airport Transit & Terminal Hotel",
  "Serviced Apartment & Extended-Stay Aparthotel",
  "Heritage Zamindar Bari / Historic Haveli Resort",
  "Lakeview Chalet, Cottage & Cabin Resort",
  "Convention, Expo & Conference Center Hotel",
  "Casino & Entertainment Complex Resort",
  "Cruise Ship, Flotilla & Houseboat Hotel",
  "Luxury Farmstay & Agro-Tourism Retreat",
  "Fine Dining Restaurant, Sky Lounge & Banquet Club",
  "Highway Motel & Express Travel Inn",
  "Bed & Breakfast (B&B) / Hospitality Guesthouse",
  "Youth & Backpacker Hostel",
  "Marina, Yacht Club & Waterfront Club",
  "Ski & Alpine Winter Lodge"
];

const BANGLADESH_DISTRICTS = [
  "Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura",
  "Brahmanbaria", "Chandpur", "Chapainawabganj", "Chattogram (Chittagong)",
  "Chuadanga", "Cox's Bazar", "Cumilla (Comilla)", "Dhaka", "Dinajpur",
  "Faridpur", "Feni", "Gaibandha", "Gazipur", "Gopalganj",
  "Habiganj", "Jamalpur", "Jashore (Jessore)", "Jhalokathi", "Jhenaidah",
  "Joypurhat", "Khagrachhari", "Khulna", "Kishoreganj", "Kurigram",
  "Kushtia", "Lakshmipur", "Lalmonirhat", "Madaripur", "Magura",
  "Manikganj", "Meherpur", "Moulvibazar (Sreemangal)", "Munshiganj", "Mymensingh",
  "Naogaon", "Narail", "Narayanganj", "Narsingdi", "Natore",
  "Netrokona", "Nilphamari", "Noakhali", "Pabna", "Panchagarh (Tetulia)",
  "Patuakhali (Kuakata)", "Pirojpur", "Rajbari", "Rajshahi", "Rangamati",
  "Rangpur", "Satkhira (Sundarbans)", "Shariatpur", "Sherpur", "Sirajganj",
  "Sunamganj (Tanguar Haor)", "Sylhet", "Tangail", "Thakurgaon"
];

const PRESET_AVATARS = [
  "/static/images/candidate_rahim.jpg",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
];

// Auth States
const loginState = {
  role: 'candidate',       // 'candidate' | 'business'
  // Candidate Login (Email + Password)
  email: '',
  password: '',
  // Business Login (Part 1 Business Check, Part 2 User Login)
  businessStep: 1,         // 1 or 2
  businessEmail: '',
  verifiedBusiness: null,
  userEmail: '',
  businessPassword: '',
  errorMessage: null,
  errorType: null,
  useOtp: false,
  otpCode: '',
  lastSentOtp: ''
};

function getFreshSignupState(role = 'candidate') {
  return {
    role: role,
    stage: 1,

    // Candidate Fields
    pfp: DEFAULT_AVATAR_PREVIEW,
    raw_pfp: null,
    pfp_crop: null,
    name: '',
    dob: '',
    nid_passport: '',
    phone: '',
    phone_secondary: '',
    email: '',
    bio: '',
    cv_name: '',
    cv_url: '',
    job_preferences: {
      department: 'Front Office & Guest Services',
      desired_role: '',
      shift: 'Rotational',
      expected_salary: '',
      preferred_location: 'Dhaka'
    },
    education: [],
    skills: [],
    customSkillsPool: [],
    skillsSearchQuery: '',
    languages: [],
    customLanguagesPool: [],
    languagesSearchQuery: '',
    experience: [],
    password: '',
    confirm_password: '',
    otp_code: '',
    lastSentOtp: '',
    terms_accepted: false,

    // Business Onboarding State
    biz_route: 'choose',
    biz_step: 1,

    // Route A: New Business Account
    brand_name: '',
    legal_name: '',
    logo_url: DEFAULT_HOTEL_LOGO,
    property_type: '5-Star International Luxury Hotel',
    bizTypeSearchQuery: '',
    customBizTypesPool: [],
    plot_number: '',
    road_number: '',
    thana_upazila: '',
    district: 'Dhaka',
    website: '',
    official_email: '',
    official_telephone: '',
    features: [],
    customFeaturesPool: [],
    featuresSearchQuery: '',
    rep_name: '',
    rep_cell: '',
    rep_email: '',
    rep_dob: '',
    rep_pfp: DEFAULT_AVATAR_PREVIEW,
    raw_rep_pfp: null,
    rep_pfp_crop: null,
    rep_designation: '',
    biz_password: '',
    biz_confirm_password: '',
    biz_role_choice: 'admin',
    biz_otp_code: '',
    biz_lastSentOtp: '',
    hotel_terms_accepted: false,

    // Route B: Add New User
    join_business_email: '',
    join_matched_business: null,
    join_user_email: '',
    join_user_password: '',
    join_confirm_password: '',
    join_name: '',
    join_cell: '',
    join_dob: '',
    join_pfp: DEFAULT_AVATAR_PREVIEW,
    raw_join_pfp: null,
    join_pfp_crop: null,
    join_designation: '',
    join_otp_code: '',
    join_lastSentOtp: '',
    join_terms_accepted: false
  };
}

const signupState = getFreshSignupState('candidate');

function saveSignupProgress() {
  try {
    sessionStorage.setItem('nicejobs_signup_state', JSON.stringify(signupState));
  } catch (e) {
    try {
      const copy = { ...signupState, raw_pfp: null, raw_rep_pfp: null, raw_join_pfp: null };
      sessionStorage.setItem('nicejobs_signup_state', JSON.stringify(copy));
    } catch (e2) {}
  }
}

function restoreSignupProgress() {
  try {
    const saved = sessionStorage.getItem('nicejobs_signup_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Clean out obsolete demo values if present from prior sessions
      if (parsed.email === 'rahim.ahmed@example.bd') parsed.email = '';
      if (parsed.name === 'Rahim Ahmed') parsed.name = '';
      if (parsed.pfp === '/static/images/candidate_rahim.jpg' || !parsed.pfp) parsed.pfp = DEFAULT_AVATAR_PREVIEW;
      if (parsed.rep_pfp === '/static/images/candidate_rahim.jpg' || !parsed.rep_pfp) parsed.rep_pfp = DEFAULT_AVATAR_PREVIEW;
      if (parsed.join_pfp === '/static/images/candidate_rahim.jpg' || !parsed.join_pfp) parsed.join_pfp = DEFAULT_AVATAR_PREVIEW;
      if (!parsed.logo_url) parsed.logo_url = DEFAULT_HOTEL_LOGO;
      if (parsed.cv_name === 'Rahim_Ahmed_Hospitality_CV.pdf') parsed.cv_name = '';
      if (parsed.brand_name === 'Radisson Blu Dhaka Water Garden') parsed.brand_name = '';
      if (parsed.official_email === 'hr@radissondhaka.com') parsed.official_email = '';
      if (parsed.rep_name === 'Fatima Khan') parsed.rep_name = '';
      if (parsed.rep_email === 'fatima.khan@radissondhaka.com') parsed.rep_email = '';
      if (parsed.join_name === 'Tanvir Hossain') parsed.join_name = '';
      if (parsed.join_user_email === 'tanvir.recruiter@radissondhaka.com') parsed.join_user_email = '';
      Object.assign(signupState, parsed);
    }
  } catch (e) {}
}

const authFlowState = loginState; // Backwards compatibility

// ==========================================================================
// Initialization & Routing
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  restoreSignupProgress();
  const savedAdminSession = sessionStorage.getItem('nicejobs_admin_session');
  if (savedAdminSession) {
    try {
      const sess = JSON.parse(savedAdminSession);
      if (sess.expiresAt > Date.now() && sess.user && sess.user.role === 'admin') {
        state.currentUser = sess.user;
        state.currentRole = 'admin';
        document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
      } else {
        sessionStorage.removeItem('nicejobs_admin_session');
      }
    } catch (e) {
      sessionStorage.removeItem('nicejobs_admin_session');
    }
  } else {
    const savedActiveSession = sessionStorage.getItem('nicejobs_active_session') || localStorage.getItem('nicejobs_active_session');
    if (savedActiveSession) {
      try {
        const sess = JSON.parse(savedActiveSession);
        if (sess && sess.user) {
          state.currentUser = sess.user;
          state.currentRole = sess.role || 'jobseeker';
          state.activeHotelId = sess.activeHotelId || null;
          document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
          if (state.currentRole === 'jobseeker') {
            document.getElementById('btn-role-seeker')?.classList.add('active');
          } else if (state.currentRole === 'recruiter') {
            document.getElementById('btn-role-recruiter')?.classList.add('active');
          }
        }
      } catch (e) {
        sessionStorage.removeItem('nicejobs_active_session');
        localStorage.removeItem('nicejobs_active_session');
      }
    }
  }
  initRealtimeSync();
  setupHashRouting();
  updateNavigation();
  updateRoleStatusText();
  renderApp();
  await loadInitialData();
  updateNavigation();
  updateRoleStatusText();
  renderApp();
  updateRealtimeHandshake();
});

function parseRoute() {
  const rawHash = window.location.hash.replace('#', '') || 'home';
  const [screen, paramStr] = rawHash.split('?');
  const inboxAliases = ['inbox', 'messages', 'message', 'messeges', 'messege', 'messagebox', 'messegebox'];
  const resolvedScreen = inboxAliases.includes(screen ? screen.toLowerCase() : '') ? 'inbox' : screen;
  if (resolvedScreen !== 'inbox') {
    state.lastNonInboxScreen = resolvedScreen;
  }
  state.currentScreen = resolvedScreen;
  state.screenParams = paramStr ? new URLSearchParams(paramStr) : new URLSearchParams();

  if (state.currentScreen === 'inbox') {
    if (paramStr && state.screenParams.get('conv')) {
      state.activeConvId = state.screenParams.get('conv');
      state.inboxMobileView = 'chat';
    } else if (state.screenParams.get('chat')) {
      state.inboxMobileView = 'chat';
    } else {
      // Retain chat view if an active conversation is already selected
      state.inboxMobileView = state.activeConvId ? 'chat' : 'threads';
    }
  }

  if (screen === 'admin') {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      state.currentScreen = 'admin-login';
    }
  }

  if (paramStr) {
    const params = state.screenParams;
    if (params.get('id')) {
      if (screen === 'job-details') state.activeJobId = params.get('id');
      if (screen === 'hotel-details' || screen === 'hotels') state.activeHotelId = params.get('id');
      if (screen === 'blog' || screen === 'blog-post') state.activeBlogId = params.get('id');
    } else {
      if (screen === 'hotels') state.activeHotelId = null;
      if (screen === 'job-details') state.activeJobId = null;
      if (screen === 'blog') state.activeBlogId = null;
    }
    if (params.get('role')) {
      const r = params.get('role');
      loginState.role = r;
      signupState.role = r;
    }
    if (params.get('stage')) {
      signupState.stage = parseInt(params.get('stage')) || 1;
    }
  } else {
    if (screen === 'hotels') state.activeHotelId = null;
    if (screen === 'job-details') state.activeJobId = null;
    if (screen === 'blog') state.activeBlogId = null;
  }
}

function setupHashRouting() {
  window.addEventListener('hashchange', () => {
    parseRoute();
    renderApp();
  });
  parseRoute();
}

function toggleMobileMenu() {
  const drawer = document.getElementById('mobile-nav-drawer');
  const btn = document.getElementById('btn-mobile-menu');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('is-open');
  if (isOpen) {
    drawer.classList.remove('is-open');
    btn?.classList.remove('is-open');
  } else {
    drawer.classList.add('is-open');
    btn?.classList.add('is-open');
  }
}

function closeMobileMenu() {
  const drawer = document.getElementById('mobile-nav-drawer');
  const btn = document.getElementById('btn-mobile-menu');
  drawer?.classList.remove('is-open');
  btn?.classList.remove('is-open');
}

async function navigateTo(screen, params = null) {
  closeMobileMenu();
  let hash = screen;
  if (params) {
    const searchParams = new URLSearchParams(params).toString();
    hash += `?${searchParams}`;
  }
  window.location.hash = hash;
  parseRoute();
  return await renderApp();
}

// ==========================================================================
// Role Switcher (Persona Simulation)
// ==========================================================================

function updateRoleStatusText() {
  const statusText = document.getElementById('role-status-text');
  if (!statusText) return;
  if (state.demoDataHidden) {
    if (state.currentUser && state.currentUser.role !== 'admin') {
      statusText.innerHTML = `<strong>${escapeHtml(state.currentUser.name)}</strong> • ${state.currentRole === 'jobseeker' ? 'Candidate' : 'Employer'}`;
    } else if (state.currentUser && state.currentUser.role === 'admin') {
      statusText.innerHTML = `<strong>${escapeHtml(state.currentUser.name)}</strong> • Admin`;
    } else {
      statusText.innerHTML = `<span style="color: #cbd5e1;">Clean Mode</span>`;
    }
    return;
  }
  if (!state.currentUser) {
    statusText.innerHTML = `Public Guest`;
  } else if (state.currentUser.role === 'admin') {
    statusText.innerHTML = `<strong>${escapeHtml(state.currentUser.name)}</strong> • Admin`;
  } else if (state.currentUser.role === 'recruiter') {
    statusText.innerHTML = `<strong>${escapeHtml(state.currentUser.name)}</strong> • Recruiter`;
  } else {
    statusText.innerHTML = `<strong>${escapeHtml(state.currentUser.name)}</strong> • Candidate`;
  }
}

async function toggleDemoData(forceState = null) {
  try {
    const body = forceState !== null ? JSON.stringify({ hide: forceState }) : null;
    const res = await fetch('/api/admin/toggle-demo-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    });
    const data = await res.json();
    state.demoDataHidden = data.demo_data_hidden;
    
    // Update button UI
    const toggleBtn = document.getElementById('btn-toggle-demo-data');
    if (toggleBtn) {
      if (state.demoDataHidden) {
        toggleBtn.textContent = 'Restore Demo';
        toggleBtn.title = 'Restore demo data';
        toggleBtn.style.background = 'rgba(239, 68, 68, 0.2)';
        toggleBtn.style.color = '#fca5a5';
        toggleBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      } else {
        toggleBtn.textContent = 'Clean Mode';
        toggleBtn.title = 'Temporarily remove demo data';
        toggleBtn.style.background = '';
        toggleBtn.style.color = '';
        toggleBtn.style.borderColor = '';
      }
    }

    // If demo data was removed and user was using demo persona (Rahim/Fatima), clear demo persona
    if (state.demoDataHidden) {
      if (state.currentUser && (state.currentUser.id === 'user_rahim' || state.currentUser.id === 'user_fatima')) {
        let customSess = null;
        try {
          const raw = sessionStorage.getItem('nicejobs_active_session');
          if (raw) {
            const p = JSON.parse(raw);
            if (p?.user?.id !== 'user_rahim' && p?.user?.id !== 'user_fatima') {
              customSess = p;
            }
          }
        } catch (e) {}

        if (customSess) {
          state.currentUser = customSess.user;
          state.currentRole = customSess.role;
          state.activeHotelId = customSess.activeHotelId;
        } else {
          state.currentUser = null;
          state.currentRole = 'guest';
          document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
          document.getElementById('btn-role-guest')?.classList.add('active');
        }
      }
    }

    // Clear or reset login inputs for demo removal
    if (state.demoDataHidden) {
      loginState.email = '';
      loginState.password = '';
      loginState.businessEmail = '';
      loginState.userEmail = '';
      loginState.businessPassword = '';
      loginState.verifiedBusiness = null;
      loginState.businessStep = 1;
    } else {
      loginState.email = '';
      loginState.password = '';
      loginState.businessEmail = '';
      loginState.userEmail = '';
      loginState.businessPassword = '';
    }

    showToast(data.message, 'info');
    updateRoleStatusText();
    await loadInitialData();
    renderApp();
  } catch (err) {
    showToast('Failed to toggle demo data: ' + err.message, 'danger');
  }
}

function switchRole(role) {
  closeMobileMenu();
  state.currentRole = role;

  document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`btn-role-${role}`);
  if (btn) btn.classList.add('active');

  // Check if user has an active custom session saved in sessionStorage for this role
  let customSess = null;
  try {
    const roleKey = role === 'jobseeker' ? 'nicejobs_candidate_session' : (role === 'recruiter' ? 'nicejobs_employer_session' : null);
    const raw = (roleKey ? (sessionStorage.getItem(roleKey) || localStorage.getItem(roleKey)) : null) || 
                sessionStorage.getItem('nicejobs_active_session') || 
                localStorage.getItem('nicejobs_active_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.user && parsed.role === role) {
        customSess = parsed;
      }
    }
  } catch (e) {}

  if (role === 'jobseeker') {
    if (customSess) {
      state.currentUser = customSess.user;
      state.activeHotelId = null;
    } else if (!state.demoDataHidden) {
      state.currentUser = {
        id: 'user_rahim',
        name: 'Rahim Ahmed',
        email: 'rahim.ahmed@example.bd',
        phone: '+880 1711 234567',
        role: 'jobseeker',
        title: 'Front Office Supervisor',
        avatar: '/static/images/candidate_rahim.jpg'
      };
      state.activeHotelId = null;
    } else {
      state.currentUser = null;
      showToast('Demo data is removed. Please sign up or log in to view candidate portal.', 'info');
      updateRoleStatusText();
      updateNavigation();
      navigateTo('home');
      return;
    }
    updateRoleStatusText();
    showToast('Job Seeker mode');
    loadInitialData().then(() => {
      updateNavigation();
      if (state.currentScreen === 'recruiter-dashboard' || state.currentScreen === 'ats' || state.currentScreen === 'admin') {
        navigateTo('home');
      } else {
        renderApp();
      }
    });
    return;
  } else if (role === 'recruiter') {
    if (customSess) {
      state.currentUser = customSess.user;
      state.activeHotelId = customSess.activeHotelId || customSess.user.business_id;
    } else if (!state.demoDataHidden) {
      state.currentUser = {
        id: 'user_fatima',
        name: 'Fatima Khan',
        email: 'fatima.khan@radissondhaka.com',
        phone: '+880 1819 876543',
        role: 'recruiter',
        business_id: 'biz_radisson',
        title: 'HR Manager & Business Admin (Radisson Blu Dhaka)',
        avatar: '/static/images/candidate_rahim.jpg',
        is_business_admin: true
      };
      state.activeHotelId = 'biz_radisson';
    } else {
      state.currentUser = null;
      showToast('Demo data is removed. Please sign up or log in to view business portal.', 'info');
      updateRoleStatusText();
      updateNavigation();
      navigateTo('home');
      return;
    }
    updateRoleStatusText();
    showToast('Employer mode');
    loadInitialData().then(() => {
      updateNavigation();
      navigateTo('recruiter-dashboard');
    });
    return;
  } else if (role === 'admin') {
    if (state.currentUser && state.currentUser.role === 'admin') {
      updateRoleStatusText();
      navigateTo('admin');
    } else {
      showToast('Admin login required', 'warning');
      navigateTo('admin-login');
      return;
    }
  } else if (role === 'guest') {
    state.currentUser = null;
    state.notifications = [];
    state.conversations = [];
    state.savedJobs = [];
    try {
      sessionStorage.removeItem('nicejobs_active_session');
      sessionStorage.removeItem('nicejobs_candidate_session');
      sessionStorage.removeItem('nicejobs_employer_session');
      localStorage.removeItem('nicejobs_active_session');
      localStorage.removeItem('nicejobs_candidate_session');
      localStorage.removeItem('nicejobs_employer_session');
    } catch(e) {}
    updateRoleStatusText();
    showToast('Guest mode');
    navigateTo('home');
  }

  updateNavigation();
  onAuthChange();
}
window.logoutUser = () => switchRole('guest');
window.switchRole = switchRole;


async function resetDemoData() {
  try {
    sessionStorage.removeItem('nicejobs_active_session');
    sessionStorage.removeItem('nicejobs_candidate_session');
    sessionStorage.removeItem('nicejobs_employer_session');
    sessionStorage.removeItem('nicejobs_signup_state');
    Object.assign(signupState, getFreshSignupState('candidate'));
    const res = await fetch('/api/admin/reset-demo', { method: 'POST' });
    const data = await res.json();
    state.demoDataHidden = false;
    state.currentUser = {
      id: 'user_rahim',
      name: 'Rahim Ahmed',
      email: 'rahim.ahmed@example.bd',
      phone: '+880 1711 234567',
      role: 'jobseeker',
      title: 'Front Office Supervisor',
      avatar: '/static/images/candidate_rahim.jpg'
    };
    state.currentRole = 'jobseeker';
    state.activeHotelId = null;

    const toggleBtn = document.getElementById('btn-toggle-demo-data');
    if (toggleBtn) {
      toggleBtn.textContent = 'Remove Demo Data';
      toggleBtn.title = 'Temporarily remove demo data';
      toggleBtn.style.background = '';
      toggleBtn.style.color = '';
      toggleBtn.style.borderColor = '';
    }

    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-role-seeker')?.classList.add('active');
    updateRoleStatusText();
    showToast('Demo reset!', 'success');
    await loadInitialData();
    renderApp();
    onAuthChange();
  } catch (err) {
    showToast('Reset failed: ' + err.message, 'danger');
  }
}

// ==========================================================================
// REAL-TIME SYNC SYSTEM (WEBSOCKET + SSE FALLBACK)
// ==========================================================================

let realtimeSocket = null;
let realtimeReconnectTimeout = null;
let realtimePingInterval = null;
let realtimeEventSource = null;
let realtimeReconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;
const realtimeProcessedEventIds = new Set();
let realtimeSyncDebounce = null;

let sharedAudioCtx = null;

function playRealtimeChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    const ctx = sharedAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.38);
  } catch(e) {}
}

function initRealtimeSync() {
  if (window._realtimeInitialized) {
    updateRealtimeHandshake();
    return;
  }
  window._realtimeInitialized = true;

  window.addEventListener('online', () => {
    console.log('[NiceJobs Realtime] Network restored online. Checking connection...');
    if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
      if (realtimeReconnectTimeout) {
        clearTimeout(realtimeReconnectTimeout);
        realtimeReconnectTimeout = null;
      }
      realtimeReconnectAttempts = 0;
      connectRealtimeWebSocket();
    } else {
      scheduleSyncMissedUpdates(150);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
        if (realtimeReconnectTimeout) {
          clearTimeout(realtimeReconnectTimeout);
          realtimeReconnectTimeout = null;
        }
        realtimeReconnectAttempts = 0;
        connectRealtimeWebSocket();
      } else {
        scheduleSyncMissedUpdates(200);
      }
    }
  });

  connectRealtimeWebSocket();
}

function scheduleSyncMissedUpdates(delayMs = 200) {
  if (realtimeSyncDebounce) clearTimeout(realtimeSyncDebounce);
  realtimeSyncDebounce = setTimeout(() => {
    realtimeSyncDebounce = null;
    syncMissedUpdates();
  }, delayMs);
}

async function syncMissedUpdates() {
  try {
    const jobsRes = await fetch('/api/jobs?status=active');
    if (jobsRes.ok) state.jobs = await jobsRes.json();

    if (state.currentUser && state.currentUser.role === 'jobseeker') {
      const [notifsRes, appsRes, savedRes, convRes] = await Promise.all([
        fetch(`/api/notifications?user_id=${state.currentUser.id}`),
        fetch(`/api/applications?user_id=${state.currentUser.id}`),
        fetch(`/api/saved-jobs?user_id=${state.currentUser.id}`),
        fetch(`/api/conversations?user_id=${state.currentUser.id}`)
      ]);
      if (notifsRes.ok) state.notifications = await notifsRes.json();
      if (appsRes.ok) state.applications = await appsRes.json();
      if (savedRes.ok) state.savedJobs = await savedRes.json();
      if (convRes.ok) state.conversations = await convRes.json();
    } else if (state.currentUser && state.currentUser.role === 'recruiter') {
      const bId = state.currentUser.business_id || state.activeHotelId;
      const [notifsRes, convRes] = await Promise.all([
        fetch(`/api/notifications?user_id=${state.currentUser.id}`),
        bId ? fetch(`/api/conversations?business_id=${bId}`) : Promise.resolve(null)
      ]);
      if (notifsRes.ok) state.notifications = await notifsRes.json();
      if (convRes && convRes.ok) state.conversations = await convRes.json();
    }

    updateNavigation();

    const viewport = document.getElementById('app-viewport');
    if (viewport) {
      if (state.currentScreen === 'home') await renderHomeScreen(viewport);
      else if (state.currentScreen === 'applications') await renderApplicationsScreen(viewport);
      else if (state.currentScreen === 'recruiter-dashboard') await renderRecruiterDashboard(viewport);
      else if (state.currentScreen === 'ats') await renderATSBoard(viewport);
      else if (state.currentScreen === 'saved-jobs') await renderSavedJobsScreen(viewport);
    }
  } catch (e) {
    console.warn('[NiceJobs Realtime] Catch-up sync warning:', e);
  }
}

function updateRealtimeHandshake() {
  if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
    try {
      realtimeSocket.send(JSON.stringify({
        action: 'identify',
        user_id: state.currentUser?.id || null,
        business_id: state.currentUser?.business_id || state.activeHotelId || null,
        role: state.currentRole || 'guest'
      }));
      if (state.currentScreen === 'inbox' && state.activeConvId) {
        joinConversationRoom(state.activeConvId);
      }
    } catch(e) {}
  }
}

function joinConversationRoom(convId) {
  if (!convId || !realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) return;
  try {
    realtimeSocket.send(JSON.stringify({
      action: 'conversation:join',
      conv_id: convId
    }));
  } catch(e) {}
}

function leaveConversationRoom(convId) {
  if (!convId || !realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) return;
  try {
    realtimeSocket.send(JSON.stringify({
      action: 'conversation:leave',
      conv_id: convId
    }));
  } catch(e) {}
}

function sendChatMessageRead(convId) {
  if (!convId) return;
  if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
    try {
      realtimeSocket.send(JSON.stringify({
        action: 'message:read',
        conv_id: convId
      }));
    } catch(e) {}
  }
  const uId = state.currentUser?.id || '';
  const bId = state.currentUser?.business_id || state.activeHotelId || '';
  fetch(`/api/conversations/${convId}/mark-read?role=${state.currentRole}&user_id=${encodeURIComponent(uId)}&business_id=${encodeURIComponent(bId)}`, {
    method: 'POST'
  }).catch(() => {});
}

let chatTypingTimeout = null;
let isCurrentlyTyping = false;

function handleChatTypingInput() {
  if (!state.activeConvId) return;
  if (!isCurrentlyTyping && realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
    isCurrentlyTyping = true;
    try {
      realtimeSocket.send(JSON.stringify({
        action: 'typing:start',
        conv_id: state.activeConvId,
        sender_name: state.currentUser?.name || (state.currentRole === 'recruiter' ? 'Hotel Recruiter' : 'Candidate')
      }));
    } catch(e) {}
  }
  if (chatTypingTimeout) clearTimeout(chatTypingTimeout);
  chatTypingTimeout = setTimeout(sendChatTypingStop, 2500);
}

function sendChatTypingStop() {
  if (chatTypingTimeout) {
    clearTimeout(chatTypingTimeout);
    chatTypingTimeout = null;
  }
  if (isCurrentlyTyping && realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN && state.activeConvId) {
    isCurrentlyTyping = false;
    try {
      realtimeSocket.send(JSON.stringify({
        action: 'typing:stop',
        conv_id: state.activeConvId
      }));
    } catch(e) {}
  } else {
    isCurrentlyTyping = false;
  }
}

function renderChatMessageStatusHtml(msg, isMine) {
  if (!isMine) return '';
  const status = msg.status || 'sent';
  if (status === 'sending') {
    return `<span class="bubble-status-mark status-sending" title="Sending...">🕒</span>`;
  } else if (status === 'delivered') {
    return `<span class="bubble-status-mark status-delivered" title="Delivered to recipient">✓✓</span>`;
  } else if (status === 'read') {
    return `<span class="bubble-status-mark status-read" title="Read by recipient">✓✓</span>`;
  }
  return `<span class="bubble-status-mark status-sent" title="Sent to server">✓</span>`;
}

function renderChatPresenceHtml(isOnline) {
  return `
    <span class="chat-presence-pill ${isOnline ? 'online' : 'offline'}" id="chat-counterpart-presence">
      <span class="presence-dot"></span>
      <span class="presence-label">${isOnline ? 'Active now' : 'Offline'}</span>
    </span>
  `;
}

function renderChatBubbleHtml(msg, isMine) {
  const bodyHtml = (typeof renderChatMessageContentHtml === 'function')
    ? renderChatMessageContentHtml(msg.content)
    : `<div class="bubble-text-box">${escapeHtml(msg.content)}</div>`;
  const statusHtml = renderChatMessageStatusHtml(msg, isMine);
  return `
    <div class="chat-bubble-row ${isMine ? 'mine' : 'theirs'}" data-msg-id="${msg.id || msg.temp_id || ''}">
      <span class="bubble-author-title">${escapeHtml(msg.sender_name || (isMine ? 'You' : 'Participant'))}</span>
      ${bodyHtml}
      <span class="bubble-timestamp">
        <span>${escapeHtml(msg.timestamp || 'Just now')}</span>
        ${statusHtml}
      </span>
    </div>
  `;
}

function moveThreadRowToTop(convId, snippetText, timeText) {
  const container = document.getElementById('thread-list-scroll');
  if (!container) return;
  const row = container.querySelector(`[data-conv-id="${convId}"], .thread-row.active`);
  if (row) {
    if (snippetText !== undefined) {
      const snip = row.querySelector('.thread-snippet');
      if (snip) snip.textContent = snippetText.startsWith('[') ? 'Attachment' : snippetText;
    }
    if (timeText !== undefined) {
      const tm = row.querySelector('.thread-time-label');
      if (tm) tm.textContent = timeText;
    }
    container.insertBefore(row, container.firstChild);
  }
}

function onAuthChange() {
  if (realtimeSocket) {
    try {
      realtimeSocket.onclose = null;
      realtimeSocket.close();
    } catch(e) {}
    realtimeSocket = null;
  }
  connectRealtimeWebSocket();
  if (realtimeEventSource) {
    try { realtimeEventSource.close(); } catch(e) {}
    realtimeEventSource = null;
    connectRealtimeSSEFallback();
  }
  scheduleSyncMissedUpdates(100);
}

function connectRealtimeWebSocket() {
  if (realtimeSocket && (realtimeSocket.readyState === WebSocket.CONNECTING || realtimeSocket.readyState === WebSocket.OPEN)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const uId = state.currentUser?.id ? `&user_id=${encodeURIComponent(state.currentUser.id)}` : '';
  const rawBizId = state.currentUser?.business_id || state.activeHotelId || '';
  const bId = rawBizId ? `&business_id=${encodeURIComponent(rawBizId)}` : '';
  const rId = state.currentRole ? `&role=${encodeURIComponent(state.currentRole)}` : '';
  const wsUrl = `${protocol}//${window.location.host}/ws?v=1${uId}${bId}${rId}`;

  try {
    realtimeSocket = new WebSocket(wsUrl);
    window.realtimeSocket = realtimeSocket;

    realtimeSocket.onopen = () => {
      console.log('[NiceJobs Realtime] Connected to live event stream');
      realtimeReconnectAttempts = 0;
      updateRealtimeHandshake();

      if (realtimeReconnectTimeout) {
        clearTimeout(realtimeReconnectTimeout);
        realtimeReconnectTimeout = null;
      }

      // Perform a catch-up sync on initial connection or reconnect
      scheduleSyncMissedUpdates(100);

      if (realtimePingInterval) clearInterval(realtimePingInterval);
      realtimePingInterval = setInterval(() => {
        if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
          try {
            realtimeSocket.send(JSON.stringify({ action: 'ping' }));
          } catch(e) {}
        }
      }, 25000);
    };

    realtimeSocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[NiceJobs WS RECEIVED]', payload);
        handleRealtimeEvent(payload);
      } catch(e) {
        console.error('[NiceJobs WS Parse Error]', e);
      }
    };

    realtimeSocket.onclose = () => {
      if (realtimePingInterval) clearInterval(realtimePingInterval);
      scheduleRealtimeReconnect();
    };

    realtimeSocket.onerror = () => {
      try { realtimeSocket.close(); } catch(e) {}
      scheduleRealtimeReconnect();
    };
  } catch(err) {
    scheduleRealtimeReconnect();
    connectRealtimeSSEFallback();
  }
}

function scheduleRealtimeReconnect() {
  if (realtimeReconnectTimeout) return;
  realtimeReconnectAttempts++;
  const baseDelay = Math.min(1000 * Math.pow(1.5, Math.min(realtimeReconnectAttempts, 8)), MAX_RECONNECT_DELAY);
  const jitter = Math.random() * 600;
  const delay = Math.round(baseDelay + jitter);

  console.log(`[NiceJobs Realtime] Reconnecting in ${delay}ms (attempt #${realtimeReconnectAttempts})...`);
  realtimeReconnectTimeout = setTimeout(() => {
    realtimeReconnectTimeout = null;
    connectRealtimeWebSocket();
  }, delay);
}

function connectRealtimeSSEFallback() {
  if (window.EventSource && !realtimeEventSource) {
    try {
      const uId = state.currentUser?.id || '';
      const bId = state.currentUser?.business_id || state.activeHotelId || '';
      realtimeEventSource = new EventSource(`/api/realtime/stream?user_id=${encodeURIComponent(uId)}&business_id=${encodeURIComponent(bId)}`);
      realtimeEventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleRealtimeEvent(payload);
        } catch(e) {}
      };
      realtimeEventSource.onerror = () => {
        if (realtimeEventSource) {
          realtimeEventSource.close();
          realtimeEventSource = null;
        }
      };
    } catch(e) {}
  }
}

async function handleRealtimeEvent(payload) {
  if (!payload || !payload.type) return;

  // Deduplicate events to prevent double processing
  const evtId = payload.event_id || (payload.data && payload.data.event_id);
  if (evtId) {
    if (realtimeProcessedEventIds.has(evtId)) return;
    realtimeProcessedEventIds.add(evtId);
    if (realtimeProcessedEventIds.size > 300) {
      const oldestKey = realtimeProcessedEventIds.values().next().value;
      realtimeProcessedEventIds.delete(oldestKey);
    }
  }

  const { type, data } = payload;

  switch (type) {
    case 'job_created': {
      try {
        const res = await fetch('/api/jobs?status=active');
        if (res.ok) state.jobs = await res.json();
      } catch(e) {}

      if (state.currentScreen === 'home') {
        const viewport = document.getElementById('app-viewport');
        if (viewport) await renderHomeScreen(viewport);
      } else if (state.currentScreen === 'recruiter-dashboard') {
        const myBizId = state.currentUser?.business_id || state.activeHotelId;
        if (data && data.business_id === myBizId) {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderRecruiterDashboard(viewport);
        }
      }
      
      showToast(`✨ New Vacancy Live: ${escapeHtml(data?.title || 'Job Post')} at ${escapeHtml(data?.brand_name || 'Hospitality Employer')}`, 'success');
      playRealtimeChime();
      break;
    }

    case 'job_updated':
    case 'job_status_changed': {
      try {
        const res = await fetch('/api/jobs?status=active');
        if (res.ok) state.jobs = await res.json();
      } catch(e) {}
      if (state.currentScreen === 'home' || state.currentScreen === 'recruiter-dashboard' || state.currentScreen === 'admin-dashboard') {
        const viewport = document.getElementById('app-viewport');
        if (viewport) renderApp();
      }
      break;
    }

    case 'job_deleted': {
      if (data && data.job_id) {
        state.jobs = (state.jobs || []).filter(j => j.id !== data.job_id);
        const card = document.querySelector(`[data-job-id="${data.job_id}"], tr[data-job-id="${data.job_id}"]`);
        if (card) {
          card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => card.remove(), 300);
        } else if (state.currentScreen === 'home' || state.currentScreen === 'recruiter-dashboard' || state.currentScreen === 'admin-dashboard') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) renderApp();
        }
      }
      break;
    }

    case 'application_created': {
      const myBizId = state.currentUser?.business_id || state.activeHotelId;
      if (data && data.business_id && data.business_id === myBizId) {
        playRealtimeChime();
        showToast(`💼 New Application! ${escapeHtml(data.candidate_name)} applied for ${escapeHtml(data.job_title)}`, 'success');

        if (state.currentScreen === 'ats') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderATSBoard(viewport);
        } else if (state.currentScreen === 'recruiter-dashboard') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderRecruiterDashboard(viewport);
        }
      }
      break;
    }

    case 'application_submitted': {
      if (state.currentUser && state.currentUser.role === 'jobseeker') {
        try {
          const appsRes = await fetch(`/api/applications?user_id=${state.currentUser.id}`);
          if (appsRes.ok) state.applications = await appsRes.json();
        } catch(e) {}

        if (state.currentScreen === 'applications') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderApplicationsScreen(viewport);
        }
      }
      break;
    }

    case 'application_status_updated': {
      if (state.currentUser && state.currentUser.role === 'jobseeker') {
        playRealtimeChime();
        const statusLabel = (data.status || '').replace('_', ' ').toUpperCase();
        showToast(`🎉 Application Update: Your application for ${escapeHtml(data.job_title)} is now "${statusLabel}"`, 'success');

        try {
          const appsRes = await fetch(`/api/applications?user_id=${state.currentUser.id}`);
          if (appsRes.ok) state.applications = await appsRes.json();
        } catch(e) {}

        if (state.currentScreen === 'applications') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderApplicationsScreen(viewport);
        }
      } else if (state.currentScreen === 'ats') {
        const viewport = document.getElementById('app-viewport');
        if (viewport) await renderATSBoard(viewport);
      }
      break;
    }

    case 'ats_updated': {
      const myBizId = state.currentUser?.business_id || state.activeHotelId;
      if (state.currentScreen === 'ats') {
        const viewport = document.getElementById('app-viewport');
        if (viewport) await renderATSBoard(viewport);
      } else if (state.currentScreen === 'recruiter-dashboard') {
        const viewport = document.getElementById('app-viewport');
        if (viewport) await renderRecruiterDashboard(viewport);
      }
      break;
    }

    case 'notification_created': {
      if (!state.notifications) state.notifications = [];
      if (!state.notifications.some(n => n.id === data.id)) {
        state.notifications.unshift(data);
      }
      updateNavigation();
      playRealtimeChime();
      showToast(`🔔 ${escapeHtml(data.title)}: ${escapeHtml(data.message)}`, 'info');
      const notifsModal = document.getElementById('modal-notifs');
      if (notifsModal) {
        openNotificationsModal();
      }
      break;
    }

    case 'notifications_read': {
      if (state.notifications) {
        state.notifications.forEach(n => { n.is_read = 1; });
      }
      updateNavigation();
      const notifsModal = document.getElementById('modal-notifs');
      if (notifsModal) {
        openNotificationsModal();
      }
      break;
    }

    case 'saved_jobs_updated': {
      if (data && data.is_saved !== undefined) {
        if (data.is_saved) {
          if (!state.savedJobs) state.savedJobs = [];
          if (!state.savedJobs.some(j => j.id === data.job_id)) {
            const match = (state.jobs || []).find(j => j.id === data.job_id);
            if (match) state.savedJobs.push(match);
          }
        } else {
          if (state.savedJobs) {
            state.savedJobs = state.savedJobs.filter(j => j.id !== data.job_id);
          }
        }
        if (state.currentScreen === 'saved-jobs') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) renderSavedJobsScreen(viewport);
        }
      }
      break;
    }

    case 'conversation_created': {
      if (!state.conversations) state.conversations = [];
      if (!state.conversations.some(c => c.id === data.id)) {
        state.conversations.unshift(data);
      }
      updateNavigation();
      if (state.currentScreen === 'inbox') {
        const viewport = document.getElementById('app-viewport');
        if (viewport) await renderInboxScreen(viewport);
      }
      break;
    }

    case 'chat_message': {
      const currentConvId = state.activeConvId || state.activeConversationId;
      const isCurrentActive = (state.currentScreen === 'inbox' && currentConvId === data.conversation_id);
      const isMine = (state.currentUser && data.sender_id === state.currentUser.id)
        || (state.currentRole === 'recruiter' && data.sender_role === 'business')
        || (state.currentRole !== 'recruiter' && data.sender_role === 'user');

      const stream = document.getElementById('chat-stream-scroll');
      if (isCurrentActive && stream) {
        // If my message and temporary bubble exists, upgrade it
        if (data.temp_id) {
          const tempBubble = stream.querySelector(`[data-msg-id="${data.temp_id}"]`);
          if (tempBubble) {
            tempBubble.setAttribute('data-msg-id', data.message_id || data.temp_id);
            const mark = tempBubble.querySelector('.bubble-status-mark');
            if (mark) {
              if (data.status === 'delivered') {
                mark.className = 'bubble-status-mark status-delivered';
                mark.textContent = '✓✓';
              } else if (data.status === 'read') {
                mark.className = 'bubble-status-mark status-read';
                mark.textContent = '✓✓';
              } else {
                mark.className = 'bubble-status-mark status-sent';
                mark.textContent = '✓';
              }
            }
            moveThreadRowToTop(data.conversation_id, data.content, data.timestamp ? data.timestamp.split(' ')[1] : 'Just now');
            return;
          }
        }

        // Check if message already in stream by message_id
        if (data.message_id && stream.querySelector(`[data-msg-id="${data.message_id}"]`)) {
          return;
        }

        // Smart scroll detection before adding
        const isNearBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight < 120);

        const emptyPrompt = stream.querySelector('.empty-chat-prompt');
        if (emptyPrompt) emptyPrompt.remove();

        const typingRow = document.getElementById('chat-typing-indicator');
        if (typingRow) typingRow.style.display = 'none';

        const bubbleRow = document.createElement('div');
        bubbleRow.className = `chat-bubble-row ${isMine ? 'mine' : 'theirs'}`;
        if (data.message_id) bubbleRow.setAttribute('data-msg-id', data.message_id);
        bubbleRow.style.animation = 'fadeIn 0.2s ease';

        const bodyHtml = (typeof renderChatMessageContentHtml === 'function') 
          ? renderChatMessageContentHtml(data.content)
          : `<div class="bubble-text-box">${escapeHtml(data.content)}</div>`;
        const statusHtml = renderChatMessageStatusHtml(data, isMine);

        bubbleRow.innerHTML = `
          <span class="bubble-author-title">${escapeHtml(data.sender_name || (isMine ? 'You' : 'Participant'))}</span>
          ${bodyHtml}
          <span class="bubble-timestamp">
            <span>${escapeHtml(data.timestamp || 'Just now')}</span>
            ${statusHtml}
          </span>
        `;

        if (typingRow) {
          stream.insertBefore(bubbleRow, typingRow);
        } else {
          stream.appendChild(bubbleRow);
        }

        if (isNearBottom || isMine) {
          stream.scrollTop = stream.scrollHeight;
        }

        // Move thread to top
        moveThreadRowToTop(data.conversation_id, data.content, data.timestamp ? data.timestamp.split(' ')[1] : 'Just now');

        if (!isMine) {
          playRealtimeChime();
          // Send instant read receipt since active conversation is open in view
          sendChatMessageRead(data.conversation_id);
        }
      } else {
        // Different conversation or different screen
        if (!isMine) {
          playRealtimeChime();
          let preview = data.content || '';
          if (preview.startsWith('[IMAGE]')) preview = '📷 Sent a photo';
          else if (preview.startsWith('[VOICE]')) preview = '🎙️ Sent a voice message';
          else if (preview.startsWith('[DOC]')) preview = '📄 Sent a document';
          showToast(`💬 ${escapeHtml(data.sender_name)}: ${escapeHtml(preview)}`, 'info');

          // Increment unread count in state and update navbar
          const conv = (state.conversations || []).find(c => c.id === data.conversation_id);
          if (conv) {
            if (state.currentRole === 'recruiter') {
              conv.unread_for_business = (conv.unread_for_business || 0) + 1;
            } else {
              conv.unread_for_user = (conv.unread_for_user || 0) + 1;
            }
            conv.last_message = data.content;
            conv.last_message_time = data.timestamp;
          }
          updateNavigation();

          // Update left sidebar thread row if inbox is currently rendered
          if (state.currentScreen === 'inbox') {
            const threadEl = document.querySelector(`[data-conv-id="${data.conversation_id}"]`);
            if (threadEl) {
              const snip = threadEl.querySelector('.thread-snippet');
              if (snip) snip.textContent = data.content.startsWith('[') ? 'Attachment' : data.content;
              const tm = threadEl.querySelector('.thread-time-label');
              if (tm) tm.textContent = data.timestamp ? data.timestamp.split(' ')[1] : 'Just now';
              
              let pill = threadEl.querySelector('.thread-unread-pill');
              const curCount = conv ? (state.currentRole === 'recruiter' ? conv.unread_for_business : conv.unread_for_user) : 1;
              if (pill) {
                pill.textContent = curCount;
              } else {
                const metaRow = threadEl.querySelector('.thread-meta-body > div:last-child');
                if (metaRow) {
                  const newPill = document.createElement('span');
                  newPill.className = 'thread-unread-pill';
                  newPill.textContent = curCount;
                  metaRow.appendChild(newPill);
                }
              }
              moveThreadRowToTop(data.conversation_id);
            }
          }
        }
      }
      break;
    }

    case 'message:read': {
      if (state.currentScreen === 'inbox' && state.activeConvId === data.conversation_id) {
        const stream = document.getElementById('chat-stream-scroll');
        if (stream) {
          const marks = stream.querySelectorAll('.chat-bubble-row.mine .bubble-status-mark');
          marks.forEach(m => {
            m.className = 'bubble-status-mark status-read';
            m.textContent = '✓✓';
            m.title = `Read by recipient at ${data.read_at || 'just now'}`;
          });
        }
      }
      break;
    }

    case 'typing:update': {
      if (state.currentScreen === 'inbox' && state.activeConvId === data.conversation_id) {
        const indicator = document.getElementById('chat-typing-indicator');
        const label = document.getElementById('chat-typing-label');
        if (indicator) {
          if (data.is_typing) {
            if (label) label.textContent = `${escapeHtml(data.sender_name || 'Participant')} is typing...`;
            indicator.style.display = 'flex';
            const stream = document.getElementById('chat-stream-scroll');
            if (stream && (stream.scrollHeight - stream.scrollTop - stream.clientHeight < 100)) {
              stream.scrollTop = stream.scrollHeight;
            }
          } else {
            indicator.style.display = 'none';
          }
        }
      }
      break;
    }

    case 'presence:update': {
      if (state.currentScreen === 'inbox' && state.activeConvId) {
        const pill = document.getElementById('chat-counterpart-presence');
        if (pill) {
          const isOnline = data.status === 'online';
          pill.className = `chat-presence-pill ${isOnline ? 'online' : 'offline'}`;
          const label = pill.querySelector('.presence-label');
          if (label) label.textContent = isOnline ? 'Active now' : 'Offline';
        }
      }
      break;
    }

    case 'conversation:joined': {
      if (state.currentScreen === 'inbox' && state.activeConvId === data.conv_id) {
        const pill = document.getElementById('chat-counterpart-presence');
        if (pill && data.counterpart_online !== undefined) {
          const isOnline = Boolean(data.counterpart_online);
          pill.className = `chat-presence-pill ${isOnline ? 'online' : 'offline'}`;
          const label = pill.querySelector('.presence-label');
          if (label) label.textContent = isOnline ? 'Active now' : 'Offline';
        }
      }
      break;
    }

    case 'business_verified': {
      const myBizId = state.currentUser?.business_id || state.activeHotelId;
      if (myBizId && myBizId === data.business_id) {
        playRealtimeChime();
        showToast('✅ Verification Approved! Your hotel establishment is officially verified.', 'success');
        if (state.currentBusiness) {
          state.currentBusiness.verification_status = data.verification_status || 'verified';
        }
        if (state.currentScreen === 'recruiter-dashboard') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderRecruiterDashboard(viewport);
        }
      }
      break;
    }

    case 'business_updated': {
      const myBizId = state.currentUser?.business_id || state.activeHotelId;
      if (data && data.business_id === myBizId) {
        showToast('🏢 Business profile updated in real time.', 'info');
        if (state.currentScreen === 'recruiter-dashboard') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderRecruiterDashboard(viewport);
        }
      }
      break;
    }

    case 'profile_updated': {
      if (state.currentUser && state.currentUser.id === data.user_id) {
        try {
          const profRes = await fetch(`/api/profile?user_id=${state.currentUser.id}`);
          if (profRes.ok) state.profile = await profRes.json();
        } catch(e) {}
        if (state.currentScreen === 'profile') {
          const viewport = document.getElementById('app-viewport');
          if (viewport) await renderProfileScreen(viewport);
        }
      }
      break;
    }
  }
}

// ==========================================================================
// Data Fetching
// ==========================================================================

async function loadInitialData() {
  try {
    state.demoDataHidden = true;

    const [jobsRes, bizRes, blogsRes] = await Promise.all([
      fetch('/api/jobs?status=active'),
      fetch('/api/businesses'),
      fetch('/api/blogs')
    ]);
    state.jobs = jobsRes.ok ? await jobsRes.json() : [];
    state.businesses = bizRes.ok ? await bizRes.json() : [];
    state.blogs = blogsRes.ok ? await blogsRes.json() : [];

    if (state.currentUser && state.currentUser.role === 'jobseeker') {
      const [appsRes, savedRes, notifRes, profRes, convRes] = await Promise.all([
        fetch(`/api/applications?user_id=${state.currentUser.id}`),
        fetch(`/api/saved-jobs?user_id=${state.currentUser.id}`),
        fetch(`/api/notifications?user_id=${state.currentUser.id}`),
        fetch(`/api/profile?user_id=${state.currentUser.id}`),
        fetch(`/api/conversations?user_id=${state.currentUser.id}`)
      ]);
      state.applications = appsRes.ok ? await appsRes.json() : [];
      state.savedJobs = savedRes.ok ? await savedRes.json() : [];
      state.notifications = notifRes.ok ? await notifRes.json() : [];
      state.profile = profRes.ok ? await profRes.json() : null;
      state.conversations = convRes.ok ? await convRes.json() : [];
    } else if (state.currentUser && state.currentUser.role === 'recruiter') {
      const bId = state.currentUser.business_id || state.activeHotelId;
      if (bId) {
        const convRes = await fetch(`/api/conversations?business_id=${bId}`);
        state.conversations = convRes.ok ? await convRes.json() : [];
      } else {
        state.conversations = [];
      }
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

// ==========================================================================
// Navigation Rendering
// ==========================================================================

function updateNavigation() {
  const navList = document.getElementById('main-nav-links');
  const actionsContainer = document.getElementById('nav-actions-container');
  const mobileNavList = document.getElementById('mobile-nav-links');
  const mobileActions = document.getElementById('mobile-nav-actions');
  if (!navList || !actionsContainer) return;

  const role = state.currentRole;
  const screen = state.currentScreen;

  let linksHtml = '';
  let actionsHtml = '';
  let mobileActionsHtml = '';

  if (role === 'jobseeker' && state.currentUser) {
    // Only display number beside Applications if there is an unseen application notification
    const unseenAppNotifs = (state.notifications || []).filter(n => !n.is_read && n.type === 'application').length;
    // Display number beside Messages for unseen texts
    const unseenTexts = (state.conversations || []).reduce((acc, c) => acc + (c.unread_for_user || 0), 0);
    const totalUnreadNotifs = (state.notifications || []).filter(n => !n.is_read).length;

    linksHtml = `
      <li class="nav-item"><a href="#home" onclick="navigateTo('home'); return false;" class="${screen === 'home' ? 'active' : ''}">Jobs</a></li>
      <li class="nav-item"><a href="#hotels" onclick="navigateTo('hotels'); return false;" class="${screen === 'hotels' ? 'active' : ''}">Hotels</a></li>
      <li class="nav-item"><a href="#blog" onclick="navigateTo('blog'); return false;" class="${screen === 'blog' ? 'active' : ''}">Blog</a></li>
      <li class="nav-item">
        <a href="#applications" onclick="navigateTo('applications'); return false;" class="${screen === 'applications' ? 'active' : ''}">
          Applications${unseenAppNotifs > 0 ? ` <span class="badge-count">${unseenAppNotifs}</span>` : ''}
        </a>
      </li>
      <li class="nav-item"><a href="#saved" onclick="navigateTo('saved'); return false;" class="${screen === 'saved' ? 'active' : ''}">Saved</a></li>
      <li class="nav-item">
        <a href="#inbox" onclick="navigateTo('inbox'); return false;" class="${screen === 'inbox' ? 'active' : ''}">
          Messages${unseenTexts > 0 ? ` <span class="badge-count">${unseenTexts}</span>` : ''}
        </a>
      </li>
    `;

    actionsHtml = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn-icon" style="position: relative; color: var(--white); border-radius: 50%; width: 38px; height: 38px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1);" onclick="openNotificationsModal()" title="Notifications">
          ${svgIcon('bell', '', 17)}
          ${totalUnreadNotifs > 0 ? `<span class="badge-count" style="position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px; font-size: 0.65rem; padding: 0 4px; display: flex; align-items: center; justify-content: center;">${totalUnreadNotifs}</span>` : ''}
        </button>
        <div class="user-profile-badge" id="nav-candidate-profile-badge" onclick="navigateTo('profile')" style="cursor: pointer;" title="View Candidate Profile">
          <img src="${state.currentUser.avatar || DEFAULT_AVATAR_PREVIEW}" alt="${state.currentUser.name}">
          <div class="user-badge-info">
            <span class="user-badge-name">${state.currentUser.name}</span>
          </div>
        </div>
        <button class="btn-secondary nav-signout-btn" style="font-size: 0.78rem; padding: 6px 14px;" onclick="switchRole('guest')" title="Sign Out">Sign Out</button>
      </div>
    `;

    mobileActionsHtml = `
      <div class="mobile-user-card" onclick="navigateTo('profile'); closeMobileMenu();" style="cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 14px; border: 1px solid rgba(255,255,255,0.12);">
        <img src="${state.currentUser.avatar || DEFAULT_AVATAR_PREVIEW}" alt="${state.currentUser.name}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.2);">
        <div>
          <div style="font-weight: 700; color: #ffffff; font-size: 0.95rem;">${state.currentUser.name}</div>
          <div style="font-size: 0.78rem; color: var(--text-dim); font-weight: 500;">View Profile →</div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px;">
        <button class="btn-secondary" style="justify-content: center; padding: 10px;" onclick="openNotificationsModal(); closeMobileMenu();">
          ${svgIcon('bell', '', 15)} Alerts ${totalUnreadNotifs > 0 ? `(${totalUnreadNotifs})` : ''}
        </button>
        <button class="btn-secondary" style="justify-content: center; padding: 10px;" onclick="switchRole('guest'); closeMobileMenu();">Sign Out</button>
      </div>
    `;
  } else if (role === 'recruiter' && state.currentUser) {
    const currentBizId = state.currentUser?.business_id || state.activeHotelId || 'biz_radisson';
    const unseenBizTexts = (state.conversations || []).reduce((acc, c) => acc + (c.unread_for_business || 0), 0);
    linksHtml = `
      <li class="nav-item"><a href="#recruiter-dashboard" onclick="navigateTo('recruiter-dashboard'); return false;" class="${screen === 'recruiter-dashboard' ? 'active' : ''}">Dashboard</a></li>
      <li class="nav-item"><a href="#ats" onclick="navigateTo('ats'); return false;" class="${screen === 'ats' ? 'active' : ''}">Candidates</a></li>
      <li class="nav-item"><a href="#hotels?id=${currentBizId}" onclick="navigateTo('hotels', { id: '${currentBizId}' }); return false;" class="${screen === 'hotels' ? 'active' : ''}">Hotel Profile</a></li>
      <li class="nav-item"><a href="#blog" onclick="navigateTo('blog'); return false;" class="${screen === 'blog' ? 'active' : ''}">Blog</a></li>
      <li class="nav-item">
        <a href="#inbox" onclick="navigateTo('inbox'); return false;" class="${screen === 'inbox' ? 'active' : ''}">
          Messages${unseenBizTexts > 0 ? ` <span class="badge-count">${unseenBizTexts}</span>` : ''}
        </a>
      </li>
    `;
    const initials = (state.currentUser.name || 'HR').split(' ').map(n=>n[0]).join('').slice(0,2);
    actionsHtml = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="user-profile-badge" id="nav-biz-user-profile-badge" onclick="openBusinessUserEditProfileModal()" style="cursor: pointer;" title="Edit My Profile">
          ${state.currentUser.avatar ? `<img src="${state.currentUser.avatar}" alt="${escapeHtml(state.currentUser.name)}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255, 255, 255, 0.25);">` : `<div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); border: 1.5px solid rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #ffffff;">${initials}</div>`}
          <div class="user-badge-info">
            <span class="user-badge-name">${escapeHtml(state.currentUser.name)}</span>
          </div>
        </div>
        <button class="btn-secondary nav-signout-btn" style="font-size: 0.78rem; padding: 6px 14px;" onclick="switchRole('guest')" title="Sign Out">Sign Out</button>
      </div>
    `;
    mobileActionsHtml = `
      <div class="mobile-user-card" onclick="openBusinessUserEditProfileModal(); closeMobileMenu();" style="cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); margin-bottom: 8px;">
        ${state.currentUser.avatar ? `<img src="${state.currentUser.avatar}" alt="${escapeHtml(state.currentUser.name)}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.2);">` : `<div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); border: 2px solid rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #ffffff;">${initials}</div>`}
        <div>
          <div style="font-weight: 700; color: #ffffff; font-size: 0.95rem;">${escapeHtml(state.currentUser.name)}</div>
          <div style="font-size: 0.78rem; color: var(--text-dim); font-weight: 500;">Edit Profile →</div>
        </div>
      </div>
      <button class="btn-secondary" style="width: 100%; justify-content: center; padding: 10px;" onclick="switchRole('guest'); closeMobileMenu();">Sign Out</button>
    `;
  } else if (role === 'admin' && state.currentUser && state.currentUser.role === 'admin') {
    linksHtml = `
      <li class="nav-item"><a href="#admin" onclick="navigateTo('admin'); return false;" class="${screen === 'admin' ? 'active' : ''}">${svgIcon('shield_check', '', 14)} Admin Console</a></li>
      <li class="nav-item"><a href="#home" onclick="navigateTo('home'); return false;" class="${screen === 'home' ? 'active' : ''}">Jobs</a></li>
      <li class="nav-item"><a href="#hotels" onclick="navigateTo('hotels'); return false;" class="${screen === 'hotels' ? 'active' : ''}">Hotels</a></li>
      <li class="nav-item"><a href="#blog" onclick="navigateTo('blog'); return false;" class="${screen === 'blog' ? 'active' : ''}">Blog</a></li>
      <li class="nav-item"><a href="#inbox" onclick="navigateTo('inbox'); return false;" class="${screen === 'inbox' ? 'active' : ''}">Messages</a></li>
    `;
    actionsHtml = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="badge-urgent" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: #ef4444;">${svgIcon('shield_check', '', 12)} Root Admin</span>
        <button class="btn-secondary" style="font-size: 0.78rem; padding: 6px 14px;" onclick="adminSignOut()" title="Sign Out">Sign Out</button>
      </div>
    `;
    mobileActionsHtml = `
      <button class="btn-secondary" style="width: 100%; justify-content: center; padding: 10px;" onclick="adminSignOut(); closeMobileMenu();">Sign Out (Admin)</button>
    `;
  } else {
    // Guest
    linksHtml = `
      <li class="nav-item"><a href="#home" onclick="navigateTo('home'); return false;" class="${screen === 'home' ? 'active' : ''}">Jobs</a></li>
      <li class="nav-item"><a href="#hotels" onclick="navigateTo('hotels'); return false;" class="${screen === 'hotels' ? 'active' : ''}">Employers</a></li>
      <li class="nav-item"><a href="#blog" onclick="navigateTo('blog'); return false;" class="${screen === 'blog' ? 'active' : ''}">Blog</a></li>
      <li class="nav-item"><a href="#inbox" onclick="navigateTo('inbox'); return false;" class="${screen === 'inbox' ? 'active' : ''}">Messages</a></li>
      <li class="nav-item"><a href="#resources" onclick="navigateTo('resources'); return false;" class="${screen === 'resources' ? 'active' : ''}">About</a></li>
    `;
    actionsHtml = `
      <button class="btn-secondary nav-guest-signin" onclick="startLoginFlow('candidate')">Log In</button>
      <button class="btn-orange nav-guest-getstarted" onclick="startSignupFlow('candidate')">Sign Up</button>
    `;
    mobileActionsHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <button class="btn-secondary" style="justify-content: center; padding: 11px;" onclick="startLoginFlow('candidate'); closeMobileMenu();">Log In</button>
        <button class="btn-orange" style="justify-content: center; padding: 11px;" onclick="startSignupFlow('candidate'); closeMobileMenu();">Sign Up</button>
      </div>
    `;
  }

  navList.innerHTML = linksHtml;
  actionsContainer.innerHTML = actionsHtml;

  if (mobileNavList) {
    mobileNavList.innerHTML = linksHtml;
  }
  if (mobileActions) {
    mobileActions.innerHTML = mobileActionsHtml;
  }
}

// ==========================================================================
// Master Screen Router
// ==========================================================================

async function renderApp() {
  purgeDemoBarPermanently();
  updateNavigation();
  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  const screen = state.currentScreen;

  if (screen === 'inbox') {
    document.body.classList.add('screen-inbox');
  } else {
    document.body.classList.remove('screen-inbox');
  }

  if (screen === 'home') {
    await renderHomeScreen(viewport);
  } else if (screen === 'job-details') {
    await renderJobDetailScreen(viewport, state.activeJobId);
  } else if (screen === 'hotels') {
    await renderHotelsScreen(viewport, state.activeHotelId);
  } else if (screen === 'applications') {
    await renderApplicationsScreen(viewport);
  } else if (screen === 'saved') {
    await renderSavedJobsScreen(viewport);
  } else if (screen === 'profile') {
    await renderProfileScreen(viewport);
  } else if (screen === 'recruiter-dashboard') {
    await renderRecruiterDashboard(viewport);
  } else if (screen === 'ats') {
    await renderATSBoard(viewport);
  } else if (screen === 'inbox') {
    await renderInboxScreen(viewport);
  } else if (screen === 'admin-login') {
    renderAdminLoginScreen(viewport);
  } else if (screen === 'admin') {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      showToast('Authentication required: Root Administrator clearance is required.', 'warning');
      navigateTo('admin-login');
      return;
    }
    await renderAdminScreen(viewport);
  } else if (screen === 'blog' || screen === 'blog-post') {
    await renderBlogScreen(viewport);
  } else if (screen === 'resources') {
    renderResourcesScreen(viewport);
  } else if (screen === 'login' || screen === 'auth-portal') {
    renderLoginPage(viewport);
  } else if (screen === 'signup' || screen === 'auth-initial-info' || screen === 'auth-otp') {
    renderSignupPage(viewport);
  } else {
    await renderHomeScreen(viewport);
  }
}

// ==========================================================================
// Screen 1: Home & Job Discovery (Main Blue Theme, Orange Sub Theme)
// ==========================================================================

async function renderHomeScreen(viewport) {
  const hasFilter = Boolean(
    state.search.query || state.search.location || state.search.department ||
    state.search.designation || state.search.accommodation || state.search.duty_meals || state.search.urgent_only
  );

  let jobs;
  if (!hasFilter && state.jobs && state.jobs.length > 0) {
    jobs = [...state.jobs];
  } else {
    const params = new URLSearchParams();
    if (state.search.query) params.append('q', state.search.query);
    if (state.search.location) params.append('location', state.search.location);
    if (state.search.department) params.append('department', state.search.department);
    if (state.search.designation) params.append('designation', state.search.designation);
    if (state.search.accommodation) params.append('accommodation', 'true');
    if (state.search.duty_meals) params.append('duty_meals', 'true');
    if (state.search.urgent_only) params.append('urgent_only', 'true');

    const jobsRes = await fetch(`/api/jobs?${params.toString()}`);
    jobs = jobsRes.ok ? await jobsRes.json() : [];
    if (!hasFilter) state.jobs = jobs;
  }

  // Candidate sorting logic
  const sortBy = state.search.sort || 'featured';
  if (sortBy === 'salary_desc') {
    jobs.sort((a, b) => (b.salary_max || 0) - (a.salary_max || 0));
  } else if (sortBy === 'latest') {
    jobs.sort((a, b) => (b.id > a.id ? 1 : -1));
  } else {
    // Default featured: featured first, then urgent
    jobs.sort((a, b) => {
      if (b.is_featured !== a.is_featured) return (b.is_featured || 0) - (a.is_featured || 0);
      if (b.is_urgent !== a.is_urgent) return (b.is_urgent || 0) - (a.is_urgent || 0);
      return 0;
    });
  }

  const isGuest = state.currentRole === 'guest' || !state.currentUser;

  viewport.innerHTML = `
    ${isGuest ? `
    <!-- Modern Dark Glassmorphism Hero Section (Matching Reference Image) -->
    <section class="hero-glass-section">
      <div class="hero-left-col">
        <div class="hero-chip">
          <span class="orange-dot"></span> Hospitality Careers
        </div>
        <h1 class="hero-title">
          Your Next<br>Opportunity <span class="text-orange">Awaits</span>
        </h1>
        <p class="hero-subtitle">
          Verified roles at premier hotels, resorts, and fine dining across Bangladesh.
        </p>

        <!-- Glass Capsule Search Bar with Autocomplete -->
        <div class="hero-search-capsule" id="hero-search-capsule" style="position: relative;">
          <div class="capsule-field capsule-main-query">
            <span class="field-icon">${svgIcon('search', '', 16)}</span>
            <input type="text" id="input-search-q" placeholder="Job title, role or keyword" value="${state.search.query}" oninput="handleGuestSearchInput(this.value)" onfocus="handleGuestSearchFocus(this.value)" onclick="showHeroExtraFields()" onkeydown="if(event.key==='Enter') executeSearch()" autocomplete="off">
            <button type="button" class="btn-hero-filter-expand" id="btn-hero-filter-expand" onclick="toggleHeroExtraFields()" title="Location & Department Filters">
              ${svgIcon('sliders', '', 14)}
            </button>
          </div>
          <div class="hero-capsule-extra-fields ${(state.search.location || state.search.department) ? 'is-expanded' : ''}" id="hero-capsule-extra-fields">
            <div class="capsule-divider"></div>
            <div class="capsule-field field-location" style="position: relative;">
              <span class="field-icon">${svgIcon('mapPin', '', 15)}</span>
              <button type="button" class="capsule-field-trigger" id="trigger-hero-loc" onclick="toggleSearchCustomDropdown('hero-loc', event)" aria-haspopup="listbox" aria-expanded="false">
                <span class="trigger-label">${getSearchLocationLabel(state.search.location, false)}</span>
                <span class="trigger-chevron">${svgIcon('chevronDown', '', 13)}</span>
              </button>
              <input type="hidden" id="select-search-loc" value="${state.search.location || ''}">
              <div id="dropdown-hero-loc" class="custom-filter-dropdown" style="display: none; top: calc(100% + 8px); min-width: 240px;">
                ${SEARCH_LOCATIONS.map(loc => `
                  <div class="guest-sugg-item ${state.search.location === loc.value ? 'selected' : ''}" onclick="selectSearchFilter('location', '${loc.value.replace(/'/g, "\\'")}', '${(loc.shortLabel || loc.label).replace(/'/g, "\\'")}')">
                    <span class="field-icon-bullet">${svgIcon('mapPin', '', 13)}</span>
                    <span class="sugg-item-title">${loc.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="capsule-divider"></div>
            <div class="capsule-field" style="position: relative;">
              <span class="field-icon">${svgIcon('briefcase', '', 15)}</span>
              <button type="button" class="capsule-field-trigger" id="trigger-hero-dept" onclick="toggleSearchCustomDropdown('hero-dept', event)" aria-haspopup="listbox" aria-expanded="false">
                <span class="trigger-label">${state.search.department || 'Department'}</span>
                <span class="trigger-chevron">${svgIcon('chevronDown', '', 13)}</span>
              </button>
              <input type="hidden" id="select-search-dept" value="${state.search.department || ''}">
              <div id="dropdown-hero-dept" class="custom-filter-dropdown" style="display: none; top: calc(100% + 8px); min-width: 250px;">
                <div class="guest-sugg-item ${!state.search.department ? 'selected' : ''}" onclick="selectSearchFilter('department', '', 'Department')">
                  <span class="field-icon-bullet">${svgIcon('briefcase', '', 13)}</span>
                  <span class="sugg-item-title">All Departments</span>
                </div>
                ${HOTEL_ALL_DEPARTMENTS.map(d => `
                  <div class="guest-sugg-item ${state.search.department === d ? 'selected' : ''}" onclick="selectSearchFilter('department', '${d.replace(/'/g, "\\'")}', '${d.replace(/'/g, "\\'")}')">
                    <span class="field-icon-bullet">${svgIcon('briefcase', '', 13)}</span>
                    <span class="sugg-item-title">${d}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <button class="hero-search-btn" onclick="executeSearch()" title="Search Opportunities">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            <span class="hero-btn-label">Search</span>
          </button>
          <div id="guest-search-dropdown" class="guest-search-dropdown" style="display: none;"></div>
        </div>
      </div>

      <!-- Right 3D Perspective Visual Frame -->
      <div class="hero-perspective-wrap">
        <div class="perspective-back-frame"></div>
        <div class="perspective-main-card">
          <img src="/static/images/bell_image.png" alt="Luxury Hospitality Concierge Bell">
          <div class="perspective-overlay"></div>
        </div>
      </div>
    </section>

    <div id="jobs-feed-anchor"></div>
    ` : `
    <!-- CANDIDATE LOGGED-IN CONSOLE -->
    <div class="candidate-home-header" style="margin-bottom: 24px;">
      <div style="margin-bottom: 16px;">
        <h1 class="candidate-hero-heading">
          Find Your Next <span class="text-orange">Opportunity</span>
        </h1>
        <p style="color: rgba(255, 255, 255, 0.65); font-size: 0.95rem; margin-top: 4px;">
          Direct hotel applications with verified 5-star properties across Bangladesh.
        </p>
      </div>

      <!-- Top Search Bar Container (With Designation beside Department) -->
      <div class="search-container" style="margin-bottom: 12px;">
        <div class="search-main-row">
          <div class="search-field" style="position: relative;">
            <span class="field-icon">${svgIcon('search', '', 16)}</span>
            <input type="text" id="input-search-q" placeholder="Job title, keywords, or hotel name..." value="${state.search.query}" oninput="handleCandidateSearchInput(this.value)" onfocus="handleCandidateSearchFocus(this.value)" onclick="showCandidateExtraFields()" onkeydown="if(event.key==='Enter') executeSearch()" autocomplete="off">
            <div id="candidate-search-dropdown" class="candidate-search-dropdown" style="display: none;"></div>
          </div>
          <div class="mobile-search-extra-fields ${(state.search.location || state.search.department || state.search.designation) ? 'is-expanded' : ''}" id="candidate-mobile-extra-fields">
            <div class="search-field" style="position: relative;">
              <span class="field-icon">${svgIcon('mapPin', '', 16)}</span>
              <button type="button" class="search-field-trigger" id="trigger-search-loc" onclick="toggleSearchCustomDropdown('search-loc', event)" aria-haspopup="listbox" aria-expanded="false">
                <span class="trigger-label">${getSearchLocationLabel(state.search.location, true)}</span>
                <span class="trigger-chevron">${svgIcon('chevronDown', '', 14)}</span>
              </button>
              <input type="hidden" id="select-search-loc" value="${state.search.location || ''}">
              <div id="dropdown-search-loc" class="custom-filter-dropdown" style="display: none;">
                ${SEARCH_LOCATIONS.map(loc => `
                  <div class="guest-sugg-item ${state.search.location === loc.value ? 'selected' : ''}" onclick="selectSearchFilter('location', '${loc.value.replace(/'/g, "\\'")}', '${loc.label.replace(/'/g, "\\'")}')">
                    <span class="field-icon-bullet">${svgIcon('mapPin', '', 13)}</span>
                    <span class="sugg-item-title">${loc.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="search-field" style="position: relative;">
              <span class="field-icon">${svgIcon('briefcase', '', 16)}</span>
              <button type="button" class="search-field-trigger" id="trigger-search-dept" onclick="toggleSearchCustomDropdown('search-dept', event)" aria-haspopup="listbox" aria-expanded="false">
                <span class="trigger-label">${getSearchDepartmentLabel(state.search.department)}</span>
                <span class="trigger-chevron">${svgIcon('chevronDown', '', 14)}</span>
              </button>
              <input type="hidden" id="select-search-dept" value="${state.search.department || ''}">
              <div id="dropdown-search-dept" class="custom-filter-dropdown" style="display: none;">
                <div class="guest-sugg-item ${!state.search.department ? 'selected' : ''}" onclick="selectSearchFilter('department', '', 'All Departments')">
                  <span class="field-icon-bullet">${svgIcon('briefcase', '', 13)}</span>
                  <span class="sugg-item-title">All Departments</span>
                </div>
                ${HOTEL_ALL_DEPARTMENTS.map(d => `
                  <div class="guest-sugg-item ${state.search.department === d ? 'selected' : ''}" onclick="selectSearchFilter('department', '${d.replace(/'/g, "\\'")}', '${d.replace(/'/g, "\\'")}')">
                    <span class="field-icon-bullet">${svgIcon('briefcase', '', 13)}</span>
                    <span class="sugg-item-title">${d}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="search-field" style="position: relative;">
              <span class="field-icon">${svgIcon('user', '', 16)}</span>
              <button type="button" class="search-field-trigger" id="trigger-search-desig" onclick="toggleSearchCustomDropdown('search-desig', event)" aria-haspopup="listbox" aria-expanded="false">
                <span class="trigger-label">${getSearchDesignationLabel(state.search.designation)}</span>
                <span class="trigger-chevron">${svgIcon('chevronDown', '', 14)}</span>
              </button>
              <input type="hidden" id="select-search-desig" value="${state.search.designation || ''}">
              <div id="dropdown-search-desig" class="custom-filter-dropdown" style="display: none;">
                ${SEARCH_DESIGNATIONS.map(d => `
                  <div class="guest-sugg-item ${state.search.designation === d.value ? 'selected' : ''}" onclick="selectSearchFilter('designation', '${d.value.replace(/'/g, "\\'")}', '${d.label.replace(/'/g, "\\'")}')">
                    <span class="field-icon-bullet">${svgIcon('user', '', 13)}</span>
                    <span class="sugg-item-title">${d.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <button type="button" class="btn-mobile-search-expand" id="btn-toggle-candidate-filters" onclick="toggleMobileSearchFields()">
            <span>Location &amp; Department Filters</span> ${svgIcon('chevronDown', '', 14)}
          </button>
          <button class="btn-orange" onclick="executeSearch()" style="padding: 12px 24px; font-weight: 700; white-space: nowrap;">
            ${svgIcon('search', '', 15)} Search
          </button>
        </div>
      </div>
    </div>
    `}

    <!-- UNDER THE SEARCHBAR: THE POSTS START HERE -->
    <div class="content-grid" style="margin-top: 12px;">
      <!-- Main Job Vacancies Feed -->
      <section class="main-feed-area">
        <div class="section-header" style="align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
          <div>
            <h2 class="section-title" style="margin: 0; font-size: 1.35rem;">
              ${svgIcon('briefcase', '', 20)} Open Positions
            </h2>
            <p class="section-subtitle" style="margin: 2px 0 0 0;">
              <strong>${jobs.length}</strong> verified opening${jobs.length === 1 ? '' : 's'} available
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.8rem; color: var(--text-dim); font-weight: 600;">Sort By:</span>
            <select id="select-job-sort" onchange="setJobSort(this.value)" class="admin-select-filter" style="height: 34px; font-size: 0.82rem; padding: 4px 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--white); border-radius: var(--radius-md);">
              <option value="featured" ${sortBy === 'featured' ? 'selected' : ''}>Featured & Urgent</option>
              <option value="salary_desc" ${sortBy === 'salary_desc' ? 'selected' : ''}>Highest Salary (BDT)</option>
              <option value="latest" ${sortBy === 'latest' ? 'selected' : ''}>Newest First</option>
            </select>
          </div>
        </div>

        <div class="jobs-list">
          ${jobs.length === 0 ? `
            <div style="background: rgba(255, 255, 255, 0.035); padding: 48px; border-radius: var(--radius-lg); text-align: center; border: 1px dashed rgba(255, 255, 255, 0.1);">
              <div style="margin-bottom: 12px; color: var(--orange-primary);">${svgIcon('hotel', '', 40)}</div>
              <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 6px;">No job posts match your criteria</h3>
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">Try expanding your location or clearing active filters.</p>
              <button class="btn-orange" onclick="clearAllFilters()">Clear All Filters</button>
            </div>
          ` : jobs.map(job => renderJobCardHTML(job)).join('')}
        </div>
      </section>

      <!-- Sidebar Area: Sponsors Only -->
      <aside class="sidebar-area">
        <!-- Sponsor 1: Swiss Hospitality Management & AHLEI -->
        <div class="sponsored-box" style="background: rgba(255, 255, 255, 0.035); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 20px; padding: 22px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; background: rgba(255, 107, 0, 0.15); border: 1px solid rgba(255, 107, 0, 0.4); color: var(--orange-primary); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">SPONSORED</span>
            <span style="color: rgba(255, 255, 255, 0.45); font-size: 0.72rem; font-weight: 600;">AHLEI Certified</span>
          </div>
          <img src="/static/images/resort_beach.jpg" alt="Swiss Hospitality Management" style="width: 100%; height: 140px; object-fit: cover; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 12px;">
          <h4 style="font-size: 1.02rem; font-weight: 700; color: var(--white); margin: 0 0 6px 0;">Swiss Hospitality Management</h4>
          <p style="font-size: 0.82rem; color: rgba(255, 255, 255, 0.65); line-height: 1.5; margin: 0 0 14px 0;">
            AHLEI-accredited dual certification with direct placement assistance across luxury hotel groups.
          </p>
          <button class="btn-secondary" style="width: 100%; justify-content: center; font-size: 0.8rem; padding: 8px 12px;" onclick="showToast('Opened AHLEI Certification guide')">
            Explore Programs →
          </button>
        </div>

        <!-- Sponsor 2: Marriott South Asia Fast-Track -->
        <div class="sponsored-box" style="background: rgba(255, 255, 255, 0.035); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 20px; padding: 22px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; background: rgba(255, 107, 0, 0.15); border: 1px solid rgba(255, 107, 0, 0.4); color: var(--orange-primary); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">SPONSORED</span>
            <span style="color: rgba(255, 255, 255, 0.45); font-size: 0.72rem; font-weight: 600;">Official Partner</span>
          </div>
          <img src="/static/images/hero_lobby.jpg" alt="Marriott South Asia Fast-Track" style="width: 100%; height: 140px; object-fit: cover; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 12px;">
          <h4 style="font-size: 1.02rem; font-weight: 700; color: var(--white); margin: 0 0 6px 0;">Marriott South Asia Fast-Track</h4>
          <p style="font-size: 0.82rem; color: rgba(255, 255, 255, 0.65); line-height: 1.5; margin: 0 0 14px 0;">
            Accelerated supervisory track and cross-border mobility for high-potential hospitality talent.
          </p>
          <button class="btn-secondary" style="width: 100%; justify-content: center; font-size: 0.8rem; padding: 8px 12px;" onclick="showToast('Opened Marriott Partner Program details')">
            Partner Inquiries →
          </button>
        </div>
      </aside>
    </div>
  `;
}

function renderJobCardHTML(job) {
  const isUrgent = job.is_urgent === 1;
  const isFeatured = job.is_featured === 1;
  const isGuest = !state.currentUser || state.currentRole === 'guest';
  const isSaved = !isGuest && state.savedJobs && state.savedJobs.some(s => s.id === job.id || s.job_id === job.id);

  return `
    <article class="job-card job-card-interactive ${isFeatured ? 'featured-card' : ''} ${isUrgent ? 'urgent-card' : ''}" id="job-card-${job.id}">
      <div class="job-card-header" style="align-items: flex-start; justify-content: space-between; gap: 16px;">
        <div class="hotel-info-group" style="gap: 16px;">
          <img src="${job.logo_url || '/static/images/hero_lobby.jpg'}" alt="${job.brand_name}" class="hotel-thumb" style="width: 58px; height: 58px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <div class="hotel-details">
            <div class="hotel-name" style="margin-bottom: 2px;">
              <span>${job.brand_name}</span>
              <span class="verified-badge" title="Verified 5-Star Establishment">${svgIcon('shieldCheck', '', 14)}</span>
              <span class="hotel-star-pill" title="${job.star_rating || 5}-Star Property">${svgIcon('starFilled', '', 11)} ${job.star_rating || 5}★</span>
            </div>
            <a href="#job-details?id=${job.id}" class="job-title-link" onclick="openJobDetailModal('${job.id}'); return false;" style="font-size: 1.3rem;">
              ${job.title}
            </a>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          <!-- Prominent High-Attraction Salary Badge -->
          <div class="candidate-salary-card-badge">
            ${(job.is_negotiable || job.salary_period === 'negotiable' || (!job.salary_min && !job.salary_max))
              ? `৳ Negotiable`
              : `৳${(job.salary_min || 0).toLocaleString()} - ৳${(job.salary_max || 0).toLocaleString()} <span>/ mo</span>`
            }
          </div>

          <div class="card-badges">
            ${isUrgent ? `<span class="badge-urgent">${svgIcon('zap', '', 12)} Urgent Hiring</span>` : ''}
            ${isFeatured ? `<span class="badge-featured">${svgIcon('starFilled', '', 12)} Featured</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Metadata Items -->
      <div class="job-meta-row" style="margin: 10px 0 12px 0;">
        <div class="meta-item">
          ${svgIcon('mapPin', '', 14)} <strong>${job.property_location || job.city || 'Dhaka'}</strong>
        </div>
        <div class="meta-item">
          ${svgIcon('briefcase', '', 14)} ${job.department}
        </div>
        <div class="meta-item">
          ${svgIcon('clock', '', 14)} ${job.shift}
        </div>
        <div class="meta-item">
          ${svgIcon('fileText', '', 14)} ${job.employment_type}
        </div>
        <div class="meta-item">
          ${svgIcon('award', '', 14)} ${job.experience_level || 'Hospitality Experience'}
        </div>
      </div>

      <!-- Skills Schema Tags Preview (if present) -->
      ${Array.isArray(job.skill_requirements) && job.skill_requirements.length > 0 ? `
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
          ${job.skill_requirements.slice(0, 4).map(s => `<span class="schema-tag-badge" style="font-size: 0.72rem; padding: 2px 8px;">${s}</span>`).join('')}
          ${job.skill_requirements.length > 4 ? `<span style="font-size: 0.72rem; color: var(--text-dim); align-self: center;">+${job.skill_requirements.length - 4} more</span>` : ''}
        </div>
      ` : ''}

      <!-- Benefits & Perks Row (High candidate attraction points) -->
      ${(Array.isArray(job.benefits) && job.benefits.length > 0) ? `
        <div class="job-perks-row" style="margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 6px;">
          ${job.benefits.slice(0, 4).map(b => `
            <span class="perk-chip ${b.toLowerCase().includes('service charge') ? 'perk-highlight' : ''}">
              ${svgIcon(getBenefitIcon(b), '', 13)} ${b}
            </span>
          `).join('')}
          ${job.benefits.length > 4 ? `
            <span class="perk-chip" style="background: rgba(255, 255, 255, 0.05); color: var(--text-dim); border: 1px dashed var(--border-subtle);" title="${job.benefits.slice(4).join(', ')}">
              +${job.benefits.length - 4} more perks
            </span>
          ` : ''}
        </div>
      ` : ((job.service_charge_included || job.accommodation_provided || job.duty_meals_provided) ? `
        <div class="job-perks-row" style="margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 6px;">
          ${job.service_charge_included ? `<span class="perk-chip perk-highlight">${svgIcon('dollar', '', 13)} Service Charge</span>` : ''}
          ${job.accommodation_provided ? `<span class="perk-chip">${svgIcon('home', '', 13)} Accommodation</span>` : ''}
          ${job.duty_meals_provided ? `<span class="perk-chip">${svgIcon('utensils', '', 13)} Duty Meals</span>` : ''}
          <span class="perk-chip">${svgIcon('shield', '', 13)} Health Insurance</span>
        </div>
      ` : '')}

      <!-- Footer & Action Buttons -->
      <div class="job-card-footer">
        <span class="card-deadline" style="display: inline-flex; align-items: center; gap: 6px;">
          ${svgIcon('calendar', '', 13)} Deadline: <strong>${formatDisplayDate(job.deadline)}</strong>
        </span>
        <div class="card-actions">
          <button class="btn-icon ${isSaved ? 'saved' : ''}" title="${isGuest ? 'Log in to save favourite' : (isSaved ? 'Bookmarked' : 'Save Job Post')}" onclick="toggleSaveJob('${job.id}')">
            ${isSaved ? svgIcon('starFilled', '', 16) : svgIcon('star', '', 16)}
          </button>
          <button class="btn-icon" title="Share Job Post" onclick="shareJob('${job.id}', '${encodeURIComponent(job.title)}')">
            ${svgIcon('share', '', 16)}
          </button>
          <button class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="openJobDetailModal('${job.id}')">
            Details
          </button>
          <button class="btn-orange" style="padding: 8px 20px; font-size: 0.88rem; font-weight: 700;" onclick="handleApplyClick('${job.id}')">
            Apply Now →
          </button>
        </div>
      </div>
    </article>
  `;
}

function executeSearch() {
  state.search.query = document.getElementById('input-search-q')?.value || '';
  state.search.location = document.getElementById('select-search-loc')?.value || '';
  state.search.department = document.getElementById('select-search-dept')?.value || '';
  state.search.designation = document.getElementById('select-search-desig')?.value || '';
  renderHomeScreen(document.getElementById('app-viewport'));
}

const GUEST_AUTOCOMPLETE_ITEMS = [
  { label: 'Front Desk Officer / Receptionist', query: 'Front Desk', category: 'Front Office' },
  { label: 'Executive Chef / Sous Chef', query: 'Executive Chef', category: 'Kitchen' },
  { label: 'Housekeeping Supervisor / Attendant', query: 'Housekeeping', category: 'Rooms' },
  { label: 'Food & Beverage Service / Captain', query: 'F&B Manager', category: 'F&B Service' },
  { label: 'General Manager / Resident Manager', query: 'General Manager', category: 'Management' },
  { label: 'Guest Relations Executive', query: 'Guest Relations', category: 'Front Office' },
  { label: 'Hotel Job Posts in Dhaka', location: 'Dhaka', category: 'Location' },
  { label: 'Luxury Beach Resort Jobs in Cox\'s Bazar', location: 'Cox\'s Bazar', category: 'Location' },
  { label: 'Tea Garden & Eco Resorts in Sylhet', location: 'Sylhet', category: 'Location' },
  { label: 'Port City Hotels in Chittagong', location: 'Chittagong', category: 'Location' }
];

function applyGuestSuggestion(val, type = 'query') {
  if (type === 'location') {
    state.search.location = val;
    state.search.query = '';
  } else if (type === 'department') {
    state.search.department = val;
    state.search.query = '';
  } else {
    state.search.query = val;
  }
  const inputQ = document.getElementById('input-search-q');
  const selLoc = document.getElementById('select-search-loc');
  const selDept = document.getElementById('select-search-dept');
  if (inputQ && type === 'query') inputQ.value = val;
  if (selLoc && type === 'location') selLoc.value = val;
  if (selDept && type === 'department') selDept.value = val;
  closeGuestSearchDropdown();
  renderHomeScreen(document.getElementById('app-viewport'));
  document.getElementById('jobs-feed-anchor')?.scrollIntoView({ behavior: 'smooth' });
}

function handleGuestSearchInput(rawVal) {
  closeGuestSearchDropdown();
}

function closeGuestSearchDropdown() {
  const dropdown = document.getElementById('guest-search-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
}

const CANDIDATE_AUTOCOMPLETE_ITEMS = [];

function handleCandidateSearchInput(rawVal) {
  closeCandidateSearchDropdown();
}

function applyCandidateSuggestion(val, type = 'query') {
  if (type === 'location') {
    state.search.location = val;
    state.search.query = '';
  } else {
    state.search.query = val;
  }
  const inputQ = document.getElementById('input-search-q');
  const selLoc = document.getElementById('select-search-loc');
  if (inputQ && type === 'query') inputQ.value = val;
  if (selLoc && type === 'location') selLoc.value = val;
  closeCandidateSearchDropdown();
  renderHomeScreen(document.getElementById('app-viewport'));
}

function closeCandidateSearchDropdown() {
  const dropdown = document.getElementById('candidate-search-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
}

function showHeroExtraFields() {
  const extraFields = document.getElementById('hero-capsule-extra-fields');
  const btn = document.getElementById('btn-hero-filter-expand');
  if (extraFields && !extraFields.classList.contains('is-expanded')) {
    extraFields.classList.add('is-expanded');
    btn?.classList.add('is-active');
  }
}

function toggleHeroExtraFields() {
  const extraFields = document.getElementById('hero-capsule-extra-fields');
  const btn = document.getElementById('btn-hero-filter-expand');
  if (!extraFields) return;
  extraFields.classList.toggle('is-expanded');
  btn?.classList.toggle('is-active', extraFields.classList.contains('is-expanded'));
}

function handleGuestSearchFocus(val) {
  showHeroExtraFields();
  handleGuestSearchInput(val);
}

function showCandidateExtraFields() {
  const extraFields = document.getElementById('candidate-mobile-extra-fields');
  const btn = document.getElementById('btn-toggle-candidate-filters');
  if (extraFields && !extraFields.classList.contains('is-expanded')) {
    extraFields.classList.add('is-expanded');
    if (btn) {
      btn.innerHTML = `<span>Hide Filters</span> ${svgIcon('chevronUp', '', 14)}`;
    }
  }
}

function handleCandidateSearchFocus(val) {
  showCandidateExtraFields();
  handleCandidateSearchInput(val);
}

function toggleMobileSearchFields() {
  const extraFields = document.getElementById('candidate-mobile-extra-fields');
  const btn = document.getElementById('btn-toggle-candidate-filters');
  if (!extraFields) return;
  extraFields.classList.toggle('is-expanded');
  const isExpanded = extraFields.classList.contains('is-expanded');
  if (btn) {
    btn.innerHTML = `<span>${isExpanded ? 'Hide Filters' : 'Location & Department Filters'}</span> ${svgIcon(isExpanded ? 'chevronUp' : 'chevronDown', '', 14)}`;
  }
}

function toggleSearchCustomDropdown(type, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const dropdown = document.getElementById(`dropdown-${type}`);
  const trigger = document.getElementById(`trigger-${type}`);
  if (!dropdown) return;
  const isCurrentlyOpen = dropdown.style.display === 'flex' || dropdown.style.display === 'block';

  // Close any open custom dropdowns first
  closeAllCustomSearchDropdowns();
  closeCandidateSearchDropdown();
  closeGuestSearchDropdown();

  if (!isCurrentlyOpen) {
    dropdown.style.display = 'flex';
    trigger?.classList.add('is-open');
    trigger?.setAttribute('aria-expanded', 'true');
  }
}

function closeAllCustomSearchDropdowns() {
  document.querySelectorAll('.custom-filter-dropdown').forEach(dd => {
    dd.style.display = 'none';
  });
  document.querySelectorAll('.search-field-trigger, .capsule-field-trigger').forEach(trig => {
    trig.classList.remove('is-open');
    trig.setAttribute('aria-expanded', 'false');
  });
}

function selectSearchFilter(type, val, label) {
  if (type === 'location') {
    state.search.location = val;
    const hiddenLoc = document.getElementById('select-search-loc');
    if (hiddenLoc) hiddenLoc.value = val;
  } else if (type === 'department') {
    state.search.department = val;
    const hiddenDept = document.getElementById('select-search-dept');
    if (hiddenDept) hiddenDept.value = val;
  } else if (type === 'designation') {
    state.search.designation = val;
    const hiddenDesig = document.getElementById('select-search-desig');
    if (hiddenDesig) hiddenDesig.value = val;
  }
  closeAllCustomSearchDropdowns();
  renderHomeScreen(document.getElementById('app-viewport'));
}

// Global click dismiss for suggestions dropdowns & custom filter dropdowns
document.addEventListener('click', (e) => {
  if (!e.target.closest('#guest-search-dropdown') && !e.target.closest('#hero-search-capsule')) {
    closeGuestSearchDropdown();
  }
  if (!e.target.closest('#candidate-search-dropdown') && !e.target.closest('#input-search-q')) {
    closeCandidateSearchDropdown();
  }
  if (!e.target.closest('.custom-filter-dropdown') && !e.target.closest('.search-field-trigger') && !e.target.closest('.capsule-field-trigger')) {
    closeAllCustomSearchDropdowns();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeGuestSearchDropdown();
    closeCandidateSearchDropdown();
    closeAllCustomSearchDropdowns();
  }
});

function setDepartmentFilter(dept) {
  state.search.department = state.search.department === dept ? '' : dept;
  const select = document.getElementById('select-search-dept');
  if (select) select.value = state.search.department;
  renderHomeScreen(document.getElementById('app-viewport'));
}

function setJobSort(sortBy) {
  state.search.sort = sortBy;
  renderHomeScreen(document.getElementById('app-viewport'));
}

function toggleFilter(filterKey) {
  state.search[filterKey] = !state.search[filterKey];
  renderHomeScreen(document.getElementById('app-viewport'));
}

function clearAllFilters() {
  state.search = {
    query: '',
    location: '',
    department: '',
    designation: '',
    accommodation: false,
    duty_meals: false,
    urgent_only: false,
    sort: 'featured'
  };
  renderHomeScreen(document.getElementById('app-viewport'));
}

// ==========================================================================
// Screen 1B: Dedicated Job Post Detail Page (Deep Linking & Direct Shares)
// ==========================================================================

async function renderJobDetailScreen(viewport, jobId) {
  if (!jobId) {
    await renderHomeScreen(viewport);
    return;
  }

  const userId = state.currentUser ? state.currentUser.id : '';
  let job = null;
  try {
    const res = await fetch(`/api/jobs/${jobId}?user_id=${userId}`);
    if (res.ok) {
      job = await res.json();
    }
  } catch (err) {
    console.error('Failed to load job details:', err);
  }

  if (!job) {
    viewport.innerHTML = `
      <div style="padding: 60px 20px; text-align: center; max-width: 600px; margin: 0 auto;">
        <div style="margin-bottom: 16px; color: var(--text-dim);">${svgIcon('briefcase', '', 48)}</div>
        <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--white); margin-bottom: 8px;">Job Post Not Found</h2>
        <p style="color: var(--text-muted); margin-bottom: 24px; font-size: 0.95rem;">This job post might have closed, expired, or been removed.</p>
        <button class="btn-primary" onclick="navigateTo('home')">← Browse Open Job Posts</button>
      </div>
    `;
    return;
  }

  const isGuest = !state.currentUser || state.currentRole === 'guest';
  const isSaved = !isGuest && (job.is_saved || (state.savedJobs && state.savedJobs.some(s => s.id === job.id || s.job_id === job.id)));

  viewport.innerHTML = `
    <div style="max-width: 960px; margin: 0 auto; padding: 24px 16px;">
      <div style="margin-bottom: 20px;">
        <button class="btn-secondary" onclick="navigateTo('home')" style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.85rem; padding: 8px 16px;">
          ← Back to Job Posts
        </button>
      </div>

      <div class="card" style="padding: 32px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 16px;">
          <div style="flex: 1; min-width: 280px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 0.85rem; color: var(--orange-primary); font-weight: 700;">${job.brand_name}</span>
              <span style="color: var(--text-dim);">•</span>
              <span style="font-size: 0.82rem; color: var(--text-muted);">${job.star_rating}-Star ${job.property_type}</span>
              ${job.is_urgent ? `<span class="badge-urgent" style="margin-left: 6px;">Urgent</span>` : ''}
              ${job.is_featured ? `<span class="badge-featured" style="margin-left: 6px;">Featured</span>` : ''}
            </div>
            <h1 style="font-size: 2rem; font-weight: 800; color: var(--white); margin-bottom: 0 0 12px 0; line-height: 1.25;">${job.title}</h1>
            <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.88rem; color: var(--text-muted);">
              <div style="display: inline-flex; align-items: center; gap: 5px;">${svgIcon('mapPin', '', 15)} ${job.property_location}</div>
              <div style="display: inline-flex; align-items: center; gap: 5px;">${svgIcon('briefcase', '', 15)} ${job.department}</div>
              <div style="display: inline-flex; align-items: center; gap: 5px;">${svgIcon('clock', '', 15)} ${job.shift}</div>
              <div style="display: inline-flex; align-items: center; gap: 5px;">${svgIcon('fileText', '', 15)} ${job.employment_type}</div>
              <div style="display: inline-flex; align-items: center; gap: 5px;">${svgIcon('award', '', 15)} ${job.experience_level || 'Hospitality Experience'}</div>
              <div style="display: inline-flex; align-items: center; gap: 5px;">${svgIcon('dollar', '', 15)} <strong style="color: var(--orange-primary);">${(job.is_negotiable || job.salary_period === 'negotiable' || (!job.salary_min && !job.salary_max)) ? '৳ Negotiable' : `৳${(job.salary_min||0).toLocaleString()} - ৳${(job.salary_max||0).toLocaleString()} / month`}</strong></div>
            </div>
          </div>

          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button class="btn-icon ${isSaved ? 'saved' : ''}" style="width: 44px; height: 44px;" onclick="toggleSaveJob('${job.id}')" title="${isGuest ? 'Log in to save favourite' : (isSaved ? 'Bookmarked' : 'Save Job')}">
              ${isSaved ? svgIcon('starFilled', '', 20) : svgIcon('star', '', 20)}
            </button>
            <button class="btn-icon" style="width: 44px; height: 44px;" onclick="shareJob('${job.id}', '${encodeURIComponent(job.title)}')" title="Share">
              ${svgIcon('share', '', 20)}
            </button>
            ${job.is_applied ? `
              <button class="btn-secondary" style="padding: 10px 20px; font-size: 0.9rem;" onclick="navigateTo('applications')">
                View Applied Status →
              </button>
            ` : `
              <button class="btn-orange" style="padding: 10px 24px; font-size: 0.95rem; font-weight: 700;" onclick="handleApplyClick('${job.id}')">
                Apply Now
              </button>
            `}
          </div>
        </div>

        <div style="margin-top: 24px; border-top: 1px solid var(--border-subtle); padding-top: 24px;">
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 12px; color: var(--white);">Role Overview</h3>
          <p style="color: var(--text-muted); line-height: 1.7; font-size: 0.96rem;">${job.description}</p>
        </div>

        <!-- Experience Level Requirement -->
        <div style="margin-top: 24px;">
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px; color: var(--white); display: flex; align-items: center; gap: 8px;">
            ${svgIcon('award', '', 18)} Experience Required
          </h3>
          <p style="color: var(--text-muted); font-size: 0.94rem;">
            <strong>${job.experience_level || 'Hospitality Experience Required'}</strong> in hotel/resort operations.
          </p>
        </div>

        <!-- Educational Requirements -->
        ${(Array.isArray(job.education_requirements) && job.education_requirements.length > 0) ? `
          <div style="margin-top: 24px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 12px; color: var(--white); display: flex; align-items: center; gap: 8px;">
              ${svgIcon('book', '', 18)} Educational Requirements
            </h3>
            <ul style="padding-left: 20px; color: var(--text-muted); line-height: 1.7; font-size: 0.94rem;">
              ${job.education_requirements.map(e => {
                const deg = typeof e === 'string' ? e : (e.degree || e.title || '');
                const field = typeof e === 'object' && e.field ? ` (${e.field})` : '';
                return `<li><strong style="color: var(--white);">${deg}</strong>${field ? `<span style="color: var(--orange-primary);"> — Subject / Major: ${e.field}</span>` : ''}</li>`;
              }).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Skill Requirements -->
        ${(Array.isArray(job.skill_requirements) && job.skill_requirements.length > 0) ? `
          <div style="margin-top: 24px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 12px; color: var(--white); display: flex; align-items: center; gap: 8px;">
              ${svgIcon('checkCircle', '', 18)} Hotel &amp; Resort Skills Required
            </h3>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${job.skill_requirements.map(s => `
                <span class="schema-tag-badge" style="font-size: 0.82rem; padding: 5px 12px;">${s}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Legacy requirements if any -->
        ${(Array.isArray(job.requirements) && job.requirements.length > 0 && (!job.education_requirements || job.education_requirements.length === 0)) ? `
          <div style="margin-top: 24px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 12px; color: var(--white);">Candidate Requirements</h3>
            <ul style="padding-left: 20px; color: var(--text-muted); line-height: 1.7; font-size: 0.94rem;">
              ${job.requirements.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${(Array.isArray(job.benefits) && job.benefits.length > 0) ? `
          <div style="margin-top: 24px; background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.3); padding: 22px; border-radius: var(--radius-md);">
            <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--white); margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
              ${svgIcon('starFilled', 'color: var(--orange-primary);', 18)} Hospitality Benefits &amp; Perks
            </h4>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
              ${job.benefits.map(b => `
                <span class="perk-chip ${b.toLowerCase().includes('service charge') ? 'perk-highlight' : ''}" style="font-size: 0.88rem; padding: 6px 14px;">
                  ${svgIcon(getBenefitIcon(b), '', 15)} ${b}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ((job.service_charge_included || job.accommodation_provided || job.duty_meals_provided) ? `
          <div style="margin-top: 24px; background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.3); padding: 20px; border-radius: var(--radius-md);">
            <h4 style="font-size: 1rem; font-weight: 800; color: var(--white); margin-bottom: 12px;">Hospitality Benefits &amp; Perks</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
              ${job.service_charge_included ? `<span class="perk-chip perk-highlight">${svgIcon('dollar', '', 14)} Service Charge Distribution</span>` : ''}
              ${job.accommodation_provided ? `<span class="perk-chip">${svgIcon('home', '', 14)} Staff Housing Provided</span>` : ''}
              ${job.duty_meals_provided ? `<span class="perk-chip">${svgIcon('utensils', '', 14)} Duty Meals Provided</span>` : ''}
              <span class="perk-chip">${svgIcon('shield', '', 14)} Medical Insurance Included</span>
            </div>
          </div>
        ` : '')}

        <div style="margin-top: 24px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 20px;">
          <div style="font-size: 0.85rem; color: var(--text-dim);">
            Hiring Property: <strong style="color: var(--white);">${job.brand_name}</strong>
          </div>
          <button class="btn-secondary" style="font-size: 0.82rem; padding: 6px 14px;" onclick="navigateTo('hotels', { id: '${job.business_id}' })">
            View Hotel Profile →
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// Screen 2: Hotels & Resorts Directory
// ==========================================================================

async function renderHotelsScreen(viewport, selectedHotelId = null) {
  if (selectedHotelId) {
    return renderHotelDetailScreen(viewport, selectedHotelId);
  }

  let businesses = state.businesses;
  if (!businesses || businesses.length === 0) {
    const bizRes = await fetch('/api/businesses');
    businesses = bizRes.ok ? await bizRes.json() : [];
    state.businesses = businesses;
  }

  viewport.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 4px;">Hotels & Resorts</h1>
      <p style="color: var(--text-muted); font-size: 0.95rem;">Verified properties hiring through NiceJobs.</p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px;">
      ${businesses.map(biz => `
        <div class="job-card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="position: relative; height: 160px; border-radius: var(--radius-md); overflow: hidden; margin-bottom: 16px;">
              <img src="${biz.cover_image || '/static/images/hero_lobby.jpg'}" alt="${biz.brand_name}" style="width: 100%; height: 100%; object-fit: cover;">
              <span class="badge-featured" style="position: absolute; top: 12px; right: 12px; background: rgba(14, 23, 46, 0.9); backdrop-filter: blur(4px);">
                ${biz.star_rating}-Star ${biz.property_type}
              </span>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--white);">${biz.brand_name}</h2>
              <span class="verified-badge" title="Verified" style="white-space: nowrap; flex-shrink: 0;">✓ Verified</span>
            </div>

            <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;">
              ${biz.description}
            </p>

            <div style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 16px;">
              ${svgIcon('mapPin', '', 14)} ${biz.address}, ${biz.city}
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px;">
              ${(biz.amenities || []).slice(0, 3).map(am => `<span class="perk-chip">${am}</span>`).join('')}
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 14px;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">${svgIcon('users', '', 14)} ${biz.follower_count || 1200} followers</span>
            <button class="btn-primary" style="padding: 6px 14px; font-size: 0.82rem;" onclick="navigateTo('hotels', { id: '${biz.id}' })">
              View Open Jobs →
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function renderHotelDetailScreen(viewport, hotelId) {
  const userId = state.currentUser ? state.currentUser.id : '';
  const res = await fetch(`/api/businesses/${hotelId}?user_id=${userId}`);
  if (!res.ok) {
    viewport.innerHTML = `<div style="padding: 40px; text-align: center;">Hotel not found. <a href="#hotels">Back to hotels</a></div>`;
    return;
  }
  const hotel = await res.json();

  viewport.innerHTML = `
    <div style="margin-bottom: 20px;">
      <a href="#hotels" style="color: var(--blue-primary); font-size: 0.88rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
        ← Back to Hotels
      </a>
    </div>

    <!-- Hotel Cover Banner -->
    <div style="position: relative; height: 260px; border-radius: var(--radius-xl); overflow: hidden; margin-bottom: 24px; border: 1px solid var(--border-subtle);">
      <img src="${hotel.cover_image || '/static/images/hero_lobby.jpg'}" alt="${hotel.brand_name}" style="width: 100%; height: 100%; object-fit: cover;">
      <div style="position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(7, 13, 30, 0.95) 100%);"></div>
      
      <div style="position: absolute; bottom: 24px; left: 32px; right: 32px; display: flex; align-items: flex-end; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 18px;">
          <img src="${hotel.logo_url || '/static/images/hero_lobby.jpg'}" alt="${hotel.brand_name}" style="width: 80px; height: 80px; border-radius: var(--radius-lg); border: 3px solid var(--bg-surface); object-fit: cover;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h1 style="font-size: 1.85rem; font-weight: 800; color: white;">${hotel.brand_name}</h1>
              <span class="verified-badge" style="font-size: 1.1rem;" title="Verified">✓</span>
            </div>
            <div style="color: var(--text-muted); font-size: 0.9rem;">
              ${hotel.star_rating}-Star ${hotel.property_type} • ${hotel.city}
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          ${(state.currentUser?.role === 'recruiter' && (state.currentUser?.business_id === hotel.id || !state.currentUser?.business_id)) ? `
            <button class="btn-secondary" id="btn-hotel-detail-edit-profile" onclick="openEditBusinessProfileModal('${hotel.id}')" style="background: rgba(7, 13, 30, 0.75); backdrop-filter: blur(8px);">
              ${svgIcon('edit', '', 14)} Edit Hotel Profile
            </button>
          ` : ''}
          <button class="btn-${hotel.is_followed ? 'secondary' : 'orange'}" onclick="toggleFollowHotel('${hotel.id}')">
            ${hotel.is_followed ? '✓ Following' : '+ Follow'} (${hotel.follower_count})
          </button>
        </div>
      </div>
    </div>

    <div class="content-grid">
      <div class="main-feed-area">
        <!-- Overview -->
        <div class="profile-section-card">
          <h2 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 10px;">About</h2>
          <p style="color: var(--text-muted); line-height: 1.6; margin-bottom: 20px;">${hotel.description}</p>
          
          <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 10px;">Amenities</h3>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
            ${(hotel.amenities || []).map(am => `<span class="perk-chip" style="font-size: 0.85rem;">${am}</span>`).join('')}
          </div>

          <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 10px;">Benefits</h3>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${(hotel.benefits || []).map(b => `<span class="perk-chip perk-highlight" style="font-size: 0.85rem;">${b}</span>`).join('')}
          </div>
        </div>

        <!-- Open Job Posts -->
        <div class="profile-section-card">
          <div class="section-header" style="margin-bottom: 16px;">
            <h2 style="font-size: 1.2rem; font-weight: 800;">Open Positions</h2>
            <span class="badge-featured">${(hotel.open_jobs || []).length} active</span>
          </div>

          <div class="jobs-list">
            ${(hotel.open_jobs || []).length === 0 ? `
              <p style="color: var(--text-muted); font-size: 0.9rem;">No active job posts currently open.</p>
            ` : hotel.open_jobs.map(j => renderJobCardHTML({ ...j, brand_name: hotel.brand_name, logo_url: hotel.logo_url, star_rating: hotel.star_rating })).join('')}
          </div>
        </div>
      </div>

      <aside class="sidebar-area">
        <!-- Team -->
        <div class="employers-box">
          <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 12px;">Hiring Team</h3>

          ${(hotel.team_members || []).map(tm => `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--white);">
                ${tm.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style="font-weight: 700; font-size: 0.88rem; color: var(--white);">${tm.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${tm.org_role}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Verification -->
        <div class="profile-section-card">
          <h3 style="font-size: 0.95rem; font-weight: 800; margin-bottom: 8px;">Verification</h3>
          <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px;">
            ${hotel.verification_notes || 'Verified official hospitality establishment under Bangladesh Tourism Board guidelines.'}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">
            Legal Entity: <strong>${hotel.legal_name}</strong>
          </div>
        </div>
      </aside>
    </div>
  `;
}

async function toggleFollowHotel(hotelId) {
  if (!state.currentUser) {
    openAuthModal('candidate');
    return;
  }
  try {
    const res = await fetch(`/api/businesses/${hotelId}/follow?user_id=${state.currentUser.id}`, { method: 'POST' });
    const data = await res.json();
    showToast(data.is_followed ? 'Hotel followed! You will receive new job post alerts.' : 'Unfollowed hotel.');
    renderHotelDetailScreen(document.getElementById('app-viewport'), hotelId);
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================================================
// Screen 3: My Applications (Employee View)
// ==========================================================================

async function renderApplicationsScreen(viewport) {
  if (!state.currentUser) {
    viewport.innerHTML = `<div style="padding: 60px; text-align: center;">Please <button class="btn-primary" onclick="openAuthModal('signin')">Log In</button> to view applications.</div>`;
    return;
  }

  const res = await fetch(`/api/applications?user_id=${state.currentUser.id}`);
  const apps = await res.json();

  viewport.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 4px;">My Applications</h1>
      <p style="color: var(--text-muted); font-size: 0.95rem;">Track the status of your submitted applications.</p>
    </div>

    ${apps.length === 0 ? `
      <div style="background: var(--bg-surface); padding: 50px; border-radius: var(--radius-xl); text-align: center; border: 1px dashed var(--border-subtle);">
        <div style="margin-bottom: 12px; color: var(--text-dim);">${svgIcon('fileText', '', 44)}</div>
        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 6px;">No applications yet</h3>
        <p style="color: var(--text-muted); margin-bottom: 20px;">Explore job posts and apply to track them here.</p>
        <button class="btn-orange" onclick="navigateTo('home')">Browse Jobs</button>
      </div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${apps.map(app => `
          <div class="job-card" style="border-left: 4px solid var(--blue-primary);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
              <div style="display: flex; gap: 14px; align-items: center;">
                <img src="${app.logo_url || '/static/images/hero_lobby.jpg'}" alt="${app.brand_name}" style="width: 50px; height: 50px; border-radius: var(--radius-md); object-fit: cover;">
                <div>
                  <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${app.brand_name}</div>
                  <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--white);">${app.job_title}</h3>
                  <div style="font-size: 0.8rem; color: var(--text-dim);">
                    Applied: ${app.applied_at} • CV: <strong style="color: var(--orange-primary);">${app.selected_cv}</strong>
                  </div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="status-pill status-${app.status}">
                  ${app.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            <!-- Application Timeline -->
            <div style="background: rgba(14, 23, 46, 0.7); padding: 18px 24px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 16px;">
              <div style="font-size: 0.85rem; font-weight: 800; color: var(--white); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                ${svgIcon('clock', '', 15)} Status Timeline
              </div>
              <div class="timeline">
                ${(app.timeline || []).map(step => `
                  <div class="timeline-step">
                    <div class="timeline-node done"></div>
                    <div class="timeline-content">
                      <div class="timeline-status">${step.actor_name}: ${step.status.replace('_', ' ').toUpperCase()}</div>
                      <div class="timeline-meta">${step.timestamp}</div>
                      ${step.note ? `<div class="timeline-note">${step.note}</div>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Interview Details Banner if scheduled -->
            ${app.interview_time ? `
              <div style="background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.4); padding: 14px 20px; border-radius: var(--radius-md); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <div style="color: var(--white); font-weight: 800; font-size: 0.95rem;">${svgIcon('calendar', '', 15)} Interview Scheduled</div>
                  <div style="color: var(--white); font-size: 0.88rem; margin-top: 2px;">${app.interview_time}</div>
                  <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;">${app.interview_notes || 'Please arrive 15 minutes before the scheduled time.'}</div>
                </div>
                <button class="btn-orange" style="padding: 6px 14px; font-size: 0.82rem;" onclick="navigateTo('inbox')">Confirm Interview →</button>
              </div>
            ` : ''}

            <!-- Card Actions -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 14px;">
              <span style="font-size: 0.8rem; color: var(--text-dim);">Updated: ${app.updated_at}</span>
              <div style="display: flex; gap: 10px;">
                <button class="btn-secondary" style="font-size: 0.82rem;" onclick="openJobDetailModal('${app.job_id}')">View Job</button>
                <button class="btn-primary" style="font-size: 0.82rem;" onclick="openConversationForJob('${app.job_id}', '${app.business_id}', '${app.user_id}')">${svgIcon('messageCircle', '', 14)} Message</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

// ==========================================================================
// Screen 4: Employee Profile & Multiple CVs Manager
// ==========================================================================

async function toggleOpenToWork() {
  const userId = state.currentUser ? state.currentUser.id : null;
  if (!userId) {
    showToast('Please sign in as a candidate to update status.', 'warning');
    return;
  }
  const currentStatus = state.profile ? (state.profile.open_to_work === 1 || state.profile.open_to_work === true || state.profile.open_to_work === '1' || state.profile.open_to_work === undefined) : true;
  const newStatus = !currentStatus;

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        open_to_work: newStatus
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update Open to Work status');

    if (state.profile) {
      state.profile.open_to_work = newStatus ? 1 : 0;
    }
    showToast(newStatus ? 'Open to Work is now ON. 5-Star hotels can now discover your profile!' : 'Open to Work turned OFF. Your profile is now set to private browsing.', newStatus ? 'success' : 'info');
    await renderProfileScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function renderProfileScreen(viewport) {
  const currentUserId = state.currentUser ? state.currentUser.id : null;
  const isDemoUser = currentUserId === 'user_rahim' || currentUserId === 'user_fatima';
  const userId = currentUserId ? ((state.demoDataHidden && isDemoUser) ? null : currentUserId) : (state.demoDataHidden ? null : 'user_rahim');
  if (!userId) {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 60px 20px; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 16px;">👤</div>
        <h2 style="font-weight: 800; color: var(--white); margin-bottom: 8px;">No Candidate Profile Active</h2>
        <p style="color: var(--text-muted); max-width: 460px; margin: 0 auto 20px;">Demo data is removed or you are not signed in. Please register a candidate account or log in to view and manage your profile.</p>
        <button class="btn-orange" onclick="startSignupFlow('candidate')">Register as Candidate</button>
        <button class="btn-secondary" style="margin-left: 10px;" onclick="startLoginFlow('candidate')">Log In</button>
      </div>
    `;
    return;
  }
  let profile = (state.profile && (state.profile.user_id === userId || state.profile.id === userId)) ? state.profile : null;
  if (!profile) {
    const res = await fetch(`/api/profile?user_id=${userId}`);
    if (!res.ok) {
      viewport.innerHTML = `
        <div class="empty-state-card" style="padding: 60px 20px; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 16px;">👤</div>
          <h2 style="font-weight: 800; color: var(--white); margin-bottom: 8px;">Candidate Profile Not Found</h2>
          <p style="color: var(--text-muted); max-width: 460px; margin: 0 auto 20px;">The requested profile could not be loaded.</p>
          <button class="btn-orange" onclick="startSignupFlow('candidate')">Create Candidate Profile</button>
        </div>
      `;
      return;
    }
    profile = await res.json();
    state.profile = profile;
  }

  const isOpen = (profile.open_to_work === 1 || profile.open_to_work === true || profile.open_to_work === '1' || profile.open_to_work === undefined);

  viewport.innerHTML = `
    <div class="profile-card">
      <div class="profile-cover"></div>
      
      <div class="profile-header-content">
        <div class="profile-avatar-row">
          <img src="${profile.avatar_url || DEFAULT_AVATAR_PREVIEW}" alt="${escapeHtml(profile.name || '')}" class="profile-main-avatar">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <!-- Open to Work Quick Toggle Button -->
            <button class="${isOpen ? 'btn-primary' : 'btn-secondary'}" onclick="toggleOpenToWork()" id="btn-toggle-open-to-work" style="display: inline-flex; align-items: center; gap: 8px; padding: 7px 15px; font-size: 0.82rem; font-weight: 700; border-radius: var(--radius-md);" title="Click to ${isOpen ? 'turn off' : 'turn on'} Open to Work">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${isOpen ? '#4ade80' : '#94a3b8'}; box-shadow: ${isOpen ? '0 0 8px #4ade80' : 'none'};"></span>
              Open to Work: <strong>${isOpen ? 'ON' : 'OFF'}</strong>
            </button>
            <button class="btn-secondary" onclick="openComprehensiveEditProfileModal()">${svgIcon('edit', '', 14)} Edit Profile</button>
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 20px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--white);">${escapeHtml(profile.name || 'Candidate')}</h1>
              ${profile.name_bangla ? `<span style="font-size: 1.15rem; color: #94a3b8; font-weight: 500;" title="Full Name in Bangla">(${escapeHtml(profile.name_bangla)})</span>` : ''}
              <span class="verified-badge" title="Verified">✓ Verified</span>
            </div>
            <p style="font-size: 1.05rem; color: #cbd5e1; margin-top: 4px; font-weight: 600;">${escapeHtml(profile.headline || 'Hospitality Specialist')}</p>
            <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 6px;">
              ${svgIcon('mapPin', '', 14)} ${escapeHtml(profile.location || 'Dhaka, Bangladesh')} • ${svgIcon('phone', '', 14)} ${escapeHtml(profile.phone || '')} • ${svgIcon('mail', '', 14)} ${escapeHtml(profile.email || '')}
            </div>
          </div>

          <!-- Privacy & Completion Indicator -->
          <div style="display: flex; flex-direction: column; gap: 8px; min-width: 240px;">
            <div class="profile-privacy-box">
              ${svgIcon('lock', '', 18)}
              <div style="font-size: 0.78rem;">
                <div style="font-weight: 700; color: var(--white);">CV Privacy</div>
                <div style="color: var(--white);">Private (applied jobs only)</div>
              </div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-subtle); padding: 8px 14px; border-radius: var(--radius-md); font-size: 0.78rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: var(--text-muted);">Profile Completion</span>
                <span style="font-weight: 800; color: var(--orange-primary);">${profile.profile_completion}%</span>
              </div>
              <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: var(--radius-full); overflow: hidden;">
                <div style="width: ${profile.profile_completion}%; height: 100%; background: linear-gradient(90deg, #2563eb, #f97316);"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Multiple CVs Management Shelf -->
    <div class="cv-manager-card">
      <div class="section-header" style="margin-bottom: 14px;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--white);">My CVs (${(profile.cv_list || []).length})</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted);">Choose which tailored CV to attach when applying. CVs are private.</p>
        </div>
        <button class="btn-orange" style="font-size: 0.82rem; padding: 6px 14px;" onclick="openAddCvModal()">+ Upload CV</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${(profile.cv_list || []).length === 0 ? `
          <div style="padding: 28px 20px; text-align: center; border: 1px dashed rgba(255, 255, 255, 0.2); border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.02); display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="color: var(--orange-primary);">${svgIcon('upload', '', 32)}</div>
            <div style="font-weight: 700; color: var(--white); font-size: 0.96rem;">No Hospitality CVs Uploaded Yet</div>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0 0 12px 0; max-width: 380px; line-height: 1.45;">Upload your tailored hospitality resume (.pdf, .docx) to showcase your experience to top hotels.</p>
            <button class="btn-orange" onclick="openAddCvModal()" style="font-size: 0.85rem; padding: 7px 18px; display: inline-flex; align-items: center; gap: 6px;">
              ${svgIcon('upload', '', 15)} Upload / Drop CV
            </button>
          </div>
        ` : (profile.cv_list || []).map(cv => `
          <div class="cv-item-row ${cv.is_default ? 'is-default' : ''}">
            <div class="cv-item-info">
              <span class="cv-file-icon">${svgIcon('fileText', '', 20)}</span>
              <div>
                <div class="cv-title">
                  ${cv.title || cv.name}
                  ${cv.is_default ? '<span class="badge-featured" style="margin-left: 8px; font-size: 0.7rem;">Default</span>' : ''}
                </div>
                <div class="cv-meta">
                  ${cv.name} • ${cv.size || '210 KB'} • Added: ${cv.uploaded_at || 'Recently'}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${!cv.is_default ? `
                <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="setDefaultCv('${cv.id}')">Make Default</button>
              ` : ''}
              <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="previewCandidateCvModal('${(cv.title || cv.name).replace(/'/g, "\\'")}', '${cv.name.replace(/'/g, "\\'")}')">Preview</button>
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: #f87171; display: inline-flex; align-items: center; justify-content: center;" onclick="deleteCv('${cv.id}')" title="Delete CV">${svgIcon('x', '', 14)}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Profile Detail Cards -->
    <div class="content-grid">
      <div class="main-feed-area">
        <!-- Summary -->
        <div class="profile-section-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h2 style="font-size: 1.15rem; font-weight: 800; color: var(--white); margin: 0;">Summary</h2>
            <button class="btn-icon" onclick="openEditSummaryModal()" title="Edit Summary">${svgIcon('edit', '', 14)}</button>
          </div>
          <p style="color: var(--text-muted); line-height: 1.6; font-size: 0.95rem;">${profile.summary || 'No professional summary added yet.'}</p>
        </div>

        <!-- Experience Timeline -->
        <div class="profile-section-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h2 style="font-size: 1.15rem; font-weight: 800; color: var(--white); margin: 0;">Experience</h2>
            <button class="btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="openEditExperienceModal()">+ Add / Edit</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 16px;">
            ${(profile.experience || []).length === 0 ? `
              <div style="color: var(--text-dim); font-size: 0.85rem;">No previous hospitality experience listed.</div>
            ` : (profile.experience || []).map(exp => `
              <div style="border-left: 3px solid var(--blue-primary); padding-left: 16px;">
                <div style="font-size: 1.05rem; font-weight: 800; color: var(--white);">${exp.role}</div>
                <div style="font-size: 0.88rem; color: var(--orange-primary); font-weight: 600;">${exp.hotel} • ${exp.period}</div>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 6px; line-height: 1.5;">${exp.description || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Certifications -->
        <div class="profile-section-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h2 style="font-size: 1.15rem; font-weight: 800; color: var(--white); margin: 0;">Certifications</h2>
            <button class="btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="openEditCredentialsModal()">+ Add / Edit</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${(profile.certifications || []).length === 0 ? `
              <div style="color: var(--text-dim); font-size: 0.85rem;">No certificates or accreditations added.</div>
            ` : (profile.certifications || []).map(c => `
              <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.03); padding: 10px 14px; border-radius: var(--radius-md);">
                <div>
                  <div style="font-weight: 700; font-size: 0.9rem; color: var(--white);">${svgIcon('award', '', 14)} ${c.title}</div>
                  <div style="font-size: 0.78rem; color: var(--text-dim);">${c.issuer}</div>
                </div>
                <span class="badge-featured">${c.year}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <aside class="sidebar-area">
        <!-- Skills -->
        <div class="profile-section-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--white); margin: 0;">Skills</h3>
            <button class="btn-icon" onclick="openEditSkillsModal()" title="Edit Skills">${svgIcon('edit', '', 14)}</button>
          </div>
          <div class="skills-cloud">
            ${(profile.skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('')}
          </div>
        </div>

        <!-- Languages -->
        <div class="profile-section-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--white); margin: 0;">Languages</h3>
            <button class="btn-icon" onclick="openEditLanguagesModal()" title="Edit Languages">${svgIcon('edit', '', 14)}</button>
          </div>
          ${(profile.languages || []).map(l => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.85rem;">
              <span style="font-weight: 600; color: var(--white);">${l.name}</span>
              <span style="color: var(--text-muted);">${l.level}</span>
            </div>
          `).join('')}
        </div>

        <!-- Career Preferences -->
        <div class="profile-section-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--white); margin: 0;">Job Preferences</h3>
            <button class="btn-icon" onclick="openEditJobPreferencesModal()" title="Edit Career Preferences">${svgIcon('edit', '', 14)}</button>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <div>${svgIcon('dollar', '', 15)} <strong>Expected Salary:</strong> ${profile.preferences?.expected_salary || 'Negotiable'}</div>
            <div>${svgIcon('mapPin', '', 15)} <strong>Target Locations:</strong> ${(profile.preferences?.locations || []).join(', ') || 'Dhaka'}</div>
            <div>${svgIcon('clock', '', 15)} <strong>Notice Period:</strong> ${profile.preferences?.notice_period || 'Immediate'}</div>
          </div>
        </div>
      </aside>
    </div>
  `;
}

// ==========================================================================
// Screen 5: Recruiter Dashboard & ATS
// ==========================================================================

async function renderRecruiterDashboard(viewport) {
  const bId = state.currentUser?.business_id || state.activeHotelId || null;
  if (!bId) {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 60px 20px; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 16px;">🏨</div>
        <h2 style="font-weight: 800; color: var(--white); margin-bottom: 8px;">No Hotel / Business Active</h2>
        <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 20px;">Demo data is removed or no business session is active. Please register your establishment or log in to access the recruiter desk.</p>
        <button class="btn-orange" onclick="startSignupFlow('business')">Register New Business</button>
        <button class="btn-secondary" style="margin-left: 10px;" onclick="startLoginFlow('business')">Employer Log In</button>
      </div>
    `;
    return;
  }
  const [jobsRes, appsRes, bizRes] = await Promise.all([
    fetch(`/api/jobs?business_id=${bId}&status=all`),
    fetch(`/api/applications?business_id=${bId}`),
    fetch(`/api/businesses/${bId}`)
  ]);
  if (!bizRes.ok) {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 60px 20px; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 16px;">🏨</div>
        <h2 style="font-weight: 800; color: var(--white); margin-bottom: 8px;">Business Profile Not Found</h2>
        <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 20px;">Could not load business details.</p>
        <button class="btn-orange" onclick="startSignupFlow('business')">Register New Business</button>
      </div>
    `;
    return;
  }
  const jobs = jobsRes.ok ? await jobsRes.json() : [];
  const apps = appsRes.ok ? await appsRes.json() : [];
  const biz = await bizRes.json();
  state.currentBusiness = biz;

  const isPending = (biz.verification_status || 'pending') !== 'verified';
  if (isPending) {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 60px 24px; text-align: center; max-width: 620px; margin: 40px auto; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); box-shadow: 0 16px 40px rgba(0,0,0,0.4);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(249, 115, 22, 0.15); color: var(--orange-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          ${svgIcon('clock', '', 32)}
        </div>
        <h2 style="font-weight: 800; font-size: 1.5rem; color: var(--white); margin-bottom: 12px;">Business Verification Pending</h2>
        <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6; margin-bottom: 24px;">
          The business account for <strong style="color: var(--white);">${escapeHtml(biz.brand_name)}</strong> is awaiting verification by NiceJobs platform administration. New accounts cannot access recruiter workspace, view applicants, or post vacancies until verified.
        </p>
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; margin-bottom: 24px; text-align: left;">
          <div style="font-size: 0.82rem; font-weight: 700; color: #fdba74; margin-bottom: 6px;">Need fast-track verification?</div>
          <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">Contact the Trust &amp; Safety Desk via WhatsApp or Email:</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <a href="https://wa.me/8801819876543" target="_blank" class="auth-contact-pill" style="background: rgba(37, 211, 102, 0.15); color: #86efac; border: 1px solid rgba(37, 211, 102, 0.4); text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;">
              ${svgIcon('whatsapp', '', 14)} WhatsApp: +880 1819-876543
            </a>
            <a href="mailto:trust@nicejobs.bd" class="auth-contact-pill" style="background: rgba(255, 255, 255, 0.06); color: var(--white); border: 1px solid rgba(255, 255, 255, 0.15); text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;">
              ${svgIcon('mail', '', 14)} trust@nicejobs.bd
            </a>
          </div>
        </div>
        <button class="btn-secondary" onclick="navigateTo('home')">Return to Home</button>
      </div>
    `;
    return;
  }

  const totalApplicants = apps.length;
  const scheduledInterviews = apps.filter(a => a.status === 'interview_scheduled').length;
  const shortlistedCount = apps.filter(a => a.status === 'shortlisted').length;

  viewport.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
      <div style="display: flex; align-items: center; gap: 16px;">
        <img src="${biz.logo_url || DEFAULT_HOTEL_LOGO}" alt="${escapeHtml(biz.brand_name || '')}" style="width: 56px; height: 56px; border-radius: 12px; object-fit: contain; border: 1.5px solid var(--border-subtle); background: #070d1e; padding: 4px;">
        <div>
          <h1 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 4px; color: var(--white);">${escapeHtml(biz.brand_name || '')}</h1>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Establishment workspace and recruitment pipeline.</p>
        </div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button class="btn-secondary" id="btn-edit-my-profile" onclick="openBusinessUserEditProfileModal()">${svgIcon('user', '', 14)} Edit My Profile</button>
        <button class="btn-secondary" id="btn-edit-hotel-profile" onclick="openEditBusinessProfileModal('${biz.id}')">${svgIcon('edit', '', 14)} Edit Hotel Profile</button>
        <button class="btn-orange" id="btn-dashboard-post-job" onclick="openCreateJobModal()">+ Job Post</button>
      </div>
    </div>

    <!-- Header Metrics -->
    <div class="ats-header-stats" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Active Jobs</span>
          ${svgIcon('briefcase', 'stat-card-icon', 16)}
        </div>
        <span class="stat-card-value" style="color: var(--blue-primary);">${jobs.length}</span>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Applicants</span>
          ${svgIcon('users', 'stat-card-icon', 16)}
        </div>
        <span class="stat-card-value">${totalApplicants}</span>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Shortlisted</span>
          ${svgIcon('starFilled', 'stat-card-icon', 16)}
        </div>
        <span class="stat-card-value" style="color: #a78bfa;">${shortlistedCount}</span>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Interviews</span>
          ${svgIcon('calendar', 'stat-card-icon', 16)}
        </div>
        <span class="stat-card-value" style="color: var(--orange-primary);">${scheduledInterviews}</span>
      </div>
    </div>

    <!-- Active Job Posts Table -->
    <div class="profile-section-card" style="margin-bottom: 24px;">
      <div class="section-header" style="margin-bottom: 16px;">
        <h2 style="font-size: 1.15rem; font-weight: 800; color: var(--white);">Job Posts</h2>
        <a href="#ats" class="btn-secondary" style="font-size: 0.78rem;">View All →</a>
      </div>

      <div style="overflow-x: auto;">
        <table class="ats-table">
          <thead>
            <tr>
              <th>Job Title</th>
              <th>Department</th>
              <th>Salary</th>
              <th>Applicants</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${jobs.map(j => `
              <tr>
                <td style="font-weight: 700; color: var(--white);">${j.title}</td>
                <td>${j.department}</td>
                <td style="color: var(--orange-primary); font-weight: 700;">${(j.is_negotiable || j.salary_period === 'negotiable' || (!j.salary_min && !j.salary_max)) ? '৳ Negotiable' : `৳${(j.salary_min||0).toLocaleString()} - ৳${(j.salary_max||0).toLocaleString()}`}</td>
                <td><span class="badge-featured">${j.applicant_count || 0}</span></td>
                <td>
                  <span class="status-pill status-${j.status === 'active' ? 'interview_scheduled' : 'rejected'}">
                    ${formatStatusLabel(j.status)}
                  </span>
                </td>
                <td>
                  <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="navigateTo('ats', { job_id: '${j.id}' })">Applicants</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Quick ATS Preview -->
    <div class="profile-section-card">
      <div class="section-header" style="margin-bottom: 16px;">
        <h2 style="font-size: 1.15rem; font-weight: 800; color: var(--white);">Recent Applicants</h2>
      </div>
      ${renderCandidatesTableHTML(apps.slice(0, 5))}
    </div>
  `;
}

// ATS Board Full Page
async function renderATSBoard(viewport) {
  const bId = state.currentUser?.business_id || state.activeHotelId || null;
  if (!bId) {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 60px 20px; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 16px;">📋</div>
        <h2 style="font-weight: 800; color: var(--white); margin-bottom: 8px;">No Business Active</h2>
        <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 20px;">Demo data is removed or no business session is active. Please register or sign in.</p>
        <button class="btn-orange" onclick="startSignupFlow('business')">Register Business</button>
        <button class="btn-secondary" style="margin-left: 10px;" onclick="startLoginFlow('business')">Employer Log In</button>
      </div>
    `;
    return;
  }
  const jobId = state.screenParams?.get('job_id');
  let url = `/api/applications?business_id=${bId}`;
  if (jobId) url += `&job_id=${jobId}`;
  const [appsRes, bizRes] = await Promise.all([
    fetch(url),
    (!state.currentBusiness || state.currentBusiness.id !== bId) ? fetch(`/api/businesses/${bId}`) : Promise.resolve(null)
  ]);
  const apps = appsRes.ok ? await appsRes.json() : [];
  if (bizRes && bizRes.ok) {
    try { state.currentBusiness = await bizRes.json(); } catch(e) {}
  }

  if (state.currentBusiness && (state.currentBusiness.verification_status || 'pending') !== 'verified') {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 60px 24px; text-align: center; max-width: 620px; margin: 40px auto; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(249, 115, 22, 0.15); color: var(--orange-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          ${svgIcon('clock', '', 32)}
        </div>
        <h2 style="font-weight: 800; font-size: 1.5rem; color: var(--white); margin-bottom: 12px;">Verification Required</h2>
        <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6; margin-bottom: 20px;">
          Applicant tracking is restricted until your business account is verified by platform administrators.
        </p>
        <button class="btn-secondary" onclick="navigateTo('home')">Return to Home</button>
      </div>
    `;
    return;
  }

  viewport.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 4px; color: var(--white);">Applicant Tracking</h1>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Review resumes, advance candidates, and manage interview pipelines.</p>
      </div>
      <button class="btn-orange" id="btn-ats-post-job" onclick="openCreateJobModal()">+ Job Post</button>
    </div>

    <div class="profile-section-card">
      ${renderCandidatesTableHTML(apps)}
    </div>
  `;
}

function renderCandidatesTableHTML(apps) {
  window._cachedAtsApps = apps || [];
  if (!apps || apps.length === 0) {
    return `<div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">No applicants yet.</div>`;
  }

  return `
    <div style="overflow-x: auto;">
      <table class="ats-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Job</th>
            <th>Resume</th>
            <th>Status</th>
            <th>Date</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${apps.map(app => `
            <tr>
              <td>
                <div class="candidate-cell">
                  <img src="${app.candidate_avatar || DEFAULT_AVATAR_PREVIEW}" alt="${app.candidate_name}" class="candidate-avatar">
                  <div>
                    <div class="candidate-name">${app.candidate_name}</div>
                    <div class="candidate-sub">${app.candidate_email} • ${app.candidate_phone}</div>
                  </div>
                </div>
              </td>
              <td style="font-weight: 700; color: var(--white);">${app.job_title}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 6px;">
                  ${svgIcon('fileText', '', 16)}
                  <span style="color: var(--white); font-size: 0.82rem; font-weight: 600;">${app.selected_cv}</span>
                </div>
                <button class="btn-secondary" style="padding: 2px 8px; font-size: 0.72rem; margin-top: 4px;" onclick="viewSubmittedApplicationCv('${app.id}')">
                  View CV
                </button>
              </td>
              <td>
                <span class="status-pill status-${app.status}">
                  ${formatStatusLabel(app.status)}
                </span>
              </td>
              <td style="font-size: 0.8rem; color: var(--text-dim);">${formatDisplayDate(app.applied_at)}</td>
              <td>
                <button class="btn-primary" style="padding: 5px 12px; font-size: 0.78rem;" onclick="openCandidateReviewModal('${app.id}')">
                  Review
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ==========================================================================
// Screen 6: Redesigned Inbox & Messaging Desk (Clean, Fixed UI/UX)
// ==========================================================================

async function quickLoginCandidate() {
  state.currentUser = {
    id: 'user_1792756801_3ff6a7',
    name: 'dfdf',
    email: 'someonee@gmail.com',
    role: 'jobseeker',
    avatar: DEFAULT_AVATAR_PREVIEW
  };
  state.currentRole = 'jobseeker';
  state.activeHotelId = null;
  try {
    const sessPayload = JSON.stringify({ user: state.currentUser, role: 'jobseeker' });
    sessionStorage.setItem('nicejobs_active_session', sessPayload);
    localStorage.setItem('nicejobs_active_session', sessPayload);
  } catch (e) {}
  updateRoleStatusText();
  updateNavigation();
  onAuthChange();
  await loadInitialData();
  navigateTo('inbox');
}

async function quickLoginRecruiter() {
  state.currentUser = {
    id: 'user_1792756972_f8fa67',
    name: 'far',
    email: 'far@radissondhaka.com',
    role: 'recruiter',
    business_id: 'biz_1792756972_a86aa5',
    is_business_admin: true,
    avatar: DEFAULT_AVATAR_PREVIEW
  };
  state.currentRole = 'recruiter';
  state.activeHotelId = 'biz_1792756972_a86aa5';
  try {
    const sessPayload = JSON.stringify({ user: state.currentUser, role: 'recruiter', activeHotelId: 'biz_1792756972_a86aa5' });
    sessionStorage.setItem('nicejobs_active_session', sessPayload);
    localStorage.setItem('nicejobs_active_session', sessPayload);
  } catch (e) {}
  updateRoleStatusText();
  updateNavigation();
  onAuthChange();
  await loadInitialData();
  navigateTo('inbox');
}
window.quickLoginCandidate = quickLoginCandidate;
window.quickLoginRecruiter = quickLoginRecruiter;

async function renderInboxScreen(viewport) {
  const role = state.currentRole;
  const isRecruiter = role === 'recruiter';
  const bId = state.currentUser?.business_id || state.activeHotelId;
  const uId = state.currentUser?.id;

  if (!state.currentUser || role === 'guest') {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 70px 20px; text-align: center; max-width: 620px; margin: 40px auto; background: var(--bg-card); border-radius: 18px; border: 1px solid var(--border-subtle);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(37, 99, 235, 0.12); color: #60a5fa; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px;">
          ${svgIcon('messageCircle', '', 32)}
        </div>
        <h2 style="font-weight: 800; color: var(--white); margin-bottom: 8px; font-size: 1.4rem;">Direct Messages &amp; Communications Desk</h2>
        <p style="color: var(--text-muted); max-width: 440px; margin: 0 auto 24px; font-size: 0.92rem; line-height: 1.5;">
          Sign in to access your direct conversations, interview requests, and communications with verified hotels and candidates.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 24px;">
          <button class="btn-orange" style="padding: 10px 22px; font-weight: 700;" onclick="startLoginFlow('candidate')">
            Candidate Log In
          </button>
          <button class="btn-secondary" style="padding: 10px 22px; font-weight: 700;" onclick="startLoginFlow('business')">
            Hotel Employer Log In
          </button>
        </div>
        <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
          <span style="font-size: 0.76rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">Instant 1-Click Access for Review:</span>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
            <button class="btn-secondary" style="font-size: 0.82rem; padding: 7px 16px; border-color: rgba(255,255,255,0.2);" onclick="quickLoginCandidate()">
              👤 Candidate Inbox (dfdf)
            </button>
            <button class="btn-secondary" style="font-size: 0.82rem; padding: 7px 16px; border-color: rgba(255,255,255,0.2);" onclick="quickLoginRecruiter()">
              🏨 Employer Inbox (Radisson Blu)
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (isRecruiter && !bId) {
    viewport.innerHTML = `
      <div class="empty-state-card" style="padding: 60px 20px; text-align: center; max-width: 620px; margin: 40px auto; background: var(--bg-card); border-radius: 18px; border: 1px solid var(--border-subtle);">
        <div style="font-size: 3rem; margin-bottom: 16px;">✉️</div>
        <h2 style="font-weight: 800; color: var(--white); margin-bottom: 8px;">No Hotel Associated</h2>
        <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 20px;">Please log in with your verified hotel account credentials to access candidate communications.</p>
        <button class="btn-orange" onclick="startLoginFlow('business')">Employer Log In</button>
      </div>
    `;
    return;
  }

  // Instant UI response - show loading inbox frame immediately
  viewport.innerHTML = `
    <div class="inbox-page-wrapper">
      <div class="inbox-header-compact">
        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
          <button type="button" class="btn-inbox-back-outside" onclick="navigateOutsideInbox()" title="Exit Inbox and return to previous page">
            ${svgIcon('arrowLeft', '', 15)} <span>Back</span>
          </button>
          <div style="min-width: 0; flex: 1;">
            <h1 class="inbox-title-compact">Messages &amp; Communications Desk</h1>
            <p class="inbox-sub-compact">Direct, encrypted communication between candidate and verified employer.</p>
          </div>
        </div>
      </div>
      <div class="inbox-shell" id="inbox-shell" style="display: flex; align-items: center; justify-content: center; min-height: 400px;">
        <div style="text-align: center; color: var(--text-dim); padding: 40px;">
          <div style="width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--orange-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;"></div>
          <span>Loading messages...</span>
        </div>
      </div>
    </div>
  `;

  const param = isRecruiter ? `business_id=${encodeURIComponent(bId || '')}` : `user_id=${encodeURIComponent(uId || '')}`;

  const convRes = await fetch(`/api/conversations?${param}`);
  let convs = convRes.ok ? await convRes.json() : [];

  let activeConv = null;
  if (state.activeConvId) {
    activeConv = convs.find(c => c.id === state.activeConvId);
    if (!activeConv) {
      try {
        const anyRes = await fetch(`/api/conversations?business_id=${encodeURIComponent(bId || '')}&user_id=${encodeURIComponent(uId || '')}`);
        if (anyRes.ok) {
          const extra = await anyRes.json();
          const match = extra.find(c => c.id === state.activeConvId);
          if (match) {
            activeConv = match;
            convs.unshift(match);
          }
        }
      } catch(e) {}
    }
  }

  if (convs.length > 0 && !activeConv) {
    activeConv = convs[0];
    state.activeConvId = convs[0].id;
  }

  if (activeConv) {
    state.inboxMobileView = 'chat';
  }

  let messages = [];
  let counterpartOnline = false;
  if (state.activeConvId) {
    try {
      const msgRes = await fetch(`/api/conversations/${state.activeConvId}/messages?user_id=${encodeURIComponent(uId || '')}&business_id=${encodeURIComponent(bId || '')}&role=${encodeURIComponent(role || '')}`);
      if (msgRes.ok) messages = await msgRes.json();
    } catch(e) {}

    try {
      const presRes = await fetch(`/api/conversations/${state.activeConvId}/presence?current_role=${encodeURIComponent(role)}&current_user_id=${encodeURIComponent(uId || '')}`);
      if (presRes.ok) {
        const presData = await presRes.json();
        counterpartOnline = Boolean(presData.is_online);
      }
    } catch(e) {}

    // Join real-time room for instant message delivery
    joinConversationRoom(state.activeConvId);
  }

  viewport.innerHTML = `
    <div class="inbox-page-wrapper ${(state.inboxMobileView === 'chat' && activeConv) ? 'mobile-chat-open-wrapper' : ''}">
      <div class="inbox-header-compact">
        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
          <button type="button" class="btn-inbox-back-outside" onclick="navigateOutsideInbox()" title="Exit Inbox and return to previous page">
            ${svgIcon('arrowLeft', '', 15)} <span>Back</span>
          </button>
          <div style="min-width: 0; flex: 1;">
            <h1 class="inbox-title-compact">Messages &amp; Communications Desk</h1>
            <p class="inbox-sub-compact">Direct, encrypted communication between candidate and verified employer.</p>
          </div>
        </div>
      </div>

      <!-- Fixed, Screen-Fitting Flexbox Shell (Zero Outside Scroll) -->
      <div class="inbox-shell ${(state.inboxMobileView === 'chat' && activeConv) ? 'mobile-chat-open' : ''}" id="inbox-shell">
        <!-- Left Panel: Conversation Threads -->
        <div class="inbox-sidebar-panel">
          <div class="inbox-search-header">
            <input type="text" id="inbox-search-input" class="inbox-search-input" placeholder="Search conversations..." oninput="filterInboxThreads(this.value)" autocomplete="off">
          </div>

          <div class="thread-list-scroll" id="thread-list-scroll">
            ${convs.length === 0 ? `
              <div style="padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 0.85rem;">
                <div style="font-size: 1.8rem; margin-bottom: 8px;">💬</div>
                No active conversations yet.<br>Messages you send or receive will appear here.
              </div>
            ` : convs.map(c => {
              const unread = isRecruiter ? (c.unread_for_business || 0) : (c.unread_for_user || 0);
              return `
              <div class="thread-row ${c.id === state.activeConvId ? 'active' : ''}" data-conv-id="${c.id}" onclick="selectConversation('${c.id}')" data-sender="${escapeHtml(isRecruiter ? (c.candidate_name || 'Candidate') : (c.brand_name || 'Employer')).toLowerCase()}" data-job="${escapeHtml(c.job_title || '').toLowerCase()}">
                <div class="thread-avatar-wrap">
                  <img src="${isRecruiter ? (c.candidate_avatar || DEFAULT_AVATAR_PREVIEW) : (c.logo_url || DEFAULT_HOTEL_LOGO)}" alt="Avatar" class="thread-avatar-img">
                  <span class="thread-role-badge">${isRecruiter ? svgIcon('user', '', 14) : svgIcon('hotel', '', 14)}</span>
                </div>
                <div class="thread-meta-body">
                  <div class="thread-headline-row">
                    <span class="thread-sender-name">${escapeHtml(isRecruiter ? (c.candidate_name || 'Candidate') : (c.brand_name || 'Employer'))}</span>
                    <span class="thread-time-label">${c.last_message_time ? c.last_message_time.split(' ')[1] : ''}</span>
                  </div>
                  <div class="thread-job-tag">${svgIcon('briefcase', '', 13)} ${escapeHtml(c.job_title || 'Hospitality Post')}</div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="thread-snippet" style="flex: 1; min-width: 0;">${escapeHtml(c.last_message || 'Start conversation...')}</div>
                    ${unread > 0 ? `<span class="thread-unread-pill">${unread}</span>` : ''}
                  </div>
                </div>
              </div>
            `}).join('')}
          </div>
        </div>

        <!-- Right Panel: Active Chat Stream -->
        <div class="inbox-chat-panel">
          ${activeConv ? `
            <!-- Context Bar with Job Link & Actions -->
            <div class="chat-context-bar">
              <div class="chat-recipient-meta">
                <button type="button" class="btn-chat-back-to-threads" onclick="closeMobileChat()" title="Back to conversations">
                  ${svgIcon('chevronLeft', '', 20)}
                </button>
                <img src="${isRecruiter ? (activeConv.candidate_avatar || DEFAULT_AVATAR_PREVIEW) : (activeConv.logo_url || DEFAULT_HOTEL_LOGO)}" alt="Avatar" class="chat-recipient-avatar">
                <div style="min-width: 0;">
                  <div style="display: flex; align-items: center; flex-wrap: wrap;">
                    <span class="chat-recipient-name">${escapeHtml(isRecruiter ? activeConv.candidate_name : activeConv.brand_name)}</span>
                    ${renderChatPresenceHtml(counterpartOnline)}
                  </div>
                  <div class="chat-job-context-pill">
                    ${svgIcon('briefcase', '', 13)} <strong>${escapeHtml(activeConv.job_title || 'Direct Discussion')}</strong>
                    ${activeConv.application_status ? `<span class="badge-featured" style="margin-left: 6px; text-transform: capitalize;">${escapeHtml(activeConv.application_status)}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="chat-actions-group">
                ${activeConv.job_id ? `
                  <button class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="openJobDetailModal('${activeConv.job_id}')">
                    Job Details
                  </button>
                ` : ''}
                ${isRecruiter ? (activeConv.application_id ? `
                  <button class="btn-orange" style="padding: 6px 14px; font-size: 0.8rem;" onclick="viewSubmittedApplicationCv('${activeConv.application_id}')">
                    ${svgIcon('fileText', '', 13)} View CV
                  </button>
                ` : '') : (state.profile?.cv_name ? `
                  <button class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="previewCandidateCvModal('${escapeHtml(state.profile?.headline || 'Hospitality Resume')}', '${escapeHtml(state.profile?.cv_name)}')">
                    ${svgIcon('fileText', '', 13)} Preview CV
                  </button>
                ` : '')}
              </div>
            </div>

            ${isRecruiter ? `
            <!-- Quick Hospitality Reply Templates (Recruiter Only) -->
            <div class="chat-templates-shelf">
              <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Templates:</span>
              <button class="template-chip" onclick="insertMessageTemplate('interview')">${svgIcon('calendar', '', 14)} Schedule Interview</button>
              <button class="template-chip" onclick="insertMessageTemplate('opera')">${svgIcon('fileText', '', 14)} Request Documents</button>
              <button class="template-chip" onclick="insertMessageTemplate('offer')">${svgIcon('award', '', 14)} Send Offer</button>
            </div>
            ` : ''}

            <!-- Messages Stream (Only this scrolls) -->
            <div class="chat-stream-scroll" id="chat-stream-scroll">
              ${messages.length === 0 ? `
                <div class="empty-chat-prompt" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); text-align: center; padding: 40px 20px;">
                  <div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(37, 99, 235, 0.15); color: #60a5fa; display: flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                    ${svgIcon('messageCircle', '', 24)}
                  </div>
                  <h3 style="color: var(--white); font-weight: 700; margin-bottom: 6px; font-size: 1.05rem;">Direct Channel Ready</h3>
                  <p style="max-width: 420px; font-size: 0.84rem; color: var(--text-muted); line-height: 1.5; margin: 0;">
                    Send your first message, share documents, voice notes, or photos directly with <strong>${escapeHtml(isRecruiter ? activeConv.candidate_name : activeConv.brand_name)}</strong>.
                  </p>
                </div>
              ` : messages.map(msg => {
                const isMine = (state.currentUser && msg.sender_id === state.currentUser.id)
                  || (isRecruiter && msg.sender_role === 'business')
                  || (!isRecruiter && msg.sender_role === 'user');
                return renderChatBubbleHtml(msg, isMine);
              }).join('')}
              <div class="chat-typing-row" id="chat-typing-indicator" style="display: none;">
                <div class="chat-typing-bubble">
                  <span class="chat-typing-dot"></span>
                  <span class="chat-typing-dot"></span>
                  <span class="chat-typing-dot"></span>
                </div>
                <span class="chat-typing-label" id="chat-typing-label">Typing...</span>
              </div>
            </div>

            <!-- Input Bar with Image, Voice & Document Options -->
            <div class="chat-composer-row" id="chat-composer-row">
              <input type="file" id="chat-file-input" accept="image/png, image/jpeg, image/jpg, image/webp, application/pdf, .doc, .docx, .txt" style="display: none;" onchange="handleChatFileUpload(event)">
              <button type="button" class="btn-chat-media-btn" onclick="document.getElementById('chat-file-input').click()" title="Send Photo or Document">
                ${svgIcon('paperclip', '', 18)}
              </button>
              <input type="text" id="chat-input-field" class="chat-composer-input" placeholder="Type a message... (Press Enter to send)" oninput="handleChatTypingInput()" onblur="sendChatTypingStop()" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendChatMessage(); }" autocomplete="off">
              <button type="button" class="btn-chat-media-btn btn-chat-mic-btn" id="btn-chat-mic" onclick="startVoiceMessageRecording()" title="Record Voice Note">
                ${svgIcon('mic', '', 18)}
              </button>
              <button type="button" class="btn-primary btn-chat-send-submit" onclick="sendChatMessage()">
                <span>Send</span> ${svgIcon('send', '', 14)}
              </button>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); font-size: 0.9rem; text-align: center; padding: 30px;">
              <div style="font-size: 2.2rem; margin-bottom: 10px;">✉️</div>
              <h3 style="color: var(--white); font-weight: 700; margin-bottom: 4px;">No Conversation Selected</h3>
              <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 360px;">Choose a candidate or hotel from the left list, or click 'Message' on an application or review dossier to start chatting.</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  // Auto-scroll to bottom of chat history on initial render
  const scrollBox = document.getElementById('chat-stream-scroll');
  if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;

  // Mark active conversation read if viewing
  if (state.activeConvId) {
    sendChatMessageRead(state.activeConvId);
  }
}

function navigateOutsideInbox() {
  if (state.activeConvId) {
    leaveConversationRoom(state.activeConvId);
  }
  if (state.lastNonInboxScreen && state.lastNonInboxScreen !== 'inbox' && state.lastNonInboxScreen !== 'messages') {
    navigateTo(state.lastNonInboxScreen);
  } else if (window.history.length > 1) {
    window.history.back();
  } else {
    navigateTo('home');
  }
}

function closeMobileChat() {
  state.inboxMobileView = 'threads';
  const shell = document.getElementById('inbox-shell');
  if (shell) {
    shell.classList.remove('mobile-chat-open');
  }
  const wrapper = document.querySelector('.inbox-page-wrapper');
  if (wrapper) {
    wrapper.classList.remove('mobile-chat-open-wrapper');
  }
}

function filterInboxThreads(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#thread-list-scroll .thread-row');
  rows.forEach(r => {
    const s = r.getAttribute('data-sender') || '';
    const j = r.getAttribute('data-job') || '';
    if (!q || s.includes(q) || j.includes(q)) {
      r.style.display = 'flex';
    } else {
      r.style.display = 'none';
    }
  });
}

async function selectConversation(convId) {
  if (state.activeConvId && state.activeConvId !== convId) {
    leaveConversationRoom(state.activeConvId);
  }
  state.activeConvId = convId;
  state.inboxMobileView = 'chat';
  try {
    window.history.replaceState(null, '', `#inbox?conv=${convId}&chat=1`);
  } catch(e) {}
  const conv = (state.conversations || []).find(c => c.id === convId);
  if (conv) {
    if (state.currentRole === 'jobseeker') {
      conv.unread_for_user = 0;
    } else if (state.currentRole === 'recruiter') {
      conv.unread_for_business = 0;
    }
  }
  updateNavigation();
  sendChatMessageRead(convId);
  const viewport = document.getElementById('app-viewport');
  if (viewport) {
    await renderInboxScreen(viewport);
  }
}

function insertMessageTemplate(type) {
  const input = document.getElementById('chat-input-field');
  if (!input) return;

  if (type === 'interview') {
    input.value = "We were impressed with your qualifications and would like to invite you for an interview. Please let us know your availability.";
  } else if (type === 'opera') {
    input.value = "Could you please share your certifications and recent portfolio documents?";
  } else if (type === 'offer') {
    input.value = "Congratulations! Our leadership team has agreed to extend a formal offer for the position.";
  }
  input.focus();
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input-field');
  if (!input) return;

  if (!state.activeConvId) {
    showToast('Please select a conversation from the list to message.', 'warning');
    return;
  }

  const content = input.value.trim();
  if (!content) {
    input.focus();
    return;
  }

  sendChatTypingStop();

  const isRecruiter = state.currentRole === 'recruiter';
  const tempMsgId = `msg_tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const payload = {
    conversation_id: state.activeConvId,
    temp_id: tempMsgId,
    sender_id: state.currentUser?.id || (isRecruiter ? (state.currentUser?.business_id || state.activeHotelId) : ''),
    business_id: isRecruiter ? (state.currentUser?.business_id || state.activeHotelId || '') : '',
    sender_role: isRecruiter ? 'business' : 'user',
    sender_name: isRecruiter ? (state.currentUser?.name || 'Hotel Recruiter') : (state.currentUser?.name || 'Candidate'),
    content: content
  };

  // 1. Instantly append to chat stream
  const stream = document.getElementById('chat-stream-scroll');
  if (stream) {
    const emptyPrompt = stream.querySelector('.empty-chat-prompt');
    if (emptyPrompt) emptyPrompt.remove();

    const typingRow = document.getElementById('chat-typing-indicator');
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'chat-bubble-row mine';
    bubbleEl.setAttribute('data-msg-id', tempMsgId);
    bubbleEl.style.animation = 'fadeIn 0.2s ease';
    bubbleEl.innerHTML = `
      <span class="bubble-author-title">${escapeHtml(payload.sender_name)}</span>
      ${renderChatMessageContentHtml(content)}
      <span class="bubble-timestamp">
        <span>${nowTime}</span>
        <span class="bubble-status-mark status-sending" title="Sending...">🕒</span>
      </span>
    `;
    if (typingRow) {
      stream.insertBefore(bubbleEl, typingRow);
    } else {
      stream.appendChild(bubbleEl);
    }
    stream.scrollTop = stream.scrollHeight;
  }

  // 2. Clear input immediately & keep focus
  input.value = '';
  input.focus();

  // 3. Update left sidebar snippet & time immediately, and move thread to top
  moveThreadRowToTop(state.activeConvId, content, nowTime);

  // 4. Background network dispatch
  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const tempBubble = document.querySelector(`[data-msg-id="${tempMsgId}"]`);
      if (tempBubble) {
        const mark = tempBubble.querySelector('.bubble-status-mark');
        if (mark) {
          mark.textContent = '⚠️';
          mark.title = 'Failed to send: ' + (err.detail || 'Error');
          mark.style.color = '#ef4444';
        }
      }
      showToast('Delivery warning: ' + (err.detail || 'Could not send message'), 'warning');
    } else {
      const respData = await res.json();
      if (respData && respData.message_id) {
        const tempBubble = document.querySelector(`[data-msg-id="${tempMsgId}"]`);
        if (tempBubble) {
          tempBubble.setAttribute('data-msg-id', respData.message_id);
          const mark = tempBubble.querySelector('.bubble-status-mark');
          if (mark) {
            if (respData.status === 'delivered') {
              mark.className = 'bubble-status-mark status-delivered';
              mark.textContent = '✓✓';
              mark.title = 'Delivered to recipient';
            } else {
              mark.className = 'bubble-status-mark status-sent';
              mark.textContent = '✓';
              mark.title = 'Sent to server';
            }
          }
        }
      }
    }
  } catch (err) {
    const tempBubble = document.querySelector(`[data-msg-id="${tempMsgId}"]`);
    if (tempBubble) {
      const mark = tempBubble.querySelector('.bubble-status-mark');
      if (mark) {
        mark.textContent = '⚠️';
        mark.title = 'Network error';
        mark.style.color = '#ef4444';
      }
    }
    showToast('Failed to send message: ' + err.message, 'danger');
  }
}

async function handleChatFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  showToast('Saving attachment to server...', 'info');
  try {
    const res = await fetch('/api/messages/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.file_url) throw new Error(data.detail || 'Upload failed');

    if (data.file_type === 'image') {
      sendChatDirectMessage(`[IMAGE]:${data.file_url}`);
    } else if (data.file_type === 'audio') {
      sendChatDirectMessage(`[VOICE]:Voice Note:${data.file_url}`);
    } else {
      sendChatDirectMessage(`[DOC]:${data.file_name || file.name}:${data.file_url}`);
    }
    event.target.value = '';
  } catch (err) {
    showToast('Failed to upload file: ' + err.message, 'danger');
  }
}

// Backwards compatibility alias
const handleChatImageUpload = handleChatFileUpload;

let chatVoiceTimer = null;
let chatVoiceSeconds = 0;
let chatVoiceMediaRecorder = null;
let chatVoiceAudioChunks = [];

async function startVoiceMessageRecording() {
  const row = document.getElementById('chat-composer-row');
  if (!row) return;

  chatVoiceSeconds = 0;
  chatVoiceAudioChunks = [];

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (stream) {
        chatVoiceMediaRecorder = new MediaRecorder(stream);
        chatVoiceMediaRecorder.ondataavailable = e => { if (e.data.size > 0) chatVoiceAudioChunks.push(e.data); };
        chatVoiceMediaRecorder.start();
      }
    }
  } catch (e) {}

  row.innerHTML = `
    <div class="recording-active-bar" style="width: 100%; display: flex; align-items: center; gap: 10px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 14px; border-radius: var(--radius-md);">
      <div class="recording-dot-pulse"></div>
      <span style="color: #ef4444; font-weight: 700; font-size: 0.85rem;" id="recording-time-display">00:00</span>
      <span style="font-size: 0.76rem; color: rgba(255, 255, 255, 0.8);">Recording voice message...</span>
      <div style="flex: 1;"></div>
      <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="cancelVoiceRecording()">Cancel</button>
      <button type="button" class="btn-orange" style="padding: 4px 12px; font-size: 0.75rem;" onclick="finishVoiceRecording()">Send Voice Note</button>
    </div>
  `;

  chatVoiceTimer = setInterval(() => {
    chatVoiceSeconds++;
    const mins = String(Math.floor(chatVoiceSeconds / 60)).padStart(2, '0');
    const secs = String(chatVoiceSeconds % 60).padStart(2, '0');
    const disp = document.getElementById('recording-time-display');
    if (disp) disp.innerText = `${mins}:${secs}`;
  }, 1000);
}

function cancelVoiceRecording() {
  if (chatVoiceTimer) clearInterval(chatVoiceTimer);
  if (chatVoiceMediaRecorder && chatVoiceMediaRecorder.state !== 'inactive') {
    try { chatVoiceMediaRecorder.stop(); } catch(e) {}
  }
  renderInboxScreen(document.getElementById('app-viewport'));
}

async function finishVoiceRecording() {
  if (chatVoiceTimer) clearInterval(chatVoiceTimer);
  const durSec = Math.max(1, chatVoiceSeconds);
  const mins = Math.floor(durSec / 60);
  const secs = String(durSec % 60).padStart(2, '0');
  const durStr = `${mins}:${secs}`;

  showToast('Saving voice message to server...', 'info');

  if (chatVoiceMediaRecorder && chatVoiceMediaRecorder.state !== 'inactive') {
    chatVoiceMediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(chatVoiceAudioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', blob, `voice_${Date.now()}.webm`);
        const res = await fetch('/api/messages/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.file_url) {
          sendChatDirectMessage(`[VOICE]:${durStr}:${data.file_url}`);
        } else {
          showToast('Failed to save voice note', 'danger');
          renderInboxScreen(document.getElementById('app-viewport'));
        }
      } catch(e) {
        showToast('Voice note error: ' + e.message, 'danger');
        renderInboxScreen(document.getElementById('app-viewport'));
      }
    };
    try {
      chatVoiceMediaRecorder.stop();
    } catch(e) {}
    return;
  }
  renderInboxScreen(document.getElementById('app-viewport'));
}

async function sendChatDirectMessage(content) {
  if (!state.activeConvId) return;
  const isRecruiter = state.currentRole === 'recruiter';
  const tempMsgId = `msg_tmp_${Date.now()}`;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const payload = {
    conversation_id: state.activeConvId,
    sender_id: state.currentUser?.id || '',
    sender_role: isRecruiter ? 'business' : 'user',
    sender_name: isRecruiter ? (state.currentUser?.name || 'Hotel Recruiter') : (state.currentUser?.name || 'Candidate'),
    content: content
  };

  // Instantly append to chat stream
  const stream = document.getElementById('chat-stream-scroll');
  if (stream) {
    const emptyPrompt = stream.querySelector('.empty-chat-prompt');
    if (emptyPrompt) emptyPrompt.remove();

    const myBubble = document.createElement('div');
    myBubble.className = 'chat-bubble-row mine';
    myBubble.setAttribute('data-msg-id', tempMsgId);
    myBubble.style.animation = 'fadeIn 0.2s ease';
    myBubble.innerHTML = `
      <span class="bubble-author-title">${escapeHtml(payload.sender_name)}</span>
      ${renderChatMessageContentHtml(content)}
      <span class="bubble-timestamp">${now}</span>
    `;
    stream.appendChild(myBubble);
    stream.scrollTop = stream.scrollHeight;
  }

  // Update left sidebar snippet
  const activeRow = document.querySelector('.thread-row.active');
  if (activeRow) {
    const snip = activeRow.querySelector('.thread-snippet');
    if (snip) snip.textContent = content.startsWith('[IMAGE]') ? 'Photo attachment' : (content.startsWith('[VOICE]') ? 'Voice message' : 'Document attachment');
    const tm = activeRow.querySelector('.thread-time-label');
    if (tm) tm.textContent = now;
  }

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast('Delivery warning: ' + (err.detail || 'Could not send attachment'), 'warning');
    } else {
      const respData = await res.json();
      if (respData && respData.message_id) {
        const tempBubble = document.querySelector(`[data-msg-id="${tempMsgId}"]`);
        if (tempBubble) tempBubble.setAttribute('data-msg-id', respData.message_id);
      }
    }
  } catch (err) {
    showToast('Failed to send attachment: ' + err.message, 'danger');
  }
}

function togglePlayVoiceMessage(btn, audioUrl) {
  const waveBars = btn.parentElement ? btn.parentElement.querySelectorAll('.voice-wave-bar') : [];
  const isPlaying = btn.classList.contains('is-playing');

  if (isPlaying) {
    btn.classList.remove('is-playing');
    btn.innerHTML = svgIcon('play', '', 14);
    waveBars.forEach(bar => bar.classList.remove('playing'));
    if (window._currentVoiceAudio) {
      window._currentVoiceAudio.pause();
      window._currentVoiceAudio = null;
    }
  } else {
    document.querySelectorAll('.voice-play-btn.is-playing').forEach(b => {
      b.classList.remove('is-playing');
      b.innerHTML = svgIcon('play', '', 14);
      if (b.parentElement) {
        b.parentElement.querySelectorAll('.voice-wave-bar').forEach(bar => bar.classList.remove('playing'));
      }
    });
    if (window._currentVoiceAudio) {
      window._currentVoiceAudio.pause();
    }

    btn.classList.add('is-playing');
    btn.innerHTML = svgIcon('pause', '', 14);
    waveBars.forEach(bar => bar.classList.add('playing'));

    if (audioUrl) {
      const audio = new Audio(audioUrl);
      window._currentVoiceAudio = audio;
      audio.onended = () => {
        btn.classList.remove('is-playing');
        btn.innerHTML = svgIcon('play', '', 14);
        waveBars.forEach(bar => bar.classList.remove('playing'));
      };
      audio.play().catch(e => {
        console.error('Audio play error:', e);
        btn.classList.remove('is-playing');
        btn.innerHTML = svgIcon('play', '', 14);
        waveBars.forEach(bar => bar.classList.remove('playing'));
      });
    }
  }
}

function viewChatImageModal(imageUrl) {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-chat-image" onclick="closeModal('modal-chat-image')">
      <div class="modal-dialog" style="max-width: 800px; background: transparent; box-shadow: none; border: none; text-align: center;" onclick="event.stopPropagation()">
        <div style="position: relative; display: inline-block;">
          <button class="modal-close" style="position: absolute; top: -14px; right: -14px; background: rgba(0,0,0,0.8); z-index: 10;" onclick="closeModal('modal-chat-image')" aria-label="Close">${svgIcon('x', '', 18)}</button>
          <img src="${imageUrl}" alt="Attachment preview" style="max-width: 100%; max-height: 80vh; border-radius: 12px; box-shadow: 0 25px 60px rgba(0,0,0,0.9); border: 2px solid rgba(255,255,255,0.2);">
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// Admin Security Portal & Login Flow
// ==========================================================================

const adminLoginState = {
  failedAttempts: 0,
  lockoutUntil: 0,
  isSubmitting: false,
  showPassword: false
};

function renderAdminLoginScreen(viewport) {
  const isLockedOut = Date.now() < adminLoginState.lockoutUntil;
  const remainingSecs = isLockedOut ? Math.ceil((adminLoginState.lockoutUntil - Date.now()) / 1000) : 0;

  viewport.innerHTML = `
    <div class="admin-login-wrapper">
      <div class="admin-login-card-simple">
        <form id="admin-login-form" onsubmit="handleAdminLoginSubmit(event)">
          <div class="admin-form-group-simple">
            <label class="admin-simple-label" for="admin-input-email">Email</label>
            <input
              type="email"
              id="admin-input-email"
              class="admin-simple-input"
              placeholder="Email"
              autocomplete="username"
              required
              ${isLockedOut ? 'disabled' : ''}
            >
          </div>

          <div class="admin-form-group-simple">
            <label class="admin-simple-label" for="admin-input-password">Password</label>
            <input
              type="password"
              id="admin-input-password"
              class="admin-simple-input"
              placeholder="Password"
              autocomplete="current-password"
              required
              ${isLockedOut ? 'disabled' : ''}
            >
          </div>

          <div class="admin-form-group-simple">
            <label class="admin-simple-label" for="admin-input-pin">Master Key</label>
            <input
              type="password"
              id="admin-input-pin"
              class="admin-simple-input"
              placeholder="Master Key"
              autocomplete="off"
              required
              ${isLockedOut ? 'disabled' : ''}
            >
          </div>

          <div id="admin-login-error" style="display: none; padding: 8px 10px; margin-bottom: 12px; border-radius: 4px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #f87171;"></div>

          <button
            type="submit"
            id="admin-submit-btn"
            class="admin-simple-btn"
            ${isLockedOut ? 'disabled' : ''}
          >
            ${adminLoginState.isSubmitting ? 'Verifying...' : (isLockedOut ? `Locked (${remainingSecs}s)` : 'Login')}
          </button>
        </form>
      </div>
    </div>
  `;

  if (isLockedOut) {
    startAdminLockoutCountdown();
  }
}

function startAdminLockoutCountdown() {
  const timerEl = document.getElementById('admin-submit-btn');
  const interval = setInterval(() => {
    const remaining = Math.ceil((adminLoginState.lockoutUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(interval);
      adminLoginState.lockoutUntil = 0;
      adminLoginState.failedAttempts = 0;
      const viewport = document.getElementById('app-viewport');
      if (viewport && state.currentScreen === 'admin-login') {
        renderAdminLoginScreen(viewport);
      }
    } else {
      if (timerEl) timerEl.textContent = `Locked (${remaining}s)`;
    }
  }, 1000);
}

async function handleAdminLoginSubmit(event) {
  event.preventDefault();
  if (adminLoginState.isSubmitting) return;

  const email = (document.getElementById('admin-input-email')?.value || '').trim();
  const password = (document.getElementById('admin-input-password')?.value || '').trim();
  const pin = (document.getElementById('admin-input-pin')?.value || '').trim();
  const errorBox = document.getElementById('admin-login-error');

  if (errorBox) errorBox.style.display = 'none';

  adminLoginState.isSubmitting = true;
  const submitBtn = document.getElementById('admin-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, security_pin: pin })
    });

    const data = await res.json();

    if (!res.ok) {
      adminLoginState.failedAttempts++;
      if (res.status === 429 || adminLoginState.failedAttempts >= 5) {
        adminLoginState.lockoutUntil = Date.now() + 60000;
      }
      const errMsg = data.detail || 'Invalid login';
      if (errorBox) {
        errorBox.textContent = errMsg;
        errorBox.style.display = 'block';
      }
      showToast(errMsg, 'danger');
      adminLoginState.isSubmitting = false;
      const viewport = document.getElementById('app-viewport');
      if (viewport && adminLoginState.lockoutUntil > Date.now()) {
        renderAdminLoginScreen(viewport);
      } else if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
      return;
    }

    sessionStorage.setItem('nicejobs_admin_session', JSON.stringify({
      token: data.token,
      user: data.user,
      clearance: data.clearance,
      expiresAt: Date.now() + 4 * 3600 * 1000
    }));

    state.currentUser = data.user;
    state.currentRole = 'admin';

    const statusText = document.getElementById('role-status-text');
    if (statusText) {
      statusText.innerHTML = `Signed in as <strong>${data.user.name}</strong> (Root Admin)`;
    }

    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));

    showToast('Login successful', 'success');
    adminLoginState.failedAttempts = 0;
    adminLoginState.isSubmitting = false;
    navigateTo('admin');
  } catch (err) {
    adminLoginState.isSubmitting = false;
    if (errorBox) {
      errorBox.textContent = 'Connection error: ' + err.message;
      errorBox.style.display = 'block';
    }
    showToast('Failed to connect to authentication server: ' + err.message, 'danger');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  }
}

function adminSignOut() {
  sessionStorage.removeItem('nicejobs_admin_session');
  state.currentUser = null;
  state.currentRole = 'guest';
  const statusText = document.getElementById('role-status-text');
  if (statusText) statusText.innerHTML = `Browsing as <strong>Guest Visitor</strong> (Public Mode)`;
  document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
  const guestBtn = document.getElementById('btn-role-guest');
  if (guestBtn) guestBtn.classList.add('active');
  showToast('Logged out of administrative console.', 'info');
  navigateTo('home');
}

// ==========================================================================
// Screen 7: Admin Console & Verification Queue
// ==========================================================================

const adminState = {
  activeTab: 'users', // 'users' | 'jobs' | 'businesses' | 'moderators' | 'verifications'
  userFilterRole: 'all',
  userFilterStatus: 'all',
  userSearch: '',
  jobFilterStatus: 'all',
  jobSearch: ''
};

async function renderAdminScreen(viewport) {
  try {
    const [overviewRes, usersRes, jobsRes, bizRes, modRes, verifsRes] = await Promise.all([
      fetch('/api/admin/overview').catch(() => ({ json: () => ({}) })),
      fetch('/api/admin/users').catch(() => ({ json: () => [] })),
      fetch('/api/admin/jobs-list').catch(() => ({ json: () => [] })),
      fetch('/api/admin/businesses-list').catch(() => ({ json: () => [] })),
      fetch('/api/admin/moderator-requests').catch(() => ({ json: () => [] })),
      fetch('/api/admin/verifications').catch(() => ({ json: () => [] }))
    ]);

    const overview = await overviewRes.json();
    const users = await usersRes.json();
    const jobs = await jobsRes.json();
    const businesses = await bizRes.json();
    const moderatorRequests = await modRes.json();
    const verifications = await verifsRes.json();

    // Filter Users
    const filteredUsers = users.filter(u => {
      if (adminState.userFilterRole !== 'all' && u.role !== adminState.userFilterRole) return false;
      if (adminState.userFilterStatus !== 'all' && u.status !== adminState.userFilterStatus) return false;
      if (adminState.userSearch) {
        const q = adminState.userSearch.toLowerCase();
        const name = (u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const phone = (u.phone || '').toLowerCase();
        const bName = (u.business_name || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q) && !bName.includes(q)) return false;
      }
      return true;
    });

    // Filter Jobs
    const filteredJobs = jobs.filter(j => {
      if (adminState.jobFilterStatus !== 'all' && j.status !== adminState.jobFilterStatus) return false;
      if (adminState.jobSearch) {
        const q = adminState.jobSearch.toLowerCase();
        const title = (j.title || '').toLowerCase();
        const dept = (j.department || '').toLowerCase();
        const bName = (j.brand_name || '').toLowerCase();
        if (!title.includes(q) && !dept.includes(q) && !bName.includes(q)) return false;
      }
      return true;
    });

    const activeTab = adminState.activeTab;

    viewport.innerHTML = `
      <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--white); margin: 0;">Backend Control Console</h1>
            <span class="badge-urgent" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border-color: rgba(239, 68, 68, 0.35);">Live Root Admin</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 4px;">
            Full administrative oversight of candidate users, business accounts, moderator approvals, and job postings.
          </p>
        </div>
        <button class="btn-secondary" style="font-size: 0.82rem; padding: 8px 14px;" onclick="renderAdminScreen(document.getElementById('app-viewport'))">
          ${svgIcon('refresh', '', 14)} Refresh Console
        </button>
      </div>

      <!-- Live Metrics Ribbon -->
      <div class="admin-metrics-grid">
        <div class="admin-metric-card">
          <div class="admin-metric-val">${overview.total_candidates ?? users.filter(u=>u.role==='jobseeker').length}</div>
          <div class="admin-metric-lbl">Total Candidates</div>
        </div>
        <div class="admin-metric-card accent-orange">
          <div class="admin-metric-val">${overview.total_business_users ?? users.filter(u=>u.role==='recruiter').length}</div>
          <div class="admin-metric-lbl">Business Representatives</div>
        </div>
        <div class="admin-metric-card accent-green">
          <div class="admin-metric-val">${overview.total_businesses ?? businesses.length}</div>
          <div class="admin-metric-lbl">Listed Hotels & Resorts</div>
        </div>
        <div class="admin-metric-card accent-orange">
          <div class="admin-metric-val">${overview.pending_moderators ?? moderatorRequests.length}</div>
          <div class="admin-metric-lbl">Pending Moderators</div>
        </div>
        <div class="admin-metric-card">
          <div class="admin-metric-val">${overview.active_jobs ?? jobs.filter(j=>j.status==='active').length}</div>
          <div class="admin-metric-lbl">Active Job Posts</div>
        </div>
        <div class="admin-metric-card accent-red">
          <div class="admin-metric-val">${overview.suspended_users ?? users.filter(u=>u.status==='suspended').length}</div>
          <div class="admin-metric-lbl">Suspended Users</div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="admin-nav-tabs">
        <button class="admin-nav-btn ${activeTab === 'users' ? 'active' : ''}" onclick="switchAdminTab('users')">
          ${svgIcon('users', '', 14)} Users Management (${users.length})
        </button>
        <button class="admin-nav-btn ${activeTab === 'jobs' ? 'active' : ''}" onclick="switchAdminTab('jobs')">
          ${svgIcon('briefcase', '', 14)} Job Posts Control (${jobs.length})
        </button>
        <button class="admin-nav-btn ${activeTab === 'businesses' ? 'active' : ''}" onclick="switchAdminTab('businesses')">
          ${svgIcon('hotel', '', 14)} Business Directory (${businesses.length})
        </button>
        <button class="admin-nav-btn ${activeTab === 'moderators' ? 'active' : ''}" onclick="switchAdminTab('moderators')">
          ${svgIcon('shield', '', 14)} Moderator Requests (${moderatorRequests.length})
        </button>
        <button class="admin-nav-btn ${activeTab === 'verifications' ? 'active' : ''}" onclick="switchAdminTab('verifications')">
          ${svgIcon('fileText', '', 14)} Trade Verifications (${verifications.length})
        </button>
      </div>

      <!-- TAB 1: USERS MANAGEMENT (Both Candidates and Business Users) -->
      ${activeTab === 'users' ? `
        <div class="admin-table-wrapper">
          <div class="admin-table-actions-bar">
            <div class="admin-filter-group">
              <input type="text" class="admin-search-box" placeholder="Search by name, email, phone, or hotel..." 
                value="${adminState.userSearch}" oninput="adminState.userSearch = this.value; renderAdminScreen(document.getElementById('app-viewport'))">
              
              <select class="admin-select-filter" onchange="adminState.userFilterRole = this.value; renderAdminScreen(document.getElementById('app-viewport'))">
                <option value="all" ${adminState.userFilterRole === 'all' ? 'selected' : ''}>All Roles</option>
                <option value="jobseeker" ${adminState.userFilterRole === 'jobseeker' ? 'selected' : ''}>Candidates Only</option>
                <option value="recruiter" ${adminState.userFilterRole === 'recruiter' ? 'selected' : ''}>Business Users Only</option>
                <option value="admin" ${adminState.userFilterRole === 'admin' ? 'selected' : ''}>Platform Admins</option>
              </select>

              <select class="admin-select-filter" onchange="adminState.userFilterStatus = this.value; renderAdminScreen(document.getElementById('app-viewport'))">
                <option value="all" ${adminState.userFilterStatus === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="active" ${adminState.userFilterStatus === 'active' ? 'selected' : ''}>Active</option>
                <option value="pending_approval" ${adminState.userFilterStatus === 'pending_approval' ? 'selected' : ''}>Pending Approval</option>
                <option value="suspended" ${adminState.userFilterStatus === 'suspended' ? 'selected' : ''}>Suspended</option>
              </select>
            </div>
            <span style="font-size: 0.8rem; color: var(--text-dim);">${filteredUsers.length} user accounts found</span>
          </div>

          <div style="overflow-x: auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th>Role & Designation</th>
                  <th>Contact (+88 Cell & Email)</th>
                  <th>Account Status</th>
                  <th>Business Role</th>
                  <th style="text-align: right;">Administrative Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filteredUsers.map(u => `
                  <tr>
                    <td>
                      <div class="admin-user-cell">
                        <img src="${u.avatar_url || DEFAULT_AVATAR_PREVIEW}" alt="${u.name}">
                        <div>
                          <strong style="color: var(--white);">${u.name}</strong>
                          <div style="font-size: 0.74rem; color: var(--text-dim);">${u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="badge-count" style="font-size: 0.72rem; ${u.role==='jobseeker' ? 'background: rgba(255, 255, 255, 0.08); color:#93c5fd;' : 'background: rgba(249,115,22,0.2); color:#fdba74;'}">
                        ${u.role === 'jobseeker' ? 'Candidate' : (u.role === 'recruiter' ? 'Business User' : 'Admin')}
                      </span>
                      <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">
                        ${u.designation || u.current_position || u.headline || 'Hospitality Associate'}
                      </div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: var(--white); font-size: 0.82rem;">+88 ${u.phone}</div>
                      <div style="font-size: 0.78rem; color: var(--text-dim);">${u.email}</div>
                    </td>
                    <td>
                      <span class="status-pill status-${u.status === 'active' ? 'interview_scheduled' : (u.status === 'suspended' ? 'rejected' : 'under_review')}">
                        ${u.status}
                      </span>
                    </td>
                    <td>
                      ${u.business_name ? `
                        <div style="font-weight: 700; color: var(--white); font-size: 0.82rem;">${u.business_name}</div>
                        <div style="font-size: 0.74rem; color: #fdba74;">
                          ${u.is_business_admin ? `${svgIcon('award', '', 13)} Business Admin` : (u.membership_role || 'Moderator')}
                        </div>
                      ` : `
                        <span style="font-size: 0.75rem; color: var(--text-dim);">${u.candidate_location || 'Dhaka, Bangladesh'}</span>
                      `}
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        ${u.status === 'suspended' ? `
                          <button class="admin-btn-action btn-activate" onclick="handleAdminUserStatus('${u.id}', 'active')">
                            Reactivate
                          </button>
                        ` : `
                          <button class="admin-btn-action btn-suspend" onclick="handleAdminUserStatus('${u.id}', 'suspended')">
                            Suspend
                          </button>
                        `}
                        <button class="admin-btn-action btn-delete" onclick="handleAdminDeleteUser('${u.id}', '${u.name}')" title="Delete account">
                          ${svgIcon('trash', '', 14)}
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- TAB 2: JOB POSTS CONTROL -->
      ${activeTab === 'jobs' ? `
        <div class="admin-table-wrapper">
          <div class="admin-table-actions-bar">
            <div class="admin-filter-group">
              <input type="text" class="admin-search-box" placeholder="Search by job title, department, or hotel..." 
                value="${adminState.jobSearch}" oninput="adminState.jobSearch = this.value; renderAdminScreen(document.getElementById('app-viewport'))">
              
              <select class="admin-select-filter" onchange="adminState.jobFilterStatus = this.value; renderAdminScreen(document.getElementById('app-viewport'))">
                <option value="all" ${adminState.jobFilterStatus === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="active" ${adminState.jobFilterStatus === 'active' ? 'selected' : ''}>Active</option>
                <option value="paused" ${adminState.jobFilterStatus === 'paused' ? 'selected' : ''}>Paused</option>
                <option value="closed" ${adminState.jobFilterStatus === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
            </div>
            <span style="font-size: 0.8rem; color: var(--text-dim);">${filteredJobs.length} job postings</span>
          </div>

          <div style="overflow-x: auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Job Title & Department</th>
                  <th>Hotel / Establishment</th>
                  <th>Salary & Type</th>
                  <th>Job Posts / Applicants</th>
                  <th>Status & Highlights</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filteredJobs.map(j => `
                  <tr>
                    <td>
                      <strong style="color: var(--white); font-size: 0.92rem;">${j.title}</strong>
                      <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 2px;">
                        ${j.department} • Level: ${j.experience_level}
                      </div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: var(--white);">${j.brand_name}</div>
                      <div style="font-size: 0.76rem; color: var(--text-dim);">${j.property_location}</div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: var(--white);">${(j.is_negotiable || j.salary_period === 'negotiable' || (!j.salary_min && !j.salary_max)) ? 'BDT Negotiable' : `BDT ${j.salary_min?.toLocaleString()} - ${j.salary_max?.toLocaleString()}`}</div>
                      <div style="font-size: 0.75rem; color: var(--text-dim);">${j.employment_type} • ${j.shift}</div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: #a7f3d0;">${j.live_applicants_count || j.applicant_count || 0} applicants</div>
                      <div style="font-size: 0.75rem; color: var(--text-dim);">${j.vacancies || 1} post</div>
                    </td>
                    <td>
                      <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="status-pill status-${j.status === 'active' ? 'interview_scheduled' : (j.status === 'paused' ? 'under_review' : 'rejected')}">
                          ${j.status}
                        </span>
                        <div style="display: flex; gap: 4px; margin-top: 2px;">
                          ${j.is_featured ? '<span class="badge-featured" style="font-size: 0.68rem; padding: 2px 6px;">Featured</span>' : ''}
                          ${j.is_urgent ? '<span class="badge-urgent" style="font-size: 0.68rem; padding: 2px 6px;">Urgent</span>' : ''}
                        </div>
                      </div>
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        <select class="admin-select-filter" style="height: 28px; font-size: 0.74rem;" 
                          onchange="handleAdminJobStatus('${j.id}', this.value)">
                          <option value="active" ${j.status === 'active' ? 'selected' : ''}>Active</option>
                          <option value="paused" ${j.status === 'paused' ? 'selected' : ''}>Pause</option>
                          <option value="closed" ${j.status === 'closed' ? 'selected' : ''}>Close</option>
                        </select>
                        <button class="admin-btn-action btn-feature" onclick="handleAdminJobFeature('${j.id}', ${!j.is_featured}, ${j.is_urgent})">
                          ${j.is_featured ? `${svgIcon('starFilled', '', 13)} Unfeature` : `${svgIcon('star', '', 13)} Feature`}
                        </button>
                        <button class="admin-btn-action btn-delete" onclick="handleAdminDeleteJob('${j.id}', '${j.title}')">
                          ${svgIcon('trash', '', 14)}
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- TAB 3: BUSINESS DIRECTORY -->
      ${activeTab === 'businesses' ? `
        <div class="admin-table-wrapper">
          <div style="overflow-x: auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Brand & Legal Name</th>
                  <th>Location (Segmented)</th>
                  <th>Official Contact</th>
                  <th>Designated Admin</th>
                  <th>Stats (Members / Jobs)</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${businesses.map(b => `
                  <tr>
                    <td>
                      <strong style="color: var(--white); font-size: 0.95rem;">${b.brand_name}</strong>
                      <div style="font-size: 0.78rem; color: var(--text-dim);">${b.legal_name} • ${b.property_type}</div>
                    </td>
                    <td>
                      <div style="font-size: 0.82rem; color: var(--white);">
                        ${b.plot_number ? `Plot ${b.plot_number}, Road ${b.road_number}` : b.address}
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-dim);">${b.thana_upazila || ''}, ${b.district || b.city}</div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: var(--white); font-size: 0.8rem;">${b.email}</div>
                      <div style="font-size: 0.74rem; color: var(--orange-primary);"><a href="${b.website || '#'}" target="_blank" style="color: inherit;">${b.website || 'No website'}</a></div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: #fdba74;">${svgIcon('award', '', 13)} ${b.admin_name || 'Designated Admin'}</div>
                      <div style="font-size: 0.74rem; color: var(--text-dim);">${b.admin_email || ''}</div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: var(--white);">${b.member_count || 1} team members</div>
                      <div style="font-size: 0.75rem; color: var(--text-dim);">${b.job_count || 0} job posts</div>
                    </td>
                    <td>
                      <span class="status-pill status-${b.verification_status === 'verified' ? 'interview_scheduled' : (b.verification_status === 'pending' ? 'under_review' : 'rejected')}">
                        ${b.verification_status}
                      </span>
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        ${b.verification_status !== 'verified' ? `
                          <button class="admin-btn-action btn-activate" onclick="handleAdminVerifyBusiness('${b.id}', 'verified')">
                            Verify ✓
                          </button>
                        ` : `
                          <button class="admin-btn-action btn-suspend" onclick="handleAdminVerifyBusiness('${b.id}', 'pending')">
                            Revoke
                          </button>
                        `}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- TAB 4: MODERATOR JOIN REQUESTS -->
      ${activeTab === 'moderators' ? `
        <div class="admin-table-wrapper">
          <div class="admin-table-actions-bar">
            <div>
              <strong style="color: var(--white); font-size: 0.92rem;">Pending Moderator Requests</strong>
              <div style="font-size: 0.76rem; color: var(--text-dim);">Users who joined an existing business waiting for authorization.</div>
            </div>
            <span class="badge-urgent">${moderatorRequests.length} Pending Approval</span>
          </div>

          <div style="overflow-x: auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Designation</th>
                  <th>Target Business</th>
                  <th>Contact Info</th>
                  <th>Status</th>
                  <th style="text-align: right;">Admin Resolution</th>
                </tr>
              </thead>
              <tbody>
                ${moderatorRequests.length === 0 ? `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-dim);">
                      No pending moderator join requests currently. All business moderators are approved.
                    </td>
                  </tr>
                ` : moderatorRequests.map(m => `
                  <tr>
                    <td>
                      <div class="admin-user-cell">
                        <img src="${m.avatar_url || DEFAULT_AVATAR_PREVIEW}" alt="${m.name}">
                        <div>
                          <strong style="color: var(--white);">${m.name}</strong>
                          <div style="font-size: 0.72rem; color: var(--text-dim);">Submitted: ${m.created_at}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: #fdba74;">${m.designation || m.org_role}</div>
                      <div style="font-size: 0.72rem; color: var(--text-dim);">Role: Moderator</div>
                    </td>
                    <td>
                      <strong style="color: var(--white);">${m.brand_name}</strong>
                      <div style="font-size: 0.74rem; color: var(--text-dim);">${m.business_email}</div>
                    </td>
                    <td>
                      <div style="color: var(--orange-primary); font-weight: 700;">+88 ${m.phone}</div>
                      <div style="font-size: 0.74rem; color: var(--text-dim);">${m.email}</div>
                    </td>
                    <td>
                      <span class="status-pill status-under_review">Pending Admin Approval</span>
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        <button class="admin-btn-action btn-activate" onclick="handleAdminApproveMember('${m.id}')">
                          Approve Moderator ✓
                        </button>
                        <button class="admin-btn-action btn-feature" onclick="handleAdminPromoteMemberAdmin('${m.id}')" title="Promote as primary Business Admin">
                          ${svgIcon('award', '', 13)} Make Admin
                        </button>
                        <button class="admin-btn-action btn-suspend" onclick="handleAdminRejectMember('${m.id}')">
                          Decline ${svgIcon('x', '', 13)}
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- TAB 5: TRADE LICENSE VERIFICATIONS -->
      ${activeTab === 'verifications' ? `
        <div class="admin-table-wrapper">
          <div style="overflow-x: auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Business Establishment</th>
                  <th>License Type & Number</th>
                  <th>Submitted By</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${verifications.map(v => `
                  <tr>
                    <td>
                      <strong style="color: var(--white);">${v.brand_name}</strong>
                      <div style="font-size: 0.76rem; color: var(--text-dim);">${v.legal_name} • ${v.city}</div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: var(--white);">${svgIcon('fileText', '', 14)} ${v.legal_doc_type}</div>
                      <div style="font-size: 0.76rem; color: var(--text-dim);">${v.doc_number}</div>
                    </td>
                    <td>
                      <div style="color: var(--white);">${v.submitted_by}</div>
                    </td>
                    <td>
                      <div style="font-size: 0.76rem; color: var(--text-dim);">${v.submitted_at}</div>
                    </td>
                    <td>
                      <span class="status-pill status-${v.status === 'approved' ? 'interview_scheduled' : (v.status === 'pending' ? 'under_review' : 'rejected')}">
                        ${v.status}
                      </span>
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        ${v.status === 'pending' ? `
                          <button class="admin-btn-action btn-activate" onclick="reviewVerification('${v.id}', 'approved')">Approve ✓</button>
                          <button class="admin-btn-action btn-suspend" onclick="reviewVerification('${v.id}', 'rejected')">Reject ${svgIcon('x', '', 13)}</button>
                        ` : `
                          <span style="font-size: 0.75rem; color: var(--text-dim);">Reviewed by ${v.reviewed_by}</span>
                        `}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;
  } catch (err) {
    viewport.innerHTML = `<div style="padding: 30px; text-align: center; color: #fca5a5;">Failed to load Admin Console: ${err.message}</div>`;
  }
}

function switchAdminTab(tabName) {
  adminState.activeTab = tabName;
  const viewport = document.getElementById('app-viewport');
  if (viewport) renderAdminScreen(viewport);
}

async function handleAdminUserStatus(userId, status) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update user status');
    showToast(`User status updated to ${status}.`, 'success');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminDeleteUser(userId, userName) {
  if (!confirm(`Are you sure you want to completely remove user ${userName}?`)) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete user');
    showToast(`User ${userName} deleted successfully.`, 'info');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminJobStatus(jobId, status) {
  try {
    const res = await fetch(`/api/admin/jobs/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update job status');
    showToast(`Job status changed to ${status}.`, 'success');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminJobFeature(jobId, isFeatured, isUrgent) {
  try {
    const res = await fetch(`/api/admin/jobs/${jobId}/feature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_featured: isFeatured, is_urgent: isUrgent })
    });
    if (!res.ok) throw new Error('Failed to toggle feature badge');
    showToast(`Job featured state updated.`, 'success');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminDeleteJob(jobId, jobTitle) {
  if (!confirm(`Are you sure you want to delete job post "${jobTitle}"?`)) return;
  try {
    const res = await fetch(`/api/admin/jobs/${jobId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete job post');
    showToast(`Job post deleted.`, 'info');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminVerifyBusiness(bizId, status) {
  try {
    const res = await fetch(`/api/admin/verify-business/${bizId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update business verification');
    showToast(`Business verification updated to ${status}.`, 'success');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminApproveMember(memId) {
  try {
    const res = await fetch(`/api/business/members/${memId}/approve`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Approval failed');
    showToast(data.message || 'Moderator approved!', 'success');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminRejectMember(memId) {
  try {
    const res = await fetch(`/api/business/members/${memId}/reject`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Reject failed');
    showToast(data.message || 'Moderator rejected.', 'warning');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAdminPromoteMemberAdmin(memId) {
  try {
    const res = await fetch(`/api/business/members/${memId}/promote-admin`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Promotion failed');
    showToast(data.message || 'Member designated as Business Admin.', 'success');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function reviewVerification(verifId, action) {
  try {
    const res = await fetch(`/api/admin/verifications/${verifId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        reviewer: 'Tariqul Islam (Trust & Safety)',
        comments: action === 'approved' ? 'Verified Ministry of Civil Aviation license.' : 'Missing verified Trade License.'
      })
    });
    showToast(action === 'approved' ? 'Hotel approved and verified!' : 'Verification rejected.', 'success');
    renderAdminScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================================================
// Screen 8: Saved Jobs
// ==========================================================================

async function renderSavedJobsScreen(viewport) {
  if (!state.currentUser || state.currentRole === 'guest') {
    viewport.innerHTML = `
      <div style="max-width: 520px; margin: 48px auto; text-align: center; padding: 48px 24px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); box-shadow: var(--shadow-xl);">
        <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: rgba(255, 107, 0, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--orange-primary);">
          ${svgIcon('starFilled', '', 32)}
        </div>
        <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--white); margin-bottom: 8px;">Log In to View Saved Jobs</h2>
        <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px;">
          Favourites and bookmarked hospitality roles are only available for candidate accounts. Sign in or create a candidate profile to save jobs.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button class="btn-orange" style="padding: 10px 24px; font-weight: 700;" onclick="startLoginFlow('candidate')">
            Log In as Candidate
          </button>
          <button class="btn-secondary" style="padding: 10px 20px;" onclick="navigateTo('home')">
            Browse Jobs
          </button>
        </div>
      </div>
    `;
    return;
  }

  const userId = state.currentUser.id;
  const res = await fetch(`/api/saved-jobs?user_id=${userId}`);
  const jobs = await res.json();

  viewport.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 4px; color: var(--white);">Saved Jobs</h1>
      <p style="color: var(--text-muted); font-size: 0.9rem;">Roles you have bookmarked.</p>
    </div>

    ${jobs.length === 0 ? `
      <div style="background: var(--bg-surface); padding: 48px; border-radius: var(--radius-xl); text-align: center;">
        <p style="color: var(--text-muted); margin-bottom: 16px;">No saved jobs yet.</p>
        <button class="btn-orange" onclick="navigateTo('home')">Browse Jobs</button>
      </div>
    ` : `
      <div class="jobs-list">
        ${jobs.map(j => renderJobCardHTML(j)).join('')}
      </div>
    `}
  `;
}

// ==========================================================================
// Screen 9: Resources Screen
// ==========================================================================

function renderResourcesScreen(viewport) {
  viewport.innerHTML = `
    <div style="margin-bottom: 28px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
      <div>
        <h1 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 4px; color: var(--white);">Career Resources & Insights</h1>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Salary guides, operational standards, and industry certifications.</p>
      </div>
      <a href="#blog" class="btn-orange" style="font-size: 0.85rem; padding: 8px 18px;">
        ${svgIcon('sparkles', '', 14)} Explore Hospitality Blog →
      </a>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
      <div class="profile-section-card">
        <div style="margin-bottom: 10px; color: var(--orange-primary);">${svgIcon('sliders', '', 32)}</div>
        <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 6px; color: var(--white);">Salary Benchmark 2026</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; margin-bottom: 14px;">Pay scales and service charge dividends across top properties in Bangladesh.</p>
        <button class="btn-secondary" style="font-size: 0.8rem;" onclick="openBlogDetailModal('blog_salary_benchmark')">Read Guide →</button>
      </div>

      <div class="profile-section-card">
        <div style="margin-bottom: 10px; color: #fb923c;">${svgIcon('fileText', '', 32)}</div>
        <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 6px; color: var(--white);">PMS & POS Systems</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; margin-bottom: 14px;">Front desk and POS operational workflows hotel recruiters test for.</p>
        <button class="btn-secondary" style="font-size: 0.8rem;" onclick="openBlogDetailModal('blog_opera_pms')">Read Guide →</button>
      </div>

      <div class="profile-section-card">
        <div style="margin-bottom: 10px; color: #34d399;">${svgIcon('award', '', 32)}</div>
        <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 6px; color: var(--white);">Industry Certifications</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; margin-bottom: 14px;">Recognized hospitality supervisory and food safety certifications.</p>
        <button class="btn-secondary" style="font-size: 0.8rem;" onclick="openBlogDetailModal('blog_interview_prep')">Read Guide →</button>
      </div>
    </div>
  `;
}

// ==========================================================================
// Hospitality Blog & Insights System (Dark Glassmorphism)
// ==========================================================================

let activeBlogCategory = 'All';
let activeBlogSearch = '';

async function renderBlogScreen(viewport) {
  if (!state.blogs || state.blogs.length === 0) {
    try {
      const res = await fetch('/api/blogs');
      if (res.ok) {
        state.blogs = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch blogs:', e);
    }
  }

  const allBlogs = state.blogs || [];
  const categories = ['All', 'Hotel Standards', 'Interview Prep', 'Career Advice', 'Culinary & F&B'];

  // Filter blogs
  const filtered = allBlogs.filter(b => {
    const matchesCat = activeBlogCategory === 'All' || b.category === activeBlogCategory;
    const q = (activeBlogSearch || '').toLowerCase().trim();
    const tagMatch = Array.isArray(b.tags) 
      ? b.tags.some(t => String(t).toLowerCase().includes(q))
      : (b.tags && String(b.tags).toLowerCase().includes(q));
    const matchesSearch = !q || (
      (b.title && b.title.toLowerCase().includes(q)) ||
      (b.excerpt && b.excerpt.toLowerCase().includes(q)) ||
      tagMatch ||
      (b.author_name && b.author_name.toLowerCase().includes(q))
    );
    return matchesCat && matchesSearch;
  });

  const featuredBlog = (activeBlogCategory === 'All' && !activeBlogSearch && filtered.length > 0) ? filtered[0] : null;
  const gridBlogs = featuredBlog ? filtered.slice(1) : filtered;

  viewport.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; padding: 10px 0 60px;">
      <!-- Blog Header -->
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px;">
        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; background: rgba(255, 107, 0, 0.12); border: 1px solid rgba(255, 107, 0, 0.35); color: var(--orange-primary); font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; width: fit-content;">
          ${svgIcon('sparkles', '', 14)} Hospitality Knowledge Hub
        </div>
        <h1 style="font-size: 2.2rem; font-weight: 800; color: var(--white); margin: 0; letter-spacing: -0.5px;">
          Industry Insights & Career Blueprints
        </h1>
        <p style="font-size: 0.95rem; color: rgba(255, 255, 255, 0.65); max-width: 720px; line-height: 1.6; margin: 0;">
          Operational standards, trade test checklists, and leadership compensation benchmarks curated by seasoned 5-star hotel executives.
        </p>
      </div>

      <!-- Search & Category Filter Toolbar -->
      <div style="background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 20px; padding: 18px 22px; margin-bottom: 32px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between;">
        <!-- Category Pills -->
        <div class="blog-filter-pills" id="blog-category-pills">
          ${categories.map(cat => `
            <button class="blog-filter-btn ${activeBlogCategory === cat ? 'active' : ''}" onclick="filterBlogsByCategory('${cat}')">
              ${cat}
            </button>
          `).join('')}
        </div>

        <!-- Live Search -->
        <div style="position: relative; min-width: 260px; flex: 1; max-width: 360px;">
          <input 
            type="text" 
            id="blog-search-input" 
            value="${escapeHtml(activeBlogSearch)}" 
            placeholder="Search guides, Opera PMS, salaries..." 
            oninput="handleBlogSearchInput(this.value)"
            style="width: 100%; padding: 9px 16px 9px 38px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; color: var(--white); font-size: 0.84rem; outline: none; transition: border-color 0.2s;"
            onfocus="this.style.borderColor='var(--orange-primary)'"
            onblur="this.style.borderColor='rgba(255, 255, 255, 0.12)'"
          />
          <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: rgba(255, 255, 255, 0.4); pointer-events: none; display: flex;">
            ${svgIcon('search', '', 15)}
          </span>
          ${activeBlogSearch ? `
            <button onclick="clearBlogSearch()" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; display: flex; padding: 2px;">
              ${svgIcon('x', '', 14)}
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Featured Hero Article (shown when All and no search) -->
      ${featuredBlog ? `
        <div class="blog-hero-card" onclick="openBlogDetailModal('${featuredBlog.id}')" style="cursor: pointer;">
          <div>
            <img src="${featuredBlog.cover_image}" alt="${escapeHtml(featuredBlog.title)}" class="blog-hero-img">
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
              <span class="blog-cat-pill">${featuredBlog.category}</span>
              <span style="color: rgba(255, 255, 255, 0.45); font-size: 0.78rem; display: flex; align-items: center; gap: 4px;">
                ${svgIcon('clock', '', 13)} ${featuredBlog.read_time}
              </span>
            </div>
            <h2 style="font-size: 1.55rem; font-weight: 800; color: var(--white); line-height: 1.35; margin: 0 0 14px 0;">
              ${featuredBlog.title}
            </h2>
            <p style="font-size: 0.92rem; color: rgba(255, 255, 255, 0.7); line-height: 1.6; margin: 0 0 20px 0;">
              ${featuredBlog.excerpt}
            </p>
            <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${featuredBlog.author_avatar}" alt="${featuredBlog.author_name}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255, 107, 0, 0.4);">
                <div>
                  <div style="font-weight: 700; font-size: 0.86rem; color: var(--white);">${featuredBlog.author_name}</div>
                  <div style="font-size: 0.72rem; color: rgba(255, 255, 255, 0.5);">${featuredBlog.author_title}</div>
                </div>
              </div>
              <button class="btn-orange" style="padding: 8px 18px; font-size: 0.82rem;" onclick="event.stopPropagation(); openBlogDetailModal('${featuredBlog.id}')">
                Read Article →
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Article Grid -->
      ${gridBlogs.length > 0 ? `
        <div class="blog-grid">
          ${gridBlogs.map(blog => `
            <article class="blog-card" onclick="openBlogDetailModal('${blog.id}')">
              <img src="${blog.cover_image}" alt="${escapeHtml(blog.title)}" class="blog-card-img">
              <div class="blog-card-body">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                  <span class="blog-cat-pill">${blog.category}</span>
                  <span style="color: rgba(255, 255, 255, 0.45); font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
                    ${svgIcon('clock', '', 12)} ${blog.read_time}
                  </span>
                </div>
                <h3 style="font-size: 1.12rem; font-weight: 700; color: var(--white); line-height: 1.4; margin: 0 0 10px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                  ${blog.title}
                </h3>
                <p style="font-size: 0.84rem; color: rgba(255, 255, 255, 0.65); line-height: 1.55; margin: 0 0 18px 0; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                  ${blog.excerpt}
                </p>
                <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08); margin-top: auto;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${blog.author_avatar}" alt="${blog.author_name}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255, 255, 255, 0.2);">
                    <span style="font-size: 0.78rem; color: rgba(255, 255, 255, 0.75); font-weight: 600;">${blog.author_name}</span>
                  </div>
                  <span style="color: var(--orange-primary); font-size: 0.78rem; font-weight: 700;">Read →</span>
                </div>
              </div>
            </article>
          `).join('')}
        </div>
      ` : `
        <div style="text-align: center; padding: 60px 20px; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 20px; margin-top: 20px;">
          <div style="color: var(--orange-primary); margin-bottom: 12px;">${svgIcon('search', '', 36)}</div>
          <h3 style="font-size: 1.1rem; color: var(--white); margin: 0 0 6px 0;">No articles found</h3>
          <p style="color: rgba(255, 255, 255, 0.55); font-size: 0.86rem; margin: 0 0 16px 0;">Try adjusting your search query or selecting a different category.</p>
          <button class="btn-secondary" style="font-size: 0.8rem; padding: 6px 16px;" onclick="clearBlogFilter()">Reset Filters</button>
        </div>
      `}
    </div>
  `;

  // If URL has activeBlogId, open it
  if (state.activeBlogId) {
    const bId = state.activeBlogId;
    state.activeBlogId = null;
    openBlogDetailModal(bId);
  }
}

function filterBlogsByCategory(cat) {
  activeBlogCategory = cat;
  renderBlogScreen(document.getElementById('app-viewport'));
}

function handleBlogSearchInput(q) {
  activeBlogSearch = q;
  renderBlogScreen(document.getElementById('app-viewport'));
}

function clearBlogSearch() {
  activeBlogSearch = '';
  renderBlogScreen(document.getElementById('app-viewport'));
}

function clearBlogFilter() {
  activeBlogCategory = 'All';
  activeBlogSearch = '';
  renderBlogScreen(document.getElementById('app-viewport'));
}

async function openBlogDetailModal(blogId) {
  let blog = (state.blogs || []).find(b => b.id === blogId || b.slug === blogId);
  if (!blog) {
    try {
      const res = await fetch(`/api/blogs/${blogId}`);
      if (res.ok) blog = await res.json();
    } catch (e) {
      console.error(e);
    }
  }
  if (!blog) {
    showToast('Article not found', 'warning');
    return;
  }

  const formatArticleContent = (text) => {
    if (!text) return '';
    const trimmed = text.trim();
    if (trimmed.startsWith('<')) {
      return trimmed;
    }
    return text.split('\n\n').map(block => {
      const b = block.trim();
      if (!b) return '';
      if (b.startsWith('### ')) {
        return `<h3>${escapeHtml(b.slice(4))}</h3>`;
      }
      if (b.startsWith('## ')) {
        return `<h2>${escapeHtml(b.slice(3))}</h2>`;
      }
      if (b.startsWith('# ')) {
        return `<h2>${escapeHtml(b.slice(2))}</h2>`;
      }
      if (b.startsWith('> ')) {
        return `<blockquote>${escapeHtml(b.slice(2))}</blockquote>`;
      }
      if (b.startsWith('- ') || b.startsWith('* ')) {
        const items = b.split('\n').map(li => `<li>${escapeHtml(li.replace(/^[-*]\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(b).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
    }).join('');
  };

  let tagList = [];
  if (Array.isArray(blog.tags)) {
    tagList = blog.tags;
  } else if (typeof blog.tags === 'string') {
    try {
      const parsed = JSON.parse(blog.tags);
      tagList = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      tagList = blog.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
  }

  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-blog-reader" onclick="if(event.target === this) closeModal('modal-blog-reader')">
      <div class="modal-dialog blog-reader-modal" style="position: relative;">
        <!-- Close Button (Vector SVG Cross Icon) -->
        <button 
          class="modal-close" 
          onclick="closeModal('modal-blog-reader')" 
          aria-label="Close article" 
          style="position: absolute; top: 16px; right: 16px; z-index: 20; background: rgba(10, 17, 40, 0.7); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.15); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--white); transition: all 0.2s;"
        >
          ${svgIcon('x', '', 18)}
        </button>

        <!-- Cover Image -->
        <img src="${blog.cover_image}" alt="${escapeHtml(blog.title)}" class="blog-reader-cover">

        <div class="blog-reader-content">
          <!-- Metadata Bar -->
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px;">
            <span class="blog-cat-pill" style="margin-bottom: 0;">${blog.category}</span>
            <span style="color: rgba(255, 255, 255, 0.45); font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
              ${svgIcon('clock', '', 14)} ${blog.read_time}
            </span>
            <span style="color: rgba(255, 255, 255, 0.3);">•</span>
            <span style="color: rgba(255, 255, 255, 0.45); font-size: 0.8rem;">
              ${new Date(blog.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          <!-- Article Title -->
          <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--white); line-height: 1.35; margin: 0 0 20px 0;">
            ${blog.title}
          </h1>

          <!-- Author Info Strip -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; margin-bottom: 28px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${blog.author_avatar}" alt="${blog.author_name}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255, 107, 0, 0.4);">
              <div>
                <div style="font-weight: 700; font-size: 0.92rem; color: var(--white);">${blog.author_name}</div>
                <div style="font-size: 0.76rem; color: rgba(255, 255, 255, 0.55);">${blog.author_title}</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.78rem; display: flex; align-items: center; gap: 6px;" onclick="copyBlogShareLink('${blog.id}')" title="Share Article">
                ${svgIcon('share', '', 14)} Share
              </button>
            </div>
          </div>

          <!-- Executive Summary Callout Box -->
          <div style="background: rgba(255, 107, 0, 0.07); border-left: 3px solid var(--orange-primary); border-radius: 0 12px 12px 0; padding: 16px 20px; margin-bottom: 28px;">
            <div style="font-size: 0.78rem; font-weight: 800; color: var(--orange-primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
              Executive Briefing
            </div>
            <p style="font-size: 0.94rem; color: rgba(255, 255, 255, 0.9); line-height: 1.55; margin: 0;">
              ${blog.excerpt}
            </p>
          </div>

          <!-- Article Body Prose -->
          <div class="blog-prose">
            ${formatArticleContent(blog.content)}
          </div>

          <!-- Tags -->
          ${tagList.length > 0 ? `
            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="font-size: 0.78rem; color: rgba(255, 255, 255, 0.45); font-weight: 700; text-transform: uppercase; margin-bottom: 10px;">Tags</div>
              <div>
                ${tagList.map(tag => `<span class="blog-tag-badge">#${escapeHtml(tag)}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Footer Actions -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
            <button class="btn-secondary" onclick="closeModal('modal-blog-reader')">
              ← Back to Insights
            </button>
            <button class="btn-orange" onclick="closeModal('modal-blog-reader'); navigateTo('home')">
              Browse Related Openings →
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function copyBlogShareLink(blogId) {
  const url = `${window.location.origin}/#blog?id=${blogId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Article link copied to clipboard!');
    }).catch(() => {
      showToast('Article link: #blog?id=' + blogId);
    });
  } else {
    showToast('Article link: #blog?id=' + blogId);
  }
}


// ==========================================================================
// Interactive Modals (Auth/OTP, Job Details, Application Wizard, ATS, Profile)
// ==========================================================================

// ==========================================================================
// Authentication System: Single-Screen Login & 4-Stage Verification Signup
// ==========================================================================

// ==========================================================================
// Authentication System: 
// 1. Candidate Login (Email + Password)
// 2. Business Login (Part 1 Business Check, Part 2 User Login)
// 3. Candidate Registration (Parts 1-4 with Dynamic Adders & Schemas)
// 4. Business Registration (Choice: New Business Parts 1-8 OR Add New User Parts 1-7)
// ==========================================================================

function startLoginFlow(role = 'candidate') {
  loginState.role = role;
  loginState.businessStep = 1;
  loginState.errorMessage = null;
  loginState.errorType = null;
  loginState.email = '';
  loginState.password = '';
  loginState.businessEmail = '';
  loginState.userEmail = '';
  loginState.businessPassword = '';
  loginState.verifiedBusiness = null;
  navigateTo('login', { role });
}

function startSignupFlow(role = 'candidate', stage = 1, bizRoute = null) {
  signupState.role = role;
  signupState.stage = stage;
  if (role === 'business') {
    signupState.biz_route = bizRoute || (signupState.biz_route || 'choose');
    signupState.biz_step = stage;
  } else {
    signupState.biz_route = 'choose';
    signupState.biz_step = 1;
  }
  navigateTo('signup', { role, stage });
}

function setLoginRole(role) {
  loginState.role = role;
  loginState.businessStep = 1;
  loginState.errorMessage = null;
  loginState.errorType = null;
  loginState.email = '';
  loginState.password = '';
  loginState.businessEmail = '';
  loginState.userEmail = '';
  loginState.businessPassword = '';
  loginState.verifiedBusiness = null;
  const viewport = document.getElementById('app-viewport');
  if (viewport) renderLoginPage(viewport);
}

function setSignupRole(role) {
  signupState.role = role;
  signupState.stage = 1;
  signupState.biz_route = 'choose';
  signupState.biz_step = 1;
  const viewport = document.getElementById('app-viewport');
  if (viewport) renderSignupPage(viewport);
}

function selectBizRoute(route) {
  signupState.biz_route = route;
  signupState.stage = 1;
  signupState.biz_step = 1;
  const viewport = document.getElementById('app-viewport');
  if (viewport) renderSignupPage(viewport);
}

// -------------------------------------------------------------
// LOGIN PAGE RENDERING (Candidate vs Business 2-Part Flow)
// -------------------------------------------------------------

function renderLoginPage(viewport) {
  const isCandidate = loginState.role === 'candidate';

  viewport.innerHTML = `
    <div class="auth-page-container">
      <div class="auth-page-card">
        <!-- Clean Header -->
        <div class="auth-header" style="text-align: center; margin-bottom: 20px;">
          <h1 class="auth-title">Log In</h1>
        </div>

        <!-- Role Toggle (Candidate vs Business) -->
        <div class="auth-segmented-tabs" style="margin-bottom: 20px;">
          <button type="button" class="auth-segment-btn ${isCandidate ? 'active' : ''}" onclick="setLoginRole('candidate')">
            Candidate
          </button>
          <button type="button" class="auth-segment-btn ${!isCandidate ? 'active' : ''}" onclick="setLoginRole('business')">
            Business
          </button>
        </div>

        <!-- CANDIDATE LOGIN: Email & Password -->
        ${isCandidate ? `
          <form id="form-candidate-login" onsubmit="handleCandidateLogin(event)">
            <div class="auth-field">
              <label class="auth-label">Email</label>
              <input type="email" 
                id="login-candidate-email" 
                class="auth-input" 
                placeholder="Enter your registered email" 
                required 
                value="${escapeHtml(loginState.email || '')}" 
                autocomplete="username" autofocus>
            </div>

            <div class="auth-field">
              <label class="auth-label">Password</label>
              <div class="auth-password-wrapper">
                <input type="password" 
                  id="login-candidate-pwd" 
                  class="auth-input" 
                  placeholder="Enter your password" 
                  required 
                  value="${escapeHtml(loginState.password || '')}" 
                  autocomplete="current-password">
                <button type="button" class="auth-eye-toggle" id="cand-pwd-toggle" 
                  onclick="togglePasswordVisibility('login-candidate-pwd', 'cand-pwd-toggle')" 
                  title="Show/Hide Password">${svgIcon('eye', '', 16)}</button>
              </div>
            </div>

            <button type="submit" class="auth-btn-primary" style="margin-top: 10px;">
              Log In
            </button>
          </form>
        ` : `
          <!-- BUSINESS LOGIN: Part 1 Business Mail Check -> Part 2 User Mail & Password -->
          ${loginState.businessStep === 1 ? `
            <!-- Business Login Part 1: Business Mail -->
            <form id="form-biz-login-part1" onsubmit="handleBusinessCheckPart1(event)">
              <div class="auth-field">
                <label class="auth-label">Business Email</label>
                <input type="email" 
                  id="biz-login-email-part1" 
                  class="auth-input" 
                  placeholder="Enter official business email" 
                  required 
                  value="${escapeHtml(loginState.businessEmail || '')}" 
                  autocomplete="email" autofocus>
              </div>

              ${loginState.errorType === 'unlisted_business' ? `
                <div class="auth-notice-card" style="margin-top: 14px;">
                  <div style="font-size: 0.88rem; color: #fca5a5; margin-bottom: 10px;">
                    This business doesn't have an account.
                  </div>
                  <button type="button" class="btn-orange" style="width: 100%; font-size: 0.85rem; padding: 10px;" 
                    onclick="startSignupFlow('business', 1, 'new')">
                    Create Business Account
                  </button>
                </div>
              ` : ''}

              ${loginState.errorType === 'unverified_business' ? `
                <div class="auth-notice-card" style="margin-top: 14px; border-left: 3px solid #f59e0b; background: rgba(245, 158, 11, 0.08);">
                  <div style="font-size: 0.88rem; color: #fbbf24; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    ${svgIcon('clock', '', 16)} Business Verification Required
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 10px;">
                    The establishment <strong>${escapeHtml(loginState.unverifiedBusinessName || 'this business')}</strong> is pending administrator verification. Accounts cannot log in or view workspace until verified.
                  </div>
                  <div class="auth-contact-links" style="margin-top: 8px;">
                    <a href="https://wa.me/8801819876543" target="_blank" class="auth-contact-pill" style="background: rgba(37, 211, 102, 0.15); color: #86efac; border: 1px solid rgba(37, 211, 102, 0.4); font-size: 0.75rem; padding: 4px 8px;">
                      ${svgIcon('whatsapp', '', 13)} WhatsApp: +880 1819-876543
                    </a>
                  </div>
                </div>
              ` : ''}

              <button type="submit" class="auth-btn-primary" style="margin-top: 10px;">
                Continue →
              </button>
            </form>
          ` : `
            <!-- Business Login Part 2: User Email + Password -->
            <form id="form-biz-login-part2" onsubmit="handleBusinessLoginPart2(event)">
              <!-- Matched Business Info -->
              <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: var(--radius-md); padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="color: var(--white); font-size: 0.92rem;">${escapeHtml(loginState.verifiedBusiness?.brand_name || 'Business')}</strong>
                  <div style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(loginState.businessEmail || '')}</div>
                </div>
                <button type="button" class="auth-text-link" style="font-size: 0.78rem;" onclick="loginState.businessStep = 1; renderLoginPage(document.getElementById('app-viewport'))">
                  Change
                </button>
              </div>

              <div class="auth-field">
                <label class="auth-label">Email</label>
                <input type="email" 
                  id="biz-login-user-email" 
                  class="auth-input" 
                  placeholder="Enter your account email" 
                  required 
                  value="${escapeHtml(loginState.userEmail || '')}" 
                  autocomplete="username" autofocus>
              </div>

              <div class="auth-field">
                <label class="auth-label">Password</label>
                <div class="auth-password-wrapper">
                  <input type="password" 
                    id="biz-login-password" 
                    class="auth-input" 
                    placeholder="Enter your password" 
                    required 
                    value="${escapeHtml(loginState.businessPassword || '')}" 
                    autocomplete="current-password">
                  <button type="button" class="auth-eye-toggle" id="biz-pwd-toggle" 
                    onclick="togglePasswordVisibility('biz-login-password', 'biz-pwd-toggle')" 
                    title="Show/Hide Password">${svgIcon('eye', '', 16)}</button>
                </div>
              </div>

              ${loginState.errorType === 'unlisted_user' ? `
                <div class="auth-notice-card" style="margin-top: 14px;">
                  <div style="font-size: 0.88rem; color: #fca5a5; margin-bottom: 10px;">
                    This user is not listed in this business account.
                  </div>
                  <button type="button" class="btn-orange" style="width: 100%; font-size: 0.85rem; padding: 10px;" 
                    onclick="signupState.join_business_email = '${loginState.businessEmail}'; startSignupFlow('business', 1, 'join')">
                    Create New User
                  </button>
                </div>
              ` : ''}

              <button type="submit" class="auth-btn-primary" style="margin-top: 10px;">
                Log In
              </button>
            </form>
          `}
        `}

        <!-- Switch to Sign Up -->
        <div class="auth-bottom-switch" style="margin-top: 20px;">
          <span>Don't have an account?</span>
          <button type="button" class="auth-text-link" onclick="startSignupFlow('${loginState.role}')">Sign up</button>
        </div>
      </div>
    </div>
  `;
}

// Handle Candidate Login (Email + Password)
async function handleCandidateLogin(event) {
  event.preventDefault();
  const email = (document.getElementById('login-candidate-email')?.value || '').trim();
  const password = document.getElementById('login-candidate-pwd')?.value || '';

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid candidate email address.', 'danger');
    return;
  }
  if (!password) {
    showToast('Please enter your password.', 'danger');
    return;
  }

  loginState.email = email;
  loginState.password = password;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'jobseeker' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Candidate log in failed.');

    state.currentUser = data.user;
    state.currentRole = 'jobseeker';
    state.activeHotelId = null;
    if (data.profile) {
      state.currentUser.title = `${data.profile.current_position || 'Candidate'} • ${data.profile.department || 'Hospitality'}`;
    }

    try {
      const sessPayload = JSON.stringify({ user: state.currentUser, role: 'jobseeker' });
      sessionStorage.setItem('nicejobs_active_session', sessPayload);
      sessionStorage.setItem('nicejobs_candidate_session', sessPayload);
    } catch (e) {}

    updateRoleStatusText();
    onAuthChange();
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-role-seeker')?.classList.add('active');

    showToast(data.message || 'Logged in successfully!', 'success');
    await loadInitialData();
    navigateTo('home');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Business Login Part 1: Check Official Business Mail
async function handleBusinessCheckPart1(event) {
  event.preventDefault();
  const bEmail = (document.getElementById('biz-login-email-part1')?.value || '').trim().toLowerCase();
  if (!bEmail || !bEmail.includes('@')) {
    showToast('Please enter a valid official business email.', 'danger');
    return;
  }

  loginState.businessEmail = bEmail;
  loginState.errorMessage = null;
  loginState.errorType = null;

  try {
    const res = await fetch('/api/auth/check-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: bEmail })
    });
    const data = await res.json();

    if (!data.exists) {
      loginState.errorType = 'unlisted_business';
      renderLoginPage(document.getElementById('app-viewport'));
      return;
    }

    if ((data.business.verification_status || 'pending') !== 'verified') {
      loginState.errorType = 'unverified_business';
      loginState.unverifiedBusinessName = data.business.brand_name;
      renderLoginPage(document.getElementById('app-viewport'));
      return;
    }

    loginState.verifiedBusiness = data.business;
    loginState.businessStep = 2;
    loginState.errorType = null;
    showToast(`Business verified: ${data.business.brand_name}`, 'success');
    renderLoginPage(document.getElementById('app-viewport'));
  } catch (err) {
    showToast('Verification check error: ' + err.message, 'danger');
  }
}

// Business Login Part 2: Person on behalf Work Email + Password
async function handleBusinessLoginPart2(event) {
  event.preventDefault();
  const userEmail = (document.getElementById('biz-login-user-email')?.value || '').trim().toLowerCase();
  const password = document.getElementById('biz-login-password')?.value || '';

  if (!userEmail || !userEmail.includes('@')) {
    showToast('Please enter your personal work email address.', 'danger');
    return;
  }
  if (!password) {
    showToast('Please enter your password.', 'danger');
    return;
  }

  loginState.userEmail = userEmail;
  loginState.businessPassword = password;
  loginState.errorType = null;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_email: loginState.businessEmail,
        user_email: userEmail,
        password: password,
        role: 'recruiter'
      })
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404 && data.detail && data.detail.includes('not listed')) {
        loginState.errorType = 'unlisted_user';
        renderLoginPage(document.getElementById('app-viewport'));
        return;
      }
      if (res.status === 403 && data.detail && (data.detail.includes('verification') || data.detail.includes('pending'))) {
        loginState.businessStep = 1;
        loginState.errorType = 'unverified_business';
        loginState.unverifiedBusinessName = loginState.verifiedBusiness?.brand_name || 'Business';
        renderLoginPage(document.getElementById('app-viewport'));
        return;
      }
      throw new Error(data.detail || 'Log in failed');
    }

    state.currentUser = data.user;
    state.currentUser.is_business_admin = true;
    state.currentRole = 'recruiter';
    if (data.business) {
      state.activeHotelId = data.business.id;
      state.currentUser.business_id = data.business.id;
      state.currentUser.title = `${data.business.org_role || 'Business Admin'} (${data.business.brand_name})`;
    }

    try {
      const sessPayload = JSON.stringify({
        user: state.currentUser,
        role: 'recruiter',
        activeHotelId: state.activeHotelId
      });
      sessionStorage.setItem('nicejobs_active_session', sessPayload);
      sessionStorage.setItem('nicejobs_employer_session', sessPayload);
    } catch (e) {}

    updateRoleStatusText();
    onAuthChange();
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-role-recruiter')?.classList.add('active');

    showToast(data.message || 'Welcome to your business workspace!', 'success');
    await loadInitialData();
    navigateTo('recruiter-dashboard');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function quickDemoLogin(role) {
  loginState.email = '';
  loginState.password = '';
  loginState.businessEmail = '';
  loginState.userEmail = '';
  loginState.businessPassword = '';
  const viewport = document.getElementById('app-viewport');
  if (viewport) renderLoginPage(viewport);
}

// -------------------------------------------------------------
// SIGNUP PAGE RENDERING (Candidate Parts 1-4 vs Business Routes)
// -------------------------------------------------------------

function renderSignupPage(viewport) {
  const isCandidate = signupState.role === 'candidate';

  viewport.innerHTML = `
    <div class="auth-page-container signup-page-container wide">
      <div class="auth-page-card signup-card-wide">
        <!-- Top Navigation -->
        <div class="auth-card-top-nav">
          ${isCandidate ? `
            <div style="display: flex; align-items: center; gap: 8px;">
              ${(signupState.stage > 1 || signupState.stage === 'terms') ? `
                <button type="button" class="auth-back-btn" onclick="prevSignupStage()">← Back</button>
              ` : ''}
              <button type="button" class="btn-signup-login-highlight" onclick="startLoginFlow('candidate')" title="Sign In with Existing Account">
                ${svgIcon('user', '', 14)} <span>Already have an account? <strong>Log In</strong></span>
              </button>
            </div>
            <span class="auth-stage-indicator">Candidate Registration</span>
          ` : `
            <div style="display: flex; align-items: center; gap: 8px;">
              ${signupState.biz_route !== 'choose' ? `
                <button type="button" class="auth-back-btn" onclick="${signupState.biz_route === 'join' ? 'prevJoinStage()' : 'prevBizStage()'}">← Back</button>
              ` : ''}
              <button type="button" class="btn-signup-login-highlight" onclick="startLoginFlow('business')" title="Log In to Recruiter Desk">
                ${svgIcon('hotel', '', 14)} <span>Already have business account? <strong>Log In</strong></span>
              </button>
            </div>
            <span class="auth-stage-indicator">
              ${signupState.biz_route === 'new' ? `New Business Registration` : (signupState.biz_route === 'join' ? `Add Team Member` : `Business Portal`)}
            </span>
          `}
        </div>

        <!-- Role Toggle (Candidate vs Hotel / Business) - Only shown on Stage 1 / Initial Route Choice -->
        ${(() => {
          const isPart1 = isCandidate 
            ? (signupState.stage === 1) 
            : (!signupState.biz_step || signupState.biz_step === 1 || !signupState.biz_route || signupState.biz_route === 'choose');
          if (!isPart1) return '';
          return `
            <div class="auth-segmented-tabs" style="margin-bottom: 20px;">
              <button type="button" class="auth-segment-btn ${isCandidate ? 'active' : ''}" onclick="setSignupRole('candidate')">
                ${svgIcon('candidate', '', 14)} Candidate
              </button>
              <button type="button" class="auth-segment-btn ${!isCandidate ? 'active' : ''}" onclick="setSignupRole('business')">
                ${svgIcon('hotel', '', 14)} Hotel / Business
              </button>
            </div>
          `;
        })()}

        <!-- ============================================== -->
        <!-- CANDIDATE SIGNUP FLOW                          -->
        <!-- ============================================== -->
        ${isCandidate ? `
          <!-- Name, DOB, NID/Passport (opt), Cell (+88), Secondary Phone (+88 opt), Email -->
          ${signupState.stage === 1 ? `
            <div class="auth-header">
              <h2 class="auth-title">Candidate Details</h2>
              <p class="auth-subtitle">Basic profile and verified contact info</p>
            </div>

            <form id="form-cand-part1" onsubmit="event.preventDefault(); nextSignupStage(2);">
              <!-- Row 1: First Name, Middle Name, Last Name -->
              <div class="auth-field-grid" style="grid-template-columns: 1fr 1fr 1fr;">
                <div class="auth-field">
                  <label class="auth-label">First Name *</label>
                  <input type="text" id="cand-first-name" class="auth-input" required 
                    placeholder="First name" 
                    value="${escapeHtml(signupState.first_name || '')}" autofocus>
                </div>
                <div class="auth-field">
                  <label class="auth-label">Middle Name <span style="font-weight: 400; color: var(--text-dim); font-size: 0.78rem;">(Optional)</span></label>
                  <input type="text" id="cand-middle-name" class="auth-input" 
                    placeholder="Middle name" 
                    value="${escapeHtml(signupState.middle_name || '')}">
                </div>
                <div class="auth-field">
                  <label class="auth-label">Last Name *</label>
                  <input type="text" id="cand-last-name" class="auth-input" required 
                    placeholder="Last name" 
                    value="${escapeHtml(signupState.last_name || '')}">
                </div>
              </div>

              <!-- Row 2: Full Name in Bangla & Personal Email Address -->
              <div class="auth-field-grid">
                <div class="auth-field">
                  <label class="auth-label">Full Name in Bangla (বাংলায় পূর্ণ নাম) *</label>
                  <input type="text" id="cand-name-bangla" class="auth-input" required 
                    placeholder="বাংলায় পূর্ণ নাম লিখুন" 
                    value="${escapeHtml(signupState.name_bangla || '')}">
                </div>
                <div class="auth-field">
                  <label class="auth-label">Personal Email Address *</label>
                  <input type="email" id="cand-email" class="auth-input" required 
                    placeholder="Enter personal email address" 
                    value="${escapeHtml(signupState.email || '')}">
                </div>
              </div>

              <!-- Row 2: DOB & NID/Passport Grid -->
              <div class="auth-field-grid">
                <div class="auth-field">
                  <label class="auth-label">Date of Birth (DOB)</label>
                  <input type="date" id="cand-dob" class="auth-input" required 
                    value="${signupState.dob || ''}">
                </div>
                <div class="auth-field">
                  <label class="auth-label">NID / Passport (Optional)</label>
                  <input type="text" id="cand-nid" class="auth-input" 
                    placeholder="Enter 10/17 digit NID or passport number" 
                    value="${signupState.nid_passport || ''}">
                </div>
              </div>

              <!-- Row 3: Primary Phone & Secondary Phone Grid -->
              <div class="auth-field-grid">
                <div class="auth-field">
                  <label class="auth-label">Mobile Cell Number</label>
                  <div class="phone-input-wrapper">
                    <span class="phone-prefix-fixed">+88</span>
                    <input type="tel" 
                      id="cand-phone" 
                      class="phone-number-field" 
                      placeholder="01XXXXXXXXX (11 digits)" 
                      maxlength="11" 
                      minlength="11" 
                      pattern="01[0-9]{9}" 
                      inputmode="numeric" 
                      required 
                      oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);"
                      value="${signupState.phone || ''}">
                  </div>
                  <span class="auth-field-hint">Primary number receives OTP verification</span>
                </div>

                <div class="auth-field">
                  <label class="auth-label">Secondary Mobile Number (Optional)</label>
                  <div class="phone-input-wrapper">
                    <span class="phone-prefix-fixed">+88</span>
                    <input type="tel" 
                      id="cand-phone-secondary" 
                      class="phone-number-field" 
                      placeholder="01XXXXXXXXX (optional secondary)" 
                      maxlength="11" 
                      minlength="11" 
                      inputmode="numeric" 
                      oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);"
                      value="${signupState.phone_secondary || ''}">
                  </div>
                  <span class="auth-field-hint">Alternative contact number for hotel HR (Optional)</span>
                </div>
              </div>

              <button type="submit" class="auth-btn-primary" style="margin-top: 10px;">
                Continue →
              </button>
            </form>

            <div class="signup-login-prompt-banner">
              <span>Already have an account?</span>
              <button type="button" class="btn-signup-login-action" onclick="startLoginFlow('candidate')">
                Log In to Your Account →
              </button>
            </div>
          ` : ''}

          <!-- PFP upload, Bio, Drag&Drop CV, Job Preferences, Education (+), Skills, Language, Previous Experience (+) -->
          ${signupState.stage === 2 ? `
            <div class="auth-header">
              <h2 class="auth-title">Hospitality Background</h2>
              <p class="auth-subtitle">Photo, Bio, CV, Preferences, Skills &amp; Experience</p>
            </div>

            <form id="form-cand-part2" onsubmit="event.preventDefault(); nextSignupStage(3);">
              <!-- Profile Picture Upload (Moved to Part 2 before Bio with Zoom/Drag setting) -->
              <div class="pfp-upload-wrap" style="margin-bottom: 20px;">
                <div class="pfp-avatar-preview-box">
                  <img src="${signupState.pfp || DEFAULT_AVATAR_PREVIEW}" alt="Profile Photo Preview" class="pfp-preview-img" id="cand-pfp-part2-img">
                </div>
                <div style="flex: 1;">
                  <label class="auth-label" style="margin-bottom: 4px; font-weight: 700;">Profile Picture</label>
                  <p style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 8px;">Upload your professional photo (Only compressed if &ge; 1MB to preserve quality)</p>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;" onclick="document.getElementById('cand-pfp-file-input').click()">
                      ${svgIcon('upload', '', 14)} Upload Picture
                    </button>
                    <input type="file" id="cand-pfp-file-input" accept="image/png, image/jpeg, image/jpg, image/webp" style="display: none;" onchange="handlePfpFileSelected(event)">
                    ${signupState.pfp && signupState.pfp !== DEFAULT_AVATAR_PREVIEW ? `
                      <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openPfpSettingModal(signupState.raw_pfp || signupState.pfp, 'candidate')">
                        ${svgIcon('maximize', '', 13)} Adjust Face &amp; Zoom
                      </button>
                      <button type="button" class="btn-icon" id="cand-pfp-remove-btn" title="Remove photo" style="width: 32px; height: 32px; color: #f87171;" onclick="removeCandidatePfp()">
                        ${svgIcon('x', '', 14)}
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- Bio -->
              <div class="auth-field">
                <label class="auth-label">Professional Bio</label>
                <textarea id="cand-bio" class="auth-input" rows="2" required 
                  placeholder="Write a brief professional summary of your hospitality background and key skills...">${signupState.bio || ''}</textarea>
              </div>

              <!-- Main CV Upload (Drag and Drop + Device Browse) -->
              <div class="auth-field">
                <label class="auth-label">Main CV Upload</label>
                <div class="cv-dropzone" id="cand-cv-dropzone" onclick="document.getElementById('cand-cv-file').click()">
                  <div class="cv-dropzone-inner">
                    <div style="color: var(--orange-primary);">${svgIcon('upload', '', 28)}</div>
                    <strong style="color: var(--white); font-size: 0.92rem; margin-top: 6px;">${signupState.cv_name || 'Upload your primary Hospitality CV'}</strong>
                    <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 2px;">
                      Drag &amp; drop your CV here, or <span style="color: var(--orange-primary); text-decoration: underline;">browse device</span>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">PDF, DOCX, DOC up to 10MB</div>
                  </div>
                  <input type="file" id="cand-cv-file" style="display: none;" accept=".pdf,.docx,.doc" onchange="handleCvFileSelected(event)">
                </div>
                ${signupState.cv_name ? `
                  <div class="cv-uploaded-badge" style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <span>✓ CV Attached: <strong>${signupState.cv_name}</strong></span>
                    <button type="button" class="btn-secondary" style="padding: 3px 10px; font-size: 0.75rem;" onclick="previewCandidateCvModal('${(signupState.cv_name).replace(/'/g, "\\'")}', '${(signupState.cv_name).replace(/'/g, "\\'")}')">Preview CV</button>
                  </div>
                ` : ''}
              </div>

              <!-- Job Preferences -->
              <div class="auth-field">
                <label class="auth-label">Career &amp; Job Preferences</label>
                <div class="auth-field-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 8px;">
                  <div>
                    <label style="font-size: 0.76rem; color: var(--text-dim); display: block; margin-bottom: 4px;">Target Department</label>
                    <select id="cand-pref-dept" class="auth-input">
                      ${HOTEL_ALL_DEPARTMENTS.map(d => `<option value="${d}" ${(signupState.job_preferences?.department || 'Front Office') === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                  </div>
                  <div>
                    <label style="font-size: 0.76rem; color: var(--text-dim); display: block; margin-bottom: 4px;">Desired Role / Title</label>
                    <input type="text" id="cand-pref-role" class="auth-input" placeholder="Enter target job title or role" value="${signupState.job_preferences?.desired_role || ''}">
                  </div>
                </div>
                <div class="auth-field-grid" style="grid-template-columns: 1fr 1fr 1fr;">
                  <div>
                    <label style="font-size: 0.76rem; color: var(--text-dim); display: block; margin-bottom: 4px;">Preferred Shift</label>
                    <select id="cand-pref-shift" class="auth-input">
                      <option value="Rotational" ${(signupState.job_preferences?.shift || 'Rotational') === 'Rotational' ? 'selected' : ''}>Rotational</option>
                      <option value="Morning" ${signupState.job_preferences?.shift === 'Morning' ? 'selected' : ''}>Morning</option>
                      <option value="Evening" ${signupState.job_preferences?.shift === 'Evening' ? 'selected' : ''}>Evening</option>
                      <option value="Night" ${signupState.job_preferences?.shift === 'Night' ? 'selected' : ''}>Night</option>
                    </select>
                  </div>
                  <div>
                    <label style="font-size: 0.76rem; color: var(--text-dim); display: block; margin-bottom: 4px;">Expected Salary</label>
                    <input type="text" id="cand-pref-salary" class="auth-input" placeholder="Enter expected monthly salary in ৳" value="${signupState.job_preferences?.expected_salary || ''}">
                  </div>
                  <div>
                    <label style="font-size: 0.76rem; color: var(--text-dim); display: block; margin-bottom: 4px;">Preferred Location</label>
                    <select id="cand-pref-location" class="auth-input">
                      <option value="Dhaka" ${(signupState.job_preferences?.preferred_location || 'Dhaka') === 'Dhaka' ? 'selected' : ''}>Dhaka</option>
                      <option value="Cox's Bazar" ${signupState.job_preferences?.preferred_location === "Cox's Bazar" ? 'selected' : ''}>Cox's Bazar</option>
                      <option value="Sylhet" ${signupState.job_preferences?.preferred_location === 'Sylhet' ? 'selected' : ''}>Sylhet</option>
                      <option value="Chittagong" ${signupState.job_preferences?.preferred_location === 'Chittagong' ? 'selected' : ''}>Chittagong</option>
                      <option value="Anywhere in BD" ${signupState.job_preferences?.preferred_location === 'Anywhere in BD' ? 'selected' : ''}>Anywhere in BD</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- EDUCATION: Multi-entry with Bangladesh certificates & degrees -->
              <div class="auth-field">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label class="auth-label" style="margin: 0;">Education (Bangladesh Certificates &amp; Degrees)</label>
                  <span style="font-size: 0.74rem; color: var(--text-dim);">Add as many as you have</span>
                </div>

                <div class="dynamic-list-container" id="edu-dynamic-container">
                  ${signupState.education.length === 0 ? `
                    <div style="color: var(--text-dim); font-size: 0.82rem; padding: 12px; border: 1px dashed var(--border-subtle); border-radius: 6px; text-align: center; margin-bottom: 8px;">
                      No degrees or certificates added yet. Click below to add.
                    </div>
                  ` : signupState.education.map((edu, idx) => `
                    <div class="dynamic-entry-card">
                      <div class="dynamic-entry-header">
                        <span class="dynamic-entry-title">Education #${idx + 1}</span>
                        ${signupState.education.length > 1 ? `
                          <button type="button" class="dynamic-remove-btn" onclick="removeEducationEntry(${idx})">${svgIcon('x', '', 13)} Remove</button>
                        ` : ''}
                      </div>
                      <div class="auth-field">
                        <label class="auth-label" style="font-size: 0.76rem;">Educational Institute Name</label>
                        <input type="text" class="auth-input edu-inst" placeholder="Enter school, college, or training institute name" 
                          value="${edu.institution || ''}" required>
                      </div>
                      <div class="auth-field-grid">
                        <div class="auth-field">
                          <label class="auth-label" style="font-size: 0.76rem;">Degree / Certificate</label>
                          <select class="auth-input edu-deg">
                            ${BANGLADESH_DEGREES.map(deg => `
                              <option value="${deg}" ${edu.degree === deg ? 'selected' : ''}>${deg}</option>
                            `).join('')}
                          </select>
                        </div>
                        <div class="auth-field">
                          <label class="auth-label" style="font-size: 0.76rem;">GPA / Result</label>
                          <input type="text" class="auth-input edu-gpa" placeholder="Enter GPA, division, or grade" 
                            value="${edu.gpa || ''}">
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>

                <button type="button" class="dynamic-add-btn" onclick="addEducationEntry()">
                  + Add Another Degree / School Certificate
                </button>
              </div>

              <!-- SKILLS: Unified Schema Select (Just like Business Sign Up Part 2) -->
              <div class="auth-field" id="skills-section-container">
                <label class="auth-label">Hospitality Skills</label>
                <div class="schema-box-wrapper">
                  <input type="text" class="schema-search-input" id="skills-search" 
                    placeholder="Search or enter a skill, then press Enter..." 
                    value="${signupState.skillsSearchQuery || ''}" 
                    oninput="filterSkillsSchema(this.value)"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomSkill(this.value);}">

                  <div id="skills-custom-add-container">
                    ${(() => {
                      const q = (signupState.skillsSearchQuery || '').toLowerCase().trim();
                      const allPool = Array.from(new Set([...(signupState.customSkillsPool || []), ...HOTEL_SKILLS_SCHEMA]));
                      const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);
                      if (q && !hasExactMatch) {
                        return `
                          <div class="schema-add-chip" onclick="addCustomSkill('${signupState.skillsSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                            + Add "${signupState.skillsSearchQuery}" to skills
                          </div>
                        `;
                      }
                      return '';
                    })()}
                  </div>

                  <div class="schema-pills-pool" id="skills-pills-pool">
                    ${(() => {
                      const q = (signupState.skillsSearchQuery || '').toLowerCase().trim();
                      const allPool = Array.from(new Set([...(signupState.customSkillsPool || []), ...HOTEL_SKILLS_SCHEMA]));
                      
                      // Stack logic: Selected skills at top in stack order (latest selected is at top)
                      const selectedStack = (signupState.skills || []).filter(s => !q || s.toLowerCase().includes(q));
                      
                      // Remaining unselected skills below
                      const unselectedPool = allPool.filter(s => !(signupState.skills || []).includes(s)).filter(s => !q || s.toLowerCase().includes(q));

                      return [
                        ...selectedStack.map(s => `
                          <span class="schema-pill-item selected" data-pill-key="${s}" onclick="toggleSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
                            ✓ ${s}
                          </span>
                        `),
                        ...unselectedPool.map(s => `
                          <span class="schema-pill-item" data-pill-key="${s}" onclick="toggleSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to select">
                            + ${s}
                          </span>
                        `)
                      ].join('');
                    })()}
                  </div>
                </div>
              </div>

              <!-- LANGUAGES: Unified Schema Select (Just like Business Sign Up Part 2) -->
              <div class="auth-field" id="languages-section-container">
                <label class="auth-label">Languages &amp; Fluency</label>
                <div class="schema-box-wrapper">
                  <input type="text" class="schema-search-input" id="languages-search" 
                    placeholder="Search or enter a language, then press Enter..." 
                    value="${signupState.languagesSearchQuery || ''}" 
                    oninput="filterLanguagesSchema(this.value)"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomLanguage(this.value);}">

                  <div id="languages-custom-add-container">
                    ${(() => {
                      const q = (signupState.languagesSearchQuery || '').toLowerCase().trim();
                      const presetList = [...HOTEL_LANGUAGES_PRESETS];
                      (signupState.customLanguagesPool || []).forEach(name => {
                        if (!presetList.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                          presetList.push({ name, level: 'Fluent' });
                        }
                      });
                      const allNames = Array.from(new Set([...(signupState.customLanguagesPool || []), ...presetList.map(l => l.name)]));
                      const hasExactMatch = q && allNames.some(l => l.toLowerCase() === q);
                      if (q && !hasExactMatch) {
                        return `
                          <div class="schema-add-chip" onclick="addCustomLanguage('${signupState.languagesSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                            + Add "${signupState.languagesSearchQuery}" (Fluent) to languages
                          </div>
                        `;
                      }
                      return '';
                    })()}
                  </div>

                  <div class="schema-pills-pool" id="languages-pills-pool">
                    ${(() => {
                      const q = (signupState.languagesSearchQuery || '').toLowerCase().trim();
                      const presetList = [...HOTEL_LANGUAGES_PRESETS];
                      (signupState.customLanguagesPool || []).forEach(name => {
                        if (!presetList.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                          presetList.push({ name, level: 'Fluent' });
                        }
                      });

                      const selectedStack = (signupState.languages || []).filter(l => !q || l.name.toLowerCase().includes(q));
                      const unselectedPool = presetList.filter(l => !(signupState.languages || []).some(sel => sel.name === l.name && sel.level === l.level)).filter(l => !q || l.name.toLowerCase().includes(q));

                      return [
                        ...selectedStack.map(l => `
                          <span class="schema-pill-item selected" data-pill-key="${l.name} (${l.level})" onclick="toggleLanguage('${l.name.replace(/'/g, "\\'")}', '${l.level}')" title="Click to unselect">
                            ✓ ${l.name} (${l.level})
                          </span>
                        `),
                        ...unselectedPool.map(l => `
                          <span class="schema-pill-item" data-pill-key="${l.name} (${l.level})" onclick="toggleLanguage('${l.name.replace(/'/g, "\\'")}', '${l.level}')" title="Click to select">
                            + ${l.name} (${l.level})
                          </span>
                        `)
                      ].join('');
                    })()}
                  </div>
                </div>
              </div>

              <!-- PREVIOUS EXPERIENCE -->
              <div class="auth-field">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label class="auth-label" style="margin: 0;">Previous Hospitality Experience</label>
                  <span style="font-size: 0.74rem; color: var(--text-dim);">Multi-entry experience</span>
                </div>

                <div class="dynamic-list-container" id="exp-dynamic-container">
                  ${signupState.experience.length === 0 ? `
                    <div style="color: var(--text-dim); font-size: 0.82rem; padding: 12px; border: 1px dashed var(--border-subtle); border-radius: 6px; text-align: center; margin-bottom: 8px;">
                      No previous hospitality experience listed yet. Click below to add experience (or leave empty if you are a fresher).
                    </div>
                  ` : signupState.experience.map((exp, idx) => `
                    <div class="dynamic-entry-card">
                      <div class="dynamic-entry-header">
                        <span class="dynamic-entry-title">Experience #${idx + 1}</span>
                        ${signupState.experience.length > 1 ? `
                          <button type="button" class="dynamic-remove-btn" onclick="removeExperienceEntry(${idx})">${svgIcon('x', '', 13)} Remove</button>
                        ` : ''}
                      </div>

                      <div class="auth-field-grid">
                        <div class="auth-field">
                          <label class="auth-label" style="font-size: 0.76rem;">Institute / Hotel Name</label>
                          <input type="text" class="auth-input exp-comp" placeholder="Enter hotel, resort, or organization name" 
                            value="${exp.company || ''}" required>
                        </div>
                        <div class="auth-field">
                          <label class="auth-label" style="font-size: 0.76rem;">Role / Designation</label>
                          <input type="text" class="auth-input exp-role" placeholder="Enter your job title or designation" 
                            value="${exp.role || ''}" required>
                        </div>
                      </div>

                      <div class="auth-field-grid">
                        <div class="auth-field">
                          <label class="auth-label" style="font-size: 0.76rem;">Years of Service / Period</label>
                          <input type="text" class="auth-input exp-period" placeholder="Service period (2022 - 2024)" 
                            value="${exp.period || ''}">
                        </div>
                        <div class="auth-field">
                          <label class="auth-label" style="font-size: 0.76rem;">Skills Acquired</label>
                          <input type="text" class="auth-input exp-skills" placeholder="Key responsibilities or systems used" 
                            value="${exp.skills_acquired || ''}">
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>

                <button type="button" class="dynamic-add-btn" onclick="addExperienceEntry()">
                  + Add Another Experience Entry
                </button>
              </div>

              <div class="auth-nav-row">
                <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevSignupStage()">
                  ← Back
                </button>
                <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                  Continue →
                </button>
              </div>
            </form>
          ` : ''}

          <!-- Password & Confirm Password -->
          ${signupState.stage === 3 ? `
            <div class="auth-header">
              <h2 class="auth-title">Account Security</h2>
              <p class="auth-subtitle">Set and confirm your candidate password</p>
            </div>

            <form id="form-cand-part3" onsubmit="event.preventDefault(); nextSignupStage(4);">
              <div class="auth-field-grid">
                <div class="auth-field">
                  <label class="auth-label">Password</label>
                  <div class="auth-password-wrapper">
                    <input type="password" id="cand-pwd" class="auth-input" required 
                      placeholder="Min. 6 characters" value="${signupState.password || ''}" autofocus>
                    <button type="button" class="auth-eye-toggle" id="cand-p3-toggle1" 
                      onclick="togglePasswordVisibility('cand-pwd', 'cand-p3-toggle1')" 
                      title="Show/Hide Password">${svgIcon('eye', '', 16)}</button>
                  </div>
                </div>

                <div class="auth-field">
                  <label class="auth-label">Confirm Password</label>
                  <div class="auth-password-wrapper">
                    <input type="password" id="cand-confirm-pwd" class="auth-input" required 
                      placeholder="Confirm password" value="${signupState.confirm_password || ''}">
                    <button type="button" class="auth-eye-toggle" id="cand-p3-toggle2" 
                      onclick="togglePasswordVisibility('cand-confirm-pwd', 'cand-p3-toggle2')" 
                      title="Show/Hide Password">${svgIcon('eye', '', 16)}</button>
                  </div>
                </div>
              </div>

              <div class="auth-nav-row">
                <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevSignupStage()">
                  ← Back
                </button>
                <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                  Continue →
                </button>
              </div>
            </form>
          ` : ''}

          <!-- OTP Process -->
          ${signupState.stage === 4 ? `
            <div class="auth-header" style="text-align: center;">
              <div class="auth-icon-circle" style="margin: 0 auto 12px auto;">${svgIcon('smartphone', '', 24)}</div>
              <h2 class="auth-title">Verify Phone &amp; Email</h2>
              <p class="auth-subtitle">Enter verification code to activate your account</p>
              <div class="auth-destination-pill" style="margin-top: 10px; display: inline-flex;">
                <span>Dispatched to +88 <strong>${signupState.phone}</strong> &amp; <strong>${signupState.email}</strong></span>
              </div>
            </div>

            <form id="form-cand-part4" onsubmit="handleCandidateFinalSignup(event)">
              <div class="auth-field" style="text-align: center; margin-bottom: 14px;">
                <input type="text" id="cand-otp-code" maxlength="6" class="auth-otp-input" 
                  placeholder="Enter 6-digit OTP code" value="${state.demoDataHidden ? (signupState.otp_code || '') : (signupState.otp_code || signupState.lastSentOtp || '258330')}" autofocus required>
              </div>

              <div class="auth-demo-otp-bar" onclick="autoFillCandidateOtp()" title="Click to auto-fill demo OTP">
                <span>Demo Code: <strong>${signupState.lastSentOtp || '258330'}</strong></span>
                <span class="auth-fill-pill">Auto-Fill</span>
              </div>

              <div class="auth-nav-row" style="margin-top: 14px;">
                <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevSignupStage()">
                  ← Back
                </button>
                <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                  Verify Code &amp; Review Terms →
                </button>
              </div>
            </form>

            <div class="auth-otp-footer">
              <span>Didn't receive code?</span>
              <button type="button" class="auth-text-link" onclick="resendCandidateOtp()">Resend Code</button>
            </div>
          ` : ''}

          <!-- Terms & Conditions Screen (After OTP) -->
          ${signupState.stage === 'terms' ? `
            <div class="auth-header">
              <div class="auth-icon-circle" style="margin: 0 auto 12px auto; color: var(--orange-primary);">${svgIcon('fileText', '', 26)}</div>
              <h2 class="auth-title">Terms &amp; Conditions</h2>
              <p class="auth-subtitle">NiceJobs Candidate Code of Conduct &amp; Verification Agreement</p>
            </div>
            <div class="terms-scroll-panel" style="max-height: 260px; overflow-y: auto; background: rgba(0, 0, 0, 0.35); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 0.82rem; color: #cbd5e1; line-height: 1.6;">
              <h4 style="color: var(--white); font-weight: 700; margin-bottom: 6px;">1. Accurate Candidate Representations</h4>
              <p style="margin-bottom: 12px;">All information provided regarding past hospitality work experience, academic qualifications, National ID/Passport data, and hospitality software capabilities (Opera PMS, Fidelio, Micros POS) must be accurate and truthful.</p>
              
              <h4 style="color: var(--white); font-weight: 700; margin-bottom: 6px;">2. Direct 5-Star Hotel HR Engagement</h4>
              <p style="margin-bottom: 12px;">Candidate profiles and CVs are shared strictly with verified hotel properties and HR recruiting directors. NiceJobs does not sell candidate data to third-party commercial marketing entities.</p>
              
              <h4 style="color: var(--white); font-weight: 700; margin-bottom: 6px;">3. Messaging &amp; Interview Protocol</h4>
              <p style="margin-bottom: 12px;">Direct candidate-employer messaging must adhere to professional hospitality standards. Harassment, misrepresentation, or abuse of messaging channels will result in immediate termination of account access.</p>

              <h4 style="color: var(--white); font-weight: 700; margin-bottom: 6px;">4. Acceptance Requirement</h4>
              <p style="margin-bottom: 0;">You must accept these terms to activate your candidate profile and participate in hotel talent matching.</p>
            </div>

            <div class="auth-nav-row" style="display: flex; gap: 12px;">
              <button type="button" class="btn-secondary" style="padding: 12px 24px;" onclick="prevSignupStage()">
                ← Back
              </button>
              <button type="button" class="btn-orange" style="flex: 1; padding: 12px; font-weight: 800;" onclick="acceptCandidateTerms()">
                Accept &amp; Continue →
              </button>
            </div>
          ` : ''}
        ` : `
          <!-- ============================================== -->
          <!-- BUSINESS ONBOARDING FLOW                       -->
          <!-- ============================================== -->
          ${signupState.biz_route === 'choose' ? `
            <!-- Initial Choice: "New Business Account" OR "Add new user" -->
            <div class="auth-header">
              <h2 class="auth-title">Business Portal Onboarding</h2>
              <p class="auth-subtitle">Select whether you are registering a new hotel property or joining an existing team</p>
            </div>

            <div class="biz-choice-grid">
              <div class="biz-choice-card" onclick="selectBizRoute('new')">
                <div>
                  <div class="biz-choice-icon">${svgIcon('hotel', '', 24)}</div>
                  <div class="biz-choice-heading">New Business Account</div>
                  <div class="biz-choice-sub">
                    Register a new hotel, resort, or hospitality business. As the first user, you will be the <strong>Business Administrator</strong>.
                  </div>
                </div>
                <div class="biz-choice-cta">Start New Business Registration →</div>
              </div>

              <div class="biz-choice-card" onclick="selectBizRoute('join')">
                <div>
                  <div class="biz-choice-icon">${svgIcon('users', '', 24)}</div>
                  <div class="biz-choice-heading">Add New User</div>
                  <div class="biz-choice-sub">
                    Join an existing registered hotel or property. Your request will be sent to the business administrator for approval.
                  </div>
                </div>
                <div class="biz-choice-cta">Join Existing Business Team →</div>
              </div>
            </div>

            <div class="signup-login-prompt-banner">
              <span>Already registered as a business or recruiter?</span>
              <button type="button" class="btn-signup-login-action" onclick="startLoginFlow('business')">
                Log In to Recruiter Desk →
              </button>
            </div>
          ` : ''}

          <!-- ========================================================= -->
          <!-- ROUTE A: NEW BUSINESS ACCOUNT (PARTS 1 TO 8)              -->
          <!-- ========================================================= -->
          ${signupState.biz_route === 'new' ? `
            <!-- PART 1: Business name, Legal name, Business type (schema + search), Location segmented (Plot, Road, Thana, District), Website, Official Mail -->
            ${signupState.biz_step === 1 ? `
              <div class="auth-header">
                <h2 class="auth-title">Establishment Profile</h2>
                <p class="auth-subtitle">Property details, legal registration &amp; exact location</p>
              </div>

              <form id="form-biz-new-part1" onsubmit="event.preventDefault(); nextBizStage(2);">
                <!-- Business Logo Upload System -->
                <div class="logo-upload-wrap" style="display: flex; align-items: center; gap: 18px; padding: 14px 18px; background: rgba(255, 255, 255, 0.025); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 20px;">
                  <div class="logo-avatar-preview-box" style="width: 68px; height: 68px; min-width: 68px; border-radius: 12px; background: #ffffff; border: 2px solid var(--orange-primary); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);">
                    <img src="${signupState.logo_url || DEFAULT_HOTEL_LOGO}" alt="Property Logo Preview" id="biz-logo-img" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;">
                  </div>
                  <div style="flex: 1;">
                    <label class="auth-label" style="margin-bottom: 4px; font-weight: 700; color: var(--white);">Establishment Logo</label>
                    <p style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 8px;">Upload official hotel or property brand logo (PNG, JPG, WebP, SVG up to 5MB)</p>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <button type="button" class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;" onclick="document.getElementById('biz-logo-file-input').click()">
                        ${svgIcon('upload', '', 14)} Upload Logo
                      </button>
                      <input type="file" id="biz-logo-file-input" accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml" style="display: none;" onchange="handleBizLogoFileSelected(event)">
                      ${signupState.logo_url && signupState.logo_url !== DEFAULT_HOTEL_LOGO ? `
                        <button type="button" class="btn-icon" id="biz-logo-remove-btn" title="Remove logo" style="width: 32px; height: 32px; color: #f87171;" onclick="removeBizLogo()">
                          ${svgIcon('x', '', 14)}
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>

                <div class="auth-field-grid">
                  <div class="auth-field">
                    <label class="auth-label">Business Name (Brand Name)</label>
                    <input type="text" id="biz-new-brand" class="auth-input" required 
                      placeholder="Enter property or brand name" 
                      value="${signupState.brand_name || ''}" autofocus>
                  </div>

                  <div class="auth-field">
                    <label class="auth-label">Legal Registered Name</label>
                    <input type="text" id="biz-new-legal" class="auth-input" required 
                      placeholder="Enter legal registered corporate entity name" 
                      value="${signupState.legal_name || ''}">
                  </div>
                </div>

                <!-- Business Type (all hotel/resort types schema + search inside) -->
                <div class="auth-field">
                  <label class="auth-label">Business Type</label>
                  <div class="schema-box-wrapper" style="padding: 10px; margin-bottom: 4px;">
                    <input type="text" 
                      class="schema-search-input" 
                      id="biz-type-search" 
                      placeholder="Search or select property type..." 
                      value="${signupState.bizTypeSearchQuery || ''}" 
                      oninput="filterHotelTypes(this.value)">
                    <select id="biz-new-type" class="auth-input" style="margin-top: 8px;" onchange="signupState.property_type = this.value">
                      ${HOTEL_TYPES_SCHEMA.concat(signupState.customBizTypesPool).filter(t => {
                        if (!signupState.bizTypeSearchQuery) return true;
                        return t.toLowerCase().includes(signupState.bizTypeSearchQuery.toLowerCase());
                      }).map(t => `
                        <option value="${t}" ${signupState.property_type === t ? 'selected' : ''}>${t}</option>
                      `).join('')}
                    </select>
                    ${signupState.bizTypeSearchQuery && !HOTEL_TYPES_SCHEMA.concat(signupState.customBizTypesPool).some(t => t.toLowerCase() === signupState.bizTypeSearchQuery.toLowerCase()) ? `
                      <div class="schema-add-chip" style="margin-top: 8px;" onclick="addCustomBizType('${signupState.bizTypeSearchQuery}')">
                        + Add "${signupState.bizTypeSearchQuery}" as a custom business type &amp; save
                      </div>
                    ` : ''}
                  </div>
                </div>

                <!-- Exact Location Segmented: Plot, Road, Thana/Upazila, District (64 Districts) -->
                <div class="auth-field">
                  <label class="auth-label">Exact Location (Segmented Address)</label>
                  <div class="location-segments-grid">
                    <div>
                      <input type="text" id="biz-new-plot" class="auth-input" placeholder="Enter plot or holding number" 
                        value="${signupState.plot_number || ''}">
                    </div>
                    <div>
                      <input type="text" id="biz-new-road" class="auth-input" placeholder="Enter road number, street, or sector" 
                        value="${signupState.road_number || ''}">
                    </div>
                    <div>
                      <input type="text" id="biz-new-thana" class="auth-input" placeholder="Enter thana or upazila name" 
                        value="${signupState.thana_upazila || ''}">
                    </div>
                    <div>
                      <select id="biz-new-district" class="auth-input" onchange="signupState.district = this.value">
                        ${BANGLADESH_DISTRICTS.map(d => `
                          <option value="${d}" ${signupState.district === d ? 'selected' : ''}>${d} District</option>
                        `).join('')}
                      </select>
                    </div>
                  </div>
                </div>

                <div class="auth-field-grid">
                  <div class="auth-field">
                    <label class="auth-label">Official Website</label>
                    <input type="url" id="biz-new-website" class="auth-input" 
                      placeholder="Enter official website URL (https://...)" 
                      value="${signupState.website || ''}">
                  </div>
                  <div class="auth-field">
                    <label class="auth-label">Official Mail of Business</label>
                    <input type="email" id="biz-new-email" class="auth-input" required 
                      placeholder="Enter official hotel contact email" 
                      value="${signupState.official_email || ''}">
                  </div>
                </div>

                <div class="auth-field" style="margin-top: 14px;">
                  <label class="auth-label">Official Telephone Number <span style="font-size: 0.76rem; color: var(--text-dim); font-weight: normal;">(Landline / Reception Hotline)</span></label>
                  <input type="tel" id="biz-new-telephone" class="auth-input" 
                    placeholder="Enter landline or reception desk hotline" 
                    value="${signupState.official_telephone || ''}">
                  <span class="auth-hint">Official landline, PABX reception desk, or corporate hotline.</span>
                </div>

                <button type="submit" class="auth-btn-primary" style="margin-top: 10px;">
                  Continue →
                </button>
              </form>

              <div class="signup-login-prompt-banner">
                <span>Already have an account?</span>
                <button type="button" class="btn-signup-login-action" onclick="startLoginFlow('business')">
                  Log In to Recruiter Desk →
                </button>
              </div>
            ` : ''}

            <!-- Business Features / Amenities Schema + Search -->
            ${signupState.biz_step === 2 ? `
              <div class="auth-header">
                <h2 class="auth-title">Property Features &amp; Amenities</h2>
                <p class="auth-subtitle">Select or add all facilities and amenities your property provides</p>
              </div>

              <form id="form-biz-new-part2" onsubmit="event.preventDefault(); nextBizStage(3);">
                <div class="auth-field">
                  <div class="schema-box-wrapper">
                    <input type="text" class="schema-search-input" id="features-search" 
                      placeholder="Type facility (e.g. Swimming Pool, Spa) and press Enter to add..." 
                      value="${signupState.featuresSearchQuery || ''}" 
                      oninput="filterFeaturesSchema(this.value)"
                      onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomFeature(this.value);}">

                    <div id="features-custom-add-container">
                      ${(() => {
                        const q = (signupState.featuresSearchQuery || '').toLowerCase().trim();
                        const allPool = Array.from(new Set([...(signupState.customFeaturesPool || []), ...HOTEL_FEATURES_SCHEMA]));
                        const hasExactMatch = q && allPool.some(f => f.toLowerCase() === q);
                        if (q && !hasExactMatch) {
                          return `
                            <div class="schema-add-chip" onclick="addCustomFeature('${signupState.featuresSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                              + Add "${signupState.featuresSearchQuery}" to features
                            </div>
                          `;
                        }
                        return '';
                      })()}
                    </div>

                    <div class="schema-pills-pool" id="features-pills-pool">
                      ${(() => {
                        const q = (signupState.featuresSearchQuery || '').toLowerCase().trim();
                        const allPool = Array.from(new Set([...(signupState.customFeaturesPool || []), ...HOTEL_FEATURES_SCHEMA]));
                        
                        // Stack logic: Selected features at the top in stack order (latest selected is at top)
                        const selectedStack = (signupState.features || []).filter(f => !q || f.toLowerCase().includes(q));
                        
                        // Remaining unselected features below
                        const unselectedPool = allPool.filter(f => !signupState.features.includes(f)).filter(f => !q || f.toLowerCase().includes(q));

                        return [
                          ...selectedStack.map(f => `
                            <span class="schema-pill-item selected" data-pill-key="${f}" onclick="toggleFeatureSelection('${f.replace(/'/g, "\\'")}')" title="Click to unselect">
                              ✓ ${f}
                            </span>
                          `),
                          ...unselectedPool.map(f => `
                            <span class="schema-pill-item" data-pill-key="${f}" onclick="toggleFeatureSelection('${f.replace(/'/g, "\\'")}')" title="Click to select">
                              + ${f}
                            </span>
                          `)
                        ].join('');
                      })()}
                    </div>
                  </div>
                </div>

                <div class="auth-nav-row">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevBizStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Continue →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Representative Info (Name, Cell +88, Email, DOB, PFP, Designation) -->
            ${signupState.biz_step === 3 ? `
              <div class="auth-header">
                <h2 class="auth-title">Representative Information</h2>
                <p class="auth-subtitle">Basic info of the person registering on behalf of the business</p>
              </div>

              <form id="form-biz-new-part3" onsubmit="event.preventDefault(); nextBizStage(4);">
                <!-- Profile Picture Upload (Person on behalf of the business) -->
                <div class="pfp-upload-wrap" style="margin-bottom: 20px;">
                  <div class="pfp-avatar-preview-box">
                    <img src="${signupState.rep_pfp || DEFAULT_AVATAR_PREVIEW}" alt="Representative Photo Preview" class="pfp-preview-img" id="biz-rep-pfp-img">
                  </div>
                  <div style="flex: 1;">
                    <label class="auth-label" style="margin-bottom: 4px; font-weight: 700;">Representative Photo</label>
                    <p style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 8px;">Upload professional photo of the person on behalf of the business (Only compressed if &ge; 1MB)</p>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <button type="button" class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;" onclick="document.getElementById('biz-rep-pfp-file-input').click()">
                        ${svgIcon('upload', '', 14)} Upload Picture
                      </button>
                      <input type="file" id="biz-rep-pfp-file-input" accept="image/png, image/jpeg, image/jpg, image/webp" style="display: none;" onchange="handlePfpFileSelected(event, 'biz_rep')">
                      ${signupState.rep_pfp && signupState.rep_pfp !== DEFAULT_AVATAR_PREVIEW ? `
                        <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openPfpSettingModal(signupState.raw_rep_pfp || signupState.rep_pfp, 'biz_rep')">
                          ${svgIcon('maximize', '', 13)} Adjust Face &amp; Zoom
                        </button>
                        <button type="button" class="btn-icon" id="biz-rep-pfp-remove-btn" title="Remove photo" style="width: 32px; height: 32px; color: #f87171;" onclick="removeBizRepPfp()">
                          ${svgIcon('x', '', 14)}
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>

                <div class="auth-field">
                  <label class="auth-label">Full Name</label>
                  <input type="text" id="biz-rep-name" class="auth-input" required 
                    placeholder="Enter representative full name" 
                    value="${signupState.rep_name || ''}" autofocus>
                </div>

                <!-- Cell with fixed +88 in front -->
                <div class="auth-field">
                  <label class="auth-label">Mobile Cell Phone</label>
                  <div class="phone-input-wrapper">
                    <span class="phone-prefix-fixed">+88</span>
                    <input type="tel" 
                      id="biz-rep-phone" 
                      class="phone-number-field" 
                      placeholder="01XXXXXXXXX (11 digits)" 
                      maxlength="11" 
                      minlength="11" 
                      pattern="01[0-9]{9}" 
                      inputmode="numeric" 
                      required 
                      oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);"
                      value="${signupState.rep_cell || ''}">
                  </div>
                  <span class="auth-field-hint">11-digit mobile number starting with 01</span>
                </div>

                <div class="auth-field-grid">
                  <div class="auth-field">
                    <label class="auth-label">Email of Person on Behalf <span style="font-size: 0.76rem; color: var(--text-dim); font-weight: normal;">(Representative Work Email)</span></label>
                    <input type="email" id="biz-rep-email" class="auth-input" required 
                      placeholder="Enter representative work email address" 
                      value="${signupState.rep_email || ''}">
                    <span class="auth-field-hint">Official login and contact email for the authorized person managing the property.</span>
                  </div>
                  <div class="auth-field">
                    <label class="auth-label">Date of Birth (DOB)</label>
                    <input type="date" id="biz-rep-dob" class="auth-input" 
                      value="${signupState.rep_dob || ''}">
                  </div>
                </div>

                <div class="auth-field">
                  <label class="auth-label">Designation / Role in Business</label>
                  <input type="text" id="biz-rep-desig" class="auth-input" required 
                    placeholder="Enter official job designation (Your Designation)" 
                    value="${signupState.rep_designation || ''}">
                </div>

                <div class="auth-nav-row">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevBizStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Continue →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Set Password & Confirm Password -->
            ${signupState.biz_step === 4 ? `
              <div class="auth-header">
                <h2 class="auth-title">Account Credentials</h2>
                <p class="auth-subtitle">Set password for business login</p>
              </div>

              <form id="form-biz-new-part4" onsubmit="event.preventDefault(); nextBizStage(5);">
                <div class="auth-field-grid">
                  <div class="auth-field">
                    <label class="auth-label">Set Password</label>
                    <div class="auth-password-wrapper">
                      <input type="password" id="biz-pwd-part4" class="auth-input" required 
                        placeholder="Min. 6 characters" value="${signupState.biz_password || ''}" autofocus>
                      <button type="button" class="auth-eye-toggle" id="biz-p4-t1" 
                        onclick="togglePasswordVisibility('biz-pwd-part4', 'biz-p4-t1')">${svgIcon('eye', '', 16)}</button>
                    </div>
                  </div>

                  <div class="auth-field">
                    <label class="auth-label">Confirm Password</label>
                    <div class="auth-password-wrapper">
                      <input type="password" id="biz-confirm-pwd-part4" class="auth-input" required 
                        placeholder="Confirm password" value="${signupState.biz_confirm_password || ''}">
                      <button type="button" class="auth-eye-toggle" id="biz-p4-t2" 
                        onclick="togglePasswordVisibility('biz-confirm-pwd-part4', 'biz-p4-t2')">${svgIcon('eye', '', 16)}</button>
                    </div>
                  </div>
                </div>

                <div class="auth-nav-row">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevBizStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Continue →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- OTP Verification -->
            ${signupState.biz_step === 5 ? `
              <div class="auth-header" style="text-align: center;">
                <div class="auth-icon-circle" style="margin: 0 auto 12px auto;">${svgIcon('smartphone', '', 24)}</div>
                <h2 class="auth-title">Security OTP</h2>
                <p class="auth-subtitle">Verification code dispatched to verify business identity</p>
                <div class="auth-destination-pill" style="margin-top: 10px; display: inline-flex;">
                  <span>Sent to +88 <strong>${signupState.rep_cell}</strong> &amp; <strong>${signupState.official_email}</strong></span>
                </div>
              </div>

              <form id="form-biz-new-part5" onsubmit="handleNewBusinessOtpSubmit(event)">
                <div class="auth-field" style="text-align: center; margin-bottom: 14px;">
                  <input type="text" id="biz-new-otp" maxlength="6" class="auth-otp-input" 
                    placeholder="Enter 6-digit OTP code" value="${state.demoDataHidden ? (signupState.biz_otp_code || '') : (signupState.biz_otp_code || signupState.biz_lastSentOtp || '258330')}" autofocus required>
                </div>

                <div class="auth-demo-otp-bar" onclick="autoFillBizNewOtp()" title="Click to auto-fill demo OTP">
                  <span>Demo Code: <strong>${signupState.biz_lastSentOtp || '258330'}</strong></span>
                  <span class="auth-fill-pill">Auto-Fill</span>
                </div>

                <div class="auth-nav-row" style="margin-top: 14px;">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevBizStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Verify Code &amp; Review Terms →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Terms & Conditions Screen (After Hotel OTP) -->
            ${signupState.biz_step === 'terms' ? `
              <div class="auth-header" style="text-align: center;">
                <div class="auth-icon-circle" style="margin: 0 auto 12px auto; color: var(--orange-primary);">${svgIcon('shield', '', 24)}</div>
                <h2 class="auth-title">Hotel Partner Terms &amp; Conditions</h2>
                <p class="auth-subtitle">Review standards and trust policies for verified employers on NiceJobs</p>
              </div>

              <div class="terms-scroll-panel" style="max-height: 250px; overflow-y: auto; background: rgba(0, 0, 0, 0.35); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 0.82rem; color: #cbd5e1; line-height: 1.6;">
                <h4 style="color: var(--white); margin-bottom: 8px; font-size: 0.92rem;">1. Legitimate Hospitality Employer Commitment</h4>
                <p style="margin-bottom: 12px;">By registering <strong>${signupState.brand_name || 'your establishment'}</strong>, you warrant that your establishment operates under valid Bangladesh trade licensing and hospitality permits. Misrepresentation of property status will result in immediate termination.</p>

                <h4 style="color: var(--white); margin-bottom: 8px; font-size: 0.92rem;">2. Accurate Job Postings &amp; Fair Recruitment</h4>
                <p style="margin-bottom: 12px;">All job posts published on NiceJobs must reflect real, active employment vacancies. You agree to uphold Bangladesh Labor Act guidelines, honest salary/remuneration representations, and ethical interview protocols.</p>

                <h4 style="color: var(--white); margin-bottom: 8px; font-size: 0.92rem;">3. Candidate Privacy &amp; Data Protection</h4>
                <p style="margin-bottom: 12px;">Candidate CVs, contact details, and credentials accessed through the ATS desk are strictly confidential and must be utilized solely for hiring within your registered property.</p>

                <h4 style="color: var(--white); margin-bottom: 8px; font-size: 0.92rem;">4. Trust Desk Verification</h4>
                <p style="margin-bottom: 0;">Business accounts undergo mandatory verification before job posting. You must accept these terms to complete registration and initiate the verification process.</p>
              </div>

              <div class="auth-nav-row" style="display: flex; gap: 12px;">
                <button type="button" class="btn-secondary" style="padding: 12px 24px;" onclick="prevBizStage()">
                  ← Back
                </button>
                <button type="button" class="btn-orange" style="flex: 1; padding: 12px; font-weight: 800;" onclick="acceptHotelTerms()">
                  Accept Terms &amp; Submit Registration ✓
                </button>
              </div>
            ` : ''}

            <!-- PART 6: Pending Verification Message with WhatsApp & Email (Admin assigned by default) -->
            ${signupState.biz_step === 6 ? `
              <div style="text-align: center; margin-bottom: 20px;">
                <div style="margin-bottom: 12px; color: var(--orange-primary);">${svgIcon('clipboard', '', 48)}</div>
                <h2 class="auth-title" style="color: var(--orange-primary);">Registration Queued for Verification</h2>
                <div class="auth-notice-card" style="margin: 20px 0; text-align: left;">
                  <div class="auth-notice-title">${svgIcon('clock', '', 18)} We are notified and please wait for verification</div>
                  <div class="auth-notice-text">
                    Your establishment <strong>${signupState.brand_name}</strong> has been registered. As the creator of this business account, <strong>${signupState.rep_name}</strong> is designated as the <strong>Business Administrator</strong>.
                    <br><br>
                    If you have any query, our Trust &amp; Safety Desk is available directly via WhatsApp and Email:
                  </div>
                  <div class="auth-contact-links">
                    <a href="https://wa.me/8801819876543" target="_blank" class="auth-contact-pill" style="background: rgba(37, 211, 102, 0.15); color: #86efac; border: 1px solid rgba(37, 211, 102, 0.4);">
                      ${svgIcon('whatsapp', '', 15)} WhatsApp: +880 1819-876543
                    </a>
                    <a href="mailto:trust@nicejobs.bd" class="auth-contact-pill" style="background: rgba(255, 255, 255, 0.06); color: var(--white); border: 1px solid rgba(255, 255, 255, 0.15);">
                      ${svgIcon('mail', '', 15)} Email: trust@nicejobs.bd
                    </a>
                  </div>
                </div>

                <div style="font-size: 0.85rem; color: #fbbf24; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                  ${svgIcon('alertCircle', '', 16)} Business verification is required before signing in or accessing the workspace.
                </div>
                <button type="button" class="auth-btn-primary" onclick="navigateTo('home')">
                  Return to Home →
                </button>
              </div>
            ` : ''}
          ` : ''}

          <!-- ========================================================= -->
          <!-- ROUTE B: ADD NEW USER (PARTS 1 TO 7)                      -->
          <!-- ========================================================= -->
          ${signupState.biz_route === 'join' ? `
            <!-- Find business official email -->
            ${signupState.biz_step === 1 ? `
              <div class="auth-header">
                <h2 class="auth-title">Find Your Business</h2>
                <p class="auth-subtitle">Enter the official business email to join their team</p>
              </div>

              <form id="form-biz-join-part1" onsubmit="handleJoinBusinessCheck(event)">
                <div class="auth-field">
                  <label class="auth-label">Official Business Email</label>
                  <input type="email" id="biz-join-email" class="auth-input" required 
                    placeholder="Enter registered official business email" 
                    value="${signupState.join_business_email || ''}" autofocus>
                  <span class="auth-field-hint">The registered email of the hotel or business you wish to join</span>
                </div>

                ${signupState.join_not_found ? `
                  <div class="auth-notice-card">
                    <div class="auth-notice-title">${svgIcon('alertCircle', '', 16)} Business Not Listed</div>
                    <div class="auth-notice-text">
                      This business is not yet in our directory, please create an account.
                    </div>
                    <button type="button" class="btn-orange" style="width: 100%; font-size: 0.82rem; padding: 10px;" 
                      onclick="selectBizRoute('new')">
                      ${svgIcon('hotel', '', 15)} Create Business Account →
                    </button>
                  </div>
                ` : ''}

                <div class="auth-nav-row">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="selectBizRoute('choose')">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Verify Business Email →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Account Credentials -->
            ${signupState.biz_step === 2 ? `
              <div class="auth-header">
                <h2 class="auth-title">Account Credentials</h2>
                <p class="auth-subtitle">Set up your business login for ${signupState.join_matched_business?.brand_name || 'Business'}</p>
              </div>

              <!-- Matched Business Card -->
              <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: var(--radius-md); padding: 12px 14px; margin-bottom: 16px;">
                <div style="font-size: 0.74rem; font-weight: 700; color: #a7f3d0; text-transform: uppercase;">Matched Hotel</div>
                <div style="font-weight: 800; font-size: 0.95rem; color: var(--white);">${signupState.join_matched_business?.brand_name}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">Admin: ${signupState.join_matched_business?.admin_name || 'Business Admin'}</div>
              </div>

              <form id="form-biz-join-part3" onsubmit="event.preventDefault(); nextJoinStage(3);">
                <div class="auth-field">
                  <label class="auth-label">Your Personal Work Email</label>
                  <input type="email" id="join-rep-email" class="auth-input" required 
                    placeholder="Enter your personal work email" 
                    value="${signupState.join_user_email || ''}" autofocus>
                </div>

                <div class="auth-field">
                  <label class="auth-label">Account Password</label>
                  <div class="auth-password-wrapper">
                    <input type="password" id="join-rep-pwd" class="auth-input" required 
                      placeholder="Enter password (min 6 characters)" value="${signupState.join_user_password || ''}">
                    <button type="button" class="auth-eye-toggle" id="join-p3-t1" 
                      onclick="togglePasswordVisibility('join-rep-pwd', 'join-p3-t1')">${svgIcon('eye', '', 16)}</button>
                  </div>
                </div>

                <div class="auth-nav-row">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevJoinStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Continue →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Representative Profile -->
            ${signupState.biz_step === 3 ? `
              <div class="auth-header">
                <h2 class="auth-title">Representative Profile</h2>
                <p class="auth-subtitle">Your details as business team member</p>
              </div>

              <form id="form-biz-join-part4" onsubmit="event.preventDefault(); nextJoinStage(4);">
                <!-- Profile Picture Upload (Adding new user for business) -->
                <div class="pfp-upload-wrap" style="margin-bottom: 20px;">
                  <div class="pfp-avatar-preview-box">
                    <img src="${signupState.join_pfp || DEFAULT_AVATAR_PREVIEW}" alt="Photo Preview" class="pfp-preview-img" id="biz-join-pfp-img">
                  </div>
                  <div style="flex: 1;">
                    <label class="auth-label" style="margin-bottom: 4px; font-weight: 700;">Profile Photo</label>
                    <p style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 8px;">Upload professional photo of the team member (Only compressed if &ge; 1MB)</p>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <button type="button" class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;" onclick="document.getElementById('biz-join-pfp-file-input').click()">
                        ${svgIcon('upload', '', 14)} Upload Picture
                      </button>
                      <input type="file" id="biz-join-pfp-file-input" accept="image/png, image/jpeg, image/jpg, image/webp" style="display: none;" onchange="handlePfpFileSelected(event, 'biz_join')">
                      ${signupState.join_pfp && signupState.join_pfp !== DEFAULT_AVATAR_PREVIEW ? `
                        <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openPfpSettingModal(signupState.raw_join_pfp || signupState.join_pfp, 'biz_join')">
                          ${svgIcon('maximize', '', 13)} Adjust Face &amp; Zoom
                        </button>
                        <button type="button" class="btn-icon" id="biz-join-pfp-remove-btn" title="Remove photo" style="width: 32px; height: 32px; color: #f87171;" onclick="removeBizJoinPfp()">
                          ${svgIcon('x', '', 14)}
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>

                <div class="auth-field">
                  <label class="auth-label">Full Name</label>
                  <input type="text" id="join-rep-name" class="auth-input" required 
                    placeholder="Enter your full name" 
                    value="${signupState.join_name || ''}" autofocus>
                </div>

                <!-- Cell with fixed +88 in front -->
                <div class="auth-field">
                  <label class="auth-label">Cell Phone</label>
                  <div class="phone-input-wrapper">
                    <span class="phone-prefix-fixed">+88</span>
                    <input type="tel" 
                      id="join-rep-phone" 
                      class="phone-number-field" 
                      placeholder="01XXXXXXXXX (11 digits)" 
                      maxlength="11" 
                      minlength="11" 
                      pattern="01[0-9]{9}" 
                      inputmode="numeric" 
                      required 
                      oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);"
                      value="${signupState.join_cell || ''}">
                  </div>
                  <span class="auth-field-hint">11-digit mobile number</span>
                </div>

                <div class="auth-field-grid">
                  <div class="auth-field">
                    <label class="auth-label">Date of Birth (DOB)</label>
                    <input type="date" id="join-rep-dob" class="auth-input" 
                      value="${signupState.join_dob || ''}">
                  </div>
                  <div class="auth-field">
                    <label class="auth-label">Designation</label>
                    <input type="text" id="join-rep-desig" class="auth-input" required 
                      placeholder="Enter your job title or designation" 
                      value="${signupState.join_designation || ''}">
                  </div>
                </div>

                <div class="auth-nav-row">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevJoinStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Continue →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Confirm Password -->
            ${signupState.biz_step === 4 ? `
              <div class="auth-header">
                <h2 class="auth-title">Confirm Password</h2>
                <p class="auth-subtitle">Verify your credentials before mobile verification</p>
              </div>

              <form id="form-biz-join-part5" onsubmit="event.preventDefault(); nextJoinStage(5);">
                <div class="auth-field">
                  <label class="auth-label">Confirm Password</label>
                  <div class="auth-password-wrapper">
                    <input type="password" id="join-confirm-pwd" class="auth-input" required 
                      placeholder="Re-type password to confirm" value="${signupState.join_confirm_password || ''}" autofocus>
                    <button type="button" class="auth-eye-toggle" id="join-p5-t1" 
                      onclick="togglePasswordVisibility('join-confirm-pwd', 'join-p5-t1')">${svgIcon('eye', '', 16)}</button>
                  </div>
                </div>

                <div class="auth-nav-row">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevJoinStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Continue →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Mobile Verification OTP -->
            ${signupState.biz_step === 5 ? `
              <div class="auth-header" style="text-align: center;">
                <div class="auth-icon-circle" style="margin: 0 auto 12px auto;">${svgIcon('smartphone', '', 24)}</div>
                <h2 class="auth-title">Verify Mobile</h2>
                <p class="auth-subtitle">Verification code sent to +88 ${signupState.join_cell}</p>
              </div>

              <form id="form-biz-join-part6" onsubmit="handleJoinBusinessOtpSubmit(event)">
                <div class="auth-field" style="text-align: center; margin-bottom: 14px;">
                  <input type="text" id="join-otp-code" maxlength="6" class="auth-otp-input" 
                    placeholder="Enter 6-digit OTP code" value="${state.demoDataHidden ? (signupState.join_otp_code || '') : (signupState.join_otp_code || signupState.join_lastSentOtp || '258330')}" autofocus required>
                </div>

                <div class="auth-demo-otp-bar" onclick="autoFillJoinOtp()" title="Click to auto-fill demo OTP">
                  <span>Demo Code: <strong>${signupState.join_lastSentOtp || '258330'}</strong></span>
                  <span class="auth-fill-pill">Auto-Fill</span>
                </div>

                <div class="auth-nav-row" style="margin-top: 14px;">
                  <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="prevJoinStage()">
                    ← Back
                  </button>
                  <button type="submit" class="auth-btn-primary" style="flex: 1; margin: 0;">
                    Verify Code &amp; Review Terms →
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Terms & Conditions Screen (After Join OTP) -->
            ${signupState.biz_step === 'terms_join' ? `
              <div class="auth-header" style="text-align: center;">
                <div class="auth-icon-circle" style="margin: 0 auto 12px auto; color: #fb923c;">${svgIcon('shield', '', 24)}</div>
                <h2 class="auth-title">Team Member Terms &amp; Conditions</h2>
                <p class="auth-subtitle">Review moderator authorization and confidentiality terms</p>
              </div>

              <div class="terms-scroll-panel" style="max-height: 250px; overflow-y: auto; background: rgba(0, 0, 0, 0.35); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 0.82rem; color: #cbd5e1; line-height: 1.6;">
                <h4 style="color: var(--white); margin-bottom: 8px; font-size: 0.92rem;">1. Authorization to Represent Property</h4>
                <p style="margin-bottom: 12px;">You confirm that you are an authorized employee or designated representative of <strong>${signupState.join_matched_business?.brand_name || 'the business'}</strong> requesting moderator workspace access.</p>

                <h4 style="color: var(--white); margin-bottom: 8px; font-size: 0.92rem;">2. Administrative Oversight &amp; Data Security</h4>
                <p style="margin-bottom: 12px;">Your membership is subject to approval by the Primary Business Administrator. All applicant data and recruitment interactions remain confidential and property of the establishment.</p>

                <h4 style="color: var(--white); margin-bottom: 0;">You must accept these terms to submit your moderator access request to the business administrator.</h4>
              </div>

              <div class="auth-nav-row" style="display: flex; gap: 12px;">
                <button type="button" class="btn-secondary" style="padding: 12px 24px;" onclick="prevJoinStage()">
                  ← Back
                </button>
                <button type="button" class="btn-orange" style="flex: 1; padding: 12px; font-weight: 800;" onclick="acceptJoinTerms()">
                  Accept Terms &amp; Submit Request ✓
                </button>
              </div>
            ` : ''}

            <!-- PART 7: Waiting for Admin Approval Notice -->
            ${signupState.biz_step === 6 ? `
              <div style="text-align: center; margin-bottom: 20px;">
                <div style="margin-bottom: 12px; color: #fb923c;">${svgIcon('clock', '', 48)}</div>
                <h2 class="auth-title" style="color: #fb923c;">Awaiting Business Admin Approval</h2>
                
                <div class="auth-notice-card" style="margin: 20px 0; text-align: left;">
                  <div class="auth-notice-title">Notification Dispatched to Admin</div>
                  <div class="auth-notice-text">
                    The administrator for <strong>${signupState.join_matched_business?.brand_name}</strong> has received a notification:
                    <br><br>
                    <em>"A moderator (<strong>${signupState.join_name}</strong>, ${signupState.join_designation}) is trying to join as a moderator. Do you approve or not?"</em>
                    <br><br>
                    Please wait for business admin approval. Your account has been registered, but you cannot access this business workspace until the administrator approves your request.
                  </div>
                </div>

                <button type="button" class="auth-btn-primary" onclick="startLoginFlow('business')">
                  Return to Log In →
                </button>
              </div>
            ` : ''}
          ` : ''}
        `}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// HELPER SUBROUTINES FOR SCHEMAS, ADDERS & AVATARS
// -------------------------------------------------------------

async function handleBizLogoFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/') && !file.type.includes('svg')) {
    showToast('Please select a valid image file (PNG, JPG, WebP, SVG)', 'danger');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Logo file size must be under 5MB', 'danger');
    return;
  }

  let dataUrl;
  if (file.size >= 1024 * 1024 && !file.type.includes('svg')) {
    dataUrl = await compressImageFile(file, 1600, 0.92);
  } else {
    dataUrl = await readFileAsDataURL(file);
  }
  signupState.logo_url = dataUrl;
  const logoImg = document.getElementById('biz-logo-img');
  if (logoImg) logoImg.src = dataUrl;
  saveSignupProgress();
  showToast(`Business logo attached: ${file.name}`, 'success');
  renderSignupPage(document.getElementById('app-viewport'));
}

function removeBizLogo() {
  signupState.logo_url = DEFAULT_HOTEL_LOGO;
  const logoImg = document.getElementById('biz-logo-img');
  if (logoImg) logoImg.src = DEFAULT_HOTEL_LOGO;
  saveSignupProgress();
  showToast('Logo reset to default.');
  renderSignupPage(document.getElementById('app-viewport'));
}

function handleCvFileSelected(event) {
  const file = event.target.files?.[0];
  if (file) {
    signupState.cv_name = file.name;
    showToast(`CV attached: ${file.name} (${Math.round(file.size / 1024)} KB)`, 'success');
    renderSignupPage(document.getElementById('app-viewport'));
  }
}

// Education dynamic add/remove
function addEducationEntry() {
  signupState.education.push({
    institution: '',
    degree: 'Bachelor of Hotel Management (BHM)',
    gpa: ''
  });
  renderSignupPage(document.getElementById('app-viewport'));
}

function removeEducationEntry(idx) {
  signupState.education.splice(idx, 1);
  renderSignupPage(document.getElementById('app-viewport'));
}

// Experience dynamic add/remove
function addExperienceEntry() {
  signupState.experience.push({
    company: '',
    role: '',
    period: '',
    skills_acquired: ''
  });
  renderSignupPage(document.getElementById('app-viewport'));
}

function removeExperienceEntry(idx) {
  signupState.experience.splice(idx, 1);
  renderSignupPage(document.getElementById('app-viewport'));
}

// =============================================================
// Schema System FLIP Animation Engine (Universal Pill Mover)
// Smoothly animates selected pills flying upward to the stack
// and deselected pills floating back down to their unselected place,
// while preserving scroll position and preventing any screen flashing.
// =============================================================
function animateSchemaPillsPool(poolElement, renderCallback) {
  if (!poolElement) {
    if (typeof renderCallback === 'function') renderCallback();
    return;
  }

  // Preserve scroll position so the pool doesn't jump
  const savedScrollTop = poolElement.scrollTop;

  // 1. FIRST: Capture bounding client rects of all existing pills
  const firstRects = new Map();
  const oldChildren = Array.from(poolElement.querySelectorAll('.schema-pill-item'));
  oldChildren.forEach(el => {
    const key = el.dataset.pillKey || (el.textContent || '').replace(/^[✓+]\s*/, '').trim();
    if (key) {
      firstRects.set(key, el.getBoundingClientRect());
    }
  });

  // 2. DOM update: Execute callback to reorder / re-render pills
  if (typeof renderCallback === 'function') {
    renderCallback();
  }

  // Restore scroll position immediately
  poolElement.scrollTop = savedScrollTop;

  // 3. LAST: Capture new bounding client rects
  const newChildren = Array.from(poolElement.querySelectorAll('.schema-pill-item'));
  const animatingPills = [];

  newChildren.forEach(el => {
    const key = el.dataset.pillKey || (el.textContent || '').replace(/^[✓+]\s*/, '').trim();
    if (!key) return;

    const firstRect = firstRects.get(key);
    if (firstRect) {
      const lastRect = el.getBoundingClientRect();
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        // 4. INVERT: Snap pill to its starting position instantly
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = 'none';
        el.style.zIndex = el.classList.contains('selected') ? '8' : '5';
        animatingPills.push(el);
      }
    } else {
      // New custom chip: scale in smoothly
      el.style.transform = 'scale(0.8)';
      el.style.opacity = '0';
      el.style.transition = 'none';
      animatingPills.push(el);
    }
  });

  if (animatingPills.length === 0) return;

  // Force synchronous layout reflow so the browser registers inverted positions
  void poolElement.offsetHeight;

  // 5. PLAY: Animate smoothly to resting position (0, 0)
  requestAnimationFrame(() => {
    animatingPills.forEach(el => {
      el.style.transition = 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 240ms ease, background-color 240ms ease, border-color 240ms ease, box-shadow 240ms ease';
      el.style.transform = 'translate(0, 0) scale(1)';
      el.style.opacity = '1';
    });

    // Cleanup inline transition and transform styles after animation finishes
    setTimeout(() => {
      animatingPills.forEach(el => {
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
        el.style.zIndex = '';
      });
    }, 420);
  });
}

function filterSkillsSchema(q) {
  signupState.skillsSearchQuery = q;
  updateSkillsDOM();
}

function toggleSkillSelection(skill) {
  if (!signupState.skills) signupState.skills = [];
  const idx = signupState.skills.indexOf(skill);
  if (idx >= 0) {
    signupState.skills.splice(idx, 1);
  } else {
    // Stack logic: latest selected goes to the top of the stack
    signupState.skills.unshift(skill);
  }
  updateSkillsDOM();
  saveSignupProgress();
}

function addCustomSkill(skill) {
  if (!skill) return;
  const trimmed = skill.trim();
  if (trimmed) {
    if (!signupState.customSkillsPool) signupState.customSkillsPool = [];
    if (!signupState.customSkillsPool.includes(trimmed)) signupState.customSkillsPool.push(trimmed);
    if (!signupState.skills) signupState.skills = [];
    const idx = signupState.skills.indexOf(trimmed);
    if (idx >= 0) signupState.skills.splice(idx, 1);
    signupState.skills.unshift(trimmed);
    signupState.skillsSearchQuery = '';
    const input = document.getElementById('skills-search');
    if (input) input.value = '';
    showToast(`Added "${trimmed}" to skills`, 'success');
    updateSkillsDOM();
    saveSignupProgress();
  }
}

function removeSkill(skill) {
  toggleSkillSelection(skill);
}

function updateSkillsDOM() {
  const q = (signupState.skillsSearchQuery || '').toLowerCase().trim();
  const allPool = Array.from(new Set([...(signupState.customSkillsPool || []), ...HOTEL_SKILLS_SCHEMA]));
  const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);

  const customAdd = document.getElementById('skills-custom-add-container');
  if (customAdd) {
    if (q && !hasExactMatch) {
      customAdd.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomSkill('${signupState.skillsSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${signupState.skillsSearchQuery}" to skills
        </div>
      `;
    } else {
      customAdd.innerHTML = '';
    }
  }

  const pillsPool = document.getElementById('skills-pills-pool');
  if (pillsPool) {
    const selectedStack = (signupState.skills || []).filter(s => !q || s.toLowerCase().includes(q));
    const unselectedPool = allPool.filter(s => !(signupState.skills || []).includes(s)).filter(s => !q || s.toLowerCase().includes(q));

    animateSchemaPillsPool(pillsPool, () => {
      pillsPool.innerHTML = [
        ...selectedStack.map(s => `
          <span class="schema-pill-item selected" data-pill-key="${s}" onclick="toggleSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
            ✓ ${s}
          </span>
        `),
        ...unselectedPool.map(s => `
          <span class="schema-pill-item" data-pill-key="${s}" onclick="toggleSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to select">
            + ${s}
          </span>
        `)
      ].join('');
    });
  }
}

function updateLanguagesDOM() {
  const q = (signupState.languagesSearchQuery || '').toLowerCase().trim();
  const presetList = [...HOTEL_LANGUAGES_PRESETS];
  (signupState.customLanguagesPool || []).forEach(name => {
    if (!presetList.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      presetList.push({ name, level: 'Fluent' });
    }
  });

  const allNames = Array.from(new Set([...(signupState.customLanguagesPool || []), ...presetList.map(l => l.name)]));
  const hasExactMatch = q && allNames.some(l => l.toLowerCase() === q);

  const customAdd = document.getElementById('languages-custom-add-container');
  if (customAdd) {
    if (q && !hasExactMatch) {
      customAdd.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomLanguage('${signupState.languagesSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${signupState.languagesSearchQuery}" (Fluent) to languages
        </div>
      `;
    } else {
      customAdd.innerHTML = '';
    }
  }

  const pillsPool = document.getElementById('languages-pills-pool');
  if (pillsPool) {
    const selectedStack = (signupState.languages || []).filter(l => !q || l.name.toLowerCase().includes(q));
    const unselectedPool = presetList.filter(l => !(signupState.languages || []).some(sel => sel.name === l.name && sel.level === l.level)).filter(l => !q || l.name.toLowerCase().includes(q));

    animateSchemaPillsPool(pillsPool, () => {
      pillsPool.innerHTML = [
        ...selectedStack.map(l => `
          <span class="schema-pill-item selected" data-pill-key="${l.name} (${l.level})" onclick="toggleLanguage('${l.name.replace(/'/g, "\\'")}', '${l.level}')" title="Click to unselect">
            ✓ ${l.name} (${l.level})
          </span>
        `),
        ...unselectedPool.map(l => `
          <span class="schema-pill-item" data-pill-key="${l.name} (${l.level})" onclick="toggleLanguage('${l.name.replace(/'/g, "\\'")}', '${l.level}')" title="Click to select">
            + ${l.name} (${l.level})
          </span>
        `)
      ].join('');
    });
  }
}

function filterLanguagesSchema(q) {
  signupState.languagesSearchQuery = q;
  updateLanguagesDOM();
}

function toggleLanguage(name, level) {
  if (!signupState.languages) signupState.languages = [];
  const existingIdx = signupState.languages.findIndex(l => l.name === name && l.level === level);
  if (existingIdx >= 0) {
    signupState.languages.splice(existingIdx, 1);
  } else {
    // If language already selected with different level, remove it first
    const sameNameIdx = signupState.languages.findIndex(l => l.name === name);
    if (sameNameIdx >= 0) {
      signupState.languages.splice(sameNameIdx, 1);
    }
    // Stack logic: latest selected goes to the top of the stack
    signupState.languages.unshift({ name, level });
  }
  updateLanguagesDOM();
  saveSignupProgress();
}

function addCustomLanguage(lang) {
  if (!lang) return;
  const trimmed = lang.trim();
  if (trimmed) {
    if (!signupState.customLanguagesPool) signupState.customLanguagesPool = [];
    if (!signupState.customLanguagesPool.includes(trimmed)) {
      signupState.customLanguagesPool.push(trimmed);
    }
    if (!signupState.languages) signupState.languages = [];
    const sameNameIdx = signupState.languages.findIndex(l => l.name.toLowerCase() === trimmed.toLowerCase());
    if (sameNameIdx >= 0) {
      signupState.languages.splice(sameNameIdx, 1);
    }
    signupState.languages.unshift({ name: trimmed, level: 'Fluent' });
    signupState.languagesSearchQuery = '';
    const input = document.getElementById('languages-search');
    if (input) input.value = '';
    showToast(`Added "${trimmed}" (Fluent) to languages`, 'success');
    updateLanguagesDOM();
    saveSignupProgress();
  }
}

function removeLanguage(name) {
  if (!signupState.languages) return;
  const existingIdx = signupState.languages.findIndex(l => l.name === name);
  if (existingIdx >= 0) {
    signupState.languages.splice(existingIdx, 1);
    updateLanguagesDOM();
    saveSignupProgress();
  }
}

// -------------------------------------------------------------
// Image Helpers (Compression & PFP Drag & Zoom Cropper)
// -------------------------------------------------------------

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImageFile(file, maxDimension = 1600, quality = 0.92) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const editPfpState = {
  candidate: { raw: null, pfp: null, crop: null },
  bizUser: { raw: null, pfp: null, crop: null },
  bizLogo: { raw: null, pfp: null, crop: null }
};

let pfpCropState = {
  imgSrc: '',
  target: 'candidate', // 'candidate' | 'biz_rep' | 'biz_join' | 'edit_candidate' | 'edit_biz_user' | 'edit_biz_logo'
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  baseW: 240,
  baseH: 240,
  isDragging: false,
  startX: 0,
  startY: 0
};

function closeCropModal() {
  window.removeEventListener('pointermove', onPfpPointerMove);
  window.removeEventListener('pointerup', onPfpPointerUp);
  const el = document.getElementById('modal-pfp-crop');
  if (el) el.remove();
}

function openPfpSettingModal(imageSrc, target = 'candidate') {
  pfpCropState.imgSrc = imageSrc;
  pfpCropState.target = target;
  pfpCropState.isDragging = false;

  let prevCrop = null;
  if (target === 'biz_rep') prevCrop = signupState.rep_pfp_crop;
  else if (target === 'biz_join') prevCrop = signupState.join_pfp_crop;
  else if (target === 'candidate') prevCrop = signupState.pfp_crop;
  else if (target === 'edit_candidate') prevCrop = editPfpState.candidate.crop;
  else if (target === 'edit_biz_user') prevCrop = editPfpState.bizUser.crop;
  else if (target === 'edit_biz_logo') prevCrop = editPfpState.bizLogo.crop;

  if (prevCrop && prevCrop.imgSrc === imageSrc) {
    pfpCropState.scale = prevCrop.scale || 1;
    pfpCropState.offsetX = prevCrop.offsetX || 0;
    pfpCropState.offsetY = prevCrop.offsetY || 0;
  } else {
    pfpCropState.scale = 1;
    pfpCropState.offsetX = 0;
    pfpCropState.offsetY = 0;
  }

  let modalTitle = 'Position Profile Photo';
  if (target === 'biz_rep') modalTitle = 'Position Representative Photo';
  else if (target === 'biz_join') modalTitle = 'Position Team Member Photo';
  else if (target === 'edit_biz_user') modalTitle = 'Position Representative Photo';
  else if (target === 'edit_biz_logo') modalTitle = 'Position Hotel Logo';

  const modalSub = target === 'edit_biz_logo'
    ? 'Drag to position logo and use the slider to zoom'
    : 'Drag to frame face and use the slider to zoom';

  const container = document.getElementById('modal-container');
  const existingCrop = document.getElementById('modal-pfp-crop');
  if (existingCrop) existingCrop.remove();

  const isSquareViewport = (target === 'edit_biz_logo');

  const cropModalHtml = `
    <div class="modal-backdrop open" id="modal-pfp-crop" onclick="closeCropModal()" style="z-index: 10500;">
      <div class="modal-dialog" style="max-width: 480px; text-align: center;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">${modalTitle}</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${modalSub}</div>
          </div>
          <button class="modal-close" onclick="closeCropModal()" aria-label="Close">${svgIcon('x', '', 18)}</button>
        </div>

        <div class="modal-body" style="padding: 24px 20px;">
          <div id="pfp-crop-viewport" style="${isSquareViewport ? 'border-radius: 20px;' : 'border-radius: 50%;'}" onpointerdown="startPfpDrag(event)" onwheel="handlePfpWheel(event)">
            <img id="pfp-crop-img" src="${imageSrc}" alt="Crop preview" draggable="false">
          </div>

          <div style="margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 12px;">
            <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600;">Zoom:</span>
            <input type="range" id="pfp-crop-zoom" min="0.5" max="4" step="0.02" value="${pfpCropState.scale}" oninput="handlePfpZoomChange(this.value)" style="width: 200px; accent-color: var(--orange-primary);">
            <span id="pfp-crop-zoom-label" style="font-size: 0.8rem; color: var(--text-dim); min-width: 44px; text-align: left;">${Math.round(pfpCropState.scale * 100)}%</span>
            <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 0.75rem;" onclick="resetPfpCropPosition()">Reset</button>
          </div>
        </div>

        <div class="modal-footer" style="justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn-secondary" onclick="closeCropModal()">Cancel</button>
          <button type="button" class="btn-orange" onclick="applyPfpCroppedImage()">Apply &amp; Set Photo ✓</button>
        </div>
      </div>
    </div>
  `;

  if (target.startsWith('edit_')) {
    container.insertAdjacentHTML('beforeend', cropModalHtml);
  } else {
    container.innerHTML = cropModalHtml;
  }

  const imgElement = document.getElementById('pfp-crop-img');
  function setupCropImage() {
    const nw = imgElement.naturalWidth || 240;
    const nh = imgElement.naturalHeight || 240;
    const aspect = nw / nh;
    const vpSize = 240;
    let baseW = vpSize;
    let baseH = vpSize;
    if (aspect >= 1) {
      baseW = vpSize;
      baseH = vpSize / aspect;
    } else {
      baseH = vpSize;
      baseW = vpSize * aspect;
    }
    pfpCropState.baseW = baseW;
    pfpCropState.baseH = baseH;
    imgElement.style.width = `${baseW}px`;
    imgElement.style.height = `${baseH}px`;
    imgElement.style.maxWidth = 'none';
    imgElement.style.maxHeight = 'none';
    updatePfpCropTransform();
  }

  if (imgElement.complete && imgElement.naturalWidth > 0) {
    setupCropImage();
  } else {
    imgElement.onload = setupCropImage;
  }

  window.removeEventListener('pointermove', onPfpPointerMove);
  window.removeEventListener('pointerup', onPfpPointerUp);
  window.addEventListener('pointermove', onPfpPointerMove);
  window.addEventListener('pointerup', onPfpPointerUp);
}

function startPfpDrag(e) {
  e.preventDefault();
  pfpCropState.isDragging = true;
  pfpCropState.startX = e.clientX - pfpCropState.offsetX;
  pfpCropState.startY = e.clientY - pfpCropState.offsetY;
}

function onPfpPointerMove(e) {
  if (!pfpCropState.isDragging) return;
  pfpCropState.offsetX = e.clientX - pfpCropState.startX;
  pfpCropState.offsetY = e.clientY - pfpCropState.startY;
  updatePfpCropTransform();
}

function onPfpPointerUp() {
  pfpCropState.isDragging = false;
}

function handlePfpZoomChange(val) {
  pfpCropState.scale = parseFloat(val);
  const label = document.getElementById('pfp-crop-zoom-label');
  if (label) label.textContent = `${Math.round(pfpCropState.scale * 100)}%`;
  updatePfpCropTransform();
}

function handlePfpWheel(e) {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.05 : -0.05;
  const newScale = Math.min(4, Math.max(0.5, pfpCropState.scale + delta));
  pfpCropState.scale = parseFloat(newScale.toFixed(2));
  const slider = document.getElementById('pfp-crop-zoom');
  if (slider) slider.value = pfpCropState.scale;
  const label = document.getElementById('pfp-crop-zoom-label');
  if (label) label.textContent = `${Math.round(pfpCropState.scale * 100)}%`;
  updatePfpCropTransform();
}

function resetPfpCropPosition() {
  pfpCropState.scale = 1;
  pfpCropState.offsetX = 0;
  pfpCropState.offsetY = 0;
  const slider = document.getElementById('pfp-crop-zoom');
  if (slider) slider.value = 1;
  const label = document.getElementById('pfp-crop-zoom-label');
  if (label) label.textContent = '100%';
  updatePfpCropTransform();
}

function updatePfpCropTransform() {
  const img = document.getElementById('pfp-crop-img');
  if (!img) return;
  img.style.transform = `translate(-50%, -50%) translate(${pfpCropState.offsetX}px, ${pfpCropState.offsetY}px) scale(${pfpCropState.scale})`;
}

function applyPfpCroppedImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  if (!pfpCropState.imgSrc.startsWith('data:')) {
    img.crossOrigin = 'anonymous';
  }
  img.onload = () => {
    // Fill canvas background to match circular viewport dark tone
    ctx.fillStyle = '#070d1e';
    ctx.fillRect(0, 0, 320, 320);

    const vpSize = 240;
    const factor = 320 / vpSize;
    ctx.save();
    ctx.translate(160 + pfpCropState.offsetX * factor, 160 + pfpCropState.offsetY * factor);
    ctx.scale(pfpCropState.scale * factor, pfpCropState.scale * factor);

    const nw = img.naturalWidth || img.width || 240;
    const nh = img.naturalHeight || img.height || 240;
    const aspect = nw / nh;
    let baseW = vpSize;
    let baseH = vpSize;
    if (aspect >= 1) {
      baseW = vpSize;
      baseH = vpSize / aspect;
    } else {
      baseH = vpSize;
      baseW = vpSize * aspect;
    }

    ctx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);
    ctx.restore();

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const cropMeta = {
      imgSrc: pfpCropState.imgSrc,
      scale: pfpCropState.scale,
      offsetX: pfpCropState.offsetX,
      offsetY: pfpCropState.offsetY
    };

    if (pfpCropState.target === 'biz_rep') {
      signupState.rep_pfp = croppedDataUrl;
      signupState.rep_pfp_crop = cropMeta;
      const previewImg = document.getElementById('biz-rep-pfp-img');
      if (previewImg) previewImg.src = croppedDataUrl;
    } else if (pfpCropState.target === 'biz_join') {
      signupState.join_pfp = croppedDataUrl;
      signupState.join_pfp_crop = cropMeta;
      const previewImg = document.getElementById('biz-join-pfp-img');
      if (previewImg) previewImg.src = croppedDataUrl;
    } else if (pfpCropState.target === 'candidate') {
      signupState.pfp = croppedDataUrl;
      signupState.pfp_crop = cropMeta;
      const previewImg = document.getElementById('cand-pfp-part2-img');
      if (previewImg) previewImg.src = croppedDataUrl;
    } else if (pfpCropState.target === 'edit_candidate') {
      editPfpState.candidate.pfp = croppedDataUrl;
      editPfpState.candidate.crop = cropMeta;
      const previewImg = document.getElementById('edit-cand-pfp-img');
      if (previewImg) previewImg.src = croppedDataUrl;
      const urlInput = document.getElementById('edit-profile-avatar-url');
      if (urlInput) urlInput.value = croppedDataUrl;
      const adjustBtn = document.getElementById('btn-adjust-cand-pfp');
      if (adjustBtn) adjustBtn.style.display = 'inline-flex';
      const removeBtn = document.getElementById('btn-remove-cand-pfp');
      if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else if (pfpCropState.target === 'edit_biz_user') {
      editPfpState.bizUser.pfp = croppedDataUrl;
      editPfpState.bizUser.crop = cropMeta;
      const previewImg = document.getElementById('edit-biz-user-pfp-img');
      if (previewImg) previewImg.src = croppedDataUrl;
      const urlInput = document.getElementById('edit-biz-user-avatar-url');
      if (urlInput) urlInput.value = croppedDataUrl;
      const adjustBtn = document.getElementById('btn-adjust-biz-user-pfp');
      if (adjustBtn) adjustBtn.style.display = 'inline-flex';
      const removeBtn = document.getElementById('btn-remove-biz-user-pfp');
      if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else if (pfpCropState.target === 'edit_biz_logo') {
      editPfpState.bizLogo.pfp = croppedDataUrl;
      editPfpState.bizLogo.crop = cropMeta;
      const previewImg = document.getElementById('edit-biz-logo-img');
      if (previewImg) previewImg.src = croppedDataUrl;
      const urlInput = document.getElementById('edit-biz-logo-url');
      if (urlInput) urlInput.value = croppedDataUrl;
      const adjustBtn = document.getElementById('btn-adjust-biz-logo');
      if (adjustBtn) adjustBtn.style.display = 'inline-flex';
      const removeBtn = document.getElementById('btn-remove-biz-logo');
      if (removeBtn) removeBtn.style.display = 'inline-flex';
    }

    closeCropModal();
    showToast(pfpCropState.target === 'edit_biz_logo' ? 'Hotel logo adjusted and set!' : 'Profile photo adjusted and set!', 'success');

    if (pfpCropState.target === 'candidate' || pfpCropState.target === 'biz_rep' || pfpCropState.target === 'biz_join') {
      saveSignupProgress();
      renderSignupPage(document.getElementById('app-viewport'));
    }
  };
  img.src = pfpCropState.imgSrc;
}

function openEditPfpModal(target = 'edit_candidate') {
  let src = null;
  if (target === 'edit_biz_user') {
    src = editPfpState.bizUser.raw || editPfpState.bizUser.pfp || document.getElementById('edit-biz-user-avatar-url')?.value;
  } else if (target === 'edit_biz_logo') {
    src = editPfpState.bizLogo.raw || editPfpState.bizLogo.pfp || document.getElementById('edit-biz-logo-url')?.value;
  } else {
    src = editPfpState.candidate.raw || editPfpState.candidate.pfp || document.getElementById('edit-profile-avatar-url')?.value;
  }
  if (!src) {
    showToast('No picture uploaded yet. Please upload a photo first.', 'warning');
    return;
  }
  openPfpSettingModal(src, target);
}

function removeEditPfp(target = 'edit_candidate') {
  if (target === 'edit_biz_user') {
    editPfpState.bizUser.raw = null;
    editPfpState.bizUser.crop = null;
    editPfpState.bizUser.pfp = '';
    const previewImg = document.getElementById('edit-biz-user-pfp-img');
    if (previewImg) previewImg.src = DEFAULT_AVATAR_PREVIEW;
    const urlInput = document.getElementById('edit-biz-user-avatar-url');
    if (urlInput) urlInput.value = '';
    const adjustBtn = document.getElementById('btn-adjust-biz-user-pfp');
    if (adjustBtn) adjustBtn.style.display = 'none';
    const removeBtn = document.getElementById('btn-remove-biz-user-pfp');
    if (removeBtn) removeBtn.style.display = 'none';
    showToast('Representative photo removed');
  } else if (target === 'edit_biz_logo') {
    editPfpState.bizLogo.raw = null;
    editPfpState.bizLogo.crop = null;
    editPfpState.bizLogo.pfp = '';
    const previewImg = document.getElementById('edit-biz-logo-img');
    if (previewImg) previewImg.src = DEFAULT_HOTEL_LOGO;
    const urlInput = document.getElementById('edit-biz-logo-url');
    if (urlInput) urlInput.value = '';
    const adjustBtn = document.getElementById('btn-adjust-biz-logo');
    if (adjustBtn) adjustBtn.style.display = 'none';
    const removeBtn = document.getElementById('btn-remove-biz-logo');
    if (removeBtn) removeBtn.style.display = 'none';
    showToast('Hotel logo removed');
  } else {
    editPfpState.candidate.raw = null;
    editPfpState.candidate.crop = null;
    editPfpState.candidate.pfp = '';
    const previewImg = document.getElementById('edit-cand-pfp-img');
    if (previewImg) previewImg.src = DEFAULT_AVATAR_PREVIEW;
    const urlInput = document.getElementById('edit-profile-avatar-url');
    if (urlInput) urlInput.value = '';
    const adjustBtn = document.getElementById('btn-adjust-cand-pfp');
    if (adjustBtn) adjustBtn.style.display = 'none';
    const removeBtn = document.getElementById('btn-remove-cand-pfp');
    if (removeBtn) removeBtn.style.display = 'none';
    showToast('Profile photo removed');
  }
}

async function handleEditPfpFileSelected(event, target = 'edit_candidate') {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file (JPG, PNG, or WebP)', 'danger');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image file size must be under 5MB', 'danger');
    return;
  }

  let dataUrl;
  if (file.size >= 1024 * 1024) {
    dataUrl = await compressImageFile(file, 1600, 0.92);
  } else {
    dataUrl = await readFileAsDataURL(file);
  }

  if (target === 'edit_biz_user') {
    editPfpState.bizUser.raw = dataUrl;
    editPfpState.bizUser.crop = null;
    editPfpState.bizUser.pfp = dataUrl;
    const previewImg = document.getElementById('edit-biz-user-pfp-img');
    if (previewImg) previewImg.src = dataUrl;
    const urlInput = document.getElementById('edit-biz-user-avatar-url');
    if (urlInput) urlInput.value = dataUrl;
    const adjustBtn = document.getElementById('btn-adjust-biz-user-pfp');
    if (adjustBtn) adjustBtn.style.display = 'inline-flex';
    const removeBtn = document.getElementById('btn-remove-biz-user-pfp');
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else if (target === 'edit_biz_logo') {
    editPfpState.bizLogo.raw = dataUrl;
    editPfpState.bizLogo.crop = null;
    editPfpState.bizLogo.pfp = dataUrl;
    const previewImg = document.getElementById('edit-biz-logo-img');
    if (previewImg) previewImg.src = dataUrl;
    const urlInput = document.getElementById('edit-biz-logo-url');
    if (urlInput) urlInput.value = dataUrl;
    const adjustBtn = document.getElementById('btn-adjust-biz-logo');
    if (adjustBtn) adjustBtn.style.display = 'inline-flex';
    const removeBtn = document.getElementById('btn-remove-biz-logo');
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    editPfpState.candidate.raw = dataUrl;
    editPfpState.candidate.crop = null;
    editPfpState.candidate.pfp = dataUrl;
    const previewImg = document.getElementById('edit-cand-pfp-img');
    if (previewImg) previewImg.src = dataUrl;
    const urlInput = document.getElementById('edit-profile-avatar-url');
    if (urlInput) urlInput.value = dataUrl;
    const adjustBtn = document.getElementById('btn-adjust-cand-pfp');
    if (adjustBtn) adjustBtn.style.display = 'inline-flex';
    const removeBtn = document.getElementById('btn-remove-cand-pfp');
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  }

  showToast(`Image loaded: ${file.name}. Adjust zoom and position now.`, 'success');
  openPfpSettingModal(dataUrl, target);
}

function removeCandidatePfp() {
  signupState.raw_pfp = null;
  signupState.pfp_crop = null;
  signupState.pfp = DEFAULT_AVATAR_PREVIEW;
  saveSignupProgress();
  showToast('Profile photo reset to default.');
  renderSignupPage(document.getElementById('app-viewport'));
}

function removeBizRepPfp() {
  signupState.raw_rep_pfp = null;
  signupState.rep_pfp_crop = null;
  signupState.rep_pfp = DEFAULT_AVATAR_PREVIEW;
  saveSignupProgress();
  showToast('Representative photo reset to default.');
  renderSignupPage(document.getElementById('app-viewport'));
}

function removeBizJoinPfp() {
  signupState.raw_join_pfp = null;
  signupState.join_pfp_crop = null;
  signupState.join_pfp = DEFAULT_AVATAR_PREVIEW;
  saveSignupProgress();
  showToast('Photo reset to default.');
  renderSignupPage(document.getElementById('app-viewport'));
}

async function handlePfpFileSelected(event, target = 'candidate') {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file (JPG, PNG, or WebP)', 'danger');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image file size must be under 5MB', 'danger');
    return;
  }

  let dataUrl;
  if (file.size >= 1024 * 1024) {
    dataUrl = await compressImageFile(file, 1600, 0.92);
  } else {
    dataUrl = await readFileAsDataURL(file);
  }

  // Immediately attach to signupState and DOM preview so the photo is guaranteed attached
  if (target === 'biz_rep') {
    signupState.raw_rep_pfp = dataUrl;
    signupState.rep_pfp_crop = null;
    signupState.rep_pfp = dataUrl;
    const previewImg = document.getElementById('biz-rep-pfp-img');
    if (previewImg) previewImg.src = dataUrl;
  } else if (target === 'biz_join') {
    signupState.raw_join_pfp = dataUrl;
    signupState.join_pfp_crop = null;
    signupState.join_pfp = dataUrl;
    const previewImg = document.getElementById('biz-join-pfp-img');
    if (previewImg) previewImg.src = dataUrl;
  } else {
    signupState.raw_pfp = dataUrl;
    signupState.pfp_crop = null;
    signupState.pfp = dataUrl;
    const previewImg = document.getElementById('cand-pfp-part2-img');
    if (previewImg) previewImg.src = dataUrl;
  }
  saveSignupProgress();
  showToast(`Profile photo attached: ${file.name}`, 'success');

  // Open adjustment modal to allow zoom and face framing
  openPfpSettingModal(dataUrl, target);
}

function handleCvFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  signupState.cv_name = file.name;
  saveSignupProgress();
  renderSignupPage(document.getElementById('app-viewport'));
  showToast(`CV attached: ${file.name}`, 'success');
}

// Features schema helpers
function updateFeaturesDOM() {
  const q = (signupState.featuresSearchQuery || '').toLowerCase().trim();
  const allPool = Array.from(new Set([...(signupState.customFeaturesPool || []), ...HOTEL_FEATURES_SCHEMA]));
  const hasExactMatch = q && allPool.some(f => f.toLowerCase() === q);

  const customAdd = document.getElementById('features-custom-add-container');
  if (customAdd) {
    if (q && !hasExactMatch) {
      customAdd.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomFeature('${signupState.featuresSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${signupState.featuresSearchQuery}" to features
        </div>
      `;
    } else {
      customAdd.innerHTML = '';
    }
  }

  const pillsPool = document.getElementById('features-pills-pool');
  if (pillsPool) {
    const selectedStack = (signupState.features || []).filter(f => !q || f.toLowerCase().includes(q));
    const unselectedPool = allPool.filter(f => !(signupState.features || []).includes(f)).filter(f => !q || f.toLowerCase().includes(q));

    animateSchemaPillsPool(pillsPool, () => {
      pillsPool.innerHTML = [
        ...selectedStack.map(f => `
          <span class="schema-pill-item selected" data-pill-key="${f}" onclick="toggleFeatureSelection('${f.replace(/'/g, "\\'")}')" title="Click to unselect">
            ✓ ${f}
          </span>
        `),
        ...unselectedPool.map(f => `
          <span class="schema-pill-item" data-pill-key="${f}" onclick="toggleFeatureSelection('${f.replace(/'/g, "\\'")}')" title="Click to select">
            + ${f}
          </span>
        `)
      ].join('');
    });
  }
}

function filterFeaturesSchema(q) {
  signupState.featuresSearchQuery = q;
  updateFeaturesDOM();
}

function toggleFeatureSelection(feat) {
  if (!signupState.features) signupState.features = [];
  const idx = signupState.features.indexOf(feat);
  if (idx >= 0) {
    signupState.features.splice(idx, 1);
  } else {
    // Stack logic: selected features go up to the top of the stack
    signupState.features.unshift(feat);
  }
  saveSignupProgress();
  updateFeaturesDOM();
}

function addCustomFeature(feat) {
  if (!feat) return;
  const trimmed = feat.trim();
  if (trimmed) {
    if (!signupState.customFeaturesPool) signupState.customFeaturesPool = [];
    if (!signupState.customFeaturesPool.includes(trimmed)) {
      signupState.customFeaturesPool.push(trimmed);
    }
    if (!signupState.features) signupState.features = [];
    const idx = signupState.features.indexOf(trimmed);
    if (idx >= 0) {
      signupState.features.splice(idx, 1);
    }
    // Stack logic: newly added feature goes to the top of the selected stack
    signupState.features.unshift(trimmed);
    signupState.featuresSearchQuery = '';
    const input = document.getElementById('features-search');
    if (input) input.value = '';
    saveSignupProgress();
    showToast(`Added "${trimmed}" to features`, 'success');
    updateFeaturesDOM();
  }
}

function removeFeature(feat) {
  toggleFeatureSelection(feat);
}

// Hotel & Resort Types schema helpers
function filterHotelTypes(q) {
  signupState.bizTypeSearchQuery = q;
  renderSignupPage(document.getElementById('app-viewport'));
  const input = document.getElementById('biz-type-search');
  if (input) {
    input.focus();
    input.setSelectionRange(q.length, q.length);
  }
}

function addCustomBizType(type) {
  const trimmed = type.trim();
  if (trimmed && !signupState.customBizTypesPool.includes(trimmed)) {
    signupState.customBizTypesPool.push(trimmed);
    signupState.property_type = trimmed;
    signupState.bizTypeSearchQuery = '';
    showToast(`Business type "${trimmed}" added!`, 'success');
    renderSignupPage(document.getElementById('app-viewport'));
  }
}

// -------------------------------------------------------------
// STAGE NAVIGATION FOR CANDIDATE
// -------------------------------------------------------------

async function nextSignupStage(targetStage) {
  const current = signupState.stage || 1;

  if (current === 1) {
    const firstName = (document.getElementById('cand-first-name')?.value || '').trim();
    const middleName = (document.getElementById('cand-middle-name')?.value || '').trim();
    const lastName = (document.getElementById('cand-last-name')?.value || '').trim();
    const nameBangla = (document.getElementById('cand-name-bangla')?.value || '').trim();
    const dob = document.getElementById('cand-dob')?.value || '';
    const nid = (document.getElementById('cand-nid')?.value || '').trim();
    const phoneRaw = document.getElementById('cand-phone')?.value || '';
    const phoneSecRaw = document.getElementById('cand-phone-secondary')?.value || '';
    const email = (document.getElementById('cand-email')?.value || '').trim();

    if (!firstName) {
      showToast('Please enter your First Name', 'danger');
      return;
    }
    if (!lastName) {
      showToast('Please enter your Last Name', 'danger');
      return;
    }
    if (!nameBangla) {
      showToast('Please enter your Full Name in Bangla (বাংলায় পূর্ণ নাম)', 'danger');
      return;
    }

    const cleanPhone = phoneRaw.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('01')) {
      showToast('Phone number must be exactly 11 digits starting with 01 (no more, no less)', 'danger');
      return;
    }
    const cleanPhoneSec = phoneSecRaw.replace(/[^0-9]/g, '');
    if (cleanPhoneSec && (cleanPhoneSec.length !== 11 || !cleanPhoneSec.startsWith('01'))) {
      showToast('Secondary phone number must be exactly 11 digits starting with 01 if provided', 'danger');
      return;
    }
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address', 'danger');
      return;
    }

    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    signupState.first_name = firstName;
    signupState.middle_name = middleName;
    signupState.last_name = lastName;
    signupState.name_bangla = nameBangla;
    signupState.name = fullName;
    signupState.dob = dob;
    signupState.nid_passport = nid;
    signupState.phone = cleanPhone;
    signupState.phone_secondary = cleanPhoneSec;
    signupState.email = email;
  }

  if (current === 2) {
    const bio = document.getElementById('cand-bio')?.value || '';
    signupState.bio = bio;

    // Collect job preferences
    const prefDept = document.getElementById('pref-dept')?.value || signupState.job_preferences?.department || 'Front Office';
    const prefRole = (document.getElementById('pref-role')?.value || '').trim() || signupState.job_preferences?.desired_role || 'Front Desk Associate';
    const prefShift = document.getElementById('pref-shift')?.value || signupState.job_preferences?.shift || 'Rotational';
    const prefSalary = (document.getElementById('pref-salary')?.value || '').trim() || signupState.job_preferences?.expected_salary || 'Negotiable';
    const prefLoc = (document.getElementById('pref-loc')?.value || '').trim() || signupState.job_preferences?.preferred_location || 'Dhaka';

    signupState.job_preferences = {
      department: prefDept,
      desired_role: prefRole,
      shift: prefShift,
      expected_salary: prefSalary,
      preferred_location: prefLoc
    };

    // Collect dynamic education rows
    const eduCards = document.querySelectorAll('#edu-dynamic-container .dynamic-entry-card');
    const updatedEdu = [];
    eduCards.forEach(card => {
      const inst = card.querySelector('.edu-inst')?.value || '';
      const deg = card.querySelector('.edu-deg')?.value || '';
      const gpa = card.querySelector('.edu-gpa')?.value || '';
      if (inst) updatedEdu.push({ institution: inst, degree: deg, gpa });
    });
    if (updatedEdu.length > 0) signupState.education = updatedEdu;

    // Collect dynamic experience rows
    const expCards = document.querySelectorAll('#exp-dynamic-container .dynamic-entry-card');
    const updatedExp = [];
    expCards.forEach(card => {
      const comp = card.querySelector('.exp-comp')?.value || '';
      const role = card.querySelector('.exp-role')?.value || '';
      const period = card.querySelector('.exp-period')?.value || '';
      const skills = card.querySelector('.exp-skills')?.value || '';
      if (comp) updatedExp.push({ company: comp, role, period, skills_acquired: skills });
    });
    if (updatedExp.length > 0) signupState.experience = updatedExp;
  }

  if (current === 3) {
    const pwd = document.getElementById('cand-pwd')?.value || '';
    const confirmPwd = document.getElementById('cand-confirm-pwd')?.value || '';

    if (!pwd || pwd.length < 6) {
      showToast('Password must be at least 6 characters.', 'danger');
      return;
    }
    if (pwd !== confirmPwd) {
      showToast('Passwords do not match. Please verify your password.', 'danger');
      return;
    }

    signupState.password = pwd;
    signupState.confirm_password = confirmPwd;

    // Send OTP when progressing to Part 4
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: signupState.phone,
          email: signupState.email,
          identifier: signupState.phone,
          purpose: 'candidate_signup'
        })
      });
      const data = await res.json();
      signupState.lastSentOtp = data.demo_otp || '258330';
      signupState.otp_code = signupState.lastSentOtp;
      showToast(`Verification code sent to +88 ${signupState.phone} and ${signupState.email} (Demo: ${signupState.lastSentOtp})`, 'success');
    } catch (err) {
      showToast('Error sending OTP: ' + err.message, 'danger');
    }
  }

  signupState.stage = targetStage;
  saveSignupProgress();
  renderSignupPage(document.getElementById('app-viewport'));
}

function prevSignupStage() {
  if (signupState.stage === 'terms') {
    signupState.stage = 4;
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
    return;
  }
  if (signupState.stage > 1) {
    signupState.stage -= 1;
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
  } else {
    startLoginFlow('candidate');
  }
}

function autoFillCandidateOtp() {
  const input = document.getElementById('cand-otp-code');
  if (input && signupState.lastSentOtp) {
    input.value = signupState.lastSentOtp;
    showToast('Auto-filled code: ' + signupState.lastSentOtp, 'info');
  }
}

async function resendCandidateOtp() {
  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: signupState.phone,
        email: signupState.email,
        identifier: signupState.phone,
        purpose: 'candidate_signup'
      })
    });
    const data = await res.json();
    signupState.lastSentOtp = data.demo_otp || '258330';
    const input = document.getElementById('cand-otp-code');
    if (input) input.value = signupState.lastSentOtp;
    showToast(`New verification code sent (Demo: ${signupState.lastSentOtp})`, 'success');
  } catch (err) {
    showToast('Failed to resend code: ' + err.message, 'danger');
  }
}

// Candidate OTP Verification -> Move to Terms
async function handleCandidateFinalSignup(event) {
  event.preventDefault();
  const input = document.getElementById('cand-otp-code');
  const code = (input ? input.value : signupState.lastSentOtp || '').trim();

  if (!code || code.length < 6) {
    showToast('Please enter the 6-digit OTP code.', 'danger');
    return;
  }

  // Verify OTP with the server before advancing to Terms
  const btn = event.target.querySelector('button[type="submit"]') || document.getElementById('btn-cand-otp-submit');
  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Verifying...`;
  }

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: signupState.phone,
        email: signupState.email,
        identifier: signupState.phone,
        otp_code: code,
        purpose: 'candidate_signup'
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || 'Invalid or expired OTP code. Please enter the valid code.', 'danger');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnText;
      }
      return;
    }
  } catch (err) {
    showToast('Verification failed: ' + err.message, 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
    return;
  }

  signupState.otp_code = code;
  signupState.stage = 'terms';
  saveSignupProgress();
  showToast('OTP verified successfully! Please review and accept Terms & Conditions.', 'info');
  renderSignupPage(document.getElementById('app-viewport'));
}

function declineCandidateTerms() {
  prevSignupStage();
}

async function acceptCandidateTerms() {
  signupState.terms_accepted = true;
  saveSignupProgress();
  await finalizeCandidateRegistration();
}

async function finalizeCandidateRegistration() {
  try {
    const payload = {
      name: signupState.name,
      first_name: signupState.first_name || '',
      middle_name: signupState.middle_name || '',
      last_name: signupState.last_name || '',
      name_bangla: signupState.name_bangla || '',
      email: signupState.email,
      phone: signupState.phone,
      phone_secondary: signupState.phone_secondary || null,
      password: signupState.password || '',
      otp_code: signupState.otp_code || signupState.lastSentOtp || '',
      dob: signupState.dob,
      nid_passport: signupState.nid_passport,
      avatar_url: signupState.pfp,
      bio: signupState.bio,
      cv_name: signupState.cv_name,
      education: signupState.education,
      skills: signupState.skills,
      languages: signupState.languages,
      experience: signupState.experience,
      job_preferences: signupState.job_preferences,
      current_position: signupState.job_preferences?.desired_role || signupState.experience[0]?.role || '',
      department: signupState.job_preferences?.department || ''
    };

    const res = await fetch('/api/auth/register-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Registration failed');

    state.currentUser = {
      id: data.user_id,
      name: data.name || payload.name,
      first_name: data.first_name || signupState.first_name || '',
      middle_name: data.middle_name || signupState.middle_name || '',
      last_name: data.last_name || signupState.last_name || '',
      name_bangla: data.name_bangla || signupState.name_bangla || '',
      email: payload.email,
      phone: payload.phone,
      role: 'jobseeker',
      title: `${payload.current_position} • ${payload.department}`,
      avatar: payload.avatar_url
    };
    state.currentRole = 'jobseeker';
    state.activeHotelId = null;

    try {
      const sessPayload = JSON.stringify({ user: state.currentUser, role: 'jobseeker' });
      sessionStorage.setItem('nicejobs_active_session', sessPayload);
      sessionStorage.setItem('nicejobs_candidate_session', sessPayload);
      localStorage.setItem('nicejobs_active_session', sessPayload);
      localStorage.setItem('nicejobs_candidate_session', sessPayload);
      sessionStorage.removeItem('nicejobs_signup_state');
    } catch (e) {}

    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-role-seeker')?.classList.add('active');
    updateRoleStatusText();
    updateNavigation();
    onAuthChange();
    showToast(data.message || 'Terms accepted! Logged in successfully.', 'success');
    await loadInitialData();
    navigateTo('profile');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// STAGE NAVIGATION FOR ROUTE A (NEW BUSINESS)
// -------------------------------------------------------------

async function nextBizStage(targetStep) {
  const current = signupState.biz_step || 1;

  if (current === 1) {
    const brand = (document.getElementById('biz-new-brand')?.value || '').trim();
    const legal = (document.getElementById('biz-new-legal')?.value || '').trim();
    const pType = document.getElementById('biz-new-type')?.value;
    const plot = document.getElementById('biz-new-plot')?.value || '';
    const road = document.getElementById('biz-new-road')?.value || '';
    const thana = document.getElementById('biz-new-thana')?.value || '';
    const district = document.getElementById('biz-new-district')?.value || 'Dhaka';
    const website = document.getElementById('biz-new-website')?.value || '';
    const email = (document.getElementById('biz-new-email')?.value || '').trim();
    const telephone = (document.getElementById('biz-new-telephone')?.value || '').trim();

    if (!brand) {
      showToast('Please enter the business brand name.', 'danger');
      return;
    }
    if (!email || !email.includes('@')) {
      showToast('Please enter the official business email.', 'danger');
      return;
    }

    // Check if official business email or telephone is already used by another account
    try {
      const chkRes = await fetch('/api/auth/check-business-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          official_email: email,
          official_telephone: telephone
        })
      });
      const chkData = await chkRes.json();
      if (!chkData.available) {
        showToast(chkData.message, 'danger');
        if (chkData.field === 'official_email') {
          document.getElementById('biz-new-email')?.focus();
        } else if (chkData.field === 'official_telephone') {
          document.getElementById('biz-new-telephone')?.focus();
        }
        return;
      }
    } catch (e) {
      console.warn('Availability check error:', e);
    }

    signupState.brand_name = brand;
    signupState.legal_name = legal || (brand + ' Ltd.');
    signupState.property_type = pType;
    signupState.plot_number = plot;
    signupState.road_number = road;
    signupState.thana_upazila = thana;
    signupState.district = district;
    signupState.website = website;
    signupState.official_email = email;
    signupState.official_telephone = telephone;
    saveSignupProgress();
  }

  if (current === 3) {
    const name = (document.getElementById('biz-rep-name')?.value || '').trim();
    const phoneRaw = document.getElementById('biz-rep-phone')?.value || '';
    const email = (document.getElementById('biz-rep-email')?.value || '').trim();
    const dob = document.getElementById('biz-rep-dob')?.value || '';
    const desig = (document.getElementById('biz-rep-desig')?.value || '').trim();

    if (!name) {
      showToast('Please enter representative name.', 'danger');
      return;
    }
    const cleanPhone = phoneRaw.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('01')) {
      showToast('Representative cell must be strictly 11 digits starting with 01.', 'danger');
      return;
    }
    if (!email || !email.includes('@')) {
      showToast('Please enter the email of the person on behalf of the business.', 'danger');
      return;
    }

    // Check if an account is already open with the email on behalf of business
    try {
      const chkRes = await fetch('/api/auth/check-business-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          representative_email: email
        })
      });
      const chkData = await chkRes.json();
      if (!chkData.available) {
        showToast(chkData.message, 'danger');
        document.getElementById('biz-rep-email')?.focus();
        return;
      }
    } catch (e) {
      console.warn('Representative email check error:', e);
    }

    signupState.rep_name = name;
    signupState.rep_cell = cleanPhone;
    signupState.rep_email = email;
    signupState.rep_dob = dob;
    signupState.rep_designation = desig;
    saveSignupProgress();
  }

  if (current === 4) {
    const pwd = document.getElementById('biz-pwd-part4')?.value || '';
    const confirmPwd = document.getElementById('biz-confirm-pwd-part4')?.value || '';

    if (!pwd || pwd.length < 6) {
      showToast('Password must be at least 6 characters.', 'danger');
      return;
    }
    if (pwd !== confirmPwd) {
      showToast('Passwords do not match.', 'danger');
      return;
    }

    signupState.biz_password = pwd;
    signupState.biz_confirm_password = confirmPwd;
  }

  if (targetStep === 5) {
    // Dispatch OTP for business
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: signupState.rep_cell,
          email: signupState.official_email,
          identifier: signupState.rep_cell,
          purpose: 'business_signup'
        })
      });
      const data = await res.json();
      signupState.biz_lastSentOtp = data.demo_otp || '258330';
      signupState.biz_otp_code = signupState.biz_lastSentOtp;
      showToast(`Verification OTP sent to +88 ${signupState.rep_cell} (Demo: ${signupState.biz_lastSentOtp})`, 'success');
    } catch (err) {
      showToast('Error dispatching OTP: ' + err.message, 'danger');
    }
  }

  signupState.biz_step = targetStep;
  saveSignupProgress();
  renderSignupPage(document.getElementById('app-viewport'));
}

function prevBizStage() {
  if (signupState.biz_step === 'terms') {
    signupState.biz_step = 5;
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
    return;
  }
  if (signupState.biz_step === 'terms_join') {
    return prevJoinStage();
  }
  if (signupState.biz_step > 1) {
    signupState.biz_step -= 1;
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
  } else {
    signupState.biz_route = 'choose';
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
  }
}

function autoFillBizNewOtp() {
  const input = document.getElementById('biz-new-otp');
  if (input && signupState.biz_lastSentOtp) {
    input.value = signupState.biz_lastSentOtp;
    showToast('Auto-filled code: ' + signupState.biz_lastSentOtp, 'info');
  }
}

// Route A OTP Verification -> Move to Hotel Terms & Conditions
async function handleNewBusinessOtpSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('biz-new-otp');
  const code = (input ? input.value : signupState.biz_lastSentOtp || '').trim();

  if (!code || code.length < 6) {
    showToast('Please enter the 6-digit OTP code.', 'danger');
    return;
  }

  // Verify OTP with the server before advancing to Terms
  const btn = event.target.querySelector('button[type="submit"]') || document.getElementById('btn-biz-otp-submit');
  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Verifying...`;
  }

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: signupState.rep_cell,
        email: signupState.rep_email,
        identifier: signupState.rep_cell,
        otp_code: code,
        purpose: 'business_signup'
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || 'Invalid or expired OTP code. Please enter the valid code.', 'danger');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnText;
      }
      return;
    }
  } catch (err) {
    showToast('Verification failed: ' + err.message, 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
    return;
  }

  signupState.biz_otp_code = code;
  signupState.biz_step = 'terms';
  saveSignupProgress();
  renderSignupPage(document.getElementById('app-viewport'));
  showToast('OTP verified successfully! Please review and accept Hotel Partner Terms & Conditions.', 'info');
}

const handleNewBusinessFinalSignup = handleNewBusinessOtpSubmit;

function declineHotelTerms() {
  prevBizStage();
}

async function acceptHotelTerms() {
  signupState.hotel_terms_accepted = true;
  await finalizeNewBusinessRegistration();
}

async function finalizeNewBusinessRegistration() {
  try {
    const payload = {
      brand_name: signupState.brand_name,
      legal_name: signupState.legal_name,
      property_type: signupState.property_type,
      plot_number: signupState.plot_number,
      road_number: signupState.road_number,
      thana_upazila: signupState.thana_upazila,
      district: signupState.district,
      website: signupState.website,
      email: signupState.official_email,
      official_telephone: signupState.official_telephone || '',
      telephone: signupState.official_telephone || '',
      features: signupState.features,
      logo_url: signupState.logo_url || DEFAULT_HOTEL_LOGO,
      representative_name: signupState.rep_name,
      phone: signupState.rep_cell,
      representative_email: signupState.rep_email,
      dob: signupState.rep_dob,
      avatar_url: signupState.rep_pfp,
      designation: signupState.rep_designation,
      password: signupState.biz_password,
      role_choice: signupState.biz_role_choice,
      otp_code: signupState.biz_otp_code
    };

    const res = await fetch('/api/auth/register-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Business registration failed');

    // Business accounts must be verified by admin before login or viewing workspace
    state.currentUser = null;
    state.currentRole = 'guest';
    state.activeHotelId = null;

    try {
      sessionStorage.removeItem('nicejobs_active_session');
      sessionStorage.removeItem('nicejobs_employer_session');
      sessionStorage.removeItem('nicejobs_signup_state');
    } catch (e) {}

    updateRoleStatusText();
    updateNavigation();

    // Show Verification Screen (Step 6)
    signupState.biz_step = 6;
    renderSignupPage(document.getElementById('app-viewport'));
    showToast('Establishment registered! Awaiting platform admin verification.', 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// STAGE NAVIGATION FOR ROUTE B (ADD NEW USER TO EXISTING BUSINESS)
// -------------------------------------------------------------

async function handleJoinBusinessCheck(event) {
  event.preventDefault();
  const bEmail = (document.getElementById('biz-join-email')?.value || '').trim().toLowerCase();
  if (!bEmail || !bEmail.includes('@')) {
    showToast('Please enter the official business email address.', 'danger');
    return;
  }

  signupState.join_business_email = bEmail;
  signupState.join_not_found = false;

  try {
    const res = await fetch('/api/auth/check-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: bEmail })
    });
    const data = await res.json();

    if (!data.exists) {
      signupState.join_not_found = true;
      renderSignupPage(document.getElementById('app-viewport'));
      return;
    }

    signupState.join_matched_business = data.business;
    signupState.biz_step = 2; // Proceed to credentials
    showToast(`Matched hotel: ${data.business.brand_name}`, 'success');
    renderSignupPage(document.getElementById('app-viewport'));
  } catch (err) {
    showToast('Directory check failed: ' + err.message, 'danger');
  }
}

async function nextJoinStage(targetStep) {
  const current = signupState.biz_step;

  if (current === 2) {
    const userEmail = (document.getElementById('join-rep-email')?.value || '').trim().toLowerCase();
    const pwd = document.getElementById('join-rep-pwd')?.value || '';
    if (!userEmail || !userEmail.includes('@')) {
      showToast('Please enter your work email.', 'danger');
      return;
    }
    if (!pwd || pwd.length < 6) {
      showToast('Password must be at least 6 characters.', 'danger');
      return;
    }

    // Check if an account is already open with the email on behalf of business
    try {
      const chkRes = await fetch('/api/auth/check-business-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          representative_email: userEmail
        })
      });
      const chkData = await chkRes.json();
      if (!chkData.available) {
        showToast(chkData.message, 'danger');
        document.getElementById('join-rep-email')?.focus();
        return;
      }
    } catch (e) {
      console.warn('Representative email check error:', e);
    }

    signupState.join_user_email = userEmail;
    signupState.join_user_password = pwd;
  }

  if (current === 3) {
    const name = (document.getElementById('join-rep-name')?.value || '').trim();
    const phoneRaw = document.getElementById('join-rep-phone')?.value || '';
    const dob = document.getElementById('join-rep-dob')?.value || '';
    const desig = (document.getElementById('join-rep-desig')?.value || '').trim();

    const cleanPhone = phoneRaw.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith('01')) {
      showToast('Cell must be strictly 11 digits starting with 01.', 'danger');
      return;
    }
    if (!name) {
      showToast('Please enter your name.', 'danger');
      return;
    }

    signupState.join_name = name;
    signupState.join_cell = cleanPhone;
    signupState.join_dob = dob;
    signupState.join_designation = desig;
  }

  if (current === 4) {
    const confirmPwd = document.getElementById('join-confirm-pwd')?.value || '';
    if (confirmPwd !== signupState.join_user_password) {
      showToast('Passwords do not match.', 'danger');
      return;
    }
    signupState.join_confirm_password = confirmPwd;

    // Send OTP for moderator
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: signupState.join_cell,
          email: signupState.join_user_email,
          identifier: signupState.join_cell,
          purpose: 'business_join'
        })
      });
      const data = await res.json();
      signupState.join_lastSentOtp = data.demo_otp || '258330';
      signupState.join_otp_code = signupState.join_lastSentOtp;
      showToast(`Verification code sent to +88 ${signupState.join_cell} (Demo: ${signupState.join_lastSentOtp})`, 'success');
    } catch (err) {
      showToast('Error dispatching OTP: ' + err.message, 'danger');
    }
  }

  signupState.biz_step = targetStep;
  renderSignupPage(document.getElementById('app-viewport'));
}

function prevJoinStage() {
  if (signupState.biz_step === 'terms_join') {
    signupState.biz_step = 5;
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
    return;
  }
  if (signupState.biz_step > 1) {
    signupState.biz_step -= 1;
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
  } else {
    signupState.biz_route = 'choose';
    saveSignupProgress();
    renderSignupPage(document.getElementById('app-viewport'));
  }
}

function autoFillJoinOtp() {
  const input = document.getElementById('join-otp-code');
  if (input && signupState.join_lastSentOtp) {
    input.value = signupState.join_lastSentOtp;
    showToast('Auto-filled code: ' + signupState.join_lastSentOtp, 'info');
  }
}

// Route B OTP Verification -> Move to Terms
async function handleJoinBusinessOtpSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('join-otp-code');
  const code = (input ? input.value : signupState.join_lastSentOtp || '').trim();

  if (!code || code.length < 6) {
    showToast('Please enter the 6-digit OTP code.', 'danger');
    return;
  }

  // Verify OTP with the server before advancing to Terms
  const btn = event.target.querySelector('button[type="submit"]') || document.getElementById('btn-join-otp-submit');
  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Verifying...`;
  }

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: signupState.join_phone,
        email: signupState.join_email,
        identifier: signupState.join_phone,
        otp_code: code,
        purpose: 'business_join_signup'
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || 'Invalid or expired OTP code. Please enter the valid code.', 'danger');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnText;
      }
      return;
    }
  } catch (err) {
    showToast('Verification failed: ' + err.message, 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
    return;
  }

  signupState.join_otp_code = code;
  signupState.biz_step = 'terms_join';
  saveSignupProgress();
  renderSignupPage(document.getElementById('app-viewport'));
  showToast('OTP verified successfully! Please review and accept Terms & Conditions.', 'info');
}

const handleJoinBusinessFinalSignup = handleJoinBusinessOtpSubmit;

function declineJoinTerms() {
  prevJoinStage();
}

async function acceptJoinTerms() {
  signupState.join_terms_accepted = true;
  await finalizeJoinBusinessRegistration();
}

async function finalizeJoinBusinessRegistration() {
  try {
    const payload = {
      business_email: signupState.join_business_email,
      name: signupState.join_name,
      phone: signupState.join_cell,
      email: signupState.join_user_email,
      dob: signupState.join_dob,
      avatar_url: signupState.join_pfp,
      designation: signupState.join_designation,
      password: signupState.join_user_password,
      otp_code: signupState.join_otp_code
    };

    const res = await fetch('/api/auth/register-business-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to submit join request');

    // Move to Part 7: Waiting for Admin Approval screen
    signupState.biz_step = 6;
    renderSignupPage(document.getElementById('app-viewport'));
    showToast('Moderator join request dispatched to Business Admin!', 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}


// Compatibility redirect helpers
function startAuthFlow(role = 'candidate', mode = 'login') {
  if (mode === 'signup') {
    startSignupFlow(role);
  } else {
    startLoginFlow(role);
  }
}

function openAuthModal(defaultTab = 'signin', targetRole = null) {
  if (defaultTab === 'candidate') {
    startSignupFlow('candidate');
  } else if (defaultTab === 'business') {
    startSignupFlow('business');
  } else {
    startLoginFlow(targetRole || 'candidate');
  }
}


function switchAuthTab(tab) {
  const body = document.getElementById('auth-modal-body');
  if (!body) {
    if (tab === 'signin') {
      startLoginFlow('candidate');
    } else if (tab === 'candidate') {
      startSignupFlow('candidate');
    } else if (tab === 'business') {
      startSignupFlow('business');
    } else {
      startLoginFlow(tab);
    }
    return;
  }

  const dialog = document.getElementById('auth-modal-dialog');
  if (dialog) {
    dialog.style.maxWidth = tab === 'signin' ? '540px' : '820px';
  }

  const modalTitle = document.getElementById('auth-modal-title');
  const modalSubtitle = document.getElementById('auth-modal-subtitle');
  if (modalTitle && modalSubtitle) {
    if (tab === 'signin') {
      modalTitle.textContent = 'Welcome Back to NiceJobs';
      modalSubtitle.textContent = 'Log in to access your Hospitality Desk';
    } else if (tab === 'candidate') {
      modalTitle.textContent = 'Join NiceJobs Hospitality';
      modalSubtitle.textContent = 'Create your verified candidate profile & resume desk';
    } else if (tab === 'business') {
      modalTitle.textContent = 'Hotel & Employer Registration';
      modalSubtitle.textContent = 'Institutional verification & trust compliance queue';
    }
  }

  document.getElementById('tab-btn-cand')?.classList.toggle('active', tab === 'candidate');
  document.getElementById('tab-btn-biz')?.classList.toggle('active', tab === 'business');
  document.getElementById('tab-btn-signin')?.classList.toggle('active', tab === 'signin');

  if (tab === 'candidate') {
    body.innerHTML = `
      <form id="form-cand-signup" onsubmit="handleCandidateSignup(event)">
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 16px;">
          Create your candidate profile and resume vault.
        </p>

        <div style="display: flex; flex-direction: column; gap: 18px;">
          <!-- Section 1: Account Credentials & Contact Security -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">01</span>
              <span>Account Credentials & Contact Security</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">First Name *</label>
                <input type="text" name="first_name" required placeholder="First Name" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Middle Name <span style="font-weight: 400; color: var(--text-dim);">(Optional)</span></label>
                <input type="text" name="middle_name" placeholder="Middle Name" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Last Name *</label>
                <input type="text" name="last_name" required placeholder="Last Name" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Full Name in Bangla (বাংলায় পূর্ণ নাম) *</label>
              <input type="text" name="name_bangla" required placeholder="বাংলায় আপনার নাম" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Mobile Cell (SMS OTP) *</label>
                <input type="tel" id="cand-phone" name="phone" required placeholder="Your 11 Digit Number" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Primary Email (Email OTP) *</label>
                <input type="email" id="cand-email" name="email" required placeholder="Your Email" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Account Password *</label>
              <input type="password" name="password" required placeholder="Your Password" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
          </div>

          <!-- Section 2: Hospitality Career Specialization -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">02</span>
              <span>Hospitality Specialization & Recent Experience</span>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Professional Headline *</label>
              <input type="text" name="headline" placeholder="e.g. Front Office Executive | Opera PMS Expert | 5-Star Hotel Professional" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Target / Current Role *</label>
                <input type="text" name="current_position" placeholder="e.g. Front Desk Associate / Sous Chef" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Primary Department *</label>
                <select name="department" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Front Office" selected>Front Office & Concierge</option>
                  <option value="Food & Beverage">Food & Beverage Service</option>
                  <option value="Culinary">Culinary / Kitchen</option>
                  <option value="Housekeeping">Housekeeping & Laundry</option>
                  <option value="Sales & Banquets">Sales, Events & Banquets</option>
                  <option value="Engineering">Engineering & Facility</option>
                  <option value="Human Resources">Human Resources & Training</option>
                  <option value="Finance & Accounts">Finance & Accounts</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Current City / Location *</label>
                <select name="location" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Dhaka, Bangladesh" selected>Dhaka, Bangladesh</option>
                  <option value="Cox's Bazar, Bangladesh">Cox's Bazar, Bangladesh</option>
                  <option value="Sylhet / Sreemangal, Bangladesh">Sylhet / Sreemangal, Bangladesh</option>
                  <option value="Chittagong, Bangladesh">Chittagong, Bangladesh</option>
                  <option value="Kuakata, Bangladesh">Kuakata, Bangladesh</option>
                  <option value="Khulna, Bangladesh">Khulna, Bangladesh</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Hospitality Experience (Years) *</label>
                <select name="experience_years" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="0" selected>Entry-Level / Fresher (0-1 yr)</option>
                  <option value="2">Mid-Level Associate (2-4 yrs)</option>
                  <option value="5">Senior Executive (5-7 yrs)</option>
                  <option value="8">Department Head / Manager (8+ yrs)</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Recent Hospitality Employer</label>
                <input type="text" name="recent_employer" placeholder="" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Preferred Work Type</label>
                <select name="work_type" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Full-time" selected>Full-time Permanent</option>
                  <option value="Contract">Fixed-Term Contract</option>
                  <option value="Seasonal">Seasonal Resort Term</option>
                  <option value="Internship">Hospitality Internship</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Career Summary & Hospitality Pitch</label>
              <textarea name="summary" rows="2" placeholder="Brief summary of guest service philosophy and accomplishments..." style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem; resize: vertical;"></textarea>
            </div>
          </div>

          <!-- Section 3: Skills, PMS Tools & Education -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">03</span>
              <span>Hospitality Skills, PMS Tools & Education</span>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Hospitality Skills & PMS Software (comma-separated) *</label>
              <input type="text" name="skills_input" placeholder="Opera PMS, Micros POS, VIP Protocol, HACCP Food Safety, Shift Management" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Languages Spoken *</label>
                <input type="text" name="languages_input" placeholder="Bengali (Native), English (Professional), Hindi" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Hospitality Institute / Academy</label>
                <input type="text" name="institution" placeholder="e.g. National Hotel & Tourism Training Institute (NHTTI)" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Degree / Qualification Title</label>
              <input type="text" name="education" placeholder="e.g. Diploma in Hospitality Management / AHLEI Supervisor" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
          </div>

          <!-- Section 4: Preferences, Initial CV & Visibility -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">04</span>
              <span>Career Preferences & CV Vault</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Preferred Work Locations</label>
                <input type="text" name="pref_locations" placeholder="Dhaka, Cox's Bazar, Sylhet" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Expected Salary (BDT/Month)</label>
                <input type="text" name="expected_salary" placeholder="" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Notice Period / Availability</label>
                <select name="notice_period" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Immediate Joining">Immediate Joining</option>
                  <option value="15 Days Notice">15 Days Notice</option>
                  <option value="1 Month Notice">1 Month Notice</option>
                  <option value="Negotiable" selected>Negotiable</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Primary CV Document Name</label>
                <input type="text" name="cv_name" placeholder="" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.03); padding: 10px 14px; border-radius: var(--radius-md);">
              <div>
                <div style="font-weight: 700; font-size: 0.82rem; color: var(--white);">Profile Visibility & Open to Work</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">Visible only to verified hospitality employers you apply to</div>
              </div>
              <div style="display: flex; align-items: center; gap: 14px;">
                <select name="visibility" style="background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 6px 10px; border-radius: var(--radius-md); color: var(--white); font-size: 0.78rem;">
                  <option value="eligible_employers" selected>Eligible Employers Only</option>
                  <option value="registered_users">All Registered Hotels</option>
                  <option value="private">Private (Only Applied Jobs)</option>
                </select>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; cursor: pointer;">
                  <input type="checkbox" name="open_to_work" checked style="accent-color: var(--blue-primary);">
                  <span style="color: var(--orange-primary); font-weight: 700;">Open to Work</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Section 5: OTP Trigger & Submission -->
          <div class="auth-section-block" style="border-color: rgba(37, 99, 235, 0.4);">
            <div class="auth-step-header">
              <span class="auth-step-pill" style="background: var(--orange-light); color: #fdba74; border-color: var(--orange-primary);">05</span>
              <span>Contact Identity OTP Verification</span>
            </div>

            <!-- OTP Trigger Button -->
            <div id="cand-otp-trigger-area">
              <button type="button" class="btn-orange" style="width: 100%; justify-content: center; font-size: 0.92rem; padding: 12px;" onclick="requestCandidateOtp()">
                Send 6-Digit OTP to Phone & Email
              </button>
            </div>

            <!-- OTP Input Section (Hidden until requested) -->
            <div id="cand-otp-input-area" style="display: none;" class="otp-container">
              <span class="otp-notice-pill" id="cand-otp-notice">Verification OTP Dispatched</span>
              <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Enter 6-digit OTP code sent to your phone/email:</div>
              <div class="otp-inputs-row">
                <input type="text" id="cand-otp-val" maxlength="6" placeholder="123456" style="width: 180px; letter-spacing: 8px; text-align: center; font-size: 1.4rem; font-weight: 800; background: var(--bg-input); border: 2px solid var(--blue-primary); padding: 8px; border-radius: var(--radius-md); color: var(--white);">
              </div>
              <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 6px; padding: 12px;">
                Verify OTP & Activate Candidate Account
              </button>
            </div>
          </div>

          <div class="signup-login-prompt-banner" style="margin-top: 14px; font-size: 0.84rem;">
            <span>Already have an account?</span>
            <button type="button" class="btn-signup-login-action" onclick="switchAuthTab('signin')" style="padding: 5px 14px; font-size: 0.8rem;">
              Log In →
            </button>
            <span style="opacity: 0.4;">•</span>
            <a href="javascript:void(0)" onclick="switchAuthTab('business')" class="auth-text-link" style="color: #fdba74; font-weight: 700;">Hotel Employer Register</a>
          </div>
        </div>
      </form>
    `;
  } else if (tab === 'business') {
    body.innerHTML = `
      <form id="form-biz-signup" onsubmit="handleBusinessSignup(event)">
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 16px;">
          Register your hotel or hospitality establishment. All business accounts undergo verification before job post publication.
        </p>

        <div style="display: flex; flex-direction: column; gap: 18px;">
          <!-- Section 1: Hotel & Brand Identity -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">01</span>
              <span>Organization & Hotel Brand Identity</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Public Hotel / Brand Name *</label>
                <input type="text" name="brand_name" required placeholder="Your Brand Name" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Legal Registered Entity Name *</label>
                <input type="text" name="legal_name" required placeholder="Your Legal Name" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Parent Hotel Company / Group</label>
                <input type="text" name="parent_group" placeholder="Parant Group Name / Independent" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Hospitality Property Type *</label>
                <select name="property_type" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Luxury Hotel" selected>Luxury 5-Star Hotel</option>
                  <option value="Beach Resort">Beachfront Resort</option>
                  <option value="Boutique Hotel">Boutique Luxury Hotel</option>
                  <option value="Eco Resort">Eco Resort & Wellness Retreat</option>
                  <option value="Fine Dining">Fine Dining Restaurant Group</option>
                  <option value="Cruise & Banquets">Cruise & Banquet Operator</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Property Star Rating</label>
                <select name="star_rating" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="5" selected>5-Star Luxury Rating</option>
                  <option value="4">4-Star Premium Rating</option>
                  <option value="3">3-Star Standard Rating</option>
                  <option value="5">Luxury Boutique Standard</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Official Website URL</label>
                <input type="url" name="website" placeholder="https://..." value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Hotel Description & Brand Story</label>
              <textarea name="description" rows="2" placeholder="Brief summary of hotel heritage, facilities, and hospitality brand..." style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem; resize: vertical;"></textarea>
            </div>
          </div>

          <!-- Section 2: Physical Location & Contacts -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">02</span>
              <span>Physical Property Location & Direct Contacts</span>
            </div>
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Physical Street Address *</label>
                <input type="text" name="address" required placeholder="Organization Address" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">City / Region *</label>
                <select name="city" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Dhaka" selected>Dhaka</option>
                  <option value="Cox's Bazar">Cox's Bazar</option>
                  <option value="Sylhet / Sreemangal">Sylhet / Sreemangal</option>
                  <option value="Chittagong">Chittagong</option>
                  <option value="Kuakata">Kuakata</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Official Contact Cell (SMS OTP) *</label>
                <input type="tel" id="biz-phone" name="phone" required placeholder="Telephone or Cell" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Official Business Email (Email OTP) *</label>
                <input type="email" id="biz-email" name="email" required placeholder="Official Email" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
          </div>

          <!-- Section 3: Authorized Representative -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">03</span>
              <span>Authorized Representative & Organizational Role</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Representative Full Name *</label>
                <input type="text" name="representative_name" required placeholder="Your Name" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Organizational Role *</label>
                <select name="org_role" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="HR Manager" selected>HR Director / Manager</option>
                  <option value="General Manager">General Manager</option>
                  <option value="Owner">Hotel Owner / Director</option>
                  <option value="Recruiter">Recruiter / Talent Acquisition</option>
                  <option value="Admin">Operations Admin</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Representative Account Password *</label>
              <input type="password" name="password" required placeholder="••••••••" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
          </div>

          <!-- Section 4: Legal Trust & Verification Credentials -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">04</span>
              <span>Legal Verification Evidence & Accreditation</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Document Type *</label>
                <select name="doc_type" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Trade License" selected>Trade License (City Corp / Municipality)</option>
                  <option value="Civil Aviation & Tourism License">Ministry of Civil Aviation & Tourism License</option>
                  <option value="TIN Certificate">TIN / NBR Certificate</option>
                  <option value="Incorporation Certificate">RJSC Certificate of Incorporation</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">License / Registration # *</label>
                <input type="text" name="doc_number" required placeholder="TRAD/DSCC/2026/88991" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Issuing Authority</label>
              <input type="text" name="issuing_authority" placeholder="e.g. Dhaka City Corporation / Bangladesh Tourism Board" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
          </div>

          <!-- Section 5: Operations, Capacity & Staff Perks -->
          <div class="auth-section-block">
            <div class="auth-step-header">
              <span class="auth-step-pill">05</span>
              <span>Operations, Capacity & Staff Amenities</span>
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Property Key Count & Capacity</label>
              <input type="text" name="property_size" placeholder="Property Size" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Operating Hospitality Departments (comma-separated)</label>
              <input type="text" name="departments" placeholder="Front Office, Food & Beverage, Culinary, Housekeeping, Sales & Banquets" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">Staff Benefits & Facilities Provided (comma-separated)</label>
              <input type="text" name="benefits" placeholder="Service Charge Pool, Duty Meals, Accommodation, Health Insurance" value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>
          </div>

          <!-- Section 6: Security Verification & Trust Submission -->
          <div class="auth-section-block" style="border-color: rgba(249, 115, 22, 0.4);">
            <div class="auth-step-header">
              <span class="auth-step-pill" style="background: var(--orange-light); color: #fdba74; border-color: var(--orange-primary);">06</span>
              <span>Business Contact OTP & Trust Desk Submission</span>
            </div>

            <!-- Business OTP Trigger -->
            <div id="biz-otp-trigger-area">
              <button type="button" class="btn-orange" style="width: 100%; justify-content: center; font-size: 0.92rem; padding: 12px;" onclick="requestBusinessOtp()">
                Send OTP to Business Cell & Email
              </button>
            </div>

            <!-- Business OTP Input (Hidden until requested) -->
            <div id="biz-otp-input-area" style="display: none;" class="otp-container">
              <span class="otp-notice-pill" id="biz-otp-notice">OTP Dispatched to Business Contact</span>
              <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Enter 6-digit OTP code to verify affiliation:</div>
              <input type="text" id="biz-otp-val" maxlength="6" placeholder="123456" style="width: 180px; letter-spacing: 8px; text-align: center; font-size: 1.4rem; font-weight: 800; background: var(--bg-input); border: 2px solid var(--orange-primary); padding: 8px; border-radius: var(--radius-md); color: var(--white);">
              <div style="font-size: 0.78rem; color: #fdba74; text-align: center; margin-top: 4px;">
                ${svgIcon('shield', '', 14)} <strong>Trust Policy:</strong> Account status will be PENDING verification. Job posting is strictly locked until manual Trust Desk approval.
              </div>
              <button type="submit" class="btn-orange" style="width: 100%; justify-content: center; margin-top: 6px; padding: 12px;">
                Submit for Trust Verification (Pending Status)
              </button>
            </div>
          </div>

          <div class="signup-login-prompt-banner" style="margin-top: 14px; font-size: 0.84rem;">
            <span>Already have a hotel account?</span>
            <button type="button" class="btn-signup-login-action" onclick="switchAuthTab('signin')" style="padding: 5px 14px; font-size: 0.8rem;">
              Log In to Recruiter Desk →
            </button>
            <span style="opacity: 0.4;">•</span>
            <a href="javascript:void(0)" onclick="switchAuthTab('candidate')" class="auth-text-link" style="color: var(--orange-primary); font-weight: 700;">Candidate Signup</a>
          </div>
        </div>
      </form>
    `;
  } else {
    // Step-by-step guided login wizard
    renderLoginWizard();
  }
}

// ==========================================================================
// Step-by-Step Login Wizard Implementation
// ==========================================================================
let loginWizardState = {
  step: 1, // 1: Portal Select, 2: Identity, 3: Verification
  role: 'jobseeker', // 'jobseeker' | 'recruiter'
  identifier: '',
  method: 'pwd', // 'pwd' | 'otp'
  password: '',
  otpCode: ''
};

function selectLoginPortal(role) {
  loginWizardState.role = role;
  loginWizardState.identifier = '';
  loginWizardState.password = '';
  goToLoginStep(2);
}

function goToLoginStep(step) {
  // Capture current form inputs if transitioning out of active step
  if (loginWizardState.step === 2) {
    const identInput = document.getElementById('login-identifier');
    if (identInput && identInput.value.trim()) {
      loginWizardState.identifier = identInput.value.trim();
    }
  } else if (loginWizardState.step === 3) {
    const pwdInput = document.getElementById('login-password');
    if (pwdInput && pwdInput.value) {
      loginWizardState.password = pwdInput.value;
    }
    const otpInput = document.getElementById('login-otp-val');
    if (otpInput && otpInput.value.trim()) {
      loginWizardState.otpCode = otpInput.value.trim();
    }
  }

  loginWizardState.step = step;
  renderLoginWizard();
}

function proceedToLoginStep3() {
  const identInput = document.getElementById('login-identifier');
  const val = identInput ? identInput.value.trim() : loginWizardState.identifier;
  if (!val) {
    showToast('Please enter your mobile phone number or email address to continue.', 'danger');
    identInput?.focus();
    return;
  }
  loginWizardState.identifier = val;
  goToLoginStep(3);
}

function setLoginWizardMethod(method) {
  loginWizardState.method = method;
  const pwdSec = document.getElementById('login-pwd-section');
  const otpSec = document.getElementById('login-otp-section');
  const btnPwd = document.getElementById('method-btn-pwd');
  const btnOtp = document.getElementById('method-btn-otp');
  if (method === 'otp') {
    if (pwdSec) pwdSec.style.display = 'none';
    if (otpSec) otpSec.style.display = 'block';
    btnPwd?.classList.remove('active');
    btnOtp?.classList.add('active');
  } else {
    if (pwdSec) pwdSec.style.display = 'block';
    if (otpSec) otpSec.style.display = 'none';
    btnPwd?.classList.add('active');
    btnOtp?.classList.remove('active');
  }
}

function renderLoginWizard() {
  const body = document.getElementById('auth-modal-body');
  if (!body) return;

  const isCandidate = loginWizardState.role === 'jobseeker';
  const roleName = isCandidate ? 'Candidate' : 'Hotel Recruiter';
  const roleIcon = isCandidate ? svgIcon('candidate', '', 24) : svgIcon('hotel', '', 24);

  // Dynamic modal header titles based on step
  const modalTitle = document.getElementById('auth-modal-title');
  const modalSubtitle = document.getElementById('auth-modal-subtitle');
  if (modalTitle && modalSubtitle) {
    if (loginWizardState.step === 1) {
      modalTitle.textContent = 'Welcome Back to NiceJobs';
      modalSubtitle.textContent = 'Select your portal to access personalized hospitality tools';
    } else if (loginWizardState.step === 2) {
      modalTitle.textContent = isCandidate ? 'Candidate Log In' : 'Hotel Recruiter Log In';
      modalSubtitle.textContent = isCandidate ? 'Enter your mobile cell number or personal email' : 'Enter your hotel contact number or corporate email';
    } else {
      modalTitle.textContent = 'Secure Account Verification';
      modalSubtitle.textContent = `Log in to verified ${roleName} desk`;
    }
  }

  // Stepper Header HTML
  const stepperHtml = `
    <div class="login-stepper">
      <div class="login-step-item ${loginWizardState.step === 1 ? 'active' : (loginWizardState.step > 1 ? 'completed' : '')}" onclick="goToLoginStep(1)">
        <div class="login-step-dot">${loginWizardState.step > 1 ? '✓' : '1'}</div>
        <div class="login-step-label">1. Portal</div>
      </div>
      <div class="login-step-item ${loginWizardState.step === 2 ? 'active' : (loginWizardState.step > 2 ? 'completed' : '')}" onclick="${loginWizardState.step > 2 ? 'goToLoginStep(2)' : ''}">
        <div class="login-step-dot">${loginWizardState.step > 2 ? '✓' : '2'}</div>
        <div class="login-step-label">2. Identity</div>
      </div>
      <div class="login-step-item ${loginWizardState.step === 3 ? 'active' : ''}">
        <div class="login-step-dot">3</div>
        <div class="login-step-label">3. Verify</div>
      </div>
    </div>
  `;

  let stepBodyHtml = '';

  // -------------------------------------------------------------
  // STEP 1: Choose Account Type / Portal
  // -------------------------------------------------------------
  if (loginWizardState.step === 1) {
    stepBodyHtml = `
      <div class="login-step-content" style="display: flex; flex-direction: column; gap: 14px;">
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 2px;">
          Select how you want to log in to NiceJobs:
        </div>

        <!-- Candidate Portal Card -->
        <div class="login-portal-card ${isCandidate ? 'active' : ''}" onclick="selectLoginPortal('jobseeker')">
          <div class="login-portal-avatar" style="background: rgba(255, 255, 255, 0.06); color: var(--orange-primary);">${svgIcon('candidate', '', 26)}</div>
          <div class="login-portal-body">
            <div class="login-portal-title">
              <span>Hospitality Candidate</span>
              <span class="login-portal-badge" style="background: rgba(255, 255, 255, 0.08); color: var(--white);">Talent Desk</span>
            </div>
            <div class="login-portal-desc">
              Apply for 5-star hotel roles, manage multiple tailored CVs, and track direct interview invitations.
            </div>
            <div class="login-portal-features">
              <span class="login-portal-feature-tag">${svgIcon('briefcase', '', 14)} Job Applications</span>
              <span class="login-portal-feature-tag">${svgIcon('fileText', '', 14)} Multi-CV Vault</span>
              <span class="login-portal-feature-tag">${svgIcon('mail', '', 14)} Direct Interview Inbox</span>
            </div>
          </div>
          <span style="color: var(--orange-primary); font-size: 1.25rem; font-weight: 800; align-self: center;">→</span>
        </div>

        <!-- Business Hotel Card -->
        <div class="login-portal-card ${!isCandidate ? 'active' : ''}" onclick="selectLoginPortal('recruiter')">
          <div class="login-portal-avatar" style="background: rgba(249, 115, 22, 0.15); color: #fb923c;">${svgIcon('hotel', '', 26)}</div>
          <div class="login-portal-body">
            <div class="login-portal-title">
              <span>Hotel Recruiter & Employer</span>
              <span class="login-portal-badge" style="background: rgba(249, 115, 22, 0.2); color: #fdba74;">Verified Hotel</span>
            </div>
            <div class="login-portal-desc">
              Manage hotel job postings, review verified candidate applications, and coordinate team recruitment.
            </div>
            <div class="login-portal-features">
              <span class="login-portal-feature-tag">${svgIcon('users', '', 14)} Recruiter ATS</span>
              <span class="login-portal-feature-tag">${svgIcon('search', '', 14)} Opera / POS Filters</span>
              <span class="login-portal-feature-tag">${svgIcon('shieldCheck', '', 14)} Verified Trust Badge</span>
            </div>
          </div>
          <span style="color: #fb923c; font-size: 1.25rem; font-weight: 800; align-self: center;">→</span>
        </div>

        <!-- New User Switch Cards -->
        <div style="margin-top: 4px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="flex: 1; height: 1px; background: var(--border-subtle);"></div>
            <span style="font-size: 0.72rem; color: var(--text-dim); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">New to NiceJobs?</span>
            <div style="flex: 1; height: 1px; background: var(--border-subtle);"></div>
          </div>
          <div class="auth-switch-cards" style="margin-top: 0;">
            <div class="auth-switch-item" onclick="switchAuthTab('candidate')">
              <span class="auth-switch-icon">${svgIcon('candidate', '', 16)}</span>
              <div>
                <strong>Join as Candidate</strong>
                <div>Find hospitality jobs</div>
              </div>
            </div>
            <div class="auth-switch-item" onclick="switchAuthTab('business')">
              <span class="auth-switch-icon">${svgIcon('hotel', '', 16)}</span>
              <div>
                <strong>Register Hotel Desk</strong>
                <div>Post jobs & hire</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  // -------------------------------------------------------------
  // STEP 2: Identity (Phone or Email)
  // -------------------------------------------------------------
  else if (loginWizardState.step === 2) {
    stepBodyHtml = `
      <div class="login-step-content" style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Context Chip showing chosen portal -->
        <div class="login-context-chip">
          <div class="login-context-info">
            <span class="login-context-icon">${roleIcon}</span>
            <div>
              <div class="login-context-title">${isCandidate ? 'Hospitality Candidate Account' : 'Hotel Recruiter Desk'}</div>
              <div class="login-context-sub">${isCandidate ? 'Personal Job Seeker Profile' : 'Verified Institutional Talent Desk'}</div>
            </div>
          </div>
          <button type="button" class="login-context-action" onclick="goToLoginStep(1)">Change</button>
        </div>

        <form id="form-login-step2" onsubmit="event.preventDefault(); proceedToLoginStep3();">
          <div>
            <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
              ${isCandidate ? 'Mobile Cell Number or Personal Email *' : 'Hotel Work Cell Number or Corporate Email *'}
            </label>
            <div class="login-input-group" style="margin-bottom: 6px;">
              <span class="login-input-icon">${isCandidate ? svgIcon('phone', '', 16) : svgIcon('hotel', '', 16)}</span>
              <input type="text" id="login-identifier" class="login-input" required 
                placeholder="${isCandidate ? '01711234567 or email@domain.com' : '01819876543 or hr@hotel.com'}" 
                value="${loginWizardState.identifier}" autocomplete="username" autofocus>
            </div>
            <div style="font-size: 0.74rem; color: var(--text-dim);">
              ${isCandidate ? 'Supports Bangladesh numbers (+88017..., 017...) or email' : 'Use the registered contact for your verified hotel establishment'}
            </div>
          </div>

          <div class="login-step-actions">
            <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="goToLoginStep(1)">
              ← Back
            </button>
            <button type="submit" class="btn-primary" style="flex: 1; justify-content: center; padding: 12px; font-weight: 800; font-size: 0.95rem;">
              Continue to Verification →
            </button>
          </div>
        </form>

        <div style="border-top: 1px solid var(--border-subtle); padding-top: 14px; text-align: center; font-size: 0.78rem; color: var(--text-muted);">
          ${isCandidate 
            ? 'Don\'t have a candidate profile yet? <a href="javascript:void(0)" onclick="switchAuthTab(\'candidate\')" style="color: var(--white); font-weight: 700; text-decoration: underline;">Join/Sign up as Candidate</a>' 
            : 'Register a new hotel organization? <a href="javascript:void(0)" onclick="switchAuthTab(\'business\')" style="color: #fdba74; font-weight: 700; text-decoration: underline;">Register Hotel Desk</a>'}
        </div>
      </div>
    `;
  }
  // -------------------------------------------------------------
  // STEP 3: Verification & Sign In (Password / OTP)
  // -------------------------------------------------------------
  else if (loginWizardState.step === 3) {
    stepBodyHtml = `
      <div class="login-step-content" style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Context Summary Chip -->
        <div class="login-context-chip">
          <div class="login-context-info">
            <span class="login-context-icon">${roleIcon}</span>
            <div>
              <div class="login-context-title">${loginWizardState.identifier}</div>
              <div class="login-context-sub">${roleName} • Verified Desk</div>
            </div>
          </div>
          <button type="button" class="login-context-action" onclick="goToLoginStep(2)">Edit</button>
        </div>

        <form id="form-user-login" onsubmit="handleUserLogin(event)">
          <!-- Hidden inputs for form data -->
          <input type="hidden" id="login-identifier" value="${loginWizardState.identifier}">
          <input type="radio" name="login_role" value="${loginWizardState.role}" checked style="display: none;">

          <!-- Method Selector (Password vs OTP) -->
          <div class="login-method-nav">
            <button type="button" id="method-btn-pwd" class="login-method-btn ${loginWizardState.method === 'pwd' ? 'active' : ''}" onclick="setLoginWizardMethod('pwd')">
              ${svgIcon('lock', '', 14)} Password Login
            </button>
            <button type="button" id="method-btn-otp" class="login-method-btn ${loginWizardState.method === 'otp' ? 'active' : ''}" onclick="setLoginWizardMethod('otp')">
              ${svgIcon('smartphone', '', 14)} One-Time OTP
            </button>
          </div>

          <!-- Password Section -->
          <div id="login-pwd-section" style="display: ${loginWizardState.method === 'pwd' ? 'block' : 'none'}; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-weight: 700; font-size: 0.82rem; color: var(--white);">Account Password</label>
              <a href="javascript:void(0)" onclick="setLoginWizardMethod('otp')" style="font-size: 0.75rem; color: var(--white); text-decoration: underline;">Forgot? Use OTP</a>
            </div>
            <div class="login-input-group" style="margin-bottom: 0;">
              <span class="login-input-icon">${svgIcon('key', '', 16)}</span>
              <input type="password" id="login-password" class="login-input" placeholder="••••••••" value="${loginWizardState.password}" autocomplete="current-password" style="padding-right: 42px;">
              <button type="button" class="login-pwd-toggle" id="pwd-toggle-btn" onclick="togglePasswordVisibility('login-password', 'pwd-toggle-btn')" title="Show/Hide Password">${svgIcon('eye', '', 16)}</button>
            </div>
          </div>

          <!-- OTP Section -->
          <div id="login-otp-section" style="display: ${loginWizardState.method === 'otp' ? 'block' : 'none'}; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-weight: 700; font-size: 0.82rem; color: var(--white);">One-Time Security OTP</label>
              <span style="font-size: 0.72rem; color: var(--text-dim);">SMS / Email Code</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="login-otp-val" maxlength="6" placeholder="• • • • • •" class="login-input" style="padding-left: 14px; letter-spacing: 4px; text-align: center; font-size: 1.1rem; font-weight: 800;">
              <button type="button" class="btn-orange" style="padding: 0 16px; font-size: 0.82rem; white-space: nowrap; font-weight: 700;" onclick="requestLoginOtp()">
                Send OTP
              </button>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 4px;">Dispatches a 6-digit verification code to ${loginWizardState.identifier}</div>
          </div>

          ${!isCandidate ? `
            <div style="background: rgba(249, 115, 22, 0.08); border: 1px solid rgba(249, 115, 22, 0.25); border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 12px; display: flex; gap: 10px; align-items: center;">
              ${svgIcon('shield', '', 18)}
              <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.35;">
                <strong style="color: #fdba74;">Hotel Compliance Notice:</strong> Pending business accounts will be directed to the Trust Verification desk upon log in.
              </div>
            </div>
          ` : ''}

          <div class="login-step-actions">
            <button type="button" class="btn-secondary" style="padding: 12px 18px;" onclick="goToLoginStep(2)">
              ← Back
            </button>
            <button type="submit" class="btn-primary" id="btn-login-submit" style="flex: 1; justify-content: center; padding: 12px; font-size: 0.95rem; font-weight: 800; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">
              Log In to ${roleName} Desk ${svgIcon('share', '', 14)}
            </button>
          </div>
        </form>
      </div>
    `;
  }

  body.innerHTML = `
    <div style="display: flex; flex-direction: column;">
      ${stepperHtml}
      ${stepBodyHtml}
    </div>
  `;
}

// Backward compatible aliases
function setLoginMethod(method) {
  setLoginWizardMethod(method);
}

function toggleLoginMethod(method) {
  setLoginWizardMethod(method);
}

function togglePasswordVisibility(inputId = 'login-password', btnId = 'pwd-toggle-btn') {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.innerHTML = svgIcon('eyeOff', '', 16);
  } else {
    input.type = 'password';
    if (btn) btn.innerHTML = svgIcon('eye', '', 16);
  }
}

async function requestLoginOtp() {
  const ident = document.getElementById('login-identifier')?.value || loginWizardState.identifier;
  if (!ident) {
    showToast('Please enter your mobile phone number or email first.', 'danger');
    return;
  }
  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ident, purpose: 'login' })
    });
    const data = await res.json();
    loginWizardState.otpCode = data.demo_otp;
    const otpInput = document.getElementById('login-otp-val');
    if (otpInput) otpInput.value = data.demo_otp;
    showToast(`Login OTP dispatched to ${ident} (Demo Code: ${data.demo_otp})`, 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleUserLogin(event) {
  event.preventDefault();
  const ident = document.getElementById('login-identifier')?.value || loginWizardState.identifier;
  const pwd = document.getElementById('login-password')?.value || loginWizardState.password;
  const otp = document.getElementById('login-otp-val')?.value || loginWizardState.otpCode;
  const roleRadio = document.querySelector('input[name="login_role"]:checked')?.value || loginWizardState.role || 'jobseeker';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: ident,
        password: pwd || null,
        otp_code: otp || null,
        role: roleRadio
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Log in failed');

    closeModal('modal-auth');
    showToast(data.message || 'Logged in successfully!', 'success');

    state.currentUser = data.user;
    state.currentRole = data.user.role;
    if (data.business) {
      state.activeHotelId = data.business.id;
      state.currentUser.business_id = data.business.id;
      state.currentUser.title = `${data.business.org_role || 'Recruiter'} (${data.business.brand_name})`;
    } else if (data.profile) {
      state.currentUser.title = `${data.profile.current_position || 'Candidate'} • ${data.profile.department || 'Hospitality'}`;
    }

    const statusText = document.getElementById('role-status-text');
    if (statusText) {
      if (data.user.role === 'recruiter') {
        const bName = data.business ? data.business.brand_name : 'Hotel Recruiter';
        statusText.innerHTML = `Signed in as <strong>${data.user.name}</strong> (${bName})`;
      } else if (data.user.role === 'jobseeker') {
        statusText.innerHTML = `Signed in as <strong>${data.user.name}</strong> (Candidate)`;
      } else {
        statusText.innerHTML = `Signed in as <strong>${data.user.name}</strong> (Platform Admin)`;
      }
    }
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    const roleBtn = document.getElementById(`btn-role-${data.user.role === 'jobseeker' ? 'seeker' : data.user.role}`);
    if (roleBtn) roleBtn.classList.add('active');

    await loadInitialData();
    if (data.user.role === 'recruiter') {
      navigateTo('recruiter-dashboard');
    } else {
      navigateTo('home');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function requestCandidateOtp() {
  const phone = document.getElementById('cand-phone')?.value;
  const email = document.getElementById('cand-email')?.value;
  if (!phone || !email) {
    showToast('Please enter both Mobile Cell and Email to receive OTP', 'danger');
    return;
  }
  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, purpose: 'candidate_signup' })
    });
    const data = await res.json();
    document.getElementById('cand-otp-trigger-area').style.display = 'none';
    const inputArea = document.getElementById('cand-otp-input-area');
    inputArea.style.display = 'flex';
    document.getElementById('cand-otp-notice').innerHTML = `OTP Sent! Demo Code: <strong>${data.demo_otp}</strong>`;
    document.getElementById('cand-otp-val').value = data.demo_otp;
    showToast(`Verification code sent to ${email} (Demo OTP: ${data.demo_otp})`, 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleCandidateSignup(event) {
  event.preventDefault();
  const form = event.target;
  const otpCode = document.getElementById('cand-otp-val')?.value;
  if (!otpCode) {
    showToast('Please request and enter your 6-digit OTP code', 'danger');
    return;
  }

  const skillsArr = form.skills_input?.value.split(',').map(s => s.trim()).filter(Boolean) || [];
  const prefLocArr = form.pref_locations?.value.split(',').map(s => s.trim()).filter(Boolean) || [];
  const langsArr = form.languages_input?.value.split(',').map(s => {
    const parts = s.trim().split('(');
    return { name: parts[0].trim(), level: parts[1] ? parts[1].replace(')', '').trim() : 'Fluent' };
  }).filter(l => l.name) || [{ name: 'Bengali', level: 'Native' }, { name: 'English', level: 'Professional' }];

  const firstName = (form.first_name?.value || '').trim();
  const middleName = (form.middle_name?.value || '').trim();
  const lastName = (form.last_name?.value || '').trim();
  const nameBangla = (form.name_bangla?.value || '').trim();
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || (form.name?.value || '');

  const payload = {
    name: fullName,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    name_bangla: nameBangla,
    email: form.email.value,
    phone: form.phone.value,
    password: form.password.value,
    otp_code: otpCode,
    headline: form.headline?.value || 'Hospitality Professional | Guest Service Specialist',
    current_position: form.current_position?.value || 'Front Desk Associate',
    department: form.department?.value || 'Front Office',
    location: form.location?.value || 'Dhaka, Bangladesh',
    experience_years: parseInt(form.experience_years?.value || '2', 10),
    recent_employer: form.recent_employer?.value || null,
    summary: form.summary?.value || null,
    skills: skillsArr,
    languages: langsArr,
    education: form.education?.value || 'Diploma in Hospitality & Tourism Management',
    institution: form.institution?.value || 'National Hotel & Tourism Training Institute (NHTTI)',
    preferred_locations: prefLocArr,
    expected_salary: form.expected_salary?.value || '',
    work_type: form.work_type?.value || 'Full-time',
    notice_period: form.notice_period?.value || 'Immediate',
    cv_name: form.cv_name?.value || `${form.name.value.replace(/ /g, '_')}_Hospitality_Resume.pdf`,
    visibility: form.visibility?.value || 'eligible_employers',
    open_to_work: form.open_to_work?.checked ?? true
  };

  try {
    const res = await fetch('/api/auth/register-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Candidate registration failed');

    closeModal('modal-auth');
    showToast('Candidate account verified and activated successfully!', 'success');
    state.currentUser = {
      id: data.user_id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: 'jobseeker',
      title: `${payload.current_position || 'Candidate'} • ${payload.department || 'Hospitality'}`,
      avatar: DEFAULT_AVATAR_PREVIEW
    };
    state.currentRole = 'jobseeker';

    try {
      const sessPayload = JSON.stringify({ user: state.currentUser, role: 'jobseeker' });
      sessionStorage.setItem('nicejobs_active_session', sessPayload);
      sessionStorage.setItem('nicejobs_candidate_session', sessPayload);
      localStorage.setItem('nicejobs_active_session', sessPayload);
      localStorage.setItem('nicejobs_candidate_session', sessPayload);
    } catch (e) {}

    const statusText = document.getElementById('role-status-text');
    if (statusText) {
      statusText.innerHTML = `Signed in as <strong>${data.name}</strong> (${payload.current_position})`;
    }
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-role-seeker')?.classList.add('active');
    updateNavigation();

    await loadInitialData();
    navigateTo('profile');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function requestBusinessOtp() {
  const email = document.getElementById('biz-email')?.value;
  const phone = document.getElementById('biz-phone')?.value;
  if (!email || !phone) {
    showToast('Please enter Business Cell and Email to receive OTP', 'danger');
    return;
  }
  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, purpose: 'business_signup' })
    });
    const data = await res.json();
    document.getElementById('biz-otp-trigger-area').style.display = 'none';
    const inputArea = document.getElementById('biz-otp-input-area');
    inputArea.style.display = 'flex';
    document.getElementById('biz-otp-notice').innerHTML = `OTP Sent! Demo Code: <strong>${data.demo_otp}</strong>`;
    document.getElementById('biz-otp-val').value = data.demo_otp;
    showToast(`Business OTP sent to ${email} (Demo OTP: ${data.demo_otp})`, 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleBusinessSignup(event) {
  event.preventDefault();
  const form = event.target;
  const otpCode = document.getElementById('biz-otp-val')?.value;
  if (!otpCode) {
    showToast('Please request and enter the 6-digit OTP code', 'danger');
    return;
  }

  const deptArr = form.departments?.value ? form.departments.value.split(',').map(s => s.trim()).filter(Boolean) : ["Front Office", "Food & Beverage", "Culinary", "Housekeeping", "Sales & Banquets", "Engineering", "Human Resources", "Finance"];
  const benefitsArr = form.benefits?.value ? form.benefits.value.split(',').map(s => s.trim()).filter(Boolean) : ["Competitive Service Charge Pool", "Duty Meals Included", "Staff Accommodation", "Health Insurance", "Annual Festival Bonuses", "AHLEI Training"];

  const payload = {
    legal_name: form.legal_name.value,
    brand_name: form.brand_name.value,
    parent_group: form.parent_group?.value || '',
    property_type: form.property_type.value,
    star_rating: parseInt(form.star_rating?.value || '5', 10),
    city: form.city.value,
    address: form.address.value,
    country: 'Bangladesh',
    website: form.website?.value || '',
    phone: form.phone.value,
    email: form.email.value,
    description: form.description?.value || `Hospitality establishment: ${form.brand_name.value}. Group: ${form.parent_group?.value || 'Independent'}.`,
    representative_name: form.representative_name.value,
    org_role: form.org_role?.value || 'HR Manager',
    doc_type: form.doc_type?.value || 'Trade License',
    doc_number: form.doc_number.value,
    issuing_authority: form.issuing_authority?.value || 'Dhaka City Corporation',
    property_size: form.property_size?.value || '200+ Luxury Rooms',
    departments: deptArr,
    benefits: benefitsArr,
    password: form.password?.value || '',
    otp_code: otpCode
  };

  try {
    const res = await fetch('/api/auth/register-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Business registration failed');

    closeModal('modal-auth');
    showToast('Business registered! Account status is PENDING verification.', 'orange');
    
    state.currentUser = {
      id: data.user_id,
      name: payload.representative_name,
      email: payload.email,
      phone: payload.phone,
      role: 'recruiter',
      business_id: data.business_id,
      title: `${payload.org_role} (${payload.brand_name})`,
      avatar: DEFAULT_AVATAR_PREVIEW
    };
    state.currentRole = 'recruiter';
    state.activeHotelId = data.business_id;

    const statusText = document.getElementById('role-status-text');
    if (statusText) {
      statusText.innerHTML = `Signed in as <strong>${payload.representative_name}</strong> (${payload.brand_name} - PENDING)`;
    }
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-role-recruiter')?.classList.add('active');

    await loadInitialData();
    navigateTo('recruiter-dashboard');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Job Details Modal
async function openJobDetailModal(jobId) {
  const userId = state.currentUser ? state.currentUser.id : '';
  const res = await fetch(`/api/jobs/${jobId}?user_id=${userId}`);
  if (!res.ok) return;
  const job = await res.json();
  const isGuest = !state.currentUser || state.currentRole === 'guest';
  const isSaved = !isGuest && (job.is_saved || (state.savedJobs && state.savedJobs.some(s => s.id === job.id || s.job_id === job.id)));

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-job-detail">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <div style="font-size: 0.82rem; color: var(--text-muted); font-weight: 700;">${job.brand_name} • ${job.star_rating}-Star ${job.property_type}</div>
            <h2 class="modal-title">${job.title}</h2>
          </div>
          <button class="modal-close" onclick="closeModal('modal-job-detail')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <div class="modal-body">
          <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.88rem; color: var(--text-muted); padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);">
            <div>${svgIcon('mapPin', '', 15)} <strong>Location:</strong> ${job.property_location}</div>
            <div>${svgIcon('briefcase', '', 15)} <strong>Department:</strong> ${job.department}</div>
            <div>${svgIcon('clock', '', 15)} <strong>Shift:</strong> ${job.shift}</div>
            <div>${svgIcon('fileText', '', 15)} <strong>Type:</strong> ${job.employment_type}</div>
            <div>${svgIcon('award', '', 15)} <strong>Experience:</strong> ${job.experience_level || 'Hospitality Experience'}</div>
            <div>${svgIcon('dollar', '', 15)} <strong>Salary:</strong> <span style="color: var(--orange-primary); font-weight: 800;">${(job.is_negotiable || job.salary_period === 'negotiable' || (!job.salary_min && !job.salary_max)) ? '৳ Negotiable' : `৳${(job.salary_min||0).toLocaleString()} - ৳${(job.salary_max||0).toLocaleString()} / month`}</span></div>
          </div>

          <div>
            <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 8px; color: var(--white);">Role Overview</h3>
            <p style="color: var(--text-muted); line-height: 1.6; font-size: 0.95rem;">${job.description}</p>
          </div>

          <!-- Experience Requirement -->
          <div>
            <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 6px; color: var(--white); display: flex; align-items: center; gap: 8px;">
              ${svgIcon('award', '', 16)} Experience Required
            </h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; margin: 0;">
              <strong>${job.experience_level || 'Hospitality Experience Required'}</strong> in this hospitality discipline.
            </p>
          </div>

          <!-- Structured Educational Requirements -->
          ${(Array.isArray(job.education_requirements) && job.education_requirements.length > 0) ? `
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 8px; color: var(--white); display: flex; align-items: center; gap: 8px;">
                ${svgIcon('book', '', 16)} Educational Requirements
              </h3>
              <ul style="padding-left: 20px; color: var(--text-muted); line-height: 1.6; font-size: 0.92rem;">
                ${job.education_requirements.map(e => {
                  const deg = typeof e === 'string' ? e : (e.degree || e.title || '');
                  const field = typeof e === 'object' && e.field ? ` (${e.field})` : '';
                  return `<li><strong style="color: var(--white);">${deg}</strong>${field ? `<span style="color: var(--orange-primary);"> — Subject / Major: ${e.field}</span>` : ''}</li>`;
                }).join('')}
              </ul>
            </div>
          ` : ''}

          <!-- Structured Skill Requirements -->
          ${(Array.isArray(job.skill_requirements) && job.skill_requirements.length > 0) ? `
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 10px; color: var(--white); display: flex; align-items: center; gap: 8px;">
                ${svgIcon('checkCircle', '', 16)} Required Hotel &amp; Resort Skills
              </h3>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${job.skill_requirements.map(s => `
                  <span class="schema-tag-badge" style="font-size: 0.8rem; padding: 4px 10px;">${s}</span>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Legacy Requirements (fallback) -->
          ${(Array.isArray(job.requirements) && job.requirements.length > 0 && (!job.education_requirements || job.education_requirements.length === 0)) ? `
            <div>
              <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 10px; color: var(--white);">Role Requirements</h3>
              <ul style="padding-left: 20px; color: var(--text-muted); line-height: 1.6; font-size: 0.92rem;">
                ${job.requirements.map(r => `<li>${r}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${(Array.isArray(job.benefits) && job.benefits.length > 0) ? `
            <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.3); padding: 18px; border-radius: var(--radius-md);">
              <h4 style="font-size: 0.98rem; font-weight: 800; color: var(--white); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                ${svgIcon('starFilled', 'color: var(--orange-primary);', 16)} Hospitality Benefits &amp; Perks
              </h4>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${job.benefits.map(b => `
                  <span class="perk-chip ${b.toLowerCase().includes('service charge') ? 'perk-highlight' : ''}" style="font-size: 0.85rem; padding: 5px 12px;">
                    ${svgIcon(getBenefitIcon(b), '', 14)} ${b}
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ((job.service_charge_included || job.accommodation_provided || job.duty_meals_provided) ? `
            <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.3); padding: 16px; border-radius: var(--radius-md);">
              <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--white); margin-bottom: 8px;">Benefits &amp; Perks</h4>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${job.service_charge_included ? `<span class="perk-chip perk-highlight">${svgIcon('dollar', '', 13)} Service Charge</span>` : ''}
                ${job.accommodation_provided ? `<span class="perk-chip">${svgIcon('home', '', 13)} Accommodation</span>` : ''}
                ${job.duty_meals_provided ? `<span class="perk-chip">${svgIcon('utensils', '', 13)} Duty Meals</span>` : ''}
                <span class="perk-chip">${svgIcon('shield', '', 13)} Medical Insurance</span>
              </div>
            </div>
          ` : '')}

          ${job.is_applied ? `
            <div style="background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; padding: 14px 20px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between;">
              <div style="color: var(--orange-primary); font-weight: 700;">✓ You have applied for this job</div>
              <button class="btn-primary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="closeModal('modal-job-detail'); navigateTo('applications');">View Applications →</button>
            </div>
          ` : ''}
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal('modal-job-detail')">Close</button>
          <button class="btn-icon ${isSaved ? 'saved' : ''}" style="width: 40px; height: 40px;" onclick="toggleSaveJob('${job.id}')" title="${isGuest ? 'Log in to save favourite' : (isSaved ? 'Bookmarked' : 'Save Job')}">${isSaved ? svgIcon('starFilled', '', 18) : svgIcon('star', '', 18)}</button>
          <button class="btn-icon" style="width: 40px; height: 40px;" onclick="shareJob('${job.id}', '${encodeURIComponent(job.title)}')">${svgIcon('share', '', 18)}</button>
          ${!job.is_applied ? `
            <button class="btn-orange" onclick="closeModal('modal-job-detail'); handleApplyClick('${job.id}');">
              Apply Now
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function handleApplyClick(jobId) {
  if (state.currentRole === 'guest' || !state.currentUser) {
    showToast('Log in as candidate to apply', 'orange');
    openAuthModal('candidate');
    return;
  }
  openApplicationWizardModal(jobId);
}

// Application Wizard with Multiple CV Selection
async function openApplicationWizardModal(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;

  const profRes = state.currentUser ? await fetch(`/api/profile?user_id=${state.currentUser.id}`) : null;
  const profile = profRes && profRes.ok ? await profRes.json() : {};
  const cvList = profile.cv_list || (profile.cv_name ? [
    { id: 'cv_default', name: profile.cv_name, title: 'Primary Resume', is_default: true }
  ] : []);

  let questions = job.screening_questions;
  if (typeof questions === 'string') {
    try { questions = JSON.parse(questions); } catch(e) { questions = []; }
  }
  if (!Array.isArray(questions)) {
    questions = [];
  }

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-app-wizard">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <div style="font-size: 0.8rem; color: var(--orange-primary); font-weight: 700;">${job.brand_name}</div>
            <h2 class="modal-title">Apply for ${job.title}</h2>
          </div>
          <button class="modal-close" onclick="closeModal('modal-app-wizard')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <form id="form-job-apply" onsubmit="submitApplicationForm(event, '${job.id}')">
          <div class="modal-body">
            <!-- Contact Info -->
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); padding: 12px 16px; border-radius: var(--radius-md);">
              <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 2px; color: var(--white);">Contact Information</div>
              <div style="font-size: 0.82rem; color: var(--text-muted);">
                <strong>${state.currentUser.name}</strong> • ${state.currentUser.phone || ''} • ${state.currentUser.email || ''}
              </div>
            </div>

            <!-- Resume Selection -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <label style="font-weight: 700; font-size: 0.88rem; color: var(--white);">Select Resume</label>
                <span style="font-size: 0.75rem; color: var(--white);">Shared only with this employer</span>
              </div>
              
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${cvList.map(cv => `
                  <label style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 10px 14px; border-radius: var(--radius-md); cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <input type="radio" name="selected_cv_radio" value="${cv.name}" ${cv.is_default ? 'checked' : ''} style="accent-color: var(--blue-primary);">
                      <div>
                        <div style="font-weight: 700; font-size: 0.85rem; color: var(--white);">${cv.title || cv.name}</div>
                        <div style="font-size: 0.72rem; color: var(--text-dim);">${cv.name}</div>
                      </div>
                    </div>
                    ${cv.is_default ? '<span class="badge-featured">Default</span>' : ''}
                  </label>
                `).join('')}
              </div>
            </div>

            <!-- Screening Questions (Only displayed if poster specified questions) -->
            ${questions.length > 0 ? `
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.88rem; margin-bottom: 10px; color: var(--orange-primary);">
                  Screening Questions (${questions.length})
                </label>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                  ${questions.map((qObj, idx) => `
                    <div>
                      <label style="display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 4px; color: var(--white);">
                        ${idx + 1}. ${escapeHtml(qObj.q)}
                      </label>
                      ${(qObj.type === 'boolean' || qObj.type === 'yesno') ? `
                        <select name="screen_q_${idx}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      ` : (qObj.type === 'multiple' && qObj.options && qObj.options.length > 0) ? `
                        <select name="screen_q_${idx}" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
                          <option value="" disabled selected>-- Select an option --</option>
                          ${qObj.options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
                        </select>
                      ` : `
                        <input type="text" name="screen_q_${idx}" required placeholder="Your answer..." style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
                      `}
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Cover Note -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 4px; color: var(--white);">
                Cover Note (Optional)
              </label>
              <textarea id="app-cover-note" rows="3" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;" placeholder="Briefly state why you are interested in this position..."></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-app-wizard')">Cancel</button>
            <button type="submit" class="btn-orange">Submit Application</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function submitApplicationForm(event, jobId) {
  event.preventDefault();
  const form = event.target;
  const coverNote = document.getElementById('app-cover-note')?.value || '';
  const selectedCv = form.selected_cv_radio?.value || (state.currentUser?.cv_name || '');

  const screeningAnswers = {};
  const job = state.jobs.find(j => j.id === jobId);
  let questions = job?.screening_questions;
  if (typeof questions === 'string') {
    try { questions = JSON.parse(questions); } catch(e) { questions = []; }
  }
  if (!Array.isArray(questions)) {
    questions = [];
  }

  questions.forEach((qObj, idx) => {
    const val = form[`screen_q_${idx}`]?.value || '';
    screeningAnswers[qObj.q] = val;
  });

  const payload = {
    job_id: jobId,
    user_id: state.currentUser?.id || '',
    cover_letter: coverNote,
    selected_cv: selectedCv,
    screening_answers: screeningAnswers
  };

  try {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Application failed');

    closeModal('modal-app-wizard');
    showToast(`Application submitted with ${selectedCv}! Recruiter has been notified.`, 'success');
    await loadInitialData();
    navigateTo('applications');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Recruiter Candidate Review Modal - Zero Inner Scroll Executive Layout
function setCandidateReviewStatus(status) {
  const sel = document.getElementById('select-cand-status');
  if (sel) sel.value = status;
  document.querySelectorAll('.cand-status-pill-btn').forEach(btn => {
    if (btn.getAttribute('data-status') === status) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function setInterviewPreset(val) {
  const inp = document.getElementById('input-interview-time');
  if (inp) {
    inp.value = val;
    inp.focus();
  }
}

async function openCandidateReviewModal(appId) {
  try {
    let app = null;

    // A. Check if appId is already an application object
    if (typeof appId === 'object' && appId !== null && appId.id) {
      app = appId;
    }

    // B. Check cached ATS table apps (fastest, instant zero-latency)
    if (!app && window._cachedAtsApps && Array.isArray(window._cachedAtsApps)) {
      app = window._cachedAtsApps.find(a => a && a.id === appId);
    }

    // C. Check state.applications in memory
    if (!app && state.applications && Array.isArray(state.applications)) {
      app = state.applications.find(a => a && a.id === appId);
    }

    // D. Fetch single application directly by ID
    if (!app && appId) {
      try {
        const res = await fetch(`/api/applications/${appId}`);
        if (res.ok) {
          app = await res.json();
        }
      } catch(e) {}
    }

    // E. Fallback to business applications list
    if (!app) {
      const bId = state.currentUser?.business_id || state.activeHotelId || 'biz_radisson';
      try {
        const res = await fetch(`/api/applications?business_id=${bId}`);
        const apps = res.ok ? await res.json() : [];
        app = apps.find(a => a && a.id === appId);
      } catch(e) {}
    }

    if (!app) {
      showToast('Could not load candidate application dossier.', 'warning');
      return;
    }

    // Parse candidate skills safely
    let skillsList = [];
    if (Array.isArray(app.candidate_skills)) {
      skillsList = app.candidate_skills;
    } else if (typeof app.candidate_skills === 'string') {
      try {
        skillsList = JSON.parse(app.candidate_skills);
      } catch(e) {
        skillsList = app.candidate_skills ? app.candidate_skills.split(',').map(s=>s.trim()) : [];
      }
    }
    if (!Array.isArray(skillsList)) skillsList = [];

    // Parse candidate education safely
    let eduList = [];
    if (Array.isArray(app.candidate_education)) {
      eduList = app.candidate_education;
    } else if (typeof app.candidate_education === 'string') {
      try {
        eduList = JSON.parse(app.candidate_education);
      } catch(e) {
        eduList = [];
      }
    }
    if (!Array.isArray(eduList)) eduList = [];

    // Parse candidate experience safely
    let expList = [];
    if (Array.isArray(app.candidate_experience)) {
      expList = app.candidate_experience;
    } else if (typeof app.candidate_experience === 'string') {
      try {
        expList = JSON.parse(app.candidate_experience);
      } catch(e) {
        expList = [];
      }
    }
    if (!Array.isArray(expList)) expList = [];

    // Parse screening answers safely
    let screeningAnswersObj = app.screening_answers || {};
    if (typeof screeningAnswersObj === 'string') {
      try { screeningAnswersObj = JSON.parse(screeningAnswersObj); } catch(e) { screeningAnswersObj = {}; }
    }
    const screeningEntries = Object.entries(screeningAnswersObj || {});

    // Safe items for experience & education
    const expItem = (expList.length > 0 && typeof expList[0] === 'object' && expList[0] !== null) 
      ? expList[0] 
      : (typeof expList[0] === 'string' ? { role: expList[0], company: '' } : null);

    const eduItem = (eduList.length > 0 && typeof eduList[0] === 'object' && eduList[0] !== null) 
      ? eduList[0] 
      : (typeof eduList[0] === 'string' ? { degree: eduList[0], institution: '' } : null);

    const currentStatus = app.status || 'under_review';
    const statusOptions = [
      { id: 'under_review', label: 'Under Review' },
      { id: 'shortlisted', label: 'Shortlisted' },
      { id: 'interview_scheduled', label: 'Interview Scheduled' },
      { id: 'offer', label: 'Extend Offer' },
      { id: 'hired', label: 'Hired' },
      { id: 'rejected', label: 'Rejected' }
    ];

    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = `
      <div class="modal-backdrop open" id="modal-cand-review">
        <div class="modal-dialog">
          <div class="modal-header" style="padding: 16px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(10, 17, 40, 0.98);">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.35); display: flex; align-items: center; justify-content: center; color: var(--orange-primary);">
                ${svgIcon('candidate', '', 18)}
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <h2 class="modal-title" style="font-size: 1.25rem; font-weight: 800; color: var(--white); margin: 0;">${escapeHtml(app.candidate_name)}</h2>
                  <span style="background: rgba(37, 99, 235, 0.18); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">
                    ${svgIcon('briefcase', '', 11)} ${escapeHtml(app.job_title)}
                  </span>
                  <span class="status-pill status-${app.status}" style="font-size: 0.7rem; padding: 2px 8px;">
                    ${escapeHtml(app.status.replace('_', ' '))}
                  </span>
                </div>
                <div style="font-size: 0.76rem; color: var(--text-dim); margin-top: 2px;">
                  Application ID: <strong>${escapeHtml(app.id)}</strong> • Applied on ${escapeHtml(app.applied_at || 'Recent')}
                </div>
              </div>
            </div>
            <button class="modal-close" onclick="closeModal('modal-cand-review')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
          </div>

          <div class="modal-body" style="padding: 18px 24px;">
            <div class="cand-review-grid">
              
              <!-- LEFT COLUMN: Candidate Profile & Background Dossier -->
              <div style="display: flex; flex-direction: column; gap: 10px;">
                
                <!-- 1. Identity & Contact Card -->
                <div class="cand-review-card">
                  <div style="display: flex; gap: 14px; align-items: center;">
                    <img src="${app.candidate_avatar || DEFAULT_AVATAR_PREVIEW}" alt="${escapeHtml(app.candidate_name)}" 
                         style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255, 255, 255, 0.15); flex-shrink: 0;">
                    <div style="flex: 1; min-width: 0;">
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <div style="font-weight: 800; font-size: 1.05rem; color: var(--white); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                          ${escapeHtml(app.candidate_name)}
                        </div>
                        ${app.candidate_open_to_work !== 0 ? `
                          <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 9999px; flex-shrink: 0;">
                            ● Open to Work
                          </span>
                        ` : ''}
                      </div>
                      <div style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600; margin-top: 1px;">
                        ${escapeHtml(app.candidate_headline || 'Hospitality Professional')}
                      </div>
                      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 6px; font-size: 0.78rem;">
                        <a href="tel:${escapeHtml(app.candidate_phone)}" style="color: #60a5fa; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                          ${svgIcon('phone', '', 12)} ${escapeHtml(app.candidate_phone)}
                        </a>
                        <a href="mailto:${escapeHtml(app.candidate_email)}" style="color: #60a5fa; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                          ${svgIcon('mail', '', 12)} ${escapeHtml(app.candidate_email)}
                        </a>
                        ${app.candidate_location ? `
                          <span style="color: var(--text-dim); display: flex; align-items: center; gap: 4px;">
                            ${svgIcon('mapPin', '', 12)} ${escapeHtml(app.candidate_location)}
                          </span>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 2. Attached CV Card -->
                <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(59, 130, 246, 0.28); padding: 10px 14px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                    <div style="color: #60a5fa; flex-shrink: 0;">${svgIcon('fileText', '', 20)}</div>
                    <div style="min-width: 0;">
                      <div style="font-weight: 700; font-size: 0.84rem; color: var(--white); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(app.selected_cv || 'Targeted_Hospitality_CV.pdf')}
                      </div>
                      <div style="font-size: 0.72rem; color: #94a3b8;">Tailored Resume attached to this application</div>
                    </div>
                  </div>
                  <button type="button" class="btn-orange" style="padding: 5px 12px; font-size: 0.76rem; font-weight: 700; flex-shrink: 0;" onclick="viewSubmittedApplicationCv('${app.id}')">
                    View Full Resume ${svgIcon('share', '', 12)}
                  </button>
                </div>

                <!-- 3. Key Qualifications & Skills Snapshot -->
                <div class="cand-review-card">
                  <div style="font-size: 0.78rem; font-weight: 700; color: #fdba74; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                    Qualifications &amp; Core Competencies
                  </div>
                  
                  ${expItem ? `
                    <div style="font-size: 0.78rem; color: #cbd5e1; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                      <span style="color: #60a5fa; flex-shrink: 0;">${svgIcon('briefcase', '', 12)}</span>
                      <span><strong>${escapeHtml(expItem.company || '')}</strong> ${expItem.role ? '• ' + escapeHtml(expItem.role) : ''} ${expItem.period ? '(' + escapeHtml(expItem.period) + ')' : ''}</span>
                    </div>
                  ` : ''}

                  ${eduItem ? `
                    <div style="font-size: 0.78rem; color: #cbd5e1; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                      <span style="color: #a78bfa; flex-shrink: 0;">${svgIcon('award', '', 12)}</span>
                      <span><strong>${escapeHtml(eduItem.institution || '')}</strong> ${eduItem.degree ? '• ' + escapeHtml(eduItem.degree) : ''} ${eduItem.gpa ? '(GPA ' + escapeHtml(eduItem.gpa) + ')' : ''}</span>
                    </div>
                  ` : ''}

                  ${skillsList.length > 0 ? `
                    <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px;">
                      ${skillsList.slice(0, 6).map(s => `
                        <span style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: #e2e8f0; font-size: 0.72rem; font-weight: 600; padding: 2px 7px; border-radius: 4px;">
                          ${escapeHtml(s)}
                        </span>
                      `).join('')}
                    </div>
                  ` : '<div style="font-size: 0.76rem; color: var(--text-dim);">No special skills listed.</div>'}
                </div>

                <!-- 4. Screening Answers -->
                <div class="cand-review-card">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-size: 0.78rem; font-weight: 700; color: #fdba74; text-transform: uppercase; letter-spacing: 0.5px;">
                      Screening Questions (${screeningEntries.length})
                    </div>
                    <span style="font-size: 0.7rem; color: #34d399; font-weight: 700;">Verified Submission</span>
                  </div>
                  ${screeningEntries.length > 0 ? `
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                      ${screeningEntries.map(([q, a]) => `
                        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.06); padding: 7px 10px; border-radius: 6px;">
                          <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${escapeHtml(q)}</div>
                          <div style="font-size: 0.82rem; font-weight: 700; color: #34d399; margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                            ${svgIcon('check', '', 12)} ${escapeHtml(a)}
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  ` : `
                    <div style="font-size: 0.78rem; color: var(--text-dim); padding: 4px 0;">Standard direct application without custom pre-screening questionnaire.</div>
                  `}
                </div>

              </div>

              <!-- RIGHT COLUMN: Recruiter Pipeline Console & Actions -->
              <div style="display: flex; flex-direction: column; gap: 10px;">
                
                <!-- 1. Pipeline Stage Selection -->
                <div class="cand-review-card">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <label style="font-weight: 700; font-size: 0.82rem; color: var(--white); margin: 0;">
                      Pipeline Stage <span style="color: var(--orange-primary);">*</span>
                    </label>
                    <span style="font-size: 0.72rem; color: var(--text-dim);">Click to select</span>
                  </div>
                  
                  <div class="cand-status-pills-grid">
                    ${statusOptions.map(opt => `
                      <div class="cand-status-pill-btn ${currentStatus === opt.id ? 'active' : ''}" 
                           data-status="${opt.id}" 
                           onclick="setCandidateReviewStatus('${opt.id}')">
                        ${opt.label}
                      </div>
                    `).join('')}
                  </div>

                  <!-- Hidden native select for form serialization -->
                  <select id="select-cand-status" style="display: none;">
                    ${statusOptions.map(opt => `
                      <option value="${opt.id}" ${currentStatus === opt.id ? 'selected' : ''}>${opt.label}</option>
                    `).join('')}
                  </select>
                </div>

                <!-- 2. Interview Details -->
                <div class="cand-review-card">
                  <label style="display: block; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px; color: var(--white);">
                    Interview Schedule (Visible to Candidate)
                  </label>
                  <input type="text" id="input-interview-time" value="${escapeHtml(app.interview_time || '')}" 
                         placeholder="e.g. Next Sunday 02:30 PM at Executive Lounge"
                         style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: var(--radius-md); color: var(--white); font-size: 0.82rem;">
                  
                  <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
                    <button type="button" class="btn-secondary" style="padding: 2px 7px; font-size: 0.7rem;" 
                            onclick="setInterviewPreset('Tomorrow at 10:00 AM (Hotel Lobby Lounge)')">
                      Tomorrow 10 AM
                    </button>
                    <button type="button" class="btn-secondary" style="padding: 2px 7px; font-size: 0.7rem;" 
                            onclick="setInterviewPreset('Next Sunday at 02:30 PM (HR Executive Office)')">
                      Next Sun 2:30 PM
                    </button>
                    <button type="button" class="btn-secondary" style="padding: 2px 7px; font-size: 0.7rem;" 
                            onclick="setInterviewPreset('Online Video Interview via Microsoft Teams')">
                      Teams Video Call
                    </button>
                  </div>
                </div>

                <!-- 3. Private Recruiter Notes -->
                <div style="background: rgba(249, 115, 22, 0.06); border: 1px solid rgba(249, 115, 22, 0.25); padding: 10px 12px; border-radius: var(--radius-md);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <label style="font-weight: 700; font-size: 0.8rem; color: #fdba74; margin: 0;">Internal Recruiter Notes</label>
                    <span style="font-size: 0.68rem; color: #f97316; font-weight: 700; background: rgba(249,115,22,0.15); padding: 1px 6px; border-radius: 4px;">Private</span>
                  </div>
                  <textarea id="cand-private-notes" rows="3" placeholder="Add confidential hiring notes, interview performance rating, or candidate observations..."
                            style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: var(--radius-md); color: var(--white); font-size: 0.82rem; resize: none;">${escapeHtml(app.recruiter_notes || '')}</textarea>
                </div>

                <!-- 4. Decision Actions Footer -->
                <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                  <button type="button" class="btn-secondary" style="font-size: 0.8rem; padding: 9px 12px; white-space: nowrap;" 
                          onclick="closeModal('modal-cand-review'); openConversationForJob('${app.job_id}', '${app.business_id}', '${app.user_id}');">
                    ${svgIcon('messageCircle', '', 14)} Message
                  </button>
                  <button type="button" class="btn-orange" style="flex: 1; font-size: 0.85rem; font-weight: 800; padding: 9px 16px; justify-content: center;" 
                          onclick="saveCandidateStatus('${app.id}')">
                    ${svgIcon('check', '', 14)} Save Pipeline Status
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>
      </div>
    `;
  } catch(err) {
    console.error('[Candidate Review Error]', err);
    showToast('Could not open candidate review: ' + err.message, 'danger');
  }
}

window.openCandidateReviewModal = openCandidateReviewModal;

async function saveCandidateStatus(appId) {
  const status = document.getElementById('select-cand-status')?.value || 'under_review';
  const interviewTime = document.getElementById('input-interview-time')?.value || '';
  const notes = document.getElementById('cand-private-notes')?.value || '';
  const actorName = state.currentUser?.name ? `${state.currentUser.name} (${state.currentUser.title || 'Recruiter'})` : 'Hotel Recruiter';

  try {
    const res = await fetch(`/api/applications/${appId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: status,
        interview_time: interviewTime,
        recruiter_notes: notes,
        actor_name: actorName
      })
    });
    closeModal('modal-cand-review');
    showToast(`Status updated to '${status.replace('_', ' ')}'`, 'success');
    if (state.currentScreen === 'recruiter-dashboard') {
      renderRecruiterDashboard(document.getElementById('app-viewport'));
    } else {
      renderATSBoard(document.getElementById('app-viewport'));
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Interactive CV Viewer Modal
async function viewSubmittedApplicationCv(appId) {
  const viewerRole = state.currentRole;
  const viewerId = state.currentUser ? state.currentUser.id : null;

  try {
    const res = await fetch(`/api/applications/${appId}/cv?viewer_role=${viewerRole}&viewer_id=${viewerId}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Access denied');
    }
    const cvData = await res.json();

    const container = document.getElementById('modal-container');
    container.innerHTML = `
      <div class="modal-backdrop open" id="modal-cv-viewer">
        <div class="modal-dialog" style="max-width: 760px;">
          <div class="modal-header">
            <div>
              <div style="font-size: 0.8rem; color: var(--orange-primary); font-weight: 700;">Resume Preview</div>
              <h2 class="modal-title" style="display: flex; align-items: center; gap: 8px;">${svgIcon('fileText', '', 20)} ${cvData.selected_cv}</h2>
            </div>
            <button class="modal-close" onclick="closeModal('modal-cv-viewer')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
          </div>

          <div class="modal-body" style="background: #ffffff; color: #0f172a; border-radius: var(--radius-md); padding: 30px; margin: 12px; font-family: 'Plus Jakarta Sans', sans-serif;">
            <!-- Document Header -->
            <div style="border-bottom: 2px solid #2563eb; padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h1 style="font-size: 1.6rem; font-weight: 800; color: #1e3a8a; margin-bottom: 3px;">${cvData.candidate_name}</h1>
                <div style="font-size: 0.95rem; color: #f97316; font-weight: 700;">${cvData.headline || 'Front Office & Guest Relations Executive'}</div>
                <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">
                  ${svgIcon('phone', '', 14)} ${cvData.candidate_phone} • ${svgIcon('mail', '', 14)} ${cvData.candidate_email} • Dhaka, Bangladesh
                </div>
              </div>
              <span style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 9999px;">
                For ${cvData.brand_name}
              </span>
            </div>

            <!-- Summary -->
            <div style="margin-bottom: 16px;">
              <h3 style="font-size: 0.9rem; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Executive Summary</h3>
              <p style="font-size: 0.85rem; color: #334155; line-height: 1.6;">${cvData.summary || 'Hospitality professional with 5+ years of 5-star hotel front office excellence.'}</p>
            </div>

            <!-- Skills -->
            <div style="margin-bottom: 16px;">
              <h3 style="font-size: 0.9rem; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Skills & Tools</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${(cvData.skills || []).map(s => `<span style="background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; font-size: 0.75rem; font-weight: 600; padding: 3px 8px; border-radius: 4px;">${s}</span>`).join('')}
              </div>
            </div>

            <!-- Experience -->
            <div style="margin-bottom: 16px;">
              <h3 style="font-size: 0.9rem; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Career History</h3>
              ${(cvData.experience || []).map(exp => `
                <div style="margin-bottom: 10px; border-left: 2px solid #3b82f6; padding-left: 12px;">
                  <div style="font-weight: 800; font-size: 0.88rem; color: #0f172a;">${exp.role} — <span style="color: #2563eb;">${exp.hotel}</span></div>
                  <div style="font-size: 0.75rem; color: #64748b;">${exp.period}</div>
                  <div style="font-size: 0.8rem; color: #475569; margin-top: 3px;">${exp.description}</div>
                </div>
              `).join('')}
            </div>

            <!-- Education -->
            <div>
              <h3 style="font-size: 0.9rem; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Education</h3>
              ${(cvData.education || []).map(ed => `
                <div style="font-size: 0.82rem; color: #334155; margin-bottom: 3px;">
                  <strong>${ed.degree}</strong> — ${ed.institution} (${ed.year})
                </div>
              `).join('')}
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal('modal-cv-viewer')">Close</button>
            <button class="btn-orange" onclick="showToast('Downloading CV document...')">${svgIcon('download', '', 15)} Download PDF</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================================================
// Add New CV Modal with Interactive Drag & Drop + Device File Upload
// ==========================================================================
let addCvModalState = {
  file: null,
  fileName: '',
  fileSize: '',
  fileData: null
};

function handleProfileCvDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('profile-cv-dropzone');
  if (dropzone) dropzone.classList.add('drag-active');
}

function handleProfileCvDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('profile-cv-dropzone');
  if (dropzone) dropzone.classList.remove('drag-active');
}

function handleProfileCvDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('profile-cv-dropzone');
  if (dropzone) dropzone.classList.remove('drag-active');
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    processSelectedProfileCvFile(files[0]);
  }
}

function handleProfileCvFileSelected(event) {
  const file = event.target?.files?.[0];
  if (file) {
    processSelectedProfileCvFile(file);
  }
}

function processSelectedProfileCvFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'docx', 'doc'].includes(ext)) {
    showToast('Please upload a PDF or Word document (.pdf, .docx, .doc)', 'warning');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('CV file size exceeds 10MB limit', 'warning');
    return;
  }

  const formattedSize = file.size >= 1024 * 1024
    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(file.size / 1024)} KB`;

  addCvModalState.file = file;
  addCvModalState.fileName = file.name;
  addCvModalState.fileSize = formattedSize;

  const reader = new FileReader();
  reader.onload = (e) => {
    addCvModalState.fileData = e.target.result;
  };
  reader.readAsDataURL(file);

  const badge = document.getElementById('profile-cv-file-badge');
  const nameEl = document.getElementById('profile-cv-badge-name');
  const sizeEl = document.getElementById('profile-cv-badge-size');
  const titleInput = document.getElementById('profile-cv-title-input');

  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = formattedSize;
  if (badge) badge.style.display = 'flex';

  if (titleInput && !titleInput.value.trim()) {
    const cleanTitle = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    titleInput.value = cleanTitle;
  }

  showToast(`File attached: ${file.name} (${formattedSize})`, 'success');
}

function clearProfileCvFile() {
  addCvModalState.file = null;
  addCvModalState.fileName = '';
  addCvModalState.fileSize = '';
  addCvModalState.fileData = null;

  const fileInput = document.getElementById('profile-cv-file-input');
  if (fileInput) fileInput.value = '';

  const badge = document.getElementById('profile-cv-file-badge');
  if (badge) badge.style.display = 'none';
}

function openAddCvModal() {
  addCvModalState = {
    file: null,
    fileName: '',
    fileSize: '',
    fileData: null
  };

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-add-cv">
      <div class="modal-dialog" style="max-width: 520px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Upload Hospitality Resume</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Attach a tailored CV to your candidate profile</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-add-cv')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <form onsubmit="handleAddNewCv(event)">
          <div class="modal-body" style="padding: 22px; display: flex; flex-direction: column; gap: 16px;">
            <!-- Drag & Drop CV Upload Zone -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 8px; color: var(--white);">
                Resume Document <span style="color: #f87171;">*</span>
              </label>
              
              <div class="cv-dropzone" id="profile-cv-dropzone" 
                   onclick="document.getElementById('profile-cv-file-input').click()"
                   ondragover="handleProfileCvDragOver(event)"
                   ondragleave="handleProfileCvDragLeave(event)"
                   ondrop="handleProfileCvDrop(event)">
                <div class="cv-dropzone-inner" id="profile-cv-dropzone-content">
                  <div style="color: var(--orange-primary);">${svgIcon('upload', '', 36)}</div>
                  <strong style="color: var(--white); font-size: 0.95rem; margin-top: 6px;">Choose a file or drag &amp; drop it here</strong>
                  <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 3px;">
                    Drag &amp; drop your CV here, or <span style="color: var(--orange-primary); font-weight: 700; text-decoration: underline;">browse device</span>
                  </div>
                  <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 4px;">PDF, DOCX, DOC (up to 10MB)</div>
                </div>
                <input type="file" id="profile-cv-file-input" style="display: none;" accept=".pdf,.docx,.doc" onchange="handleProfileCvFileSelected(event)">
              </div>

              <!-- Selected File Preview Badge -->
              <div id="profile-cv-file-badge" style="display: none; margin-top: 10px; background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.35); border-radius: var(--radius-md); padding: 10px 14px; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                  <span style="color: var(--blue-primary); flex-shrink: 0;">${svgIcon('fileText', '', 24)}</span>
                  <div style="min-width: 0;">
                    <div id="profile-cv-badge-name" style="font-weight: 700; font-size: 0.88rem; color: var(--white); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
                    <div id="profile-cv-badge-size" style="font-size: 0.74rem; color: var(--text-muted);"></div>
                  </div>
                </div>
                <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem; color: #f87171;" onclick="clearProfileCvFile()">Remove</button>
              </div>
            </div>

            <!-- Resume Title -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                Resume Title <span style="color: #f87171;">*</span>
              </label>
              <input type="text" id="profile-cv-title-input" name="title" required placeholder="e.g. Front Office &amp; Guest Relations CV" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              <div style="font-size: 0.74rem; color: var(--text-dim); margin-top: 4px;">Give this resume a descriptive title for your applications.</div>
            </div>

            <!-- Set as Default Checkbox -->
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--white); cursor: pointer; user-select: none;">
              <input type="checkbox" id="profile-cv-default-checkbox" name="is_default"> Set as default resume for future job applications
            </label>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-add-cv')">Cancel</button>
            <button type="submit" id="btn-submit-cv-upload" class="btn-orange" style="display: inline-flex; align-items: center; gap: 6px;">
              ${svgIcon('upload', '', 15)} Upload &amp; Save Resume
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleAddNewCv(event) {
  event.preventDefault();
  const form = event.target;
  const title = form.title.value.trim();

  const fileName = addCvModalState.fileName;
  if (!fileName) {
    showToast('Please select or drop a CV document to upload.', 'warning');
    return;
  }

  const uId = state.currentUser?.id;
  if (!uId) {
    showToast('Please log in to upload your resume.', 'danger');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-cv-upload');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Uploading...';
  }

  const payload = {
    user_id: uId,
    title: title || fileName,
    name: fileName,
    size: addCvModalState.fileSize || '250 KB',
    is_default: form.is_default.checked,
    file_data: addCvModalState.fileData || null
  };

  try {
    const res = await fetch('/api/profile/cvs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to upload resume');

    closeModal('modal-add-cv');
    showToast(`Resume "${payload.title}" uploaded successfully.`, 'success');

    // Reload profile data and refresh view
    const profRes = await fetch(`/api/profile?user_id=${uId}`);
    if (profRes.ok) {
      state.profile = await profRes.json();
    }
    renderProfileScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${svgIcon('upload', '', 15)} Upload &amp; Save Resume`;
    }
  }
}

async function setDefaultCv(cvId) {
  const uId = state.currentUser?.id;
  if (!uId) return;
  try {
    await fetch(`/api/profile/cvs/${cvId}/default?user_id=${uId}`, { method: 'PATCH' });
    showToast('Default resume updated.');
    await loadInitialData();
    renderProfileScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function deleteCv(cvId) {
  const uId = state.currentUser?.id;
  if (!uId) return;
  try {
    await fetch(`/api/profile/cvs/${cvId}?user_id=${uId}`, { method: 'DELETE' });
    showToast('Resume removed.');
    await loadInitialData();
    renderProfileScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================================================
// Individual Profile Edit Modals & Candidate CV Preview
// ==========================================================================

async function saveProfileField(patchObj) {
  const userId = state.currentUser ? state.currentUser.id : (state.demoDataHidden ? null : 'user_rahim');
  if (!userId) {
    showToast('Please sign in to update your profile.', 'danger');
    return;
  }
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        ...patchObj
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update profile');
    showToast('Profile updated successfully!', 'success');
    await loadInitialData();
    renderProfileScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Preview Candidate CV Modal
function previewCandidateCvModal(cvTitle, cvName) {
  const profile = state.profile || {};
  const name = profile.name || state.currentUser?.name || 'Hospitality Candidate';
  const headline = profile.headline || 'Hospitality Specialist';
  const email = profile.email || state.currentUser?.email || '';
  const phone = profile.phone || state.currentUser?.phone || '';
  const location = profile.location || 'Dhaka, Bangladesh';
  const summary = profile.summary || 'Hospitality professional.';
  const experience = profile.experience || [];
  const skills = profile.skills || [];
  const languages = profile.languages || [];
  const certifications = profile.certifications || [];

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-candidate-cv-preview">
      <div class="modal-dialog" style="max-width: 800px; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px;">
          <div>
            <h2 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
              ${svgIcon('fileText', 'var(--orange-primary)', 20)}
              ${cvTitle || cvName || 'Hospitality Resume'}
            </h2>
            <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 2px;">
              Document: ${cvName || 'Resume.pdf'} • Formatted for 5-Star Hotel HR Verification
            </div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-candidate-cv-preview')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <div class="modal-body" style="overflow-y: auto; padding: 24px; background: #070d1e;">
          <!-- Paper Resume Simulation -->
          <div style="background: #ffffff; color: #1e293b; border-radius: 8px; padding: 32px 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); font-family: 'Inter', -apple-system, sans-serif;">
            
            <!-- Resume Header -->
            <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
              <div>
                <h1 style="font-size: 1.6rem; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; letter-spacing: -0.5px;">${name}</h1>
                <div style="font-size: 0.95rem; font-weight: 600; color: #2563eb;">${headline}</div>
              </div>
              <div style="text-align: right; font-size: 0.78rem; color: #64748b; line-height: 1.5;">
                <div>${email}</div>
                <div>+88 ${phone}</div>
                <div>${location}</div>
              </div>
            </div>

            <!-- Professional Summary -->
            <div style="margin-bottom: 18px;">
              <h3 style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">Professional Summary</h3>
              <p style="font-size: 0.84rem; line-height: 1.6; color: #334155; margin: 0;">${summary}</p>
            </div>

            <!-- Experience -->
            <div style="margin-bottom: 18px;">
              <h3 style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px;">Hospitality Experience</h3>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                ${experience.length === 0 ? '<div style="font-size: 0.82rem; color: #64748b;">No experience listed.</div>' : experience.map(e => `
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: baseline;">
                      <span style="font-weight: 700; font-size: 0.9rem; color: #0f172a;">${e.role}</span>
                      <span style="font-size: 0.78rem; font-weight: 600; color: #64748b;">${e.period}</span>
                    </div>
                    <div style="font-size: 0.82rem; font-weight: 600; color: #f97316; margin-bottom: 4px;">${e.hotel}</div>
                    <p style="font-size: 0.8rem; color: #475569; margin: 0; line-height: 1.5;">${e.description || ''}</p>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Skills -->
            <div style="margin-bottom: 18px;">
              <h3 style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">Key Hospitality Skills</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${skills.length === 0 ? '<div style="font-size: 0.82rem; color: #64748b;">No skills listed.</div>' : skills.map(s => `
                  <span style="background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; font-weight: 600; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px;">${s}</span>
                `).join('')}
              </div>
            </div>

            <!-- Certifications & Languages Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <h3 style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">Accreditations</h3>
                <div style="font-size: 0.78rem; color: #334155; line-height: 1.6;">
                  ${certifications.length === 0 ? '<div style="color: #64748b;">None listed.</div>' : certifications.map(c => `<div><strong>${c.title}</strong> - ${c.issuer} (${c.year})</div>`).join('')}
                </div>
              </div>
              <div>
                <h3 style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">Languages</h3>
                <div style="font-size: 0.78rem; color: #334155; line-height: 1.6;">
                  ${languages.length === 0 ? '<div style="color: #64748b;">None listed.</div>' : languages.map(l => `<div><strong>${l.name}</strong>: ${l.level}</div>`).join('')}
                </div>
              </div>
            </div>

          </div>
        </div>

        <div class="modal-footer" style="border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 0.78rem; color: var(--text-dim); display: flex; align-items: center; gap: 6px;">
            ${svgIcon('shield', '#10b981', 14)} Verified NiceJobs Candidate Profile
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-candidate-cv-preview')">Close Preview</button>
            <button type="button" class="btn-orange" onclick="showToast('Downloading verified CV copy...', 'info'); closeModal('modal-candidate-cv-preview');">${svgIcon('download', '', 14)} Download PDF</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function previewCvDoc(cvName) {
  previewCandidateCvModal('Hospitality CV Preview', cvName);
}

// 1. Edit Summary Modal
function openEditSummaryModal() {
  const currentSummary = state.profile?.summary || '';
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-summary">
      <div class="modal-dialog" style="max-width: 560px;">
        <div class="modal-header">
          <h2 class="modal-title">Edit Professional Summary</h2>
          <button class="modal-close" onclick="closeModal('modal-edit-summary')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>
        <form onsubmit="handleSaveSummaryModal(event)">
          <div class="modal-body">
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Professional Summary</label>
              <textarea id="edit-summary-text" rows="5" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 10px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem; line-height: 1.6;">${currentSummary}</textarea>
              <p style="font-size: 0.78rem; color: var(--text-dim); margin-top: 6px;">Highlight your 5-star hospitality experience, departments, guest relations, or leadership background.</p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-summary')">Cancel</button>
            <button type="submit" class="btn-orange">Save Summary</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleSaveSummaryModal(e) {
  e.preventDefault();
  const summary = (document.getElementById('edit-summary-text')?.value || '').trim();
  closeModal('modal-edit-summary');
  await saveProfileField({ summary });
}

// 2. Edit Experience Modal
let editExperienceList = [];

function openEditExperienceModal() {
  editExperienceList = JSON.parse(JSON.stringify(state.profile?.experience || []));
  renderExperienceModalDOM();
}

function renderExperienceModalDOM() {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-experience">
      <div class="modal-dialog" style="max-width: 650px;">
        <div class="modal-header">
          <h2 class="modal-title">Hospitality Experience</h2>
          <button class="modal-close" onclick="closeModal('modal-edit-experience')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>
        <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
          <div id="experience-entries-list" style="display: flex; flex-direction: column; gap: 14px;">
            ${editExperienceList.map((exp, idx) => `
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px; position: relative;">
                <button type="button" onclick="removeExpEntry(${idx})" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: #f87171; cursor: pointer;" title="Remove Entry">${svgIcon('x', '', 14)}</button>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 3px;">Role / Position</label>
                    <input type="text" value="${exp.role || ''}" onchange="updateExpEntry(${idx}, 'role', this.value)" placeholder="Your Designation" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 3px;">Hotel / Property</label>
                    <input type="text" value="${exp.hotel || ''}" onchange="updateExpEntry(${idx}, 'hotel', this.value)" placeholder="Your Previous Employer" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                  </div>
                </div>
                <div style="margin-bottom: 8px;">
                  <label style="display: block; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 3px;">Period</label>
                  <input type="text" value="${exp.period || ''}" onchange="updateExpEntry(${idx}, 'period', this.value)" placeholder="Years in Service" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                </div>
                <div>
                  <label style="display: block; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 3px;">Key Responsibilities &amp; Tools</label>
                  <textarea rows="2" onchange="updateExpEntry(${idx}, 'description', this.value)" placeholder="Opera PMS, VIP guest relations, check-in operations..." style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: 6px; color: var(--white); font-size: 0.82rem; line-height: 1.4;">${exp.description || ''}</textarea>
                </div>
              </div>
            `).join('')}
            ${editExperienceList.length === 0 ? '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 12px;">No experience added yet. Click below to add.</div>' : ''}
          </div>
          <button type="button" class="btn-secondary" style="width: 100%; margin-top: 12px; padding: 8px; font-size: 0.85rem;" onclick="addExpEntry()">+ Add Another Experience</button>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-experience')">Cancel</button>
          <button type="button" class="btn-orange" onclick="saveExperienceChanges()">Save Experience</button>
        </div>
      </div>
    </div>
  `;
}

function addExpEntry() {
  editExperienceList.push({ role: '', hotel: '', period: '', description: '' });
  renderExperienceModalDOM();
}

function removeExpEntry(idx) {
  editExperienceList.splice(idx, 1);
  renderExperienceModalDOM();
}

function updateExpEntry(idx, field, val) {
  if (editExperienceList[idx]) editExperienceList[idx][field] = val;
}

async function saveExperienceChanges() {
  const filtered = editExperienceList.filter(e => e.role && e.hotel);
  closeModal('modal-edit-experience');
  await saveProfileField({ experience: filtered });
}

// 3. Edit Credentials Modal
let editCredentialsList = [];

function openEditCredentialsModal() {
  editCredentialsList = JSON.parse(JSON.stringify(state.profile?.certifications || []));
  renderCredentialsModalDOM();
}

function renderCredentialsModalDOM() {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-credentials">
      <div class="modal-dialog" style="max-width: 600px;">
        <div class="modal-header">
          <h2 class="modal-title">Credentials &amp; Accreditations</h2>
          <button class="modal-close" onclick="closeModal('modal-edit-credentials')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>
        <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
          <div id="credentials-entries-list" style="display: flex; flex-direction: column; gap: 12px;">
            ${editCredentialsList.map((c, idx) => `
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px; position: relative;">
                <button type="button" onclick="removeCredEntry(${idx})" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: #f87171; cursor: pointer;" title="Remove">${svgIcon('x', '', 14)}</button>
                <div style="margin-bottom: 8px;">
                  <label style="display: block; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 3px;">Certification Title</label>
                  <input type="text" value="${c.title || ''}" onchange="updateCredEntry(${idx}, 'title', this.value)" placeholder="Certificate" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px;">
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 3px;">Issuing Organization</label>
                    <input type="text" value="${c.issuer || ''}" onchange="updateCredEntry(${idx}, 'issuer', this.value)" placeholder="Issued By" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                  </div>
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: var(--text-dim); margin-bottom: 3px;">Year</label>
                    <input type="text" value="${c.year || ''}" onchange="updateCredEntry(${idx}, 'year', this.value)" placeholder="Year Obtained" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 7px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                  </div>
                </div>
              </div>
            `).join('')}
            ${editCredentialsList.length === 0 ? '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 12px;">No credentials added yet. Click below to add.</div>' : ''}
          </div>
          <button type="button" class="btn-secondary" style="width: 100%; margin-top: 12px; padding: 8px; font-size: 0.85rem;" onclick="addCredEntry()">+ Add Another Credential</button>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-credentials')">Cancel</button>
          <button type="button" class="btn-orange" onclick="saveCredentialsChanges()">Save Credentials</button>
        </div>
      </div>
    </div>
  `;
}

function addCredEntry() {
  editCredentialsList.push({ title: '', issuer: '', year: '' });
  renderCredentialsModalDOM();
}

function removeCredEntry(idx) {
  editCredentialsList.splice(idx, 1);
  renderCredentialsModalDOM();
}

function updateCredEntry(idx, field, val) {
  if (editCredentialsList[idx]) editCredentialsList[idx][field] = val;
}

async function saveCredentialsChanges() {
  const filtered = editCredentialsList.filter(c => c.title);
  closeModal('modal-edit-credentials');
  await saveProfileField({ certifications: filtered });
}

// 4. Edit Skills Modal
window.editSkillsModalState = {
  selected: [],
  query: '',
  customPool: []
};

function openEditSkillsModal() {
  window.editSkillsModalState = {
    selected: [...(state.profile?.skills || [])],
    query: '',
    customPool: []
  };
  renderEditSkillsModalDOM();
}

function filterEditSkillsModal(q) {
  if (!window.editSkillsModalState) return;
  window.editSkillsModalState.query = q;
  updateEditSkillsModalDOM();
}

function toggleEditSkillModal(skill) {
  if (!window.editSkillsModalState) return;
  const idx = window.editSkillsModalState.selected.indexOf(skill);
  if (idx >= 0) {
    window.editSkillsModalState.selected.splice(idx, 1);
  } else {
    // Stack logic: selected goes to top of stack
    window.editSkillsModalState.selected.unshift(skill);
  }
  updateEditSkillsModalDOM();
}

function addCustomEditSkillModal(skill) {
  if (!window.editSkillsModalState || !skill) return;
  const trimmed = skill.trim();
  if (trimmed) {
    if (!window.editSkillsModalState.customPool.includes(trimmed)) {
      window.editSkillsModalState.customPool.push(trimmed);
    }
    const idx = window.editSkillsModalState.selected.indexOf(trimmed);
    if (idx >= 0) window.editSkillsModalState.selected.splice(idx, 1);
    window.editSkillsModalState.selected.unshift(trimmed);
    window.editSkillsModalState.query = '';
    const input = document.getElementById('modal-skills-search');
    if (input) input.value = '';
    showToast(`Added "${trimmed}" to skills`, 'success');
    updateEditSkillsModalDOM();
  }
}

function updateEditSkillsModalDOM() {
  if (!window.editSkillsModalState) return;
  const q = (window.editSkillsModalState.query || '').toLowerCase().trim();
  const allPool = Array.from(new Set([...(window.editSkillsModalState.customPool || []), ...HOTEL_SKILLS_SCHEMA]));
  const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);

  const chipContainer = document.getElementById('modal-skills-add-chip-container');
  if (chipContainer) {
    if (q && !hasExactMatch) {
      chipContainer.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomEditSkillModal('${window.editSkillsModalState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${window.editSkillsModalState.query}" to skills
        </div>
      `;
    } else {
      chipContainer.innerHTML = '';
    }
  }

  const pillsPool = document.getElementById('modal-skills-pills-pool');
  if (pillsPool) {
    const selectedStack = (window.editSkillsModalState.selected || []).filter(s => !q || s.toLowerCase().includes(q));
    const unselectedPool = allPool.filter(s => !window.editSkillsModalState.selected.includes(s)).filter(s => !q || s.toLowerCase().includes(q));

    animateSchemaPillsPool(pillsPool, () => {
      pillsPool.innerHTML = [
        ...selectedStack.map(s => `
          <span class="schema-pill-item selected" data-pill-key="${s}" onclick="toggleEditSkillModal('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
            ✓ ${s}
          </span>
        `),
        ...unselectedPool.map(s => `
          <span class="schema-pill-item" data-pill-key="${s}" onclick="toggleEditSkillModal('${s.replace(/'/g, "\\'")}')" title="Click to select">
            + ${s}
          </span>
        `)
      ].join('');
    });
  }
}

function renderEditSkillsModalDOM() {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-skills">
      <div class="modal-dialog" style="max-width: 600px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Edit Hospitality Skills</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Select or add professional hotel skills, systems &amp; operational competencies</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-edit-skills')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>
        <div class="modal-body">
          <div class="schema-box-wrapper" style="margin-bottom: 0;">
            <input type="text" class="schema-search-input" id="modal-skills-search" 
              placeholder="Type skill and press Enter to add..." 
              value="${window.editSkillsModalState.query || ''}" 
              oninput="filterEditSkillsModal(this.value)"
              onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomEditSkillModal(this.value);}">

            <div id="modal-skills-add-chip-container">
              ${(() => {
                const q = (window.editSkillsModalState.query || '').toLowerCase().trim();
                const allPool = Array.from(new Set([...(window.editSkillsModalState.customPool || []), ...HOTEL_SKILLS_SCHEMA]));
                const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);
                if (q && !hasExactMatch) {
                  return `
                    <div class="schema-add-chip" onclick="addCustomEditSkillModal('${window.editSkillsModalState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                      + Add "${window.editSkillsModalState.query}" to skills
                    </div>
                  `;
                }
                return '';
              })()}
            </div>

            <div class="schema-pills-pool" id="modal-skills-pills-pool" style="max-height: 280px;">
              ${(() => {
                const q = (window.editSkillsModalState.query || '').toLowerCase().trim();
                const allPool = Array.from(new Set([...(window.editSkillsModalState.customPool || []), ...HOTEL_SKILLS_SCHEMA]));
                const selectedStack = (window.editSkillsModalState.selected || []).filter(s => !q || s.toLowerCase().includes(q));
                const unselectedPool = allPool.filter(s => !window.editSkillsModalState.selected.includes(s)).filter(s => !q || s.toLowerCase().includes(q));

                return [
                  ...selectedStack.map(s => `
                    <span class="schema-pill-item selected" data-pill-key="${s}" onclick="toggleEditSkillModal('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
                      ✓ ${s}
                    </span>
                  `),
                  ...unselectedPool.map(s => `
                    <span class="schema-pill-item" data-pill-key="${s}" onclick="toggleEditSkillModal('${s.replace(/'/g, "\\'")}')" title="Click to select">
                      + ${s}
                    </span>
                  `)
                ].join('');
              })()}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-skills')">Cancel</button>
          <button type="button" class="btn-orange" onclick="saveSkillsChanges()">Save Skills</button>
        </div>
      </div>
    </div>
  `;
}

async function saveSkillsChanges() {
  const selectedSkills = window.editSkillsModalState ? window.editSkillsModalState.selected : [];
  closeModal('modal-edit-skills');
  await saveProfileField({ skills: selectedSkills });
}

// 5. Edit Languages Modal
let editLanguagesList = [];

function openEditLanguagesModal() {
  editLanguagesList = JSON.parse(JSON.stringify(state.profile?.languages || []));
  renderEditLanguagesModalDOM();
}

function toggleEditLangPreset(name, level) {
  const idx = editLanguagesList.findIndex(l => l.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    if (editLanguagesList[idx].level === level) {
      editLanguagesList.splice(idx, 1);
    } else {
      editLanguagesList[idx].level = level;
    }
  } else {
    editLanguagesList.unshift({ name, level });
  }
  renderEditLanguagesModalDOM();
}

function renderEditLanguagesModalDOM() {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-languages">
      <div class="modal-dialog" style="max-width: 580px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Edit Languages</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Manage spoken and written language competencies</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-edit-languages')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>
        <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
          <!-- Quick Preset Languages Schema Pills -->
          <div style="margin-bottom: 14px;">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); margin-bottom: 6px;">Quick Presets (Click to add / toggle):</div>
            <div class="schema-pills-pool" style="max-height: 90px; margin-bottom: 0;">
              ${HOTEL_LANGUAGES_PRESETS.map(lp => {
                const isSelected = editLanguagesList.some(l => l.name.toLowerCase() === lp.name.toLowerCase() && l.level === lp.level);
                return `
                  <span class="schema-pill-item ${isSelected ? 'selected' : ''}" onclick="toggleEditLangPreset('${lp.name.replace(/'/g, "\\'")}', '${lp.level}')">
                    ${isSelected ? '✓ ' : '+ '}${lp.name} (${lp.level})
                  </span>
                `;
              }).join('')}
            </div>
          </div>

          <div id="languages-entries-list" style="display: flex; flex-direction: column; gap: 10px;">
            ${editLanguagesList.map((lang, idx) => `
              <div style="display: flex; align-items: center; gap: 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 8px 12px;">
                <input type="text" value="${lang.name || ''}" onchange="updateLangEntry(${idx}, 'name', this.value)" placeholder="Language" style="flex: 2; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 6px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                <select onchange="updateLangEntry(${idx}, 'level', this.value)" style="flex: 2; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 6px 10px; border-radius: 6px; color: var(--white); font-size: 0.85rem;">
                  <option value="Native" ${lang.level === 'Native' ? 'selected' : ''}>Native</option>
                  <option value="Fluent" ${lang.level === 'Fluent' ? 'selected' : ''}>Fluent</option>
                  <option value="Professional" ${lang.level === 'Professional' ? 'selected' : ''}>Professional</option>
                  <option value="Intermediate" ${lang.level === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                  <option value="Basic" ${lang.level === 'Basic' ? 'selected' : ''}>Basic</option>
                </select>
                <button type="button" onclick="removeLangEntry(${idx})" style="background: none; border: none; color: #f87171; cursor: pointer; padding: 4px;" title="Remove">${svgIcon('x', '', 16)}</button>
              </div>
            `).join('')}
            ${editLanguagesList.length === 0 ? '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 12px;">No languages added yet. Click below or use presets above.</div>' : ''}
          </div>
          <button type="button" class="btn-secondary" style="width: 100%; margin-top: 12px; padding: 8px; font-size: 0.85rem;" onclick="addLangEntry()">+ Add Custom Language</button>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-languages')">Cancel</button>
          <button type="button" class="btn-orange" onclick="saveLanguagesChanges()">Save Languages</button>
        </div>
      </div>
    </div>
  `;
}

function addLangEntry() {
  editLanguagesList.push({ name: '', level: 'Professional' });
  renderEditLanguagesModalDOM();
}

function removeLangEntry(idx) {
  editLanguagesList.splice(idx, 1);
  renderEditLanguagesModalDOM();
}

function updateLangEntry(idx, field, val) {
  if (editLanguagesList[idx]) editLanguagesList[idx][field] = val;
}

async function saveLanguagesChanges() {
  const filtered = editLanguagesList.filter(l => l.name);
  closeModal('modal-edit-languages');
  await saveProfileField({ languages: filtered });
}

// 6. Edit Job Preferences Modal
window.editPrefLocState = {
  selected: [],
  query: '',
  customPool: []
};

function filterPrefLocationsModal(q) {
  if (!window.editPrefLocState) return;
  window.editPrefLocState.query = q;
  updatePrefLocationsModalDOM();
}

function togglePrefLocationModal(loc) {
  if (!window.editPrefLocState) return;
  const idx = window.editPrefLocState.selected.indexOf(loc);
  if (idx >= 0) {
    window.editPrefLocState.selected.splice(idx, 1);
  } else {
    window.editPrefLocState.selected.unshift(loc);
  }
  updatePrefLocationsModalDOM();
}

function addCustomPrefLocationModal(loc) {
  if (!window.editPrefLocState || !loc) return;
  const trimmed = loc.trim();
  if (trimmed) {
    if (!window.editPrefLocState.customPool.includes(trimmed)) {
      window.editPrefLocState.customPool.push(trimmed);
    }
    const idx = window.editPrefLocState.selected.indexOf(trimmed);
    if (idx >= 0) window.editPrefLocState.selected.splice(idx, 1);
    window.editPrefLocState.selected.unshift(trimmed);
    window.editPrefLocState.query = '';
    const input = document.getElementById('edit-pref-loc-search');
    if (input) input.value = '';
    showToast(`Added "${trimmed}" to target locations`, 'success');
    updatePrefLocationsModalDOM();
  }
}

function updatePrefLocationsModalDOM() {
  if (!window.editPrefLocState) return;
  const q = (window.editPrefLocState.query || '').toLowerCase().trim();
  const allPool = Array.from(new Set([...(window.editPrefLocState.customPool || []), ...PREF_LOCATIONS_POOL]));
  const hasExactMatch = q && allPool.some(l => l.toLowerCase() === q);

  const chipContainer = document.getElementById('edit-pref-loc-chip-container');
  if (chipContainer) {
    if (q && !hasExactMatch) {
      chipContainer.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomPrefLocationModal('${window.editPrefLocState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${window.editPrefLocState.query}" to target locations
        </div>
      `;
    } else {
      chipContainer.innerHTML = '';
    }
  }

  const pillsPool = document.getElementById('edit-pref-loc-pills-pool');
  if (pillsPool) {
    const selectedStack = (window.editPrefLocState.selected || []).filter(l => !q || l.toLowerCase().includes(q));
    const unselectedPool = allPool.filter(l => !window.editPrefLocState.selected.includes(l)).filter(l => !q || l.toLowerCase().includes(q));

    animateSchemaPillsPool(pillsPool, () => {
      pillsPool.innerHTML = [
        ...selectedStack.map(l => `
          <span class="schema-pill-item selected" data-pill-key="${l}" onclick="togglePrefLocationModal('${l.replace(/'/g, "\\'")}')" title="Click to unselect">
            ✓ ${l}
          </span>
        `),
        ...unselectedPool.map(l => `
          <span class="schema-pill-item" data-pill-key="${l}" onclick="togglePrefLocationModal('${l.replace(/'/g, "\\'")}')" title="Click to select">
            + ${l}
          </span>
        `)
      ].join('');
    });
  }
}

function openEditJobPreferencesModal() {
  const prefs = state.profile?.preferences || {};
  window.editPrefLocState = {
    selected: [...(prefs.locations || ['Dhaka'])],
    query: '',
    customPool: []
  };

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-preferences">
      <div class="modal-dialog" style="max-width: 580px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Edit Job Preferences</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Set desired salary, target locations, and joining timeline</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-edit-preferences')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>
        <form onsubmit="handleSavePreferencesModal(event)">
          <div class="modal-body">
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Expected Monthly Salary</label>
              <input type="text" id="edit-pref-salary" value="${prefs.expected_salary || '৳55,000'}" placeholder="Amount or Negotiable" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>

            <!-- Target Locations Schema Select -->
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Target Locations</label>
              <div class="schema-box-wrapper" style="margin-bottom: 0;">
                <input type="text" class="schema-search-input" id="edit-pref-loc-search" 
                  placeholder="Type city/district and press Enter to add..." 
                  value="${window.editPrefLocState.query || ''}" 
                  oninput="filterPrefLocationsModal(this.value)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomPrefLocationModal(this.value);}">

                <div id="edit-pref-loc-chip-container">
                  ${(() => {
                    const q = (window.editPrefLocState.query || '').toLowerCase().trim();
                    const allPool = Array.from(new Set([...(window.editPrefLocState.customPool || []), ...PREF_LOCATIONS_POOL]));
                    const hasExactMatch = q && allPool.some(l => l.toLowerCase() === q);
                    if (q && !hasExactMatch) {
                      return `
                        <div class="schema-add-chip" onclick="addCustomPrefLocationModal('${window.editPrefLocState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                          + Add "${window.editPrefLocState.query}" to target locations
                        </div>
                      `;
                    }
                    return '';
                  })()}
                </div>

                <div class="schema-pills-pool" id="edit-pref-loc-pills-pool" style="max-height: 160px;">
                  ${(() => {
                    const q = (window.editPrefLocState.query || '').toLowerCase().trim();
                    const allPool = Array.from(new Set([...(window.editPrefLocState.customPool || []), ...PREF_LOCATIONS_POOL]));
                    const selectedStack = (window.editPrefLocState.selected || []).filter(l => !q || l.toLowerCase().includes(q));
                    const unselectedPool = allPool.filter(l => !window.editPrefLocState.selected.includes(l)).filter(l => !q || l.toLowerCase().includes(q));

                    return [
                      ...selectedStack.map(l => `
                        <span class="schema-pill-item selected" data-pill-key="${l}" onclick="togglePrefLocationModal('${l.replace(/'/g, "\\'")}')" title="Click to unselect">
                          ✓ ${l}
                        </span>
                      `),
                      ...unselectedPool.map(l => `
                        <span class="schema-pill-item" data-pill-key="${l}" onclick="togglePrefLocationModal('${l.replace(/'/g, "\\'")}')" title="Click to select">
                          + ${l}
                        </span>
                      `)
                    ].join('');
                  })()}
                </div>
              </div>
            </div>

            <div style="margin-bottom: 12px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Notice Period</label>
              <select id="edit-pref-notice" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                <option value="Immediate" ${prefs.notice_period === 'Immediate' ? 'selected' : ''}>Immediate</option>
                <option value="15 Days" ${prefs.notice_period === '15 Days' ? 'selected' : ''}>15 Days</option>
                <option value="1 Month" ${prefs.notice_period === '1 Month' ? 'selected' : ''}>1 Month</option>
                <option value="2 Months" ${prefs.notice_period === '2 Months' ? 'selected' : ''}>2 Months</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-preferences')">Cancel</button>
            <button type="submit" class="btn-orange">Save Preferences</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleSavePreferencesModal(e) {
  e.preventDefault();
  const salary = (document.getElementById('edit-pref-salary')?.value || '').trim();
  const locs = window.editPrefLocState ? window.editPrefLocState.selected : ((document.getElementById('edit-pref-loc')?.value || '').split(',').map(s => s.trim()).filter(Boolean));
  const notice = document.getElementById('edit-pref-notice')?.value || 'Immediate';

  closeModal('modal-edit-preferences');
  await saveProfileField({
    preferences: {
      expected_salary: salary,
      locations: locs,
      notice_period: notice
    }
  });
}

// Comprehensive Edit Profile Modal - Skills Schema State & Helpers
window.compEditSkillsState = {
  selected: [],
  query: '',
  customPool: []
};

function filterCompEditSkills(q) {
  if (!window.compEditSkillsState) return;
  window.compEditSkillsState.query = q;
  updateCompEditSkillsDOM();
}

function toggleCompEditSkill(skill) {
  if (!window.compEditSkillsState) return;
  const idx = window.compEditSkillsState.selected.indexOf(skill);
  if (idx >= 0) {
    window.compEditSkillsState.selected.splice(idx, 1);
  } else {
    // Stack logic: latest selected goes to the top of the stack
    window.compEditSkillsState.selected.unshift(skill);
  }
  updateCompEditSkillsDOM();
}

function addCustomCompEditSkill(skill) {
  if (!window.compEditSkillsState || !skill) return;
  const trimmed = skill.trim();
  if (trimmed) {
    if (!window.compEditSkillsState.customPool.includes(trimmed)) {
      window.compEditSkillsState.customPool.push(trimmed);
    }
    const idx = window.compEditSkillsState.selected.indexOf(trimmed);
    if (idx >= 0) window.compEditSkillsState.selected.splice(idx, 1);
    window.compEditSkillsState.selected.unshift(trimmed);
    window.compEditSkillsState.query = '';
    const input = document.getElementById('comp-skills-search');
    if (input) input.value = '';
    showToast(`Added "${trimmed}" to skills`, 'success');
    updateCompEditSkillsDOM();
  }
}

function updateCompEditSkillsDOM() {
  if (!window.compEditSkillsState) return;
  const q = (window.compEditSkillsState.query || '').toLowerCase().trim();
  const allPool = Array.from(new Set([...(window.compEditSkillsState.customPool || []), ...HOTEL_SKILLS_SCHEMA]));
  const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);

  const chipContainer = document.getElementById('comp-skills-add-chip-container');
  if (chipContainer) {
    if (q && !hasExactMatch) {
      chipContainer.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomCompEditSkill('${window.compEditSkillsState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${window.compEditSkillsState.query}" to skills
        </div>
      `;
    } else {
      chipContainer.innerHTML = '';
    }
  }

  const pillsPool = document.getElementById('comp-skills-pills-pool');
  if (pillsPool) {
    const selectedStack = (window.compEditSkillsState.selected || []).filter(s => !q || s.toLowerCase().includes(q));
    const unselectedPool = allPool.filter(s => !window.compEditSkillsState.selected.includes(s)).filter(s => !q || s.toLowerCase().includes(q));

    animateSchemaPillsPool(pillsPool, () => {
      pillsPool.innerHTML = [
        ...selectedStack.map(s => `
          <span class="schema-pill-item selected" data-pill-key="${s}" onclick="toggleCompEditSkill('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
            ✓ ${s}
          </span>
        `),
        ...unselectedPool.map(s => `
          <span class="schema-pill-item" data-pill-key="${s}" onclick="toggleCompEditSkill('${s.replace(/'/g, "\\'")}')" title="Click to select">
            + ${s}
          </span>
        `)
      ].join('');
    });
  }
}

// Edit Profile Modal
async function openComprehensiveEditProfileModal() {
  const userId = state.currentUser ? state.currentUser.id : (state.demoDataHidden ? null : 'user_rahim');
  if (!userId) {
    showToast('Please sign in to edit your candidate profile.', 'danger');
    return;
  }
  const res = await fetch(`/api/profile?user_id=${userId}`);
  if (!res.ok) {
    showToast('Profile not found', 'danger');
    return;
  }
  const profile = await res.json();
  state.profile = profile;

  window.compEditSkillsState = {
    selected: [...(profile.skills || [])],
    query: '',
    customPool: []
  };

  editPfpState.candidate = {
    raw: profile.avatar_url || null,
    pfp: profile.avatar_url || null,
    crop: null
  };

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-profile-comp">
      <div class="modal-dialog" style="max-width: 720px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Edit Profile</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Changing phone or email requires OTP verification</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-edit-profile-comp')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <form id="form-edit-profile-comp" onsubmit="handleSaveComprehensiveProfile(event)">
          <div class="modal-body">
            <!-- Avatar / PFP Section -->
            <div style="display: flex; align-items: center; gap: 18px; padding: 14px 16px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 16px;">
              <div style="position: relative; width: 72px; height: 72px; border-radius: 50%; overflow: hidden; border: 2.5px solid var(--orange-primary); flex-shrink: 0; background: #070d1e;">
                <img id="edit-cand-pfp-img" src="${profile.avatar_url || DEFAULT_AVATAR_PREVIEW}" alt="Profile avatar" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
              <input type="hidden" id="edit-profile-avatar-url" name="avatar_url" value="${profile.avatar_url || ''}">
              <input type="file" id="edit-cand-pfp-file-input" accept="image/*" style="display: none;" onchange="handleEditPfpFileSelected(event, 'edit_candidate')">
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--white);">Profile Picture</div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <button type="button" class="btn-orange" style="padding: 6px 14px; font-size: 0.8rem;" onclick="document.getElementById('edit-cand-pfp-file-input').click()">
                    ${svgIcon('upload', '', 14)} Upload Picture
                  </button>
                  <button type="button" class="btn-secondary" id="btn-adjust-cand-pfp" style="padding: 6px 12px; font-size: 0.8rem; ${profile.avatar_url ? 'display: inline-flex;' : 'display: none;'}" onclick="openEditPfpModal('edit_candidate')">
                    ${svgIcon('crop', '', 14)} Adjust Face &amp; Zoom
                  </button>
                  <button type="button" class="btn-secondary" id="btn-remove-cand-pfp" style="padding: 6px 12px; font-size: 0.8rem; color: #f87171; border-color: rgba(239, 68, 68, 0.3); ${profile.avatar_url ? 'display: inline-flex;' : 'display: none;'}" onclick="removeEditPfp('edit_candidate')">
                    Remove
                  </button>
                </div>
              </div>
            </div>

            <!-- Basic Details -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">First Name *</label>
                <input type="text" name="first_name" value="${profile.first_name || ''}" required placeholder="First name" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Middle Name <span style="font-weight: 400; color: var(--text-dim);">(Optional)</span></label>
                <input type="text" name="middle_name" value="${profile.middle_name || ''}" placeholder="Middle name" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Last Name *</label>
                <input type="text" name="last_name" value="${profile.last_name || ''}" required placeholder="Last name" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Full Name in Bangla (বাংলায় পূর্ণ নাম) *</label>
                <input type="text" name="name_bangla" value="${profile.name_bangla || ''}" placeholder="বাংলায় নাম" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Experience (Years)</label>
                <input type="number" name="experience_years" value="${profile.experience_years || 5}" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>

            <!-- Contact Credentials -->
            <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.3); padding: 14px; border-radius: var(--radius-md);">
              <div style="font-size: 0.85rem; font-weight: 700; color: var(--white); margin-bottom: 8px;">
                Contact Information
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <label style="display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 4px; color: var(--white);">Phone Number</label>
                  <input type="tel" id="edit-phone" name="phone" value="${profile.phone || ''}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
                </div>
                <div>
                  <label style="display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 4px; color: var(--white);">Email Address</label>
                  <input type="email" id="edit-email" name="email" value="${profile.email || ''}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
                </div>
              </div>

              <!-- Inline OTP Box -->
              <div id="contact-otp-box" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="font-size: 0.8rem; color: #fdba74; margin-bottom: 6px;">
                  Enter 6-digit OTP code sent to confirm:
                </div>
                <div style="display: flex; gap: 10px;">
                  <input type="text" id="contact-otp-code" maxlength="6" placeholder="123456" style="width: 130px; background: var(--bg-input); border: 2px solid var(--orange-primary); padding: 6px 10px; border-radius: var(--radius-md); color: var(--white); font-weight: 800; text-align: center;">
                  <button type="button" class="btn-orange" style="padding: 6px 12px; font-size: 0.8rem;" onclick="requestContactChangeOtp()">
                    Send OTP
                  </button>
                </div>
              </div>
            </div>

            <!-- Professional Headline -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Professional Headline</label>
              <input type="text" name="headline" value="${profile.headline || ''}" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>

            <!-- Bio / Summary -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Summary</label>
              <textarea name="summary" rows="3" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">${profile.summary || ''}</textarea>
            </div>

            <!-- Location & Visibility -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Location</label>
                <input type="text" name="location" value="${profile.location || ''}" placeholder="Location" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Visibility</label>
                <select name="visibility" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
                  <option value="eligible_employers" ${profile.visibility === 'eligible_employers' ? 'selected' : ''}>Applied Employers Only</option>
                  <option value="registered_users" ${profile.visibility === 'registered_users' ? 'selected' : ''}>All Registered Hotels</option>
                  <option value="private" ${profile.visibility === 'private' ? 'selected' : ''}>Private</option>
                </select>
              </div>
            </div>

            <!-- Open to Work Status Switch -->
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); padding: 12px 14px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between;">
              <div>
                <label style="font-weight: 700; font-size: 0.85rem; color: var(--white); display: block; margin-bottom: 2px;">Open to Work</label>
                <span style="font-size: 0.78rem; color: var(--text-dim);">Let 5-star hotel recruiters know you are actively seeking hospitality roles.</span>
              </div>
              <input type="checkbox" name="open_to_work" ${(profile.open_to_work === 1 || profile.open_to_work === true || profile.open_to_work === undefined) ? 'checked' : ''} style="width: 20px; height: 20px; accent-color: var(--blue-primary); cursor: pointer;">
            </div>

            <!-- Skills (Unified Schema Select System - Business Part 2 Style) -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                Hospitality Skills &amp; Operational Competencies
              </label>
              <div class="schema-box-wrapper" style="margin-bottom: 0;">
                <input type="text" class="schema-search-input" id="comp-skills-search" 
                  placeholder="Type skill and press Enter to add..." 
                  value="${window.compEditSkillsState.query || ''}" 
                  oninput="filterCompEditSkills(this.value)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomCompEditSkill(this.value);}">

                <div id="comp-skills-add-chip-container">
                  ${(() => {
                    const q = (window.compEditSkillsState.query || '').toLowerCase().trim();
                    const allPool = Array.from(new Set([...(window.compEditSkillsState.customPool || []), ...HOTEL_SKILLS_SCHEMA]));
                    const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);
                    if (q && !hasExactMatch) {
                      return `
                        <div class="schema-add-chip" onclick="addCustomCompEditSkill('${window.compEditSkillsState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                          + Add "${window.compEditSkillsState.query}" to skills
                        </div>
                      `;
                    }
                    return '';
                  })()}
                </div>

                <div class="schema-pills-pool" id="comp-skills-pills-pool" style="max-height: 200px;">
                  ${(() => {
                    const q = (window.compEditSkillsState.query || '').toLowerCase().trim();
                    const allPool = Array.from(new Set([...(window.compEditSkillsState.customPool || []), ...HOTEL_SKILLS_SCHEMA]));
                    const selectedStack = (window.compEditSkillsState.selected || []).filter(s => !q || s.toLowerCase().includes(q));
                    const unselectedPool = allPool.filter(s => !window.compEditSkillsState.selected.includes(s)).filter(s => !q || s.toLowerCase().includes(q));

                    return [
                      ...selectedStack.map(s => `
                        <span class="schema-pill-item selected" data-pill-key="${s}" onclick="toggleCompEditSkill('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
                          ✓ ${s}
                        </span>
                      `),
                      ...unselectedPool.map(s => `
                        <span class="schema-pill-item" data-pill-key="${s}" onclick="toggleCompEditSkill('${s.replace(/'/g, "\\'")}')" title="Click to select">
                          + ${s}
                        </span>
                      `)
                    ].join('');
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-profile-comp')">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Attach change listener to phone and email
  const pInput = document.getElementById('edit-phone');
  const eInput = document.getElementById('edit-email');
  const checkContactChange = () => {
    const origPhone = state.profile?.phone || '';
    const origEmail = state.profile?.email || '';
    if (pInput.value.trim() !== origPhone.trim() || eInput.value.trim().toLowerCase() !== origEmail.trim().toLowerCase()) {
      document.getElementById('contact-otp-box').style.display = 'block';
    } else {
      document.getElementById('contact-otp-box').style.display = 'none';
    }
  };
  pInput.addEventListener('input', checkContactChange);
  eInput.addEventListener('input', checkContactChange);
}

async function requestContactChangeOtp() {
  const newEmail = document.getElementById('edit-email')?.value.trim();
  const newPhone = document.getElementById('edit-phone')?.value.trim();
  const target = newEmail || newPhone;

  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: target, purpose: 'contact_change' })
    });
    const data = await res.json();
    document.getElementById('contact-otp-code').value = data.demo_otp;
    showToast(`Security OTP sent to ${target} (Demo code: ${data.demo_otp})`, 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleSaveComprehensiveProfile(event) {
  event.preventDefault();
  const userId = state.currentUser ? state.currentUser.id : (state.demoDataHidden ? null : 'user_rahim');
  if (!userId) {
    showToast('Please sign in to update your profile.', 'danger');
    return;
  }
  const form = event.target;
  const newEmail = form.email.value.trim();
  const newPhone = form.phone.value.trim();
  const otpCode = document.getElementById('contact-otp-code')?.value.trim() || null;
  const avatarUrl = document.getElementById('edit-profile-avatar-url')?.value || null;

  const skillsArr = window.compEditSkillsState ? window.compEditSkillsState.selected : (form.skills_csv?.value.split(',').map(s => s.trim()).filter(Boolean) || []);

  const firstName = (form.first_name?.value || '').trim();
  const middleName = (form.middle_name?.value || '').trim();
  const lastName = (form.last_name?.value || '').trim();
  const nameBangla = (form.name_bangla?.value || '').trim();
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || (form.name?.value || '');

  const payload = {
    user_id: userId,
    name: fullName,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    name_bangla: nameBangla,
    email: newEmail,
    phone: newPhone,
    otp_code: otpCode,
    avatar_url: avatarUrl,
    headline: form.headline.value,
    summary: form.summary.value,
    location: form.location.value,
    experience_years: parseInt(form.experience_years.value),
    visibility: form.visibility.value,
    open_to_work: form.open_to_work ? form.open_to_work.checked : (state.profile?.open_to_work ? true : false),
    skills: skillsArr
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.requires_otp) {
      document.getElementById('contact-otp-box').style.display = 'block';
      showToast(data.detail, 'orange');
      requestContactChangeOtp();
      return;
    }

    if (!res.ok) throw new Error(data.detail || 'Profile update failed');

    if (state.currentUser) {
      state.currentUser.avatar = avatarUrl || DEFAULT_AVATAR_PREVIEW;
      state.currentUser.name = payload.name;
    }
    if (state.profile) {
      state.profile.avatar_url = avatarUrl;
      state.profile.name = payload.name;
    }

    updateNavigation();
    closeModal('modal-edit-profile-comp');
    showToast('Candidate profile updated successfully!', 'success');
    await loadInitialData();
    renderProfileScreen(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Business User Edit Profile Modal
async function openBusinessUserEditProfileModal() {
  const user = state.currentUser;
  if (!user || state.currentRole !== 'recruiter') {
    showToast('Please sign in as a business user/recruiter.', 'danger');
    return;
  }

  let freshProfile = user;
  try {
    const res = await fetch(`/api/profile?user_id=${user.id}`);
    if (res.ok) {
      freshProfile = await res.json();
    }
  } catch (e) {
    console.error('Error fetching fresh user profile:', e);
  }

  const currentAvatar = freshProfile.avatar_url || user.avatar || '';
  const currentName = freshProfile.name || user.name || '';
  const currentTitle = freshProfile.designation || user.title || user.org_role || 'Talent Acquisition Manager';
  const currentPhone = freshProfile.phone || user.phone || '';
  const currentEmail = freshProfile.email || user.email || '';

  editPfpState.bizUser = {
    raw: currentAvatar || null,
    pfp: currentAvatar || null,
    crop: null
  };

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-biz-user">
      <div class="modal-dialog" style="max-width: 580px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Edit Business User Profile</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Manage your personal recruiter profile and representative photo</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-edit-biz-user')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <form id="form-edit-biz-user" onsubmit="handleSaveBusinessUserProfile(event)">
          <div class="modal-body">
            <!-- PFP Upload & Adjust Section -->
            <div style="display: flex; align-items: center; gap: 18px; padding: 14px 16px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 16px;">
              <div style="position: relative; width: 72px; height: 72px; border-radius: 50%; overflow: hidden; border: 2.5px solid var(--orange-primary); flex-shrink: 0; background: #070d1e;">
                <img id="edit-biz-user-pfp-img" src="${currentAvatar || DEFAULT_AVATAR_PREVIEW}" alt="Representative avatar" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
              <input type="hidden" id="edit-biz-user-avatar-url" name="avatar_url" value="${currentAvatar || ''}">
              <input type="file" id="edit-biz-user-pfp-input" accept="image/*" style="display: none;" onchange="handleEditPfpFileSelected(event, 'edit_biz_user')">
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--white);">Representative Photo</div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <button type="button" class="btn-orange" style="padding: 6px 14px; font-size: 0.8rem;" onclick="document.getElementById('edit-biz-user-pfp-input').click()">
                    ${svgIcon('upload', '', 14)} Upload Picture
                  </button>
                  <button type="button" class="btn-secondary" id="btn-adjust-biz-user-pfp" style="padding: 6px 12px; font-size: 0.8rem; ${currentAvatar ? 'display: inline-flex;' : 'display: none;'}" onclick="openEditPfpModal('edit_biz_user')">
                    ${svgIcon('crop', '', 14)} Adjust Face &amp; Zoom
                  </button>
                  <button type="button" class="btn-secondary" id="btn-remove-biz-user-pfp" style="padding: 6px 12px; font-size: 0.8rem; color: #f87171; border-color: rgba(239, 68, 68, 0.3); ${currentAvatar ? 'display: inline-flex;' : 'display: none;'}" onclick="removeEditPfp('edit_biz_user')">
                    Remove
                  </button>
                </div>
              </div>
            </div>

            <!-- Full Name -->
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Full Name</label>
              <input type="text" name="name" value="${escapeHtml(currentName)}" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>

            <!-- Role / Designation -->
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Role in Organization / Designation</label>
              <input type="text" name="designation" value="${escapeHtml(currentTitle)}" required placeholder="Your Role" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>

            <!-- Contact Credentials -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label style="display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 4px; color: var(--white);">Phone Number</label>
                <input type="tel" name="phone" value="${escapeHtml(currentPhone)}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
              </div>
              <div>
                <label style="display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 4px; color: var(--white);">Work Email Address</label>
                <input type="email" name="email" value="${escapeHtml(currentEmail)}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-biz-user')">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleSaveBusinessUserProfile(event) {
  event.preventDefault();
  const user = state.currentUser;
  if (!user) {
    showToast('User session expired. Please sign in again.', 'danger');
    return;
  }
  const form = event.target;
  const newName = form.name.value.trim();
  const newDesignation = form.designation.value.trim();
  const newPhone = form.phone.value.trim();
  const newEmail = form.email.value.trim();
  const newAvatar = document.getElementById('edit-biz-user-avatar-url')?.value || null;

  const payload = {
    user_id: user.id,
    name: newName,
    designation: newDesignation,
    phone: newPhone,
    email: newEmail,
    avatar_url: newAvatar
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update business user profile');

    state.currentUser.name = newName;
    state.currentUser.title = newDesignation;
    state.currentUser.phone = newPhone;
    state.currentUser.email = newEmail;
    state.currentUser.avatar = newAvatar;

    try {
      const activeSessStr = localStorage.getItem('nicejobs_active_session');
      if (activeSessStr) {
        const sess = JSON.parse(activeSessStr);
        if (sess && sess.user && sess.user.id === user.id) {
          sess.user.name = newName;
          sess.user.title = newDesignation;
          sess.user.phone = newPhone;
          sess.user.email = newEmail;
          sess.user.avatar = newAvatar;
          localStorage.setItem('nicejobs_active_session', JSON.stringify(sess));
        }
      }
    } catch (e) {}

    updateNavigation();
    closeModal('modal-edit-biz-user');
    showToast('Business user profile updated successfully!', 'success');

    if (window.location.hash.includes('recruiter-dashboard') || window.location.hash === '') {
      renderRecruiterDashboard(document.getElementById('app-viewport'));
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Business Profile Edit Modal - Amenities Schema State & Helpers
window.editBizAmenitiesState = {
  selected: [],
  query: '',
  customPool: []
};

function filterEditBizAmenities(q) {
  if (!window.editBizAmenitiesState) return;
  window.editBizAmenitiesState.query = q;
  updateEditBizAmenitiesDOM();
}

function toggleEditBizAmenity(amenity) {
  if (!window.editBizAmenitiesState) return;
  const idx = window.editBizAmenitiesState.selected.indexOf(amenity);
  if (idx >= 0) {
    window.editBizAmenitiesState.selected.splice(idx, 1);
  } else {
    // Stack logic: latest selected goes to the top of the stack
    window.editBizAmenitiesState.selected.unshift(amenity);
  }
  updateEditBizAmenitiesDOM();
}

function addCustomEditBizAmenity(amenity) {
  if (!window.editBizAmenitiesState || !amenity) return;
  const trimmed = amenity.trim();
  if (trimmed) {
    if (!window.editBizAmenitiesState.customPool.includes(trimmed)) {
      window.editBizAmenitiesState.customPool.push(trimmed);
    }
    const idx = window.editBizAmenitiesState.selected.indexOf(trimmed);
    if (idx >= 0) window.editBizAmenitiesState.selected.splice(idx, 1);
    window.editBizAmenitiesState.selected.unshift(trimmed);
    window.editBizAmenitiesState.query = '';
    const input = document.getElementById('edit-biz-amenities-search');
    if (input) input.value = '';
    showToast(`Added "${trimmed}" to amenities`, 'success');
    updateEditBizAmenitiesDOM();
  }
}

function updateEditBizAmenitiesDOM() {
  if (!window.editBizAmenitiesState) return;
  const q = (window.editBizAmenitiesState.query || '').toLowerCase().trim();
  const allPool = Array.from(new Set([...(window.editBizAmenitiesState.customPool || []), ...HOTEL_FEATURES_SCHEMA]));
  const hasExactMatch = q && allPool.some(f => f.toLowerCase() === q);

  const chipContainer = document.getElementById('edit-biz-amenities-chip-container');
  if (chipContainer) {
    if (q && !hasExactMatch) {
      chipContainer.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomEditBizAmenity('${window.editBizAmenitiesState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${window.editBizAmenitiesState.query}" to amenities
        </div>
      `;
    } else {
      chipContainer.innerHTML = '';
    }
  }

  const pillsPool = document.getElementById('edit-biz-amenities-pills-pool');
  if (pillsPool) {
    const selectedStack = (window.editBizAmenitiesState.selected || []).filter(f => !q || f.toLowerCase().includes(q));
    const unselectedPool = allPool.filter(f => !window.editBizAmenitiesState.selected.includes(f)).filter(f => !q || f.toLowerCase().includes(q));

    animateSchemaPillsPool(pillsPool, () => {
      pillsPool.innerHTML = [
        ...selectedStack.map(f => `
          <span class="schema-pill-item selected" data-pill-key="${f}" onclick="toggleEditBizAmenity('${f.replace(/'/g, "\\'")}')" title="Click to unselect">
            ✓ ${f}
          </span>
        `),
        ...unselectedPool.map(f => `
          <span class="schema-pill-item" data-pill-key="${f}" onclick="toggleEditBizAmenity('${f.replace(/'/g, "\\'")}')" title="Click to select">
            + ${f}
          </span>
        `)
      ].join('');
    });
  }
}

// Business (Hotel) Profile Edit Modal
async function openEditBusinessProfileModal(bizId) {
  const bId = bizId || state.currentUser?.business_id || state.activeHotelId || 'biz_radisson';
  const res = await fetch(`/api/businesses/${bId}`);
  if (!res.ok) {
    showToast('Business profile not found', 'danger');
    return;
  }
  const biz = await res.json();

  window.editBizAmenitiesState = {
    selected: [...(biz.amenities || [])],
    query: '',
    customPool: []
  };

  const currentLogo = biz.logo_url || DEFAULT_HOTEL_LOGO;
  editPfpState.bizLogo = {
    raw: biz.logo_url || null,
    pfp: biz.logo_url || null,
    crop: null
  };

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-edit-biz-profile">
      <div class="modal-dialog" style="max-width: 680px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Edit Hotel / Business Profile</h2>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Update hotel details, logo, star rating, and amenities</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-edit-biz-profile')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <form id="form-edit-biz-profile" onsubmit="handleSaveBusinessProfile(event, '${bId}')">
          <div class="modal-body">
            <!-- Logo Section -->
            <div style="display: flex; align-items: center; gap: 18px; padding: 14px 16px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 16px;">
              <div style="position: relative; width: 72px; height: 72px; border-radius: 16px; overflow: hidden; border: 2.5px solid var(--orange-primary); flex-shrink: 0; background: #070d1e;">
                <img id="edit-biz-logo-img" src="${currentLogo}" alt="Business logo" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;">
              </div>
              <input type="hidden" id="edit-biz-logo-url" name="logo_url" value="${biz.logo_url || ''}">
              <input type="file" id="edit-biz-logo-input" accept="image/*" style="display: none;" onchange="handleEditPfpFileSelected(event, 'edit_biz_logo')">
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--white);">Hotel / Property Logo</div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <button type="button" class="btn-orange" style="padding: 6px 14px; font-size: 0.8rem;" onclick="document.getElementById('edit-biz-logo-input').click()">
                    ${svgIcon('upload', '', 14)} Upload Logo
                  </button>
                  <button type="button" class="btn-secondary" id="btn-adjust-biz-logo" style="padding: 6px 12px; font-size: 0.8rem; ${biz.logo_url ? 'display: inline-flex;' : 'display: none;'}" onclick="openEditPfpModal('edit_biz_logo')">
                    ${svgIcon('crop', '', 14)} Adjust &amp; Zoom
                  </button>
                  <button type="button" class="btn-secondary" id="btn-remove-biz-logo" style="padding: 6px 12px; font-size: 0.8rem; color: #f87171; border-color: rgba(239, 68, 68, 0.3); ${biz.logo_url ? 'display: inline-flex;' : 'display: none;'}" onclick="removeEditPfp('edit_biz_logo')">
                    Remove
                  </button>
                </div>
              </div>
            </div>

            <!-- Brand Name & Star Rating -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Brand / Display Name</label>
                <input type="text" name="brand_name" value="${escapeHtml(biz.brand_name || '')}" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Star Rating</label>
                <select name="star_rating" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="5" ${biz.star_rating == 5 ? 'selected' : ''}>5-Star Luxury</option>
                  <option value="4" ${biz.star_rating == 4 ? 'selected' : ''}>4-Star Premium</option>
                  <option value="3" ${biz.star_rating == 3 ? 'selected' : ''}>3-Star Boutique</option>
                </select>
              </div>
            </div>

            <!-- Property Type & City -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Property Type</label>
                <input type="text" name="property_type" value="${escapeHtml(biz.property_type || '')}" placeholder="Property Type" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">City</label>
                <input type="text" name="city" value="${escapeHtml(biz.city || '')}" placeholder="City" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
            </div>

            <!-- Address -->
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Address</label>
              <input type="text" name="address" value="${escapeHtml(biz.address || '')}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
            </div>

            <!-- Website & Official Email -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Website</label>
                <input type="url" name="website" value="${escapeHtml(biz.website || '')}" placeholder="https://..." style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Official Email</label>
                <input type="email" name="email" value="${escapeHtml(biz.email || '')}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">
              </div>
            </div>

            <!-- Description -->
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Description / Overview</label>
              <textarea name="description" rows="3" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.85rem;">${escapeHtml(biz.description || '')}</textarea>
            </div>

            <!-- Amenities (Unified Schema Select System - Business Part 2 Reference) -->
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                Property Features &amp; Amenities
              </label>
              <div class="schema-box-wrapper" style="margin-bottom: 0;">
                <input type="text" class="schema-search-input" id="edit-biz-amenities-search" 
                  placeholder="Type facility (e.g. Swimming Pool, Spa, Helipad) and press Enter to add..." 
                  value="${window.editBizAmenitiesState.query || ''}" 
                  oninput="filterEditBizAmenities(this.value)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomEditBizAmenity(this.value);}">

                <div id="edit-biz-amenities-chip-container">
                  ${(() => {
                    const q = (window.editBizAmenitiesState.query || '').toLowerCase().trim();
                    const allPool = Array.from(new Set([...(window.editBizAmenitiesState.customPool || []), ...HOTEL_FEATURES_SCHEMA]));
                    const hasExactMatch = q && allPool.some(f => f.toLowerCase() === q);
                    if (q && !hasExactMatch) {
                      return `
                        <div class="schema-add-chip" onclick="addCustomEditBizAmenity('${window.editBizAmenitiesState.query.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                          + Add "${window.editBizAmenitiesState.query}" to amenities
                        </div>
                      `;
                    }
                    return '';
                  })()}
                </div>

                <div class="schema-pills-pool" id="edit-biz-amenities-pills-pool" style="max-height: 220px;">
                  ${(() => {
                    const q = (window.editBizAmenitiesState.query || '').toLowerCase().trim();
                    const allPool = Array.from(new Set([...(window.editBizAmenitiesState.customPool || []), ...HOTEL_FEATURES_SCHEMA]));
                    const selectedStack = (window.editBizAmenitiesState.selected || []).filter(f => !q || f.toLowerCase().includes(q));
                    const unselectedPool = allPool.filter(f => !window.editBizAmenitiesState.selected.includes(f)).filter(f => !q || f.toLowerCase().includes(q));

                    return [
                      ...selectedStack.map(f => `
                        <span class="schema-pill-item selected" data-pill-key="${f}" onclick="toggleEditBizAmenity('${f.replace(/'/g, "\\'")}')" title="Click to unselect">
                          ✓ ${f}
                        </span>
                      `),
                      ...unselectedPool.map(f => `
                        <span class="schema-pill-item" data-pill-key="${f}" onclick="toggleEditBizAmenity('${f.replace(/'/g, "\\'")}')" title="Click to select">
                          + ${f}
                        </span>
                      `)
                    ].join('');
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-edit-biz-profile')">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleSaveBusinessProfile(event, bizId) {
  event.preventDefault();
  const form = event.target;
  const brandName = form.brand_name.value.trim();
  const starRating = parseInt(form.star_rating.value);
  const propertyType = form.property_type.value.trim();
  const city = form.city.value.trim();
  const address = form.address.value.trim();
  const website = form.website.value.trim();
  const email = form.email.value.trim();
  const description = form.description.value.trim();
  const logoUrl = document.getElementById('edit-biz-logo-url')?.value || null;
  const amenities = window.editBizAmenitiesState ? window.editBizAmenitiesState.selected : (form.amenities_csv?.value.split(',').map(s => s.trim()).filter(Boolean) || []);

  const payload = {
    brand_name: brandName,
    star_rating: starRating,
    property_type: propertyType,
    city: city,
    address: address,
    website: website,
    email: email,
    description: description,
    logo_url: logoUrl,
    amenities: amenities
  };

  try {
    const res = await fetch(`/api/businesses/${bizId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update business profile');

    closeModal('modal-edit-biz-profile');
    showToast('Hotel profile updated successfully!', 'success');

    if (window.location.hash.includes('recruiter-dashboard') || window.location.hash === '') {
      renderRecruiterDashboard(document.getElementById('app-viewport'));
    } else if (window.location.hash.includes('hotels')) {
      renderHotelDetailScreen(document.getElementById('app-viewport'), bizId);
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================================================
// Vacancy Publisher Modal State & Controller (Recruiter)
// ==========================================================================

const createJobState = {
  isNegotiable: false,
  selectedDegrees: ["Diploma in Hospitality & Tourism Management"],
  degreeField: "Hospitality Management",
  selectedSkills: ["Opera PMS", "Guest Relations", "Customer Satisfaction (CSAT)"],
  customSkillsPool: [],
  skillSearchQuery: '',
  screeningQuestions: []
};

function toggleJobSalaryMode(mode) {
  createJobState.isNegotiable = (mode === 'negotiable');
  const rangeBox = document.getElementById('salary-range-fields');
  const negBox = document.getElementById('salary-negotiable-notice');
  const btnRange = document.getElementById('btn-sal-range');
  const btnNeg = document.getElementById('btn-sal-neg');

  if (rangeBox && negBox) {
    if (createJobState.isNegotiable) {
      rangeBox.style.display = 'none';
      negBox.style.display = 'block';
      if (btnRange) { btnRange.classList.remove('btn-primary'); btnRange.classList.add('btn-secondary'); }
      if (btnNeg) { btnNeg.classList.remove('btn-secondary'); btnNeg.classList.add('btn-primary'); }
    } else {
      rangeBox.style.display = 'grid';
      negBox.style.display = 'none';
      if (btnRange) { btnRange.classList.remove('btn-secondary'); btnRange.classList.add('btn-primary'); }
      if (btnNeg) { btnNeg.classList.remove('btn-primary'); btnNeg.classList.add('btn-secondary'); }
    }
  }
}

function toggleJobDegreeSelection(deg) {
  const idx = createJobState.selectedDegrees.indexOf(deg);
  if (idx > -1) {
    createJobState.selectedDegrees.splice(idx, 1);
  } else {
    createJobState.selectedDegrees.push(deg);
  }
  updateJobDegreesUI();
}

function toggleScreeningSection() {
  const container = document.getElementById('screening-questions-container');
  const icon = document.getElementById('screening-toggle-icon');
  if (container) {
    const isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'block';
    if (icon) {
      icon.textContent = isVisible ? '▼' : '▲';
    }
    if (!isVisible) {
      renderScreeningQuestions();
    }
  }
}

function updateScreeningBadge() {
  const badge = document.getElementById('screening-questions-badge');
  if (badge) {
    const count = (createJobState.screeningQuestions || []).length;
    badge.textContent = `${count} question${count === 1 ? '' : 's'} added`;
  }
}

function addScreeningQuestionWithType(type = 'question') {
  if (!createJobState.screeningQuestions) {
    createJobState.screeningQuestions = [];
  }
  createJobState.screeningQuestions.push({
    q: '',
    type: type,
    options: type === 'multiple' ? ['Option 1', 'Option 2'] : []
  });
  renderScreeningQuestions();
  updateScreeningBadge();
}

function addScreeningQuestion() {
  addScreeningQuestionWithType('question');
}

function removeScreeningQuestion(idx) {
  createJobState.screeningQuestions.splice(idx, 1);
  renderScreeningQuestions();
  updateScreeningBadge();
}

function updateScreeningQuestionText(idx, val) {
  if (createJobState.screeningQuestions && createJobState.screeningQuestions[idx]) {
    createJobState.screeningQuestions[idx].q = val;
  }
}

function updateScreeningQuestionType(idx, type) {
  const qObj = createJobState.screeningQuestions ? createJobState.screeningQuestions[idx] : null;
  if (!qObj) return;
  qObj.type = type;
  if (type !== 'multiple') {
    qObj.options = [];
  } else if (!qObj.options || qObj.options.length === 0) {
    qObj.options = ['Option 1', 'Option 2'];
  }
  renderScreeningQuestions();
}

function addOptionToQuestion(qIdx) {
  const optInput = document.getElementById(`option-input-${qIdx}`);
  if (optInput && optInput.value.trim()) {
    if (!createJobState.screeningQuestions[qIdx].options) {
      createJobState.screeningQuestions[qIdx].options = [];
    }
    createJobState.screeningQuestions[qIdx].options.push(optInput.value.trim());
    optInput.value = '';
    renderScreeningQuestions();
  }
}

function removeOptionFromQuestion(qIdx, optIdx) {
  if (createJobState.screeningQuestions[qIdx]?.options) {
    createJobState.screeningQuestions[qIdx].options.splice(optIdx, 1);
    renderScreeningQuestions();
  }
}

function renderScreeningQuestions() {
  const container = document.getElementById('screening-questions-container');
  if (!container) return;

  const questions = createJobState.screeningQuestions || [];
  
  if (questions.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 22px 14px; background: rgba(0, 0, 0, 0.25); border: 1px dashed rgba(249, 115, 22, 0.35); border-radius: var(--radius-sm); margin-bottom: 8px;">
        <div style="color: var(--white); font-weight: 700; font-size: 0.9rem; margin-bottom: 6px;">No screening questions added yet</div>
        <div style="color: var(--text-dim); font-size: 0.78rem; margin-bottom: 16px; max-width: 480px; margin-left: auto; margin-right: auto;">
          Add questions to screen candidates during their application. Candidates will be prompted to answer these questions before applying.
        </div>
        <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="btn-secondary" onclick="addScreeningQuestionWithType('question')" style="font-size: 0.8rem; padding: 8px 16px; border-color: rgba(255,255,255,0.18);">
            + Add Text Question
          </button>
          <button type="button" class="btn-secondary" onclick="addScreeningQuestionWithType('multiple')" style="font-size: 0.8rem; padding: 8px 16px; border-color: rgba(255,255,255,0.18);">
            + Add Multiple Choice
          </button>
          <button type="button" class="btn-secondary" onclick="addScreeningQuestionWithType('yesno')" style="font-size: 0.8rem; padding: 8px 16px; border-color: rgba(255,255,255,0.18);">
            + Add Yes/No Question
          </button>
        </div>
      </div>
    `;
    updateScreeningBadge();
    return;
  }

  const html = questions.map((qObj, i) => `
    <div style="margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.1); padding: 12px; border-radius: var(--radius-md); background: rgba(15, 23, 42, 0.85);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--orange-primary); text-transform: uppercase; letter-spacing: 0.5px;">
            Question #${i + 1}
          </span>
          <span style="font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; background: rgba(37, 99, 235, 0.2); color: #93c5fd; font-weight: 600;">
            ${qObj.type === 'multiple' ? 'Multiple Choice' : qObj.type === 'yesno' ? 'Yes / No' : 'Text Answer'}
          </span>
        </div>
        <button type="button" onclick="removeScreeningQuestion(${i})" style="background: none; border: none; color: #f87171; font-weight: 700; font-size: 0.78rem; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Remove this question">
          ✕ Remove Question
        </button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 160px; gap: 10px; margin-bottom: 8px;">
        <div>
          <input type="text" placeholder="Type question" value="${escapeHtml(qObj.q || '')}" oninput="updateScreeningQuestionText(${i}, this.value)" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 10px; border-radius: var(--radius-sm); color: var(--white); font-size: 0.84rem;"/>
        </div>
        <div>
          <select onchange="updateScreeningQuestionType(${i}, this.value)" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 8px; border-radius: var(--radius-sm); color: var(--white); font-size: 0.84rem;">
            <option value="question" ${qObj.type === 'question' ? 'selected' : ''}>Text Question</option>
            <option value="multiple" ${qObj.type === 'multiple' ? 'selected' : ''}>Multiple Choice</option>
            <option value="yesno" ${qObj.type === 'yesno' ? 'selected' : ''}>Yes / No</option>
          </select>
        </div>
      </div>

      ${qObj.type === 'multiple' ? `
        <div style="background: rgba(255, 255, 255, 0.03); padding: 10px; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.06); margin-top: 6px;">
          <div style="font-size: 0.74rem; color: var(--text-dim); margin-bottom: 6px; font-weight: 600;">
            Options (Candidate will choose one during application):
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
            ${(qObj.options || []).map((opt, oi) => `
              <span style="display: inline-flex; align-items: center; gap: 6px; background: rgba(37, 99, 235, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; font-size: 0.78rem; padding: 4px 10px; border-radius: 9999px;">
                ${escapeHtml(opt)}
                <button type="button" onclick="removeOptionFromQuestion(${i}, ${oi})" style="background: none; border: none; color: #f87171; cursor: pointer; padding: 0; font-size: 0.75rem; line-height: 1;" title="Remove option">✕</button>
              </span>
            `).join('')}
            ${(!qObj.options || qObj.options.length === 0) ? `
              <span style="font-size: 0.74rem; color: #f87171;">Add options below (e.g. Morning, Evening, Night)</span>
            ` : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            <input id="option-input-${i}" type="text" placeholder="Type an option and press Enter..." onkeydown="if(event.key==='Enter'){event.preventDefault();addOptionToQuestion(${i});}" style="flex: 1; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 6px 10px; border-radius: var(--radius-sm); color: var(--white); font-size: 0.8rem;"/>
            <button type="button" onclick="addOptionToQuestion(${i})" class="btn-orange" style="padding: 6px 12px; font-size: 0.78rem; border-radius: var(--radius-sm);">+ Add Option</button>
          </div>
        </div>
      ` : qObj.type === 'yesno' ? `
        <div style="font-size: 0.75rem; color: #34d399; display: flex; align-items: center; gap: 4px; margin-top: 4px; background: rgba(16, 185, 129, 0.08); padding: 5px 8px; border-radius: 4px;">
          ✓ Candidate will answer via Yes / No selector
        </div>
      ` : `
        <div style="font-size: 0.75rem; color: #94a3b8; display: flex; align-items: center; gap: 4px; margin-top: 4px; background: rgba(255, 255, 255, 0.03); padding: 5px 8px; border-radius: 4px;">
          ✎ Candidate will type freeform text answer
        </div>
      `}
    </div>
  `).join('');

  container.innerHTML = html + `
    <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
      <button type="button" class="btn-secondary" onclick="addScreeningQuestionWithType('question')" style="font-size: 0.78rem; padding: 6px 12px;">
        + Add Text Question
      </button>
      <button type="button" class="btn-secondary" onclick="addScreeningQuestionWithType('multiple')" style="font-size: 0.78rem; padding: 6px 12px;">
        + Add Multiple Choice
      </button>
      <button type="button" class="btn-secondary" onclick="addScreeningQuestionWithType('yesno')" style="font-size: 0.78rem; padding: 6px 12px;">
        + Add Yes/No Question
      </button>
    </div>
  `;
  updateScreeningBadge();
}

function updateJobDegreesUI() {
  const container = document.getElementById('create-job-degrees-pool');
  if (container) {
    container.innerHTML = HOTEL_EDUCATION_DEGREES.map(deg => {
      const isSel = createJobState.selectedDegrees.includes(deg);
      return `<span class="schema-pill-item ${isSel ? 'selected' : ''}" onclick="toggleJobDegreeSelection('${deg}')">
        ${isSel ? '✓ ' : '+ '}${deg}
      </span>`;
    }).join('');
  }

  // Check if Bachelor's, Master's, or PhD is selected
  const hasHigherDegree = createJobState.selectedDegrees.some(d => {
    const dl = d.toLowerCase();
    return dl.includes("bachelor") || dl.includes("master") || dl.includes("phd");
  });
  const fieldContainer = document.getElementById('higher-degree-field-container');
  if (fieldContainer) {
    fieldContainer.style.display = hasHigherDegree ? 'block' : 'none';
  }
}

function filterJobSkills(query) {
  createJobState.skillSearchQuery = query;
  updateJobSkillsUI();
}

function toggleJobSkillSelection(skill) {
  const idx = createJobState.selectedSkills.indexOf(skill);
  if (idx > -1) {
    createJobState.selectedSkills.splice(idx, 1);
  } else {
    // Stack logic: latest selected goes to the top of the stack
    createJobState.selectedSkills.unshift(skill);
  }
  updateJobSkillsUI();
}

function removeJobSkill(skill) {
  toggleJobSkillSelection(skill);
}

function addCustomJobSkill(skill) {
  const input = document.getElementById('input-job-skill-search');
  const val = skill || (input ? input.value : '');
  if (!val) return;
  const trimmed = val.trim();
  if (trimmed) {
    if (!createJobState.customSkillsPool.some(s => s.toLowerCase() === trimmed.toLowerCase()) &&
        !HOTEL_SKILLS_SCHEMA.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      createJobState.customSkillsPool.push(trimmed);
    }
    const idx = createJobState.selectedSkills.indexOf(trimmed);
    if (idx > -1) createJobState.selectedSkills.splice(idx, 1);
    createJobState.selectedSkills.unshift(trimmed);
    createJobState.skillSearchQuery = '';
    if (input) input.value = '';
    showToast(`Added "${trimmed}" to required skills`, 'success');
    updateJobSkillsUI();
  }
}

function updateJobSkillsUI() {
  const q = (createJobState.skillSearchQuery || '').toLowerCase().trim();
  const allPool = Array.from(new Set([...(createJobState.customSkillsPool || []), ...HOTEL_SKILLS_SCHEMA]));
  const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);

  const chipContainer = document.getElementById('job-skill-add-chip-container');
  if (chipContainer) {
    if (q && !hasExactMatch) {
      chipContainer.innerHTML = `
        <div class="schema-add-chip" onclick="addCustomJobSkill('${createJobState.skillSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
          + Add "${createJobState.skillSearchQuery}" to required skills
        </div>
      `;
    } else {
      chipContainer.innerHTML = '';
    }
  }

  const pool = document.getElementById('job-skills-pool');
  if (pool) {
    const selectedStack = (createJobState.selectedSkills || []).filter(s => !q || s.toLowerCase().includes(q));
    const unselectedPool = allPool.filter(s => !createJobState.selectedSkills.includes(s)).filter(s => !q || s.toLowerCase().includes(q));

    pool.innerHTML = [
      ...selectedStack.map(s => `
        <span class="schema-pill-item selected" onclick="toggleJobSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
          ✓ ${s}
        </span>
      `),
      ...unselectedPool.map(s => `
        <span class="schema-pill-item" onclick="toggleJobSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to select">
          + ${s}
        </span>
      `)
    ].join('');
  }
}

function showUnverifiedBusinessAlert(brandName) {
  const container = document.getElementById('modal-container');
  if (!container) return;
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-unverified-biz">
      <div class="modal-dialog" style="max-width: 480px; text-align: center; padding: 32px 28px; background: rgba(13, 21, 44, 0.96); border: 1px solid rgba(249, 115, 22, 0.4); border-radius: 20px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);">
        <div style="width: 58px; height: 58px; margin: 0 auto 16px; border-radius: 50%; background: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.35); display: flex; align-items: center; justify-content: center; color: var(--orange-primary);">
          ${svgIcon('shield', '', 28)}
        </div>
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--orange-primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
          Verification Required
        </div>
        <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--white); margin: 0 0 10px 0;">
          Business Yet Not Verified
        </h3>
        <p style="color: #cbd5e1; font-size: 0.88rem; line-height: 1.55; margin: 0 0 22px 0;">
          <strong>${escapeHtml(brandName || 'Your business')}</strong> is currently pending platform verification. Creating new job posts will unlock as soon as your business documents are reviewed and approved.
        </p>
        <button class="btn-orange" onclick="closeModal('modal-unverified-biz')" style="width: 100%; padding: 11px 20px; font-weight: 700; font-size: 0.9rem; justify-content: center;">
          Understood
        </button>
      </div>
    </div>
  `;
}

async function openCreateJobModal() {
  const bId = state.currentUser?.business_id || state.activeHotelId;
  let bizObj = state.currentBusiness;
  if (!bizObj || bizObj.id !== bId) {
    if (bId) {
      try {
        const res = await fetch(`/api/businesses/${bId}`);
        if (res.ok) {
          bizObj = await res.json();
          state.currentBusiness = bizObj;
        }
      } catch (e) {}
    }
  }
  if (!bizObj && state.businesses) {
    bizObj = state.businesses.find(b => b.id === bId);
  }

  // Check verification status: if not verified, show alert!
  const isVerified = (bizObj && bizObj.verification_status === 'verified');
  if (!isVerified) {
    showToast('Business yet not verified. Job posting unlocks once verified by admin.', 'warning');
    showUnverifiedBusinessAlert(bizObj ? (bizObj.brand_name || bizObj.legal_name) : 'Your business');
    return;
  }

  const hotelName = bizObj ? (bizObj.brand_name || bizObj.legal_name) : 'Hospitality Establishment';

  createJobState.isNegotiable = false;
  createJobState.selectedDegrees = [];
  createJobState.degreeField = '';
  createJobState.selectedSkills = [];
  createJobState.customSkillsPool = [];
  createJobState.skillSearchQuery = '';

  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-create-job">
      <div class="modal-dialog" style="max-width: 780px;">
        <div class="modal-header">
          <div>
            <div style="font-size: 0.8rem; color: var(--blue-primary); font-weight: 700;">${hotelName}</div>
            <h2 class="modal-title">Post a Job</h2>
          </div>
          <button class="modal-close" onclick="closeModal('modal-create-job')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <form id="form-create-job" onsubmit="submitNewJob(event)">
          <div class="modal-body" style="padding: 24px; display: flex; flex-direction: column; gap: 18px;">
            <!-- Title & All 16 Hotel Departments -->
            <div style="display: grid; grid-template-columns: 1.4fr 1.2fr; gap: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                  Job Title <span style="color: #f87171;">*</span>
                </label>
                <input type="text" name="title" required placeholder="e.g. Executive Sous Chef, Front Office Manager, Duty Engineer" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                  Department <span style="color: #f87171;">*</span>
                </label>
                <select name="department" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  ${HOTEL_ALL_DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Salary Option: Specific Range or Negotiable -->
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); padding: 14px 16px; border-radius: var(--radius-md);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <label style="font-weight: 700; font-size: 0.85rem; color: var(--white); margin: 0;">
                  Compensation Structure <span style="color: #f87171;">*</span>
                </label>
                <div style="display: flex; gap: 8px;">
                  <button type="button" id="btn-sal-range" class="btn-primary" style="font-size: 0.78rem; padding: 5px 12px;" onclick="toggleJobSalaryMode('range')">
                    Salary Range (BDT / mo)
                  </button>
                  <button type="button" id="btn-sal-neg" class="btn-secondary" style="font-size: 0.78rem; padding: 5px 12px;" onclick="toggleJobSalaryMode('negotiable')">
                    Negotiable
                  </button>
                </div>
              </div>

              <!-- Min and Max Salary Row -->
              <div id="salary-range-fields" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div>
                  <label style="display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Minimum Salary (BDT / month)</label>
                  <input type="number" name="salary_min" value="" placeholder="Minimum" min="0" step="1000" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                </div>
                <div>
                  <label style="display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Maximum Salary (BDT / month)</label>
                  <input type="number" name="salary_max" value="" placeholder="Maximum" min="0" step="1000" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                </div>
              </div>

              <!-- Negotiable Notice -->
              <div id="salary-negotiable-notice" style="display: none; padding: 10px 14px; background: rgba(255, 107, 0, 0.08); border-radius: var(--radius-sm); border: 1px dashed rgba(255, 107, 0, 0.35); font-size: 0.84rem; color: var(--white);">
                ${svgIcon('info', '', 14)} This job post will be marked as <strong>"৳ Negotiable"</strong>. Remuneration will be discussed during interviews based on qualifications and candidate track record.
              </div>
            </div>

            <!-- Shift & Experience in this Field -->
            <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Shift Schedule</label>
                <select name="shift" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Rotational (Morning / Evening)">Rotational (Morning / Evening)</option>
                  <option value="Morning Shift">Morning Shift</option>
                  <option value="Evening Shift">Evening Shift</option>
                  <option value="Night Shift">Night Shift</option>
                  <option value="Straight Day Shift">Straight Day Shift</option>
                  <option value="Split Shift">Split Shift</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                  Experience (Years in this Field) <span style="color: #f87171;">*</span>
                </label>
                <select name="experience_level" required style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="Entry Level / Freshers Welcome">Entry Level / Freshers Welcome (0 - 1 Year)</option>
                  <option value="1-2 Years">1 - 2 Years in this Field</option>
                  <option value="3-5 Years">3 - 5 Years in this Field</option>
                  <option value="5-7 Years">5 - 7 Years in this Field</option>
                  <option value="8-10 Years">8 - 10 Years in this Field</option>
                  <option value="10+ Years">10+ Years (Senior / Leadership)</option>
                </select>
              </div>
            </div>

            <!-- Educational Requirements (Multiple Selection Schema + Subject Input) -->
            <div class="schema-box-wrapper" style="margin-bottom: 0;">
              <div style="margin-bottom: 8px;">
                <label style="display: block; font-weight: 700; font-size: 0.85rem; color: var(--white); margin-bottom: 2px;">
                  Educational Requirements (Multiple Selection Schema)
                </label>
                <div style="font-size: 0.78rem; color: var(--text-dim);">Select acceptable qualification levels for this role.</div>
              </div>

              <!-- Degrees Pool -->
              <div class="schema-pills-pool" id="create-job-degrees-pool" style="max-height: 120px; margin-bottom: 12px;">
                ${HOTEL_EDUCATION_DEGREES.map(deg => {
                  const isSel = createJobState.selectedDegrees.includes(deg);
                  return `<span class="schema-pill-item ${isSel ? 'selected' : ''}" onclick="toggleJobDegreeSelection('${deg}')">
                    ${isSel ? '✓ ' : '+ '}${deg}
                  </span>`;
                }).join('')}
              </div>

              <!-- Subject / Field of Study Input (Active when Bachelor's, Master's, or PhD is selected) -->
              <div id="higher-degree-field-container" style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); padding: 12px; border-radius: var(--radius-md); display: none;">
                <label style="display: block; font-weight: 700; font-size: 0.82rem; color: var(--white); margin-bottom: 4px;">
                  Subject / Field of Study (for Degree / Master's / PhD)
                </label>
                <input type="text" id="input-degree-field" value="${createJobState.degreeField}" placeholder="e.g. Hospitality Management, Tourism, Culinary Arts, Finance, Marketing, Food & Beverage, Any Discipline" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-sm); color: var(--white); font-size: 0.85rem;">
                <div style="font-size: 0.74rem; color: var(--text-dim); margin-top: 4px;">
                  Specify acceptable majors or academic disciplines for degree-level applicants.
                </div>
              </div>
            </div>

            <!-- Skill Requirements (Unified Schema Select System - Business Part 2 Reference) -->
            <div class="schema-box-wrapper" style="margin-bottom: 0;">
              <div style="margin-bottom: 8px;">
                <label style="display: block; font-weight: 700; font-size: 0.85rem; color: var(--white); margin-bottom: 2px;">
                  Skill Requirements (Hotel &amp; Resort Competencies Schema)
                </label>
                <div style="font-size: 0.78rem; color: var(--text-dim);">Select or add operational skills required for this role.</div>
              </div>

              <!-- Single Search Input with Enter to Add -->
              <input type="text" class="schema-search-input" id="input-job-skill-search" 
                placeholder="Type skill (e.g. Opera PMS, HACCP, VIP Concierge) and press Enter to add..." 
                value="${createJobState.skillSearchQuery || ''}" 
                oninput="filterJobSkills(this.value)"
                onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomJobSkill(this.value);}">

              <!-- Dynamic Add Chip -->
              <div id="job-skill-add-chip-container">
                ${(() => {
                  const q = (createJobState.skillSearchQuery || '').toLowerCase().trim();
                  const allPool = Array.from(new Set([...(createJobState.customSkillsPool || []), ...HOTEL_SKILLS_SCHEMA]));
                  const hasExactMatch = q && allPool.some(s => s.toLowerCase() === q);
                  if (q && !hasExactMatch) {
                    return `
                      <div class="schema-add-chip" onclick="addCustomJobSkill('${createJobState.skillSearchQuery.replace(/'/g, "\\'")}')" style="cursor: pointer; margin-bottom: 8px;">
                        + Add "${createJobState.skillSearchQuery}" to required skills
                      </div>
                    `;
                  }
                  return '';
                })()}
              </div>

              <!-- Filterable Skills Pool with Selected Stack at Top -->
              <div class="schema-pills-pool" id="job-skills-pool" style="max-height: 180px;">
                ${(() => {
                  const q = (createJobState.skillSearchQuery || '').toLowerCase().trim();
                  const allPool = Array.from(new Set([...(createJobState.customSkillsPool || []), ...HOTEL_SKILLS_SCHEMA]));
                  const selectedStack = (createJobState.selectedSkills || []).filter(s => !q || s.toLowerCase().includes(q));
                  const unselectedPool = allPool.filter(s => !createJobState.selectedSkills.includes(s)).filter(s => !q || s.toLowerCase().includes(q));

                  return [
                    ...selectedStack.map(s => `
                      <span class="schema-pill-item selected" onclick="toggleJobSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to unselect">
                        ✓ ${s}
                      </span>
                    `),
                    ...unselectedPool.map(s => `
                      <span class="schema-pill-item" onclick="toggleJobSkillSelection('${s.replace(/'/g, "\\'")}')" title="Click to select">
                        + ${s}
                      </span>
                    `)
                  ].join('');
                })()}
              </div>
            </div>

            <!-- Role Description -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                Role Description &amp; Responsibilities <span style="color: #f87171;">*</span>
              </label>
              <textarea name="description" rows="3" required placeholder="Outline key hospitality duties, guest service standards, and operational responsibilities..." style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem; line-height: 1.5;"></textarea>
            </div>

            <!-- Deadline & Priority -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">
                  Application Deadline <span style="color: #f87171;">*</span>
                </label>
                <input type="date" name="deadline" required value="" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
              </div>
              <div>
                <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; color: var(--white);">Posting Priority</label>
                <select name="is_urgent" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); padding: 9px 12px; border-radius: var(--radius-md); color: var(--white); font-size: 0.88rem;">
                  <option value="0">Standard Publication</option>
                  <option value="1">Urgent Job Post (Red Badge)</option>
                </select>
              </div>
            </div>

            <!-- Candidate Screening Questions (Prominent Section) -->
            <div style="background: rgba(249, 115, 22, 0.04); border: 1px solid rgba(249, 115, 22, 0.35); border-radius: var(--radius-md); padding: 16px; margin-top: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="color: var(--orange-primary); font-weight: 800; font-size: 0.95rem; margin: 0;">
                      Candidate Screening Questions
                    </label>
                    <span id="screening-questions-badge" style="background: rgba(249, 115, 22, 0.2); color: var(--orange-primary); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">
                      0 questions added
                    </span>
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">
                    Set custom questions for candidates to answer when applying. Their answers will appear in the Candidate Review dossier.
                  </div>
                </div>
              </div>
              
              <div id="screening-questions-container" style="display: block;">
                <!-- Dynamic questions rendered here -->
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeModal('modal-create-job')">Cancel</button>
            <button type="submit" class="btn-orange">Post Job →</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Update initial higher degree field visibility if needed
  // Initialize screening questions state array
  createJobState.screeningQuestions = [];
  updateJobDegreesUI();
  renderScreeningQuestions();
}

async function submitNewJob(event) {
  event.preventDefault();
  const form = event.target;

  const bId = state.currentUser?.business_id || state.activeHotelId;
  if (!bId) {
    showToast('Please sign in as a verified business to post jobs.', 'danger');
    return;
  }
  const bizObj = state.businesses?.find(b => b.id === bId);

  const higherDegreeSelected = createJobState.selectedDegrees.some(d => {
    const dl = d.toLowerCase();
    return dl.includes("bachelor") || dl.includes("master") || dl.includes("phd");
  });
  const degreeFieldValue = higherDegreeSelected ? (document.getElementById('input-degree-field')?.value.trim() || '') : '';

  const eduReqs = createJobState.selectedDegrees.map(deg => {
    const isHigher = deg.toLowerCase().includes("bachelor") || deg.toLowerCase().includes("master") || deg.toLowerCase().includes("phd");
    return {
      degree: deg,
      field: isHigher ? degreeFieldValue : ''
    };
  });

  const propertyLoc = bizObj ? (bizObj.address ? `${bizObj.address}, ${bizObj.city || ''}` : (bizObj.city || '')) : '';

  const payload = {
    business_id: bId,
    title: form.title.value.trim(),
    department: form.department.value,
    property_location: propertyLoc,
    employment_type: 'Full-time',
    shift: form.shift.value,
    is_negotiable: createJobState.isNegotiable,
    salary_min: createJobState.isNegotiable ? 0 : (parseInt(form.salary_min?.value) || 0),
    salary_max: createJobState.isNegotiable ? 0 : (parseInt(form.salary_max?.value) || 0),
    salary_period: createJobState.isNegotiable ? 'negotiable' : 'month',
    service_charge_included: false,
    accommodation_provided: false,
    duty_meals_provided: false,
    experience_level: form.experience_level.value,
    vacancies: 1,
    description: form.description.value.trim(),
    education_requirements: eduReqs,
    skill_requirements: createJobState.selectedSkills,
    screening_questions: (createJobState.screeningQuestions || [])
      .filter(q => q && q.q && q.q.trim())
      .map(q => ({
        q: q.q.trim(),
        type: q.type || 'question',
        options: q.type === 'multiple' ? (q.options || []) : []
      })),
    is_urgent: form.is_urgent.value === '1',
    deadline: form.deadline.value
  };

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Posting failed');

    closeModal('modal-create-job');
    showToast('Hospitality job post successfully posted and live in the job feed!', 'success');
    await loadInitialData();
    renderRecruiterDashboard(document.getElementById('app-viewport'));
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Close Modal Helper
function closeModal(modalId) {
  if (modalId === 'modal-pfp-crop') {
    closeCropModal();
    return;
  }
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('open');
}

// Quick Actions & Utilities
async function toggleSaveJob(jobId) {
  if (!state.currentUser || state.currentRole === 'guest') {
    showToast('Login required to save favourites', 'warning');
    if (typeof startLoginFlow === 'function') {
      startLoginFlow('candidate');
    } else {
      openAuthModal('candidate');
    }
    return;
  }
  if (state.currentRole !== 'jobseeker') {
    showToast('Candidate account required to save jobs', 'warning');
    return;
  }
  try {
    const res = await fetch(`/api/saved-jobs/${jobId}?user_id=${state.currentUser.id}`, { method: 'POST' });
    const data = await res.json();
    if (data.is_saved) {
      if (!state.savedJobs) state.savedJobs = [];
      if (!state.savedJobs.some(s => s.id === jobId || s.job_id === jobId)) {
        state.savedJobs.push({ id: jobId, job_id: jobId });
      }
      showToast('Saved to favourites', 'success');
    } else {
      if (state.savedJobs) {
        state.savedJobs = state.savedJobs.filter(s => s.id !== jobId && s.job_id !== jobId);
      }
      showToast('Removed from favourites', 'info');
    }
    // Update active job cards on page if present
    const cardEl = document.getElementById(`job-card-${jobId}`);
    if (cardEl) {
      const btn = cardEl.querySelector('.card-actions .btn-icon');
      if (btn) {
        if (data.is_saved) {
          btn.classList.add('saved');
          btn.title = 'Bookmarked';
          btn.innerHTML = svgIcon('starFilled', '', 16);
        } else {
          btn.classList.remove('saved');
          btn.title = 'Save Job Post';
          btn.innerHTML = svgIcon('star', '', 16);
        }
      }
    }
    // Update modal save button if open
    const modalDetail = document.getElementById('modal-job-detail');
    if (modalDetail) {
      const modalBtn = modalDetail.querySelector('.modal-footer .btn-icon');
      if (modalBtn) {
        if (data.is_saved) {
          modalBtn.classList.add('saved');
          modalBtn.title = 'Bookmarked';
          modalBtn.innerHTML = svgIcon('starFilled', '', 18);
        } else {
          modalBtn.classList.remove('saved');
          modalBtn.title = 'Save Job';
          modalBtn.innerHTML = svgIcon('star', '', 18);
        }
      }
    }
    if (state.currentView === 'saved' || state.currentScreen === 'saved') {
      renderSavedJobsScreen(document.getElementById('app-viewport'));
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function shareJob(jobId, encodedTitle) {
  const url = `${window.location.origin}/#job-details?id=${jobId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    showToast(`Job post link copied to clipboard: ${decodeURIComponent(encodedTitle)}`, 'success');
  } else {
    showToast(`Share URL: ${url}`);
  }
}

async function openConversationForJob(jobId, businessId, candidateId) {
  const isRecruiter = state.currentRole === 'recruiter';
  const bId = businessId || state.currentUser?.business_id || state.activeHotelId;
  const uId = candidateId || (!isRecruiter ? state.currentUser?.id : null);

  if (!state.currentUser) {
    if (typeof startLoginFlow === 'function') {
      startLoginFlow(isRecruiter ? 'business' : 'candidate');
    } else {
      openAuthModal(isRecruiter ? 'business' : 'candidate');
    }
    return;
  }

  if (!bId || !uId) {
    showToast('Could not initialize conversation: missing hotel or candidate identifier.', 'warning');
    navigateTo('inbox');
    return;
  }

  try {
    const res = await fetch('/api/conversations/get-or-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: bId,
        user_id: uId,
        job_id: jobId || null
      })
    });
    if (res.ok) {
      const conv = await res.json();
      state.activeConvId = conv.id;
      if (!state.conversations) state.conversations = [];
      const idx = state.conversations.findIndex(c => c.id === conv.id);
      if (idx >= 0) {
        state.conversations[idx] = conv;
      } else {
        state.conversations.unshift(conv);
      }
    }
  } catch (err) {
    console.error('Failed to get-or-create conversation thread:', err);
  }

  state.inboxMobileView = 'chat';
  if (state.activeConvId) {
    navigateTo('inbox', { conv: state.activeConvId, chat: '1' });
  } else {
    navigateTo('inbox');
  }
}

// Clean and shorten toast text to concise, punchy 2-4 word notifications
function formatShortToast(message) {
  if (!message) return '';
  let msg = String(message).trim();

  const map = {
    'Switched perspective to Job Seeker (Rahim Ahmed)': 'Job Seeker mode',
    'Switched perspective to Hotel Employer (Business Admin)': 'Employer mode',
    'Administrative console requires verified credentials.': 'Admin login required',
    'Browsing as Public Guest. Log-in required to apply or view candidate CVs.': 'Guest mode',
    'Demo data re-initialized to initial fresh state!': 'Demo reset!',
    'Authentication required: Root Administrator clearance is required.': 'Admin required',
    'Opened AHLEI Certification guide': 'AHLEI Guide',
    'Opened Marriott Partner Program details': 'Partner Program',
    'Hospitality job post successfully posted and live in the job feed!': 'Job post live!',
    'Hospitality vacancy successfully posted and live in the job feed!': 'Job post live!',
    'Job added to your saved bookmarks!': 'Job saved!',
    'Job removed from saved bookmarks.': 'Bookmark removed',
    'Article link copied to clipboard!': 'Link copied!',
    'Please enter a valid candidate email address.': 'Valid email required',
    'Please enter your password.': 'Password required',
    'Please enter a valid official business email.': 'Valid business email required',
    'Please enter your personal work email address.': 'Work email required',
    'Candidate log in failed.': 'Login failed',
    'Image file size must be under 5MB': 'Max image size: 5MB',
    'Please select a valid image file (JPG, PNG, or WebP)': 'Invalid image format',
    'Profile picture reset to default': 'Photo removed',
    'Logged out of administrative console.': 'Admin logged out',
    'Log in as candidate to apply': 'Candidate login required',
    'Please fill out all required fields': 'Required fields missing',
    'Please select your current CV': 'Please select CV',
    'This official business email is already registered to an existing account. Please log in or use a different official email.': 'Official email already registered',
    'This official business telephone is already registered to an existing account. Please use a different telephone number.': 'Official telephone already registered',
    'An account with this email address is already open. Please log in or use a different work email.': 'Account with email already open',
    'This email is registered as an official business email. Please use your personal work email.': 'Registered as business email'
  };
  if (map[msg]) return map[msg];

  msg = msg.replace(/^Switched perspective to\s+/i, '');
  msg = msg.replace(/^Application submitted with .*! Recruiter has been notified\./i, 'Application sent!');
  msg = msg.replace(/^Open to Work is now ON.*$/i, 'Open to Work: ON');
  msg = msg.replace(/^Open to Work turned OFF.*$/i, 'Open to Work: OFF');
  msg = msg.replace(/^Hotel followed!.*$/i, 'Hotel followed!');
  msg = msg.replace(/^Unfollowed hotel\..*$/i, 'Hotel unfollowed');
  msg = msg.replace(/^Failed to send message:\s*/i, 'Send failed: ');
  msg = msg.replace(/^Failed to connect to authentication server:\s*/i, 'Server error: ');
  msg = msg.replace(/^Failed to reset demo data:\s*/i, 'Reset failed: ');
  msg = msg.replace(/^Job post link copied to clipboard:.*$/i, 'Link copied!');
  msg = msg.replace(/^Article link:\s*/i, 'Link: ');
  msg = msg.replace(/^Profile picture attached:.*$/i, 'Photo attached');
  msg = msg.replace(/^Business verified:.*$/i, 'Business verified!');

  // Clean handling of raw JSON parse errors when receiving HTML or plain text error responses
  if (/Unexpected token/i.test(msg) || /is not valid JSON/i.test(msg)) {
    return 'Server communication error';
  }

  if (msg.length > 36) {
    const firstPart = msg.split(/[.!?:]/)[0];
    if (firstPart && firstPart.length <= 36 && firstPart.length >= 6) {
      msg = firstPart.trim() + '!';
    } else {
      msg = msg.slice(0, 33).trim() + '...';
    }
  }
  return msg;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const shortMessage = formatShortToast(message);

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

  // Enforce solid, non-transparent background
  if (type === 'danger') {
    toast.style.background = '#1c0e12';
    toast.style.borderColor = 'var(--danger)';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.95), 0 0 16px rgba(239, 68, 68, 0.35)';
  } else if (type === 'orange' || type === 'warning') {
    toast.style.background = '#211307';
    toast.style.borderColor = 'var(--orange-primary)';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.95), 0 0 16px rgba(255, 107, 0, 0.35)';
  } else if (type === 'success') {
    toast.style.background = '#0a1c14';
    toast.style.borderColor = 'var(--success)';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.95), 0 0 16px rgba(16, 185, 129, 0.35)';
  } else {
    toast.style.background = '#0d1527';
    toast.style.borderColor = 'rgba(255, 255, 255, 0.22)';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.95), 0 0 16px rgba(0, 0, 0, 0.5)';
  }
  toast.style.opacity = '1';

  const icon = type === 'danger' ? svgIcon('alertCircle', '', 18) 
    : ((type === 'orange' || type === 'warning') ? svgIcon('clock', '', 18) 
    : (type === 'success' ? svgIcon('checkCircle', '', 18) 
    : svgIcon('info', '', 18)));

  toast.innerHTML = `<span style="display: inline-flex; align-items: center;">${icon}</span> <span>${shortMessage}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// Notifications Drawer & Action Modal
async function openNotificationsModal() {
  const container = document.getElementById('modal-container');
  if (!container) return;

  const notifs = state.notifications || [];
  const unreadCount = notifs.filter(n => !n.is_read).length;

  container.innerHTML = `
    <div class="modal-backdrop open" id="modal-notifs">
      <div class="modal-dialog" style="max-width: 520px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
              ${svgIcon('bell', '', 18)} Notifications ${unreadCount > 0 ? `<span class="badge-count">${unreadCount}</span>` : ''}
            </h2>
            <div style="font-size: 0.8rem; color: var(--text-dim);">Application status updates, interviews, and job alerts</div>
          </div>
          <button class="modal-close" onclick="closeModal('modal-notifs')" aria-label="Close modal">${svgIcon('x', '', 18)}</button>
        </div>

        <div class="modal-body" style="max-height: 440px; overflow-y: auto; padding: 16px;">
          ${notifs.length === 0 ? `
            <div style="text-align: center; padding: 36px 16px; color: var(--text-dim);">
              <div style="margin-bottom: 8px; color: var(--blue-primary);">${svgIcon('bell', '', 32)}</div>
              <p style="margin: 0; font-size: 0.9rem;">No notifications yet.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${notifs.map(n => `
                <div style="padding: 14px; border-radius: var(--radius-md); background: ${n.is_read ? 'var(--bg-surface-elevated)' : 'rgba(37, 99, 235, 0.12)'}; border: 1px solid ${n.is_read ? 'var(--border-subtle)' : 'rgba(37, 99, 235, 0.4)'}; cursor: pointer; transition: var(--transition);" onclick="handleNotificationClick('${n.id}', '${n.link || '#applications'}')">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                    <strong style="font-size: 0.9rem; color: ${n.is_read ? 'var(--white)' : '#93c5fd'};">${n.title}</strong>
                    <span style="font-size: 0.72rem; color: var(--text-dim); white-space: nowrap;">${n.timestamp}</span>
                  </div>
                  <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.4;">${n.message}</p>
                  ${!n.is_read ? `<span style="display: inline-block; margin-top: 6px; font-size: 0.68rem; font-weight: 700; color: #34d399; background: rgba(16, 185, 129, 0.15); padding: 2px 6px; border-radius: 4px;">Unseen</span>` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
          ${unreadCount > 0 ? `
            <button class="btn-secondary" style="font-size: 0.8rem; padding: 6px 14px;" onclick="markAllNotificationsAsRead()">
              Mark all as read
            </button>
          ` : `<span></span>`}
          <button class="btn-primary" style="font-size: 0.8rem; padding: 6px 16px;" onclick="closeModal('modal-notifs')">
            Close
          </button>
        </div>
      </div>
    </div>
  `;
}

async function markAllNotificationsAsRead() {
  if (!state.currentUser?.id) return;
  try {
    const userId = state.currentUser.id;
    await fetch(`/api/notifications/read-all?user_id=${userId}`, { method: 'POST' });
    if (state.notifications) {
      state.notifications.forEach(n => { n.is_read = 1; });
    }
    updateNavigation();
    closeModal('modal-notifs');
    showToast('All notifications marked as read', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleNotificationClick(notifId, link) {
  const notif = (state.notifications || []).find(n => n.id === notifId);
  if (notif) notif.is_read = 1;
  updateNavigation();
  closeModal('modal-notifs');
  if (link && link.startsWith('#')) {
    navigateTo(link.replace('#', ''));
  }
}

// Close mobile navigation drawer when clicking outside
document.addEventListener('click', function(e) {
  const drawer = document.getElementById('mobile-nav-drawer');
  const btn = document.getElementById('btn-mobile-menu');
  if (drawer && drawer.classList.contains('is-open')) {
    if (!drawer.contains(e.target) && !btn?.contains(e.target)) {
      closeMobileMenu();
    }
  }

  const dropdown = document.getElementById('guest-search-dropdown');
  const inputQ = document.getElementById('input-search-q');
  if (dropdown && dropdown.style.display !== 'none') {
    if (!dropdown.contains(e.target) && e.target !== inputQ) {
      closeGuestSearchDropdown();
    }
  }
});
