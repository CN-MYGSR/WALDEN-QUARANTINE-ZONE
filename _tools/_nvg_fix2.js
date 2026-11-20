// 夜视仪「仓库不显示 / 拥有也用不了」修复 (第二版: 修正缩进与整行删除)
// 根因见 _nvg_fix2.js 顶部注释。本版把 MISC_DEFS.nvg 的删除改成**整行替换**, 避免长串匹配失手。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

// 子串替换任务: [file, from, to, 期望命中数]
const SUBS = [
  ['js/37_meta.js',
    '  for(const k of ownedWeaponList().concat(ownedArmorList()).concat(ownedHelmetList()).concat(ownedHeadsetList()).concat(ownedPackList()).concat(ownedChestList()))',
    '  // 2026-09-19: 补上夜视仪 —— 之前漏了, 三型夜视仪买了在仓库里根本看不见, 也就无法装备\n' +
    '  for(const k of ownedWeaponList().concat(ownedArmorList()).concat(ownedHelmetList()).concat(ownedHeadsetList()).concat(ownedPackList()).concat(ownedChestList()).concat(ownedNvgList()))',
    1],
  ['js/37_meta.js',
    " // 撤离通行证: 装备槽里的随身物品 (老存档没有 → false)\n if(typeof m.loadout.pass!=='boolean') m.loadout.pass=false;\n if(!m.seeded){",
    " // 撤离通行证: 装备槽里的随身物品 (老存档没有 → false)\n if(typeof m.loadout.pass!=='boolean') m.loadout.pass=false;\n" +
    " // ⚠️ 夜视仪型号归一化必须**无条件**做, 不能只写在下面的 !seeded 块里 ——\n" +
    " //    老档的 m.seeded 早就是 true, 于是 loadout.nvg 会残留布尔 true / undefined,\n" +
    " //    而 applyDeployLoadout 只认字符串 → 明明拥有夜视仪也带不出去 (用户实测)。\n" +
    " if(m.loadout.nvg===true) m.loadout.nvg='nvg';\n" +
    " if(typeof m.loadout.nvg!=='string') m.loadout.nvg='';\n" +
    " if(!m.seeded){",
    1],
  ['js/37_meta.js',
    'function setLoadout(slot,key){\n if(!key) return;',
    '// 可选槽位允许置空 (下拉里的「不携带 / 不佩戴」), 否则选了完全没反应\n' +
    "const OPTIONAL_LOADOUT_SLOTS=['secondary','headset','chest','nvg','pass'];\n" +
    'function setLoadout(slot,key){\n if(!key&&OPTIONAL_LOADOUT_SLOTS.indexOf(slot)<0) return;',
    1],
  ['js/37_meta.js',
    " if(META.loadout.headset===key&&ownedCount(key)<=0) META.loadout.headset=ownedHeadsetList()[0]||'';",
    " if(META.loadout.headset===key&&ownedCount(key)<=0) META.loadout.headset=ownedHeadsetList()[0]||'';\n" +
    " if(META.loadout.chest===key&&ownedCount(key)<=0) META.loadout.chest=ownedChestList()[0]||'';\n" +
    " if(META.loadout.pack===key&&ownedCount(key)<=0) META.loadout.pack=ownedPackList()[0]||'packSmall';\n" +
    " if(META.loadout.nvg===key&&ownedCount(key)<=0) META.loadout.nvg='';",
    1],
  ['js/38_tarkov.js',
    "if(key==='nvg') return 'gear';\nif(MISC_DEFS[key]) return 'misc';",
    "if(MISC_DEFS[key]) return 'misc';",
    1],
  ['js/38_tarkov.js',
    'function ownedNvgList(){ return Object.keys(META.owned).filter(k=>NVG_DEFS[k]&&META.owned[k]>0); }',
    'function ownedNvgList(){ return Object.keys(META.owned).filter(k=>NVG_DEFS[k]&&META.owned[k]>0); }\n' +
    '// 型号合法性收口: 存档里的型号必须真存在。37_meta 的迁移只能做类型判断(它加载更早, 看不到 NVG_DEFS),\n' +
    "// 所以真正「型号是否存在」的校验放在这里。\n" +
    "if(META.loadout.nvg&&!NVG_DEFS[META.loadout.nvg]) META.loadout.nvg='';",
    1],
  ['js/14b_weapon_mods.js',
    "function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none'], light:['light_none','light_flash','light_laser','light_strobe'] }; }",
    "// ⚠️ 兜底字面量的 gear 槽**必须也含 gear_nvg** —— 没有 MOD_AVAIL 条目的武器会走这里,\n" +
    "// 漏了它 → 那几把枪在工坊里没有夜视仪选项 → 拥有夜视仪也用不了。\n" +
    "function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none','gear_nvg'], light:['light_none','light_flash','light_laser','light_strobe'] }; }",
    1],
  ['js/00b_elo.js',
    "  if(L.nvg) v+=price('nvg');",
    "  if(L.nvg) v+=price(L.nvg);   // 2026-09-19: 原来硬编码 'nvg', 三型夜视仪都按基础款估值",
    1],
];

// 整行替换任务: [file, 该行包含的片段, 替换成的多行文本]
const LINE_JOBS = [
  ['js/38_tarkov.js', 'nvg:{name:"夜视仪",size:1,weight:0.5,price:2200',
    "// 2026-09-19: 删掉旧的 'nvg' 杂物条目 —— 它与下面的 NVG_DEFS.nvg 重复, 且 itemPriceOf/itemDescOf/itemName\n" +
    "// 的 MISC 分支都排在 NVG_DEFS 之前 → 会抢先命中, 于是「原夜视仪」是 ¥2200 / 杂物风格描述,\n" +
    "// 而新增的 nvg_pano/nvg_thermal 走 NVG_DEFS (¥6200 / ¥9800) → 三型表现不一致。\n" +
    "// 夜视仪现在**只由 NVG_DEFS 定义**; 老存档的 META.owned.nvg 与 TRADE_KEYS 里的 'nvg' 键都不受影响。"],
];

let fatal = 0;
// ---- 校验 ----
const cache = {};
for (const [file] of SUBS.concat(LINE_JOBS)) if (!cache[file]) cache[file] = fs.readFileSync(R(file), 'utf8');
for (const [file, from, , want] of SUBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === want ? '✅' : '❌') + ` ${file}  命中 ${n}/${want}  «${from.slice(0, 44).replace(/\n/g, '⏎')}»`);
  if (n !== want) fatal++;
}
for (const [file, anchor] of LINE_JOBS) {
  const n = cache[file].split(/\r?\n/).filter(l => l.includes(anchor)).length;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  整行命中 ${n}/1  «${anchor}»`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }

// ---- 写盘 ----
const touched = new Set();
for (const [file, from, to] of SUBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
  touched.add(file);
}
for (const [file, anchor, rep] of LINE_JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(/\r?\n/).map(l => l.includes(anchor) ? rep.split('\n').join(eol) : l).join(eol);
  fs.writeFileSync(R(file), s, 'utf8');
  touched.add(file);
}
console.log('\n💾 已写盘: ' + [...touched].join(', '));
console.log('✅ 共 ' + (SUBS.length + LINE_JOBS.length) + ' 处已应用');
