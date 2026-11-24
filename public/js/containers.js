'use strict';
const fmtAgo = ms => { if (!ms) return '—'; const s = (Date.now() - ms) / 1000; return s < 3600 ? t('ago.m', { n: Math.max(1, Math.floor(s / 60)) }) : s < 86400 ? t('ago.h', { n: Math.floor(s / 3600) }) : t('ago.d', { n: Math.floor(s / 86400) }); };
const ctPorts = c => [...new Set([...c.Ports.filter(p => p.PublicPort && p.Type === 'tcp').map(p => p.PublicPort), ...(c.HostPorts || [])])].sort((a, b) => a - b);
const ctName = c => c.Names[0].slice(1);
const ctService = c => { const l = c.Labels || {}; return l['com.docker.compose.service'] ? l['com.docker.compose.service'] + (/-\d+$/.test(ctName(c)) && !/-1$/.test(ctName(c)) ? ctName(c).match(/-\d+$/)[0] : '') : ctName(c); };
const shortImg = i => { const [repo, tag] = i.split(/:(?=[^/:]+$)/); return repo.split('/').pop() + (tag ? ':' + tag : ''); };
const health = c => (/\(healthy\)/.test(c.Status) ? 'ok' : /\(unhealthy\)/.test(c.Status) ? 'err' : /health: starting/.test(c.Status) ? 'warn' : '');

async function ctAction(c, a, btn) {
  const id = c.Id, name = ctName(c);
  if (a === 'logs') return WS.open('logs', 'c:' + id);
  if (a === 'term') return WS.open('term', id);
  if (a === 'open') return openPort(mainPort(name, ctPorts(c)));
  if (a === 'rm') {
    if (!await confirmBox(t('ct.rm.q', { n: name }))) return;
    await api(`/api/containers/${id}?force=1`, { method: 'DELETE' }); toast(t('deleted')); return refreshAll();
  }
  if (a === 'update') { const r = await api(`/api/containers/${id}/update`, { method: 'POST' }); const j = await jobDialog(r.job, t('app.updating', { n: name })); if (j.status === 'done') toast(t('upd.done', { n: name })); return refreshAll(); }
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try { await api(`/api/containers/${id}/${a}`, { method: 'POST' }); } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
  refreshAll();
}

