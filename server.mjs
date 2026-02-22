/**
 * Production server with gzip/brotli compression.
 * Uses @astrojs/node in middleware mode + Node built-in zlib (no extra packages).
 * Run: node server.mjs
 */
import http from 'node:http';
import zlib from 'node:zlib';
import { handler } from './dist/server/entry.mjs';

const PORT = process.env.PORT ?? 4321;
const HOST = process.env.HOST ?? '0.0.0.0';

// Content types that benefit from compression
const COMPRESSIBLE_RE = /\b(text\/|application\/(javascript|json|xml|x-www-form-urlencoded|atom\+xml|rss\+xml)|image\/svg)/i;

/**
 * Wraps the Node response with a gzip or brotli transform stream
 * when the client accepts compression and the content type is compressible.
 */
function withCompression(req, res, next) {
  const ae = req.headers['accept-encoding'] ?? '';

  let useEncoding;
  if (ae.includes('br')) {
    useEncoding = 'br';
  } else if (ae.includes('gzip')) {
    useEncoding = 'gzip';
  } else {
    return next();
  }

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  let stream = null;
  let decided = false;

  function initStream() {
    if (decided) return;
    decided = true;

    const ct = String(res.getHeader('content-type') ?? '');
    if (!COMPRESSIBLE_RE.test(ct)) {
      // Not compressible — leave methods untouched
      return;
    }

    res.removeHeader('Content-Length');
    res.setHeader('Content-Encoding', useEncoding);
    res.setHeader('Vary', 'Accept-Encoding');

    stream =
      useEncoding === 'br'
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
        : zlib.createGzip({ level: 6 });

    stream.on('data', (chunk) => origWrite(chunk));
    stream.on('end', () => origEnd());
    stream.on('error', () => origEnd());
  }

  res.write = function (chunk, encoding, cb) {
    initStream();
    if (stream) return stream.write(chunk, encoding, cb);
    return origWrite(chunk, encoding, cb);
  };

  res.end = function (chunk, encoding, cb) {
    initStream();
    if (stream) {
      if (chunk) stream.write(chunk, typeof encoding === 'string' ? encoding : undefined);
      stream.end();
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
    } else {
      origEnd(chunk, encoding, cb);
    }
    return true;
  };

  next();
}

http
  .createServer((req, res) => {
    withCompression(req, res, () => handler(req, res));
  })
  .listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
