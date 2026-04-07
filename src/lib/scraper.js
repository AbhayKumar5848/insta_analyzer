// ══════════════════════════════════════════════════════════════
// Scraper — Instagram public profile scraper with auto-stop
// Wave-based scheduling, rate limit handling, proxy support
// ══════════════════════════════════════════════════════════════

import { readProfiles, writeProfiles, writeScrapeState, clearScrapeState } from './store.js';

// ── Config ──
const WAVE_SIZE = 25;
const WAVE_COOLDOWN_MS = 5 * 60 * 1000;       // 5 min between waves
const DELAY_MIN_MS = 6000;                      // 6s min between requests
const DELAY_MAX_MS = 15000;                     // 15s max between requests 
const MAX_CONSECUTIVE_FAILURES = 5;             // Auto-stop threshold
const REQUEST_TIMEOUT_MS = 15000;               // 15s per request
const RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;   // 10 min initial backoff
const MAX_BACKOFF_MS = 40 * 60 * 1000;          // 40 min max backoff

// ── User-Agent Rotation ──
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomBetween(min, max) { return min + Math.random() * (max - min); }

// ── Singleton (survives Next.js hot reload in dev) ──
const defaultState = {
  active: false,
  queue: [],           // usernames still to scrape
  queueIndex: 0,
  completed: 0,
  total: 0,
  successes: 0,
  failures: 0,
  consecutiveFailures: 0,
  currentUsername: '',
  wave: 0,
  totalWaves: 0,
  paused: false,
  pauseReason: '',
  stoppedReason: '',
  startedAt: null,
  estimatedTimeLeft: '',
};

if (!globalThis.__igScraper) {
  globalThis.__igScraper = {
    state: { ...defaultState },
    timeoutId: null,
    aborted: false,
  };
}

const scraper = globalThis.__igScraper;

// ── Public API ──

export function getProgress() {
  return { ...scraper.state };
}

export function startScraping(usernamesToScrape) {
  if (scraper.state.active) {
    return { error: 'Scraping already in progress' };
  }

  const totalWaves = Math.ceil(usernamesToScrape.length / WAVE_SIZE);

  scraper.state = {
    ...defaultState,
    active: true,
    queue: [...usernamesToScrape],
    queueIndex: 0,
    total: usernamesToScrape.length,
    totalWaves,
    startedAt: new Date().toISOString(),
  };
  scraper.aborted = false;

  console.log(`[Scraper] Starting: ${usernamesToScrape.length} profiles in ${totalWaves} waves`);
  
  // Begin async processing
  processNextWave();
  
  return { success: true, total: usernamesToScrape.length, waves: totalWaves };
}

export function stopScraping(reason = 'Manually stopped') {
  scraper.aborted = true;
  scraper.state.active = false;
  scraper.state.paused = false;
  scraper.state.stoppedReason = reason;
  if (scraper.timeoutId) {
    clearTimeout(scraper.timeoutId);
    scraper.timeoutId = null;
  }
  saveScrapeProgress();
  console.log(`[Scraper] Stopped: ${reason}`);
}

export function resumeScraping() {
  if (scraper.state.active) {
    return { error: 'Already running' };
  }
  
  const remaining = scraper.state.queue.slice(scraper.state.queueIndex);
  if (remaining.length === 0) {
    return { error: 'Nothing to resume' };
  }

  scraper.state.active = true;
  scraper.state.paused = false;
  scraper.state.stoppedReason = '';
  scraper.state.consecutiveFailures = 0;
  scraper.aborted = false;

  console.log(`[Scraper] Resuming: ${remaining.length} profiles remaining`);
  processNextWave();
  
  return { success: true, remaining: remaining.length };
}

// ── Internal Processing ──

