// 天气随机化 + 亮度调整 (2026-09-19)
const fs = require('fs');
const path = require('path');
const R = f => path.resolve(__dirname, '..', f);
let ok = true;

function rep(rel, jobs, label) {
  const raw = fs.readFileSync(R(rel), 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const L = (...a) => a.join(eol) + eol;
  let bad = 0;
  for (const [from] of jobs) {
    const t = typeof from === 'function' ? from(L) : from;
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 56).replace(/\r?\n/g, '⏎')); bad++; }
  }
  if (bad) { console.log('❌ ' + label + ' 未命中'); ok = false; return; }
  let out = raw;
  for (const [from, to] of jobs) {
    const f = typeof from === 'function' ? from(L) : from;
    const t = typeof to === 'function' ? to(L) : to;
    out = out.split(f).join(t);
  }
  fs.writeFileSync(R(rel), out, 'utf8');
  console.log('✅ ' + label);
}

// ================= 01_data.js =================
rep('js/01_data.js', [
  // ① 天气改为随机 (不再读 localStorage 的玩家选择)
  [(L) => L("const WEATHER_MODE=(()=>{ const v=localStorage.getItem('sf_weather'); return WEATHER_MODES[v]?v:'clear'; })();"),
    (L) => L('// 2026-09-19: 天气改为**随机**（每局开始掷一次），玩家不再能选。',
      '// 掷点权重: 晴朗/阴天常见, 雾与雨次之, 雷暴与黑夜稀有 —— 稀有感更强。',
      'const WEATHER_POOL=[',
      " ['clear',18],['overcast',20],['dusk',12],['fog',14],",
      " ['rain',14],['storm',10],['night',12],",
      '];',
      'const WEATHER_MODE=(()=>{',
      ' let total=0; for(const p of WEATHER_POOL) total+=p[1];',
      ' let r=Math.random()*total;',
      ' for(const p of WEATHER_POOL){ r-=p[1]; if(r<=0) return p[0]; }',
      " return 'overcast';",
      '})();',
      "try{ localStorage.setItem('sf_weather_last',WEATHER_MODE); }catch(e){}")],
  // ② 夜/雾/雨/雷暴 能见度与亮度下调
  [(L) => L('fog:{fogFar:0.26,fogNear:6,sun:0.45,hemi:0.6,skyDark:0.42,sight:0.5},',
    'rain:{fogFar:0.78,fogNear:30,sun:0.65,hemi:0.85,skyDark:0.2,sight:0.82},',
    'storm:{fogFar:0.6,fogNear:24,sun:0.5,hemi:0.72,skyDark:0.36,sight:0.68},'),
    (L) => L('// 2026-09-19 需求: 迷雾/雨天/雷暴**再次降低能见度** (fogFar 越小雾越近)',
      'fog:{fogFar:0.13,fogNear:4,sun:0.36,hemi:0.5,skyDark:0.55,sight:0.5},',
      'rain:{fogFar:0.46,fogNear:18,sun:0.5,hemi:0.68,skyDark:0.34,sight:0.82},',
      'storm:{fogFar:0.32,fogNear:13,sun:0.38,hemi:0.55,skyDark:0.5,sight:0.68},')],
  // ③ 夜晚常量: 更暗
  [(L) => L('const NIGHT_FOG = 0x0c1526;',
    'const NIGHT_HEMI = [0x2e3f68, 0x0d1424, 0.34];',
    'const NIGHT_SUN = 0xa8bfe8;'),
    (L) => L('// 2026-09-19 需求: 夜晚亮度再降 —— 雾色更深、环境光更弱、主光只剩一点点',
      'const NIGHT_FOG = 0x05080f;',
      'const NIGHT_HEMI = [0x16203a, 0x04060c, 0.16];',
      'const NIGHT_SUN = 0x8aa2cc;')],
  [(L) => L('const KEY_BASE = NIGHT ? THEME.sunI*0.13 : THEME.sunI;'),
    (L) => L('const KEY_BASE = NIGHT ? THEME.sunI*0.055 : THEME.sunI;')],
  // ④ WFX 改成副本 + 地图级微光系数
  [(L) => L('const WFX=WEATHER_FX[WEATHER]||WEATHER_FX.clear;'),
    (L) => L('// ⚠️ 取副本而不是原表引用 —— 下面会按地图调暗, 直接改原表会污染整张表。',
      'const WFX=Object.assign({}, WEATHER_FX[WEATHER]||WEATHER_FX.clear);',
      '// 地图级微光: 与天气无关的固定压暗 (秘密实验室是地下设施, 任何天气都该是微光)',
      'const MAP_DIM=Math.max(0,Math.min(1,CAMPAIGN.dimLight!=null?CAMPAIGN.dimLight:1));',
      'if(MAP_DIM<1){',
      ' WFX.sun*=MAP_DIM; WFX.hemi*=MAP_DIM;',
      ' WFX.fogFar*=Math.max(0.25,MAP_DIM);',
      ' WFX.fogNear=Math.max(3,WFX.fogNear*MAP_DIM);',
      ' WFX.skyDark=Math.min(1,WFX.skyDark+(1-MAP_DIM)*0.5);',
      '}')],
  // ⑤ 实验室加 dimLight
  ["{ id:'lab', title:'秘密实验室', sub:'地下生物设施 · 高价值物资 · PMC 守备', f:['usec','pmc'], theme:'lab', allyBots:3, enemyBots:8,",
   "{ id:'lab', title:'秘密实验室', sub:'地下生物设施 · 高价值物资 · PMC 守备', f:['usec','pmc'], theme:'lab', allyBots:3, enemyBots:8, dimLight:0.42,"],
], '01_data.js 天气随机 + 亮度');

