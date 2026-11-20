// TOUCHUI 补完: 设置面板开关 + 运行时键盘探测 + CSS
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const CODE = [
  '// ===== 虚拟按键: 手动开关 + 键盘探测 (2026-09-28) =====',
  '// 设置面板「虚拟按键」: 自动 / 常开 / 常关 —— 改完重载生效 (TOUCHUI 是加载时算出的 const)',
  '(function touchModeBtn(){',
  "const b=document.getElementById('touchModeBtn');",
  'if(!b) return;',
  "const cur=()=>{ try{ return localStorage.getItem('sf_touch'); }catch(e){ return null; } };",
  "const sync=()=>{ const v=cur(); b.textContent=(v==='1')?'常开':((v==='0')?'常关':'自动'); b.classList.toggle('sel',v!==null); };",
  'sync();',
  'b.onclick=()=>{',
  'const v=cur();',
  "const next=(v===null)?'1':((v==='1')?'0':null);",
  // 回到「自动」时一并清掉键盘记忆, 否则永远是「检测到键盘」的状态
  "try{ if(next===null){ localStorage.removeItem('sf_touch'); localStorage.removeItem('sf_kb'); } else localStorage.setItem('sf_touch',next); }catch(e){}",
  'sync();',
  "if(typeof showScorePop==='function') showScorePop('虚拟按键: '+((next==='1')?'常开':((next==='0')?'常关':'自动'))+' · 重载生效');",
  'setTimeout(()=>location.reload(),600);',
  '};',
  '})();',
  '// 键盘探测: 真的按下物理键 → 有键盘 → 收起虚拟按键并记住 (写 sf_kb)',
  '// ⚠️ 只对「触控屏 PC」这条软路径生效: 有触摸屏、主指针不是粗指针、且不是手机/平板。',
  '//    手机/平板即使外接键盘也保留虚拟按键 (少数派, 且拔掉键盘就没法操作了)。',
  'if(TOUCHUI&&HAS_TOUCH&&!COARSE_PTR&&!MOBILE){',
  'const onKey=e=>{',
  " if(e.key==='Shift'||e.key==='Control'||e.key==='Alt'||e.key==='Meta') return;   // 纯修饰键不算",
  ' window.removeEventListener(\'keydown\',onKey,true);',
  " try{ localStorage.setItem('sf_kb','1'); }catch(_){}",
  " document.body.classList.remove('touchui');",
  " if(typeof showScorePop==='function') showScorePop('检测到键盘 · 已收起虚拟按键 (设置里可改成「常开」)');",
  '};',
  "window.addEventListener('keydown',onKey,true);",
  '}',
].join('\n');

const CSS = [
  '',
  '/* ===== PC 触控屏: 显示虚拟按键时套用移动端相关适配 (见 01_data 的 TOUCHUI) ===== */',
  '/* ⚠️ 只加「触控相关」的规则 —— 不动 body.mobile 那套 (隐藏任务 HUD 等), PC 屏幕大, 不该照搬 */',
  'body.touchui #touchUI { display:block; }',
  'body.touchui #hint, body.touchui #ctrlHelp, body.touchui #interact { display:none !important; }',
  'body.touchui .bagAct { min-height:44px; font-size:14px; letter-spacing:2px; }',
  'body.touchui button.secTake { min-height:34px; padding:6px 14px; font-size:13px; letter-spacing:2px; }',
  'body.touchui #storyHud { right:8px; top:auto; bottom:104px; width:172px; font-size:11px; padding:6px 8px; }',
].join('\n');

let bad = 0;
// ① 31_touch.js: 插到 `if(TOUCHUI){` 之前
{
  const P = R('js/31_touch.js');
  let s = fs.readFileSync(P, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const anchor = "if(TOUCHUI){\ndocument.body.classList.add('touchui');";
  const A = anchor.split('\n').join(eol);
  if (s.split(A).length - 1 !== 1) { console.log('❌ 31_touch 锚点未命中'); bad++; }
  else if (s.indexOf('touchModeBtn') >= 0) console.log('ℹ️ 31_touch 已有 touchModeBtn, 跳过');
  else {
    s = s.split(A).join(CODE.split('\n').join(eol) + eol + A);
    fs.writeFileSync(P, s, 'utf8');
    console.log('✅ js/31_touch.js 已插入开关 + 键盘探测');
  }
}
// ② CSS 追加
{
  const P = R('css/style.css');
  let s = fs.readFileSync(P, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  if (s.indexOf('body.touchui #touchUI') >= 0) console.log('ℹ️ CSS 已有 touchui 规则, 跳过');
  else { fs.writeFileSync(P, s + CSS.split('\n').join(eol), 'utf8'); console.log('✅ css/style.css 已追加 touchui 规则'); }
}
process.exit(bad ? 1 : 0);