async function processNextWave() {
  if (scraper.aborted || !scraper.state.active) return;

  scraper.state.wave++;
  scraper.state.paused = false;
  scraper.state.pauseReason = '';
  
  const waveStart = scraper.state.queueIndex;
  const waveEnd = Math.min(waveStart + WAVE_SIZE, scraper.state.queue.length);

  console.log(`[Scraper] Wave ${scraper.state.wave}/${scraper.state.totalWaves} — profiles ${waveStart + 1}–${waveEnd}`);

  for (let i = waveStart; i < waveEnd; i++) {
    if (scraper.aborted || !scraper.state.active) return;

    const username = scraper.state.queue[i];
    scraper.state.currentUsername = username;
    scraper.state.queueIndex = i + 1;

    // Scrape the profile
    const result = await scrapeOneProfile(username);

    if (result.error) {
      scraper.state.failures++;
      scraper.state.consecutiveFailures++;
      console.log(`[Scraper] ✗ @${username}: ${result.error} (${scraper.state.consecutiveFailures} consecutive failures)`);

      // ── AUTO-STOP: too many consecutive failures ──
      if (scraper.state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        stopScraping(`Auto-stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive failures — Instagram may be blocking requests. Try again later.`);
        return;
      }

      // ── Rate limit: exponential backoff ──
      if (result.error === 'rate_limited') {
        const backoffMs = Math.min(
          RATE_LIMIT_BACKOFF_MS * Math.pow(2, scraper.state.consecutiveFailures - 1),
          MAX_BACKOFF_MS
        );
        const backoffMin = Math.round(backoffMs / 60000);
        scraper.state.paused = true;
        scraper.state.pauseReason = `Rate limited — backing off ${backoffMin} minutes`;
        console.log(`[Scraper] Rate limited — backing off ${backoffMin} minutes`);
        
        await sleep(backoffMs);
        
        if (scraper.aborted) return;
        scraper.state.paused = false;
      }
    } else {
      scraper.state.successes++;
      scraper.state.consecutiveFailures = 0; // Reset on success
      
      // Update profile in storage
      const profiles = readProfiles();
      const idx = profiles.findIndex(p => p.username === username);
      if (idx >= 0) {
        profiles[idx] = {
          ...profiles[idx],
          ...result,
          lastScrapedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        writeProfiles(profiles);
      }
      console.log(`[Scraper] ✓ @${username}: ${formatCount(result.followersCount)} followers`);
    }

    scraper.state.completed++;
    updateETA();
    saveScrapeProgress();

    // Random delay between requests (within a wave)
    if (i < waveEnd - 1 && !scraper.aborted) {
      await sleep(randomBetween(DELAY_MIN_MS, DELAY_MAX_MS));
    }
  }

  // All done?
  if (scraper.state.queueIndex >= scraper.state.queue.length) {
    scraper.state.active = false;
    scraper.state.currentUsername = '';
    scraper.state.stoppedReason = 'Completed successfully';
    clearScrapeState();
    console.log(`[Scraper] ✅ Done! ${scraper.state.successes} succeeded, ${scraper.state.failures} failed`);
    return;
  }

  // Wave cooldown
  if (!scraper.aborted && scraper.state.active) {
    const cooldownMin = Math.round(WAVE_COOLDOWN_MS / 60000);
    scraper.state.paused = true;
    scraper.state.pauseReason = `Wave ${scraper.state.wave} complete — cooling down ${cooldownMin} minutes`;
    console.log(`[Scraper] Cooling down ${cooldownMin} minutes before next wave...`);
    
    scraper.timeoutId = setTimeout(() => {
      scraper.timeoutId = null;
      if (!scraper.aborted) processNextWave();
    }, WAVE_COOLDOWN_MS);
  }
}

// ── Instagram Profile Scraper ──

async function scrapeOneProfile(username) {
  const url = `https://www.instagram.com/${username}/`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (res.status === 404) return { error: 'not_found' };
    if (res.status === 429 || res.status === 403) return { error: 'rate_limited' };
    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (location.includes('/accounts/login')) return { error: 'login_required' };
      return { error: 'redirect' };
    }
    if (!res.ok) return { error: `http_${res.status}` };

    const html = await res.text();

    // Check for login wall
    if (html.includes('/accounts/login') && html.length < 5000) {
      return { error: 'login_required' };
    }

    // Parse meta tags
    const ogDesc = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]*?)"/i);
    const metaDesc = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/i);
    const ogTitle = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]*?)"/i);
    const ogImage = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]*?)"/i);

    const description = ogDesc?.[1] || metaDesc?.[1] || '';

    if (!description) {
      // Page loaded but no meta data — might be a private profile or login wall
      if (html.includes('"is_private":true')) {
        return {
          username,
          fullName: extractFullName(ogTitle?.[1], username),
          profilePic: ogImage?.[1] || '',
          followersCount: -1,
          followingCount: -1,
          postsCount: -1,
          isPrivate: true,
          isVerified: html.includes('"is_verified":true'),
        };
      }
      return { error: 'no_data' };
    }

    // Parse follower counts from description
    // Format: "1.2M Followers, 500 Following, 200 Posts - See Instagram photos..."
    let followersCount = -1, followingCount = -1, postsCount = -1;
    
    const fMatch = description.match(/([\d,.]+[KkMm]?)\s*Followers/i);
    const gMatch = description.match(/([\d,.]+[KkMm]?)\s*Following/i);
    const pMatch = description.match(/([\d,.]+[KkMm]?)\s*Posts?/i);

    if (fMatch) followersCount = parseCount(fMatch[1]);
    if (gMatch) followingCount = parseCount(gMatch[1]);
    if (pMatch) postsCount = parseCount(pMatch[1]);

    return {
      username,
      fullName: extractFullName(ogTitle?.[1], username),
      profilePic: ogImage?.[1] || '',
      followersCount,
      followingCount,
      postsCount,
      isPrivate: html.includes('"is_private":true'),
      isVerified: html.includes('"is_verified":true'),
    };

  } catch (err) {
    if (err.name === 'AbortError') return { error: 'timeout' };
    return { error: err.message };
  }
}

