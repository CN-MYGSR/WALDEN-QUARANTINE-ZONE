// 屏幕边缘反馈 —— 行为验证（真跑 59_screenfx.js，用桩模拟 DOM/玩家/开火）
// 用法: node _tools/_screenfx_probe.js
const fs = require('fs');
const SRC = fs.readFileSync('js/59_screenfx.js', 'utf8');

let pass = 0, fail = 0;
function t(name, cond, extra){
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra ? '   → ' + extra : '')); }
}

function fakeDom(){
  const els = {};
  return {
    getElementById(id){ if (!els[id]) els[id] = { id, style: {} }; return els[id]; },
    els
  };
}

function mk(opts){
  opts = opts || {};
  const dom = fakeDom();
  const win = {};
  const player = {
    hp: 440, maxHp: 440, alive: true, downed: false, team: 0, isPlayer: true,
    pos: { x: 0, y: 0, z: 0 }, suppressV: 0,
    damage(amt){ if (this.downed) return; this.hp -= amt; },   // 57_downed 同款：倒地后不动 hp
    suppress(a){ this.suppressV = Math.min(1, this.suppressV + a); }
  };
  let fired = 0;
  const fireBullet = function(){ fired++; };
  let hudCalls = 0;
  const updateHUD = function(){ hudCalls++; return 'hud-ok'; };
  const fn = new Function('player', 'fireBullet', 'updateHUD', 'document', 'window', 'tkLowHpRatio',
    SRC + '\nreturn {SCREENFX, screenFxOnShot, screenFxHurt, screenFxUpdate,' +
    ' getFire:()=>fireBullet, getHUD:()=>updateHUD, dom:document};');
  const api = fn(player, fireBullet, updateHUD, dom, win, opts.tkLowHpRatio);
  api.player = player; api.dom = dom; api.win = win;
  api.fired = () => fired; api.hudCalls = () => hudCalls;
  return api;
}

// ---------- ① 队友开火 ----------
{
  const a = mk();
  const before = a.SCREENFX.press;
  a.screenFxOnShot({ team: 0, pos: { x: 4, z: 0 } }, { x: 4, z: 0 });   // 队友 4m
  t('队友近距离开火 → 压抑值上升', a.SCREENFX.press > before, a.SCREENFX.press.toFixed(3));

  const b = mk();
  b.screenFxOnShot({ team: 0, pos: { x: 40, z: 0 } }, { x: 40, z: 0 }); // 队友 40m
  t('队友远距离开火 → 不压暗', b.SCREENFX.press === 0);

  const c = mk();
  c.screenFxOnShot({ team: 1, pos: { x: 4, z: 0 } }, { x: 4, z: 0 });   // 敌人
  t('敌人开火 → 不走这条（靠子弹擦身）', c.SCREENFX.press === 0);

  const d = mk();
  d.screenFxOnShot({ team: 0, isPlayer: true, pos: { x: 2, z: 0 } }, { x: 2, z: 0 });
  t('自己开火 → 不压暗', d.SCREENFX.press === 0);

  // 距离越近越强
  const e1 = mk(), e2 = mk();
  e1.screenFxOnShot({ team: 0, pos: { x: 3, z: 0 } }, { x: 3, z: 0 });
  e2.screenFxOnShot({ team: 0, pos: { x: 18, z: 0 } }, { x: 18, z: 0 });
  t('越近压抑越强', e1.SCREENFX.press > e2.SCREENFX.press,
    e1.SCREENFX.press.toFixed(3) + ' vs ' + e2.SCREENFX.press.toFixed(3));

  // 持续射击会累积但有上限
  const f = mk();
  for (let i = 0; i < 100; i++) f.screenFxOnShot({ team: 0, pos: { x: 2, z: 0 } }, { x: 2, z: 0 });
  t('持续开火累积有上限 (≤0.5)', f.SCREENFX.press <= 0.5 + 1e-9, f.SCREENFX.press.toFixed(3));
}

// ---------- ② 受伤血块 ----------
{
  const a = mk();
  a.screenFxHurt(40, false);
  const body = a.SCREENFX.blood;
  t('受伤 → 血块浓度上升', body > 0.2, body.toFixed(3));

  const b = mk();
  b.screenFxHurt(40, true);
  t('爆头伤害 → 血块更重', b.SCREENFX.blood > body,
    b.SCREENFX.blood.toFixed(3) + ' vs ' + body.toFixed(3));

  const c = mk();
  for (let i = 0; i < 20; i++) c.screenFxHurt(200, true);
  t('血块浓度上限 1', c.SCREENFX.blood <= 1 + 1e-9, c.SCREENFX.blood.toFixed(3));

  // 轻伤 vs 重伤
  const d1 = mk(), d2 = mk();
  d1.screenFxHurt(5, false); d2.screenFxHurt(120, false);
  t('重伤比轻伤血块更重', d2.SCREENFX.blood > d1.SCREENFX.blood,
    d1.SCREENFX.blood.toFixed(3) + ' vs ' + d2.SCREENFX.blood.toFixed(3));
}

