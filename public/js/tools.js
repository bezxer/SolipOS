'use strict';
Types.edit = {
  size: [820, 600],
  title: p => basename(p), icon: 'file',
  async mount(w) {
    const save = w.tool(`<button class="btn pri">${icon('save')}<span>${t('save')}</span></button>`);
    w.body.innerHTML = `<div class="sub mono bar-row" translate="no"></div><textarea class="editor" spellcheck="false" translate="no"></textarea>`;
    $('.sub', w.body).textContent = w.arg;
    const ta = $('textarea', w.body);
    try { ta.value = (await api('/api/files/read?path=' + encodeURIComponent(w.arg))).content; }
    catch (e) { ta.disabled = true; save.disabled = true; ta.value = errText(e); return; }
    let clean = ta.value;
    const mark = () => w.title(basename(w.arg) + (ta.value !== clean ? ' •' : ''));
    const doSave = safe(async () => { await api('/api/files/write', { method: 'PUT', body: { path: w.arg, content: ta.value } }); clean = ta.value; mark(); toast(t('saved')); });
    save.onclick = doSave;
    ta.oninput = mark;
    ta.onkeydown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); doSave(); }
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('\t', ta.selectionStart, ta.selectionEnd, 'end'); mark(); }
    };
  },
};

Types.compose = {
  size: [720, 600],
  title: n => n + ' · compose', icon: 'code',
  async mount(w) {
    const apply = w.tool(`<button class="btn pri">${icon('upload')}<span>${t('apply')}</span></button>`);
    w.body.innerHTML = `<textarea class="editor" spellcheck="false" translate="no"></textarea>`;
    const ta = $('textarea', w.body);
    ta.value = (await api(`/api/apps/${encodeURIComponent(w.arg)}/compose`)).yaml;
    apply.onclick = safe(async () => {
      const r = await api(`/api/apps/${encodeURIComponent(w.arg)}/compose`, { method: 'PUT', body: { yaml: ta.value } });
      const j = await jobDialog(r.job, t('app.updating', { n: w.arg })); refreshAll();
      if (j.status === 'done') toast(t('app.updated', { n: w.arg }));
    });
    ta.onkeydown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); apply.click(); }
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
    };
  },
};

Types.logs = {
  size: [880, 520],
  title: a => t('logs') + ' · ' + a.slice(2, a[0] === 'c' ? 14 : 99), icon: 'logs',
  async mount(w) {
    const kind = w.arg[0], ref = w.arg.slice(2);
    const sel = w.tool(`<select class="in sm" style="width:96px">${[100, 300, 1000, 5000].map(n => `<option ${n === 300 ? 'selected' : ''}>${n}</option>`).join('')}</select>`);
    w.tool(`<button class="btn ghost ib" title="${t('refresh')}">${icon('refresh')}</button>`).onclick = safe(() => load());
    w.body.innerHTML = `<pre class="log" translate="no"></pre>`;
    const pre = $('pre', w.body);
    if (kind === 'c') api(`/api/containers/${ref}/inspect`).then(d => w.title(t('logs') + ' · ' + d.Name.slice(1))).catch(() => {});
    let first = true;
    const load = async () => {
      const url = kind === 'c' ? `/api/containers/${ref}/logs?tail=${sel.value}` : kind === 's' ? `/api/stacks/${encodeURIComponent(ref)}/logs?tail=${sel.value}` : `/api/apps/${encodeURIComponent(ref)}/logs?tail=${sel.value}`;
      const txt = await api(url);
      const bottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
      pre.textContent = txt || '—';
      if (bottom || first) pre.scrollTop = pre.scrollHeight; first = false;
    };
    sel.onchange = safe(() => { first = true; return load(); });
    await load(); w.poll(load, 3000);
  },
};

Types.term = {
  size: [860, 520],
  title: a => t('terminal') + ' · ' + (a === 'host' ? t('host') : a.slice(0, 12)), icon: 'term',
  async mount(w) {
    w.tool(`<button class="btn ghost ib" title="${t('reconnect')}">${icon('refresh')}</button>`).onclick = () => connect();
    w.body.innerHTML = `<div class="termbox"></div>`;
    if (w.arg !== 'host') api(`/api/containers/${w.arg}/inspect`).then(d => w.title(t('terminal') + ' · ' + d.Name.slice(1))).catch(() => {});
    const term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: cssVar('--font-mono'), theme: xtermTheme(), scrollback: 5000, allowProposedApi: false });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit); term.open($('.termbox', w.body));
    const refit = () => { if (!w.el.hidden) try { fit.fit(); } catch {} };
    const ro = new ResizeObserver(refit); ro.observe($('.termbox', w.body));
    const onPal = () => { term.options.theme = xtermTheme(); };
    document.addEventListener('palette', onPal);
    let ws = null;
    const connect = () => {
      if (ws) { ws.onclose = null; ws.close(); }
      term.reset(); refit();
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/${w.arg === 'host' ? 'terminal' : 'exec/' + w.arg}?cols=${term.cols}&rows=${term.rows}`);
      ws.binaryType = 'arraybuffer';
      ws.onmessage = e => term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data));
      ws.onclose = () => term.write(`\r\n\x1b[90m[${t('term.closed')}]\x1b[0m\r\n`);
      term.focus();
    };
    term.onData(d => ws && ws.readyState === 1 && ws.send(JSON.stringify({ t: 'i', d })));
    term.onResize(({ cols, rows }) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ t: 'r', c: cols, r: rows })));
    w.el.addEventListener('mousedown', () => setTimeout(() => term.focus()));
    w.onClose(() => { ro.disconnect(); document.removeEventListener('palette', onPal); if (ws) { ws.onclose = null; ws.close(); } term.dispose(); });
    requestAnimationFrame(connect);
  },
};

document.addEventListener('click', e => {
  const m = e.target.closest('.acts > [data-more]'); if (!m) return;
  e.stopPropagation();
  const btns = $$('.btn:not([data-more])', m.parentNode).filter(b => !b.offsetParent);
  const danger = btns.filter(b => b.classList.contains('danger')), rest = btns.filter(b => !b.classList.contains('danger'));
  menu(m, [...rest.map(b => ({ label: b.title, iconHtml: b.innerHTML, run: () => b.click() })), ...(danger.length && rest.length ? ['-'] : []), ...danger.map(b => ({ label: b.title, iconHtml: b.innerHTML, run: () => b.click() }))]);
}, true);

function refreshAll() { WS.wins.forEach(w => w.refresh && w.refresh().catch(() => {})); if (booted) Desk.apps().catch(() => {}); }
