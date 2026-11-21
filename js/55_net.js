'use strict';
// =====================================================================
// 联机: 房间码匹配 / 自动找房 / P2P 状态同步
// ---------------------------------------------------------------------
// 【同步模型声明】state-sync（host 拓扑）
//   1. 玩家自己的角色 —— 本人权威。20Hz 用 room.sendRealtime 广播位置/姿态/血量/武器。
//      理由: 射击游戏对自身移动的手感要求最高，把输入上行给房主会引入额外 RTT。
//   2. 敌方 NPC —— 房主权威。房主 15Hz 广播 NPC 快照；客户端**不跑 AI**，只插值应用。
//      理由: NPC 有 8~12 个且 AI 复杂（寻路/掩体/投雷），各端本地演算必然发散，
//            玩家会打到"队友那边不存在的敌人"。
//   3. 伤害/击杀/拾取/撤离/聊天 —— 不可丢事件，走可靠 room.send，由房主仲裁。
//      理由: 规范要求"状态可丢、事件不可丢"分开走不同通道。
//
// 【每队 4 人 / NPC 补位】
//   玩家阵营固定 4 个位置：真人玩家先占，剩下用 AI 补足（缺失玩家自动 NPC 代替）。
//   真人中途退出 → 立刻用 AI 顶替那个位置。敌方阵营按地图编制（8 或 12）全是 NPC。
//
// 【友伤】
//   玩家之间同阵营但**互相能打死**。原生 raySoldiers 对同队直接跳过，
//   这里放行"双方都是真人"的同队命中（见 netPatchFriendlyFire）。
// =====================================================================

const NET={
  room:null,
  roomId:'',
  isHost:false,
  peerId:'',
  enabled:false,
  joining:false,
  matchAttempt:null,
  returnRoom:null,
  remote:{},        // peerId -> Bot 代理
  lastSend:0,
  lastNpc:0,
  snapT:0,
  err:'',
  msg:[],
};

const NET_CFG={
  maxPlayers:4,     // 每队 4 人
  sendHz:20,        // 自身状态广播频率
  npcHz:15,         // 房主 NPC 快照频率
  autoMatchMs:30000,// 自动找房上限 30s，超时用 NPC
  codeLen:5,
};

// 只有主动切换地图/阵营时才保留队伍，普通刷新或退出仍按正常离房处理。
function netRememberRoomForMap(idx){
  const team=NET.room?{code:NET.roomId,user:VIBE.user?.id,host:NET.isHost}:NET.returnRoom;
  if(!team?.user) return;
  try{
    sessionStorage.setItem('sf_net_map_room',JSON.stringify({...team,map:idx}));
    NET.room?.leave();
  }catch(e){}
}
try{
  const team=JSON.parse(sessionStorage.getItem('sf_net_map_room'));
  sessionStorage.removeItem('sf_net_map_room');
  if(team?.map===CAMPAIGN_IDX&&team.user&&/^[A-Z0-9]{3,8}$/.test(team.code)) NET.returnRoom=team;
}catch(e){}

// ---------------- 房间码 ----------------
const CODE_AB='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉易混的 I/O/0/1
function netNewCode(){
  let s='';
  for(let i=0;i<NET_CFG.codeLen;i++) s+=CODE_AB[Math.floor(Math.random()*CODE_AB.length)];
  return s;
}

