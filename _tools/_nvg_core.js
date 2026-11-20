// 34_nvg.js: 三型参数 + ISO 提高 + 热成像红框标记
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

rep('js/34_nvg.js', [
  // ① 当前型号 + 热成像画布
  [(L) => L('  let rt=null, quad=null, qcam=null, qscene=null, mat=null;',
    '  let daySun=2, dayHemi=0.75, dayExposure=1.05;'),
    (L) => L('  let rt=null, quad=null, qcam=null, qscene=null, mat=null;',
      '  let daySun=2, dayHemi=0.75, dayExposure=1.05;',
      '  // ---- 2026-09-19: 三型夜视仪 (普通 / 全景 / 热成像) ----',
      '  // 型号参数取自 NVG_DEFS, 由 RUN.nvgKey 决定 (部署时写入)。',
      '  function curDef(){',
      '    try{',
      "      const k=(typeof RUN!=='undefined'&&RUN.nvgKey)||'';",
      "      return (typeof NVG_DEFS!=='undefined'&&NVG_DEFS[k])?NVG_DEFS[k]:null;",
      '    }catch(e){ return null; }',
      '  }',
      '  // ---- 热成像: 只把 NPC 标成红色方框, 其余画面与普通夜视仪一致 ----',
      '  let thCv=null, thCtx=null;',
      '  function initThermal(){',
      '    if(thCv) return;',
      "    thCv=document.createElement('canvas');",
      "    thCv.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:16';",
      '    document.body.appendChild(thCv);',
      "    thCtx=thCv.getContext('2d');",
      '  }',
      '  const _tv=new THREE.Vector3();',
      '  function drawThermal(){',
      '    if(!thCtx){ return; }',
      '    const w=innerWidth, h=innerHeight;',
      '    if(thCv.width!==w||thCv.height!==h){ thCv.width=w; thCv.height=h; }',
      '    thCtx.clearRect(0,0,w,h);',
      '    const d=curDef();',
      '    if(!st.active||!d||!d.thermal||typeof soldiers===\'undefined\') return;',
      '    thCtx.lineWidth=2;',
      "    thCtx.strokeStyle='rgba(255,42,42,0.95)';",
      "    thCtx.fillStyle='rgba(255,42,42,0.14)';",
      '    for(const s of soldiers){',
      '      if(!s.alive||s.team===player.team) continue;   // 只标 NPC 敌人',
      '      _tv.set(s.pos.x, s.pos.y+1.05, s.pos.z).project(camera);',
      '      if(_tv.z>1) continue;',
      '      const sx=(_tv.x*0.5+0.5)*w, sy=(1-(_tv.y*0.5+0.5))*h;',
      '      if(sx<-80||sy<-80||sx>w+80||sy>h+80) continue;',
      '      const dist=Math.hypot(s.pos.x-camera.position.x,s.pos.y-camera.position.y,s.pos.z-camera.position.z);',
      '      const hh=Math.max(22,Math.min(110, 1400/Math.max(dist,2)));',
      '      const ww=hh*0.42;',
      '      thCtx.fillRect(sx-ww*0.5, sy-hh*0.62, ww, hh);',
      '      thCtx.strokeRect(sx-ww*0.5, sy-hh*0.62, ww, hh);',
      '    }',
      '  }')],
  // ② owned(): 用 RUN.nvgKey 而不是布尔
  [(L) => L('      if(RUN&&!RUN.nvgBrought) return false;'),
    (L) => L('      if(RUN&&!RUN.nvgBrought) return false;',
      '      if(RUN&&!RUN.nvgKey) return false;      // 没带型号 = 没夜视仪')],
  // ③ toggle: 提示带型号
  [(L) => L("    if(!owned()){ showScorePop('未携带夜视仪 (工坊装入战术配件槽 + 仓库持有夜视仪)'); return; }"),
    (L) => L("    if(!owned()){ showScorePop('未携带夜视仪 (部署时选一型 + 工坊装入战术配件槽)'); return; }")],
  // ④ update(): ISO 提高 + 三型参数 + 热成像
  [(L) => L('    if(st.boost>0.001){',
    '      if(NIGHT){',
    '        // 夜间: 增强环境光 + 曝光, 把黑暗场景提亮到可辨',
    '        sun.intensity=daySun*(1+st.boost*3.5);',
    '        hemi.intensity=dayHemi*(1+st.boost*3.2);',
    '        renderer.toneMappingExposure=dayExposure*(1+st.boost*1.2);',
    '      } else {',
    '        // 白天: 不补环境光, 只靠曝光+增益把画面压到过曝发白(能看到轮廓但刺眼)',
    '        renderer.toneMappingExposure=dayExposure*(1+st.boost*1.7);',
    '      }',
    '      if(mat){',
    '        mat.uniforms.uTime.value=performance.now()/1000;',
    '        mat.uniforms.uGain.value=NIGHT?(1+st.boost*7):(1+st.boost*3.4);',
    '      }',
    '      if(st.active&&player&&player.alive&&!player.ads&&!player.onMG&&!player.onAT&&!player.onAA&&!player.onMortar&&!player.onVehicle){',
    '        camera.fov=dampF(camera.fov,94,8,dt);',
    '        camera.updateProjectionMatrix();',
    '      }'),
    (L) => L('    if(st.boost>0.001){',
      '      const d=curDef();',
      '      const gMul=d?d.gain:1, bMul=d?d.boost:1, fov=d?d.fov:94;',
      '      // 微光地图(秘密实验室 MAP_DIM<1)基础光本来就低, 单纯乘系数还是暗 → 再补一个绝对下限',
      '      const _dim=(typeof MAP_DIM===\'number\'&&MAP_DIM<1)?(1-MAP_DIM):0;',
      '      if(NIGHT){',
      '        // 夜间: 增强环境光 + 曝光, 把黑暗场景提亮到可辨',
      '        sun.intensity=daySun*(1+st.boost*6.0*bMul)+_dim*2.4*st.boost;',
      '        hemi.intensity=dayHemi*(1+st.boost*5.5*bMul)+_dim*1.8*st.boost;',
      '        renderer.toneMappingExposure=dayExposure*(1+st.boost*2.4*bMul)+_dim*0.5*st.boost;',
      '      } else {',
      '        // 白天: 不补环境光, 只靠曝光+增益把画面压到过曝发白(能看到轮廓但刺眼)',
      '        renderer.toneMappingExposure=dayExposure*(1+st.boost*1.7)+_dim*0.4*st.boost;',
      '      }',
      '      if(mat){',
      '        mat.uniforms.uTime.value=performance.now()/1000;',
      '        // 2026-09-19 需求「夜视仪 ISO 提高」: 7 → 14 (再乘型号 gain)',
      '        mat.uniforms.uGain.value=(NIGHT?(1+st.boost*14):(1+st.boost*4.5))*gMul;',
      '      }',
      '      if(st.active&&player&&player.alive&&!player.ads&&!player.onMG&&!player.onAT&&!player.onAA&&!player.onMortar&&!player.onVehicle){',
      '        camera.fov=dampF(camera.fov,fov,8,dt);',
      '        camera.updateProjectionMatrix();',
      '      }')],
  // ⑤ 关闭时复位 + 清热成像
  [(L) => L('      renderer.toneMappingExposure=dayExposure;',
    '      if(mat) mat.uniforms.uGain.value=1;',
    '    }',
    '    if(st.active) updateInd();'),
    (L) => L('      renderer.toneMappingExposure=dayExposure;',
      '      if(mat) mat.uniforms.uGain.value=1;',
      '    }',
      '    if(st.active) updateInd();',
      '    initThermal();',
      '    drawThermal();')],
], '34_nvg.js 三型 + ISO + 热成像');

console.log(ok ? '\n完成' : '\n有失败');
process.exit(ok ? 0 : 1);
