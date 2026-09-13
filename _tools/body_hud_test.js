// 验证: 血条已移除 / 左下人体图按血量着色 / 止痛药·吗啡 四重效果
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9398;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bd_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (j.params.exceptionDetails.exception && j.params.exceptionDetails.exception.description || '').split('\n')[0]); if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push('CONSOLE ' + JSON.stringify(j.params.args.map(a => a.value).slice(0, 2))); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);

  console.log('--- 1. 血条是否彻底移除 ---');
  console.log('  hpNum 元素:', await ev(`document.getElementById('hpNum')?'仍存在':'已删除'`));
  console.log('  hpBar 元素:', await ev(`document.getElementById('hpBar')?'仍存在':'已删除'`));
  console.log('  limbBar 数量:', await ev(`document.querySelectorAll('.limbBar').length`));
  console.log('  人体图部件数:', await ev(`document.querySelectorAll('#bodyFig .bp').length`));

  console.log('--- 2. 人体图着色 (白/黄/红/黑) ---');
  const r2 = await ev(`(function(){
    const p=player, out=[];
    // CSS 里有 transition:fill .18s, 同步读 getComputedStyle 会拿到过渡起始值 -> 先关掉过渡
    document.querySelectorAll('#bodyFig .bp').forEach(function(e){ e.style.transition='none'; });
    const set=function(k,ratio){
      const pt=p.body[k];
      pt.hp=Math.max(0,Math.round(pt.max*ratio));
      tkSyncLegacy(p); renderBodyFigure(false);
      const e2=document.getElementById('bp-'+k);
      // 必须读 getComputedStyle: CSS 规则优先级高于 fill="" 属性, 读属性会自欺欺人
      return {k:k, name:BODY_DEFS[k].name, ratio:+ratio.toFixed(2), hp:Math.ceil(pt.hp)+'/'+pt.max,
              fill:getComputedStyle(e2).fill, attr:e2.getAttribute('fill'), tip:(e2.querySelector('title')||{}).textContent};
    };
    for(const k of ['head','thorax','stomach','armL','armR','legL','legR']){
      out.push(set(k,1.0));
    }
    out.push(set('head',0.9)); out.push(set('thorax',0.6));
    out.push(set('stomach',0.3)); out.push(set('armL',0.1));
    out.push(set('legL',0.0)); out.push(set('armR',0.45));
    return JSON.stringify(out);
  })()`);
  try {
    const a = JSON.parse(r2);
    // getComputedStyle 返回 rgb(...) 形式
    const NAME = { 'rgb(242, 242, 242)': '白(满血)', 'rgb(232, 201, 74)': '黄(轻~中伤)', 'rgb(217, 74, 61)': '红(重伤)', 'rgb(21, 21, 21)': '黑(严重/报废)', 'rgb(138, 138, 138)': '灰(空闲)' };
    let bad = 0;
    a.forEach(o => {
      const nm = NAME[o.fill] || ('?? ' + o.fill);
      if (nm.indexOf('??') === 0) bad++;
      console.log(`  ${o.name}(${o.k}) ${String(o.ratio).padStart(4)} -> ${String(o.hp).padStart(6)} ${nm}  tip="${o.tip}"`);
    });
    console.log(bad ? `  ⚠ ${bad} 个部位颜色未生效(仍被 CSS 覆盖)` : '  ✓ 所有部位实际渲染色正确');
  } catch (e) { console.log(r2); }

  console.log('--- 2b. 真实受击 → 自动变色 (不手动调 render, 纯靠 HUD 循环) ---');
  await ev(`(function(){ const p=player;
    for(const k of BODY_ORDER){ p.body[k].hp=p.body[k].max; }
    p.bleedHeavy=0; p.bleedLight=0; p.fractures.length=0; p.blacked={};
    p.hp=p.body.thorax.hp; tkSyncLegacy(p); return 'reset'; })()`);
  await sleep(700);
  const NAME2 = { 'rgb(242, 242, 242)': '白', 'rgb(232, 201, 74)': '黄', 'rgb(217, 74, 61)': '红', 'rgb(21, 21, 21)': '黑', 'rgb(138, 138, 138)': '灰' };
  const dump = async (tag) => {
    const s = await ev(`(function(){ const o={}; const N=NAME2; for(const k of ['head','thorax','stomach','armR','armL','legL','legR']){ const e2=document.getElementById('bp-'+k); o[k]=(N[getComputedStyle(e2).fill]||('?'+getComputedStyle(e2).fill)); } return JSON.stringify(o); })()`.replace('NAME2', '(' + JSON.stringify(NAME2) + ')'));
    const hp = await ev(`(function(){ const o={}; for(const k of ['head','thorax','stomach','armR','armL','legL','legR']) o[k]=Math.round(player.body[k].hp); return JSON.stringify(o); })()`);
    console.log('  ' + tag.padEnd(9) + s + '  实际血量 ' + hp);
  };
  await dump('受击前');
  await ev(`applyPlayerBodyDamage(25,null,false,'legs'); player.bleedHeavy=0; player.bleedLight=0;`);
  await sleep(700); await dump('腿部 -25');
  await ev(`applyPlayerBodyDamage(25,null,false,'legs'); player.bleedHeavy=0; player.bleedLight=0;`);
  await sleep(700); await dump('腿部 -25');
  await ev(`applyPlayerBodyDamage(20,null,false,'legs'); player.bleedHeavy=0; player.bleedLight=0;`);
  await sleep(700); await dump('腿部 -20');
  console.log('  腿实际血量:', await ev(`JSON.stringify({legL:Math.round(player.body.legL.hp)+'/'+player.body.legL.max, legR:Math.round(player.body.legR.hp)+'/'+player.body.legR.max})`));

  console.log('--- 3. 止痛药 / 吗啡 增益 ---');
  await ev(`(function(){ const p=player;
    for(const k of BODY_ORDER){ p.body[k].hp=p.body[k].max; }
    p.bleedHeavy=0; p.bleedLight=0; p.fractures.length=0; p.blacked={};
    p.painT=0; p.painPow=0; tkSyncLegacy(p);
    return 'reset'; })()`);
  const base = await ev(`JSON.stringify({spd:+tarkovSpeedMul(player).toFixed(3), spr:+painSpreadMul(player).toFixed(3), bl:+painBleedMul(player).toFixed(3), pain:playerInPain(player)})`);
  console.log('  无伤无止痛 :', base);
  await ev(`(function(){ const p=player; p.fractures.push('legL'); p.bleedHeavy=1; p.body.thorax.hp=Math.round(p.body.thorax.max*0.2); return 'hurt'; })()`);
  console.log('  重伤未止痛 :', await ev(`JSON.stringify({spd:+tarkovSpeedMul(player).toFixed(3), spr:+painSpreadMul(player).toFixed(3), bl:+painBleedMul(player).toFixed(3), pain:playerInPain(player)})`));
  await ev(`(function(){ const p=player; p.painT=180; p.painPow=1; return 'pk'; })()`);
  console.log('  止痛药生效 :', await ev(`JSON.stringify({spd:+tarkovSpeedMul(player).toFixed(3), spr:+painSpreadMul(player).toFixed(3), bl:+painBleedMul(player).toFixed(3), pain:playerInPain(player)})`));
  await ev(`(function(){ const p=player; p.painT=300; p.painPow=1.7; return 'mo'; })()`);
  console.log('  吗啡生效   :', await ev(`JSON.stringify({spd:+tarkovSpeedMul(player).toFixed(3), spr:+painSpreadMul(player).toFixed(3), bl:+painBleedMul(player).toFixed(3), pain:playerInPain(player)})`));

  console.log('--- 4. 实测扣血速率 (重度出血 1 处, 3 秒) ---');
  const bleedRun = async (label, setup) => {
    await ev(setup);
    const h0 = await ev(`(function(){ const p=player; p.body.thorax.hp=200; p.body.thorax.max=200; p.hp=200; p.hydration=100; p.satiety=100; p.lastDmgT=nowT; return p.body.thorax.hp; })()`);
    await sleep(3000);
    const h1 = await ev(`player.body.thorax.hp`);
    console.log(`  ${label}: 3 秒掉血 ${(h0 - h1).toFixed(2)} 点  (${((h0 - h1) / 3).toFixed(2)}/s)`);
    return (h0 - h1) / 3;
  };
  const rNo = await bleedRun('未止痛  ', `(function(){ const p=player; p.bleedHeavy=1; p.bleedLight=0; p.blacked={}; p.painT=0; p.painPow=0; return 'x'; })()`);
  const rPk = await bleedRun('止痛药  ', `(function(){ const p=player; p.bleedHeavy=1; p.painT=180; p.painPow=1; return 'x'; })()`);
  const rMo = await bleedRun('吗啡    ', `(function(){ const p=player; p.bleedHeavy=1; p.painT=300; p.painPow=1.7; return 'x'; })()`);
  console.log(`  减缓幅度: 止痛药 -${(100 - rPk / rNo * 100).toFixed(0)}% · 吗啡 -${(100 - rMo / rNo * 100).toFixed(0)}%`);

  console.log('--- 5. 药品描述 / HUD 提示 ---');
  console.log(' ', await ev(`MED_DEFS.painkiller.desc`));
  console.log(' ', await ev(`MED_DEFS.morphine.desc`));
  await ev(`(function(){ const p=player; p.painT=200; p.painPow=1; updateRaidHUDBars(false); return document.getElementById('quickHud').textContent; })()`);
  console.log('  quickHud:', await ev(`document.getElementById('quickHud').textContent`));

  console.log('--- 6. 端到端: 携带止痛药按 H 使用 ---');
  await ev(`(function(){ const p=player;
    for(const k of BODY_ORDER){ p.body[k].hp=p.body[k].max; }
    p.bleedHeavy=0; p.bleedLight=0; p.fractures.length=0; p.blacked={}; p.painT=0; p.painPow=0;
    p.medItems=[{key:'painkiller',uses:1}]; p.medUseT=0; p._medIdx=undefined;
    p.body.thorax.hp=Math.round(p.body.thorax.max*0.25); p.fractures.push('legL');
    tkSyncLegacy(p); return 'armed'; })()`);
  console.log('  用药前 painT/painPow/疼痛:', await ev(`JSON.stringify([player.painT,player.painPow,playerInPain(player)])`));
  console.log('  bestMedIndex:', await ev(`bestMedIndex()`), '(0=选中止痛药)');
  await ev(`useMedQuick()`);
  await sleep(3000);
  console.log('  用药后 painT/painPow/疼痛:', await ev(`JSON.stringify([Math.round(player.painT),player.painPow,playerInPain(player)])`));
  console.log('  剩余药品:', await ev(`JSON.stringify(player.medItems)`));
  console.log('  增益:', await ev(`JSON.stringify({移速:+tarkovSpeedMul(player).toFixed(3),散布:+painSpreadMul(player).toFixed(3),失血:+painBleedMul(player).toFixed(3)})`));

  console.log('页面报错数:', errs.length);
  errs.slice(0, 8).forEach(e => console.log('  ', e));
  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