// ---------------- 加入 / 创建 ----------------
async function netCreateRoom(){
  if(!VIBE.client||!VIBE.user){ netSetMsg('请先登录 VibeHub'); return false; }
  if(NET.room) return true;
  const code=netNewCode();
  return await netJoin(code,true);
}
async function netJoinRoom(code){
  if(!VIBE.client||!VIBE.user){ netSetMsg('请先登录 VibeHub'); return false; }
  code=String(code||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{3,8}$/.test(code)){
    el('netCode').setAttribute('aria-invalid','true');
    netSetMsg('请输入 3 至 8 位字母或数字的房间码。');
    el('netCode').focus();
    return false;
  }
  if(NET.room) return NET.roomId===code;
  return await netJoin(code,false);
}
async function netJoin(code,asHost,attempt){
  if(NET.joining) return false;
  const joining=attempt||{asHost};
  const returning=NET.returnRoom?.code===code&&NET.returnRoom.user===VIBE.user.id?NET.returnRoom:null;
  const active=()=>NET.joining===joining&&(!attempt||netMatchActive(attempt));
  const formFocus=el('netForm').contains(document.activeElement);
  NET.joining=joining;
  netRenderLobby();
  if(formFocus) el('netCancel').focus();
  let room, announced=false;
  try{
    // SDK 的 join 也会创建新房间；手输的房间码应先确认存在。
    if(!asHost&&!returning?.host&&(!attempt||returning)){
      const info=await VIBE.client.rooms.get(code);
      if(!active()) return false;
      if(!info||!info.open||info.slug!==WORK_SLUG) throw Error('房间不存在或已关闭，请核对房间码。');
      if(info.max&&info.players>=info.max) throw Error('房间已满。');
    }
    room=await VIBE.client.room.join(code,{ topology:'host' });
    if(!active()) return false;
    if(asHost&&!room.isHost) throw Error('房间码已被使用，请重新创建。');
    if(!asHost&&room.isHost&&!returning?.host&&(!attempt||returning)) throw Error('原房间已关闭，请联系好友确认。');
    if(room.isHost){
      announced=true;
      await room.announce({ open:true, listed:true, max:NET_CFG.maxPlayers, mode:'coop', slug:WORK_SLUG });
    }
    if(!active()) return false;
    room.onMessage((msg,from)=>{ if(NET.room===room) netOnMessage(msg,from); });
    room.onPeer(ev=>{ if(NET.room===room) netOnPeer(ev); });
    room.send({t:'hello', name:VIBE.user.name||'玩家'});
    NET.room=room; NET.roomId=code; NET.peerId=room.peerId; NET.isHost=!!room.isHost;
    NET.returnRoom=null; NET.enabled=true; NET.err='';
    netSetMsg(asHost?'房间已创建，可以把房间码发给好友。':'已加入队伍。');
    return true;
  }catch(e){
    if(!active()) return false;
    NET.err=(e&&e.message)||String(e);
    netSetMsg((asHost?'创建失败：':'加入失败：')+NET.err);
    return false;
  }finally{
    if(NET.joining===joining){
      const returnFocus=document.activeElement===el('netCancel');
      NET.joining=false;
      netRenderLobby();
      if(returnFocus) el(NET.room?'netCopy':(asHost?'netCreate':'netCode')).focus();
    }
    if(room&&room!==NET.room) await netReleaseRoom(room,announced);
  }
}
async function netReleaseRoom(room,unlist=room.isHost){
  try{ if(unlist) await room.close(); }catch(e){}
  try{ await room.leave(); }catch(e){}
}
function netCancelManualJoin(){
  if(!NET.joining||NET.joining===NET.matchAttempt) return;
  NET.joining=false;
  netSetMsg('已取消连接。');
}
async function netLeave(){
  const r=NET.room;
  NET.room=null; NET.enabled=false; NET.isHost=false; NET.roomId=''; NET.peerId='';
  for(const k in NET.remote){ netDropRemote(k); }
  netSetMsg('已离开房间');
  if(r) await netReleaseRoom(r);
}

// ---------------- 自动找房（部署时，上限 30s） ----------------
function netMatchActive(attempt){
  return NET.matchAttempt===attempt&&!attempt.error&&Date.now()<attempt.deadline;
}
async function netAutoMatch(attempt){
  while(netMatchActive(attempt)){
    try{
      const id=await VIBE.client.rooms.quickJoin({ filter:r=>r&&r.open&&(r.players|0)<(r.max|0)&&r.slug===WORK_SLUG });
      if(!netMatchActive(attempt)) return;
      if(id&&await netJoin(id,false,attempt)) return;
    }catch(e){}
    if(netMatchActive(attempt)) await new Promise(resolve=>setTimeout(resolve,Math.min(3000,attempt.deadline-Date.now())));
  }
}

