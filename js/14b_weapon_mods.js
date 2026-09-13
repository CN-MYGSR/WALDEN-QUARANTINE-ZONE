'use strict';
// ===================== 武器改装系统 =====================
// 每位玩家的武器可在部署时加装配件, 改装后模型与属性同时变化
// 四个槽位: optic(瞄具) · muzzle(枪口) · magazine(弹匣) · gear(战术配件/夜视仪)

const ALL_MODS = {
  // ---- 瞄具 ----
  optic_iron:     { slot:'optic', name:'机械瞄具',   desc:'出厂标配',       icon:'◎', affects:{} },
  optic_reflex:   { slot:'optic', name:'反射瞄具',   desc:'更快瞄准·视野开阔', icon:'◉', affects:{ adsFov:1.25, spreadAds:0.85 }, cost:320 },
  optic_2x:       { slot:'optic', name:'2倍瞄准镜',  desc:'中距精确射击',     icon:'⊕', affects:{ adsFov:0.58, spreadAds:0.62, spreadHip:1.1 }, cost:480 },
  optic_4x:       { slot:'optic', name:'4倍狙击镜',  desc:'远距高倍精确',     icon:'⦿', affects:{ adsFov:0.34, spreadAds:0.48, spreadHip:1.2 }, cost:720 },
  optic_nvg:      { slot:'optic', name:'夜视瞄具',   desc:'夜视仪专用·中距夜战瞄准', icon:'◑', affects:{ adsFov:0.92, spreadAds:0.85 }, cost:560 },

  // ---- 枪口 ----
  muzzle_standard:  { slot:'muzzle', name:'标准枪口', desc:'无改动',           icon:'─', affects:{} },
  muzzle_comp:      { slot:'muzzle', name:'制退器',   desc:'减少垂直后座',     icon:'◁', affects:{ recoil:0.78, recSide:1.15 }, cost:360 },
  muzzle_supp:      { slot:'muzzle', name:'消音器',   desc:'减小枪声·降低威力', icon:'○', affects:{ dmg:0.92, spreadAds:0.82, snd:'smg' }, cost:560 },
  muzzle_hider:     { slot:'muzzle', name:'喇叭形消焰', desc:'消焰·略微减后座', icon:'△', affects:{ recoil:0.88, spreadAds:0.95 }, cost:280 },

  // ---- 弹匣 ----
  mag_standard:     { slot:'mag', name:'标准弹匣',   desc:'默认容量',          icon:'□', affects:{} },
  mag_ext:          { slot:'mag', name:'扩容弹匣',   desc:'弹容量 +40%·装填稍慢',icon:'▣', affects:{ magMul:1.4, reload:1.15 }, cost:400 },
  mag_quick:        { slot:'mag', name:'快拔弹匣',   desc:'装填加快·弹容 -15%',icon:'▤', affects:{ magMul:0.85, reload:0.78 }, cost:320 },

  // ---- 战术配件 ----
  gear_none:        { slot:'gear', name:'无配件',   desc:'不携带夜视仪',       icon:'▢', affects:{} },
  gear_nvg:         { slot:'gear', name:'夜视仪',   desc:'需仓库持有夜视仪·局内按 N 开关(夜间增强/白天过曝)·阵亡丢失', icon:'◐', affects:{}, cost:0 },

  // ---- 照明 ----
  // 手电不改变武器数值, 但会显著暴露自己 (19_bot.perceive 会放宽敌人的视野与侧向角度判定),
  // 属于「用隐蔽性换信息」的改件 —— 楼道/地下/夜战收益最大。
  light_none:       { slot:'light', name:'无照明',   desc:'不安装照明',        icon:'○', affects:{} },
  light_flash:      { slot:'light', name:'战术手电', desc:'局内按 G 开关·照亮前方·同时暴露自身位置', icon:'✦', affects:{}, cost:260 },
};

