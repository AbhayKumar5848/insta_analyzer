// POST /api/profiles/cleanup — Remove profiles with no follower/following data or deactivated
import { readProfiles, writeProfiles } from '@/lib/store';

export async function POST() {
  const profiles = readProfiles();
  const before = profiles.length;

  const cleaned = profiles.filter(p => {
    // Remove deactivated accounts
    if (p.status === 'deactivated') return false;
    // Remove __deleted__ usernames
    if (p.username.startsWith('__deleted__')) return false;
    // Remove profiles that were scraped but have no useful data
    if (p.lastScrapedAt) {
      const hasFollowers = p.followersCount != null && p.followersCount >= 0;
      const hasFollowing = p.followingCount != null && p.followingCount >= 0;
      if (!hasFollowers && !hasFollowing) return false;
    }
    return true;
  });

  const removed = before - cleaned.length;
  writeProfiles(cleaned);

  console.log(`[Cleanup] Removed ${removed} profiles (deactivated / no data). ${cleaned.length} remaining.`);

  return Response.json({
    success: true,
    removed,
    remaining: cleaned.length,
  });
}
