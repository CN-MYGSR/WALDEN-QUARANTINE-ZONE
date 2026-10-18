'use strict';
// =====================================================================
// 52_devconsole.js —— 开发者控制台
// ---------------------------------------------------------------------
// 按 `~`(Backquote) 开关。命令行支持 ↑/↓ 历史、Tab 补全、help 查指令。
//
// 设计要点:
//   · 打开时**退出指针锁定**(这样能用鼠标选中/滚动日志), 同时把 showDeploy 临时挡掉 ——
//     否则 24_input 的 pointerlockchange 会顺手弹出部署界面。
//   · 打开时在**捕获阶段**拦下所有键盘事件并 stopImmediatePropagation, 游戏输入层收不到,
//     打字不会触发开火/换弹等动作。
//   · 倍率/开关统一挂在 window.DEV 上 (其它文件用 window.DEV.xxx 读取, 避免 TDZ)。
//   · 击杀走的是正规伤害路径 (soldier.damage → die), 所以尸体会正常注册、布娃娃正常生成。
// =====================================================================

window.DEV = window.DEV || { god:false, dmgMul:1, consoleOpen:false, frozen:false };

const DEV_EL = { root:null, log:null, input:null, hint:null };
let devHistory = [];
let devHistIdx = -1;
let devOpen = false;

// ---------------- 指令实现 ----------------
const DEV_HELP = [];
function devCmd(name, argHint, desc, fn) { DEV_HELP.push({ name, argHint, desc, fn }); }

function devPrint(text, cls) {
  if (!DEV_EL.log) return;
  const d = document.createElement('div');
  d.className = 'devLine' + (cls ? ' ' + cls : '');
  d.textContent = text;
  DEV_EL.log.appendChild(d);
  DEV_EL.log.scrollTop = DEV_EL.log.scrollHeight;
  while (DEV_EL.log.children.length > 400) DEV_EL.log.removeChild(DEV_EL.log.firstChild);
}

function devEnemies(aliveOnly) {
  if (typeof combatants === 'undefined' || !combatants.length) return [];
  return combatants.filter(s => s && s !== player && s.team !== player.team && (!aliveOnly || s.alive));
}
function devBots(aliveOnly) {
  if (typeof combatants === 'undefined' || !combatants.length) return [];
  return combatants.filter(s => s && s !== player && (!aliveOnly || s.alive));
}

// ---- help / clear ----
devCmd('help', '[指令]', '查看指令列表, 或某条指令的详细说明', (a) => {
  if (a[0]) {
    const c = DEV_HELP.find(x => x.name === a[0]);
    if (!c) return devPrint('没有这条指令: ' + a[0], 'err');
    return devPrint(`  ${c.name} ${c.argHint||''}  ——  ${c.desc}`);
  }
  devPrint('可用指令 (按 Tab 可补全):', 'ok');
  for (const c of DEV_HELP) devPrint(`  ${(c.name + ' ' + (c.argHint || '')).padEnd(22)} ${c.desc}`);
});
devCmd('clear', '', '清空控制台输出', () => { DEV_EL.log.innerHTML = ''; });

