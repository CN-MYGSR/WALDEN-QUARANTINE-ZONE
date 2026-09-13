'use strict';
// ===================== ELO 动态难度 =====================
// 目的: 让"敌方强度"跟着玩家的真实水平走 —— 打得越好敌人越强, 连续吃瘪自动放水。
// 避免固定难度档位下"新手被老兵档按死 / 高手觉得精英档太软"。
//
// ── 评分模型 ──
// 简化 ELO: 对手评级恒等于玩家当前评级 → 期望表现 E 恒为 0.5
//     rating += K * (perf - 0.5) * 2
// perf ∈ [0,1] 由本局结果算出 (见 eloPerf)。K 非对称: 失败时更大,
// 让"被碾压"较快换来难度下降 (单机游戏里"及时放水"比"评分严谨"更重要)。
// 前 ELO_PROVISIONAL 局用更大的 K, 快速定位玩家水平。
//
// ── 难度映射 ──
//     t = clamp((rating - ELO_BASE)/ELO_SPAN, -1, 1)
// 每个维度一个满档倍率 g: 越小越强的维度用 g^(-t), 越大越强的维度用 g^(+t)。
// t = 0 时所有乘区恰好为 1 → 中性点行为完全可预期。
//
// ── 关键: 只强化"敌方" ──
// 19_bot 里的 EFF_DIFF 是**全体 AI 共用**的 (友军也读它)。如果直接缩放 EFF_DIFF,
// 友军会一起变强, 对玩家的实际难度几乎不变 —— 等于白做。
// 因此 ELO 的乘区一律通过 applyPrestigeBot 注入到**敌方 bot 实例**上
// (见 js/45_elo_bots.js, 与 41_raidloot / 43_maps 的分层注入同构)。
// EFF_DIFF 只负责透传玩家手选的基准档, 不含 ELO。

const ELO_START = 900;          // 新档初始评分 (低于中性点, 给新玩家一点放水)
const ELO_BASE  = 1000;         // 中性评分: 此处乘区全为 1
const ELO_SPAN  = 380;          // 偏离中性点多少算"满档"
const ELO_MIN   = 400;
const ELO_MAX   = 1900;
const ELO_K_WIN  = 30;          // 表现好时的 K
const ELO_K_LOSE = 46;          // 表现差时的 K (放水更快)
const ELO_PROVISIONAL = 8;      // 前 N 局用更大 K, 快速定位玩家水平
const ELO_PROV_K = 1.6;
// 各维度的满档倍率 (t=±1 时的极值), 均为 >1 的常数
const ELO_GAIN = { hp:1.38, react:1.85, spread:2.10, vis:1.30, dmg:1.75, count:1.20 };
// ── 装备价值 (gear) 维度 ──
// 本局带入的装备越贵, 敌方越强 —— 高价装备 = 高风险高回报, 廉价装备 = 小幅放水。
// gearT = clamp((gearValue - ELO_GEAR_BASE)/ELO_GEAR_SPAN, -1, 1), 与技巧 t 相加后夹紧。
const ELO_GEAR_BASE   = 1500;   // 中性装备估值(¥): 一套中规中矩的装备
const ELO_GEAR_SPAN   = 2500;   // 满档跨度(¥)
const ELO_GEAR_WEIGHT = 0.6;    // 装备对难度的权重(相对技巧 t 的比例)
// 段位 (评分下界 → 名称), 从高到低
const ELO_TIERS = [[1550,'传 说'],[1330,'精 英'],[1150,'老 练'],[980,'老 兵'],[820,'学 员'],[0,'新 兵']];

const ELO = {
  rating: ELO_START,
  peak:   ELO_START,
  raids:  0,          // 已结算局数 (决定是否处于临时 K 阶段)
  auto:   true,       // ELO 是否接管难度
  t:      0,          // 归一化档位 [-1,1]
  // 敌方专属乘区 (1 = 与基准档一致)
  enemyHp:1, enemyReact:1, enemySpread:1, enemyVis:1, enemyDmg:1, enemyCount:1,
  gearValue:0, gearT:0,
  lastDelta:0, lastPerf:0.5, lastFrom:ELO_START,
};

