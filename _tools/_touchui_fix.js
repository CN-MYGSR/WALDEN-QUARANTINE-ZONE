// 修: PC 触控屏没有虚拟按键
//
// 旧判定: `MOBILE = maxTouchPoints>0 && (pointer:coarse)` —— 只有手机/平板成立。
// ⚠️ 带触控屏的 PC 主指针常被浏览器报成 fine(鼠标/触控板) → MOBILE=false
//    → 虚拟按键不显示, 而且 31_touch 里 `if(MOBILE)` 连**触控事件都不注册** (用户实测)。
//
// 修法: 另立一个 TOUCHUI 开关 (= MOBILE 或「有触摸屏 + 检测不到键盘」),
//   把**触控 UI 相关**的判定从 MOBILE 换成 TOUCHUI;
//   **键鼠特性**(指针锁定) 仍用 MOBILE —— PC 触控屏照样能用鼠标 + 指针锁定。
// 浏览器没有「有没有键盘」的 API, 用两个信号近似:
//   ① 媒体查询 (hover:hover && pointer:fine) —— 能悬停 + 主指针精细的设备基本都配键盘/触控板
//   ② 运行时: 真的按下过一次物理键 → 一定有键盘 (31_touch 的 keydown 监听, 写 sf_kb)
//   设置面板「虚拟按键」可手动强制 (sf_touch: '1' 常开 / '0' 常关 / 缺省=自动)
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const TOUCH_FLAGS = [
  '// ===== 虚拟按键开关 TOUCHUI (2026-09-28) =====',
  '// ⚠️ 为什么和 MOBILE 分开: MOBILE 只管「手机/平板」, 它还控制一整套 body.mobile 的移动端 UI 适配',
  '//    (隐藏任务 HUD / 放大背包按钮…)。带触控屏的 PC 只是**缺虚拟按键**, 不该顺手改掉别的。',
  '// 判定 = MOBILE(手机/平板) 或 「有触摸屏 + 检测不到键盘」。',
  '// ⚠️ 浏览器没有「有没有键盘」的 API, 只能用两个近似信号:',
  '//    ① 媒体查询 (hover:hover && pointer:fine): 能悬停 + 主指针精细的设备基本都配键盘/触控板',
  '//    ② 运行时: 真的按下过物理键 → 一定有键盘 (见 31_touch 的 keydown 监听, 会写 sf_kb)',
  'const HAS_TOUCH=(()=>{ try{ return (navigator.maxTouchPoints|0)>0||(\'ontouchstart\' in window); }catch(e){ return false; } })();',
  'const COARSE_PTR=(()=>{ try{ return matchMedia(\'(pointer:coarse)\').matches; }catch(e){ return false; } })();',
  'const KB_HINT=(()=>{ try{ return matchMedia(\'(hover:hover) and (pointer:fine)\').matches; }catch(e){ return true; } })();',
  'const TOUCHUI=(()=>{',
  ' try{',
  '  const ov=localStorage.getItem(\'sf_touch\');',
  '  if(ov===\'1\') return true;                       // 设置里强制常开',
  '  if(ov===\'0\') return false;                      // 设置里强制常关',
  '  if(MOBILE) return true;                          // 手机 / 平板',
  '  return HAS_TOUCH&&!KB_HINT&&!localStorage.getItem(\'sf_kb\');   // 触控屏 PC: 有触摸 + 没检测到键盘',
  ' }catch(e){ return MOBILE; }',
  '})();',
].join('\n');