// ---- 战斗 ----
devCmd('kill', '', '击杀准星所指的敌人', () => {
  if (!player.alive) return devPrint('你已经死了', 'err');
  if (typeof raySoldiers !== 'function') return devPrint('raySoldiers 不可用', 'err');
  const o = camera.position.clone(), d = camForward();
  const hit = raySoldiers(o, d.clone(), 400, player);
  if (!hit || !hit.sol) return devPrint('准星前方没有敌人 (射线被墙挡住也算没命中)', 'err');
  const s = hit.sol;
  const nm = s.name || '(无名)';
  const wasEnemy = s.team !== player.team;
  s.damage(999999, player, true);
  devPrint(`已击杀 ${nm} ${wasEnemy ? '(敌方)' : '(友军)'} · 部位=${hit.head ? '头' : (hit.part || '躯干')}`, 'ok');
});
devCmd('killall', '[enemy|all]', '击杀全部敌人 (all = 连友军一起)', (a) => {
  const all = a[0] === 'all';
  const list = all ? devBots(true) : devEnemies(true);
  if (!list.length) return devPrint('没有可击杀的目标', 'err');
  // attacker 传 null: soldier.damage() 里有 unitBlocks(attacker,this) 的友军免伤判定,
  // 传 player 的话友军杀不掉 (all 模式会静默失效)。
  for (const s of list.slice()) { try { s.damage(999999, all ? null : player, true); } catch (e) { } }
  devPrint(`已击杀 ${list.length} 个${all ? '单位' : '敌人'}`, 'ok');
});
devCmd('suicide', '', '自杀', () => {
  if (!player.alive) return devPrint('你已经死了', 'err');
  player.damage(999999, null, true);
  devPrint('已自杀', 'ok');
});
devCmd('god', '[on|off]', '无敌开关 (不受伤)', (a) => {
  window.DEV.god = a[0] ? (a[0] !== 'off' && a[0] !== '0') : !window.DEV.god;
  devPrint('无敌: ' + (window.DEV.god ? '开' : '关'), 'ok');
});
devCmd('dmg', '[倍率]', '玩家造成的伤害倍率 (默认 1)', (a) => {
  if (!a[0]) return devPrint('当前伤害倍率: ' + window.DEV.dmgMul);
  const v = parseFloat(a[0]);
  if (!isFinite(v) || v < 0) return devPrint('倍率要是个非负数字', 'err');
  window.DEV.dmgMul = v;
  devPrint('伤害倍率 = ' + v, 'ok');
});
devCmd('dmgai', '[倍率]', '敌人造成的伤害倍率 (改 EFF_DIFF.dmgMul, 默认按难度)', (a) => {
  if (typeof EFF_DIFF === 'undefined') return devPrint('EFF_DIFF 不可用', 'err');
  if (!a[0]) return devPrint('当前敌人伤害倍率: ' + EFF_DIFF.dmgMul);
  const v = parseFloat(a[0]);
  if (!isFinite(v) || v < 0) return devPrint('倍率要是个非负数字', 'err');
  EFF_DIFF.dmgMul = v;
  devPrint('敌人伤害倍率 = ' + v, 'ok');
});

// ---- 生存 ----
devCmd('heal', '', '回满血并清除伤势/流血/疼痛', () => {
  if (typeof player.heal !== 'function') {
    player.hp = player.maxHp || 440;
  } else { try { player.heal(99999); } catch (e) { player.hp = player.maxHp || 440; } }
  player.hp = player.maxHp || 440;
  if (player.limbs) for (const k in player.limbs) player.limbs[k] = 100;
  player.bleedLight = 0; player.bleedHeavy = 0; player.fractures = [];
  if (typeof tkSyncHp === 'function') { try { tkSyncHp(player); } catch (e) { } }
  devPrint('已回满血并清除伤势', 'ok');
});
devCmd('ammo', '', '补满当前武器弹匣与备弹', () => {
  const w = player.curW; if (!w) return devPrint('手上没有武器', 'err');
  w.mag = w.def.mag; w.reserve = w.def.reserve;
  devPrint(`已补弹: ${w.def.name} ${w.mag}/${w.reserve}`, 'ok');
});
devCmd('nade', '[数量]', '补手雷/闪光/烟雾 (默认各 5)', (a) => {
  const n = Math.max(0, parseInt(a[0] || '5', 10) || 0);
  player.nadeCount = n; player.flashCount = n; player.smokeCount = n;
  devPrint(`手雷/闪光/烟雾 各 ${n}`, 'ok');
});

// ---- 装备 ----
devCmd('give', '<武器key> [数量]', '往仓库加武器 (用 list wpn 看 key)', (a) => {
  if (!a[0]) return devPrint('用法: give <武器key> [数量]', 'err');
  if (typeof WPN_DEFS === 'undefined' || !WPN_DEFS[a[0]]) return devPrint('没有这把武器: ' + a[0], 'err');
  const n = Math.max(1, parseInt(a[1] || '1', 10) || 1);
  if (typeof addOwned === 'function') addOwned(a[0], n);
  devPrint(`已入库: ${WPN_DEFS[a[0]].name} ×${n}`, 'ok');
});
devCmd('wpn', '<武器key>', '立刻换成这把枪 (无需拥有)', (a) => {
  if (!a[0]) return devPrint('用法: wpn <武器key>', 'err');
  if (typeof WPN_DEFS === 'undefined' || !WPN_DEFS[a[0]]) return devPrint('没有这把武器: ' + a[0], 'err');
  if (typeof addOwned === 'function') addOwned(a[0], 1);
  const md = typeof moddedDef === 'function' ? (moddedDef(a[0]) || WPN_DEFS[a[0]]) : WPN_DEFS[a[0]];
  player.slots[0] = { key: a[0], def: md, mag: md.mag, reserve: md.reserve };
  // 不能调 switchSlot(0): 它在 i===player.curSlot 时直接 return, 已经在 0 号位就什么都不做,
  // 结果 slots[0] 换了但 player.curW 还是旧枪。这里直接写, 并把视模型状态机复位。
  player.curSlot = 0;
  player.curW = player.slots[0];
  if (typeof VM !== 'undefined' && VM) { VM.state = 'idle'; VM.stateT = 0; VM.stateDur = 0; }
  if (typeof vmEquip === 'function') vmEquip(a[0], player.team);
  devPrint('已换装: ' + md.name, 'ok');
});

