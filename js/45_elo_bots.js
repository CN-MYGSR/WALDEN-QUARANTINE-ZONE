'use strict';
// ===================== ELO 强度注入 (敌我双方) =====================
// ⚠️ 2026-09-17 用户要求「我方 NPC 和敌方一样强, 套用同一套强度代码」。
//    原设计是「ELO 乘区只落敌方 bot 实例」—— 理由是 19_bot 的 EFF_DIFF 全体 AI 共用,
//    缩放 EFF_DIFF 会让友军一起变强, 对玩家的实际难度几乎不变。
//    但那带来的副作用是: 评分越高, 敌人越强、队友原地不动, 表现就是
//    「玩家和敌人都在变强, 我方 NPC 一直很弱」。现在改成**双方同吃同一套乘区**。
//    副作用(已知): ELO 的"数值难度"维度变成对称的 —— 难度提升主要来自
//    兵力规模(ELO.enemyCount, 本来就双方同步) 与玩家自己的相对位置。
//
// 复用既有的分层注入链: 39_quests 定义 applyPrestigeBot 并挂到 Bot.prototype.spawn,
// 41_raidloot 在其上乘"己方基础系数"(现已=1), 43_maps 再乘"地图系数"。本文件加载最晚 →
// 位于最外层, 三层自然相乘, 无需改动任何既有函数体。
// 注意: 39_quests 每次 spawn 都是**赋值** hpMul/reactMul/sprMul (不是累乘),
// 因此这里的 `(bot.hpMul||1)*x` 不会跨局累积。
const _eloPrevApplyPrestigeBot = applyPrestigeBot;
applyPrestigeBot = function(bot){
  _eloPrevApplyPrestigeBot(bot);
  if(!bot || typeof player === 'undefined' || typeof ELO === 'undefined') return;
  if(!ELO.auto) return;
  // 敌我双方同吃 —— 不再 `if(bot.team===player.team) return;`
  bot.hpMul    = (bot.hpMul    || 1) * ELO.enemyHp;
  bot.reactMul = (bot.reactMul || 1) * ELO.enemyReact;
  bot.sprMul   = (bot.sprMul   || 1) * ELO.enemySpread;
  bot.visMul   = (bot.visMul   || 1) * ELO.enemyVis;    // 读取点: 19_bot perceive()
  bot.dmgMul   = (bot.dmgMul   || 1) * ELO.enemyDmg;    // 读取点: 18_ballistics
  bot.eloScaled = true;
};