// ---------------- 大厅 UI ----------------
function netSetMsg(s){ NET.msg.unshift(String(s)); NET.msg=NET.msg.slice(0,4); netRenderLobby(); }
function netRenderLobby(){
  const online=VIBE.ready&&!!VIBE.user;
  const joining=online&&NET.joining&&NET.joining!==NET.matchAttempt;
  el('netForm').hidden=!online||!!NET.room||!!joining;
  el('netRoom').hidden=!online||!NET.room;
  el('netCancel').hidden=!joining;
  let hint='登录后创建房间，或输入好友的房间码。每队最多 4 人。';
  if(!VIBE.ready) hint=VIBE.err?'联机服务未连接。你仍可从「出击」开始单人行动。':'正在连接 VibeHub…';
  else if(joining) hint=NET.joining.asHost?'正在创建房间…':'正在加入房间…';
  else if(online) hint=NET.room?'把房间码发给好友，然后各自选择同一张出击地图。':'创建房间邀请好友，或输入房间码加入已有队伍。';
  if(online&&!joining&&NET.returnRoom?.user===VIBE.user.id) hint='部署时会重新连接房间 '+NET.returnRoom.code+'，也可在此输入房间码提前加入。';
  el('netHint').textContent=hint;
  const note=el('netTeamNote');
  note.hidden=!NET.returnRoom&&!NET.room;
  if(!note.hidden) note.textContent=NET.room?'当前队伍 · '+NET.roomId:'部署时重连队伍 · '+NET.returnRoom.code;
  if(NET.room){
    const count=1+(NET.room.peers?.()||[]).filter(peer=>peer.open).length;
    el('netShare').value=NET.roomId;
    el('netMembers').textContent=(NET.isHost?'你是房主':'你是队员')+' · 队员 '+count+' / '+NET_CFG.maxPlayers+' 人，空位由 AI 补足';
  }
  const log=NET.msg[0]||'';
  if(el('netLog').textContent!==log) el('netLog').textContent=log;
}

// ---------------- 远端玩家代理 ----------------
function netRemoteCount(){ let n=0; for(const k in NET.remote) n++; return n; }
function netEnsureRemote(peerId,name){
  const previous=NET.remote[peerId];
  if(previous&&previous.mesh) return previous;
  let b=null;
  try{
    // ⚠️ cls 必须传数字 0，不能传 null —— setClass 会走 TEAM_FACTION[team].cls[cls]，
    //    传 null 会变成 cls[null] → undefined → 构造抛错（踩过）
    b=new Bot(player.team,0,name||(previous&&previous.name)||'玩家');
    b.netRemote=true; b.netPeerId=peerId;
    b.isPlayer=false; b.inSquad=true;
    b.squadGroup=9;                       // 独立编组 → unitBlocks 不会把它和 AI 队友当同单位
    b.alive=true; b.hp=440;
    b.pos.set(0,0,0);
    if(b.mesh&&b.mesh.tag) b.mesh.tag.material.color.set(0x86ffa6);   // 队友绿名
    // ⚠️ Bot 构造函数里已经 combatants.push + soldiers.push 了(19_bot.js:57),
    //    这里**不能**再 push, 否则同一个代理会在 soldiers 里出现两次(踩过)
    if(typeof assignUnit==='function'){ try{ assignUnit(b); }catch(e){} }
    b.squadGroup=9;   // ⚠️ 必须在 assignUnit 之后 —— 它会把 squadGroup 重算回 1
  }catch(e){ NET.err='创建远端玩家失败：'+e.message; return null; }
  NET.remote[peerId]=b;
  return b;
}
function netDropRemote(peerId){
  const b=NET.remote[peerId];
  delete NET.remote[peerId];
  if(!b) return;
  // 真人退出 → 用 AI 顶替这个位置（缺失玩家自动 NPC 代替）
  try{
    const i=soldiers.indexOf(b);
    if(i>=0) soldiers.splice(i,1);
    const ci=combatants.indexOf(b);
    if(ci>=0) combatants.splice(ci,1);
    releaseRaidActor(b);
    if(player.alive&&player.deployed&&!matchOver) netSpawnReplacement();
  }catch(e){}
}
// 在玩家附近生成一个 AI 队友，补上退出的真人
function netSpawnReplacement(){
  try{
    if(typeof Bot!=='function'||typeof randi!=='function') return;
    const ang=rand(0,Math.PI*2), r=8+rand(0,4);
    const x=player.pos.x+Math.sin(ang)*r, z=player.pos.z+Math.cos(ang)*r;
    const b=new Bot(player.team,0);   // cls 必须传数字, 传 null 会在 setClass 里抛错
    b.inSquad=true; b.squadGroup=1;
    b.spawn();
    const [sx,sz]=findFreeSpawn(x,z);
    b.pos.set(sx,standHeight(sx,sz,10),sz);
    // ⚠️ 同上: 构造函数已入列, 不要再 push
    if(typeof assignUnit==='function'){ try{ assignUnit(b); }catch(e){} }
    showScorePop('队友退出 · AI 已顶替');
  }catch(e){}
}

