#!/usr/bin/env node
/* ==========================================================================
   serve.mjs — tiny zero-dependency static server, so you can preview the site
   exactly the way GitHub Pages will serve it (http, not file://).

   Usage:  npm run serve       (or: node tools/serve.mjs)
           PORT=8080 npm run serve
   ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
};

const server = http.createServer((request, response) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
        return;
    }

    let filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
        return;
    }

    fs.stat(filePath, (error, stats) => {
        if (!error && stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        fs.readFile(filePath, (readError, buffer) => {
            if (readError) {
                response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
                    .end(`Not found: ${pathname}`);
                return;
            }
            response.writeHead(200, {
                'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-store',
            });
            response.end(buffer);
        });
    });
});

server.listen(port, () => {
    console.log(`Serving ${root}`);
    console.log(`→ http://localhost:${port}/index.html`);
    console.log('Press Ctrl+C to stop.');
});
