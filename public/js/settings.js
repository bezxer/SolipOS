'use strict';
const WALLS = {
  aurora: ['radial-gradient(60% 70% at 12% 18%,#1f6f78 0%,transparent 60%),radial-gradient(55% 60% at 88% 12%,#2a5d9a 0%,transparent 62%),radial-gradient(70% 70% at 70% 95%,#9a6a34 0%,transparent 60%),#101317',
           'radial-gradient(60% 70% at 12% 18%,#9fd3d6 0%,transparent 60%),radial-gradient(55% 60% at 88% 12%,#a9c3ef 0%,transparent 62%),radial-gradient(70% 70% at 70% 95%,#f1c79b 0%,transparent 60%),#e9edf2'],
  dawn: ['radial-gradient(60% 70% at 15% 20%,#7a5532 0%,transparent 60%),radial-gradient(55% 60% at 85% 15%,#2f4f6b 0%,transparent 62%),radial-gradient(70% 70% at 60% 100%,#365a3c 0%,transparent 60%),#131518',
         'radial-gradient(60% 70% at 15% 20%,#f0c99d 0%,transparent 60%),radial-gradient(55% 60% at 85% 15%,#a7c9e3 0%,transparent 62%),radial-gradient(70% 70% at 60% 100%,#b9dbbb 0%,transparent 60%),#e8ecef'],
  graphite: ['#1d1d22', '#e2e2e8'],
  sand: ['linear-gradient(135deg,#2a241c 0%,#4d3f2c 100%)', 'linear-gradient(135deg,#ece4d6 0%,#cbbda4 100%)'],
  sage: ['linear-gradient(135deg,#161d18 0%,#34493a 100%)', 'linear-gradient(135deg,#d8e2d5 0%,#8ea48e 100%)'],
  mist: ['linear-gradient(160deg,#14191d 0%,#2e3d48 100%)', 'linear-gradient(160deg,#eef2f4 0%,#b9c9d3 100%)'],
  ocean: ['linear-gradient(160deg,#0d2230 0%,#25627a 100%)', 'linear-gradient(160deg,#d9e9f1 0%,#9cc4d6 100%)'],
  forest: ['linear-gradient(160deg,#0e1b14 0%,#30573f 100%)', 'linear-gradient(160deg,#dcebdf 0%,#9fc2a8 100%)'],
  ember: ['linear-gradient(160deg,#1e1410 0%,#7b4a2b 100%)', 'linear-gradient(160deg,#f4e3d3 0%,#d9a983 100%)'],
};
const WALL_ALIAS = { fog: 'graphite' };
const wallFor = id => { const w = WALLS[WALL_ALIAS[id] || id]; return w ? w[Palette.get() === 'light' ? 1 : 0] : ''; };
const SDEF = { wall: { kind: 'preset', id: 'aurora' }, dim: 25, blur: 0, glass: true, tile: 'm', labels: true, widgets: { panel: true, cpu: true, mem: true, disk: true, docker: true }, desk: { group: true, all: false }, apps: {} };
const asset = f => '/api/asset/' + encodeURIComponent(f);
const Settings = {
  s: JSON.parse(JSON.stringify(SDEF)), timer: null,
  async load() {
    const r = await api('/api/settings').catch(() => ({}));
    this.s = { ...SDEF, ...r, widgets: { ...SDEF.widgets, ...(r.widgets || {}) }, desk: { ...SDEF.desk, ...(r.desk || {}) }, apps: r.apps || {} };
    this.apply();
  },
  set(k, v) { this.s[k] = v; this.apply(); this.saveSoon(); },
  init() {
    document.addEventListener('palette', () => {
      if (booted) this.apply(); else Login.look();
      $$('.wall-sw[data-wall^="p:"]').forEach(x => { x.style.background = wallFor(x.dataset.wall.slice(2)); });
    });
  },
  saveSoon() { clearTimeout(this.timer); this.timer = setTimeout(() => api('/api/settings', { method: 'PUT', body: this.s }).catch(e => toast(errText(e), 'err')), 400); },
  wallCss() {
    const w = this.s.wall || {};
    if (w.kind === 'preset' && wallFor(w.id)) return wallFor(w.id);
    if (w.kind === 'image' && w.file) return `center / cover no-repeat url("${asset(w.file)}")`;
    return '';
  },
  apply() {
    const r = document.documentElement, s = this.s, bg = this.wallCss(), wall = $('#wall');
    wall.style.background = bg;
    wall.style.filter = s.blur ? `blur(${s.blur}px)` : '';
    wall.style.inset = s.blur ? `-${s.blur * 2}px` : '0';
    r.style.setProperty('--wall-dim', String((s.dim || 0) / 100));
    r.classList.toggle('liquid', !!s.glass);
    r.classList.toggle('no-labels', !s.labels);
    r.dataset.tile = s.tile || 'm';
    $('#desk').classList.toggle('nopanel', !s.widgets.panel);
    if (booted) { Desk.stats().catch(() => {}); clearTimeout(this.dt); this.dt = setTimeout(() => Desk.apps().catch(() => {}), 200); }
  },
  app(name) { return this.s.apps[name] || {}; },
  setApp(name, cfg) {
    const c = { ...cfg }; Object.keys(c).forEach(k => (c[k] === '' || c[k] == null || c[k] === false) && delete c[k]);
    if (Object.keys(c).length) this.s.apps[name] = c; else delete this.s.apps[name];
    this.apply(); this.saveSoon();
  },
};
async function uploadImage(kind, file) {
  const fd = new FormData(); fd.append('image', file);
  return (await uploadXHR('/api/settings/upload/' + kind, fd)).file;
}
function pickImage(cb) {
  const p = $('#filePick'); p.multiple = false; p.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
  p.onchange = () => { const f = p.files[0]; p.value = ''; if (f) safe(cb)(f); };
  p.click();
}
const sw = (on, attrs = '') => `<input type="checkbox" class="sw" ${on ? 'checked' : ''} ${attrs}>`;

