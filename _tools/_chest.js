// 胸挂系统 (2026-09-19)
// 需求: 换皮背包, 可与背包共存; 但胸挂只能装「占用格数 <= 2」的物品,
//       哪怕胸挂总容量比这些小物品的总和大得多。
// 模型: 把已用格数拆成两个池
//   big   = 尺寸 > 2 的物品 —— 只能进背包
//   small = 尺寸 <= 2 的物品 —— 背包或胸挂都行
// 约束: big <= 背包格数  且  big + small <= 背包格数 + 胸挂格数
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

// ================= 38_tarkov.js =================
rep('js/38_tarkov.js', [
  // ① CHEST_DEFS + ownedChestList
  [(L) => L('// 仓库列背包用 (PACK_DEFS 定义在本文件, 所以列表函数也放这里)',
    'function ownedPackList(){ return Object.keys(META.owned).filter(k=>PACK_DEFS[k]&&META.owned[k]>0); }'),
    (L) => L('// 仓库列背包用 (PACK_DEFS 定义在本文件, 所以列表函数也放这里)',
      'function ownedPackList(){ return Object.keys(META.owned).filter(k=>PACK_DEFS[k]&&META.owned[k]>0); }',
      '',
      '// ---------- 胸挂 (2026-09-19) ----------',
      '// 与背包共存, 容量相加; 但**只收尺寸 <= CHEST_MAX_SIZE 的物品**。',
      '// 用途: 容量大但塞不进大件 —— 想让玩家为"带大件还是带一堆小件"做取舍。',
      'const CHEST_MAX_SIZE=2;',
      'const CHEST_DEFS={',
      'chest56:{name:"56式胸挂",color:"",size:3,weight:0.8,price:900,tier:1,slots:10,desc:"容量 10 格 · 仅收 ≤2 格物品"},',
      'chestBH:{name:"Blackhawk! Commando 胸挂",color:"游骑兵黄",size:3,weight:1.1,price:2200,tier:2,slots:16,desc:"容量 16 格 · 仅收 ≤2 格物品"},',
      'chestMK3:{name:"WARTECH MK3 TV-104 胸挂",color:"黑",size:4,weight:1.6,price:4200,tier:4,slots:25,desc:"容量 25 格 · 仅收 ≤2 格物品"}',
      '};',
      'function ownedChestList(){ return Object.keys(META.owned).filter(k=>CHEST_DEFS[k]&&META.owned[k]>0); }')],
  // ② 容量模型
  [(L) => L('function bagPackKey(){',
    'const L=raidLoadout();',
    'return (L&&L.pack)||"packSmall";',
    '}',
    'function bagCapacity(){',
    'const d=PACK_DEFS[bagPackKey()];',
    'return (d&&d.slots)||10;',
    '}',
    'function bagUsed(){',
    'let n=0;',
    'for(const k in RUN.loot) n+=itemSizeOf(k)*RUN.loot[k];',
    'return n;',
    '}',
    'function bagFree(){ return Math.max(0,bagCapacity()-bagUsed()); }'),
    (L) => L('function bagPackKey(){',
      'const L=raidLoadout();',
      'return (L&&L.pack)||"packSmall";',
      '}',
      'function bagChestKey(){',
      'const L=raidLoadout();',
      'return (L&&L.chest)||"";',
      '}',
      'function bagPackSlots(){ const d=PACK_DEFS[bagPackKey()]; return (d&&d.slots)||10; }',
      'function bagChestSlots(){ const d=CHEST_DEFS[bagChestKey()]; return (d&&d.slots)||0; }',
      '// 背包 + 胸挂 的总格数',
      'function bagCapacity(){ return bagPackSlots()+bagChestSlots(); }',
      '// 大件只能进背包, 小件两处都行 —— 分开统计才能表达胸挂的限制',
      'function bagUsedBig(){ let n=0; for(const k in RUN.loot){ const s=itemSizeOf(k); if(s>CHEST_MAX_SIZE) n+=s*RUN.loot[k]; } return n; }',
      'function bagUsedSmall(){ let n=0; for(const k in RUN.loot){ const s=itemSizeOf(k); if(s<=CHEST_MAX_SIZE) n+=s*RUN.loot[k]; } return n; }',
      'function bagUsed(){ return bagUsedBig()+bagUsedSmall(); }',
      'function bagFree(){ return Math.max(0,bagCapacity()-bagUsed()); }')],
  // ③ canCarry 加胸挂约束
  [(L) => L('function canCarry(key,n){',
    'return itemSizeOf(key)*(n||1)<=bagFree();',
    '}'),
    (L) => L('function canCarry(key,n){',
      'const s=itemSizeOf(key)*(n||1);',
      'const big=bagUsedBig(), small=bagUsedSmall();',
      '// 大件: 只能占背包的格数',
      'if(itemSizeOf(key)>CHEST_MAX_SIZE) return (big+s)<=bagPackSlots();',
      '// 小件: 背包 + 胸挂 合计',
      'return (big+small+s)<=(bagPackSlots()+bagChestSlots());',
      '}')],
  // ④ 装满提示区分原因
  [(L) => L('function addLootToBag(key,n){',
    'n=n||1;',
    'if(!canCarry(key,n)){ showScorePop("背包已满"); return false; }'),
    (L) => L('function addLootToBag(key,n){',
      'n=n||1;',
      'if(!canCarry(key,n)){',
      ' const s=itemSizeOf(key)*(n||1);',
      ' // 区分"总容量不够"和"胸挂不收大件" —— 后者玩家很难自己想到',
      ' if(itemSizeOf(key)>CHEST_MAX_SIZE && (bagUsedBig()+s)>bagPackSlots() && bagPackSlots()+bagChestSlots()>=bagUsed()+s)',
      '  showScorePop("胸挂只收 ≤2 格物品 · 大件只能放背包");',
      ' else showScorePop("背包已满");',
      ' return false;',
      '}')],
  // ⑤ 物品函数
  ['if(HEADSET_DEFS[key]) return 2;', 'if(HEADSET_DEFS[key]) return 2;\nif(CHEST_DEFS[key]) return CHEST_DEFS[key].size||3;'],
  ['if(HEADSET_DEFS[key]) return HEADSET_DEFS[key].weight||0.4;', 'if(HEADSET_DEFS[key]) return HEADSET_DEFS[key].weight||0.4;\nif(CHEST_DEFS[key]) return CHEST_DEFS[key].weight||1;'],
  ['if(PACK_DEFS[key]) return PACK_DEFS[key].price;', 'if(PACK_DEFS[key]) return PACK_DEFS[key].price;\nif(CHEST_DEFS[key]) return CHEST_DEFS[key].price;'],
  ['if(PACK_DEFS[key]) return PACK_DEFS[key].desc+" · 重 "+PACK_DEFS[key].weight+"kg";',
   'if(PACK_DEFS[key]) return PACK_DEFS[key].desc+" · 重 "+PACK_DEFS[key].weight+"kg";\nif(CHEST_DEFS[key]) return CHEST_DEFS[key].desc+" · 重 "+CHEST_DEFS[key].weight+"kg";'],
  [(L) => L('if(MISC_DEFS[key]) return MISC_DEFS[key].name;',
    'if(PACK_DEFS[key]) return PACK_DEFS[key].name;',
    "return '未知物品';"),
   (L) => L('if(MISC_DEFS[key]) return MISC_DEFS[key].name;',
     'if(PACK_DEFS[key]) return PACK_DEFS[key].name;',
     "if(CHEST_DEFS[key]) return CHEST_DEFS[key].name+(CHEST_DEFS[key].color?(' '+CHEST_DEFS[key].color):'');",
     "return '未知物品';")],
  ["if(PACK_DEFS[key]) return 'pack';", "if(PACK_DEFS[key]) return 'pack';\nif(CHEST_DEFS[key]) return 'chest';"],
  ["if(k==='pack') return '🎒';", "if(k==='pack') return '🎒';\nif(k==='chest') return '🦺';"],
  ["if(MED_DEFS[key]||FOOD_DEFS[key]||MISC_DEFS[key]||PACK_DEFS[key]) return Math.max(15,Math.floor(itemPriceOf(key)*0.45));",
   "if(MED_DEFS[key]||FOOD_DEFS[key]||MISC_DEFS[key]||PACK_DEFS[key]||CHEST_DEFS[key]) return Math.max(15,Math.floor(itemPriceOf(key)*0.45));"],
  ["'packSmall','packAssault','packRaid','packTT45',", "'packSmall','packAssault','packRaid','packTT45','chest56','chestBH','chestMK3',"],
], '38_tarkov.js 胸挂');

