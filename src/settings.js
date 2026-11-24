'use strict';
const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { DATA_DIR, ASSET_DIR } = require('./config');
const { httpErr, wrap, readJson, writeJson } = require('./util');

const FILE = path.join(DATA_DIR, 'settings.json');
const ASSET_RE = /(wall|icon)-[a-z0-9]+-[a-f0-9]{6}\.[a-z]+/g;
const IMG_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const SAFE_HEADERS = { 'Content-Security-Policy': "default-src 'none'" };

const readSettings = () => readJson(FILE, {});
const assetsIn = s => new Set(JSON.stringify(s).match(ASSET_RE) || []);

function sendAsset(res, file, maxAge) {
  res.sendFile(path.join(ASSET_DIR, path.basename(file)), { maxAge, headers: SAFE_HEADERS }, e => e && !res.headersSent && res.status(404).end());
}

const imgUpload = multer({
  storage: multer.diskStorage({
    destination: ASSET_DIR,
    filename: (req, file, cb) => cb(null, `${req.params.kind}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}${IMG_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(IMG_EXT[file.mimetype] ? null : httpErr(415, 'bad_image'), !!IMG_EXT[file.mimetype]),
});

const router = express.Router();

router.get('/settings', wrap(async (req, res) => res.json(await readSettings())));

router.put('/settings', wrap(async (req, res) => {
  const s = req.body;
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw httpErr(400, 'bad_settings');
  if (JSON.stringify(s).length > 200000) throw httpErr(413, 'too_big');
  const keep = assetsIn(s);
  for (const f of assetsIn(await readSettings())) if (!keep.has(f)) await fsp.rm(path.join(ASSET_DIR, f), { force: true });
  await writeJson(FILE, s);
  res.json(s);
}));

router.post('/settings/upload/:kind(wall|icon)', (req, res) => imgUpload.single('image')(req, res, err => {
  const big = err && err.code === 'LIMIT_FILE_SIZE';
  if (err) return res.status(err.status || (big ? 413 : 400)).json({ error: big ? 'too_big' : err.message });
  if (!req.file) return res.status(400).json({ error: 'bad_image' });
  res.json({ file: req.file.filename });
}));

router.get('/asset/:file', (req, res) => {
  const f = path.basename(req.params.file);
  if (!new RegExp(`^${ASSET_RE.source}$`).test(f)) return res.status(404).end();
  sendAsset(res, f, '365d');
});

module.exports = { readSettings, sendAsset, router };
