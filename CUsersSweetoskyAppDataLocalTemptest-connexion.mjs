import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 4321,
  path: '/connexion',
  method: 'GET',
  timeout: 10000
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    // Extract script tag and surrounding context
    const scriptMatches = data.match(/<script[^>]*>[^<]{0,200}/g) || [];
    console.log('=== SCRIPT TAGS ===');
    scriptMatches.forEach((m, i) => console.log(i, ':', m));
    console.log('=== CSP ===');
    const csp = res.headers['content-security-policy'];
    if (csp) console.log(csp);
    else console.log('No CSP header');
  });
});
req.on('error', e => console.log('ERR:', e.message));
req.end();