// 实时生效的基准难度表 (AI 通用读取点)。注意: 这里**不含 ELO**,
// 只是把原先散落的 DIFF_TABLE[SETTINGS.diff] 收敛成一个可观察的读取点。
const EFF_DIFF = {
  react:      DIFF_TABLE[1].react,
  spreadMul:  DIFF_TABLE[1].spreadMul,
  dmgMul:     DIFF_TABLE[1].dmgMul,
  visMul:     DIFF_TABLE[1].visMul,
  name:       DIFF_TABLE[1].name,
};

function eloTier(r){
  for(let i=0;i<ELO_TIERS.length;i++) if(r>=ELO_TIERS[i][0]) return ELO_TIERS[i][1];
  return ELO_TIERS[ELO_TIERS.length-1][1];
}
// 当前出击装备的市价估值: 主/副武器 + 改装费 + 防弹衣 + 夜视仪 + 投掷物。
// 本文件加载早于 38_tarkov/14b/46, 所以这里全用 typeof 守卫 + 运行时取值。
function eloGearValue(){
  let L=null;
  try{ L=(typeof META!=='undefined'&&META&&META.loadout)?META.loadout:null; }catch(e){ L=null; }
  if(!L) return 0;
  let v=0;
  const price=k=>{ try{ return (typeof itemPriceOf==='function'&&itemPriceOf(k))||0; }catch(e){ return 0; } };
  if(L.primary) v+=price(L.primary);
  if(L.secondary) v+=price(L.secondary);
  if(L.armor) v+=price(L.armor);
  if(L.nvg) v+=price('nvg');
  if(typeof modTotalCost==='function'){
    try{ if(L.primary) v+=modTotalCost(L.primary); }catch(e){}
    try{ if(L.secondary) v+=modTotalCost(L.secondary); }catch(e){}
  }
  if(typeof THROW_DEFS!=='undefined'&&L.throwables){
    for(const k in THROW_DEFS){ const n=(L.throwables[k]|0); if(n>0) v+=n*THROW_DEFS[k].price; }
  }
  return Math.round(v);
}
// 重算"评分 + 基准档"派生出的全部难度系数。ELO 关闭时 t=0, 所有敌方乘区 = 1。
function eloRecalc(){
  const base=DIFF_TABLE[clamp(SETTINGS.diff|0,0,DIFF_TABLE.length-1)];
  EFF_DIFF.react    =base.react;
  EFF_DIFF.spreadMul=base.spreadMul;
  EFF_DIFF.dmgMul   =base.dmgMul;
  EFF_DIFF.visMul   =base.visMul;
  EFF_DIFF.name     =base.name;
  const tSkill=ELO.auto?clamp((ELO.rating-ELO_BASE)/ELO_SPAN,-1,1):0;
  // 装备维度: 本局带入装备的市价估值叠加进难度 —— 高价装备更难, 廉价装备小幅放水
  const gv=eloGearValue();
  const tGear=ELO.auto?clamp((gv-ELO_GEAR_BASE)/ELO_GEAR_SPAN,-1,1):0;
  const t=clamp(tSkill+tGear*ELO_GEAR_WEIGHT,-1,1);
  ELO.t=t; ELO.gearValue=gv; ELO.gearT=tGear;
  const g=ELO_GAIN;
  ELO.enemyHp    =Math.pow(g.hp,     t);   // 血更多 = 更强
  ELO.enemyReact =Math.pow(g.react, -t);   // 反应时间更短 = 更强
  ELO.enemySpread=Math.pow(g.spread,-t);   // 散布更小 = 更准
  ELO.enemyVis   =Math.pow(g.vis,    t);   // 视野更远 = 更强
  ELO.enemyDmg   =Math.pow(g.dmg,    t);   // 伤害更高 = 更强
  ELO.enemyCount =Math.pow(g.count,  t);   // 兵力规模
  return EFF_DIFF;
}
// 本局表现分 [0,1]; 0.5 为"符合当前评分预期"的中位表现。
// 标定原则: 白白阵亡必须明显低于 0.5, 只有"虽败犹荣"(多杀多搜)才接近中位。
function eloPerf(extracted,lootValue){
  let p=extracted?0.58:0.24;
  p+=0.045*Math.min(RUN.kills||0,5);           // 击杀, 最多 +0.225
  p+=0.015*Math.min(RUN.searches||0,5);        // 搜索, 最多 +0.075
  p+=0.15*clamp((lootValue||0)/60000,0,1);     // 带出价值, 最多 +0.15
  return clamp(p,0.02,0.98);
}
// 一局结束: 结算评分。返回 {from,to,delta,perf,tier}
function eloApplyRaid(extracted,lootValue){
  const perf=eloPerf(extracted,lootValue);
  const prov=ELO.raids<ELO_PROVISIONAL?ELO_PROV_K:1;
  const K=prov*(perf<0.5?ELO_K_LOSE:ELO_K_WIN);
  const from=ELO.rating;
  const to=clamp(Math.round(from+K*(perf-0.5)*2),ELO_MIN,ELO_MAX);
  ELO.rating=to; ELO.peak=Math.max(ELO.peak,to); ELO.raids++;
  ELO.lastFrom=from; ELO.lastDelta=to-from; ELO.lastPerf=perf;
  eloRecalc(); eloSave();
  return {from,to,delta:to-from,perf,tier:eloTier(to)};
}
// 兵力规模随评分浮动 (战场规模, 双方同步 → 主要影响战斗烈度与局时长)
function eloApplyForceSize(){
  if(typeof SIZE_OPTS==='undefined'||typeof BOTS_PER_TEAM==='undefined') return;
  const o=SIZE_OPTS[clamp(SIZE_IDX|0,0,SIZE_OPTS.length-1)];
  BOTS_PER_TEAM=Math.max(4,Math.round(o.bots*ELO.enemyCount));
  const tk=Math.max(60,Math.round(o.tk*ELO.enemyCount));
  tickets[0]=tk; tickets[1]=tk;
}
// ---- 持久化: 挂在 META 上, 与钱包/仓库共用一份存档 ----
function eloSyncFromMeta(){
  try{
    const e=META.elo;
    if(e&&typeof e==='object'){
      if(isFinite(e.rating)) ELO.rating=clamp(Math.round(e.rating),ELO_MIN,ELO_MAX);
      if(isFinite(e.peak))   ELO.peak=Math.max(ELO.rating,Math.round(e.peak));
      if(isFinite(e.raids))  ELO.raids=Math.max(0,e.raids|0);
      if(typeof e.auto==='boolean') ELO.auto=e.auto;
    }
  }catch(err){}
  ELO.peak=Math.max(ELO.peak,ELO.rating);
  eloRecalc();
}
function eloSave(){
  try{
    META.elo={rating:ELO.rating,peak:ELO.peak,raids:ELO.raids,auto:ELO.auto};
    if(typeof saveMeta==='function') saveMeta();
  }catch(err){}
}
function eloSetAuto(on){ ELO.auto=!!on; eloRecalc(); eloSave(); if(typeof eloRenderUI==='function') eloRenderUI(); }
// 一行摘要 (精度/反应用倒数表示"越强数字越大")
function eloSummary(){
  if(!ELO.auto) return '动态难度已关闭 · 敌方固定使用「'+EFF_DIFF.name+'」档';
  const s=v=>(Math.round(v*100)/100).toFixed(2);
  const fmt=typeof formatMoney==='function'?formatMoney:String;
  const gv=ELO.gearValue||0;
  const gearTxt=gv>0
    ?` · 装备 ¥${fmt(gv)}（${ELO.gearT>=0?'+':''}${Math.round(ELO.gearT*ELO_GEAR_WEIGHT*100)}% 难度）`
    :'';
  return '敌方 血量 ×'+s(ELO.enemyHp)+' · 精度 ×'+s(1/ELO.enemySpread)
    +' · 反应 ×'+s(1/ELO.enemyReact)+' · 视野 ×'+s(ELO.enemyVis)+' · 伤害 ×'+s(ELO.enemyDmg)+gearTxt;
}
eloRecalc();
