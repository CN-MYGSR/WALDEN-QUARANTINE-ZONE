// ===== 室内靶场 =====
// · 免费武器：部署界面的主武器下拉改成「全部武器」，选择只写 RUN/localStorage，不动 META
// · 无限弹药：每帧把 reserve 补满
// · 靶子：11 个靶位 2~30m（其中 8/18/26m 三个左右移动），命中判定包在 raySoldiers 外面
//
// ⚠️ 靶子**不进 combatants** —— 那会让 AI / HUD / 尸体逻辑都以为它是个人。
//    这里只包 raySoldiers，返回同样形状的 {sol,t,head,part} 给 fireBullet 用。
'use strict';

const RANGE={
  targets:[],
  hits:0,
  shots:0,
  DISTS:[2,4,6,8,10,12,15,18,22,26,30],
  MOVING:{8:1,18:1,26:1},     // 距离 → 会左右移动
  LINE_Z:12.5,                // 射击线
  AMMO:9999
};

function rangeActive(){
  return typeof CAMPAIGN!=='undefined'&&!!CAMPAIGN.rangeOnly;
}
function rangePending(){
  try{ return localStorage.getItem('sf_range')==='1'; }catch(e){ return false; }
}
function rangeWeapon(){
  try{
    const v=localStorage.getItem('sf_rangeWpn');
    if(v&&typeof WPN_DEFS!=='undefined'&&WPN_DEFS[v]) return v;
  }catch(e){}
  if(RUN.rangeWpn&&WPN_DEFS[RUN.rangeWpn]) return RUN.rangeWpn;
  return (typeof WPN_DEFS!=='undefined'&&WPN_DEFS.m4)?'m4':(Object.keys(WPN_DEFS)[0]||'m1911');
}

// ---------- 靶纸贴图 ----------
let _rangeTex=null;
function rangeTargetTex(){
  if(_rangeTex) return _rangeTex;
  const c=document.createElement('canvas'); c.width=c.height=128;
  const g=c.getContext('2d');
  g.fillStyle='#e6e2d6'; g.fillRect(0,0,128,128);
  const rings=[[58,'#22221e'],[46,'#e6e2d6'],[34,'#22221e'],[22,'#e6e2d6'],[11,'#b41f16']];
  for(const [r,col] of rings){ g.beginPath(); g.arc(64,64,r,0,Math.PI*2); g.fillStyle=col; g.fill(); }
  g.beginPath(); g.arc(64,64,3,0,Math.PI*2); g.fillStyle='#e6e2d6'; g.fill();
  _rangeTex=new THREE.CanvasTexture(c);
  return _rangeTex;
}

function rangeLabel(txt,x,y,z){
  const c=document.createElement('canvas'); c.width=128; c.height=64;
  const g=c.getContext('2d');
  g.font='bold 42px sans-serif'; g.fillStyle='#e8e2c8';
  g.textAlign='center'; g.textBaseline='middle';
  g.fillText(txt,64,34);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));
  sp.position.set(x,y,z); sp.scale.set(0.46,0.23,1);
  scene.add(sp);
  return sp;
}

function rangeClearTargets(){
  for(const t of RANGE.targets){
    for(const o of [t.board,t.post,t.foot,t.lbl]){
      if(!o) continue;
      if(o.parent) o.parent.remove(o);
      if(o.geometry) o.geometry.dispose();
      if(o.material){ if(o.material.map&&o.material.map!==_rangeTex) o.material.map.dispose(); o.material.dispose(); }
    }
  }
  RANGE.targets.length=0;
}

