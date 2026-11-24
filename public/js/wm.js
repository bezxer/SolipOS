'use strict';
const Types = {};
const LAUNCH = ['apps', 'containers', 'images', 'term', 'files'];
const launchId = k => (k === 'term' ? 'term:host' : k);
const TOP = 20, DOCK_H = 88, EDGE = 20;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_SPRING = 'cubic-bezier(.32,1.25,.5,1)', EASE_GLIDE = 'cubic-bezier(.2,.8,.2,1)';

class Win {
  constructor(type, arg, id) {
    this.type = type; this.arg = arg; this.id = id; this.def = Types[type];
    this.timers = []; this.cleanups = []; this.min = false; this.max = false;
    this.el = h(`<section class="os-t win" data-id="${esc(id)}" tabindex="-1"><div class="win-h"><div class="ttl">${icon(this.def.icon)}<span></span></div><div class="win-tools"></div>
      <div class="win-ctl"><button class="btn ghost ib" data-w="min">${icon('minus')}</button><button class="btn ghost ib" data-w="max">${icon('max')}</button><button class="btn ghost ib" data-w="close">${icon('x')}</button></div></div>
      <div class="win-b"></div><div class="rz"></div></section>`);
    this.body = $('.win-b', this.el); this.tools = $('.win-tools', this.el);
    $('[data-w="min"]', this.el).title = t('win.min'); $('[data-w="max"]', this.el).title = t('win.max'); $('[data-w="close"]', this.el).title = t('close');
    this.el.addEventListener('pointerdown', () => WS.front(this), true);
    $('[data-w="min"]', this.el).onclick = () => WS.minimize(this);
    $('[data-w="max"]', this.el).onclick = () => WS.toggleMax(this);
    $('[data-w="close"]', this.el).onclick = () => WS.close(this);
    WS.dragify(this);
    this.title(typeof this.def.title === 'function' ? this.def.title(arg) : t(this.def.title));
    safe(() => this.def.mount(this))();
  }
  title(s) { this.name = s; $('.ttl span', this.el).textContent = s; if (WS.ready) Dock.render(); }
  tool(html) { const el = h(html); this.tools.append(el); return el; }
  poll(fn, ms) { this.timers.push(setInterval(() => { if (!document.hidden && !this.min) fn().catch(() => {}); }, ms)); }
  onClose(fn) { this.cleanups.push(fn); }
  destroy() { this.timers.forEach(clearInterval); this.cleanups.forEach(f => { try { f(); } catch {} }); this.el.remove(); }
}

