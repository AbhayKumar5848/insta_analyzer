// GET /api/profiles — Paginated, filtered, sorted profile list
import { readProfiles } from '@/lib/store';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const sort = searchParams.get('sort') || 'followersCount';
  const order = searchParams.get('order') || 'desc';
  const search = searchParams.get('search') || '';
  const scraped = searchParams.get('scraped') || '';
  const isPrivate = searchParams.get('isPrivate') || '';
  const isVerified = searchParams.get('isVerified') || '';
  const followersMin = searchParams.get('followersMin');
  const followersMax = searchParams.get('followersMax');
  const followingMin = searchParams.get('followingMin');
  const followingMax = searchParams.get('followingMax');

  let profiles = readProfiles();

  // Filters
  if (search) {
    const s = search.toLowerCase();
    profiles = profiles.filter(p =>
      p.username.includes(s) || (p.fullName && p.fullName.toLowerCase().includes(s))
    );
  }
  if (scraped === 'true') profiles = profiles.filter(p => p.lastScrapedAt !== null);
  if (scraped === 'false') profiles = profiles.filter(p => p.lastScrapedAt === null);
  if (isPrivate === 'true') profiles = profiles.filter(p => p.isPrivate);
  if (isPrivate === 'false') profiles = profiles.filter(p => !p.isPrivate);
  if (isVerified === 'true') profiles = profiles.filter(p => p.isVerified);
  if (isVerified === 'false') profiles = profiles.filter(p => !p.isVerified);
  if (followersMin) profiles = profiles.filter(p => p.followersCount >= parseInt(followersMin));
  if (followersMax) profiles = profiles.filter(p => p.followersCount <= parseInt(followersMax));
  if (followingMin) profiles = profiles.filter(p => p.followingCount >= parseInt(followingMin));
  if (followingMax) profiles = profiles.filter(p => p.followingCount <= parseInt(followingMax));

  // Sort
  profiles.sort((a, b) => {
    let av = a[sort], bv = b[sort];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return order === 'asc' ? -1 : 1;
    if (av > bv) return order === 'asc' ? 1 : -1;
    return 0;
  });

  const total = profiles.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const paged = profiles.slice(start, start + limit);

  // Stats
  const all = readProfiles();
  const stats = {
    totalProfiles: all.length,
    scraped: all.filter(p => p.lastScrapedAt !== null).length,
    unscraped: all.filter(p => p.lastScrapedAt === null).length,
    verified: all.filter(p => p.isVerified).length,
    privateCount: all.filter(p => p.isPrivate).length,
  };

  return Response.json({ profiles: paged, total, page, pages, stats });
}

// DELETE /api/profiles — Delete all profiles
export async function DELETE(request) {
  const { writeProfiles } = await import('@/lib/store');
  writeProfiles([]);
  return Response.json({ success: true });
}
