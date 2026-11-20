// 头盔系统接入: index.html / 29_menus / 38_tarkov / 28_hud / 44_deathcam / 23_player / 49_mod_api
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
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 52).replace(/\r?\n/g, '⏎')); bad++; }
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

const SEL_STYLE = 'style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"';

// ---------- index.html ----------
rep('index.html', [
  // ① 部署页加头盔下拉
  [`<div class="secLabel">防弹衣（仓库）</div>\n<select id="armorSelect" ${SEL_STYLE}></select>`,
   `<div class="secLabel">防弹衣（仓库）</div>\n<select id="armorSelect" ${SEL_STYLE}></select>\n<div class="secLabel">头盔（仓库）</div>\n<select id="helmetSelect" ${SEL_STYLE}></select>`],
  // ② HUD 加一行
  ['<div id="armorHud"></div>', '<div id="armorHud"></div>\n<div id="helmetHud"></div>'],
], 'index.html 头盔下拉 + HUD');

// ---------- 29_menus.js: 部署配装 ----------
rep('js/29_menus.js', [
  [(L) => L("const armorKey=ownedCount(META.loadout.armor)>0?META.loadout.armor:(ownedArmorList()[0]||'');",
    "const armor=ARMOR_DEFS[armorKey]||{name:'未装备防弹衣',hp:0,resist:0,weight:0};"),
    (L) => L("const armorKey=ownedCount(META.loadout.armor)>0?META.loadout.armor:(ownedArmorList()[0]||'');",
      "const armor=ARMOR_DEFS[armorKey]||{name:'未装备防弹衣',hp:0,resist:0,weight:0,level:0};",
      "// 头盔: 与护甲独立的槽位, 只保护头部 (见 38_tarkov.applyPlayerBodyDamage)",
      "const helmetKey=(META.loadout.helmet&&ownedCount(META.loadout.helmet)>0)?META.loadout.helmet:(ownedHelmetList()[0]||'');",
      "const helmet=HELMET_DEFS[helmetKey]||{name:'未装备头盔',hp:0,resist:0,weight:0,level:0};")],
  [(L) => L("p.armorKey=armorKey; p.armorDef=armor; p.armorResist=armor.resist;"),
    (L) => L("p.armorKey=armorKey; p.armorDef=armor; p.armorResist=armor.resist;",
      "p.helmetKey=helmetKey; p.helmetDef=helmet; p.helmetResist=helmet.resist;",
      "p.helmetDur=helmet.hp||0; p.helmetMax=helmet.hp||0;")],
  // SCAV 本局配装同步
  ["if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.pack=META.loadout.pack||'packSmall'; }",
   "if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.helmet=helmetKey; _scavL.pack=META.loadout.pack||'packSmall'; }"],
], '29_menus.js 部署配装');

// ---------- 38_tarkov.js: 头部减伤 + 耐久 ----------
rep('js/38_tarkov.js', [
  [(L) => L('p.armorDur=armor.hp||0; p.armorMax=armor.hp||0;',
    'p.armorResist=armor.resist||0;'),
    (L) => L('p.armorDur=armor.hp||0; p.armorMax=armor.hp||0;',
      'p.armorResist=armor.resist||0;',
      ' // 头盔: 独立耐久, 只吃头部伤害',
      ' p.helmetDur=(p.helmetDef&&p.helmetDef.hp)||0; p.helmetMax=p.helmetDur;',
      ' p.helmetResist=(p.helmetDef&&p.helmetDef.resist)||0;')],
  [(L) => L('if((target==="thorax"||target==="stomach")&&p.armorDur>0&&p.armorResist>0){',
    'const absorb=dmg*p.armorResist;',
    'dmg-=absorb;',
    'p.armorDur=Math.max(0,p.armorDur-absorb*1.25);',
    'if(p.armorDur<=0&&!p._armorBroke){ p._armorBroke=true; showScorePop("防弹衣已报废"); }',
    '}'),
    (L) => L('if((target==="thorax"||target==="stomach")&&p.armorDur>0&&p.armorResist>0){',
      'const absorb=dmg*p.armorResist;',
      'dmg-=absorb;',
      'p.armorDur=Math.max(0,p.armorDur-absorb*1.25);',
      'if(p.armorDur<=0&&!p._armorBroke){ p._armorBroke=true; showScorePop("防弹衣已报废"); }',
      ' }',
      ' // 头盔: 只吃头部伤害, 耐久单独计算 (打光后头部恢复全额伤害)',
      ' if(target==="head"&&p.helmetDur>0&&p.helmetResist>0){',
      '  const absorb=dmg*p.helmetResist;',
      '  dmg-=absorb;',
      '  p.helmetDur=Math.max(0,p.helmetDur-absorb*1.3);',
      '  if(p.helmetDur<=0&&!p._helmetBroke){ p._helmetBroke=true; showScorePop("头盔已报废"); }',
      ' }')],
], '38_tarkov.js 头部减伤');

