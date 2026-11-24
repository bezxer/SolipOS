'use strict';
async function appAct(name, a) {
  if (a === 'logs') return WS.open('logs', 'a:' + name);
  if (a === 'compose') return WS.open('compose', name);
  if (a === 'update') return pickArchive(async f => {
    const fd = new FormData(); fd.append('archive', f);
    toast(t('uploading', { n: f.name }), 'inf');
    const r = await uploadXHR(`/api/apps/${encodeURIComponent(name)}/update`, fd);
    const j = await jobDialog(r.job, t('app.updating', { n: name }));
    refreshAll(); if (j.status === 'done') toast(t('app.updated', { n: name }));
  });
  if (a === 'rm') {
    const r = await confirmBox(t('app.rm.q', { n: name }), { extra: t('app.rm.files') });
    if (!r) return;
    const { job } = await api(`/api/apps/${encodeURIComponent(name)}${r.extra ? '?files=1' : ''}`, { method: 'DELETE' });
    await quietJob(job, name); return refreshAll();
  }
  const { job } = await api(`/api/apps/${encodeURIComponent(name)}/${a}`, { method: 'POST' });
  if (a === 'pull') { const j = await jobDialog(job, t('app.updating', { n: name })); if (j.status === 'done') toast(t('upd.done', { n: name })); return refreshAll(); }
  await quietJob(job, name); refreshAll();
}

const TILE_COLORS = ['--c-blue', '--c-green', '--c-amber', '--c-cyan', '--c-orange', '--c-rose'];
const tileColor = name => { const c = Settings.app(name).color; return TILE_COLORS.includes('--c-' + c) ? `var(--c-${c})` : 'var(--text2)'; };
function tileIco(x) {
  const c = Settings.app(x.name).icon;
  if (c) return `<img src="${esc(/^https?:/.test(c) ? c : asset(c))}" alt="" loading="lazy">`;
  return esc((Settings.app(x.name).title || x.name).slice(0, 1));
}
function tween(el, to, fmt = v => Math.round(v)) {
  if (!el) return;
  const from = +el.dataset.v || 0;
  el.dataset.v = to;
  if (reduced() || Math.abs(to - from) < 0.5) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), d = 700;
  const step = now => { const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1 && el.dataset.v == to) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const RING_C = 2 * Math.PI * 27;
const ring = (key, label, sub) => `<div class="os-t wcard gauge" data-g="${key}"><div class="ring"><svg viewBox="0 0 64 64"><circle class="tr" cx="32" cy="32" r="27"/><circle class="fg" cx="32" cy="32" r="27" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg><b><span data-n>0</span>%</b></div><div class="lb"><span class="t2">${label}</span><span data-sub>${sub || ''}</span></div></div>`;
function setRing(root, key, pct, sub) {
  const g = $(`[data-g="${key}"]`, root); if (!g) return;
  $('.fg', g).style.strokeDashoffset = RING_C * (1 - Math.min(pct, 100) / 100);
  $('.ring', g).className = 'ring ' + meterCls(pct);
  tween($('[data-n]', g), pct);
  if (sub != null) $('[data-sub]', g).textContent = sub;
}

