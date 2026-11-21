'use strict';
// =====================================================================
// VibeHub SDK 接入: 登录 / 存档 / 全服排行榜
// ---------------------------------------------------------------------
// 同步模型声明（规范第二节要求开工前声明）: **state-sync**
//   · 玩家自己的角色 → 本人权威，20Hz 用 room.sendRealtime 广播位置/姿态快照
//   · 敌方 NPC      → 房主权威，15Hz 广播快照，客户端只插值应用、不跑 AI
//   · 伤害/击杀/拾取/撤离/聊天 → 不可丢事件，走可靠 room.send，由房主仲裁
//   理由: 这是实时动作游戏，规范推荐 state-sync；NPC 有 8~12 个且 AI 复杂，
//        交给房主统一演算才能避免各端世界发散；玩家自身移动要求零延迟手感，
//        所以本人权威而不是把输入上行给房主。
//   详见 55_net.js。
//
// 三层数据用法（规范第四节）:
//   vibe.save.*    玩家自己的战绩(KD/货币/仓库价值) —— 本人读写
//   room.data.*    单局房间元数据 —— 房主写
//   vibe.global.*  全服排行榜 —— 所有人读，写入失败时降级（见下）
// =====================================================================

const WORK_SLUG='escape-from-walden';   // ⚠️ 项目 slug，不是作品 ID OV7HCwbazBp6HqrNiyljS

const VIBE={
  client:null,
  user:null,
  ready:false,
  boot:null,
  err:'',
  lb:[],            // 本地缓存的排行榜
  lbWritable:null,  // null=未测 / true=可写 / false=只读
  lbErr:'',
  lastSubmitT:0,
};

// ---------------- 启动 ----------------
async function vibeBoot(){
  if(typeof VibeHub==='undefined'){
    VIBE.err='SDK 未加载（离线或脚本被拦截）';
    vibeRenderAuth(); vibeRenderBoard();
    return;
  }
  try{
    // 本地也是静态游戏服务器；登录与联机请求应使用项目配置的平台后端。
    VIBE.client=await VibeHub.init({ work: WORK_SLUG, apiBase:'https://vibe.lumigrav.space' });
    VIBE.ready=true; VIBE.err='';
    VIBE.client.onAuthChange(vibeSetUser);
    vibeSetUser(VIBE.client.user||null);
    return;
  }catch(e){
    VIBE.err=(e&&e.message)||String(e);
  }
  vibeRenderAuth();
  vibeRenderBoard();
}

// ---------------- 登录 UI ----------------
function vibeSetUser(user){
  if(VIBE.user&&(!user||VIBE.user.id!==user.id)){
    netResetDeploy(); netCancelManualJoin();
    if(NET.room) netLeave();
    NET.returnRoom=null;
    NET.msg.length=0;
    el('netCode').value='';
    VIBE.lbWritable=null; VIBE.lbErr='';
  }
  VIBE.user=user||null;
  vibeRenderAuth(); vibeRenderBoard();
  if(user){ vibeLoadBoard(); vibeSyncSave(); }
}
function vibeRenderAuth(){
  const st=document.getElementById('vhUser');
  const lb=document.getElementById('vhLogin');
  const lo=document.getElementById('vhLogout');
  if(!st) return;
  st.textContent=!VIBE.ready?(VIBE.err?'VibeHub 离线':'正在连接账号…'):
    (VIBE.user?'已登录 · '+(VIBE.user.name||'玩家'):'尚未登录 VibeHub');
  if(lb) lb.hidden=!VIBE.ready||!!VIBE.user;
  if(lo) lo.hidden=!VIBE.user;
  if(typeof netRenderLobby==='function') netRenderLobby();
}
async function vibeLogin(){
  if(!VIBE.client) return;
  const button=el('vhLogin');
  button.disabled=true;
  try{ await VIBE.client.login(); }catch(e){ netSetMsg('登录失败：'+((e&&e.message)||e)); }
  finally{ button.disabled=false; }
}
function vibeLogout(){
  if(!VIBE.client) return;
  vibeSetUser(null);
  VIBE.client.logout();          // 规范: 同步清除本实例 token/用户/缓存
}

// ---------------- 战绩(存在玩家自己的存档里) ----------------
// 规范: 玩家存档用 vibe.save；读取后必须做版本兼容（SDK 不自动迁移）
function vibeStatSnapshot(){
  const live=player.deployed&&!matchOver&&!RUN.lossSettled&&!CAMPAIGN.rangeOnly;
  const kills=META.stats.kills+(live?RUN.kills||0:0);
  const deaths=META.stats.deaths+(live?player.deaths||0:0);
  return {
    v:2,
    kd:Math.round(kills/Math.max(1,deaths)*100)/100,
    kills,
    deaths,
    wallet:Math.round((META&&META.wallet)||0),
    stash:Math.round(vibeStashValue()),
    updated:Date.now(),
  };
}
// 仓库价值 = 仓库里所有物品按售价折算 + 保险箱 + 现金
function vibeStashValue(){
  let sum=0;
  try{
    if(typeof itemSellPrice!=='function') return 0;
    const add=o=>{ for(const k in (o||{})){ const n=o[k]|0; if(n>0) sum+=itemSellPrice(k)*n; } };
    add(META.owned); add(META.loot);
    for(const it of (META.insurance||[])){ sum+=itemSellPrice(it.key)*(it.n||1); }
  }catch(e){}
  return sum;
}
async function vibeSyncSave(){
  if(!VIBE.client||!VIBE.user) return;
  try{
    const cur=await VIBE.client.save.get('profile');
    let p=cur;
    if(!p||!p.v2) p={v:2};                    // 版本兼容（规范要求）
    const s=vibeStatSnapshot();
    p={...p,...s};
    await VIBE.client.save.set('profile',p);
  }catch(e){}
}

