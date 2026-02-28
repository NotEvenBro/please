/**
 * MediaPortal Backend Proxy Server
 *
 * Serves the built frontend (dist) AND proxies Jellyfin API requests to avoid CORS.
 *
 * Run:
 *   npm run build
 *   npm start
 *
 * Environment variables:
 *   PORT             - Server port (default: 3000)
 *   ENABLE_PASSWORD  - Set to "true" to enable password gate
 *   PASSWORD         - The password when gate is enabled
 */

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(distDir, 'index.html');
const publicConfigPath = path.join(publicDir, 'config.json');
const distConfigPath = path.join(distDir, 'config.json');

// --- Load config ---
let config = {};
function loadConfig() {
  // Prefer public/config.json (editable without rebuild). Fall back to dist/config.json if present.
  const preferred = fs.existsSync(publicConfigPath) ? publicConfigPath : distConfigPath;

  try {
    const raw = fs.readFileSync(preferred, 'utf-8');
    config = JSON.parse(raw);
    console.log(`[Config] Loaded — Jellyfin: ${config.jellyfinBaseUrl || '(not set)'}`);
  } catch (e) {
    console.error('[Config] Could not load config.json. Expected at:');
    console.error('  -', publicConfigPath);
    console.error('  -', distConfigPath);
  }
}
loadConfig();

// Watch for config changes (prefer public/config.json)
try {
  const watchPath = fs.existsSync(publicConfigPath) ? publicConfigPath : distConfigPath;
  fs.watchFile(watchPath, { interval: 2000 }, () => {
    console.log('[Config] Change detected, reloading...');
    loadConfig();
  });
} catch (_) {}

// --- Optional password gate ---
const sessions = new Set();

if (process.env.ENABLE_PASSWORD === 'true' && process.env.PASSWORD) {
  app.use(express.json());

  app.post('/api/auth', (req, res) => {
    if (req.body.password === process.env.PASSWORD) {
      const token = crypto.randomBytes(32).toString('hex');
      sessions.add(token);
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Wrong password' });
    }
  });

  app.use('/api/jellyfin', (req, res, next) => {
    const token = req.headers['x-auth-token'];
    if (!token || !sessions.has(token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  console.log('[Auth] Password gate ENABLED');
}

// --- Jellyfin JSON/Image proxy helper (GET only) ---
function proxyJellyfin(jellyfinPath, res, pipeBody = false) {
  if (!config.jellyfinBaseUrl || !config.jellyfinApiKey || !config.jellyfinUserId) {
    return res.status(500).json({
      error: 'Jellyfin not configured',
      details: 'Missing jellyfinBaseUrl, jellyfinApiKey, or jellyfinUserId in config.json',
    });
  }

  const url = new URL(jellyfinPath, config.jellyfinBaseUrl);
  const mod = url.protocol === 'https:' ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      'X-Emby-Token': config.jellyfinApiKey,
      'Accept': '*/*',
    },
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    if (pipeBody) {
      res.status(proxyRes.statusCode || 200);
      res.set('Content-Type', proxyRes.headers['content-type'] || 'application/octet-stream');
      res.set('Cache-Control', proxyRes.headers['cache-control'] || 'public, max-age=86400');
      proxyRes.pipe(res);
      return;
    }

    let body = '';
    proxyRes.on('data', (chunk) => (body += chunk));
    proxyRes.on('end', () => {
      if (jellyfinPath.includes('PlaybackInfo') || jellyfinPath.includes('UserData')) {
        console.log('[Proxy]', 'GET', jellyfinPath, '->', proxyRes.statusCode);
      }
      res.status(proxyRes.statusCode || 200);
      res.set('Content-Type', proxyRes.headers['content-type'] || 'application/json');
      res.send(body);
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error]', err.message);
    res.status(502).json({ error: 'Jellyfin unreachable', details: err.message });
  });

  proxyReq.end();
}


// Proxy helper for non-GET Jellyfin requests (e.g., setting user rating)
function proxyJellyfinRequest(jellyfinPath, req, res, method = 'POST', body = null, extraHeaders = {}) {
  if (!config.jellyfinBaseUrl || !config.jellyfinApiKey || !config.jellyfinUserId) {
    return res.status(500).json({
      error: 'Jellyfin not configured',
      details: 'Missing jellyfinBaseUrl, jellyfinApiKey, or jellyfinUserId in config.json',
    });
  }

  const url = new URL(jellyfinPath, config.jellyfinBaseUrl);
  const mod = url.protocol === 'https:' ? https : http;

  const headers = {
    'X-Emby-Token': config.jellyfinApiKey,
    'Accept': '*/*',
    ...extraHeaders,
  };

  if (body != null && !headers['Content-Length']) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method,
    headers,
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk) => (data += chunk));
    proxyRes.on('end', () => {
      if (jellyfinPath.includes('PlaybackInfo') || jellyfinPath.includes('UserData')) {
        console.log('[Proxy]', method, jellyfinPath, '->', proxyRes.statusCode);
      }
      res.status(proxyRes.statusCode || 200);
      res.set('Content-Type', proxyRes.headers['content-type'] || 'application/json');
      res.send(data);
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error]', err.message);
    res.status(502).json({ error: 'Jellyfin unreachable', details: err.message });
  });

  if (body != null) proxyReq.write(body);
  proxyReq.end();
}


