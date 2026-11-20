// 检查: 有没有「玩家能拥有、但工坊里装不了 gear_nvg」的武器
// 触发条件: MOD_AVAIL 没有该武器的条目 → getModSlots 走兜底 → gear 只有 ['gear_none']
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

function blockKeys(src, decl) {
  let i = src.indexOf(decl);
  if (i < 0) { const m = decl.match(/const\s+([A-Za-z_$][\w$]*)/); if (m) i = src.search(new RegExp('const\\s+' + m[1] + '\\s*=')); }
  if (i < 0) return null;
  const j = src.indexOf('{', i);
  let depth = 0, end = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end < 0) return null;
  const body = src.slice(j + 1, end);
  const keys = [];
  let d = 0;
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (d === 0) { const m = t.match(/^([A-Za-z_$][\w$]*)\s*:/); if (m) keys.push(m[1]); }
    for (const c of line) { if (c === '{') d++; else if (c === '}') d--; }
  }
  return keys;
}

const wd = fs.readFileSync(R('js/13_weapons_data.js'), 'utf8');
const gm = fs.readFileSync(R('js/14b_weapon_mods.js'), 'utf8');
const wpn = blockKeys(wd, 'const WPN_DEFS');
const avail = blockKeys(gm, 'const MOD_AVAIL');
console.log('WPN_DEFS 键数: ' + wpn.length);
console.log('MOD_AVAIL 键数: ' + avail.length);

const availSet = new Set(avail);
const noMod = wpn.filter(k => !availSet.has(k));
console.log('');
console.log('⚠️ 没有 MOD_AVAIL 条目 → 工坊装不了 gear_nvg 的武器 (' + noMod.length + '):');
console.log('   ' + (noMod.join(', ') || '(无)'));

const wpnSet = new Set(wpn);
const ghost = avail.filter(k => !wpnSet.has(k));
console.log('');
console.log('MOD_AVAIL 里的死条目 (武器已删, ' + ghost.length + '): ' + (ghost.join(', ') || '(无)'));

// 兜底字面量里有没有 gear_nvg
const fb = gm.match(/getModSlots\(key\)\s*\{\s*return\s+MOD_AVAIL\[key\]\s*\|\|\s*\{([^}]*)\}/);
console.log('');
if (!fb) console.log('⚠️ 读不到 getModSlots 兜底字面量');
else {
  const hasNvg = /gear:\s*\[[^\]]*'gear_nvg'/.test(fb[1]);
  console.log('兜底字面量的 gear 槽含 gear_nvg ? ' + (hasNvg ? '✅ 是' : '❌ 否 —— 这些武器装不了夜视仪'));
  console.log('   兜底内容: ' + fb[1].trim());
}
