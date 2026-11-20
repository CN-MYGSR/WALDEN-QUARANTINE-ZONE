// 37_meta.js 头盔接入 (2026-09-19)
const fs = require('fs');
const path = require('path');
const P = path.resolve(__dirname, '..', 'js', '37_meta.js');
const raw = fs.readFileSync(P, 'utf8');
const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const L = (...a) => a.join(eol) + eol;
let s = raw;

const J = [
  // ① 保底补给补头盔
  [L(' if(!ownedArmorList().length){',
    '   addOwned(SAFETY_ARMOR,1);',
    '   granted.push(SAFETY_ARMOR);',
    '   if(!META.loadout.armor||!ownedCount(META.loadout.armor)) META.loadout.armor=SAFETY_ARMOR;',
    ' }'),
  L(' if(!ownedArmorList().length){',
    '   addOwned(SAFETY_ARMOR,1);',
    '   granted.push(SAFETY_ARMOR);',
    '   if(!META.loadout.armor||!ownedCount(META.loadout.armor)) META.loadout.armor=SAFETY_ARMOR;',
    ' }',
    ' if(!ownedHelmetList().length){',
    '   addOwned(SAFETY_HELMET,1);',
    '   granted.push(SAFETY_HELMET);',
    '   if(!META.loadout.helmet||!ownedCount(META.loadout.helmet)) META.loadout.helmet=SAFETY_HELMET;',
    ' }')],

  // ② 头盔下拉
  [L(' if(aSel){',
    "  aSel.innerHTML='';",
    '  for(const k of ownedArmorList()){',
    "   const o=document.createElement('option');",
    '   o.value=k; o.textContent=`${ARMOR_DEFS[k].name} · 售价 ${formatMoney(itemSellPrice(k))}`;',
    '   o.selected=k===META.loadout.armor;',
    '   aSel.appendChild(o);',
    '  }',
    "  aSel.value=META.loadout.armor||'';",
    "  aSel.onchange=()=>setLoadout('armor',aSel.value);",
    ' }'),
  L(' if(aSel){',
    "  aSel.innerHTML='';",
    '  for(const k of ownedArmorList()){',
    "   const o=document.createElement('option');",
    '   o.value=k; o.textContent=`${ARMOR_DEFS[k].name} · 售价 ${formatMoney(itemSellPrice(k))}`;',
    '   o.selected=k===META.loadout.armor;',
    '   aSel.appendChild(o);',
    '  }',
    "  aSel.value=META.loadout.armor||'';",
    "  aSel.onchange=()=>setLoadout('armor',aSel.value);",
    ' }',
    " const hSel=el('helmetSelect');",
    ' if(hSel){',
    "  hSel.innerHTML='';",
    '  for(const k of ownedHelmetList()){',
    "   const o=document.createElement('option');",
    '   o.value=k; o.textContent=`${HELMET_DEFS[k].name} · 售价 ${formatMoney(itemSellPrice(k))}`;',
    '   o.selected=k===META.loadout.helmet;',
    '   hSel.appendChild(o);',
    '  }',
    "  hSel.value=META.loadout.helmet||'';",
    "  hSel.onchange=()=>setLoadout('helmet',hSel.value);",
    ' }')],

  // ③ 摘要加头盔
  [L("  const a=META.loadout.armor?ARMOR_DEFS[META.loadout.armor].name:'未装备';",
    '  sum.innerHTML=`<b>主武器:</b> ${p} · <b>副武器:</b> ${s} · <b>防弹衣:</b> ${a}`'),
  L("  const a=(META.loadout.armor&&ARMOR_DEFS[META.loadout.armor])?ARMOR_DEFS[META.loadout.armor].name:'未装备';",
    "  const h=(META.loadout.helmet&&HELMET_DEFS[META.loadout.helmet])?HELMET_DEFS[META.loadout.helmet].name:'未装备';",
    '  sum.innerHTML=`<b>主武器:</b> ${p} · <b>副武器:</b> ${s} · <b>防弹衣:</b> ${a} · <b>头盔:</b> ${h}`')],
];

let bad = 0;
for (const [f] of J) {
  const n = s.split(f).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ' ' + n + '  ' + f.split(eol)[0].slice(0, 46));
  if (n !== 1) bad++;
}
if (bad) { console.log('未命中，未写入'); process.exit(1); }
for (const [f, t] of J) s = s.split(f).join(t);
fs.writeFileSync(P, s, 'utf8');
console.log('✅ 37_meta.js 保底/下拉/摘要已接入头盔');
