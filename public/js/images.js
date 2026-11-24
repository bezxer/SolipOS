'use strict';
Types.images = {
  size: [760, 520],
  title: 'images', icon: 'images',
  async mount(w) {
    w.tool(`<button class="btn ghost ib" title="${t('refresh')}">${icon('refresh')}</button>`).onclick = safe(() => load());
    w.body.innerHTML = `<div class="cmd bar-row"><input class="in" placeholder="nginx:alpine" translate="no"><button class="btn pri">${t('pull')}</button></div><div class="list"></div>`;
    const load = async () => {
      const list = (await api('/api/images')).sort((a, b) => b.Created - a.Created);
      $('.list', w.body).innerHTML = list.map(i => {
        const tag = (i.RepoTags || []).find(x => x !== '<none>:<none>') || '<none>';
        return `<div class="row d" data-id="${esc(i.Id)}" data-tag="${esc(tag)}">
          <span class="ico-sq">${icon('images')}</span>
          <div class="grow"><div class="nm mono" translate="no">${esc(tag)}</div><div class="sub mono">${i.Id.replace('sha256:', '').slice(0, 12)}</div></div>
          <div class="col hide-s w-date">${fmtDate(i.Created * 1000)}</div>
          <div class="col w-num">${fmtB(i.Size)}</div>
          <div class="col hide-xs" style="width:24px">${i.Containers > 0 ? `<span class="dot ok" title="${t('inuse')}"></span>` : ''}</div>
          <div class="acts"><button class="btn ghost ib more" data-more>${icon('dots')}</button>
            ${tag !== '<none>' ? `<button class="btn ghost ib" data-a="run" title="${t('run')}">${icon('play')}</button>` : ''}
            <button class="btn ghost ib danger xtra" data-a="rm" title="${t('delete')}">${icon('trash')}</button>
          </div></div>`;
      }).join('') || `<div class="quiet">${t('none')}</div>`;
    };
    const inp = $('.cmd input', w.body), pb = $('.cmd .btn', w.body);
    const pull = safe(async () => {
      const v = inp.value.trim(); if (!v) return;
      pb.disabled = true; pb.textContent = t('pulling');
      try { await api('/api/images/pull', { method: 'POST', body: { image: v } }); toast(t('pulled', { n: v })); inp.value = ''; await load(); }
      finally { pb.disabled = false; pb.textContent = t('pull'); }
    });
    pb.onclick = pull; inp.onkeydown = e => { if (e.key === 'Enter') pull(); };
    $('.list', w.body).onclick = safe(async e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const row = b.closest('.row');
      if (b.dataset.a === 'run') return installDialog('image', { image: row.dataset.tag });
      if (!await confirmBox(t('img.rm.q', { n: row.dataset.tag }))) return;
      await api(`/api/images/${encodeURIComponent(row.dataset.id)}?force=1`, { method: 'DELETE' }); toast(t('deleted')); load();
    });
    w.refresh = load;
    await load();
  },
};