// ---------- ③ 衰减 ----------
{
  const a = mk();
  a.screenFxHurt(40, false);
  const b0 = a.SCREENFX.blood;
  a.screenFxUpdate(1);                       // 1 秒
  t('血块会缓慢消退 (≈0.14/s)', Math.abs((b0 - a.SCREENFX.blood) - 0.14) < 0.02,
    (b0 - a.SCREENFX.blood).toFixed(3));

  a.SCREENFX.press = 0.4; a.SCREENFX.whizz = 0.4;
  a.screenFxUpdate(0.5);
  t('压抑值衰减更快 (1.6/s)', Math.abs(a.SCREENFX.press - 0.0) < 0.05 || a.SCREENFX.press < 0.4,
    a.SCREENFX.press.toFixed(3));
  t('擦身脉冲衰减 (2.2/s)', a.SCREENFX.whizz < 0.4, a.SCREENFX.whizz.toFixed(3));
}

// ---------- ④ 低血量 / 倒地 → 持续渗血底噪 ----------
{
  const a = mk({ tkLowHpRatio: (p) => p.hp / p.maxHp });
  a.player.hp = 440 * 0.10;                  // 10% 血
  a.screenFxUpdate(0.016);
  const op = parseFloat(a.dom.els['bloodOv'].style.opacity);
  t('低血量 → 即使没挨枪也有血色底噪', op > 0.2, op);

  const b = mk({ tkLowHpRatio: (p) => p.hp / p.maxHp });
  b.player.hp = 440;
  b.player.downed = true;
  b.screenFxUpdate(0.016);
  t('倒地 → 血色底噪 ≥0.55', parseFloat(b.dom.els['bloodOv'].style.opacity) >= 0.55,
    b.dom.els['bloodOv'].style.opacity);

  const c = mk({ tkLowHpRatio: (p) => p.hp / p.maxHp });
  c.player.hp = 440;                          // 满血
  c.screenFxUpdate(0.016);
  t('满血无伤 → 血色为 0', parseFloat(c.dom.els['bloodOv'].style.opacity) === 0,
    c.dom.els['bloodOv'].style.opacity);
}

// ---------- ⑤ 压抑遮罩合成 ----------
{
  const a = mk();
  a.player.suppressV = 0.5;
  a.SCREENFX.press = 0.2;
  a.screenFxUpdate(0.016);
  const op = parseFloat(a.dom.els['supOv'].style.opacity);
  t('压抑遮罩 = suppressV*0.7 + 队友开火 + 擦身', op > 0.3 && op < 0.92, op);

  const b = mk();
  b.player.suppressV = 1; b.SCREENFX.press = 0.5; b.SCREENFX.whizz = 1;
  b.screenFxUpdate(0.016);
  t('压抑遮罩有上限 (≤0.92)', parseFloat(b.dom.els['supOv'].style.opacity) <= 0.92,
    b.dom.els['supOv'].style.opacity);
}

// ---------- ⑥ 接线：damage / suppress / fireBullet / updateHUD ----------
{
  const a = mk();
  const b0 = a.SCREENFX.blood;
  a.player.damage(40);                        // 走包装后的 damage
  t('player.damage 包装: 掉血 → 血块上升', a.SCREENFX.blood > b0, a.SCREENFX.blood.toFixed(3));

  const b = mk();
  b.player.downed = true;
  const c0 = b.SCREENFX.blood;
  b.player.damage(30);                        // 倒地: 桩不动 hp (模拟 57 的拦截)
  t('倒地后中弹 (hp 不变) 仍会渗血', b.SCREENFX.blood > c0, b.SCREENFX.blood.toFixed(3));

  const c = mk();
  const w0 = c.SCREENFX.whizz;
  c.player.suppress(0.35);                    // 子弹擦身
  t('子弹擦身 → 短促压暗脉冲', c.SCREENFX.whizz > w0, c.SCREENFX.whizz.toFixed(3));

  const d = mk();
  d.getFire()({ team: 0, pos: { x: 3, z: 0 } }, { x: 3, z: 0 });   // 调用被包装的 fireBullet
  t('fireBullet 包装: 队友开火会触发压抑', d.SCREENFX.press > 0, d.SCREENFX.press.toFixed(3));
  t('fireBullet 包装: 原函数仍被调用', d.fired() === 1, d.fired());

  const e = mk();
  const ret = e.getHUD()(0.016);
  t('updateHUD 包装: 原函数仍被调用', e.hudCalls() === 1);
  t('updateHUD 包装: 返回值透传', ret === 'hud-ok');
}

// ---------- 静态接线 ----------
{
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/style.css', 'utf8');
  t('index.html 有 #bloodOv', html.includes('id="bloodOv"'));
  t('CSS 有 #bloodOv 血块规则', /#bloodOv\{[\s\S]{0,400}radial-gradient/.test(css));
  t('59_screenfx.js 已加载', /js\/59_screenfx\.js\?v=/.test(html));
  const i58 = html.indexOf('58_vault.js'), i59 = html.indexOf('59_screenfx.js');
  const i18 = html.indexOf('18_ballistics.js'), i28 = html.indexOf('28_hud.js');
  t('59 加载在 18_ballistics / 28_hud 之后', i59 > i18 && i59 > i28 && i59 > i58);
  t('血块遮罩在 #vig 之后 (能盖住暗角)', html.indexOf('id="bloodOv"') > html.indexOf('id="vig"'));
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) + ' 项' : '✅ 全部 ' + pass + ' 项通过'));
process.exit(fail ? 1 : 0);
