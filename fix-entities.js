// One-time script to decode HTML entities in existing profile fullNames
const fs = require('fs');
const f = 'data/profiles.json';
const d = JSON.parse(fs.readFileSync(f, 'utf-8'));

function decode(s) {
  if (!s) return '';
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

let fixed = 0;
d.forEach(p => {
  const orig = p.fullName;
  const decoded = decode(p.fullName);
  if (orig !== decoded) {
    console.log(`  ${p.username}: "${orig}" -> "${decoded}"`);
    p.fullName = decoded;
    fixed++;
  }
});

fs.writeFileSync(f, JSON.stringify(d, null, 2));
console.log(`\nDone! Fixed ${fixed} profiles with HTML entities.`);