// --- Jellyfin stream proxy helper (GET + Range support) ---
function proxyJellyfinStream(jellyfinPath, req, res) {
  if (!config.jellyfinBaseUrl || !config.jellyfinApiKey || !config.jellyfinUserId) {
    return res.status(500).json({
      error: 'Jellyfin not configured',
      details: 'Missing jellyfinBaseUrl, jellyfinApiKey, or jellyfinUserId in config.json',
    });
  }

  const url = new URL(jellyfinPath, config.jellyfinBaseUrl);
  const mod = url.protocol === 'https:' ? https : http;

  const headers = {
    'X-Emby-Token': config.jellyfinApiKey,
    'Accept': '*/*',
  };

  // ✅ Forward Range so seeking works
  if (req.headers.range) headers['Range'] = req.headers.range;

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'GET',
    headers,
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);

    // ✅ Forward important headers for HTML5 video
    const passthroughHeaders = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'etag',
      'last-modified',
      'cache-control',
    ];
    for (const h of passthroughHeaders) {
      if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
    }

    // Avoid caching partial responses weirdly
    if (!proxyRes.headers['cache-control']) {
      res.setHeader('Cache-Control', 'no-store');
    }

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Stream Proxy Error]', err.message);
    res.status(502).json({ error: 'Stream unreachable', details: err.message });
  });

  proxyReq.end();
}

// --- Serve runtime config from public/config.json (editable without rebuild) ---
app.get('/config.json', (req, res) => {
  if (fs.existsSync(publicConfigPath)) return res.sendFile(publicConfigPath);
  if (fs.existsSync(distConfigPath)) return res.sendFile(distConfigPath);
  return res.status(404).json({ error: 'config.json not found' });
});

// --- API Routes ---
app.get('/api/jellyfin/system-info', (req, res) => {
  proxyJellyfin('/System/Info/Public', res);
});

app.get('/api/jellyfin/views', (req, res) => {
  proxyJellyfin(`/Users/${encodeURIComponent(config.jellyfinUserId)}/Views?Fields=PrimaryImageAspectRatio`, res);
});

app.get('/api/jellyfin/recent/movies', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  proxyJellyfin(
    `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items/Latest?IncludeItemTypes=Movie&Limit=${limit}&Fields=Overview,PrimaryImageAspectRatio,ProductionYear,UserData&ImageTypeLimit=1&EnableImageTypes=Primary`,
    res
  );
});

app.get('/api/jellyfin/recent/episodes', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  proxyJellyfin(
    `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items/Latest?IncludeItemTypes=Episode&Limit=${limit}&Fields=Overview,PrimaryImageAspectRatio,ProductionYear,UserData&ImageTypeLimit=1&EnableImageTypes=Primary`,
    res
  );
});

app.get('/api/jellyfin/movies', (req, res) => {
  const startIndex = parseInt(req.query.startIndex, 10) || 0;
  const limit = parseInt(req.query.limit, 10) || 30;
  const search = (req.query.search || '').toString().trim();

  let p =
    `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items` +
    `?IncludeItemTypes=Movie&Recursive=true` +
    `&SortBy=SortName&SortOrder=Ascending` +
    `&Fields=PrimaryImageAspectRatio,ProductionYear,UserData` +
    `&ImageTypeLimit=1&EnableImageTypes=Primary` +
    `&StartIndex=${startIndex}&Limit=${limit}` +
    `&EnableTotalRecordCount=false`;

  if (search) p += `&SearchTerm=${encodeURIComponent(search)}`;
  proxyJellyfin(p, res);
});

