// 手雷机制改造: 3 拿出 / 右键蓄力投掷(越久越远) / G 让给手电
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
    if (n !== expect) { rep.push(`  !! ${file}: expect ${expect} got ${n} :: ${JSON.stringify(from.slice(0, 64))}`); continue; }
    s = s.split(F).join(T);
    rep.push(`  ok ${file} x${n}`);
  }
  fs.writeFileSync(p, s);
  return rep;
}
const out = [];

// ============ 1) 23_player.js ============
out.push(...patch('js/23_player.js', [
  ["'use strict';\nconst player = {",
   "'use strict';\n// 手雷蓄力: 按住右键多久到满蓄力(秒)。越满 → 初速越高、抛得越远。\nconst NADE_CHARGE_TIME=0.9;\nconst player = {", 1],
  ["nadeHeld:false, nadeFuse:0, nadeIsSmoke:false, smokeCount:1, onMG:null, resupplyCd:0,",
   "nadeHeld:false, nadeFuse:0, nadeIsSmoke:false, smokeCount:1, onMG:null, resupplyCd:0,\n"
   + "// 手雷蓄力状态: nadeCharge 0..1, nadeCharging = 右键是否按住中\n"
   + "nadeCharge:0, nadeCharging:false,", 1],
  ["this.nadeHeld=false;\n// 修复: 开镜状态阵亡后残留(镜遮罩/ADS/屏息/架枪一并复位)",
   "this.nadeHeld=false; this.nadeCharge=0; this.nadeCharging=false;\n// 修复: 开镜状态阵亡后残留(镜遮罩/ADS/屏息/架枪一并复位)", 1],
  ["releaseNade(){\nconst dir=camForward();\nconst o=camera.position.clone().add(dir.clone().multiplyScalar(0.3));\nif(this.nadeIsSmoke){\nconst v=dir.multiplyScalar(12).add(V3(0,2.4,0)).add(this.vel.clone().multiplyScalar(0.4));\nthrowNade(this,o,v,1.8,false,true);\nthis.smokeCount--;\nthis.nadeIsSmoke=false;\n} else if(this.nadeIsAT){\nconst v=dir.multiplyScalar(12).add(V3(0,2.2,0)).add(this.vel.clone().multiplyScalar(0.4));\nthrowNade(this,o,v,1.6,true);\nthis.atNades--;\nthis.nadeIsAT=false;\n} else {\nconst v=dir.multiplyScalar(15).add(V3(0,2.4,0)).add(this.vel.clone().multiplyScalar(0.4));\nthrowNade(this,o,v,this.nadeFuse);\nthis.nadeCount--;\n}\nAudioSys.metalSlide(0.2,0.08,600,300);\n},",
   "releaseNade(){\n"
   + "const dir=camForward();\n"
   + "const o=camera.position.clone().add(dir.clone().multiplyScalar(0.3));\n"
   + "// 蓄力时长 → 初速与上抛角。只有手雷(3 拿出 + 右键蓄力)走这条路径;\n"
   + "// 烟雾弹 / AT 雷保持原来的固定手感(触屏或快捷键直接投出, 没有蓄力步骤)。\n"
   + "const chg=clamp(this.nadeCharge||0,0,1);\n"
   + "const spd=lerp(9,24,chg);        // 轻抛 9m/s → 全力 24m/s\n"
   + "const lift=lerp(1.9,3.6,chg);    // 全力时抬得更高, 抛物线更远\n"
   + "const self=this.vel.clone().multiplyScalar(0.4);\n"
   + "if(this.nadeIsSmoke){\n"
   + "const v=dir.multiplyScalar(12).add(V3(0,2.4,0)).add(self);\n"
   + "throwNade(this,o,v,1.8,false,true);\n"
   + "this.smokeCount--;\n"
   + "this.nadeIsSmoke=false;\n"
   + "} else if(this.nadeIsAT){\n"
   + "const v=dir.multiplyScalar(12).add(V3(0,2.2,0)).add(self);\n"
   + "throwNade(this,o,v,1.6,true);\n"
   + "this.atNades--;\n"
   + "this.nadeIsAT=false;\n"
   + "} else {\n"
   + "const v=dir.multiplyScalar(spd).add(V3(0,lift,0)).add(self);\n"
   + "throwNade(this,o,v,this.nadeFuse);\n"
   + "this.nadeCount--;\n"
   + "}\n"
   + "this.nadeCharge=0; this.nadeCharging=false;\n"
   + "AudioSys.metalSlide(0.2,0.08,600,300);\n"
   + "},", 1],
]));

