// 仓库列出头盔/耳机/背包 + 修 equip 槽位映射 (2026-09-19)
const fs = require('fs');
const path = require('path');
const R = f => path.resolve(__dirname, '..', f);
let ok = true;

function rep(rel, jobs, label) {
  const raw = fs.readFileSync(R(rel), 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const L = (...a) => a.join(eol) + eol;
  let bad = 0;
  for (const [from] of jobs) {
    const t = typeof from === 'function' ? from(L) : from;
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 56).replace(/\r?\n/g, '⏎')); bad++; }
  }
  if (bad) { console.log('❌ ' + label + ' 未命中'); ok = false; return; }
  let out = raw;
  for (const [from, to] of jobs) {
    const f = typeof from === 'function' ? from(L) : from;
    const t = typeof to === 'function' ? to(L) : to;
    out = out.split(f).join(t);
  }
  fs.writeFileSync(R(rel), out, 'utf8');
  console.log('✅ ' + label);
}

// ---------- 37_meta.js ----------
rep('js/37_meta.js', [
  // ① 仓库列出全部装备 (原来只有武器 + 护甲, 头盔/耳机/背包都不显示)
  [(L) => L(" } else if(tab==='warehouse'){",
    '  for(const k of ownedWeaponList().concat(ownedArmorList())) addRow(k,`<div class="arOwned">库存 ${ownedCount(k)}</div>`);'),
    (L) => L(" } else if(tab==='warehouse'){",
      '  // 2026-09-19: 原来只列 武器 + 护甲, 头盔/耳机/背包买了也看不见',
      '  for(const k of ownedWeaponList().concat(ownedArmorList()).concat(ownedHelmetList()).concat(ownedHeadsetList()).concat(ownedPackList()))',
      '   addRow(k,`<div class="arOwned">库存 ${ownedCount(k)}</div>`);')],
  // ② 装备按钮的槽位映射: 原来非护甲一律当主武器 (会把头盔装成主武器)
  [(L) => L(' else if(action===\'equip\'){',
    '  const kind=itemKind(key);',
    "  setLoadout(kind==='armor'?'armor':(key==='m1911'?'primary':'primary'),key);",
    "  renderArmory('warehouse');",
    ' }'),
    (L) => L(' else if(action===\'equip\'){',
      '  const kind=itemKind(key);',
      "  // ⚠️ 原来写死 kind==='armor'?'armor':'primary' —— 头盔/耳机/背包会被装成主武器",
      "  const slot=(kind==='armor')?'armor'",
      "   :(kind==='helmet')?'helmet'",
      "   :(kind==='headset')?'headset'",
      "   :(kind==='pack')?'pack'",
      "   :'primary';",
      '  setLoadout(slot,key);',
      "  renderArmory('warehouse');",
      ' }')],
], '37_meta.js 仓库列出全部装备');

// ---------- 38_tarkov.js: ownedPackList (PACK_DEFS 在这里) ----------
rep('js/38_tarkov.js', [
  [(L) => L('packTT45:{name:"Tasmanian Tiger Modular Pack 45 Plus 模块化背包",size:9,weight:4.8,price:6200,tier:5,slots:40,desc:"黑色 · 容量 40 格"}',
    '};'),
    (L) => L('packTT45:{name:"Tasmanian Tiger Modular Pack 45 Plus 模块化背包",size:9,weight:4.8,price:6200,tier:5,slots:40,desc:"黑色 · 容量 40 格"}',
      '};',
      '// 仓库列背包用 (PACK_DEFS 定义在本文件, 所以列表函数也放这里)',
      'function ownedPackList(){ return Object.keys(META.owned).filter(k=>PACK_DEFS[k]&&META.owned[k]>0); }')],
], '38_tarkov.js ownedPackList');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
