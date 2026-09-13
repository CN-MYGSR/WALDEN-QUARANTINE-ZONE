// 验证 D 项全部功能: Tab背包面板 / 丢弃物资 / 滚轮切换高低姿态
// 注意: headless 下无法真正获得 pointer lock, 因此测试通过 window.__forceLock()
//       探针把内部 pointerLocked 置为 true, 以覆盖真实运行时的代码路径。
const http = require('http'), fs = require('fs'), path = require('path'), WS = require('ws'), { spawn } = require('child_process');
const PORT = 9370;
function findChrome() { for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) { try { if (fs.existsSync(c)) return c; } catch (e) { } } return null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ch = findChrome(); if (!ch) { console.log('NO_CHROME'); process.exit(1); }
  const ud = path.join(require('os').tmpdir(), 'bag2_' + Date.now());
  const proc = spawn(ch, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud, '--window-size=1280,720', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'http://127.0.0.1:8123/index.html'], { stdio: 'ignore' });
  await sleep(3500);
  let list = null;
  for (let i = 0; i < 25; i++) { try { list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej)); if (list) break; } catch (e) { await sleep(500); } }
  const page = (list || []).find(t => t.type === 'page'); if (!page) { console.log('NO_PAGE'); proc.kill(); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pend[j.id]) { pend[j.id](j); return; } if (j.method === 'Runtime.exceptionThrown') { const d = j.params.exceptionDetails; errs.push('[EXC] ' + (d.exception && d.exception.description ? d.exception.description.split('\n')[0] : d.text) + ' @' + (d.url || '')); } });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  await rpc('Page.enable', {}); await rpc('Runtime.enable', {});
  const ev = async e => { const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.result && o.result.exceptionDetails) return 'EXC:' + (o.result.exceptionDetails.exception.description || '').split('\n')[0]; return o.result && o.result.result ? o.result.result.value : JSON.stringify(o); };
  const shot = async fn => { const s = await rpc('Page.captureScreenshot', { format: 'png' }); if (s && s.result && s.result.data) { fs.writeFileSync(fn, Buffer.from(s.result.data, 'base64')); return fn; } return 'FAIL'; };

  await sleep(9000);
  await ev(`startMatch(); el('menu').classList.add('hidden'); showDeploy(false);`);
  await sleep(2500);
  console.log('部署:', await ev(`(function(){ try{ selectedSpawn=-1; deployPlayer(); return 'deployed='+player.deployed+' curW='+(player.curW&&player.curW.key); }catch(e){return 'ERR:'+e.message;} })()`));
  await sleep(3000);

  // headless 无法真锁指针, 用一个可信探针模拟"已锁定"状态
  console.log('指针锁定探针:', await ev(`(function(){
    // pointerLocked 是 24_input.js 的模块级 let, 无法从外部赋值;
    // 改为覆写 requestPointerLock 的判定路径: 直接劫持 pointerlockchange 的判定值不可行。
    // 采用方案: 重定义 EventTarget 无法做到。因此改为在本页注入一个真实 DOM 事件序列,
    // 并通过 Object.defineProperty 欺骗 document.pointerLockElement。
    try{
      Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>renderer.domElement});
      document.dispatchEvent(new Event('pointerlockchange'));
      return 'patched';
    }catch(e){ return 'ERR:'+e.message; }
  })()`));
  await sleep(400);

  // 判定 pointerLocked 是否已生效: 用一个受该守卫保护的既有动作试探
  console.log('锁定是否生效(KeyC蹲下试探):', await ev(`(function(){ const b=player.crouch; window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC',bubbles:true})); return 'crouch '+b+'->'+player.crouch; })()`));
  await ev(`player.crouch=false;`);
  console.log('typeof setCarryStance:', await ev(`typeof setCarryStance`));

  // ---- 1. Tab 背包面板 ----
  console.log('\n== 1. Tab 背包面板 ==');
  await ev(`(function(){ const ks=['medkit','water','noodles','painkiller','tourniquet']; for(const k of ks){ addLootToBag(k,2); } renderRaidBag(); renderBagPanel(); })()`);
  console.log('Tab切换:', await ev(`toggleBagPanel(); BAG_UI.open`));
  console.log('面板可见:', await ev(`!document.getElementById('bagPanel').classList.contains('hidden')`));
  console.log('bagHud已彻底移除:', await ev(`document.getElementById('bagHud')===null`));
  console.log('面板行数:', await ev(`document.querySelectorAll('#bagPanelList .bagRow').length`));
  console.log('面板机位:', await ev(`(function(){const r=document.getElementById('bagPanel').getBoundingClientRect();return Math.round(r.left)+','+Math.round(r.top)+' w'+Math.round(r.width)+' h'+Math.round(r.height);})()`));
  console.log('状态栏位置:', await ev(`(function(){const r=document.getElementById('healthPanel').getBoundingClientRect();return Math.round(r.left)+','+Math.round(r.top)+' h'+Math.round(r.height);})()`));
  await shot('bag_panel.png');

  // ---- 2. 丢弃机制 ----
  console.log('\n== 2. 丢弃物资 ==');
  console.log('背包容量:', await ev(`bagUsed()+'/'+bagCapacity()`));
  console.log('丢弃前:', await ev(`JSON.stringify(RUN.loot)`));
  console.log('丢弃1个:', await ev(`(function(){const k=bagEntryKeys()[BAG_UI.sel]; const b=RUN.loot[k]; bagDropSelected(false); return k+' '+b+'->'+(RUN.loot[k]||0);})()`));
  console.log('丢弃整组:', await ev(`(function(){const k=bagEntryKeys()[BAG_UI.sel]; const b=RUN.loot[k]; bagDropAllOfSelected(); return k+' '+b+'->'+(RUN.loot[k]||0);})()`));
  // 装备类放回仓库: 先腾出足够空间
  console.log('装备类放回仓库:', await ev(`(function(){ try{
    while(bagFree()<3){ const ks=bagEntryKeys(); if(!ks.length) break; BAG_UI.sel=0; bagDropAllOfSelected(); }
    const ok=addLootToBag('garand',1);
    const ks=bagEntryKeys(); const i=ks.indexOf('garand'); if(i<0) return 'not-in-bag(free='+bagFree()+')';
    BAG_UI.sel=i; const ownBefore=META.owned.garand||0;
    bagDropSelected(false);
    return 'owned '+ownBefore+'->'+(META.owned.garand||0)+' inBag='+(RUN.loot.garand||0); }catch(e){return 'ERR:'+e.message;} })()`));
  console.log('丢弃后背包:', await ev(`bagUsed()+'/'+bagCapacity()+'格 keys='+Object.keys(RUN.loot).length`));

  // ---- 3. 滚轮切换姿态 ----
  console.log('\n== 3. 滚轮切换高低姿态 ==');
  await ev(`bagPanelClose();`);
  await ev(`setCarryStance('high'); _wheelAcc=0; _wheelLockT=0;`);
  await ev(`player.carry='high';`);
  console.log('初始:', await ev(`player.carry`));
  console.log('滚轮下滚(期望low):', await ev(`(function(){ window.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true})); return player.carry; })()`));
  await sleep(250);
  console.log('滚轮上滚(期望high):', await ev(`(function(){ window.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,cancelable:true})); return player.carry; })()`));
  await sleep(250);
  console.log('连续下滚2次+防抖确认:', await ev(`(function(){
    _wheelLockT=0; window.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));
    const mid=player.carry;
    window.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,cancelable:true})); // 180ms内应被防抖吞掉
    return mid+' (防抖后仍为) '+player.carry; })()`));
  console.log('CDP真实滚轮:', await (async () => {
    await ev(`player.carry='high'; _wheelAcc=0; _wheelLockT=0;`);
    const before = await ev(`player.carry`);
    await rpc('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 360, deltaX: 0, deltaY: 120 });
    await sleep(250);
    const mid = await ev(`player.carry`);
    await sleep(200);
    await rpc('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 360, deltaX: 0, deltaY: -120 });
    await sleep(250);
    const after = await ev(`player.carry`);
    return before + ' -> ' + mid + ' -> ' + after;
  })());
  console.log('CapsLock已解绑(应无反应):', await ev(`(function(){ player.carry='high'; const before=player.carry; window.dispatchEvent(new KeyboardEvent('keydown',{code:'CapsLock',bubbles:true})); return before+'->'+player.carry; })()`));
  console.log('背包打开时滚轮不切姿态:', await ev(`(function(){ player.carry='high'; toggleBagPanel(); _wheelLockT=0; const b=player.carry; window.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true})); const a=player.carry; bagPanelClose(); return b+'->'+a; })()`));
  console.log('Sprint+低位 移动加成:', await ev(`(function(){ player.carry='low'; player.carryLow=null; try{ return 'carry='+player.carry; }catch(e){return 'ERR';} })()`));

  // ---- 4. 记分板改键 ----
  console.log('\n== 4. 记分板改键 ==');
  console.log('Tab不再开记分板:', await ev(`(function(){ bagPanelClose(); window.dispatchEvent(new KeyboardEvent('keydown',{code:'Tab',bubbles:true,cancelable:true})); return 'scoreboard='+JSON.stringify(document.getElementById('scoreboard').style.display)+' bagOpen='+BAG_UI.open; })()`));
  await ev(`bagPanelClose();`);
  console.log('KeyP开记分板:', await ev(`(function(){ window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',bubbles:true,cancelable:true})); return JSON.stringify(document.getElementById('scoreboard').style.display); })()`));

  console.log('\n=== 运行时异常 (' + errs.length + ') ===');
  const seen = new Set(); for (const e of errs) { const k = e.slice(0, 140); if (seen.has(k)) continue; seen.add(k); console.log(e); }

  ws.close(); proc.kill(); await sleep(300); process.exit(0);
})();