// ================= 03_renderer.js =================
rep('js/03_renderer.js', [
  ['const hemi = new THREE.HemisphereLight(NIGHT?NIGHT_HEMI[0]:THEME.hemi[0], NIGHT?NIGHT_HEMI[1]:THEME.hemi[1], (NIGHT?NIGHT_HEMI[2]:THEME.hemi[2])*WFX.hemi);',
   '// 地图级微光: 秘密实验室在任何天气下都压到微光 (见 01_data 的 MAP_DIM)',
   'const hemi = new THREE.HemisphereLight(NIGHT?NIGHT_HEMI[0]:THEME.hemi[0], NIGHT?NIGHT_HEMI[1]:THEME.hemi[1], (NIGHT?NIGHT_HEMI[2]:THEME.hemi[2])*WFX.hemi*(NIGHT?1:MAP_DIM));'],
  ['const sun = new THREE.DirectionalLight(NIGHT?NIGHT_SUN:THEME.sun, KEY_BASE*WFX.sun);',
   'const sun = new THREE.DirectionalLight(NIGHT?NIGHT_SUN:THEME.sun, KEY_BASE*WFX.sun*(NIGHT?1:MAP_DIM));'],
], '03_renderer.js 地图微光');

// ================= 29_menus.js: 删掉天气选择器逻辑, 改为只读显示 =================
rep('js/29_menus.js', [
  [(L) => L('{',
    "const desc={clear:'正常能见度',fog:'能见度极低 · 亮度低',rain:'能见度/亮度降低',storm:'雷暴雨 · 能见度/亮度低',night:'黑夜 · 亮度极低'};",
    "const row=el('weatherRow');",
    'if(row){',
    "const syncWeatherUI=()=>{ document.querySelectorAll('[data-wx]').forEach(b=>b.classList.toggle('sel',b.dataset.wx===WEATHER_MODE)); };",
    'syncWeatherUI();',
    "document.querySelectorAll('[data-wx]').forEach(b=>{",
    'b.onclick=()=>{',
    'if(b.dataset.wx===WEATHER_MODE) return;',
    "localStorage.setItem('sf_weather',b.dataset.wx);",
    "if(b.dataset.wx!=='night') localStorage.setItem('sf_night','0');",
    'location.reload();',
    '};',
    '});',
    "const dEl=el('weatherDesc');",
    "if(dEl) dEl.textContent=WEATHER_MODES[WEATHER_MODE].name+' · '+desc[WEATHER_MODE];",
    '}',
    '}'),
    (L) => L('{',
      '// 2026-09-19: 天气已改为**随机**（见 01_data 的 WEATHER_POOL），玩家不再能选。',
      '// 这里只把本局掷到的天气显示出来。',
      "const desc={clear:'正常能见度',overcast:'阴天 · 亮度略低',dusk:'黄昏 · 能见度下降',fog:'能见度极低 · 亮度低',rain:'能见度/亮度降低',storm:'雷暴雨 · 能见度/亮度低',night:'黑夜 · 亮度极低'};",
      "const dEl=el('weatherDesc');",
      "if(dEl) dEl.textContent='本局天气：'+WEATHER_MODES[WEATHER_MODE].name+' · '+(desc[WEATHER_MODE]||'')+'（随机决定，不可选）';",
      '}')],
], '29_menus.js 天气只读显示');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
