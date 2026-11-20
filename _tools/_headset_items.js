// 耳机系统: 物品定义 + 物品函数两层覆盖 (37_meta / 38_tarkov)
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
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 54).replace(/\r?\n/g, '⏎')); bad++; }
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

// ---------- 37_meta.js: 定义 ----------
rep('js/37_meta.js', [
  [(L) => L('const HELMET_DEFS={',
    " helm1:{name:'SSh-68 钢盔',level:1,hp:15,resist:0.08,weight:1.1,price:380},",
    " helm2:{name:'PSh-97 头盔',level:2,hp:26,resist:0.12,weight:1.7,price:820},",
    " helm3:{name:'6B47 头盔',level:3,hp:40,resist:0.16,weight:2.3,price:1450},",
    " helm4:{name:'FAST MT 头盔',level:4,hp:54,resist:0.20,weight:2.9,price:2500},",
    " helm5:{name:'Team Wendy EXFIL 头盔',level:5,hp:70,resist:0.25,weight:3.5,price:3900},",
    " helm6:{name:'Altyn 防弹头盔 + Maska 1Sch 面罩',level:6,hp:90,resist:0.32,weight:4.8,price:6000}",
    '};'),
    (L) => L('const HELMET_DEFS={',
      " helm1:{name:'SSh-68 钢盔',level:1,hp:15,resist:0.08,weight:1.1,price:380},",
      " helm2:{name:'PSh-97 头盔',level:2,hp:26,resist:0.12,weight:1.7,price:820},",
      " helm3:{name:'6B47 头盔',level:3,hp:40,resist:0.16,weight:2.3,price:1450},",
      " helm4:{name:'FAST MT 头盔',level:4,hp:54,resist:0.20,weight:2.9,price:2500},",
      " helm5:{name:'Team Wendy EXFIL 头盔',level:5,hp:70,resist:0.25,weight:3.5,price:3900},",
      " helm6:{name:'Altyn 防弹头盔 + Maska 1Sch 面罩',level:6,hp:90,resist:0.32,weight:4.8,price:6000}",
      '};',
      '// ===== 耳机 (2026-09-19) =====',
      '// range   = 听力范围(米): 能听到敌人脚步的最大距离 (不戴耳机 = 40m)',
      '// amp     = 脚步 / 开火声放大倍数',
      '// ambient = 环境音(风/雨/鸟/远处机枪)保留比例, 越小越安静',
      '// earMuff = true 表示耳罩式 —— 与 Altyn(helm6) 冲突, 戴不了',
      'const HEADSET_DEFS={',
      " hs_comtac6:{name:'Peltor ComTac VI 耳机',color:'黑色',level:3,range:67,amp:1.45,ambient:0.42,weight:0.6,price:4200,earMuff:true},",
      " hs_razor:{name:\"Walker's Razor 数字耳机\",color:'橄榄绿',level:2,range:59,amp:1.25,ambient:0.58,weight:0.5,price:2400,earMuff:true},",
      " hs_tep300:{name:'Peltor TEP-300 战术耳塞',color:'狼棕色',level:2,range:54,amp:1.15,ambient:0.72,weight:0.2,price:1800,earMuff:false}",
      '};')],
  [(L) => L(" ...Object.keys(HELMET_DEFS).map(k=>({key:k,kind:'helmet'}))"),
    (L) => L(" ...Object.keys(HELMET_DEFS).map(k=>({key:k,kind:'helmet'})),",
      " ...Object.keys(HEADSET_DEFS).map(k=>({key:k,kind:'headset'}))")],
  ["for(const c of ITEM_CATALOG) ITEM_PRICES[c.key]=c.kind==='weapon'?weaponPrice(c.key):(c.kind==='helmet'?HELMET_DEFS[c.key].price:ARMOR_DEFS[c.key].price);",
   "for(const c of ITEM_CATALOG) ITEM_PRICES[c.key]=c.kind==='weapon'?weaponPrice(c.key):(c.kind==='helmet'?HELMET_DEFS[c.key].price:(c.kind==='headset'?HEADSET_DEFS[c.key].price:ARMOR_DEFS[c.key].price));"],
  [(L) => L("function metaLoadoutDefault(){ return { primary:'m1911', secondary:'', armor:'armor1', helmet:'helm1', pack:'packSmall', meds:['','',''], foods:['',''], nvg:false, pass:false }; }"),
    (L) => L("function metaLoadoutDefault(){ return { primary:'m1911', secondary:'', armor:'armor1', helmet:'helm1', headset:'hs_tep300', pack:'packSmall', meds:['','',''], foods:['',''], nvg:false, pass:false }; }")],
  ['owned:{m1911:1,armor1:1,helm1:1,packSmall:1,medkit:1,tourniquet:1,water:2,noodles:1,painkiller:1},',
   'owned:{m1911:1,armor1:1,helm1:1,hs_tep300:1,packSmall:1,medkit:1,tourniquet:1,water:2,noodles:1,painkiller:1},'],
  ["if(m.loadout.helmet===undefined) m.loadout.helmet='helm1';",
   "if(m.loadout.helmet===undefined) m.loadout.helmet='helm1';\n if(!m.owned.hs_tep300) m.owned.hs_tep300=(m.owned.hs_tep300||0)+1;   // 耳机系统迁移: 老档补一副耳塞\n if(m.loadout.headset===undefined) m.loadout.headset='hs_tep300';"],
  [(L) => L("const SAFETY_ARMOR='armor1';", "const SAFETY_HELMET='helm1';"),
    (L) => L("const SAFETY_ARMOR='armor1';", "const SAFETY_HELMET='helm1';", "const SAFETY_HEADSET='hs_tep300';")],
  ['const armors=Object.keys(ARMOR_DEFS).concat(Object.keys(HELMET_DEFS));',
   'const armors=Object.keys(ARMOR_DEFS).concat(Object.keys(HELMET_DEFS)).concat(Object.keys(HEADSET_DEFS));'],
  ['function ownedHelmetList(){ return Object.keys(META.owned).filter(k=>HELMET_DEFS[k]&&META.owned[k]>0); }',
   'function ownedHelmetList(){ return Object.keys(META.owned).filter(k=>HELMET_DEFS[k]&&META.owned[k]>0); }\nfunction ownedHeadsetList(){ return Object.keys(META.owned).filter(k=>HEADSET_DEFS[k]&&META.owned[k]>0); }'],
  ["if(META.loadout.helmet===key&&ownedCount(key)<=0) META.loadout.helmet=ownedHelmetList()[0]||'helm1';",
   "if(META.loadout.helmet===key&&ownedCount(key)<=0) META.loadout.helmet=ownedHelmetList()[0]||'helm1';\n if(META.loadout.headset===key&&ownedCount(key)<=0) META.loadout.headset=ownedHeadsetList()[0]||'';"],
  // 保底补给也补耳机
  [(L) => L(' if(!ownedHelmetList().length){',
    '   addOwned(SAFETY_HELMET,1);',
    '   granted.push(SAFETY_HELMET);',
    '   if(!META.loadout.helmet||!ownedCount(META.loadout.helmet)) META.loadout.helmet=SAFETY_HELMET;',
    ' }'),
    (L) => L(' if(!ownedHelmetList().length){',
      '   addOwned(SAFETY_HELMET,1);',
      '   granted.push(SAFETY_HELMET);',
      '   if(!META.loadout.helmet||!ownedCount(META.loadout.helmet)) META.loadout.helmet=SAFETY_HELMET;',
      ' }',
      ' if(!ownedHeadsetList().length){',
      '   addOwned(SAFETY_HEADSET,1);',
      '   granted.push(SAFETY_HEADSET);',
      '   if(!META.loadout.headset||!ownedCount(META.loadout.headset)) META.loadout.headset=SAFETY_HEADSET;',
      ' }')],
  // 配装摘要加耳机
  [(L) => L("  const h=(META.loadout.helmet&&HELMET_DEFS[META.loadout.helmet])?HELMET_DEFS[META.loadout.helmet].name:'未装备';",
    '  sum.innerHTML=`<b>主武器:</b> ${p} · <b>副武器:</b> ${s} · <b>防弹衣:</b> ${a} · <b>头盔:</b> ${h}`'),
    (L) => L("  const h=(META.loadout.helmet&&HELMET_DEFS[META.loadout.helmet])?HELMET_DEFS[META.loadout.helmet].name:'未装备';",
      "  const _hs=HEADSET_DEFS[META.loadout.headset];",
      "  const hs=_hs?(_hs.name+' '+_hs.color):'未装备';",
      "  const _conf=(_hs&&_hs.earMuff&&META.loadout.helmet==='helm6');",
      '  sum.innerHTML=`<b>主武器:</b> ${p} · <b>副武器:</b> ${s} · <b>防弹衣:</b> ${a} · <b>头盔:</b> ${h} · <b>耳机:</b> ${hs}`',
      "   +(_conf?'<div style=\"color:#e0b080;font-size:12px;margin-top:4px\">⚠ 该耳机是耳罩式，和 Altyn 头盔冲突 —— 出击时不会生效，请改用 Peltor TEP-300 战术耳塞</div>':'');")],
], '37_meta.js 耳机定义');

