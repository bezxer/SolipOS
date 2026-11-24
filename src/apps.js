'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const tar = require('tar');
const { APPS_DIR, APP_LABEL, LEGACY_LABEL, docker } = require('./config');
const { httpErr, wrap, exists, uploadName, readJson, writeJson } = require('./util');
const { runJob, jlog, sh } = require('./jobs');
const { containerLogs, containerAct, listByLabel, buildSpec, tcpPorts } = require('./docker');
const { Updates, updateMany } = require('./updates');

const META = '.solipos.json';
const LEGACY_META = '.minicasa.json';
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const ARCHIVE_RE = /\.(zip|tar|tar\.gz|tgz)$/i;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const appName = s => String(s || '').toLowerCase().replace(ARCHIVE_RE, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 40);
const appDir = name => path.join(APPS_DIR, name);
const metaFile = name => path.join(appDir(name), META);
const writeMeta = (name, m) => writeJson(metaFile(name), m);

async function readMeta(name) {
  const m = await readJson(metaFile(name), null);
  if (!m) throw httpErr(404, 'app_not_found');
  return m;
}

function checkName(name) {
  if (!NAME_RE.test(name || '')) throw httpErr(400, 'bad_app_name');
  return name;
}

for (const d of fs.readdirSync(APPS_DIR)) {
  const legacy = path.join(APPS_DIR, d, LEGACY_META);
  if (fs.existsSync(legacy) && !fs.existsSync(metaFile(d))) fs.renameSync(legacy, metaFile(d));
}

async function extractArchive(file, name, dest) {
  await fsp.mkdir(dest, { recursive: true });
  if (/\.zip$/i.test(name)) {
    for (const e of new AdmZip(file).getEntries()) {
      const target = path.resolve(dest, e.entryName);
      if (!target.startsWith(dest + path.sep)) throw httpErr(400, 'Unsafe path in archive: ' + e.entryName);
      if (e.isDirectory) { await fsp.mkdir(target, { recursive: true }); continue; }
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, e.getData());
    }
  } else if (/\.(tar|tar\.gz|tgz)$/i.test(name)) {
    await tar.x({ file, cwd: dest, strict: true });
  } else throw httpErr(400, 'bad_archive');
}

async function detect(dir) {
  for (let depth = 0; depth < 4; depth++) {
    const names = (await fsp.readdir(dir)).filter(n => n !== '__MACOSX' && !n.startsWith('.'));
    const compose = COMPOSE_FILES.find(c => names.includes(c));
    if (compose) return { root: dir, type: 'compose', compose };
    if (names.includes('manifest.json') && (names.includes('repositories') || names.includes('oci-layout'))) return { root: dir, type: 'image' };
    if (names.includes('Dockerfile')) return { root: dir, type: 'dockerfile' };
    if (names.length === 1 && (await fsp.stat(path.join(dir, names[0]))).isDirectory()) { dir = path.join(dir, names[0]); continue; }
    break;
  }
  throw httpErr(400, 'no_app_in_archive');
}

const ownContainers = async name => [...await listByLabel(`${APP_LABEL}=${name}`), ...await listByLabel(`${LEGACY_LABEL}=${name}`)];

async function appContainers(name) {
  const all = [...await listByLabel(`com.docker.compose.project=${name}`), ...await ownContainers(name)];
  const seen = new Set();
  return all.filter(c => !seen.has(c.Id) && seen.add(c.Id));
}

async function removeSingle(j, name) {
  for (const c of await ownContainers(name)) {
    jlog(j, `remove container ${c.Names[0]}\n`);
    await docker.getContainer(c.Id).remove({ force: true });
  }
}

async function deploySingle(j, name, image, cfg) {
  await removeSingle(j, name);
  const spec = buildSpec({ ...cfg, image, name }, appDir(name));
  spec.Labels = { [APP_LABEL]: name };
  const c = await docker.createContainer(spec);
  await c.start();
  jlog(j, `container ${name} started (${image})\n`);
}

async function loadBundledImages(j, dir) {
  for (const sub of ['', 'images']) {
    const d = path.join(dir, sub);
    if (!(await exists(d))) continue;
    for (const n of await fsp.readdir(d)) if (/\.tar$/i.test(n)) await sh(j, 'docker', ['load', '-i', path.join(d, n)]);
  }
}

