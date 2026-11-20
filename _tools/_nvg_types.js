// 夜视仪: 三种型号 + ISO 提高 + 全景 + 热成像 (2026-09-19)
// 需求: ① 实验室仍过暗 → 提高夜视仪 ISO
//       ② 新增全景夜视仪 (更大视野)
//       ③ 新增热成像 —— 只标记 NPC, 标记为红色, 其余同普通夜视仪
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

// ================= ① 38_tarkov.js: NVG_DEFS + 物品函数 + 部署 =================
rep('js/38_tarkov.js', [
  // 定义表
  [(L) => L('function ownedChestList(){ return Object.keys(META.owned).filter(k=>CHEST_DEFS[k]&&META.owned[k]>0); }'),
    (L) => L('function ownedChestList(){ return Object.keys(META.owned).filter(k=>CHEST_DEFS[k]&&META.owned[k]>0); }',
      '',
      '// ---------- 夜视仪 (2026-09-19) ----------',
      '// 三档: 普通 / 全景(视野更大) / 热成像(只把 NPC 标红, 其余同普通)。',
      '//   fov   开启时的相机视场角 (越大越"全景")',
      '//   gain  着色器 uGain 倍率 —— 这就是"ISO"',
      '//   boost 场景光/曝光增强倍率 (实验室那种微光地图靠它提亮)',
      'const NVG_DEFS={',
      " nvg:        {name:'PVS-14 单目夜视仪', size:2, weight:0.4, price:2600, fov:94,  gain:1.00, boost:1.00, thermal:false, desc:'绿/蓝/白三色滤镜 · 夜间增强 · 白天过曝'},",
      " nvg_pano:   {name:'GPNVG-18 全景夜视仪', size:2, weight:0.7, price:6200, fov:118, gain:1.15, boost:1.10, thermal:false, desc:'四目全景 · 视野明显更宽 (118°)'},",
      " nvg_thermal:{name:'T-7 热成像仪', size:3, weight:1.0, price:9800, fov:78,  gain:1.35, boost:1.25, thermal:true,  desc:'把 NPC 标成红色方框 · 其余同普通夜视仪'},",
      '};',
      'function ownedNvgList(){ return Object.keys(META.owned).filter(k=>NVG_DEFS[k]&&META.owned[k]>0); }')],
  // 物品函数
  ['if(CHEST_DEFS[key]) return CHEST_DEFS[key].size||3;', 'if(CHEST_DEFS[key]) return CHEST_DEFS[key].size||3;\nif(NVG_DEFS[key]) return NVG_DEFS[key].size||2;'],
  ['if(CHEST_DEFS[key]) return CHEST_DEFS[key].weight||1;', 'if(CHEST_DEFS[key]) return CHEST_DEFS[key].weight||1;\nif(NVG_DEFS[key]) return NVG_DEFS[key].weight||0.5;'],
  ['if(CHEST_DEFS[key]) return CHEST_DEFS[key].price;', 'if(CHEST_DEFS[key]) return CHEST_DEFS[key].price;\nif(NVG_DEFS[key]) return NVG_DEFS[key].price;'],
  ['if(CHEST_DEFS[key]) return CHEST_DEFS[key].desc+" · 重 "+CHEST_DEFS[key].weight+"kg";',
   'if(CHEST_DEFS[key]) return CHEST_DEFS[key].desc+" · 重 "+CHEST_DEFS[key].weight+"kg";\nif(NVG_DEFS[key]) return NVG_DEFS[key].desc+" · 视野 "+NVG_DEFS[key].fov+"° · ISO ×"+NVG_DEFS[key].gain+" · 重 "+NVG_DEFS[key].weight+"kg";'],
  [(L) => L('if(MISC_DEFS[key]) return MISC_DEFS[key].name;',
    'if(PACK_DEFS[key]) return PACK_DEFS[key].name;',
    "if(CHEST_DEFS[key]) return CHEST_DEFS[key].name+(CHEST_DEFS[key].color?(' '+CHEST_DEFS[key].color):'');",
    "return '未知物品';"),
    (L) => L('if(MISC_DEFS[key]) return MISC_DEFS[key].name;',
      'if(PACK_DEFS[key]) return PACK_DEFS[key].name;',
      "if(CHEST_DEFS[key]) return CHEST_DEFS[key].name+(CHEST_DEFS[key].color?(' '+CHEST_DEFS[key].color):'');",
      'if(NVG_DEFS[key]) return NVG_DEFS[key].name;',
      "return '未知物品';")],
  ["if(CHEST_DEFS[key]) return 'chest';", "if(CHEST_DEFS[key]) return 'chest';\nif(NVG_DEFS[key]) return 'gear';"],
  ["if(k==='chest') return '🦺';", "if(k==='chest') return '🦺';\nif(NVG_DEFS[key]) return '🌙';"],
  ['if(MED_DEFS[key]||FOOD_DEFS[key]||MISC_DEFS[key]||PACK_DEFS[key]||CHEST_DEFS[key]) return Math.max(15,Math.floor(itemPriceOf(key)*0.45));',
   'if(MED_DEFS[key]||FOOD_DEFS[key]||MISC_DEFS[key]||PACK_DEFS[key]||CHEST_DEFS[key]||NVG_DEFS[key]) return Math.max(15,Math.floor(itemPriceOf(key)*0.45));'],
  // 商品目录
  ["'nvg','pass'", "'nvg','nvg_pano','nvg_thermal','pass'"],
  // 部署: 记录带的是哪一型
  [(L) => L('RUN.nvgBrought=false;',
    'L.nvg=false;',
    'const primaryKey=L.primary;',
    "if(primaryKey&&getModChoice(primaryKey,'gear')==='gear_nvg'&&ownedCount('nvg')>0){",
    'L.nvg=true;',
    'RUN.nvgBrought=true;',
    '}'),
    (L) => L('// 2026-09-19: L.nvg 由布尔改为**型号键** (\'\' = 不带)。老档在 normalizeMeta 里迁移。',
      'RUN.nvgBrought=false;',
      'RUN.nvgKey=\'\';',
      'const primaryKey=L.primary;',
      "const _nvgWant=(typeof L.nvg==='string')?L.nvg:'';",
      "if(primaryKey&&getModChoice(primaryKey,'gear')==='gear_nvg'&&_nvgWant&&ownedCount(_nvgWant)>0){",
      'RUN.nvgBrought=true;',
      'RUN.nvgKey=_nvgWant;',
      '}')],
  // 工坊门控: 任意一型夜视仪都算
  ["if(slot==='gear'&&mid==='gear_nvg'&&ownedCount('nvg')<=0){ disabled=true; tip='需要仓库拥有『夜视仪』(市集可购)'; }",
   "if(slot==='gear'&&mid==='gear_nvg'&&ownedNvgList().length<=0){ disabled=true; tip='需要仓库拥有夜视仪 (市集可购)'; }"],
  // 配装价值/钥匙
  ["if(L.nvg) v+=itemPriceOf('nvg');", "if(L.nvg&&NVG_DEFS[L.nvg]) v+=itemPriceOf(L.nvg);"],
  ["if(L.nvg) keys.push('nvg');", "if(L.nvg&&NVG_DEFS[L.nvg]) keys.push(L.nvg);"],
], '38_tarkov.js 夜视仪三型');

