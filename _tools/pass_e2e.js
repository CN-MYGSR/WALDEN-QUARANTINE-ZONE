// 验证「撤离通行证」新语义:
//  1) 无通行证也能在撤离点撤离(不再被拦), 走普通结算, 无重生按钮
//  2) 持证人撤离 = 离开瓦尔登禁区, 解锁结局: 标题含"结局" + 出现重生按钮 + 通行证被消耗
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9398;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'pse_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1366,768', '--force-device-scale-factor=1', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : null; };

  const boot = async () => {
    await sleep(9000);
    await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
    await sleep(2500);
    await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
    await sleep(3500);
  };
  const fails = [];

  await boot();

  // ---------- 1. 无通行证: 撤离点不再拦截 ----------
  const noPass0 = await ev(`(function(){
    delete META.owned['${'pass'}'];
    if(META.owned.pass) delete META.owned.pass;
    saveMeta();
    return JSON.stringify({hasPass: hasPass(), blocked: extractionBlockedMsg(), notice: extractionPassNotice()});
  })()`);
  let np; try { np = JSON.parse(noPass0); } catch (e) { console.log('ERR ' + noPass0); }
  console.log('【无通行证】hasPass=' + np.hasPass + ' | 阻断消息="' + np.blocked + '" | HUD提示="' + np.notice + '"');
  if (np.blocked !== '') fails.push('无通行证时 extractionBlockedMsg 应返回空串(不阻断)，实际: ' + np.blocked);

  const zoneTest = await ev(`(function(){
    const ex=EXTRACT_POINTS[0]; if(!ex) return JSON.stringify({err:'no extract point'});
    player.pos.x=ex.x; player.pos.z=ex.z; ex.progress=0;
    return JSON.stringify({moved:true, r:ex.r, hold:ex.holdTime||6});
  })()`);
  await sleep(2000);
  const prog = await ev(`JSON.stringify({progress:+(EXTRACT_POINTS[0].progress||0).toFixed(2), extracting:!!RUN.extracting, hudHidden:document.getElementById('extractHud').classList.contains('hidden'), txt:(document.getElementById('extractTxt')||{}).textContent})`);
  let pg; try { pg = JSON.parse(prog); } catch (e) { pg = {}; }
  console.log('  站进撤离区 2 秒后: 读条=' + pg.progress + 's | HUD文本="' + pg.txt + '"');
  if (!(pg.progress > 0.5)) fails.push('无通行证时撤离读条未推进 (progress=' + pg.progress + ')，说明仍在被拦截');
  if (pg.txt && !/普通撤离/.test(pg.txt)) fails.push('HUD 未提示"普通撤离"，实际: ' + pg.txt);

  // ---------- 2. 无通行证撤离 → 普通结算 ----------
  const plain = await ev(`(function(){
    finishRaid(true);
    return JSON.stringify({
      title:(document.getElementById('endTitle')||{}).textContent,
      hasRebirth: !!document.getElementById('rebirthBtn'),
      stats:(document.getElementById('endStats')||{}).innerHTML||'',
      hadPass: RUN.hadPass
    });
  })()`);
  let pl; try { pl = JSON.parse(plain); } catch (e) { console.log('ERR ' + plain); }
  console.log('  普通撤离结算: 标题="' + pl.title + '" | 重生按钮=' + pl.hasRebirth + ' | hadPass=' + pl.hadPass);
  if (/结局/.test((pl.title||'').replace(/\s/g,''))) fails.push('无通行证却显示结局标题: ' + pl.title);
  if (!/普通撤离/.test(pl.stats)) fails.push('结算缺少"普通撤离"说明');
  if (pl.hasRebirth) fails.push('无通行证不应出现重生按钮');

  // ---------- 3. 重开一局, 持证人撤离 → 解锁结局 ----------
  await rpc('Page.reload', {});
  await boot();
  const withPass = await ev(`(function(){
    META.owned['pass']=2; saveMeta();
    const before=ownedCount('pass');
    finishRaid(true);
    return JSON.stringify({
      before:before, after:ownedCount('pass'),
      title:(document.getElementById('endTitle')||{}).textContent,
      hasRebirth: !!document.getElementById('rebirthBtn'),
      stats:(document.getElementById('endStats')||{}).innerHTML||'',
      hadPass: RUN.hadPass,
      rebirthTxt:(document.getElementById('rebirthInfo')||{}).textContent||''
    });
  })()`);
  let wp; try { wp = JSON.parse(withPass); } catch (e) { console.log('ERR ' + withPass); }
  console.log('');
  console.log('【持通行证】通行证 ' + wp.before + ' → ' + wp.after + ' | 标题="' + wp.title + '" | 重生按钮=' + wp.hasRebirth + ' | hadPass=' + wp.hadPass);
  if (wp.after !== wp.before - 1) fails.push('撤离应消耗 1 张通行证 (' + wp.before + '→' + wp.after + ')');
  if (!/结局/.test((wp.title||'').replace(/\s/g,''))) fails.push('持证人撤离应显示结局标题，实际: ' + wp.title);
  if (!wp.hasRebirth) fails.push('持证人撤离应出现重生按钮');
  if (!/离开瓦尔登|禁区/.test((wp.stats||'').replace(/\s/g,''))) fails.push('结局结算缺少"离开瓦尔登禁区"说明');

  console.log('');
  if (!fails.length) console.log('✅ 通行证语义改造 —— 全部断言通过');
  else { console.log('❌ 失败:'); fails.forEach(f => console.log('   - ' + f)); }

  ws.close(); proc.kill(); await sleep(300); process.exit(fails.length ? 1 : 0);
})();
