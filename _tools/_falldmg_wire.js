// 接线: index.html 加载 60_falldmg.js
const fs = require('fs');
const P = 'index.html';
let h = fs.readFileSync(P, 'utf8');
const E = h.includes('\r\n') ? '\r\n' : '\n';
const anchor = '<script src="js/59_screenfx.js?v=20261030c"></script>';
const add = anchor + E + '<script src="js/60_falldmg.js?v=20261030c"></script>';
const n = h.split(anchor).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, h.split(anchor).join(add), 'utf8');
console.log('✅ index.html 已加载 60_falldmg.js');