// ============ 2) 24_input.js ============
out.push(...patch('js/24_input.js', [
  ["nadeStart(){ // G按下: 拉环(按住烹饪)\nif(player.nadeCount>0&&VM.state==='idle'&&!player.onMG&&handsFreeVeh()&&!player.onAT&&!player.onAA&&!player.onMortar){\nVM.state='nade'; VM.stateT=0; VM.stateDur=999;\nplayer.nadeHeld=true; player.nadeFuse=3.8; player.nadeIsAT=false;\nvmSndFlags={};\nAudioSys.click(1600,0.25,0.04);\n}\n},\nnadeRelease(){ // G松开: 投出\nif(player.nadeHeld){\nplayer.nadeHeld=false;\nVM.stateT=0; VM.stateDur=0.55;\n}\n},\nthrowAT(){ // 3: AT雷",
   "nadeEquip(){ // 3: 拿出手雷 / 再按一次收起\n"
   + "if(player.nadeHeld){ InputActions.nadeHolster(); return; }\n"
   + "if(player.nadeCount>0&&VM.state==='idle'&&!player.onMG&&handsFreeVeh()&&!player.onAT&&!player.onAA&&!player.onMortar){\n"
   + "VM.state='nade'; VM.stateT=0; VM.stateDur=999;\n"
   + "player.nadeHeld=true; player.nadeFuse=3.8; player.nadeIsAT=false; player.nadeIsSmoke=false;\n"
   + "player.nadeCharge=0; player.nadeCharging=false; player.ads=false;\n"
   + "vmSndFlags={};\n"
   + "AudioSys.click(1600,0.25,0.04);\n"
   + "showScorePop('手雷就位 · 按住右键蓄力, 松开投出 · 再按 3 收起');\n"
   + "} else if(player.nadeCount<=0){\n"
   + "showScorePop('没有手雷了');\n"
   + "}\n"
   + "},\n"
   + "nadeHolster(){ // 收起手雷, 回到武器\n"
   + "if(VM.state!=='nade') return;\n"
   + "player.nadeHeld=false; player.nadeCharging=false; player.nadeCharge=0;\n"
   + "VM.state='idle'; VM.stateT=0; vmSndFlags={};\n"
   + "if(VM.gunParts&&VM.gunParts.gun) VM.gunParts.gun.visible=true;\n"
   + "if(VM.nadeM) VM.nadeM.visible=false;\n"
   + "},\n"
   + "nadeChargeStart(){ // 右键按下: 开始蓄力\n"
   + "if(VM.state==='nade'&&player.nadeHeld&&!player.nadeCharging){\n"
   + "player.nadeCharging=true; player.nadeCharge=0;\n"
   + "AudioSys.click(900,0.2,0.03);\n"
   + "}\n"
   + "},\n"
   + "nadeChargeRelease(){ // 右键松开: 按当前蓄力投出\n"
   + "if(!player.nadeCharging) return;\n"
   + "player.nadeCharging=false;\n"
   + "player.nadeHeld=false;\n"
   + "VM.stateT=0; VM.stateDur=0.55;\n"
   + "vmSndFlags={};\n"
   + "},\n"
   + "throwAT(){ // 5 (非工程兵): AT雷", 1],
  ["if(e.code==='KeyN'&&typeof NVG!=='undefined') NVG.toggle();\nif(e.code==='KeyL'&&typeof flashToggle==='function') flashToggle();",
   "if(e.code==='KeyN'&&typeof NVG!=='undefined') NVG.toggle();\nif(e.code==='KeyG'&&typeof flashToggle==='function') flashToggle();", 1],
  ["if(e.code==='KeyG') InputActions.nadeStart();\nif(e.code==='Digit3') InputActions.throwAT();",
   "if(e.code==='Digit3') InputActions.nadeEquip();", 1],
  ["if(e.code==='Digit5') InputActions.buildNext();",
   "// 5: 工程兵切工事; 其他兵种投 AT 雷 (AT 雷原来在 3, 3 让给手雷后挪到 5)\nif(e.code==='Digit5'){ if(player.cls===4) InputActions.buildNext(); else InputActions.throwAT(); }", 1],
  ["if(e.code==='KeyG') InputActions.nadeRelease();\n", "", 1],
  ["if(e.button===2){\nmouse2Down=true;\nif(player.alive&&!player.onMG&&handsFreeVeh()&&!player.onAT&&!player.onAA&&!player.onMortar){",
   "if(e.button===2){\nmouse2Down=true;\n"
   + "// 手雷就位时, 右键 = 蓄力投掷 (按住越久投得越远), 不触发开镜\n"
   + "if(VM.state==='nade'&&player.nadeHeld){ InputActions.nadeChargeStart(); return; }\n"
   + "if(player.alive&&!player.onMG&&handsFreeVeh()&&!player.onAT&&!player.onAA&&!player.onMortar){", 1],
  ["if(e.button===2){ mouse2Down=false; if(!SETTINGS.adsToggle) player.ads=false; }",
   "if(e.button===2){\nmouse2Down=false;\n"
   + "// 手雷: 松开右键 = 投出 (距离由蓄力时长决定)\n"
   + "if(VM.state==='nade'){ InputActions.nadeChargeRelease(); return; }\n"
   + "if(!SETTINGS.adsToggle) player.ads=false;\n}", 1],
]));