const compose = (j, name, file, args) => sh(j, 'docker', ['compose', '-p', name, '-f', file, ...args], { cwd: appDir(name) });
const composeUp = (j, name, file) => compose(j, name, file, ['up', '-d', '--build', '--remove-orphans']);

async function deploy(j, name, det, { cfg, uploaded, isUpdate }) {
  const prev = isUpdate ? await readMeta(name) : null;
  const meta = prev || { name, installed: Date.now(), version: 0, config: cfg || {} };
  if (prev && prev.type === 'compose' && det.type !== 'compose') await compose(j, name, prev.compose, ['down', '--remove-orphans']).catch(() => {});
  if (prev && prev.type !== 'compose' && det.type === 'compose') await removeSingle(j, name);
  meta.type = det.type;
  meta.updated = Date.now();
  meta.version = (meta.version || 0) + 1;
  if (det.compose) meta.compose = det.compose;

  if (det.type === 'compose') {
    await loadBundledImages(j, appDir(name));
    await composeUp(j, name, meta.compose);
  } else if (det.type === 'dockerfile') {
    meta.image = `solipos/${name}:latest`;
    await sh(j, 'docker', ['build', '-t', `solipos/${name}:v${meta.version}`, '-t', meta.image, '.'], { cwd: appDir(name) });
    await deploySingle(j, name, meta.image, meta.config);
  } else {
    const out = await sh(j, 'docker', ['load', '-i', uploaded]);
    const m = out.match(/Loaded image: (\S+)/) || out.match(/Loaded image ID: (\S+)/);
    if (!m) throw new Error('docker load: image name not found');
    meta.image = m[1];
    await deploySingle(j, name, meta.image, meta.config);
  }
  await writeMeta(name, meta);
}

async function installArchive(j, name, file, fileName, opts) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'solipos-x-'));
  try {
    jlog(j, `extract ${fileName}\n`);
    await extractArchive(file, fileName, tmp);
    const det = await detect(tmp);
    jlog(j, `type: ${det.type}\n`);
    await fsp.mkdir(appDir(name), { recursive: true });
    if (det.type !== 'image') await fsp.cp(det.root, appDir(name), { recursive: true, force: true });
    await deploy(j, name, det, { ...opts, uploaded: file });
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.rm(file, { force: true });
  }
}

async function cleanupFailed(name) {
  if (!(await exists(metaFile(name)))) await fsp.rm(appDir(name), { recursive: true, force: true });
}

async function checkedUpload(req, check) {
  if (!req.file) throw httpErr(400, 'archive_required');
  try {
    if (!ARCHIVE_RE.test(uploadName(req.file))) throw httpErr(400, 'bad_archive');
    return await check();
  } catch (e) {
    await fsp.rm(req.file.path, { force: true });
    throw e;
  }
}

async function composeMeta(name) {
  const meta = await readMeta(checkName(name));
  if (meta.type !== 'compose') throw httpErr(400, 'not_compose');
  return meta;
}

const archiveUpload = multer({ dest: path.join(os.tmpdir(), 'solipos-up') });

const router = express.Router();

