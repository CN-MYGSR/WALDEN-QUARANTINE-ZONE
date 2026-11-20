// MEMORY.md §0 压缩: 审计小节与剧情模式小节收紧 (细节已在 REF), 让 §0–§7 落进 10k 注入预算
const fs = require('fs');
const P = '.workbuddy-ai/memory/MEMORY.md';
let s = fs.readFileSync(P, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';

const startMark = '- 静态审计 `node _tools/_static_audit.js`';
const endMark = eol + '## 1. 硬约束';
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 < 0 || i1 < 0 || i1 < i0) { console.log('❌ 锚点未命中 (' + i0 + ',' + i1 + ')'); process.exit(1); }

const block = [
  '- 静态审计 `node _tools/_static_audit.js`（纯文本，10 组）。⚠️ **写检查器前先确认「被检查对象的真实形态」**，否则假警报淹掉真信号（曾报 8 处、**7 处是检查器自己的解析 bug**）。',
  '  ⚠️⚠️ **断言必须能真的失败**：① 锚定行首（`^...`+`m`，否则 `//case \'x\':` 也算通过）② **先剥掉行注释**再断言 ③ 别用 `keysOfBlock` 读「单行多键」的表（它每行只取第一个键）。',
  '  ⚠️⚠️ **给「靠表索引的取值」加新值前先 grep 全部消费点**：事故 —— `forceWeather` 返回表里没有的 `\'anvilhaze\'` → `WEATHER_MODES[x].name` 抛错 → **`initMenuUI` 中断 → 主菜单导航/地图卡片/部署按钮全失效**。一行显示文案也能拖垮整个 UI。',
  '  ⚠️ **给某函数开头插代码前，先 grep 谁在按「紧邻」匹配它的第一行**（审计第 8 组曾因此失配）。',
  '- **剧情模式**（`56_story.js` + `07g_anvil.js`，6 章，与沙盒并存）：进度存独立 `bf_story_v1`；局内态放模块级 `SRAID`（不占 RUN → 省掉重置点规则）。逐章/地图细节见 REF。',
  '  ⚠️ 钩子：`startMatch`→`storyApplyChapter`、`finishRaid`→`storyOnRaidEnd`（**在 mergeRunLoot 之前**，要读 `RUN.loot`）、每帧 wrap `updateMedCrates`、箱子 wrap `rollCrateLootList`（剧情物品保底）。',
  '  ⚠️ 2 张剧情地图 **必须追加在 CAMPAIGNS 末尾**（`sf_campaign` 存索引，插中间会串图）；带 `storyOnly:true` → **沙盒地图列表不显示、部署被拦**（守卫要放 `deployBtn`，在 `consumeRaidStart` 之前 —— 否则 `deployPlayer` 照样把玩家扔进空图）。',
  '  ⚠️ **目标分「单调/瞬时」**：`reach` 必须局内锁存 `o.met`，结算重算必然 false → 章节永不解锁（`escort` 例外，必须重算且不锁存）。',
  '  ⚠️ **「待处理标记」无条件清理**（只在采纳时清 → 每次加载重复同一动作 = 用户报的「loop」）；**主循环/建局/结算上的钩子一律 try/catch**（每帧抛错 → 主循环后半段全不执行 + 控制台每帧刷错）。',
  '  ⚠️ `storyApplyKit`（wrap `deployPlayer`，不碰 META）必须晚于 `46_throwables`；`storyNvgGranted()` **必须要求 `SRAID.live`**，否则沙盒局白拿夜视仪。'
].join(eol);

s = s.slice(0, i0) + block + s.slice(i1);
fs.writeFileSync(P, s, 'utf8');

const re = /^## .*$/gm; let m; let out = [];
while ((m = re.exec(s))) out.push(String(m.index).padStart(6) + '  ' + m[0].slice(0, 34));
console.log('总长 ' + s.length + ' 字符');
console.log(out.join('\n'));