// ---- 位置 / 世界 ----
devCmd('tp', '<x> <z>', '传送到地图坐标 (y 自动取地面高度)', (a) => {
  const x = parseFloat(a[0]), z = parseFloat(a[1]);
  if (!isFinite(x) || !isFinite(z)) return devPrint('用法: tp <x> <z>', 'err');
  const y = (typeof heightAt === 'function') ? heightAt(x, z) : player.pos.y;
  player.pos.set(x, y + 1.0, z);
  if (player.vel) player.vel.set(0, 0, 0);
  devPrint(`已传送到 (${x.toFixed(1)}, ${z.toFixed(1)})`, 'ok');
});
devCmd('pos', '', '显示当前位置与目标信息', () => {
  devPrint(`你: (${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)})  朝向 yaw=${player.yaw.toFixed(2)}`);
  const ex = (typeof EXTRACT_POINTS !== 'undefined') ? EXTRACT_POINTS : [];
  if (ex.length) {
    const d = Math.min(...ex.map(p => Math.hypot(player.pos.x - p.x, player.pos.z - p.z)));
    devPrint(`最近撤离点: ${d.toFixed(1)}m`);
  }
});
devCmd('bots', '', '统计场上敌我人数与存活情况', () => {
  const es = devEnemies(false), fs2 = devBots(false).filter(s => s.team === player.team);
  const alive = (l) => l.filter(s => s.alive).length;
  devPrint(`敌方 ${alive(es)}/${es.length} 存活 · 友军 ${alive(fs2)}/${fs2.length} 存活`);
});
devCmd('weather', '<模式>', '切换天气 (会重载页面生效; 用 list weather 看可选)', (a) => {
  if (typeof WEATHER_MODES === 'undefined') return devPrint('WEATHER_MODES 不可用', 'err');
  if (!a[0]) return devPrint('当前: ' + WEATHER_MODE + ' · 可选: ' + Object.keys(WEATHER_MODES).join(' '));
  if (!WEATHER_MODES[a[0]]) return devPrint('没有这个天气: ' + a[0], 'err');
  try { localStorage.setItem('sf_weather', a[0]); } catch (e) { }
  devPrint('天气已设为 ' + WEATHER_MODES[a[0]].name + ' · 重载中…', 'ok');
  setTimeout(() => location.reload(), 500);
});
devCmd('nvg', '', '开关夜视仪 (需已携带)', () => {
  if (typeof NVG === 'undefined') return devPrint('NVG 不可用', 'err');
  const before = NVG.active();
  NVG.toggle();
  const after = NVG.active();
  // toggle() 在"未携带"时会静默不动 —— 对比前后状态才能分辨是没带还是真切换了
  if (before === after) return devPrint('夜视仪没有变化 · 多半是没携带 (工坊装入战术配件槽 + 仓库持有夜视仪)', 'err');
  devPrint('夜视仪: ' + (after ? '开' : '关'), 'ok');
});

