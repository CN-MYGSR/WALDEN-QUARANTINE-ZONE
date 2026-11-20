// 改装系统探针: 真跑一遍 14b_weapon_mods 的纯逻辑, 验证新槽位 (枪托/握把) 与弹鼓
// 用法: node _tools/_mods_probe.js
// 做法: 把 WPN_DEFS 解析出来当桩, 给 THREE/vmMats/bx/cyl 打最小桩, 再 eval 改装文件。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------- 1) 解析 WPN_DEFS (用花括号配对, 不用正则猜) ----------
function parseWpnDefs(src) {
  const i = src.indexOf('const WPN_DEFS');
  const st = src.indexOf('{', i);
  let d = 0, en = -1;
  for (let k = st; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { en = k; break; } }
  }
  const body = src.slice(st + 1, en);
  const out = {};
  let depth = 0, key = null, buf = '';
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (depth === 0 && /[a-zA-Z0-9_]/.test(c)) {
      if (key === null) {
        const m = /^([a-zA-Z0-9_]+)\s*:\s*\{/.exec(body.slice(k, k + 40));
        if (m) { key = m[1]; k += m[0].length - 1; depth = 1; buf = ''; continue; }
        else { while (k < body.length && /[a-zA-Z0-9_:]/.test(body[k])) k++; continue; }
      }
    }
    if (key !== null) {
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) { out[key] = buf; key = null; buf = ''; continue; } }
      if (depth >= 1) buf += c;
    }
  }
  const defs = {};
  for (const [k, b] of Object.entries(out)) {
    const g = (re, dflt) => { const m = re.exec(b); return m ? m[1] : dflt; };
    defs[k] = {
      name: g(/name:\s*['"]([^'"]*)/, k),
      type: g(/type:\s*['"]([^'"]*)/, ''),
      snd: g(/snd:\s*['"]([^'"]*)/, ''),
      pistol: /(^|[^a-zA-Z])pistol:\s*true/.test(b),
      dmg: +g(/dmg:\s*([\d.]+)/, 0),
      recoil: +g(/recoil:\s*([\d.]+)/, 1),
      recSide: +g(/recSide:\s*([\d.]+)/, 1),
      mag: +g(/mag:\s*(\d+)/, 0),
      reserve: +g(/reserve:\s*(\d+)/, 0),
      reload: +g(/reload:\s*([\d.]+)/, 2),
      spreadAds: +g(/spreadAds:\s*([\d.]+)/, 1),
      spreadHip: +g(/spreadHip:\s*([\d.]+)/, 1),
      adsFov: +g(/adsFov:\s*([\d.]+)/, 60),
      kick: +g(/kick:\s*([\d.]+)/, 1),
    };
  }
  return defs;
}

// ---------- 2) 最小桩 ----------
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const WPN_DEFS = parseWpnDefs(read('js/13_weapons_data.js'));
global.WPN_DEFS = WPN_DEFS;
const mkMat = () => ({});
global.THREE = {
  Mesh: function () { this.position = { set: () => {}, copy: () => {} }; this.rotation = {}; this.scale = {}; },
  BoxGeometry: function () {}, CylinderGeometry: function () {}, TorusGeometry: function () {},
  MeshLambertMaterial: function () { return mkMat(); }, MeshBasicMaterial: function () { return mkMat(); },
};
global.vmMats = { gun: mkMat(), gunL: mkMat(), park: mkMat() };
global.V3 = (x, y, z) => ({ x, y, z });
global.HPI = Math.PI / 2;
global.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
global.bx = () => ({ rotation: {} });
global.cyl = () => ({ rotation: {} });

// ---------- 3) eval 改装文件 (去掉依赖 THREE 的场景构建函数) ----------
let src = read('js/14b_weapon_mods.js');
src = src.replace(/function addModVisuals[\s\S]*?\n\}\n/, 'function addModVisuals(){}\n');
const sandbox = {};
const fn = new Function('WPN_DEFS', 'THREE', 'vmMats', 'V3', 'HPI', 'clamp', 'bx', 'cyl', 'localStorage',
  src + '\nreturn { ALL_MODS, MOD_AVAIL, getModSlots, getModChoice, setModChoice, moddedDef, modDisplayName, modTotalCost, MOD_AVAIL_KEYS:Object.keys(MOD_AVAIL) };');
const M = fn(WPN_DEFS, global.THREE, global.vmMats, global.V3, global.HPI, global.clamp, global.bx, global.cyl, global.localStorage);

// ---------- 4) 断言 ----------
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

console.log('=== 1. 槽位清单 ===');
const SLOTS = ['optic', 'muzzle', 'mag', 'stock', 'grip', 'gear', 'light'];
for (const s of SLOTS) {
  const n = Object.values(M.ALL_MODS).filter(x => x.slot === s).length;
  if (n > 0) ok('槽位 ' + s.padEnd(7) + ' 有 ' + n + ' 个改件');
  else bad('槽位 ' + s + ' 一个改件都没有');
}

console.log('\n=== 2. 每把武器都有 7 个槽位 ===');
const keys = Object.keys(M.MOD_AVAIL);
const missSlot = [];
for (const k of keys) for (const s of SLOTS) if (!(s in M.MOD_AVAIL[k])) missSlot.push(k + '.' + s);
if (missSlot.length) bad('缺槽位: ' + missSlot.slice(0, 8).join(', '));
else ok('全部 ' + keys.length + ' 把武器都有 ' + SLOTS.length + ' 个槽位');

console.log('\n=== 3. 手枪/火箭筒不该有枪托与前握把 ===');
const bare = keys.filter(k => (WPN_DEFS[k] && (WPN_DEFS[k].pistol || WPN_DEFS[k].snd === 'cannon')));
const badBare = bare.filter(k => (M.MOD_AVAIL[k].stock || []).length || (M.MOD_AVAIL[k].grip || []).length);
if (!bare.length) bad('没有识别出任何手枪/火箭筒 —— 解析可能出错');
else if (badBare.length) bad('这些武器不该有枪托/握把: ' + badBare.join(', '));
else ok(bare.length + ' 把手枪/火箭筒的枪托与握把都是空 (工坊不显示这两行)');

console.log('\n=== 4. 步枪/冲锋枪/狙击枪有完整枪托与握把 ===');
const armed = keys.filter(k => !bare.includes(k));
const badArmed = armed.filter(k => (M.MOD_AVAIL[k].stock || []).length < 4 || (M.MOD_AVAIL[k].grip || []).length < 4);
if (badArmed.length) bad('这些武器枪托/握把不全: ' + badArmed.join(', '));
else ok(armed.length + ' 把有托武器都有 4 种枪托 + 4 种握把');

console.log('\n=== 5. 弹鼓只给全自动且非机枪 ===');
const drumOk = [], drumBad = [];
for (const k of keys) {
  const has = (M.MOD_AVAIL[k].mag || []).includes('mag_drum');
  const d = WPN_DEFS[k] || {};
  const want = d.type === 'auto' && d.snd !== 'mg';
  (has === want ? drumOk : drumBad).push(k + (has ? '(有)' : '(无)'));
}
if (drumBad.length) bad('弹鼓分配不对: ' + drumBad.join(', '));
else ok('弹鼓分配正确 (' + drumOk.length + ' 把符合预期)');

console.log('\n=== 6. moddedDef 真的把枪托/握把效果算进去了 ===');
{
  const k = 'm4';
  const base = M.moddedDef(k);
  const b0 = WPN_DEFS[k];
  const chk = (slot, mid, field, dir) => {
    M.setModChoice(k, slot, mid);
    const after = M.moddedDef(k);
    const before = base[field];
    const good = dir === 'down' ? after[field] < before : after[field] > before;
    if (good) ok(mid + ' → ' + field + ' ' + before + ' → ' + after[field]);
    else bad(mid + ' 没有改变 ' + field + ' (' + before + ' → ' + after[field] + ')');
    M.setModChoice(k, slot, slot === 'stock' ? 'stock_standard' : 'grip_none');
  };
  chk('stock', 'stock_heavy', 'recoil', 'down');
  chk('stock', 'stock_heavy', 'kick', 'down');
  chk('stock', 'stock_precision', 'spreadAds', 'down');
  chk('grip', 'grip_vertical', 'recSide', 'down');
  chk('grip', 'grip_tactical', 'reload', 'down');
  // 弹鼓翻倍
  M.setModChoice(k, 'mag', 'mag_drum');
  const dm = M.moddedDef(k);
  if (dm.mag === b0.mag * 2) ok('mag_drum → mag ' + b0.mag + ' → ' + dm.mag);
  else bad('mag_drum 没有翻倍 (' + b0.mag + ' → ' + dm.mag + ')');
  M.setModChoice(k, 'mag', 'mag_standard');
  // 复原检查
  const back = M.moddedDef(k);
  if (back.recoil === b0.recoil && back.recSide === b0.recSide && back.mag === b0.mag) ok('改回默认后数值完全复原');
  else bad('改回默认后数值没复原: recoil ' + back.recoil + ' vs ' + b0.recoil);
}

console.log('\n=== 7. getModSlots 兜底字面量也含新槽位 ===');
{
  const fb = M.getModSlots('__不存在的武器__');
  const lack = SLOTS.filter(s => !fb[s]);
  if (lack.length) bad('兜底字面量缺槽位: ' + lack.join(', '));
  else ok('兜底字面量含全部 ' + SLOTS.length + ' 个槽位');
}

console.log('\n=== 8. modDisplayName / modTotalCost 认新槽位 ===');
{
  M.setModChoice('m4', 'stock', 'stock_heavy');
  M.setModChoice('m4', 'grip', 'grip_vertical');
  const nm = M.modDisplayName('m4');
  if (nm.includes('重型枪托') && nm.includes('垂直握把')) ok('modDisplayName: ' + nm);
  else bad('modDisplayName 没认出新槽位: ' + nm);
  const c = M.modTotalCost('m4');
  if (c >= 420 + 340) ok('modTotalCost 含新改件: ¥' + c);
  else bad('modTotalCost 没算新改件: ¥' + c);
}

console.log('\n' + (fail ? ('❌ ' + fail + ' 项失败 / ' + pass + ' 项通过') : ('✅ 全部通过 (' + pass + ' 项)')));
process.exit(fail ? 1 : 0);
