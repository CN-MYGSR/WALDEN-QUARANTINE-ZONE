'use strict';
// =====================================================================
// 44_deathcam.js —— 阵亡反馈系统
//   1) 被击杀提示: 谁开的枪 / 打中哪个部位 / 什么武器 / 多远 / 致命伤, 外加本局受击明细
//      · 阵亡瞬间在死亡视角上给一块紧凑面板
//      · 结算界面追加一块持久的「死亡分析」(死亡视角只有 2.6 秒, 来不及看清楚)
//   2) 敌方回放 (击杀回放): 常态以 12Hz 记录"最近打到我的人"的眼位与朝向,
//      阵亡后从该敌人视角重放最后 ~2.5 秒 —— 能看清自己是怎么被架住/被绕后的
//   3) 开镜视野保护 (辅助层)
//      真正的修正在 15_viewmodel: ADS 基础推远量加大 + 按实测包围盒钳制深度,
//      保证枪身/双臂任何一点离 vmCamera 都不少于 VM_ADS_MIN_CLEAR, 后照门与枪机的
//      低模几何不会再被透视放大成挡住屏幕中央的黑块。
//      本文件只补一层近裁剪面兜底 (开镜 0.05)。历史上这里还有个"按 L 隐藏镜内枪身"的
//      临时开关, 因为挡视野 Bug 已在 15_viewmodel 修好, 2026-09-17 已整套删除。
// 加载位置: 43_maps 之后 / 32_boot 之前
// 手法: 沿用 40/41/43 的"包裹式扩展", 不替换任何既有函数体
// =====================================================================

// ============================ 通用 ============================
const PART_CN={head:'头部',torso:'躯干',arms:'手臂',legs:'腿部'};
const PART_ORDER=['head','torso','arms','legs'];
function kcTeamName(t){
  try{ if(typeof TEAM_NAME!=='undefined'&&TEAM_NAME[t]) return TEAM_NAME[t]; }catch(e){}
  return t===0?'USEC':'PMC';
}
function kcWeaponName(who){
  if(!who) return '未知武器';
  let k=null;
  try{
    if(who.curW&&who.curW.key) k=who.curW.key;
    else if(who.slots&&who.slots.length) k=who.slots[who.curSlot||0]&&who.slots[who.curSlot||0].key;
    else if(who.wpnKey) k=who.wpnKey;
  }catch(e){}
  if(!k) return '未知武器';
  try{ return (typeof WPN_DEFS!=='undefined'&&WPN_DEFS[k]&&WPN_DEFS[k].name)||k; }catch(e){ return k; }
}

// ============================ 1) 受击记录 ============================
// 本局受击明细 (按部位累计命中次数与伤害), 每次进场重置
let HIT_LOG=null;
function hitLogReset(){
  HIT_LOG={head:0,torso:0,arms:0,legs:0,dmg_head:0,dmg_torso:0,dmg_arms:0,dmg_legs:0,count:0,totalDmg:0};
}
function hitLog(){ if(!HIT_LOG) hitLogReset(); return HIT_LOG; }
function hitSummaryText(){
  const L=hitLog(); const out=[];
  for(const k of PART_ORDER){
    const n=L[k]||0; if(!n) continue;
    out.push(`${PART_CN[k]}×${n}(${Math.round(L['dmg_'+k]||0)})`);
  }
  return out.length?out.join(' · '):'无';
}

// 包裹 player.damage: 在真正结算之前记下"这一击从哪来、打在哪、多疼"
// (死在 _orig 内部, 所以必须在调用前记录, 否则 die 之后读不到现场信息)
const _kcOrigPlayerDamage=player.damage;
player.damage=function(amt,attacker,isHead,part){
  try{
    if(this.alive&&!matchOver&&attacker&&attacker!==this){
      const partKey=part||(isHead?'head':'torso');
      // 头部看头盔减伤, 其余看护甲减伤 (与 38_tarkov.applyPlayerBodyDamage 保持一致)
      const _rs=(partKey==='head')?(this.helmetResist||0):(this.armorResist||0);
      const applied=Math.round(Math.max(1,amt*(1-_rs)));
      let dist=0;
      try{ dist=Math.round(Math.hypot(attacker.pos.x-this.pos.x,attacker.pos.z-this.pos.z)); }catch(e){}
      this.lastHit={
        part:partKey, head:!!isHead||partKey==='head', applied, dist,
        t:nowT, name:attacker.name||'敌军', team:attacker.team,
        wpn:kcWeaponName(attacker), hpBefore:Math.round(this.hp)
      };
      this.lastAttackerRef=attacker;
      const L=hitLog();
      L.count++; L[partKey]=(L[partKey]||0)+1;
      L['dmg_'+partKey]=(L['dmg_'+partKey]||0)+applied;
      L.totalDmg+=applied;
    }
  }catch(e){}
  return _kcOrigPlayerDamage.apply(this,arguments);
};

