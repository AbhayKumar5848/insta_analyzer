// ══════════════════════════════════════════════════════════════
// Store — JSON file-based persistence (zero dependencies)
// ══════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const STATE_FILE = path.join(DATA_DIR, 'scrape-state.json');

// ── Profiles ──

export function readProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[Store] Read profiles error:', e.message);
  }
  return [];
}

export function writeProfiles(profiles) {
  try {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
  } catch (e) {
    console.error('[Store] Write profiles error:', e.message);
  }
}

export function updateProfile(username, data) {
  const profiles = readProfiles();
  const idx = profiles.findIndex(p => p.username === username);
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], ...data, updatedAt: new Date().toISOString() };
  }
  writeProfiles(profiles);
  return profiles[idx] || null;
}

export function getProfileByUsername(username) {
  const profiles = readProfiles();
  return profiles.find(p => p.username === username) || null;
}

// ── Scrape State (for resume) ──

export function readScrapeState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[Store] Read state error:', e.message);
  }
  return null;
}

export function writeScrapeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[Store] Write state error:', e.message);
  }
}

export function clearScrapeState() {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch (e) {}
}