// ── Helpers ──

function extractFullName(ogTitle, username) {
  if (!ogTitle) return '';
  // Format: "Full Name (@username) • Instagram photos and videos"
  const match = ogTitle.match(/^(.+?)\s*\(@/);
  return match ? match[1].trim() : ogTitle.split('•')[0].split('(')[0].trim();
}

function parseCount(str) {
  if (!str) return -1;
  str = str.replace(/,/g, '').trim();
  const lower = str.toLowerCase();
  if (lower.endsWith('m')) return Math.round(parseFloat(lower) * 1_000_000);
  if (lower.endsWith('k')) return Math.round(parseFloat(lower) * 1_000);
  const num = parseInt(str);
  return isNaN(num) ? -1 : num;
}

function formatCount(num) {
  if (num < 0) return '?';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

function updateETA() {
  const s = scraper.state;
  if (s.completed === 0 || !s.startedAt) {
    s.estimatedTimeLeft = '';
    return;
  }
  const elapsed = Date.now() - new Date(s.startedAt).getTime();
  const avgPerProfile = elapsed / s.completed;
  const remaining = s.total - s.completed;
  // Account for wave cooldowns
  const remainingWaves = Math.ceil(remaining / WAVE_SIZE);
  const etaMs = (remaining * avgPerProfile) + (remainingWaves * WAVE_COOLDOWN_MS);
  
  if (etaMs > 3600000) {
    s.estimatedTimeLeft = `${(etaMs / 3600000).toFixed(1)} hours`;
  } else if (etaMs > 60000) {
    s.estimatedTimeLeft = `${Math.round(etaMs / 60000)} min`;
  } else {
    s.estimatedTimeLeft = 'less than 1 min';
  }
}

function saveScrapeProgress() {
  const { queue, queueIndex, completed, successes, failures, wave, totalWaves, startedAt } = scraper.state;
  writeScrapeState({ queue, queueIndex, completed, successes, failures, wave, totalWaves, startedAt });
}
