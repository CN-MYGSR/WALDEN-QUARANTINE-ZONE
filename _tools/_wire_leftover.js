// 遗留项收尾: ① 港区草地穿出混凝土板  ② 接通 WFX.sight → bot 视距
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function patch(file, pairs) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  const eol = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const rep = [];
  for (const [from, to, expect] of pairs) {
    const F = eol === '\n' ? from : from.split('\n').join(eol);
    const T = eol === '\n' ? to : to.split('\n').join(eol);
    const n = s.split(F).length - 1;
    if (n !== expect) { rep.push(`  !! ${file}: expect ${expect} got ${n} :: ${JSON.stringify(from.slice(0, 70))}`); continue; }
    s = s.split(F).join(T);
    rep.push(`  ok ${file} x${n} (${eol === '\n' ? 'LF' : 'CRLF'})`);
  }
  fs.writeFileSync(p, s);
  return rep;
}
const out = [];

// ---- ① 港区地形起伏 ±0.22 → ±0.03 (低于 y=0.05 的混凝土板, 草地不再穿出) ----
out.push(...patch('js/05_terrain.js', [[
  "// 港口: 码头面是整浇混凝土板 —— 近乎水平, 只留极小的排水坡;\n// 真正的\"地形\"是东侧被 RIVER.port 下切出来的海面。\ncase 'harbor':\nreturn 0.22*Math.sin(x*0.019)*Math.cos(z*0.017);",
  "// 港口: 码头面是整浇混凝土板 —— 近乎水平, 只留极小的排水坡;\n"
  + "// 真正的\"地形\"是东侧被 RIVER.port 下切出来的海面。\n"
  + "// ⚠ 幅度必须 < 混凝土板的高度 (layoutPort 里板面在 y=0.05, 见 07e_port.js)。\n"
  + "//   原来是 ±0.22, 起伏直接高过板面 → 地图中东部大片草地穿出码头面。\n"
  + "//   道具都是按 heightAt() 落位的, 所以压到 ±0.03 后道具仍贴着板面, 不会有台阶感。\n"
  + "case 'harbor':\nreturn 0.03*Math.sin(x*0.019)*Math.cos(z*0.017);",
  1]]));

// ---- ② WFX.sight 接通 bot 视距 ----
out.push(...patch('js/19_bot.js', [[
  "perceive(){\nconst diff=EFF_DIFF;\nconst viewD=70*diff.visMul*(this.visMul||1);",
  "perceive(){\nconst diff=EFF_DIFF;\n"
  + "// 视距 = 基准 70m × 难度档 visMul × 实例倍率(ELO/地图/难度) × 天气视距 WFX.sight。\n"
  + "// WFX.sight 此前从未被任何代码读取 —— 阴天/海雾/实验室雾霾本该压缩敌人的发现距离,\n"
  + "// 实际完全没生效 (改了天气只有画面变雾, bot 照样 70m 外点名)。现在接上:\n"
  + "//   街区(阴天) 0.55 → 38.5m · 港口(海雾) 0.50 → 35m · 实验室(雾霾) 0.45 → 31.5m\n"
  + "const viewD=70*diff.visMul*(this.visMul||1)*WFX.sight;",
  1]]));

console.log(out.join('\n'));
