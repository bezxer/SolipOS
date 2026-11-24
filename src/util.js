'use strict';
const fsp = require('fs').promises;

const httpErr = (status, msg) => Object.assign(new Error(msg), { status });

const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => {
  if (e.statusCode === 304) return res.json({ ok: true });
  const code = e.status || (e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500);
  res.status(code).json({ error: (e.json && e.json.message) || e.reason || e.message });
});

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const exists = p => fsp.access(p).then(() => true, () => false);

const uploadName = f => Buffer.from(f.originalname, 'latin1').toString('utf8');

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, data, mode) {
  await fsp.writeFile(file + '.tmp', JSON.stringify(data, null, 2), mode ? { mode } : undefined);
  await fsp.rename(file + '.tmp', file);
}

module.exports = { httpErr, wrap, parseCookies, exists, uploadName, readJson, writeJson };
