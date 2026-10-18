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
    VIBE.client=await VibeHub.init({ work: WORK_SLUG });
    VIBE.user=VIBE.client.user||null;
    VIBE.ready=true;
    // 规范要求: 监听 onAuthChange 同步 UI，并在 init 后先读 user 渲染初始状态
    VIBE.client.onAuthChange(function(u){
      VIBE.user=u||null;
      vibeRenderAuth();
      if(u){ vibeLoadBoard(); vibeSyncSave(); }
      else vibeRenderBoard();
    });
  }catch(e){
    VIBE.err=(e&&e.message)||String(e);
  }
  vibeRenderAuth();
  vibeRenderBoard();
  if(VIBE.user){ vibeLoadBoard(); vibeSyncSave(); }
}

// ---------------- 登录 UI ----------------
function vibeRenderAuth(){
  const st=document.getElementById('vhUser');
  const lb=document.getElementById('vhLogin');
  const lo=document.getElementById('vhLogout');
  if(!st) return;
  if(!VIBE.ready){
    st.textContent=VIBE.err?('未连接 · '+VIBE.err):'连接中…';
    st.style.color='#d0a0a0';
  }else if(VIBE.user){
    st.textContent='已登录：'+(VIBE.user.name||'玩家');
    st.style.color='#9fe6b4';
  }else{
    st.textContent='未登录（游客）';
    st.style.color='#d2d2d2';
  }
  if(lb) lb.style.display=(VIBE.ready&&!VIBE.user)?'block':'none';
  if(lo) lo.style.display=VIBE.user?'block':'none';
}
async function vibeLogin(){
  if(!VIBE.client) return;
  try{ await VIBE.client.login(); }catch(e){ showScorePop('登录失败：'+((e&&e.message)||e)); }
}
function vibeLogout(){
  if(!VIBE.client) return;
  VIBE.client.logout();          // 规范: 同步清除本实例 token/用户/缓存
  VIBE.user=null;
  vibeRenderAuth(); vibeRenderBoard();
}

// ---------------- 战绩(存在玩家自己的存档里) ----------------
// 规范: 玩家存档用 vibe.save；读取后必须做版本兼容（SDK 不自动迁移）
function vibeStatSnapshot(){
  let kd=0;
  try{
    const k=(RUN&&RUN.kills)||0, d=(RUN&&RUN.deaths)||0;
    kd=d>0?k/d:k;
  }catch(e){}
  return {
    v:2,
    kd:Math.round(kd*100)/100,
    kills:((META&&META.stats&&META.stats.kills)||0)+((RUN&&RUN.kills)||0),
    deaths:((META&&META.stats&&META.stats.deaths)||0)+((RUN&&RUN.deaths)||0),
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
  let html='';
  // 自己的三项
  if(me){
    html+='<div class="vhMe">'
      +'<span><b>KD</b> '+me.kd.toFixed(2)+'</span>'
      +'<span><b>作战货币</b> ¥'+formatMoney(me.wallet)+'</span>'
      +'<span><b>仓库价值</b> ¥'+formatMoney(me.stash)+'</span>'
      +'</div>';
  }else{
    html+='<div class="vhTip">登录后显示你的 KD / 作战货币 / 仓库价值，并参与全服排行。</div>';
  }
  // 榜单
  if(!VIBE.ready){
    html+='<div class="vhTip">未连接 VibeHub：'+(VIBE.err||'…')+'</div>';
  }else if(!VIBE.lb.length){
    html+='<div class="vhTip">'+(VIBE.lbErr?('排行榜不可用：'+VIBE.lbErr):'榜单还没有数据 · 打完一局就会上榜')+'</div>';
  }else{
    html+='<div class="vhRows"><div class="vhRow vhHead"><span>#</span><span>玩家</span><span>KD</span><span>货币</span><span>仓库</span></div>';
    VIBE.lb.slice(0,12).forEach(function(r,i){
      const mine=VIBE.user&&r.id===VIBE.user.id;
      html+='<div class="vhRow'+(mine?' vhMine':'')+'"><span>'+(i+1)+'</span><span>'
        +String(r.name||'玩家').replace(/[<>&]/g,'')+'</span><span>'+(r.kd||0).toFixed(2)+'</span><span>¥'
        +formatMoney(r.wallet||0)+'</span><span>¥'+formatMoney(r.stash||0)+'</span></div>';
    });
    html+='</div>';
  }
  if(VIBE.lbWritable===false){
    html+='<div class="vhTip vhWarn">本作品的全服榜写入被平台限制（'+VIBE.lbErr+'）—— 你的战绩已存在本机存档，仍可正常查看。</div>';
  }
  box.innerHTML=html;
}

// ---------------- 结算钩子 ----------------
// 撤离/阵亡/超时结算后上报战绩（finishRaid 是唯一结算入口）
(function vibeHookFinish(){
  const orig=window.finishRaid;
  if(typeof orig!=='function') return;
  window.finishRaid=function(extracted){
    const r=orig.apply(this,arguments);
    try{ vibeSyncSave(); vibeSubmitScore(); }catch(e){}
    return r;
  };
})();

window.addEventListener('load',function(){ setTimeout(vibeBoot,0); });
