// 剧情地图接入: 按「加一张地图要动的 5 个地方」把 anvil_yard / anvil_b2 接进项目
//   ① 01_data.js 四处: CAMPAIGNS + THEMES + CAMPAIGN_WEATHER + WEATHER_FX
//   ② 新建 js/07g_anvil.js (已写好)
//   ③ 08_world.js 的 switch 加 case
//   ④ 43_maps.js 的 MAP_RULES
//   ⑤ index.html script 标签放在 08_world.js 之前
// 顺带: WEATHER_MODE 支持 CAMPAIGN.forceWeather (剧情章节要固定天气, 绕过随机池)
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const JOBS = [
  // ---------- ① 01_data.js ----------
  ['js/01_data.js',
    'const WEATHER_MODE=(()=>{\n let total=0; for(const p of WEATHER_POOL) total+=p[1];',
    'const WEATHER_MODE=(()=>{\n' +
    ' // 剧情章节可以固定天气 (CAMPAIGN.forceWeather) —— 绕过随机池, 让每章的气氛可控\n' +
    ' if(CAMPAIGN.forceWeather) return CAMPAIGN.forceWeather;\n' +
    ' let total=0; for(const p of WEATHER_POOL) total+=p[1];'],
  ['js/01_data.js',
    ",airport:'airporthaze'}[CAMPAIGN.id]||'overcast';",
    ",airport:'airporthaze',anvil_yard:'anvilhaze',anvil_b2:'labhaze'}[CAMPAIGN.id]||'overcast';"],
  ['js/01_data.js',
    'airporthaze:{fogFar:0.58,fogNear:28,sun:0.42,hemi:0.54,skyDark:0.30,sight:0.62}\n};',
    'airporthaze:{fogFar:0.58,fogNear:28,sun:0.42,hemi:0.54,skyDark:0.30,sight:0.62},\n' +
    '// 铁砧外围专用: 工业尘霾 —— 比海雾更呛、比实验室亮, 钢构与堆场轮廓在中距被吃掉\n' +
    'anvilhaze:{fogFar:0.50,fogNear:22,sun:0.40,hemi:0.56,skyDark:0.40,sight:0.60}\n};'],
  ['js/01_data.js',
    'rubbleN:12, snow:false, birds:true, treeN:6, grassMul:0.14, cqb:true, vigA:0.22 },\n};',
    'rubbleN:12, snow:false, birds:true, treeN:6, grassMul:0.14, cqb:true, vigA:0.22 },\n' +
    '// ===== 剧情模式专用主题 =====\n' +
    '// 铁砧外围: 工业尘霾, 锈蚀混凝土 + 钢构, 几乎没有植被\n' +
    "anvil:{ sky:['#565b60','#7d8286','#9c988e','#a89f8e','#9a9284'], fog:0x9aa0a2, hemi:[0xc2c8ce,0x5a5a52,0.66], sun:0xffe6c4, sunI:1.55,\n" +
    'ground:0xc8c4bc, grassC:0x9a9a8c, leaf:0x6a6a58, roof:0x8e9398, dead:0.78, ruinAdd:0.34,\n' +
    'rubbleN:14, snow:false, birds:false, treeN:5, grassMul:0.12 },\n' +
    '// 铁砧 B2: 地下封存层, 只剩应急灯\n' +
    "anvilb2:{ sky:['#1c2026','#22272d','#282e34','#2c3238','#262c32'], fog:0x181c20, hemi:[0x8ea0b2,0x3a4046,0.40], sun:0xbfd0e0, sunI:0.45,\n" +
    'ground:0xffffff, grassC:0xffffff, leaf:0xffffff, roof:0xffffff, dead:0.9, ruinAdd:0.2,\n' +
    'rubbleN:6, snow:false, birds:false, treeN:0, grassMul:0 }\n' +
    '};'],
  // 追加 2 条剧情地图 (追加在末尾 → 既有索引 0~3 不变, 老存档的 sf_campaign 不会串图)
  ['js/01_data.js',
    'lootSpots:[] },\n];',
    'lootSpots:[] },\n' +
    '// ===== 剧情模式专用地图 (必须追加在末尾: localStorage.sf_campaign 存的是索引) =====\n' +
    "{ id:'anvil_yard', title:'铁砧外围', sub:'剧情 · 第一章 · 工业堆场 · 找到竖井口', f:['usec','pmc'], theme:'anvil', allyBots:1, enemyBots:6,\n" +
    " terr:'flat', layout:'anvil_yard', mode:'extract', atk:0, modeName:'剧情 · 铁砧外围', mapSize:210,\n" +
    ' flags:[], bases:[{x:-88,z:0},{x:88,z:0}], sineRoad:false,\n' +
    ' roads:[], trench:[],\n' +
    " mapName:'铁砧外围',\n" +
    " mapTag:'剧情 · 地表工业堆场',\n" +
    " mapDesc:'NBK 打通地下封层的地方。锈蚀的围墙、四座厂房、成列集装箱，正中一座还在亮着红灯的钻井井架——井口就是通往铁砧的门。守备是 PMC 的合同兵，人不多但位置刁。',\n" +
    " mapLoot:'物资箱 ×16 · 中低价值为主',\n" +
    " mapThreat:'守备强度 ★★★☆☆',\n" +
    ' mapDiff:3,\n' +
    " forceWeather:'anvilhaze',\n" +
    ' botMul:{ enemyHp:1.10, enemyReact:0.86, enemySpread:0.86, friendHp:0.98 },\n' +
    ' extract:[{x:0,z:92}] },\n' +
    "{ id:'anvil_b2', title:'铁砧 · B2 层', sub:'剧情 · 第二章 · 地下封存库 · 取回制剂样本', f:['usec','pmc'], theme:'anvilb2', allyBots:1, enemyBots:8, dimLight:0.34,\n" +
    " terr:'flat', layout:'anvil_b2', mode:'extract', atk:0, modeName:'剧情 · 铁砧 B2', mapSize:170,\n" +
    ' flags:[], bases:[{x:-70,z:0},{x:70,z:0}], sineRoad:false,\n' +
    ' roads:[], trench:[],\n' +
    " mapName:'铁砧 · B2 层',\n" +
    " mapTag:'剧情 · 地下封存层',\n" +
    " mapDesc:'华约封存、NBK 重新打开的第三层。中央十字大厅贯通四象限，北端是封存冷库——那一排低温罐里就是泄漏事故的源头。照明几乎全废，只有应急灯板还亮着。',\n" +
    " mapLoot:'物资箱 ×20 · 高价值密集',\n" +
    " mapThreat:'守备强度 ★★★★☆',\n" +
    ' mapDiff:4,\n' +
    " forceWeather:'labhaze',\n" +
    ' botMul:{ enemyHp:1.24, enemyReact:0.78, enemySpread:0.76, friendHp:0.95 },\n' +
    ' extract:[{x:0,z:66}] },\n' +
    '];'],
  // ---------- ③ 08_world.js switch ----------
  ['js/08_world.js',
    "case 'airport': layoutAirport(); break;",
    "case 'airport': layoutAirport(); break;\ncase 'anvil_yard': layoutAnvilYard(); break;\ncase 'anvil_b2': layoutAnvilB2(); break;"],
  // ---------- ④ 43_maps.js MAP_RULES ----------
  ['js/43_maps.js',
    '    botMul:(typeof CAMPAIGN!==\'undefined\'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.22,enemyReact:0.78,enemySpread:0.76}\n  }\n};',
    '    botMul:(typeof CAMPAIGN!==\'undefined\'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.22,enemyReact:0.78,enemySpread:0.76}\n' +
    '  },\n' +
    '  // ===== 剧情模式地图 =====\n' +
    '  // 铁砧外围: 地表, 物资一般, 但守备位置好 → 中等风险\n' +
    '  anvil_yard:{\n' +
    '    crateExtra:0,\n' +
    '    richChance:0.10,\n' +
    '    corpseExtra:0.30,\n' +
    "    botMul:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.10,enemyReact:0.86,enemySpread:0.86}\n" +
    '  },\n' +
    '  // 铁砧 B2: 地下封存层, 与实验室同档的高价值密度\n' +
    '  anvil_b2:{\n' +
    '    crateExtra:[1,2],\n' +
    '    richChance:0.42,\n' +
    '    corpseExtra:0.70,\n' +
    "    botMul:(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.botMul)?CAMPAIGN.botMul:{enemyHp:1.24,enemyReact:0.78,enemySpread:0.76}\n" +
    '  }\n' +
    '};'],
  // ---------- ⑤ index.html script 标签 ----------
  ['index.html',
    '<script src="js/07f_airport.js',
    '<script src="js/07g_anvil.js?v=20260919m"></script>\n<script src="js/07f_airport.js'],
];

let fatal = 0;
const cache = {};
for (const [f] of JOBS) if (!cache[f]) cache[f] = fs.readFileSync(R(f), 'utf8');
for (const [file, from] of JOBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  命中 ${n}/1  «${from.slice(0, 46).replace(/\n/g, '⏎')}»`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }
for (const [file, from, to] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
console.log('\n💾 已写盘: ' + [...new Set(JOBS.map(j => j[0]))].join(', '));
console.log('✅ 共 ' + JOBS.length + ' 处已应用');
