// 部署按钮也要拦 —— consumeRaidStart() 会先清掉「待建局」标记再调 startMatch,
// 若只在 startMatch 里 return, 紧接着的 deployPlayer() 照样执行 → 玩家被扔进一个没有 NPC 的空图
const fs = require('fs');
const P = 'js/29_menus.js';
let s = fs.readFileSync(P, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';

const from = "el('deployBtn').onclick=()=>{" + eol + "if(respawnCd>0||matchOver) return;";
const to = "el('deployBtn').onclick=()=>{" + eol + "if(respawnCd>0||matchOver) return;" + eol +
  "// 剧情专用地图只能从主菜单「剧情模式」进入" + eol +
  "if(typeof storyMapBlocked==='function'&&storyMapBlocked()){" + eol +
  "if(typeof showScorePop==='function') showScorePop('剧情地图只能在剧情模式进入 —— 请先选一张沙盒地图');" + eol +
  "return;" + eol +
  "}";

const n = s.split(from).length - 1;
if (n !== 1) { console.log('❌ 命中 ' + n + ' 次 (期望 1)'); process.exit(1); }
fs.writeFileSync(P, s.split(from).join(to), 'utf8');
console.log('✅ 部署按钮守卫已加');