// ---------------- 消息 ----------------
function netOnMessage(msg,from){
  if(!msg||typeof msg!=='object') return;
  switch(msg.t){
    case 'hello':{
      if(!NET.remote[from]) netSetMsg((msg.name||'玩家')+' 加入');
      netEnsureRemote(from,msg.name);
      if(NET.isHost) netBroadcastRoster();
      break;
    }
    case 'bye':{ netDropRemote(from); netSetMsg('队友离开 · AI 已顶替'); break; }
    case 'p':{ // 远端玩家状态（可丢）
      const b=netEnsureRemote(from,msg.n);
      if(b) netApplyRemoteState(b,msg);
      break;
    }
    case 'npc':{ if(!NET.isHost) netApplyNpcSnapshot(msg); break; }
    case 'hit':{ // 命中真人 → 房主仲裁
      if(NET.isHost) netResolveHit(msg,from);
      break;
    }
    case 'hitok':{ netApplyHit(msg); break; }
    case 'kill':{ netSetMsg((msg.n||'队友')+' 阵亡'); break; }
    case 'chat':{ netSetMsg((msg.n||'?')+'：'+String(msg.m||'').slice(0,60)); break; }
    case 'strobe':{   // 别人放爆闪: 我在范围内且朝向它 → 白屏
      try{
        if(typeof STROBE==='undefined') break;
        const dx=msg.x-player.pos.x, dy=msg.y-(player.pos.y+1.4), dz=msg.z-player.pos.z;
        const d=Math.hypot(dx,dy,dz);
        if(d<=STROBE.range){ STROBE.blindT=Math.max(STROBE.blindT,0.42); netSetMsg('被爆闪晃到了'); }
      }catch(e){}
      break; }
  }
}
function netOnPeer(ev){
  if(!ev) return;
  if(ev.type==='join'){ netSetMsg('有玩家接入'); }
  else if(ev.type==='leave'){ netDropRemote(ev.id); netSetMsg('有玩家断开 · AI 已顶替'); }
  else if(ev.type==='error'){ NET.err=ev.reason||'连接错误'; netSetMsg('连接错误：'+NET.err); }
  else netRenderLobby();
}
function netBroadcastRoster(){
  if(!NET.room) return;
  const list=[];
  for(const k in NET.remote) list.push(k);
  try{ NET.room.send({t:'roster', ids:list}); }catch(e){}
}

// ---------------- 远端玩家状态 ----------------
function netApplyRemoteState(b,m){
  b._nx=m.x; b._ny=m.y; b._nz=m.z;
  b._nyaw=m.yaw; b._nvis=m.vis||m.yaw;
  b._nhp=m.hp|0; b._nalive=!!m.a; b._ncrouch=!!m.c; b._nprone=!!m.pr;
  b._nspeed=m.s||0;
  if(!b._init){ b.pos.set(m.x,m.y,m.z); b.yaw=m.yaw; b._init=true; }
  if(b._nalive!==b.alive){
    b.alive=b._nalive;
    if(!b.alive) netRemoteDie(b);
  }
  b.hp=b._nhp;
}
function netRemoteDie(b){
  try{
    if(typeof spawnRagdoll==='function'&&window.CANNON) b.ragdolled=spawnRagdoll(b,null,false);
  }catch(e){}
  netSetMsg((b.name||'队友')+' 阵亡');
}
// 远端玩家每帧插值 + 网格更新
function netUpdateRemote(b,dt){
  if(!b._init) return;
  const k=Math.min(1,dt*12);
  b.pos.x+=(b._nx-b.pos.x)*k;
  b.pos.y+=(b._ny-b.pos.y)*k;
  b.pos.z+=(b._nz-b.pos.z)*k;
  b.yaw=b._nyaw;
  b.crouch=!!b._ncrouch; b.prone=!!b._nprone;
  b.vel.set(b._nspeed,0,0);
  try{ b.updateMesh(dt,b._nspeed||0); }catch(e){}
}

