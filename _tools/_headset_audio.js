// 耳机系统: 音频层 (听力范围 / 脚步与枪声放大 / 环境音压制) + NPC 脚步音
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
    if (raw.split(t).length - 1 !== 1) { console.log('  ❌ ' + rel + '  ' + t.slice(0, 54).replace(/\r?\n/g, '⏎')); bad++; }
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

// ---------- 02_audio.js ----------
rep('js/02_audio.js', [
  // ① HEAR 档案
  [(L) => L('let ctx=null, master=null, comp=null, noiseBuf=null;',
    'let inited=false;'),
    (L) => L('let ctx=null, master=null, comp=null, noiseBuf=null;',
      'let inited=false;',
      'let ambBus=null;   // 环境音总线: 耳机降噪作用在这里 (风/雨/鸟/远处机枪)',
      '// 听力档案 (由 29_menus 部署时按耳机写入, 见 HEADSET_DEFS)',
      '//   range   脚步可听距离(米); 0 = 默认 40m',
      '//   amp     脚步 / 开火声放大倍数',
      '//   ambient 环境音保留比例, 越小越安静',
      'let HEAR={ range:0, amp:1, ambient:1 };')],
  // ② 环境音总线
  [(L) => L('comp.connect(master); master.connect(ctx.destination);'),
    (L) => L('comp.connect(master); master.connect(ctx.destination);',
      'ambBus = ctx.createGain(); ambBus.gain.value = HEAR.ambient; ambBus.connect(comp);')],
  // ③ 脚步: 范围 + 放大
  [(L) => L('function footstep(run=false, dist=0){',
    'if(!inited) return;',
    'const sp=spatial(dist,40); if(sp.gain<0.03) return;'),
    (L) => L('function footstep(run=false, dist=0){',
      'if(!inited) return;',
      '// 戴耳机时: 可听距离拉到耳机标称值, 且用线性衰减 —— 让标称范围真的能用满',
      'const maxD=HEAR.range>0?HEAR.range:40;',
      'const sp=HEAR.range>0?spatial(dist,maxD,1):spatial(dist,maxD);',
      'if(sp.gain<0.03) return;')],
  ['const g=ctx.createGain(); env(g,t0,(run?0.2:0.11)*sp.gain, 0.07);',
   'const g=ctx.createGain(); env(g,t0,(run?0.2:0.11)*sp.gain*HEAR.amp, 0.07);'],
  // ④ 枪声: 范围略扩 + 放大
  ['const sp = spatial(dist, type===\'sniper\'?290:230, 3);',
   '// 耳机: 远处枪声听得更远也更清楚\nconst _gmul=HEAR.range>0?1.25:1;\nconst sp = spatial(dist, (type===\'sniper\'?290:230)*_gmul, 3);'],
  ['ng.gain.linearRampToValueAtTime(P.v*sp.gain*selfB,t0+0.0015);',
   'ng.gain.linearRampToValueAtTime(P.v*sp.gain*selfB*HEAR.amp,t0+0.0015);'],
  // ⑤ 环境音压低: 爆炸 / 炮声 / 防空 / 跳弹
  ['const og=ctx.createGain(); env(og,t0,1.5*sp.gain,1.1);',
   'const og=ctx.createGain(); env(og,t0,1.5*sp.gain*HEAR.ambient,1.1);'],
  ['const ng=ctx.createGain(); env(ng,t0,1.3*sp.gain,1.3);',
   'const ng=ctx.createGain(); env(ng,t0,1.3*sp.gain*HEAR.ambient,1.3);'],
  ['const og=ctx.createGain(); env(og,t0,1.6*sp.gain,0.7);',
   'const og=ctx.createGain(); env(og,t0,1.6*sp.gain*HEAR.ambient,0.7);'],
  ['const ng=ctx.createGain(); env(ng,t0,1.2*sp.gain,0.9);',
   'const ng=ctx.createGain(); env(ng,t0,1.2*sp.gain*HEAR.ambient,0.9);'],
  ['const g=ctx.createGain(); env(g,t0,0.55*sp.gain,0.35);',
   'const g=ctx.createGain(); env(g,t0,0.55*sp.gain*HEAR.ambient,0.35);'],
  ['const g=ctx.createGain(); env(g,t0,0.1*sp.gain,0.22);',
   'const g=ctx.createGain(); env(g,t0,0.1*sp.gain*HEAR.ambient,0.22);'],
  // ⑥ 环境音源改走 ambBus
  ['n.connect(lp); lp.connect(g); g.connect(comp); n.start(); lfo.start();',
   'n.connect(lp); lp.connect(g); g.connect(ambBus); n.start(); lfo.start();'],
  ['rn.connect(rl); rl.connect(rg); rg.connect(comp); rn.start();',
   'rn.connect(rl); rl.connect(rg); rg.connect(ambBus); rn.start();'],
  ['if(panN){ panN.pan.value=panV; lp.connect(panN); panN.connect(comp); } else lp.connect(comp);',
   'if(panN){ panN.pan.value=panV; lp.connect(panN); panN.connect(ambBus); } else lp.connect(ambBus);'],
  [(L) => L('g.connect(pan); pan.connect(comp);',
    '} else g.connect(comp);'),
    (L) => L('g.connect(pan); pan.connect(ambBus);',
      '} else g.connect(ambBus);')],
  // ⑦ 导出 setHearing
  ['return { init, gunshot, explosion, click, metalSlide, ping, footstep, whizz, ricochet, hurt, hitmarkSnd, nadeBounce, cannon, flakPop, createEngine, setVol, resume, mortarThunk };',
   '// 耳机: 写入听力档案 (传 null / 空对象 = 摘掉耳机, 恢复默认)\nfunction setHearing(p){\nHEAR={ range:(p&&p.range)||0, amp:(p&&p.amp)||1, ambient:(p&&p.ambient)||1 };\nif(ambBus) ambBus.gain.value = HEAR.ambient;\n}\nreturn { init, gunshot, explosion, click, metalSlide, ping, footstep, whizz, ricochet, hurt, hitmarkSnd, nadeBounce, cannon, flakPop, createEngine, setVol, resume, mortarThunk, setHearing };'],
], '02_audio.js 听力档案');

// ---------- 19_bot.js: NPC 脚步音 ----------
rep('js/19_bot.js', [
  [(L) => L('updateMesh(dt,speed){',
    'const m=this.mesh;',
    'if(!m) return;'),
    (L) => L('updateMesh(dt,speed){',
      'const m=this.mesh;',
      'if(!m) return;',
      '// 敌人脚步: 原先只有玩家自己有脚步声, 敌兵完全是静音的 (2026-09-19 加)。',
      '// 距离由 02_audio 的 spatial 按听力范围衰减 —— 戴耳机能听到更远。',
      'if(this.alive&&speed>0.9&&!this.netRemote&&this.team!==player.team){',
      ' this.stepT=(this.stepT||0)-dt;',
      ' if(this.stepT<=0){',
      '  const run=speed>4.4;',
      '  this.stepT=run?0.42:0.6;',
      '  AudioSys.footstep(run, this.pos.distanceTo(camera.position));',
      ' }',
      '}')],
], '19_bot.js NPC 脚步音');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
