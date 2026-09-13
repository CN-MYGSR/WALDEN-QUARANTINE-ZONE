'use strict';
// ===================== 单位(Unit)编队 + 同单位伤害过滤 =====================
// 需求: 敌方 NPC 每 4 人一个单位, 每个 NPC 记录单位 ID, 余数进"不足编单位";
//       选目标与造成伤害时排除同单位目标; 非同单位的敌方正常锁定/追击/攻击。
//
// 设计要点(下面逐条对应需求):
//  ① 划分时机 —— "开局静态分配 + 事件驱动增量维护", 不做每帧全量重排:
//     · 静态: 每局 startMatch() 结束后按 (阵营, 既有 squadGroup) 每 4 人切一个单位,
//             余数进同一阵营最后一个(新的)不足编单位。
//     · 增量: 阵亡 / 重生 / 新增 / 上下载具 只做局部调整, 见 ③。
//     为什么不每帧重排: 重排会改 squadGroup → 改 squadAnchor → 小队目标点瞬间跳变,
//     AI 会原地打转。编队必须是"低频 + 稳定"的。
//  ② 数据结构 —— 全局表 UNITS: unitId -> unit; NPC 身上只存 unitId(字符串):
//       UNITS['U1-2'] = { id, team, g, members:[bot...], anchor:{x,z}|null,
//                         roster:4(编制), alive:n, under:bool }
//       bot.unitId = 'U1-2'
//     ID 规则 'U<team>-<g>': **必须带 team**, 因为既有 squadGroup 在敌我双方都用 1,
//     直接用 squadGroup 当单位 ID 会让"友军 1 组"和"敌军 1 组"撞成同一个单位。
//  ③ 成员变动如何重编:
//     · 阵亡: 保留编制位(单位不解散、不补人)。死亡只是空出一个位, 单位标记 under。
//             理由: 非撤离模式 Bot 会重生, 若一死就重编, 单位会在"缺编/满编"之间反复横跳。
//     · 重生/新增: assignUnit() 优先回原单位, 原单位满编则补"人最多但未满"的缺编单位,
//             都不行才新建不足编单位。
//     · 脱离(上载具/下车/被载具带走): 仍在编制内, unitBlocks 依旧生效,
//             只是不参与编队走位 —— 载具是临时状态, 不该拆散单位。
//     · 合并: 每 UNIT_MERGE_IV 秒扫一次, 同阵营两个"编制和 ≤ 4 且都没在交战"的单位合并,
//             合并后解散空单位。交战中不合并, 避免目标点跳变。
//  ④ 过滤插入点(全部走 unitBlocks(a,b), 未加载本文件时自动退化为按队伍):
//     · 目标选择: 19_bot perceive() 的 combatants 循环 + TANK_CREW_PROXIES 循环
//     · 伤害结算(硬闸): 19_bot damage() / 23_player damage() 入口直接 return,
//             同单位之间不结算任何伤害(自伤除外), 任何新增伤害路径都自动受此约束
//     · 弹道命中: 17_ragdoll raySoldiers() —— 同单位不吃这颗子弹
//     · 范围伤害: 18_ballistics explodeAt() + 20_tank splashDamage() —— 同单位免伤(自伤保留)
//  ⑤ 玩家 / 其他阵营: 玩家不进 members(避免玩家阵亡/重生打乱编队), 但会拿到
//     player.unitId 指向己方 1 组, 作为"编外成员" —— 于是对玩家的误伤过滤与友军一致。
//     另一个阵营(玩家侧)的 3 个友军 AI 走完全相同的单位规则。

const UNIT_SIZE=4;                       // 每单位编制人数
const UNIT_MERGE_IV=3.0;                 // 合并扫描间隔(秒)
const UNIT_MERGE=true;                   // 是否启用"不足编单位合并"
const UNITS={};                          // unitId -> unit