// 每个武器可用的模组 (按武器 key)
const MOD_AVAIL = {
  garand:      { optic:['optic_iron','optic_2x','optic_reflex'],      muzzle:['muzzle_standard','muzzle_comp','muzzle_hider'],     mag:['mag_standard'] },
  m1carb:      { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext'] },
  thompson:    { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  bar:         { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard','muzzle_comp'],                    mag:['mag_standard'] },
  springfield: { optic:['optic_4x','optic_2x'],                        muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  m1903:       { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  m1911:       { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext','mag_quick'] },
  bazooka:     { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },

  kar98:       { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  kar98zf:     { optic:['optic_4x','optic_2x'],                        muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  mp40:        { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext'] },
  stg44:       { optic:['optic_iron','optic_reflex','optic_2x'],       muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  g33:         { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  p38:         { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard'] },
  schreck:     { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },

  mosin:       { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  mosinpu:     { optic:['optic_4x','optic_2x'],                        muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  m38carb:     { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  ppsh:        { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_comp'],                    mag:['mag_standard','mag_ext'] },
  dp28:        { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  tt33:        { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard'] },
  ptrd:        { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },

  finmosin:    { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  finmosins:   { optic:['optic_4x','optic_2x'],                        muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  suomi:       { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_comp'],                    mag:['mag_standard','mag_ext'] },
  ls26:        { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  l39:         { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  l35:         { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard'] },

  arisaka:     { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  type97s:     { optic:['optic_4x','optic_2x'],                        muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  type38c:     { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  type100:     { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext'] },
  type96:      { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  nambu:       { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  type97at:    { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },

  zhongzheng:  { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  zhongzhengs: { optic:['optic_4x','optic_2x'],                        muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  mp18:        { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext'] },
  zb26:        { optic:['optic_iron','optic_reflex'],                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  c96:         { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard'] },
  c96auto:     { optic:['optic_iron'],                                  muzzle:['muzzle_standard','muzzle_comp'],                    mag:['mag_standard','mag_ext'] },
  boys:        { optic:['optic_iron','optic_2x'],                      muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },

  hanyang:     { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  laotao:      { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  type11:      { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  mortar:      { optic:['optic_iron'],                                  muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },

  // ---- 现代 ----
  m4:        { optic:['optic_iron','optic_reflex','optic_2x'],         muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  g36c:      { optic:['optic_iron','optic_reflex','optic_2x'],         muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  m24:       { optic:['optic_4x','optic_2x'],                          muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  g28:       { optic:['optic_4x','optic_2x'],                          muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext'] },
  mp5:       { optic:['optic_iron','optic_reflex'],                    muzzle:['muzzle_standard','muzzle_supp','muzzle_comp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  at4:       { optic:['optic_iron'],                                    muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  pf3:       { optic:['optic_iron'],                                    muzzle:['muzzle_standard'],                                  mag:['mag_standard'] },
  p320:      { optic:['optic_iron'],                                    muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext'] },
  g17:       { optic:['optic_iron'],                                    muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_ext'] },
};
// 战术配件槽: 所有武器可选 无配件/夜视仪; 有瞄具槽的武器追加 夜视瞄具
Object.values(MOD_AVAIL).forEach(a=>{
  a.gear=['gear_none','gear_nvg'];
  a.light=['light_none','light_flash'];
  if(a.optic&&a.optic.length>1) a.optic.push('optic_nvg');
});

// 玩家存储的改装选择: { weaponKey: { optic:'optic_2x', muzzle:'muzzle_comp', mag:'mag_standard' } }
let PLAYER_MODS = {};
try { PLAYER_MODS = JSON.parse(localStorage.getItem('sf_mods')||'{}'); } catch(e) { PLAYER_MODS = {}; }

function savePlayerMods() { try { localStorage.setItem('sf_mods', JSON.stringify(PLAYER_MODS)); } catch(e) {} }

function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], gear:['gear_none'], light:['light_none','light_flash'] }; }
function getModChoice(key, slot) {
  const wm = PLAYER_MODS[key] || {};
  const avail = getModSlots(key);
  const list = avail[slot] || [];
  return (wm[slot] && list.includes(wm[slot])) ? wm[slot] : list[0];
}
function setModChoice(key, slot, modId) { if(!PLAYER_MODS[key]) PLAYER_MODS[key]={}; PLAYER_MODS[key][slot]=modId; savePlayerMods(); }

// 装备夜视仪(gear_nvg)后, 光学瞄具(反射/2倍/4倍)不可用, 仅机瞄或夜视瞄具可用
const OPTIC_BLOCKED=['optic_reflex','optic_2x','optic_4x'];
function opticBlocked(key) { return getModChoice(key,'gear')==='gear_nvg' && OPTIC_BLOCKED.includes(getModChoice(key,'optic')); }
function effectiveOptic(key) { return opticBlocked(key) ? 'optic_iron' : getModChoice(key,'optic'); }

// 将改装效果应用到武器定义(返回一份浅拷贝+数值乘算)
function moddedDef(key) {
  const base = WPN_DEFS[key];
  if(!base) return null;
  const out = Object.assign({}, base);
  ['optic','muzzle','mag'].forEach(slot => {
    const mid = getModChoice(key, slot);
    if(slot==='optic'&&opticBlocked(key)) return;
    const mod = ALL_MODS[mid];
    if(!mod||!mod.affects) return;
    const a = mod.affects;
    if(a.dmg) out.dmg = Math.round(out.dmg * a.dmg);
    if(a.recoil) out.recoil = out.recoil * a.recoil;
    if(a.recSide) out.recSide = out.recSide * a.recSide;
    if(a.spreadAds) out.spreadAds = out.spreadAds * a.spreadAds;
    if(a.spreadHip) out.spreadHip = out.spreadHip * a.spreadHip;
    if(a.adsFov) out.adsFov = Math.round(out.adsFov * a.adsFov);
    if(a.magMul) { out.mag = Math.max(1, Math.round(out.mag * a.magMul)); out.reserve = Math.max(1, Math.round(out.reserve * a.magMul)); }
    if(a.reload) out.reload = +(out.reload * a.reload).toFixed(2);
    if(a.snd) out.snd = a.snd;
    if(a.kick) out.kick = out.kick * a.kick;
  });
  return out;
}

// ---- 改装件的视觉部件构建 ----
function addModVisuals(parts, key) {
  const G = parts.gun;
  const gm = vmMats.gun, gl = vmMats.gunL, pk = vmMats.park;
  const muzz = parts.muzzle ? parts.muzzle.clone() : V3(0,0.03,-0.62);
  const baseDef = WPN_DEFS[key];
  const alreadyScoped = baseDef && baseDef.scoped;

  // 瞄具: 仅非镜武器可加装; 镜武器(春田PU等)已有内建镜, 不改动视角
  // 夜视仪使用中: 光学瞄具强制退回机瞄, 不渲染镜模型
  const optic = effectiveOptic(key);
  const adsA = parts.anchors && parts.anchors.ads;
  if(!alreadyScoped && adsA && optic !== 'optic_iron') {
    const p0y = adsA.pos.y, p0z = adsA.pos.z;
    if(optic === 'optic_reflex') {
      const bxBase = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.016,0.04), gl);
      bxBase.position.set(0, p0y-0.003, p0z-0.05); G.add(bxBase);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.028,0.022,0.005), new THREE.MeshLambertMaterial({color:0x8ac0e0}));
      lens.position.set(0, p0y-0.003, p0z-0.07); G.add(lens);
      adsA.pos.y += 0.015;
      adsA.pos.z += 0.06;
    } else if(optic === 'optic_2x') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.015,0.11,8), gl);
      tube.position.set(0, p0y-0.002, p0z-0.05); tube.rotation.x = HPI; G.add(tube);
      const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.011,0.025,8), gm);
      obj.position.set(0, p0y-0.002, p0z-0.1); obj.rotation.x = HPI; G.add(obj);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.015,0.002,6,8), gl);
      r1.position.set(0, p0y-0.002, p0z-0.02); G.add(r1);
      const r2 = r1.clone(); r2.position.z = p0z-0.08; G.add(r2);
      adsA.pos.y += 0.025;
      adsA.pos.z += 0.055;
    } else if(optic === 'optic_4x') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.019,0.14,8), gl);
      tube.position.set(0, p0y, p0z-0.05); tube.rotation.x = HPI; G.add(tube);
      const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.025,0.035,8), gm);
      obj.position.set(0, p0y, p0z-0.12); obj.rotation.x = HPI; G.add(obj);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.019,0.0025,8,10), gl);
      r1.position.set(0, p0y, p0z-0.01); G.add(r1);
      const r2 = r1.clone(); r2.position.z = p0z-0.09; G.add(r2);
      adsA.pos.y += 0.035;
      adsA.pos.z += 0.05;
    } else if(optic === 'optic_nvg') {
      // 夜视瞄具: 短粗镜筒 + 荧光绿物镜
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.02,0.11,8), gl);
      tube.position.set(0, p0y-0.002, p0z-0.05); tube.rotation.x = HPI; G.add(tube);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.019,0.014,0.02,8), gm);
      lens.position.set(0, p0y-0.002, p0z-0.115); lens.rotation.x = HPI; G.add(lens);
      const lensG = new THREE.Mesh(new THREE.CylinderGeometry(0.011,0.011,0.004,8), new THREE.MeshLambertMaterial({color:0x57d168,emissive:0x1c5c28}));
      lensG.position.set(0, p0y-0.002, p0z-0.124); lensG.rotation.x = HPI; G.add(lensG);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.017,0.0025,8,10), gl);
      r1.position.set(0, p0y-0.002, p0z-0.02); G.add(r1);
      adsA.pos.y += 0.028;
      adsA.pos.z += 0.05;
    }
  }

  // 枪口装置
  const muzzle = getModChoice(key, 'muzzle');
  if(muzzle === 'muzzle_comp') {
    const comp = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.018,0.06,8), gl);
    comp.position.copy(muzz); comp.position.z -= 0.03; comp.rotation.x = HPI; G.add(comp);
    for(let i=0;i<3;i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.02,0.003,0.025), gm);
      slot.position.set(muzz.x, muzz.y, muzz.z - 0.05 - i*0.015); G.add(slot);
    }
    parts.muzzle.z -= 0.08;
  } else if(muzzle === 'muzzle_supp') {
    const supp = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.02,0.14,8), gm);
    supp.position.copy(muzz); supp.position.z -= 0.07; supp.rotation.x = HPI; G.add(supp);
    parts.muzzle.z -= 0.16;
  } else if(muzzle === 'muzzle_hider') {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.022,0.07,8), gl);
    cone.position.copy(muzz); cone.position.z -= 0.035; cone.rotation.x = HPI; G.add(cone);
    parts.muzzle.z -= 0.09;
  }

  // 战术手电: 枪身左前方筒身 + 镜片 (镜片颜色由 15c_flashlight 每帧控制亮/灭)
  if(getModChoice(key, 'light') === 'light_flash') {
    const tl = clamp(Math.abs(muzz.z) * 0.16, 0.045, 0.075);   // 短枪(手枪)自动缩短
    const rr = 0.0115 * (0.55 + 0.45 * tl / 0.075);
    const bx = -0.030, by = muzz.y + 0.012, bz = muzz.z + tl * 1.35 + 0.012;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 1.08, tl, 8), gm);
    tube.position.set(bx, by, bz); tube.rotation.x = HPI; G.add(tube);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.26, rr, tl * 0.28, 8), gl);
    head.position.set(bx, by, bz - tl * 0.64); head.rotation.x = HPI; G.add(head);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.18, rr * 0.19, 6, 10), gl);
    ring.position.set(bx, by, bz - tl * 0.42); G.add(ring);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.02, rr * 1.02, 0.004, 10),
      new THREE.MeshBasicMaterial({color:0x4a4740}));
    lens.position.set(bx, by, bz - tl * 0.79); lens.rotation.x = HPI; G.add(lens);
    parts.flashLens = lens;
  }

  // 夜视仪(战术配件槽 gear_nvg): 机匣顶部后段的小型夜视仪 —— 基座 + 镜筒 + 荧光物镜 + 目镜
  // 放在机匣后部(朝射手方向), 不与前部瞄具/夜视瞄镜抢位置; 开镜时它落在视野下方边缘
  if(getModChoice(key, 'gear') === 'gear_nvg' && adsA) {
    const gy = adsA.pos.y + 0.016, gz = adsA.pos.z + 0.26;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.03,0.018,0.05), gl);
    base.position.set(0, gy, gz); G.add(base);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011,0.011,0.10,8), gm);
    tube.position.set(0, gy+0.011, gz-0.02); tube.rotation.x = HPI; G.add(tube);
    const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.0125,0.0085,0.02,8), gm);
    obj.position.set(0, gy+0.011, gz-0.075); obj.rotation.x = HPI; G.add(obj);
    const lensG = new THREE.Mesh(new THREE.CylinderGeometry(0.0085,0.0085,0.004,10),
      new THREE.MeshLambertMaterial({color:0x57d168,emissive:0x1c5c28}));
    lensG.position.set(0, gy+0.011, gz-0.086); lensG.rotation.x = HPI; G.add(lensG);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.013,0.022,8), pk);
    cup.position.set(0, gy+0.011, gz+0.04); cup.rotation.x = HPI; G.add(cup);
  }

  // 弹匣
  const mag = getModChoice(key, 'mag');
  const mw = parts.anchors && parts.anchors.magWell;
  if(mag === 'mag_ext' && mw) {
    const extMag = new THREE.Mesh(new THREE.BoxGeometry(0.024,0.22,0.06), pk);
    extMag.position.set(mw.x, mw.y - 0.075, mw.z); G.add(extMag);
    if(parts.mag) { parts.mag.scale.y = 1.35; parts.mag.position.y -= 0.04; }
  } else if(mag === 'mag_quick' && mw) {
    // 快拔弹匣: 底部加装快拔环
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018,0.003,6,8), gl);
    ring.position.set(mw.x, mw.y - 0.08, mw.z); G.add(ring);
  }
}

// 改装外观显示名称 (部署界面)
function modDisplayName(key) {
  const parts = [];
  ['optic','muzzle','mag','gear','light'].forEach(s => {
    const mid = getModChoice(key, s);
    if(mid && mid !== 'optic_iron' && mid !== 'muzzle_standard' && mid !== 'mag_standard' && mid !== 'gear_none' && mid !== 'light_none') {
      parts.push(ALL_MODS[mid].name);
    }
  });
  return parts.length ? parts.join(' · ') : '无改装';
}

// 改装总开销
function modTotalCost(key) {
  let total = 0;
  ['optic','muzzle','mag','gear','light'].forEach(s => {
    const mid = getModChoice(key, s);
    if(mid && ALL_MODS[mid].cost) total += ALL_MODS[mid].cost;
  });
  return total;
}