const Anim = {
  dockRect(w) {
    const ids = LAUNCH.map(launchId);
    const key = ids.includes(w.id) ? LAUNCH[ids.indexOf(w.id)] : '#' + w.id;
    const b = $(`#dock .dock-btn[data-k="${CSS.escape(key)}"]`) || $('#dock .dock-btn[data-k="@desk"]');
    return b ? b.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight, width: 0, height: 0 };
  },
  toDock(w, r) {
    const d = this.dockRect(w);
    const s = Math.max(0.06, Math.min(d.width / r.width, 0.2));
    return `translate(${d.left + d.width / 2 - r.left - (r.width * s) / 2}px, ${d.top + d.height / 2 - r.top - (r.height * s) / 2}px) scale(${s})`;
  },
  run(el, frames, opt) {
    if (reduced()) return Promise.resolve();
    el.getAnimations().forEach(a => a.cancel());
    return el.animate(frames, { fill: 'none', ...opt }).finished.catch(() => {});
  },
  open(w) { const r = w.el.getBoundingClientRect(); return this.run(w.el, [{ transform: this.toDock(w, r), opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: EASE_SPRING }); },
  min(w) { const r = w.el.getBoundingClientRect(); return this.run(w.el, [{ transform: 'none', opacity: 1 }, { transform: this.toDock(w, r), opacity: 0 }], { duration: 340, easing: 'cubic-bezier(.5,0,.75,.2)' }); },
  close(w) { return this.run(w.el, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(8px) scale(.94)', opacity: 0 }], { duration: 200, easing: EASE_GLIDE }); },
  flip(w, before) {
    const a = w.el.getBoundingClientRect();
    if (!before.width || !a.width) return;
    return this.run(w.el, [{ transform: `translate(${before.left - a.left}px, ${before.top - a.top}px) scale(${before.width / a.width}, ${before.height / a.height})` }, { transform: 'none' }], { duration: 420, easing: EASE_SPRING });
  },
};

const WS = {
  wins: [], z: 10, focus: null, geo: store.get('geo', {}), hidden: null, ready: false,
  area() { return { x: EDGE, y: TOP, w: innerWidth - EDGE * 2, h: innerHeight - TOP - DOCK_H }; },
  open(type, arg = null, { save = true, state } = {}) {
    const id = arg == null ? type : `${type}:${arg}`;
    let w = this.wins.find(x => x.id === id), fresh = false;
    if (!w) {
      w = new Win(type, arg, id); fresh = true;
      this.wins.push(w); $('#wins').append(w.el);
      w.g = this.fit(this.geo[id] || this.defGeo(w));
      if (state) { w.min = !!state.min; w.max = !!state.max; }
    } else if (!w.min) { w.el.classList.remove('flash'); void w.el.offsetWidth; w.el.classList.add('flash'); }
    const wasMin = w.min;
    if (!state) w.min = false;
    this.hidden = null;
    this.apply(w); if (!w.min) this.front(w);
    Dock.render(); if (save) this.save();
    if (!state && (fresh || wasMin)) { Anim.open(w); Dock.bounce(w); }
    return w;
  },
  defGeo(w) {
    const a = this.area(), [dw, dh] = w.def.size || [820, 560];
    const W = Math.min(dw, a.w), H = Math.min(dh, a.h);
    const n = this.wins.filter(x => !x.min).length - 1;
    return { x: a.x + (a.w - W) / 2 + (n % 5) * 32 - 64, y: a.y + Math.max(0, (a.h - H) / 2 - 30) + (n % 5) * 32, w: W, h: H };
  },
  fit(g) {
    const a = this.area();
    const w = Math.max(360, Math.min(g.w, a.w)), hh = Math.max(240, Math.min(g.h, a.h));
    return { w, h: hh, x: Math.min(Math.max(g.x, a.x - w + 120), a.x + a.w - 120), y: Math.min(Math.max(g.y, a.y - 8), a.y + a.h - 48) };
  },
  apply(w) {
    const s = w.el.style;
    w.el.hidden = w.min;
    w.el.classList.toggle('max', w.max);
    if (isPhone() || w.max) { s.left = s.top = s.width = s.height = ''; }
    else { s.left = w.g.x + 'px'; s.top = w.g.y + 'px'; s.width = w.g.w + 'px'; s.height = w.g.h + 'px'; }
    $('[data-w="max"]', w.el).innerHTML = icon(w.max ? 'restoreWin' : 'max');
  },
  front(w) {
    if (this.focus === w && +w.el.style.zIndex === this.z) return;
    w.el.style.zIndex = ++this.z; this.focus = w;
    this.wins.forEach(x => x.el.classList.toggle('focus', x === w));
    Dock.render(); this.save();
  },
  topVisible() { return this.wins.filter(x => !x.min).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0] || null; },
  refocus() { this.focus = this.topVisible(); this.wins.forEach(x => x.el.classList.toggle('focus', x === this.focus)); },
  async minimize(w) {
    if (w.min) return;
    w.min = true; this.refocus(); Dock.render(); this.save();
    await Anim.min(w);
    if (w.min) this.apply(w);
  },
  restore(w) { w.min = false; this.apply(w); this.front(w); this.hidden = null; Dock.render(); this.save(); Anim.open(w); },
  toggle(w) { if (w.min) this.restore(w); else if (this.focus === w) this.minimize(w); else this.front(w); },
  toggleMax(w) { const b = w.el.getBoundingClientRect(); w.max = !w.max; this.apply(w); this.front(w); this.save(); Anim.flip(w, b); },
  async close(w) {
    this.wins = this.wins.filter(x => x !== w);
    if (this.focus === w) this.refocus();
    Dock.render(); this.save();
    await Anim.close(w);
    w.destroy();
  },
  showDesk() {
    const vis = this.wins.filter(w => !w.min);
    if (vis.length) { this.hidden = vis.map(w => w.id); vis.forEach(w => this.minimize(w)); this.focus = null; }
    else if (this.hidden) { const ids = this.hidden; this.hidden = null; ids.forEach((id, i) => { const w = this.wins.find(x => x.id === id); if (w) setTimeout(() => this.restore(w), i * 40); }); }
    else Desk.ping();
    Dock.render(); this.save();
  },
  dragify(w) {
    const head = $('.win-h', w.el), rz = $('.rz', w.el);
    head.addEventListener('pointerdown', e => {
      if (isPhone() || e.button !== 0 || e.target.closest('button,input,select,a,.win-tools')) return;
      e.preventDefault();
      let sx = e.clientX, sy = e.clientY, moved = false;
      const mv = ev => {
        if (!moved) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
          moved = true; document.body.classList.add('dragging'); w.el.classList.add('moving');
          if (w.max) {
            const r = (ev.clientX - EDGE) / this.area().w; w.max = false;
            w.g = this.fit({ ...w.g, x: ev.clientX - w.g.w * r, y: TOP }); this.apply(w); sx = ev.clientX; sy = ev.clientY;
          }
        }
        const dy = Math.max(TOP - 8 - w.g.y, ev.clientY - sy);
        w.el.style.transform = `translate3d(${ev.clientX - sx}px, ${dy}px, 0)`;
      };
      const up = ev => {
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
        if (!moved) return;
        document.body.classList.remove('dragging'); w.el.classList.remove('moving');
        w.g.x += ev.clientX - sx; w.g.y += Math.max(TOP - 8 - w.g.y, ev.clientY - sy);
        w.el.style.transform = ''; w.g = this.fit(w.g); this.apply(w); this.save();
      };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button,input,select,a')) this.toggleMax(w); });
    rz.addEventListener('pointerdown', e => {
      if (isPhone() || e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, g0 = { ...w.g };
      document.body.classList.add('dragging');
      let raf = 0;
      const mv = ev => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { w.g.w = Math.max(360, g0.w + ev.clientX - sx); w.g.h = Math.max(240, g0.h + ev.clientY - sy); this.apply(w); }); };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); w.g = this.fit(w.g); this.apply(w); this.save(); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    });
  },
  save() {
    const order = [...this.wins].sort((a, b) => a.el.style.zIndex - b.el.style.zIndex);
    for (const w of this.wins) this.geo[w.id] = w.g;
    store.set('geo', this.geo);
    store.set('ws2', order.map(w => [w.type, w.arg, w.min ? 1 : 0, w.max ? 1 : 0]));
  },
  restoreAll() {
    for (const [type, arg, min, max] of store.get('ws2', [])) if (Types[type]) this.open(type, arg, { save: false, state: { min, max } });
    this.ready = true;
    const top = this.topVisible(); if (top) { this.focus = null; this.front(top); }
    Dock.render();
    this.wins.filter(w => !w.min).forEach((w, i) => setTimeout(() => Anim.open(w), 80 + i * 60));
  },
  reflow() { this.wins.forEach(w => { w.g = this.fit(w.g); this.apply(w); }); },
};

