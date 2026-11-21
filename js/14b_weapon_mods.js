'use strict';
// ===================== 武器改装系统 =====================
// 每位玩家的武器可在部署时加装配件, 改装后模型与属性同时变化
// 七个槽位: optic(瞄具) · muzzle(枪口) · mag(弹匣) · stock(枪托) · grip(握把) · gear(战术配件/夜视仪) · light(照明)

const ALL_MODS = {
  // ---- 瞄具 ----
  optic_iron:     { slot:'optic', name:'机械瞄具',   desc:'出厂标配',       icon:'◎', affects:{} },
  optic_reflex:   { slot:'optic', name:'反射瞄具',   desc:'更快瞄准·视野开阔', icon:'◉', affects:{ adsFov:1.25, spreadAds:0.85, weight:0.25, ergo:0.98 }, cost:320 },
  optic_2x:       { slot:'optic', name:'中距变倍镜',  desc:'开镜滚轮无极变倍·中距精确', icon:'⊕', affects:{ adsFov:0.58, spreadAds:0.62, spreadHip:1.1, weight:0.42, ergo:0.94 }, cost:480 },
  optic_4x:       { slot:'optic', name:'远距变倍镜',desc:'开镜滚轮无极变倍·远距精确', icon:'⦿', affects:{ adsFov:0.34, spreadAds:0.48, spreadHip:1.2, weight:0.55, ergo:0.92 }, cost:720 },
  optic_nvg:      { slot:'optic', name:'夜视瞄具',   desc:'夜视仪专用·中距夜战瞄准', icon:'◑', affects:{ adsFov:0.92, spreadAds:0.85, weight:0.28, ergo:0.97 }, cost:560 },

  // ---- 枪口 ----
  muzzle_standard:  { slot:'muzzle', name:'标准枪口', desc:'无改动',           icon:'─', affects:{} },
  muzzle_comp:      { slot:'muzzle', name:'制退器',   desc:'减少垂直后座',     icon:'◁', affects:{ recoil:0.78, recSide:1.15, weight:0.22 }, cost:360 },
  muzzle_supp:      { slot:'muzzle', name:'消音器',   desc:'减小枪声·降低威力', icon:'○', affects:{ dmg:0.92, spreadAds:0.82, snd:'smg', weight:0.48, ergo:0.94 }, cost:560 },
  muzzle_hider:     { slot:'muzzle', name:'喇叭形消焰', desc:'消焰·略微减后座', icon:'△', affects:{ recoil:0.88, spreadAds:0.95, weight:0.12 }, cost:280 },

  // ---- 弹匣 ----
  mag_standard:     { slot:'mag', name:'标准弹匣',   desc:'默认容量',          icon:'□', affects:{} },
  mag_ext:          { slot:'mag', name:'扩容弹匣',   desc:'弹容量 +40%·装填稍慢',icon:'▣', affects:{ magMul:1.4, reload:1.15, weight:0.2, ergo:0.98 }, cost:400 },
  mag_quick:        { slot:'mag', name:'快拔弹匣',   desc:'装填加快·弹容 -15%',icon:'▤', affects:{ magMul:0.85, reload:0.78, weight:0.08, ergo:1.02 }, cost:320 },

  // ---- 弹匣 · 大容量 ----
  mag_drum:         { slot:'mag', name:'弹鼓',     desc:'弹容量 ×2·换弹最慢·腰射变差', icon:'◍', affects:{ magMul:2.0, reload:1.5, spreadHip:1.10, weight:0.7, ergo:0.93 }, cost:900 },

  // ---- 枪托 ----
  // 只给有托的武器 (手枪/火箭筒没有枪托, 见下方按类别自动分配)
  stock_standard:   { slot:'stock', name:'标准枪托',     desc:'出厂标配',            icon:'▭', affects:{} },
  stock_heavy:      { slot:'stock', name:'重型枪托',     desc:'后座显著降低·腰射略差', icon:'▬', affects:{ recoil:0.80, recSide:0.86, spreadHip:1.06, kick:0.88, weight:0.4, ergo:0.94 }, cost:420 },
  stock_light:      { slot:'stock', name:'轻量枪托',     desc:'腰射更灵活·后座增大',  icon:'▱', affects:{ spreadHip:0.90, recoil:1.10, kick:1.08, weight:-0.22, ergo:1.04 }, cost:380 },
  stock_precision:  { slot:'stock', name:'精确射手枪托', desc:'架枪极稳·腰射最差',    icon:'▮', affects:{ recoil:0.86, recSide:0.80, spreadAds:0.88, spreadHip:1.18, weight:0.3, ergo:0.95 }, cost:620 },

  // ---- 握把 (前握把, 装在护木下方) ----
  grip_none:        { slot:'grip', name:'无前握把', desc:'不安装前握把',        icon:'○', affects:{} },
  grip_vertical:    { slot:'grip', name:'垂直握把', desc:'压住水平后座·腰射略差', icon:'▯', affects:{ recSide:0.76, recoil:0.95, spreadHip:1.05, weight:0.16 }, cost:340 },
  grip_angled:      { slot:'grip', name:'斜角握把', desc:'腰射更稳·换弹略快',    icon:'◣', affects:{ spreadHip:0.85, reload:0.94, recSide:1.05, weight:0.14, ergo:1.03 }, cost:360 },
  grip_tactical:    { slot:'grip', name:'战术握把', desc:'开镜更准·换弹更快',    icon:'▰', affects:{ spreadAds:0.86, reload:0.90, recoil:1.05, weight:0.2, ergo:1.02 }, cost:520 },

  // ---- 战术配件 ----
  gear_none:        { slot:'gear', name:'无配件',   desc:'不携带夜视仪',       icon:'▢', affects:{} },
  gear_nvg:         { slot:'gear', name:'夜视仪',   desc:'需仓库持有夜视仪·局内按 N 开关(夜间增强/白天过曝)·阵亡丢失', icon:'◐', affects:{}, cost:0 },

  // ---- 照明 ----
  // 手电不改变武器数值, 但会显著暴露自己 (19_bot.perceive 会放宽敌人的视野与侧向角度判定),
  // 属于「用隐蔽性换信息」的改件 —— 楼道/地下/夜战收益最大。
  light_none:       { slot:'light', name:'无照明',   desc:'不安装照明',        icon:'○', affects:{} },
  light_flash:      { slot:'light', name:'战术手电', desc:'局内按 G 开关·照亮前方·同时暴露自身位置', icon:'✦', affects:{}, cost:260 },
  light_laser:      { slot:'light', name:'激光指示器', desc:'局内按 G 开关·红色光柱与落点·不照亮环境也不暴露自己', icon:'●', affects:{}, cost:300 },
  light_strobe:     { slot:'light', name:'爆闪手电',   desc:'局内按 G 触发爆闪·连闪 10 次·范围内敌人短暂失能·自己也晃眼', icon:'✹', affects:{}, cost:780 },
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
  // ---- 现代 · 新增 6 把 ----
  deagle:    { optic:['optic_iron'],                                    muzzle:['muzzle_standard','muzzle_comp'],                    mag:['mag_standard','mag_ext'] },
  glock18:   { optic:['optic_iron'],                                    muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  awm:       { optic:['optic_4x','optic_2x'],                           muzzle:['muzzle_standard','muzzle_supp'],                    mag:['mag_standard','mag_quick'] },
  qbz95:     { optic:['optic_iron','optic_reflex','optic_2x'],          muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  qbz191:    { optic:['optic_iron','optic_reflex','optic_2x'],          muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  hk416:     { optic:['optic_iron','optic_reflex','optic_2x'],          muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  ak12:      { optic:['optic_iron','optic_reflex','optic_2x'],          muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
  aks74u:    { optic:['optic_iron','optic_reflex'],                     muzzle:['muzzle_standard','muzzle_comp','muzzle_supp'],      mag:['mag_standard','mag_ext','mag_quick'] },
};
// 战术配件槽: 所有武器可选 无配件/夜视仪; 有瞄具槽的武器追加 夜视瞄具
Object.values(MOD_AVAIL).forEach(a=>{
  a.gear=['gear_none','gear_nvg'];
  a.light=['light_none','light_flash','light_laser','light_strobe'];
  if(a.optic&&a.optic.length>1) a.optic.push('optic_nvg');
});
// 枪托 / 握把: 按武器类别自动分配 (与 gear/light 同一手法 —— 不逐把写, 免得漏)
//   · 手枪(pistol) 没有枪托, 前握把也无处可装 → 空数组 = 工坊里不显示这两行
//   · 火箭筒/迫击炮(snd==='cannon') 同理
//   · 弹鼓只给全自动且非机枪 (机枪本身弹容就大, 再翻倍太离谱)
Object.entries(MOD_AVAIL).forEach(([k,a])=>{
  const d=WPN_DEFS[k]||{};
  const bare=!!d.pistol||d.snd==='cannon';
  a.stock = bare ? [] : ['stock_standard','stock_heavy','stock_light','stock_precision'];
  a.grip  = bare ? [] : ['grip_none','grip_vertical','grip_angled','grip_tactical'];
  if(d.type==='auto'&&d.snd!=='mg'&&a.mag&&a.mag.indexOf('mag_drum')<0) a.mag.push('mag_drum');
});

// 玩家存储的改装选择: { weaponKey: { optic:'optic_2x', muzzle:'muzzle_comp', mag:'mag_standard' } }
let PLAYER_MODS = {};
try { PLAYER_MODS = JSON.parse(localStorage.getItem('sf_mods')||'{}'); } catch(e) { PLAYER_MODS = {}; }

function savePlayerMods() { try { localStorage.setItem('sf_mods', JSON.stringify(PLAYER_MODS)); } catch(e) {} }

// ⚠️ 兜底字面量的 gear 槽**必须也含 gear_nvg** —— 没有 MOD_AVAIL 条目的武器会走这里,
// 漏了它 → 那几把枪在工坊里没有夜视仪选项 → 拥有夜视仪也用不了。
function getModSlots(key) { return MOD_AVAIL[key] || { optic:['optic_iron'], muzzle:['muzzle_standard'], mag:['mag_standard'], stock:['stock_standard','stock_heavy','stock_light','stock_precision'], grip:['grip_none','grip_vertical','grip_angled','grip_tactical'], gear:['gear_none','gear_nvg'], light:['light_none','light_flash','light_laser','light_strobe'] }; }
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
  out.modWeight=0; out.ergo=clamp(1.12-((base.pistol?1.1:2.6+(base.dmg||20)*0.05)*0.025),0.82,1.08);
  ['optic','muzzle','mag','stock','grip'].forEach(slot => {
    const mid = getModChoice(key, slot);
    if(slot==='optic'&&opticBlocked(key)) return;
    const mod = ALL_MODS[mid];
    if(!mod||!mod.affects) return;
    const a = mod.affects;
    if(a.weight) out.modWeight+=a.weight;
    if(a.ergo) out.ergo*=a.ergo;
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

function weaponHandlingOf(slot){
  const key=slot&&slot.key||'';
  const base=WPN_DEFS[key]||{};
  const def=(slot&&slot.def)||base;
  const weight=(base.pistol?1.1:Math.round((2.6+(base.dmg||20)*0.05)*10)/10)+((def&&def.modWeight)||0);
  return {weight:clamp(weight,0.8,9),ergo:clamp((def&&def.ergo)||1,0.75,1.18)};
}
function weaponAimSwayMul(slot){
  const h=weaponHandlingOf(slot);
  return clamp((0.84+h.weight*0.075)/h.ergo,0.8,1.65);
}
function weaponAimStaminaMul(slot){
  const h=weaponHandlingOf(slot);
  return clamp((0.72+h.weight*0.115)/Math.sqrt(h.ergo),0.75,1.8);
}
// 放大瞄具不再固定倍率: 开镜后滚轮 / [ ] 在当前武器 min..max 之间连续调整。
// 相机 FOV(15_viewmodel)、灵敏度(24_input/31_touch)、镜内渲染(63_scope) 都走 adsFovOf,
// 所以这里返回连续值, 三处会同步跟随。
const ZOOM_CUR=new WeakMap();
const ZOOM_RANGE=new WeakMap();

function zoomOpticKind(key){
  const d=(typeof WPN_DEFS!=='undefined')&&WPN_DEFS[key];
  if(!d) return '';
  if(d.scoped) return 'scoped';
  let o=null;
  try{ o=(typeof effectiveOptic==='function')?effectiveOptic(key):getModChoice(key,'optic'); }catch(e){}
  return (o==='optic_2x'||o==='optic_4x')?o:'';
}
function baseAdsFovDeg(key){
  const base=WPN_DEFS[key]||{};
  let f=base.adsFov||60;
  if(!base.scoped){
    try{ const md=(typeof moddedDef==='function')?moddedDef(key):null; if(md&&md.adsFov) f=md.adsFov; }catch(e){}
  }
  return f;
}
function fovDegToZoom(f){
  const h=(BASE_FOV_74*Math.PI/180)/2;
  return Math.tan(h)/Math.tan((Math.max(f,1)*Math.PI/180)/2);
}
function zoomToFovDeg(z,baseFov=BASE_FOV_74){
  const h=baseFov*Math.PI/360;
  return 2*Math.atan(Math.tan(h)/Math.max(z,1e-3))*180/Math.PI;
}
// 返回 [最小倍, 最大倍]; 不是放大瞄具则 null
function zoomRangeOf(key){
  const kind=zoomOpticKind(key); if(!kind) return null;
  const def=WPN_DEFS[key];
  let ranges=ZOOM_RANGE.get(def);
  if(!ranges){ ranges=Object.create(null); ZOOM_RANGE.set(def,ranges); }
  if(ranges[kind]) return ranges[kind];
  const max=Math.max(1.15, fovDegToZoom(baseAdsFovDeg(key)));
  let min=1.0;
  if(kind==='optic_4x') min=1.5;
  else if(kind==='scoped') min=Math.max(1.5, max*0.55);
  min=Math.min(min,max-0.2);
  return (ranges[kind]=[min,max]);
}
function zoomOf(key){
  const r=zoomRangeOf(key); if(!r) return null;
  return ZOOM_CUR.get(r)??r[0];
}
// 一格滚轮或一次按键走八分之一量程，触控板和拖动可传入小数。
function zoomAdjust(key,dir,step){
  const r=zoomRangeOf(key); if(!r||!Number.isFinite(dir)) return false;
  const cur=ZOOM_CUR.get(r)??r[0];
  ZOOM_CUR.set(r,clamp(cur+dir*(step??(r[1]-r[0])/8),r[0],r[1]));
  return true;
}

// 开镜视野(度): 含瞄具改件倍率, 并按玩家的"视野"设置等比缩放。
// ⚠️ 2026-10-31 之前 moddedDef 里算了 adsFov 却**没有任何地方消费** —— 2×/4× 瞄具
// 只加了个模型、根本没放大。现在相机(15_viewmodel)、灵敏度(24_input/31_touch)、
// 镜内渲染(63_scope) 统一走这个函数, 别再各自读 WPN_DEFS[key].adsFov。
function adsFovOf(key){
  const bf=(typeof SETTINGS!=='undefined'&&SETTINGS&&SETTINGS.fov)||BASE_FOV_74;
  const z=zoomOf(key);
  return z===null?baseAdsFovDeg(key)*(bf/BASE_FOV_74):zoomToFovDeg(z,bf);
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
    // ⚠️ z 不能直接沿用 adsA.pos.z —— 那是"开镜时把枪推到镜头前多远"的相机偏移,
    // 数值约 -0.27, 直接当枪身局部坐标会把瞄具装到护木/枪管上方(玩家反馈"太靠枪口")。
    // 直接用裸枪的机瞄坐标(后照门): 瞄具就该装在照门所在的机匣导轨上。
    // 没有机瞄坐标时才退回原来的相机偏移 + 后移补偿。
    const IS = parts.ironSight;
    const OPTIC_PULL=0.19;
    const p0y = IS ? IS.y : -adsA.pos.y;
    const p0z = IS ? IS.z : Math.min(0.03, adsA.pos.z+OPTIC_PULL);
    if(!IS) adsA.pos.z -= OPTIC_PULL;
    if(optic === 'optic_reflex') {
      // 镜座把镜体抬离机匣顶: 冲锋枪/短枪的机匣很浅, 不抬会被枪身吃掉
      const my=p0y+0.010;
      const riser=new THREE.Mesh(new THREE.BoxGeometry(0.030,0.012,0.040), gl);
      riser.position.set(0, my-0.018, p0z-0.05); G.add(riser);
      const bxBase = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.016,0.04), gl);
      bxBase.position.set(0, my-0.006, p0z-0.05); G.add(bxBase);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.028,0.022,0.005), new THREE.MeshLambertMaterial({color:0x8ac0e0}));
      lens.position.set(0, my-0.002, p0z-0.07); G.add(lens);
      parts.opticSightY = my-0.002;   // 光学中心高度, 供 buildGunModel 算 sightAnchor
      if(!IS) adsA.pos.y += 0.015;
      if(!IS) adsA.pos.z += 0.06;
    } else if(optic === 'optic_2x') {
      const my=p0y+0.010;
      const riser=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.012,0.040), gl);
      riser.position.set(0, my-0.018, p0z-0.05); G.add(riser);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.015,0.11,8), gl);
      tube.position.set(0, my, p0z-0.05); tube.rotation.x = HPI; G.add(tube);
      const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.011,0.025,8), gm);
      obj.position.set(0, my, p0z-0.1); obj.rotation.x = HPI; G.add(obj);
      parts.opticSightY = my;
      gunEyepiece(G,0,my,p0z+.009,.0145);
      if(!IS) adsA.pos.y += 0.025;
      if(!IS) adsA.pos.z += 0.055;
    } else if(optic === 'optic_4x') {
      const my=p0y+0.012;
      const riser=new THREE.Mesh(new THREE.BoxGeometry(0.034,0.012,0.050), gl);
      riser.position.set(0, my-0.020, p0z-0.05); G.add(riser);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.019,0.14,8), gl);
      tube.position.set(0, my, p0z-0.05); tube.rotation.x = HPI; G.add(tube);
      const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.025,0.035,8), gm);
      obj.position.set(0, my, p0z-0.12); obj.rotation.x = HPI; G.add(obj);
      parts.opticSightY = my;
      gunEyepiece(G,0,my,p0z+.024,.0175);
      if(!IS) adsA.pos.y += 0.035;
      if(!IS) adsA.pos.z += 0.05;
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
      parts.opticSightY = p0y-0.002;
      if(!IS) adsA.pos.y += 0.028;
      if(!IS) adsA.pos.z += 0.05;
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

  // 爆闪手电: 与手电同槽位(互斥)。灯头明显更粗(大反光碗), 镜片更大更亮
  if(getModChoice(key, 'light') === 'light_strobe') {
    const tl = clamp(Math.abs(muzz.z) * 0.15, 0.042, 0.070);
    const rr = 0.0135 * (0.55 + 0.45 * tl / 0.070);
    const bx = -0.030, by = muzz.y + 0.012, bz = muzz.z + tl * 1.35 + 0.012;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 1.06, tl, 8), gm);
    tube.position.set(bx, by, bz); tube.rotation.x = HPI; G.add(tube);
    // 粗灯头 + 前端喇叭口 (爆闪灯的典型外形)
    const head = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.75, rr * 1.1, tl * 0.42, 10), gl);
    head.position.set(bx, by, bz - tl * 0.72); head.rotation.x = HPI; G.add(head);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.72, rr * 0.16, 6, 12), gl);
    rim.position.set(bx, by, bz - tl * 0.93); G.add(rim);
    // 散热槽
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.14, rr * 0.09, 5, 10), gl);
      fin.position.set(bx, by, bz - tl * (0.28 + i * 0.13)); G.add(fin);
    }
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.6, rr * 1.6, 0.005, 12),
      new THREE.MeshBasicMaterial({color:0x4a4740}));
    lens.position.set(bx, by, bz - tl * 0.95); lens.rotation.x = HPI; G.add(lens);
    parts.flashLens = lens;
  }

  // 激光指示器: 与手电同槽位(互斥)。筒身更短更细, 前端红色镜片 + 侧面拨杆开关
  if(getModChoice(key, 'light') === 'light_laser') {
    const tl = clamp(Math.abs(muzz.z) * 0.13, 0.032, 0.058);
    const rr = 0.0102 * (0.55 + 0.45 * tl / 0.058);
    const bx = -0.030, by = muzz.y + 0.012, bz = muzz.z + tl * 1.35 + 0.012;
    const body = new THREE.Mesh(new THREE.BoxGeometry(rr * 3.5, rr * 2.2, tl * 0.82), gm);
    body.position.set(bx, by, bz); G.add(body);
    const mount = new THREE.Mesh(new THREE.BoxGeometry(rr * 2.7, rr * 0.55, tl * 0.62), gl);
    mount.position.set(bx, by - rr * 1.25, bz + tl * 0.04); G.add(mount);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.05, rr * 0.18, 6, 10), gl);
    ring.position.set(bx, by, bz - tl * 0.4); G.add(ring);
    // 侧面拨杆开关 (和手电区分开)
    const sw = new THREE.Mesh(new THREE.BoxGeometry(rr * 0.55, rr * 0.8, rr * 0.55), gl);
    sw.position.set(bx + rr * 1.15, by + rr * 0.55, bz + tl * 0.22); G.add(sw);
    // 红色镜片: 颜色由 15c_flashlight 每帧控制亮/灭
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.0, rr * 1.0, 0.004, 10),
      new THREE.MeshBasicMaterial({color:0x5a2020}));
    lens.position.set(bx, by, bz - tl * 0.42); lens.rotation.x = HPI; G.add(lens);
    parts.laserLens = lens;
    parts.laserEmit = V3(bx, by, bz - tl * 0.44);
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
  } else if(mag === 'mag_drum' && mw) {
    // 弹鼓: 弹匣井下方一个扁圆柱
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.052,0.052,0.042,14), pk);
    drum.position.set(mw.x, mw.y - 0.085, mw.z); drum.rotation.z = HPI; G.add(drum);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.05,10), gl);
    hub.position.set(mw.x, mw.y - 0.085, mw.z); hub.rotation.z = HPI; G.add(hub);
  }

  // ---- 枪托: 以右手锚点为参考 (托在持握手之后), 只在机匣后方加装附件 ----
  const stk = getModChoice(key, 'stock');
  const rhA = parts.anchors && parts.anchors.rHand;
  if(rhA && stk && stk !== 'stock_standard') {
    const sz = rhA.pos.z + 0.18, sy = rhA.pos.y + 0.030;
    if(stk === 'stock_heavy') {
      // 厚重颊托 + 橡胶托底
      bx(gl, 0.036, 0.030, 0.13, 0, sy, sz, G);
      bx(pk, 0.044, 0.075, 0.030, 0, sy - 0.020, sz + 0.075, G);
    } else if(stk === 'stock_light') {
      // 镂空骨架: 两根细杆 + 细托底
      bx(gl, 0.010, 0.012, 0.16, -0.013, sy - 0.004, sz, G);
      bx(gl, 0.010, 0.012, 0.16,  0.013, sy - 0.004, sz, G);
      bx(pk, 0.034, 0.052, 0.020, 0, sy - 0.014, sz + 0.085, G);
    } else if(stk === 'stock_precision') {
      // 可调颊托 + 后支撑脚
      bx(gl, 0.038, 0.026, 0.15, 0, sy + 0.008, sz, G);
      bx(pk, 0.046, 0.085, 0.034, 0, sy - 0.020, sz + 0.082, G);
      cyl(gl, 0.006, 0.006, 0.09, 0, sy - 0.075, sz + 0.070, G, 0);   // rx=0 → 竖直
    }
  }

  // ---- 握把 (前握把): 以左手锚点为参考 (支撑手本来就握在护木这里) ----
  const gp = getModChoice(key, 'grip');
  const lhA = parts.anchors && parts.anchors.lHand;
  if(lhA && gp && gp !== 'grip_none') {
    const gx = lhA.pos.x, gy = lhA.pos.y - 0.012, gz = lhA.pos.z;
    if(gp === 'grip_vertical') {
      cyl(gl, 0.011, 0.011, 0.075, gx, gy - 0.045, gz, G, 0);          // rx=0 → 竖直
      bx(pk, 0.020, 0.014, 0.034, gx, gy - 0.008, gz, G);
    } else if(gp === 'grip_angled') {
      const ag = bx(gl, 0.018, 0.062, 0.030, gx, gy - 0.040, gz, G);
      ag.rotation.x = 0.42;
      bx(pk, 0.020, 0.012, 0.032, gx, gy - 0.006, gz, G);
    } else if(gp === 'grip_tactical') {
      cyl(gl, 0.013, 0.011, 0.045, gx, gy - 0.030, gz, G, 0);
      bx(pk, 0.024, 0.020, 0.046, gx, gy - 0.056, gz, G);
      bx(gl, 0.008, 0.010, 0.050, gx + 0.016, gy - 0.020, gz + 0.028, G);
    }
  }
}

// 改装外观显示名称 (部署界面)
function modDisplayName(key) {
  const parts = [];
  ['optic','muzzle','mag','stock','grip','gear','light'].forEach(s => {
    const mid = getModChoice(key, s);
    if(mid && mid !== 'optic_iron' && mid !== 'muzzle_standard' && mid !== 'mag_standard' && mid !== 'stock_standard' && mid !== 'grip_none' && mid !== 'gear_none' && mid !== 'light_none') {
      parts.push(ALL_MODS[mid].name);
    }
  });
  return parts.length ? parts.join(' · ') : '无改装';
}

// 改装总开销
function modTotalCost(key) {
  let total = 0;
  ['optic','muzzle','mag','stock','grip','gear','light'].forEach(s => {
    const mid = getModChoice(key, s);
    if(mid && ALL_MODS[mid].cost) total += ALL_MODS[mid].cost;
  });
  return total;
}
