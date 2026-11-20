// 夜视仪「微光地图补光」补丁 (版本 2026-09-19)
// 问题: 用户反馈「使用夜视仪, 实验室地图仍然过暗」。
//   实验室 MAP_DIM=0.42, 而 01_data:125 已 WFX.sun*=MAP_DIM, 03_renderer:58 又乘一次 MAP_DIM
//   → 白天实验室的灯光只有正常地图的 ≈0.18 倍。
//   而原先「ISO 7→14」只写在 NIGHT 分支里, 白天进实验室走的是旧系数 → 还是黑。
// 改法: 把 dimK=(1-MAP_DIM) 做成独立补偿项, 昼夜两条路径都按 dimK 放大场景光 + 曝光 + 增益。
const fs = require('fs');
const path = require('path');
const R = f => path.join(path.resolve(__dirname, '..'), f);

const from = [
  '      const d=curDef();',
  '      const gMul=d?d.gain:1, bMul=d?d.boost:1, fov=d?d.fov:94;',
  '      // 微光地图(秘密实验室 MAP_DIM<1)基础光本来就低, 单纯乘系数还是暗 → 再补一个绝对下限',
  "      const _dim=(typeof MAP_DIM==='number'&&MAP_DIM<1)?(1-MAP_DIM):0;",
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
].join('\n');

const to = [
  '      const d=curDef();',
  '      const gMul=d?d.gain:1, bMul=d?d.boost:1, fov=d?d.fov:94;',
  '      // 微光地图补偿 dimK: 秘密实验室 MAP_DIM=0.42, 而 03_renderer 的灯光又额外乘了一次 MAP_DIM',
  '      // (白天实验室 ≈0.18×正常亮度), 所以「只靠倍率」提不亮 —— 必须按 dimK 单独放大场景光。',
  "      const dimK=(typeof MAP_DIM==='number'&&MAP_DIM<1)?(1-MAP_DIM):0;",
  '      if(NIGHT){',
  '        // 夜间: 增强环境光 + 曝光, 把黑暗场景提亮到可辨',
  '        const k=1+st.boost*(6.0+10.0*dimK)*bMul;',
  '        sun.intensity=daySun*k;',
  '        hemi.intensity=dayHemi*k;',
  '        renderer.toneMappingExposure=dayExposure*(1+st.boost*(2.4+2.0*dimK)*bMul);',
  '      } else if(dimK>0){',
  '        // 白天 + 微光地图(实验室): 正常地图白天不补光, 但实验室白天也是黑的 → 必须补',
  '        const k=1+st.boost*(1.7+12.0*dimK)*bMul;',
  '        sun.intensity=daySun*k;',
  '        hemi.intensity=dayHemi*k;',
  '        renderer.toneMappingExposure=dayExposure*(1+st.boost*(1.7+2.0*dimK));',
  '      } else {',
  '        // 白天(正常地图): 不补环境光, 只靠曝光+增益把画面压到过曝发白(能看到轮廓但刺眼)',
  '        renderer.toneMappingExposure=dayExposure*(1+st.boost*1.7);',
  '      }',
  '      if(mat){',
  '        mat.uniforms.uTime.value=performance.now()/1000;',
  '        // 2026-09-19 需求「夜视仪 ISO 提高」: 夜间 7 → 14; 微光地图再乘 (1+dimK*1.5)',
  '        mat.uniforms.uGain.value=(NIGHT?(1+st.boost*14):(1+st.boost*4.5))*(1+st.boost*dimK*1.5)*gMul;',
  '      }',
].join('\n');

const file = 'js/34_nvg.js';
let s = fs.readFileSync(R(file), 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const F = from.split('\n').join(eol), T = to.split('\n').join(eol);
const n = s.split(F).length - 1;
console.log((n === 1 ? '✅' : '❌') + ` ${file} 命中 ${n}/1`);
if (n !== 1) { console.log('未命中, 未写盘'); process.exit(1); }
fs.writeFileSync(R(file), s.split(F).join(T), 'utf8');
console.log('💾 已写盘');
