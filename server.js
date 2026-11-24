'use strict';
const http = require('http');
const path = require('path');
const express = require('express');
const { PORT, FILES_ROOT, ROOT } = require('./src/config');
const auth = require('./src/auth');
const terminal = require('./src/terminal');

const vendor = p => express.static(path.join(ROOT, 'node_modules', p), { maxAge: '30d' });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/xterm', vendor('@xterm/xterm'));
app.use('/vendor/xterm-fit', vendor('@xterm/addon-fit'));
app.use('/vendor/font', vendor('@fontsource/geologica/files'));

app.use('/api', auth.open);
app.use('/api', auth.guard);
app.use('/api', auth.account);
for (const m of ['settings', 'system', 'containers', 'files', 'apps', 'jobs']) app.use('/api', require('./src/' + m).router);

const server = http.createServer(app);
server.requestTimeout = 0;
terminal.attach(server);
server.listen(PORT, () => console.log(`[solipos] http://0.0.0.0:${PORT}  files: ${FILES_ROOT}`));