const JOBS = [
  // ① 01_data: 在 MOBILE 之后追加 TOUCHUI
  ['js/01_data.js',
    'const MOBILE=(()=>{\n' +
    "try{ return navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches; }catch(e){ return 'ontouchstart' in window; }\n" +
    '})();',
    'const MOBILE=(()=>{\n' +
    "try{ return navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches; }catch(e){ return 'ontouchstart' in window; }\n" +
    '})();\n' + TOUCH_FLAGS],
  // ② 31_touch: 缩放守卫 / 注册触控 / body 类
  ['js/31_touch.js',
    'function applyTouchScale(){\nif(!MOBILE) return;',
    'function applyTouchScale(){\nif(!TOUCHUI) return;'],
  ['js/31_touch.js',
    'if(MOBILE){\ndocument.body.classList.add(\'mobile\');',
    'if(TOUCHUI){\ndocument.body.classList.add(\'touchui\');'],
  // ③ 30_main: 触控按钮显隐
  ['js/30_main.js',
    'if(MOBILE&&window.updateTouchVis) updateTouchVis();',
    'if(TOUCHUI&&window.updateTouchVis) updateTouchVis();'],
  // ④ 38_tarkov: 搜刮面板触屏按钮 + 背包提示文案
  ['js/38_tarkov.js',
    "if(tb) tb.style.display=tb2.style.display=tb3.style.display=(MOBILE&&entries.length)?'flex':'none';",
    "if(tb) tb.style.display=tb2.style.display=tb3.style.display=(TOUCHUI&&entries.length)?'flex':'none';"],
  ['js/38_tarkov.js',
    "if(typeof MOBILE!=='undefined'&&MOBILE){",
    "if(typeof TOUCHUI!=='undefined'&&TOUCHUI){"],
  // ⑤ 24_input: 指针锁定属于「键鼠特性」→ 也跟 TOUCHUI (触屏独用设备不该锁指针)
  ['js/24_input.js',
    'document.addEventListener(\'pointerlockchange\',()=>{\nif(MOBILE) return;',
    'document.addEventListener(\'pointerlockchange\',()=>{\nif(TOUCHUI) return;'],
  ['js/24_input.js',
    'function lockPointer(){\nif(MOBILE){ pointerLocked=true; return; }',
    'function lockPointer(){\nif(TOUCHUI){ pointerLocked=true; return; }'],
  // ⑥ 24_input: 建造提示里的键盘按键提示
  ['js/24_input.js',
    "showScorePop('建造选择: '+bn+' (消耗'+BUILD_COST[bt]+'点'+(MOBILE?'':' · 按B放置')+')');",
    "showScorePop('建造选择: '+bn+' (消耗'+BUILD_COST[bt]+'点'+(TOUCHUI?'':' · 按B放置')+')');"],
  // ⑦ 29_menus: 兵种技能提示文案
  ['js/29_menus.js',
    "if(p.cls===2) showScorePop(MOBILE?'医疗兵 · 左侧「医疗箱」放置 · 「绷带」自疗':'医疗兵 · 按 '+keyLabelOf('skill')+' 放置医疗箱 / '+keyLabelOf('heal')+' 包扎');\n" +
    "else if(p.cls===4) showScorePop(MOBILE?'工程兵 · 「工事」选类型 · 「建造」锤击建造':'工程兵 · 按 '+keyLabelOf('build')+' 选择工事, 按 '+keyLabelOf('skill')+' 锤击建造');",
    "if(p.cls===2) showScorePop(TOUCHUI?'医疗兵 · 左侧「医疗箱」放置 · 「绷带」自疗':'医疗兵 · 按 '+keyLabelOf('skill')+' 放置医疗箱 / '+keyLabelOf('heal')+' 包扎');\n" +
    "else if(p.cls===4) showScorePop(TOUCHUI?'工程兵 · 「工事」选类型 · 「建造」锤击建造':'工程兵 · 按 '+keyLabelOf('build')+' 选择工事, 按 '+keyLabelOf('skill')+' 锤击建造');"],
  // ⑧ index.html: 设置面板加「虚拟按键」开关
  ['index.html',
    '<div class="sliderRow">触控按键大小 <input type="range" id="tsizeRange" min="70" max="150" value="100"><span class="val" id="tsizeVal">100%</span></div>',
    '<div class="sliderRow">触控按键大小 <input type="range" id="tsizeRange" min="70" max="150" value="100"><span class="val" id="tsizeVal">100%</span></div>\n' +
    '<div class="sliderRow">虚拟按键 <button class="optBtn" id="touchModeBtn" style="margin-left:10px">自动</button><span class="val" style="opacity:.65;font-size:11px">有触摸屏就会显示；检测到键盘会自动收起（PC 触控屏用）</span></div>'],
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
if (fatal) { console.log('\n❌ 有 ' + fatal + ' 处未命中, 未写盘'); process.exit(1); }
for (const [file, from, to] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
console.log('\n💾 已写盘: ' + [...new Set(JOBS.map(j => j[0]))].join(', '));
