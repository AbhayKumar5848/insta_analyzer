// POST /api/upload — Parse Instagram JSON/ZIP export
import { readProfiles, writeProfiles } from '@/lib/store';
import AdmZip from 'adm-zip';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name.toLowerCase();
    let usernames = [];

    if (filename.endsWith('.zip')) {
      usernames = parseZipFile(buffer);
    } else if (filename.endsWith('.json')) {
      const content = buffer.toString('utf-8');
      usernames = extractUsernamesFromJson(content);
    } else {
      return Response.json({ error: 'Only JSON and ZIP files are supported' }, { status: 400 });
    }

    if (usernames.length === 0) {
      return Response.json({ error: 'No usernames found in the uploaded file' }, { status: 400 });
    }

    // Deduplicate
    const uniqueUsernames = [...new Set(usernames)];

    // Merge with existing profiles
    const existing = readProfiles();
    const existingSet = new Set(existing.map(p => p.username));
    let added = 0;

    for (const username of uniqueUsernames) {
      if (!existingSet.has(username)) {
        existing.push({
          username,
          fullName: '',
          profilePic: '',
          followersCount: -1,
          followingCount: -1,
          postsCount: -1,
          isPrivate: false,
          isVerified: false,
          profileUrl: `https://www.instagram.com/${username}/`,
          lastScrapedAt: null,
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        added++;
      }
    }

    writeProfiles(existing);

    return Response.json({
      success: true,
      parsed: uniqueUsernames.length,
      added,
      alreadyExisted: uniqueUsernames.length - added,
      totalProfiles: existing.length,
    });

  } catch (err) {
    console.error('[Upload] Error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function parseZipFile(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const allUsernames = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.toLowerCase();
    if (!name.endsWith('.json')) continue;

    try {
      const content = entry.getData().toString('utf-8');
      const usernames = extractUsernamesFromJson(content);
      allUsernames.push(...usernames);
    } catch (e) {
      console.log('[Upload] Skipping ZIP entry:', entry.entryName, e.message);
    }
  }

  return allUsernames;
}

function extractUsernamesFromJson(content) {
  const data = JSON.parse(content);
  const usernames = [];

  // Handle array format
  if (Array.isArray(data)) {
    for (const item of data) {
      // Instagram format: { string_list_data: [{ value: "username" }] }
      if (item.string_list_data && Array.isArray(item.string_list_data)) {
        for (const entry of item.string_list_data) {
          if (entry.value) {
            usernames.push(normalize(entry.value));
          } else if (entry.href) {
            const match = entry.href.match(/instagram\.com\/_u\/([^/?]+)/);
            if (match) usernames.push(normalize(match[1]));
          }
        }
      }
      // Fallback: title field (following format)
      if (item.title && !item.string_list_data?.some(e => e.value)) {
        usernames.push(normalize(item.title));
      }
      // Simple string array
      if (typeof item === 'string') {
        usernames.push(normalize(item));
      }
      // Object with username field
      if (item.username && typeof item.username === 'string') {
        usernames.push(normalize(item.username));
      }
    }
  }

  // Handle object format: { relationships_following: [...] }
  if (!Array.isArray(data) && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        const nested = extractUsernamesFromJson(JSON.stringify(data[key]));
        usernames.push(...nested);
      }
    }
  }

  return usernames.filter(u => u.length > 0);
}

function normalize(username) {
  return username.toLowerCase().trim().replace(/^@/, '');
}
