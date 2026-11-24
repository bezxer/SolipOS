'use strict';
const FTYPES = [
  [/\.(png|jpe?g|gif|webp|avif|bmp|ico|heic)$/i, 'image', '--c-rose'],
  [/\.(mp4|mkv|mov|avi|webm|m4v|ts)$/i, 'film', '--c-orange'],
  [/\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i, 'music', '--c-cyan'],
  [/\.(zip|tar|gz|tgz|bz2|xz|7z|rar|zst|iso|img)$/i, 'archive', '--c-amber'],
  [/\.(js|mjs|ts|tsx|jsx|py|sh|bash|json|ya?ml|toml|conf|ini|env|xml|html?|css|scss|go|rs|php|rb|java|kt|c|cc|cpp|h|hpp|lua|sql|service|dockerfile)$|^(dockerfile|makefile|\.env.*)$/i, 'code', '--c-green'],
  [/\.(txt|md|log|csv|pdf|docx?|xlsx?|rtf)$/i, 'logs', '--c-blue'],
];
const ftype = (name, dir) => (dir ? ['files', '--c-blue'] : (FTYPES.find(([re]) => re.test(name)) || [0, 'file', null]).slice(1));
const isImg = n => /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(n);
const isBin = n => /\.(png|jpe?g|gif|webp|avif|bmp|ico|heic|mp4|mkv|mov|avi|webm|m4v|mp3|flac|wav|ogg|m4a|aac|opus|zip|tar|gz|tgz|bz2|xz|7z|rar|zst|iso|img|pdf|docx?|xlsx?|exe|bin|so|deb|rpm)$/i.test(n);
const dlUrl = p => '/api/files/download?path=' + encodeURIComponent(p);

async function dropFiles(dt) {
  const items = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!items.length) return [...dt.files].map(f => [f, f.name]);
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); out.push([f, prefix + f.name]); return; }
    const rd = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => rd.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, prefix + entry.name + '/');
    }
  };
  for (const e of items) await walk(e, '');
  return out;
}

function imagePreview(p) {
  const d = dialog(basename(p), `<div class="img-prev"><img src="${esc(dlUrl(p))}" alt=""></div>`, { size: 'wide', foot: `<a class="btn" href="${esc(dlUrl(p))}">${icon('download')}<span>${t('download')}</span></a>` });
  return d;
}