Types.settings = {
  title: 'settings', icon: 'settings', size: [720, 660],
  mount(w) {
    const S = Settings.s;
    const swatch = (key, bg, title, extra = '') => `<button class="wall-sw ${extra}" data-wall="${key}" title="${esc(title)}" style="background:${bg}"></button>`;
    w.body.innerHTML = `
      <div class="set-sec">
        <div class="sec">${t('s.wall')}</div>
        <div class="walls">
          <button class="wall-sw none" data-wall="none" title="${t('s.none')}">${icon('x')}</button>
          ${Object.keys(WALLS).map(k => swatch('p:' + k, wallFor(k), k)).join('')}
          ${S.wall.kind === 'image' ? swatch('img', `center / cover url('${asset(S.wall.file)}')`, t('s.myimg')) : ''}
          <button class="wall-sw add" data-wall="upload" title="${t('upload')}">${icon('image', 'md')}</button>
        </div>
        <div class="fgrid">
          <label class="field"><span>${t('s.dim')} <b data-v="dim">${S.dim}%</b></span><input type="range" class="rng" min="0" max="80" step="5" value="${S.dim}" data-r="dim"></label>
          <label class="field"><span>${t('s.blur')} <b data-v="blur">${S.blur}px</b></span><input type="range" class="rng" min="0" max="24" step="2" value="${S.blur}" data-r="blur"></label>
        </div>
      </div>
      <div class="set-sec">
        <div class="sec">${t('s.look')}</div>
        <div class="set-row"><span>${t('s.theme')}</span><span data-seg="theme"></span></div>
        <div class="set-row"><span>${t('s.glass')}</span>${sw(S.glass, 'data-k="glass"')}</div>
        <div class="set-row"><span>${t('s.tile')}</span><span data-seg="tile"></span></div>
        <div class="set-row"><span>${t('s.labels')}</span>${sw(S.labels, 'data-k="labels"')}</div>
        <div class="set-row"><span>${t('language')}</span><span data-seg="lang"></span></div>
      </div>
      <div class="set-sec">
        <div class="sec">${t('s.account')}</div>
        <div class="set-row"><span>${t('login.user')} <b class="t2" translate="no" data-me>${esc(WS.user || '')}</b></span><button class="btn" data-acc>${icon('pencil')}<span>${t('s.change')}</span></button></div>
      </div>
      <div class="set-sec">
        <div class="sec">${t('w.home')}</div>
        <div class="set-row"><span>${t('s.panel')}</span>${sw(S.widgets.panel, 'data-wd="panel"')}</div>
        <div class="set-row"><span>${t('s.group')}</span>${sw(S.desk.group, 'data-dk="group"')}</div>
        <div class="set-row"><span>${t('s.allct')}</span>${sw(S.desk.all, 'data-dk="all"')}</div>
        ${['cpu', 'mem', 'disk', 'docker'].map(k => `<div class="set-row sub-row"><span>${k === 'docker' ? 'Docker' : t(k === 'mem' ? 'memory' : k)}</span>${sw(S.widgets[k], `data-wd="${k}"`)}</div>`).join('')}
        <div data-hidden></div>
      </div>`;
    const b = w.body;
    $('[data-seg="theme"]', b).append(Seg.make([['dark', t('s.dark')], ['light', t('s.light')], ['auto', t('s.auto')]], Palette.mode(), v => Palette.set(v)));
    $('[data-seg="tile"]', b).append(Seg.make([['s', 'S'], ['m', 'M'], ['l', 'L']], S.tile, v => Settings.set('tile', v)));
    $('[data-seg="lang"]', b).append(Seg.make([['uk', 'UA'], ['ru', 'RU'], ['en', 'EN']], LANG, v => { store.set('lang', v); location.reload(); }));
    const mark = () => { const c = Settings.s.wall.kind === 'preset' ? 'p:' + (WALL_ALIAS[Settings.s.wall.id] || Settings.s.wall.id) : Settings.s.wall.kind === 'image' ? 'img' : 'none'; $$('.wall-sw', b).forEach(x => x.classList.toggle('on', x.dataset.wall === c)); };
    mark();
    $('.walls', b).onclick = e => {
      const x = e.target.closest('.wall-sw'); if (!x) return;
      const k = x.dataset.wall;
      if (k === 'upload') return pickImage(async f => {
        toast(t('uploading', { n: f.name }), 'inf');
        const file = await uploadImage('wall', f);
        Settings.set('wall', { kind: 'image', file });
        w.body.innerHTML = ''; w.def.mount(w);
      });
      if (k === 'none') Settings.set('wall', { kind: 'none', file: Settings.s.wall.file });
      else if (k === 'img') Settings.set('wall', { kind: 'image', file: Settings.s.wall.file });
      else Settings.set('wall', { kind: 'preset', id: k.slice(2), file: Settings.s.wall.file });
      mark();
    };
    $$('[data-r]', b).forEach(r => { r.oninput = () => { const k = r.dataset.r; $(`[data-v="${k}"]`, b).textContent = r.value + (k === 'dim' ? '%' : 'px'); Settings.set(k, +r.value); }; });
    $$('[data-k]', b).forEach(c => { c.onchange = () => Settings.set(c.dataset.k, c.checked); });
    $$('[data-dk]', b).forEach(c => { c.onchange = () => { Settings.s.desk[c.dataset.dk] = c.checked; Settings.set('desk', Settings.s.desk); }; });
    $$('[data-wd]', b).forEach(c => { c.onchange = () => { Settings.s.widgets[c.dataset.wd] = c.checked; Settings.set('widgets', Settings.s.widgets); }; });
    const drawHidden = () => {
      const hid = Object.entries(Settings.s.apps).filter(([, c]) => c.hidden).map(([n]) => n);
      $('[data-hidden]', b).innerHTML = hid.length ? `<div class="sec" style="margin-top:var(--sp-4)">${t('s.hidden')}</div>` + hid.map(n => `<div class="set-row"><span translate="no">${esc(Settings.app(n).title || n)}</span><button class="btn" data-show="${esc(n)}">${t('s.show')}</button></div>`).join('') : '';
    };
    drawHidden();
    $('[data-hidden]', b).onclick = e => { const x = e.target.closest('[data-show]'); if (!x) return; Settings.setApp(x.dataset.show, { ...Settings.app(x.dataset.show), hidden: false }); drawHidden(); };
    $('[data-acc]', b).onclick = () => accountDialog(() => { $('[data-me]', b).textContent = WS.user; });
    w.refresh = async () => drawHidden();
  },
};