// ============================ 2) 击杀回放 ============================
// 环形缓冲: 每次采样记录玩家 + "当前最值得跟拍的敌人"的位置/朝向, 保留最近 KC_KEEP 秒
const KC_HZ=12, KC_KEEP=6;
const KC={rec:[],acc:0,playing:false,t:0,frames:null,speed:1,replaySec:2.2,last:null};
// 选跟拍对象: 优先"最近打过我的人", 否则退化为最近的存活敌人。
// 不能只认 lastAttackerRef —— 被一枪秒杀时那一枪才写入引用, 之前根本没录到凶手,
// 回放会永远因为"素材不足"而不触发 (这是最常见的一类死亡)。
function kcPickThreat(){
  const a=player.lastAttackerRef;
  if(a&&a.alive&&a.pos&&!a.isPlayer) return a;
  let best=null,bd=1e9;
  try{
    for(const s of soldiers){
      if(!s||!s.alive||s.isPlayer||!s.pos||s.team===player.team) continue;
      const d=Math.hypot(s.pos.x-player.pos.x,s.pos.z-player.pos.z);
      if(d<bd){ bd=d; best=s; }
    }
  }catch(e){}
  return (best&&bd<70)?best:null;
}
function kcRecord(dt){
  KC.acc+=dt;
  if(KC.acc<1/KC_HZ) return;
  KC.acc=0;
  if(!player.alive||!player.deployed) return;
  const a=kcPickThreat();
  if(a&&a.pos) KC.last={kx:a.pos.x,ky:a.pos.y,kz:a.pos.z,kname:a.name||''};
  const L=KC.last;
  KC.rec.push({
    px:player.pos.x, py:player.pos.y+player.eyeH, pz:player.pos.z,
    has:L?1:0, kname:L?L.kname:'',
    kx:L?L.kx:0, ky:L?L.ky:0, kz:L?L.kz:0
  });
  while(KC.rec.length>KC_HZ*KC_KEEP) KC.rec.shift();
}
// 阵亡 → 抽出最后 replaySec 秒, 并把敌人位置前向填充 (缺数据的帧沿用上一帧, 避免画面跳变)
function kcStart(){
  KC.playing=false; KC.frames=null;
  const box=document.getElementById('kcBanner');
  const killer=player.lastAttackerRef;
  if(!killer||!killer.pos){ if(box) box.classList.remove('show'); return; }
  const win=KC.rec.slice(-Math.round(KC.replaySec*KC_HZ));
  let first=-1,last=-1;
  for(let i=0;i<win.length;i++){ if(win[i].has){ if(first<0) first=i; last=i; } }
  if(first<0||(last-first)<Math.round(0.7*KC_HZ)){ if(box) box.classList.remove('show'); return; }
  const fr=[]; let cur=null;
  for(let i=first;i<=last;i++){
    const f=win[i];
    if(f.has) cur={kx:f.kx,ky:f.ky,kz:f.kz};
    fr.push({px:f.px,py:f.py,pz:f.pz,kx:cur.kx,ky:cur.ky,kz:cur.kz});
  }
  if(fr.length<2){ if(box) box.classList.remove('show'); return; }
  KC.frames=fr; KC.t=0; KC.playing=true;
  if(box){
    const h=player.lastHit||{};
    box.innerHTML=`<b>击 杀 回 放</b><span class="kcbSub">敌方视角 · ${h.name||'敌军'} · ${h.wpn||'未知武器'} · ${h.dist||0} m</span>`;
    box.classList.add('show');
  }
}
// 由包裹后的 updateCamera 调用: 覆盖相机为"凶手视角"
function kcApply(dt){
  if(!KC.playing) return false;
  const fr=KC.frames;
  if(!fr||!fr.length){ KC.playing=false; return false; }
  KC.t+=dt*KC.speed;
  const idx=KC.t*KC_HZ;
  if(idx>=fr.length-1){
    KC.playing=false; KC.frames=null;
    const box=document.getElementById('kcBanner'); if(box) box.classList.remove('show');
    return false;
  }
  const i=Math.floor(idx), u=clamp(idx-i,0,1);
  const f0=fr[i], f1=fr[Math.min(i+1,fr.length-1)];
  const kx=lerp(f0.kx,f1.kx,u), ky=lerp(f0.ky,f1.ky,u), kz=lerp(f0.kz,f1.kz,u);
  const px=lerp(f0.px,f1.px,u), py=lerp(f0.py,f1.py,u), pz=lerp(f0.pz,f1.pz,u);
  camera.position.set(kx,ky+1.55,kz);
  // 朝向: 直视受害者胸口, 保证画面里总能看到"自己"倒下的位置
  const dx=px-kx, dy=(py-0.25)-(ky+1.55), dz=pz-kz;
  const len=Math.hypot(dx,dy,dz)||1;
  const yaw=Math.atan2(-dx/len,-dz/len), pitch=Math.asin(clamp(dy/len,-1,1));
  camera.rotation.order='YXZ';
  camera.rotation.set(pitch,yaw,0);
  camera.fov=dampF(camera.fov,64,10,dt);
  camera.updateProjectionMatrix();
  return true;
}
// 包裹 updateCamera: 采样 + 回放覆盖 (原死亡视角/时间线逻辑照常运行)
const _kcOrigUpdateCamera=updateCamera;
updateCamera=function(dt){
  const r=_kcOrigUpdateCamera.apply(this,arguments);
  try{
    if(player.alive){ kcSyncAlive(); kcRecord(dt); }
    else { kcApply(dt); }
  }catch(e){}
  return r;
};
// 进场/存活时清空上一局的记录
let _kcPrevAlive=false;
function kcSyncAlive(){
  if(!_kcPrevAlive){
    hitLogReset();
    player.lastHit=null; player.lastAttackerRef=null;
    KC.rec.length=0; KC.playing=false; KC.frames=null; KC.last=null; KC.acc=0;
    const b=document.getElementById('kcBanner'); if(b) b.classList.remove('show');
    hideKillInfo();
  }
  _kcPrevAlive=true;
}
// 死亡时: 重新允许采样 (下一局)
function kcAfterDeath(){ _kcPrevAlive=false; }

