// 给静态审计第 9 组追加 ⑪：剧情专用地图不能进沙盒
const fs = require('fs');
const P = '_tools/_static_audit.js';
let s = fs.readFileSync(P, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';

const anchor = [
  "    if (!/RUN\\.nvgBrought=true; RUN\\.nvgKey='nvg_pano'/.test(st)) bad('storyApplyKit 没有配发全景夜视仪 (nvg_pano)');",
  "    else ok('剧情配装含全景夜视仪 (nvg_pano · 118°)');",
  "  }",
  "}"
].join(eol);

const add = [
  "    if (!/RUN\\.nvgBrought=true; RUN\\.nvgKey='nvg_pano'/.test(st)) bad('storyApplyKit 没有配发全景夜视仪 (nvg_pano)');",
  "    else ok('剧情配装含全景夜视仪 (nvg_pano · 118°)');",
  "  }",
  "",
  "  // ⑪ 剧情专用地图只能从剧情模式进入 —— 不能出现在沙盒地图列表里",
  "  {",
  "    const marked = (d.match(/storyOnly:true/g) || []).length;",
  "    if (marked < 2) bad('剧情地图没有标 storyOnly (' + marked + ' 处) —— 会漏进沙盒地图列表');",
  "    else ok('两张剧情地图都标了 storyOnly');",
  "    if (!/if\\(CAMPAIGNS\\[i\\]&&CAMPAIGNS\\[i\\]\\.storyOnly&&!localStorage\\.getItem\\('sf_story'\\)\\) i=0;/.test(d))",
  "      bad('CAMPAIGN_IDX 没有 storyOnly 回退 —— 存档停在剧情图时沙盒会直接跑剧情图');",
  "    else ok('CAMPAIGN_IDX 对剧情图有回退');",
  "    const rmc = (maps.match(/function renderMapCards\\(\\)\\{([\\s\\S]*?)\\n\\}/) || [])[1] || '';",
  "    const iF = rmc.indexOf('if(c.storyOnly) return;');",
  "    const iB = rmc.indexOf(\"document.createElement('button')\");",
  "    if (iF < 0) bad('renderMapCards 没有过滤 storyOnly —— 剧情地图会出现在沙盒地图卡片里');",
  "    else if (iB >= 0 && iF > iB) bad('renderMapCards 的过滤写在了建按钮之后 —— 卡片照样会生成');",
  "    else ok('renderMapCards 过滤掉剧情地图');",
  "    const iDb = menus.indexOf(\"el('deployBtn').onclick\");",
  "    const iG = iDb < 0 ? -1 : menus.indexOf('storyMapBlocked()', iDb);",
  "    const iC = iDb < 0 ? -1 : menus.indexOf('consumeRaidStart()', iDb);",
  "    if (iG < 0) bad('deployBtn 没有 storyMapBlocked 守卫 —— 沙盒能部署进剧情地图');",
  "    else if (iC >= 0 && iG > iC) bad('deployBtn 守卫在 consumeRaidStart 之后 —— 标记已被清, deployPlayer 照样执行 (会被扔进空图)');",
  "    else ok('deployBtn 在建局前拦住剧情地图');",
  "    if (!/function startMatch\\(\\)\\{[\\s\\S]{0,200}storyMapBlocked\\(\\)/.test(menus))",
  "      bad('startMatch 没有 storyMapBlocked 守卫');",
  "    else ok('startMatch 有剧情地图守卫');",
  "  }",
  "}"
].join(eol);

const n = s.split(anchor).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次 (期望 1)'); process.exit(1); }
fs.writeFileSync(P, s.split(anchor).join(add), 'utf8');
console.log('✅ 审计第 9 组已追加 ⑪ (5 项)');
