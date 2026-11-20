// 靶场修复: ① 打光(点光源+自发光灯带) ② 距离标牌缩小 ③ 出生点归位 ④ 隐藏撤离 HUD
const fs = require('fs');

function read(p){ return fs.readFileSync(p, 'utf8'); }
function rep(s, from, to, tag){
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次'); process.exit(1); }
  console.log('✅ [' + tag + ']');
  return s.split(from).join(to);
}

// ================= ① 07h_range.js: 灯带改成自发光 + 加 3 盏点光源 =================
let m = read('js/07h_range.js');
const ME = m.includes('\r\n') ? '\r\n' : '\n';

m = rep(m,
  '  // ---- 7) 顶部灯带 ----' + ME +
  '  for(const z of [13.5,7,-0.5,-8,-15.5]){' + ME +
  '    mesh(new THREE.BoxGeometry(13,0.10,0.55),MAT.labLamp,0,H-0.22,z,0,false,false);' + ME +
  '    mesh(new THREE.BoxGeometry(1.4,0.06,0.55),MAT.labLampCold,-7.2,H-0.22,z,0,false,false);' + ME +
  '    mesh(new THREE.BoxGeometry(1.4,0.06,0.55),MAT.labLampCold, 7.2,H-0.22,z,0,false,false);' + ME +
  '  }',
  '  // ---- 7) 顶部灯带 + 实际照明 ----' + ME +
  '  // ⚠️ 靶场是封闭盒子: 阳光被四面墙挡住, 只靠半球光会黑得看不清靶子。' + ME +
  '  //    这里既放自发光灯板(MeshBasic 不受光照, 永远亮), 也放几盏点光源真正照亮地面。' + ME +
  '  const lampMat=new THREE.MeshBasicMaterial({color:0xfff3d6});' + ME +
  '  for(const z of [13.5,7,-0.5,-8,-15.5]){' + ME +
  '    mesh(new THREE.BoxGeometry(13,0.10,0.55),lampMat,0,H-0.22,z,0,false,false);' + ME +
  '    mesh(new THREE.BoxGeometry(1.4,0.06,0.55),lampMat,-7.2,H-0.22,z,0,false,false);' + ME +
  '    mesh(new THREE.BoxGeometry(1.4,0.06,0.55),lampMat, 7.2,H-0.22,z,0,false,false);' + ME +
  '  }' + ME +
  '  for(const z of [11,2,-7,-16]){' + ME +
  '    const pl=new THREE.PointLight(0xfff0d2,1.5,34,1.7);' + ME +
  '    pl.position.set(0,H-0.55,z);' + ME +
  '    scene.add(pl);' + ME +
  '  }',
  '打光');

// 后墙吸弹垫用暗色会看不见 → 换成浅色, 顺便让 30m 处有个参照
m = rep(m,
  '    mesh(new THREE.BoxGeometry(2.6,2.6,0.12),MAT.metalDark,x,2.0,Z0+0.55,0,false,false);',
  '    mesh(new THREE.BoxGeometry(2.6,2.6,0.12),MAT.labSlabA,x,2.0,Z0+0.55,0,false,false);',
  '后墙挡弹垫');
fs.writeFileSync('js/07h_range.js', m, 'utf8');

// ================= ② 61_range.js: 标牌 / 出生点 / HUD =================
let r = read('js/61_range.js');
const RE = r.includes('\r\n') ? '\r\n' : '\n';

// 标牌: 原来 1.05×0.52m, 在 4m 处占掉四分之一个屏幕 → 缩到 0.46×0.23
r = rep(r,
  '  sp.position.set(x,y,z); sp.scale.set(1.05,0.52,1);',
  '  sp.position.set(x,y,z); sp.scale.set(0.46,0.23,1);',
  '标牌缩放');

r = rep(r,
  "    const lbl=rangeLabel(d+'m',baseX,2.25,z);",
  "    const lbl=rangeLabel(d+'m',baseX,2.05,z);",
  '标牌高度');

// 出生点: findFreeSpawn 会把玩家随机挪 ±2m, 可能挪到射击线前面 → 归位到射击线后方
r = rep(r,
  '  // 出生点默认朝「地图中心」, 而靶道在 -z 方向 → 这里直接面向靶子',
  '  // 出生点: findFreeSpawn 会随机挪 ±2m, 可能挪到射击线前面 → 统一放回射击线后方' + RE +
  '  try{' + RE +
  '    player.pos.x=clamp(player.pos.x,-6.5,6.5);' + RE +
  '    player.pos.z=13.6;' + RE +
  '    player.pos.y=standHeight(player.pos.x,player.pos.z,3);' + RE +
  '    player.vel.set(0,0,0);' + RE +
  '  }catch(e){}' + RE +
  '  // 出生点默认朝「地图中心」, 而靶道在 -z 方向 → 这里直接面向靶子',
  '出生点归位');

// HUD: 靶场没有撤离/战利品, 隐藏那两行
r = rep(r,
  "  const hud=document.getElementById('rangeHud');" + RE +
  "  if(hud) hud.style.display=rangeActive()?'block':'none';",
  "  const hud=document.getElementById('rangeHud');" + RE +
  "  if(hud) hud.style.display=rangeActive()?'block':'none';" + RE +
  '  // 靶场没有撤离点/战利品 → 隐藏「撤离行动 · 搜索-带出-出售」和「战利品 0 件」' + RE +
  "  const tkt=document.getElementById('tickets');" + RE +
  "  if(tkt) tkt.style.display=rangeActive()?'none':'';" + RE +
  "  const lh=document.getElementById('lootHud');" + RE +
  "  if(lh) lh.style.display=rangeActive()?'none':'';",
  '隐藏撤离 HUD');
fs.writeFileSync('js/61_range.js', r, 'utf8');

// ================= ③ 室内天气: 半球光提亮 =================
let d = read('js/01_data.js');
const DE = d.includes('\r\n') ? '\r\n' : '\n';
d = rep(d,
  'indoor:{fogFar:1,fogNear:60,sun:1,hemi:1,skyDark:0,sight:1}',
  'indoor:{fogFar:1,fogNear:60,sun:1,hemi:1.45,skyDark:0,sight:1}',
  'indoor 半球光');
fs.writeFileSync('js/01_data.js', d, 'utf8');

console.log('\n修复完成');