function rangeSpawnTargets(){
  rangeClearTargets();
  const tex=rangeTargetTex();
  const Z0=RANGE.LINE_Z;
  RANGE.DISTS.forEach((d,i)=>{
    const z=Z0-d;
    const baseX=(i%3===0)?-3.6:(i%3===1?0:3.6);
    const moving=!!RANGE.MOVING[d];

    const board=new THREE.Mesh(new THREE.PlaneGeometry(0.62,0.95),
      new THREE.MeshLambertMaterial({map:tex,side:THREE.DoubleSide}));
    board.position.set(baseX,1.45,z);
    scene.add(board);

    const post=new THREE.Mesh(new THREE.BoxGeometry(0.08,1.0,0.08),MAT.metalDark);
    post.position.set(baseX,0.5,z); scene.add(post);

    const foot=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.08,0.5),MAT.metalDark);
    foot.position.set(baseX,0.05,z); scene.add(foot);

    const lbl=rangeLabel(d+'m',baseX,2.05,z);

    const t={d,z,baseX,board,post,foot,lbl,moving,
      amp:moving?2.2:0, spd:moving?(0.5+0.12*(i%3)):0, ph:i*1.7, flash:0,
      box:{minX:baseX-0.33,maxX:baseX+0.33,minY:0.97,maxY:1.93,minZ:z-0.06,maxZ:z+0.06}};

    // 给 fireBullet 用的「像士兵」的最小对象
    t.proxy={
      isTarget:true, alive:true, team:-1, downed:false, prone:false, crouch:false,
      pos:{x:baseX,y:0.97,z},
      damage(amt){ rangeOnHit(t,amt); }
    };
    RANGE.targets.push(t);
  });
  rangeUpdateHud();
}

function rangeOnHit(t,amt){
  RANGE.hits++;
  t.flash=1;
  rangeUpdateHud();
}

function rangeUpdate(dt){
  const hud=document.getElementById('rangeHud');
  if(hud) hud.style.display=rangeActive()?'block':'none';
  // 靶场没有撤离点/战利品 → 隐藏「撤离行动 · 搜索-带出-出售」和「战利品 0 件」
  const tkt=document.getElementById('tickets');
  if(tkt) tkt.style.display=rangeActive()?'none':'';
  const lh=document.getElementById('lootHud');
  if(lh) lh.style.display=rangeActive()?'none':'';
  // 靶场没有撤离点, 超时会被当成阵亡(掉装备) —— 这里持续续命, 相当于无时间限制
  if(typeof matchTime==='number'&&matchTime<3600) matchTime=3600;
  if(!RANGE.targets.length) return;
  for(const t of RANGE.targets){
    if(t.moving){
      const x=t.baseX+Math.sin(nowT*t.spd+t.ph)*t.amp;
      t.board.position.x=x; t.post.position.x=x; t.foot.position.x=x; t.lbl.position.x=x;
      t.box.minX=x-0.33; t.box.maxX=x+0.33; t.proxy.pos.x=x;
    }
    if(t.flash>0){
      t.flash=Math.max(0,t.flash-dt*4);
      const m=t.board.material;
      if(m&&m.emissive) m.emissive.setRGB(t.flash*0.85,t.flash*0.2,t.flash*0.12);
    }
  }
}

function rangeAmmo(){
  const p=player;
  if(!p||!p.slots) return;
  for(const s of p.slots) if(s){
    if(!s.ammo) s.ammo=ammoKeyOfCaliber(ammoCaliberOf(s.key));
    s.reserve=RANGE.AMMO;
  }
}

function rangeUpdateHud(){
  const el=document.getElementById('rangeStat');
  if(!el) return;
  const acc=RANGE.shots?Math.round(RANGE.hits/RANGE.shots*100):0;
  el.textContent='命中 '+RANGE.hits+' / 射击 '+RANGE.shots+'  ·  '+acc+'%';
}

// ---------- 命中判定: 射线 vs 靶板 AABB ----------
function rangeRayBox(o,dir,b,maxD){
  let tmin=0,tmax=maxD;
  const mn=[b.minX,b.minY,b.minZ], mx=[b.maxX,b.maxY,b.maxZ];
  const oo=[o.x,o.y,o.z], dd=[dir.x,dir.y,dir.z];
  for(let i=0;i<3;i++){
    if(Math.abs(dd[i])<1e-9){ if(oo[i]<mn[i]||oo[i]>mx[i]) return null; continue; }
    const inv=1/dd[i];
    let t1=(mn[i]-oo[i])*inv, t2=(mx[i]-oo[i])*inv;
    if(t1>t2){ const tmp=t1; t1=t2; t2=tmp; }
    if(t1>tmin) tmin=t1;
    if(t2<tmax) tmax=t2;
    if(tmin>tmax) return null;
  }
  return tmin>0?tmin:null;
}
function rangeRayTargets(o,dir,maxD){
  let best=null,bestT=maxD;
  for(const t of RANGE.targets){
    const tt=rangeRayBox(o,dir,t.box,bestT);
    if(tt!==null&&tt<bestT){ best={sol:t.proxy,t:tt,head:false,part:'torso'}; bestT=tt; }
  }
  return best;
}

