import express from 'express';
import pino from 'pino';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const log = pino({ name: 'console' });
const port = Number(process.env.PORT ?? 3005);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'console' }));

app.get('/config.js', (_req, res) => {
  const gatewayUrl = process.env.GATEWAY_URL ?? 'http://localhost:3000';
  const tenantId = process.env.ENTRA_TENANT_ID ?? '';
  const clientId = process.env.ENTRA_CONSOLE_CLIENT_ID ?? '';
  const apiAppId = process.env.ENTRA_API_AUDIENCE ?? '';
  const config = {
    environment: process.env.BCS_ENVIRONMENT ?? 'dev',
    dataMode: process.env.BCS_DATA_MODE ?? 'SYNTHETIC',
    gatewayUrl,
    tenantId,
    clientId,
    scope: apiAppId ? `api://${apiAppId}/access_as_user` : '',
  };
  res.type('application/javascript').send(`window.__BCS_ONE_CONFIG__ = ${JSON.stringify(config)};`);
});

app.use(express.static(publicDir, { etag: true, maxAge: '5m' }));
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/auth/callback', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(port, () => log.info({ port }, 'BCS ONE console listening'));
