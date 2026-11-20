// 更新翻越探针: 二楼窗台现在可以翻出；三层不行；落点更高不行
const fs = require('fs');
const P = '_tools/_vault_probe.js';
let s = fs.readFileSync(P, 'utf8');
const E = s.includes('\r\n') ? '\r\n' : '\n';

const old = [
'// ---------- 场景 8: 从二楼窗台往外翻 (外侧地面低 3m) → 不能翻 ----------',
'{',
'  const boxes = [B(0, 3.475, 0, 0.30, 0.95, 1.4), B(0, 5.575, 0, 0.30, 0.45, 1.4)];',
'  const p = P(-1.2, 3, 0);',
'  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 0 : 3) });',
"  t('二楼往外翻(落差 3m): 不能翻', a.vaultFind() === null);",
'}'
].join(E);

const neu = [
'// ---------- 场景 8: 二楼窗台往外翻 (楼层 3.05m) → 现在可以翻 ----------',
'{',
'  const boxes = [B(0, 3.525, 0, 0.30, 0.95, 1.4), B(0, 5.625, 0, 0.30, 0.45, 1.4)];',
'  const p = P(-1.2, 3.05, 0);',
'  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 0 : 3.05) });',
'  const f = a.vaultFind();',
"  t('二楼窗台往外翻(落差 3.05m): 能翻', !!f, f && f.to.y);",
"  t('二楼往外翻: 落点在地面 (y=0)', !!f && Math.abs(f.to.y) < 0.01, f && f.to.y);",
'}',
'',
'// ---------- 场景 8b: 三楼窗台 (落差 6.1m) → 太深, 不能翻 ----------',
'{',
'  const boxes = [B(0, 6.575, 0, 0.30, 0.95, 1.4), B(0, 8.675, 0, 0.30, 0.45, 1.4)];',
'  const p = P(-1.2, 6.1, 0);',
'  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 0 : 6.1) });',
"  t('三楼窗台往外翻(落差 6.1m): 不能翻 (超过 maxDrop 4.6)', a.vaultFind() === null);",
'}',
'',
'// ---------- 场景 8c: 落点比脚下高 1.5m → 不能翻 (只能往下/平) ----------',
'{',
'  const boxes = [B(0, 0.475, 0, 0.30, 0.95, 1.4)];',
'  const p = P(-1.2, 0, 0);',
'  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 1.5 : 0) });',
"  t('落点高 1.5m: 不能翻', a.vaultFind() === null);",
'}',
'',
'// ---------- 场景 8d: 落点高 0.5m (矮台阶) → 仍能翻 ----------',
'{',
'  const boxes = [B(0, 0.475, 0, 0.30, 0.95, 1.4)];',
'  const p = P(-1.2, 0, 0);',
'  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 0.5 : 0) });',
"  t('落点高 0.5m: 能翻 (允许向上 0.8m)', a.vaultFind() !== null);",
'}'
].join(E);

const n = s.split(old).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, s.split(old).join(neu), 'utf8');
console.log('✅ 翻越探针已更新 (二楼可翻 / 三楼不可 / 落点高低)');
