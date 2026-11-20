// 坠落伤害 —— 行为验证（真跑 60_falldmg.js）
// 用法: node _tools/_falldmg_probe.js
const fs = require('fs');
const SRC = fs.readFileSync('js/60_falldmg.js', 'utf8');

let pass = 0, fail = 0;
function t(name, cond, extra){
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? '   → ' + extra : '')); }
}

function makePlayer(){
  return {
    hp: 440, maxHp: 440, alive: true, downed: false, chute: false,
    _onLadder: 0, onVehicle: 0, onMG: 0, onAT: 0, onAA: 0, onMortar: 0,
    onGround: true, pos: { x: 0, y: 0, z: 0 },
    vaulting: false, vaultFrom: null,
    hits: [],
    damage(amt, att, head, part){ this.hits.push({ amt, part }); this.hp -= amt; }
  };
}

function mk(opts){
  opts = opts || {};
  const p = opts.player || makePlayer();
  const pops = [];
  const win = {};
  const fn = new Function('player', 'matchOver', 'updatePlayer', 'window', 'showScorePop', 'AudioSys',
    SRC + '\nreturn {FALL, fallDamageFor, fallTrack, _fall, getUpdate:()=>updatePlayer};');
  const api = fn(p, !!opts.matchOver, function(){}, win, (m) => pops.push(m), { hurt(){} });
  api.player = p; api.pops = pops; api.win = win;
  return api;
}

// ---------- ① 伤害曲线（纯函数） ----------
{
  const a = mk();
  t('3.0m 整 → 不扣血', a.fallDamageFor(3.0) === 0, a.fallDamageFor(3.0));
  t('3.05m → 有伤害但很小', a.fallDamageFor(3.05) >= 1 && a.fallDamageFor(3.05) <= 4, a.fallDamageFor(3.05));
  const d4 = a.fallDamageFor(4), d6 = a.fallDamageFor(6), d10 = a.fallDamageFor(10);
  t('4m → 30~45', d4 >= 30 && d4 <= 45, d4);
  t('6m → 120~160', d6 >= 120 && d6 <= 160, d6);
  t('10m → 接近致命 (≥80% 最大生命)', d10 >= 440 * 0.8, d10);
  t('伤害随高度单调递增', a.fallDamageFor(4) < a.fallDamageFor(5) && a.fallDamageFor(5) < a.fallDamageFor(6));
  t('有上限 (不会超过 85% 最大生命)', a.fallDamageFor(50) <= 440 * 0.85 + 1e-9, a.fallDamageFor(50));
  t('上限后不再增长', a.fallDamageFor(50) === a.fallDamageFor(30), a.fallDamageFor(30) + '/' + a.fallDamageFor(50));
}

// ---------- ② 普通跳跃不扣血 ----------
{
  const a = mk();
  const p = a.player;
  const up = a.getUpdate();
  p.onGround = false;
  p.pos.y = 0; up();                 // 起跳
  p.pos.y = 0.8; up();               // 顶点 (跳 0.81m)
  p.pos.y = 0.4; up();
  p.pos.y = 0; p.onGround = true; up();
  t('普通跳跃 (顶点 0.8m) → 不扣血', p.hits.length === 0, JSON.stringify(p.hits));
}

// ---------- ③ 从 4m 落下 ----------
{
  const a = mk();
  const p = a.player;
  const up = a.getUpdate();
  p.onGround = false; p.pos.y = 4; up();
  p.pos.y = 2; up();
  p.pos.y = 0; p.onGround = true; up();
  t('4m 坠落 → 扣一次血', p.hits.length === 1, JSON.stringify(p.hits));
  t('4m 坠落 → 伤害记在腿上', p.hits[0] && p.hits[0].part === 'legs', p.hits[0] && p.hits[0].part);
  t('4m 坠落 → 有提示', a.pops.length === 1, JSON.stringify(a.pops));
  t('落地后不会重复扣血', (() => { up(); up(); return p.hits.length === 1; })());
}

// ---------- ④ 翻二楼窗台: 用楼层差, 不是弧线顶点 ----------
{
  const a = mk();
  const p = a.player;
  const up = a.getUpdate();
  p.onGround = false; p.vaulting = true; p.vaultFrom = { x: -1, y: 3.05, z: 0 };
  p.pos.y = 3.9; up();               // 翻越弧线顶点 (比楼层高 0.85)
  p.pos.y = 3.05; up();
  p.pos.y = 1.2; up();
  p.pos.y = 0; p.onGround = true; p.vaulting = false; up();
  const dmg = p.hits.length ? p.hits[0].amt : 0;
  t('翻二楼 (3.05m) → 扣血很小 (≤4)', dmg >= 1 && dmg <= 4, dmg);
  t('翻二楼 → 不会按弧线顶点 (3.9m) 算成 30+', dmg < 10, dmg);
}

// ---------- ⑤ 翻三层 (6.1m) ----------
{
  const a = mk();
  const p = a.player;
  const up = a.getUpdate();
  p.onGround = false; p.vaulting = true; p.vaultFrom = { x: -1, y: 6.1, z: 0 };
  p.pos.y = 7; up();
  p.pos.y = 0; p.onGround = true; p.vaulting = false; up();
  const dmg = p.hits.length ? p.hits[0].amt : 0;
  t('翻三层 (6.1m) → 明显扣血 (>100)', dmg > 100, dmg);
}

// ---------- ⑥ 闸门 ----------
{
  const cases = [
    ['爬梯子', { _onLadder: 1 }],
    ['已倒地', { downed: true }],
    ['跳伞中', { chute: true }],
    ['在机枪上', { onMG: 1 }],
    ['已阵亡', { alive: false }]
  ];
  let ok = true, bad = '';
  for (const [name, ex] of cases) {
    const p = makePlayer();
    Object.assign(p, ex);
    const a = mk({ player: p });
    const up = a.getUpdate();
    p.onGround = false; p.pos.y = 8; up();
    p.pos.y = 0; p.onGround = true; up();
    if (p.hits.length) { ok = false; bad += name + ' '; }
  }
  t('爬梯/倒地/跳伞/机枪/阵亡 → 都不扣血', ok, bad);

  const a = mk({ matchOver: true });
  const p = a.player; const up = a.getUpdate();
  p.onGround = false; p.pos.y = 8; up();
  p.pos.y = 0; p.onGround = true; up();
  t('对局结束 → 不扣血', p.hits.length === 0);
}

// ---------- ⑦ 静态接线 ----------
{
  const html = fs.readFileSync('index.html', 'utf8');
  const vault = fs.readFileSync('js/58_vault.js', 'utf8');
  const strip = (x) => x.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  t('index.html 已加载 60_falldmg.js', /js\/60_falldmg\.js\?v=/.test(html));
  const i25 = html.indexOf('25_player_update.js'), i60 = html.indexOf('60_falldmg.js');
  t('60_falldmg.js 在 25_player_update 之后', i60 > i25 && i25 > 0);
  t('坠落伤害走 player.damage (沿用倒地/死亡链路)', /p\.damage\(dmg,null,false,'legs'\)/.test(strip(SRC)));
  t('翻越允许 maxDrop', /maxDrop:4\.60/.test(vault));
  t('翻越落点: 只禁止往上 >0.8m', /if\(gh-feet>0\.80\) continue;/.test(strip(vault)));
  t('翻越落点: 往下的上限用 maxDrop', /if\(feet-gh>VAULT\.maxDrop\) continue;/.test(strip(vault)));
}

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) + ' 项' : '✅ 全部 ' + pass + ' 项通过'));
process.exit(fail ? 1 : 0);