function accountDialog(done) {
  const d = dialog(t('s.account'), `
    <label class="field"><span>${t('login.user')}</span><input class="in" name="u" autocomplete="username" maxlength="32" translate="no"></label>
    <div class="fgrid"><label class="field"><span>${t('acc.new')}</span><input class="in" name="p1" type="password" autocomplete="new-password" placeholder="${esc(t('acc.keep'))}"></label>
    <label class="field"><span>${t('setup.repeat')}</span><input class="in" name="p2" type="password" autocomplete="new-password"></label></div>
    <label class="field"><span>${t('acc.current')}</span><input class="in" name="cur" type="password" autocomplete="current-password"></label>
    <div class="lk-err" data-e></div>`, { size: 'narrow', foot: `<button class="btn lg" data-cancel>${t('cancel')}</button><button class="btn pri lg" data-ok>${t('save')}</button>` });
  const v = n => $(`[name="${n}"]`, d.el).value, e = $('[data-e]', d.el);
  $('[name="u"]', d.el).value = WS.user || '';
  $('[data-cancel]', d.el).onclick = d.close;
  $('[data-ok]', d.el).onclick = async () => {
    e.textContent = '';
    if (!/^[A-Za-z0-9._-]{2,32}$/.test(v('u').trim())) return (e.textContent = t('e.bad_username'));
    if (v('p1') && v('p1').length < 8) return (e.textContent = t('e.weak_password'));
    if (v('p1') !== v('p2')) return (e.textContent = t('e.pw_mismatch'));
    if (!v('cur')) return (e.textContent = t('acc.need.cur'));
    try {
      const r = await api('/api/account', { method: 'PUT', body: { current: v('cur'), username: v('u').trim(), password: v('p1') || undefined } });
      WS.user = r.user; store.set('user', r.user); Dock.render(); d.close(); toast(t('acc.saved')); done && done();
    } catch (err) { e.textContent = errText(err); }
  };
  setTimeout(() => $('[name="cur"]', d.el).focus(), 50);
}

