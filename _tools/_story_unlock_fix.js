// 修: 章节完成后无法继续下一章
//
// 根因: `storyObjectivesMet()` 在**结算时重新求值**每个目标, 而不是用局内锁存的 o.met。
//   而 reach 是**瞬时目标**(抵达竖井口) —— 玩家走到撤离点结算时
//   `hypot(0-0, 92-0) <= 9` 必然 false → 判定未达成 → STORY.done 不写 → 下一章永不解锁。
//   (线上实测: 「章节完成后仍然无法继续下一章」)
//
// 修法: 结算判定以**局内锁存的 o.met** 为准; 只有 escort 例外 ——
//   它要求「撤离那一刻队友仍在位」, 所以必须重新求值。
//   同时 storyUpdate 的锁存循环不再锁存 escort, 让 HUD 反映真实状态。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const JOBS = [
  ['js/56_story.js',
    'function storyObjectivesMet(){\n' +
    "  for(const o of SRAID.obj){ if(o.type==='extract') continue; if(!storyObjMet(o)) return false; }\n" +
    '  return true;\n' +
    '}',
    '// ⚠️ 结算判定必须用**局内锁存的 o.met**, 不能在这里重新求值:\n' +
    "//    reach 这类目标是「瞬时」的 —— 玩家抵达竖井口后继续走到撤离点, 结算时再算 hypot()\n" +
    '//    必然不在原地 → 目标判为未达成 → **章节永远无法通关** (线上实测: 章节完成后无法继续下一章)。\n' +
    "//    只有 escort 例外: 它要求「撤离那一刻队友仍在位」, 所以结算时必须重新求值。\n" +
    'function storyObjectivesMet(){\n' +
    '  for(const o of SRAID.obj){\n' +
    "    if(o.type==='extract') continue;\n" +
    "    if(o.type==='escort'){ if(!storyObjMet(o)) return false; continue; }\n" +
    '    if(o.met) continue;              // 局内已锁存\n' +
    '    if(storyObjMet(o)) continue;     // 兜底: kill / survive / fetch 这类单调目标\n' +
    '    return false;\n' +
    '  }\n' +
    '  return true;\n' +
    '}'],
  ['js/56_story.js',
    '  for(const o of SRAID.obj){\n' +
    '    if(o.met) continue;\n' +
    "    if(o.type==='extract') continue;\n" +
    '    if(storyObjMet(o)){ o.met=true; changed=true; }\n' +
    '  }',
    '  for(const o of SRAID.obj){\n' +
    '    if(o.met) continue;\n' +
    "    // escort 不锁存: 它要按「撤离那一刻队友是否在位」判, 锁存会让 HUD 一直显示已完成\n" +
    "    if(o.type==='extract'||o.type==='escort') continue;\n" +
    '    if(storyObjMet(o)){ o.met=true; changed=true; }\n' +
    '  }'],
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
console.log('\n💾 已写盘: js/56_story.js');
