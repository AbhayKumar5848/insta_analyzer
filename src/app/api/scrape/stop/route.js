// POST /api/scrape/stop — Stop scraping
import { stopScraping } from '@/lib/scraper';

export async function POST() {
  stopScraping('Manually stopped by user');
  return Response.json({ message: 'Scraping stopped' });
}
