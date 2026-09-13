// 验证 请求 J: 削弱玩家方 NPC + 可搜刮队友遗体 + 搜尸/搜容器可获得子弹
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9418, HTTP = 8127;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let PASS = 0, FAIL = 0;
function chk(name, cond, extra) { if (typeof cond === 'string' && cond.startsWith('EXC:')) { extra = cond; cond = false; } if (cond) { PASS++; console.log('  ✓', name, extra || ''); } else { FAIL++; console.log('  ✗ FAIL:', name, extra || ''); } }
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
(async () => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('404'); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
  }).listen(HTTP);
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bd_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:' + HTTP + '/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); srv.close(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) pend[j.id](j); if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception && j.params.exceptionDetails.exception.description) || '').split('\n')[0]); if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push('CONSOLE ' + JSON.stringify(j.params.args.map(a => a.value).slice(0, 2))); });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception && o.result.exceptionDetails.exception.description) || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 12000)) { if (await ev(expr)) return true; await sleep(400); } return false; };

  await sleep(9000);

  console.log('--- A. 弹药类物品定义与统一 API ---');
  chk('AMMO_DEFS 6 种口径齐全', await ev(`Object.keys(AMMO_DEFS).length`) === 6);
  chk('口径与商店表一致', await ev(`AMMO_PACK_DEFS.every(p=>!!AMMO_KEYS_BY_CAL[p.cal])`));
  chk('itemKind=ammo', await ev(`itemKind('ammo_rifle')`) === 'ammo');
  chk('itemName 正确', await ev(`itemName('ammo_rifle')`) === '步枪弹药盒');
  chk('itemIconOf=🔋', await ev(`itemIconOf('ammo_rifle')`) === '🔋');
  chk('itemSizeOf 生效(步枪1格/机枪2格)', (await ev(`itemSizeOf('ammo_rifle')`)) === 1 && (await ev(`itemSizeOf('ammo_mg')`)) === 2);
  chk('itemSellPrice = 420*0.45 = 189', await ev(`itemSellPrice('ammo_rifle')`) === 189);
  chk('itemDescOf 含发数', /30 发/.test(await ev(`itemDescOf('ammo_rifle')`)));
  chk('弹药不在市集目录 TRADE_KEYS', await ev(`TRADE_KEYS.some(k=>!!AMMO_DEFS[k])`) === false);

  console.log('--- B. 玩家方 NPC 被削弱 ---');
  const metaKeysBefore = await ev(`Object.keys(META).sort().join(',')`);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(3000);
  chk('GAMEMODE=extract', await ev(`GAMEMODE`) === 'extract');
  chk('prestige=0(基础削弱, 非重生削弱)', await ev(`META.prestige`) === 0);
  const nerf = await ev(`JSON.stringify((function(){
    const f=combatants.filter(c=>!c.isPlayer&&c.team===player.team&&c.alive);
    const e=combatants.filter(c=>!c.isPlayer&&c.team!==player.team&&c.alive);
    const s=b=>({hpMul:b.hpMul,reactMul:b.reactMul,sprMul:b.sprMul,hp:b.hp,n:0});
    return {fN:f.length,eN:e.length,f:f[0]?s(f[0]):null,e:e[0]?s(e[0]):null};
  })())`);
  const nf = JSON.parse(nerf);
  console.log('   友方样本:', JSON.stringify(nf.f), ' 敌方样本:', JSON.stringify(nf.e));
  chk('存在友方与敌方 NPC', nf.fN > 0 && nf.eN > 0, `友${nf.fN}/敌${nf.eN}`);
  chk('友方 hpMul=0.75', Math.abs(nf.f.hpMul - 0.75) < 1e-6, 'hpMul=' + nf.f.hpMul);
  chk('敌方 hpMul=1(未被削弱)', Math.abs(nf.e.hpMul - 1) < 1e-6, 'hpMul=' + nf.e.hpMul);
  chk('友方满血上限 75 < 敌方 100', Math.round(100 * nf.f.hpMul) === 75 && Math.round(100 * nf.e.hpMul) === 100,
    `友${Math.round(100 * nf.f.hpMul)}(当前${Math.round(nf.f.hp)})/敌${Math.round(100 * nf.e.hpMul)}`);
  chk('友方反应更慢 reactMul=1.3', Math.abs(nf.f.reactMul - 1.3) < 1e-6);
  chk('友方散布更大 sprMul=1.4', Math.abs(nf.f.sprMul - 1.4) < 1e-6);
  chk('友方标记 friendlyNerf', await ev(`combatants.filter(c=>!c.isPlayer&&c.team===player.team).every(c=>c.friendlyNerf===true)`));
  // 与 prestige 叠加
  const stack = await ev(`(function(){ const b=combatants.find(c=>!c.isPlayer&&c.team===player.team); META.prestige=1; applyPrestigeBot(b); const v=b.hpMul; META.prestige=0; applyPrestigeBot(b); return v; })()`);
  chk('与 prestige 削弱叠加 (0.88*0.75≈0.66)', Math.abs(stack - 0.88 * 0.75) < 1e-6, 'hpMul=' + stack);

  console.log('--- C. 队友遗体可搜刮 ---');
  await ev(`CORPSES.length=0;`);
  const fcorpse = await ev(`JSON.stringify((function(){
    const b=combatants.find(c=>!c.isPlayer&&c.team===player.team&&c.alive);
    if(!b) return {err:'no friendly bot'};
    const bx=b.pos.x, bz=b.pos.z;
    b.die(null,false);
    const c=CORPSES[CORPSES.length-1];
    player.pos.x=bx; player.pos.z=bz;
    const t=lootTargetNear();
    let title='';
    if(t){ openLootPanel(t); renderLootPanel(); title=document.getElementById('lootTitle').textContent; }
    return {friendly:c?!!c.friendly:null, team:c?c.team:-1, pTeam:player.team,
            lootN:c?Object.keys(c.loot).length:-1, found:!!t, kind:t?t.kind:'', title:title};
  })())`);
  const fc = JSON.parse(fcorpse);
  chk('队友死亡生成遗体', fc.friendly === true, JSON.stringify(fc));
  chk('遗体记录阵营=玩家阵营', fc.team === fc.pTeam);
  chk('遗体带战利品', fc.lootN > 0, '件数 ' + fc.lootN);
  chk('玩家可在队友遗体上触发搜刮', fc.found === true && fc.kind === 'corpse');
  chk('面板标题为「友军遗体」', fc.title === '友 军 遗 体', '标题=' + fc.title);
  await ev(`lootPanelClose(); CORPSES.length=0;`);
  const ecorpse = await ev(`JSON.stringify((function(){
    const b=combatants.find(c=>!c.isPlayer&&c.team!==player.team&&c.alive);
    if(!b) return {err:'no enemy bot'};
    const bx=b.pos.x, bz=b.pos.z;
    b.die(null,false);
    const c=CORPSES[CORPSES.length-1];
    player.pos.x=bx; player.pos.z=bz;
    const t=lootTargetNear();
    let title='';
    if(t){ openLootPanel(t); renderLootPanel(); title=document.getElementById('lootTitle').textContent; }
    return {friendly:!!c.friendly, title:title};
  })())`);
  const ec = JSON.parse(ecorpse);
  chk('敌方遗体仍可搜刮', ec.friendly === false && ec.title === '敌 军 尸 体', JSON.stringify(ec));
  await ev(`lootPanelClose()`);

  console.log('--- D. 搜尸 / 搜容器可获得子弹 ---');
  const crateRate = await ev(`(function(){ let n=0; for(let i=0;i<400;i++){ const l=rollCrateLootList(); if(Object.keys(l).some(k=>AMMO_DEFS[k])) n++; } return n/400; })()`);
  chk('物资箱掉落弹药概率≈0.55', crateRate > 0.35 && crateRate < 0.8, '实测 ' + crateRate.toFixed(2));
  const crateKinds = await ev(`(function(){ let mx=0; for(let i=0;i<200;i++){ const l=rollCrateLootList(); mx=Math.max(mx,Object.keys(l).filter(k=>AMMO_DEFS[k]).length); } return mx; })()`);
  chk('单箱弹药种类 ≤ crateMaxKinds(2)', crateKinds <= 2, 'max=' + crateKinds);
  const corpseRate = await ev(`(function(){ let n=0; for(let i=0;i<200;i++){ const l=rollCorpseLoot({team:player.team,wpnKey:'m4',stash:{}}); if(Object.keys(l).some(k=>AMMO_DEFS[k])) n++; } return n/200; })()`);
  chk('队友遗体 100% 掉弹药', corpseRate === 1, '实测 ' + corpseRate);
  const enemyRate = await ev(`(function(){ let n=0; for(let i=0;i<200;i++){ const l=rollCorpseLoot({team:1-player.team,wpnKey:'m4',stash:{}}); if(Object.keys(l).some(k=>AMMO_DEFS[k])) n++; } return n/200; })()`);
  chk('敌方尸体高概率掉弹药(≈0.8)', enemyRate > 0.6 && enemyRate < 0.98, '实测 ' + enemyRate.toFixed(2));
  chk('掉落弹药口径与死者武器一致(m4→步枪弹)',
    await ev(`(function(){ for(let i=0;i<60;i++){ const l=rollCorpseLoot({team:player.team,wpnKey:'m4',stash:{}}); if(!l.ammo_rifle) return false; } return true; })()`));
  chk('掉落弹药口径=m1911→手枪弹',
    await ev(`(function(){ for(let i=0;i<60;i++){ const l=rollCorpseLoot({team:player.team,wpnKey:'m1911',stash:{}}); if(!l.ammo_pistol) return false; } return true; })()`));
  chk('队友遗体大概率保留其武器(≈0.85)',
    (await ev(`(function(){ let n=0; for(let i=0;i<300;i++){ const l=rollCorpseLoot({team:player.team,wpnKey:'m4',stash:{}}); if(l.m4) n++; } return n/300; })()`)) > 0.7);

  console.log('--- E. 弹药装填 (局内即时可用) ---');
  await ev(`(function(){ RUN.loot={}; player.medUseT=0; player.medItems=[]; player.foodItems=[];
    player.slots=[{key:'m4',def:WPN_DEFS.m4,mag:30,reserve:0}]; player.curW=player.slots[0]; player.curSlot=0; })()`);
  await ev(`addLootToBag('ammo_rifle',2)`);
  chk('拾取弹药进入背包', await ev(`RUN.loot.ammo_rifle`) === 2);
  chk('拾取提示动词为「装填」', /\[E\] 装填/.test(await ev(`document.getElementById('lootToast').innerHTML`)), await ev(`document.getElementById('lootToast').textContent`));
  await ev(`useLootFromBag('ammo_rifle')`);
  chk('装填后备弹 +30', await ev(`player.curW.reserve`) === 30, 'reserve=' + await ev(`player.curW.reserve`));
  chk('装填消耗一盒', await ev(`RUN.loot.ammo_rifle`) === 1);
  chk('装填提示含发数与剩余', /\+30/.test(await ev(`document.getElementById('lootToast').innerHTML`)) && /剩余/.test(await ev(`document.getElementById('lootToast').innerHTML`)), await ev(`document.getElementById('lootToast').textContent`));
  // 口径不符
  await ev(`player.slots=[{key:'m1911',def:WPN_DEFS.m1911,mag:7,reserve:0}]; player.curW=player.slots[0];`);
  await ev(`useLootFromBag('ammo_rifle')`);
  chk('口径不符 → 装填失败', await ev(`player.curW.reserve`) === 0);
  chk('口径不符 → 不消耗弹药盒', await ev(`RUN.loot.ammo_rifle`) === 1);
  chk('口径不符 → 提示明确并引导换武器', /口径不符/.test(await ev(`document.getElementById('lootToast').innerHTML`)));
  // 备弹满
  await ev(`player.curW.def=WPN_DEFS.m1911; player.curW.key='m1911'; player.curW.reserve=WPN_DEFS.m1911.reserve; addLootToBag('ammo_pistol',1); useLootFromBag('ammo_pistol');`);
  chk('备弹已满 → 拒绝装填且不消耗', await ev(`RUN.loot.ammo_pistol`) === 1);
  // 上限内截断
  await ev(`player.slots=[{key:'m4',def:WPN_DEFS.m4,mag:30,reserve:145}]; player.curW=player.slots[0]; addLootToBag('ammo_rifle',1); useLootFromBag('ammo_rifle');`);
  chk('备弹接近上限 → 截断到 150', await ev(`player.curW.reserve`) === 150);
  // 背包按钮
  const btn = await ev(`(function(){ RUN.loot={}; addLootToBag('ammo_rifle',1); addLootToBag('medkit',1); toggleBagPanel(); const bs=[...document.querySelectorAll('#bagPanelList .apUse')].map(b=>b.textContent); const r={bs:bs}; bagPanelClose(); return JSON.stringify(r); })()`);
  chk('背包按钮: 弹药显示「装填」/ 医疗显示「使用」', JSON.parse(btn).bs.sort().join(',') === '使用,装填', JSON.stringify(JSON.parse(btn).bs));

  console.log('--- F. 兼容性: 无新持久化字段 / 结算 ---');
  const metaKeysAfter = await ev(`Object.keys(META).sort().join(',')`);
  chk('META 顶层字段未增加', metaKeysAfter === metaKeysBefore, metaKeysBefore + ' → ' + metaKeysAfter);
  const storeKeys = await ev(`(function(){ try{ return Object.keys(JSON.parse(localStorage.getItem('bf_meta_v1'))).sort().join(','); }catch(e){ return 'ERR'; } })()`);
  chk('localStorage 存档键未增加', storeKeys === metaKeysBefore, storeKeys);
  await ev(`(function(){ RUN.loot={}; addLootToBag('ammo_rifle',3); addLootToBag('ledx',1); matchOver=false; })()`);
  await ev(`finishRaid(true)`);
  await sleep(600);
  chk('结算画面出现', await ev(`!document.getElementById('end').classList.contains('hidden')`));
  chk('弹药可随撤离入库 META.loot', await ev(`(META.loot.ammo_rifle||0)`) >= 3, 'ammo_rifle=' + await ev(`META.loot.ammo_rifle`));
  const soldOk = await ev(`(function(){ const w0=META.wallet; sellLoot('ammo_rifle'); return META.wallet-w0; })()`);
  chk('入库弹药可在仓库出售 (189/盒)', soldOk === 189, 'Δ=' + soldOk);

  console.log('--- G. 无 JS 异常 ---');
  chk('运行期无未捕获异常', errs.length === 0, errs.slice(0, 5).join(' | '));

  console.log(`\n===== 结果: ${PASS} 通过 / ${FAIL} 失败 =====`);
  ws.close(); proc.kill(); srv.close();
  process.exit(FAIL ? 1 : 0);
})();
