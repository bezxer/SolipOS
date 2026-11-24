'use strict';
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');

const jobs = new Map();

function jlog(j, s) {
  if (!j) return;
  j.log += s;
  if (j.log.length > 400000) j.log = j.log.slice(-300000);
}

function runJob(title, fn) {
  const j = { id: crypto.randomBytes(6).toString('hex'), title, status: 'running', log: '', started: Date.now() };
  jobs.set(j.id, j);
  setTimeout(() => jobs.delete(j.id), 3600e3).unref();
  Promise.resolve().then(() => fn(j)).then(
    () => { j.status = 'done'; jlog(j, '\nOK\n'); },
    e => { j.status = 'error'; j.error = e.message; jlog(j, '\n' + e.message + '\n'); });
  return j;
}

function sh(j, cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    jlog(j, `$ ${cmd} ${args.join(' ')}\n`);
    let out = '';
    const p = spawn(cmd, args, { ...opts, env: { ...process.env, ...(opts.env || {}) } });
    const on = d => { out += d; jlog(j, d.toString()); };
    p.stdout.on('data', on);
    p.stderr.on('data', on);
    p.on('error', e => reject(e.code === 'ENOENT' ? new Error(`${cmd}: not found`) : e));
    p.on('close', c => (c === 0 ? resolve(out) : reject(Object.assign(new Error(`${cmd} exited with code ${c}`), { out }))));
  });
}

const router = express.Router();
router.get('/jobs/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  j ? res.json(j) : res.status(404).json({ error: 'not found' });
});

module.exports = { runJob, jlog, sh, router };
