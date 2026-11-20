// 剧情模式: 跳过装备选择, 自动配备固定配装
//   配装 = M4 + M1911 · 手雷 ×2 · 医疗包 ×2 · 手术包 ×1
// 做法:
//   ① 在 56_story.js 末尾追加 storyApplyKit() + wrap deployPlayer
//      ⚠️ 必须 wrap 在 46_throwables 的 deployPlayer 包装**之外** (56 加载更晚 ✓),
//         否则 applyThrowablesToPlayer 会把手雷数按 RUN.throwables 覆盖回 0。
//   ② 待打剧情章节时, 自动等部署界面出现并替玩家点「部署」→ 不进装备选择界面。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const KIT = [
  '',
  '// =====================================================================',
  '// 剧情模式: 固定配装 (无需选择装备)',
  '//   M4 + M1911 · 手雷 ×2 · 医疗包 ×2 · 手术包 ×1',
  '// ⚠️ 只在剧情局生效, 且**不写进 META** —— 玩家的沙盒配装与仓库不受影响。',
  '// ⚠️ 必须 wrap 在 46_throwables 的 deployPlayer 包装之外 (本文件加载最晚 ✓):',
  '//    它的包装会在 deployPlayer 里调 applyThrowablesToPlayer() 按 RUN.throwables 覆盖手雷数。',
  '// =====================================================================',
  'function storyApplyKit(){',
  "  if(!SRAID.live||typeof player==='undefined'||!player) return;",
  '  const p=player;',
  "  const mk=k=>{ const md=(typeof moddedDef==='function'&&moddedDef(k))||WPN_DEFS[k]; return {key:k,def:md,mag:md.mag,reserve:md.reserve}; };",
  '  try{',
  "    if(WPN_DEFS.m4&&WPN_DEFS.m1911){",
  "      p.slots=[mk('m4'),mk('m1911')];",
  '      p.curSlot=0; p.curW=p.slots[0];',
  "      if(typeof vmEquip==='function') vmEquip(p.curW.key,p.team);",
  '    }',
  '    p.nadeCount=2; p.flashCount=0; p.smokeCount=0;',
  "    const mu=(typeof MED_DEFS!=='undefined'&&MED_DEFS.medkit&&MED_DEFS.medkit.uses)||1;",
  "    const cu=(typeof MED_DEFS!=='undefined'&&MED_DEFS.cms&&MED_DEFS.cms.uses)||1;",
  "    p.medItems=[{key:'medkit',uses:mu},{key:'medkit',uses:mu},{key:'cms',uses:cu}];",
  '    p._medIdx=undefined;',
  '    p.foodItems=[];',
  "    if(typeof showScorePop==='function') showScorePop('剧情配装：M4 + M1911 · 手雷×2 · 医疗包×2 · 手术包×1');",
  "  }catch(e){ console.warn('[story] kit failed',e); }",
  '}',
  'const _storyOrigDeployPlayer=deployPlayer;',
  'deployPlayer=function(){ const r=_storyOrigDeployPlayer.apply(this,arguments); storyApplyKit(); return r; };',
  '',
  '// ---- 剧情局: 跳过装备选择, 自动进场 ----',
  '// 等部署界面出现后替玩家点「部署」(与手点完全同一条链路: consumeRaidStart + deployPlayer)。',
  '(function storyAutoDeploy(){',
  '  if(storyPendingIdx()<0) return;',
  '  let n=0;',
  '  const t=setInterval(()=>{',
  '    if(++n>150){ clearInterval(t); return; }   // 最多等 ~12s 就放弃',
  "    const dep=document.getElementById('deploy');",
  "    const db=document.getElementById('deployBtn');",
  '    if(!dep||!db) return;',
  "    if(dep.classList.contains('hidden')) return;   // 部署界面还没打开",
  '    clearInterval(t);',
  "    try{ if(typeof db.onclick==='function') db.onclick(); }catch(e){ console.warn('[story] auto deploy failed',e); }",
  '  },80);',
  '})();',
].join('\n');

let s = fs.readFileSync(R('js/56_story.js'), 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const anchor = "const _storyOrigCrateLoot=rollCrateLootList;";
const i = s.indexOf(anchor);
if (i < 0) { console.log('❌ 找不到锚点'); process.exit(1); }
if (s.indexOf('storyApplyKit') >= 0) { console.log('ℹ️ 已存在 storyApplyKit, 跳过'); process.exit(0); }
// 插到"剧情物品保底掉落"那一段之前, 保证 deployPlayer 的 wrap 顺序清晰
const j = s.lastIndexOf('\n', i);
s = s.slice(0, j) + KIT.split('\n').join(eol) + s.slice(j);
fs.writeFileSync(R('js/56_story.js'), s, 'utf8');
console.log('✅ 已插入 storyApplyKit + auto-deploy (' + KIT.split('\n').length + ' 行)');