const Desk = {
  tiles: [], sig: '', first: true,
  mount() {
    $('#desk').innerHTML = `
      <section class="wbar"><div class="os-t wcard clock"><div class="tm" data-tm></div><div class="dt" data-dt></div></div><div class="wstats" data-stats></div></section>
      <section class="os-t desk-apps">
        <div class="sec"><span>${t('apps')}</span><span class="grow"></span><span class="sum" data-sum></span></div>
        <div class="dtiles" data-tiles></div>
      </section>`;
    const tiles = $('#desk [data-tiles]');
    tiles.onclick = e => {
      const b = e.target.closest('.dtile'); if (!b) return;
      if (b.dataset.add != null) return installDialog();
      const x = this.tiles[+b.dataset.i];
      if (e.target.closest('[data-tmore]')) return this.menuFor(x, e.target.closest('[data-tmore]'));
      if (x.port && !x.off) openPort(x.port); else WS.open('logs', this.logsArg(x));
    };
    $('#desk [data-sum]').onclick = safe(async e => {
      if (!e.target.closest('[data-updall]')) return;
      const n = this.tiles.filter(x => x.update && !x.self).length;
      if (!await confirmBox(t('upd.all.q', { n }), { okText: t('upd.all') })) return;
      const r = await api('/api/updates/all', { method: 'POST' });
      const j = await jobDialog(r.job, t('upd.all')); if (j.status === 'done') toast(t('upd.all.done')); refreshAll();
    });
    tiles.oncontextmenu = e => {
      const b = e.target.closest('.dtile[data-i]'); if (!b) return;
      e.preventDefault(); this.menuFor(this.tiles[+b.dataset.i], b);
    };
    this.clock(); setInterval(() => this.clock(), 1000);
    Promise.all([this.stats(), this.apps()]).catch(() => {});
    setInterval(() => { if (!document.hidden) this.stats().catch(() => {}); }, 3000);
    setInterval(() => { if (!document.hidden) this.apps().catch(() => {}); }, 6000);
  },
  ping() {
    const b = $('#dock .dock-btn[data-k="@desk"]'); if (b) { b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce'); }
    $('#desk').scrollTo({ top: 0, behavior: 'smooth' });
    $$('#desk > .os-t').forEach((p, i) => Anim.run(p, [{ transform: 'none' }, { transform: 'scale(.985)' }, { transform: 'none' }], { duration: 420, delay: i * 50, easing: EASE_SPRING }));
  },
  clock() {
    const d = new Date(), loc = LANG === 'en' ? 'en-GB' : LANG;
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const tm = $('#desk [data-tm]'); if (!tm) return;
    if (tm.dataset.t !== hh + mm) { tm.innerHTML = `${hh}<i>:</i>${mm}`; tm.dataset.t = hh + mm; }
    const dt = d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#desk [data-dt]').textContent = dt[0].toUpperCase() + dt.slice(1);
  },
  async stats() {
    const s = await api('/api/system');
    const root = $('#desk [data-stats]'); if (!root) return;
    const W = Settings.s.widgets, key = ['cpu', 'mem', 'disk', 'docker'].filter(k => W[k]).join();
    if (root.dataset.k !== key) {
      root.dataset.k = key;
      root.innerHTML = [
        W.cpu && ring('cpu', t('cpu')), W.mem && ring('mem', t('memory')),
        W.disk && `<div class="os-t wcard" data-g="disk"><div class="lb">${t('disk')}<span data-sub></span></div><div class="vl"><span data-n>0</span>%</div><div class="meter"><i></i></div></div>`,
        W.docker && `<div class="os-t wcard" data-g="docker"><div class="lb">Docker<span data-sub></span></div><div class="vl"><span data-n>0</span><span class="t4"> / <span data-t>0</span></span></div><div class="sub" data-up></div></div>`,
      ].filter(Boolean).join('');
    }
    const memU = s.mem.total - s.mem.free;
    setRing(root, 'cpu', s.cpu, `${s.cpus} ${t('cores')}`);
    setRing(root, 'mem', memU / s.mem.total * 100, t('of', { v: fmtB(s.mem.total) }));
    const dg = $('[data-g="disk"]', root);
    if (dg && s.disk) {
      const p = (s.disk.total - s.disk.free) / s.disk.total * 100;
      tween($('[data-n]', dg), p); $('.meter', dg).className = 'meter ' + meterCls(p); $('.meter i', dg).style.width = p + '%';
      $('[data-sub]', dg).textContent = t('free', { v: fmtB(s.disk.free) });
    }
    const kg = $('[data-g="docker"]', root), d = s.docker || {};
    if (kg) {
      if (d.error) { $('.vl', kg).innerHTML = `<span class="state"><span class="dot err"></span>${t('unavailable')}</span>`; }
      else { tween($('[data-n]', kg), d.running); const tt = $('[data-t]', kg); if (tt) tt.textContent = d.containers; $('[data-sub]', kg).textContent = d.images + ' ' + t('imagesN'); }
      $('[data-up]', kg).textContent = `${t('up')} ${fmtUp(s.uptime)}`;
    }
  },
  async apps() {
    const [apps, cs] = await Promise.all([api('/api/apps').catch(() => []), api('/api/containers').catch(() => [])]);
    const D = Settings.s.desk, names = new Set(apps.map(a => a.name));
    const lbl = c => c.Labels || {};
    const portsOf = list => [...new Set(list.flatMap(c => [...c.Ports.filter(p => p.PublicPort && p.Type === 'tcp').map(p => p.PublicPort), ...(c.HostPorts || [])]))].sort((a, b) => a - b);
    const dotOf = list => { const r = list.filter(c => c.State === 'running').length; return r === list.length ? 'ok' : r ? 'warn' : 'err'; };
    const useful = list => D.all || list.some(c => c.State === 'running' && (c.HostNet || c.Ports.some(p => p.PublicPort && p.Type === 'tcp')));
    const rest = cs.filter(c => !names.has(lbl(c)['com.docker.compose.project']) && !lbl(c)['solipos.app'] && !lbl(c)['minicasa.app']);
    const stacks = new Map(), loose = [];
    for (const c of rest) {
      const p = D.group && lbl(c)['com.docker.compose.project'];
      if (p) (stacks.get(p) || stacks.set(p, []).get(p)).push(c); else loose.push(c);
    }
    this.tiles = [
      ...apps.map(a => ({ kind: 'app', name: a.name, type: a.type, on: a.running > 0, ports: a.ports, update: a.update,
        dot: a.total === 0 ? '' : a.running === a.total ? 'ok' : a.running ? 'warn' : 'err' })),
      ...[...stacks].filter(([, l]) => useful(l)).map(([p, l]) => l.length === 1 && !D.group ? null : ({ kind: 'stack', name: p, ids: l.map(c => c.Id), n: l.length, on: l.some(c => c.State === 'running'),
        ports: portsOf(l), dot: dotOf(l), update: l.some(c => c.Update), host: l.some(c => c.HostNet), runId: (l.find(c => c.State === 'running') || {}).Id, self: l.some(c => c.Self) })).filter(Boolean),
      ...loose.filter(c => useful([c])).map(c => ({ kind: 'ct', id: c.Id, name: c.Names[0].slice(1), on: c.State === 'running', ports: portsOf([c]),
        dot: c.State === 'running' ? 'ok' : 'err', update: c.Update, host: c.HostNet, self: c.Self })),
    ];
    for (const x of this.tiles) {
      x.port = mainPort(x.name, x.ports);
      x.off = !x.on;
      x.sub = x.off ? t('stopped.c') : x.port ? ':' + x.port + (x.ports.length > 1 ? ` +${x.ports.length - 1}` : '') : x.host ? t('hostnet') : t('type.' + (x.type || 'compose'));
    }
    this.draw();
  },
  draw(force) {
    const box = $('#desk [data-tiles]'); if (!box) return;
    const label = x => Settings.app(x.name).title || x.name;
    const vis = this.tiles.map((x, i) => [x, i]).filter(([x]) => !Settings.app(x.name).hidden);
    const sig = JSON.stringify([vis.map(([x]) => [x.name, x.sub, x.dot, x.on, x.update]), Settings.s.apps, LANG]);
    if (sig === this.sig && !force) return;
    this.sig = sig;
    const enter = this.first ? 'enter' : '';
    const off = vis.filter(([x]) => x.off).length, warn = vis.filter(([x]) => x.dot === 'warn').length, upd = vis.filter(([x]) => x.update && !x.self).length;
    const si = (cls, txt) => `<span class="si"><span class="dot ${cls}"></span>${txt}</span>`;
    $('#desk [data-sum]').innerHTML = vis.length ? si('ok', t('sum.on', { n: vis.length - off })) + (off ? si('err', t('sum.off', { n: off })) : '') + (warn ? si('warn', t('sum.part', { n: warn })) : '')
      + (upd ? `<button class="chip upd-all" data-updall>${icon('arrowUp')}${t('sum.upd', { n: upd })}</button>` : '') : '';
    box.innerHTML = vis.map(([x, i], n) => `<button class="dtile ${enter} ${x.off ? 'off' : ''}" style="--i:${n}" data-i="${i}" title="${esc(label(x))}">
        <span class="dico" style="--c:${tileColor(x.name)}" translate="no">${tileIco(x)}<span class="dot ${x.dot}"></span>${x.update && !x.self ? `<span class="upd" title="${t('upd.avail')}">${icon('arrowUp')}</span>` : ''}${x.kind === 'stack' && x.n > 1 ? `<span class="cnt">${x.n}</span>` : ''}</span>
        <span class="nm" translate="no">${esc(label(x))}</span><span class="sub">${esc(x.sub)}</span>
        <span class="btn ghost ib more-t" data-tmore role="button" aria-label="${t('more')}">${icon('dots')}</span></button>`).join('')
      + `<button class="dtile add ${enter}" style="--i:${vis.length}" data-add><span class="dico">${icon('plus', 'lg')}</span><span class="nm">${t('install')}</span></button>`;
    this.first = false;
  },
  logsArg(x) { return x.kind === 'ct' ? 'c:' + x.id : x.kind === 'stack' ? 's:' + x.name : 'a:' + x.name; },
  menuFor(x, anchor) {
    const items = [], name = Settings.app(x.name).title || x.name;
    if (x.port) items.push({ label: `${t('open')} :${x.port}`, icon: 'ext', run: () => openPort(x.port) });
    if (x.ports.length > 1) items.push({ label: t('ports.all', { n: x.ports.length }), icon: 'plug', run: () => portsDialog(name, x.ports) });
    items.push({ label: t('logs'), icon: 'logs', run: () => WS.open('logs', this.logsArg(x)) });
    if (x.kind === 'app') {
      const go = a => safe(() => appAct(x.name, a));
      if (x.type === 'compose') items.push({ label: t('app.compose'), icon: 'code', run: go('compose') });
      items.push('-', { label: t(x.update ? 'upd.now' : 'upd.pull'), icon: 'arrowUp', run: go('pull') }, { label: t('app.update'), icon: 'upload', run: go('update') });
      items.push('-', { label: t('restart'), icon: 'restart', run: go('restart') }, { label: t(x.on ? 'stop' : 'start'), icon: x.on ? 'stop' : 'play', run: go(x.on ? 'stop' : 'start') }, '-', { label: t('delete'), icon: 'trash', run: go('rm') });
    } else {
      const base = x.kind === 'stack' ? `/api/stacks/${encodeURIComponent(x.name)}` : `/api/containers/${x.id}`;
      const job = (a, title) => safe(async () => { const r = await api(`${base}/${a}`, { method: 'POST' }); if (r.job) { const j = a === 'update' ? await jobDialog(r.job, title) : await quietJob(r.job, name); if (j.status === 'done' && a === 'update') toast(t('upd.done', { n: name })); } refreshAll(); });
      const tid = x.kind === 'stack' ? x.runId : x.id;
      if (x.on && tid) items.push({ label: t('terminal'), icon: 'term', run: () => WS.open('term', tid) });
      if (!x.self) items.push('-', { label: t(x.update ? 'upd.now' : 'upd.pull'), icon: 'arrowUp', run: job('update', t('app.updating', { n: name })) });
      items.push('-', { label: t('restart'), icon: 'restart', run: job('restart') }, { label: t(x.on ? 'stop' : 'start'), icon: x.on ? 'stop' : 'play', run: job(x.on ? 'stop' : 'start') });
    }
    items.push('-', { label: t('s.customize'), icon: 'settings', run: () => customizeTile(x) });
    menu(anchor, items);
  },
};
