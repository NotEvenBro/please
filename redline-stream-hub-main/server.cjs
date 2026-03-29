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


async function proxyJellyfinJson(jellyfinPath) {
  if (!config.jellyfinBaseUrl || !config.jellyfinApiKey || !config.jellyfinUserId) {
    throw new Error('Jellyfin not configured');
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
      'Accept': 'application/json',
    },
  };

  return await new Promise((resolve, reject) => {
    const req = mod.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch (e) {
          reject(new Error(`Invalid JSON from Jellyfin (${res.statusCode || 0}): ${String(body).slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}


const transcodeSessionBasePath = new Map();

function rememberTranscodePath(transcodingUrl, playSessionId, mediaSourceId) {
  if (!transcodingUrl) return;
  const asUrl = new URL(transcodingUrl, config.jellyfinBaseUrl);
  const basePath = asUrl.pathname.replace(/[^/]*$/, '');
  if (playSessionId) transcodeSessionBasePath.set(`session:${playSessionId}`, basePath);
  if (mediaSourceId) transcodeSessionBasePath.set(`source:${mediaSourceId}`, basePath);
}

function applySubtitlePreferenceToTranscodeUrl(transcodingUrl, subtitlePref) {
  if (!transcodingUrl) return transcodingUrl;
  if (subtitlePref !== 'off') return transcodingUrl;

  const u = new URL(transcodingUrl, config.jellyfinBaseUrl);
  u.searchParams.delete('SubtitleStreamIndex');
  u.searchParams.delete('SubtitleMethod');
  u.searchParams.delete('TranscodeReasons');
  return `${u.pathname}${u.search}`;
}

function resolveTranscodeArtifactPath(fileName, playSessionId, mediaSourceId) {
  const bySession = playSessionId ? transcodeSessionBasePath.get(`session:${playSessionId}`) : null;
  const bySource = mediaSourceId ? transcodeSessionBasePath.get(`source:${mediaSourceId}`) : null;
  const base = bySession || bySource || (mediaSourceId ? `/Videos/${encodeURIComponent(mediaSourceId)}/` : null);
  if (!base) return null;
  const safeFilePath = String(fileName)
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${base}${safeFilePath}`;
}

function buildTranscodeProxyUrl(transcodingUrl, playSessionId, mediaSourceId) {
  if (!transcodingUrl) return null;
  const u = new URL(transcodingUrl, config.jellyfinBaseUrl);
  const fileName = u.pathname.split('/').filter(Boolean).pop() || 'master.m3u8';
  const qs = new URLSearchParams();
  if (playSessionId) qs.set('playSessionId', playSessionId);
  if (mediaSourceId) qs.set('mediaSourceId', mediaSourceId);
  return `/api/jellyfin/transcode/${encodeURIComponent(fileName)}${qs.toString() ? `?${qs.toString()}` : ''}`;
}


function getPlaybackClientHints(req) {
  const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
  const isVidaa = /vidaa|hisense/.test(userAgent);
  const isTv = isVidaa || /(smart-tv|smarttv|hbbtv|tizen|web0s|webos|roku|appletv|googletv|android tv|bravia|viera)/.test(userAgent);

  return { isTv, isVidaa, userAgent };
}

function buildPlaybackInfoRequestBody(req) {
  const { isTv, isVidaa } = getPlaybackClientHints(req);

  // Keep TV streams conservative to reduce segment/network pressure on 10-foot devices.
  const maxStreamingBitrate = isVidaa ? 6_000_000 : isTv ? 12_000_000 : 120_000_000;
  const videoProfile = {
    Container: 'ts',
    Type: 'Video',
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    Context: 'Streaming',
    Protocol: 'hls',
  };

  if (isVidaa) {
    // VIDAA browsers are most stable with MPEG-TS HLS segments and AVC baseline profile.
    videoProfile.SegmentContainer = 'ts';
    videoProfile.MinSegments = 1;
    videoProfile.BreakOnNonKeyFrames = false;
  }

  return JSON.stringify({
    DeviceProfile: {
      MaxStreamingBitrate: maxStreamingBitrate,
      DirectPlayProfiles: [
        { Container: 'mp4,m4v,webm', Type: 'Video' },
        { Container: 'mp3,aac,ogg,opus,m4a,wav', Type: 'Audio' },
      ],
      TranscodingProfiles: [
        videoProfile,
        { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3', Context: 'Streaming', Protocol: 'http' },
      ],
    },
    EnableDirectPlay: true,
    EnableTranscoding: true,
    AllowVideoStreamCopy: true,
    AllowAudioStreamCopy: false,
  });
}

function shouldTranscodeForCompatibility(mediaSource = {}) {
  const container = String(mediaSource?.Container || '').toLowerCase();
  const streams = Array.isArray(mediaSource?.MediaStreams) ? mediaSource.MediaStreams : [];

  const video = streams.find((s) => String(s?.Type || '').toLowerCase() === 'video');
  const audio = streams.find((s) => String(s?.Type || '').toLowerCase() === 'audio');

  const videoCodec = String(video?.Codec || '').toLowerCase();
  const audioCodec = String(audio?.Codec || '').toLowerCase();
  const bitrate = Number(mediaSource?.Bitrate || 0);
  const width = Number(video?.Width || 0);
  const height = Number(video?.Height || 0);
  const bitDepth = Number(video?.BitDepth || 0);
  const hdrHints = [
    video?.VideoRange,
    video?.VideoRangeType,
    video?.ColorTransfer,
    video?.ColorPrimaries,
    video?.Title,
    video?.DisplayTitle,
    video?.Profile,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const isHdrLike = Boolean(video?.IsHdr) || /hdr|hlg|pq|bt2020|smpte2084/.test(hdrHints) || bitDepth > 8;
  const is4kLike = width >= 3800 || height >= 2100;

  // Keep browser/TV playback conservative: AVC video + broadly-supported audio.
  const browserSafeVideo = new Set(['h264', 'avc', 'avc1']);
  const browserSafeAudio = new Set(['aac', 'mp3', 'mp2', 'opus', 'vorbis']);

  const containerLikelyDirectPlayable = ['mp4', 'm4v', 'webm'].includes(container);
  const videoNeedsTranscode = videoCodec && !browserSafeVideo.has(videoCodec);
  const audioNeedsTranscode = audioCodec && !browserSafeAudio.has(audioCodec);
  const veryHighBitrate = bitrate > 40_000_000;

  return Boolean(
    videoNeedsTranscode ||
    audioNeedsTranscode ||
    !containerLikelyDirectPlayable ||
    veryHighBitrate ||
    isHdrLike ||
    is4kLike
  );
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

app.get('/api/jellyfin/transcode/:fileName', (req, res) => {
  const fileName = String(req.params.fileName || '');
  const playSessionId = String(req.query.playSessionId || '');
  const mediaSourceId = String(req.query.mediaSourceId || '');
  const artifactPath = resolveTranscodeArtifactPath(fileName, playSessionId, mediaSourceId);

  if (!artifactPath) {
    return res.status(400).json({ error: 'Missing transcode path context', details: 'playSessionId or mediaSourceId is required' });
  }

  const jellyfinPath = artifactPath.startsWith('/') ? artifactPath : `/${artifactPath}`;
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
    const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('mpegurl') || fileName.endsWith('.m3u8')) {
      let body = '';
      proxyRes.on('data', (chunk) => (body += chunk));
      proxyRes.on('end', () => {
        const rewritten = body
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            if (/^https?:\/\//i.test(trimmed)) {
              const absolute = new URL(trimmed);
              const absPath = `${absolute.pathname}${absolute.search}`;
              return `/api/jellyfin/transcode-abs?path=${encodeURIComponent(absPath)}`;
            }
            if (trimmed.startsWith('/')) {
              return `/api/jellyfin/transcode-abs?path=${encodeURIComponent(trimmed)}`;
            }
            const q = new URLSearchParams();
            if (playSessionId) q.set('playSessionId', playSessionId);
            if (mediaSourceId) q.set('mediaSourceId', mediaSourceId);
            return `/api/jellyfin/transcode/${encodeURIComponent(trimmed)}${q.toString() ? `?${q.toString()}` : ''}`;
          })
          .join('\n');

        res.status(proxyRes.statusCode || 200);
        res.setHeader('content-type', proxyRes.headers['content-type'] || 'application/vnd.apple.mpegurl');
        res.setHeader('cache-control', 'no-store');
        res.send(rewritten);
      });
      return;
    }

    res.status(proxyRes.statusCode || 200);
    const passthroughHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'etag', 'last-modified', 'cache-control'];
    for (const h of passthroughHeaders) {
      if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Transcode Proxy Error]', err.message);
    res.status(502).json({ error: 'Transcode artifact unreachable', details: err.message });
  });

  proxyReq.end();
});

app.get('/api/jellyfin/transcode-abs', (req, res) => {
  const rawPath = String(req.query.path || '');
  if (!rawPath || !rawPath.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid transcode path' });
  }

  const url = new URL(rawPath, config.jellyfinBaseUrl);
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
    const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('mpegurl') || url.pathname.endsWith('.m3u8')) {
      let body = '';
      proxyRes.on('data', (chunk) => (body += chunk));
      proxyRes.on('end', () => {
        const rewritten = body
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            if (/^https?:\/\//i.test(trimmed)) {
              const absolute = new URL(trimmed);
              return `/api/jellyfin/transcode-abs?path=${encodeURIComponent(`${absolute.pathname}${absolute.search}`)}`;
            }
            if (trimmed.startsWith('/')) {
              return `/api/jellyfin/transcode-abs?path=${encodeURIComponent(trimmed)}`;
            }
            const baseDir = url.pathname.replace(/[^/]*$/, '');
            const rel = `${baseDir}${trimmed}`;
            return `/api/jellyfin/transcode-abs?path=${encodeURIComponent(rel)}`;
          })
          .join('\n');

        res.status(proxyRes.statusCode || 200);
        res.setHeader('content-type', proxyRes.headers['content-type'] || 'application/vnd.apple.mpegurl');
        res.setHeader('cache-control', 'no-store');
        res.send(rewritten);
      });
      return;
    }

    res.status(proxyRes.statusCode || 200);
    const passthroughHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'etag', 'last-modified', 'cache-control'];
    for (const h of passthroughHeaders) {
      if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Transcode Abs Proxy Error]', err.message);
    res.status(502).json({ error: 'Absolute transcode artifact unreachable', details: err.message });
  });

  proxyReq.end();
});

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