// ---- 局外 ----
devCmd('money', '[金额]', '增加作战货币', (a) => {
  const v = parseInt(a[0] || '100000', 10) || 0;
  if (typeof META === 'undefined') return devPrint('META 不可用', 'err');
  META.wallet = (META.wallet || 0) + v;
  if (typeof saveMeta === 'function') saveMeta();
  devPrint(`货币 +${v} → ${META.wallet}`, 'ok');
});
devCmd('xp', '[经验]', '增加经验 (自动升级)', (a) => {
  const v = parseInt(a[0] || '1000', 10) || 0;
  if (typeof META === 'undefined') return devPrint('META 不可用', 'err');
  META.xp = (META.xp || 0) + v;
  if (typeof XP_PER_LEVEL !== 'undefined') {
    let ups = 0;
    while (META.xp >= XP_PER_LEVEL) { META.xp -= XP_PER_LEVEL; META.level = (META.level || 1) + 1; ups++; }
    if (ups) devPrint(`升级 ×${ups} → Lv.${META.level}`, 'ok');
  }
  if (typeof saveMeta === 'function') saveMeta();
  devPrint(`经验 +${v} → ${Math.floor(META.xp)}`, 'ok');
});
devCmd('elo', '[评分]', '查看/设置 ELO 评分 (动态难度基准)', (a) => {
  if (typeof ELO === 'undefined') return devPrint('ELO 不可用', 'err');
  if (!a[0]) return devPrint('当前 ELO: ' + Math.round(ELO.rating) + ' · 动态难度 ' + (ELO.auto ? '开' : '关'));
  const v = parseFloat(a[0]);
  if (!isFinite(v)) return devPrint('评分要是个数字', 'err');
  ELO.rating = v;
  if (typeof eloSave === 'function') eloSave();
  devPrint('ELO = ' + Math.round(v), 'ok');
});

// ---- 列表 ----
devCmd('list', '<wpn|weather|cmd>', '列清单', (a) => {
  const what = a[0] || 'cmd';
  if (what === 'wpn') {
    const keys = Object.keys(WPN_DEFS);
    devPrint(`武器 ${keys.length} 把 (key = 名称):`, 'ok');
    for (let i = 0; i < keys.length; i += 3) {
      devPrint('  ' + keys.slice(i, i + 3).map(k => (k + '').padEnd(11) + (WPN_DEFS[k].name || '')).join(''));
    }
  } else if (what === 'weather') {
    devPrint('天气: ' + Object.keys(WEATHER_MODES).map(k => k + '(' + WEATHER_MODES[k].name + ')').join('  '));
  } else {
    devPrint('指令: ' + DEV_HELP.map(c => c.name).join(' '));
  }
});

// ---------------- 控制台 UI ----------------
function devBuildUI() {
  if (DEV_EL.root) return;
  const root = document.createElement('div');
  root.id = 'devCon';
  root.className = 'hidden';
  root.innerHTML = `
    <div id="devConLog"></div>
    <div id="devConRow"><span id="devConPrompt">&gt;</span><input id="devConInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入指令, help 查看列表"></div>
    <div id="devConHint">\ 或 Esc 关闭 · 左键点画面外也关 · ↑/↓ 历史 · Tab 补全 · help 查看指令</div>`;
  document.body.appendChild(root);
  DEV_EL.root = root;
  DEV_EL.log = root.querySelector('#devConLog');
  DEV_EL.input = root.querySelector('#devConInput');
  DEV_EL.hint = root.querySelector('#devConHint');

  DEV_EL.input.addEventListener('keydown', e => {
    if (e.code === 'Enter') {
      const line = DEV_EL.input.value.trim();
      DEV_EL.input.value = '';
      if (!line) { e.preventDefault(); e.stopPropagation(); return; }
      devHistory.push(line); devHistIdx = devHistory.length;
      devPrint('> ' + line, 'echo');
      devExec(line);
    } else if (e.code === 'ArrowUp') {
      if (devHistIdx > 0) { devHistIdx--; DEV_EL.input.value = devHistory[devHistIdx]; }
    } else if (e.code === 'ArrowDown') {
      if (devHistIdx < devHistory.length - 1) { devHistIdx++; DEV_EL.input.value = devHistory[devHistIdx]; }
      else { devHistIdx = devHistory.length; DEV_EL.input.value = ''; }
    } else if (e.code === 'Tab') {
      const v = DEV_EL.input.value.trim();
      const cands = DEV_HELP.map(c => c.name).filter(n => n.indexOf(v) === 0);
      if (cands.length === 1) DEV_EL.input.value = cands[0] + ' ';
      else if (cands.length > 1) devPrint('  ' + cands.join(' '));
    } else if (e.code === 'Escape' || e.code === 'Backslash') {
      devCloseConsole();
    }
    // 关键: 在输入框这一层就掐断冒泡 —— 事件到不了 window, 游戏输入层自然收不到,
    // 打字不会触发开火/换弹。注意不能放在 window 的捕获阶段, 那样连输入框自己都收不到。
    e.preventDefault();
    e.stopPropagation();
  });
}