// ---------- 部署界面: 全部武器可选 ----------
function rangeDeployStats(){
  const st=document.getElementById('arsenalStats');
  if(!st) return;
  const k=rangeWeapon(), d=WPN_DEFS[k]||{};
  st.innerHTML='<b style="color:#9fe6b4">靶场：免费武器 · 无限弹药</b> · 当前 '+(d.name||k)+
    '（伤害 '+(d.dmg||'-')+' · 弹匣 '+(d.mag||'-')+'）';
}

function rangeDeployUI(){
  if(!rangeActive()) return;
  const sel=document.getElementById('arsenalSelect');
  if(sel){
    const cur=rangeWeapon();
    const keys=Object.keys(WPN_DEFS).filter(k=>WPN_DEFS[k]);
    keys.sort((a,b)=>String(WPN_DEFS[a].name||a).localeCompare(String(WPN_DEFS[b].name||b),'zh'));
    sel.innerHTML='';
    for(const k of keys){
      const o=document.createElement('option');
      o.value=k;
      o.textContent=(WPN_DEFS[k].name||k)+' · 伤害 '+(WPN_DEFS[k].dmg||'-');
      o.selected=(k===cur);
      sel.appendChild(o);
    }
    sel.value=cur;
    sel.onchange=()=>{
      const key=sel.value;
      RUN.rangeWpn=key;
      try{ localStorage.setItem('sf_rangeWpn',key); }catch(e){}
      if(player.alive&&player.deployed&&player.curW?.key!==key&&WPN_DEFS[key]){
        let slot=player.slots.findIndex(w=>w.key===key);
        if(slot<0){
          slot=0;
          player.slots[slot]={key,def:moddedDef(key)||WPN_DEFS[key],mag:0,reserve:0,ammo:''};
        }
        player.curSlot=slot; player.curW=player.slots[slot]; player.ads=false;
        VM.state='idle'; VM.stateT=0;
        rangeAmmo(); vmEquip(key,player.team);
      }
      rangeDeployStats();
    };
  }
  rangeDeployStats();

  let exit=document.getElementById('rangeExitBtn');
  if(!exit){
    exit=document.createElement('button');
    exit.className='optBtn'; exit.id='rangeExitBtn';
    document.getElementById('resumeBtn').after(exit);
  }
  exit.textContent=player.deployed?'结束训练':'返回主菜单';
  exit.onclick=player.deployed?finishRangeTraining:rangeLeave;
}
function rangeLeave(){
  try{ localStorage.removeItem('sf_range'); localStorage.setItem('sf_campaign','0'); }catch(e){}
  location.reload();
}

function rangeAfterDeploy(){
  rangeSpawnTargets();
  RANGE.hits=0; RANGE.shots=0;
  rangeUpdateHud();
  rangeAmmo();
  // 出生点: findFreeSpawn 会随机挪 ±2m, 可能挪到射击线前面 → 统一放回射击线后方
  try{
    player.pos.x=clamp(player.pos.x,-6.5,6.5);
    player.pos.z=13.6;
    player.pos.y=standHeight(player.pos.x,player.pos.z,3);
    player.vel.set(0,0,0);
  }catch(e){}
  // 出生点默认朝「地图中心」, 而靶道在 -z 方向 → 这里直接面向靶子
  try{ player.yaw=0; player.pitch=0; }catch(e){}
  // sf_range 是一次性标记: 部署成功后清掉, 下次进沙盒不会还落在靶场图
  try{ localStorage.removeItem('sf_range'); }catch(e){}
  // 靶场不按 5 分钟结算 —— 练够了自己走
  if(typeof matchTime==='number') matchTime=Math.max(matchTime,60*60);
}

// ---------- 接线 ----------
// ① 部署界面
if(typeof showDeploy==='function'){
  const _origShow=showDeploy;
  showDeploy=function(){
    const r=_origShow.apply(this,arguments);
    try{ rangeDeployUI(); }catch(e){ console.warn('[range] deployUI failed',e); }
    return r;
  };
}

