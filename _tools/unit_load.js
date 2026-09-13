// 47_units.js 离线加载测试: 编队划分 / 余数不足编 / 阵亡与重生 / 合并 / 同单位过滤
// 输出写入 _tools/unit_load.txt
const fs = require('fs');
const path = require('path');
const out = [];
const log = s => out.push(s);

global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() { } } }), querySelectorAll: () => [], addEventListener() { } };
global.window = { addEventListener() { } };
global.console = { log() { }, warn: (...a) => log('  [warn] ' + a.join(' ')), error: (...a) => log('  [error] ' + a.join(' ')) };
global.matchOver = false;
global.player = { team: 0, unitId: null, isPlayer: true };
global.soldiers = [];

// ---- Bot 桩: 只保留编队需要的字段 ----
global.Bot = function (team, g, name) {
  this.team = team; this.name = name || ('b' + team + '-' + Math.random().toString(36).slice(2, 6));
  this.squadGroup = g || 0; this.squadAnchor = null; this.unitId = null;
  this.alive = true; this.target = null;
  global.soldiers.push(this);
};
global.Bot.prototype.spawn = function () { this.alive = true; this.target = null; return true; };
global.Bot.prototype.spawnInVehicle = function () { this.alive = true; return true; };
global.Bot.prototype.die = function () { this.alive = false; };
global.startMatch = function () { return 1; };
global.updateHUD = function () { return 1; };