// ============ 3) 25_player_update.js ============
out.push(...patch('js/25_player_update.js', [
  ["if(p.nadeHeld){\np.nadeFuse-=dt;\nif(p.nadeFuse<=0){\np.nadeHeld=false;\np.nadeCount--;\nVM.state='idle'; VM.gunParts.gun.visible=true; VM.nadeM.visible=false;\nexplodeAt(p.pos.clone().add(V3(0,1,0)),p);\n}\n}",
   "// 手雷就位: 长按右键蓄力(越久投得越远)。引信只在出手后才开始计时 ——\n"
   + "// 「拿在手里会自爆」的烹饪机制已被蓄力机制取代, 所以握着不再有自爆风险。\n"
   + "if(p.nadeHeld){\n"
   + "if(p.nadeCharging) p.nadeCharge=Math.min(1,p.nadeCharge+dt/NADE_CHARGE_TIME);\n"
   + "} else if(p.nadeCharging){ p.nadeCharging=false; }", 1],
]));

// ============ 4) 15_viewmodel.js ============
out.push(...patch('js/15_viewmodel.js', [
  ["if(player.nadeHeld){\nconst k=ss(Math.min(t,0.3),0,0.3);\nVM.nadeM.position.set(0.14,-0.12+k*0.04,-0.3+k*0.05);\nVM.nadeM.rotation.set(0,0,0);\nhandROverride={pos:V3(0.13,-0.15,-0.22),rot:V3(0.5,0,0)};\nhandLOverride={pos:V3(-0.1,-0.2,-0.2),rot:V3(0.3,0,0)};\n}",
   "if(player.nadeHeld){\nconst k=ss(Math.min(t,0.3),0,0.3);\n"
   + "// 蓄力: 手随蓄力向后拉, 给\"要扔多远\"一个直观反馈\n"
   + "const c=clamp(player.nadeCharge||0,0,1);\n"
   + "const bk=ss(c,0,1)*0.16;\n"
   + "VM.nadeM.position.set(0.14-bk*0.3,-0.12+k*0.04-bk*0.12,-0.3+k*0.05+bk*0.9);\n"
   + "VM.nadeM.rotation.set(c*0.5,0,0);\n"
   + "handROverride={pos:V3(0.13-bk*0.25,-0.15-bk*0.08,-0.22+bk*0.85),rot:V3(0.5+c*0.8,0,0)};\n"
   + "handLOverride={pos:V3(-0.1,-0.2,-0.2),rot:V3(0.3,0,0)};\n"
   + "}", 1],
]));

