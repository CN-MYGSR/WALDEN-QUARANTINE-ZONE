'use strict';
// ===================== ELO 敌方强度注入 =====================
// 为什么单独一个文件: 19_bot 里的 EFF_DIFF 是全体 AI 共用的 (友军也读它),
// 直接缩放 EFF_DIFF 会让友军一起变强, 对玩家的实际难度几乎不变。
// 所以 ELO 的乘区必须落在**敌方 bot 实例**上。
//
// 复用既有的分层注入链: 39_quests 定义 applyPrestigeBot 并挂到 Bot.prototype.spawn,
// 41_raidloot 在其上乘"己方削弱", 43_maps 再乘"地图系数"。本文件加载最晚 → 位于最外层,
// 三层自然相乘, 无需改动任何既有函数体。
// 注意: 39_quests 每次 spawn 都是**赋值** hpMul/reactMul/sprMul (不是累乘),
// 因此这里的 `(bot.hpMul||1)*x` 不会跨局累积。
const _eloPrevApplyPrestigeBot = applyPrestigeBot;
applyPrestigeBot = function(bot){
  _eloPrevApplyPrestigeBot(bot);
  if(!bot || typeof player === 'undefined' || typeof ELO === 'undefined') return;
  if(bot.team === player.team) return;      // 只强化敌方, 友军完全不受影响
  if(!ELO.auto) return;
  bot.hpMul    = (bot.hpMul    || 1) * ELO.enemyHp;
  bot.reactMul = (bot.reactMul || 1) * ELO.enemyReact;
  bot.sprMul   = (bot.sprMul   || 1) * ELO.enemySpread;
  bot.visMul   = (bot.visMul   || 1) * ELO.enemyVis;    // 读取点: 19_bot perceive()
  bot.dmgMul   = (bot.dmgMul   || 1) * ELO.enemyDmg;    // 读取点: 18_ballistics
  bot.eloScaled = true;
};