// 注: 去掉 'use strict' 是测试桩的让步 —— strict 下间接 eval 的顶层 function 声明
// 不会挂到 global, 测不到 reformAllUnits / unitBlocks。真实 <script> 加载是全局作用域。
// UNITS / UNIT_SIZE 是顶层 const —— 即使去掉 strict, 间接 eval 里的 const 也只在 eval 作用域,
// 所以在源码尾部追加一行导出, 让测试能拿到同一份引用。
const src = fs.readFileSync(path.join('js', '47_units.js'), 'utf8')
  .replace(/^\s*['"]use strict['"];?\s*/m, '/* strict removed for test */')
  + '\n;globalThis.__UNITS=UNITS; globalThis.__UNIT_SIZE=UNIT_SIZE;';
log('=== 47_units.js 加载 ===');
let ok = false;
try { (0, eval)(src); ok = true; log('顶层加载: OK'); }
catch (e) { log('顶层加载: FAIL -> ' + e.constructor.name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')); }

if (ok) {
  const U = global.__UNITS;
  log('UNIT_SIZE = ' + global.__UNIT_SIZE);
  const dump = () => Object.keys(U).sort().map(k => `${k}[${U[k].members.length}${U[k].under ? ' 缺编' : ''} 活${U[k].alive}]`).join(' ');

  log('');
  log('--- ① 开局静态分配 (敌 12 人 / 友 3 人) ---');
  global.soldiers.length = 0;
  for (let i = 0; i < 12; i++) new global.Bot(1, Math.floor(i / 4) + 1);   // squadGroup 1/2/3 各 4 人
  for (let i = 0; i < 3; i++) new global.Bot(0, 1);                        // 友军 3 人, 组 1
  global.startMatch();                                                     // 包裹后会自动 reformAllUnits
  log('单位表: ' + dump());
  const sizes = Object.keys(U).map(k => U[k].members.length);
  log('每单位人数: ' + JSON.stringify(sizes) + '  (期望 4,4,4,3)');
  log('不足编标记: ' + Object.keys(U).sort().map(k => k + '=' + U[k].under).join(' '));
  log('player.unitId = ' + global.player.unitId + '  (期望 U0-1, 编外成员)');
  log('玩家是否占编制: ' + (Object.keys(U).every(k => U[k].members.indexOf(global.player) < 0) ? 'OK 不占' : 'FAIL'));

  log('');
  log('--- ② 余数进不足编单位 (敌 5 人全在同一 squadGroup) ---');
  for (const k in U) delete U[k];
  global.soldiers.length = 0;
  for (let i = 0; i < 5; i++) new global.Bot(1, 1);
  global.reformAllUnits();
  log('单位表: ' + dump() + '  (期望 U1-1[4] + U1-2[1 缺编])');

  log('');
  log('--- ③ 15 人 → 3 满编 + 1 不足编 ---');
  for (const k in U) delete U[k];
  global.soldiers.length = 0;
  for (let i = 0; i < 15; i++) new global.Bot(1, 0);      // squadGroup=0 未编队
  global.reformAllUnits();
  log('单位表: ' + dump() + '  (期望 4,4,4,3)');

  log('');
  log('--- ④ 同单位过滤 unitBlocks ---');
  for (const k in U) delete U[k];
  global.soldiers.length = 0;
  const a = new global.Bot(1, 1), b = new global.Bot(1, 1), c = new global.Bot(1, 1), d = new global.Bot(1, 1);
  const e2 = new global.Bot(1, 1);                       // 第 5 人 → 另一单位
  global.reformAllUnits();
  log('分组: ' + [a, b, c, d, e2].map(x => x.name + '→' + x.unitId).join(' '));
  log('同单位 a→b 应阻断: ' + (global.unitBlocks(a, b) ? 'OK true' : 'FAIL false'));
  log('跨单位 a→e 应放行: ' + (global.unitBlocks(a, e2) ? 'FAIL true' : 'OK false'));
  log('对自己 a→a 保留自伤: ' + (global.unitBlocks(a, a) ? 'FAIL true' : 'OK false'));
  log('无单位者 玩家→b: ' + (global.unitBlocks(global.player, b) ? 'FAIL true' : 'OK false'));
  log('玩家(unitId=U0-1) vs 友军不存在时: ' + (global.unitBlocks({ unitId: 'U0-1' }, { unitId: 'U0-1' }) ? 'OK true' : 'FAIL'));

  log('');
  log('--- ⑤ 阵亡: 保留编制位, 只降存活数 ---');
  const ua = U[a.unitId];
  const before = ua.members.length + '/' + ua.alive;
  a.die();
  log(`${a.unitId} 阵亡前 ${before} → 阵亡后 ${ua.members.length}/${ua.alive} (编制不变, 存活-1)`);
  log('单位 under 标记 = ' + ua.under + ' (编制仍 4 → false, 只是有空位)');

  log('');
  log('--- ⑥ 重生: 回原单位 ---');
  a.spawn();
  log('重生后 ' + a.name + ' → ' + a.unitId + ' · 存活数 ' + U[a.unitId].alive);

  log('');
  log('--- ⑦ 原单位满编时改补缺编单位 ---');
  for (const k in U) delete U[k];
  global.soldiers.length = 0;
  const m = [];
  for (let i = 0; i < 8; i++) m.push(new global.Bot(1, i < 4 ? 1 : 2));
  global.reformAllUnits();
  const extra = new global.Bot(1, 1);          // 原单位 U1-1 已满
  global.assignUnit(extra);
  log('新增 ' + extra.name + ' → ' + extra.unitId + ' · ' + dump());

  log('');
  log('--- ⑧ 不足编合并 (2+2, 无人交战) ---');
  for (const k in U) delete U[k];
  global.soldiers.length = 0;
  const p1 = new global.Bot(1, 1), p2 = new global.Bot(1, 1), p3 = new global.Bot(1, 2), p4 = new global.Bot(1, 2);
  global.reformAllUnits();
  log('合并前: ' + dump());
  global.unitMergePass();
  log('合并后: ' + dump() + '  (期望只剩一个 4 人单位)');
  log('四人同一单位: ' + ([p1, p2, p3, p4].every(x => x.unitId === p1.unitId) ? 'OK' : 'FAIL'));

  log('');
  log('--- ⑨ 交战中不合并 ---');
  for (const k in U) delete U[k];
  global.soldiers.length = 0;
  const q1 = new global.Bot(1, 1), q2 = new global.Bot(1, 1), q3 = new global.Bot(1, 2), q4 = new global.Bot(1, 2);
  global.reformAllUnits();
  q1.target = { alive: true };                  // q1 正在交战
  global.unitMergePass();
  log('交战中合并后: ' + dump() + '  (期望仍是两个 2 人单位)');

  log('');
  log('--- ⑩ 编队与既有小队 AI 对齐 (squadGroup / squadAnchor) ---');
  for (const k in U) delete U[k];
  global.soldiers.length = 0;
  const r1 = new global.Bot(1, 1); r1.squadAnchor = { x: 10, z: 20 };
  const r2 = new global.Bot(1, 1); const r3 = new global.Bot(1, 1); const r4 = new global.Bot(1, 1);
  const r5 = new global.Bot(1, 1);
  global.reformAllUnits();
  log('squadGroup: ' + [r1, r2, r3, r4, r5].map(x => x.squadGroup).join(',') + '  (期望 1,1,1,1,2)');
  log('锚点继承: U1-1.anchor=' + JSON.stringify(U['U1-1'].anchor) + ' · r5.anchor=' + JSON.stringify(r5.squadAnchor));
}
fs.writeFileSync(path.join('_tools', 'unit_load.txt'), out.join('\n') + '\n', 'utf8');
