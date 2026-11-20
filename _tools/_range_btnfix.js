// 修: 靶场按钮的 onclick 被 initMenuUI 里的 .navBtn 通用绑定覆盖 → 改为 initMenuUI 之后再绑
const fs = require('fs');
const P = 'js/61_range.js';
let s = fs.readFileSync(P, 'utf8');
const E = s.includes('\r\n') ? '\r\n' : '\n';

const old = [
'// ⑥ 主菜单按钮',
'(function(){',
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
'})();'
].join(E);

const neu = [
'// ⑥ 主菜单按钮',
'// ⚠️ 不能在这里直接绑: 29_menus 的 initMenuUI() 里有一句',
'//    document.querySelectorAll(\'.navBtn\').forEach(b=>{ b.onclick=... showPanel(b.dataset.p) })',
'//    而 initMenuUI 是 32_boot 在**所有脚本加载完之后**才调的 → 会把这里的绑定覆盖掉。',
'//    所以包一层 initMenuUI, 等它跑完再绑。',
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
'}',
"if(typeof initMenuUI==='function'){",
'  const _origInitUI=initMenuUI;',
'  initMenuUI=function(){',
'    const r=_origInitUI.apply(this,arguments);',
"    try{ rangeBindMenuBtn(); }catch(e){ console.warn('[range] bind menu btn failed',e); }",
'    return r;',
'  };',
'} else {',
"  setTimeout(()=>{ try{ rangeBindMenuBtn(); }catch(e){} },400);",
'}'
].join(E);

const n = s.split(old).length - 1;
if (n !== 1) { console.log('❌ 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(P, s.split(old).join(neu), 'utf8');
console.log('✅ 靶场按钮改为 initMenuUI 之后绑定');