// ---------- 37_meta.js: 耳机下拉 ----------
rep('js/37_meta.js', [
  [(L) => L("  hSel.value=META.loadout.helmet||'';",
    "  hSel.onchange=()=>setLoadout('helmet',hSel.value);",
    ' }'),
    (L) => L("  hSel.value=META.loadout.helmet||'';",
      "  hSel.onchange=()=>setLoadout('helmet',hSel.value);",
      ' }',
      " const eSel=el('headsetSelect');",
      ' if(eSel){',
      "  eSel.innerHTML='';",
      "  const _noHeadset=document.createElement('option');",
      "  _noHeadset.value=''; _noHeadset.textContent='— 不佩戴耳机 —';",
      '  eSel.appendChild(_noHeadset);',
      '  for(const k of ownedHeadsetList()){',
      '   const d=HEADSET_DEFS[k];',
      "   const o=document.createElement('option');",
      '   o.value=k;',
      "   // 耳罩式与 Altyn 冲突: 标注并禁用 (TEP-300 是入耳式, 不受影响)",
      "   const bad=!!(d.earMuff&&META.loadout.helmet==='helm6');",
      "   o.textContent=d.name+' '+d.color+' · 听力 '+d.range+'m'+(bad?'（与 Altyn 冲突）':'');",
      '   o.disabled=bad;',
      '   o.selected=k===META.loadout.headset;',
      '   eSel.appendChild(o);',
      '  }',
      "  if(!META.loadout.headset) eSel.value='';",
      "  eSel.onchange=()=>setLoadout('headset',eSel.value);",
      ' }')],
], '37_meta.js 耳机下拉');

