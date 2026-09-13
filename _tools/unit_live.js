// 单位编队实机冒烟 (headless Chrome + CDP + 本地 no-cache 服务器)
// 检查: ① 开打后单位真的按 4 人切分 ② 余数进不足编单位 ③ 同单位互不锁定
//      ④ 跨单位正常锁定 ⑤ 同单位互相 damage() 不掉血 ⑥ 控制台无异常
// 结果写入 _tools/unit_live.txt
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9453, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('python', [path.join(ROOT, '_tools', 'serve_nocache.py'), '8123'], { stdio: 'ignore' });
  await sleep(1200);
  const ud = path.join(require('os').tmpdir(), 'unitlive_' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) {
    try {
      list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej));
      if (list && list.length) break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); proc.kill(); srv.kill(); fs.writeFileSync('_tools/unit_live.txt', out.join('\n') + '\n', 'utf8'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]);
    if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 160));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: false });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);

  log('=== 1. 开打并编队 ===');
  log('startMatch: ' + await ev(`(function(){try{startMatch();return 'OK';}catch(e){return 'EXC '+e.message;}})()`));
  await sleep(1200);
  log('UNITS = ' + await ev(`Object.keys(UNITS).sort().map(k=>k+'['+UNITS[k].members.length+(UNITS[k].under?' 缺编':'')+' 活'+UNITS[k].alive+']').join(' ')`));
  log('soldiers 总数 = ' + await ev(`soldiers.length`));
  log('player.unitId = ' + await ev(`player.unitId`));
  log('每个 NPC 都有 unitId: ' + await ev(`soldiers.every(s=>!!s.unitId)?'OK':'FAIL '+soldiers.filter(s=>!s.unitId).length+' 个没有'`));
  log('单位人数分布 = ' + await ev(`JSON.stringify(Object.keys(UNITS).sort().map(k=>UNITS[k].members.length))`));
  log('不足编单位 = ' + await ev(`JSON.stringify(Object.keys(UNITS).sort().filter(k=>UNITS[k].under))`));
  log('敌我单位 ID 不撞(带 team 前缀): ' + await ev(`Object.keys(UNITS).join(',')`));

  log('');
  log('=== 2. 同单位互不锁定 ===');
  // 把同单位两人面对面放到 6m, 强制 perceive, 看会不会互相锁定
  log('同单位测试: ' + await ev(`(function(){
    const ids=Object.keys(UNITS).filter(k=>UNITS[k].members.length>=2&&UNITS[k].team!==player.team);
    if(!ids.length) return 'NO_UNIT';
    const u=UNITS[ids[0]]; const a=u.members[0], b=u.members[1];
    a.pos.set(0,0,0); b.pos.set(0,0,6); a.alive=b.alive=true;
    a.yaw=Math.atan2(b.pos.x-a.pos.x,b.pos.z-a.pos.z); b.yaw=Math.atan2(a.pos.x-b.pos.x,a.pos.z-b.pos.z);
    a.target=null; b.target=null; a.flashT=0; b.flashT=0;
    a.perceive(); b.perceive();
    return 'unitId '+a.unitId+' · a.target='+(a.target?a.target.name:'null')+' · b.target='+(b.target?b.target.name:'null')
      +' · 互相锁定='+((a.target===b||b.target===a)?'FAIL 锁上了':'OK 没锁');
  })()`));

  log('');
  log('=== 3. 跨单位正常锁定 ===');
  log('跨单位测试: ' + await ev(`(function(){
    const keys=Object.keys(UNITS).filter(k=>UNITS[k].team!==player.team);
    if(keys.length<2) return 'NEED_2_UNITS';
    const u1=UNITS[keys[0]], u2=UNITS[keys[1]];
    const a=u1.members[0], b=u2.members[0];
    a.pos.set(0,0,0); b.pos.set(0,0,10); a.alive=b.alive=true;
    a.yaw=Math.atan2(b.pos.x-a.pos.x,b.pos.z-a.pos.z); b.yaw=Math.atan2(a.pos.x-b.pos.x,a.pos.z-b.pos.z);
    a.target=null; b.target=null; a.flashT=0; b.flashT=0;
    a.perceive();
    return a.unitId+' vs '+b.unitId+' · a.target='+(a.target?a.target.name:'null')
      +' · 锁定='+(a.target===b?'OK 锁上了':'未锁(可能被墙/烟挡住)');
  })()`));

  log('');
  log('=== 4. 同单位互相 damage 不掉血 ===');
  log('伤害闸: ' + await ev(`(function(){
    const ids=Object.keys(UNITS).filter(k=>UNITS[k].members.length>=2);
    const u=UNITS[ids[0]]; const a=u.members[0], b=u.members[1];
    const before=b.hp;
    b.damage(50,a,false);
    const after=b.hp;
    // 对照: 跨单位(或不同队)应当正常掉血
    let ctrl='n/a';
    const other=Object.keys(UNITS).filter(k=>UNITS[k].team!==a.team).map(k=>UNITS[k].members[0])[0];
    if(other){ const ob=other.hp; other.damage(50,a,false); ctrl=ob+'→'+other.hp; }
    return '同单位 '+before+'→'+after+' (期望不变) · 非同单位对照 '+ctrl+' (期望掉血)';
  })()`));

  log('');
  log('=== 5. 阵亡 / 重生维持编制 ===');
  log('阵亡: ' + await ev(`(function(){
    const k=Object.keys(UNITS)[0]; const u=UNITS[k]; const m=u.members[0];
    const before=u.members.length+'/'+u.alive;
    m.die();
    const after=u.members.length+'/'+u.alive;
    return k+' '+before+' → '+after+' (编制不变, 存活-1) · unitId 保留='+(m.unitId===k);
  })()`));
  log('重生: ' + await ev(`(function(){
    const k=Object.keys(UNITS)[0]; const u=UNITS[k]; const m=u.members[0];
    m.spawn(m.scatterSpawn);
    return m.name+' → '+m.unitId+' (期望 '+k+') · 存活 '+u.alive;
  })()`));

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 12).join('\n') : '无');

  ws.close(); proc.kill(); srv.kill();
  fs.writeFileSync(path.join(ROOT, '_tools', 'unit_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); fs.writeFileSync(path.join(ROOT, '_tools', 'unit_live.txt'), out.join('\n') + '\n', 'utf8'); process.exit(1); });