// ============ 5) 28_hud.js ============
out.push(...patch('js/28_hud.js', [
  ["fi.style.display='block'; fi.className=FLASH.on?'on':''; fi.textContent=FLASH.on?'✦ 手电 · 开 [L]':'[L] 战术手电';",
   "fi.style.display='block'; fi.className=FLASH.on?'on':''; fi.textContent=FLASH.on?'✦ 手电 · 开 [G]':'[G] 战术手电';", 1],
  ["} else fi.style.display='none';\n}\nconst ch=el('crosshair');",
   "} else fi.style.display='none';\n"
   + "}\n"
   + "// 手雷蓄力条 (状态由 24_input 的 nadeEquip/nadeCharge* 维护)\n"
   + "const ni=el('nadeInd');\n"
   + "if(ni){\n"
   + "if(player.alive&&VM.state==='nade'&&player.nadeHeld){\n"
   + "const c=clamp(player.nadeCharge||0,0,1);\n"
   + "ni.style.display='block'; ni.className=player.nadeCharging?'on':'';\n"
   + "el('nadeIndTxt').textContent=player.nadeCharging?('蓄力 '+Math.round(c*100)+'%'):'手雷就位 · 按住右键蓄力';\n"
   + "el('nadeIndBar').style.width=(c*100).toFixed(1)+'%';\n"
   + "} else ni.style.display='none';\n"
   + "}\nconst ch=el('crosshair');", 1],
]));

// ============ 6) 14b_weapon_mods.js ============
out.push(...patch('js/14b_weapon_mods.js', [
  ["desc:'局内按 L 开关·照亮前方·同时暴露自身位置'", "desc:'局内按 G 开关·照亮前方·同时暴露自身位置'", 1],
]));

// ============ 7) 15c_flashlight.js ============
out.push(...patch('js/15c_flashlight.js', [
  ["//   开关状态分两层: FLASH.want = 玩家意图 (按 L), FLASH.on = 实际点亮,",
   "//   开关状态分两层: FLASH.want = 玩家意图 (按 G), FLASH.on = 实际点亮,", 1],
]));

// ============ 8) 31_touch.js ============
out.push(...patch('js/31_touch.js', [
  ["if(nadeSel===0){ InputActions.nadeStart(); claim.nadeHold=true; }\nelse if(nadeSel===1) InputActions.throwSmoke();\nelse InputActions.throwAT();",
   "if(nadeSel===0){\n"
   + "// 触屏: 第一次按 = 拿出手雷; 已就位时按住 = 蓄力, 松手投出\n"
   + "if(VM.state==='nade'&&player.nadeHeld){ InputActions.nadeChargeStart(); claim.nadeHold=true; }\n"
   + "else InputActions.nadeEquip();\n"
   + "}\n"
   + "else if(nadeSel===1) InputActions.throwSmoke();\n"
   + "else InputActions.throwAT();", 1],
  ["if(claim.nadeHold) InputActions.nadeRelease();", "if(claim.nadeHold) InputActions.nadeChargeRelease();", 1],
]));

// ============ 9) index.html ============
out.push(...patch('index.html', [
  ['<div id="flashInd"></div>',
   '<div id="flashInd"></div>\n'
   + '<div id="nadeInd"><span id="nadeIndTxt">手雷就位</span><span id="nadeIndBarWrap"><span id="nadeIndBar"></span></span></div>', 1],
]));

// ============ 10) css ============
out.push(...patch('css/style.css', [
  ['body.mobile #flashInd { display:none !important; }',
   'body.mobile #flashInd { display:none !important; }\n'
   + '#nadeInd { position:absolute; left:50%; top:70%; transform:translateX(-50%); font-size:12px; letter-spacing:2px; color:rgba(255,220,180,.9); text-shadow:0 1px 3px #000; display:none; pointer-events:none; white-space:nowrap; text-align:center; }\n'
   + '#nadeInd.on { color:#ffd9a0; }\n'
   + '#nadeIndBarWrap { display:block; width:150px; height:5px; margin:5px auto 0; background:rgba(0,0,0,.55); border:1px solid rgba(255,220,160,.45); border-radius:3px; overflow:hidden; }\n'
   + '#nadeIndBar { display:block; width:0%; height:100%; background:linear-gradient(90deg,#e0a24a,#ffd9a0); }', 1],
]));

console.log(out.join('\n'));