function unitKey(team,g){ return 'U'+team+'-'+g; }
function unitOf(ent){ return (ent&&ent.unitId)?UNITS[ent.unitId]:null; }
// 同单位判定: 任一方没有 unitId(玩家未编队/载具乘员/旧存档)都视为"不同单位"
function sameUnit(a,b){ return !!a&&!!b&&!!a.unitId&&a.unitId===b.unitId; }
// 是否应阻止 a 对 b 造成伤害/锁定。a===b 时返回 false —— **自伤保留**(手雷炸自己是设计)
function unitBlocks(a,b){
 if(!a||!b||a===b) return false;
 return sameUnit(a,b);
}
function unitAlive(u){ let n=0; for(const m of u.members) if(m&&m.alive) n++; return n; }
function unitRefresh(u){
 if(!u) return;
 u.under=u.members.length<UNIT_SIZE;
 u.alive=unitAlive(u);
}
function unitGet(team,g,anchor){
 const id=unitKey(team,g);
 let u=UNITS[id];
 if(!u) u=UNITS[id]={id:id,team:team,g:g,members:[],anchor:anchor||null,roster:UNIT_SIZE,alive:0,under:true};
 if(!u.anchor&&anchor) u.anchor=anchor;
 return u;
}
function unitNextG(team,start){
 let g=Math.max(1,start||1);
 while(UNITS[unitKey(team,g)]) g++;
 return g;
}
// 把一个 bot 编入单位(若原属别的单位则先退出)
function unitJoin(bot,u){
 if(!bot||!u) return;
 const old=unitOf(bot);
 if(old&&old!==u){
  const i=old.members.indexOf(bot);
  if(i>=0) old.members.splice(i,1);
  unitRefresh(old);
 }
 if(u.members.indexOf(bot)<0) u.members.push(bot);
 bot.unitId=u.id;
 u.team=bot.team;
 unitRefresh(u);
 // 与既有小队 AI 对齐: 独立小队 AI 读 squadGroup / squadAnchor (19_bot decide)
 bot.squadGroup=u.g;
 if(u.anchor) bot.squadAnchor=u.anchor;
}
// 分配单位: 回原单位 → 补最满的缺编单位 → 新建不足编单位
function assignUnit(bot){
 if(!bot) return null;
 let u=unitOf(bot);
 if(u&&u.team===bot.team){
  // 阵亡后仍在原单位名册里 → 重生时原地归队(保留编制位就是为了让他人能回来)
  if(u.members.indexOf(bot)>=0){ unitJoin(bot,u); return u; }
  if(u.members.length<UNIT_SIZE){ unitJoin(bot,u); return u; }
 }
 let best=null;
 for(const k in UNITS){
  const x=UNITS[k];
  if(x.team!==bot.team) continue;
  if(x.members.length>=UNIT_SIZE) continue;
  if(!best||x.members.length>best.members.length) best=x;   // "最满但未满" → 余数集中
 }
 if(best){ unitJoin(bot,best); return best; }
 u=unitGet(bot.team,unitNextG(bot.team,1),bot.squadAnchor||null);
 unitJoin(bot,u);
 return u;
}
// 全量重编(每局开打后调用一次)
function reformAllUnits(){
 for(const k in UNITS) delete UNITS[k];
 const groups=new Map();                       // "team:origGroup" -> [bot]
 const list=(typeof soldiers!=='undefined')?soldiers:[];
 for(const s of list){
  if(!s) continue;
  const key=s.team+':'+((s.squadGroup|0)||0);
  if(!groups.has(key)) groups.set(key,[]);
  groups.get(key).push(s);
 }
 for(const key of [...groups.keys()].sort()){
  const arr=groups.get(key);
  const team=arr[0].team;
  const origG=(arr[0].squadGroup|0)||0;
  let g=0;
  for(let i=0;i<arr.length;i++){
   if(i%UNIT_SIZE===0){
    // 第一块沿用原来的组号(保持既有 ENEMY_SQUADS 与锚点语义), 后续块开新组号
    g=(i===0&&origG>0)?origG:unitNextG(team,(i===0&&origG>0)?origG+1:g+1);
   }
   const u=unitGet(team,g,arr[i].squadAnchor||null);
   unitJoin(arr[i],u);
  }
 }
 for(const k in UNITS) unitRefresh(UNITS[k]);
 // 玩家: 编外成员, 归到己方编号最小的单位(伤害过滤与友军一致, 但不占编制)
 if(typeof player!=='undefined'&&player){
  let fu=null;
  for(const k in UNITS){ const u=UNITS[k]; if(u.team===player.team&&(!fu||u.g<fu.g)) fu=u; }
  player.unitId=fu?fu.id:null;
 }
 return UNITS;
}
// 不足编单位合并: 编制和 ≤ 4 且都没在交战才合并
function unitMergePass(){
 if(!UNIT_MERGE) return;
 for(const k in UNITS){
  const a=UNITS[k];
  if(!a.members.length||a.members.length>=UNIT_SIZE) continue;
  if(a.members.some(m=>m&&m.alive&&m.target&&m.target.alive)) continue;
  for(const k2 in UNITS){
   if(k2===k) continue;
   const b=UNITS[k2];
   if(b.team!==a.team||!b.members.length||b.members.length>=UNIT_SIZE) continue;
   if(a.members.length+b.members.length>UNIT_SIZE) continue;
   if(b.members.some(m=>m&&m.alive&&m.target&&m.target.alive)) continue;
   const moved=b.members.slice();
   for(const m of moved) unitJoin(m,a);
   delete UNITS[k2];                            // 解散被吸收的空单位
   break;
  }
 }
 for(const k in UNITS) unitRefresh(UNITS[k]);
}
let unitTickAcc=0;
function unitTick(dt){
 unitTickAcc+=(dt||0);
 if(unitTickAcc<UNIT_MERGE_IV) return;
 unitTickAcc=0;
 if(typeof matchOver!=='undefined'&&matchOver) return;
 unitMergePass();
}

// ---------- 挂接: 开局全量重编 ----------
const _uStartMatch=startMatch;
startMatch=function(){
 const r=_uStartMatch.apply(this,arguments);
 try{ reformAllUnits(); }catch(e){ console.warn('[unit] reform',e); }
 return r;
};
// ---------- 挂接: 生成/重生时分配单位 ----------
if(typeof Bot!=='undefined'&&Bot.prototype){
 const _uSpawn=Bot.prototype.spawn;
 Bot.prototype.spawn=function(){
  const r=_uSpawn.apply(this,arguments);
  try{ assignUnit(this); }catch(e){}
  return r;
 };
 if(Bot.prototype.spawnInVehicle){
  const _uSpawnV=Bot.prototype.spawnInVehicle;
  Bot.prototype.spawnInVehicle=function(){
   const r=_uSpawnV.apply(this,arguments);
   try{ assignUnit(this); }catch(e){}
   return r;
  };
 }
 // 阵亡: 保留编制位(不重编), 只刷新存活数
 const _uDie=Bot.prototype.die;
 Bot.prototype.die=function(){
  const r=_uDie.apply(this,arguments);
  try{ unitRefresh(unitOf(this)); }catch(e){}
  return r;
 };
}
// ---------- 挂接: 低频维护 ----------
const _uUpdateHUD=updateHUD;
updateHUD=function(dt){
 try{ unitTick(dt); }catch(e){}
 return _uUpdateHUD.apply(this,arguments);
};
