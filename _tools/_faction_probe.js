// 阵营「可切换」验收: 我方 USEC / PMC 可选, 敌方按地图(街区德军, 实验室·港口 PMC)
// 覆盖: FACTION_PICK · TEAM_FACTION · 阵营按钮文案与可点性 · #foeHint · 撞阵营自动换边 ·
//       玩家能否用仓库武器 · 敌方 bot 装备 · 控制台异常
// 用法: node _tools/_faction_probe.js [url]
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9497;
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;

function finish(code) {
  try { if (ws) ws.close(); } catch (e) { }
  try { if (proc) proc.kill(); } catch (e) { }
  fs.writeFileSync(path.join(ROOT, '_tools', '_faction_probe.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(code);
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'faction_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }
  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 200));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async n => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', n), Buffer.from(o.result.data, 'base64')); };

  const RUN = [
    { camp: '0', pick: 'usec' }, { camp: '1', pick: 'usec' }, { camp: '2', pick: 'usec' },
    { camp: '1', pick: 'pmc' },   // 撞阵营: 实验室守备是 PMC, 选 PMC 应自动把敌方换成 USEC
    { camp: '0', pick: 'pmc' },   // 街区守备是德军, 选 PMC 不触发换边
  ];

  for (const { camp, pick } of RUN) {
    await rpc('Page.navigate', { url: URL });
    await sleep(5000);
    await ev(`localStorage.setItem('sf_campaign','${camp}'); localStorage.setItem('sf_faction','${pick}'); localStorage.removeItem('bf_meta_v1');`);
    await rpc('Page.navigate', { url: URL });
    await sleep(7000);

    log('================ 战役 ' + camp + ' / 选择 ' + pick.toUpperCase() + ' ================');
    log('FACTION_PICK      : ' + await ev(`FACTION_PICK`));
    log('CAMPAIGN.f        : ' + await ev(`JSON.stringify(CAMPAIGN.f)`));
    log('TEAM_FACTION      : ' + await ev(`TEAM_FACTION.map(f=>f.short+'('+f.name+')').join(' | ')`));
    log('');
    log('--- 阵营栏 ---');
    log('teamUS  : ' + await ev(`el('teamUS').innerHTML + '   [sel=' + el('teamUS').classList.contains('sel') + ' disabled=' + el('teamUS').classList.contains('disabled') + ' cursor=' + el('teamUS').style.cursor + ']'`));
    log('teamGER : ' + await ev(`el('teamGER').innerHTML + '   [sel=' + el('teamGER').classList.contains('sel') + ' disabled=' + el('teamGER').classList.contains('disabled') + ' cursor=' + el('teamGER').style.cursor + ']'`));
    log('两个按钮都可点(应 true/true): ' + await ev(`(typeof el('teamUS').onclick==='function')+'/'+(typeof el('teamGER').onclick==='function')`));
    log('#foeHint : ' + await ev(`el('foeHint')?el('foeHint').textContent:'NO_EL'`));
    log('记分板表头: ' + await ev(`document.querySelector('.t0h').textContent + ' / ' + document.querySelector('.t1h').textContent`));

    log('');
    log('--- 玩家阵营与武器 ---');
    log('玩家阵营            : ' + await ev(`TEAM_FACTION[player.team].short + ' · scav=' + !!TEAM_FACTION[player.team].scav`));
    log('prepare             : ' + await ev(`(function(){try{
      addOwned('hk416',1); addOwned('awm',1);
      META.loadout.primary='hk416'; META.loadout.secondary='awm';
      el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
      return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
    await sleep(1200);
    log('主武器 (应为 HK416) : ' + await ev(`(WPN_DEFS[player.curW.key]||{}).name+' ('+player.curW.key+')'`));
    log('副武器 (应为 AWM)   : ' + await ev(`(function(){const s=player.slots[1];return s?((WPN_DEFS[s.key]||{}).name+' ('+s.key+')'):'无';})()`));
    log('玩家血量            : ' + await ev(`Math.round(player.hp)+'/'+player.maxHp`));

    log('');
    log('--- 敌方 bot 装备 ---');
    log(await ev(`(function(){
      const es=soldiers.filter(s=>s.team!==player.team);
      const cnt={}; for(const s of es){ const k=(s.def&&s.def.name)||'?'; cnt[k]=(cnt[k]||0)+1; }
      return '敌方 '+es.length+' 人 · '+JSON.stringify(cnt);
    })()`));
    log('敌方阵营 short      : ' + await ev(`TEAM_FACTION[1].short`));
    log('NPC 中立开关        : ' + await ev(`NPC_NEUTRAL`));

    if (camp === '0' && pick === 'usec') {
      await rpc('Page.navigate', { url: URL });
      await sleep(6000);
      await ev(`(function(){el('mHome').classList.add('hidden');el('mPlay').classList.remove('hidden');if(typeof refreshLoadoutSelects==='function')refreshLoadoutSelects();return 'OK';})()`);
      await sleep(500);
      await ev(`(function(){var ls=document.querySelectorAll('#mPlay .secLabel');for(var i=0;i<ls.length;i++){if(ls[i].textContent.indexOf('选择阵营')>=0){ls[i].scrollIntoView({block:'center'});return 'ok';}}return 'no';})()`);
      await sleep(400);
      await shot('faction_pick_ui.png');
    }
    log('');
  }

  log('================ 控制台异常 ================');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');
  finish(0);
})().catch(e => { log('FATAL ' + e.message); finish(1); });
