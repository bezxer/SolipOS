'use strict';
const Login = {
  timer: null, wait: null,
  async show() {
    const el = $('#login');
    if (!el.hidden) return;
    el.hidden = false; el.classList.remove('out'); document.body.classList.add('locked');
    this.look(); this.clock(); clearInterval(this.timer); this.timer = setInterval(() => this.clock(), 1000);
    const u = store.get('user', '');
    $('#user').value = u;
    setTimeout(() => (u ? $('#pw') : $('#user')).focus(), 60);
  },
  mode(m) {
    this.m = m;
    const f = $('#login form'); f.dataset.mode = m;
    $('#pw').autocomplete = m === 'setup' ? 'new-password' : 'current-password';
    $('#user').autocomplete = m === 'setup' ? 'off' : 'username';
    this.err('');
  },
  strength(p) {
    let n = 0; if (p.length >= 8) n++; if (p.length >= 12) n++; if (/[a-zа-я]/.test(p) && /[A-ZА-Я]/.test(p)) n++; if (/\d/.test(p)) n++; if (/[^\w\s]/.test(p)) n++;
    return p.length < 8 ? 0 : n <= 2 ? 1 : n <= 3 ? 2 : 3;
  },
  async look() {
    try {
      const l = await (await fetch('/api/public/look')).json(), wall = $('#wall');
      this.mode(l.setup ? 'setup' : 'login');
      if (l.setup) setTimeout(() => $('#user').focus(), 80);
      wall.style.background = l.wall.kind === 'image' ? 'center / cover no-repeat url("/api/public/wall")' : l.wall.kind === 'preset' ? wallFor(l.wall.id) : '';
    } catch {}
  },
  clock() {
    const d = new Date(), loc = LANG === 'en' ? 'en-GB' : LANG;
    $('[data-lt]').textContent = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    const dt = d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
    $('[data-ld]').textContent = dt[0].toUpperCase() + dt.slice(1);
  },
  err(msg, kind = 'err') {
    const e = $('#loginErr'); e.textContent = msg; e.className = 'lk-err ' + kind;
    if (kind === 'err') { const c = $('.lk-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  },
  lock(sec) {
    const btn = $('#loginBtn'); clearInterval(this.wait);
    this.locked = true;
    const tick = () => { if (sec <= 0) { clearInterval(this.wait); this.locked = false; btn.disabled = false; this.err(''); return; } btn.disabled = true; this.err(t('e.too_many', { s: sec-- }), 'warn'); };
    tick(); this.wait = setInterval(tick, 1000);
  },
  init() {
    const pw = $('#pw'), eye = $('#pwEye');
    const eyeIcon = () => { const shown = pw.type === 'text'; eye.innerHTML = icon(shown ? 'eyeOff' : 'eye'); eye.title = t(shown ? 'login.hide' : 'login.show'); eye.setAttribute('aria-label', eye.title); };
    eyeIcon();
    eye.onclick = () => { pw.type = pw.type === 'password' ? 'text' : 'password'; eyeIcon(); pw.focus(); };
    const caps = e => { if (e.getModifierState) $('#caps').hidden = !e.getModifierState('CapsLock'); };
    pw.addEventListener('keydown', caps); pw.addEventListener('keyup', caps);
    pw.addEventListener('input', () => {
      if (this.m !== 'setup') return;
      const k = this.strength(pw.value), m = $('.lk-meter');
      m.dataset.k = pw.value ? k : '';
      $('[data-strength]', m).textContent = pw.value ? t(['pw.short', 'pw.weak', 'pw.ok', 'pw.strong'][k]) : '';
    });
    $('#login form').onsubmit = async e => {
      e.preventDefault();
      const user = $('#user').value.trim(), password = pw.value, remember = this.m === 'setup' || $('#remember').checked;
      if (!user) { $('#user').focus(); return this.err(t('login.need.user')); }
      if (this.m === 'setup' && !/^[A-Za-z0-9._-]{2,32}$/.test(user)) { $('#user').focus(); return this.err(t('e.bad_username')); }
      if (!password) { pw.focus(); return this.err(t('login.need.pw')); }
      if (this.m === 'setup' && password.length < 8) { pw.focus(); return this.err(t('e.weak_password')); }
      if (this.m === 'setup' && password !== $('#pw2').value) { $('#pw2').focus(); return this.err(t('e.pw_mismatch')); }
      const btn = $('#loginBtn'); btn.disabled = true; btn.classList.add('busy'); this.err('');
      try {
        const r = await fetch(this.m === 'setup' ? '/api/setup' : '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password, remember }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 429) return this.lock(d.wait || 30);
        if (r.status === 409) { this.mode(d.error === 'need_setup' ? 'setup' : 'login'); return this.err(t(d.error === 'need_setup' ? 'setup.title' : 'e.already_setup'), 'warn'); }
        if (this.m === 'setup' && !r.ok) return this.err(errText(new Error(d.error)));
        if (!r.ok) { pw.select(); return this.err(t('e.wrong_login') + (d.left > 0 && d.left < 3 ? ' · ' + t('login.left', { n: d.left }) : '')); }
        store.set('user', remember ? user : '');
        pw.value = ''; $('#pw2').value = ''; pw.type = 'password'; eyeIcon(); WS.user = d.user;
        const el = $('#login'); el.classList.add('out'); clearInterval(this.timer); document.body.classList.remove('locked');
        setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, reduced() ? 0 : 420);
        boot();
      } catch { this.err(t('e.network')); }
      finally { if (!this.locked) btn.disabled = false; btn.classList.remove('busy'); }
    };
  },
};

function initChrome() {
  applyI18n();
  Dock.init(); Dock.render();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (Palette.mode() === 'auto') Palette.set('auto'); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => WS.reflow(), 120); });
  document.addEventListener('keydown', e => {
    const typing = e.target instanceof Element && e.target.closest('input,textarea,.xterm');
    if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); const k = LAUNCH[+e.key - 1]; const w = WS.wins.find(x => x.id === launchId(k)); w ? WS.toggle(w) : WS.open(k, k === 'term' ? 'host' : null); }
    if (e.altKey && e.code === 'KeyD') { e.preventDefault(); WS.showDesk(); }
    if (((e.ctrlKey || e.metaKey) && e.code === 'KeyK') || (e.key === '/' && !typing)) { e.preventDefault(); Spot.open(); }
  });
}

let booted = false;
async function boot() {
  try { await api('/api/system'); } catch (e) { return; }
  if (booted) return;
  api('/api/me').then(m => { WS.user = m.user; Dock.render(); }).catch(() => {});
  await Settings.load();
  booted = true;
  Desk.mount();
  WS.restoreAll();
}

Login.init();
Settings.init();
initChrome();
boot();