function devExec(line) {
  const parts = line.split(/\s+/);
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);
  const cmd = DEV_HELP.find(c => c.name === name);
  if (!cmd) {
    const near = DEV_HELP.map(c => c.name).filter(n => n.indexOf(name.slice(0, 2)) === 0);
    devPrint('未知指令: ' + name + (near.length ? ' · 是不是想输: ' + near.join(' ') : ' · 输入 help 看列表'), 'err');
    return;
  }
  try { cmd.fn(args); }
  catch (e) { devPrint('执行出错: ' + (e && e.message ? e.message : e), 'err'); }
}

function devOpenConsole() {
  devBuildUI();
  devOpen = true;
  window.DEV.consoleOpen = true;
  devStealKeys();
  DEV_EL.root.classList.remove('hidden');
  // 放开鼠标: 退出指针锁定才能选中/滚动日志。
  // 同时把 showDeploy 挡掉 —— 24_input 的 pointerlockchange 在失去锁时会弹出部署界面。
  try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { }
  try { DEV_EL.input.focus(); } catch (e) { }
  if (!DEV_EL.log.children.length) {
    devPrint('开发者控制台 · 输入 help 查看指令', 'ok');
  }
}
function devCloseConsole() {
  if (!devOpen) return;
  devOpen = false;
  window.DEV.consoleOpen = false;
  devRestoreKeys();
  if (DEV_EL.root) DEV_EL.root.classList.add('hidden');
  try { DEV_EL.input.blur(); } catch (e) { }
  // 重新锁定鼠标, 免得玩家以为卡住了 (拿不到就算了, 点一下画面即可)
  try {
    if (typeof renderer !== 'undefined' && renderer && renderer.domElement && player.deployed && !matchOver) {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => { });
    }
  } catch (e) { }
}

// 打开期间屏蔽部署界面 (失去指针锁定 / ESC 都会触发它)
(function devGuardShowDeploy() {
  if (typeof showDeploy !== 'function') return;
  const _orig = showDeploy;
  showDeploy = function (...a) { if (window.DEV.consoleOpen) return; return _orig.apply(this, a); };
})();

// 无敌: 给 player.damage 包一层 (不改 23_player.js)
(function devGuardPlayerDamage() {
  if (typeof player === 'undefined' || !player || typeof player.damage !== 'function') return;
  const _orig = player.damage.bind(player);
  player.damage = function (amt, attacker, isHead, part) {
    if (window.DEV.god) return;
    return _orig(amt, attacker, isHead, part);
  };
})();

// ---------------- 按键 ----------------
// 开关用 window 捕获阶段 (输入框没聚焦时也能按 `~` 打开);
// 打开后真正的"吃掉按键"交给输入框自己的监听 (见 devBuildUI) —— 在那里 stopPropagation 才拦得住冒泡,
// 放在 window 捕获阶段会把输入框自己也挡掉。
let devKeyBackup = null;
function devStealKeys() {
  // bag(Tab) / score(P) 在 24_input 的 pointerLocked 检查**之前**就生效, 光靠退出指针锁定挡不住。
  // 打开控制台期间把它们临时挪到不可能按到的键上, 关闭时还原。
  if (devKeyBackup) return;
  try {
    devKeyBackup = { bag: keyOf('bag'), score: keyOf('score') };
    KEYMAP.bag = 'None'; KEYMAP.score = 'None';
  } catch (e) { devKeyBackup = null; }
}
function devRestoreKeys() {
  if (!devKeyBackup) return;
  try { KEYMAP.bag = devKeyBackup.bag; KEYMAP.score = devKeyBackup.score; } catch (e) { }
  devKeyBackup = null;
}

addEventListener('keydown', e => {
  // 主键盘区 `\` (Backslash) 开关; F2 作为备用 (某些键盘布局不好按)
  if (e.code === 'Backslash' || e.code === 'F2') {
    e.preventDefault(); e.stopImmediatePropagation();
    if (devOpen) devCloseConsole(); else devOpenConsole();
  }
}, true);

// 左键取消聚焦: 点控制台以外的地方就关掉 (点在日志/输入框里不算, 否则没法放光标)
addEventListener('mousedown', e => {
  if (!devOpen) return;
  if (DEV_EL.root && DEV_EL.root.contains(e.target)) return;
  devCloseConsole();
}, true);

// 注意: 控制台**不提供任何 UI 入口** —— 只能按 `\`(或 F2) 唤起。
// 曾经在「游戏设置」里挂过一个按钮, 已按要求删除。
