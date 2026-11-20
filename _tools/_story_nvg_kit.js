// 剧情模式: 自动配发全景夜视仪 (第二章地下太黑)
//
// 背景: 夜视仪有**双门控** —— ① 部署界面 #nvgSelect 选一型 (META.loadout.nvg)
//   ② 主武器 gear 槽装 gear_nvg。剧情模式跳过了装备选择, 所以两道都不满足。
// 修法: storyApplyKit() 直接写 RUN.nvgBrought / RUN.nvgKey='nvg_pano',
//   并让 34_nvg 的 owned() 通过 storyNvgGranted() 放行「工坊支架」那道门控。
// ⚠️ 只写 RUN + 一个内存判断, **不碰 META.loadout / PLAYER_MODS** → 玩家存档与沙盒配装不受影响。
// ⚠️ storyNvgGranted() 必须要求 SRAID.live —— 否则沙盒局也会白拿夜视仪。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const JOBS = [
  // ① 34_nvg.owned(): 剧情配装放行
  ['js/34_nvg.js',
    "      if(RUN&&!RUN.nvgKey) return false;      // 没带型号 = 没夜视仪\n" +
    "      const key=(player.curW&&player.curW.key)||(META&&META.loadout&&META.loadout.primary);",
    "      if(RUN&&!RUN.nvgKey) return false;      // 没带型号 = 没夜视仪\n" +
    '      // 剧情配装: 夜视仪由章节直接发放, 不必在工坊给主武器装支架\n' +
    '      // ⚠️ storyNvgGranted() 内部要求 SRAID.live → 沙盒局拿不到 (RUN 字段由 applyDeployLoadout 写)\n' +
    "      if(typeof storyNvgGranted==='function'&&storyNvgGranted()) return true;\n" +
    "      const key=(player.curW&&player.curW.key)||(META&&META.loadout&&META.loadout.primary);"],
  // ② 56_story: 定义 storyNvgGranted()
  ['js/56_story.js',
    'function storyClearPending(){ try{ localStorage.removeItem(\'sf_story\'); }catch(e){} }',
    'function storyClearPending(){ try{ localStorage.removeItem(\'sf_story\'); }catch(e){} }\n' +
    '\n' +
    '// 34_nvg.owned() 会调它: 剧情配装**直接发放**夜视仪, 不走「工坊装支架」那道门控。\n' +
    '// ⚠️ 必须要求 SRAID.live —— 否则沙盒局也会白拿夜视仪 (沙盒的 RUN.nvgBrought/nvgKey 由 applyDeployLoadout 写)。\n' +
    'function storyNvgGranted(){\n' +
    "  return !!(SRAID.live&&typeof RUN!=='undefined'&&RUN&&RUN.nvgBrought&&RUN.nvgKey);\n" +
    '}'],
  // ③ storyApplyKit: 写 RUN 夜视仪字段 + 更新提示
  ['js/56_story.js',
    '    p.foodItems=[];\n' +
    "    if(typeof showScorePop==='function') showScorePop('剧情配装：M4 + M1911 · 手雷×2 · 医疗包×2 · 手术包×1');",
    '    p.foodItems=[];\n' +
    '    // 夜视仪: 剧情配装直接给**全景夜视仪**(GPNVG-18 · 118°) —— 地下章节(铁砧 B2 / 实验室)太黑。\n' +
    '    // ⚠️ 只写 RUN + 内存判断, 不碰 META.loadout / PLAYER_MODS → 玩家存档与沙盒配装完全不受影响。\n' +
    "    RUN.nvgBrought=true; RUN.nvgKey='nvg_pano';\n" +
    "    if(typeof showScorePop==='function') showScorePop('剧情配装：M4 + M1911 · 手雷×2 · 医疗包×2 · 手术包×1 · 全景夜视仪(按 N 开关)');"],
  // ④ 章节卡片文案
  ['js/56_story.js',
    "h+='<div class=\"scKit\">配装：M4 + M1911 · 手雷×2 · 医疗包×2 · 手术包×1（自动配备，无需选择）</div>';",
    "h+='<div class=\"scKit\">配装：M4 + M1911 · 手雷×2 · 医疗包×2 · 手术包×1 · 全景夜视仪（自动配备，无需选择 · 按 N 开关夜视）</div>';"],
];

let fatal = 0;
const cache = {};
for (const [f] of JOBS) if (!cache[f]) cache[f] = fs.readFileSync(R(f), 'utf8');
for (const [file, from] of JOBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  命中 ${n}/1  «${from.slice(0, 40).replace(/\n/g, '⏎')}»`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 未命中, 未写盘'); process.exit(1); }
for (const [file, from, to] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
console.log('\n💾 已写盘: ' + [...new Set(JOBS.map(j => j[0]))].join(', '));