// ================= 37_meta.js =================
rep('js/37_meta.js', [
  ["function metaLoadoutDefault(){ return { primary:'m1911', secondary:'', armor:'armor1', helmet:'helm1', headset:'hs_tep300', pack:'packSmall', meds:['','',''], foods:['',''], nvg:false, pass:false }; }",
   "function metaLoadoutDefault(){ return { primary:'m1911', secondary:'', armor:'armor1', helmet:'helm1', headset:'hs_tep300', pack:'packSmall', chest:'', meds:['','',''], foods:['',''], nvg:false, pass:false }; }"],
  ["if(m.loadout.headset===undefined) m.loadout.headset='hs_tep300';",
   "if(m.loadout.headset===undefined) m.loadout.headset='hs_tep300';\n if(m.loadout.chest===undefined) m.loadout.chest='';   // 胸挂: 老档默认不戴"],
  // 仓库列出胸挂
  ["  for(const k of ownedWeaponList().concat(ownedArmorList()).concat(ownedHelmetList()).concat(ownedHeadsetList()).concat(ownedPackList()))",
   "  for(const k of ownedWeaponList().concat(ownedArmorList()).concat(ownedHelmetList()).concat(ownedHeadsetList()).concat(ownedPackList()).concat(ownedChestList()))"],
  // 装备按钮槽位
  ["   :(kind==='pack')?'pack'",
   "   :(kind==='pack')?'pack'\n   :(kind==='chest')?'chest'"],
  // 配装摘要
  ["  const hs=_hs?(_hs.name+' '+_hs.color):'未装备';",
   "  const hs=_hs?(_hs.name+' '+_hs.color):'未装备';\n  const _ch=(typeof CHEST_DEFS!=='undefined')?CHEST_DEFS[META.loadout.chest]:null;\n  const ch=_ch?(_ch.name+' · '+_ch.slots+'格'):'未装备';"],
  ["   +(_conf?'<div style=\"color:#e0b080;font-size:12px;margin-top:4px\">⚠ 该耳机是耳罩式，和 Altyn 头盔冲突 —— 出击时不会生效，请改用 Peltor TEP-300 战术耳塞</div>':'');",
   "   +` · <b>胸挂:</b> ${ch}`\n   +(_conf?'<div style=\"color:#e0b080;font-size:12px;margin-top:4px\">⚠ 该耳机是耳罩式，和 Altyn 头盔冲突 —— 出击时不会生效，请改用 Peltor TEP-300 战术耳塞</div>':'');"],
  // 胸挂下拉
  [(L) => L("  if(!META.loadout.headset) eSel.value='';",
    "  eSel.onchange=()=>setLoadout('headset',eSel.value);",
    ' }'),
    (L) => L("  if(!META.loadout.headset) eSel.value='';",
      "  eSel.onchange=()=>setLoadout('headset',eSel.value);",
      ' }',
      " const cSel=el('chestSelect');",
      ' if(cSel){',
      "  cSel.innerHTML='';",
      "  const _noChest=document.createElement('option');",
      "  _noChest.value=''; _noChest.textContent='— 不佩戴胸挂 —';",
      '  cSel.appendChild(_noChest);',
      '  for(const k of ownedChestList()){',
      '   const d=CHEST_DEFS[k];',
      "   const o=document.createElement('option');",
      '   o.value=k;',
      "   o.textContent=d.name+' · '+d.slots+' 格（只收 ≤2 格物品）';",
      '   o.selected=k===META.loadout.chest;',
      '   cSel.appendChild(o);',
      '  }',
      "  if(!META.loadout.chest) cSel.value='';",
      "  cSel.onchange=()=>setLoadout('chest',cSel.value);",
      ' }')],
], '37_meta.js 胸挂');

// ================= index.html =================
rep('index.html', [
  ['<div class="secLabel">耳机（仓库 · 影响听力范围与环境音）</div>\n<select id="headsetSelect" style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select>',
   '<div class="secLabel">耳机（仓库 · 影响听力范围与环境音）</div>\n<select id="headsetSelect" style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select>\n<div class="secLabel">胸挂（仓库 · 与背包共存，但只收 2 格以内的物品）</div>\n<select id="chestSelect" style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select>'],
], 'index.html 胸挂下拉');

// ================= 29_menus.js =================
rep('js/29_menus.js', [
  ["if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.helmet=helmetKey; _scavL.headset=headsetKey; _scavL.pack=META.loadout.pack||'packSmall'; }",
   "if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.helmet=helmetKey; _scavL.headset=headsetKey; _scavL.pack=META.loadout.pack||'packSmall'; _scavL.chest=META.loadout.chest||''; }"],
], '29_menus.js SCAV 配装同步');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
