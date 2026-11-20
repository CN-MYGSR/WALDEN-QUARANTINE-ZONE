// 耳机系统: 部署配装 / HUD / 界面
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

const SEL_STYLE = 'style="width:100%;padding:8px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"';

// ---------- index.html ----------
rep('index.html', [
  [`<div class="secLabel">头盔（仓库）</div>\n<select id="helmetSelect" ${SEL_STYLE}></select>`,
   `<div class="secLabel">头盔（仓库）</div>\n<select id="helmetSelect" ${SEL_STYLE}></select>\n<div class="secLabel">耳机（仓库 · 影响听力范围与环境音）</div>\n<select id="headsetSelect" ${SEL_STYLE}></select>`],
  ['<div id="helmetHud"></div>', '<div id="helmetHud"></div>\n<div id="headsetHud"></div>'],
], 'index.html 耳机下拉 + HUD');

// ---------- 29_menus.js: 部署配装 ----------
rep('js/29_menus.js', [
  [(L) => L("const helmetKey=(META.loadout.helmet&&ownedCount(META.loadout.helmet)>0)?META.loadout.helmet:(ownedHelmetList()[0]||'');",
    "const helmet=HELMET_DEFS[helmetKey]||{name:'未装备头盔',hp:0,resist:0,weight:0,level:0};"),
    (L) => L("const helmetKey=(META.loadout.helmet&&ownedCount(META.loadout.helmet)>0)?META.loadout.helmet:(ownedHelmetList()[0]||'');",
      "const helmet=HELMET_DEFS[helmetKey]||{name:'未装备头盔',hp:0,resist:0,weight:0,level:0};",
      "// 耳机: 影响听力范围(脚步可听距离) / 脚步与枪声放大 / 环境音压制",
      "// ⚠️ 耳罩式耳机(earMuff)与 Altyn(helm6) 物理冲突 —— 只有入耳式的 TEP-300 能配 Altyn",
      "let headsetKey=(META.loadout.headset&&ownedCount(META.loadout.headset)>0)?META.loadout.headset:(ownedHeadsetList()[0]||'');",
      "let headset=HEADSET_DEFS[headsetKey]||null;",
      "if(headset&&headset.earMuff&&helmetKey==='helm6'){",
      "  headset=null; headsetKey='';",
      "  if(typeof showScorePop==='function') showScorePop('耳罩式耳机与 Altyn 头盔冲突 · 本局未佩戴耳机');",
      "}")],
  [(L) => L("p.helmetDur=helmet.hp||0; p.helmetMax=helmet.hp||0;"),
    (L) => L("p.helmetDur=helmet.hp||0; p.helmetMax=helmet.hp||0;",
      "p.headsetKey=headsetKey; p.headsetDef=headset;",
      "// 把听力档案交给音频层 (02_audio): 范围 / 放大 / 环境音压制",
      "if(typeof AudioSys!=='undefined'&&AudioSys.setHearing) AudioSys.setHearing(headset);")],
  ["if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.helmet=helmetKey; _scavL.pack=META.loadout.pack||'packSmall'; }",
   "if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.helmet=helmetKey; _scavL.headset=headsetKey; _scavL.pack=META.loadout.pack||'packSmall'; }"],
], '29_menus.js 部署配装');

// ---------- 28_hud.js: 耳机 HUD ----------
rep('js/28_hud.js', [
  [(L) => L("if(el('helmetHud')) el('helmetHud').textContent=player.helmetDef?`头盔 ${player.helmetDef.name} · 减伤 ${Math.round(player.helmetResist*100)}%`+(player.helmetMax?` · 耐久 ${Math.round(player.helmetDur||0)}/${Math.round(player.helmetMax)}`:''):'未装备头盔';"),
    (L) => L("if(el('helmetHud')) el('helmetHud').textContent=player.helmetDef?`头盔 ${player.helmetDef.name} · 减伤 ${Math.round(player.helmetResist*100)}%`+(player.helmetMax?` · 耐久 ${Math.round(player.helmetDur||0)}/${Math.round(player.helmetMax)}`:''):'未装备头盔';",
      "if(el('headsetHud')) el('headsetHud').textContent=player.headsetDef?`耳机 ${player.headsetDef.name} · 听力 ${player.headsetDef.range}m · 环境音 -${Math.round((1-player.headsetDef.ambient)*100)}%`:'未佩戴耳机 · 听力 40m';")],
], '28_hud.js 耳机 HUD');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
