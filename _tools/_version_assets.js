// 给 index.html 里所有 js/*.js 的 script src 加上 (或更新) ?v=<版本> 查询串。
// 目的: http.server 不带 Cache-Control, 浏览器会启发式缓存旧 js, 改了代码看不到。
// 可重复运行: 已带 ?v= 的会被替换成新版本, 不会重复叠加。
const fs = require('fs');
const V = process.argv[2] || '20260913b';
const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');
let n = 0;
html = html.replace(/(<script\s+src=")(js\/[^"?]+)(\?v=[^"]*)?(")/g, (m, a, src, old, d) => { n++; return a + src + '?v=' + V + d; });
fs.writeFileSync(file, html, 'utf8');
const total = (html.match(/<script\s+src="js\//g) || []).length;
const versioned = (html.match(/\?v=/g) || []).length;
fs.writeFileSync('_tools/_version.txt', '改写的 script 标签数: ' + n + '\n总 script 标签数: ' + total + '\n带 ?v= 的引用数(含 css): ' + versioned + '\n版本号: ' + V + '\n', 'utf8');
