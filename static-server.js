const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.STATIC_PORT || 8000);
const API_TARGET = process.env.LOCAL_API_TARGET || 'http://localhost:3001';
const REQUEST_BODY_LIMIT = process.env.STATIC_REQUEST_BODY_LIMIT || '1mb';
const API_PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 15000);
const KEEP_ALIVE_TIMEOUT_MS = Number(process.env.STATIC_KEEP_ALIVE_TIMEOUT_MS || 65000);
const HEADERS_TIMEOUT_MS = Number(process.env.STATIC_HEADERS_TIMEOUT_MS || 66000);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.STATIC_SHUTDOWN_TIMEOUT_MS || 10000);

let isShuttingDown = false;
let server = null;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    return res.status(503).json({ success: false, message: 'Server is restarting. Retry shortly.' });
  }
  return next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), apiTarget: API_TARGET });
});

app.get('/ready', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ ready: false, reason: 'shutting_down' });
  }
  return res.json({ ready: true, timestamp: new Date().toISOString() });
});

// Proxy API calls to local backend so checkout can run from one origin.
app.use('/api', async (req, res) => {
  const endpoint = `${API_TARGET}${req.originalUrl}`;
  const requestHeaders = { ...req.headers };
  delete requestHeaders.host;
  delete requestHeaders.connection;

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), API_PROXY_TIMEOUT_MS);
    const upstream = await fetch(endpoint, {
      method: req.method,
      headers: requestHeaders,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      redirect: 'manual',
      signal: abortController.signal
    });

    clearTimeout(timeoutId);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    const body = await upstream.arrayBuffer();
    res.send(Buffer.from(body));
  } catch (error) {
    const timeoutMessage = error && error.name === 'AbortError'
      ? `Local API proxy request timed out after ${API_PROXY_TIMEOUT_MS}ms`
      : null;

    res.status(502).json({
      success: false,
      message: `Local API proxy could not reach ${API_TARGET}. Start backend with: npm start`,
      error: timeoutMessage || (error && error.message ? error.message : 'Proxy error')
    });
  }
});

// Serve static files from current directory.
app.use('/assets/images', express.static(path.join(__dirname, 'public', 'images')));
app.use(express.static(path.join(__dirname)));

server = app.listen(PORT, () => {
  console.log(`Static file server running at http://localhost:${PORT}`);
  console.log(`API proxy active: http://localhost:${PORT}/api -> ${API_TARGET}/api`);
});

server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.headersTimeout = Math.max(HEADERS_TIMEOUT_MS, KEEP_ALIVE_TIMEOUT_MS + 1000);

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.warn(`${signal} received. Shutting down static server.`);

  const hardStopTimer = setTimeout(() => {
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  hardStopTimer.unref();

  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));