// ---------------- NPC 快照（房主权威） ----------------
function netNpcList(){
  const out=[];
  for(const s of soldiers){
    if(s.team===player.team) continue;   // 只同步敌方 NPC
    if(s.netRemote) continue;
    out.push(s);
  }
  return out;
}
function netBroadcastNpc(){
  if(!NET.room||!NET.isHost) return;
  const L=netNpcList();
  const a=[];
  for(let i=0;i<L.length;i++){
    const s=L[i];
    a.push(i,Math.round(s.pos.x*10)/10,Math.round(s.pos.y*10)/10,Math.round(s.pos.z*10)/10,
      Math.round(s.yaw*100)/100,Math.round(s.hp),s.alive?1:0,s.crouch?1:0,s.prone?1:0);
  }
  try{ NET.room.sendRealtime({t:'npc',a:a}); }catch(e){}
}
function netApplyNpcSnapshot(m){
  const a=m.a||[];
  const L=netNpcList();
  for(let i=0;i<L.length;i++){
    const s=L[i], o=i*9;
    if(o+8>=a.length) break;
    s._nx=a[o+1]; s._ny=a[o+2]; s._nz=a[o+3]; s._nyaw=a[o+4];
    s._nhp=a[o+5]; s._nalive=!!a[o+6]; s._ncrouch=!!a[o+7]; s._nprone=!!a[o+8];
    if(!s._ninit){ s.pos.set(s._nx,s._ny,s._nz); s.yaw=s._nyaw; s._ninit=true; }
    s.hp=s._nhp;
    if(s.alive!==s._nalive){
      s.alive=s._nalive;
      if(!s.alive){ try{ if(typeof registerCorpse==='function') registerCorpse(s); }catch(e){} }
    }
  }
}
// 客户端: 用快照驱动 NPC（不跑 AI）
function netSnapshotDriven(s,dt){
  if(!s._ninit) return;
  const k=Math.min(1,dt*10);
  s.pos.x+=(s._nx-s.pos.x)*k;
  s.pos.y+=(s._ny-s.pos.y)*k;
  s.pos.z+=(s._nz-s.pos.z)*k;
  s.yaw=s._nyaw;
  s.crouch=!!s._ncrouch; s.prone=!!s._nprone;
  const sp=Math.hypot(s._nx-s.pos.x,s._nz-s.pos.z)/Math.max(dt,0.001);
  try{ s.updateMesh(dt,Math.min(sp,6)); }catch(e){}
}

// ---------------- 命中仲裁 ----------------
// 本地打到远端真人 → 发给房主裁决（不做本地扣血，避免双端不一致）
function netReportHit(targetBot,amt,isHead){
  if(!NET.room||!targetBot||!targetBot.netRemote) return;
  try{ NET.room.send({t:'hit',to:targetBot.netPeerId,amt:Math.round(amt),h:isHead?1:0}); }catch(e){}
}
function netResolveHit(m,from){
  if(!NET.isHost) return;
  const b=NET.remote[m.to];
  if(!b||!b.alive) return;
  const dmg=clamp(m.amt|0,0,200);
  b.hp=Math.max(0,b.hp-dmg);
  const dead=b.hp<=0;
  if(dead){ b.alive=false; netRemoteDie(b); }
  // 广播权威结果（必须带上 amt，否则被打的一方不知道自己掉了多少血）
  try{
    NET.room.send({t:'hitok',to:m.to,amt:dmg,hp:b.hp,d:dead?1:0,by:from});
  }catch(e){}
}
// 房主广播的权威结果：套用到本地代理 + 若是自己则本地扣血
function netApplyHit(m){
  const b=NET.remote[m.to];
  if(b){ b.hp=m.hp|0; if(m.d){ b.alive=false; netRemoteDie(b); } }
  // 打的是"我"→ 本地玩家扣血（友伤）
  if(NET.peerId&&m.to===NET.peerId&&player.alive){
    try{
      const before=player.hp;
      player.hp=Math.max(0,player.hp-(clamp(m.amt|0,0,200)));
      if(player.hp<=0&&before>0&&typeof player.die==='function') player.die(null,false);
    }catch(e){}
  }
}

