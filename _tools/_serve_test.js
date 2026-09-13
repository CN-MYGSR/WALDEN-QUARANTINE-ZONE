// 验证 _tools/serve_nocache.py: 启动它, 抓响应头, 确认 js/css/html 都带 no-store。
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PY = 'C:/Users/Administrator/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const PORT = 8124;
const out = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function head(p) {
  return new Promise(res => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      r.resume();
      res({ status: r.statusCode, cc: r.headers['cache-control'] || '(none)', pragma: r.headers['pragma'] || '(none)', len: r.headers['content-length'] });
    }).on('error', e => res({ status: 'ERR ' + e.message, cc: '', pragma: '', len: 0 }));
  });
}

(async () => {
  const proc = spawn(PY, [path.join('_tools', 'serve_nocache.py'), String(PORT)], { stdio: 'ignore' });
  await sleep(2500);
  for (const p of ['/', '/index.html', '/js/43_maps.js?v=20260913b', '/css/style.css?v=20260913b']) {
    const h = await head(p);
    out.push(p.padEnd(34) + ' status=' + h.status + '  len=' + h.len + '  Cache-Control=' + h.cc + '  Pragma=' + h.pragma);
    const ok = h.status === 200 && /no-store/.test(h.cc);
    out.push('   ' + (ok ? 'PASS' : 'CHECK'));
  }
  try { proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join('_tools', '_serve_test.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})();
