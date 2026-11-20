// MEMORY.md: 补版本号 (20261030b) + 审计组数 (13) + §4 追加翻越要点
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let s = fs.readFileSync(P, 'utf8');

function rep(from, to, tag){
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次'); process.exit(1); }
  s = s.split(from).join(to);
  console.log('✅ [' + tag + ']');
}

rep('（纯文本，10 组）', '（纯文本，13 组）', '审计组数');

rep(
'- **版本号 = `20260929b`**（b=新增倒地/救援机制；a=改装新增枪托/握把两槽 + 弹鼓。上一批：`20260928b`=修 PC 触控屏无虚拟按键（`TOUCHUI`）/\n' +
'  `20260928a`=剧情配装加全景夜视仪 / `20260919r`=修剧情卡在循环里；更早见 REF）。',
'- **版本号 = `20261030b`**（b=新增翻越（窗户/低矮掩体）；a=两张剧情地图标 `storyOnly`、不再进沙盒列表。\n' +
'  上一批：`20260929b`=倒地/救援 / `20260929a`=枪托握把改装 / `20260928b`=PC 触控屏虚拟按键；更早见 REF）。',
'版本号');

// §4 末尾追加翻越要点 (插在 "## 5. 键位" 之前)
rep(
'\n## 5. 键位 / 提示文字 / 触控 / pointer-events',
'\n- **翻越**（`58_vault.js`，挂在跳跃分支上）：面朝障碍按**跳跃键** → 能翻就翻，否则照常跳（**不新增键位**，触控跳跃按钮同用）。\n' +
'  判定**只用 `BOXES`**（与 `collideMove` 同一套）—— ⚠️ **绝不能用 OCC**（2D 栅格不含高度，会把整面墙和窗台当同一回事）。\n' +
'  ⚠️ 窗户能翻是因为 `_cqbWallOpen` 把窗洞拆成「0.95 的窗台盒子 + 2.35 以上的窗楣盒子」，窗台本身就是矮墙；`maxTop:1.42`（窗台 0.95 / 沙袋 1.0 可翻，整墙 2.8 不行）。\n' +
'  ⚠️ 落脚点必须 `standHeight` 落差 ≤0.8（否则会从二楼跳下去）；`vaultT>0` 时 `updatePlayer` 直接 return，位置全由 `updateVault` 驱动。验证：`_tools/_vault_probe.js`（26 项）。\n' +
'\n## 5. 键位 / 提示文字 / 触控 / pointer-events',
'§4 翻越要点');

fs.writeFileSync(P, s, 'utf8');
const re = /^## .*$/gm; let m; const out = [];
while ((m = re.exec(s))) out.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 26));
console.log('总长 ' + s.length + ' 字符\n' + out.join('\n'));
