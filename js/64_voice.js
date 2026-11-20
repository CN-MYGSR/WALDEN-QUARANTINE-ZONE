'use strict';
// =====================================================================
// 64_voice.js — 英文配音 + 中文字幕
// ---------------------------------------------------------------------
// · 音频由用户 TTS 生成, 放 assets/vo/; 索引在 assets/vo/manifest.json
// · 单通道电台: 新台词打断旧台词; 剧情(priority 2) 压过对局播报(1)
// · 播放时压低音效总线(duck), 结束/出错立刻恢复; 人声不经过 duck
// · 只读本地文件: 不联网、不写库、不进 room; 多人各自本地播放
// · 不在每帧循环里 new Audio / 改 DOM —— 只在事件回调里触发
// =====================================================================
const VO=(()=>{
  const MANIFEST='assets/vo/manifest.json';
  const state={ ready:false, err:'', lines:[], byId:Object.create(null),
                cur:null, last:Object.create(null), seq:0 };

  // ---------------- 清单 ----------------
  let loading=null;
  function load(){
    if(state.lines.length) return Promise.resolve(state.lines);
    if(loading) return loading;
    loading=(async()=>{
      try{
        const res=await fetch(MANIFEST,{cache:'no-cache'});
        if(!res.ok) throw new Error('HTTP '+res.status);
        const data=await res.json();
        state.lines=Array.isArray(data.lines)?data.lines:[];
        for(const e of state.lines) state.byId[e.id]=e;
        state.ready=true;
      }catch(e){
        state.err=(e&&e.message)||String(e);
        console.warn('[voice] 配音清单加载失败: '+state.err);
      }
      return state.lines;
    })();
    return loading;
  }

  // ---------------- 字幕 ----------------
  function subBox(){ return document.getElementById('voSub'); }
  function displayZh(e){
    let t=e&&e.zh?String(e.zh):'';
    t=t.replace(/^渡鸦一号：/,'');            // 说话人已单独显示, 避免重复
    return t.replace(/\s*\n+\s*/g,' ');
  }
  function showSub(e,ms){
    const box=subBox(); if(!box) return;
    const who=document.getElementById('voWho');
    const line=document.getElementById('voLine');
    if(who) who.textContent=String(e.speaker||'Raven One').toUpperCase();
    if(line) line.textContent=displayZh(e);
    box.classList.add('on');
    clearTimeout(showSub._t);
    showSub._t=setTimeout(hideSub, Math.max(1400, ms||((e.dur||4)*1000+800)));
  }
  function hideSub(){
    clearTimeout(showSub._t);
    const box=subBox(); if(box) box.classList.remove('on');
  }

  // ---------------- 混音 ----------------
  function duck(on){
    try{ if(typeof AudioSys!=='undefined'&&AudioSys.setDuck) AudioSys.setDuck(on?0.42:1); }catch(e){}
  }
  function release(keepSub){
    const c=state.cur; if(!c) return;
    state.cur=null;
    try{
      if(c.audio){ c.audio.onended=null; c.audio.onerror=null; c.audio.pause(); }
    }catch(e){}
    clearTimeout(c.timer);
    duck(false);
    if(!keepSub) hideSub();
  }
  function stop(){ release(false); }

  // ---------------- 播放 ----------------
  function play(id,opt){
    opt=opt||{};
    if(!id) return;
    const now=(typeof performance!=='undefined')?performance.now():Date.now();
    if(!opt.force&&state.last[id]&&(now-state.last[id])<3500) return;
    const cur=state.cur;
    if(cur){
      const cp=(cur.entry&&cur.entry.priority)||1;
      const np=(opt.priority!=null)?opt.priority:2;
      if(cp>np&&!opt.force) return;          // 剧情在播时, 对局播报让路
      release(false);
    }
    state.last[id]=now;
    const req=++state.seq;
    load().then(()=>{
      if(req!==state.seq) return;            // 已被更新的请求取代
      const e=state.byId[id];
      if(!e){ console.warn('[voice] 未找到台词 '+id); return; }
      const a=new Audio();
      a.preload='auto';
      a.src=e.file;
      a.volume=Math.max(0,Math.min(1,(typeof SETTINGS!=='undefined'&&SETTINGS.vol!=null)?SETTINGS.vol:0.8));
      const c={audio:a,entry:e};
      state.cur=c;
      if(opt.subtitle!==false) showSub(e,(e.dur||4)*1000+800);
      duck(true);
      a.onended=()=>{ if(state.cur===c) release(false); };
      a.onerror=()=>{ if(state.cur===c) release(true); };   // 音频坏了也把字幕放完
      c.timer=setTimeout(()=>{ if(state.cur===c) release(false); },((e.dur||6)+3)*1000);
      const p=a.play();
      if(p&&p.catch) p.catch(()=>{
        // 浏览器拦截自动播放: 保留字幕, 释放 duck, 不当作致命错误
        try{ a.pause(); }catch(err){}
        if(state.cur===c) state.cur=null;
        duck(false);
      });
    });
  }

  function playBrief(ch,opt){
    return play('s'+ch+'_brief',Object.assign({subtitle:false,force:true,priority:2},opt||{}));
  }

  return { play:play, stop:stop, playBrief:playBrief, hide:hideSub, load:load, state:state };
})();

// =====================================================================
// 钩子 (必须在 VO 定义之后)
// =====================================================================
// 剧情事件 id 按章节内顺序生成: s<章号>_e<事件下标>, 与 VO_SCRIPT / manifest 对齐。
(function hookStory(){
  const orig=window.storyFireEvent;
  if(typeof orig!=='function') return;
  window.storyFireEvent=function(ev){
    const r=orig.apply(this,arguments);
    try{
      if(ev&&typeof SRAID!=='undefined'&&SRAID.ch){
        const i=(SRAID.ch.events||[]).indexOf(ev);
        if(i>=0) VO.play('s'+SRAID.ch.no+'_e'+i,{priority:2});
      }
    }catch(e){}
    return r;
  };
})();

// ---------------- 对局播报 ----------------
function voWrap(name,after){
  const orig=window[name];
  if(typeof orig!=='function') return;
  window[name]=function(){
    const r=orig.apply(this,arguments);
    try{ after.apply(this,arguments); }catch(e){}
    return r;
  };
  try{ window[name].__voWrapped=true; }catch(e){}
}
voWrap('deployPlayer',function(){
  try{ if(typeof RUN!=='undefined') RUN._voHold=false; }catch(e){}
  try{ if(typeof player!=='undefined'&&player&&player.deployed) VO.play('m_deploy',{priority:1}); }catch(e){}
});
// startExtraction 每帧都会在撤离区内调用: 用 RUN._voHold 保证一局只播一次
voWrap('startExtraction',function(){
  try{
    if(typeof RUN!=='undefined'&&RUN.extracting&&!RUN._voHold){
      RUN._voHold=true;
      VO.play('m_extract_hold',{priority:1});
    }
  }catch(e){}
});
voWrap('finishRaid',function(extracted){
  VO.play(extracted?'m_extract_ok':'m_signal_lost',{priority:1});
});
voWrap('startEndCut',function(winner){
  VO.play(winner===-1?'m_draw':(winner===player.team?'m_victory':'m_defeat'),{priority:1});
});
voWrap('netSpawnReplacement',function(){
  VO.play('m_squad_ai',{priority:1});
});

try{ window.VO=VO; }catch(e){}

