// 背包改名 + 容量调整 (2026-09-19)
const fs = require('fs');
const path = require('path');
const P = path.resolve(__dirname, '..', 'js', '38_tarkov.js');
const raw = fs.readFileSync(P, 'utf8');
const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const L = (...a) => a.join(eol) + eol;
let s = raw;

const J = [
  // ① 背包定义: 真实型号名 + 容量 16/20/30/40
  [(L) => L('const PACK_DEFS={',
    'packSmall:{name:"轻便挎包",size:5,weight:0.9,price:420,tier:1,slots:10,desc:"容量 10 格"},',
    'packAssault:{name:"突击背包",size:6,weight:2.0,price:1250,tier:2,slots:16,desc:"容量 16 格"},',
    'packRaid:{name:"远征背囊",size:7,weight:3.2,price:2600,tier:4,slots:24,desc:"容量 24 格"}',
    '};'),
    (L) => L('const PACK_DEFS={',
      '// 2026-09-19: 改用真实型号名, 容量按需求重排为 16 / 20 / 30 / 40',
      '// ⚠️ 键名保持不变 —— 老存档的 META.loadout.pack / owned 里存的是这些 key',
      'packSmall:{name:"Flyye MBSS 背包",size:5,weight:1.2,price:620,tier:1,slots:16,desc:"通用迷彩 · 容量 16 格"},',
      'packAssault:{name:"LBT-8005A Day Pack 背包",size:6,weight:2.2,price:1500,tier:2,slots:20,desc:"黑系复合迷彩 · 容量 20 格"},',
      'packRaid:{name:"Gruppa 99 T30 背包",size:8,weight:3.6,price:3400,tier:3,slots:30,desc:"复合迷彩 · 容量 30 格"},',
      'packTT45:{name:"Tasmanian Tiger Modular Pack 45 Plus 模块化背包",size:9,weight:4.8,price:6200,tier:5,slots:40,desc:"黑色 · 容量 40 格"}',
      '};')],
  // ② 商店目录加第四只包
  ["'packSmall','packAssault','packRaid',", "'packSmall','packAssault','packRaid','packTT45',"],
  // ③ 兜底名同步
  ["sum.innerHTML=`背包: ${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].name:'轻便挎包'} (${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].slots:10}格)",
   "sum.innerHTML=`背包: ${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].name:'Flyye MBSS 背包'} (${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].slots:16}格)"],
];

let bad = 0;
for (const [f] of J) {
  const t = typeof f === 'function' ? f(L) : f;
  const n = s.split(t).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ' ' + n + '  ' + t.split(eol)[0].slice(0, 52));
  if (n !== 1) bad++;
}
if (bad) { console.log('未命中，未写入'); process.exit(1); }
for (const [f, t] of J) {
  const ff = typeof f === 'function' ? f(L) : f;
  const tt = typeof t === 'function' ? t(L) : t;
  s = s.split(ff).join(tt);
}
fs.writeFileSync(P, s, 'utf8');
console.log('✅ 38_tarkov.js 背包已更新');
