// 实验室天花板: 改为一块整板覆盖整个设施
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'js', '07d_lab.js');
let s = fs.readFileSync(p, 'utf8');
const eol = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const N = (arr) => arr.join(eol);
const fails = [];
function rep(fromArr, toArr, expect) {
  const F = N(fromArr), T = N(toArr);
  const n = s.split(F).length - 1;
  if (n !== expect) { fails.push('!! expect ' + expect + ' got ' + n + ' :: ' + JSON.stringify(fromArr[0].slice(0, 70))); return; }
  s = s.split(F).join(T);
}

rep([
  '// 天花板: 90% 的房间完全封顶 → 房间内失去全部顶光, 成为全图最暗的地方',
  'const roofed=Math.random()<0.9;',
  'if(roofed) labCeilSlab(cx,cz,w,d,g0+h+0.16);',
], [
  '// 天花板: 由 layoutLab 的「全设施顶板」统一提供, 这里不再逐间封顶。',
  '// (以前是 Math.random()<0.9 —— 剩下 10% 的房间抬头能直接看到天空, 与「地下三层全封闭设施」的设定冲突)',
  'const roofed=true;',
], 1);

rep([
  '// 大厅顶板: 每 12m 一块, 刻意留检修口 → 少量光柱落在地面',
  'for(let t=-80;t<=80;t+=12){',
  'if(Math.abs(t)<LAB_HALL+2) continue;',
  'if(Math.random()<0.78) mesh(new THREE.BoxGeometry(LAB_HALL+2,0.32,10),MAT.labCeil,0,LAB_H+0.16,t,0,false,false);',
  'if(Math.random()<0.78) mesh(new THREE.BoxGeometry(10,0.32,LAB_HALL+2),MAT.labCeil,t,LAB_H+0.16,0,0,false,false);',
  '}',
], [
  '// 大厅顶板: 以前是每 12m 一块、22% 概率留检修口 (露出天空)。现在由「全设施顶板」统一覆盖。',
], 1);

rep([
  '// ---- 2) 中央十字大厅 ----',
], [
  '// ---- 1.5) 全设施顶板 ----',
  '// 一块同色大板盖住整个设施内部, 保证任何位置抬头都是天花板。',
  '// 背景: 以前是「房间 90% 概率封顶 + 大厅 78% 概率铺板 + 走廊完全露天」三套独立逻辑,',
  '//       地图上因此散布着若干露天缺口, 抬头能看到天空, 与地下设施的设定直接冲突。',
  '// 注意: labCeilSlab 用 castShadow=false —— 顶板不投阴影, 所以不挡主方向光,',
  '//       只负责「看得见天花板」; 室内亮度仍由灯板/环境光决定。',
  '{',
  'const span=(LAB_EDGE+2)*2;',
  'labCeilSlab(0,0,span,span,LAB_H+0.16);',
  '}',
  '',
  '// ---- 2) 中央十字大厅 ----',
], 1);

if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
fs.writeFileSync(p, s);
console.log('ok 07d_lab.js 全部命中');
