// 翻越功能 —— 行为验证 (真跑 58_vault.js 里的函数, 用伪造的 BOXES 模拟窗台/沙袋/高墙)
// 用法: node _tools/_vault_probe.js
const fs = require('fs');
const SRC = fs.readFileSync('js/58_vault.js', 'utf8');

let pass = 0, fail = 0;
function t(name, cond, extra){
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra ? '   → ' + extra : '')); }
}

// 造一个 box: 用中心 + 尺寸 (与 addBoxCollider 一致)
function B(cx, cy, cz, w, h, d){
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2, minZ: cz - d / 2, maxZ: cz + d / 2, gh: 0 };
}

// 用给定环境跑一遍 58_vault 的函数
function mk(boxes, player, opt){
  opt = opt || {};
  const win = {};
  const fn = new Function('BOXES', 'player', 'nowT', 'standHeight', 'AudioSys', 'window',
    SRC + '\nreturn {VAULT, vaultFind, vaultTry, updateVault, vaultNearBoxes, vaultScanAt};');
  const api = fn(boxes, player, opt.nowT || 0, opt.standHeight || (() => 0), { footstep(){} }, win);
  api.win = win;
  return api;
}

// 一个标准玩家: 站在 (x,y,z), 朝 +x (yaw = -PI/2)
function P(x, y, z, extra){
  const p = Object.assign({
    alive: true, downed: false, vaultT: 0, vaulting: false, onGround: true,
    prone: false, crouch: false, bandaging: 0, stamina: 1,
    onVehicle: 0, onMG: 0, onAT: 0, onAA: 0, onMortar: 0, _onLadder: 0,
    pos: { x: x, y: y, z: z }, vel: { set(){} }, yaw: -Math.PI / 2
  }, extra || {});
  return p;
}

// ---------- 场景 1: 街区窗户（窗台 0.95 + 窗楣 2.35，两侧实墙） ----------
const WINDOW = [
  B(0, 0.475, 0, 0.30, 0.95, 1.40),    // 窗台
  B(0, 2.575, 0, 0.30, 0.45, 1.40),    // 窗楣
  B(0, 1.40, 2.20, 0.30, 2.80, 3.00),  // 左侧实墙 (z 0.7~3.7)
  B(0, 1.40, -2.20, 0.30, 2.80, 3.00)  // 右侧实墙
];
{
  const p = P(-1.2, 0, 0);
  const a = mk(WINDOW, p);
  const f = a.vaultFind();
  t('窗户: 能翻', !!f, JSON.stringify(f && { d: +f.dist.toFixed(2), top: f.top, to: f.to }));
  t('窗户: 落点已越过窗台 (x > 0.57)', !!f && f.to.x > 0.57, f && f.to.x.toFixed(2));
  t('窗户: 落点高度 = 地面', !!f && Math.abs(f.to.y) < 0.01);
  t('窗户: 不会落在实墙里 (|z| 保持 0 附近)', !!f && Math.abs(f.to.z) < 0.2);

  const ok = a.vaultTry();
  t('窗户: vaultTry 返回 true 并进入翻越态', ok && p.vaulting && p.vaultT > 0);
  // 跑完整个动画
  for (let i = 0; i < 200 && p.vaultT > 0; i++) a.updateVault(1 / 60);
  t('窗户: 动画结束后落在目标点', Math.abs(p.pos.x - f.to.x) < 1e-6 && Math.abs(p.pos.z - f.to.z) < 1e-6);
  t('窗户: 结束后恢复 onGround / 清 vaulting', p.onGround === true && p.vaulting === false && p.vaultT === 0);
  t('窗户: 冷却已设置', p.vaultNext > 0);
}

// ---------- 场景 2: 沙袋（高 1.0，厚 0.75） ----------
{
  const boxes = [B(0, 0.5, 0, 0.75, 1.0, 4.0)];
  const p = P(-1.2, 0, 0);
  const a = mk(boxes, p);
  const f = a.vaultFind();
  t('沙袋: 能翻', !!f);
  t('沙袋: 落点在另一侧 (x > 0.8)', !!f && f.to.x > 0.8, f && f.to.x.toFixed(2));
}

// ---------- 场景 3: 整面高墙 (2.8m) → 不能翻 ----------
{
  const p = P(-1.2, 0, 0);
  const a = mk([B(0, 1.4, 0, 0.30, 2.80, 6.0)], p);
  t('高墙: 不能翻', a.vaultFind() === null);
}

// ---------- 场景 4: 1.6m 的墙（超过上限 1.42）→ 不能翻 ----------
{
  const p = P(-1.2, 0, 0);
  const a = mk([B(0, 0.8, 0, 0.30, 1.60, 6.0)], p);
  t('1.6m 墙: 不能翻', a.vaultFind() === null);
}

// ---------- 场景 5: 0.3m 的坎 → 本来就迈得过去, 不算翻越 ----------
{
  const p = P(-1.2, 0, 0);
  const a = mk([B(0, 0.15, 0, 0.60, 0.30, 6.0)], p);
  t('矮坎(0.3m): 不触发翻越 (直接走过去)', a.vaultFind() === null);
}

// ---------- 场景 6: 二楼窗户（从地面看）→ 不能翻 ----------
{
  const p = P(-1.2, 0, 0);
  const boxes = [B(0, 3.475, 0, 0.30, 0.95, 1.4), B(0, 5.575, 0, 0.30, 0.45, 1.4)];
  const a = mk(boxes, p);
  t('二楼窗台(脚下 3m): 不能翻', a.vaultFind() === null);
}

