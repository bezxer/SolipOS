'use strict';
const { docker } = require('./config');
const { httpErr } = require('./util');
const { jlog } = require('./jobs');
const { imageRef, isSelf, pullImage } = require('./docker');

const CHECK_EVERY = 6 * 3600e3;
const PARALLEL = 4;
const IMAGE_DEFAULTS = ['Cmd', 'Entrypoint', 'WorkingDir', 'User', 'Volumes', 'Healthcheck', 'StopSignal'];

const Updates = {
  state: {},
  checking: false,
  last: 0,

  needs(c) {
    const s = this.state[imageRef(c.Image)];
    return !!s && !s.error && !s.local && (s.update || (s.id && c.ImageID && s.id !== c.ImageID));
  },

  async checkRef(ref) {
    const img = await docker.getImage(ref).inspect().catch(() => null);
    if (!img) return { error: 'no_local', checked: Date.now() };
    const local = (img.RepoDigests || []).map(d => d.split('@')[1]);
    if (!local.length) return { id: img.Id, local: true, checked: Date.now() };
    const dist = await docker.getImage(ref).distribution();
    const remote = dist && dist.Descriptor && dist.Descriptor.digest;
    return { id: img.Id, remote, update: !!remote && !local.includes(remote), checked: Date.now() };
  },

  async checkAll() {
    if (this.checking) return;
    this.checking = true;
    try {
      const refs = [...new Set((await docker.listContainers({ all: true })).map(c => imageRef(c.Image)).filter(Boolean))];
      let i = 0;
      await Promise.all(Array.from({ length: PARALLEL }, async () => {
        while (i < refs.length) {
          const r = refs[i++];
          try { this.state[r] = await this.checkRef(r); } catch (e) { this.state[r] = { error: e.message, checked: Date.now() }; }
        }
      }));
      this.last = Date.now();
    } finally { this.checking = false; }
  },

  recheck() { this.checkAll().catch(() => {}); },
};

setTimeout(() => Updates.recheck(), 20000).unref();
setInterval(() => Updates.recheck(), CHECK_EVERY).unref();

const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

function stripImageDefaults(cfg, ic, id) {
  if (cfg.Env && ic.Env) cfg.Env = cfg.Env.filter(e => !ic.Env.includes(e));
  for (const k of IMAGE_DEFAULTS) if (same(cfg[k], ic[k])) delete cfg[k];
  if (cfg.Labels && ic.Labels) for (const k in ic.Labels) if (cfg.Labels[k] === ic.Labels[k]) delete cfg.Labels[k];
  if (cfg.Hostname === id.slice(0, 12)) delete cfg.Hostname;
  return cfg;
}

function keepAnonVolumes(old, host) {
  const taken = new Set([...(host.Binds || []).map(b => b.split(':')[1]), ...(host.Mounts || []).map(m => m.Target)]);
  for (const m of old.Mounts || []) {
    if (m.Type === 'volume' && !taken.has(m.Destination)) (host.Binds = host.Binds || []).push(`${m.Name}:${m.Destination}${m.RW ? '' : ':ro'}`);
  }
  return host;
}

async function recreate(j, id) {
  const c = docker.getContainer(id);
  const old = await c.inspect();
  const name = old.Name.slice(1);
  if (isSelf(old.Id)) throw httpErr(400, 'self_update');
  const ref = imageRef(old.Config.Image);
  if (!ref) throw httpErr(400, 'no_tag');

  const oldImg = await docker.getImage(old.Image).inspect().catch(() => ({ Config: {} }));
  jlog(j, `${name}: pull ${ref}\n`);
  await pullImage(ref);
  const neu = await docker.getImage(ref).inspect();
  if (neu.Id === old.Image) { jlog(j, `${name}: already up to date\n`); return false; }

  const cfg = stripImageDefaults({ ...old.Config, Image: ref }, oldImg.Config || {}, old.Id);
  const host = keepAnonVolumes(old, { ...old.HostConfig });
  const nets = old.NetworkSettings.Networks || {};
  const mode = host.NetworkMode || 'default';
  const shortId = old.Id.slice(0, 12);
  const endpoint = n => ({
    Aliases: (nets[n].Aliases || []).filter(a => a !== shortId && a !== old.Config.Hostname),
    IPAMConfig: nets[n].IPAMConfig || undefined,
    Links: nets[n].Links || undefined,
  });
  const shared = mode === 'host' || mode === 'none' || mode.startsWith('container:');
  const primary = !shared && nets[mode] ? mode : null;
  const spec = { name, ...cfg, HostConfig: host, NetworkingConfig: primary ? { EndpointsConfig: { [primary]: endpoint(primary) } } : undefined };
  const extraNets = shared ? [] : Object.keys(nets).filter(n => n !== primary && !(n === 'bridge' && !primary && mode === 'default'));
  const running = old.State.Running;

  jlog(j, `${name}: ${old.Image.slice(7, 19)} -> ${neu.Id.slice(7, 19)}\n`);
  await c.stop().catch(e => { if (e.statusCode !== 304) throw e; });
  await c.rename({ name: `${name}-old-${Date.now().toString(36)}` });

  let nc;
  try {
    nc = await docker.createContainer(spec);
    for (const n of extraNets) await docker.getNetwork(n).connect({ Container: nc.id, EndpointConfig: endpoint(n) });
    if (running) await nc.start();
  } catch (e) {
    jlog(j, `${name}: error, rolling back\n`);
    if (nc) await nc.remove({ force: true }).catch(() => {});
    await c.rename({ name }).catch(() => {});
    if (running) await c.start().catch(() => {});
    throw e;
  }
  await c.remove({ force: true }).catch(() => {});
  jlog(j, `${name}: updated\n`);
  return true;
}

async function updateMany(j, ids) {
  let n = 0;
  for (const id of ids) {
    try { if (await recreate(j, id)) n++; } catch (e) { jlog(j, `! ${e.message}\n`); }
  }
  Updates.recheck();
  jlog(j, `\n${n} updated\n`);
}

module.exports = { Updates, updateMany };
