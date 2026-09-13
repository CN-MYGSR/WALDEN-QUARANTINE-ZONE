// 导航地图可视化: 把 NAV 的 2m 通行网格按 4m 降采样打印成 ASCII
// '#'=占用  '.'=通行且从己方入口可达  'o'=通行但不可达  'B'=基地0 '1'=基地1 'E'=撤离点
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9398, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const __out = [];
const flush = () => { try { fs.writeFileSync(path.join(__dirname, 'lab_nav_map.txt'), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); };
process.on('exit', flush);

const PROBE = `JSON.stringify((function(){
  const SP=2, N=Math.floor(MAP_SIZE/SP)+1, OFF=MAP_SIZE/2;
  const bl=(x,z)=>NAV.blocked2D(x,z);
  const cellOpen=(x,z)=>{ let f=0; if(!bl(x,z))f+=2; if(!bl(x-.6,z-.6))f++; if(!bl(x+.6,z-.6))f++; if(!bl(x-.6,z+.6))f++; if(!bl(x+.6,z+.6))f++; return f>=3; };
  const idx=(i,j)=>j*N+i;
  const open=new Uint8Array(N*N);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++) open[idx(i,j)]=cellOpen(i*SP-OFF,j*SP-OFF)?1:0;
  const g2c=(x,z)=>[clamp(Math.round((x+OFF)/SP),0,N-1),clamp(Math.round((z+OFF)/SP),0,N-1)];
  const nearOpen=(x,z)=>{ let [i,j]=g2c(x,z); if(open[idx(i,j)]) return [i,j];
    for(let r=1;r<25;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){ if(Math.max(Math.abs(di),Math.abs(dj))!==r) continue;
      const a=i+di,b=j+dj; if(a>=0&&b>=0&&a<N&&b<N&&open[idx(a,b)]) return [a,b]; } return [-1,-1]; };
  const b=CAMPAIGN.bases[0];
  const [si,sj]=nearOpen(b.x,b.z);
  const seen=new Uint8Array(N*N); let head=0; const q=new Int32Array(N*N); let qn=0;
  if(si>=0){ q[qn++]=idx(si,sj); seen[idx(si,sj)]=1; }
  const DI=[1,-1,0,0,1,1,-1,-1], DJ=[0,0,1,-1,1,-1,1,-1];
  let comp=0;
  while(head<qn){ const cur=q[head++]; comp++; const ci=cur%N, cj=(cur/N)|0;
    for(let d=0;d<8;d++){ const ni=ci+DI[d], nj=cj+DJ[d]; if(ni<0||nj<0||ni>=N||nj>=N) continue;
      const ni2=nj*N+ni; if(!open[ni2]||seen[ni2]) continue;
      if(d>=4){ const a=ci+DI[d], bb=cj+DJ[d]; if(a<0||bb<0||a>=N||bb>=N) continue; if(!open[idx(a,cj)]||!open[idx(ci,bb)]) continue; }
      seen[ni2]=1; q[qn++]=ni2; } }
  // 4m 降采样
  const STEP=4, rows=[];
  const mark={};
  mark[(b.x)+','+(b.z)]='B'; mark[(CAMPAIGN.bases[1].x)+','+(CAMPAIGN.bases[1].z)]='1';
  const ex=CAMPAIGN.extract[0]; mark[ex.x+','+ex.z]='E';
  for(let z=-88;z<=88;z+=STEP){
    let line='';
    for(let x=-88;x<=88;x+=STEP){
      const [i,j]=g2c(x,z); const k=idx(i,j); let ch;
      if(!open[k]) ch='#';
      else ch=seen[k]?'.':'o';
      for(const mk in mark){ const p=mk.split(','); if(Math.abs(+p[0]-x)<2.5&&Math.abs(+p[1]-z)<2.5){ ch=mark[mk]; } }
      line+=ch;
    }
    rows.push(line);
  }
  // 闸口检测: 统计"紧贴可达区、但自身被挡"的格子 —— 这些就是把地图切断的闸口
  const blockersAt=(x,z)=>{ const out=[];
    for(const bx of BOXES){ if(bx.dead) continue; const gh=bx.gh;
      if(bx.maxY<gh+0.5||bx.minY>gh+1.75) continue;
      if(x>=bx.minX-0.6&&x<=bx.maxX+0.6&&z>=bx.minZ-0.6&&z<=bx.maxZ+0.6)
        out.push('box('+((bx.minX+bx.maxX)/2).toFixed(1)+','+((bx.minZ+bx.maxZ)/2).toFixed(1)+'|'+(bx.maxX-bx.minX).toFixed(2)+'x'+(bx.maxZ-bx.minZ).toFixed(2)+')'); }
    for(const c of CYLS){ if(c.r<0.28) continue; const rr=c.r+0.6;
      if((x-c.x)*(x-c.x)+(z-c.z)*(z-c.z)<=rr*rr) out.push('cyl('+c.x.toFixed(1)+','+c.z.toFixed(1)+' r'+c.r.toFixed(2)+')'); }
    return out; };
  const gates=[];
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    if(open[idx(i,j)]) continue;
    let adj=0;
    for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const a=i+d[0],b=j+d[1];
      if(a<0||b<0||a>=N||b>=N) continue; const k=idx(a,b); if(seen[k]&&open[k]) adj++; }
    if(adj>=2){ const x=i*SP-OFF, z=j*SP-OFF; gates.push('('+x+','+z+')adj'+adj+' <- '+blockersAt(x,z).join(' ')); }
  }
  let openTotal=0; for(let k=0;k<open.length;k++) if(open[k]) openTotal++;
  return {comp,openTotal,rows,gates:gates.slice(0,25),gateN:gates.length,
    extractCellBlk:blockersAt(ex.x,ex.z), extractInComp:!!seen[idx(...g2c(ex.x,ex.z))], inComp_base1:!!seen[idx(...g2c(CAMPAIGN.bases[1].x,CAMPAIGN.bases[1].z))]};
})())`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labmap_' + Date.now());
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
  const raw = await ev(PROBE);
  try { const o = JSON.parse(raw);
    console.log('comp=' + o.comp + ' openTotal=' + o.openTotal + ' extractInComp=' + o.extractInComp + ' base1InComp=' + o.inComp_base1 + ' gateN=' + o.gateN);
    console.log('extractCellBlockers=' + JSON.stringify(o.extractCellBlk));
    console.log('--- 闸口 (把可达区封死的格子) ---');
    (o.gates || []).forEach(g => console.log('  ' + g));
    console.log('--- nav map (x: -88 -> +88 step 4) ---');
    o.rows.forEach((r, k) => console.log(String(-88 + k * 4).padStart(4) + ' ' + r));
  } catch (e) { console.log(raw); }
  console.log('errors:' + errs.length); errs.slice(0, 5).forEach(e => console.log('  ' + e));
  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
