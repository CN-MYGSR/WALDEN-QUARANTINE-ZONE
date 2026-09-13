// 定位阻断物: 对给定坐标点, 列出所有"会挡住行走"的 BOXES/CYLS
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9397, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const __out = [];
const flush = () => { try { fs.writeFileSync(path.join(__dirname, 'lab_blocker.txt'), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); };
process.on('exit', flush);

const PROBE = `JSON.stringify((function(){
  function blockers(x,z){
    const out=[];
    for(const b of BOXES){ if(b.dead) continue; const gh=b.gh;
      if(b.maxY<gh+0.5||b.minY>gh+1.75) continue;
      if(x>=b.minX-0.6&&x<=b.maxX+0.6&&z>=b.minZ-0.6&&z<=b.maxZ+0.6)
        out.push('box c=('+((b.minX+b.maxX)/2).toFixed(1)+','+((b.minZ+b.maxZ)/2).toFixed(1)+') size=('+(b.maxX-b.minX).toFixed(2)+'x'+(b.maxZ-b.minZ).toFixed(2)+') y=['+b.minY.toFixed(1)+','+b.maxY.toFixed(1)+']'); }
    for(const c of CYLS){ if(c.r<0.28) continue; const rr=c.r+0.6;
      if((x-c.x)*(x-c.x)+(z-c.z)*(z-c.z)<=rr*rr) out.push('cyl c=('+c.x.toFixed(1)+','+c.z.toFixed(1)+') r='+c.r.toFixed(2)); }
    return out;
  }
  const pts=[[0,0],[0,-44],[0,-56],[0,-58],[-44,0],[-56,0],[-58,0],[-63,0],[0,44],[0,56],[0,60],[0,74],[0,80],[-72,0],[72,0]];
  const res={};
  for(const p of pts) res[p[0]+','+p[1]]=blockers(p[0],p[1]);
  const g0=heightAt(0,0);
  return {pts:res, groundY:+g0.toFixed(2), mapSize:MAP_SIZE, mapHalf:MAP_HALF, labEdge:typeof LAB_EDGE!=='undefined'?LAB_EDGE:null, hall:typeof LAB_HALL!=='undefined'?LAB_HALL:null, extZ:typeof LAB_EXT_Z!=='undefined'?LAB_EXT_Z:null};
})())`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labblk_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=800,600', '--disable-gpu', '--no-first-run', '--no-default-browser-check', URL], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 30; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || ''); return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  await sleep(9000);
  await ev(`localStorage.setItem('sf_campaign','1');location.reload()`);
  await sleep(10000);
  const raw = await ev(PROBE);
  try { const o = JSON.parse(raw); console.log('groundY=' + o.groundY + ' mapSize=' + o.mapSize + ' mapHalf=' + o.mapHalf + ' labEdge=' + o.labEdge + ' hall=' + o.hall + ' extZ=' + o.extZ);
    for (const k in o.pts) console.log('  (' + k + ') -> ' + (o.pts[k].length ? JSON.stringify(o.pts[k]) : 'free')); } catch (e) { console.log(raw); }
  console.log('errors:' + errs.length); errs.slice(0, 5).forEach(e => console.log('  ' + e));
  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
