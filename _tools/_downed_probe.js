// 倒地/救援机制探针: 真跑 57_downed.js 的纯逻辑
// 用法: node _tools/_downed_probe.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/57_downed.js'), 'utf8');

// ---------- 桩 ----------
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let matchOver = false;
const combatants = [];
let dieCalls = [];
const showScorePop = () => {};
const VM = { adsBlend: 0, root: { visible: true } };
const document = { getElementById: () => null };
const standHeight = () => 0;
const updatePlayer = function () { return 'orig'; };
function V3(x, y, z) { return { x, y, z }; }
class Bot {
  constructor(team, x, z) { this.team = team; this.pos = V3(x, 0, z); this.alive = true; this.hp = 100; this.downed = false; this.state = 'idle'; this.onVehicle = null; this.prone = false; this.invulT = 0; this.vel = { set() {} }; this.repathT = 0; this.path = null; this.mesh = null; }
  die(a, h) { this.alive = false; this.downed = false; dieCalls.push(this.name || 'bot'); }
  damage() { /* 由 wrap 接管 */ }
  update() { return 'botorig'; }
  settleAir() {}
  updateMesh() {}
  followPath() { return null; }
  setPathTo() {}
  faceTo() {}
}
const player = {
  isPlayer: true, team: 0, alive: true, hp: 100, downed: false, downT: 0, invulT: 0,
  pos: V3(0, 0, 0), prone: false, crouch: false, ads: false, braced: false, onMG: null, onMortar: null, onAT: null, onAA: null, onVehicle: null,
  die(a, h) { this.alive = false; this.downed = false; dieCalls.push('player'); },
  damage() {},
};
let dmgFlash = 0;
const window = {};

// ---------- eval ----------
const fn = new Function('matchOver', 'combatants', 'dieCalls', 'showScorePop', 'VM', 'document', 'standHeight', 'updatePlayer', 'V3', 'Bot', 'player', 'dmgFlash', 'localStorage', 'window',
  src + '\nreturn { goDown, reviveUnit, canGoDown, canBeRescued, nearestDownedMate, nearestDownedMateNear, DOWN_MAX_T, DOWN_RESCUE_T, DOWN_RESCUE_R, DOWN_REVIVE_HP, updatePlayerDowned, playerTryRescue, playerRescueTick, setMatchOver:v=>{matchOver=v}, getDownHud:()=>_downHudLast };');
const M = fn(matchOver, combatants, dieCalls, showScorePop, VM, document, standHeight, updatePlayer, V3, Bot, player, dmgFlash, localStorage, window);

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

console.log('=== 1. 非爆头致死 → 倒地 (不是死亡) ===');
{
  dieCalls.length = 0;
  player.alive = true; player.downed = false; player.hp = 100;
  player.die(null, false);
  if (player.downed && player.alive && dieCalls.length === 0) ok('玩家被打倒 → downed=true, 没有真正死亡');
  else bad('玩家没有进入倒地 (downed=' + player.downed + ' dieCalls=' + dieCalls.length + ')');
  if (player.downT === M.DOWN_MAX_T) ok('倒地计时 = ' + M.DOWN_MAX_T + ' 秒');
  else bad('倒地计时不对: ' + player.downT);
  if (player.hp === 0) ok('倒地时血量归零');
  else bad('倒地时血量不是 0: ' + player.hp);
}

console.log('\n=== 2. 爆头致死 → 不给倒地机会 ===');
{
  dieCalls.length = 0;
  player.alive = true; player.downed = false;
  player.die(null, true);
  if (!player.downed && dieCalls.length === 1) ok('爆头直接死亡');
  else bad('爆头竟然进入了倒地 (downed=' + player.downed + ')');
}

console.log('\n=== 3. 已倒地者不会再「倒地」一次 ===');
{
  player.alive = true; player.downed = true;
  const r = M.canGoDown(player, false);
  if (r === false) ok('canGoDown 对已倒地者返回 false');
  else bad('canGoDown 对已倒地者返回 true —— 会无限倒地');
}

console.log('\n=== 4. 倒地后再中弹 = 加速流血 (不直接死) ===');
{
  player.downed = true; player.downT = 60; player.invulT = 0;
  const before = player.downT;
  player.damage(40, null, false, 'torso');
  if (player.downed && player.downT < before) ok('中弹 40 → 倒地计时 ' + before + ' → ' + player.downT.toFixed(1) + ' (仍在倒地)');
  else bad('倒地中弹后状态不对: downed=' + player.downed + ' downT=' + player.downT);
  player.damage(40, null, true, 'head');
  if (player.downT === 0) ok('倒地时被爆头 → 计时归零 (处决)');
  else bad('倒地爆头没有处决: downT=' + player.downT);
}

console.log('\n=== 5. 倒地 60 秒没人救 → 真死 ===');
{
  dieCalls.length = 0;
  player.alive = true; player.downed = true; player.downT = 0.5;
  M.updatePlayerDowned(1.0);
  if (!player.downed && dieCalls.length === 1) ok('计时归零 → 真正死亡');
  else bad('超时没有死亡: downed=' + player.downed + ' dieCalls=' + dieCalls.length);
}