async function ctDetails(el, c, st) {
  const on = c.State === 'running', ports = ctPorts(c), name = ctName(c), hl = health(c);
  const B = (a, ic, label, cls = '') => `<button class="btn ${cls}" data-ca="${a}">${icon(ic)}<span>${label}</span></button>`;
  el.innerHTML = `
    <div class="cd-head">
      <span class="ico-sq" style="color:${tileColor(name)};background:color-mix(in srgb,${tileColor(name)} 16%,transparent)">${esc(name[0] || '?')}</span>
      <div class="grow"><div class="cd-name" translate="no">${esc(name)}</div>
        <div class="state"><span class="dot ${stateDot(c.State)}"></span>${t('st.' + c.State) || esc(c.State)}${on ? ' · ' + fmtAgo(c.StartedAt) : ''}${hl ? ` · <span class="dot ${hl}"></span>${t('hl.' + hl)}` : ''}</div></div>
    </div>
    <div class="cd-img mono" translate="no">${esc(c.Image)}</div>
    ${c.Update && !c.Self ? `<button class="cd-upd" data-ca="update">${icon('arrowUp')}<span><b>${t('upd.avail')}</b><br>${t('upd.now')}</span></button>` : ''}
    <div class="cd-acts">
      ${on && ports.length ? B('open', 'ext', t('open'), 'pri') : ''}
      ${B('logs', 'logs', t('logs'))}${on ? B('term', 'term', t('terminal')) : ''}
      ${on ? B('restart', 'restart', t('restart')) + B('stop', 'stop', t('stop')) : B(c.State === 'paused' ? 'unpause' : 'start', 'play', t('start'))}
    </div>
    ${on ? `<div class="cd-stats"><div><span class="t3">CPU</span><b data-cpu>${st ? st.cpu.toFixed(1) + '%' : '—'}</b></div><div><span class="t3">${t('memory')}</span><b data-mem>${st ? fmtB(st.mem) : '—'}</b></div></div>` : ''}
    ${ports.length ? `<div class="cd-sec"><div class="cd-h">${t('f.ports')}${c.HostNet ? ' <span class="chip">host</span>' : ''}</div><div class="ports wrap">${ports.map(p => `<a href="${appLink(p)}" target="_blank" rel="noopener">:${p}</a>`).join('')}</div></div>` : c.HostNet ? `<div class="cd-sec"><div class="cd-h">${t('f.ports')}</div><span class="chip">host</span></div>` : ''}
    <div class="cd-more"><div class="quiet">…</div></div>
    <div class="cd-foot">${c.Self ? '' : `<button class="btn ghost" data-ca="update">${icon('arrowUp')}<span>${t('upd.pull')}</span></button>`}<span class="grow"></span><button class="btn ghost danger" data-ca="rm">${icon('trash')}<span>${t('delete')}</span></button></div>`;
  el.onclick = safe(async e => { const b = e.target.closest('[data-ca]'); if (b) await ctAction(c, b.dataset.ca, b); });
  try {
    const d = await api(`/api/containers/${c.Id}/inspect`);
    if (!el.isConnected || el.dataset.id !== c.Id) return;
    const nets = Object.entries(d.NetworkSettings.Networks || {}).map(([n, v]) => `${n}${v.IPAddress ? ' · ' + v.IPAddress : ''}`);
    const mounts = (d.Mounts || []).map(m => `<div class="kv-row"><span class="mono" translate="no">${esc(m.Destination)}</span><span class="t3 mono" translate="no">${esc(m.Type === 'volume' ? m.Name.slice(0, 24) : m.Source)}${m.RW ? '' : ' · ro'}</span></div>`).join('');
    const lbl = d.Config.Labels || {};
    $('.cd-more', el).innerHTML = `
      <div class="cd-sec"><dl class="kv">
        <dt>${t('f.restart')}</dt><dd class="mono">${esc(d.HostConfig.RestartPolicy.Name || 'no')}</dd>
        <dt>${t('net')}</dt><dd class="mono">${esc(nets.join(', ') || d.HostConfig.NetworkMode)}</dd>
        ${lbl['com.docker.compose.project'] ? `<dt>Compose</dt><dd class="mono">${esc(lbl['com.docker.compose.project'])}${lbl['com.docker.compose.service'] ? ' / ' + esc(lbl['com.docker.compose.service']) : ''}</dd>` : ''}
        <dt>${t('created')}</dt><dd>${fmtDate(Date.parse(d.Created))}</dd>
        <dt>ID</dt><dd class="mono">${d.Id.slice(0, 12)}</dd></dl></div>
      ${mounts ? `<div class="cd-sec"><div class="cd-h">${t('f.volumes')}</div>${mounts}</div>` : ''}
      ${(d.Config.Env || []).length ? `<details class="cd-sec more"><summary>${icon('chevron')}${t('f.env')} · ${d.Config.Env.length}</summary><pre class="log" translate="no"></pre></details>` : ''}`;
    const pre = $('.cd-more pre', el); if (pre) pre.textContent = d.Config.Env.join('\n');
  } catch { $('.cd-more', el).innerHTML = ''; }
}

