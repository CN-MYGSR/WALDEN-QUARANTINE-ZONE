// 一次性补丁: 阵营改名(SCAV/USEC) + SCAV 随机二战主武器 + 街区 NPC 中立
// 每处替换都断言命中次数, 任一不匹配立即报错退出, 不做部分写入。
const fs = require('fs');

const stats = [];
function rep(file, from, to, expect) {
  let s = fs.readFileSync(file, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const F = from.split('\n').join(eol);
  const T = to.split('\n').join(eol);
  const parts = s.split(F);
  const n = parts.length - 1;
  if (n !== expect) throw new Error(`[${file}] 命中 ${n} 次, 期望 ${expect} 次\n--- 片段 ---\n${from.slice(0, 200)}`);
  fs.writeFileSync(file, parts.join(T), 'utf8');
  stats.push(`${file}: ${n}x  ${from.slice(0, 46).replace(/\n/g, '\\n')}`);
}

// ============ js/01_data.js ============
const D1 = 'js/01_data.js';
rep(D1, "f:['us','ger'], theme:'cqb',", "f:['us','ger'], theme:'cqb', npcNeutral:true,", 1);
rep(D1, "sub:'地下生物设施 · 高价值物资 · NBK 守备', f:['us','nbk']",
        "sub:'地下生物设施 · 高价值物资 · USEC 守备', f:['us','usec']", 1);
rep(D1, "守备是 NBK 的合同精锐", "守备是 USEC 的合同精锐", 1);
rep(D1, "sub:'瓦尔登港 · 集装箱码头 · NBK 守备 · 出海唯一通道', f:['us','nbk']",
        "sub:'瓦尔登港 · 集装箱码头 · USEC 守备 · 出海唯一通道', f:['us','usec']", 1);
rep(D1, "us:{ name:'美国陆军', short:'美军', sym:'★', flagBg:'#3a5f9e', atn5:3,",
        "us:{ name:'SCAV 拾荒者', short:'SCAV', sym:'☠', flagBg:'#3a5f9e', atn5:3, scav:true,", 1);
rep(D1, "// ===== NBK 合同防务 (SWAT 风) =====", "// ===== USEC 联合安保 (SWAT 风) =====", 1);
rep(D1, "nbk:{ name:'NBK 合同防务', short:'NBK', sym:'✠', flagBg:'#0a0a0a',",
        "usec:{ name:'USEC 联合安保', short:'USEC', sym:'✠', flagBg:'#0a0a0a',", 1);
rep(D1, "// NBK 统一装备 M4 + P320: 所有 6 槽都是同一套, 让 NBK 走 numeric cls 路径时全员统一武器",
        "// USEC 统一装备 M4 + P320: 所有 6 槽都是同一套, 让 USEC 走 numeric cls 路径时全员统一武器", 1);
rep(D1, "const TEAM_COL=[0x8fc1ff,0xff9c8a];",
`const TEAM_COL=[0x8fc1ff,0xff9c8a];
// 中立 NPC 开关: 战役带 npcNeutral 标记时(街区), 全场 NPC 互不主动交火,
// 只在被攻击后对该攻击者(连同其同小队)还击。消费点见 19_bot.js 的 aggroOk/aggroOn。
// 用 var 而非 const: 方便其它脚本 typeof 探测, 也避免重名时抛 already declared。
var NPC_NEUTRAL=!!CAMPAIGN.npcNeutral;`, 1);

// ============ js/13_weapons_data.js ============
rep('js/13_weapons_data.js', "];\nlet PLAYER_ARSENAL_KEY=",
`];
// ===== SCAV 拾荒者随机武器池 (二战兵器) =====
// 拾荒者没有制式装备: 每次出击的主武器从二战兵器里随机抽一把。
// 排除手枪(主武器位不该是手枪)与迫击炮(曲射支援, 不该当主武器发)。
const SCAV_WPN_POOL=(()=>{
const ww2=(ARSENAL_SETS.find(s=>s.id==='ww2')||{keys:[]}).keys;
return ww2.filter(k=>{ const d=WPN_DEFS[k]; return !!d&&!d.pistol&&!d.mortar; });
})();
function rollScavWeapon(){
if(!SCAV_WPN_POOL.length) return 'm1911';
return SCAV_WPN_POOL[randi(0,SCAV_WPN_POOL.length-1)];
}
let PLAYER_ARSENAL_KEY=`, 1);

// ============ js/19_bot.js ============
const B = 'js/19_bot.js';
rep(B, "this.inSquad=false; this.squadGroup=0;",
`this.inSquad=false; this.squadGroup=0;
this.aggro=[];                     // 中立模式记仇名单: [{e:单位, t:结仇时刻}]`, 1);
rep(B, "this.target=null; this.lastSeenT=-99; this.path=null;",
        "this.target=null; this.lastSeenT=-99; this.path=null; this.aggro=[];", 2);

rep(B, `noticeThreat(enemy){
if(!enemy||!enemy.alive) return;`,
`noticeThreat(enemy){
if(!enemy||!enemy.alive) return;
if(NPC_NEUTRAL&&!this.aggroOk(enemy)) return;   // 中立: 不对未结仇的目标产生警觉`, 1);

rep(B, `// 同单位误伤不成立: 既不反制也不锁定对方 (同队之外再加一道单位闸)
if(attacker&&attacker.team!==this.team&&!(typeof unitBlocks==='function'&&unitBlocks(attacker,this))){
this.noticeThreat(attacker);
if(!this.target&&!attacker.isCrew&&!attacker.onVehicle&&Math.random()<0.8){`,
`// 同单位误伤不成立: 既不反制也不锁定对方 (同队之外再加一道单位闸)
if(attacker&&attacker.team!==this.team&&!(typeof unitBlocks==='function'&&unitBlocks(attacker,this))){
// 中立模式: 被谁打就只记谁的仇 (含同小队 30m 内的队友), 且必定立刻还击
if(NPC_NEUTRAL) this.aggroOn(attacker,30);
this.noticeThreat(attacker);
if(!this.target&&!attacker.isCrew&&!attacker.onVehicle&&(NPC_NEUTRAL||Math.random()<0.8)){`, 1);

rep(B, "if(!e.alive||e.team===this.team||(typeof unitBlocks==='function'&&unitBlocks(this,e))) continue;",
        "if(!e.alive||e.team===this.team||!this.aggroOk(e)||(typeof unitBlocks==='function'&&unitBlocks(this,e))) continue;", 2);

rep(B, `perceive(){
const diff=EFF_DIFF;`,
`// ---------- 中立 NPC (街区) ----------
// 战役标记 npcNeutral 时, NPC 不主动交火, 只有"结过仇"的目标才能被锁定。
// 结仇途径: ① 被该单位打伤 (damage) ② 玩家用 T 下令集火 (24_input.squadOrderAttack)。
// 注意 aggroOk 是 perceive 的候选过滤器 —— 中立模式下它是唯一的目标来源,
// 任何新增的"锁定敌人"路径都必须同步加上这道闸, 否则会静默变成主动攻击。
aggroOn(e,radius){
if(!NPC_NEUTRAL||!e||e===this) return;
if(e.team===this.team) return;
for(const a of this.aggro){ if(a.e===e){ a.t=nowT; } }
if(!this.aggro.some(a=>a.e===e)){
this.aggro.push({e:e,t:nowT});
if(this.aggro.length>6) this.aggro.shift();
}
// 同小队连坐: 队友被打, 附近队友一起还击
if(radius>0&&this.squadGroup){
for(const s of soldiers){
if(s===this||!s.alive||s.team!==this.team||s.squadGroup!==this.squadGroup) continue;
if(Math.hypot(s.pos.x-this.pos.x,s.pos.z-this.pos.z)<radius) s.aggroOn(e,0);
}
}
}
aggroOk(e){
if(!NPC_NEUTRAL) return true;
if(!e) return false;
for(const a of this.aggro){ if(a.e===e) return true; }
return false;
}
perceive(){
const diff=EFF_DIFF;`, 1);

rep(B, `if(!this.target){
for(const ev of gunEvents){`,
`if(!this.target&&!NPC_NEUTRAL){
for(const ev of gunEvents){`, 1);

// ============ js/24_input.js ============
rep('js/24_input.js', `if(best){
SQUAD.mode='attack';
SQUAD.target=best;`,
`if(best){
// 中立地图: 玩家主动下令攻击 = 单方面宣战, 该 NPC 立刻与玩家及小队结仇
best.aggroOn(player);
for(const sm of SQUAD.members) sm.aggroOn(best);
SQUAD.mode='attack';
SQUAD.target=best;`, 1);

// ============ js/29_menus.js ============
const M = 'js/29_menus.js';
rep(M, "RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false;",
        "RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null;", 2);

rep(M, `}
// 己方: 1 支 4 人小队(玩家 + 3 AI), 受玩家小队指令`,
`}
// SCAV 出击: 掷本局随机主武器。必须在 showDeploy() 之前 —— 部署界面要显示本局那把枪。
if(typeof ensureScavLoadout==='function') ensureScavLoadout();
// 己方: 1 支 4 人小队(玩家 + 3 AI), 受玩家小队指令`, 1);

rep(M, `CLASSES.forEach((c,i)=>{
const ws=TEAM_FACTION[player.team].cls[i];
const mainKey=ws[0];
const modName=modDisplayName(mainKey);
// 过滤已移除武器: 直接 WPN_DEFS[k].name 会因为 undefined 抛错并中断整个部署界面
let d2=ws.map(k=>WPN_DEFS[k]?WPN_DEFS[k].name:null).filter(Boolean).join(' · ');`,
`// SCAV 拾荒者没有制式装备: 兵种卡只列兵种职能, 主武器由本局随机决定 (见 38_tarkov.ensureScavLoadout)
const _scavF=!!TEAM_FACTION[player.team].scav;
const _scavK=(_scavF&&RUN.scavLoadout&&RUN.scavLoadout.primary)||'';
CLASSES.forEach((c,i)=>{
const ws=TEAM_FACTION[player.team].cls[i];
const mainKey=(_scavF&&_scavK&&WPN_DEFS[_scavK])?_scavK:ws[0];
const modName=modDisplayName(mainKey);
// 过滤已移除武器: 直接 WPN_DEFS[k].name 会因为 undefined 抛错并中断整个部署界面
let d2=_scavF
?('主武器：'+(WPN_DEFS[mainKey]?WPN_DEFS[mainKey].name:'随机')+' · 拾荒者每局随机')
:ws.map(k=>WPN_DEFS[k]?WPN_DEFS[k].name:null).filter(Boolean).join(' · ');`, 1);

rep(M, `let primaryKey=META.loadout.primary;
if(!primaryKey||ownedCount(primaryKey)<=0){`,
`let primaryKey=META.loadout.primary;
// SCAV 拾荒者: 主武器由 ensureScavLoadout() 每局随机, 不走仓库校验 (随机到的枪不需要玩家拥有)
const _scavL=(typeof ensureScavLoadout==='function')?ensureScavLoadout():null;
if(_scavL) primaryKey=_scavL.primary;
if(!_scavL&&(!primaryKey||ownedCount(primaryKey)<=0)){`, 1);

rep(M, "const wkeys=[primaryKey,secondaryKey].filter(Boolean);",
`// 同步 SCAV 本局配装: 背包容量/重量/保险/掉落判定都读 raidLoadout() (见 38_tarkov)
if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.pack=META.loadout.pack||'packSmall'; }
const wkeys=[primaryKey,secondaryKey].filter(Boolean);`, 1);

rep(M, `else if(p.cls===4) showScorePop(MOBILE?'工程兵 · 「工事」选类型 · 「建造」锤击建造':'工程兵 · 按 6 选择工事, 按 B 锤击建造');`,
`else if(p.cls===4) showScorePop(MOBILE?'工程兵 · 「工事」选类型 · 「建造」锤击建造':'工程兵 · 按 6 选择工事, 按 B 锤击建造');
// 中立区域提示: 让玩家知道本区 NPC 不会先开火 (见 01_data.js 的 NPC_NEUTRAL)
if(NPC_NEUTRAL) setTimeout(()=>{ if(!matchOver) showScorePop('本区 NPC 中立 · 不会主动开火, 攻击后会遭到反击'); },1900);`, 1);

rep(M, "// NBK 合同防务强制走 numeric cls 路径: 29_menus 默认给所有 Bot 传字符串武器 key 进 customWeapon 分支,",
        "// USEC 联合安保强制走 numeric cls 路径: 29_menus 默认给所有 Bot 传字符串武器 key 进 customWeapon 分支,", 1);
rep(M, "// 完全绕过 FACTIONS.X.cls 表。NBK 需要全员统一 M4+P320 (cls 全部填成同一套),",
        "// 完全绕过 FACTIONS.X.cls 表。USEC 需要全员统一 M4+P320 (cls 全部填成同一套),", 1);
rep(M, "const isNbkEnemy=(t!==player.team)&&(TEAM_FACTION[t].short==='NBK');",
        "const isNbkEnemy=(t!==player.team)&&(TEAM_FACTION[t].short==='USEC');", 1);

// ============ js/38_tarkov.js ============
rep('js/38_tarkov.js', `function raidLoadout(){
if(RUN.scav&&RUN.scavLoadout) return RUN.scavLoadout;
return META.loadout;
}`,
`function raidLoadout(){
if(RUN.scav&&RUN.scavLoadout) return RUN.scavLoadout;
return META.loadout;
}
// ===== SCAV 拾荒者出击 =====
// 阵营带 scav:true 时 (见 01_data.js 的 FACTIONS.us), 本局主武器从二战兵器池随机,
// 并复用 RUN.scav 既有语义: 不带仓库主武器 / 无保险 / 阵亡不掉仓库装备 / XP 减半。
// 必须在 showDeploy() 之前调用 —— 部署界面的兵种卡要显示本局随机到的那把枪。
// 幂等: 同一局重复调用不会重掷 (每局只随机一次)。
function ensureScavLoadout(){
const F=TEAM_FACTION[player.team];
if(!F||!F.scav){ RUN.scav=false; RUN.scavLoadout=null; return null; }
if(RUN.scavLoadout) return RUN.scavLoadout;
const L=META.loadout;
RUN.scav=true;
RUN.scavLoadout={
primary:(typeof rollScavWeapon==='function')?rollScavWeapon():'m1911',
secondary:L.secondary||'',
armor:L.armor||'',
pack:L.pack||'packSmall',
meds:(L.meds||[]).slice(),
foods:(L.foods||[]).slice(),
nvg:false
};
return RUN.scavLoadout;
}`, 1);

// ============ _tools/_nbk_unit.js ============
rep('_tools/_nbk_unit.js', "// 真加载 01_data.js 的 FACTIONS 块, 验证 FACTIONS.nbk 完整可用",
        "// 真加载 01_data.js 的 FACTIONS 块, 验证 FACTIONS.usec 完整可用", 1);
rep('_tools/_nbk_unit.js', "console.log('FACTIONS.nbk:', F.nbk ? '✓ present' : '✗ missing');",
        "console.log('FACTIONS.usec:', F.usec ? '✓ present' : '✗ missing');", 1);
rep('_tools/_nbk_unit.js', "if (F.nbk) {\n    const n = F.nbk;", "if (F.usec) {\n    const n = F.usec;", 1);

console.log('全部替换成功 (' + stats.length + ' 处):');
for (const s of stats) console.log('  ' + s);
