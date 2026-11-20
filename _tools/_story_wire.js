// 剧情模式接入: 主菜单入口 + 面板 + 局内 HUD + 两处钩子 + CSS
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const STORY_PANEL=[
  '<div id="mStory" class="mSub hidden">',
  '<h2 class="mSubTitle">剧 情 模 式</h2>',
  '<div class="subtitle" style="margin-top:-6px">瓦尔登隔离禁区 · 行动档案</div>',
  '<div id="storyList" style="max-height:60vh;overflow-y:auto;padding-right:6px;text-align:left"></div>',
  '<div class="center" style="margin-top:14px"><button class="bigBtn backBtn">返 回</button></div>',
  '</div>',
].join('\n');

const STORY_HUD='<div id="storyHud" class="hidden"></div>';

const STORY_CSS=`
/* ===== 剧情模式 (2026-09-19) ===== */
#storyHud{position:absolute;left:14px;top:118px;width:236px;background:rgba(14,14,14,.80);
 border:1px solid rgba(255,215,122,.45);border-radius:6px;padding:8px 10px;font-size:12px;
 color:#e2e2e2;z-index:11;pointer-events:none;letter-spacing:.4px;line-height:1.55}
#storyHud.hidden{display:none}
#storyHud .shTitle{color:#ffd77a;font-weight:700;margin-bottom:4px}
#storyHud .shObj{color:#cfcfcf}
#storyHud .shObj.ok{color:#8fe6a8}
#storyHud .shSay{margin-top:6px;padding-top:6px;border-top:1px dashed rgba(255,215,122,.3);color:#f0e0b0;font-style:italic}
#storyList .storyHead{color:#ffd77a;font-size:16px;font-weight:700;letter-spacing:2px;text-align:center}
#storyList .storySub{color:#b8b8b8;font-size:12px;text-align:center;margin:6px 0 12px}
#storyList .storyFoot{color:#d8c890;font-size:13px;text-align:center;line-height:1.7;margin:14px 0}
#storyList .storyCard{background:rgba(0,0,0,.38);border:1px solid #666666;border-radius:8px;
 padding:10px 12px;margin-bottom:10px}
#storyList .storyCard.done{border-color:rgba(143,230,168,.55)}
#storyList .storyCard.lock{opacity:.55}
#storyList .scNo{color:#ffd77a;font-size:12px;letter-spacing:2px}
#storyList .scName{color:#f0f0f0;font-size:17px;font-weight:700;margin:2px 0 4px}
#storyList .scTag{color:#9a9a9a;font-size:11px;margin-bottom:6px}
#storyList .scBrief{color:#cfcfcf;font-size:12px;line-height:1.65}
#storyList .scObj{color:#a8d8b0;font-size:12px;margin-top:6px;line-height:1.6}
#storyList .scRw{color:#d8b878;font-size:12px;margin-top:4px}
#storyList .scBtn{margin-top:8px;width:100%}
`;

const JOBS=[
  // ---------- index.html ----------
  ['index.html',
    '<button class="bigBtn navBtn" data-p="mPlay">撤 离 部 署</button>',
    '<button class="bigBtn navBtn" data-p="mPlay">撤 离 部 署</button>\n' +
    '<button class="bigBtn navBtn" data-p="mStory">剧 情 模 式</button>'],
  ['index.html',
    '<div id="mNet" class="mSub hidden">',
    STORY_PANEL+'\n<div id="mNet" class="mSub hidden">'],
  ['index.html',
    '<div id="nvgInd" class="hidden"></div>',
    '<div id="nvgInd" class="hidden"></div>\n'+STORY_HUD],
  ['index.html',
    '<script src="js/55_net.js?v=20260919m"></script>',
    '<script src="js/55_net.js?v=20260919m"></script>\n<script src="js/56_story.js?v=20260919m"></script>'],
  // ---------- 29_menus.js ----------
  ['js/29_menus.js',
    "['mPlay','mArmory','mCamp','mSet','mNet'].forEach(pid=>{ const e=el(pid); if(e) e.classList.toggle('hidden',pid!==id); });",
    "['mPlay','mStory','mArmory','mCamp','mSet','mNet'].forEach(pid=>{ const e=el(pid); if(e) e.classList.toggle('hidden',pid!==id); });\n" +
    "if(id==='mStory'&&typeof storyRenderPanel==='function') storyRenderPanel();"],
  ['js/29_menus.js',
    'function startMatch(){\nclearRaidActors();',
    'function startMatch(){\nclearRaidActors();\n// 剧情模式: 装载本章目标与事件 (没走剧情时是 no-op)\nif(typeof storyApplyChapter===\'function\') storyApplyChapter();'],
  // ---------- 35_extraction.js ----------
  ['js/35_extraction.js',
    'function finishRaid(extracted){\n if(matchOver) return;\n matchOver=true;',
    'function finishRaid(extracted){\n if(matchOver) return;\n matchOver=true;\n' +
    ' // 剧情模式: 判定本章成败并推进 (必须在 mergeRunLoot 之前 —— 目标要读 RUN.loot 里的样本/文件)\n' +
    " if(typeof storyOnRaidEnd==='function') storyOnRaidEnd(extracted);"],
];

let fatal=0;
const cache={};
for(const [f] of JOBS) if(!cache[f]) cache[f]=fs.readFileSync(R(f),'utf8');
for(const [file,from] of JOBS){
  const eol=cache[file].includes('\r\n')?'\r\n':'\n';
  const n=cache[file].split(from.split('\n').join(eol)).length-1;
  console.log((n===1?'✅':'❌')+` ${file}  命中 ${n}/1  «${from.slice(0,44).replace(/\n/g,'⏎')}»`);
  if(n!==1) fatal++;
}
if(fatal){ console.log('\n❌ 有 '+fatal+' 处未命中, 未写盘'); process.exit(1); }
for(const [file,from,to] of JOBS){
  let s=fs.readFileSync(R(file),'utf8');
  const eol=s.includes('\r\n')?'\r\n':'\n';
  s=s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file),s,'utf8');
}
// CSS 追加
{
  const P=R('css/style.css');
  let s=fs.readFileSync(P,'utf8');
  const eol=s.includes('\r\n')?'\r\n':'\n';
  if(s.indexOf('#storyHud')<0){
    s+=STORY_CSS.split('\n').join(eol);
    fs.writeFileSync(P,s,'utf8');
    console.log('💾 css/style.css 已追加剧情样式');
  } else console.log('ℹ️ css/style.css 已有剧情样式, 跳过');
}
console.log('\n💾 已写盘: '+[...new Set(JOBS.map(j=>j[0]))].join(', '));
console.log('✅ 共 '+JOBS.length+' 处已应用');