// ---------------- 主循环 ----------------
function netTick(dt){
  if(!NET.enabled||!NET.room) return;
  NET.snapT+=dt;
  // ① 自身状态 20Hz（可丢）
  if(nowT-NET.lastSend>=1/NET_CFG.sendHz){
    NET.lastSend=nowT;
    try{
      NET.room.sendRealtime({
        t:'p', n:(VIBE.user&&VIBE.user.name)||'玩家',
        x:Math.round(player.pos.x*10)/10, y:Math.round(player.pos.y*10)/10, z:Math.round(player.pos.z*10)/10,
        yaw:Math.round(player.yaw*100)/100, vis:Math.round((player.visYaw||player.yaw)*100)/100,
        hp:Math.round(player.hp), a:player.alive?1:0,
        c:player.crouch?1:0, pr:player.prone?1:0,
        s:Math.round(Math.hypot(player.vel.x,player.vel.z)*10)/10,
      });
    }catch(e){}
  }
  // ② 房主广播 NPC 15Hz
  if(NET.isHost&&nowT-NET.lastNpc>=1/NET_CFG.npcHz){
    NET.lastNpc=nowT;
    netBroadcastNpc();
  }
}

// ---------------- 友伤补丁 ----------------
// 原生 raySoldiers 对同队直接 continue → 完全没有友伤。
// 这里放行"双方都是真人玩家"的同队命中；AI 队友之间仍然免疫（保持原有手感）。
function netPatchFriendlyFire(){
  if(typeof window.unitBlocks==='function'&&!window.unitBlocks._netPatched){
    const ob=window.unitBlocks;
    window.unitBlocks=function(a,b){
      if((a&&a.netRemote)||(b&&b.netRemote)) return false;   // 真人之间不算同单位
      return ob.apply(this,arguments);
    };
    window.unitBlocks._netPatched=true;
  }
}

// ---------------- Bot.update 接管 ----------------
(function netHookBot(){
  if(typeof Bot!=='function'||!Bot.prototype||!Bot.prototype.update) return;
  const orig=Bot.prototype.update;
  Bot.prototype.update=function(dt){
    if(this.netRemote){ netUpdateRemote(this,dt); return; }
    if(NET.enabled&&!NET.isHost&&this.team!==player.team){ netSnapshotDriven(this,dt); return; }
    return orig.apply(this,arguments);
  };
})();

// ---------------- 开局补位 ----------------
// 玩家阵营固定 4 人：真人先占，其余 AI 补足
function netAllyAiTarget(){
  const humans=1+netRemoteCount();
  return Math.max(0,NET_CFG.maxPlayers-humans);
}

// 开局补位: 玩家阵营固定 4 人, 真人先占, 其余 AI 补足
function netAfterStart(){
  if(!NET.enabled||!NET.room) return;
  const peers=(NET.room.peers?NET.room.peers():[]).filter(function(p){return p.open;});
  for(const p of peers){ netEnsureRemote(p.id,null); }
  netSetMsg('本局真人 '+(1+peers.length)+' 人 · AI 补位 '+netAllyAiTarget()+' 人');
}
(function netHookStart(){
  if(typeof window.startMatch!=='function') return;
  const orig=window.startMatch;
  window.startMatch=function(){
    try{ if(NET.enabled&&VIBE.user) FRIENDLY_BOT_COUNT=netAllyAiTarget(); }catch(e){}
    const r=orig.apply(this,arguments);
    try{ netAfterStart(); }catch(e){}
    return r;
  };
})();

