'use strict';
// ELO 动态难度读数 (主菜单「撤离部署」面板)。数据源: 00b_elo.js 的 ELO / EFF_DIFF。
function eloRenderUI(){
if(typeof eloRecalc==='function') eloRecalc();   // 刷新装备估值维度(读 META.loadout)
const box=el('eloBox'); if(!box) return;
const btn=el('eloToggle');
if(btn){ btn.textContent=ELO.auto?'动 态 难 度 ： 开':'动 态 难 度 ： 关'; btn.classList.toggle('sel',ELO.auto); }
const col=ELO.rating>=1330?'#f0c070':(ELO.rating>=980?'#9fe6b4':'#9fc8f0');
const d=ELO.lastDelta;
const dTxt=d?` · 上局 <b style="color:${d>0?'#9fe6b4':'#e09080'}">${d>0?'+':''}${d}</b>`:'';
const gv=ELO.gearValue||0;
const gTxt=gv>0
 ?`<div style="color:#d8c59a;font-size:12px">本局装备估值 <b>¥${formatMoney(gv)}</b> · 装备强度调节 <b style="color:${ELO.gearT>=0?'#e0a080':'#9fe6b4'}">${ELO.gearT>=0?'+':''}${Math.round(ELO.gearT*ELO_GEAR_WEIGHT*100)}%</b>${ELO.gearT<0?'（轻装上阵，敌人稍弱）':(ELO.gearT>0?'（重装出击，敌人更强）':'')}</div>`
 :'';
box.innerHTML=
`<div><b style="color:${col};font-size:15px">ELO ${ELO.rating}</b> · <b>${eloTier(ELO.rating)}</b>`
+`<span style="color:#8fa6b8;font-size:12px">（基准「${EFF_DIFF.name}」档）</span>`
+`<span style="font-size:12px">${dTxt}</span></div>`
+`<div style="color:#c8d2b8;font-size:12px">${eloSummary()}</div>`
+gTxt
+`<div style="color:#9fb8d0;font-size:12px">打得越好敌人越强，连续阵亡会自动放水。已结算 ${ELO.raids} 局 · 峰值 ${ELO.peak}</div>`;
}
function initMenuUI(){
// 保险赔付: 阵亡时投保装备 70% 概率返还, 回到主菜单时发放
if(typeof deliverInsurance==='function'){
const n=deliverInsurance();
if(n) setTimeout(()=>showScorePop('保险赔付 · 返还 '+n+' 件装备入库'),600);
}
// 主菜单导航
const showPanel=(id)=>{
el('mHome').classList.toggle('hidden',id!=='mHome');
// 注意: 用 el(pid) 的存在性判断 —— 主页的「选择战役」面板已删除, 但 _reg.html 等旧副本可能还在,
// 直接 el(pid).classList 会在元素缺失时抛错并让整个主菜单导航失效。
['mPlay','mArmory','mCamp','mSet'].forEach(pid=>{ const e=el(pid); if(e) e.classList.toggle('hidden',pid!==id); });
if(id==='mArmory') renderArmory(ARMORY_TAB||'store');
if(id==='mPlay'){ refreshLoadoutSelects(); eloRenderUI(); }
};
const bmHint=el('bigmapHint');
if(bmHint) bmHint.textContent='[M] 关闭 · 绿=友军 红=暴露敌军 · 散点标记为敌方步兵';
document.querySelectorAll('.navBtn').forEach(b=>{
b.onclick=()=>{ AudioSys.resume&&AudioSys.resume(); showPanel(b.dataset.p); };
});
document.querySelectorAll('.backBtn').forEach(b=>{ b.onclick=()=>showPanel('mHome'); });
// 触控按键大小
{
const stored=parseInt(localStorage.getItem('sf_tsize')||'100');
el('tsizeRange').value=stored;
el('tsizeVal').textContent=stored+'%';
el('tsizeRange').oninput=e=>{
localStorage.setItem('sf_tsize',e.target.value);
el('tsizeVal').textContent=e.target.value+'%';
applyTouchScale();
};
}
// 地图/战役选择已合并进「撤离部署」面板 (见 43_maps.js 的地图卡片), 主页不再单独提供选择入口。
// 这里只把当前地图显示在标题下, 作为信息提示。
el('menuSub').textContent=`—— ${CAMPAIGN.title} · ${CAMPAIGN.sub} ——`;
// 天气模式: 晴朗/迷雾/雨天/雷暴雨/黑夜 (切换后重载重建世界)
{
const desc={clear:'正常能见度',fog:'能见度极低 · 亮度低',rain:'能见度/亮度降低',storm:'雷暴雨 · 能见度/亮度低',night:'黑夜 · 亮度极低'};
const row=el('weatherRow');
if(row){
const syncWeatherUI=()=>{ document.querySelectorAll('[data-wx]').forEach(b=>b.classList.toggle('sel',b.dataset.wx===WEATHER_MODE)); };
syncWeatherUI();
document.querySelectorAll('[data-wx]').forEach(b=>{
b.onclick=()=>{
if(b.dataset.wx===WEATHER_MODE) return;
localStorage.setItem('sf_weather',b.dataset.wx);
if(b.dataset.wx!=='night') localStorage.setItem('sf_night','0');
location.reload();
};
});
const dEl=el('weatherDesc');
if(dEl) dEl.textContent=WEATHER_MODES[WEATHER_MODE].name+' · '+desc[WEATHER_MODE];
}
}
el('teamUS').innerHTML=`${TEAM_FACTION[0].sym} ${TEAM_FACTION[0].short} · ${TEAM_FACTION[0].name}`;
el('teamGER').innerHTML=`${TEAM_FACTION[1].sym} ${TEAM_FACTION[1].short} · ${TEAM_FACTION[1].name}`;
document.querySelector('.t0h').textContent=TEAM_NAME[0];
document.querySelector('.t1h').textContent=TEAM_NAME[1];
// 模式归属战役, 此处仅兵力规模
document.querySelectorAll('.sizeBtn').forEach(b=>{
b.classList.toggle('sel',+b.dataset.s===SIZE_IDX);
b.onclick=()=>{
SIZE_IDX=+b.dataset.s;
localStorage.setItem('sf_size',b.dataset.s);
document.querySelectorAll('.sizeBtn').forEach(x=>x.classList.toggle('sel',x===b));
};
});
// 操控模式: 由 MOBILE 自动检测, 无需手动切换
el('teamUS').onclick=()=>{ SETTINGS.team=0; el('teamUS').classList.add('sel'); el('teamGER').classList.remove('sel'); };
el('teamGER').onclick=()=>{ SETTINGS.team=1; el('teamGER').classList.add('sel'); el('teamUS').classList.remove('sel'); };
document.querySelectorAll('.diffBtn').forEach(b=>b.onclick=()=>{
SETTINGS.diff=+b.dataset.d;
document.querySelectorAll('.diffBtn').forEach(x=>x.classList.toggle('sel',x===b));
// 基准档变了 → 重算 ELO 乘区与显示
if(typeof eloRecalc==='function') eloRecalc();
eloRenderUI();
});
// ELO 动态难度: 开关 + 读数
{
const btn=el('eloToggle');
if(btn) btn.onclick=()=>{ eloSetAuto(!ELO.auto); };
eloRenderUI();
}
document.querySelectorAll('.qualBtn').forEach(b=>b.onclick=()=>{
SETTINGS.quality=+b.dataset.q;
document.querySelectorAll('.qualBtn').forEach(x=>x.classList.toggle('sel',x===b));
applyQuality();
});
el('sensRange').oninput=e=>{ SETTINGS.sens=e.target.value/100; el('sensVal').textContent=SETTINGS.sens.toFixed(1); };
// 视野 FOV: 只改徒步视野基准值, 开镜倍率不变 (开镜 FOV 按同比例缩放, 见 15_viewmodel)
{
const fr=el('fovRange'), fv=el('fovVal');
const syncFovUI=()=>{ if(fr) fr.value=SETTINGS.fov; if(fv) fv.textContent=Math.round(SETTINGS.fov); };
syncFovUI();
if(fr) fr.oninput=e=>{
SETTINGS.fov=clamp(parseInt(e.target.value,10)||74,60,100);
try{ localStorage.setItem('sf_fov',String(SETTINGS.fov)); }catch(err){}
if(fv) fv.textContent=Math.round(SETTINGS.fov);
};
}
// 右键瞄准方式: 按住 / 切换
{
const syncAdsBtn=()=>{ el('adsModeBtn').textContent=SETTINGS.adsToggle?'切换瞄准':'按住瞄准'; };
syncAdsBtn();
el('adsModeBtn').onclick=()=>{
SETTINGS.adsToggle=!SETTINGS.adsToggle;
try{ localStorage.setItem('sf_adsmode',SETTINGS.adsToggle?'toggle':'hold'); }catch(e){}
syncAdsBtn();
};
}
el('volRange').oninput=e=>{ SETTINGS.vol=e.target.value/100; el('volVal').textContent=e.target.value; AudioSys.setVol(SETTINGS.vol); };
// 夜视滤镜: 蓝色/绿色/白色 (战斗内按 N 开关)
{
const FILTERS={blue:['nvgBlue','蓝色'],green:['nvgGreen','绿色'],white:['nvgWhite','白色']};
const syncNvgUI=()=>{
const cur=localStorage.getItem('sf_nvg')||'green';
Object.keys(FILTERS).forEach(k=>el(FILTERS[k][0]).classList.toggle('sel',k===cur));
};
syncNvgUI();
Object.keys(FILTERS).forEach(k=>{
el(FILTERS[k][0]).onclick=()=>{
localStorage.setItem('sf_nvg',k);
if(typeof NVG!=='undefined') NVG.setFilter(k);
syncNvgUI();
};
});
}
el('startBtn').onclick=()=>{
AudioSys.init();
player.team=SETTINGS.team;
matchOver=false;
player.deployed=false; player.alive=false; player.kills=0; player.deaths=0; player.score=0;
RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false;
RUN.failComp=0; RUN.autoKit=null; RUN.lostGear=null; RUN.returnedGear=null;
// ELO: 按当前评分浮动兵力规模 (乘区在 00b_elo 里按基准档算好)
eloRecalc();
eloApplyForceSize();
startMatch();
el('menu').classList.add('hidden');
if(GAMEMODE==='extract') showDeploy(false);
else startIntroCut(()=>showDeploy(false));
};
el('againBtn').onclick=()=>location.reload();
const grid=el('classGrid');
CLASSES.forEach((c,i)=>{
const d=document.createElement('div');
d.className='classCard'+(i===0?' sel':'');
d.innerHTML=`<div class="cname">${c.name}</div><div class="cwpn" id="cw${i}"></div><div class="cwpn">手雷 ×${c.nades}</div>`;
d.onclick=()=>{
player.cls=i;
document.querySelectorAll('.classCard').forEach(x=>x.classList.toggle('sel',x===d));
buildDeployConsumables();
};
grid.appendChild(d);
});
// BF7 / BF8 全武器库
{
const arsenalSel=el('arsenalSelect');
ARSENAL_SETS.forEach(set=>{
const og=document.createElement('optgroup');
og.label=set.name;
set.keys.forEach(k=>{
const d=WPN_DEFS[k];
if(!d) return;        // 已移除的武器: 跳过, 避免 d.name 抛错导致整个主菜单初始化失败
const o=document.createElement('option');
o.value=k;
o.textContent=`${d.name} · ${d.mode}`;
og.appendChild(o);
});
arsenalSel.appendChild(og);
});
const refreshArsenalStats=()=>{
const d=WPN_DEFS[PLAYER_ARSENAL_KEY];
if(d) el('arsenalStats').textContent=`当前主武器：${d.name} · 伤害 ${d.dmg} · 弹匣 ${d.mag} / 备弹 ${d.reserve}`;
};
arsenalSel.value=PLAYER_ARSENAL_KEY;
refreshArsenalStats();
arsenalSel.onchange=()=>{
PLAYER_ARSENAL_KEY=arsenalSel.value;
try{ localStorage.setItem('bf_arsenal_key',PLAYER_ARSENAL_KEY); }catch(e){}
refreshArsenalStats();
};
}
el('deployBtn').onclick=()=>{
if(respawnCd>0||matchOver) return;
deployPlayer();
};
el('resumeBtn').onclick=()=>{
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
lockPointer();
};
renderer.domElement.addEventListener('click',()=>{
if(player.alive&&player.deployed&&!pointerLocked&&!matchOver) lockPointer();
});
}
function showDeploy(isDead){
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
el('deploy').classList.remove('hidden');
el('blackOv').style.opacity=0;
CLASSES.forEach((c,i)=>{
const ws=TEAM_FACTION[player.team].cls[i];
const mainKey=ws[0];
const modName=modDisplayName(mainKey);
// 过滤已移除武器: 直接 WPN_DEFS[k].name 会因为 undefined 抛错并中断整个部署界面
let d2=ws.map(k=>WPN_DEFS[k]?WPN_DEFS[k].name:null).filter(Boolean).join(' · ');
if(i===2) d2+=' · 医疗箱[B] · 绷带×6';
// 投掷物不再按兵种发放, 统一在市集自费购买后带入 (3 手雷 / 4 闪光 / 5 烟雾)
if(i===4) d2+=' · 工事[6]';
if(modName!=='无改装') d2+='\n🔧'+modName;
el('cw'+i).textContent=d2;
});
el('deathInfo').innerHTML=(()=>{ 
if(!isDead) return '';
const lifeT=Math.max(0,nowT-(player.lifeStartT||nowT));
const mm2=Math.floor(lifeT/60), ss3=Math.floor(lifeT%60);
const lk=player.lifeKills||0, ls=(player.score||0)-(player.lifeScoreStart||0);
return (player.killerName?`你被 <b>${player.killerName}</b> 击杀了<br>`:'')+
`<span style="font-size:13px;color:#cdd8c8">本次存活 ${mm2}:${ss3<10?'0':''}${ss3} · 击杀 <b>${lk}</b> · 获得 <b>+${ls}</b> 分 &nbsp;|&nbsp; 本局总计 ${player.kills} 杀 / ${player.deaths} 死 / ${player.score} 分</span>`;
})();
el('resumeBtn').style.display=(player.alive&&player.deployed)?'inline-block':'none';
el('deployBtn').style.display=player.alive&&player.deployed?'none':'inline-block';
buildSpawnList();
refreshLoadoutSelects();
if(typeof buildDeployConsumables==='function') buildDeployConsumables();
drawDeployMap();
}
function buildSpawnList(){
const list=el('spawnList');
list.innerHTML='';
const opts=[{name:'主基地',x:BASES[player.team].x,z:BASES[player.team].z,id:-1}];
FLAGS.forEach((f,i)=>{ if(f.owner===player.team) opts.push({name:f.id+' 点',x:f.x,z:f.z,id:i}); });
// 载具出生选项
const vehs=[...tanks,...planes].filter(v=>v.team===player.team);
vehs.forEach((v,i)=>{
const id='V'+i;
const busy=v.playerDriven;
const ready=v.alive&&!busy;
opts.push({name:(v.kind==='plane'?'✈ ':'▣ ')+v.name+(ready?'':(busy?' (占用)':' (重生 '+Math.ceil(v.respawnT)+'s)')),id,veh:v,disabled:!ready});
});
if(!opts.some(o=>!o.disabled&&(o.id===selectedSpawn))) selectedSpawn=-1;
opts.forEach(o=>{
const b=document.createElement('button');
b.className='spawnBtn'+(o.id===selectedSpawn?' sel':'');
b.textContent='◈ '+o.name;
if(o.disabled){ b.disabled=true; b.style.opacity=0.45; }
else b.onclick=()=>{ selectedSpawn=o.id; document.querySelectorAll('.spawnBtn').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); };
list.appendChild(b);
});
}
function drawDeployMap(){
const c=el('deployMap').getContext('2d');
const S=300;
c.fillStyle='#141a10'; c.fillRect(0,0,S,S);
const toM=(x,z)=>[S/2+x/(MAP_SIZE/2+10)*S/2, S/2+z/(MAP_SIZE/2+10)*S/2];
c.strokeStyle='rgba(150,130,90,.5)'; c.lineWidth=4;
if(CAMPAIGN.sineRoad){
c.beginPath();
for(let x=-155;x<=155;x+=10){ const [px,py]=toM(x,3*Math.sin(x*0.02)); x===-155?c.moveTo(px,py):c.lineTo(px,py); }
c.stroke();
}
for(const r of CAMPAIGN.roads){
c.beginPath();
const [ax,ay]=toM(r[0],r[1]), [bx2,by2]=toM(r[2],r[3]);
c.moveTo(ax,ay); c.lineTo(bx2,by2);
c.stroke();
}
[0,1].forEach(t=>{
const [px,py]=toM(BASES[t].x,BASES[t].z);
c.fillStyle=t===0?'#4a70b0':'#b05a4a';
c.fillRect(px-8,py-8,16,16);
c.fillStyle='#fff'; c.font='10px sans-serif'; c.textAlign='center';
c.fillText(TEAM_NAME[t][0],px,py+3);
});
for(const f of FLAGS){
const [px,py]=toM(f.x,f.z);
c.beginPath(); c.arc(px,py,13,0,TAU);
c.fillStyle=f.owner===0?'rgba(90,140,220,.85)':f.owner===1?'rgba(220,110,90,.85)':'rgba(150,150,140,.7)';
c.fill();
c.fillStyle='#fff'; c.font='bold 13px sans-serif'; c.textAlign='center';
c.fillText(f.id,px,py+4);
}
if(typeof EXTRACT_POINTS!=='undefined'){
for(const ex of EXTRACT_POINTS){
const [px,py]=toM(ex.x,ex.z);
c.fillStyle='#35e0a0'; c.beginPath(); c.arc(px,py,15,0,TAU); c.fill();
c.fillStyle='#082d20'; c.font='bold 12px sans-serif'; c.textAlign='center'; c.fillText('撤',px,py+4);
}
}
if(typeof LOOT_CRATES!=='undefined'){
for(const lc of LOOT_CRATES){
if(lc.searched) continue;
const [px,py]=toM(lc.x,lc.z);
c.fillStyle='#d8b04a'; c.fillRect(px-4,py-4,8,8);
}
}
for(const s of soldiers){
if(!s.alive||s.onVehicle) continue;
const [px,py]=toM(s.pos.x,s.pos.z);
c.fillStyle=s.team===0?'#7da8e8':'#e8907d';
c.beginPath(); c.arc(px,py,2,0,TAU); c.fill();
}
}
function deployPlayer(){
const p=player;
// 保底: 玩家可能已卖光所有武器。绝不中断部署, 而是补发一把手枪让其能正常开局。
if(!ownedWeaponList().length&&typeof ensureSafetyKit==='function'){
ensureSafetyKit('deploy');
}
if(!ownedWeaponList().length){ showScorePop('仓库中没有可用武器 · 请前往军械库购买'); return; }
// 载具出生
let vehSpawn=null;
if(typeof selectedSpawn==='string'&&selectedSpawn[0]==='V'){
const vehs=[...tanks,...planes].filter(v=>v.team===p.team);
const v=vehs[+selectedSpawn.slice(1)];
if(v&&v.alive&&!v.playerDriven) vehSpawn=v;
}
let sx,sz;
if(vehSpawn){ sx=vehSpawn.pos.x; sz=vehSpawn.pos.z; }
else if(selectedSpawn===-1||typeof selectedSpawn==='string'){ sx=BASES[p.team].x; sz=BASES[p.team].z; }
else {
const f=FLAGS[selectedSpawn];
if(!f||f.owner!==p.team){ sx=BASES[p.team].x; sz=BASES[p.team].z; }
else { sx=f.x; sz=f.z; }
}
const fp2=findFreeSpawn(sx,sz);
p.pos.set(fp2[0],0,fp2[1]);
p.pos.y=standHeight(p.pos.x,p.pos.z,10);
p.vel.set(0,0,0);
const armorKey=ownedCount(META.loadout.armor)>0?META.loadout.armor:(ownedArmorList()[0]||'');
const armor=ARMOR_DEFS[armorKey]||{name:'未装备防弹衣',hp:0,resist:0,weight:0};
// 血量上限 = 全身总血量 440 (+ 高级护甲的胸甲加成), 随后由 initRaidBody 按部位重写
p.maxHp=(typeof BODY_TOTAL_HP!=='undefined'?BODY_TOTAL_HP:440)+((armor.level>=4)?8:((armor.level>=2)?4:0));
p.armorKey=armorKey; p.armorDef=armor; p.armorResist=armor.resist;
p.hp=p.maxHp; p.alive=true; p.deployed=true; p.crouch=false; p.prone=false; p.chute=false;
p.limbs={head:100,arms:100,torso:100,legs:100};
p.stamina=1; p.suppressV=0; p.bloom=0;
p.ads=false; p.holdBreath=false; VM.adsBlend=0;
document.getElementById('scopeOv').style.display='none';
p.yaw=Math.atan2(-sx,-sz); p.pitch=0;
let primaryKey=META.loadout.primary;
if(!primaryKey||ownedCount(primaryKey)<=0){
 primaryKey=ownedCount('m1911')>0?'m1911':firstOwnedWeapon();
 // 保底: 玩家可能已卖光所有武器。此处补发一把手枪, 绝不因无武器而中断部署。
 if(!primaryKey&&typeof ensureSafetyKit==='function'){
  ensureSafetyKit('deploy');
  primaryKey=META.loadout.primary||SAFETY_WEAPON;
 }
 if(!primaryKey) primaryKey=SAFETY_WEAPON;           // 最后兜底(理论上不会走到)
 if(!ownedCount(primaryKey)){ addOwned(primaryKey,1); }
 META.loadout.primary=primaryKey; saveMeta();
}
let secondaryKey=META.loadout.secondary;
if(secondaryKey===primaryKey||ownedCount(secondaryKey)<=0) secondaryKey='';
const wkeys=[primaryKey,secondaryKey].filter(Boolean);
p.slots=wkeys.map(k=>{
const md=moddedDef(k)||WPN_DEFS[k];
return {key:k,def:md,mag:md.mag,reserve:md.reserve};
});
p.curSlot=0; p.curW=p.slots[0];
// 投掷物自费: 这里不再按兵种免费发放, 实际数量由 applyDeployLoadout / deployPlayer 从带入量写入
p.nadeCount=0; p.flashCount=0; p.smokeCount=0; p.atNades=0; p.flashT=0;
p.maxBandages=p.cls===2?6:2;
p.bandages=p.maxBandages;
p.bandaging=0;
p.medkitUsed=false; p.grabAction=null;
p.deathRag=null; p.deathCamT=0;
p.lifeStartT=nowT; p.lifeKills=0; p.lifeScoreStart=p.score||0;
p.onMortar=null; p.mortarPlaced=false; p.buildCount=6; p.buildSel=0; p.pendingBuild=null;
p.nadeIsAT=false; p.nadeHeld=false; p.nadeIsSmoke=false; p.nadeIsFlash=false;
 p.onVehicle=null; p.onMG=null; p.onAT=null; p.onAA=null; p.tankView=false; p.planeView=false; p.braced=false;
ensurePlayerBody();
if(typeof applyDeployLoadout==='function') applyDeployLoadout();
if(typeof initRaidBody==='function') initRaidBody(p,{armor:p.armorDef});
document.getElementById('deathQuote').style.opacity='0';
document.getElementById('heatWrap').style.display='none';
vmEquip(p.curW.key,p.team);
VM.root.visible=true;
if(p.cls===2) showScorePop(MOBILE?'医疗兵 · 左侧「医疗箱」放置 · 「绷带」自疗':'医疗兵 · 按 B 放置医疗箱 / H 包扎');
else if(p.cls===4) showScorePop(MOBILE?'工程兵 · 「工事」选类型 · 「建造」锤击建造':'工程兵 · 按 6 选择工事, 按 B 锤击建造');
if(vehSpawn){
if(vehSpawn.crewBot){
const cb=vehSpawn.crewBot;
if(vehSpawn.kind==='plane'){
vehSpawn.crewBot=null;
cb.onVehicle=null;
cb.chuting=true;
cb.pos.set(vehSpawn.pos.x,Math.max(vehSpawn.pos.y-2,heightAt(vehSpawn.pos.x,vehSpawn.pos.z)+3),vehSpawn.pos.z);
if(cb.mesh) cb.mesh.root.visible=true;
cb.path=null; cb.state='idle'; cb.target=null;
} else cb.dismountVehicle(false);
}
vehSpawn.playerDriven=true;
if(vehSpawn.kind==='tank'){ vehSpawn.isAI=false; vehSpawn.vel=0; p.yaw=vehSpawn.yaw+vehSpawn.turretYaw+Math.PI; }
else { p.yaw=vehSpawn.yaw+Math.PI; p.pitch=vehSpawn.pitch; }
p.onVehicle=vehSpawn;
p.pos.copy(vehSpawn.pos);
VM.root.visible=false;
document.getElementById('heatWrap').style.display='block';
}
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
lockPointer();
startDeployCut();
}
function startMatch(){
if(soldiers.length||combatants.length){ soldiers.length=0; combatants.length=0; combatants.push(player); }
if(typeof ENEMY_SQUADS!=='undefined'){ for(const k in ENEMY_SQUADS) delete ENEMY_SQUADS[k]; }
const names0=[...TEAM_FACTION[0].names].sort(()=>Math.random()-0.5);
const names1=[...TEAM_FACTION[1].names].sort(()=>Math.random()-0.5);
const nameIdx=[0,0];
const nextName=t=>(t===0?names0:names1)[nameIdx[t]++%(t===0?names0:names1).length];
for(let t=0;t<2;t++){
const n=t===player.team?FRIENDLY_BOT_COUNT:ENEMY_BOT_COUNT;
for(let i=0;i<n;i++){
const allWeapons=Object.keys(WPN_DEFS);
const bot=new Bot(t,allWeapons[randi(0,allWeapons.length-1)],nextName(t));
bot.spawn(t!==player.team);
}
}
// 撤离模式: 无旗点/无占点, 重置本局搜刮与击杀进度
if(GAMEMODE==='extract'){
el('flagIcons').style.display='none';
el('capPanel').style.display='none';
matchTime=25*60;
RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false;
RUN.failComp=0; RUN.autoKit=null; RUN.lostGear=null; RUN.returnedGear=null;
if(EXTRACT_POINTS.length) for(const ep of EXTRACT_POINTS) ep.progress=0;
} else {
el('flagIcons').innerHTML=FLAGS.map(f=>`<span id="fi${f.id}">${f.id}</span>`).join('');
if(GAMEMODE==='conquest'){
const sorted=[...FLAGS].sort((a,b)=>Math.hypot(a.x-BASES[0].x,a.z-BASES[0].z)-Math.hypot(b.x-BASES[0].x,b.z-BASES[0].z));
sorted[0].owner=0;
sorted[sorted.length-1].owner=1;
if(sorted.length>=5){ sorted[1].owner=0; sorted[sorted.length-2].owner=1; }
FLAGS.forEach(f=>drawFlagTex(f));
} else {
// 攻防/破袭: 防守方(DEF)据守全部旗点
assaultIdx=0;
FLAGS.forEach(f=>{ f.owner=DEF; f.cap=0; f.capTeam=-1; drawFlagTex(f); });
tickets[DEF]=Infinity;
matchTime=GAMEMODE==='assault'?18*60:16*60;
}
}
// 己方: 1 支 4 人小队(玩家 + 3 AI), 受玩家小队指令
const base=BASES[player.team];
const dir=base.x<0?1:-1;
const squadStarts=[
{x:base.x+dir*34,z:22},
{x:base.x+dir*18,z:-22},
{x:base.x+dir*50,z:-2}
];
const friendly=soldiers.filter(s=>s.team===player.team&&!s.onVehicle&&!s.pilotOf);
if(SQUAD.members.length) SQUAD.members.length=0;
friendly.slice(0,FRIENDLY_BOT_COUNT).forEach((s,i)=>{
s.squadGroup=1;
s.inSquad=true;
SQUAD.members.push(s);
if(s.mesh&&s.mesh.tag) s.mesh.tag.material.color.set(0x86ffa6);
const st=squadStarts[0];
// 小队内按扇形散开落位
const sa=(i/Math.max(1,FRIENDLY_BOT_COUNT))*Math.PI*2+0.55;
const fp=findFreeSpawn(st.x+Math.sin(sa)*5.5,st.z+Math.cos(sa)*5.5);
s.pos.set(fp[0],0,fp[1]);
s.pos.y=standHeight(s.pos.x,s.pos.z,10);
s.path=null;
s.state='defend';
s.pickObjective();
});
// 敌方: 3 支独立 4 人小队, 各自有锚点, 互不配合
const enemy=soldiers.filter(s=>s.team!==player.team&&!s.onVehicle&&!s.pilotOf);
const enemyBase=BASES[1-player.team];
const eDir=enemyBase.x<0?1:-1;
const enemySquadAnchors=[
{x:enemyBase.x+eDir*20,z:enemyBase.z+18},
{x:enemyBase.x+eDir*38,z:enemyBase.z-8},
{x:enemyBase.x+eDir*26,z:enemyBase.z-32}
];
enemy.forEach((s,i)=>{
const gi=Math.floor(i/ENEMY_SQUAD_SIZE);
s.squadGroup=gi+1;
s.inSquad=false;           // 不跟随 SQUAD, 走独立小队 AI
s.squadAnchor=enemySquadAnchors[gi%enemySquadAnchors.length];
if(s.mesh&&s.mesh.tag) s.mesh.tag.material.color.set(0xffb3a6);
// 小队成员在锚点周围散开落位
const wi=i%ENEMY_SQUAD_SIZE;
const sa=(wi/ENEMY_SQUAD_SIZE)*Math.PI*2+gi*0.8;
const fp=findFreeSpawn(s.squadAnchor.x+Math.sin(sa)*6,s.squadAnchor.z+Math.cos(sa)*6);
s.pos.set(fp[0],0,fp[1]);
s.pos.y=standHeight(s.pos.x,s.pos.z,10);
s.path=null;
s.state='defend';
s.pickObjective();
});
}
let lastT=performance.now(), fpsAcc=0, fpsN=0, fpsShow=0;
