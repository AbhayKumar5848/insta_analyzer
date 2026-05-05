// POST /api/scrape/start — Start scraping unscraped profiles
import { readProfiles } from '@/lib/store';
import { startScraping, getProgress } from '@/lib/scraper';

export async function POST(request) {
  const progress = getProgress();
  if (progress.active) {
    return Response.json({ error: 'Scraping already in progress', progress }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const force = body.force || false;
  const disableWaves = body.disableWaves || false;
  const batchSize = parseInt(body.batchSize) || 0; // 0 = use default

  const profiles = readProfiles();
  
  // Get usernames that haven't been scraped yet (or all if forced)
  // Always skip accounts already marked as deactivated and __deleted__ usernames
  const toScrape = profiles
    .filter(p => {
      if (p.status === 'deactivated') return false;
      if (p.username.startsWith('__deleted__')) return false;
      return force || !p.lastScrapedAt;
    })
    .map(p => p.username);

  if (toScrape.length === 0) {
    return Response.json({ message: 'No profiles to scrape', total: 0 });
  }

  const options = {};
  if (disableWaves) options.disableWaves = true;
  if (batchSize > 0) options.batchSize = batchSize;

  const result = startScraping(toScrape, options);
  
  if (result.error) {
    return Response.json({ error: result.error }, { status: 409 });
  }

  return Response.json({
    message: 'Scraping started',
    total: result.total,
    waves: result.waves,
  });
}
