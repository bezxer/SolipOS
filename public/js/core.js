'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const store = {
  get(k, d) { try { const v = localStorage.getItem('sp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sp.' + k, JSON.stringify(v)); } catch {} },
};
const ICONS = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  apps: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
  containers: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
  images: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  term: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  files: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6"/>',
  logs: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6M16 13H8M16 17H8M10 9H8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  max: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  min: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  folderPlus: '<path d="M12 10v6M9 13h6"/><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  filePlus: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6M12 12v6M9 15h6"/>',
  up: '<path d="m5 12 7-7 7 7M12 19V5"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  eraser: '<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  pencil: '<path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/>',
  minus: '<path d="M5 12h14"/>',
  restoreWin: '<rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  settings: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  folderUp: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/><path d="M12 17v-6M9 14l3-3 3 3"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M14.1 14.1a3 3 0 0 1-4.2-4.2M2 2l20 20"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const fmtB = b => { if (b == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (b >= 1024 && i < 4) { b /= 1024; i++; } return b.toFixed(i ? 1 : 0) + ' ' + u[i]; };
const fmtDate = ms => ms ? new Date(ms).toLocaleString(LANG === 'en' ? 'en-GB' : LANG, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtUp = s => { const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return t('uptime', { d, h: hh, m }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const basename = p => p.split('/').filter(Boolean).pop() || '/';
const joinP = (a, b) => (a === '/' ? '' : a) + '/' + b;
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isPhone = () => matchMedia('(max-width:820px)').matches;

let LANG = store.get('lang', null) || ((navigator.language || '').startsWith('ru') ? 'ru' : (navigator.language || '').startsWith('en') ? 'en' : 'uk');
if (!I18N[LANG]) LANG = 'uk';
document.documentElement.lang = LANG;
function t(k, v) {
  let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.uk[k] ?? k;
  if (v) s = s.replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  return s;
}
const errText = e => { const k = 'e.' + (e && e.message); return (I18N.uk[k] ? t(k) : (e && e.message)) || t('e.unknown'); };
function applyI18n(root = document) {
  $$('[data-i18n]', root).forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]', root).forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}

async function api(url, opt = {}) {
  const o = { ...opt, headers: { ...(opt.headers || {}) } };
  if (o.body && !(o.body instanceof FormData)) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.body); }
  const r = await fetch(url, o);
  if (r.status === 401 && !url.endsWith('/login')) { Login.show(); throw Object.assign(new Error('auth'), { auth: true }); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || data || r.statusText);
  return data;
}
function uploadXHR(url, fd, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      let d; try { d = JSON.parse(x.responseText); } catch { d = x.responseText; }
      if (x.status === 401) { Login.show(); return reject(Object.assign(new Error('auth'), { auth: true })); }
      x.status < 400 ? resolve(d) : reject(new Error((d && d.error) || x.statusText));
    };
    x.onerror = () => reject(new Error('network'));
    x.send(fd);
  });
}
function toast(msg, kind = 'ok') {
  const el = h(`<div class="toast"><span class="dot ${kind}"></span><span></span></div>`);
  el.lastChild.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 280); }, kind === 'err' ? 6000 : 3000);
}
const safe = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (!e.auth) toast(errText(e), 'err'); } };

function dialog(title, body, { foot = '', size = '' } = {}) {
  const el = h(`<div class="scrim"><div class="dlg ${size}" role="dialog" aria-modal="true"><div class="dlg-h"><span></span><button class="btn ghost ib" data-x>${icon('x')}</button></div><div class="dlg-b">${body}</div>${foot ? `<div class="dlg-f">${foot}</div>` : ''}</div></div>`);
  $('.dlg-h span', el).textContent = title;
  const close = () => { el.remove(); document.removeEventListener('keydown', key); d.onclose && d.onclose(); };
  const key = e => { if (e.key === 'Escape') close(); };
  const d = { el, close, onclose: null };
  document.addEventListener('keydown', key);
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  $('[data-x]', el).onclick = close;
  applyI18n(el);
  document.body.append(el);
  return d;
}
function ask(title, value = '') {
  return new Promise(res => {
    const d = dialog(title, `<input class="in" id="askv">`, { size: 'narrow', foot: `<button class="btn" data-c>${t('cancel')}</button><button class="btn pri" data-ok>${t('ok')}</button>` });
    const inp = $('#askv', d.el); inp.value = value; inp.focus(); inp.select();
    let v = null;
    d.onclose = () => res(v);
    $('[data-ok]', d.el).onclick = () => { v = inp.value.trim() || null; d.close(); };
    $('[data-c]', d.el).onclick = d.close;
    inp.onkeydown = e => { if (e.key === 'Enter') $('[data-ok]', d.el).click(); };
  });
}
function confirmBox(text, { okText, extra } = {}) {
  return new Promise(res => {
    const d = dialog(t('confirm'), `<div style="font-size:var(--fs-14);line-height:var(--lh-read)"></div>${extra ? `<label class="state" style="gap:8px;cursor:pointer"><input type="checkbox" id="cbx"> <span>${esc(extra)}</span></label>` : ''}`,
      { size: 'narrow', foot: `<button class="btn" data-c>${t('cancel')}</button><button class="btn pri" data-ok>${esc(okText || t('delete'))}</button>` });
    $('.dlg-b>div', d.el).textContent = text;
    let v = false;
    d.onclose = () => res(v);
    $('[data-ok]', d.el).onclick = () => { v = extra ? { ok: true, extra: $('#cbx', d.el).checked } : true; d.close(); };
    $('[data-c]', d.el).onclick = d.close;
  });
}
function menu(anchor, items) {
  $$('.menu').forEach(m => m.remove());
  const el = h(`<div class="menu" role="menu"></div>`);
  for (const it of items) {
    if (it === '-') { el.append(h('<hr>')); continue; }
    if (it.head) { el.append(h(`<div class="mh">${esc(it.head)}</div>`)); continue; }
    const b = h(`<button class="mi ${it.on ? 'on' : ''}" role="menuitem">${it.iconHtml || (it.icon ? icon(it.icon) : '')}<span>${esc(it.label)}</span></button>`);
    b.onclick = () => { el.remove(); it.run(); };
    el.append(b);
  }
  document.body.append(el);
  const r = anchor.getBoundingClientRect(), mw = el.offsetWidth, mh = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
  el.style.top = (r.bottom + 8 + mh > innerHeight ? r.top - mh - 8 : r.bottom + 8) + 'px';
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!el.contains(e.target)) { el.remove(); document.removeEventListener('mousedown', off); } }));
}

