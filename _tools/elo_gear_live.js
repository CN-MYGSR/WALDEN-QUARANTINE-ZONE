// ELO 装备价值维度 实机冒烟 (headless Chrome + CDP + no-cache 服务器)
// 检查: ① eloGearValue 估值 ② 廉价/高价装备对难度乘区的影响 ③ eloBox 显示装备 ④ 无异常
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9461, URL = 'http://127.0.0.1:8123/index.html';
const ROOT = path.resolve(__dirname, '..');
const out = []; const log = s => out.push(s);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('python', [path.join(ROOT, '_tools', 'serve_nocache.py'), '8123'], { stdio: 'ignore' });
  await sleep(1200);
  const ud = path.join(require('os').tmpdir(), 'elogear_' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,800', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list && list.length) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); proc.kill(); srv.kill(); fs.writeFileSync('_tools/elo_gear_live.txt', out.join('\n') + '\n', 'utf8'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || '').split('\n')[0]); if (j.method === 'Log.entryAdded' && j.params.entry.level === 'error') errs.push('LOG ' + String(j.params.entry.text).slice(0, 160)); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable'); await rpc('Log.enable');
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : String(o); };
  const shot = async name => { const o = await rpc('Page.captureScreenshot', { format: 'png' }); if (o.result && o.result.data) fs.writeFileSync(path.join(ROOT, 'outputs', name), Buffer.from(o.result.data, 'base64')); };
  await rpc('Page.navigate', { url: URL });
  await sleep(6000);

  log('=== 1. 估值与难度乘区 ===');
  log('廉价装备(手枪+轻甲): ' + await ev(`(function(){
    META.loadout={primary:'m1911',secondary:'',armor:'armor1',pack:'packSmall',meds:[],foods:[],nvg:false,throwables:{nade_frag:0,nade_flash:0,nade_smoke:0}};
    const gv=eloGearValue(); eloRecalc();
    return '估值¥'+gv+' · gearT='+ELO.gearT.toFixed(2)+' · 敌血×'+ELO.enemyHp.toFixed(2)+' · 敌伤×'+ELO.enemyDmg.toFixed(2);
  })()`));
  log('重装装备(狙击+重甲+满改装+投掷物): ' + await ev(`(function(){
    META.loadout={primary:'g28',secondary:'p320',armor:'armor6',pack:'packRaid',meds:[],foods:[],nvg:true,throwables:{nade_frag:3,nade_flash:2,nade_smoke:2}};
    const gv=eloGearValue(); eloRecalc();
    return '估值¥'+gv+' · gearT='+ELO.gearT.toFixed(2)+' · 敌血×'+ELO.enemyHp.toFixed(2)+' · 敌伤×'+ELO.enemyDmg.toFixed(2);
  })()`));
  log('ELO.auto 关闭时装备不影响: ' + await ev(`(function(){
    const was=ELO.auto; ELO.auto=false; eloRecalc(); const off={hp:ELO.enemyHp,dmg:ELO.enemyDmg}; ELO.auto=was; eloRecalc();
    return 'off时 敌血×'+off.hp.toFixed(2)+' 敌伤×'+off.dmg.toFixed(2)+' (期望 1.00)';
  })()`));

  log('');
  log('=== 2. eloSummary / eloBox 显示装备 ===');
  await ev(`(function(){META.loadout.primary='m4';META.loadout.armor='armor3';eloRecalc();return 1;})()`);
  log('eloSummary: ' + await ev(`eloSummary()`));
  await ev(`(function(){const m=document.getElementById('menu');if(m)m.classList.remove('hidden');const h=document.getElementById('mHome');if(h)h.classList.add('hidden');const p=document.getElementById('mPlay');if(p)p.classList.remove('hidden');eloRenderUI();return 1;})()`);
  await sleep(300);
  log('eloBox 含「装备估值」: ' + await ev(`(document.getElementById('eloBox')||{textContent:''}).textContent.indexOf('装备估值')>=0`));
  await shot('elo_gear.png');

  log('');
  log('=== 控制台异常 ===');
  log(errs.length ? errs.slice(0, 10).join('\n') : '无');
  ws.close(); proc.kill(); srv.kill();
  fs.writeFileSync(path.join(ROOT, '_tools', 'elo_gear_live.txt'), out.join('\n') + '\n', 'utf8');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); fs.writeFileSync(path.join(ROOT, '_tools', 'elo_gear_live.txt'), out.join('\n') + '\n', 'utf8'); process.exit(1); });