Types.containers = {
  size: [1100, 620],
  title: 'containers', icon: 'containers',
  async mount(w) {
    const q = w.tool(`<div class="in-ico hide-xs" style="width:200px">${icon('search')}<input class="in sm" placeholder="${t('filter')}"></div>`);
    const pm = w.tool(`<button class="btn ghost ib" title="${t('more')}">${icon('dots')}</button>`);
    w.tool(`<button class="btn">${icon('plus')}<span class="hide-xs">${t('create')}</span></button>`).onclick = () => installDialog('image');
    w.body.innerHTML = `<div class="ct-top"><span data-seg></span><span class="grow"></span><span class="sub" data-total></span></div>
      <div class="ct-split"><div class="ct-list"></div><aside class="ct-pane" hidden></aside></div>`;
    let list = [], stats = {}, busy = false, filter = 'all', sel = null, lastRow = { id: null, t: 0 };
    const collapsed = new Set(store.get('ct.collapsed', []));
    const listEl = $('.ct-list', w.body), pane = $('.ct-pane', w.body), qi = $('input', q);
    const seg = Seg.make([['all', t('flt.all')], ['run', t('flt.run')], ['stop', t('flt.stop')], ['upd', t('flt.upd')]], filter, v => { filter = v; draw(); });
    $('[data-seg]', w.body).append(seg);
    const wide = () => w.body.clientWidth >= 860;

    const pass = c => (filter === 'run' ? c.State === 'running' : filter === 'stop' ? c.State !== 'running' : filter === 'upd' ? c.Update && !c.Self : true)
      && (!qi.value || (ctName(c) + ' ' + c.Image).toLowerCase().includes(qi.value.toLowerCase()));
    const row = c => {
      const s = stats[c.Id], on = c.State === 'running', ports = ctPorts(c), mp = ports.length ? mainPort(ctName(c), ports) : null, hl = health(c);
      return `<div class="ct-row ${sel === c.Id ? 'sel' : ''} ${on ? '' : 'off'}" data-id="${c.Id}" tabindex="0">
        <span class="dot ${stateDot(c.State)}" title="${esc(c.Status)}"></span>
        <div class="ct-nm"><div class="nm" translate="no">${esc(ctService(c))}${hl === 'err' ? ` <span class="dot err" title="${t('hl.err')}"></span>` : ''}${c.Update && !c.Self ? `<span class="upd-ic" title="${t('upd.avail')}">${icon('arrowUp')}</span>` : ''}</div><div class="sub" translate="no">${esc(shortImg(c.Image))}</div></div>
        <div class="ct-port">${mp ? `<a href="${appLink(mp)}" target="_blank" rel="noopener">:${mp}</a>${ports.length > 1 ? `<button class="more-ports-t" data-ports="${esc(ctName(c))}" data-list="${ports.join(',')}">+${ports.length - 1}</button>` : ''}` : c.HostNet ? '<span class="t3">host</span>' : '<span class="t4">—</span>'}</div>
        <div class="ct-cpu">${on && s ? `<span class="mini"><i style="width:${Math.min(100, s.cpu / (s.cores || 1))}%"></i></span><span>${s.cpu.toFixed(1)}%</span>` : ''}</div>
        <div class="ct-mem">${on && s ? fmtB(s.mem) : ''}</div>
        <div class="ct-up">${on ? fmtAgo(c.StartedAt) : `<span class="t3">${t('st.' + c.State) || c.State}</span>`}</div>
        <div class="ct-act">
          ${on ? `<button class="btn ghost ib" data-a="logs" title="${t('logs')}">${icon('logs')}</button><button class="btn ghost ib" data-a="term" title="${t('terminal')}">${icon('term')}</button><button class="btn ghost ib" data-a="stop" title="${t('stop')}">${icon('stop')}</button>`
            : `<button class="btn ghost ib" data-a="logs" title="${t('logs')}">${icon('logs')}</button><button class="btn ghost ib" data-a="${c.State === 'paused' ? 'unpause' : 'start'}" title="${t('start')}">${icon('play')}</button>`}
        </div></div>`;
    };
    const draw = () => {
      const rows = list.filter(pass);
      const counts = { all: list.length, run: list.filter(c => c.State === 'running').length, stop: list.filter(c => c.State !== 'running').length, upd: list.filter(c => c.Update && !c.Self).length };
      $$('button', seg).forEach(b => { b.textContent = `${t('flt.' + b.dataset.v)} ${counts[b.dataset.v]}`; });
      Seg.set(seg, filter);
      $('[data-total]', w.body).textContent = '';
      if (!rows.length) { listEl.innerHTML = `<div class="quiet">${t('none')}</div>`; return; }
      const groups = new Map();
      const size = {}; for (const c of list) { const p = (c.Labels || {})['com.docker.compose.project']; if (p) size[p] = (size[p] || 0) + 1; }
      for (const c of rows) { const p0 = (c.Labels || {})['com.docker.compose.project'] || '', p = size[p0] > 1 ? p0 : ''; (groups.get(p) || groups.set(p, []).get(p)).push(c); }
      const keys = [...groups.keys()].sort((a, b) => (!a) - (!b) || a.localeCompare(b));
      listEl.innerHTML = `<div class="ct-head"><span></span><span>${t('col.name')}</span><span>${t('f.ports')}</span><span>CPU</span><span>${t('memory')}</span><span>${t('col.up')}</span><span></span></div>` + keys.map(k => {
        const cs = groups.get(k), runN = cs.filter(c => c.State === 'running').length, upd = cs.some(c => c.Update && !c.Self), cl = collapsed.has(k);
        const head = `<div class="ct-group ${cl ? 'cl' : ''}" data-g="${esc(k)}"><button class="btn ghost ib" data-tg>${icon('chevron')}</button>
          <b translate="no">${k ? esc(k) : t('ct.loose')}</b><span class="t3">${runN}/${cs.length}</span>${upd ? `<span class="upd-ic">${icon('arrowUp')}</span>` : ''}<span class="grow"></span>
          ${k ? `<span class="g-act">${upd ? `<button class="btn ghost" data-sa="update">${icon('arrowUp')}<span>${t('upd.now')}</span></button>` : ''}<button class="btn ghost ib" data-sa="logs" title="${t('logs')}">${icon('logs')}</button><button class="btn ghost ib" data-sa="restart" title="${t('restart')}">${icon('restart')}</button></span>` : ''}</div>`;
        return (keys.length === 1 && !k ? '' : head) + (cl && (keys.length > 1 || k) ? '' : cs.map(row).join(''));
      }).join('');
    };
    const showPane = c => {
      if (!c) { pane.hidden = true; return; }
      if (wide()) { pane.hidden = false; pane.dataset.id = c.Id; ctDetails(pane, c, stats[c.Id]); }
      else { pane.hidden = true; const d = dialog(ctName(c), '<div class="ct-pane in-dlg"></div>', { size: 'narrow' }); const p = $('.ct-pane', d.el); p.dataset.id = c.Id; ctDetails(p, c, stats[c.Id]); }
    };
    const load = async () => {
      if (busy) return; busy = true;
      try {
        list = await api('/api/containers'); draw();
        stats = await api('/api/stats'); draw();
        const c = sel && list.find(x => x.Id === sel);
        if (!c) { sel = null; pane.hidden = true; } else if (!pane.hidden) { const s = stats[c.Id]; if (s && $('[data-cpu]', pane)) { $('[data-cpu]', pane).textContent = s.cpu.toFixed(1) + '%'; $('[data-mem]', pane).textContent = fmtB(s.mem); } }
      } finally { busy = false; }
    };
    w.refresh = async () => { await load(); const c = sel && list.find(x => x.Id === sel); if (c && !pane.hidden) ctDetails(pane, c, stats[c.Id]); };
    qi.oninput = draw;
    listEl.onclick = safe(async e => {
      if (e.target.closest('a,[data-ports]')) return;
      const g = e.target.closest('.ct-group');
      if (g) {
        const k = g.dataset.g, sa = e.target.closest('[data-sa]');
        if (sa) {
          if (sa.dataset.sa === 'logs') return WS.open('logs', 's:' + k);
          const r = await api(`/api/stacks/${encodeURIComponent(k)}/${sa.dataset.sa}`, { method: 'POST' });
          if (sa.dataset.sa === 'update') { const j = await jobDialog(r.job, t('app.updating', { n: k })); if (j.status === 'done') toast(t('upd.done', { n: k })); } else await quietJob(r.job, k);
          return refreshAll();
        }
        collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); store.set('ct.collapsed', [...collapsed]); return draw();
      }
      const r = e.target.closest('.ct-row'); if (!r) return;
      const c = list.find(x => x.Id === r.dataset.id); if (!c) return;
      const b = e.target.closest('button[data-a]');
      if (b) return ctAction(c, b.dataset.a, b);
      const now = Date.now();
      if (lastRow.id === c.Id && now - lastRow.t < 450) { lastRow = { id: null, t: 0 }; return WS.open('logs', 'c:' + c.Id); }
      lastRow = { id: c.Id, t: now };
      sel = sel === c.Id && !pane.hidden ? null : c.Id;
      $$('.ct-row', listEl).forEach(x => x.classList.toggle('sel', x.dataset.id === sel)); showPane(sel ? c : null);
    });
    listEl.onkeydown = e => { if (e.key === 'Enter' && e.target.classList.contains('ct-row')) e.target.click(); };
    const checkUpd = safe(async () => { toast(t('upd.checking'), 'inf'); await api('/api/updates/check', { method: 'POST' }); await load(); const n = list.filter(c => c.Update && !c.Self).length; toast(n ? t('upd.found', { n }) : t('upd.none')); refreshAll(); });
    const updAll = safe(async () => {
      const n = list.filter(c => c.Update && !c.Self).length;
      if (!await confirmBox(t('upd.all.q', { n }), { okText: t('upd.all') })) return;
      const r = await api('/api/updates/all', { method: 'POST' }); const j = await jobDialog(r.job, t('upd.all')); if (j.status === 'done') toast(t('upd.all.done')); refreshAll();
    });
    const prune = safe(async () => {
      if (!await confirmBox(t('prune.q'), { okText: t('prune') })) return;
      const r = await api('/api/prune', { method: 'POST' });
      toast(t('prune.done', { c: r.containers, i: r.images, s: fmtB(r.space) })); load();
    });
    pm.onclick = () => {
      const n = list.filter(c => c.Update && !c.Self).length;
      menu(pm, [{ label: t('upd.check'), icon: 'refresh', run: checkUpd }, ...(n ? [{ label: t('upd.all') + ` (${n})`, icon: 'arrowUp', run: updAll }] : []), '-', { label: t('prune'), icon: 'eraser', run: prune }]);
    };
    new ResizeObserver(() => { if (!wide() && !pane.hidden) pane.hidden = true; }).observe(w.body);
    await load(); w.poll(load, 5000);
  },
};