app.get('/api/jellyfin/continue-watching', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 30;
  const fetchLimit = Math.max(limit * 4, 80);
  const path =
    `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items` +
    `?IncludeItemTypes=Episode,Movie` +
    `&Recursive=true` +
    `&Filters=IsResumable` +
    `&SortBy=DatePlayed` +
    `&SortOrder=Descending` +
    `&Limit=${fetchLimit}` +
    `&Fields=Overview,PrimaryImageAspectRatio,ProductionYear,UserData,RunTimeTicks,SeriesName,IndexNumber,ParentIndexNumber,SeriesId` +
    `&ImageTypeLimit=1&EnableImageTypes=Primary`;

  try {
    const data = await proxyJellyfinJson(path);
    const items = Array.isArray(data?.Items) ? data.Items : [];
    const seen = new Set();
    const deduped = [];

    for (const it of items) {
      const key = String(it?.SeriesId || it?.Id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(it);
      if (deduped.length >= limit) break;
    }

    return res.json({ ...data, Items: deduped });
  } catch (err) {
    console.error('[ContinueWatching] failed', err?.message || err);
    return res.status(502).json({ error: 'Continue watching unavailable', details: err?.message || String(err) });
  }
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
  const rawRating = req.body?.rating;

  if (rawRating == null) {
    return proxyJellyfinRequest(
      `/Users/${encodeURIComponent(config.jellyfinUserId)}/Items/${itemId}/Rating`,
      req,
      res,
      'DELETE'
    );
  }

  const rating = Math.round(Number(rawRating));
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

app.post('/api/jellyfin/progress/:id', (req, res) => {
  const itemId = encodeURIComponent(req.params.id);
  const positionTicks = Number(req.body?.positionTicks ?? 0);
  const played = Boolean(req.body?.played);

  if (!Number.isFinite(positionTicks) || positionTicks < 0) {
    return res.status(400).json({ error: 'Invalid positionTicks' });
  }

  const body = JSON.stringify({
    PlaybackPositionTicks: Math.round(positionTicks),
    Played: played,
    PlayCount: played ? 1 : 0,
  });

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


// Debug helper: inspect Jellyfin PlaybackInfo and chosen transcode path for a given item.
app.get('/api/jellyfin/transcode-debug/:id', async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);
    const forceTranscode = String(req.query.preferTranscode || '') === '1';
    const qs =
      `UserId=${encodeURIComponent(config.jellyfinUserId)}` +
      `&IsPlayback=true&AutoOpenLiveStream=true`;

    const body = JSON.stringify({
      DeviceProfile: {
        MaxStreamingBitrate: 120000000,
        DirectPlayProfiles: [
          { Container: 'mp4,m4v,webm', Type: 'Video' },
          { Container: 'mp3,aac,ogg,opus,m4a,wav', Type: 'Audio' },
        ],
        TranscodingProfiles: [
          { Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'hls' },
          { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3', Context: 'Streaming', Protocol: 'http' },
        ],
      },
      EnableDirectPlay: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: false,
    });

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

    const src = info?.json?.MediaSources?.[0];
    const streams = Array.isArray(src?.MediaStreams) ? src.MediaStreams : [];
    const audioStreams = streams
      .filter((s) => String(s?.Type || '').toLowerCase() === 'audio')
      .map((s) => ({
        index: s.Index,
        codec: s.Codec,
        channels: s.Channels,
        language: s.Language,
        title: s.DisplayTitle || s.Title || null,
      }));
    const videoStreams = streams
      .filter((s) => String(s?.Type || '').toLowerCase() === 'video')
      .map((s) => ({
        index: s.Index,
        codec: s.Codec,
        width: s.Width,
        height: s.Height,
        profile: s.Profile,
      }));

    return res.json({
      itemId: req.params.id,
      preferTranscodeRequested: forceTranscode,
      playbackInfoStatus: info?.status || null,
      playSessionId: info?.json?.PlaySessionId || null,
      mediaSourceId: src?.Id || null,
      container: src?.Container || null,
      bitrate: src?.Bitrate || null,
      transcodingUrl: src?.TranscodingUrl || null,
      directStreamUrl: src?.DirectStreamUrl || null,
      supportsTranscoding: Boolean(src?.SupportsTranscoding),
      transcodeReasons: src?.TranscodingContainer || null,
      videoStreams,
      audioStreams,
      subtitles: streams
        .filter((s) => String(s?.Type || '').toLowerCase() === 'subtitle')
        .map((s) => ({ index: s.Index, codec: s.Codec, language: s.Language, title: s.DisplayTitle || s.Title || null })),
    });
  } catch (e) {
    console.error('[Transcode Debug] failed', e?.message || e);
    return res.status(502).json({ error: 'Transcode debug failed', details: String(e?.message || e) });
  }
});


async function fetchFirstEpisodeIdForSeries(seriesId) {
  if (!seriesId) return null;

  try {
    const params = new URLSearchParams({
      ParentId: seriesId,
      UserId: config.jellyfinUserId,
      IncludeItemTypes: 'Episode',
      Recursive: 'true',
      SortBy: 'ParentIndexNumber,IndexNumber,SortName',
      SortOrder: 'Ascending',
      Limit: '1',
      Fields: 'Id,Type',
    });

    const result = await proxyJellyfinJson(`/Users/${config.jellyfinUserId}/Items?${params.toString()}`);
    const first = Array.isArray(result?.Items) ? result.Items[0] : null;
    return first?.Id || null;
  } catch (e) {
    console.error('[Stream] Series episode resolution failed', e?.message || e);
    return null;
  }
}

// Direct stream (same-origin) + Range support
app.get('/api/jellyfin/stream/:id', async (req, res) => {
  console.log('[Stream]', req.params.id, 'mediaSourceId', req.query.mediaSourceId, 'playSessionId', req.query.playSessionId, 'kind', req.query.kind);
  const id = encodeURIComponent(req.params.id);
  const mediaSourceId = (req.query.mediaSourceId || '').toString();
  const playSessionId = (req.query.playSessionId || '').toString(); // optional
  const preferTranscode = String(req.query.preferTranscode || '') === '1';
  const kind = (req.query.kind || '').toString().toLowerCase();
  const isAudio = kind === 'track' || kind === 'audio';
  const subtitlePref = String(req.query.subtitle || '').toLowerCase();
  if (!mediaSourceId) {
    // Fallback: fetch PlaybackInfo to discover MediaSourceId
    try {
      const qs =
        `UserId=${encodeURIComponent(config.jellyfinUserId)}` +
        `&IsPlayback=true&AutoOpenLiveStream=true`;

      const body = buildPlaybackInfoRequestBody(req);
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
            let parsed = null;
            try {
              parsed = data ? JSON.parse(data) : null;
            } catch {
              // Jellyfin may return text/plain errors; keep raw for diagnostics.
            }
            resolve({ status: pr.statusCode || 200, json: parsed, raw: data || '' });
          });
        });
        r.on('error', reject);
        r.write(body);
        r.end();
      });

      if (!info.json || !info.json.MediaSources || !info.json.MediaSources[0] || !info.json.MediaSources[0].Id) {
        console.error('[Stream] Fallback PlaybackInfo missing MediaSources', 'status', info.status, 'raw', String(info.raw || '').slice(0, 220));
        const fallbackKind = (req.query.kind || '').toString().toLowerCase();
        const isAudioFallback = fallbackKind === 'track' || fallbackKind === 'audio';
        const fallbackPath = `/${isAudioFallback ? 'Audio' : 'Videos'}/${id}/stream?static=true`;
        return proxyJellyfinStream(fallbackPath, req, res);
      }

      const source = info.json.MediaSources[0];
      const discovered = source.Id;
      const discoveredSession = info.json.PlaySessionId || '';
      console.log('[Stream] Discovered mediaSourceId via PlaybackInfo', discovered);

      if ((preferTranscode || shouldTranscodeForCompatibility(source)) && !isAudio) {
        const transcodingUrl = applySubtitlePreferenceToTranscodeUrl(info.json.MediaSources[0].TranscodingUrl, subtitlePref);
        if (transcodingUrl) {
          console.log('[Stream] Using transcoding url for compatibility', transcodingUrl);
          rememberTranscodePath(transcodingUrl, discoveredSession, discovered);
          const proxyUrl = buildTranscodeProxyUrl(transcodingUrl, discoveredSession, discovered);
          return res.redirect(302, proxyUrl || transcodingUrl);
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
      const fallbackKind = (req.query.kind || '').toString().toLowerCase();
      const isAudioFallback = fallbackKind === 'track' || fallbackKind === 'audio';
      const fallbackPath = `/${isAudioFallback ? 'Audio' : 'Videos'}/${id}/stream?static=true`;
      return proxyJellyfinStream(fallbackPath, req, res);
    }
  }

  if (!isAudio) {
    try {
      const qs =
        `UserId=${encodeURIComponent(config.jellyfinUserId)}` +
        `&IsPlayback=true&AutoOpenLiveStream=true`;

      const body = buildPlaybackInfoRequestBody(req);
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

      if (
        info &&
        info.MediaSources &&
        info.MediaSources[0] &&
        (info.MediaSources[0].TranscodingUrl && (preferTranscode || shouldTranscodeForCompatibility(info.MediaSources[0])))
      ) {
        const effectiveTranscodingUrl = applySubtitlePreferenceToTranscodeUrl(info.MediaSources[0].TranscodingUrl, subtitlePref);
        console.log('[Stream] Using transcoding url for compatibility', effectiveTranscodingUrl);
        rememberTranscodePath(effectiveTranscodingUrl, info.PlaySessionId || playSessionId, info.MediaSources[0].Id || mediaSourceId);
        const proxyUrl = buildTranscodeProxyUrl(effectiveTranscodingUrl, info.PlaySessionId || playSessionId, info.MediaSources[0].Id || mediaSourceId);
        return res.redirect(302, proxyUrl || effectiveTranscodingUrl);
      }
    } catch (e) {
      console.error('[Stream] compatibility fallback failed', e?.message || e);
    }
  }

  if (preferTranscode && !isAudio) {
    try {
      const qs =
        `UserId=${encodeURIComponent(config.jellyfinUserId)}` +
        `&IsPlayback=true&AutoOpenLiveStream=true`;

      const body = buildPlaybackInfoRequestBody(req);
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
        const effectiveTranscodingUrl = applySubtitlePreferenceToTranscodeUrl(info.MediaSources[0].TranscodingUrl, subtitlePref);
        console.log('[Stream] Using transcoding url for compatibility', effectiveTranscodingUrl);
        rememberTranscodePath(effectiveTranscodingUrl, info.PlaySessionId || playSessionId, info.MediaSources[0].Id || mediaSourceId);
        const proxyUrl = buildTranscodeProxyUrl(effectiveTranscodingUrl, info.PlaySessionId || playSessionId, info.MediaSources[0].Id || mediaSourceId);
        return res.redirect(302, proxyUrl || effectiveTranscodingUrl);
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
