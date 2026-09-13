// 建筑战术结构探针: 逐栋检查 每层可站立率 / 封闭房间 / 楼梯越界 / 出入口数量
// 用法: node _tools/bld_probe.js <campaignIdx> [outTag]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9417, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
const TAG = process.argv[3] || ('c' + IDX);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const H=1.7;
 function cellIdx(x,z){ const {cell,N,off}=RGRID; return [clamp(Math.floor((x+off)/cell),0,N-1), clamp(Math.floor((z+off)/cell),0,N-1)]; }
 function stand(x,z,y){
   const {N,boxCells}=RGRID; const [ci,cj]=cellIdx(x,z);
   const list=boxCells[cj*N+ci];
   for(let k=0;k<list.length;k++){
     const b=BOXES[list[k]];
     if(b.dead||b.stair) continue;
     if(x<b.minX-0.3||x>b.maxX+0.3||z<b.minZ-0.3||z>b.maxZ+0.3) continue;
     if(b.maxY>y+0.3 && b.minY<y+H) return false;
   }
   return true;
 }
 function blockedAt(x,z,y){
   const {N,boxCells}=RGRID; const [ci,cj]=cellIdx(x,z);
   const list=boxCells[cj*N+ci];
   for(let k=0;k<list.length;k++){
     const b=BOXES[list[k]];
     if(b.dead) continue;
     if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ) continue;
     if(b.maxY>y+0.3 && b.minY<y+H) return b;
   }
   return null;
 }
 const out={map:(typeof CAMPAIGN!=='undefined'?CAMPAIGN.id:'?'), n:0, types:{}, bad:[]};
 const list=CQ_BUILDINGS;
 out.n=list.length;
 const MARGIN=3.0, STEP=0.42;
 for(const b of list){
   const cs=Math.cos(b.ry), sn=Math.sin(b.ry);
   const LW=Math.ceil((b.w+MARGIN*2)/STEP), LD=Math.ceil((b.d+MARGIN*2)/STEP);
   const x0=-(b.w/2+MARGIN), z0=-(b.d/2+MARGIN);
   const key=b.kind||((b.floors||2)+'F');
   const T=out.types[key]||(out.types[key]={n:0, floorPct:[], sealed:[], noExit:[], stairOut:0, doorGaps:[], minPct:100});
   T.n++;
   const perFloor=[];
   for(let f=0;f<b.floors;f++){
     const FHS=b.fh||3.05;
     const y=b.g0+0.06+f*FHS;
     const grid=new Uint8Array(LW*LD);
     for(let j=0;j<LD;j++)for(let i=0;i<LW;i++){
       const lx=x0+i*STEP, lz=z0+j*STEP;
       const wx=b.x+lx*cs+lz*sn, wz=b.z-lx*sn+lz*cs;
       grid[j*LW+i]= stand(wx,wz,y)?1:0;
     }
     // 只统计建筑轮廓内
     let inside=0, insideFree=0;
     for(let j=0;j<LD;j++)for(let i=0;i<LW;i++){
       const lx=x0+i*STEP, lz=z0+j*STEP;
       if(Math.abs(lx)>b.w/2-0.35||Math.abs(lz)>b.d/2-0.35) continue;
       inside++; if(grid[j*LW+i]) insideFree++;
     }
     const pct=Math.round(insideFree/Math.max(inside,1)*100);
     perFloor.push(pct);
     // 连通性: 从轮廓外的外部参考点洪水填充
     const seen=new Uint8Array(LW*LD);
     // 外部播种: 从网格整圈边界上的所有可走格起步(单点播种会被建筑前的道具挡住)
     const stack=[];
     const seed=(i,j)=>{ const c=j*LW+i; if(!seen[c]&&grid[c]){ seen[c]=1; stack.push(c); } };
     for(let i=0;i<LW;i++){ seed(i,0); seed(i,LD-1); }
     for(let j=0;j<LD;j++){ seed(0,j); seed(LW-1,j); }
     const si=Math.round((0-x0)/STEP), sj=Math.round((b.d/2+MARGIN-0.6-z0)/STEP);
     while(stack.length){
       const c=stack.pop(); const ci=c%LW, cj=(c-ci)/LW;
       for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
         const ni=ci+di, nj=cj+dj;
         if(ni<0||nj<0||ni>=LW||nj>=LD) continue;
         const nc=nj*LW+ni; if(seen[nc]||!grid[nc]) continue;
         seen[nc]=1; stack.push(nc);
       }
     }
     // 内部自由格中未被外部连通到 = 封闭房间
     let sealed=0;
     for(let j=0;j<LD;j++)for(let i=0;i<LW;i++){
       const lx=x0+i*STEP, lz=z0+j*STEP;
       if(Math.abs(lx)>b.w/2-0.35||Math.abs(lz)>b.d/2-0.35) continue;
       if(grid[j*LW+i]&&!seen[j*LW+i]) sealed++;
     }
     if(f===0){
       T.sealed.push(sealed);
       if(sealed>5){
         let bx0=1e9,bx1=-1e9,bz0=1e9,bz1=-1e9;
         for(let j=0;j<LD;j++)for(let i=0;i<LW;i++){
           const lx=x0+i*STEP, lz=z0+j*STEP;
           if(Math.abs(lx)>b.w/2-0.35||Math.abs(lz)>b.d/2-0.35) continue;
           if(grid[j*LW+i]&&!seen[j*LW+i]){ if(lx<bx0)bx0=lx; if(lx>bx1)bx1=lx; if(lz<bz0)bz0=lz; if(lz>bz1)bz1=lz; }
         }
         if(out.bad.length<25) out.bad.push({k:key,w:+b.w.toFixed(1),d:+b.d.toFixed(1),ry:+b.ry.toFixed(3),sealed,
           bbox:[+bx0.toFixed(1),+bx1.toFixed(1),+bz0.toFixed(1),+bz1.toFixed(1)],
           bbox2:[+x0.toFixed(2),+z0.toFixed(2)]});
       }
     }
   }
   T.floorPct.push(perFloor);
   T.minPct=Math.min(T.minPct, Math.min.apply(null,perFloor));
   // 一层出入口: 沿四周墙线取"是否有可通行缺口"(检测外圈阻挡)
   let gaps=0;
   const scanEdge=(ax,az,bx,bz)=>{
     const n=Math.max(2,Math.round(Math.hypot(bx-ax,bz-az)/0.35));
     let open=0;
     for(let k=0;k<=n;k++){
       const t=k/n, wx=ax+(bx-ax)*t, wz=az+(bz-az)*t;
       const bx2=blockedAt(wx,wz,b.g0+0.06);
       if(!bx2||bx2.maxY<b.g0+1.9) open++;
     }
     return open;
   };
   const E=0.0;
   const fw=b.w/2-E, fd=b.d/2-E;
   const corners=[[-fw,fd],[fw,fd],[fw,-fd],[-fw,-fd]].map(([lx,lz])=>[b.x+lx*cs+lz*sn, b.z-lx*sn+lz*cs]);
   for(let k=0;k<4;k++){
     const a=corners[k], c=corners[(k+1)%4];
     const open=scanEdge(a[0],a[1],c[0],c[1]);
     const n=Math.max(2,Math.round(Math.hypot(c[0]-a[0],c[1]-a[1])/0.35));
     const frac=open/(n+1);
     if(frac>0.06) gaps++;
   }
   T.doorGaps.push(gaps);
   if(gaps===0) T.noExit.push(1);
   // 楼梯: 是否越界 + 顶部落点是否真有楼板
   for(const r of RAMPS){
     if(Math.hypot(r.x-b.x,r.z-b.z)>Math.max(b.w,b.d)) continue;
     const lx0=(r.x-b.x)*cs-(r.z-b.z)*sn, lz0=(r.x-b.x)*sn+(r.z-b.z)*cs;
     const dlx=Math.sin(r.ry)*cs-Math.cos(r.ry)*sn, dlz=Math.sin(r.ry)*sn+Math.cos(r.ry)*cs;
     const e1=[lx0-dlx*r.len/2, lz0-dlz*r.len/2], e2=[lx0+dlx*r.len/2, lz0+dlz*r.len/2];
     const over=Math.max(Math.abs(e1[0]),Math.abs(e2[0]))-(b.w/2) > 0.35 || Math.max(Math.abs(e1[1]),Math.abs(e2[1]))-(b.d/2) > 0.35;
     if(over){ T.stairOut++; if(out.bad.length<40) out.bad.push({t:key,x:+b.x.toFixed(1),z:+b.z.toFixed(1),over:'stair'}); }
     const ext=0.40;
     const w2=b.x+(e2[0]+dlx*ext)*cs+(e2[1]+dlz*ext)*sn, z2=b.z-(e2[0]+dlx*ext)*sn+(e2[1]+dlz*ext)*cs;
     // 顶部落点: 只认"实体楼板"(跳过 stair 台阶与坡道本身, 否则是循环论证)
     let top=-1e9;
     { const {N,boxCells}=RGRID; const [ci,cj]=cellIdx(w2,z2);
       for(const bi of boxCells[cj*N+ci]){ const bb=BOXES[bi];
         if(bb.dead||bb.stair) continue;
         if(w2<bb.minX-0.05||w2>bb.maxX+0.05||z2<bb.minZ-0.05||z2>bb.maxZ+0.05) continue;
         if(bb.maxY<=r.y1+0.75 && bb.maxY>top) top=bb.maxY; } }
     const gap=+(top-r.y1).toFixed(2);
     T.stairTop=(T.stairTop||[]); T.stairTop.push(gap);
     if(gap < -0.6) T.stairDead=(T.stairDead||0)+1;
     break;
   }
 }
 // 汇总
 const sum={};
 for(const k in out.types){
   const T=out.types[k];
   sum[k]={n:T.n,
     floorPctAvg:T.floorPct.map(a=>Math.round(a.reduce((s,v)=>s+v,0)/Math.max(a.length,1))),
     sealedAvg:+(T.sealed.reduce((s,v)=>s+v,0)/Math.max(T.sealed.length,1)).toFixed(1),
     sealedBuildings:T.sealed.filter(v=>v>2).length,
     noExit:T.noExit.length,
     stairOut:T.stairOut,
     stairDead:T.stairDead||0,
     stairTopGapAvg:+( (T.stairTop||[]).reduce((s,v)=>s+v,0)/Math.max((T.stairTop||[]).length,1) ).toFixed(2),
     doorGapsAvg:+(T.doorGaps.reduce((s,v)=>s+v,0)/Math.max(T.doorGaps.length,1)).toFixed(2)};
 }
 return JSON.stringify({map:out.map,n:out.n,sum,types:sum,bad:out.bad.slice(0,20)});
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bp_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','${IDX}');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  const r = await ev(PROBE);
  console.log('=== ' + TAG + ' ===');
  console.log(r);
  if (errs.length) console.log('ERRS ' + errs.slice(0, 5).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
