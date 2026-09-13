// 验证 请求 K: 血量上限改为 440 (头35 胸85 胃70 左臂60 右臂60 左腿65 右腿65)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9421, HTTP = 8131;
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

  console.log('--- A. 部位定义与总血量 440 ---');
  chk('BODY_TOTAL_HP === 440', (await ev(`BODY_TOTAL_HP`)) === 440, '实际 ' + (await ev(`BODY_TOTAL_HP`)));
  chk('头部 35', (await ev(`BODY_DEFS.head.hp`)) === 35);
  chk('胸部 85', (await ev(`BODY_DEFS.thorax.hp`)) === 85);
  chk('胃部 70', (await ev(`BODY_DEFS.stomach.hp`)) === 70);
  chk('左臂 60', (await ev(`BODY_DEFS.armL.hp`)) === 60);
  chk('右臂 60', (await ev(`BODY_DEFS.armR.hp`)) === 60);
  chk('左腿 65', (await ev(`BODY_DEFS.legL.hp`)) === 65);
  chk('右腿 65', (await ev(`BODY_DEFS.legR.hp`)) === 65);
  chk('7 个部位', (await ev(`BODY_ORDER.length`)) === 7);
  chk('总和 = BODY_TOTAL_HP', (await ev(`BODY_ORDER.reduce((a,k)=>a+BODY_DEFS[k].hp,0)`)) === 440);

  console.log('--- B. 部署后玩家血量上限 = 440 ---');
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);
  // 用无甲配置重置, 排除护甲胸甲加成干扰
  await ev(`initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true; player.bleedHeavy=0; player.bleedLight=0;`);
  await sleep(300);
  chk('player.maxHp === 440', (await ev(`player.maxHp`)) === 440, '实际 ' + (await ev(`player.maxHp`)));
  chk('player.hp === 440', (await ev(`player.hp`)) === 440, '实际 ' + (await ev(`player.hp`)));
  chk('bodyHpMax = 440', (await ev(`bodyHpMax(player)`)) === 440);
  chk('bodyHpTotal = 440', (await ev(`bodyHpTotal(player)`)) === 440);
  chk('胸部 max = 85', (await ev(`player.body.thorax.max`)) === 85);
  chk('各部位 max 之和 = 440', (await ev(`BODY_ORDER.reduce((a,k)=>a+player.body[k].max,0)`)) === 440);
  chk('legacy limbs 仍为 0~100 百分比', (await ev(`player.limbs.head`)) === 100 && (await ev(`player.limbs.torso`)) === 100);

  console.log('--- C. HUD 总血量读数 ---');
  await sleep(1200);
  chk('#hpTotal 元素存在', (await ev(`!!el('hpTotal')`)) === true);
  chk('读数显示 440 / 440', (await ev(`el('hpTotal').textContent`)) === '440 / 440', '实际 "' + (await ev(`el('hpTotal').textContent`)) + '"');

  console.log('--- D. 受伤后总血量同步 ---');
  // lastDmgT 设成当前, 避免"脱离战斗自然恢复"在等待期间把血量补回去(那会污染读数断言)
  const d1 = await ev(`(function(){ damageBodyPart('legL',30,null,false); player.bleedHeavy=0; player.bleedLight=0; player.lastDmgT=nowT;
    return JSON.stringify({leg:player.body.legL.hp,hp:player.hp,max:player.maxHp,tot:bodyHpTotal(player),limbLeg:player.limbs.legs}); })()`);
  const o1 = JSON.parse(d1);
  console.log('   ', d1);
  chk('左腿 65 -> 35', Math.abs(o1.leg - 35) < 1e-6, 'legL=' + o1.leg);
  chk('p.hp 同步为 410', Math.abs(o1.hp - 410) < 1e-6, 'hp=' + o1.hp);
  chk('p.maxHp 仍为 440', o1.max === 440);
  chk('bodyHpTotal = 410', Math.abs(o1.tot - 410) < 1e-6);
  chk('legacy 腿部百分比约 54%', Math.abs(o1.limbLeg - 54) <= 1, 'legs=' + o1.limbLeg);
  await sleep(900);
  chk('HUD 读数跟到 410 / 440', (await ev(`el('hpTotal').textContent`)) === '410 / 440', '实际 "' + (await ev(`el('hpTotal').textContent`)) + '"');

  console.log('--- E. 濒死暗角用最危险部位 ---');
  const d2 = await ev(`(function(){ initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true;
    damageBodyPart('thorax',65,null,false); player.bleedHeavy=0; player.bleedLight=0;
    return JSON.stringify({th:player.body.thorax.hp,ratio:tkLowHpRatio(player),tot:bodyHpTotal(player),hp:player.hp}); })()`);
  const o2 = JSON.parse(d2);
  console.log('   ', d2);
  chk('胸部 85 -> 20', Math.abs(o2.th - 20) < 1e-6, 'thorax=' + o2.th);
  chk('总血量 375 (440-65)', Math.abs(o2.tot - 375) < 1e-6, 'total=' + o2.tot);
  chk('tkLowHpRatio 取胸部比例 0.235', Math.abs(o2.ratio - 20 / 85) < 0.01, 'ratio=' + o2.ratio);
  await sleep(1200);
  const lowOp = await ev(`parseFloat(el('lowOv').style.opacity)||0`);
  chk('濒死暗角已触发 (>0)', lowOp > 0, 'opacity=' + lowOp);

  console.log('--- F. 致死仍按部位规则 (胸/头打黑) ---');
  await ev(`initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true;`);
  await ev(`damageBodyPart('thorax',999,null,false)`);
  await sleep(500);
  chk('胸部打黑 -> 死亡', (await ev(`player.alive`)) === false);
  chk('死亡时 p.hp 为全身剩余(非负)', (await ev(`player.hp`)) >= 0, 'hp=' + (await ev(`player.hp`)));
  await ev(`initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true;`);
  await ev(`damageBodyPart('head',40,null,true)`);
  await sleep(500);
  chk('头部打黑 -> 死亡', (await ev(`player.alive`)) === false);
  // 只打黑四肢(不打胃部): 胃部打黑会触发 1.1/s 内出血持续扣胸部, 断言值会漂移
  chk('四肢打黑不致死', await ev(`(function(){ initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true; player.lastDmgT=nowT;
    damageBodyPart('armL',999,null,false); damageBodyPart('armR',999,null,false); damageBodyPart('legR',999,null,false);
    player.bleedHeavy=0; player.bleedLight=0; player.lastDmgT=nowT; return player.alive; })()`) === true);
  // 打黑 左臂60 + 右臂60 + 右腿65 = 185, 剩余 头35+胸85+胃70+左腿65 = 255
  chk('三处打黑剩余总血量 = 255', Math.abs((await ev(`bodyHpTotal(player)`)) - 255) < 1e-6, 'total=' + (await ev(`bodyHpTotal(player)`)));
  chk('打黑后 p.hp 同步为 255', Math.abs((await ev(`player.hp`)) - 255) < 1e-6, 'p.hp=' + (await ev(`player.hp`)));
  // 胃部打黑 -> 内出血持续扣胸部 -> 总血量随之下滑
  const drop = await ev(`(function(){ initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true; player.lastDmgT=nowT;
    player.bleedHeavy=0; player.bleedLight=0; damageBodyPart('stomach',999,null,false);
    player.bleedHeavy=0; player.bleedLight=0; player.lastDmgT=nowT;
    const t0=bodyHpTotal(player); updateTarkov(1.0); return JSON.stringify({t0:t0,t1:bodyHpTotal(player),hp:player.hp}); })()`);
  const od = JSON.parse(drop);
  console.log('   ', drop);
  chk('胃部内出血使总血量下降', od.t1 < od.t0, od.t0 + ' -> ' + od.t1);
  chk('内出血后 p.hp 与总血量一致', Math.abs(od.hp - od.t1) < 1e-6, 'p.hp=' + od.hp);

  console.log('--- G. 自然回血 / 包扎仍作用在胸部 ---');
  const d3 = await ev(`(function(){ initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true;
    player.bleedHeavy=0; player.bleedLight=0; player.lastDmgT=nowT-100; player.body.thorax.hp=40; tkSyncHp(player);
    updatePlayer(1.0);
    return JSON.stringify({th:player.body.thorax.hp,hp:player.hp}); })()`);
  const o3 = JSON.parse(d3);
  console.log('   ', d3);
  chk('胸部自然回血 +4 -> 44', Math.abs(o3.th - 44) < 1e-6, 'thorax=' + o3.th);
  chk('总血量随之回到 399', Math.abs(o3.hp - 399) < 1e-6, 'hp=' + o3.hp);
  const d4 = await ev(`(function(){ player.alive=true; player.bleedHeavy=0; player.bleedLight=0; player.lastDmgT=nowT;
    player.bandages=1; player.bandaging=0.01; player.body.thorax.hp=20; tkSyncHp(player); updatePlayer(0.02);
    return JSON.stringify({th:player.body.thorax.hp,hp:player.hp,max:player.maxHp}); })()`);
  const o4 = JSON.parse(d4);
  console.log('   ', d4);
  chk('包扎胸部 +45 -> 65', Math.abs(o4.th - 65) < 0.5, 'thorax=' + o4.th);
  chk('包扎后总血量 420', Math.abs(o4.hp - 420) < 0.5, 'hp=' + o4.hp);
  chk('包扎不会溢出上限 440', o4.max === 440);

  console.log('--- H. 护甲胸甲加成叠加到总血量 ---');
  const d5 = await ev(`(function(){ initRaidBody(player,{armor:{level:4,hp:0,resist:0}}); player.alive=true;
    return JSON.stringify({thMax:player.body.thorax.max,max:player.maxHp,hp:player.hp,tot:bodyHpMax(player)}); })()`);
  const o5 = JSON.parse(d5);
  console.log('   ', d5);
  chk('4 级甲胸部 85 -> 93', o5.thMax === 93, 'thoraxMax=' + o5.thMax);
  chk('总血量上限 440 -> 448', o5.max === 448 && o5.tot === 448, 'max=' + o5.max);

  console.log('--- I. 医疗品 / 全量治疗 ---');
  await ev(`initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true; player.bleedHeavy=0; player.bleedLight=0;`);
  await ev(`damageBodyPart('legL',40,null,false); damageBodyPart('armR',25,null,false); player.bleedHeavy=0; player.bleedLight=0;`);
  const before = await ev(`bodyHpTotal(player)`);
  await ev(`healPlayerAll(45)`);
  const after = await ev(`bodyHpTotal(player)`);
  chk('healPlayerAll 后总血量回升', after > before, before + ' -> ' + after);
  chk('healPlayerAll 后 p.hp 与总血量一致', (await ev(`player.hp`)) === after, 'p.hp=' + (await ev(`player.hp`)));
  // bestBagMedKey 的判定逻辑现在按全身总血量(440)走: 只有腿残血(385/440)也该选医疗包
  chk('医疗包判定改为按总血量', await ev(`(function(){ initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true;
    player.lastDmgT=nowT; player.bleedHeavy=0; player.bleedLight=0; player.fractures=[];
    player.body.thorax.hp=85; player.body.legL.hp=5; tkSyncHp(player);
    RUN.loot={medkit:1}; return bestBagMedKey(); })()`) === 'medkit');
  chk('满血时 heal 分支不成立', await ev(`(function(){ initRaidBody(player,{armor:{level:0,hp:0,resist:0}}); player.alive=true;
    player.lastDmgT=nowT; tkSyncHp(player); return bodyHpTotal(player) >= bodyHpMax(player)*0.96; })()`) === true);

  console.log('--- J. 无新增持久化字段 / 无异常 ---');
  chk('META 字段未变', (await ev(`Object.keys(META).sort().join(',')`)) === (await ev(`Object.keys(JSON.parse(localStorage.getItem('bf_meta_v1'))).sort().join(',')`)));
  chk('player 未新增持久化字段', (await ev(`typeof player.totalHpMax`)) === 'undefined');
  chk('页面无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n===== 通过 ' + PASS + ' / 失败 ' + FAIL + ' =====');
  ws.close(); proc.kill(); srv.close();
  setTimeout(() => process.exit(FAIL ? 1 : 0), 400);
})();