app.get('/api/jellyfin/series', (req, res) => {
  const startIndex = parseInt(req.query.startIndex, 10) || 0;
  const limit = parseInt(req.query.limit, 10) || 30;
  const search = (req.query.search || '').toString().trim();

  let p =
    `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items` +
    `?IncludeItemTypes=Series&Recursive=true` +
    `&SortBy=SortName&SortOrder=Ascending` +
    `&Fields=PrimaryImageAspectRatio,ProductionYear,UserData` +
    `&ImageTypeLimit=1&EnableImageTypes=Primary` +
    `&StartIndex=${startIndex}&Limit=${limit}` +
    `&EnableTotalRecordCount=false`;

  if (search) p += `&SearchTerm=${encodeURIComponent(search)}`;
  proxyJellyfin(p, res);
});


app.post('/api/jellyfin/rate/:id', (req, res) => {
  const itemId = encodeURIComponent(req.params.id);
  const rating = Math.round(Number(req.body?.rating));
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    return res.status(400).json({ error: 'Invalid rating', details: 'rating must be a number between 0 and 10' });
  }
  const body = JSON.stringify({ Rating: rating });
  proxyJellyfinRequest(
    `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items/${itemId}/UserData`,
    req,
    res,
    'POST',
    body,
    { 'Content-Type': 'application/json' }
  );
});

app.get('/api/jellyfin/music/recent', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 30;
  const parentId = req.query.parentId ? encodeURIComponent(req.query.parentId) : null;

  const base = `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items/Latest?IncludeItemTypes=Audio&Limit=${limit}&Fields=Overview,PrimaryImageAspectRatio,ProductionYear,Album,Artists,AlbumArtist,RunTimeTicks&ImageTypeLimit=1&EnableImageTypes=Primary`;
  const p = parentId ? `${base}&ParentId=${parentId}` : base;
  proxyJellyfin(p, res);
});

app.get('/api/jellyfin/music/albums', (req, res) => {
  const startIndex = parseInt(req.query.startIndex, 10) || 0;
  const limit = parseInt(req.query.limit, 10) || 48;
  const search = req.query.search ? String(req.query.search) : '';
  const parentId = req.query.parentId ? encodeURIComponent(req.query.parentId) : null;

  let p = `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&StartIndex=${startIndex}&Limit=${limit}&SortBy=SortName&SortOrder=Ascending&Fields=Overview,PrimaryImageAspectRatio,ProductionYear,Album,Artists,AlbumArtist&ImageTypeLimit=1&EnableImageTypes=Primary`;
  if (search) p += `&SearchTerm=${encodeURIComponent(search)}`;
  if (parentId) p += `&ParentId=${parentId}`;
  proxyJellyfin(p, res);
});

app.get('/api/jellyfin/music/tracks', (req, res) => {
  const startIndex = parseInt(req.query.startIndex, 10) || 0;
  const limit = parseInt(req.query.limit, 10) || 48;
  const search = req.query.search ? String(req.query.search) : '';
  const parentId = req.query.parentId ? encodeURIComponent(req.query.parentId) : null;

  let p = `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items?IncludeItemTypes=Audio&Recursive=true&StartIndex=${startIndex}&Limit=${limit}&SortBy=DateCreated&SortOrder=Descending&Fields=Overview,PrimaryImageAspectRatio,ProductionYear,Album,Artists,AlbumArtist,RunTimeTicks&ImageTypeLimit=1&EnableImageTypes=Primary`;
  if (search) p += `&SearchTerm=${encodeURIComponent(search)}`;
  if (parentId) p += `&ParentId=${parentId}`;
  proxyJellyfin(p, res);
});

app.get('/api/jellyfin/music/album/:id/tracks', (req, res) => {
  const albumId = encodeURIComponent(req.params.id);
  const startIndex = parseInt(req.query.startIndex, 10) || 0;
  const limit = parseInt(req.query.limit, 10) || 200;

  const p = `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items?ParentId=${albumId}&IncludeItemTypes=Audio&Recursive=true&StartIndex=${startIndex}&Limit=${limit}&SortBy=IndexNumber&SortOrder=Ascending&Fields=Overview,PrimaryImageAspectRatio,Album,Artists,AlbumArtist,RunTimeTicks&ImageTypeLimit=1&EnableImageTypes=Primary`;
  proxyJellyfin(p, res);
});

app.get('/api/jellyfin/image/:itemId/primary', (req, res) => {
  const maxWidth = parseInt(req.query.maxWidth, 10) || 360;
  proxyJellyfin(
    `/Items/${encodeURIComponent(req.params.itemId)}/Images/Primary?maxWidth=${maxWidth}&quality=90`,
    res,
    true
  );
});

