// Temporary proxy to capture what opencode sends to gmn.chuangzuoli.com
const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    console.log('\n===== CAPTURED REQUEST =====');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    if (body) {
      try {
        const parsed = JSON.parse(body);
        console.log('Body:', JSON.stringify(parsed, null, 2));
      } catch {
        console.log('Body (raw):', body.substring(0, 2000));
      }
    }
    console.log('===========================\n');

    // Forward to real server
    const options = {
      hostname: 'gmn.chuangzuoli.com',
      port: 443,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: 'gmn.chuangzuoli.com',
      },
    };
    delete options.headers['host'];
    options.headers['host'] = 'gmn.chuangzuoli.com';

    const proxyReq = https.request(options, proxyRes => {
      console.log('=== RESPONSE STATUS:', proxyRes.statusCode, '===');
      let respBody = '';
      proxyRes.on('data', chunk => respBody += chunk);
      proxyRes.on('end', () => {
        console.log('Response body:', respBody.substring(0, 500));
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(respBody);
      });
    });
    proxyReq.on('error', err => {
      console.error('Proxy error:', err.message);
      res.writeHead(502);
      res.end('Proxy error: ' + err.message);
    });
    if (body) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(18901, () => {
  console.log('Capture proxy running on http://localhost:18901');
  console.log('Modify opencode.json baseURL to http://localhost:18901');
});
