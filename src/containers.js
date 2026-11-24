'use strict';
const express = require('express');
const { docker } = require('./config');
const { httpErr, wrap } = require('./util');
const { runJob, jlog } = require('./jobs');
const { withTag, isSelf, pullImage, containerLogs, containerAct, listByLabel, calcStats, buildSpec } = require('./docker');
const { Updates, updateMany } = require('./updates');

const ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause', 'kill'];
const PROJECT = 'com.docker.compose.project';
const tailOf = req => Math.min(+req.query.tail || 300, 10000);
const stackContainers = p => listByLabel(`${PROJECT}=${p}`);

const inspCache = new Map();
async function inspInfo(c) {
  const key = c.Created + c.State;
  const hit = inspCache.get(c.Id);
  if (hit && hit.key === key) return hit;
  const v = { key, ports: [], started: 0 };
  try {
    const i = await docker.getContainer(c.Id).inspect();
    v.ports = Object.keys(i.Config.ExposedPorts || {}).filter(k => k.endsWith('/tcp')).map(k => +k.split('/')[0]).sort((a, b) => a - b);
    v.started = i.State.Running ? Date.parse(i.State.StartedAt) || 0 : 0;
  } catch {}
  inspCache.set(c.Id, v);
  return v;
}

const router = express.Router();

router.get('/containers', wrap(async (req, res) => {
  const list = await docker.listContainers({ all: true });
  await Promise.all(list.map(async c => {
    const info = await inspInfo(c);
    c.StartedAt = info.started;
    if ((c.HostConfig || {}).NetworkMode === 'host') { c.HostNet = true; c.HostPorts = info.ports; }
    if (Updates.needs(c)) c.Update = true;
    if (isSelf(c.Id)) c.Self = true;
  }));
  res.json(list);
}));

router.post('/containers', wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.image) throw httpErr(400, 'image_required');
  const img = withTag(body.image.trim());
  try { await docker.getImage(img).inspect(); } catch { await pullImage(img); }
  const c = await docker.createContainer(buildSpec({ ...body, image: img }));
  await c.start();
  res.json({ id: c.id });
}));

router.get('/stats', wrap(async (req, res) => {
  const out = {};
  await Promise.all((await docker.listContainers()).map(async c => {
    try { out[c.Id] = calcStats(await docker.getContainer(c.Id).stats({ stream: false })); } catch {}
  }));
  res.json(out);
}));

router.get('/updates', (req, res) => res.json({ checking: Updates.checking, last: Updates.last }));

router.post('/updates/check', wrap(async (req, res) => {
  await Updates.checkAll();
  res.json({ last: Updates.last });
}));

router.post('/updates/all', wrap(async (req, res) => {
  const ids = (await docker.listContainers({ all: true })).filter(c => Updates.needs(c) && !isSelf(c.Id)).map(c => c.Id);
  res.json({ job: runJob('update all', j => updateMany(j, ids)).id, count: ids.length });
}));

router.post('/containers/:id/update', (req, res) => {
  res.json({ job: runJob('update', j => updateMany(j, [req.params.id])).id });
});

router.post('/containers/:id/:action', wrap(async (req, res) => {
  if (!ACTIONS.includes(req.params.action)) throw httpErr(400, 'bad_action');
  await docker.getContainer(req.params.id)[req.params.action]();
  res.json({ ok: true });
}));

router.delete('/containers/:id', wrap(async (req, res) => {
  await docker.getContainer(req.params.id).remove({ force: req.query.force === '1', v: req.query.v === '1' });
  res.json({ ok: true });
}));

router.get('/containers/:id/inspect', wrap(async (req, res) => res.json(await docker.getContainer(req.params.id).inspect())));

router.get('/containers/:id/logs', wrap(async (req, res) => {
  res.type('text/plain; charset=utf-8').send(await containerLogs(req.params.id, { tail: tailOf(req), timestamps: req.query.ts === '1' }));
}));

router.post('/stacks/:p/update', wrap(async (req, res) => {
  const ids = (await stackContainers(req.params.p)).filter(c => !isSelf(c.Id)).map(c => c.Id);
  res.json({ job: runJob('update ' + req.params.p, j => updateMany(j, ids)).id });
}));

router.post('/stacks/:p/:action(start|stop|restart)', wrap(async (req, res) => {
  const act = req.params.action;
  const cs = await stackContainers(req.params.p);
  res.json({ job: runJob(`${act} ${req.params.p}`, async j => {
    for (const c of cs) { jlog(j, `${act} ${c.Names[0]}\n`); await containerAct(c.Id, act); }
  }).id });
}));

router.get('/stacks/:p/logs', wrap(async (req, res) => {
  let text = '';
  for (const c of await stackContainers(req.params.p)) {
    text += `── ${c.Names[0].slice(1)} ──\n${await containerLogs(c.Id, { tail: tailOf(req) })}\n`;
  }
  res.type('text/plain; charset=utf-8').send(text);
}));

router.get('/images', wrap(async (req, res) => res.json(await docker.listImages())));

router.post('/images/pull', wrap(async (req, res) => {
  if (!req.body || !req.body.image) throw httpErr(400, 'image_required');
  await pullImage(withTag(req.body.image.trim()));
  res.json({ ok: true });
}));

router.delete('/images/:id', wrap(async (req, res) => {
  await docker.getImage(req.params.id).remove({ force: req.query.force === '1' });
  res.json({ ok: true });
}));

router.post('/prune', wrap(async (req, res) => {
  const c = await docker.pruneContainers();
  const i = await docker.pruneImages();
  res.json({
    containers: (c.ContainersDeleted || []).length,
    images: (i.ImagesDeleted || []).length,
    space: (c.SpaceReclaimed || 0) + (i.SpaceReclaimed || 0),
  });
}));

module.exports = { router };
