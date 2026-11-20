'use strict';
// ===== 建局时机: 推迟到「点部署」那一刻 =====
// 点「进入当前地图」时不再立刻 startMatch(建 bot/队伍/物资), 而是先亮出部署界面;
// 等玩家选好出生点、按下「部署」, 才真正建局并落地。这样部署界面不用等建局。
// _pendingRaid 保证一局只建一次 —— 从暂停菜单(≡)再进部署界面、再点部署不会重建整局。
let _pendingRaid=false;
function armRaidStart(){ _pendingRaid=true; }
function consumeRaidStart(){ if(!_pendingRaid) return false; _pendingRaid=false; startMatch(); return true; }

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
+`<span style="color:#b8b8b8;font-size:12px">（基准「${EFF_DIFF.name}」档）</span>`
+`<span style="font-size:12px">${dTxt}</span></div>`
+`<div style="color:#d2d2d2;font-size:12px">${eloSummary()}</div>`
+gTxt
+`<div style="color:#d0d0d0;font-size:12px">打得越好敌人越强，连续阵亡会自动放水。已结算 ${ELO.raids} 局 · 峰值 ${ELO.peak}</div>`;
}
function initMenuUI(){
// 撤离突袭模式: 玩家永远扮演 TEAM_FACTION[0], 强制 team=0 并同步 UI 高亮。
// 旧 localStorage 可能残留 team=1 (bfruins 美德对峙模式), 这里兜底。
SETTINGS.team=0;
const _usBtn=el('teamUS'), _gerBtn=el('teamGER');
if(_usBtn) _usBtn.classList.add('sel');
if(_gerBtn){ _gerBtn.classList.remove('sel'); _gerBtn.classList.add('disabled'); }
// 保险赔付: 阵亡时投保装备 70% 概率返还, 回到主菜单时发放
if(typeof deliverInsurance==='function'){
const n=deliverInsurance();
if(n) setTimeout(()=>showScorePop('保险赔付 · 返还 '+n+' 件装备入库'),600);
}
// 主菜单导航
const showPanel=(id)=>{
// 离开剧情面板就停掉简报配音, 避免声音跟着菜单跑
if(typeof VO!=='undefined'&&id!=='mStory') VO.stop();
el('mHome').classList.toggle('hidden',id!=='mHome');
// 注意: 用 el(pid) 的存在性判断 —— 主页的「选择战役」面板已删除, 但 _reg.html 等旧副本可能还在,
// 直接 el(pid).classList 会在元素缺失时抛错并让整个主菜单导航失效。
['mPlay','mStory','mArmory','mCamp','mSet','mNet'].forEach(pid=>{ const e=el(pid); if(e) e.classList.toggle('hidden',pid!==id); });
if(id==='mStory'&&typeof storyRenderPanel==='function') storyRenderPanel();
if(id==='mArmory') renderArmory(ARMORY_TAB||'store');
if(id==='mPlay'){ refreshLoadoutSelects(); eloRenderUI(); }
if(id==='mNet'){ if(typeof netRenderLobby==='function') netRenderLobby(); if(typeof vibeRenderAuth==='function') vibeRenderAuth(); if(typeof vibeRenderBoard==='function') vibeRenderBoard(); }
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
// 2026-09-19: 天气已改为**随机**（见 01_data 的 WEATHER_POOL），玩家不再能选。
// 这里只把本局掷到的天气显示出来。
const desc={clear:'正常能见度',overcast:'阴天 · 亮度略低',dusk:'黄昏 · 能见度下降',fog:'能见度极低 · 亮度低',rain:'能见度/亮度降低',storm:'雷暴雨 · 能见度/亮度低',night:'黑夜 · 亮度极低',
 labhaze:'地下设施 · 浮尘 · 能见度极低',seahaze:'海雾 · 湿冷 · 能见度偏低',airporthaze:'清晨薄霾 · 开阔地视距最好',anvilhaze:'工业尘霾 · 中距轮廓被吃掉'};
const dEl=el('weatherDesc');
if(dEl){
 // ⚠️ 必须容错: 剧情章节用 CAMPAIGN.forceWeather 直通, 天气名可能不在 WEATHER_MODES 里。
 //    这里一旦抛错会让整个 initMenuUI 中断 —— 主菜单的导航/地图卡片/部署按钮全部失效 (线上实测)。
 const wm=WEATHER_MODES[WEATHER_MODE];
 dEl.textContent='本局天气：'+(wm?wm.name:WEATHER_MODE)+' · '+(desc[WEATHER_MODE]||'')+'（随机决定，不可选）';
}
}
// 「选择阵营」= 选你以哪一方出击 (USEC / PMC), 两边都可点。
// 玩家永远是 team 0, 这栏只决定 team 0 是哪一方; 本图敌方见下方 #foeHint。
const pickBtn=(btn,fkey)=>{
if(!btn) return;
const on=FACTION_PICK===fkey;
btn.innerHTML=`${FACTIONS[fkey].sym} ${FACTIONS[fkey].short}`;
btn.classList.toggle('sel',on);
btn.classList.remove('disabled');
btn.style.opacity=on?'1':'0.78';
btn.style.cursor='pointer';
btn.title=on?('当前: '+FACTIONS[fkey].name):('以 '+FACTIONS[fkey].name+' 出击');
btn.onclick=()=>{ if(FACTION_PICK===fkey) return; try{ localStorage.setItem('sf_faction',fkey); }catch(e){} location.reload(); };
};
pickBtn(el('teamUS'),'usec');
pickBtn(el('teamGER'),'pmc');
const foeEl=el('foeHint');
if(foeEl) foeEl.textContent='本图敌方：'+TEAM_FACTION[1].sym+' '+TEAM_FACTION[1].name;
document.querySelector('.t0h').textContent=TEAM_NAME[0];
document.querySelector('.t1h').textContent=TEAM_NAME[1];
// 操控模式: 由 MOBILE 自动检测, 无需手动切换
// 阵营按钮的文案 / 高亮 / 点击已在上面 pickBtn() 里统一处理 —— 这里是「选边」而非「选敌方阵容」。
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
RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false; RUN.nvgBrought=false; RUN.nvgKey=''; RUN.timeout=false;
RUN.failComp=0; RUN.autoKit=null; RUN.lostGear=null; RUN.returnedGear=null;
// ELO: 按当前评分浮动兵力规模 (乘区在 00b_elo 里按基准档算好)
eloRecalc();
eloApplyForceSize();
armRaidStart();          // 建局推迟到「点部署」时 (见文件顶部说明)
// 拾荒者阵营要在部署界面上显示本局随机到的主武器 —— 提前掷一次(幂等), 别等 startMatch
if(typeof ensureScavLoadout==='function') ensureScavLoadout();
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
// 剧情专用地图只能从主菜单「剧情模式」进入
if(typeof storyMapBlocked==='function'&&storyMapBlocked()){
if(typeof showScorePop==='function') showScorePop('剧情地图只能在剧情模式进入 —— 请先选一张沙盒地图');
return;
}
consumeRaidStart();      // 首次部署 → 在这里建局; 之后从暂停菜单再进来则什么都不做
deployPlayer();
};
el('resumeBtn').onclick=()=>{
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
lockPointer();
};
renderer.domElement.addEventListener('click',()=>{
// 背包面板打开时鼠标已解锁, 点画布不能把指针锁回去 (否则无法拖拽物品)
if(typeof BAG_UI!=='undefined'&&BAG_UI&&BAG_UI.open) return;
if(player.alive&&player.deployed&&!pointerLocked&&!matchOver) lockPointer();
});
}
function showDeploy(isDead){
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
el('deploy').classList.remove('hidden');
el('blackOv').style.opacity=0;
// SCAV 拾荒者没有制式装备: 兵种卡只列兵种职能, 主武器由本局随机决定 (见 38_tarkov.ensureScavLoadout)
const _scavF=!!TEAM_FACTION[player.team].scav;
const _scavK=(_scavF&&RUN.scavLoadout&&RUN.scavLoadout.primary)||'';
CLASSES.forEach((c,i)=>{
const ws=TEAM_FACTION[player.team].cls[i];
const mainKey=(_scavF&&_scavK&&WPN_DEFS[_scavK])?_scavK:ws[0];
const modName=modDisplayName(mainKey);
// 过滤已移除武器: 直接 WPN_DEFS[k].name 会因为 undefined 抛错并中断整个部署界面
let d2=_scavF
?('主武器：'+(WPN_DEFS[mainKey]?WPN_DEFS[mainKey].name:'随机')+' · 拾荒者每局随机')
:ws.map(k=>WPN_DEFS[k]?WPN_DEFS[k].name:null).filter(Boolean).join(' · ');
if(i===2) d2+=' · 医疗箱['+keyLabelOf('skill')+'] · 绷带×6';
// 投掷物不再按兵种发放, 统一在市集自费购买后带入 (3 手雷 / 4 闪光 / 5 烟雾)
if(i===4) d2+=' · 工事['+keyLabelOf('build')+']';
if(modName!=='无改装') d2+='\n🔧'+modName;
el('cw'+i).textContent=d2;
});
el('deathInfo').innerHTML=(()=>{ 
if(!isDead) return '';
const lifeT=Math.max(0,nowT-(player.lifeStartT||nowT));
const mm2=Math.floor(lifeT/60), ss3=Math.floor(lifeT%60);
const lk=player.lifeKills||0, ls=(player.score||0)-(player.lifeScoreStart||0);
return (player.killerName?`你被 <b>${player.killerName}</b> 击杀了<br>`:'')+
`<span style="font-size:13px;color:#d8d8d8">本次存活 ${mm2}:${ss3<10?'0':''}${ss3} · 击杀 <b>${lk}</b> · 获得 <b>+${ls}</b> 分 &nbsp;|&nbsp; 本局总计 ${player.kills} 杀 / ${player.deaths} 死 / ${player.score} 分</span>`;
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
c.fillStyle='#1a1a1a'; c.fillRect(0,0,S,S);
const toM=(x,z)=>[S/2+x/(MAP_SIZE/2+10)*S/2, S/2+z/(MAP_SIZE/2+10)*S/2];
c.strokeStyle='rgba(150,150,150,.5)'; c.lineWidth=4;
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
c.fillStyle=f.owner===0?'rgba(90,140,220,.85)':f.owner===1?'rgba(220,110,90,.85)':'rgba(150,150,150,.7)';
c.fill();
c.fillStyle='#fff'; c.font='bold 13px sans-serif'; c.textAlign='center';
c.fillText(f.id,px,py+4);
}
if(typeof EXTRACT_POINTS!=='undefined'){
for(const ex of EXTRACT_POINTS){
const [px,py]=toM(ex.x,ex.z);
c.fillStyle='#35e0a0'; c.beginPath(); c.arc(px,py,15,0,TAU); c.fill();
c.fillStyle='#2d2d2d'; c.font='bold 12px sans-serif'; c.textAlign='center'; c.fillText('撤',px,py+4);
}
}
if(typeof LOOT_CRATES!=='undefined'){
for(const lc of LOOT_CRATES){
if(lc.searched) continue;
const [px,py]=toM(lc.x,lc.z);
c.fillStyle='#d8d8d8'; c.fillRect(px-4,py-4,8,8);
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
let sx,sz;
if(selectedSpawn===-1||typeof selectedSpawn==='string'){ sx=BASES[p.team].x; sz=BASES[p.team].z; }
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
const armor=ARMOR_DEFS[armorKey]||{name:'未装备防弹衣',hp:0,resist:0,weight:0,level:0};
// 头盔: 与护甲独立的槽位, 只保护头部 (见 38_tarkov.applyPlayerBodyDamage)
const helmetKey=(META.loadout.helmet&&ownedCount(META.loadout.helmet)>0)?META.loadout.helmet:(ownedHelmetList()[0]||'');
const helmet=HELMET_DEFS[helmetKey]||{name:'未装备头盔',hp:0,resist:0,weight:0,level:0};
// 耳机: 影响听力范围(脚步可听距离) / 脚步与枪声放大 / 环境音压制
// ⚠️ 耳罩式耳机(earMuff)与 Altyn(helm6) 物理冲突 —— 只有入耳式的 TEP-300 能配 Altyn
let headsetKey=(META.loadout.headset&&ownedCount(META.loadout.headset)>0)?META.loadout.headset:(ownedHeadsetList()[0]||'');
let headset=HEADSET_DEFS[headsetKey]||null;
if(headset&&headset.earMuff&&helmetKey==='helm6'){
  headset=null; headsetKey='';
  if(typeof showScorePop==='function') showScorePop('耳罩式耳机与 Altyn 头盔冲突 · 本局未佩戴耳机');
}
// 插板: 护甲本身只有凯夫拉; 必须有插板才有等级防护
const plateKey=(armorKey&&META.loadout.plate&&PLATE_DEFS[META.loadout.plate]&&ownedCount(META.loadout.plate)>0)?META.loadout.plate:'';
const plate=PLATE_DEFS[plateKey]||null;
const faceDown=!!(helmet.faceShield&&META.loadout.faceShield);
RUN.faceDown=faceDown;
RUN.headGear=faceDown?'face':'';
if(typeof syncHeadgearUI==='function') syncHeadgearUI();
p.plateKey=plateKey;
p.plateLevel=plate?plate.level:0;
p.plateBreakMul=plate?plate.breakMul:1;
p.plateDur=plate?(plate.durability||120):0; p.plateMax=p.plateDur;
p.faceDown=faceDown;
p.faceLevel=3;                 // 面罩本身是 3 级; 只有展开时才参与结算
p.faceBreakMul=1;
p.faceDur=helmet.faceShield?60:0; p.faceMax=p.faceDur;
// 血量上限 = 全身总血量 440 (+ 高级护甲的胸甲加成), 随后由 initRaidBody 按部位重写
p.maxHp=(typeof BODY_TOTAL_HP!=='undefined'?BODY_TOTAL_HP:440)+((armor.level>=4)?8:((armor.level>=2)?4:0));
p.armorKey=armorKey; p.armorDef=armor; p.armorResist=armor.resist*0.35;   // 无板=凯夫拉
p.helmetKey=helmetKey; p.helmetDef=helmet; p.helmetResist=helmet.resist*0.6;
p.helmetDur=helmet.hp||0; p.helmetMax=helmet.hp||0;
p.headsetKey=headsetKey; p.headsetDef=headset;
// 把听力档案交给音频层 (02_audio): 范围 / 放大 / 环境音压制
if(typeof AudioSys!=='undefined'&&AudioSys.setHearing) AudioSys.setHearing(headset);
p.hp=p.maxHp; p.alive=true; p.deployed=true; p.crouch=false; p.prone=false; p.chute=false;
p.limbs={head:100,arms:100,torso:100,legs:100};
p.stamina=1; p.suppressV=0; p.bloom=0;
p.ads=false; p.holdBreath=false; VM.adsBlend=0;
p.yaw=Math.atan2(-sx,-sz); p.pitch=0;
let primaryKey=META.loadout.primary;
// SCAV 拾荒者: 主武器由 ensureScavLoadout() 每局随机, 不走仓库校验 (随机到的枪不需要玩家拥有)
const _scavL=(typeof ensureScavLoadout==='function')?ensureScavLoadout():null;
if(_scavL) primaryKey=_scavL.primary;
if(!_scavL&&(!primaryKey||ownedCount(primaryKey)<=0)){
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
// 同步 SCAV 本局配装: 背包容量/重量/保险/掉落判定都读 raidLoadout() (见 38_tarkov)
if(_scavL){ _scavL.primary=primaryKey; _scavL.secondary=secondaryKey; _scavL.armor=armorKey; _scavL.plate=plateKey; _scavL.helmet=helmetKey; _scavL.headset=headsetKey; _scavL.pack=META.loadout.pack||'packSmall'; _scavL.chest=META.loadout.chest||''; }
const wkeys=[primaryKey,secondaryKey].filter(Boolean);
p.slots=wkeys.map(k=>{
const md=moddedDef(k)||WPN_DEFS[k];
return {key:k,def:md,mag:0,reserve:0,ammo:''};
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
if(p.cls===2) showScorePop(TOUCHUI?'医疗兵 · 左侧「医疗箱」放置 · 「绷带」自疗':'医疗兵 · 按 '+keyLabelOf('skill')+' 放置医疗箱 / '+keyLabelOf('heal')+' 包扎');
else if(p.cls===4) showScorePop(TOUCHUI?'工程兵 · 「工事」选类型 · 「建造」锤击建造':'工程兵 · 按 '+keyLabelOf('build')+' 选择工事, 按 '+keyLabelOf('skill')+' 锤击建造');
// 中立区域提示: 让玩家知道本区 NPC 不会先开火 (见 01_data.js 的 NPC_NEUTRAL)
if(NPC_NEUTRAL) setTimeout(()=>{ if(!matchOver) showScorePop('本区 NPC 中立 · 不会主动开火, 攻击后会遭到反击'); },1900);
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
lockPointer();
startDeployCut();
}
// 清掉上一局残留的场上对象。
// ⚠️ 只清 soldiers/combatants 数组是**不够的** —— buildSoldierMesh() 内部会 `scene.add(root)`,
//    数组清空后模型仍留在场景里, 变成「站着不动、收不到任何 AI 指令」的雕像。
//    (2026-09-19 用户反馈: 重开对局后部分 NPC 无指令输入输出)
// 注: 玩家工事(BUILDS)/迫击炮/物资箱的 mesh 直接挂在 world 上、没有单独句柄, 这里清不掉。
function clearRaidActors(){
 for(const s of soldiers){
  if(!s||!s.mesh||!s.mesh.root) continue;
  try{
   const root=s.mesh.root;
   // 名牌: 每人一张独立 canvas 贴图 → 必须释放
   if(s.mesh.tag){
    if(s.mesh.tag.material&&s.mesh.tag.material.map) s.mesh.tag.material.map.dispose();
    if(s.mesh.tag.material) s.mesh.tag.material.dispose();
   }
   // 几何都是 bx() 现建的(每人一套) → 释放; 材质只释放标了 perSoldier 的
   // ⚠️ uniformMats[team] 是共享材质, 绝不能 dispose
   root.traverse(o=>{
    if(!o.isMesh) return;
    if(o.geometry) o.geometry.dispose();
    const mt=o.material;
    if(mt&&mt.userData&&mt.userData.perSoldier){ if(mt.map) mt.map.dispose(); mt.dispose(); }
   });
   scene.remove(root);
  }catch(e){}
  s.mesh=null;
 }
 soldiers.length=0;
 if(typeof RAG!=='undefined'&&RAG.list) while(RAG.list.length) removeRagdoll(RAG.list[0]);
 if(typeof DEBRIS!=='undefined'&&DEBRIS.list) while(DEBRIS.list.length) removeDebrisEntry(DEBRIS.list.shift());
 if(typeof CORPSES!=='undefined'&&CORPSES.length) CORPSES.length=0;
}
function startMatch(){
// 剧情专用地图只能从主菜单「剧情模式」进入 —— 沙盒不给建局
if(typeof storyMapBlocked==='function'&&storyMapBlocked()){
  if(typeof showScorePop==='function') showScorePop('剧情地图只能在剧情模式进入 —— 请先选一张沙盒地图');
  return;
}
// 新的一局: 允许 applyDeployLoadout 发放带入的弹药盒(重生时不重复)
RUN._loadoutApplied=false;
clearRaidActors();
// 剧情模式: 装载本章目标与事件 (没走剧情时是 no-op)
if(typeof storyApplyChapter==='function') storyApplyChapter();
combatants.length=0; combatants.push(player);
if(typeof ENEMY_SQUADS!=='undefined'){ for(const k in ENEMY_SQUADS) delete ENEMY_SQUADS[k]; }
const names0=[...TEAM_FACTION[0].names].sort(()=>Math.random()-0.5);
const names1=[...TEAM_FACTION[1].names].sort(()=>Math.random()-0.5);
const nameIdx=[0,0];
const nextName=t=>(t===0?names0:names1)[nameIdx[t]++%(t===0?names0:names1).length];
// ===== NPC 武器: 按玩家主武器市价匹配 (2026-09-17 用户需求) =====
// 以前: 友军与非制式守备从全部 57 把里**纯随机**抽(可能给手枪, 也可能给 AWM),
//       与玩家带什么完全无关 → 玩家带高价枪时队友显得寒酸。
// 现在: 以玩家**本局主武器市价**为锚点, 在价位带内抽; 带太窄就逐步放宽, 保证候选池够大。
// ⚠️ **制式守备不参与**(实验室/港口/机场的 PMC·USEC 固定用 MP5/G36C/G28 一系) —— 那是设定。
const BOT_WPN_BANDS=[[0.72,1.45],[0.5,2.0],[0.35,3.0],[0.15,6.0]];
function botValueWeaponPool(anchor){
  const all=Object.keys(WPN_DEFS);
  if(typeof weaponPrice!=='function') return all;     // 37_meta 尚未加载时的兜底
  for(const [lo,hi] of BOT_WPN_BANDS){
    const pool=all.filter(k=>{ const p=weaponPrice(k); return p>=anchor*lo&&p<=anchor*hi; });
    if(pool.length>=6) return pool;                   // 池子太小就没有"随机"可言了
  }
  return all;
}
function botWeaponAnchor(){
  try{
    const L=(typeof raidLoadout==='function')?raidLoadout():null;
    const pk=L&&L.primary;
    if(pk&&WPN_DEFS[pk]&&typeof weaponPrice==='function'){
      const p=weaponPrice(pk);
      if(p>0) return p;
    }
  }catch(e){}
  return 900;   // 兜底: 中档步枪价位
}
const _botAnchor=botWeaponAnchor();
const _botPool=botValueWeaponPool(_botAnchor);
for(let t=0;t<2;t++){
const n=t===player.team?FRIENDLY_BOT_COUNT:ENEMY_BOT_COUNT;
// 敌方(PMC)强制走 numeric cls 路径: 29_menus 默认给所有 Bot 传字符串武器 key 进 customWeapon 分支,
// 完全绕过 FACTIONS.X.cls 表。PMC 作为守备精锐要走自己那套统一装备,
// 所以对其判定后用 numeric index, 让 setClass 走 TEAM_FACTION[t].cls[index] 路径
// 守备方走「自己那套制式装备」而不是全武器随机: USEC 与 PMC 都是合同/制式部队。
// 街区守备是德军(普通清场分队), 保持全武器随机 —— 这是原本的设计。
// 注意: 玩家选 PMC 时敌方会变成 USEC, 所以两种都要覆盖。
const _foeShort=TEAM_FACTION[t].short;
const isUniformEnemy=(t!==player.team)&&(_foeShort==='PMC'||_foeShort==='USEC');
// ⚠ cls 表可能比 CLASSES 长 (PMC/原 USEC 有 6 项, CLASSES 只有 5 项)。randi 是闭区间,
// 不夹住就会取到 CLASSES[5] === undefined → setClass 抛错 → 整个 startMatch 中断。
const pmcClsLen=Math.min((TEAM_FACTION[t].cls&&TEAM_FACTION[t].cls.length)||0, CLASSES.length);
for(let i=0;i<n;i++){
let _wp;
if(isUniformEnemy&&pmcClsLen>0){
 // 制式守备(实验室/港口/机场的 PMC·USEC): **固定用自己那套制式装备**(MP5/G36C/G28 一系),
 // 不参与价值匹配 —— 这是游戏设定, 用户 2026-09-17 明确要求保持。
 // 返回索引 → 走 setClass(index) 那条路, 保留兵种属性与阵营辨识度。
 _wp=randi(0,pmcClsLen-1);
} else {
 // 友军 + 非制式守备(如街区的德军): 在"玩家主武器同价位"池里抽
 // (返回武器 key → 走 customWeapon 那条路)
 _wp=_botPool[randi(0,_botPool.length-1)];
}
const bot=new Bot(t,_wp,nextName(t));
bot.spawn(t!==player.team);
}
}
// 撤离模式: 无旗点/无占点, 重置本局搜刮与击杀进度
if(GAMEMODE==='extract'){
el('flagIcons').style.display='none';
el('capPanel').style.display='none';
matchTime=5*60;   // 5 分钟一局 (2026-09-18)
RUN.kills=0; RUN.searches=0; RUN.loot={}; RUN.extracting=false; RUN.scav=false; RUN.scavLoadout=null; RUN.passBrought=false; RUN.nvgBrought=false; RUN.nvgKey=''; RUN.timeout=false;
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
matchTime=GAMEMODE==='assault'?5*60:5*60;   // 统一 5 分钟
}
}
// SCAV 出击: 掷本局随机主武器。必须在 showDeploy() 之前 —— 部署界面要显示本局那把枪。
if(typeof ensureScavLoadout==='function') ensureScavLoadout();
// 己方: 1 支 4 人小队(玩家 + 3 AI), 受玩家小队指令
const base=BASES[player.team];
const dir=base.x<0?1:-1;
// ⚠️ 落位: 理想环位被挡时**往外扩**, 不要交给 findFreeSpawn —— 它是从 r=0 由内向外找,
//    被挡时会把人推回锚点附近, 结果整队挤成一坨 (2026-09-18 实测港口出现两个敌人相距 1.9m)。
function ringSpawn(cx,cz,ang,baseR){
for(let k=0;k<6;k++){
const r=baseR+k*2.2;
const px=cx+Math.sin(ang)*r, pz=cz+Math.cos(ang)*r;
if(!occBlocked(px,pz)) return [px,pz];
}
return findFreeSpawn(cx+Math.sin(ang)*baseR,cz+Math.cos(ang)*baseR);
}
// ⚠️ z 必须相对基地算, 不能硬编码 —— 原来写死 22/-22/-2, 只在基地落在 z=0 轴上的地图
//    (街区/实验室)成立。港口基地在 z=±64 → 队友被扔到 z=22, 离玩家 91m;
//    机场基地在 z=±46 → 74m, 玩家开镜都看不到, 表现就是"这张图没有队友"。
//    对 z=0 的地图结果不变。
const squadStarts=[
{x:base.x+dir*34,z:base.z+22},
{x:base.x+dir*18,z:base.z-22},
{x:base.x+dir*50,z:base.z-2}
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
const fp=ringSpawn(st.x,st.z,sa,5.5);
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
// ⚠️ 2026-09-18 用户反馈「每个地图的敌方 NPC 都过于密集」。
//    原来三个锚点全挤在基地 20~38m 内 (成员再 ±6m), 实测 12 人只占地图 1.8%~6.8% 面积,
//    最近邻中位只有 3.7~8.6m —— 基本是一坨。
//    现在按地图尺寸铺开: 沿"基地→地图中心"方向分 3 段(后卫 / 中段 / 前出),
//    横向用交错的正负偏移拉开; 偏移量受"离地图边界还剩多少"限制, 免得贴边。
const _S=MAP_SIZE, _zRoom=Math.max(20, MAP_EDGE-Math.abs(enemyBase.z));
const _lat=(f)=>Math.min(_S*f, _zRoom*0.9);
// 锚点数量跟着编制走 (8 人 = 2 支小队, 12 人 = 3 支), 在敌方半场均匀铺开
const enemySquadAnchors=[];
for(let k=0;k<ENEMY_SQUAD_COUNT;k++){
const _t=ENEMY_SQUAD_COUNT===1?0.5:(k/(ENEMY_SQUAD_COUNT-1));
enemySquadAnchors.push({
x:enemyBase.x+eDir*_S*(0.16+0.34*_t),
z:clamp(enemyBase.z+(k%2?-1:1)*_lat(0.20+0.06*k),-MAP_EDGE,MAP_EDGE)
});
}
// 锚点本身若落在障碍里, 整队会被 findFreeSpawn 挤成一团 → 先把它往地图中心方向挪到空位
for(const a of enemySquadAnchors){
for(let k=0;k<14&&occBlocked(a.x,a.z);k++){ a.x+=(0-a.x)*0.07; a.z+=(0-a.z)*0.07; }
}
enemy.forEach((s,i)=>{
const gi=Math.floor(i/ENEMY_SQUAD_SIZE);
s.squadGroup=gi+1;
s.inSquad=false;           // 不跟随 SQUAD, 走独立小队 AI
s.squadAnchor=enemySquadAnchors[gi%enemySquadAnchors.length];
if(s.mesh&&s.mesh.tag) s.mesh.tag.material.color.set(0xffb3a6);
// 小队成员在锚点周围散开落位 (半径比原来大一些, 免得整队还是一坨)
const wi=i%ENEMY_SQUAD_SIZE;
const sa=(wi/ENEMY_SQUAD_SIZE)*Math.PI*2+gi*0.8;
const _sr=8.5;
const fp=ringSpawn(s.squadAnchor.x,s.squadAnchor.z,sa,_sr);
s.pos.set(fp[0],0,fp[1]);
s.pos.y=standHeight(s.pos.x,s.pos.z,10);
s.path=null;
s.state='defend';
s.pickObjective();
});
}
let lastT=performance.now(), fpsAcc=0, fpsN=0, fpsShow=0;
