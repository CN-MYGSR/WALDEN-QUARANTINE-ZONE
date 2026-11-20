// 修: 剧情模式卡在"待打"状态 + 给每帧剧情代码加保护
//
// ① 真 bug: `storyApplyChapter()` 里 `if(SRAID.ch) storyClearPending();`
//    —— 地图不匹配时 SRAID.ch 被置空, **sf_story 却永远不清** →
//    之后**每次页面加载** storyAutoDeploy 都会强制进场, 玩家再也回不到正常菜单流程 (用户报「loop」)。
// ② storyAutoDeploy 不校验地图就进场 → 切图后也会被强拉进局。
// ③ storyUpdate 在**每帧**路径上且没有 try/catch:
//    一旦抛错 ① 主循环后半段 (updateFlashlight/updateHUD/updateStrobe…) 全不执行,
//    ② 控制台每帧刷同一条错误。一个剧情 bug 不能拖垮整个游戏。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const JOBS = [
  // ① + ③ storyApplyChapter: 无条件清标记 + 外层保护
  ['js/56_story.js',
    'function storyApplyChapter(){\n' +
    '  const i=storyPendingIdx();\n' +
    '  SRAID.ch=(i>=0&&STORY_CHAPTERS[i])?STORY_CHAPTERS[i]:null;\n' +
    '  // 一致性守卫: 章节地图必须与当前战役一致 —— 否则玩家切了图, 剧情会误挂上去\n' +
    "  if(SRAID.ch&&typeof CAMPAIGN!=='undefined'&&CAMPAIGN.id!==SRAID.ch.map) SRAID.ch=null;\n" +
    '  SRAID.idx=SRAID.ch?i:-1;\n' +
    '  SRAID.obj=SRAID.ch?SRAID.ch.obj.map(o=>Object.assign({},o,{met:false})):[];\n' +
    "  SRAID.t=0; SRAID.fired={}; SRAID.live=!!SRAID.ch; SRAID.ended=false; SRAID.alarm=0; SRAID.say=''; SRAID.sayT=0;\n" +
    '  if(SRAID.ch) storyClearPending();\n' +
    '  storyRenderHud();\n' +
    '}',
    '// ⚠️ 外层 try/catch: 本函数由 startMatch() 调用, 抛错会中断建局 —— 剧情逻辑绝不能拖垮主流程。\n' +
    'function storyApplyChapter(){\n' +
    '  try{\n' +
    '    const i=storyPendingIdx();\n' +
    '    // ⚠️⚠️ **无论是否采纳都必须清掉待打标记**。曾写成 `if(SRAID.ch) storyClearPending();`,\n' +
    '    //    于是地图不匹配(玩家切了图)时标记会一直留着 → 之后**每次页面加载**都被 storyAutoDeploy\n' +
    '    //    强制进场, 玩家再也回不到正常菜单流程 (用户报「loop」)。\n' +
    '    storyClearPending();\n' +
    '    SRAID.ch=(i>=0&&STORY_CHAPTERS[i])?STORY_CHAPTERS[i]:null;\n' +
    '    // 一致性守卫: 章节地图必须与当前战役一致 —— 否则玩家切了图, 剧情会误挂上去\n' +
    "    if(SRAID.ch&&typeof CAMPAIGN!=='undefined'&&CAMPAIGN.id!==SRAID.ch.map) SRAID.ch=null;\n" +
    '    SRAID.idx=SRAID.ch?i:-1;\n' +
    '    SRAID.obj=SRAID.ch?SRAID.ch.obj.map(o=>Object.assign({},o,{met:false})):[];\n' +
    "    SRAID.t=0; SRAID.fired={}; SRAID.live=!!SRAID.ch; SRAID.ended=false; SRAID.alarm=0; SRAID.say=''; SRAID.sayT=0;\n" +
    '    storyRenderHud();\n' +
    "  }catch(e){ console.error('[story] applyChapter failed:',e); SRAID.ch=null; SRAID.live=false; storyClearPending(); }\n" +
    '}'],
  // ② storyAutoDeploy 校验地图
  ['js/56_story.js',
    '(function storyAutoDeploy(){\n' +
    '  if(storyPendingIdx()<0) return;\n' +
    '  let n=0;',
    '(function storyAutoDeploy(){\n' +
    '  const _pi=storyPendingIdx();\n' +
    '  if(_pi<0||!STORY_CHAPTERS[_pi]) return;\n' +
    '  // ⚠️ 地图不匹配就别进场 (玩家可能切了图): 清掉标记并放弃 —— 否则会被反复强制进场\n' +
    "  if(typeof CAMPAIGN!=='undefined'&&CAMPAIGN.id!==STORY_CHAPTERS[_pi].map){ storyClearPending(); return; }\n" +
    '  let n=0;'],
  // ③ 每帧钩子加保护 (只报一次, 然后停用剧情逻辑)
  ['js/56_story.js',
    '// wrap 一个每帧都会被调用的函数 (与 39_quests 包 updateExtraction 同一手法)\n' +
    'const _storyOrigMedCrates=updateMedCrates;\n' +
    'updateMedCrates=function(dt){ _storyOrigMedCrates(dt); storyUpdate(dt); };',
    '// wrap 一个每帧都会被调用的函数 (与 39_quests 包 updateExtraction 同一手法)\n' +
    '// ⚠️⚠️ storyUpdate 在**每帧**路径上, 必须包 try/catch:\n' +
    '//   一旦它抛错 ① 主循环后半段 (updateFlashlight/updateHUD/updateStrobe…) 全都不执行,\n' +
    '//   ② 控制台每帧刷同一条错误。**一个剧情 bug 不能拖垮整个游戏。**\n' +
    '//   出错只报一次, 然后停用剧情逻辑 (其余功能照常)。\n' +
    'let _storyBroken=false;\n' +
    'const _storyOrigMedCrates=updateMedCrates;\n' +
    'updateMedCrates=function(dt){\n' +
    '  _storyOrigMedCrates(dt);\n' +
    '  if(_storyBroken) return;\n' +
    '  try{ storyUpdate(dt); }\n' +
    "  catch(e){ _storyBroken=true; console.error('[story] storyUpdate 抛错, 已停用剧情逻辑 (游戏其余部分不受影响):', e); }\n" +
    '};'],
  // ③ 结算钩子也加保护 (抛错会让 finishRaid 中断 → 永远结算不了)
  ['js/35_extraction.js',
    " if(typeof storyOnRaidEnd==='function') storyOnRaidEnd(extracted);",
    " if(typeof storyOnRaidEnd==='function'){ try{ storyOnRaidEnd(extracted); }catch(e){ console.error('[story] onRaidEnd failed:',e); } }"],
];

let fatal = 0;
const cache = {};
for (const [f] of JOBS) if (!cache[f]) cache[f] = fs.readFileSync(R(f), 'utf8');
for (const [file, from] of JOBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  命中 ${n}/1  «${from.slice(0, 42).replace(/\n/g, '⏎')}»`);
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
