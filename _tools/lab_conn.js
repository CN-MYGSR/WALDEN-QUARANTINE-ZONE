// 连通性探针: 秘密实验室按 8m 网格采样, 检查从己方入口是否真能走到每个点
// "真能走到" = findPath 返回的最后一个路点落在目标 6m 内 (findPath 只在找到时补精确终点)
// 每次 location.reload() 都会用新的 Math.random 重新生成房间/道具 → 多跑几轮看方差
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9395, URL = 'http://127.0.0.1:8123/index.html';
// argv[2] = 战役序号 (0=街区 对照, 1=秘密实验室)
const CIDX = (process.argv[2] === undefined ? '1' : String(process.argv[2]));
const REPORT = 'lab_conn_report_' + CIDX + '.txt';
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const __out = [];
const flush = () => { try { fs.writeFileSync(path.join(__dirname, REPORT), __out.join('\n') + '\n', 'utf8'); } catch (e) { } };
console.log = (...a) => { __out.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); flush(); };
process.on('exit', flush);
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'labconn_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=800,600', '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
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
  await ev(`localStorage.setItem('sf_campaign','` + CIDX + `');location.reload()`);
  await sleep(10000);

  const probe = `JSON.stringify((function(){
    const b=CAMPAIGN.bases[0];
    let ok=0,bad=0,partial=0,badPts=[];
    for(let x=-80;x<=80;x+=8)for(let z=-80;z<=80;z+=8){
      if(Math.abs(x)<9||Math.abs(z)<9) continue;      // 房间/走廊区 (跳过中央大厅)
      const p=NAV.findPath(b.x,b.z,x,z);
      if(p&&p.length){ const L=p[p.length-1]; const d=Math.hypot(L[0]-x,L[1]-z);
        if(d<6) ok++; else { partial++; badPts.push('('+x+','+z+')dist'+Math.round(d)); } }
      else { bad++; badPts.push('('+x+','+z+')null'); }
    }
    // 关键通道
    const plen=p=>{ if(!p||!p.length) return -1; const L=p[p.length-1]; let s=0; for(let i=1;i<p.length;i++) s+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]); return Math.round(s); };
    const ex=CAMPAIGN.extract[0], b1=CAMPAIGN.bases[1];
    const bb=NAV.findPath(b.x,b.z,b1.x,b1.z), be=NAV.findPath(b.x,b.z,ex.x,ex.z);
    const reached=(p,tx,tz)=>!!(p&&p.length&&Math.hypot(p[p.length-1][0]-tx,p[p.length-1][1]-tz)<6);
    let crateOK=0; for(const c of LOOT_CRATES){ const p=NAV.findPath(b.x,b.z,c.x,c.z); if(reached(p,c.x,c.z)) crateOK++; }
    return {ok,bad,partial,total:ok+bad+partial, badPts:badPts.slice(0,14),
      baseToBase:plen(bb), baseToBaseReached:reached(bb,b1.x,b1.z),
      baseToExtract:plen(be), baseToExtractReached:reached(be,ex.x,ex.z),
      crates:LOOT_CRATES.length, crateReached:crateOK, boxes:BOXES.length, cyls:CYLS.length};
  })())`;

  for (let cycle = 0; cycle < 5; cycle++) {
    if (cycle > 0) { await ev(`location.reload()`); await sleep(10000); }
    console.log('cycle' + cycle + ' ' + await ev(probe));
  }
  console.log('errors:' + errs.length); errs.slice(0, 6).forEach(e => console.log('  ' + e));
  ws.close(); try { proc.kill(); } catch (e) { }
  await sleep(300); process.exit(0);
})();