console.log('\n=== 6. 救起 ===');
{
  player.alive = true; player.downed = true; player.downT = 30; player.hp = 0;
  const r = M.reviveUnit(player, null);
  if (r && !player.downed && player.hp === M.DOWN_REVIVE_HP) ok('救起 → 血量恢复到 ' + M.DOWN_REVIVE_HP);
  else bad('救起失败: downed=' + player.downed + ' hp=' + player.hp);
  if (player.invulT > 0) ok('救起后有 ' + player.invulT + ' 秒无敌');
  else bad('救起后没有无敌时间');
}

console.log('\n=== 7. 救起后的无敌真的挡伤害 ===');
{
  player.downed = false; player.invulT = 2.0; player.hp = 35;
  player.damage(999, null, false, 'torso');
  if (player.hp === 35) ok('无敌期间伤害被完全挡下');
  else bad('无敌没有生效, hp=' + player.hp);
  player.invulT = 0;
}

console.log('\n=== 8. 找最近的可救队友 (只找同队) ===');
{
  combatants.length = 0;
  const me = new Bot(0, 0, 0); me.alive = true;
  const nearMate = new Bot(0, 5, 0); nearMate.alive = true; nearMate.downed = true; nearMate.downT = 30;
  const farMate = new Bot(0, 40, 0); farMate.alive = true; farMate.downed = true; farMate.downT = 30;
  const enemy = new Bot(1, 2, 0); enemy.alive = true; enemy.downed = true; enemy.downT = 30;
  const deadMate = new Bot(0, 1, 0); deadMate.alive = false; deadMate.downed = true;
  combatants.push(me, nearMate, farMate, enemy, deadMate);
  const t = M.nearestDownedMate(me, 55);
  if (t === nearMate) ok('选中最近的同队倒地队友 (5m), 跳过敌人与尸体');
  else bad('选错了救援目标: ' + (t && t.pos ? ('x=' + t.pos.x) : t));
  const t2 = M.nearestDownedMate(me, 3);
  if (t2 === null) ok('超出搜索半径时返回 null');
  else bad('超出半径仍然选中了目标');
}

console.log('\n=== 9. NPC 决策优先级: 有威胁时不去救 (战斗优先) ===');
{
  combatants.length = 0;
  const me = new Bot(0, 0, 0);
  const mate = new Bot(0, 5, 0); mate.alive = true; mate.downed = true; mate.downT = 30;
  combatants.push(me, mate);
  me.prone = false; me.onVehicle = null;
  const engaged = me.tryStartRescue(true, 10);     // 有威胁 + 敌人近
  if (engaged === false) ok('交战且敌人 10m 内 → 不救, 继续打 (战斗优先级最高)');
  else bad('有威胁时仍然去救 —— 优先级错了');
  const calm = me.tryStartRescue(false, 40);       // 没威胁
  if (calm === true && me.state === 'rescue' && me.rescueMate === mate) ok('没威胁 → 去救最近的倒地队友');
  else bad('没威胁时没有去救: state=' + me.state);
}

console.log('\n=== 10. 没有倒地队友时不拦截 (让位给搜索) ===');
{
  combatants.length = 0;
  const me = new Bot(0, 0, 0);
  combatants.push(me);
  if (me.tryStartRescue(false, 40) === false) ok('没有倒地队友 → 返回 false, 决策继续往下走 (搜索)');
  else bad('没有倒地队友时仍然拦住了决策');
}

console.log('\n=== 11. 敌方倒地不会被当成救援目标 ===');
{
  combatants.length = 0;
  const me = new Bot(0, 0, 0);
  const enemy = new Bot(1, 2, 0); enemy.alive = true; enemy.downed = true; enemy.downT = 30;
  combatants.push(me, enemy);
  if (M.nearestDownedMate(me, 55) === null) ok('不救敌方倒地单位');
  else bad('竟然会去救敌人');
}

console.log('\n=== 12. 玩家救援读条 (走开就中断) ===');
{
  combatants.length = 0;
  player.team = 0; player.alive = true; player.downed = false; player.rescueTarget = null; player.rescueProg = 0;
  player.pos = V3(0, 0, 0);
  const mate = new Bot(0, 1.5, 0); mate.alive = true; mate.downed = true; mate.downT = 40;
  combatants.push(player, mate);
  const started = M.playerTryRescue();
  if (started && player.rescueTarget === mate) ok('F 启动救援');
  else bad('没能启动救援');
  M.playerRescueTick(2.0);
  if (player.rescueProg > 1.9 && player.rescueTarget === mate) ok('读条推进 2.0s (' + player.rescueProg.toFixed(1) + '/' + M.DOWN_RESCUE_T + ')');
  else bad('读条没有推进: ' + player.rescueProg);
  M.playerRescueTick(2.5);
  if (!player.rescueTarget && !mate.downed && mate.hp > 0) ok('读满 ' + M.DOWN_RESCUE_T + 's → 队友被救起 (hp=' + mate.hp + ')');
  else bad('读满后没有救起: target=' + !!player.rescueTarget + ' downed=' + mate.downed);
  // 走开中断
  mate.downed = true; mate.downT = 40; player.rescueProg = 0;
  player.rescueTarget = mate; player.pos = V3(50, 0, 0);
  M.playerRescueTick(0.5);
  if (!player.rescueTarget) ok('离开范围 → 救援中断');
  else bad('走开了还在救');
}

console.log('\n' + (fail ? ('❌ ' + fail + ' 项失败 / ' + pass + ' 项通过') : ('✅ 全部通过 (' + pass + ' 项)')));
process.exit(fail ? 1 : 0);