// ---------------- 全服排行榜 ----------------
// 规范: 全服排行榜写 vibe.global（权威方写、所有人读）。
// ⚠️ 平台可能只允许创作者写 global。所以这里**先试写**，失败就降级为
//    "只读 + 本机存档"，并把原因显示出来，绝不假装成功。
async function vibeSubmitScore(){
  if(!VIBE.client||!VIBE.user) return false;
  const me=vibeStatSnapshot();
  if(nowT-VIBE.lastSubmitT<20) return false;   // 防抖
  VIBE.lastSubmitT=nowT;
  const rec={ id:VIBE.user.id, name:VIBE.user.name||'玩家', kd:me.kd, kills:me.kills, deaths:me.deaths, wallet:me.wallet, stash:me.stash, t:Date.now() };
  try{
    const cur=(await VIBE.client.global.get('leaderboard'))||[];
    const list=Array.isArray(cur)?cur.slice():[];
    const i=list.findIndex(r=>r&&r.id===rec.id);
    if(i>=0) list[i]=rec; else list.push(rec);
    list.sort((a,b)=>(b.kd||0)-(a.kd||0));
    const next=list.slice(0,100);
    await VIBE.client.global.set('leaderboard',next);
    VIBE.lb=next; VIBE.lbWritable=true; VIBE.lbErr='';
    vibeRenderBoard();
    return true;
  }catch(e){
    VIBE.lbWritable=false;
    VIBE.lbErr=(e&&e.message)||String(e);
    vibeRenderBoard();
    return false;
  }
}
async function vibeLoadBoard(){
  if(!VIBE.client) return;
  try{
    const cur=await VIBE.client.global.get('leaderboard');
    if(Array.isArray(cur)) VIBE.lb=cur;
    VIBE.lbErr='';
  }catch(e){
    const m=(e&&e.message)||String(e);
    // 404 = 这个 key 还没人写过, 属于正常空榜, 不是错误
    if(/404/.test(m)){ VIBE.lb=[]; VIBE.lbErr=''; }
    else VIBE.lbErr=m;
  }
  vibeRenderBoard();
}
function vibeRenderBoard(){
  const box=document.getElementById('vhBoard');
  if(!box) return;
  const me=VIBE.user?vibeStatSnapshot():null;
  box.replaceChildren();
  if(me){
    const stats=document.createElement('dl');
    stats.className='vhMe'; stats.setAttribute('aria-label','我的战绩');
    for(const [label,value] of [['我的 K/D',me.kd.toFixed(2)],['作战货币','¥'+formatMoney(me.wallet)],['仓库价值','¥'+formatMoney(me.stash)]]){
      const group=document.createElement('div'), term=document.createElement('dt'), count=document.createElement('dd');
      term.textContent=label; count.textContent=value;
      group.append(term,count); stats.append(group);
    }
    box.append(stats);
  }
  const tip=(message,warn=false)=>{
    const p=document.createElement('p');
    p.className=warn?'fieldNote vhWarn':'fieldNote';
    p.textContent=message; box.append(p);
  };
  if(!VIBE.ready) tip(VIBE.err?'连接联机服务后可查看排行。':'正在连接排行榜…');
  else if(!VIBE.user&&!VIBE.lb.length) tip('登录后可以查看战绩和全服排行。');
  else if(!VIBE.lb.length){
    tip(VIBE.lbErr?'排行榜暂时无法读取。':'当前还没有上榜记录。');
  }else{
    const table=document.createElement('table');
    table.className='vhRows'; table.setAttribute('aria-labelledby','netRanks');
    const header=table.createTHead().insertRow();
    for(const name of ['名次','玩家','K/D','货币','仓库']){
      const cell=document.createElement('th');
      cell.scope='col'; cell.textContent=name; header.append(cell);
    }
    const body=table.createTBody();
    VIBE.lb.filter(r=>r&&typeof r==='object').slice(0,12).forEach((r,i)=>{
      const row=body.insertRow();
      if(VIBE.user&&r.id===VIBE.user.id) row.className='vhMine';
      for(const value of [i+1,r.name||'玩家',(Number(r.kd)||0).toFixed(2),'¥'+formatMoney(r.wallet),'¥'+formatMoney(r.stash)]){
        row.insertCell().textContent=value;
      }
    });
    box.append(table);
  }
  if(VIBE.lbWritable===false){
    tip('这次战绩已保存在本机，全服排行更新失败。',true);
  }
}

// ---------------- 结算钩子 ----------------
// 撤离/阵亡/超时结算后上报战绩（finishRaid 是唯一结算入口）
(function vibeHookFinish(){
  const orig=window.finishRaid;
  if(typeof orig!=='function') return;
  window.finishRaid=function(extracted){
    if(matchOver||(extracted&&RUN.deathTimer)) return;
    const r=orig.apply(this,arguments);
    if(!CAMPAIGN.rangeOnly){ try{ vibeSyncSave(); vibeSubmitScore(); }catch(e){} }
    return r;
  };
})();

window.addEventListener('load',function(){ VIBE.boot=vibeBoot(); });
