// 翻越功能接线: updatePlayer 两个钩子 + index.html 脚本标签
const fs = require('fs');

function read(p){ return fs.readFileSync(p, 'utf8'); }
function rep(s, from, to, tag, want){
  const n = s.split(from).length - 1;
  const w = want === undefined ? 1 : want;
  if (n !== w) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次 (期望 ' + w + ')'); process.exit(1); }
  console.log('✅ [' + tag + '] 命中 ' + n + ' 次');
  return s.split(from).join(to);
}

// ===== ① 25_player_update.js =====
let s = read('js/25_player_update.js');
const E = s.includes('\r\n') ? '\r\n' : '\n';

// 1) 倒地钩子后面加翻越钩子 (位置完全由 58_vault 驱动)
s = rep(s,
  'if(player.downed) return updatePlayerDowned(dt);',
  'if(player.downed) return updatePlayerDowned(dt);' + E +
  '// 翻越: 0.4s 的脚本化跨越, 位置由 58_vault 的 updateVault 直接驱动 (不参与常规碰撞)' + E +
  'if(player.vaultT>0) return updateVault(dt);',
  'updatePlayer 翻越钩子');

// 2) 跳跃分支: 能翻就翻, 翻不了才跳
s = rep(s,
  'if(keys.Space&&p.onGround&&p.stamina>0.05){ p.vel.y=4.6; p.onGround=false; p.stamina-=0.05; p.stamUseT=nowT; p.crouch=false; p.prone=false; p.braced=false; }',
  'if(keys.Space&&p.onGround&&p.stamina>0.05){' + E +
  '// 面朝窗户/低矮掩体时, 跳跃键优先触发翻越 (58_vault); 翻不过去才照常跳' + E +
  'if(!(typeof vaultTry===\'function\'&&vaultTry())){' + E +
  'p.vel.y=4.6; p.onGround=false; p.stamina-=0.05; p.stamUseT=nowT; p.crouch=false; p.prone=false; p.braced=false;' + E +
  '}' + E +
  '}',
  '跳跃分支拦截');
fs.writeFileSync('js/25_player_update.js', s, 'utf8');

// ===== ② index.html: 脚本标签 =====
let h = read('index.html');
const HE = h.includes('\r\n') ? '\r\n' : '\n';
const anchor = '<script src="js/57_downed.js?v=20261030a"></script>';
const add = anchor + HE + '<script src="js/58_vault.js?v=20261030a"></script>';
h = rep(h, anchor, add, 'index.html 脚本标签');
fs.writeFileSync('index.html', h, 'utf8');

console.log('\n接线完成');