// ② 免费武器由部署入口直接从靶场选择读取。
if(typeof deployPlayer==='function'){
  const _origDeploy=deployPlayer;
  deployPlayer=function(){
    if(!rangeActive()) return _origDeploy.apply(this,arguments);
    const r=_origDeploy.apply(this,arguments);
    try{ rangeAfterDeploy(); }catch(e){ console.warn('[range] afterDeploy failed',e); }
    return r;
  };
}

// ③ 命中判定
let _rangeHitFlag=false;
if(typeof raySoldiers==='function'){
  const _origRay=raySoldiers;
  raySoldiers=function(o,dir,maxD,shooter){
    const a=_origRay.apply(this,arguments);
    if(!rangeActive()||!RANGE.targets.length) return a;
    const b=rangeRayTargets(o,dir,maxD);
    if(b&&(!a||b.t<a.t)){ _rangeHitFlag=true; return b; }
    return a;
  };
}
// 靶纸不出血雾/血迹
if(typeof bloodFX==='function'){
  const _origBlood=bloodFX;
  bloodFX=function(p){
    if(_rangeHitFlag){ _rangeHitFlag=false; return; }
    return _origBlood.apply(this,arguments);
  };
}

// ④ 射击计数
if(typeof fireBullet==='function'){
  const _origFire=fireBullet;
  fireBullet=function(shooter){
    _rangeHitFlag=false;
    if(rangeActive()&&shooter&&shooter.isPlayer){ RANGE.shots++; rangeUpdateHud(); }
    return _origFire.apply(this,arguments);
  };
}

// ⑤ 每帧: 移动靶 + 无限弹药 + HUD 显隐
if(typeof updateMedCrates==='function'){
  const _origMed=updateMedCrates;
  updateMedCrates=function(dt){
    const r=_origMed.apply(this,arguments);
    try{ if(rangeActive()){ rangeUpdate(dt); rangeAmmo(); } }catch(e){}
    return r;
  };
}

// ⑥ 主菜单按钮
// ⚠️ 不能在这里直接绑: 29_menus 的 initMenuUI() 里有一句
//    document.querySelectorAll('.navBtn').forEach(b=>{ b.onclick=... showPanel(b.dataset.p) })
//    而 initMenuUI 是 32_boot 在**所有脚本加载完之后**才调的 → 会把这里的绑定覆盖掉。
//    所以包一层 initMenuUI, 等它跑完再绑。
function rangeOpen(){
  const idx=(typeof CAMPAIGNS!=='undefined')?CAMPAIGNS.findIndex(c=>c.rangeOnly):-1;
  if(idx<0){ if(typeof showScorePop==='function') showScorePop('靶场地图缺失'); return; }
  try{
    localStorage.setItem('sf_campaign',String(idx));
    localStorage.setItem('sf_range','1');
    localStorage.setItem('sf_autodeploy','1');
  }catch(e){}
  location.reload();
}
function rangeBindMenuBtn(){
  const b=document.getElementById('rangeBtn');
  if(!b) return;
  b.onclick=rangeOpen;
}
// 兜底: 捕获阶段的事件委托 —— 不依赖 onclick 槽位, 任何后来对 .navBtn 的重绑都盖不掉它。
// (29_menus 的 initMenuUI 会把 .navBtn 的 onclick 全部重绑成 showPanel, 见上面注释)
document.addEventListener('click',function(ev){
  const t=ev.target;
  if(!t||typeof t.closest!=='function') return;
  if(!t.closest('#rangeBtn')) return;
  ev.preventDefault();
  ev.stopPropagation();
  rangeOpen();
},true);
if(typeof initMenuUI==='function'){
  const _origInitUI=initMenuUI;
  initMenuUI=function(){
    const r=_origInitUI.apply(this,arguments);
    try{ rangeBindMenuBtn(); }catch(e){ console.warn('[range] bind menu btn failed',e); }
    return r;
  };
} else {
  setTimeout(()=>{ try{ rangeBindMenuBtn(); }catch(e){} },400);
}

window.RANGE_DEBUG={
  info(){ return {active:rangeActive(),targets:RANGE.targets.length,hits:RANGE.hits,shots:RANGE.shots}; },
  spawn(){ rangeSpawnTargets(); return RANGE.targets.length; },
  reset(){ RANGE.hits=0; RANGE.shots=0; rangeUpdateHud(); }
};
