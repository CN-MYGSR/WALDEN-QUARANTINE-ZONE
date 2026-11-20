// 靶场接线: 数据(地图/天气) + 建图 case + 沙盒守卫 + HTML(按钮/脚本/HUD)
const fs = require('fs');

function read(p){ return fs.readFileSync(p, 'utf8'); }
function rep(s, from, to, tag){
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次'); process.exit(1); }
  console.log('✅ [' + tag + ']');
  return s.split(from).join(to);
}

// ================= ① 01_data.js =================
let d = read('js/01_data.js');
const DE = d.includes('\r\n') ? '\r\n' : '\n';

// 天气: 室内
d = rep(d,
  ",anvilhaze:{name:'工业尘霾'}};",
  ",anvilhaze:{name:'工业尘霾'},indoor:{name:'室内'}};",
  'WEATHER_MODES.indoor');

d = rep(d,
  'anvilhaze:{fogFar:0.50,fogNear:22,sun:0.40,hemi:0.56,skyDark:0.40,sight:0.60}' + DE + '};',
  'anvilhaze:{fogFar:0.50,fogNear:22,sun:0.40,hemi:0.56,skyDark:0.40,sight:0.60},' + DE +
  '// 靶场专用: 室内没有天气, 全亮' + DE +
  'indoor:{fogFar:1,fogNear:60,sun:1,hemi:1,skyDark:0,sight:1}' + DE + '};',
  'WEATHER_FX.indoor');

// 靶场地图: 追加在 CAMPAIGNS 末尾 (和剧情图一样, 索引只增不改)
const entry = [
  ' // ===== 靶场 (只能从主菜单「靶 场」进入) =====',
  " { id:'range', title:'室内靶场', sub:'靶场 · 练习枪法 · 2~30m 固定/移动靶', f:['usec','pmc'], theme:'lab', allyBots:0, enemyBots:0,",
  "  terr:'flat', layout:'range', mode:'extract', atk:0, modeName:'室内靶场', mapSize:90,",
  "  flags:[], bases:[{x:0,z:14},{x:0,z:-18}], sineRoad:false,",
  '  roads:[], trench:[],',
  "  mapName:'室内靶场',",
  "  mapTag:'靶场 · 2~30m 固定 / 移动靶',",
  "  mapDesc:'封闭靶道，射击线到挡弹墙 30m。免费武器、无限弹药 —— 练枪法用的，没有敌人也没有战利品。',",
  "  mapLoot:'无战利品',",
  "  mapThreat:'无敌人',",
  '  mapDiff:0,',
  '  rangeOnly:true,',
  "  forceWeather:'indoor',",
  '  botMul:{ enemyHp:1, enemyReact:1, enemySpread:1, friendHp:1 },',
  '  extract:[] },'
].join(DE);

d = rep(d,
  ' extract:[{x:0,z:66}] },' + DE + '];',
  ' extract:[{x:0,z:66}] },' + DE + entry + DE + '];',
  'CAMPAIGNS.range');

// 载入回退: 靶场图没有 sf_range 时不能当沙盒图用
d = rep(d,
  "try{ if(CAMPAIGNS[i]&&CAMPAIGNS[i].storyOnly&&!localStorage.getItem('sf_story')) i=0; }catch(e){}",
  "try{" + DE +
  " if(CAMPAIGNS[i]&&CAMPAIGNS[i].storyOnly&&!localStorage.getItem('sf_story')) i=0;" + DE +
  " if(CAMPAIGNS[i]&&CAMPAIGNS[i].rangeOnly&&!localStorage.getItem('sf_range')) i=0;" + DE +
  "}catch(e){}",
  'CAMPAIGN_IDX 回退');
fs.writeFileSync('js/01_data.js', d, 'utf8');

// ================= ② 08_world.js =================
let w = read('js/08_world.js');
const WE = w.includes('\r\n') ? '\r\n' : '\n';
w = rep(w,
  "case 'anvil_b2': layoutAnvilB2(); break;",
  "case 'anvil_b2': layoutAnvilB2(); break;" + WE + "case 'range': layoutRange(); break;",
  '08_world case');
fs.writeFileSync('js/08_world.js', w, 'utf8');

// ================= ③ 43_maps.js =================
let m = read('js/43_maps.js');
const ME = m.includes('\r\n') ? '\r\n' : '\n';

// 地图卡片: 剧情图 + 靶场图都不进沙盒列表
m = rep(m,
  '    if(c.storyOnly) return;   // 剧情专用地图不进沙盒列表',
  '    if(c.storyOnly||c.rangeOnly) return;   // 剧情 / 靶场专用地图不进沙盒列表',
  'renderMapCards 过滤');

// 守卫: 靶场图也拦
m = rep(m,
  '  const c=CAMPAIGNS[CAMPAIGN_IDX];' + ME +
  '  if(!c||!c.storyOnly) return false;' + ME +
  '  if(storyPendingChapter()) return false;',
  '  const c=CAMPAIGNS[CAMPAIGN_IDX];' + ME +
  '  if(!c||(!c.storyOnly&&!c.rangeOnly)) return false;' + ME +
  '  if(storyPendingChapter()) return false;' + ME +
  "  try{ if(localStorage.getItem('sf_range')==='1') return false; }catch(e){}",
  'storyMapBlocked 靶场');

// 地图简介的「专用地图」提示
m = rep(m,
  '  if(cur&&cur.storyOnly&&!storyPendingChapter()){',
  "  let _rngPend=false; try{ _rngPend=localStorage.getItem('sf_range')==='1'; }catch(e){}" + ME +
  '  if(cur&&(cur.storyOnly||cur.rangeOnly)&&!storyPendingChapter()&&!_rngPend){',
  'mapBrief 提示');

// MAP_RULES
m = rep(m,
  'const MAP_RULES={' + ME,
  'const MAP_RULES={' + ME +
  '  // 靶场: 不刷战利品、不刷敌人' + ME +
  '  range:{ crateExtra:0, richChance:0, corpseExtra:0, botMul:null },' + ME,
  'MAP_RULES.range');
fs.writeFileSync('js/43_maps.js', m, 'utf8');

// ================= ④ index.html =================
let h = read('index.html');
const HE = h.includes('\r\n') ? '\r\n' : '\n';

h = rep(h,
  '<button class="bigBtn navBtn" data-p="mStory">剧 情 模 式</button>',
  '<button class="bigBtn navBtn" data-p="mStory">剧 情 模 式</button>' + HE +
  '<button class="bigBtn navBtn" id="rangeBtn">靶 场</button>',
  '主菜单按钮');

h = rep(h,
  '<div id="vig"></div><div id="bloodOv"></div>',
  '<div id="vig"></div><div id="bloodOv"></div>' + HE +
  '<div id="rangeHud"><b>靶 场</b><span id="rangeStat">命中 0 / 射击 0</span></div>',
  '靶场 HUD');

h = rep(h,
  '<script src="js/07g_anvil.js?v=20261030d"></script>',
  '<script src="js/07g_anvil.js?v=20261030d"></script>' + HE +
  '<script src="js/07h_range.js?v=20261030d"></script>',
  '07h 脚本');

h = rep(h,
  '<script src="js/60_falldmg.js?v=20261030d"></script>',
  '<script src="js/60_falldmg.js?v=20261030d"></script>' + HE +
  '<script src="js/61_range.js?v=20261030d"></script>',
  '61 脚本');
fs.writeFileSync('index.html', h, 'utf8');

console.log('\n靶场接线完成');