async function waitJob(id, onTick) {
  for (;;) {
    const j = await api('/api/jobs/' + id);
    onTick && onTick(j);
    if (j.status !== 'running') return j;
    await sleep(800);
  }
}
function jobDialog(id, title) {
  const d = dialog(title, `<div class="state"><span class="dot inf pulse"></span><span data-st>${t('job.running')}</span></div><pre class="log" style="max-height:52vh"></pre>`,
    { size: 'wide', foot: `<button class="btn pri" data-x2>${t('close')}</button>` });
  $('[data-x2]', d.el).onclick = d.close;
  const pre = $('pre', d.el);
  return waitJob(id, j => {
    const bottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
    pre.textContent = j.log; if (bottom) pre.scrollTop = pre.scrollHeight;
    const st = j.status === 'done' ? ['ok', 'job.done'] : j.status === 'error' ? ['err', 'job.error'] : ['inf pulse', 'job.running'];
    $('.state .dot', d.el).className = 'dot ' + st[0]; $('[data-st]', d.el).textContent = t(st[1]);
  }).then(j => { if (j.status === 'done') setTimeout(() => d.el.isConnected && d.close(), 1400); return j; });
}
async function quietJob(id, title) {
  const j = await waitJob(id);
  if (j.status === 'error') {
    const d = dialog(title, `<div class="state"><span class="dot err"></span>${t('job.error')}</div><pre class="log" style="max-height:52vh"></pre>`, { size: 'wide' });
    $('pre', d.el).textContent = j.log;
  }
  return j;
}

new MutationObserver(() => $$('button[title]:not([aria-label]),[role=button][title]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.title)))
  .observe(document.documentElement, { childList: true, subtree: true });

const Palette = {
  get() { return document.documentElement.dataset.palette; },
  mode() { try { const m = localStorage.getItem('sp.palette'); return m === 'dark' || m === 'light' ? m : 'auto'; } catch { return 'auto'; } },
  set(m) {
    try { localStorage.setItem('sp.palette', m); } catch {}
    document.documentElement.dataset.palette = m === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m;
    this.icon(); document.dispatchEvent(new Event('palette'));
  },
  icon() { if (WS.ready) Dock.render(); },
};
function xtermTheme() {
  const dark = Palette.get() === 'dark';
  const c = dark
    ? { black: '#2a2a31', red: '#ef6f7e', green: '#6cc79a', yellow: '#e6b45e', blue: '#6cb6ff', magenta: '#e88fae', cyan: '#7fc1d6', white: '#b4b4bd' }
    : { black: '#17171f', red: '#c73a50', green: '#22875f', yellow: '#a86c0d', blue: '#2f6fd6', magenta: '#c64a72', cyan: '#2a85a3', white: '#62626e' };
  const bright = {}; for (const k in c) bright['bright' + k[0].toUpperCase() + k.slice(1)] = c[k];
  return { ...c, ...bright, brightBlack: dark ? '#8b8b95' : '#6e6e7a', brightWhite: dark ? '#ededf1' : '#17171f',
    background: cssVar('--surface2'), foreground: cssVar('--text'), cursor: cssVar('--text'), cursorAccent: cssVar('--surface2'), selectionBackground: dark ? 'rgba(255,255,255,.18)' : 'rgba(20,20,40,.14)' };
}
