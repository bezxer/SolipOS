'use strict';
const os = require('os');
const path = require('path');
const { docker } = require('./config');
const { httpErr } = require('./util');

const withTag = img => {
  const last = img.split('/').pop();
  return last.includes(':') || img.includes('@') ? img : img + ':latest';
};
const imageRef = img => (img && !img.startsWith('sha256:') ? withTag(img) : null);
const isSelf = id => !!os.hostname() && id.startsWith(os.hostname());
const tcpPorts = c => c.Ports.filter(p => p.PublicPort && p.Type === 'tcp').map(p => p.PublicPort);

function pullImage(img) {
  return new Promise((resolve, reject) => docker.pull(img, (err, stream) => {
    if (err) return reject(err);
    docker.modem.followProgress(stream, (e, out) => {
      if (e) return reject(e);
      const bad = (out || []).find(o => o.error);
      bad ? reject(new Error(bad.error)) : resolve(out);
    });
  }));
}

function demux(buf) {
  const out = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4);
    out.push(buf.subarray(i + 8, i + 8 + len));
    i += 8 + len;
  }
  return Buffer.concat(out).toString('utf8');
}

async function containerLogs(id, opts = {}) {
  const c = docker.getContainer(id);
  const info = await c.inspect();
  let buf = await c.logs({ stdout: true, stderr: true, ...opts });
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  return info.Config.Tty ? buf.toString('utf8') : demux(buf);
}

const containerAct = (id, act) => docker.getContainer(id)[act]().catch(e => { if (e.statusCode !== 304) throw e; });

const listByLabel = (...labels) => docker.listContainers({ all: true, filters: { label: labels } });

function calcStats(s) {
  const cpu = s.cpu_stats || {}, pre = s.precpu_stats || {};
  const cpuDelta = (cpu.cpu_usage || {}).total_usage - ((pre.cpu_usage || {}).total_usage || 0);
  const sysDelta = (cpu.system_cpu_usage || 0) - (pre.system_cpu_usage || 0);
  const cores = cpu.online_cpus || ((cpu.cpu_usage || {}).percpu_usage || []).length || 1;
  const mem = s.memory_stats || {}, st = mem.stats || {};
  const usage = mem.usage || 0;
  const inactive = st.total_inactive_file != null ? st.total_inactive_file : st.inactive_file || 0;
  return {
    cpu: sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cores * 100 : 0,
    cores,
    mem: inactive < usage ? usage - inactive : usage,
  };
}

const splitArgs = s => (s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map(a => a.replace(/^(["'])(.*)\1$/, '$2'));
const lines = s => String(s).split('\n').map(x => x.trim()).filter(Boolean);

function buildSpec({ image, name, ports = '', env = '', volumes = '', restart = 'unless-stopped', cmd = '' }, baseDir) {
  const ExposedPorts = {}, PortBindings = {};
  for (const p of String(ports).split(/[,\n]/).map(s => s.trim()).filter(Boolean)) {
    const m = p.match(/^(?:(\d+):)?(\d+)(?:\/(tcp|udp))?$/);
    if (!m) throw httpErr(400, 'Bad port: ' + p);
    const key = `${m[2]}/${m[3] || 'tcp'}`;
    ExposedPorts[key] = {};
    if (m[1]) (PortBindings[key] = PortBindings[key] || []).push({ HostPort: m[1] });
  }
  const Binds = lines(volumes).map(v => (baseDir && v.startsWith('./') ? path.join(baseDir, v.slice(2)) : v));
  return {
    Image: image, name: name ? String(name).trim() : undefined, Env: lines(env), ExposedPorts,
    Cmd: String(cmd).trim() ? splitArgs(cmd) : undefined,
    HostConfig: { PortBindings, Binds, RestartPolicy: { Name: restart || 'unless-stopped' } },
  };
}

module.exports = { withTag, imageRef, isSelf, tcpPorts, pullImage, containerLogs, containerAct, listByLabel, calcStats, buildSpec };
