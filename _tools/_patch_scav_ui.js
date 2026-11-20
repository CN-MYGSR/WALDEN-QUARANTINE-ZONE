// 补丁 2: 部署/配装界面把「SCAV 随机主武器」讲清楚 (否则玩家以为仓库里选的枪会带出去)
const fs = require('fs');
const stats = [];
function rep(file, from, to, expect) {
  let s = fs.readFileSync(file, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const parts = s.split(from.split('\n').join(eol));
  const n = parts.length - 1;
  if (n !== expect) throw new Error(`[${file}] 命中 ${n} 次, 期望 ${expect} 次 :: ${from.slice(0, 120)}`);
  fs.writeFileSync(file, parts.join(to.split('\n').join(eol)), 'utf8');
  stats.push(`${file}: ${n}x`);
}

// --- 37_meta.js: 撤离部署面板的「当前配装」摘要 ---
rep('js/37_meta.js', ` const sum=el('loadoutSummary');
 if(sum){
  const p=META.loadout.primary?itemName(META.loadout.primary):'未装备';
  const s=META.loadout.secondary?itemName(META.loadout.secondary):'未装备';
  const a=META.loadout.armor?ARMOR_DEFS[META.loadout.armor].name:'未装备';
  sum.innerHTML=\`<b>主武器:</b> \${p} · <b>副武器:</b> \${s} · <b>防弹衣:</b> \${a}\`;
 }`,
` const sum=el('loadoutSummary');
 if(sum){
  // SCAV 拾荒者阵营: 主武器由出击时随机决定, 仓库里选的那把不会带出去 (见 38_tarkov.ensureScavLoadout)
  const scav=!!(typeof TEAM_FACTION!=='undefined'&&TEAM_FACTION[player.team]&&TEAM_FACTION[player.team].scav);
  const p=scav?'随机二战兵器 (出击时抽取)':(META.loadout.primary?itemName(META.loadout.primary):'未装备');
  const s=META.loadout.secondary?itemName(META.loadout.secondary):'未装备';
  const a=META.loadout.armor?ARMOR_DEFS[META.loadout.armor].name:'未装备';
  sum.innerHTML=\`<b>主武器:</b> \${p} · <b>副武器:</b> \${s} · <b>防弹衣:</b> \${a}\`
   +(scav?'<div style="color:#d8b878;font-size:12px;margin-top:4px">拾荒者出击 · 主武器每局随机, 不带仓库主武器 / 无保险 / 阵亡不掉落仓库装备</div>':'');
 }`, 1);

// --- 38_tarkov.js: 部署界面的「装备保险」摘要行 ---
rep('js/38_tarkov.js',
`sum.innerHTML=\`背包: \${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].name:'轻便挎包'} (\${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].slots:10}格) · 医疗: \${L.meds.filter(Boolean).length||'无'} · 食物: \${L.foods.filter(Boolean).length||'无'}\${RUN.insureWanted?\` · 保险 ¥\${formatMoney(cost)}\`:''}\`;`,
`const _scav=!!(TEAM_FACTION[player.team]&&TEAM_FACTION[player.team].scav);
sum.innerHTML=\`背包: \${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].name:'轻便挎包'} (\${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].slots:10}格) · 医疗: \${L.meds.filter(Boolean).length||'无'} · 食物: \${L.foods.filter(Boolean).length||'无'}\${RUN.insureWanted&&!_scav?\` · 保险 ¥\${formatMoney(cost)}\`:''}\`
 +(_scav?'<br><span style="color:#d8b878">拾荒者出击 · 主武器每局从二战兵器里随机抽取, 仓库里的主武器不会带出</span>':'');`, 1);

console.log('OK ' + stats.join(' | '));
