'use strict';
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const express = require('express');
const multer = require('multer');
const { FILES_ROOT } = require('./config');
const { httpErr, wrap, exists, uploadName } = require('./util');

const MAX_EDIT = 5 * 1024 * 1024;
const ROOT_PREFIX = FILES_ROOT.endsWith(path.sep) ? FILES_ROOT : FILES_ROOT + path.sep;

function resolvePath(p) {
  const abs = path.join(FILES_ROOT, path.posix.normalize('/' + (p || '')));
  if (abs !== FILES_ROOT && !abs.startsWith(ROOT_PREFIX)) throw httpErr(400, 'bad_path');
  return abs;
}

const relName = f => path.posix.normalize('/' + uploadName(f).replace(/\\/g, '/')).slice(1);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = resolvePath(path.posix.join(req.query.path || '/', path.posix.dirname(relName(file))));
        fs.mkdir(dir, { recursive: true }, err => cb(err, dir));
      } catch (e) { cb(e); }
    },
    filename: (req, file, cb) => cb(null, path.posix.basename(relName(file))),
  }),
  preservePath: true,
});

async function entry(dir, d) {
  let st = null;
  try { st = await fsp.stat(path.join(dir, d.name)); } catch {}
  return {
    name: d.name, dir: st ? st.isDirectory() : d.isDirectory(), link: d.isSymbolicLink(),
    size: st ? st.size : null, mtime: st ? st.mtimeMs : null, mode: st ? (st.mode & 0o777).toString(8) : null,
  };
}

const router = express.Router();

router.get('/files', wrap(async (req, res) => {
  const dir = resolvePath(req.query.path);
  const entries = await Promise.all((await fsp.readdir(dir, { withFileTypes: true })).map(d => entry(dir, d)));
  entries.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  res.json({ path: '/' + path.relative(FILES_ROOT, dir).split(path.sep).join('/'), entries });
}));

router.get('/files/read', wrap(async (req, res) => {
  const f = resolvePath(req.query.path);
  const st = await fsp.stat(f);
  if (st.isDirectory()) throw httpErr(400, 'is_dir');
  if (st.size > MAX_EDIT) throw httpErr(413, 'too_big');
  const buf = await fsp.readFile(f);
  if (buf.subarray(0, 8000).includes(0)) throw httpErr(415, 'binary');
  res.json({ content: buf.toString('utf8') });
}));

router.put('/files/write', wrap(async (req, res) => {
  const { path: p, content = '', create } = req.body || {};
  await fsp.writeFile(resolvePath(p), content, { flag: create ? 'wx' : 'w' });
  res.json({ ok: true });
}));

router.post('/files/mkdir', wrap(async (req, res) => {
  await fsp.mkdir(resolvePath(req.body && req.body.path), { recursive: true });
  res.json({ ok: true });
}));

router.post('/files/rename', wrap(async (req, res) => {
  const { from, to } = req.body || {};
  const dst = resolvePath(to);
  if (await exists(dst)) throw httpErr(409, 'exists');
  await fsp.rename(resolvePath(from), dst);
  res.json({ ok: true });
}));

router.delete('/files', wrap(async (req, res) => {
  const f = resolvePath(req.query.path);
  if (f === FILES_ROOT) throw httpErr(400, 'root');
  await fsp.rm(f, { recursive: true });
  res.json({ ok: true });
}));

router.get('/files/download', wrap(async (req, res) => {
  const f = resolvePath(req.query.path);
  if ((await fsp.stat(f)).isDirectory()) throw httpErr(400, 'dir_download');
  res.download(f);
}));

router.post('/files/upload', upload.array('files'), (req, res) => res.json({ ok: true, count: (req.files || []).length }));

module.exports = { router };
