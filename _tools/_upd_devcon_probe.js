// 更新探针: 开关键改成 `\` (Backslash), 并在部署前开无敌 —— 否则测试途中玩家会被敌人打死, kill/suicide 测不到
const fs = require('fs');
const F = '_tools/_devcon_probe.js';
let s = fs.readFileSync(F, 'utf8');
const edits = [
  // 开关键
  [`  await key('keyDown', 'Backquote', '`', 192); await sleep(80);
  await key('keyUp', 'Backquote', '`', 192); await sleep(400);
  log('DEV.consoleOpen (应 true) : ' + await ev(\`window.DEV.consoleOpen\`));`,
   `  await key('keyDown', 'Backslash', '\\\\', 220); await sleep(80);
  await key('keyUp', 'Backslash', '\\\\', 220); await sleep(400);
  log('DEV.consoleOpen (应 true) : ' + await ev(\`window.DEV.consoleOpen\`));`],
  [`  await key('keyDown', 'Backquote', '\`', 192); await sleep(80);
  await key('keyUp', 'Backquote', '\`', 192); await sleep(400);
  log('DEV.consoleOpen (应 false): ' + await ev(\`window.DEV.consoleOpen\`));`,
   `  await key('keyDown', 'Backslash', '\\\\', 220); await sleep(80);
  await key('keyUp', 'Backslash', '\\\\', 220); await sleep(400);
  log('DEV.consoleOpen (应 false): ' + await ev(\`window.DEV.consoleOpen\`));`],
  // 部署前先开无敌, 免得测试途中被打死
  [`  log('部署: ' + await ev(\`(function(){try{
    el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
    return 'OK';}catch(e){return 'EXC '+e.message;}})()\`));`,
   `  log('部署(先开无敌, 免得测试途中被打死): ' + await ev(\`(function(){try{
    window.DEV.god=true;
    el('menu').classList.add('hidden'); startMatch(); showDeploy(false); selectedSpawn=-1; deployPlayer();
    return 'OK';}catch(e){return 'EXC '+e.message;}})()\`));`],
];
for (const [from, to] of edits) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error('命中 ' + n + ' 次: ' + from.slice(0, 50));
  s = s.split(from).join(to);
}
// 关闭测试后面补一个「左键取消聚焦」
const anchor = `  log('bag/score 键位已还原: ' + await ev(\`keyOf('bag')+' / '+keyOf('score')\`));`;
const add = anchor + `

  log('');
  log('=== 11b) 左键取消聚焦 ===');
  await key('keyDown', 'Backslash', '\\\\', 220); await sleep(60);
  await key('keyUp', 'Backslash', '\\\\', 220); await sleep(300);
  log('  重新打开: ' + await ev(\`window.DEV.consoleOpen\`));
  await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 40, button: 'left', clickCount: 1 });
  await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 40, y: 40, button: 'left', clickCount: 1 });
  await sleep(300);
  log('  左键点画面外后 consoleOpen (应 false): ' + await ev(\`window.DEV.consoleOpen\`));`;
if (s.split(anchor).length - 1 !== 1) throw new Error('锚点未命中');
s = s.split(anchor).join(add);
fs.writeFileSync(F, s, 'utf8');
console.log('探针已更新');
