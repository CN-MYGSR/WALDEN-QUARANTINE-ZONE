// 扫描菜单 / 设置 / 军械库 / 部署页里所有可见元素的**实际计算色**，
// 找出任何偏黄（hue 25~80）或深色文字（在深底上会看不清）的元素。
// 结论直接回答「菜单/设置页到底还有没有黑底黄字」。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9591;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
function finish(c) { try { if (ws) ws.close(); } catch (e) { } try { if (proc) proc.kill(); } catch (e) { } fs.writeFileSync(path.join(ROOT, '_tools', '_menu_color_scan.txt'), out.join('\n') + '\n', 'utf8'); process.exit(c); }
(async () => {
  const ud = path.join(require('os').tmpdir(), 'mcs_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1500,940', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };

  await rpc('Page.navigate', { url: URL });
  await sleep(15000);
  await ev(`(function(){ META.wallet=999999; const w=['m4','mp40','stg44','m1911','p320','kar98','awm','hk416','qbz95','deagle','pass','g17','g28','mp5']; for(const k of w) META.owned[k]=(META.owned[k]||0)+1; if(typeof metaSave==='function') metaSave(); return 1; })()`);

  // 扫描器：遍历指定根下所有可见元素，报告偏黄 / 深色文字
  const SCAN = (rootSel) => `(function(){
    const root=document.querySelector(${JSON.stringify(rootSel)}); if(!root) return 'NO_ROOT';
    function hsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;
      if(d>1e-6){if(mx===r)h=60*(((g-b)/d)%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);}
      if(h<0)h+=360;return [h,mx<1e-6?0:d/mx,mx];}
    function parse(s){const m=String(s).match(/rgba?\\(([0-9.,\\s]+)\\)/);if(!m)return null;
      const p=m[1].split(',').map(x=>parseFloat(x.trim()));return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
    const yellow=[], darkText=[];
    root.querySelectorAll('*').forEach(e=>{
      const r=e.getBoundingClientRect(); if(r.width<1||r.height<1) return;
      const cs=getComputedStyle(e);
      const fc=parse(cs.color);
      if(fc&&fc.a>0.1){ const [h,s,v]=hsv(fc.r,fc.g,fc.b);
        if(h>=25&&h<=80&&s>0.15&&v>0.25) yellow.push('TEXT '+cs.color+' '+(e.id?'#'+e.id:'.'+(e.className||e.tagName))+' «'+(e.textContent||'').trim().slice(0,26)+'»');
        if(v<0.28) darkText.push('DARKTXT '+cs.color+' '+(e.id?'#'+e.id:'.'+(e.className||e.tagName))+' «'+(e.textContent||'').trim().slice(0,26)+'»'); }
      const bc=parse(cs.backgroundColor);
      if(bc&&bc.a>0.1){ const [h,s,v]=hsv(bc.r,bc.g,bc.b);
        if(h>=25&&h<=80&&s>0.15&&v>0.25) yellow.push('BG   '+cs.backgroundColor+' '+(e.id?'#'+e.id:'.'+(e.className||e.tagName))); }
      const bs=parse(cs.borderTopColor);
      if(bs&&bs.a>0.1){ const [h,s,v]=hsv(bs.r,bs.g,bs.b);
        if(h>=25&&h<=80&&s>0.2&&v>0.3) yellow.push('BORDER '+cs.borderTopColor+' '+(e.id?'#'+e.id:'.'+(e.className||e.tagName))); }
    });
    const uY=[...new Set(yellow)], uD=[...new Set(darkText)];
    return JSON.stringify({yellow:uY.slice(0,25), darkText:uD.slice(0,25), nY:uY.length, nD:uD.length});
  })()`;

  const targets = [['#mHome', '主菜单'], ['#mSet', '游戏设置'], ['#mArmory', '军械库'], ['#mPlay', '撤离部署']];
  for (const [sel, name] of targets) {
    const navP = sel.replace('#', '');
    await ev(`(function(){ const b=[...document.querySelectorAll('.navBtn')].find(x=>x.dataset.p==='${navP}'); if(b) b.click(); else if(typeof showPanel==='function') showPanel('${navP}'); return 1; })()`);
    await sleep(1500);
    log('=== ' + name + ' (' + sel + ') ===');
    const raw = await ev(SCAN(sel));
    if (typeof raw === 'string' && raw[0] === '{') {
      const o = JSON.parse(raw);
      log('  偏黄元素 ' + o.nY + ' 个' + (o.nY ? '' : ' ✅'));
      o.yellow.forEach(x => log('    ' + x));
      log('  深色文字 ' + o.nD + ' 个' + (o.nD ? '' : ' ✅'));
      o.darkText.forEach(x => log('    ' + x));
    } else log('  ' + raw);
    log('');
  }

  log('=== 异常 ===');
  log(errs.length ? errs.join('\n') : '无');
  finish(0);
})();
