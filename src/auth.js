'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { DATA_DIR, ENV_USER, ENV_PASS, COOKIE } = require('./config');
const { httpErr, wrap, parseCookies, readJson, writeJson } = require('./util');
const { readSettings, sendAsset } = require('./settings');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USER_RE = /^[A-Za-z0-9._-]{2,32}$/;
const TTL_LONG = 30 * 24 * 3600e3;
const TTL_SHORT = 12 * 3600e3;
const MAX_FAILS = 5;

const sessions = new Map();
const fails = new Map();

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(String(pw), salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
const tokenOf = req => parseCookies(req.headers.cookie)[COOKIE];

const readUsers = async () => (await readJson(USERS_FILE, {})).users || [];
const writeUsers = users => writeJson(USERS_FILE, { users }, 0o600);
const needSetup = async () => !ENV_PASS && !(await readUsers()).length;

async function makeUser(name, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { name, salt, hash: (await scrypt(password, salt)).toString('hex'), created: Date.now() };
}

function checkNewCreds(name, password) {
  if (!USER_RE.test(name || '')) throw httpErr(400, 'bad_username');
  if (String(password || '').length < 8) throw httpErr(400, 'weak_password');
}

async function verify(username, password) {
  const name = String(username || '').trim().toLowerCase();
  const users = await readUsers();
  if (users.length) {
    const u = users.find(x => x.name.toLowerCase() === name);
    const k = await scrypt(password, u ? u.salt : 'x'.repeat(32));
    return u && crypto.timingSafeEqual(k, Buffer.from(u.hash, 'hex')) ? u.name : null;
  }
  if (!ENV_PASS) return null;
  const ok = crypto.timingSafeEqual(sha(name), sha(ENV_USER.toLowerCase())) & crypto.timingSafeEqual(sha(password), sha(ENV_PASS));
  return ok ? ENV_USER : null;
}

function authed(req) {
  const t = tokenOf(req);
  const s = t && sessions.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return s;
}

function startSession(res, user, remember) {
  const t = crypto.randomBytes(32).toString('hex');
  const ttl = remember ? TTL_LONG : TTL_SHORT;
  sessions.set(t, { exp: Date.now() + ttl, user });
  res.setHeader('Set-Cookie', `${COOKIE}=${t}; HttpOnly; SameSite=Strict; Path=/${remember ? `; Max-Age=${ttl / 1000}` : ''}`);
}

function publicWall(s) {
  const w = s.wall;
  if (!w) return { kind: 'preset', id: 'aurora' };
  if (w.kind === 'image') return { kind: 'image' };
  if (w.kind === 'preset') return { kind: 'preset', id: w.id };
  return { kind: 'none' };
}

const open = express.Router();

open.post('/setup', wrap(async (req, res) => {
  if (!(await needSetup())) throw httpErr(409, 'already_setup');
  const { username = '', password = '' } = req.body || {};
  const name = String(username).trim();
  checkNewCreds(name, password);
  await writeUsers([await makeUser(name, password)]);
  startSession(res, name, true);
  res.json({ ok: true, user: name });
}));

open.post('/login', wrap(async (req, res) => {
  const ip = req.socket.remoteAddress || '';
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) return res.status(429).json({ error: 'too_many', wait: Math.ceil((f.until - Date.now()) / 1000) });
  await new Promise(r => setTimeout(r, 300));
  if (await needSetup()) return res.status(409).json({ error: 'need_setup' });
  const { username = '', password = '', remember } = req.body || {};
  const user = await verify(username, password);
  if (!user) {
    f.n++;
    if (f.n >= MAX_FAILS) f.until = Date.now() + Math.min(15 * 60, 30 * 2 ** (f.n - MAX_FAILS)) * 1000;
    fails.set(ip, f);
    return res.status(401).json({ error: 'wrong_login', left: Math.max(0, MAX_FAILS - f.n) });
  }
  fails.delete(ip);
  startSession(res, user, !!remember);
  res.json({ ok: true, user });
}));

open.post('/logout', (req, res) => {
  sessions.delete(tokenOf(req));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

open.get('/public/look', wrap(async (req, res) => {
  const s = await readSettings();
  res.json({ setup: await needSetup(), wall: publicWall(s), dim: s.dim || 0 });
}));

open.get('/public/wall', wrap(async (req, res) => {
  const w = (await readSettings()).wall || {};
  if (w.kind !== 'image' || !w.file) return res.status(404).end();
  sendAsset(res, w.file, '1h');
}));

const guard = (req, res, next) => (authed(req) ? next() : res.status(401).json({ error: 'unauthorized' }));

const account = express.Router();

account.get('/me', (req, res) => res.json({ user: authed(req).user }));

account.put('/account', wrap(async (req, res) => {
  const me = authed(req).user;
  const { current = '', username, password } = req.body || {};
  if (!(await verify(me, current))) throw httpErr(403, 'wrong_current');
  const name = String(username || me).trim();
  const pass = password || current;
  checkNewCreds(name, pass);
  await writeUsers([await makeUser(name, pass)]);
  const keep = tokenOf(req);
  for (const [t, s] of sessions) if (t !== keep) sessions.delete(t); else s.user = name;
  res.json({ ok: true, user: name });
}));

module.exports = { authed, guard, open, account };
