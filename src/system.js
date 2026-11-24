'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const express = require('express');
const { FILES_ROOT, docker } = require('./config');
const { wrap } = require('./util');

function readCpu() {
  try {
    const f = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number);
    const idle = f[3] + f[4];
    return { idle, total: f.reduce((a, b) => a + b, 0) };
  } catch {
    let idle = 0, total = 0;
    for (const c of os.cpus()) for (const k in c.times) { total += c.times[k]; if (k === 'idle') idle += c.times[k]; }
    return { idle, total };
  }
}

let cpuPrev = readCpu();
let cpuUsage = 0;

setInterval(() => {
  const cur = readCpu();
  const total = cur.total - cpuPrev.total;
  cpuUsage = total > 0 ? Math.min(100, Math.max(0, (1 - (cur.idle - cpuPrev.idle) / total) * 100)) : cpuUsage;
  cpuPrev = cur;
}, 2000).unref();

function memInfo() {
  try {
    const m = Object.fromEntries(fs.readFileSync('/proc/meminfo', 'utf8').split('\n').map(l => l.match(/^(\w+):\s+(\d+)/)).filter(Boolean).map(x => [x[1], +x[2] * 1024]));
    if (m.MemTotal && m.MemAvailable != null) return { total: m.MemTotal, free: m.MemAvailable };
  } catch {}
  return { total: os.totalmem(), free: os.freemem() };
}

async function diskInfo() {
  try {
    const s = await fsp.statfs(FILES_ROOT);
    const used = (s.blocks - s.bfree) * s.bsize, free = s.bavail * s.bsize;
    return { total: used + free, used, free };
  } catch { return null; }
}

async function dockerInfo() {
  try {
    const i = await docker.info();
    return { version: i.ServerVersion, containers: i.Containers, running: i.ContainersRunning, images: i.Images };
  } catch (e) { return { error: e.message }; }
}

async function hostname() {
  if (FILES_ROOT === '/') return os.hostname();
  try { return (await fsp.readFile(path.join(FILES_ROOT, 'etc/hostname'), 'utf8')).trim() || os.hostname(); } catch { return os.hostname(); }
}

const router = express.Router();

router.get('/system', wrap(async (req, res) => {
  const cpus = os.cpus();
  res.json({
    hostname: await hostname(), cpus: cpus.length || os.availableParallelism(), cpuModel: cpus[0] && cpus[0].model, cpu: cpuUsage,
    mem: memInfo(), load: os.loadavg(), uptime: os.uptime(),
    kernel: os.release(), disk: await diskInfo(), docker: await dockerInfo(),
  });
}));

module.exports = { router };