// ================= ② 37_meta.js: 槽位改字符串 + 迁移 + 下拉 + 装备映射 =================
rep('js/37_meta.js', [
  ["nvg:false, pass:false }; }", "nvg:'', pass:false }; }"],
  ["if(m.loadout.chest===undefined) m.loadout.chest='';   // 胸挂: 老档默认不戴",
   "if(m.loadout.chest===undefined) m.loadout.chest='';   // 胸挂: 老档默认不戴\n // 夜视仪: 老档是布尔 → 迁移成型号键 (true 视为带 PVS-14)\n if(m.loadout.nvg===true) m.loadout.nvg='nvg';\n else if(m.loadout.nvg===false||m.loadout.nvg===undefined||!m.loadout.nvg) m.loadout.nvg='';"],
  ["   :(kind==='chest')?'chest'",
   "   :(kind==='chest')?'chest'\n   :(kind==='gear')?'nvg'"],
  ["  const ch=_ch?(_ch.name+' · '+_ch.slots+'格'):'未装备';",
   "  const ch=_ch?(_ch.name+' · '+_ch.slots+'格'):'未装备';\n  const _nv=(typeof NVG_DEFS!=='undefined')?NVG_DEFS[META.loadout.nvg]:null;\n  const nv=_nv?_nv.name:'未携带';"],
  ["   +` · <b>胸挂:</b> ${ch}`", "   +` · <b>胸挂:</b> ${ch} · <b>夜视:</b> ${nv}`"],
  // 下拉
  [(L) => L("  if(!META.loadout.chest) cSel.value='';",
    "  cSel.onchange=()=>setLoadout('chest',cSel.value);",
    ' }'),
    (L) => L("  if(!META.loadout.chest) cSel.value='';",
      "  cSel.onchange=()=>setLoadout('chest',cSel.value);",
      ' }',
      " const nSel=el('nvgSelect');",
      ' if(nSel){',
      "  nSel.innerHTML='';",
      "  const _noNvg=document.createElement('option');",
      "  _noNvg.value=''; _noNvg.textContent='— 不携带夜视仪 —';",
      '  nSel.appendChild(_noNvg);',
      '  for(const k of ownedNvgList()){',
      '   const d=NVG_DEFS[k];',
      "   const o=document.createElement('option');",
      '   o.value=k;',
      "   o.textContent=d.name+' · 视野 '+d.fov+'° · ISO ×'+d.gain+(d.thermal?' · 热成像':'');",
      '   o.selected=k===META.loadout.nvg;',
      '   nSel.appendChild(o);',
      '  }',
      "  if(!META.loadout.nvg) nSel.value='';",
      "  nSel.onchange=()=>setLoadout('nvg',nSel.value);",
      ' }')],
], '37_meta.js 夜视仪槽位');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