// Item metadata (✅ user-scoped, reliable)
app.get('/api/jellyfin/item/:id', (req, res) => {
  const id = encodeURIComponent(req.params.id);
  const userId = encodeURIComponent(config.jellyfinUserId);

  const p =
    `/Users/${userId}/Items/${id}` +
    `?Fields=Overview,ProductionYear,RunTimeTicks,PrimaryImageAspectRatio,Genres`;

  // ✅ correct call signature
  proxyJellyfin(p, res);
});

// Playback info (POST to Jellyfin for reliability)
app.get('/api/jellyfin/playback/:id', (req, res) => {
  console.log('[PlaybackInfo]', req.params.id, 'user', config.jellyfinUserId);
  const id = encodeURIComponent(req.params.id);
  const qs =
    `UserId=${encodeURIComponent(config.jellyfinUserId)}` +
    `&IsPlayback=true&AutoOpenLiveStream=true`;

  // Jellyfin expects POST for PlaybackInfo; some servers reject GET.
    const body = JSON.stringify({ DeviceProfile: {'MaxStreamingBitrate': 200000000, 'DirectPlayProfiles': [{'Container': 'mp4,m4v,mkv,webm', 'Type': 'Video'}, {'Container': 'mp3,aac,flac,ogg,opus,m4a,wav', 'Type': 'Audio'}], 'TranscodingProfiles': [{'Container': 'mp4', 'Type': 'Video', 'VideoCodec': 'h264', 'AudioCodec': 'aac', 'Context': 'Streaming', 'Protocol': 'hls'}, {'Container': 'mp3', 'Type': 'Audio', 'AudioCodec': 'mp3', 'Context': 'Streaming', 'Protocol': 'http'}]}, EnableDirectPlay: true, EnableTranscoding: true, AllowVideoStreamCopy: true, AllowAudioStreamCopy: true });
  proxyJellyfinRequest(
    `/Items/${id}/PlaybackInfo?${qs}`,
    req,
    res,
    'POST',
    body,
    { 'Content-Type': 'application/json' }
  );
});

// Direct stream (same-origin) + Range support
app.get('/api/jellyfin/stream/:id', async (req, res) => {
  console.log('[Stream]', req.params.id, 'mediaSourceId', req.query.mediaSourceId, 'playSessionId', req.query.playSessionId, 'kind', req.query.kind);
  const id = encodeURIComponent(req.params.id);
  const mediaSourceId = (req.query.mediaSourceId || '').toString();
  const playSessionId = (req.query.playSessionId || '').toString(); // optional
  const preferTranscode = String(req.query.preferTranscode || '') === '1';
  if (!mediaSourceId) {
    // Fallback: fetch PlaybackInfo to discover MediaSourceId
    try {
      const qs =
        `UserId=${encodeURIComponent(config.jellyfinUserId)}` +
        `&IsPlayback=true&AutoOpenLiveStream=true`;

      const body = JSON.stringify({});
      // Use proxyJellyfinRequest-style call but inline so we can parse JSON
      const url = new URL(`/Items/${id}/PlaybackInfo?${qs}`, config.jellyfinBaseUrl);
      const mod = url.protocol === 'https:' ? https : http;

      const headers = {
        'X-Emby-Token': config.jellyfinApiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      };

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
      };

      const info = await new Promise((resolve, reject) => {
        const r = mod.request(options, (pr) => {
          let data = '';
          pr.on('data', (c) => (data += c));
          pr.on('end', () => {
            try {
              resolve({ status: pr.statusCode || 200, json: data ? JSON.parse(data) : null });
            } catch (e) {
              reject(e);
            }
          });
        });
        r.on('error', reject);
        r.write(body);
        r.end();
      });

      if (!info.json || !info.json.MediaSources || !info.json.MediaSources[0] || !info.json.MediaSources[0].Id) {
        console.error('[Stream] Fallback PlaybackInfo missing MediaSources');
        return res.status(502).json({ error: 'PlaybackInfo returned no MediaSources' });
      }

      const discovered = info.json.MediaSources[0].Id;
      const discoveredSession = info.json.PlaySessionId || '';
      console.log('[Stream] Discovered mediaSourceId via PlaybackInfo', discovered);

      // Continue with discovered IDs
      const kind = (req.query.kind || '').toString().toLowerCase();
      const isAudio = kind === 'track' || kind === 'audio';

      if (preferTranscode && !isAudio) {
        const transcodingUrl = info.json.MediaSources[0].TranscodingUrl;
        if (transcodingUrl) {
          console.log('[Stream] Using transcoding url for compatibility', transcodingUrl);
          return proxyJellyfinStream(transcodingUrl, req, res);
        }
      }

      let p =
        `/${isAudio ? 'Audio' : 'Videos'}/${id}/stream` +
        `?static=true` +
        `&mediaSourceId=${encodeURIComponent(discovered)}`;

      if (discoveredSession) p += `&playSessionId=${encodeURIComponent(discoveredSession)}`;
      return proxyJellyfinStream(p, req, res);
    } catch (e) {
      console.error('[Stream] Fallback PlaybackInfo failed', e?.message || e);
      return res.status(502).json({ error: 'Fallback PlaybackInfo failed', details: String(e?.message || e) });
    }
  }

const kind = (req.query.kind || '').toString().toLowerCase();
  const isAudio = kind === 'track' || kind === 'audio';

  if (preferTranscode && !isAudio) {
    try {
      const qs =
        `UserId=${encodeURIComponent(config.jellyfinUserId)}` +
        `&IsPlayback=true&AutoOpenLiveStream=true`;

      const body = JSON.stringify({});
      const url = new URL(`/Items/${id}/PlaybackInfo?${qs}`, config.jellyfinBaseUrl);
      const mod = url.protocol === 'https:' ? https : http;
      const headers = {
        'X-Emby-Token': config.jellyfinApiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      };

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
      };

      const info = await new Promise((resolve, reject) => {
        const r = mod.request(options, (pr) => {
          let data = '';
          pr.on('data', (c) => (data += c));
          pr.on('end', () => {
            try {
              resolve(data ? JSON.parse(data) : null);
            } catch (e) {
              reject(e);
            }
          });
        });
        r.on('error', reject);
        r.write(body);
        r.end();
      });

      if (info && info.MediaSources && info.MediaSources[0] && info.MediaSources[0].TranscodingUrl) {
        console.log('[Stream] Using transcoding url for compatibility', info.MediaSources[0].TranscodingUrl);
        return proxyJellyfinStream(info.MediaSources[0].TranscodingUrl, req, res);
      }
    } catch (e) {
      console.error('[Stream] preferTranscode fallback failed', e?.message || e);
    }
  }

  let p =
    `/${isAudio ? 'Audio' : 'Videos'}/${id}/stream` +
    `?static=true` +
    `&mediaSourceId=${encodeURIComponent(mediaSourceId)}`;

  // Optional: some setups behave better when a playSessionId is supplied
  if (playSessionId) {
    p += `&playSessionId=${encodeURIComponent(playSessionId)}`;
  }

  proxyJellyfinStream(p, req, res);
});