router.get('/apps', wrap(async (req, res) => {
  const out = [];
  for (const d of await fsp.readdir(APPS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const meta = await readJson(metaFile(d.name), null);
    if (!meta) continue;
    const cs = await appContainers(d.name).catch(() => []);
    out.push({
      ...meta,
      total: cs.length,
      running: cs.filter(c => c.State === 'running').length,
      ports: [...new Set(cs.flatMap(tcpPorts))].sort((a, b) => a - b),
      update: cs.some(c => Updates.needs(c)),
    });
  }
  res.json(out.sort((a, b) => a.name.localeCompare(b.name)));
}));

router.post('/apps/install', archiveUpload.single('archive'), wrap(async (req, res) => {
  const name = await checkedUpload(req, async () => {
    const n = checkName(appName(req.body.name || uploadName(req.file)));
    if (await exists(appDir(n))) throw httpErr(409, 'app_exists');
    return n;
  });
  const b = req.body;
  const cfg = { ports: b.ports || '', env: b.env || '', volumes: b.volumes || '', restart: b.restart || 'unless-stopped' };
  const j = runJob(`install ${name}`, j => installArchive(j, name, req.file.path, uploadName(req.file), { cfg })
    .catch(async e => { await cleanupFailed(name); throw e; }));
  res.json({ job: j.id, name });
}));

router.post('/apps/compose', wrap(async (req, res) => {
  const { yaml, name: raw } = req.body || {};
  const name = checkName(appName(raw));
  if (!yaml || !yaml.trim()) throw httpErr(400, 'compose_empty');
  if (await exists(appDir(name))) throw httpErr(409, 'app_exists');
  const j = runJob(`install ${name}`, async j => {
    try {
      await fsp.mkdir(appDir(name), { recursive: true });
      await fsp.writeFile(path.join(appDir(name), 'compose.yml'), yaml);
      await deploy(j, name, { type: 'compose', compose: 'compose.yml' }, {});
    } catch (e) { await cleanupFailed(name); throw e; }
  });
  res.json({ job: j.id, name });
}));

router.post('/apps/:name/update', archiveUpload.single('archive'), wrap(async (req, res) => {
  const name = req.params.name;
  await checkedUpload(req, () => readMeta(checkName(name)));
  const j = runJob(`update ${name}`, j => installArchive(j, name, req.file.path, uploadName(req.file), { isUpdate: true }));
  res.json({ job: j.id, name });
}));

router.get('/apps/:name/compose', wrap(async (req, res) => {
  const meta = await composeMeta(req.params.name);
  res.json({ yaml: await fsp.readFile(path.join(appDir(meta.name), meta.compose), 'utf8') });
}));

router.put('/apps/:name/compose', wrap(async (req, res) => {
  const name = req.params.name;
  const meta = await composeMeta(name);
  const yaml = (req.body && req.body.yaml) || '';
  if (!yaml.trim()) throw httpErr(400, 'compose_empty');
  const j = runJob(`update ${name}`, async j => {
    await fsp.writeFile(path.join(appDir(name), meta.compose), yaml);
    await deploy(j, name, { type: 'compose', compose: meta.compose }, { isUpdate: true });
  });
  res.json({ job: j.id, name });
}));

router.post('/apps/:name/pull', wrap(async (req, res) => {
  const name = checkName(req.params.name);
  const meta = await readMeta(name);
  res.json({ job: runJob('pull ' + name, async j => {
    if (meta.type === 'compose') {
      await compose(j, name, meta.compose, ['pull', '--ignore-buildable']).catch(() => compose(j, name, meta.compose, ['pull']));
      await composeUp(j, name, meta.compose);
    } else if (meta.type === 'dockerfile') {
      await sh(j, 'docker', ['build', '--pull', '-t', meta.image, '.'], { cwd: appDir(name) });
      await deploySingle(j, name, meta.image, meta.config);
    } else {
      await updateMany(j, (await appContainers(name)).map(c => c.Id));
    }
    Updates.recheck();
  }).id });
}));

router.post('/apps/:name/:action(start|stop|restart)', wrap(async (req, res) => {
  const name = checkName(req.params.name);
  const act = req.params.action;
  const meta = await readMeta(name);
  res.json({ job: runJob(`${act} ${name}`, async j => {
    if (meta.type === 'compose') return compose(j, name, meta.compose, [act]);
    for (const c of await appContainers(name)) { jlog(j, `${act} ${c.Names[0]}\n`); await containerAct(c.Id, act); }
  }).id });
}));

router.delete('/apps/:name', wrap(async (req, res) => {
  const name = checkName(req.params.name);
  const meta = await readMeta(name);
  res.json({ job: runJob(`remove ${name}`, async j => {
    if (meta.type === 'compose') await compose(j, name, meta.compose, ['down', '--remove-orphans']);
    else await removeSingle(j, name);
    if (req.query.files === '1') {
      jlog(j, `delete ${appDir(name)}\n`);
      await fsp.rm(appDir(name), { recursive: true, force: true });
    } else await fsp.rm(metaFile(name), { force: true });
  }).id });
}));

router.get('/apps/:name/logs', wrap(async (req, res) => {
  const name = checkName(req.params.name);
  const meta = await readMeta(name);
  const tail = Math.min(+req.query.tail || 300, 10000);
  let text = '';
  if (meta.type === 'compose') {
    text = await compose(null, name, meta.compose, ['logs', '--no-color', '--tail', String(tail)]).catch(e => e.out || e.message);
  } else {
    for (const c of await appContainers(name)) text += await containerLogs(c.Id, { tail });
  }
  res.type('text/plain; charset=utf-8').send(text);
}));

module.exports = { router };
