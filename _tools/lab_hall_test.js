// 大厅贯通性测试: 从基地出发, 沿各 z 带向东/西能走到多远 (findPath 末点落在目标 4m 内算走到)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9399, URL = 'http://127.0.0.1:8123/index.html';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const __out = [];
const flush = () => { try { fs.writeFileSync(path.join(__dirname, 'lab_hall_test.txt'), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); };
process.on('exit', flush);

const PROBE = `JSON.stringify((function(){
  const reached=(sx,sz,tx,tz)=>{ const p=NAV.findPath(sx,sz,tx,tz); if(!p||!p.length) return false;
    const L=p[p.length-1]; return Math.hypot(L[0]-tx,L[1]-tz)<5; };
  const b=CAMPAIGN.bases[0], b1=CAMPAIGN.bases[1];
  const rowInfo={};
  for(const z of [-8,-6,-4,-2,0,2,4,6,8]){
    let eastFarthest=null, westFarthest=null;
    for(let x=-70;x<=30;x+=2) if(reached(b.x,b.z,x,z)) eastFarthest=x;
    for(let x=-74;x>=-84;x-=2) if(reached(b.x,b.z,x,z)) westFarthest=x;
    rowInfo['z'+z]={eastFarthest,westFarthest};
  }
  const colInfo={};
  for(const x of [-8,-6,-4,-2,0,2,4,6,8]){
    let northFarthest=null, southFarthest=null;
    for(let z=-2;z<=84;z+=2) if(reached(b.x,b.z,x,z)) northFarthest=z;
    for(let z=-2;z>=-84;z-=2) if(reached(b.x,b.z,x,z)) southFarthest=z;
    colInfo['x'+x]={northFarthest,southFarthest};
  }
  // 细步长: 沿 z=0 与 z=-2, 每 1m 找断点
  const fine=[]; for(let x=-72;x<=-40;x+=1) fine.push(x+':'+(reached(b.x,b.z,x,0)?1:0));
  const fine2=[]; for(let x=-72;x<=-40;x+=1) fine2.push(x+':'+(reached(b.x,b.z,x,-2)?1:0));
  // 关键: 直接问"能不能从西基地走到东基地 / 撤离点"
  return {rowInfo,colInfo,fineZ0:fine.join(' '),fineZ2:fine2.join(' '),
    b0_to_b1:reached(b.x,b.z,b1.x,b1.z), b0_to_extract:reached(b.x,b.z,CAMPAIGN.extract[0].x,CAMPAIGN.extract[0].z),
    b1_to_extract:reached(b1.x,b1.z,CAMPAIGN.extract[0].x,CAMPAIGN.extract[0].z),
    b0_to_center:reached(b.x,b.z,0,0), center_to_extract:reached(0,0,CAMPAIGN.extract[0].x,CAMPAIGN.extract[0].z)};
})())`;

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labhall_' + Date.now());
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
  try { const o = JSON.parse(raw);
    console.log('b0->b1=' + o.b0_to_b1 + '  b0->extract=' + o.b0_to_extract + '  b1->extract=' + o.b1_to_extract);
    console.log('b0->center=' + o.b0_to_center + '  center->extract=' + o.center_to_extract);
    console.log('--- 沿 x 的可达最远点 (从西基地向东/西) ---');
    for (const k in o.rowInfo) console.log('  ' + k + ' east=' + o.rowInfo[k].eastFarthest + ' west=' + o.rowInfo[k].westFarthest);
    console.log('--- 沿 z 的可达最远点 ---');
    for (const k in o.colInfo) console.log('  ' + k + ' north=' + o.colInfo[k].northFarthest + ' south=' + o.colInfo[k].southFarthest);
    console.log('z=0 细扫 (x:-72..-40, 1=走到): ' + o.fineZ0);
    console.log('z=-2 细扫: ' + o.fineZ2);
  } catch (e) { console.log(raw); }
  console.log('errors:' + errs.length); errs.slice(0, 5).forEach(e => console.log('  ' + e));
  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
