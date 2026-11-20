// 屏幕边缘反馈接线: 血块遮罩 DOM + CSS + 脚本标签
const fs = require('fs');

function read(p){ return fs.readFileSync(p, 'utf8'); }
function rep(s, from, to, tag){
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次'); process.exit(1); }
  console.log('✅ [' + tag + ']');
  return s.split(from).join(to);
}

// ===== ① index.html: 遮罩 DOM + 脚本标签 =====
let h = read('index.html');
const HE = h.includes('\r\n') ? '\r\n' : '\n';

h = rep(h,
  '<div id="vig"></div>',
  '<div id="vig"></div><div id="bloodOv"></div>',
  'index.html 血块遮罩');

const anchor = '<script src="js/58_vault.js?v=20261030b"></script>';
h = rep(h, anchor,
  anchor + HE + '<script src="js/59_screenfx.js?v=20261030b"></script>',
  'index.html 脚本标签');
fs.writeFileSync('index.html', h, 'utf8');

// ===== ② CSS: 血块 =====
let c = read('css/style.css');
const CE = c.includes('\r\n') ? '\r\n' : '\n';

// 插在 #vig 规则后面, 保持遮罩规则集中
const vigRule = '#vig { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,var(--vigA,.38)) 100%); }';
const bloodRule = [
  vigRule,
  '/* 受伤血块: 多团不规则血渍贴在四周 (由 59_screenfx 每帧写 opacity) */',
  '#bloodOv{ position:absolute; inset:0; opacity:0; pointer-events:none;',
  '  background:',
  '    radial-gradient(34% 26% at 1% 4%, rgba(126,8,10,.95) 0%, rgba(92,5,7,.62) 38%, rgba(60,3,4,0) 72%),',
  '    radial-gradient(26% 22% at 99% 9%, rgba(126,8,10,.92) 0%, rgba(88,5,6,.50) 40%, rgba(60,3,4,0) 74%),',
  '    radial-gradient(30% 20% at 4% 97%, rgba(118,7,9,.90) 0%, rgba(84,4,6,.45) 42%, rgba(60,3,4,0) 72%),',
  '    radial-gradient(38% 24% at 98% 96%, rgba(126,8,10,.92) 0%, rgba(88,5,6,.50) 40%, rgba(60,3,4,0) 74%),',
  '    radial-gradient(18% 14% at 44% 1%, rgba(104,5,7,.80) 0%, rgba(70,3,5,0) 70%),',
  '    radial-gradient(16% 18% at 62% 100%, rgba(104,5,7,.78) 0%, rgba(70,3,5,0) 72%),',
  '    radial-gradient(12% 30% at 0% 52%, rgba(112,6,8,.55) 0%, rgba(70,3,5,0) 70%),',
  '    radial-gradient(12% 28% at 100% 58%, rgba(112,6,8,.50) 0%, rgba(70,3,5,0) 70%);',
  '  filter:blur(1.5px) saturate(1.1); }'
].join(CE);

c = rep(c, vigRule, bloodRule, 'CSS 血块规则');
fs.writeFileSync('css/style.css', c, 'utf8');

console.log('\n接线完成');
