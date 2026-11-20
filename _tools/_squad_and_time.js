// 编制 / 对局时间 / 超时处理 (2026-09-18 用户需求)
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
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 50).replace(/\r?\n/g, '⏎')); bad++; }
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

// ---------- ① 每图编制: CAMPAIGNS 加 allyBots / enemyBots ----------
// 街区 4v8(中立) / 实验室 4v8 / 机场 4v8 / 港口保持现状 4v12
rep('js/01_data.js', [
  ["{ id:'bfruins', title:'街区', sub:'废城巷战 · 逐屋清剿 · 搜刮带出', f:['usec','ger'], theme:'cqb', npcNeutral:true,",
   "{ id:'bfruins', title:'街区', sub:'废城巷战 · 逐屋清剿 · 搜刮带出', f:['usec','ger'], theme:'cqb', npcNeutral:true, allyBots:3, enemyBots:8,"],
  ["{ id:'lab', title:'秘密实验室', sub:'地下生物设施 · 高价值物资 · PMC 守备', f:['usec','pmc'], theme:'lab',",
   "{ id:'lab', title:'秘密实验室', sub:'地下生物设施 · 高价值物资 · PMC 守备', f:['usec','pmc'], theme:'lab', allyBots:3, enemyBots:8,"],
  ["{ id:'port', title:'港口', sub:'瓦尔登港 · 集装箱码头 · PMC 守备 · 出海唯一通道', f:['usec','pmc'], theme:'port',",
   "{ id:'port', title:'港口', sub:'瓦尔登港 · 集装箱码头 · PMC 守备 · 出海唯一通道', f:['usec','pmc'], theme:'port', allyBots:3, enemyBots:12,"],
  ["{ id:'airport', title:'瓦尔登机场', sub:'废弃国际机场 · 航站楼与货运区 · 资料/电子产品密集', f:['usec','pmc'], theme:'airport',",
   "{ id:'airport', title:'瓦尔登机场', sub:'废弃国际机场 · 航站楼与货运区 · 资料/电子产品密集', f:['usec','pmc'], theme:'airport', allyBots:3, enemyBots:8,"],
], '01_data.js CAMPAIGNS 编制字段');

// ---------- ② 编制常量改为从 CAMPAIGN 读 + 删掉 SIZE_OPTS ----------
rep('js/01_data.js', [
  ['const SIZE_OPTS=[{n:\'标准\',bots:16,tk:330},{n:\'加强\',bots:20,tk:430},{n:\'史诗\',bots:24,tk:540}];\nlet SIZE_IDX=clamp(parseInt(localStorage.getItem(\'sf_size\')||\'0\')||0,0,2);\n', ''],
  [(L) => L('let BOTS_PER_TEAM=16;',
    '// 编制: 由每张地图的 CAMPAIGNS 决定 (2026-09-18 用户要求「不要在对局前选人数」)。',
    '// 我方固定 4 人(玩家 + 3 AI); 敌方按地图: 街区/实验室/机场 8 人, 港口 12 人。',
    'const FRIENDLY_SQUAD_COUNT=1;',
    'const FRIENDLY_SQUAD_SIZE=4;',
    'let FRIENDLY_BOT_COUNT=(CAMPAIGN.allyBots!=null)?CAMPAIGN.allyBots:(FRIENDLY_SQUAD_SIZE-1)*FRIENDLY_SQUAD_COUNT;   // 3 个 AI 队友',
    '// 敌方守备: 按地图编制拆成 4 人独立小队',
    'let ENEMY_BOT_COUNT=(CAMPAIGN.enemyBots!=null)?CAMPAIGN.enemyBots:8;',
    'const ENEMY_SQUAD_COUNT=Math.max(1,Math.ceil(ENEMY_BOT_COUNT/4));',
    'const ENEMY_SQUAD_SIZE=4;',
    'const START_TICKETS=330;'),
    (L) => L('// 撤离突袭小队编制: 玩家小队 4 人(玩家+3 AI), 敌方 3 支独立 4 人小队, 全场共 16 人 / 15 NPC',
      '// 撤离突袭小队编制: 玩家小队 4 人(玩家+3 AI), 敌方按地图拆成 4 人独立小队')],
], '01_data.js 编制常量');

