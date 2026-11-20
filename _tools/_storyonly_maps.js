// 剧情专用地图 (anvil_yard / anvil_b2) 从沙盒地图列表里摘掉 —— 只能从主菜单「剧情模式」进入
// 用法: node _tools/_storyonly_maps.js
const fs = require('fs');

function read(p){ return fs.readFileSync(p, 'utf8'); }
function eolOf(s){ return s.includes('\r\n') ? '\r\n' : '\n'; }
function rep(s, from, to, tag, expect){
  const n = s.split(from).length - 1;
  const want = expect === undefined ? 1 : expect;
  if (n !== want) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次 (期望 ' + want + ')'); process.exit(1); }
  console.log('✅ [' + tag + '] 命中 ' + n + ' 次');
  return s.split(from).join(to);
}

// ===== ① 01_data.js: 两张剧情地图打 storyOnly 标记 =====
let d = read('js/01_data.js');
const de = eolOf(d);

// anvil_yard (用 forceWeather+botMul 两行定位, 避免误伤)
d = rep(d,
  " forceWeather:'anvilhaze'," + de + " botMul:{ enemyHp:1.10,",
  " forceWeather:'anvilhaze', storyOnly:true," + de + " botMul:{ enemyHp:1.10,",
  'anvil_yard storyOnly');

d = rep(d,
  " forceWeather:'labhaze'," + de + " botMul:{ enemyHp:1.24,",
  " forceWeather:'labhaze', storyOnly:true," + de + " botMul:{ enemyHp:1.24,",
  'anvil_b2 storyOnly');

// 载入回退: 存档里的地图索引指向剧情图, 但当前没有待打章节 → 退回第一张沙盒地图
d = rep(d,
  "if(!isFinite(i)||i<0||i>=CAMPAIGNS.length) i=0;" + de + "return i;",
  "if(!isFinite(i)||i<0||i>=CAMPAIGNS.length) i=0;" + de +
  "// 剧情专用地图不能当沙盒地图用: 没有待打章节(sf_story)时回退到第一张" + de +
  "try{ if(CAMPAIGNS[i]&&CAMPAIGNS[i].storyOnly&&!localStorage.getItem('sf_story')) i=0; }catch(e){}" + de +
  "return i;",
  'CAMPAIGN_IDX 回退');
fs.writeFileSync('js/01_data.js', d, 'utf8');

// ===== ② 43_maps.js: 列表过滤 + 守卫函数 =====
let m = read('js/43_maps.js');
const me = eolOf(m);

m = rep(m,
  "function renderMapCards(){" + me,
  "// 剧情专用地图 (storyOnly) 只能从主菜单「剧情模式」进入, 沙盒不给选" + me +
  "function storyPendingChapter(){" + me +
  "  try{ return !!localStorage.getItem('sf_story'); }catch(e){ return false; }" + me +
  "}" + me +
  "function storyMapBlocked(){" + me +
  "  const c=CAMPAIGNS[CAMPAIGN_IDX];" + me +
  "  if(!c||!c.storyOnly) return false;" + me +
  "  if(storyPendingChapter()) return false;                                  // 剧情模式待打 → 放行" + me +
  "  if(typeof player!=='undefined'&&player.deployed&&!matchOver) return false;  // 局内重新部署 → 放行" + me +
  "  return true;" + me +
  "}" + me +
  "function renderMapCards(){" + me,
  'storyMapBlocked 定义');

m = rep(m,
  "  CAMPAIGNS.forEach((c,i)=>{" + me + "    const b=document.createElement('button');",
  "  CAMPAIGNS.forEach((c,i)=>{" + me +
  "    if(c.storyOnly) return;   // 剧情专用地图不进沙盒列表" + me +
  "    const b=document.createElement('button');",
  'renderMapCards 过滤');

m = rep(m,
  "  });" + me + "  showMapBrief(CAMPAIGN_IDX);" + me + "}",
  "  });" + me +
  "  const cur=CAMPAIGNS[CAMPAIGN_IDX];" + me +
  "  if(cur&&cur.storyOnly&&!storyPendingChapter()){" + me +
  "    // 当前地图是剧情图(打完剧情章节后可能停在这里) → 提示选一张沙盒地图" + me +
  "    const fb=CAMPAIGNS.findIndex(c=>!c.storyOnly);" + me +
  "    showMapBrief(fb>=0?fb:0);" + me +
  "    const box=el('mapBrief');" + me +
  "    if(box) box.innerHTML='<b style=\"color:#e0b0a0\">当前地图是剧情专用</b> —— 请选一张沙盒地图<br>'" + me +
  "      +'<span style=\"opacity:.8\">剧情地图只能从主菜单「剧情模式」进入</span>';" + me +
  "  } else {" + me +
  "    showMapBrief(CAMPAIGN_IDX);" + me +
  "  }" + me + "}",
  'renderMapCards 尾部提示');
fs.writeFileSync('js/43_maps.js', m, 'utf8');

// ===== ③ 29_menus.js: startMatch 建局守卫 (全项目唯一建局入口) =====
let n = read('js/29_menus.js');
const ne = eolOf(n);
n = rep(n,
  "function startMatch(){" + ne + "clearRaidActors();",
  "function startMatch(){" + ne +
  "// 剧情专用地图只能从主菜单「剧情模式」进入 —— 沙盒不给建局" + ne +
  "if(typeof storyMapBlocked==='function'&&storyMapBlocked()){" + ne +
  "  if(typeof showScorePop==='function') showScorePop('剧情地图只能在剧情模式进入 —— 请先选一张沙盒地图');" + ne +
  "  return;" + ne +
  "}" + ne +
  "clearRaidActors();",
  'startMatch 守卫');
fs.writeFileSync('js/29_menus.js', n, 'utf8');

console.log('\n全部 6 处补丁已应用');
