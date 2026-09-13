// 验证: 任务系统 (20任务/经验/等级/市集锁/通行证/撤离门控/结算重生/prestige敌强我弱)
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9412;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let PASS = 0, FAIL = 0;
function chk(name, cond, extra) { if (typeof cond === 'string' && cond.startsWith('EXC:')) { extra = cond; cond = false; } if (cond) { PASS++; console.log('  ✓', name, extra || ''); } else { FAIL++; console.log('  ✗ FAIL:', name, extra || ''); } }
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

  console.log('--- A. 存档字段迁移 ---');
  chk('META.level=1', await ev(`META.level`) === 1);
  chk('META.xp=0', await ev(`META.xp`) === 0);
  chk('questProg/questDone 为对象', await ev(`typeof META.questProg==='object'&&typeof META.questDone==='object'`));
  chk('META.prestige=0', await ev(`META.prestige`) === 0);
  chk('QUEST_DEFS 共 20 个', await ev(`QUEST_DEFS.length`) === 20);
  chk('三类任务齐全', await ev(`JSON.stringify({use:QUEST_DEFS.filter(q=>q.type==='use').length,buy:QUEST_DEFS.filter(q=>q.type==='buy').length,kill:QUEST_DEFS.filter(q=>q.type==='kill'||q.type==='killhead').length})`) === '{"use":7,"buy":7,"kill":6}');

  console.log('--- B. 任务标签页渲染 ---');
  const qrows = await ev(`(function(){ renderArmory('quests'); return document.querySelectorAll('#arList .qRow').length; })()`);
  chk('任务页 20 行', qrows === 20, '实际 ' + qrows);

  console.log('--- C. 市集等级锁 ---');
  await ev(`META.wallet=999999; saveMeta();`);
  const lockInfo = await ev(`(function(){ renderArmory('market'); const rows=[...document.querySelectorAll('#arList .arRow')]; const locked=rows.filter(r=>r.innerHTML.includes('🔒')).length; const pass=rows.filter(r=>r.dataset&&r.innerHTML.includes('撤离通行证')).length; return JSON.stringify({locked:locked, passRow:document.querySelector('#arList [data-key="pass"]')!==null}); })()`);
  const li = JSON.parse(lockInfo);
  chk('Lv1 时部分商品被锁', li.locked > 0, '锁定 ' + li.locked + ' 件');
  chk('20任务未完成 → 通行证不出现', li.passRow === false);
  await ev(`buyItem('morphine')`); // Lv3 锁
  chk('Lv1 买吗啡(Lv3)被拒', await ev(`(META.owned.morphine||0)`) === 0);
  chk('拒绝提示含等级', (await ev(`buyGateMsg('morphine')`) || '').includes('Lv.3'));

  console.log('--- D. 购买任务 + 升级 ---');
  await ev(`buyItem('medkit')`); // b_medkit n=1 → 完成
  chk('买医疗包任务完成', await ev(`!!META.questDone.b_medkit`));
  chk('任务奖励货币入账', await ev(`META.wallet`) === 999999 - 680 + 500, 'wallet=' + await ev(`META.wallet`)); // 花680买医疗包,奖500
  const xp1 = await ev(`META.xp`);
  chk('完成任务获得经验', xp1 === 80, 'xp=' + xp1);
  await ev(`buyItem('water'); buyItem('juice'); buyItem('beer')`); // b_food 3
  chk('买3食物任务完成', await ev(`!!META.questDone.b_food`));
  await ev(`buyItem('painkiller'); buyItem('painkiller')`);
  chk('买2止痛药任务完成', await ev(`!!META.questDone.b_pain`));
  await ev(`buyItem('cig'); buyItem('wrench')`);
  chk('买2杂货任务完成', await ev(`!!META.questDone.b_misc`));
  await ev(`buyItem('packSmall')`);
  chk('买背包任务完成', await ev(`!!META.questDone.b_pack`));
  await ev(`buyItem('armor2')`);
  chk('买防弹衣任务完成', await ev(`!!META.questDone.b_armor`));
  await ev(`buyItem('m4')`);
  chk('买武器任务完成', await ev(`!!META.questDone.b_weapon`));
  const lvAfterBuy = await ev(`META.level + '|' + Math.floor(META.xp)`);
  console.log('  购买7任务后 等级/经验:', lvAfterBuy);
  // 注入经验验证升级归零
  await ev(`gainXP(1000 - META.xp + 120)`); // 正好升1级并余120
  chk('1000经验升级且经验归零', await ev(`META.level`) === 2 && await ev(`META.xp`) === 120, 'level=' + await ev(`META.level`) + ' xp=' + await ev(`META.xp`));

  console.log('--- E. 开局: 局内任务HUD / 使用任务 / 击杀任务 ---');
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);
  chk('GAMEMODE=extract', await ev(`GAMEMODE`) === 'extract');
  await ev(`updateQuestHud()`);
  chk('任务追踪HUD可见', await ev(`document.getElementById('questHud')&&document.getElementById('questHud').style.display`) === 'block');
  // 使用道具任务
  await ev(`(function(){ player.medItems=[{key:'tourniquet',uses:1}]; player._medIdx=0; player.bleedLight=1; finishMedUse(); })()`);
  chk('用止血带任务完成', await ev(`!!META.questDone.u_tourni`));
  await ev(`(function(){ player.foodItems=[{key:'water'},{key:'water'}]; player.foodSel=0; finishFoodUse(); player.foodSel=0; finishFoodUse(); })()`);
  chk('喝2水任务完成', await ev(`!!META.questDone.u_water`));
  // 击杀任务
  await ev(`(function(){ for(let i=0;i<3;i++) onPlayerKill({isPlayer:false,team:1,name:'敌'},false); })()`);
  chk('杀3人任务完成', await ev(`!!META.questDone.k3`));
  const kxp = await ev(`Math.floor(META.xp)`);
  console.log('  杀3人后经验:', kxp, '(含击杀25×3)');
  await ev(`(function(){ for(let i=0;i<3;i++) onPlayerKill({isPlayer:false,team:1,name:'敌'},true); })()`);
  chk('爆头3人任务完成', await ev(`!!META.questDone.kh3`));

  console.log('--- F. 撤离门控: 无通行证被拒 ---');
  const gate = await ev(`(function(){
    const ex=EXTRACT_POINTS[0]; player.pos.x=ex.x; player.pos.z=ex.z; player.alive=true;
    updateExtraction(0.2);
    const t=document.getElementById('extractTxt');
    return JSON.stringify({txt:t?t.textContent:'', prog:ex.progress});
  })()`);
  const g = JSON.parse(gate);
  chk('撤离点内提示需要通行证', g.txt.includes('通行证'), g.txt);
  chk('无通行证撤离进度不累积', g.prog === 0);

  console.log('--- G. 补齐20任务 → 买通行证 → 撤离成功 ---');
  await ev(`(function(){ for(const q of QUEST_DEFS){ META.questDone[q.id]=true; META.questProg[q.id]=questTarget(q); } saveMeta(); })()`);
  chk('20任务全部完成', await ev(`questsAllDone()`));
  const passRow = await ev(`(function(){ renderArmory('market'); const b=document.querySelector('#arList [data-key="pass"]'); return b?b.closest('.arRow').querySelector('.arName').textContent:''; })()`);
  chk('市集出现通行证', passRow.includes('通行证'), passRow);
  await ev(`buyItem('pass')`);
  chk('购得通行证', await ev(`(META.owned.pass||0)`) === 1);
  // 持续驻留撤离点直到读条完成
  const ext = await ev(`(function(){
    const ex=EXTRACT_POINTS[0]; player.pos.x=ex.x; player.pos.z=ex.z; player.alive=true;
    for(let i=0;i<40;i++) updateExtraction(0.2);
    return JSON.stringify({over:matchOver, passLeft:(META.owned.pass||0),
      endShown:!document.getElementById('end').classList.contains('hidden'),
      title:document.getElementById('endTitle').textContent,
      rebirth:!!document.getElementById('rebirthBtn')});
  })()`);
  const ex2 = JSON.parse(ext);
  chk('持证撤离成功(结算弹出)', ex2.over && ex2.endShown && ex2.title.includes('成 功'), ex2.title);
  chk('撤离消耗通行证', ex2.passLeft === 0);
  chk('结算画面出现重生按钮', ex2.rebirth);

  console.log('--- H. 重生: 从零开始 + prestige ---');
  await ev(`doRebirth()`);
  await sleep(6000); // location.reload
  chk('重生后 prestige=1', await ev(`META.prestige`) === 1);
  chk('货币重置 2600', await ev(`META.wallet`) === 2600);
  chk('等级重置 1', await ev(`META.level`) === 1);
  chk('任务清空', await ev(`questsDoneCount()`) === 0);
  chk('击杀任务目标提高 k3: 3→5', await ev(`questTarget(QUEST_DEFS.find(q=>q.id==='k3'))`) === 5);

  console.log('--- I. prestige 敌强我弱 ---');
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(1200);
  await ev(`(function(){ selectedSpawn=-1; deployPlayer(); })()`);
  await sleep(2500);
  const bots = await ev(`(function(){
    const foe=soldiers.filter(s=>s.alive&&s.team!==player.team);
    const fri=soldiers.filter(s=>s.alive&&s.team===player.team);
    return JSON.stringify({
      foeN:foe.length, friN:fri.length,
      foeHp:foe.length?foe[0].hp:0, foeMul:foe.length?+(foe[0].hpMul||1).toFixed(2):0, foeReact:foe.length?+(foe[0].reactMul||1).toFixed(2):0, foeSpr:foe.length?+(foe[0].sprMul||1).toFixed(2):0,
      friHp:fri.length?fri[0].hp:0, friMul:fri.length?+(fri[0].hpMul||1).toFixed(2):0
    });
  })()`);
  const b = JSON.parse(bots);
  console.log('  敌方:', b.foeN, 'hp=' + b.foeHp, 'hpMul=' + b.foeMul, 'reactMul=' + b.foeReact, 'sprMul=' + b.foeSpr, ' | 己方:', b.friN, 'hp=' + b.friHp, 'hpMul=' + b.friMul);
  chk('敌方血量增强(>100)', b.foeHp > 100 && b.foeMul > 1);
  chk('己方血量减弱(<100)', b.friHp > 0 && b.friHp < 100 && b.friMul < 1);

  console.log('--- J. 脚本错误 ---');
  const realErrs = errs.filter(e => !e.includes('favicon'));
  chk('无 JS 异常', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  console.log(`\n===== 结果: ${PASS} 通过 / ${FAIL} 失败 =====`);
  proc.kill(); process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('HARNESS_ERR', e); process.exit(2); });
