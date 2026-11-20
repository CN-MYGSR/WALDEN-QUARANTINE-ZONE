// 倒地/救援机制接入: 5 处外科手术 + HUD + CSS
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const RESCUE_STATE = [
  "// 救援倒地队友 (由 57_downed 提供 tryStartRescue / canBeRescued / reviveUnit)",
  '// 优先级: 战斗 > 救援 > 搜索 —— 决策处已在 tryStartLoot 之前拦了一道',
  "if(this.state==='rescue'){",
  'const rt=this.rescueMate;',
  'if(!rt||!canBeRescued(rt)){ this.state=\'idle\'; this.rescueMate=null; this.rescueProg=0; }',
  'else {',
  'const rd=Math.hypot(rt.pos.x-this.pos.x,rt.pos.z-this.pos.z);',
  'if(rd>DOWN_RESCUE_R){',
  'this.crouch=false;',
  'const rmy=this.followPath(dt);',
  'if(rmy===null&&this.repathT<=0){ this.setPathTo(rt.pos.x,rt.pos.z); this.repathT=1.0; }',
  'if(rmy!==null){ moveYaw=rmy; wantMove=true; speed=3.4; }',
  '} else {',
  'this.crouch=true;',
  'this.faceTo(V3(rt.pos.x,this.pos.y,rt.pos.z),dt,5);',
  'this.rescueProg=(this.rescueProg||0)+dt;',
  'if(this.mesh&&Math.random()<dt*6) this.mesh.armR.sh.userData.swing=0.3;',
  'if(this.rescueProg>=DOWN_RESCUE_T){ this.rescueProg=0; this.rescueMate=null; this.state=\'idle\'; reviveUnit(rt,this); }',
  '}',
  '}',
  '}',
  "else if(this.state==='loot'){",
].join('\n');

const CSS = [
  '',
  '/* ===== 倒地 / 救援 HUD (57_downed) ===== */',
  '#downHud { position:absolute; left:50%; transform:translateX(-50%); bottom:23%; display:none;',
  '  background:rgba(20,10,10,.80); border:1px solid rgba(255,120,100,.55); border-radius:6px;',
  '  padding:8px 18px; text-align:center; z-index:12; pointer-events:none; letter-spacing:1px; }',
  '#downHud .dhTitle { color:#ff9c8a; font-size:15px; font-weight:700; margin-bottom:3px; }',
  '#downHud .dhRow { color:#e0e0e0; font-size:12px; }',
  '#downHud .dhRow b { color:#ffd77a; font-size:14px; }',
  '#downHud .dhBar { width:190px; height:7px; background:#2a2020; border-radius:4px; overflow:hidden; margin-top:2px; }',
  '#downHud .dhBar i { display:block; height:100%; background:linear-gradient(90deg,#4ad98a,#a8ffd0); }',
].join('\n');