// --- Serve static frontend ---

// Episodes in a season (for Play Next)
app.get('/api/jellyfin/season/:seasonId/episodes', (req, res) => {
  const { seasonId } = req.params;
  const path = `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items?ParentId=${encodeURIComponent(seasonId)}&IncludeItemTypes=Episode&Recursive=true&Fields=PrimaryImageAspectRatio,SortName,Overview,RunTimeTicks,UserData,SeriesName,IndexNumber,ParentIndexNumber&SortBy=IndexNumber&SortOrder=Ascending`;
  return proxyJellyfin(path, res);
});


// Seasons for a series
app.get('/api/jellyfin/series/:seriesId/seasons', (req, res) => {
  const { seriesId } = req.params;
  const path = `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items?ParentId=${encodeURIComponent(seriesId)}&IncludeItemTypes=Season&Recursive=true&Fields=PrimaryImageAspectRatio,SortName,Overview,RunTimeTicks,UserData,SeriesName,IndexNumber,ParentIndexNumber&SortBy=SortName&SortOrder=Ascending`;
  return proxyJellyfin(path, res);
});

app.use(express.static(distDir));

// SPA fallback (NO wildcard strings; avoids path-to-regexp issues)
app.use((req, res) => {
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(500).send('Build output missing: dist/index.html not found. Run: npm run build');
});
// --- Start ---
app.listen(PORT, '0.0.0.0', () => {
const nets = os.networkInterfaces();
const ips = [];
for (const name of Object.keys(nets)) {
  for (const net of nets[name] || []) {
    if (net && net.family === 'IPv4' && !net.internal) ips.push(net.address);
  }
}
const uniqueIps = [...new Set(ips)];

console.log(`
  ╔══════════════════════════════════════╗`);
console.log(`  ║   MediaPortal running on port ${PORT}    ║`);
console.log(`  ║   Local:  http://localhost:${PORT}      ║`);
if (uniqueIps.length) {
  for (const ip of uniqueIps) {
    console.log(`  ║   LAN:    http://${ip}:${PORT}          ║`);
  }
} else {
  console.log(`  ║   LAN:    (no IPv4 detected)            ║`);
}
console.log(`  ╚══════════════════════════════════════╝
`);
});
