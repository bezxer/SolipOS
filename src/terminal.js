'use strict';
const { WebSocketServer } = require('ws');
const { USE_NSENTER, docker } = require('./config');
const { authed } = require('./auth');

let pty = null;
try { pty = require('node-pty'); } catch { console.warn('[solipos] node-pty unavailable, host terminal disabled'); }

const SHELL = 'cd ~ 2>/dev/null || cd /; command -v bash >/dev/null 2>&1 && exec bash -l || exec sh -l';
const EXEC_SHELL = 'command -v bash >/dev/null 2>&1 && exec bash || exec sh';

function onMessages(ws, onInput, onResize) {
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'i' && typeof m.d === 'string') onInput(m.d);
    else if (m.t === 'r') onResize(m.c | 0, m.r | 0);
  });
}

function hostTerminal(ws, cols, rows) {
  if (!pty) throw new Error('node-pty unavailable');
  const [file, args] = USE_NSENTER
    ? ['nsenter', ['-t', '1', '-m', '-u', '-i', '-n', '-p', '--', '/bin/sh', '-c', SHELL]]
    : ['/bin/sh', ['-c', SHELL]];
  const p = pty.spawn(file, args, { name: 'xterm-256color', cols, rows, cwd: '/', env: { ...process.env, TERM: 'xterm-256color' } });
  p.onData(d => ws.readyState === 1 && ws.send(d));
  p.onExit(() => ws.close());
  onMessages(ws, d => p.write(d), (c, r) => c > 0 && r > 0 && p.resize(c, r));
  ws.on('close', () => { try { p.kill(); } catch {} });
}

async function containerExec(ws, id, cols, rows) {
  const exec = await docker.getContainer(id).exec({
    Cmd: ['/bin/sh', '-c', EXEC_SHELL],
    AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true, Env: ['TERM=xterm-256color'],
  });
  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
  const resize = (c, r) => c > 0 && r > 0 && exec.resize({ h: r, w: c }).catch(() => {});
  resize(cols, rows);
  stream.on('data', d => ws.readyState === 1 && ws.send(d));
  stream.on('end', () => ws.close());
  onMessages(ws, d => stream.write(d), resize);
  ws.on('close', () => stream.end());
}

async function handle(ws, req) {
  const url = new URL(req.url, 'http://x');
  const cols = +url.searchParams.get('cols') || 80;
  const rows = +url.searchParams.get('rows') || 24;
  try {
    if (url.pathname === '/ws/terminal') return hostTerminal(ws, cols, rows);
    const m = url.pathname.match(/^\/ws\/exec\/([\w.-]+)$/);
    if (m) return await containerExec(ws, m[1], cols, rows);
    ws.close(1008, 'unknown endpoint');
  } catch (e) {
    ws.send(`\r\n\x1b[31m${(e.json && e.json.message) || e.message}\x1b[0m\r\n`);
    ws.close();
  }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function attach(server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const deny = code => { socket.write(`HTTP/1.1 ${code}\r\n\r\n`); socket.destroy(); };
    if (!authed(req)) return deny('401 Unauthorized');
    if (!sameOrigin(req)) return deny('403 Forbidden');
    wss.handleUpgrade(req, socket, head, ws => handle(ws, req));
  });
}

module.exports = { attach };