// ---------- 28_hud.js ----------
rep('js/28_hud.js', [
  [(L) => L("if(el('armorHud')) el('armorHud').textContent=player.armorDef?`防弹衣 ${player.armorDef.name} · 减伤 ${Math.round(player.armorResist*100)}%`:'未装备防弹衣';"),
    (L) => L("if(el('armorHud')) el('armorHud').textContent=player.armorDef?`护甲 ${player.armorDef.name} · 减伤 ${Math.round(player.armorResist*100)}%`+(player.armorMax?` · 耐久 ${Math.round(player.armorDur||0)}/${Math.round(player.armorMax)}`:''):'未装备护甲';",
      "if(el('helmetHud')) el('helmetHud').textContent=player.helmetDef?`头盔 ${player.helmetDef.name} · 减伤 ${Math.round(player.helmetResist*100)}%`+(player.helmetMax?` · 耐久 ${Math.round(player.helmetDur||0)}/${Math.round(player.helmetMax)}`:''):'未装备头盔';")],
], '28_hud.js 头盔 HUD');

// ---------- 44_deathcam.js: 命中记录按部位选减伤 ----------
rep('js/44_deathcam.js', [
  ["      const applied=Math.round(Math.max(1,amt*(1-(this.armorResist||0))));",
   "      // 头部看头盔减伤, 其余看护甲减伤 (与 38_tarkov.applyPlayerBodyDamage 保持一致)\n      const _rs=(partKey==='head')?(this.helmetResist||0):(this.armorResist||0);\n      const applied=Math.round(Math.max(1,amt*(1-_rs)));"],
], '44_deathcam.js 减伤显示');

// ---------- 23_player.js: 同上的旧路径 ----------
rep('js/23_player.js', [
  ["const reduced=Math.max(1,amt*(1-(this.armorResist||0)));",
   "// 头部看头盔, 其余看护甲 (与 38_tarkov 的活跃路径一致)\n const _rs=(limb==='head')?(this.helmetResist||0):(this.armorResist||0);\n const reduced=Math.max(1,amt*(1-_rs));"],
], '23_player.js 减伤');

// ---------- 49_mod_api.js: 暴露头盔 ----------
rep('js/49_mod_api.js', [
  ["        armorResist: player.armorResist || 0",
   "        armorResist: player.armorResist || 0,\n        helmetKey: player.helmetKey || '',\n        helmetResist: player.helmetResist || 0,\n        helmetDur: player.helmetDur || 0"],
], '49_mod_api.js 暴露头盔');

// ---------- 38_tarkov.js: 尸体掉落头盔 ----------
rep('js/38_tarkov.js', [
  ["if(Math.random()<0.22) out[armors[randi(0,Math.min(2,armors.length-1))]]=1;",
   "// 护具掉落: 低阶护甲/头盔常见, 高阶稀有\nif(Math.random()<0.22) out[armors[randi(0,Math.min(2,armors.length-1))]]=1;\nconst helmets=Object.keys(HELMET_DEFS);\nif(Math.random()<0.20) out[helmets[randi(0,Math.min(2,helmets.length-1))]]=1;\nif(Math.random()<0.05) out[helmets[randi(0,helmets.length-1)]]=1;"],
], '38_tarkov.js 尸体掉头盔');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