function customizeTile(x) {
  const c = { ...Settings.app(x.name) };
  const d = dialog(t('s.customize'), `
    <div class="cust">
      <div class="dico big" data-prev></div>
      <div class="field grow" style="gap:var(--sp-3)">
        <label class="field"><span>${t('f.name')}</span><input class="in" name="title" placeholder="${esc(x.name)}" translate="no"></label>
        <label class="field"><span>${t('s.port')}</span><input class="in" name="port" type="number" min="1" max="65535" list="portlist" placeholder="${x.ports[0] || '8080'}" value="${esc(Settings.app(x.name).port || '')}"><datalist id="portlist">${x.ports.map(p => `<option value="${p}">`).join('')}</datalist></label>
        <div class="field"><span>${t('s.icon')}</span><div class="bar-row" style="margin:0">
          <button class="btn" data-up>${icon('upload')}<span>${t('upload')}</span></button>
          <input class="in" name="url" placeholder="https://…/icon.png" translate="no" style="flex:1;min-width:160px">
          <button class="btn ghost ib" data-clear title="${t('s.reset')}">${icon('x')}</button></div></div>
        <div class="field"><span>${t('s.color')}</span><div class="swatches">${['', 'blue', 'green', 'amber', 'cyan', 'orange', 'rose'].map(k => `<button class="sw-c ${(c.color || '') === k ? 'on' : ''}" data-c="${k}" style="--c:${k ? `var(--c-${k})` : 'var(--text2)'}" aria-label="${k || t('s.neutral')}"></button>`).join('')}</div></div>
        <div class="set-row"><span>${t('s.hide')}</span>${sw(c.hidden, 'name="hidden"')}</div>
      </div>
    </div>`, { foot: `<button class="btn lg" data-cancel>${t('cancel')}</button><button class="btn pri lg" data-ok>${t('save')}</button>` });
  const prev = () => {
    $('[data-prev]', d.el).style.setProperty('--c', c.color ? `var(--c-${c.color})` : 'var(--text2)');
    const src = c.icon ? (/^https?:/.test(c.icon) ? c.icon : asset(c.icon)) : '';
    $('[data-prev]', d.el).innerHTML = src ? `<img src="${esc(src)}" alt="">` : esc((($('[name="title"]', d.el).value || x.name)[0] || '?'));
  };
  $('[name="title"]', d.el).value = c.title || '';
  $('[name="url"]', d.el).value = c.icon && /^https?:/.test(c.icon) ? c.icon : '';
  $('[name="title"]', d.el).oninput = prev;
  $('[name="url"]', d.el).oninput = e => { c.icon = e.target.value.trim(); prev(); };
  $('[data-up]', d.el).onclick = () => pickImage(async f => { c.icon = await uploadImage('icon', f); $('[name="url"]', d.el).value = ''; prev(); });
  $('[data-clear]', d.el).onclick = () => { c.icon = ''; $('[name="url"]', d.el).value = ''; prev(); };
  $('.swatches', d.el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; c.color = b.dataset.c; $$('.sw-c', d.el).forEach(x => x.classList.toggle('on', x === b)); prev(); };
  $('[data-cancel]', d.el).onclick = d.close;
  $('[data-ok]', d.el).onclick = () => {
    const url = c.icon;
    if (url && /^[a-z]+:/i.test(url) && !/^https?:\/\//i.test(url)) return toast(t('e.bad_image'), 'err');
    const ps = $('[name="port"]', d.el), pv = +ps.value;
    if (ps.value && !(pv >= 1 && pv <= 65535)) return toast(t('e.bad_port'), 'err');
    Settings.setApp(x.name, { title: $('[name="title"]', d.el).value.trim(), icon: url, hidden: $('[name="hidden"]', d.el).checked, color: c.color || '', port: pv && pv !== x.ports[0] ? pv : '' });
    Desk.apps().catch(() => {});
    d.close();
  };
  prev();
}
