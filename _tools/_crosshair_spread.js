// ① 删掉准星 (HTML + CSS + HUD 更新块)  ② 移动扩散加强
const fs = require('fs');

function read(p){ return fs.readFileSync(p, 'utf8'); }
function rep(s, from, to, tag){
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('❌ [' + tag + '] 命中 ' + n + ' 次'); process.exit(1); }
  console.log('✅ [' + tag + ']');
  return s.split(from).join(to);
}

// ===== ① index.html: 删准星 DOM =====
let h = read('index.html');
h = rep(h,
  '<div id="crosshair"><span class="chl t"></span><span class="chl b"></span><span class="chl l"></span><span class="chl r"></span><span class="chdot"></span></div>\n',
  '',
  'index.html 准星 DOM');
fs.writeFileSync('index.html', h, 'utf8');

// ===== ② css: 删准星样式 =====
let c = read('css/style.css');
const cssBlock = [
'#crosshair { position:absolute; left:50%; top:50%; width:0; height:0; --gap:8px; }',
'#crosshair .chl { position:absolute; background:rgba(255,255,255,.92); box-shadow:0 0 3px rgba(0,0,0,.9); }',
'#crosshair .chl.t { left:-1px; bottom:var(--gap); width:2px; height:9px; }',
'#crosshair .chl.b { left:-1px; top:var(--gap); width:2px; height:9px; }',
'#crosshair .chl.l { top:-1px; right:var(--gap); height:2px; width:9px; }',
'#crosshair .chl.r { top:-1px; left:var(--gap); height:2px; width:9px; }',
'#crosshair .chdot { position:absolute; left:-1px; top:-1px; width:2px; height:2px; background:rgba(255,255,255,.95); }'
].join('\n');
c = rep(c, cssBlock + '\n', '', 'CSS 准星样式');
fs.writeFileSync('css/style.css', c, 'utf8');

// ===== ③ 28_hud: 删掉准星更新块 =====
let hud = read('js/28_hud.js');
const hudBlock = [
"const ch=el('crosshair');",
"if(player.alive&&!player.ads&&!player.onVehicle){",
"ch.style.display='block';",
"const gap=8+player.bloom*26+(Math.hypot(player.vel.x,player.vel.z)>1?6:0);",
"ch.style.setProperty('--gap',gap+'px');",
"} else if(player.alive&&player.ads&&WPN_DEFS[VM.key]?.atRifle&&!player.onVehicle){",
"// 反坦克枪侧偏机瞄: 保留小型准星充当侧置机械瞄具",
"ch.style.display='block';",
"ch.style.setProperty('--gap','5px');",
"} else if(player.alive&&player.ads&&!WPN_DEFS[VM.key]?.scoped){",
"ch.style.display='none';",
"} else ch.style.display='none';"
].join('\n');
hud = rep(hud, hudBlock + '\n', '', 'HUD 准星更新块');
fs.writeFileSync('js/28_hud.js', hud, 'utf8');

// ===== ④ 25_player_update: 移动扩散加强 =====
let up = read('js/25_player_update.js');
const oldSpread = 'spread*=(1+p.bloom*1.4)*(p.prone?0.5:p.crouch?0.8:1)*(p.onGround?1:2.2)*(Math.hypot(p.vel.x,p.vel.z)>1?1.4:1);';
const newSpread = [
'// 移动扩散: 按「实际速度」连续加成 —— 站定 1.0 / 步行 ≈2.1 / 冲刺 ≈2.6',
'// (原来是「动起来就 ×1.4」的台阶式, 没有准星后必须让"站着打"和"边跑边打"拉开差距)',
'const vSpd=Math.hypot(p.vel.x,p.vel.z);',
'const moveMul=1+Math.min(1.6,(vSpd/6.4)*1.6)*(1-adsB*0.45);   // 开镜时移动惩罚打 55 折',
'spread*=(1+p.bloom*1.4)*(p.prone?0.5:p.crouch?0.8:1)*(p.onGround?1:2.2)*moveMul;'
].join('\n');
up = rep(up, oldSpread, newSpread, '移动扩散');
fs.writeFileSync('js/25_player_update.js', up, 'utf8');

console.log('\n改完');