// ---------------- 部署时自动找房（上限 30s，超时用 NPC） ----------------
function netShowSearching(on,t){
  const box=el('netSearch'), focus=on&&box.classList.contains('hidden')&&document.activeElement===el('deployBtn');
  box.classList.toggle('hidden',!on);
  el('netSearchT').textContent=t!=null?(t+' 秒'):'';
  if(focus) el('netSkip').focus();
}
function netResetDeploy(){
  if(NET.matchAttempt) NET.matchAttempt.finish(false);
}
function netPrepareDeployment(){
  if(NET.matchAttempt) return false;
  const team=NET.returnRoom;
  if(NET.room||(!team&&(!VIBE.user||!VIBE.client))||
    (typeof storyPendingIdx==='function'&&storyPendingIdx()>=0)||CAMPAIGN.rangeOnly) return null;
  const attempt={deadline:Date.now()+NET_CFG.autoMatchMs};
  NET.matchAttempt=attempt;
  return new Promise(resolve=>{
    const update=()=>netShowSearching(true,Math.max(0,Math.ceil((attempt.deadline-Date.now())/1000)));
    const failed=message=>{
      if(NET.matchAttempt!==attempt||attempt.error) return;
      attempt.error=message;
      if(NET.joining===attempt) NET.joining=false;
      clearInterval(countdown); clearTimeout(timer);
      el('netSearchLabel').textContent='队伍未连接';
      el('netSearchT').textContent='';
      el('netSearchDetail').textContent=message;
      el('netRetry').hidden=false;
    };
    const timer=setTimeout(()=>team?failed('连接超时，可以重试或单人出击。'):attempt.finish(true),NET_CFG.autoMatchMs);
    const countdown=setInterval(update,1000);
    attempt.finish=proceed=>{
      if(NET.matchAttempt!==attempt) return;
      NET.matchAttempt=null;
      if(NET.joining===attempt) NET.joining=false;
      clearInterval(countdown); clearTimeout(timer);
      netShowSearching(false);
      resolve(proceed);
    };
    el('netRetry').hidden=true;
    el('netSearchLabel').textContent=team?'正在重连 '+team.code:'正在寻找队友';
    el('netSearchDetail').textContent=team?'准备与原队伍会合':'缺席队友由 AI 补位';
    el('netSkip').textContent=team?'单人出击':'跳过匹配';
    update();
    if(team){
      Promise.resolve(VIBE.boot).then(async()=>{
        if(!netMatchActive(attempt)) return;
        if(!VIBE.client||VIBE.user?.id!==team.user){ failed('请到联机大厅登录原账号后重试。'); return; }
        if(await netJoin(team.code,false,attempt)) attempt.finish(true);
        else failed(NET.err||'没有找到原队伍。');
      }).catch(()=>failed('联机服务暂时无法连接。'));
    }else netAutoMatch(attempt).then(()=>attempt.finish(true),()=>attempt.finish(true));
  });
}

window.addEventListener('load',function(){
  netPatchFriendlyFire();
  el('vhLogin').onclick=vibeLogin;
  el('vhLogout').onclick=vibeLogout;
  el('netCreate').onclick=netCreateRoom;
  el('netForm').onsubmit=e=>{
    e.preventDefault();
    netJoinRoom(el('netCode').value);
  };
  el('netCode').oninput=()=>el('netCode').removeAttribute('aria-invalid');
  el('netCancel').onclick=()=>{
    const asHost=NET.joining&&NET.joining.asHost;
    netCancelManualJoin();
    el(asHost?'netCreate':'netCode').focus();
  };
  el('netCopy').onclick=async()=>{
    const room=NET.room, code=NET.roomId;
    try{
      await navigator.clipboard.writeText(code);
      if(room===NET.room) netSetMsg('房间码已复制。');
    }catch(e){
      if(room!==NET.room) return;
      el('netShare').focus(); el('netShare').select();
      netSetMsg('已选中房间码，请使用系统复制。');
    }
  };
  el('netPlay').onclick=()=>showMenuPanel('mPlay');
  el('netLeave').onclick=()=>{
    netLeave();
    el('netCode').focus();
  };
  el('netSkip').onclick=()=>{
    NET.returnRoom=null; netRenderLobby();
    NET.matchAttempt?.finish(true);
  };
  el('netRetry').onclick=()=>{
    netResetDeploy();
    el('deployBtn').click();
  };
  netRenderLobby();
  // 主循环挂钩在 30_main.js 里 (每帧 netTick(dt))，这里不再自建 rAF
});
