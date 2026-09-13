'use strict';
function addKillfeed(attacker,victim,isHead){
const kf=el('killfeed');
const div=document.createElement('div');
const an=attacker.isPlayer?'<span class="me">你</span>':`<span class="kf${attacker.team}">${attacker.name}</span>`;
const vn=victim.isPlayer?'<span class="me">你</span>':`<span class="kf${victim.team}">${victim.name}</span>`;
div.innerHTML=`${an} ${isHead?'☠':'✕'} ${vn}`;
kf.prepend(div);
while(kf.children.length>6) kf.lastChild.remove();
setTimeout(()=>{ div.style.opacity=0; setTimeout(()=>div.remove(),1000); },5200);
}
function addKillMsg(txt,team){
const m=el('msgC');
m.textContent=txt;
m.style.color=team===player.team?'#ffe08a':'#ff8a7a';
m.style.opacity=1;
clearTimeout(m._t);
m._t=setTimeout(()=>m.style.opacity=0,2400);
}
let scorePopT=null;
function showScorePop(txt){
const s=el('scorePop');
s.textContent=txt; s.style.opacity=1;
clearTimeout(scorePopT);
scorePopT=setTimeout(()=>s.style.opacity=0,1400);
}
function onPlayerKill(victim,isHead){
player.score+=isHead?125:100;
player.lifeKills=(player.lifeKills||0)+1;
RUN.kills=(RUN.kills||0)+1;
showScorePop(isHead?'+125 爆头击杀 · 尸体可搜刮[F]':'+100 击杀 · 尸体可搜刮[F]');
const hm=el('hitmark');
hm.classList.add('kill');
hm.style.opacity=1;
setTimeout(()=>hm.style.opacity=0,320);
AudioSys.hitmarkSnd(true);
}
function onPlayerHit(sol,isHead){
const hm=el('hitmark');
hm.classList.remove('kill');
hm.style.opacity=1;
clearTimeout(hm._t);
hm._t=setTimeout(()=>hm.style.opacity=0,140);
AudioSys.hitmarkSnd(false);
}
function addDirHit(worldAng){
const rel=worldAng-player.yaw+Math.PI;
const d=document.createElement('div');
d.className='dirHit';
d.style.transform=`rotate(${-rel}rad)`;
el('dirHits').appendChild(d);
setTimeout(()=>d.remove(),900);
}
function updateScoreboard(){
const mk=(team,tb)=>{
const rows=[];
const list=combatants.filter(c=>c.team===team);
list.sort((a,b)=>(b.score||0)-(a.score||0));
for(const c of list){
rows.push(`<tr class="${c.isPlayer?'meRow':''}"><td>${c.isPlayer?'★ 你':c.name}</td><td>${c.kills||0}</td><td>${c.deaths||0}</td><td>${c.score||0}</td></tr>`);
}
el(tb).innerHTML=rows.join('');
};
mk(0,'sbL'); mk(1,'sbR');
}
const mmC=el('minimap').getContext('2d');
function drawMinimap(){
const S=190, half=S/2, range=90;
mmC.clearRect(0,0,S,S);
mmC.save();
mmC.beginPath(); mmC.arc(half,half,half-2,0,TAU); mmC.clip();
mmC.fillStyle='rgba(24,32,18,.9)'; mmC.fillRect(0,0,S,S);
const cx=player.alive?player.pos.x:0, cz=player.alive?player.pos.z:0;
const rot=player.alive?player.yaw:0;
const toMap=(x,z)=>{
let dx=x-cx, dz=z-cz;
const c=Math.cos(rot), s=Math.sin(rot);
const rx=dx*c-dz*s, rz=dx*s+dz*c;
return [half+rx/range*half, half+rz/range*half];
};
mmC.strokeStyle='rgba(150,130,90,.4)'; mmC.lineWidth=5;
if(CAMPAIGN.sineRoad){
mmC.beginPath();
for(let x=-155;x<=155;x+=10){
const [px,py]=toMap(x,3*Math.sin(x*0.02));
x===-155?mmC.moveTo(px,py):mmC.lineTo(px,py);
}
mmC.stroke();
}
for(const r of CAMPAIGN.roads){
mmC.beginPath();
const [ax,ay]=toMap(r[0],r[1]), [bx2,by2]=toMap(r[2],r[3]);
mmC.moveTo(ax,ay); mmC.lineTo(bx2,by2);
mmC.stroke();
}
for(const f of FLAGS){
const [px,py]=toMap(f.x,f.z);
mmC.beginPath(); mmC.arc(px,py,10,0,TAU);
mmC.fillStyle=f.owner===0?'rgba(90,140,220,.75)':f.owner===1?'rgba(220,110,90,.75)':'rgba(160,160,150,.6)';
mmC.fill();
if(f.capTeam!==-1&&f.cap>0.03){
mmC.beginPath(); mmC.arc(px,py,12,-HPI,-HPI+f.cap*TAU);
mmC.strokeStyle='#fff'; mmC.lineWidth=2; mmC.stroke();
}
mmC.fillStyle='#fff'; mmC.font='bold 11px sans-serif'; mmC.textAlign='center';
mmC.fillText(f.id,px,py+4);
}
if(typeof EXTRACT_POINTS!=='undefined'){
for(const ex of EXTRACT_POINTS){
const [px,py]=toMap(ex.x,ex.z);
mmC.fillStyle='#35e0a0';
mmC.beginPath(); mmC.moveTo(px,py-7); mmC.lineTo(px+7,py); mmC.lineTo(px,py+7); mmC.lineTo(px-7,py); mmC.closePath(); mmC.fill();
mmC.fillStyle='#082d20'; mmC.font='bold 8px sans-serif'; mmC.fillText('撤',px,py+3);
}
}
if(typeof LOOT_CRATES!=='undefined'){
for(const lc of LOOT_CRATES){
if(lc.searched) continue;
const [px,py]=toMap(lc.x,lc.z);
mmC.fillStyle='#d8b04a'; mmC.fillRect(px-2.5,py-2.5,5,5);
}
}
for(const s of soldiers){
if(!s.alive||s.onVehicle) continue;
const [px,py]=toMap(s.pos.x,s.pos.z);
if(px<0||py<0||px>S||py>S) continue;
if(s.team===player.team){
mmC.fillStyle='#7dd87d';
mmC.beginPath(); mmC.arc(px,py,2.5,0,TAU); mmC.fill();
} else if(nowT-s.lastFiredT<2.5){
mmC.fillStyle='#ff5040';
mmC.beginPath(); mmC.arc(px,py,3,0,TAU); mmC.fill();
}
}
for(const n of nades){
const [px,py]=toMap(n.pos.x,n.pos.z);
mmC.fillStyle='#ffd050'; mmC.fillRect(px-1.5,py-1.5,3,3);
}
// 小队标记
if((SQUAD.mode==='move'||SQUAD.mode==='guard')&&SQUAD.members.length){
const [px,py]=toMap(SQUAD.pos.x,SQUAD.pos.z);
mmC.fillStyle=SQUAD.mode==='guard'?'#7dd87d':'#ffd75a';
mmC.beginPath(); mmC.moveTo(px,py+5); mmC.lineTo(px-4,py-3); mmC.lineTo(px+4,py-3); mmC.closePath(); mmC.fill();
}
if(SQUAD.mode==='attack'&&SQUAD.target&&SQUAD.target.alive){
const [px,py]=toMap(SQUAD.target.pos.x,SQUAD.target.pos.z);
mmC.strokeStyle='#ff5040'; mmC.lineWidth=2;
mmC.beginPath(); mmC.arc(px,py,5,0,TAU); mmC.stroke();
mmC.beginPath(); mmC.moveTo(px-8,py); mmC.lineTo(px+8,py); mmC.moveTo(px,py-8); mmC.lineTo(px,py+8); mmC.stroke();
}
for(const t of tanks){
if(!t.alive) continue;
const [px,py]=toMap(t.pos.x,t.pos.z);
if(px<-8||py<-8||px>S+8||py>S+8) continue;
mmC.fillStyle=t.team===0?'#6da5e8':'#e87a68';
mmC.fillRect(px-4,py-4,8,8);
mmC.strokeStyle='#fff'; mmC.lineWidth=1; mmC.strokeRect(px-4,py-4,8,8);
}
for(const pl of planes){
if(!pl.alive) continue;
const [px,py]=toMap(pl.pos.x,pl.pos.z);
if(px<-8||py<-8||px>S+8||py>S+8) continue;
mmC.save();
mmC.translate(px,py);
mmC.rotate(-(pl.yaw)+(player.alive?player.yaw:0)+Math.PI);
mmC.fillStyle=pl.team===0?'#9dc5f8':'#f8a898';
mmC.beginPath(); mmC.moveTo(0,-5); mmC.lineTo(4,4); mmC.lineTo(0,2); mmC.lineTo(-4,4); mmC.closePath(); mmC.fill();
mmC.restore();
}
if(player.alive){
mmC.save();
mmC.translate(half,half);
mmC.fillStyle='#fff';
mmC.beginPath(); mmC.moveTo(0,-6); mmC.lineTo(4,5); mmC.lineTo(-4,5); mmC.closePath(); mmC.fill();
mmC.restore();
}
mmC.restore();
mmC.strokeStyle='rgba(210,200,160,.4)'; mmC.lineWidth=1.5;
mmC.beginPath(); mmC.arc(half,half,half-2,0,TAU); mmC.stroke();
}
const cpC=el('compass').getContext('2d');
function drawCompass(){
const W=460,H=26;
cpC.clearRect(0,0,W,H);
cpC.fillStyle='rgba(0,0,0,.35)'; cpC.fillRect(0,0,W,H);
const yaw=player.alive?player.yaw:0;
cpC.font='12px sans-serif'; cpC.textAlign='center';
const marks=[[0,'北'],[HPI,'西'],[Math.PI,'南'],[-HPI,'东'],[Math.PI/4,'西北'],[-Math.PI/4,'东北'],[Math.PI*0.75,'西南'],[-Math.PI*0.75,'东南']];
for(const [a,label] of marks){
let rel=angDiff(yaw,a);
if(Math.abs(rel)>1.2) continue;
const x=W/2-rel/1.2*(W/2);
cpC.fillStyle='rgba(255,255,255,.75)';
cpC.fillText(label,x,17);
}
for(const f of FLAGS){
const a=Math.atan2(player.pos.x-f.x,player.pos.z-f.z);
let rel=angDiff(yaw,a);
if(Math.abs(rel)>1.2) continue;
const x=W/2-rel/1.2*(W/2);
cpC.fillStyle=f.owner===0?'#8fc1ff':f.owner===1?'#ff9c8a':'#ccc';
cpC.font='bold 13px sans-serif';
cpC.fillText(f.id,x,13);
cpC.fillRect(x-1,18,2,5);
cpC.font='12px sans-serif';
}
if(typeof EXTRACT_POINTS!=='undefined'){
for(const ex of EXTRACT_POINTS){
const a=Math.atan2(player.pos.x-ex.x,player.pos.z-ex.z);
let rel=angDiff(yaw,a);
if(Math.abs(rel)>1.2) continue;
const x=W/2-rel/1.2*(W/2);
cpC.fillStyle='#35e0a0'; cpC.font='bold 13px sans-serif';
cpC.fillText('撤',x,13);
cpC.fillRect(x-1,18,2,5);
}
}
cpC.fillStyle='#ffd77a'; cpC.fillRect(W/2-1,2,2,6);
}
// ===== 大地图 (M键): 北向上全图, 全局态势 =====
const bmC=el('bigmap').getContext('2d');
function drawBigMap(){
const S=780, half=S/2;
const toM=(x,z)=>[half+x/(MAP_SIZE/2+10)*half, half+z/(MAP_SIZE/2+10)*half];
bmC.clearRect(0,0,S,S);
bmC.fillStyle='rgba(14,20,12,.97)'; bmC.fillRect(0,0,S,S);
// 网格
bmC.strokeStyle='rgba(140,130,100,.12)'; bmC.lineWidth=1;
for(let g=-MAP_HALF;g<=MAP_HALF;g+=50){
const [gx,gy]=toM(g,0);
bmC.beginPath(); bmC.moveTo(gx,0); bmC.lineTo(gx,S); bmC.stroke();
const [gx2,gy2]=toM(0,g);
bmC.beginPath(); bmC.moveTo(0,gy2); bmC.lineTo(S,gy2); bmC.stroke();
}
// 河流
if(RIVER){
bmC.strokeStyle='rgba(90,150,200,.4)'; bmC.lineWidth=6;
bmC.beginPath();
RIVER.pts.forEach(([rx,rz],i)=>{
const [px,py]=toM(rx,rz);
i===0?bmC.moveTo(px,py):bmC.lineTo(px,py);
});
bmC.stroke();
}
// 道路
bmC.strokeStyle='rgba(160,140,100,.5)'; bmC.lineWidth=5;
if(CAMPAIGN.sineRoad){
bmC.beginPath();
for(let x=-155;x<=155;x+=10){
const [px,py]=toM(x,3*Math.sin(x*0.02));
x===-155?bmC.moveTo(px,py):bmC.lineTo(px,py);
}
bmC.stroke();
}
for(const r of CAMPAIGN.roads){
bmC.beginPath();
const [ax,ay]=toM(r[0],r[1]), [bx2,by2]=toM(r[2],r[3]);
bmC.moveTo(ax,ay); bmC.lineTo(bx2,by2);
bmC.stroke();
}
// 战壕线
bmC.strokeStyle='rgba(150,120,80,.25)'; bmC.lineWidth=3;
for(const t of (CAMPAIGN.trench||[])){
bmC.beginPath();
const [ax,ay]=toM(t[0],t[1]), [bx2,by2]=toM(t[2],t[3]);
bmC.moveTo(ax,ay); bmC.lineTo(bx2,by2);
bmC.stroke();
}
// 基地
[0,1].forEach(t=>{
const [px,py]=toM(BASES[t].x,BASES[t].z);
bmC.fillStyle=t===0?'#4a70b0':'#b05a4a';
bmC.fillRect(px-9,py-9,18,18);
bmC.fillStyle='#fff'; bmC.font='bold 13px sans-serif'; bmC.textAlign='center';
bmC.fillText(TEAM_NAME[t][0],px,py+4);
});
// 旗点
for(const f of FLAGS){
const [px,py]=toM(f.x,f.z);
bmC.beginPath(); bmC.arc(px,py,15,0,TAU);
bmC.fillStyle=f.owner===0?'rgba(90,140,220,.85)':f.owner===1?'rgba(220,110,90,.85)':'rgba(150,150,140,.7)';
bmC.fill();
if(f.capTeam!==-1&&f.cap>0.03){
bmC.beginPath(); bmC.arc(px,py,18,-HPI,-HPI+f.cap*TAU);
bmC.strokeStyle='#fff'; bmC.lineWidth=3; bmC.stroke();
}
bmC.fillStyle='#fff'; bmC.font='bold 15px sans-serif'; bmC.textAlign='center';
bmC.fillText(f.id,px,py+5);
}
if(typeof EXTRACT_POINTS!=='undefined'){
for(const ex of EXTRACT_POINTS){
const [px,py]=toM(ex.x,ex.z);
bmC.fillStyle='#35e0a0'; bmC.beginPath(); bmC.arc(px,py,16,0,TAU); bmC.fill();
bmC.fillStyle='#082d20'; bmC.font='bold 15px sans-serif'; bmC.fillText('撤',px,py+5);
}
}
if(typeof LOOT_CRATES!=='undefined'){
for(const lc of LOOT_CRATES){
if(lc.searched) continue;
const [px,py]=toM(lc.x,lc.z);
bmC.fillStyle='#d8b04a'; bmC.fillRect(px-5,py-5,10,10);
}
}
// 士兵
for(const s of soldiers){
if(!s.alive||s.onVehicle) continue;
const [px,py]=toM(s.pos.x,s.pos.z);
if(s.team===player.team){
bmC.fillStyle='#7dd87d';
bmC.beginPath(); bmC.arc(px,py,3.5,0,TAU); bmC.fill();
} else if(nowT-s.lastFiredT<2.5){
bmC.fillStyle='#ff5040';
bmC.beginPath(); bmC.arc(px,py,4,0,TAU); bmC.fill();
}
}
// 手雷/爆点
for(const n of nades){
const [px,py]=toM(n.pos.x,n.pos.z);
bmC.fillStyle='#ffd050'; bmC.fillRect(px-2,py-2,4,4);
}
// 小队标记
if((SQUAD.mode==='move'||SQUAD.mode==='guard')&&SQUAD.members.length){
const [px,py]=toM(SQUAD.pos.x,SQUAD.pos.z);
bmC.fillStyle=SQUAD.mode==='guard'?'#7dd87d':'#ffd75a';
bmC.beginPath(); bmC.moveTo(px,py+9); bmC.lineTo(px-7,py-5); bmC.lineTo(px+7,py-5); bmC.closePath(); bmC.fill();
}
if(SQUAD.mode==='attack'&&SQUAD.target&&SQUAD.target.alive){
const [px,py]=toM(SQUAD.target.pos.x,SQUAD.target.pos.z);
bmC.strokeStyle='#ff5040'; bmC.lineWidth=3;
bmC.beginPath(); bmC.arc(px,py,9,0,TAU); bmC.stroke();
bmC.beginPath(); bmC.moveTo(px-13,py); bmC.lineTo(px+13,py); bmC.moveTo(px,py-13); bmC.lineTo(px,py+13); bmC.stroke();
}
// 坦克
for(const t of tanks){
if(!t.alive) continue;
const [px,py]=toM(t.pos.x,t.pos.z);
bmC.fillStyle=t.team===0?'#6da5e8':'#e87a68';
bmC.fillRect(px-5,py-5,10,10);
bmC.strokeStyle='#fff'; bmC.lineWidth=1.5; bmC.strokeRect(px-5,py-5,10,10);
}
// 飞机
for(const pl of planes){
if(!pl.alive) continue;
const [px,py]=toM(pl.pos.x,pl.pos.z);
bmC.save();
bmC.translate(px,py);
bmC.rotate(-(pl.yaw)+Math.PI);
bmC.fillStyle=pl.team===0?'#9dc5f8':'#f8a898';
bmC.beginPath(); bmC.moveTo(0,-7); bmC.lineTo(5,5); bmC.lineTo(0,3); bmC.lineTo(-5,5); bmC.closePath(); bmC.fill();
bmC.restore();
}
// 玩家
if(player.alive){
const [px,py]=toM(player.pos.x,player.pos.z);
bmC.save();
bmC.translate(px,py);
bmC.rotate(-player.yaw);
bmC.fillStyle='#fff';
bmC.beginPath(); bmC.moveTo(0,-8); bmC.lineTo(6,7); bmC.lineTo(0,3); bmC.lineTo(-6,7); bmC.closePath(); bmC.fill();
bmC.restore();
}
// 图例/比分条
bmC.fillStyle='rgba(0,0,0,.55)'; bmC.fillRect(0,S-52,S,52);
const t0s=(!isFinite(tickets[0])||(GAMEMODE!=='conquest'&&DEF===0))?'∞':Math.ceil(tickets[0]);
const t1s=(!isFinite(tickets[1])||(GAMEMODE!=='conquest'&&DEF===1))?'∞':Math.ceil(tickets[1]);
bmC.textAlign='center'; bmC.font='bold 15px sans-serif';
bmC.fillStyle='#8fc1ff'; bmC.fillText(TEAM_NAME[0]+' '+t0s, half-140, S-22);
bmC.fillStyle='#ff9c8a'; bmC.fillText(t1s+' '+TEAM_NAME[1], half+140, S-22);
const mm=Math.floor(Math.max(0,matchTime)/60), ss2=Math.floor(Math.max(0,matchTime)%60);
bmC.fillStyle='#e8dcb0'; bmC.fillText(`${mm}:${ss2<10?'0':''}${ss2}`, half, S-22);
let modeLine='';
if(GAMEMODE==='assault') modeLine='攻防战 · 目标 '+FLAGS[Math.min(assaultIdx,FLAGS.length-1)].id+' 点';
else if(GAMEMODE==='demolition') modeLine='破袭战 · 补给库 '+DEPOTS.filter(d=>!d.destroyed).length+'/'+DEPOTS.length;
else if(GAMEMODE==='extract') modeLine='撤离行动 · 搜刮并抵达南侧撤离灯塔';
else modeLine='征服战 · 抢占全部旗点';
bmC.fillStyle='#b8ae88'; bmC.font='13px sans-serif';
bmC.fillText(modeLine+' · '+CAMPAIGN.title, half, S-36);
const sm=SQUAD.members.length?SQUAD.members.filter(s=>s.alive).length:0;
const stxt=SQUAD.mode==='move'?'进攻标记':SQUAD.mode==='guard'?'驻守标记':SQUAD.mode==='attack'?'攻击指定目标':'跟随';
bmC.fillStyle='#ffd77a'; bmC.fillText('小队 '+sm+'/'+(SQUAD.members.length||0)+' · '+stxt, half, S-6);
}
let hudSlowT=0;
function updateHUD(dt){
const w=player.curW;
if(player.onVehicle&&player.onVehicle.kind==='plane'){
const t=player.onVehicle;
 const stallW=(!t.def.chopper&&!t.vtolOn&&t.speed<t.def.spd[0]*0.85)?' · <span style="color:#ff7a5a">失速!</span>':'';
el('wmode').innerHTML='机体 '+Math.max(0,Math.round(t.hp/t.maxHp*100))+'% · 速度 '+Math.round(t.speed*4)+' · 油门 '+Math.round((t.throttle??0.8)*100)+'%'+stallW;
el('magN').textContent=Math.round(t.speed*3.6)+'km/h';
el('magN').style.color='#eee';
el('resN').textContent='高度 '+Math.round(t.pos.y)+'m';
 const bombTxt=t.def.bombs>0?' · 炸弹 ×'+t.bombs+' [右键/B]':'';
 const vtolTxt=t.def.vtol?(t.vtolOn?' · <span style="color:#7ad8ff">VTOL 悬停</span> [V 退出]':' · [V] 垂直起降'):'';
 const camTxt=player.planeView?' · 驾驶舱 [C 退出]':' · [C] 驾驶舱';
 el('nadeN').textContent=(t.def.chopper?'W/S 节流阀 · A/D 方向舵 · 鼠标俯仰':(t.vtolOn?'W/S 垂直升降 · A/D 偏航 · 鼠标姿态':'A/D 压坡转向 · Q/E 方向舵 · 鼠标拉杆'))+vtolTxt+camTxt+bombTxt;
} else if(player.onVehicle&&player.onVehicle.kind==='apc'&&player.playerSeat>=0){
// 运兵车乘客: 显示手中武器(可车内射击)
const t=player.onVehicle;
if(w){
el('wname').textContent=w.def.name+' · 搭乘'+t.name;
el('wmode').textContent=w.def.mode;
el('magN').textContent=w.mag;
el('magN').style.color=w.mag<=w.def.mag*0.25?'#e8836a':'#eee';
el('resN').textContent='| '+w.reserve;
el('nadeN').textContent='车况 '+Math.max(0,Math.round(t.hp/t.maxHp*100))+'% · F 下车';
}
} else if(player.onVehicle&&player.onVehicle.kind==='apc'){
const t=player.onVehicle;
el('wname').textContent=t.name;
el('wmode').textContent='车况 '+Math.max(0,Math.round(t.hp/t.maxHp*100))+'%';
el('magN').textContent=Math.round(Math.abs(t.vel)*3.6*2.4)+'km/h';
el('magN').style.color='#eee';
el('resN').textContent='载员 '+(t.passengers.length+(t.playerSeat>=0?1:0))+'/'+(t.def.seats||6);
el('nadeN').textContent='WASD 驾驶 · 附近步兵自动上车 · F 下车';
} else if(player.onVehicle){
const t=player.onVehicle;
el('wname').textContent=t.name;
el('wmode').textContent='装甲 '+Math.max(0,Math.round(t.hp/t.maxHp*100))+'%';
el('magN').textContent=t.cannonCd<=0?'就绪':t.cannonCd.toFixed(1);
el('magN').style.color=t.cannonCd<=0?'#9fd89f':'#e0c080';
el('resN').textContent='';
el('nadeN').textContent='主炮[左键] · 机枪[右键] · 视角[F]';
} else if(player.onAT){
el('wname').textContent='57mm 反坦克炮';
el('wmode').textContent='穿甲弹';
el('magN').textContent=player.onAT.cd<=0?'就绪':player.onAT.cd.toFixed(1);
el('magN').style.color=player.onAT.cd<=0?'#9fd89f':'#e0c080';
el('resN').textContent=''; el('nadeN').textContent='';
} else if(player.onAA){
el('wname').textContent='防空炮';
el('wmode').textContent='高爆弹';
el('magN').textContent='∞';
el('magN').style.color='#eee';
el('resN').textContent=''; el('nadeN').textContent='';
} else if(w){
el('wname').textContent=player.onMG?'MG42 通用机枪':w.def.name;
el('wmode').textContent=player.onMG?'全自动':w.def.mode;
el('magN').textContent=player.onMG?'∞':w.mag;
el('resN').textContent=player.onMG?'':'/ '+w.reserve;
el('magN').style.color=(!player.onMG&&w.mag<=Math.max(2,w.def.mag*0.25))?'#ff7060':'#eee';
// 投掷物自费: 直接显示带入的余量, 与兵种无关
el('nadeN').textContent='手雷[3] ×'+player.nadeCount+' · 闪光[4] ×'+(player.flashCount||0)+' · 烟雾[5] ×'+player.smokeCount+(player.cls===2?' · 医疗箱[B] ×'+(player.medkitUsed?'0':'1'):'');
}
// 血条已移除: 血量完全由左下角人体状态图表达(白/黄/红/黑), 不再显示任何 hp 数字与进度条
el('stamBar').style.width=(player.stamina*100)+'%';
if(el('armorHud')) el('armorHud').textContent=player.armorDef?`防弹衣 ${player.armorDef.name} · 减伤 ${Math.round(player.armorResist*100)}%`:'未装备防弹衣';
if(el('lootHud')) el('lootHud').textContent=`战利品 ${runLootTotal()} 件 · 撤离点 ${typeof EXTRACT_POINTS!=='undefined'&&EXTRACT_POINTS.length?Math.round(Math.min(...EXTRACT_POINTS.map(p=>Math.hypot(player.pos.x-p.x,player.pos.z-p.z))))+'m':''}`;
// 人体状态图: 七部位按血量比例着色(白/黄/红/黑), 取代旧的四肢血条
if(typeof renderBodyFigure==='function') renderBodyFigure(!player.alive||!player.body);
// 低频HUD(10Hz): 小地图/罗盘/票数/旗帜状态, 减少每帧DOM与Canvas开销
hudSlowT-=dt;
if(hudSlowT<=0){
hudSlowT=0.1;
{
const t0s=(!isFinite(tickets[0])||(GAMEMODE!=='conquest'&&DEF===0))?'∞':Math.ceil(tickets[0]);
const t1s=(!isFinite(tickets[1])||(GAMEMODE!=='conquest'&&DEF===1))?'∞':Math.ceil(tickets[1]);
let modeLine='';
if(GAMEMODE==='assault') modeLine=`<div style="font-size:11px;color:#ffd77a">攻防战 · 当前目标: ${FLAGS[Math.min(assaultIdx,FLAGS.length-1)].id} 点</div>`;
else if(GAMEMODE==='demolition') modeLine=`<div style="font-size:11px;color:#ffd77a">破袭战 · 剩余补给库: ${DEPOTS.filter(d=>!d.destroyed).length}/${DEPOTS.length}</div>`;
else if(GAMEMODE==='extract') modeLine=`<div style="font-size:11px;color:#7dd87d">带出战利品 ${runLootTotal()} 件</div>`;
el('tickets').innerHTML=GAMEMODE==='extract'?`<span class="tl">撤离行动</span> &nbsp;·&nbsp; <span class="tr">搜索-带出-出售</span>`+modeLine:`<span class="tl">${TEAM_NAME[0]} ${t0s}</span> &nbsp;·&nbsp; <span class="tr">${t1s} ${TEAM_NAME[1]}</span>`+modeLine;
}
const mm=Math.floor(Math.max(0,matchTime)/60), ss2=Math.floor(Math.max(0,matchTime)%60);
el('timeTxt').textContent=`${mm}:${ss2<10?'0':''}${ss2}`;
FLAGS.forEach((f,i)=>{
const fi=el('fi'+f.id);
fi.className=(f.owner===0?'f0':f.owner===1?'f1':'')+(f.capTeam!==-1&&f.cap>0.03?' fc':'');
});
drawMinimap();
drawCompass();
// 小队HUD
const sqEl=el('squadHUD');
if(SQUAD.members.length&&player.deployed){
const alive=SQUAD.members.filter(s=>s.alive).length;
sqEl.style.display='block';
const modeTxt=SQUAD.mode==='move'?'<b>进攻标记点</b>':SQUAD.mode==='guard'?'<b>驻守标记点</b>':SQUAD.mode==='attack'?'<b>集火目标</b>':'跟随中';
sqEl.innerHTML=`◆ 小队 <b>${alive}/${SQUAD.members.length}</b> · ${modeTxt}<br><span style="opacity:.65">[T] 攻击 · [U] 驻守 · [Y] 跟随 · [M] 大地图</span>`;
} else sqEl.style.display='none';
if(bigMapVisible&&typeof bigMapVisible==='function'&&bigMapVisible()) drawBigMap();
}
let inFlag=null;
if(player.alive) for(const f of FLAGS){ if(Math.hypot(player.pos.x-f.x,player.pos.z-f.z)<f.r) inFlag=f; }
const cp2=el('capPanel');
if(GAMEMODE!=='extract'&&inFlag&&(inFlag.capTeam!==-1&&inFlag.cap>0.02||inFlag.owner!==player.team)){
cp2.style.display='block';
el('capLetter').textContent=inFlag.id;
el('capBarFill').style.width=(inFlag.cap*100)+'%';
el('capBarFill').style.background=inFlag.capTeam===0?'#8fc1ff':'#ff9c8a';
el('capTxt').textContent=inFlag.capTeam===player.team?'正在占领…':(inFlag.capTeam===-1?(inFlag.owner===player.team?'我方控制':'站在旗点范围内占领'):'敌军正在占领!');
} else cp2.style.display='none';
dmgFlash=Math.max(0,dmgFlash-dt*2);
el('dmgOv').style.opacity=dmgFlash;
// 濒死暗角: 止痛药/吗啡生效期间疼痛被压制, 视觉压迫感同步减弱
// p.hp/p.maxHp 现在是"全身总血量"(上限440); 濒死暗角要看最危险的部位, 用 tkLowHpRatio
const hpPct=(typeof tkLowHpRatio==='function')?tkLowHpRatio(player):(player.alive?player.hp/(player.maxHp||100):0);
let lowA=player.alive&&hpPct<0.35?(1-hpPct/0.35)*0.85:0;
if(lowA>0&&typeof painPower==='function'){ const pk=painPower(player); if(pk>0) lowA*=Math.max(0.25,1-0.45*pk); }
el('lowOv').style.opacity=lowA;
el('supOv').style.opacity=player.suppressV*0.7;
nadeWarnT-=dt;
el('nadeWarn').style.display=nadeWarnT>0?'block':'none';
if(!player.onAA) el('leadPip').style.display='none';
 if(!(player.onVehicle&&player.onVehicle.kind==='tank')){ el('tankPip').style.display='none'; el('mgPip').style.display='none'; el('tankSight').style.display='none'; }
 if(!(player.onVehicle&&player.onVehicle.kind==='plane'&&player.planeView)) el('planeSight').style.display='none';
// 架枪状态指示
const bi=el('braceInd');
if(player.alive&&player.braced){ bi.style.display='block'; bi.className='on'; bi.textContent='▙ 已架枪'; }
else if(player.alive&&player.canBrace&&!player.prone&&!player.onVehicle){ bi.style.display='block'; bi.className=''; bi.textContent='[X] 架枪'; }
else bi.style.display='none';
// 高低姿态持枪指示
const ci=el('carryInd');
if(player.alive&&!player.onVehicle&&!player.onMG&&!player.onAT&&!player.onAA&&!player.onMortar){
if(player.carryLow){ ci.style.display='block'; ci.className='low'; ci.textContent='▼ 低位持枪 · 移动 +18%'; }
else { ci.style.display='block'; ci.className=''; ci.textContent='滚轮↓ 低位持枪'; }
} else ci.style.display='none';
// 战术手电指示 (状态由 15c_flashlight.updateFlashlight 每帧刷新)
const fi=el('flashInd');
if(fi){
if(player.alive&&!player.onVehicle&&typeof FLASH!=='undefined'&&FLASH.hasMod){
fi.style.display='block'; fi.className=FLASH.on?'on':''; fi.textContent=FLASH.on?'✦ 手电 · 开 [G]':'[G] 战术手电';
} else fi.style.display='none';
}
// 手雷蓄力条 (状态由 24_input 的 nadeEquip/nadeCharge* 维护)
const ni=el('nadeInd');
if(ni){
if(player.alive&&VM.state==='nade'&&player.nadeHeld){
const c=clamp(player.nadeCharge||0,0,1);
ni.style.display='block'; ni.className=player.nadeCharging?'on':'';
el('nadeIndTxt').textContent=player.nadeCharging?('蓄力 '+Math.round(c*100)+'%'):'手雷就位 · 按住右键蓄力';
el('nadeIndBar').style.width=(c*100).toFixed(1)+'%';
} else ni.style.display='none';
}
const ch=el('crosshair');
if(player.alive&&!player.ads&&!player.onVehicle){
ch.style.display='block';
const gap=8+player.bloom*26+(Math.hypot(player.vel.x,player.vel.z)>1?6:0);
ch.style.setProperty('--gap',gap+'px');
} else if(player.alive&&player.ads&&WPN_DEFS[VM.key]?.atRifle&&!player.onVehicle){
// 反坦克枪侧偏机瞄: 保留小型准星充当侧置机械瞄具
ch.style.display='block';
ch.style.setProperty('--gap','5px');
} else if(player.alive&&player.ads&&!WPN_DEFS[VM.key]?.scoped){
ch.style.display='none';
} else ch.style.display='none';
}
let respawnCd=0, selectedSpawn=0;
