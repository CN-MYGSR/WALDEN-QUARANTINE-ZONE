// 靶场按钮: 加捕获阶段事件委托 (不依赖 onclick 槽位) + 抽出 rangeOpen()
const fs = require('fs');
const P = 'js/61_range.js';
let s = fs.readFileSync(P, 'utf8');
const E = s.includes('\r\n') ? '\r\n' : '\n';

const old = [
'function rangeBindMenuBtn(){',
"  const b=document.getElementById('rangeBtn');",
'  if(!b) return;',
'  b.onclick=()=>{',
"    const idx=(typeof CAMPAIGNS!=='undefined')?CAMPAIGNS.findIndex(c=>c.rangeOnly):-1;",
"    if(idx<0){ if(typeof showScorePop==='function') showScorePop('靶场地图缺失'); return; }",
'    try{',
"      localStorage.setItem('sf_campaign',String(idx));",
"      localStorage.setItem('sf_range','1');",
"      localStorage.setItem('sf_autodeploy','1');",
'    }catch(e){}',
'    location.reload();',
'  };',
'}'
].join(E);

const neu = [
'function rangeOpen(){',
"  const idx=(typeof CAMPAIGNS!=='undefined')?CAMPAIGNS.findIndex(c=>c.rangeOnly):-1;",
"  if(idx<0){ if(typeof showScorePop==='function') showScorePop('靶场地图缺失'); return; }",
'  try{',
"    localStorage.setItem('sf_campaign',String(idx));",
"    localStorage.setItem('sf_range','1');",
"    localStorage.setItem('sf_autodeploy','1');",
'  }catch(e){}',
'  location.reload();',
'}',
'function rangeBindMenuBtn(){',
"  const b=document.getElementById('rangeBtn');",
'  if(!b) return;',
'  b.onclick=rangeOpen;',
'}',
'// 兜底: 捕获阶段的事件委托 —— 不依赖 onclick 槽位, 任何后来对 .navBtn 的重绑都盖不掉它。',
'// (29_menus 的 initMenuUI 会把 .navBtn 的 onclick 全部重绑成 showPanel, 见上面注释)',
"document.addEventListener('click',function(ev){",
'  const t=ev.target;',
'  if(!t||typeof t.closest!==\'function\') return;',
"  if(!t.closest('#rangeBtn')) return;",
'  ev.preventDefault();',
'  ev.stopPropagation();',
'  rangeOpen();',
'},true);'
].join(E);

const n = s.split(old).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, s.split(old).join(neu), 'utf8');
console.log('✅ 已加捕获阶段事件委托');
