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

  const profiles = readProfiles();
  
  // Get usernames that haven't been scraped yet (or all if forced)
  const toScrape = profiles
    .filter(p => force || !p.lastScrapedAt)
    .map(p => p.username);

  if (toScrape.length === 0) {
    return Response.json({ message: 'No profiles to scrape', total: 0 });
  }

  const result = startScraping(toScrape);
  
  if (result.error) {
    return Response.json({ error: result.error }, { status: 409 });
  }

  return Response.json({
    message: 'Scraping started',
    total: result.total,
    waves: result.waves,
  });
}
