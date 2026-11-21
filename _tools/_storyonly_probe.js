// 剧情专用地图守卫 —— 行为验证 (真跑 43_maps 里的函数, 不是看代码)
// 用法: node _tools/_storyonly_probe.js
const fs = require('fs');
const src = fs.readFileSync('js/43_maps.js', 'utf8');

// 抽出两个函数体 (storyPendingChapter / storyMapBlocked)
function grab(name){
  const re = new RegExp('function ' + name + '\\(\\)\\{[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  if (!m) { console.log('❌ 抽不到 ' + name); process.exit(1); }
  return m[0];
}
const code = grab('storyPendingChapter') + '\n' + grab('storyMapBlocked') + '\nreturn storyMapBlocked;';

let pass = 0, fail = 0;
function t(name, cond){
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name); }
}

const MAPS = [
  { id: 'city' }, { id: 'lab' },
  { id: 'anvil_yard', storyOnly: true }, { id: 'anvil_b2', storyOnly: true }
];

function run(idx, store, player, matchOver){
  const ls = { getItem: k => (k in store ? store[k] : null) };
  const factory = new Function('CAMPAIGNS', 'CAMPAIGN_IDX', 'localStorage', 'player', 'matchOver', code);
  const guard = factory(MAPS, idx, ls, player, matchOver);   // ⚠️ factory 返回的是函数本身, 还要调一次
  return guard();
}

const live = { deployed: true };     // 局内
const idle = { deployed: false };    // 在菜单/军械库

// ① 沙盒地图 → 永远不拦
t('沙盒地图不拦 (city)', run(0, {}, idle, false) === false);
t('沙盒地图不拦 (lab)', run(1, {}, idle, true) === false);

// ② 剧情地图 + 待打章节 → 放行 (剧情模式正常进场)
t('剧情地图 + sf_story 待打 → 放行', run(2, { sf_story: '0' }, idle, false) === false);
t('剧情地图 B2 + sf_story 待打 → 放行', run(3, { sf_story: '1' }, idle, false) === false);

// ③ 剧情地图 + 无待打 + 局内重新部署 → 放行 (死亡/暂停回到部署界面)
t('剧情局内重新部署 → 放行', run(2, {}, live, false) === false);

// ④ 剧情地图 + 无待打 + 非局内 → 拦 (沙盒进不去)
t('剧情地图沙盒进入 → 拦', run(2, {}, idle, false) === true);
t('剧情地图沙盒进入 (matchOver) → 拦', run(2, {}, live, true) === true);
t('剧情地图 B2 沙盒进入 → 拦', run(3, {}, idle, false) === true);

// ⑤ 列表过滤: 必须在建 button 之前 return
const rmc = src.slice(src.indexOf('function renderMapCards()'), src.indexOf('function showMapBrief'));
const iFilter = Math.max(rmc.indexOf('if(c.storyOnly) return;'), rmc.indexOf('if(c.storyOnly||c.rangeOnly) return;'));
const iBtn = rmc.indexOf("document.createElement('button')");
t('renderMapCards 在建按钮前过滤 storyOnly', iFilter > 0 && iFilter < iBtn);

// ⑥ 建局守卫: startMatch 与 deployBtn 都要拦 (后者是真正的闸门)
const menus = fs.readFileSync('js/29_menus.js', 'utf8');
t('startMatch 有 storyMapBlocked 守卫', /function startMatch\(\)\{[\s\S]{0,200}storyMapBlocked\(\)/.test(menus));
t('deployBtn 有 storyMapBlocked 守卫', /el\('deployBtn'\)\.onclick=[\s\S]{0,260}storyMapBlocked\(\)/.test(menus));
// ⚠️ deployBtn 守卫必须在 consumeRaidStart() 之前 —— 否则会先清标记再被拦, deployPlayer 照样执行
const iDb = menus.indexOf("el('deployBtn').onclick");
const iGuard = menus.indexOf('storyMapBlocked()', iDb);
const iConsume = menus.indexOf('consumeRaidStart()', iDb);
t('deployBtn 守卫在 consumeRaidStart 之前', iGuard > iDb && iGuard < iConsume);

// ⑦ 载入回退: 存档指向剧情图且无待打 → 回退到 0
const data = fs.readFileSync('js/01_data.js', 'utf8');
t('CAMPAIGN_IDX 有 storyOnly 回退', /if\(CAMPAIGNS\[i\]&&CAMPAIGNS\[i\]\.storyOnly&&!localStorage\.getItem\('sf_story'\)\) i=0;/.test(data));
t('两张剧情地图都标了 storyOnly', (data.match(/storyOnly:true/g) || []).length === 2);

const story=fs.readFileSync('js/56_story.js','utf8');
const objectives=story.slice(story.indexOf('function storyCarried('),story.indexOf('function storySpawnAt('));
const inventory={loot:{ledx:2},secure:['ledx']}, actor={pos:{x:0,z:0}}, ally={alive:true,pos:{x:0,z:0}};
const targets={obj:[{type:'fetch',key:'ledx',n:3},{type:'reach',x:0,z:0,r:2}]};
const reached=new Function('RUN','SRAID','player','SQUAD',objectives+';return storyObjectivesMet;')(inventory,targets,actor,{members:[ally]});
t('身上与安全箱的样本合计满足目标',reached());
actor.pos.x=25;
t('离开已抵达的地点仍完成地点目标',reached());
inventory.loot.ledx=1;
t('撤离前丢掉样本会撤销勾选并阻止通关',!reached()&&!targets.obj[0].met);
inventory.loot.ledx=2;
t('重新拿够后恢复样本目标',reached());
targets.obj=[{type:'escort',x:0,z:0,r:2,n:1}];
t('护送队友到位时完成目标',reached());
ally.pos.x=10;
t('队友离开撤离点后取消护送目标',!reached()&&!targets.obj[0].met);

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) + ' 项' : '✅ 全部 ' + pass + ' 项通过'));
process.exit(fail ? 1 : 0);