const JOBS = [
  // ① 敌人候选: 跳过已倒地 (倒地 = 退出战斗, 不该继续被点名)
  ['js/19_bot.js',
    "if(!e.alive||e.team===this.team||!this.aggroOk(e)||(typeof unitBlocks==='function'&&unitBlocks(this,e))) continue;",
    "// ⚠️ 跳过已倒地目标 (倒地 = 退出战斗, 不该继续被点名; 想处决得手动打)\n" +
    "if(!e.alive||e.downed||e.team===this.team||!this.aggroOk(e)||(typeof unitBlocks==='function'&&unitBlocks(this,e))) continue;"],
  // ② 决策点: 救援插在「搜索」之前 (顺序 = 优先级)
  ['js/19_bot.js',
    '// 翻找容器 / 尸体 (非交战或敌人尚远时)\nif(this.tryStartLoot(engaged,distT)) return;',
    '// 救援倒地队友 —— 优先级: 战斗 > 救援 > 搜索 (由 57_downed 提供)\n' +
    'if(this.tryStartRescue(engaged,distT)) return;\n' +
    '// 翻找容器 / 尸体 (非交战或敌人尚远时)\nif(this.tryStartLoot(engaged,distT)) return;'],
  // ③ 状态体: 救援 (放在 loot 之前, 并把 loot 的 if 改成 else if)
  ['js/19_bot.js',
    'if(legLimb<25) speed=0.6; // 腿部重伤: 几乎无法移动\nif(this.state===\'loot\'){',
    'if(legLimb<25) speed=0.6; // 腿部重伤: 几乎无法移动\n' + RESCUE_STATE],
  // ④ 玩家: 倒地时不移动/不开火
  ['js/25_player_update.js',
    'function updatePlayer(dt){\nif(!player.alive){ return; }',
    'function updatePlayer(dt){\nif(!player.alive){ return; }\n' +
    '// 倒地: 不能移动/开火/交互 (视角仍可转 —— 鼠标监听在 24_input, 只要求 player.alive)\n' +
    '// 倒计时与 HUD 由 57_downed 的 updatePlayerDowned 负责\n' +
    'if(player.downed) return updatePlayerDowned(dt);'],
  // ⑤ 交互提示: 附近有倒地队友 → 最高优先提示「F 救援」
  ['js/25_player_update.js',
    "if(GAMEMODE==='extract'&&typeof INTERACT_LOOT!=='undefined'&&INTERACT_LOOT){",
    '// 倒地队友优先 (救命最要紧) —— 由 57_downed 提供\n' +
    "if(typeof nearestDownedMateNear==='function'){\n" +
    'const _dm=nearestDownedMateNear(player.pos.x,player.pos.z,DOWN_RESCUE_R+0.8);\n' +
    "if(_dm){ setInter('<b>F</b> 救援 '+((_dm.name)||'队友'),'救援'); return; }\n" +
    '}\n' +
    "if(GAMEMODE==='extract'&&typeof INTERACT_LOOT!=='undefined'&&INTERACT_LOOT){"],
  // ⑥ tryInteract: 救援分支 (放在下机枪/迫击炮之后, 优先于其它交互)
  ['js/25_player_update.js',
    "if(player.onMortar){\nconst m3=player.onMortar;\nm3.user=null; player.onMortar=null; VM.root.visible=true;\ndocument.getElementById('heatWrap').style.display='none';\nreturn;\n}",
    "if(player.onMortar){\nconst m3=player.onMortar;\nm3.user=null; player.onMortar=null; VM.root.visible=true;\ndocument.getElementById('heatWrap').style.display='none';\nreturn;\n}\n" +
    '// 救援倒地队友 (优先级高于其它交互) —— 由 57_downed 提供\n' +
    "if(typeof playerTryRescue==='function'&&playerTryRescue()) return;"],
  // ⑦ index.html: 脚本 + HUD
  ['index.html',
    '<script src="js/56_story.js?v=20260929a"></script>',
    '<script src="js/56_story.js?v=20260929a"></script>\n<script src="js/57_downed.js?v=20260929a"></script>'],
  ['index.html',
    '<div id="storyHud" class="hidden"></div>',
    '<div id="storyHud" class="hidden"></div>\n<div id="downHud"></div>'],
];

let fatal = 0;
const cache = {};
for (const [f] of JOBS) if (!cache[f]) cache[f] = fs.readFileSync(R(f), 'utf8');
for (const [file, from] of JOBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  命中 ${n}/1  «${from.slice(0, 42).replace(/\n/g, '⏎')}»`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }
for (const [file, from, to] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
// CSS
{
  const P = R('css/style.css');
  let s = fs.readFileSync(P, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  if (s.indexOf('#downHud') >= 0) console.log('ℹ️ CSS 已有 #downHud, 跳过');
  else { fs.writeFileSync(P, s + CSS.split('\n').join(eol), 'utf8'); console.log('✅ css/style.css 已追加倒地 HUD 样式'); }
}
console.log('\n💾 已写盘: ' + [...new Set(JOBS.map(j => j[0]))].join(', '));
