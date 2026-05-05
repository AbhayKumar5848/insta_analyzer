// Reset profiles that were incorrectly scraped when Instagram was blocking
// These show either "Instagram" or "<username> • Instagram photos and videos" as fullName
const fs = require('fs');
const f = 'data/profiles.json';
const d = JSON.parse(fs.readFileSync(f, 'utf-8'));

let reset = 0;

d.forEach(p => {
  if (!p.lastScrapedAt) return; // already unscraped, skip

  const name = (p.fullName || '').trim();
  const isBad =
    // Got Instagram's own homepage title
    name.toLowerCase() === 'instagram' ||
    // Got a login wall: "username • Instagram photos and videos"
    /instagram photos and videos/i.test(name) ||
    // Got a login wall with just the username as the name
    (name.toLowerCase() === p.username.toLowerCase());

  if (isBad) {
    console.log(`  Resetting @${p.username} (fullName was: "${name}")`);
    p.fullName = '';
    p.profilePic = '';
    p.followersCount = -1;
    p.followingCount = -1;
    p.postsCount = -1;
    p.isPrivate = false;
    p.isVerified = false;
    p.lastScrapedAt = null;
    delete p.status;
    delete p.deactivatedReason;
    reset++;
  }
});

fs.writeFileSync(f, JSON.stringify(d, null, 2));
console.log(`\nDone! Reset ${reset} corrupted profiles back to unscraped.`);
