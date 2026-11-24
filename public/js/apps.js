'use strict';
const appLink = port => `${location.protocol}//${location.hostname}:${port}`;
const openPort = p => window.open(appLink(p), '_blank', 'noopener');
function portsHtml(name, ports) {
  if (!ports || !ports.length) return '<span class="t4">—</span>';
  const main = mainPort(name, ports);
  return `<a href="${appLink(main)}" target="_blank" rel="noopener">:${main}</a>` + (ports.length > 1 ? `<button class="chip more-ports" data-ports="${esc(name)}" data-list="${ports.join(',')}">+${ports.length - 1}</button>` : '');
}
function mainPort(name, ports) { const p = +(Settings.app(name).port || 0); return p || ports[0] || null; }
function portsDialog(name, ports) {
  const d = dialog(name, `<div class="port-grid">${ports.map(p => `<a class="port" href="${appLink(p)}" target="_blank" rel="noopener"><b>:${p}</b><span>${icon('ext')}</span></a>`).join('')}</div>`, { size: 'narrow' });
  $('.port-grid', d.el).onclick = e => { if (e.target.closest('a')) setTimeout(d.close, 50); };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ports]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  portsDialog(b.dataset.ports, b.dataset.list.split(',').map(Number));
}, true);
const stateDot = s => (s === 'running' ? 'ok' : s === 'paused' || s === 'restarting' ? 'warn' : s === 'exited' || s === 'dead' ? 'err' : '');
const meterCls = p => (p > 90 ? 'err' : p > 75 ? 'warn' : '');

Types.apps = {
  size: [860, 520],
  title: 'apps', icon: 'apps',
  async mount(w) {
    w.tool(`<button class="btn pri">${icon('plus')}<span>${t('install')}</span></button>`).onclick = () => installDialog();
    const ref = w.tool(`<button class="btn ghost ib" title="${t('refresh')}">${icon('refresh')}</button>`);
    w.body.innerHTML = `<div class="list"></div>`;
    let apps = [];
    const load = async () => {
      apps = await api('/api/apps');
      const list = $('.list', w.body);
      if (!apps.length) { list.innerHTML = `<div class="quiet">${t('apps.none')}</div>`; return; }
      list.innerHTML = apps.map(a => {
        const st = a.total === 0 ? ['', t('stopped')] : a.running === a.total ? ['ok', `${a.running}/${a.total}`] : a.running ? ['warn', `${a.running}/${a.total}`] : ['err', `0/${a.total}`];
        const on = a.running > 0;
        return `<div class="row" data-n="${esc(a.name)}">
          <span class="ico-sq" translate="no" style="color:${tileColor(a.name)};background:color-mix(in srgb,${tileColor(a.name)} 18%,transparent)">${tileIco({ name: a.name })}</span>
          <div class="grow"><div class="nm" translate="no">${esc(Settings.app(a.name).title || a.name)}</div><div class="sub">${t('type.' + a.type)} · v${a.version} · ${fmtDate(a.updated)}</div></div>
          <div class="ports hide-s w-ports">${portsHtml(a.name, a.ports)}</div>
          <div class="state hide-xs w-st"><span class="dot ${st[0]}"></span>${st[1]}</div>
          <div class="acts"><button class="btn ghost ib more" data-more>${icon('dots')}</button>
            <button class="btn ghost ib" data-a="update" title="${t('app.update')}">${icon('upload')}</button>
            ${a.type === 'compose' ? `<button class="btn ghost ib xtra" data-a="compose" title="${t('app.compose')}">${icon('code')}</button>` : ''}
            <button class="btn ghost ib" data-a="logs" title="${t('logs')}">${icon('logs')}</button>
            <button class="btn ghost ib" data-a="${on ? 'stop' : 'start'}" title="${t(on ? 'stop' : 'start')}">${icon(on ? 'stop' : 'play')}</button>
            <button class="btn ghost ib xtra" data-a="restart" title="${t('restart')}">${icon('restart')}</button>
            <button class="btn ghost ib danger xtra" data-a="rm" title="${t('delete')}">${icon('trash')}</button>
          </div></div>`;
      }).join('');
    };
    ref.onclick = safe(load);
    w.refresh = load;
    $('.list', w.body).onclick = safe(async e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (!['logs', 'compose', 'update', 'rm'].includes(a)) { b.disabled = true; b.classList.add('busy'); }
      try { await appAct(b.closest('.row').dataset.n, a); } finally { b.disabled = false; b.classList.remove('busy'); }
    });
    await load(); w.poll(load, 6000);
  },
};
