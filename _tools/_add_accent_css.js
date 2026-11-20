// 把「黄色强调层」追加到 css/style.css 末尾。
// 幂等: 已存在标记就跳过。行尾跟随文件现有风格。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const P = path.join(ROOT, 'css/style.css');
const MARK = '/* ===== 黄色强调层 (accent) ===== */';

const BLOCK = `
${MARK}
/* 主题 = **深灰底 + 白字 + 黄色强调**。
   纯灰白会显得像遗照, 所以关键元素统一走琥珀黄。
   只用一套色阶, 避免回到原来「琥珀金 / 橄榄绿 / 米黄」混杂的状态:
     #ffd77a  强调文字 / 图标 / 选中态
     #e0b040  按钮渐变下沿
     #8a6a28  暗边框 / 次级文字
   本块在文件末尾, 靠源码顺序覆盖前面的中性化结果。 */
:root { --acc:#ffd77a; --acc2:#e0b040; --acc3:#8a6a28; --accBg:rgba(255,215,122,.16); --accBd:rgba(255,215,122,.34); }

/* —— 品牌 / 标题 —— */
.gameLogo { color:var(--acc); text-shadow:0 2px 0 #6a5220, 0 6px 22px rgba(0,0,0,.8); }
.gameLogoSub { color:rgba(255,215,122,.6); }
.gameTagline { color:var(--acc); text-shadow:0 2px 12px rgba(0,0,0,.85); border-top:1px solid var(--accBd); border-bottom:1px solid var(--accBd); }
h1.title, .mSubTitle { color:var(--acc); }
#menuVer { color:var(--acc3); }

/* —— 小节标签: 每个面板里最密的强调点 —— */
.secLabel { color:var(--acc); border-bottom:1px solid var(--accBd); }

/* —— 主按钮: 黄底黑字 —— */
.bigBtn { background:linear-gradient(180deg,#ffd77a,#e0b040); color:#1a1a1a; border:1px solid var(--acc3); font-weight:700; text-shadow:none; }
.bigBtn:hover { background:linear-gradient(180deg,#ffe49b,#efc257); }

/* —— 交互态: 悬停 / 选中 —— */
.optBtn:hover { border-color:var(--acc); color:var(--acc); }
.optBtn.sel { background:var(--accBg); border-color:var(--acc); color:var(--acc); }
.classCard:hover { border-color:var(--acc); }
.classCard.sel { background:var(--accBg); border-color:var(--acc); }
.classCard.sel .cname { color:var(--acc); }
.spawnBtn:hover { border-color:var(--acc); }
.spawnBtn.sel { background:var(--accBg); border-color:var(--acc); color:var(--acc); }
.lootRow.sel { background:var(--accBg); border:1px solid var(--acc); color:var(--acc); }
#mArmory .arRow:hover { border-color:var(--acc); }
button.apBuy { background:var(--accBg); border-color:var(--acc); color:var(--acc); }
button.apBuy:hover { background:rgba(255,215,122,.3); }

/* —— 数值 / 价格 / 关键读数 —— */
.sliderRow .val { color:var(--acc); }
#mArmory .arWallet, #mArmory .arPrice { color:var(--acc); }
#endStats b { color:var(--acc); }
#lootHint b, #bagPanelHint b, #ammoShopHint b { color:var(--acc); }
.lootRow .lrMark, .bagRow .lrQty { color:var(--acc); }
#bagPanelTitle, #lootTitle, #ammoShopTitle, #bigmapTitle { color:var(--acc); }
#quickHud b, #clsTip b { color:var(--acc); }
#endTitle.win { color:var(--acc); text-shadow:0 0 30px rgba(255,215,122,.45); }
#scoreboard h3 { color:var(--acc); }
#scoreboard th { color:#c8a24a; border-bottom:1px solid var(--acc3); }

/* —— 任务追踪 —— */
#questHud .qhHead { color:var(--acc); }
#questHud .qhRow b { color:var(--acc); }

/* —— 表单 —— */
input[type="range"], input[type="checkbox"], progress { accent-color:var(--acc); }
.multiField input:focus, .multiChatRow input:focus { border-color:var(--acc); }
#mSet .optBtn.sel, #mPlay .optBtn.sel, #mArmory .optBtn.sel { background:var(--accBg); border-color:var(--acc); color:var(--acc); }

/* —— 局内 HUD: 只在关键处落黄, 其余保持中性, 避免满屏花 —— */
#ammoPanel #wname { color:var(--acc); }
#mmHint, #bigmapHint { color:rgba(255,215,122,.62); }
#stamBar { background:rgba(255,215,122,.62); }
`;

let s = fs.readFileSync(P, 'utf8');
if (s.indexOf(MARK) >= 0) { console.log('已存在强调层，跳过。'); process.exit(0); }
if (!s.endsWith('\n')) s += '\n';
fs.writeFileSync(P, s + BLOCK.replace(/^\n/, ''), 'utf8');
console.log('已追加黄色强调层到 css/style.css (+' + BLOCK.length + ' 字符)');