const Dock = {
  render() {
    const el = $('#dock'); if (!el) return;
    const ids = LAUNCH.map(launchId);
    const extra = WS.wins.filter(w => !ids.includes(w.id));
    const btn = (key, ic, tip, w, cls = '') => `<button class="dock-btn ${cls} ${w ? 'open' : ''} ${w && !w.min && WS.focus === w ? 'on' : ''} ${w && w.min ? 'minz' : ''}" data-k="${esc(key)}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${icon(ic, 'lg')}</button>`;
    const tray = (k, ic, tip, cls = '') => `<button class="dock-btn ${cls}" data-k="${k}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${icon(ic)}</button>`;
    el.innerHTML = btn('@desk', 'home', t('w.home'), null, WS.wins.every(w => w.min) ? 'on' : '')
      + '<span class="dock-sep"></span>'
      + LAUNCH.map(k => btn(k, k, t(k === 'term' ? 'terminal' : k), WS.wins.find(w => w.id === launchId(k)))).join('')
      + (extra.length ? '<span class="dock-sep x"></span>' + extra.map(w => btn('#' + w.id, w.def.icon, w.name || w.id, w, 'x')).join('') : '')
      + '<span class="dock-sep"></span><div class="tray">'
      + tray('@search', 'search', t('search') + ' · Ctrl K')
      + tray('@palette', Palette.get() === 'dark' ? 'sun' : 'moon', t(Palette.get() === 'dark' ? 'palette.light' : 'palette.dark'))
      + tray('@settings', 'settings', t('settings'))
      + tray('@logout', 'logout', t('logout') + (WS.user ? ' · ' + WS.user : ''))
      + tray('@more', 'dots', t('more'), 'tray-more')
      + '</div>';
  },
  bounce(w) {
    if (reduced()) return;
    const ids = LAUNCH.map(launchId);
    const key = ids.includes(w.id) ? LAUNCH[ids.indexOf(w.id)] : '#' + w.id;
    requestAnimationFrame(() => { const b = $(`#dock .dock-btn[data-k="${CSS.escape(key)}"]`); if (b) { b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce'); } });
  },
  tray(k, b) {
    if (k === '@search') return Spot.open();
    if (k === '@palette') return togglePalette();
    if (k === '@settings') return WS.open('settings');
    if (k === '@logout') return logout();
    if (k === '@more') return menu(b, [
      { label: t('search'), icon: 'search', run: () => Spot.open() },
      { label: t(Palette.get() === 'dark' ? 'palette.light' : 'palette.dark'), icon: Palette.get() === 'dark' ? 'sun' : 'moon', run: togglePalette },
      { label: t('settings'), icon: 'settings', run: () => WS.open('settings') },
      '-', { label: t('logout'), icon: 'logout', run: logout }]);
  },
  init() {
    const el = $('#dock');
    el.onclick = e => {
      const b = e.target.closest('.dock-btn'); if (!b) return;
      const k = b.dataset.k;
      if (k === '@desk') return WS.showDesk();
      if (k[0] === '@') return this.tray(k, b);
      const w = WS.wins.find(x => x.id === (k[0] === '#' ? k.slice(1) : launchId(k)));
      if (w) WS.toggle(w); else WS.open(k, k === 'term' ? 'host' : null);
    };
    let raf = 0;
    el.addEventListener('pointermove', e => {
      if (isPhone() || reduced() || e.pointerType !== 'mouse') return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => $$('.dock-btn', el).forEach(b => {
        if (b.closest('.tray')) return;
        const r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
        const k = Math.max(0, 1 - d / 96);
        b.style.transform = k ? `translateY(${-3 * k}px) scale(${1 + 0.14 * k * k})` : '';
      }));
    });
    el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); $$('.dock-btn', el).forEach(b => { b.style.transform = ''; }); });
  },
};
function togglePalette() {
  Palette.set(Palette.get() === 'dark' ? 'light' : 'dark');
  const sw = WS.wins.find(w => w.id === 'settings'); if (sw) { sw.body.innerHTML = ''; sw.def.mount(sw); }
  Dock.render();
}
async function logout() { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.reload(); }

