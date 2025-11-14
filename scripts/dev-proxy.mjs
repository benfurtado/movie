#!/usr/bin/env node

import http from 'http';
import { URL } from 'url';
import httpProxy from 'http-proxy';

const { createProxyServer } = httpProxy;

const PORT = Number(process.env.PROXY_PORT || 3000);
const HOST = process.env.PROXY_HOST || '0.0.0.0';

const BACKEND_TARGET = process.env.BACKEND_TARGET || 'http://127.0.0.1:3001';
const FRONTEND_TARGET = process.env.FRONTEND_TARGET || 'http://127.0.0.1:3100';

const backendProxy = createProxyServer({
  target: BACKEND_TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: true,
});

const frontendProxy = createProxyServer({
  target: FRONTEND_TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: true,
});

function isBackendRoute(pathname) {
  return (
    pathname === '/ws' ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads')
  );
}

function selectProxy(pathname) {
  return isBackendRoute(pathname) ? backendProxy : frontendProxy;
}

function createErrorHandler(label) {
  return (err, req, res) => {
    console.error(`${label} proxy error:`, err?.message || err);
    if (!res) {
      return;
    }

    const isHttpResponse = typeof res.writeHead === 'function';
    if (isHttpResponse) {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      res.end(`${label} proxy error`);
      return;
    }

    if (typeof res.end === 'function') {
      res.end();
    } else if (typeof res.destroy === 'function') {
      res.destroy();
    }
  };
}

backendProxy.on('error', createErrorHandler('Backend'));
frontendProxy.on('error', createErrorHandler('Frontend'));

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const proxy = selectProxy(parsedUrl.pathname);
  proxy.web(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const proxy = selectProxy(parsedUrl.pathname);
  proxy.ws(req, socket, head);
});

server.listen(PORT, HOST, () => {
  console.log(`Dev proxy listening on http://${HOST}:${PORT}`);
  console.log(`  Frontend target: ${FRONTEND_TARGET}`);
  console.log(`  Backend target: ${BACKEND_TARGET}`);
});

