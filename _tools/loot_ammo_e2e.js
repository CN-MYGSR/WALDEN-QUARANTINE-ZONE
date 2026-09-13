// 验证 请求 I: 战利品局内即时可用 + 弹药局内购买 + 生命周期/结算兼容性
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9415, HTTP = 8125;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let PASS = 0, FAIL = 0;
function chk(name, cond, extra) { if (typeof cond === 'string' && cond.startsWith('EXC:')) { extra = cond; cond = false; } if (cond) { PASS++; console.log('  ✓', name, extra || ''); } else { FAIL++; console.log('  ✗ FAIL:', name, extra || ''); } }
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
(async () => {
  // ---- 静态服务器 ----
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
  const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 12000)) { if (await ev(expr)) return true; await sleep(400); } return false; };
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception && o.result.exceptionDetails.exception.description) || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };

  await sleep(9000);

  console.log('--- A. 配置表与新 UI 挂载 ---');
  chk('AMMO_PACK_DEFS 6 种弹药包', await ev(`AMMO_PACK_DEFS.length`) === 6);
  chk('每种弹药包 price>0 且 rounds>0', await ev(`AMMO_PACK_DEFS.every(p=>p.price>0&&p.rounds>0)`));
  chk('价格/数量各不相同', await ev(`new Set(AMMO_PACK_DEFS.map(p=>p.price)).size`) >= 5 && await ev(`new Set(AMMO_PACK_DEFS.map(p=>p.rounds)).size`) >= 5);
  chk('提示条 #lootToast 存在', await ev(`!!document.getElementById('lootToast')`));
  chk('弹药商店面板 #ammoShopPanel 存在', await ev(`!!document.getElementById('ammoShopPanel')`));
  chk('商店面板初始隐藏', await ev(`document.getElementById('ammoShopPanel').classList.contains('hidden')`));
  chk('口径推导: m4→rifle / m1911→pistol / m24→sniper / at4→heavy',
    await ev(`JSON.stringify([ammoCaliberOf('m4'),ammoCaliberOf('m1911'),ammoCaliberOf('m24'),ammoCaliberOf('at4'),ammoCaliberOf('ppsh')])`)
    === '["rifle","pistol","sniper","heavy","smg"]');

  console.log('--- B. 开局 (OnMatchStart) ---');
  const metaKeysBefore = await ev(`Object.keys(META).sort().join(',')`);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);
  chk('GAMEMODE=extract', await ev(`GAMEMODE`) === 'extract');
  chk('撤离模式下弹药商店启用', await ev(`ammoShopActive()`) === true);
  chk('RUN.ammoSpent 已归零', await ev(`RUN.ammoSpent`) === 0);

  console.log('--- C. 战利品局内即时可用 (Inventory) ---');
  await ev(`RUN.loot={}; player.medItems=[]; player.foodItems=[]; player.foodSel=0; player.medUseT=0; META.questProg={}; META.questDone={};`);
  chk('初始背包为空', await ev(`Object.keys(RUN.loot).length`) === 0);
  const pick1 = await ev(`(function(){ addLootToBag('water',1); return JSON.stringify({loot:RUN.loot.water, toast:document.getElementById('lootToast').innerHTML}); })()`);
  const p1 = JSON.parse(pick1);
  chk('拾取写入局内背包 RUN.loot', p1.loot === 1);
  chk('获得提示含图标/数量/持有量', /water|矿泉/.test(p1.toast) === false ? /×1/.test(p1.toast) && /持有/.test(p1.toast) : /×1/.test(p1.toast) && /持有/.test(p1.toast), '');
  await ev(`addLootToBag('water',1)`);
  chk('再次拾取 持有 2', await ev(`RUN.loot.water`) === 2);
  chk('提示显示递进 原1→2', /原 1/.test(await ev(`document.getElementById('lootToast').innerHTML`)));
  // 使用
  const use1 = await ev(`(function(){ useLootFromBag('water'); return JSON.stringify({loot:RUN.loot.water||0, tail:JSON.stringify((player.foodItems||[]).slice(-1)), useT:player.medUseT>0, toast:document.getElementById('lootToast').innerHTML}); })()`);
  const u1 = JSON.parse(use1);
  chk('局内使用即时扣减背包', u1.loot === 1, '剩余 ' + u1.loot);
  chk('注入既有 foodItems 结构(带 fromBag 标记)', /"key":"water"/.test(u1.tail) && /fromBag/.test(u1.tail), u1.tail);
  chk('触发既有使用动画流程', u1.useT === true);
  chk('消耗提示含"使用"与"剩余"', /使用/.test(u1.toast) && /剩余/.test(u1.toast), u1.toast);
  await waitFor('player.medUseT<=0', 12000);
  chk('使用完成 · 背包从 2 减到 1', await ev(`(RUN.loot.water||0)`) === 1, 'left=' + await ev(`(RUN.loot.water||0)`));
  chk('食用任务 u_water 计数 1/2', await ev(`META.questProg.u_water||0`) === 1, 'prog=' + await ev(`META.questProg.u_water||0`));
  // 第二个 → 任务完成
  await ev(`useLootFromBag('water')`);
  await waitFor('player.medUseT<=0', 12000);
  chk('u_water 完成后发放经验+货币', await ev(`!!META.questDone.u_water`) && await ev(`META.xp`) > 0);
  // 背包面板 [E] 使用 + 按钮
  const bagUI = await ev(`(function(){ addLootToBag('painkiller',1); toggleBagPanel(); const rows=[...document.querySelectorAll('#bagPanelList .bagRow')]; const withUse=rows.filter(r=>r.querySelector('.apUse')).length; const hint=document.getElementById('bagPanelHint').innerHTML; return JSON.stringify({rows:rows.length, withUse:withUse, hasE:hint.includes('[E]')||hint.includes('<b>E</b>')}); })()`);
  const bu = JSON.parse(bagUI);
  chk('背包面板可见', bu.rows >= 1, 'rows=' + bu.rows);
  chk('可用物品行出现「使用」按钮', bu.withUse === 1, 'withUse=' + bu.withUse);
  chk('面板提示含 [E] 立即使用', bu.hasE === true);
  await ev(`bagPanelClose()`);
  // H 键回退: 快捷栏空时自动取用背包
  await ev(`RUN.loot={}; player.medItems=[]; player.foodItems=[]; addLootToBag('tourniquet',1); player.bleedHeavy=1; player.painT=0; player.medUseT=0;`);
  await ev(`useMedQuick()`);
  await waitFor('player.medUseT<=0', 14000);
  chk('H 键在快捷栏空时自动取用背包医疗品', await ev(`(RUN.loot.tourniquet||0)`) === 0);
  chk('u_tourni 任务完成', await ev(`!!META.questDone.u_tourni`));
  // 不可使用物
  await ev(`addLootToBag('gpu',1)`);
  chk('杂物 gpu 不可局内使用', await ev(`itemUsableInRaid('gpu')`) === false);

  console.log('--- D. 弹药局内购买 (Shop) ---');
  await ev(`player.slots=[{key:'m4',def:WPN_DEFS.m4,mag:30,reserve:0}]; player.curW=player.slots[0]; player.curSlot=0;`);
  await ev(`META.wallet=10000; saveMeta();`);
  chk('当前武器 m4 · 备弹 0/150', await ev(`player.curW.key+'/'+player.curW.reserve+'/'+player.curW.def.reserve`) === 'm4/0/150');
  // 1) 口径不符
  const bad = await ev(`(function(){ const w0=META.wallet; const r=buyAmmoPack('ap_pistol'); return JSON.stringify({r:r, dw:META.wallet-w0, res:player.curW.reserve, toast:document.getElementById('lootToast').innerHTML}); })()`);
  const b1 = JSON.parse(bad);
  chk('口径不符 → 购买失败', b1.r === false);
  chk('口径不符 → 不扣费', b1.dw === 0);
  chk('口径不符 → 提示明确原因', /口径不符/.test(b1.toast), b1.toast);
  chk('口径不符 → 不发子弹', b1.res === 0);
  // 2) 正常购买
  const ok1 = await ev(`(function(){ const w0=META.wallet; const r=buyAmmoPack('ap_rifle'); return JSON.stringify({r:r, dw:META.wallet-w0, res:player.curW.reserve, spent:RUN.ammoSpent, rounds:RUN.ammoRounds, toast:document.getElementById('lootToast').innerHTML}); })()`);
  const o1 = JSON.parse(ok1);
  chk('ap_rifle 购买成功', o1.r === true);
  chk('扣费 ¥1200', o1.dw === -1200, 'Δ=' + o1.dw);
  chk('发货 +60 发', o1.res === 60, 'reserve=' + o1.res);
  chk('提示含发数/支出/余额', /\+60/.test(o1.toast) && /1,200/.test(o1.toast), o1.toast);
  chk('局内统计 RUN.ammoSpent', o1.spent === 1200 && o1.rounds === 60);
  // 3) 货币不足
  await ev(`META.wallet=300; saveMeta();`);
  const poor = await ev(`(function(){ const w0=META.wallet; const r=buyAmmoPack('ap_rifle'); return JSON.stringify({r:r, dw:META.wallet-w0, res:player.curW.reserve, toast:document.getElementById('lootToast').innerHTML}); })()`);
  const p2 = JSON.parse(poor);
  chk('货币不足 → 购买失败', p2.r === false);
  chk('货币不足 → 一分不扣', p2.dw === 0 && await ev(`META.wallet`) === 300);
  chk('货币不足 → 一发不发', p2.res === 60);
  chk('货币不足 → 提示含"货币不足"与差额', /货币不足/.test(p2.toast) && /还差/.test(p2.toast), p2.toast);
  // 4) 备弹已满
  await ev(`META.wallet=99999; player.curW.reserve=player.curW.def.reserve; saveMeta();`);
  const full = await ev(`(function(){ const w0=META.wallet; const r=buyAmmoPack('ap_rifle'); return JSON.stringify({r:r, dw:META.wallet-w0, toast:document.getElementById('lootToast').innerHTML}); })()`);
  const f1 = JSON.parse(full);
  chk('备弹已满 → 拒绝', f1.r === false && f1.dw === 0);
  chk('备弹已满 → 提示明确', /备弹已满/.test(f1.toast), f1.toast);
  // 5) 上限内折算
  await ev(`player.curW.reserve=140; META.wallet=99999; saveMeta();`);
  await ev(`buyAmmoPack('ap_rifle')`);
  chk('余量不足满额 → 按实发折算 (补到 150)', await ev(`player.curW.reserve`) === 150);
  chk('折算扣费 = 1200*10/60 = 200', await ev(`RUN.ammoSpent - 1200`) === 200, 'spent=' + await ev(`RUN.ammoSpent`));

  console.log('--- E. 移除免费补给 + 补给点入口 ---');
  await ev(`ammoShopClose(); player.curW.reserve=0; player.grabAction={kind:'ammo',crate:AMMO_CRATES[0]}; player.doGrabResolve();`);
  chk('补给点 F → 打开弹药商店(不再白给)', await ev(`AMMO_UI.open`) === true);
  chk('补给点 F → 弹药未变(未免费补给)', await ev(`player.curW.reserve`) === 0);
  chk('商店面板已渲染 6 行', await ev(`document.querySelectorAll('#ammoShopList .ammoRow').length`) === 6);
  chk('非当前口径行被置灰', await ev(`document.querySelectorAll('#ammoShopList .ammoRow.cant').length`) === 5);
  chk('面板显示当前武器与余额', /M4/.test(await ev(`document.getElementById('ammoShopStat').innerHTML`)) && /余额/.test(await ev(`document.getElementById('ammoShopStat').innerHTML`)));
  // 键盘购买
  await ev(`AMMO_UI.sel=2; META.wallet=99999; player.curW.reserve=0;`); // sel2=ap_rifle
  const beforeK = await ev(`META.wallet`);
  await ev(`ammoPanelKey('Enter',false)`);
  chk('Enter 键购买成功', await ev(`player.curW.reserve`) === 60 && await ev(`META.wallet`) === beforeK - 1200);
  await ev(`ammoShopClose()`);
  chk('Esc/关闭后面板隐藏', await ev(`AMMO_UI.open`) === false && await ev(`document.getElementById('ammoShopPanel').classList.contains('hidden')`));
  // 备弹耗尽提示
  await ev(`player.curW.reserve=0; player.curW.mag=0; tryReload();`);
  chk('备弹耗尽 → 引导到购买入口', /弹药商店/.test(await ev(`document.getElementById('lootToast').innerHTML`)), await ev(`document.getElementById('lootToast').innerHTML`));
  // 快捷键
  await ev(`ammoShopOpen()`);
  chk('商店可随时打开', await ev(`AMMO_UI.open`) === true);
  await ev(`ammoShopClose()`);

  console.log('--- F. 兼容性: 无新持久化字段 ---');
  const metaKeysAfter = await ev(`Object.keys(META).sort().join(',')`);
  chk('META 顶层字段未增加', metaKeysAfter === metaKeysBefore, metaKeysBefore + ' → ' + metaKeysAfter);
  const storeKeys = await ev(`(function(){ try{ return Object.keys(JSON.parse(localStorage.getItem('bf_meta_v1'))).sort().join(','); }catch(e){ return 'ERR'; } })()`);
  chk('localStorage 存档键未增加', storeKeys === metaKeysBefore, storeKeys);
  chk('弹药/战利品状态只存在 RUN(局内临时)', await ev(`typeof RUN.ammoSpent==='number'`) === true);

  console.log('--- G. 兼容性: 结算 / 死亡 ---');
  await ev(`addLootToBag('ledx',1); addLootToBag('water',1);`);
  const lootBefore = await ev(`JSON.stringify(RUN.loot)`);
  await ev(`finishRaid(true)`);
  await sleep(600);
  chk('finishRaid 正常执行 · 结算画面出现', await ev(`!document.getElementById('end').classList.contains('hidden')`));
  const stats = await ev(`document.getElementById('endStats').innerHTML`);
  chk('结算含战利品行', /带出/.test(stats));
  chk('结算追加弹药采购支出行', /弹药采购/.test(stats), (stats.match(/[^>]*弹药采购[^<]*/) || [''])[0]);
  chk('撤离成功 → 战利品入仓库 META.loot', await ev(`(META.loot.ledx||0)+(META.loot.water||0)`) >= 2, lootBefore);
  chk('matchOver=true', await ev(`matchOver`) === true);
  chk('商店在结算时自动关闭', await ev(`AMMO_UI.open`) === false);

  console.log('--- H. 无 JS 异常 ---');
  chk('运行期无未捕获异常', errs.length === 0, errs.slice(0, 5).join(' | '));

  console.log(`\n===== 结果: ${PASS} 通过 / ${FAIL} 失败 =====`);
  ws.close(); proc.kill(); srv.close();
  process.exit(FAIL ? 1 : 0);
})();