// ---------- 场景 7: 沙袋后面紧贴高墙 → 没有落脚点, 不能翻 ----------
{
  const boxes = [B(0, 0.5, 0, 0.75, 1.0, 4.0), B(0.8, 1.4, 0, 0.30, 2.80, 4.0)];
  const p = P(-1.2, 0, 0);
  const a = mk(boxes, p);
  t('沙袋+背后高墙: 不能翻 (没有落脚点)', a.vaultFind() === null);
}

// ---------- 场景 8: 二楼窗台往外翻 (楼层 3.05m) → 现在可以翻 ----------
{
  const boxes = [B(0, 3.525, 0, 0.30, 0.95, 1.4), B(0, 5.625, 0, 0.30, 0.45, 1.4)];
  const p = P(-1.2, 3.05, 0);
  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 0 : 3.05) });
  const f = a.vaultFind();
  t('二楼窗台往外翻(落差 3.05m): 能翻', !!f, f && f.to.y);
  t('二楼往外翻: 落点在地面 (y=0)', !!f && Math.abs(f.to.y) < 0.01, f && f.to.y);
}

// ---------- 场景 8b: 三楼窗台 (落差 6.1m) → 太深, 不能翻 ----------
{
  const boxes = [B(0, 6.575, 0, 0.30, 0.95, 1.4), B(0, 8.675, 0, 0.30, 0.45, 1.4)];
  const p = P(-1.2, 6.1, 0);
  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 0 : 6.1) });
  t('三楼窗台往外翻(落差 6.1m): 不能翻 (超过 maxDrop 4.6)', a.vaultFind() === null);
}

// ---------- 场景 8c: 落点比脚下高 1.5m → 不能翻 (只能往下/平) ----------
{
  const boxes = [B(0, 0.475, 0, 0.30, 0.95, 1.4)];
  const p = P(-1.2, 0, 0);
  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 1.5 : 0) });
  t('落点高 1.5m: 不能翻', a.vaultFind() === null);
}

// ---------- 场景 8d: 落点高 0.5m (矮台阶) → 仍能翻 ----------
{
  const boxes = [B(0, 0.475, 0, 0.30, 0.95, 1.4)];
  const p = P(-1.2, 0, 0);
  const a = mk(boxes, p, { standHeight: (x) => (x > 0 ? 0.5 : 0) });
  t('落点高 0.5m: 能翻 (允许向上 0.8m)', a.vaultFind() !== null);
}

// ---------- 场景 9: 状态闸门 ----------
{
  const base = () => P(-1.2, 0, 0);
  const cases = [
    ['趴下', { prone: true }], ['倒地', { downed: true }], ['离地', { onGround: false }],
    ['架机枪', { onMG: 1 }], ['爬梯子', { _onLadder: 1 }], ['没体力', { stamina: 0.05 }],
    ['正在包扎', { bandaging: 1 }], ['正在翻越', { vaultT: 0.2 }]
  ];
  let allBlocked = true, bad = '';
  for (const [name, ex] of cases) {
    const p = Object.assign(base(), ex);
    const a = mk(WINDOW, p);
    if (a.vaultFind() !== null) { allBlocked = false; bad += name + ' '; }
  }
  t('状态闸门: 趴/倒/离地/机枪/梯子/无体力/包扎/翻越中 都不触发', allBlocked, bad);
}

// ---------- 场景 10: 冷却 ----------
{
  const p = P(-1.2, 0, 0);
  const a = mk(WINDOW, p, { nowT: 10 });
  a.vaultTry();
  p.vaulting = false; p.vaultT = 0;              // 假装翻完了, 但冷却还没过
  const f = a.vaultFind();
  t('冷却: 0.35s 内不能连续翻', f === null, f && f.dist);
}

// ---------- 场景 11: 没障碍时 vaultTry=false → 让跳跃照常执行 ----------
{
  const p = P(-1.2, 0, 0);
  const a = mk([], p);
  t('空旷处: vaultTry 返回 false (跳跃照常)', a.vaultTry() === false);
}

// ---------- 场景 12: 斜对窗户也能翻 (左右各试 0.14/0.28 弧度) ----------
{
  const p = P(-1.2, 0, 0, { yaw: -Math.PI / 2 + 0.20 });
  const a = mk(WINDOW, p);
  t('斜着对准窗户: 仍能翻 (允许 ±0.28rad)', a.vaultFind() !== null);
}

// ---------- 静态接线检查 ----------
{
  const strip = (x) => x.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // ⚠️ 断言前先剥行注释, 否则被注释掉的代码也算通过
  const upd = strip(fs.readFileSync('js/25_player_update.js', 'utf8'));
  const html = fs.readFileSync('index.html', 'utf8');
  t('updatePlayer 有翻越钩子', /if\(player\.vaultT>0\) return updateVault\(dt\);/.test(upd));
  t('跳跃分支先试翻越', /if\(!\(typeof vaultTry==='function'&&vaultTry\(\)\)\)\{/.test(upd));
  t('58_vault.js 已加载', /js\/58_vault\.js\?v=/.test(html));
  const i25 = html.indexOf('js/25_player_update.js'), i58 = html.indexOf('js/58_vault.js');
  t('58_vault.js 在 25_player_update 之后加载', i58 > i25 && i25 > 0);
  t('58_vault 不依赖 OCC (用 BOXES, 与 collideMove 同一套)', !/occBlocked|OCC\./.test(strip(SRC)));
  t('58_vault 用 standHeight 校验落脚点', /standHeight\(x,z,feet\+0\.3\)/.test(SRC));
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) + ' 项' : '✅ 全部 ' + pass + ' 项通过'));
process.exit(fail ? 1 : 0);
