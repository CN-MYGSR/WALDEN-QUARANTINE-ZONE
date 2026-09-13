// 无头浏览器冒烟测试: 通过 CDP 加载游戏, 捕获控制台错误/异常, 截图
// 用法: node _tools/cdp_test.js <url> <outPng> [waitMs] [autoDeploy]
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const OUT = process.argv[3] || 'smoke-test.png';
const WAIT = parseInt(process.argv[4] || '9000', 10);
const AUTODEPLOY = process.argv[5] === '1';
// 可选: 第 6 个参数 = 战役下标 (0=bfruins 街区 / 1=lab / 2=port 港口)
const CAMP = (process.argv[6] !== undefined && process.argv[6] !== '') ? parseInt(process.argv[6], 10) : null;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9223;
const profile = require('os').tmpdir() + '/cqb-chrome-' + Date.now();

const args = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1440,900', '--hide-scrollbars', '--mute-audio',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  'about:blank'
];

const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d.toString(); });

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitTarget() {
  for (let i = 0; i < 60; i++) {
    try { const l = await getJSON('/json/list'); if (l && l.length) return l; } catch (e) { }
    await sleep(400);
  }
  throw new Error('CDP target not ready. chrome stderr:\n' + chromeErr.slice(-1500));
}

let idc = 0;
function rpc(ws, method, params, sessionId) {
  const id = ++idc;
  return new Promise((res, rej) => {
    const on = raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.id === id) { ws.off('message', on); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    ws.on('message', on);
    const msg = { id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
    setTimeout(() => { ws.off('message', on); rej(new Error('rpc timeout ' + method)); }, 60000);
  });
}

(async () => {
  const list = await waitTarget();
  const page = list.find(t => t.type === 'page') || list[0];
  const WebSocket = require('ws');
  let ws, sid = null;

  const errors = [], logs = [];
  try {
    ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });

    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push('EXCEPTION: ' + (d.exception && d.exception.description ? d.exception.description : d.text) +
          ' @' + (d.url || '') + ':' + (d.lineNumber || 0));
      } else if (m.method === 'Runtime.consoleAPICalled') {
        const txt = (m.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
        if (m.params.type === 'error') errors.push('CONSOLE.ERROR: ' + txt);
        else logs.push(m.params.type + ': ' + txt);
      } else if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error') errors.push('LOG.ERROR: ' + e.text + ' @' + (e.url || ''));
      }
    });

    await rpc(ws, 'Runtime.enable');
    await rpc(ws, 'Log.enable');
    await rpc(ws, 'Page.enable');
    // 注入探针 (页面脚本执行前运行 → 可在读取 sf_campaign 之前指定战役)
    await rpc(ws, 'Page.addScriptToEvaluateOnNewDocument', {
      source: (CAMP !== null ? `try{localStorage.setItem('sf_campaign','${CAMP}');}catch(e){}` : '')
        + `window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)+' @'+(e.filename||'')+':'+e.lineno));window.addEventListener('unhandledrejection',e=>window.__errs.push('REJECT:'+String(e.reason)));`
    });

    await rpc(ws, 'Page.navigate', { url: URL_ });
    await sleep(WAIT);

    // 探针: 检查关键全局是否存在 / 世界构建状态
    const probe = await rpc(ws, 'Runtime.evaluate', {
      expression: `(function(){
        const r={};
        try{ r.three=typeof THREE; r.worldChildren=(typeof world!=='undefined'&&world)?world.children.length:-1;
          r.boxes=(typeof BOXES!=='undefined')?BOXES.length:-1;
          r.cyls=(typeof CYLS!=='undefined')?CYLS.length:-1;
          r.covers=(typeof coverPoints!=='undefined')?coverPoints.length:-1;
          r.navClears=(typeof NAV_CLEARS!=='undefined')?NAV_CLEARS.length:-1;
          r.buildings=(typeof CQ_BUILDINGS!=='undefined')?CQ_BUILDINGS.length:-1;
          r.errs=window.__errs||[];
          r.weaponCount=(typeof WPN_DEFS!=='undefined')?Object.keys(WPN_DEFS).length:-1;
          if(typeof WPN_DEFS!=='undefined'){
            const smp={};
            for(const k of ['mp40','thompson','m1911','stg44','m4','kar98','svd','mosinpu','springfield','garand','bazooka']){
              const d=WPN_DEFS[k]; if(!d) continue;
              smp[k]={dmg:d.dmg,pct:d.cqbBase?Math.round(d.dmg/d.cqbBase.dmg*100):null,adsT:d.adsTime||null,
                      nerf:!!d.cqbNerf,buff:!!d.cqbBuff};
            }
            r.wpn=smp;
            r.cqbBalance=(typeof CQB_BALANCE!=='undefined')?{near:CQB_BALANCE.applied.filter(s=>s.endsWith(':near')).length,sniper:CQB_BALANCE.applied.filter(s=>s.endsWith(':sniper')).length}:null;
          }
          // 高低姿态持枪验证: 检查状态字段 + 实测两种姿态下的移动速度
          if(typeof player!=='undefined'){
            const st={carry:player.carry, carryLow:!!player.carryLow, blend:VM&&VM.carryBlend};
            // 模拟: 固定位移方向, 比较 high/low 两种姿态的稳态速度
            const savedCarry=player.carry, savedAds=player.ads, savedProne=player.prone,
                  savedCrouch=player.crouch, savedSprint=player.sprinting;
            const probe=()=>{
              const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0);
              const sp=player.prone?1.15:player.crouch?2.2:(player.sprinting?6.4:4.3);
              const low=(player.carry==='low')&&!player.ads&&!player.braced&&!player.prone;
              return +(sp*(low?(player.sprinting?1.06:1.18):1)).toFixed(3);
            };
            player.ads=false; player.prone=false; player.braced=false; player.sprinting=false;
            player.carry='high'; st.spdHigh=probe();
            player.carry='low';  st.spdLow=probe();
            player.sprinting=true;
            player.carry='high'; st.sprHigh=probe();
            player.carry='low';  st.sprLow=probe();
            st.gain=+(st.spdLow/st.spdHigh).toFixed(3);
            st.sprGain=+(st.sprLow/st.sprHigh).toFixed(3);
            // ADS 应强制回高位: 通过真实 InputActions 路径验证
            player.sprinting=false; player.prone=false; player.crouch=false; player.braced=false;
            player.carry='high'; player.ads=false;
            InputActions.toggleCarry();                 // 切到低位
            st.toggleToLow=(player.carry==='low');
            player.ads=true; InputActions.toggleCarry(); // 开镜中再切 -> 应回高位且不进入低位
            st.adsBlocksLow=(player.carry==='high');
            player.ads=false; InputActions.toggleCarry(); // 关镜后切 -> 低位
            st.lowAfterAdsOff=(player.carry==='low');
            st.hasElement=!!document.getElementById('carryInd');
            player.carry=savedCarry; player.ads=savedAds; player.prone=savedProne;
            player.crouch=savedCrouch; player.sprinting=savedSprint;
            r.carry=st;
          }
          // 失败补偿 / 保底武器验证
          if(typeof META!=='undefined'&&typeof grantFailCompensation==='function'){
            const rep={};
            rep.const=FAIL_COMPENSATION;
            rep.safetyWpn=SAFETY_WEAPON;
            // 模拟: 卖光所有武器 -> 保底是否补发
            const savedOwned=JSON.parse(JSON.stringify(META.owned));
            const savedWallet=META.wallet;
            const savedLoadout=JSON.parse(JSON.stringify(META.loadout));
            META.owned={}; META.wallet=1000;
            META.loadout.primary=''; META.loadout.armor='';
            rep.noWeaponBefore=ownedWeaponList().length;
            const kit=ensureSafetyKit('probe');
            rep.granted=kit;
            rep.hasWeaponAfter=ownedWeaponList().length>0;
            rep.m1911Count=META.owned[SAFETY_WEAPON]||0;
            rep.loadoutFixed=META.loadout.primary;
            // 模拟一次失败补偿
            const before=META.wallet;
            const got=grantFailCompensation(0);
            rep.compAmount=got;
            rep.walletDelta=META.wallet-before;
            // 还原
            META.owned=savedOwned; META.wallet=savedWallet; META.loadout=savedLoadout;
            saveMeta();
            r.failComp=rep;
          }
          r.theme=(typeof THEME!=='undefined')?!!THEME.cqb:null;
          r.layout=(typeof CAMPAIGN!=='undefined')?CAMPAIGN.layout:null;
          r.weather=(typeof WEATHER!=='undefined')?WEATHER:((typeof WEATHER_MODE!=='undefined')?WEATHER_MODE:null);
          r.wfx=(typeof WFX!=='undefined')?{fogFar:WFX.fogFar,fogNear:WFX.fogNear,sight:WFX.sight}:null;
        }catch(e){ r.probeErr=String(e); }
        return JSON.stringify(r);
      })()`, returnByValue: true
    });
    const probeVal = probe.result && probe.result.value;

    // 尝试自动部署: 点击部署按钮进入战局
    if (AUTODEPLOY) {
      const dep = await rpc(ws, 'Runtime.evaluate', {
        expression: `(function(){
          try{
            AudioSys.init();
            player.team=0; matchOver=false; player.deployed=false; player.alive=false;
            player.kills=0; player.deaths=0; player.score=0;
            BOTS_PER_TEAM=SIZE_OPTS[0].bots;
            tickets[0]=SIZE_OPTS[0].tk; tickets[1]=SIZE_OPTS[0].tk;
            startMatch();
            el('menu').classList.add('hidden');
            showDeploy(false);
            return 'deploy-flow-started';
          }catch(e){ return 'DEPLOY_ERR: '+e.message+' | '+e.stack; }
        })()`, returnByValue: true
      });
      logs.push('autodeploy: ' + (dep.result && dep.result.value));
      await sleep(2500);
      const dep2 = await rpc(ws, 'Runtime.evaluate', {
        expression: `(function(){
          try{
            if(typeof selectedSpawn==='undefined') return 'no selectedSpawn';
            selectedSpawn=-1;
            deployPlayer();
            return 'deployed='+player.deployed+' alive='+player.alive+' pos='+(player.pos?[player.pos.x.toFixed(1),player.pos.z.toFixed(1)].join(','):'-');
          }catch(e){ return 'DEPLOY2_ERR: '+e.message+' | '+(e.stack||'').split('\\n').slice(0,3).join(' <- '); }
        })()`, returnByValue: true
      });
      logs.push('deployPlayer: ' + (dep2.result && dep2.result.value));
      await sleep(5000);

      // 让相机就位后取景
      const view = await rpc(ws, 'Runtime.evaluate', {
        expression: `(function(){
          try{
            const r={};
            r.deployed=player.deployed; r.alive=player.alive;
            r.pos=player.pos?[+player.pos.x.toFixed(1),+player.pos.y.toFixed(1),+player.pos.z.toFixed(1)]:null;
            r.soldiers=(typeof soldiers!=='undefined')?soldiers.length:-1;
            r.flags=(typeof FLAGS!=='undefined')?FLAGS.length:-1;
            r.fps=(typeof fpsShow!=='undefined')?fpsShow:-1;
            r.hp=player.hp;
            return JSON.stringify(r);
          }catch(e){ return 'VIEW_ERR:'+e.message; }
        })()`, returnByValue: true
      });
      logs.push('view: ' + (view.result && view.result.value));
      await sleep(1500);

      // 自由飞行取景: 在若干战术点位俯视/平视 CQB 街区, 各截一张图
      const TOUR = [
        { n: 'base',    x: -78, z: -78, y: 8,  yaw: 0.78,  pitch: -0.22 },
        { n: 'alley',   x: -38, z: -38, y: 3,  yaw: 0.78,  pitch: -0.06 },
        { n: 'lane',    x: 0,   z: -38, y: 2.4, yaw: 0,    pitch: -0.03 },
        { n: 'center',  x: 0,   z: 0,   y: 26, yaw: 0.6,   pitch: -0.72 },
        { n: 'street',  x: 38,  z: 38,  y: 3,  yaw: -2.36, pitch: -0.04 },
        { n: 'over',    x: 0,   z: 0,   y: 62, yaw: 0.7,   pitch: -1.18 },
      ];
      const shots = [];
      for (const t of TOUR) {
        await rpc(ws, 'Runtime.evaluate', {
          expression: `(function(){
            try{
              player.pos.set(${t.x},(${t.y}),${t.z});
              player.vel.set(0,0,0);
              player.yaw=${t.yaw}; player.pitch=${t.pitch};
              camera.position.set(${t.x},${t.y},${t.z});
              if(typeof updateCamera==='function') updateCamera(0.016);
              camera.position.set(${t.x},${t.y},${t.z});
              camera.rotation.set(${t.pitch},${t.yaw},0,'YXZ');
              return 'ok';
            }catch(e){ return 'TOUR_ERR:'+e.message; }
          })()`, returnByValue: true
        });
        await sleep(1400);
        const s = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
        const fn = OUT.replace(/\.png$/, '_' + t.n + '.png');
        fs.writeFileSync(fn, Buffer.from(s.data, 'base64'));
        shots.push(fn + ' (' + (fs.statSync(fn).size / 1024).toFixed(0) + 'KB)');
      }
      logs.push('tour shots: ' + shots.join(', '));

      // ==== 室内/导航验证: 检查每栋 CQB 建筑是否有可站立室内地面, 以及是否存在楼梯 ====
      const interior = await rpc(ws, 'Runtime.evaluate', {
        expression: `(function(){
          try{
            const out={total:CQ_BUILDINGS.length, walkable:0, stairRamps:0, samples:[], sealIssues:[]};
            // 统计坡道(楼梯)数量
            for(const rr of (typeof RAMPS!=='undefined'?RAMPS:[])) out.stairRamps++;
            // 逐栋: 用 A* 从"该栋门前的街道点"寻路到"楼内中心", 验证可进入
            let reachIn=0, triedIn=0;
            const perB=[];
            for(let i=0;i<CQ_BUILDINGS.length;i+=Math.max(1,Math.floor(CQ_BUILDINGS.length/12))){
              const b=CQ_BUILDINGS[i]; triedIn++;
              // 楼外 6m 处(沿朝向的背面)取起点, 模拟从街道进入
              const cs=Math.cos(b.ry), sn=Math.sin(b.ry);
              const ox=b.x+sn*(b.d/2+6), oz=b.z+cs*(b.d/2+6);
              let ok=false, wp=0;
              try{ const p=NAV.findPath(ox,oz,b.x,b.z); if(p){ ok=true; wp=p.length; } }catch(e){}
              if(ok) reachIn++;
              perB.push({i,fl:+b.floors,ok,wp});
            }
            out.enterable={reachIn,triedIn,detail:perB.slice(0,6)};
            // 室内可站立点检测: 沿建筑内部网格扫描(避开墙体厚度)
            for(const b of CQ_BUILDINGS){
              const cs=Math.cos(b.ry), sn=Math.sin(b.ry);
              let free=0;
              for(let a=0;a<7;a++)for(let c=0;c<7;c++){
                const lx=-b.w/2+0.7+(b.w-1.4)*(a/6);
                const lz=-b.d/2+0.7+(b.d-1.4)*(c/6);
                const wx=b.x+lx*cs+lz*sn, wz=b.z-lx*sn+lz*cs;
                if(typeof occBlocked==='function' && !occBlocked(wx,wz)) free++;
              }
              if(free>=6) out.walkable++;
              if(out.samples.length<4) out.samples.push({i:0,fl:+b.floors,free});
            }
            // A* 连通性: 出生点→地图中心
            let pathOk=false, pathLen=0;
            try{ const p=NAV.findPath(BASES[0].x,BASES[0].z,0,0); if(p){ pathOk=true; pathLen=p.length; } }catch(e){ out.pathErr=String(e); }
            out.pathFromBaseToCenter=pathOk; out.pathWaypoints=pathLen;
            // ==== 连通性抽检: 出生点→多个街心/建筑门廊, 统计可达率 ====
            const probes=[];
            for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){
              const tx=i*38, tz=j*38;
              let ok=false;
              try{ const p=NAV.findPath(BASES[0].x,BASES[0].z,tx,tz); ok=!!p; }catch(e){}
              probes.push({tx,tz,ok});
            }
            out.streetGridReach = probes.filter(p=>p.ok).length + '/' + probes.length;
            out.streetGridFail = probes.filter(p=>!p.ok).map(p=>p.tx+','+p.tz);
            // 从地图中心出发的可达率(区分"基地孤立"还是"全图断裂")
            const probes2=[];
            for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){
              const tx=i*38, tz=j*38;
              let ok=false;
              try{ const p=NAV.findPath(0,0,tx,tz); ok=!!p; }catch(e){}
              probes2.push({tx,tz,ok});
            }
            out.centerReach = probes2.filter(p=>p.ok).length + '/' + probes2.length;
            out.centerFail = probes2.filter(p=>!p.ok).map(p=>p.tx+','+p.tz);
            // 基地附近 6 个方向的近距可达性(半径 12m)
            const nearBase=[];
            for(let k=0;k<8;k++){
              const a=k/8*Math.PI*2;
              const tx=BASES[0].x+Math.cos(a)*12, tz=BASES[0].z+Math.sin(a)*12;
              let ok=false;
              try{ const p=NAV.findPath(BASES[0].x,BASES[0].z,tx,tz); ok=!!p; }catch(e){}
              nearBase.push(ok?'1':'0');
            }
            out.nearBaseReach=nearBase.join('');
            // 基地是否被 OCC 完全包住: 检查 3m 环带
            let ringOpen=0;
            for(let k=0;k<24;k++){
              const a=k/24*Math.PI*2;
              const px=BASES[0].x+Math.cos(a)*3.5, pz=BASES[0].z+Math.sin(a)*3.5;
              if(!occBlocked(px,pz)) ringOpen++;
            }
            out.baseRingOpen=ringOpen+'/24';
            // 出生点是否被建筑压住(检查其占用格)
            out.baseBlocked = (typeof occBlocked==='function') ? [occBlocked(BASES[0].x,BASES[0].z), occBlocked(BASES[1].x,BASES[1].z)] : null;
            // 诊断: 找出压住出生点的碰撞体
            out.baseOverlap=[];
            for(let bi2=0;bi2<2;bi2++){
              const bx=BASES[bi2].x, bz=BASES[bi2].z;
              const hits=[];
              for(const bb of BOXES){
                if(bb.dead) continue;
                if(bx>=bb.minX-0.5&&bx<=bb.maxX+0.5&&bz>=bb.minZ-0.5&&bz<=bb.maxZ+0.5)
                  hits.push({w:+(bb.maxX-bb.minX).toFixed(1),h:+(bb.maxY-bb.minY).toFixed(1),d:+(bb.maxZ-bb.minZ).toFixed(1),y:+(bb.minY).toFixed(1),gh:+(bb.gh||0).toFixed(1)});
              }
              for(const cc of CYLS){
                if(Math.hypot(bx-cc.x,bz-cc.z)<cc.r+0.5) hits.push({cyl:cc.r});
              }
              out.baseOverlap.push({base:bi2,x:bx,z:bz,n:hits.length,hits:hits.slice(0,8)});
            }
            // 出生点周边 6m 内自由格比例
            out.baseFree=[];
            for(let bi2=0;bi2<2;bi2++){
              let fr=0,tot=0;
              for(let a2=0;a2<9;a2++)for(let c2=0;c2<9;c2++){
                const px=BASES[bi2].x-6+a2*1.5, pz=BASES[bi2].z-6+c2*1.5;
                tot++; if(!occBlocked(px,pz)) fr++;
              }
              out.baseFree.push(fr+'/'+tot);
            // 诊断: 基地到最近碰撞体的距离与屋顶/柱子类干扰
            out.nearest=[];
            for(let bi2=0;bi2<2;bi2++){
              const bx=BASES[bi2].x, bz=BASES[bi2].z;
              let best=1e9, info=null;
              for(const bb of BOXES){
                if(bb.dead) continue;
                const dx=Math.max(bb.minX-bx,0,bx-bb.maxX);
                const dz=Math.max(bb.minZ-bz,0,bz-bb.maxZ);
                const dd=Math.hypot(dx,dz);
                if(dd<best){ best=dd; info={w:+(bb.maxX-bb.minX).toFixed(2),h:+(bb.maxY-bb.minY).toFixed(2),d:+(bb.maxZ-bb.minZ).toFixed(2),y0:+(bb.minY).toFixed(2),y1:+(bb.maxY).toFixed(2),gh:+(bb.gh||0).toFixed(2),stair:!!bb.stair}; }
              }
              // OCC 网格分辨率下的具体格
              const oi=Math.round((bx+OCC.off)/OCC.res), oj=Math.round((bz+OCC.off)/OCC.res);
              out.nearest.push({base:bi2,dist:+best.toFixed(2),info, occIdx:[oi,oj], occVal:OCC.data?OCC.data[oj*OCC.N+oi]:-1, occRes:OCC.res});
            }
            // 基地 3m 邻域逐格显示
            try{
              const rows=[];
              for(let dz=-3;dz<=3;dz++){
                let row='';
                for(let dx=-3;dx<=3;dx++){
                  const px=BASES[0].x+dx, pz=BASES[0].z+dz;
                  row += occBlocked(px,pz)?'#':'.';
                }
                rows.push(row);
              }
              out.baseFine=rows;
            }catch(e){}
            // ==== OCC 网格可视诊断: 沿基地区域输出占用位图 ====
            try{
              let bmp=[];
              for(let z=BASES[0].z-14;z<=BASES[0].z+14;z+=2){
                let row='';
                for(let x=BASES[0].x-14;x<=BASES[0].x+14;x+=2) row += occBlocked(x,z)?'#':'.';
                bmp.push(row);
              }
              out.occMapBase=bmp;
              // 采样整图 1/8 分辨率的占用概览(看街道是否连通)
              let ov=[];
              for(let z=-96;z<=96;z+=8){
                let row='';
                for(let x=-96;x<=96;x+=8) row += occBlocked(x,z)?'#':'.';
                ov.push(row);
              }
              out.occOverview=ov;
            }catch(e){ out.occErr=String(e); }
            }
            // 地图越界判定: 出生点是否在街区网格上
            out.basePos=[BASES[0].x,BASES[0].z,BASES[1].x,BASES[1].z];
            // 两个出生点之间是否连通(核心平衡指标)
            try{ const p2=NAV.findPath(BASES[0].x,BASES[0].z,BASES[1].x,BASES[1].z); out.spawnToSpawn=p2?p2.length:0; }catch(e){ out.spawnErr=String(e); }
            // 楼梯坡道是否覆盖足够建筑(每栋至少 1 段)
            out.rampPerBuilding=+(out.stairRamps/CQ_BUILDINGS.length).toFixed(2);
            return JSON.stringify(out);
          }catch(e){ return 'INT_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
        })()`, returnByValue: true
      });
      logs.push('INTERIOR: ' + (interior.result && interior.result.value));

      // ==== 室内结构解析验证: 每栋楼每层的可站立格数 + 楼层间坡道连通 ====
      const struct = await rpc(ws, 'Runtime.evaluate', {
        expression: `(function(){
          try{
            const rep={buildings:0, floorsOk:0, floorsTotal:0, perBuilding:[], stairLinked:0, stairTotal:0};
            const tested=CQ_BUILDINGS.slice(0,20);
            // 高度感知的"可站立"判定: OCC 是纯2D栅格, 直接查会把一层墙体/楼板算进上层,
            // 因此这里改查 BOXES: 仅当某层人体高度带(y..y+1.7)内有实体才判为阻挡。
            const H=1.7;
            function standOK(x,z,y){
              for(const b of BOXES){
                if(b.dead) continue;
                if(x<b.minX-0.28||x>b.maxX+0.28||z<b.minZ-0.28||z>b.maxZ+0.28) continue;
                // 竖直方向必须与人形高度带相交
                if(b.maxY>y+0.25 && b.minY<y+H) return false;
              }
              return true;
            }
            for(const b of tested){
              rep.buildings++;
              const cs=Math.cos(b.ry), sn=Math.sin(b.ry);
              const fl=[];
              for(let f=0;f<b.floors;f++){
                // 层高必须取 b.fh (港区办公楼 3.2 / 仓库夹层 3.6 / 街区 3.05);
                // 硬编码 3.05 会让采样点落进楼板里, 把好楼层误判成 1% 可站立。
                const y=(b.g0||0)+0.05+f*(b.fh||3.05);
                let walk=0, tot=0;
                for(let lx=-b.w/2+0.6; lx<=b.w/2-0.6; lx+=1.0)
                for(let lz=-b.d/2+0.6; lz<=b.d/2-0.6; lz+=1.0){
                  const wx=b.x+lx*cs+lz*sn, wz=b.z-lx*sn+lz*cs;
                  tot++;
                  if(standOK(wx,wz,y)) walk++;
                }
                fl.push(Math.round(walk/Math.max(tot,1)*100));
              }
              rep.floorsTotal+=b.floors;
              const okFloors=fl.filter(p=>p>=18).length;
              rep.floorsOk+=okFloors;
              if(rep.perBuilding.length<8) rep.perBuilding.push({fl:b.floors, walkPct:fl});
            }
            // 楼梯坡道: 检查每栋楼附近是否有坡道覆盖其层高范围
            const g2=(typeof groundAtLadder!=='function'&&typeof rampsNear==='function')?'':'';
            let linked=0, tot2=0;
            for(const b of tested){
              const near=RAMPS.filter(r=>Math.hypot(r.x-b.x,r.z-b.z)<Math.max(b.w,b.d));
              tot2++;
              // 该栋多层 且 至少 1 段坡道 且 坡道高差 ≈ 层高
              const dh=near.length? Math.max(...near.map(r=>Math.abs(r.y1-r.y0))) : 0;
              if(b.floors>=2 && near.length>=1 && dh>2.0) linked++;
            }
            rep.stairLinked=linked; rep.stairTotal=tot2;
            return JSON.stringify(rep);
          }catch(e){ return 'STRUCT_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
        })()`, returnByValue: true
      });
      logs.push('STRUCT: ' + (struct.result && struct.result.value));
      try{
        const pick = await rpc(ws, 'Runtime.evaluate', {
          expression: `(function(){
            try{
              // 选一栋 3 层公寓(floors>=3)靠中心的
              let best=null;
              for(const b of CQ_BUILDINGS){ if(b.floors>=3 && !best) best=b; }
              if(!best) best=CQ_BUILDINGS[Math.floor(CQ_BUILDINGS.length/2)];
              window.__probeB={x:best.x,z:best.z,ry:best.ry,fl:best.floors,g0:best.g0,w:best.w,d:best.d};
              return JSON.stringify(window.__probeB);
            }catch(e){ return 'PICK_ERR:'+e.message; }
          })()`, returnByValue: true
        });
        logs.push('probe building: ' + (pick.result && pick.result.value));
        const B = JSON.parse(pick.result.value);
        // 冻结游戏循环: 覆盖 requestAnimationFrame 让 loop 不再接管相机
        await rpc(ws, 'Runtime.evaluate', {
          expression: `(function(){
            try{
              window.__raf=window.requestAnimationFrame;
              window.requestAnimationFrame=function(){ return 0; };
              return 'loop-frozen';
            }catch(e){ return 'ERR:'+e.message; }
          })()`, returnByValue: true
        });
        await sleep(600);
        for (let f = 0; f < B.fl; f++) {
          const y = B.g0 + 1.55 + f * 3.05;
          // 站在房间一角, 沿房间对角线看向对面墙(能同时看到内隔墙/窗/掩体)
          await rpc(ws, 'Runtime.evaluate', {
            expression: `(function(){
              const cs=Math.cos(${B.ry}), sn=Math.sin(${B.ry});
              // 局部坐标 (-w/4, -d/4) → 世界
              const lx=-${B.w}/4, lz=-${B.d}/4;
              const px=${B.x}+lx*cs+lz*sn, pz=${B.z}-lx*sn+lz*cs;
              camera.position.set(px,${y},pz);
              camera.rotation.order='YXZ';
              camera.rotation.set(-0.05, ${B.ry}+Math.PI*0.75, 0);
              camera.fov=80; camera.updateProjectionMatrix();
              camera.updateMatrixWorld(true);
              // 临时提亮, 便于检查室内结构
              const ob=hemi.intensity, ou=sun.intensity;
              hemi.intensity=Math.max(ob,1.2); sun.intensity=Math.max(ou,0.9);
              renderer.clear(); renderer.render(scene,camera);
              hemi.intensity=ob; sun.intensity=ou;
              return 'ok';
            })()`, returnByValue: true
          });
          await sleep(500);
          const s = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
          const fn = OUT.replace(/\.png$/, '_int_f' + f + '.png');
          fs.writeFileSync(fn, Buffer.from(s.data, 'base64'));
          logs.push('interior floor ' + f + ' shot: ' + fn + ' (' + (fs.statSync(fn).size / 1024).toFixed(0) + 'KB)');
        }
        // 恢复循环
        await rpc(ws, 'Runtime.evaluate', {
          expression: `(function(){ if(window.__raf) window.requestAnimationFrame=window.__raf; return 'loop-resumed'; })()`, returnByValue: true
        });
      }catch(e){ logs.push('interior shot err: ' + e.message); }
    }

    const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

    const errsNow = await rpc(ws, 'Runtime.evaluate', { expression: 'JSON.stringify(window.__errs||[])', returnByValue: true });

    console.log('=== PROBE ===');
    console.log(probeVal);
    console.log('=== WINDOW ERRORS ===');
    console.log(errsNow.result && errsNow.result.value);
    console.log('=== CONSOLE ERRORS (' + errors.length + ') ===');
    errors.slice(0, 40).forEach(e => console.log(e));
    console.log('=== LOGS (last 15) ===');
    logs.slice(-15).forEach(l => console.log(l));
    console.log('=== SCREENSHOT ===');
    console.log(OUT + ' (' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB)');
    process.exitCode = errors.length ? 1 : 0;
  } catch (e) {
    console.error('TEST FAILED: ' + e.message);
    if (chromeErr) console.error(chromeErr.slice(-2000));
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (e) { }
    try { chrome.kill(); } catch (e) { }
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  }
})();
