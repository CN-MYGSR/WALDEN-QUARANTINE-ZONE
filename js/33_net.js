'use strict';
/* ===== 33_net.js — WebRTC P2P 联机模块 =====
   创建服务器: 以「本机IP:端口」为房间ID, 通过 PeerJS 云端信令注册 (默认端口 8192, 可改)
   连接服务器: 输入「IP:端口」→ 信令服务器找到主机 → WebRTC 打洞直连 (STUN, 支持内网穿透)
   数据通道: JSON 可靠传输 (玩家列表 / 延迟心跳 / 聊天) */
const NET=(()=>{
  const st={ mode:null, peer:null, conns:[], myName:'', ip:'', port:8192, addr:'', players:[], lat:0 };
  const ICE={ iceServers:[
    { urls:['stun:stun.l.google.com:19302','stun:global.stun.twilio.com:3478'] }
  ]};
  let ui={ onStatus:()=>{}, onPlayers:()=>{}, onChat:()=>{}, onReset:()=>{} };
  const pingT={};
  let pingIv=null;

  const setUI=(u)=>{ ui=Object.assign(ui,u||{}); };
  const peerId=(ip,port)=>'SF_'+String(ip).replace(/\./g,'_')+'_'+port;
  const send=(c,m)=>{ try{ c.send(m); }catch(e){} };
  const broadcast=(m)=>{ st.conns.forEach(c=>send(c,m)); };

  /* 通过 WebRTC 候选地址探测本机局域网 IP (无 STUN, 纯本地候选) */
  function detectIP(cb){
    try{
      const pc=new RTCPeerConnection({iceServers:[]});
      let done=false;
      pc.createDataChannel('probe');
      pc.onicecandidate=e=>{
        if(done||!e.candidate) return;
        const m=/[0-9]{1,3}(\.[0-9]{1,3}){3}/.exec(e.candidate.candidate);
        if(m){ done=true; cb(m[0]); try{ pc.close(); }catch(err){} }
      };
      pc.createOffer().then(o=>pc.setLocalDescription(o)).catch(()=>{});
      setTimeout(()=>{ if(!done){ try{ pc.close(); }catch(err){} cb(null); } },2500);
    }catch(err){ cb(null); }
  }

  function stop(){
    if(pingIv){ clearInterval(pingIv); pingIv=null; }
    st.conns.forEach(c=>{ try{ c.close(); }catch(e){} });
    st.conns=[];
    if(st.peer){ try{ st.peer.destroy(); }catch(e){} st.peer=null; }
    st.mode=null; st.players=[]; st.lat=0; st.addr='';
    ui.onReset();
  }

  function startPing(){
    if(pingIv) clearInterval(pingIv);
    pingIv=setInterval(()=>{
      const now=performance.now();
      st.conns.forEach(c=>{ pingT[c.peer]=now; send(c,{t:'ping',ts:now}); });
    },2000);
  }

  /* ============ 主机 ============ */
  function host(opt){
    stop();
    st.mode='host';
    st.myName=opt.nick||'主机';
    st.ip=opt.ip; st.port=opt.port;
    st.addr=opt.ip+':'+opt.port;
    st.players=[{id:'me',name:st.myName,lat:null,isHost:true}];
    ui.onPlayers(st.players.slice());
    const peer=new Peer(peerId(opt.ip,opt.port),{ debug:1, config:ICE });
    st.peer=peer;
    peer.on('open',()=>{
      ui.onStatus('服务器已启动 ✓ 房间地址: '+st.addr+' · 等待玩家加入…',false);
      startPing();
    });
    peer.on('connection',conn=>{
      conn.serialization='json';
      conn.on('open',()=>{
        st.conns.push(conn);
        ui.onStatus('新玩家接入: '+conn.peer,false);
        conn.on('data',d=>hostMsg(conn,d));
        conn.on('close',()=>{
          const old=st.players.find(p=>p.id===conn.peer);
          st.conns=st.conns.filter(c=>c!==conn);
          st.players=st.players.filter(p=>p.id!==conn.peer);
          ui.onPlayers(st.players.slice());
          if(old) ui.onChat('系统',old.name+' 已离开房间',true);
          broadcastList();
        });
        conn.on('error',()=>{});
      });
    });
    peer.on('error',err=>{
      const t=String((err&&err.type)||err);
      if(t.indexOf('unavailable-id')>=0) ui.onStatus('房间地址 '+st.addr+' 已被占用 — 请更换端口或稍后重试',true);
      else if(t.indexOf('network')>=0||t.indexOf('server-error')>=0) ui.onStatus('无法连接信令服务器 — 联机需要网络(若局域网直连失败请检查防火墙)',true);
      else if(t.indexOf('browser')>=0) ui.onStatus('当前浏览器不支持 WebRTC',true);
      else ui.onStatus('创建服务器失败: '+t,true);
    });
  }

  function hostMsg(conn,d){
    if(!d) return;
    if(d.t==='hello'){
      const nm=d.name||'玩家';
      if(!st.players.some(p=>p.id===conn.peer)){
        st.players.push({id:conn.peer,name:nm,lat:null,isHost:false});
        ui.onPlayers(st.players.slice());
        ui.onChat('系统',nm+' 已加入房间',true);
        broadcastList();
      }
    }else if(d.t==='pong'){
      const pt=pingT[conn.peer];
      if(pt==null) return;
      const p=st.players.find(x=>x.id===conn.peer);
      if(p){ p.lat=Math.max(1,Math.round(performance.now()-pt)); broadcastList(); }
    }else if(d.t==='ping'){
      send(conn,{t:'pong',ts:d.ts});
    }else if(d.t==='chat'){
      const nm=(st.players.find(p=>p.id===conn.peer)||{}).name||'玩家';
      broadcast({t:'chat',from:nm,text:d.text});
      ui.onChat(nm,d.text,false);
    }
  }

  function broadcastList(){
    broadcast({t:'list',players:st.players.map(p=>({id:p.id,name:p.name,lat:p.lat,isHost:p.isHost}))});
  }

  /* ============ 客户端 ============ */
  function join(opt){
    stop();
    const parts=String(opt.addr||'').trim().split(':');
    const ip=(parts[0]||'').trim();
    const port=parseInt(parts[1])||8192;
    if(!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)){
      ui.onStatus('地址格式错误 — 请按 IP:端口 输入, 示例: 192.168.0.1:8080',true);
      return;
    }
    st.mode='client';
    st.myName=opt.nick||('玩家'+randi(10,99));
    st.addr=ip+':'+port;
    const target=peerId(ip,port);
    const peer=new Peer({ debug:1, config:ICE });
    st.peer=peer;
    let timeout=null;
    peer.on('open',()=>{
      ui.onStatus('正在连接 '+st.addr+' …',false);
      const conn=peer.connect(target,{ reliable:true, serialization:'json' });
      timeout=setTimeout(()=>{
        if(!conn.open){ try{ conn.close(); }catch(e){} ui.onStatus('连接超时: 未找到服务器 '+st.addr+' (请确认 IP:端口 正确)',true); }
      },8000);
      conn.on('open',()=>{
        if(timeout){ clearTimeout(timeout); timeout=null; }
        st.conns=[conn];
        send(conn,{t:'hello',name:st.myName});
        startPing();
        conn.on('data',d=>clientMsg(conn,d));
        conn.on('close',()=>{ ui.onStatus('与服务器 '+st.addr+' 的连接已断开',true); });
      });
      conn.on('error',()=>{
        if(timeout){ clearTimeout(timeout); timeout=null; }
        ui.onStatus('连接失败: 服务器 '+st.addr+' 无响应',true);
      });
    });
    peer.on('error',err=>{
      const t=String((err&&err.type)||err);
      if(t.indexOf('peer-unavailable')>=0) ui.onStatus('未找到服务器 '+st.addr+' — 请确认 IP:端口 正确且主机已启动',true);
      else if(t.indexOf('network')>=0) ui.onStatus('无法连接信令服务器 — 联机需要网络',true);
      else ui.onStatus('连接错误: '+t,true);
    });
  }

  function clientMsg(conn,d){
    if(!d) return;
    if(d.t==='hello'){
      st.players=[{id:conn.peer,name:(d.name||'主机'),lat:null,isHost:true}];
      ui.onPlayers(st.players.slice());
      ui.onStatus('已连接服务器 '+st.addr+' ✓',false);
      ui.onChat('系统','已连接到房间',true);
    }else if(d.t==='list'){
      st.players=(d.players||[]).map(p=>p.isHost?Object.assign({},p,{lat:st.lat||null}):p);
      ui.onPlayers(st.players.slice());
    }else if(d.t==='ping'){
      send(conn,{t:'pong',ts:d.ts});
    }else if(d.t==='pong'){
      st.lat=Math.max(1,Math.round(performance.now()-d.ts));
      const p=st.players.find(x=>x.isHost);
      if(p) ui.onPlayers(st.players.slice());
    }else if(d.t==='chat'){
      ui.onChat(d.from,d.text,false);
    }
  }

  /* 聊天: 客户端发给主机, 主机转发全体 */
  function sendChat(text){
    if(!st.mode||!st.conns.length){ ui.onStatus('尚未建立连接',true); return false; }
    if(st.mode==='host'){
      broadcast({t:'chat',from:st.myName,text:text});
      ui.onChat(st.myName,text,false);
    }else{
      st.conns.forEach(c=>send(c,{t:'chat',from:st.myName,text:text}));
    }
    return true;
  }

  return { setUI, host, join, stop, sendChat, detectIP, state:st };
})();