// ============================ 3) 死亡提示面板 ============================
function hideKillInfo(){
  const box=document.getElementById('killInfo');
  if(box) box.classList.remove('show');
}
function showKillInfo(){
  const box=document.getElementById('killInfo');
  if(!box) return;
  const h=player.lastHit;
  if(!h){ box.classList.remove('show'); return; }
  const headTag=h.part==='head'?'<span class="kiHead">爆头</span>':'';
  box.innerHTML=
    `<div class="kiTitle">你 被 击 杀</div>`
   +`<div class="kiGrid">`
   +`<div class="kiK">凶手</div><div class="kiV">${h.name} <span class="kiDim">· ${kcTeamName(h.team)}</span></div>`
   +`<div class="kiK">命中部位</div><div class="kiV"><b class="kiPart">${PART_CN[h.part]||h.part}</b>${headTag}</div>`
   +`<div class="kiK">武器</div><div class="kiV">${h.wpn}</div>`
   +`<div class="kiK">距离</div><div class="kiV">${h.dist} m</div>`
   +`<div class="kiK">致命伤</div><div class="kiV">${h.applied}${h.hpBefore!=null?` <span class="kiDim">(剩余 ${h.hpBefore})</span>`:''}</div>`
   +`</div>`
   +`<div class="kiSum">本局受击 ${hitLog().count} 次 / 累计 ${Math.round(hitLog().totalDmg)} 伤害<br>${hitSummaryText()}</div>`;
  box.classList.add('show');
}
// 包裹 player.die: 原逻辑跑完后接上击杀回放与提示面板
const _kcOrigPlayerDie=player.die;
player.die=function(attacker,isHead){
  const r=_kcOrigPlayerDie.apply(this,arguments);
  try{ kcAfterDeath(); showKillInfo(); kcStart(); }catch(e){}
  return r;
};
// 结算界面追加持久化的「死亡分析」(死亡视角只有 2.6 秒)
function deathAnalysisHTML(){
  const h=player.lastHit;
  if(!h) return '';
  const L=hitLog();
  const rows=[];
  for(const k of PART_ORDER){ const n=L[k]||0; if(n) rows.push(`${PART_CN[k]} ×${n} · ${Math.round(L['dmg_'+k]||0)}伤害`); }
  return `<div class="deathBox">`
   +`<div class="dbTitle">死 亡 分 析</div>`
   +`<div>被 <b>${h.name}</b>（${kcTeamName(h.team)}）用 <b>${h.wpn}</b> 在 <b>${h.dist} m</b> 外击杀</div>`
   +`<div>致命部位：<b class="dbPart">${PART_CN[h.part]||h.part}</b>${h.part==='head'?' · 爆头':''}`
   +` · 致命伤 <b>${h.applied}</b>${h.hpBefore!=null?`（当时剩余血量 ${h.hpBefore}）`:''}</div>`
   +`<div class="dbHit">本局共被命中 <b>${L.count}</b> 次 / <b>${Math.round(L.totalDmg)}</b> 点伤害<br>${hitSummaryText()}</div>`
   +`</div>`;
}

