// 38_tarkov.js 的物品函数覆盖层: 接入头盔 (2026-09-19)
// ⚠️ 38_tarkov 会重定义 itemName/itemKind/itemDesc/itemSellPrice/itemSizeOf/itemWeightOf/itemIconOf,
//    覆盖 37_meta 的版本 —— 所以头盔必须在这两个地方都接。
const fs = require('fs');
const path = require('path');
const P = path.resolve(__dirname, '..', 'js', '38_tarkov.js');
const raw = fs.readFileSync(P, 'utf8');
const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const L = (...a) => a.join(eol) + eol;
let s = raw;

const J = [
  // 尺寸
  ['if(ARMOR_DEFS[key]) return 4;',
   'if(ARMOR_DEFS[key]) return 4;\nif(HELMET_DEFS[key]) return 3;'],
  // 重量
  ['if(ARMOR_DEFS[key]) return ARMOR_DEFS[key].weight||3;',
   'if(ARMOR_DEFS[key]) return ARMOR_DEFS[key].weight||3;\nif(HELMET_DEFS[key]) return HELMET_DEFS[key].weight||2;'],
  // 售价
  ['if(WPN_DEFS[key]||ARMOR_DEFS[key]) return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45));',
   'if(WPN_DEFS[key]||ARMOR_DEFS[key]||HELMET_DEFS[key]) return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45));'],
  // 描述
  [(L) => L('if(ARMOR_DEFS[key]){ const a=ARMOR_DEFS[key]; return `Lv${a.level} · +${a.hp} HP · 减伤 ${Math.round(a.resist*100)}% · 重量 ${a.weight}`; }'),
   (L) => L('if(HELMET_DEFS[key]){ const h=HELMET_DEFS[key]; return `头盔 Lv${h.level} · 护头耐久 ${h.hp} · 减伤 ${Math.round(h.resist*100)}% · 重量 ${h.weight}`; }',
     'if(ARMOR_DEFS[key]){ const a=ARMOR_DEFS[key]; return `护甲 Lv${a.level} · 胸腹耐久 ${a.hp} · 减伤 ${Math.round(a.resist*100)}% · 重量 ${a.weight}`; }')],
  // 名称
  ['if(WPN_DEFS[key]) return WPN_DEFS[key].name;\nif(ARMOR_DEFS[key]) return ARMOR_DEFS[key].name;',
   'if(WPN_DEFS[key]) return WPN_DEFS[key].name;\nif(ARMOR_DEFS[key]) return ARMOR_DEFS[key].name;\nif(HELMET_DEFS[key]) return HELMET_DEFS[key].name;'],
  // 分类
  ["if(ARMOR_DEFS[key]) return 'armor';",
   "if(ARMOR_DEFS[key]) return 'armor';\nif(HELMET_DEFS[key]) return 'helmet';"],
  // 图标
  ["if(k==='armor') return '🛡';",
   "if(k==='armor') return '🛡';\nif(k==='helmet') return '🪖';"],
];

let bad = 0;
for (const [f] of J) {
  const t = typeof f === 'function' ? f(L) : f;
  const n = s.split(t).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ' ' + n + '  ' + t.split(eol)[0].slice(0, 50));
  if (n !== 1) bad++;
}
if (bad) { console.log('未命中，未写入'); process.exit(1); }
for (const [f, t] of J) {
  const ff = typeof f === 'function' ? f(L) : f;
  const tt = typeof t === 'function' ? t(L) : t;
  s = s.split(ff).join(tt);
}
fs.writeFileSync(P, s, 'utf8');
console.log('✅ 38_tarkov.js 物品函数已接入头盔');