const Spot = {
  open() {
    if ($('.spot')) return;
    const el = h(`<div class="spot"><div class="spot-box"><div class="spot-in">${icon('search', 'lg')}<input placeholder="${esc(t('spot.ph'))}" autocomplete="off" spellcheck="false"><kbd class="t4">esc</kbd></div><div class="spot-res"></div></div></div>`);
    document.body.append(el);
    const inp = $('input', el), res = $('.spot-res', el);
    let items = [], sel = 0;
    const close = () => { el.style.transition = 'opacity 160ms'; el.style.opacity = '0'; setTimeout(() => el.remove(), 160); };
    const all = () => [
      ...Desk.tiles.filter(x => !Settings.app(x.name).hidden).map(x => ({ label: Settings.app(x.name).title || x.name, sub: x.sub, ico: tileIco(x), c: tileColor(x.name), run: () => (x.port ? window.open(appLink(x.port), '_blank', 'noopener') : Desk.menuFor(x, $('#dock'))) })),
      ...LAUNCH.map(k => ({ label: t(k === 'term' ? 'terminal' : k), sub: t('section'), ico: icon(k), run: () => WS.open(k, k === 'term' ? 'host' : null) })),
      { label: t('install'), sub: t('install.sub'), ico: icon('plus'), run: () => installDialog() },
      { label: t('settings'), sub: t('s.wall') + ', ' + t('s.look').toLowerCase(), ico: icon('settings'), run: () => WS.open('settings') },
      { label: t('w.home'), sub: 'Alt+D', ico: icon('home'), run: () => WS.showDesk() },
    ];
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      items = all().filter(x => !q || (x.label + ' ' + (x.sub || '')).toLowerCase().includes(q)).slice(0, 12);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      res.innerHTML = items.map((x, i) => `<div class="row d ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="ico-sq" style="${x.c ? '--c:' + x.c : ''}" translate="no">${x.ico}</span><div class="grow"><div class="nm" translate="no">${esc(x.label)}</div></div><span class="sub">${esc(x.sub || '')}</span></div>`).join('') || `<div class="quiet">${t('none')}</div>`;
    };
    const go = i => { const x = items[i]; if (!x) return; close(); setTimeout(x.run, 60); };
    inp.oninput = () => { sel = 0; draw(); };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      if (e.key === 'Enter') go(sel);
      if (e.key === 'Escape') close();
    };
    res.onclick = e => { const r = e.target.closest('[data-i]'); if (r) go(+r.dataset.i); };
    res.onmousemove = e => { const r = e.target.closest('[data-i]'); if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; $$('.row', res).forEach(x => x.classList.toggle('sel', +x.dataset.i === sel)); } };
    el.onmousedown = e => { if (e.target === el) close(); };
    draw(); inp.focus();
  },
};

const Seg = {
  set(seg, val) {
    $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === val));
    const on = $('button.on', seg), ind = $('.ind', seg);
    if (on && ind) { ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px'; }
  },
  make(options, val, onChange) {
    const el = h(`<div class="seg"><span class="ind"></span>${options.map(([v, label]) => `<button type="button" data-v="${v}">${esc(label)}</button>`).join('')}</div>`);
    el.onclick = e => { const b = e.target.closest('button'); if (!b) return; Seg.set(el, b.dataset.v); onChange(b.dataset.v); };
    requestAnimationFrame(() => Seg.set(el, val));
    return el;
  },
};
