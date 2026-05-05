// POST /api/scrape/resume — Resume scraping from where it stopped
import { resumeScraping } from '@/lib/scraper';

export async function POST() {
  const result = resumeScraping();

  if (result.error) {
    return Response.json({ error: result.error }, { status: 409 });
  }

  return Response.json({
    message: 'Scraping resumed',
    remaining: result.remaining,
  });
}
