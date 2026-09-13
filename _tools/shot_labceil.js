// 实验室天花板强验证: 密集向上射线 + 多机位仰视截图
// 用法: node _tools/shot_labceil.js
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9438, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labceil_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EVAL_EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async (name) => {
    const o = await rpc('Page.captureScreenshot', { format: 'png' });
    if (o.result && o.result.data) { fs.writeFileSync(path.join(ROOT, name), Buffer.from(o.result.data, 'base64')); console.log('截图', name); }
  };

  await rpc('Page.navigate', { url: URL });
  await sleep(4000);
  await ev(`localStorage.setItem('sf_campaign','1');`);
  await rpc('Page.navigate', { url: URL });
  await sleep(14000);

  // ---- A. 密集向上射线: 每 3m 一点, 从 y=1.6 打到 y=9 ----
  const r = await ev(`(function(){
    try{
      const out={};
      const root=(typeof world!=='undefined')?world:scene;
      const ray=new THREE.Raycaster(); ray.far=9;
      const org=new THREE.Vector3(), dirUp=new THREE.Vector3(0,1,0);
      const E=(typeof LAB_EDGE!=='undefined')?LAB_EDGE:86;
      let tot=0, miss=0, minTop=1e9, maxTop=-1e9;
      const missPts=[];
      for(let x=-E;x<=E;x+=3){
        for(let z=-E;z<=E;z+=3){
          tot++;
          org.set(x,1.6,z);
          ray.set(org,dirUp);
          const hits=ray.intersectObject(root,true).filter(h=>h.object.visible);
          if(!hits.length){ miss++; if(missPts.length<30) missPts.push([x,z]); }
          else { const t=hits[0].point.y; if(t<minTop) minTop=t; if(t>maxTop) maxTop=t; }
        }
      }
      out.gridTot=tot; out.gridMiss=miss; out.gridMissPct=+(miss/tot*100).toFixed(2);
      out.missPts=missPts;
      out.topMin=+minTop.toFixed(2); out.topMax=+maxTop.toFixed(2);
      // 只对"天花板层"做覆盖率检查 (排除管道等低矮物)
      const CEIL=(typeof LAB_H!=='undefined')?LAB_H+0.16:4.76;
      const slabs=[];
      root.traverse(o=>{
        if(!o.isMesh||!o.geometry||!o.geometry.parameters) return;
        const g=o.geometry.parameters;
        if(g.height==null||Math.abs(o.position.y-CEIL)>0.02) return;
        o.updateWorldMatrix(true,false);
        const bb=new THREE.Box3().setFromObject(o);
        slabs.push(bb);
      });
      out.slabCount=slabs.length;
      let ceilMiss=0; const ceilMissPts=[];
      for(let x=-E;x<=E;x+=3){
        for(let z=-E;z<=E;z+=3){
          const hit=slabs.some(bb=>x>=bb.min.x-0.01&&x<=bb.max.x+0.01&&z>=bb.min.z-0.01&&z<=bb.max.z+0.01);
          if(!hit){ ceilMiss++; if(ceilMissPts.length<30) ceilMissPts.push([x,z]); }
        }
      }
      out.ceilMiss=ceilMiss; out.ceilMissPts=ceilMissPts;
      return JSON.stringify(out);
    }catch(e){ return 'ERR:'+e.message+' | '+(e.stack||'').split('\\n')[1]; }
  })()`);
  console.log('=== 实验室天花板 ===');
  console.log(typeof r === 'string' && r[0] === '{' ? JSON.stringify(JSON.parse(r), null, 1) : r);

  // ---- B. 仰视截图 (自建相机, 绕开 updateCamera) ----
  await ev(`(function(){
    try{ el('menu').classList.add('hidden'); }catch(e){}
    document.querySelectorAll('#hud,.hud,.screen,#vig').forEach(function(e){ e.style.display='none'; });
    window.__raf=window.requestAnimationFrame; window.requestAnimationFrame=function(){ return 0; };
    return 1;
  })()`);
  await sleep(400);
  const VIEWS = [
    ['hall_up', 0, 1.62, 40, 1.05, 0],
    ['room_up', 40, 1.62, 40, 1.15, 0.6],
    ['corridor_up', 24.5, 1.62, 30, 1.25, 0],
    ['corridor2_up', -24.5, 1.62, -20, 1.35, 1.57],
    ['center_up', 0, 1.62, 0, 1.45, 0.8],
    ['extract_up', 0, 1.62, 74, 1.1, 0],
  ];
  for (const [nm, x, y, z, pitch, yaw] of VIEWS) {
    await ev(`(function(){
      if(!window.__c2) window.__c2=new THREE.PerspectiveCamera(78, innerWidth/innerHeight, 0.1, 400);
      const c=window.__c2;
      c.aspect=innerWidth/innerHeight; c.updateProjectionMatrix();
      c.position.set(${x},${y},${z}); c.rotation.set(${pitch},${yaw},0);
      renderer.clear(); renderer.render(scene,c);
      return 1;
    })()`);
    await sleep(350);
    await shot('outputs/labceil_' + nm + '.png');
  }
  await ev(`(function(){ window.requestAnimationFrame=window.__raf; return 1; })()`);
  console.log('异常数', errs.length, errs.slice(0, 4).join(' | '));
  ws.close(); proc.kill();
  await sleep(300);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
})();
