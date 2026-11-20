// 紧急修复: 剧情模式的 forceWeather 让主菜单初始化崩了
//
// 线上现象: [boot] initMenuUI TypeError: can't access property "name", WEATHER_MODES[WEATHER_MODE] is undefined
//           → 29_menus.js:80 → initMenuUI 中断 → 主菜单后续初始化(导航/地图卡片/部署按钮)全没跑
//
// 根因: 我给 WEATHER_MODE 加了 forceWeather 直通 (返回 anvilhaze / labhaze),
//   但这两个名字**不在 WEATHER_MODES 表里** → WEATHER_MODES[WEATHER_MODE] 是 undefined → .name 抛错。
//   改动前 WEATHER_MODE 恒等于 WEATHER_POOL 里的键, 所以这个不变量一直成立, 被我破坏了。
//
// 修法 (双保险):
//   ① 把 4 个"战役/剧情默认天气"补进 WEATHER_MODES (它们本来就是合法天气名)
//   ② 29_menus 那一行改成容错写法 —— 天气名再离谱也不该让整个主菜单初始化中断
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const JOBS = [
  // ① WEATHER_MODES 补全
  ['js/01_data.js',
    "const WEATHER_MODES={clear:{name:'晴朗'},fog:{name:'迷雾'},rain:{name:'雨天'},storm:{name:'雷暴雨'},night:{name:'黑夜'},overcast:{name:'阴天'},dusk:{name:'黄昏'}};",
    "const WEATHER_MODES={clear:{name:'晴朗'},fog:{name:'迷雾'},rain:{name:'雨天'},storm:{name:'雷暴雨'},night:{name:'黑夜'},overcast:{name:'阴天'},dusk:{name:'黄昏'},\n" +
    " // ⚠️ 下面 4 个不是玩家可选项, 而是 CAMPAIGN_WEATHER / CAMPAIGN.forceWeather 的取值。\n" +
    " //    必须留在这张表里 —— 29_menus 会拿 WEATHER_MODE 直接查它 (缺了会让主菜单初始化抛错)。\n" +
    " labhaze:{name:'地下浮尘'},seahaze:{name:'海雾'},airporthaze:{name:'清晨薄霾'},anvilhaze:{name:'工业尘霾'}};"],
  // ② 29_menus 容错 + 补 desc
  ['js/29_menus.js',
    "const desc={clear:'正常能见度',overcast:'阴天 · 亮度略低',dusk:'黄昏 · 能见度下降',fog:'能见度极低 · 亮度低',rain:'能见度/亮度降低',storm:'雷暴雨 · 能见度/亮度低',night:'黑夜 · 亮度极低'};\n" +
    "const dEl=el('weatherDesc');\n" +
    "if(dEl) dEl.textContent='本局天气：'+WEATHER_MODES[WEATHER_MODE].name+' · '+(desc[WEATHER_MODE]||'')+'（随机决定，不可选）';",
    "const desc={clear:'正常能见度',overcast:'阴天 · 亮度略低',dusk:'黄昏 · 能见度下降',fog:'能见度极低 · 亮度低',rain:'能见度/亮度降低',storm:'雷暴雨 · 能见度/亮度低',night:'黑夜 · 亮度极低',\n" +
    " labhaze:'地下设施 · 浮尘 · 能见度极低',seahaze:'海雾 · 湿冷 · 能见度偏低',airporthaze:'清晨薄霾 · 开阔地视距最好',anvilhaze:'工业尘霾 · 中距轮廓被吃掉'};\n" +
    "const dEl=el('weatherDesc');\n" +
    "if(dEl){\n" +
    " // ⚠️ 必须容错: 剧情章节用 CAMPAIGN.forceWeather 直通, 天气名可能不在 WEATHER_MODES 里。\n" +
    " //    这里一旦抛错会让整个 initMenuUI 中断 —— 主菜单的导航/地图卡片/部署按钮全部失效 (线上实测)。\n" +
    " const wm=WEATHER_MODES[WEATHER_MODE];\n" +
    " dEl.textContent='本局天气：'+(wm?wm.name:WEATHER_MODE)+' · '+(desc[WEATHER_MODE]||'')+'（随机决定，不可选）';\n" +
    "}"],
];

let fatal = 0;
const cache = {};
for (const [f] of JOBS) if (!cache[f]) cache[f] = fs.readFileSync(R(f), 'utf8');
for (const [file, from] of JOBS) {
  const eol = cache[file].includes('\r\n') ? '\r\n' : '\n';
  const n = cache[file].split(from.split('\n').join(eol)).length - 1;
  console.log((n === 1 ? '✅' : '❌') + ` ${file}  命中 ${n}/1`);
  if (n !== 1) fatal++;
}
if (fatal) { console.log('\n❌ 未命中, 未写盘'); process.exit(1); }
for (const [file, from, to] of JOBS) {
  let s = fs.readFileSync(R(file), 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = s.split(from.split('\n').join(eol)).join(to.split('\n').join(eol));
  fs.writeFileSync(R(file), s, 'utf8');
}
console.log('\n💾 已写盘: ' + [...new Set(JOBS.map(j => j[0]))].join(', '));