// ============================ 4) 开镜视野保护 ============================
// 需求: 开镜时枪械模型挡住视线。
// 兜底: 开镜时把视模型相机的近裁剪面抬起 → 任何"糊在镜头前"的几何直接被裁掉。
// 挡视野的正解在 15_viewmodel 里: 加大 ADS 推远量 + 按实测包围盒保证净空。
//
// ⚠️ 历史: 这里曾有一整套"按 L 隐藏镜内枪身"的临时开关
//    (HIDE_GUN_ADS / localStorage.sf_hidegun / #hideGunTip / kcGunHidden() / 隐藏时用准星接管瞄准),
//    是为绕开上面那个挡视野 Bug 打的补丁。Bug 在 15_viewmodel 修好后,
//    2026-09-17 按用户要求**整套删除**, L 键一并释放。
// 包裹 updateViewModel: 原逻辑跑完后做视野保护
const _kcOrigUpdateViewModel=updateViewModel;
updateViewModel=function(dt,p){
  const r=_kcOrigUpdateViewModel.apply(this,arguments);
  try{
    const ab=VM.adsBlend||0;
    // 近裁剪面兜底: 开镜时抬到 0.05, 任何"糊在镜头前"的残余几何直接被裁掉。
    // 真正的修正在 15_viewmodel: 基础推远量加大 + 按实测包围盒保证枪身离镜头 >= VM_ADS_MIN_CLEAR。
    const near=lerp(0.012,0.05,ab);
    if(Math.abs(vmCamera.near-near)>0.0015){ vmCamera.near=near; vmCamera.updateProjectionMatrix(); }
  }catch(e){}
  return r;
};
// 包裹 showDeploy / finishRaid: 收起阵亡提示

// ============================ 5) 挂接既有流程 ============================
(function kcWire(){
  if(typeof showDeploy==='function'){
    const o=showDeploy;
    showDeploy=function(){ const r=o.apply(this,arguments); try{ hideKillInfo(); }catch(e){} return r; };
  }
  if(typeof finishRaid==='function'){
    const o=finishRaid;
    finishRaid=function(extracted){
      const r=o.apply(this,arguments);
      try{
        hideKillInfo();
        const b=document.getElementById('kcBanner'); if(b) b.classList.remove('show');
        // 只有"阵亡"才给死亡分析; 超时未撤离不算 (那时 lastHit 是几秒前的旧伤)
        if(!extracted&&!player.alive){
          const box=document.getElementById('endStats');
          if(box&&box.insertAdjacentHTML) box.insertAdjacentHTML('beforeend',deathAnalysisHTML());
        }
      }catch(e){}
      return r;
    };
  }
})();