// ---------- ③ eloApplyForceSize 不再依赖 SIZE_OPTS ----------
rep('js/00b_elo.js', [
  [(L) => L('// 兵力规模随评分浮动 (战场规模, 双方同步 → 主要影响战斗烈度与局时长)',
    'function eloApplyForceSize(){',
    "  if(typeof SIZE_OPTS==='undefined'||typeof BOTS_PER_TEAM==='undefined') return;",
    '  const o=SIZE_OPTS[clamp(SIZE_IDX|0,0,SIZE_OPTS.length-1)];',
    '  BOTS_PER_TEAM=Math.max(4,Math.round(o.bots*ELO.enemyCount));',
    '  const tk=Math.max(60,Math.round(o.tk*ELO.enemyCount));',
    '  tickets[0]=tk; tickets[1]=tk;',
    '}'),
    (L) => L('// 兵力规模不再随评分浮动 (2026-09-18 用户要求「不要在对局前选人数」, 编制改为每图固定)。',
      '// 保留函数名以免改动调用方; 现在只负责把征服模式的票数按评分缩放。',
      'function eloApplyForceSize(){',
      "  if(typeof START_TICKETS==='undefined'||typeof tickets==='undefined') return;",
      '  const tk=Math.max(60,Math.round(START_TICKETS*(ELO.enemyCount||1)));',
      '  tickets[0]=tk; tickets[1]=tk;',
      '}')],
], '00b_elo.js eloApplyForceSize');

// ---------- ④ 删掉人数选择器 UI ----------
rep('index.html', [
  [(L) => L('<div class="secLabel">兵力规模</div>',
    '<div class="rowFlex">',
    '<button class="optBtn sizeBtn" data-s="0">标准 11v11</button>',
    '<button class="optBtn sizeBtn" data-s="1">加强 16v16</button>',
    '<button class="optBtn sizeBtn" data-s="2">史诗 22v22</button>',
    '</div>'), ''],
], 'index.html 人数选择器');

rep('js/29_menus.js', [
  [(L) => L('// 模式归属战役, 此处仅兵力规模',
    "document.querySelectorAll('.sizeBtn').forEach(b=>{",
    "b.classList.toggle('sel',+b.dataset.s===SIZE_IDX);",
    'b.onclick=()=>{',
    'SIZE_IDX=+b.dataset.s;',
    "localStorage.setItem('sf_size',b.dataset.s);",
    "document.querySelectorAll('.sizeBtn').forEach(x=>x.classList.toggle('sel',x===b));",
    '};',
    '});'), ''],
], '29_menus.js 人数选择器处理');

// ---------- ⑤ 对局时间 5 分钟 ----------
rep('js/29_menus.js', [
  ['matchTime=25*60;', 'matchTime=5*60;   // 5 分钟一局 (2026-09-18)'],
  ["matchTime=GAMEMODE==='assault'?18*60:16*60;", "matchTime=GAMEMODE==='assault'?5*60:5*60;   // 统一 5 分钟"],
], '29_menus.js 对局时间');

rep('js/22_emplacements.js', [
  ['let nowT=0, matchOver=false, matchTime=15*60;', 'let nowT=0, matchOver=false, matchTime=5*60;   // 5 分钟一局 (2026-09-18)'],
], '22_emplacements.js 对局时间初值');

// ---------- ⑥ 撤离读条 3 秒 ----------
rep('js/35_extraction.js', [
  ['const hold=ex.holdTime||6;', 'const hold=ex.holdTime||3;   // 3 秒 (2026-09-18: 5 分钟局里 6 秒太长)'],
], '35_extraction.js 撤离读条');

// ---------- ⑦ 超时: 无线电信号丢失 + 按阵亡处理 ----------
rep('js/35_extraction.js', [
  [(L) => L(' matchTime=Math.max(0,matchTime-dt);',
    ' if(matchTime<=0){ finishRaid(false); return; }'),
    (L) => L(' matchTime=Math.max(0,matchTime-dt);',
      ' // 超时 = 撤离窗口关闭: 提示「无线电信号丢失」, 并**按阵亡处理**(装备丢失/保险/失败补偿)',
      ' if(matchTime<=0){',
      "  RUN.timeout=true;",
      "  if(typeof showScorePop==='function') showScorePop('无线电信号丢失');",
      "  if(typeof onPlayerRaidDeath==='function') onPlayerRaidDeath();",
      '  else finishRaid(false);',
      '  return;',
      ' }')],
  ["endTitle.textContent=!extracted?'任 务 失 败':(hadPass?'离 开 瓦 尔 登 · 结 局':'撤 离 成 功');",
   "endTitle.textContent=!extracted?(RUN.timeout?'无 线 电 信 号 丢 失':'任 务 失 败'):(hadPass?'离 开 瓦 尔 登 · 结 局':'撤 离 成 功');"],
], '35_extraction.js 超时处理');

// ---------- ⑧ RUN.timeout 在开局重置 ----------
rep('js/29_menus.js', [
  ['RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false;',
   'RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false; RUN.timeout=false;'],
], '29_menus.js RUN.timeout 重置');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
