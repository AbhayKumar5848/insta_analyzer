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
const MAX_CONSECUTIVE_FAILURES = 10;            // Auto-stop threshold (network errors only)
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
  skipped: 0,          // deactivated / deleted accounts skipped
  consecutiveFailures: 0,
  currentUsername: '',
  wave: 0,
  totalWaves: 0,
  paused: false,
  pauseReason: '',
  stoppedReason: '',
  startedAt: null,
  estimatedTimeLeft: '',
  disableWaves: false,
  waveSize: WAVE_SIZE,
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

export function startScraping(usernamesToScrape, options = {}) {
  if (scraper.state.active) {
    return { error: 'Scraping already in progress' };
  }

  const disableWaves = options.disableWaves || false;
  const waveSize = options.batchSize || WAVE_SIZE;
  const effectiveWaveSize = disableWaves ? usernamesToScrape.length : waveSize;
  const totalWaves = disableWaves ? 1 : Math.ceil(usernamesToScrape.length / waveSize);

  scraper.state = {
    ...defaultState,
    active: true,
    queue: [...usernamesToScrape],
    queueIndex: 0,
    total: usernamesToScrape.length,
    totalWaves,
    startedAt: new Date().toISOString(),
    disableWaves,
    waveSize: effectiveWaveSize,
  };
  scraper.aborted = false;

  console.log(`[Scraper] Starting: ${usernamesToScrape.length} profiles, batch=${effectiveWaveSize}, waves=${disableWaves ? 'DISABLED' : totalWaves}`);
  
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
  
  const currentWaveSize = scraper.state.waveSize || WAVE_SIZE;
  const waveStart = scraper.state.queueIndex;
  const waveEnd = Math.min(waveStart + currentWaveSize, scraper.state.queue.length);

  console.log(`[Scraper] Wave ${scraper.state.wave}/${scraper.state.totalWaves} — profiles ${waveStart + 1}–${waveEnd}`);

  for (let i = waveStart; i < waveEnd; i++) {
    if (scraper.aborted || !scraper.state.active) return;

    const username = scraper.state.queue[i];
    scraper.state.currentUsername = username;
    scraper.state.queueIndex = i + 1;

    // ── Skip __deleted__ accounts without making a network request ──
    if (username.startsWith('__deleted__')) {
      scraper.state.skipped++;
      scraper.state.completed++;
      saveDeactivatedProfile(username, 'deleted_account');
      console.log(`[Scraper] ⊘ @${username}: Deleted account — skipped`);
      updateETA();
      saveScrapeProgress();
      continue; // No delay needed, no request was made
    }

    // Scrape the profile
    const result = await scrapeOneProfile(username);

    if (result.error) {
      // ── Classify the error ──
      const ACCOUNT_ERRORS = ['not_found', 'no_data'];  // Account is gone/deactivated
      const isAccountError = ACCOUNT_ERRORS.includes(result.error);

      if (isAccountError) {
        // Account-level issue: skip gracefully, do NOT count toward auto-stop
        scraper.state.skipped++;
        saveDeactivatedProfile(username, result.error);
        console.log(`[Scraper] ⊘ @${username}: ${result.error} — deactivated/unavailable, skipping`);
        scraper.state.consecutiveFailures = 0; // Reset — this isn't a blocking issue
      } else {
        // Network/blocking error: count toward auto-stop
        scraper.state.failures++;
        scraper.state.consecutiveFailures++;
        console.log(`[Scraper] ✗ @${username}: ${result.error} (${scraper.state.consecutiveFailures} consecutive network failures)`);

        // ── AUTO-STOP: too many consecutive network failures ──
        if (scraper.state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stopScraping(`Auto-stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive network failures — Instagram may be blocking requests. Try again later.`);
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

  // Wave cooldown (skip if waves are disabled)
  if (!scraper.aborted && scraper.state.active) {
    if (scraper.state.disableWaves) {
      // No cooldown — jump straight to the next batch
      console.log(`[Scraper] Waves disabled — continuing immediately`);
      processNextWave();
    } else {
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
}

// ── Instagram Profile Scraper ──

async function scrapeOneProfile(username) {
  const url = `https://www.instagram.com/${username}/`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers = {
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
    };

    if (process.env.IG_SESSIONID) {
      headers['Cookie'] = `sessionid=${process.env.IG_SESSIONID};`;
    }

    const res = await fetch(url, {
      headers,
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

    const description = decodeHTMLEntities(ogDesc?.[1] || metaDesc?.[1] || '');

    // ── Detect Instagram blocking ──
    // When blocked, og:title becomes just "Instagram" or the page is a generic login wall
    const rawTitle = ogTitle?.[1] || '';
    const isBlockedPage =
      rawTitle.toLowerCase() === 'instagram' ||
      (rawTitle.includes('Instagram photos and videos') && !description.match(/Followers/i));
    
    if (isBlockedPage) {
      console.log(`[Scraper] ⚠ @${username}: Instagram returned generic page (blocked)`);
      return { error: 'rate_limited' };
    }

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

// Decode HTML entities (&#x2708; &#xfe0f; &amp; &lt; &gt; &quot; etc.)
function decodeHTMLEntities(str) {
  if (!str) return '';
  return str
    // Hex entities: &#x2708; &#xfe0f; &#x1f9a6;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    // Decimal entities: &#9992;
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Named entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractFullName(ogTitle, username) {
  if (!ogTitle) return '';
  // Decode HTML entities first
  const decoded = decodeHTMLEntities(ogTitle);
  // Format: "Full Name (@username) • Instagram photos and videos"
  const match = decoded.match(/^(.+?)\s*\(@/);
  return match ? match[1].trim() : decoded.split('•')[0].split('(')[0].trim();
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
  const currentWaveSize = s.waveSize || WAVE_SIZE;
  const remainingWaves = Math.ceil(remaining / currentWaveSize);
  const waveCooldown = s.disableWaves ? 0 : WAVE_COOLDOWN_MS;
  const etaMs = (remaining * avgPerProfile) + (remainingWaves * waveCooldown);
  
  if (etaMs > 3600000) {
    s.estimatedTimeLeft = `${(etaMs / 3600000).toFixed(1)} hours`;
  } else if (etaMs > 60000) {
    s.estimatedTimeLeft = `${Math.round(etaMs / 60000)} min`;
  } else {
    s.estimatedTimeLeft = 'less than 1 min';
  }
}

function saveScrapeProgress() {
  const { queue, queueIndex, completed, successes, failures, skipped, wave, totalWaves, startedAt } = scraper.state;
  writeScrapeState({ queue, queueIndex, completed, successes, failures, skipped, wave, totalWaves, startedAt });
}

// ── Save deactivated/deleted account to profiles ──
function saveDeactivatedProfile(username, reason) {
  try {
    const profiles = readProfiles();
    const idx = profiles.findIndex(p => p.username === username);
    if (idx >= 0) {
      profiles[idx] = {
        ...profiles[idx],
        status: 'deactivated',
        deactivatedReason: reason,
        followersCount: -1,
        followingCount: -1,
        postsCount: -1,
        lastScrapedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeProfiles(profiles);
    }
  } catch (e) {
    console.error(`[Scraper] Error saving deactivated profile @${username}:`, e.message);
  }
}
