// 一次性补丁: 按用户要求精简触屏按钮 —— 只保留点名项 + 系统行 + 搜刮面板三键
//   删除(11): tCrouch tReload tSwap tMelee tNade tNadeType tHeal tEat tSkill tBuildSel tBrace
//   保留(17): tFire tAds tJump tLeanL tLeanR tFlash tBag tInteract tAttack tGuard tFollow
//             tMap tScore tMenu  +  tSelUp tSelDown tTake (仅搜刮面板内浮出)
// 注意: syncNadeUI / show() 等辅助函数会对 null 取 .classList, 所以删按钮必须同步删 JS 引用,
//       否则每帧抛 TypeError。这里一并清掉 nadeSel/nadeAvail/syncNadeUI 与所有相关 case。
const fs = require('fs');
const stats = [];
function rep(file, from, to, expect) {
  let s = fs.readFileSync(file, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const F = from.split('\n').join(eol), T = to.split('\n').join(eol);
  const parts = s.split(F); const n = parts.length - 1;
  if (n !== expect) throw new Error(`[${file}] 命中 ${n} 次, 期望 ${expect}\n--- 片段 ---\n${from.slice(0, 220)}`);
  fs.writeFileSync(file, parts.join(T), 'utf8');
  stats.push(`${file}: ${n}x  ${from.slice(0, 54).replace(/\n/g, '\\n')}`);
}

const H = 'index.html';
const DROP_HTML = [
  `<div class="tbtn" id="tCrouch" data-act="crouch"><span class="tIco">▼</span><span class="tLbl">蹲/趴</span></div>`,
  `<div class="tbtn sm" id="tReload" data-act="reload"><span class="tIco">⟳</span><span class="tLbl">换弹</span></div>`,
  `<div class="tbtn sm" id="tSwap" data-act="swap"><span class="tIco">⇄</span><span class="tLbl">切枪</span></div>`,
  `<div class="tbtn sm" id="tMelee" data-act="melee"><span class="tIco">🗡</span><span class="tLbl">近战</span></div>`,
  `<div class="tbtn" id="tNade" data-act="nade"><span class="tIco">◔</span><span class="tLbl">手雷</span></div>`,
  `<div class="tbtn sm" id="tNadeType" data-act="nadetype"><span class="tLbl">雷种</span></div>`,
  `<div class="tbtn sm" id="tHeal" data-act="heal"><span class="tIco">✚</span><span class="tLbl">用药</span></div>`,
  `<div class="tbtn sm" id="tEat" data-act="eat" style="display:none"><span class="tIco">🍖</span><span class="tLbl">进食</span></div>`,
  `<div class="tbtn sm" id="tSkill" data-act="skill"><span class="tLbl">技能</span></div>`,
  `<div class="tbtn sm" id="tBuildSel" data-act="buildsel"><span class="tLbl">工事</span></div>`,
  `<div class="tbtn sm" id="tBrace" data-act="brace"><span class="tIco">▙</span><span class="tLbl">架枪</span></div>`,
];
for (const line of DROP_HTML) rep(H, line + '\n', '', 1);

const C = 'css/style.css';
rep(C, `#tCrouch { right:calc(98px + var(--sa-r)); bottom:calc(198px + var(--sa-b)); width:52px; height:52px; }\n#tReload { right:calc(160px + var(--sa-r)); bottom:calc(148px + var(--sa-b)); width:52px; height:52px; }\n#tSwap   { right:calc(216px + var(--sa-r)); bottom:calc(84px + var(--sa-b)); width:48px; height:48px; }\n#tMelee  { right:calc(56px + var(--sa-r)); bottom:calc(282px + var(--sa-b)); width:48px; height:48px; }\n`, '', 1);
rep(C, `/* —— 投掷物 —— */\n#tNade     { right:calc(148px + var(--sa-r)); bottom:calc(238px + var(--sa-b)); width:56px; height:56px; background:rgba(120,110,40,.35); }\n#tNadeType { right:calc(154px + var(--sa-r)); bottom:calc(300px + var(--sa-b)); width:44px; height:44px; border-radius:10px; }\n/* —— 左手簇 —— */\n#tHeal   { left:calc(24px + var(--sa-l)); top:38%; width:50px; height:50px; background:rgba(50,110,60,.4); }\n#tSkill  { left:calc(24px + var(--sa-l)); top:calc(38% + 58px); width:50px; height:50px; background:rgba(60,90,140,.35); }\n#tBuildSel { left:calc(82px + var(--sa-l)); top:calc(38% + 64px); width:44px; height:44px; border-radius:10px; }\n#tBrace  { left:calc(24px + var(--sa-l)); top:calc(38% - 58px); width:48px; height:48px; }\n`, '', 1);

const T = 'js/31_touch.js';
// 1) 去掉手雷选择状态
rep(T, `let nadeSel=0; // 0=手雷 1=烟雾 2=AT雷\n`, '', 1);
// 2) 去掉手雷辅助函数 (它们直接对 tNade/tNadeType 取 .tLbl, 元素没了就会抛)
rep(T, `// ---------- 手雷种类 ----------
function nadeAvail(){
const a=[];
if(player.nadeCount>0) a.push(0);
if((player.flashCount||0)>0) a.push(1);
if(player.smokeCount>0) a.push(2);
return a;
}
function syncNadeUI(){
const names=['手雷','闪光','烟雾'];
const counts=[player.nadeCount,player.flashCount||0,player.smokeCount];
const av=nadeAvail();
if(av.length&&!av.includes(nadeSel)) nadeSel=av[0];
const nb=$('tNade');
nb.querySelector('.tLbl').textContent=names[nadeSel]+'×'+(counts[nadeSel]||0);
$('tNadeType').querySelector('.tLbl').textContent='换'+names[(av[(av.indexOf(nadeSel)+1)%Math.max(av.length,1)]??nadeSel)];
}
`, '', 1);
// 3) pressAct: 删掉被移除按钮的动作
rep(T, `case 'jump': keys.Space=true; claim.jumpKey=true; break;
case 'crouch':
claim.longT=setTimeout(()=>{ claim.longT=null; if(player.alive) InputActions.toggleProne(); },430);
break;
case 'reload': if(player.alive) tryReload(); break;
case 'swap': if(player.alive) switchSlot(player.curSlot===0?1:0); break;
case 'melee': if(player.alive) InputActions.melee(); break;
case 'nade':
if(!player.alive) break;
if(nadeSel===0){
// 触屏: 第一次按 = 拿出手雷; 已就位时按住 = 蓄力, 松手投出
if(VM.state==='nade'&&player.nadeHeld){ InputActions.nadeChargeStart(); claim.nadeHold=true; }
else InputActions.nadeEquip();
}
else if(nadeSel===1) InputActions.throwFlash();
else InputActions.throwSmoke();
break;
case 'nadetype': {
const av=nadeAvail();
if(av.length>1){ nadeSel=av[(av.indexOf(nadeSel)+1)%av.length]; AudioSys.click(1400,0.2,0.04); }
syncNadeUI();
break;
}
case 'heal': if(player.alive) InputActions.bandage(); break;
case 'eat': if(player.alive) InputActions.eatFood(); break;
`, `case 'jump': keys.Space=true; claim.jumpKey=true; break;
`, 1);
rep(T, `case 'skill': if(player.alive) InputActions.classSkill(); break;
case 'buildsel': if(player.alive) InputActions.buildNext(); break;
case 'brace': if(player.alive) InputActions.toggleBrace(); break;
`, '', 1);
rep(T, `case 'squadmove': if(player.alive) squadOrderMove(); break;\n`, '', 1);
// 4) releaseAct: 删掉 crouch / nade
rep(T, `case 'crouch':
if(claim.longT){ clearTimeout(claim.longT); claim.longT=null; if(player.alive) InputActions.toggleCrouch(); }
break;
case 'nade':
if(claim.nadeHold) InputActions.nadeChargeRelease();
break;
`, '', 1);
// 5) updateTouchVis: 清掉被删按钮的所有 show/setLbl/setOn
rep(T, `show('tCrouch',onFoot||inTank);
setLbl('tCrouch',inTank?'炮镜':(p.prone?'起身':p.crouch?'起立':'蹲/趴'));
setOn('tCrouch',p.crouch||p.prone||(inTank&&p.tankView));
show('tReload',onFoot);
show('tSwap',onFoot&&p.slots.length>1);
show('tMelee',onFoot);
show('tNade',onFoot&&nadeAvail().length>0);
show('tNadeType',onFoot&&nadeAvail().length>1);
if(onFoot) syncNadeUI();
show('tHeal',onFoot&&p.bandages>0&&p.hp<(p.maxHp||100));
setLbl('tHeal','绷带×'+p.bandages);
const skillOn=onFoot&&(p.cls===2||p.cls===4);
show('tSkill',skillOn);
if(skillOn) setLbl('tSkill',p.cls===2?'医疗箱':'建造');
show('tBuildSel',onFoot&&p.cls===4);
if(onFoot&&p.cls===4){ const bt=BUILD_MENU[p.buildSel||0]; setLbl('tBuildSel',bt==='mg'?'机枪':BUILD_NAMES[bt]); }
show('tBrace',onFoot&&(p.canBrace||p.braced));
setOn('tBrace',p.braced);
`, '', 1);

console.log('OK\n' + stats.join('\n'));
