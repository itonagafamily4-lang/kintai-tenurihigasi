const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/leave/annual-grant',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data));
});

req.on('error', (e) => console.error(e));
req.write(JSON.stringify({ action: "preview", targetYear: 2026 }));
req.end();