Types.files = {
  title: 'files', icon: 'files', size: [900, 600],
  async mount(w) {
    let cwd = store.get('cwd', '/'), view = store.get('fview', 'grid'), entries = [], sel = new Set(), anchor = null;
    const T = (ic, k, attr = '') => w.tool(`<button class="btn ghost ib" title="${t(k)}" ${attr}>${icon(ic)}</button>`);
    const bView = T(view === 'grid' ? 'list' : 'home', view === 'grid' ? 'f.list' : 'f.grid');
    const bDir = T('folderPlus', 'f.newdir'), bFile = T('filePlus', 'f.newfile'), bUl = T('upload', 'upload'), bUlDir = T('folderUp', 'f.updir');
    w.body.innerHTML = `<div class="fbar"><button class="btn ghost ib" data-up title="${t('f.up')}">${icon('up')}</button><div class="crumbs"></div><span class="grow"></span><span class="sub" data-info></span></div>
      <div class="fview" tabindex="0"></div>
      <div class="drop-ov">${icon('upload', 'lg')}<span>${t('f.drop')}</span></div>
      <div class="upbar" hidden><span data-ut></span><div class="progress"><i></i></div></div>`;
    const fv = $('.fview', w.body), info = $('[data-info]', w.body);
    const full = n => joinP(cwd, n);
    const selected = () => entries.filter(f => sel.has(f.name));

    const render = () => {
      const parts = cwd.split('/').filter(Boolean);
      $('.crumbs', w.body).innerHTML = `<button data-p="/">/</button>` + parts.map((p, i) => `<button data-p="/${parts.slice(0, i + 1).map(esc).join('/')}" translate="no">${esc(p)}</button>`).join('<span class="t4">›</span>');
      fv.className = 'fview ' + view;
      if (!entries.length) { fv.innerHTML = `<div class="quiet">${t('f.empty')}</div>`; info.textContent = ''; return; }
      fv.innerHTML = entries.map((f, i) => {
        const [ic, c] = ftype(f.name, f.dir), on = sel.has(f.name) ? 'sel' : '';
        const thumb = view === 'grid' && !f.dir && isImg(f.name) && f.size < 20e6 ? `<img src="${esc(dlUrl(full(f.name)))}" loading="lazy" alt="">` : icon(ic, 'lg');
        if (view === 'grid') return `<div class="ftile ${on}" data-i="${i}" title="${esc(f.name)}"><span class="fic ${f.dir ? 'dir' : ''}" style="${c ? `--c:var(${c})` : ''}">${thumb}</span><span class="fn" translate="no">${esc(f.name)}</span><span class="fm">${f.dir ? '' : fmtB(f.size)}</span></div>`;
        return `<div class="row d ${on}" data-i="${i}"><span class="fic sm" style="${c ? `--c:var(${c})` : ''}">${icon(ic)}</span>
          <div class="grow nm" style="font-weight:${f.dir ? 600 : 400}" translate="no">${esc(f.name)}${f.link ? ' <span class="t4">↗</span>' : ''}</div>
          <div class="col w-num">${f.dir ? '' : fmtB(f.size)}</div><div class="col hide-s w-date t3">${fmtDate(f.mtime)}</div><div class="col mono hide-xs w-mode t3">${f.mode || ''}</div></div>`;
      }).join('');
      const s = selected();
      info.textContent = s.length ? t('f.selected', { n: s.length, s: fmtB(s.reduce((a, f) => a + (f.dir ? 0 : f.size), 0)) }) : t('f.items', { n: entries.length });
    };
    const load = async () => {
      const d = await api('/api/files?path=' + encodeURIComponent(cwd));
      if (d.path !== cwd) sel.clear();
      cwd = d.path; store.set('cwd', cwd); entries = d.entries;
      sel = new Set([...sel].filter(n => entries.some(f => f.name === n)));
      render();
    };
    const go = safe(async p => { const prev = cwd; cwd = p; sel.clear(); try { await load(); fv.scrollTop = 0; } catch (e) { cwd = prev; throw e; } });
    const open = f => {
      if (f.dir) return go(full(f.name));
      if (isImg(f.name)) return imagePreview(full(f.name));
      if (isBin(f.name)) { location.href = dlUrl(full(f.name)); return; }
      WS.open('edit', full(f.name));
    };
    const upbar = $('.upbar', w.body);
    const upload = safe(async list => {
      if (!list.length) return;
      const fd = new FormData(); for (const [f, rel] of list) fd.append('files', f, rel);
      const total = list.reduce((a, [f]) => a + f.size, 0);
      upbar.hidden = false; $('[data-ut]', upbar).textContent = t('f.uploading', { n: list.length, s: fmtB(total) });
      try {
        await uploadXHR('/api/files/upload?path=' + encodeURIComponent(cwd), fd, p => { $('i', upbar).style.width = (p * 100).toFixed(1) + '%'; });
        toast(t('f.uploaded', { n: list.length }));
        sel = new Set(list.map(([, rel]) => rel.split('/')[0]));
        await load();
      } finally { upbar.hidden = true; $('i', upbar).style.width = '0'; }
    });
    const remove = safe(async () => {
      const s = selected(); if (!s.length) return;
      if (!await confirmBox(s.length === 1 ? t(s[0].dir ? 'f.rmdir.q' : 'f.rm.q', { n: s[0].name }) : t('f.rmn.q', { n: s.length }))) return;
      for (const f of s) await api('/api/files?path=' + encodeURIComponent(full(f.name)), { method: 'DELETE' });
      sel.clear(); toast(t('deleted')); load();
    });
    const rename = safe(async f => { const n = await ask(t('rename'), f.name); if (!n || n === f.name) return; await api('/api/files/rename', { method: 'POST', body: { from: full(f.name), to: joinP(cwd, n) } }); sel = new Set([n]); load(); });
    const newDir = safe(async () => { const n = await ask(t('f.newdir')); if (!n) return; await api('/api/files/mkdir', { method: 'POST', body: { path: joinP(cwd, n) } }); sel = new Set([n]); load(); });
    const newFile = safe(async () => { const n = await ask(t('f.newfile')); if (!n) return; await api('/api/files/write', { method: 'PUT', body: { path: joinP(cwd, n), content: '', create: true } }); await load(); WS.open('edit', joinP(cwd, n)); });
    const pick = dir => { const p = $('#filePick'); p.multiple = true; p.accept = ''; p.webkitdirectory = !!dir; p.onchange = () => { upload([...p.files].map(f => [f, f.webkitRelativePath || f.name])); p.value = ''; p.webkitdirectory = false; }; p.click(); };

    bView.onclick = () => { view = view === 'grid' ? 'list' : 'grid'; store.set('fview', view); bView.innerHTML = icon(view === 'grid' ? 'list' : 'home'); bView.title = t(view === 'grid' ? 'f.list' : 'f.grid'); render(); };
    bDir.onclick = newDir; bFile.onclick = newFile; bUl.onclick = () => pick(false); bUlDir.onclick = () => pick(true);
    $('[data-up]', w.body).onclick = () => go(cwd.replace(/\/[^/]+$/, '') || '/');
    $('.crumbs', w.body).onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.p); };

    const paintSel = () => {
      $$('[data-i]', fv).forEach(el => el.classList.toggle('sel', sel.has(entries[+el.dataset.i].name)));
      const s2 = selected();
      info.textContent = s2.length ? t('f.selected', { n: s2.length, s: fmtB(s2.reduce((a, f) => a + (f.dir ? 0 : f.size), 0)) }) : t('f.items', { n: entries.length });
    };
    let lastTap = { i: -1, t: 0 };
    fv.onclick = e => {
      const it = e.target.closest('[data-i]');
      if (!it) { sel.clear(); paintSel(); return; }
      const i = +it.dataset.i, f = entries[i], now = Date.now();
      if (lastTap.i === i && now - lastTap.t < 450 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { lastTap = { i: -1, t: 0 }; open(f); return; }
      lastTap = { i, t: now };
      if (e.shiftKey && anchor != null) { const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]; sel = new Set(entries.slice(a, b + 1).map(x => x.name)); }
      else if (e.ctrlKey || e.metaKey) { sel.has(f.name) ? sel.delete(f.name) : sel.add(f.name); anchor = i; }
      else { sel = new Set([f.name]); anchor = i; }
      paintSel();
    };
    fv.oncontextmenu = e => {
      e.preventDefault();
      const it = e.target.closest('[data-i]');
      if (!it) return menu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX + 200, top: e.clientY, bottom: e.clientY }) }, [
        { label: t('f.newdir'), icon: 'folderPlus', run: newDir }, { label: t('f.newfile'), icon: 'filePlus', run: newFile },
        '-', { label: t('upload'), icon: 'upload', run: () => pick(false) }, { label: t('f.updir'), icon: 'folderUp', run: () => pick(true) }]);
      const f = entries[+it.dataset.i];
      if (!sel.has(f.name)) { sel = new Set([f.name]); anchor = +it.dataset.i; paintSel(); }
      const many = sel.size > 1;
      menu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX + 200, top: e.clientY, bottom: e.clientY }) }, [
        ...(many ? [] : [{ label: t('open'), icon: f.dir ? 'files' : 'ext', run: () => open(f) }]),
        ...(many || f.dir ? [] : [{ label: t('download'), icon: 'download', run: () => { location.href = dlUrl(full(f.name)); } }]),
        ...(many ? [] : [{ label: t('rename'), icon: 'pencil', run: () => rename(f) }]),
        '-', { label: many ? t('f.rmn', { n: sel.size }) : t('delete'), icon: 'trash', run: remove }]);
    };
    fv.onkeydown = e => {
      if (e.target !== fv) return;
      const s = selected();
      if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); remove(); }
      else if (e.key === 'Backspace') { e.preventDefault(); $('[data-up]', w.body).click(); }
      else if (e.key === 'Enter' && s.length === 1) open(s[0]);
      else if (e.key === 'F2' && s.length === 1) rename(s[0]);
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { e.preventDefault(); sel = new Set(entries.map(f => f.name)); paintSel(); }
      else if (e.key === 'Escape') { sel.clear(); paintSel(); }
    };
    w.el.addEventListener('pointerdown', e => { if (!e.target.closest('input,textarea,button,.crumbs')) setTimeout(() => fv.focus({ preventScroll: true })); });

    let depth = 0;
    w.el.addEventListener('dragenter', e => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); depth++; w.el.classList.add('dropping'); });
    w.el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    w.el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; w.el.classList.remove('dropping'); } });
    w.el.addEventListener('drop', async e => { e.preventDefault(); depth = 0; w.el.classList.remove('dropping'); WS.front(w); upload(await dropFiles(e.dataTransfer)); });

    const onPaste = e => {
      if (WS.focus !== w || w.min || (e.target instanceof Element && e.target.closest('input,textarea'))) return;
      const files = [...(e.clipboardData && e.clipboardData.files || [])];
      if (!files.length) return;
      e.preventDefault();
      const n = new Date(), z = v => String(v).padStart(2, '0'), stamp = `${n.getFullYear()}${z(n.getMonth() + 1)}${z(n.getDate())}-${z(n.getHours())}${z(n.getMinutes())}${z(n.getSeconds())}`;
      upload(files.map((f, i) => [f, !f.name || f.name === 'image.png' ? `paste-${stamp}${i ? '-' + i : ''}.${(f.type.split('/')[1] || 'bin').replace('jpeg', 'jpg')}` : f.name]));
    };
    document.addEventListener('paste', onPaste);
    w.onClose(() => document.removeEventListener('paste', onPaste));

    w.refresh = load;
    await load();
  },
};