// ---------- 38_tarkov.js: 物品函数覆盖层 ----------
rep('js/38_tarkov.js', [
  ['if(HELMET_DEFS[key]) return 3;',
   'if(HELMET_DEFS[key]) return 3;\nif(HEADSET_DEFS[key]) return 2;'],
  ['if(HELMET_DEFS[key]) return HELMET_DEFS[key].weight||2;',
   'if(HELMET_DEFS[key]) return HELMET_DEFS[key].weight||2;\nif(HEADSET_DEFS[key]) return HEADSET_DEFS[key].weight||0.4;'],
  ['if(WPN_DEFS[key]||ARMOR_DEFS[key]||HELMET_DEFS[key]) return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45));',
   'if(WPN_DEFS[key]||ARMOR_DEFS[key]||HELMET_DEFS[key]||HEADSET_DEFS[key]) return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45));'],
  [(L) => L('if(HELMET_DEFS[key]){ const h=HELMET_DEFS[key]; return `头盔 Lv${h.level} · 护头耐久 ${h.hp} · 减伤 ${Math.round(h.resist*100)}% · 重量 ${h.weight}`; }'),
   (L) => L('if(HEADSET_DEFS[key]){ const e=HEADSET_DEFS[key]; return `耳机 · 听力范围 ${e.range}m · 脚步/枪声 ×${e.amp} · 环境音 ×${e.ambient} · ${e.earMuff?\'耳罩式(与 Altyn 冲突)\':\'入耳式(兼容 Altyn)\'}`; }',
     'if(HELMET_DEFS[key]){ const h=HELMET_DEFS[key]; return `头盔 Lv${h.level} · 护头耐久 ${h.hp} · 减伤 ${Math.round(h.resist*100)}% · 重量 ${h.weight}`; }')],
  ['if(HELMET_DEFS[key]) return HELMET_DEFS[key].name;',
   'if(HELMET_DEFS[key]) return HELMET_DEFS[key].name;\nif(HEADSET_DEFS[key]) return HEADSET_DEFS[key].name+\' \'+HEADSET_DEFS[key].color;'],
  ["if(HELMET_DEFS[key]) return 'helmet';",
   "if(HELMET_DEFS[key]) return 'helmet';\nif(HEADSET_DEFS[key]) return 'headset';"],
  ["if(k==='helmet') return '🪖';",
   "if(k==='helmet') return '🪖';\nif(k==='headset') return '🎧';"],
  // 尸体掉落耳机
  ['if(Math.random()<0.05) out[helmets[randi(0,helmets.length-1)]]=1;',
   'if(Math.random()<0.05) out[helmets[randi(0,helmets.length-1)]]=1;\n// 耳机掉落: 相对稀有\nconst headsets=Object.keys(HEADSET_DEFS);\nif(Math.random()<0.12) out[headsets[randi(0,headsets.length-1)]]=1;'],
], '38_tarkov.js 耳机物品函数');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
