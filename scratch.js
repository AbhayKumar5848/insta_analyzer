const username = 'instagram';
fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
  headers: {
    'x-ig-app-id': '936619743392459',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  }
}).then(res => res.text()).then(console.log).catch(console.error);
