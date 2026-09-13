// 建筑可行走性 ASCII 网格转储: 定位封闭房间/楼梯口/井道洞的具体位置
// 用法: node _tools/bld_grid.js <campaignIdx> <kind> [buildingIndex]
//   kind: shed / warehouse / office / apartment / rowhouse / shopfront
// 输出: 每层一张网格图 + 该层阻挡体清单(局部坐标/高度区间)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9419, URL = 'http://127.0.0.1:8123/index.html';
const IDX = parseInt(process.argv[2] || '0', 10);
const KIND = process.argv[3] || 'shed';
const BIDX = parseInt(process.argv[4] || '0', 10);
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(function(){
try{
 const H=1.7;
 const cs0=0;
 function cellIdx(x,z){ const {cell,N,off}=RGRID; return [clamp(Math.floor((x+off)/cell),0,N-1), clamp(Math.floor((z+off)/cell),0,N-1)]; }
 function hit(x,z,y){
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
 const list=CQ_BUILDINGS.filter(b=>b.kind==='${KIND}');
 if(!list.length) return 'NO_BUILDING kind=${KIND} have='+CQ_BUILDINGS.map(b=>b.kind).join(',');
 const b=list[Math.min(${BIDX},list.length-1)];
 const cs=Math.cos(b.ry), sn=Math.sin(b.ry);
 const MARGIN=1.2, STEP=0.5;
 const LW=Math.ceil((b.w+MARGIN*2)/STEP), LD=Math.ceil((b.d+MARGIN*2)/STEP);
 const x0=-(b.w/2+MARGIN), z0=-(b.d/2+MARGIN);
 const lines=[];
 lines.push('BUILDING kind='+b.kind+' x='+b.x.toFixed(1)+' z='+b.z.toFixed(1)+' ry='+b.ry.toFixed(3)+' w='+b.w+' d='+b.d+' floors='+b.floors+' fh='+b.fh+' g0='+b.g0.toFixed(2));
 lines.push('shaft='+JSON.stringify(b.shaft));
 const FHS=b.fh||3.05;
 for(let f=0;f<b.floors;f++){
   const y=b.g0+0.06+f*FHS;
   const rows=[];
   for(let j=LD-1;j>=0;j--){
     let s='';
     for(let i=0;i<LW;i++){
       const lx=x0+i*STEP, lz=z0+j*STEP;
       const wx=b.x+lx*cs+lz*sn, wz=b.z-lx*sn+lz*cs;
       const h=hit(wx,wz,y);
       const inside=(Math.abs(lx)<=b.w/2&&Math.abs(lz)<=b.d/2);
       if(!h) s+= inside?'.':' ';
       else s+= h.stair? 's' : '#';
     }
     rows.push((z0+j*STEP).toFixed(1).padStart(6)+' |'+s+'|');
   }
   lines.push('--- FLOOR '+f+' (y=+'+ (0.06+f*FHS).toFixed(2) +') ---  . 可站立  # 阻挡  s 台阶  (空格=轮廓外)');
   lines.push('       '+Array.from({length:LW},(_,i)=>(((x0+i*STEP)|0)%10+10)%10).join(''));
   lines.push.apply(lines, rows);
   // 该层阻挡体(局部坐标)
   const seen=new Set(); const bx=[];
   for(let j=0;j<LD;j++)for(let i=0;i<LW;i++){
     const lx=x0+i*STEP, lz=z0+j*STEP;
     const wx=b.x+lx*cs+lz*sn, wz=b.z-lx*sn+lz*cs;
     const h=hit(wx,wz,y); if(!h) continue;
     const {N,boxCells}=RGRID; const [ci,cj]=cellIdx(wx,wz);
     for(const bi of boxCells[cj*N+ci]){ const bb=BOXES[bi]; if(bb.dead) continue;
       if(wx<bb.minX||wx>bb.maxX||wz<bb.minZ||wz>bb.maxZ) continue;
       if(!(bb.maxY>y+0.3&&bb.minY<y+H)) continue;
       const k=bi; if(seen.has(k)) continue; seen.add(k);
       // 盒子中心 → 局部
       const cx=(bb.minX+bb.maxX)/2, cz=(bb.minZ+bb.maxZ)/2;
       const lx2=(cx-b.x)*cs-(cz-b.z)*sn, lz2=(cx-b.x)*sn+(cz-b.z)*cs;
       bx.push({bi,lx:+lx2.toFixed(2),lz:+lz2.toFixed(2),w:+(bb.maxX-bb.minX).toFixed(2),d:+(bb.maxZ-bb.minZ).toFixed(2),
                y0:+(bb.minY-b.g0).toFixed(2),y1:+(bb.maxY-b.g0).toFixed(2),stair:!!bb.stair});
     }
   }
   bx.sort((p,q)=>p.y0-q.y0||p.lx-q.lx);
   lines.push('  blockers: '+JSON.stringify(bx.slice(0,60)));
 }
 return lines.join('\\n');
}catch(e){ return 'PROBE_ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
})()`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bg_' + Date.now());
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
  console.log('=== grid ' + KIND + ' #' + BIDX + ' @camp' + IDX + ' ===');
  console.log(r);
  // 定点截图: 从建筑斜上方看, 便于人工核对楼板/楼梯/围栏
  try {
    // 先冻结主循环, 否则相机会被玩家视角每帧覆盖 (已排队的那一帧仍会跑, 故需等一拍)
    await ev(`(function(){ if(!window.__raf){ window.__raf=window.requestAnimationFrame; window.requestAnimationFrame=function(){return 0;}; } return 1; })()`);
    await sleep(400);
    await ev(`(function(){
      const b=CQ_BUILDINGS.filter(b=>b.kind==='${KIND}')[${BIDX}]||CQ_BUILDINGS[0];
      document.querySelectorAll('#menu,#hud,#crosshair,#minimap').forEach(e=>{if(e)e.style.display='none';});
      if(window.__fog===undefined&&scene.fog){window.__fog=scene.fog;}
      scene.fog=null; camera.far=4000; camera.updateProjectionMatrix();
      // 临时补光: 港口/街区主题本身很暗, 不补光看不出楼板与楼梯
      if(!window.__dbgL){
        window.__dbgL=new THREE.DirectionalLight(0xffffff,1.35); window.__dbgL.position.set(1,2,0.6); scene.add(window.__dbgL);
        scene.add(new THREE.AmbientLight(0xffffff,0.75));
      }
      const d=Math.max(b.w,b.d)*1.5+10;
      camera.position.set(b.x+d*0.62, b.g0+d*0.72, b.z+d*0.62);
      camera.lookAt(b.x, b.g0+2.2, b.z);
      renderer.render(scene,camera);
      return 'ok';
    })()`);
    await sleep(500);
    const shot = await rpc('Page.captureScreenshot', { format: 'png' });
    const out = path.join(__dirname, 'bld_' + KIND + '_' + BIDX + '.png');
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    console.log('SHOT ' + out);
    // 第二张: 室内视角 (一层人眼高度看向对角落) —— 屋面会挡住俯视, 必须进楼里看
    await ev(`(function(){
      const b=CQ_BUILDINGS.filter(b=>b.kind==='${KIND}')[${BIDX}]||CQ_BUILDINGS[0];
      const cs=Math.cos(b.ry), sn=Math.sin(b.ry);
      const P=(lx,lz)=>[b.x+lx*cs+lz*sn, b.z-lx*sn+lz*cs];
      const a=P(b.w*0.30,b.d*0.30), c=P(-b.w*0.34,-b.d*0.34);
      camera.position.set(a[0], b.g0+1.75, a[1]);
      camera.lookAt(c[0], b.g0+(b.fh||3.05)*1.15, c[1]);
      renderer.render(scene,camera); return 'ok';
    })()`);
    await sleep(400);
    const shot2 = await rpc('Page.captureScreenshot', { format: 'png' });
    const out2 = path.join(__dirname, 'bld_' + KIND + '_' + BIDX + '_in.png');
    fs.writeFileSync(out2, Buffer.from(shot2.result.data, 'base64'));
    console.log('SHOT ' + out2);
  } catch (e) { console.log('shot skipped: ' + e.message); }
  if (errs.length) console.log('ERRS ' + errs.slice(0, 5).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
