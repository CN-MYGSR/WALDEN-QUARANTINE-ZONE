// 导航诊断: 复刻 NAV 的 2m 通行网格, 从己方入口做 BFS, 并扫描大厅/走廊中心线的"阻断段"
// 目的: 定位是"哪一段"把地图切断了 (大厅十字 vs 某条走廊)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9396, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const __out = [];
const flush = () => { try { fs.writeFileSync(path.join(__dirname, 'lab_nav_scan.txt'), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); };
process.on('exit', flush);

const PROBE = `JSON.stringify((function(){
  const SP=2, N=Math.floor(MAP_SIZE/SP)+1, OFF=MAP_SIZE/2;
  const bl=(x,z)=>NAV.blocked2D(x,z);
  const cellOpen=(x,z)=>{ let f=0; if(!bl(x,z))f+=2; if(!bl(x-.6,z-.6))f++; if(!bl(x+.6,z-.6))f++; if(!bl(x-.6,z+.6))f++; if(!bl(x+.6,z+.6))f++; return f>=3; };
  const idx=(i,j)=>j*N+i;
  const open=new Uint8Array(N*N);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++) open[idx(i,j)]=cellOpen(i*SP-OFF,j*SP-OFF)?1:0;
  let openTotal=0; for(let k=0;k<open.length;k++) if(open[k]) openTotal++;
  const g2c=(x,z)=>[clamp(Math.round((x+OFF)/SP),0,N-1),clamp(Math.round((z+OFF)/SP),0,N-1)];
  // 找到离目标最近的通行格
  const nearOpen=(x,z)=>{ let [i,j]=g2c(x,z); if(open[idx(i,j)]) return [i,j];
    for(let r=1;r<20;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){ if(Math.max(Math.abs(di),Math.abs(dj))!==r) continue;
      const a=i+di,b=j+dj; if(a>=0&&b>=0&&a<N&&b<N&&open[idx(a,b)]) return [a,b]; } return [-1,-1]; };
  const b=CAMPAIGN.bases[0];
  const [si,sj]=nearOpen(b.x,b.z);
  const seen=new Uint8Array(N*N); const q=[idx(si,sj)]; seen[idx(si,sj)]=1; let head=0, comp=0;
  const DI=[1,-1,0,0,1,1,-1,-1], DJ=[0,0,1,-1,1,-1,1,-1];
  while(head<q.length){ const cur=q[head++]; comp++; const ci=cur%N, cj=(cur/N)|0;
    for(let d=0;d<8;d++){ const ni=ci+DI[d], nj=cj+DJ[d]; if(ni<0||nj<0||ni>=N||nj>=N) continue;
      const ni2=nj*N+ni; if(!open[ni2]||seen[ni2]) continue;
      if(d>=4&&(!open[idx(ci+DI[d],cj)]||!open[idx(ci,cj+DJ[d])])) continue;
      seen[ni2]=1; q.push(ni2); } }
  const inComp=(x,z)=>{ const [i,j]=nearOpen(x,z); return !!(i>=0&&seen[idx(i,j)]); };
  const ex=CAMPAIGN.extract[0], b1=CAMPAIGN.bases[1];
  // 扫描: 返回阻断段 (按 2m 采样, 连续阻断合并)
  const scan=(fn,from,to,step)=>{ const runs=[]; let run=null;
    for(let t=from;t<=to;t+=(step||2)){ const p=fn(t);
      if(bl(p[0],p[1])){ if(!run) run=[t,t]; else run[1]=t; } else if(run){ runs.push(run); run=null; } }
    if(run) runs.push(run); return runs; };
  const hallV=scan(t=>[0,t],-86,86);          // 竖向大厅 x=0
  const hallH=scan(t=>[t,0],-86,86);          // 横向大厅 z=0
  const LANES=[9+22.667+2.25,9+2*22.667+6.75];
  const corr=[];
  LANES.forEach(g=>{
    corr.push({lane:'x+'+g.toFixed(1),runs:scan(t=>[g,t],9,86)});
    corr.push({lane:'x-'+g.toFixed(1),runs:scan(t=>[-g,t],9,86)});
    corr.push({lane:'z+'+g.toFixed(1),runs:scan(t=>[t,g],9,86)});
    corr.push({lane:'z-'+g.toFixed(1),runs:scan(t=>[t,-g],9,86)});
  });
  return {openTotal,comp,baseInComp:comp>0,base1InComp:inComp(b1.x,b1.z),extractInComp:inComp(ex.x,ex.z),
    hallV_runs:hallV, hallH_runs:hallH, corr:corr.filter(c=>c.runs.length),
    boxes:BOXES.length, cyls:CYLS.length, navClears:NAV_CLEARS.length};
})())`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labscan_' + Date.now());
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
  const CIDX = process.argv[2] === undefined ? '1' : String(process.argv[2]);
  await ev(`localStorage.setItem('sf_campaign','${CIDX}');location.reload()`);
  await sleep(10000);
  for (let c = 0; c < 3; c++) { if (c > 0) { await ev(`location.reload()`); await sleep(10000); } console.log('--- cycle' + c + ' ---\n' + await ev(PROBE)); }
  console.log('errors:' + errs.length); errs.slice(0, 5).forEach(e => console.log('  ' + e));
  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
