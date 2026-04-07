// GET /api/export — Export filtered profiles as CSV
import { readProfiles } from '@/lib/store';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const scraped = searchParams.get('scraped') || '';
  const followersMin = searchParams.get('followersMin');
  const followersMax = searchParams.get('followersMax');

  let profiles = readProfiles();

  // Apply filters
  if (search) {
    const s = search.toLowerCase();
    profiles = profiles.filter(p =>
      p.username.includes(s) || (p.fullName && p.fullName.toLowerCase().includes(s))
    );
  }
  if (scraped === 'true') profiles = profiles.filter(p => p.lastScrapedAt !== null);
  if (scraped === 'false') profiles = profiles.filter(p => p.lastScrapedAt === null);
  if (followersMin) profiles = profiles.filter(p => p.followersCount >= parseInt(followersMin));
  if (followersMax) profiles = profiles.filter(p => p.followersCount <= parseInt(followersMax));

  // Sort by followers descending
  profiles.sort((a, b) => b.followersCount - a.followersCount);

  // Build CSV
  const headers = ['username', 'fullName', 'followersCount', 'followingCount', 'postsCount', 'isPrivate', 'isVerified', 'profileUrl'];
  const rows = [headers.join(',')];

  for (const p of profiles) {
    const row = headers.map(h => {
      let val = p[h] ?? '';
      if (typeof val === 'string') val = '"' + val.replace(/"/g, '""') + '"';
      return val;
    });
    rows.push(row.join(','));
  }

  return new Response(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=instagram_profiles.csv',
    },
  });
}
