'use strict';
function pickArchive(cb) {
  const p = $('#filePick'); p.multiple = false; p.accept = '.zip,.tar,.tgz,.gz';
  p.onchange = () => { const f = p.files[0]; p.value = ''; if (f) safe(cb)(f); };
  p.click();
}
function installDialog(mode = 'archive', pre = {}) {
  const d = dialog(t('install.title'), `
    <div data-seg></div>
    <div data-m="archive" class="field" style="gap:var(--sp-4)">
      <div class="dropzone" tabindex="0">${icon('upload', 'lg')}<span data-f>${t('drop.archive')}</span><span class="t4">.zip · .tar · .tar.gz</span></div>
      <label class="field"><span>${t('f.name')}</span><input class="in" name="aname" translate="no"></label>
      <details class="more"><summary>${icon('chevron')}${t('params')}</summary><div>
        <div class="fgrid"><label class="field"><span>${t('f.ports')}</span><input class="in" name="aports" placeholder="8080:80" translate="no"></label>
        <label class="field"><span>${t('f.restart')}</span><select class="in" name="arestart">${['unless-stopped', 'always', 'on-failure', 'no'].map(x => `<option>${x}</option>`).join('')}</select></label></div>
        <label class="field"><span>${t('f.volumes')}</span><textarea class="in code" name="avolumes" rows="2" placeholder="./data:/data" translate="no"></textarea></label>
        <label class="field"><span>${t('f.env')}</span><textarea class="in code" name="aenv" rows="2" placeholder="TZ=Europe/Kyiv" translate="no"></textarea></label>
      </div></details>
      <div class="progress" hidden><i></i></div>
    </div>
    <div data-m="compose" class="field" style="gap:var(--sp-4)">
      <label class="field"><span>${t('f.name')}</span><input class="in" name="cname" placeholder="my-app" translate="no"></label>
      <label class="field"><span>docker-compose.yml</span><textarea class="in code" name="cyaml" rows="12" translate="no" placeholder="services:\n  web:\n    image: nginx:alpine\n    ports:\n      - 8080:80\n    volumes:\n      - ./html:/usr/share/nginx/html"></textarea></label>
    </div>
    <div data-m="image" class="field" style="gap:var(--sp-3)">
      <div class="fgrid"><label class="field"><span>${t('f.image')}</span><input class="in" name="iimage" placeholder="nginx:alpine" translate="no"></label>
      <label class="field"><span>${t('f.name')}</span><input class="in" name="iname" translate="no"></label>
      <label class="field"><span>${t('f.ports')}</span><input class="in" name="iports" placeholder="8080:80" translate="no"></label>
      <label class="field"><span>${t('f.restart')}</span><select class="in" name="irestart">${['unless-stopped', 'always', 'on-failure', 'no'].map(x => `<option>${x}</option>`).join('')}</select></label></div>
      <label class="field"><span>${t('f.volumes')}</span><textarea class="in code" name="ivolumes" rows="2" placeholder="/srv/site:/usr/share/nginx/html:ro" translate="no"></textarea></label>
      <label class="field"><span>${t('f.env')}</span><textarea class="in code" name="ienv" rows="2" placeholder="TZ=Europe/Kyiv" translate="no"></textarea></label>
      <label class="field"><span>${t('f.cmd')}</span><input class="in" name="icmd" translate="no"></label>
    </div>`,
  { size: 'wide', foot: `<span class="grow" data-msg></span><button class="btn lg" data-c>${t('cancel')}</button><button class="btn pri lg" data-ok>${t('install')}</button>` });
  const v = n => $(`[name="${n}"]`, d.el).value.trim();
  let file = null, cur = mode;
  const show = m => { cur = m; $$('[data-m]', d.el).forEach(x => { x.hidden = x.dataset.m !== m; }); $('[data-ok]', d.el).textContent = t(m === 'image' ? 'create' : 'install'); };
  $('[data-seg]', d.el).append(Seg.make([['archive', t('m.archive')], ['compose', t('m.compose')], ['image', t('m.image')]], mode, show));
  show(mode);
  if (pre.image) $('[name="iimage"]', d.el).value = pre.image;
  const dz = $('.dropzone', d.el);
  const setFile = f => {
    if (!/\.(zip|tar|tgz|tar\.gz)$/i.test(f.name)) return toast(t('e.bad_archive'), 'err');
    file = f; $('[data-f]', dz).innerHTML = `<b translate="no">${esc(f.name)}</b> <span class="t3">${fmtB(f.size)}</span>`;
    const nm = $('[name="aname"]', d.el); if (!nm.value) nm.placeholder = f.name.toLowerCase().replace(/\.(zip|tar|tgz|tar\.gz)$/i, '').replace(/[^a-z0-9_-]+/g, '-');
  };
  dz.onclick = () => pickArchive(async f => setFile(f));
  dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dz.click(); } };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); };
  $('[data-c]', d.el).onclick = d.close;
  const ok = $('[data-ok]', d.el), msg = $('[data-msg]', d.el);
  ok.onclick = safe(async () => {
    ok.disabled = true;
    try {
      if (cur === 'archive') {
        if (!file) throw new Error('archive_required');
        const fd = new FormData();
        fd.append('name', v('aname')); fd.append('ports', v('aports')); fd.append('restart', v('arestart')); fd.append('volumes', v('avolumes')); fd.append('env', v('aenv'));
        fd.append('archive', file);
        const pr = $('.progress', d.el); pr.hidden = false;
        msg.textContent = t('uploading', { n: file.name });
        const r = await uploadXHR('/api/apps/install', fd, p => { $('i', pr).style.width = (p * 100) + '%'; });
        d.close(); const j = await jobDialog(r.job, t('app.installing', { n: r.name }));
        refreshAll(); if (j.status === 'done') { toast(t('app.installed', { n: r.name })); WS.open('apps'); }
      } else if (cur === 'compose') {
        const r = await api('/api/apps/compose', { method: 'POST', body: { name: v('cname'), yaml: $('[name="cyaml"]', d.el).value } });
        d.close(); const j = await jobDialog(r.job, t('app.installing', { n: r.name }));
        refreshAll(); if (j.status === 'done') { toast(t('app.installed', { n: r.name })); WS.open('apps'); }
      } else {
        msg.textContent = t('starting');
        await api('/api/containers', { method: 'POST', body: { image: v('iimage'), name: v('iname'), ports: v('iports'), restart: v('irestart'), volumes: $('[name="ivolumes"]', d.el).value, env: $('[name="ienv"]', d.el).value, cmd: v('icmd') } });
        d.close(); toast(t('started')); refreshAll(); WS.open('containers');
      }
    } finally { ok.disabled = false; msg.textContent = ''; }
  });
}
