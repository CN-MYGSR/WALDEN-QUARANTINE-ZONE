'use strict';
const WPN_DEFS = {
garand:   { name:'M1 加兰德', mode:'半自动', type:'semi', snd:'rifle', dmg:36, headMul:2.4, rpm:300, mag:8, reserve:80, reload:2.4, spreadHip:2.2, spreadAds:0.14, recoil:1.35, recSide:0.35, adsFov:52, kick:0.075, enbloc:true, tracer:3 },
thompson: { name:'汤普森 M1A1', mode:'全自动', type:'auto', snd:'smg', dmg:21, headMul:1.8, rpm:680, mag:30, reserve:150, reload:2.5, spreadHip:3.4, spreadAds:0.85, recoil:0.55, recSide:0.4, adsFov:56, kick:0.045, tracer:4 },
bar:      { name:'勃朗宁 BAR', mode:'全自动', type:'auto', snd:'mg', dmg:31, headMul:1.9, rpm:480, mag:20, reserve:100, reload:3.0, spreadHip:3.8, spreadAds:0.55, recoil:0.95, recSide:0.55, adsFov:54, kick:0.06, tracer:3 },
springfield:{ name:'春田 M1903A4', mode:'栓动 · 4x', type:'bolt', snd:'sniper', dmg:96, headMul:2.5, rpm:50, mag:5, reserve:40, reload:3.4, spreadHip:5, spreadAds:0.02, recoil:2.6, recSide:0.5, adsFov:20, kick:0.12, scoped:true, boltT:1.05, tracer:1 },
m1911:    { name:'柯尔特 M1911', mode:'半自动', type:'semi', snd:'pistol', dmg:26, headMul:2.0, rpm:420, mag:7, reserve:35, reload:1.9, spreadHip:2.6, spreadAds:0.5, recoil:0.8, recSide:0.4, adsFov:60, kick:0.05, pistol:true, tracer:2 },
kar98:    { name:'毛瑟 Kar98k', mode:'栓动', type:'bolt', snd:'sniper', dmg:88, headMul:2.5, rpm:52, mag:5, reserve:50, reload:3.2, spreadHip:4.5, spreadAds:0.08, recoil:2.4, recSide:0.45, adsFov:48, kick:0.11, boltT:1.0, tracer:1 },
kar98zf:  { name:'Kar98k ZF41', mode:'栓动 · 4x', type:'bolt', snd:'sniper', dmg:96, headMul:2.5, rpm:50, mag:5, reserve:40, reload:3.4, spreadHip:5, spreadAds:0.02, recoil:2.6, recSide:0.5, adsFov:20, kick:0.12, scoped:true, boltT:1.05, tracer:1 },
mp40:     { name:'MP40', mode:'全自动', type:'auto', snd:'smg', dmg:20, headMul:1.8, rpm:560, mag:32, reserve:160, reload:2.6, spreadHip:3.0, spreadAds:0.75, recoil:0.45, recSide:0.35, adsFov:56, kick:0.04, tracer:4 },
stg44:    { name:'STG 44', mode:'全自动', type:'auto', snd:'rifle', dmg:27, headMul:1.9, rpm:550, mag:30, reserve:120, reload:2.8, spreadHip:3.2, spreadAds:0.4, recoil:0.7, recSide:0.45, adsFov:54, kick:0.05, tracer:3 },
p38:      { name:'瓦尔特 P38', mode:'半自动', type:'semi', snd:'pistol', dmg:24, headMul:2.0, rpm:430, mag:8, reserve:40, reload:1.9, spreadHip:2.6, spreadAds:0.5, recoil:0.75, recSide:0.4, adsFov:60, kick:0.05, pistol:true, tracer:2 },
m1903:    { name:'春田 M1903', mode:'栓动', type:'bolt', snd:'sniper', dmg:80, headMul:2.4, rpm:54, mag:5, reserve:50, reload:3.2, spreadHip:4.5, spreadAds:0.1, recoil:2.3, recSide:0.45, adsFov:50, kick:0.1, boltT:0.95, tracer:1 },
// 已移除: bazooka(巴祖卡) / schreck(坦克杀手) —— 火箭筒类对局内平衡破坏过大, 见 2026-09-13 需求
// ---- 苏军 ----
mosin:    { name:'莫辛-纳甘 M91/30', mode:'栓动', type:'bolt', snd:'sniper', dmg:88, headMul:2.5, rpm:50, mag:5, reserve:50, reload:3.3, spreadHip:4.5, spreadAds:0.08, recoil:2.5, recSide:0.45, adsFov:48, kick:0.11, boltT:1.05, tracer:1 },
mosinpu:  { name:'莫辛-纳甘 PU', mode:'栓动 · 3.5x', type:'bolt', snd:'sniper', dmg:96, headMul:2.5, rpm:48, mag:5, reserve:40, reload:3.5, spreadHip:5, spreadAds:0.02, recoil:2.6, recSide:0.5, adsFov:21, kick:0.12, scoped:true, boltT:1.1, tracer:1 },
ppsh:     { name:'波波沙 PPSh-41', mode:'全自动', type:'auto', snd:'smg', dmg:19, headMul:1.8, rpm:900, mag:71, reserve:213, reload:3.4, spreadHip:3.6, spreadAds:0.95, recoil:0.5, recSide:0.42, adsFov:56, kick:0.04, wg:'drum', tracer:5 },
dp28:     { name:'捷格加廖夫 DP-28', mode:'全自动', type:'auto', snd:'mg', dmg:30, headMul:1.9, rpm:520, mag:47, reserve:141, reload:4.2, spreadHip:4.0, spreadAds:0.55, recoil:0.9, recSide:0.5, adsFov:54, kick:0.06, wg:'pan', tracer:3 },
tt33:     { name:'托卡列夫 TT-33', mode:'半自动', type:'semi', snd:'pistol', dmg:25, headMul:2.0, rpm:430, mag:8, reserve:40, reload:1.8, spreadHip:2.6, spreadAds:0.5, recoil:0.78, recSide:0.4, adsFov:60, kick:0.05, pistol:true, tracer:2 },
// 已移除: ptrd(PTRD-41 反坦克枪)
// ---- 日军 ----
arisaka:  { name:'三八式步枪', mode:'栓动', type:'bolt', snd:'sniper', dmg:82, headMul:2.5, rpm:54, mag:5, reserve:50, reload:3.1, spreadHip:4.2, spreadAds:0.07, recoil:2.2, recSide:0.4, adsFov:48, kick:0.1, boltT:0.95, tracer:1 },
type97s:  { name:'九七式狙击枪', mode:'栓动 · 4x', type:'bolt', snd:'sniper', dmg:92, headMul:2.5, rpm:50, mag:5, reserve:40, reload:3.4, spreadHip:5, spreadAds:0.02, recoil:2.4, recSide:0.5, adsFov:20, kick:0.11, scoped:true, boltT:1.05, tracer:1 },
type100:  { name:'一〇〇式冲锋枪', mode:'全自动', type:'auto', snd:'smg', dmg:19, headMul:1.8, rpm:520, mag:30, reserve:150, reload:2.6, spreadHip:3.1, spreadAds:0.8, recoil:0.42, recSide:0.35, adsFov:56, kick:0.04, tracer:4 },
type96:   { name:'九六式轻机枪', mode:'全自动', type:'auto', snd:'mg', dmg:28, headMul:1.9, rpm:540, mag:30, reserve:150, reload:3.2, spreadHip:3.8, spreadAds:0.5, recoil:0.85, recSide:0.5, adsFov:54, kick:0.055, wg:'topmag', tracer:3 },
nambu:    { name:'南部十四年式', mode:'半自动', type:'semi', snd:'pistol', dmg:22, headMul:2.0, rpm:420, mag:8, reserve:40, reload:1.9, spreadHip:2.5, spreadAds:0.5, recoil:0.7, recSide:0.35, adsFov:60, kick:0.045, pistol:true, tracer:2 },
// 已移除: type97at(九七式自动炮)
// ---- 国军 ----
zhongzheng:{ name:'中正式步骑枪', mode:'栓动', type:'bolt', snd:'sniper', dmg:86, headMul:2.5, rpm:52, mag:5, reserve:50, reload:3.2, spreadHip:4.5, spreadAds:0.08, recoil:2.4, recSide:0.45, adsFov:48, kick:0.11, boltT:1.0, tracer:1 },
zhongzhengs:{ name:'中正式(狙击)', mode:'栓动 · 4x', type:'bolt', snd:'sniper', dmg:94, headMul:2.5, rpm:50, mag:5, reserve:40, reload:3.4, spreadHip:5, spreadAds:0.02, recoil:2.5, recSide:0.5, adsFov:20, kick:0.12, scoped:true, boltT:1.05, tracer:1 },
mp18:     { name:'花机关 MP18', mode:'全自动', type:'auto', snd:'smg', dmg:20, headMul:1.8, rpm:500, mag:32, reserve:160, reload:2.9, spreadHip:3.2, spreadAds:0.85, recoil:0.48, recSide:0.4, adsFov:56, kick:0.04, wg:'sidemag', tracer:4 },
zb26:     { name:'捷克式 ZB-26', mode:'全自动', type:'auto', snd:'mg', dmg:31, headMul:1.9, rpm:500, mag:20, reserve:120, reload:3.1, spreadHip:3.8, spreadAds:0.5, recoil:0.92, recSide:0.5, adsFov:54, kick:0.06, wg:'topmag', tracer:3 },
c96:      { name:'驳壳枪 C96', mode:'半自动', type:'semi', snd:'pistol', dmg:24, headMul:2.0, rpm:440, mag:10, reserve:50, reload:2.2, spreadHip:2.7, spreadAds:0.5, recoil:0.7, recSide:0.42, adsFov:58, kick:0.05, pistol:true, tracer:2 },
// 已移除: boys(博伊斯反坦克枪)
// ---- 八路军 ----
hanyang:  { name:'汉阳造八八式', mode:'栓动', type:'bolt', snd:'sniper', dmg:78, headMul:2.4, rpm:50, mag:5, reserve:45, reload:3.4, spreadHip:5.0, spreadAds:0.12, recoil:2.3, recSide:0.5, adsFov:48, kick:0.1, boltT:1.05, tracer:1 },
c96auto:  { name:'快慢机(盒子炮)', mode:'全自动', type:'auto', snd:'smg', dmg:21, headMul:1.9, rpm:620, mag:20, reserve:120, reload:2.4, spreadHip:3.8, spreadAds:0.95, recoil:0.6, recSide:0.55, adsFov:56, kick:0.05, wg:'c96a', tracer:4 },
type11:   { name:'歪把子(缴获)', mode:'全自动', type:'auto', snd:'mg', dmg:27, headMul:1.9, rpm:480, mag:30, reserve:120, reload:3.8, spreadHip:4.2, spreadAds:0.6, recoil:0.9, recSide:0.55, adsFov:54, kick:0.055, wg:'hopper', tracer:3 },
mortar:   { name:'轻型迫击炮', mode:'曲射支援', type:'semi', snd:'cannon', dmg:30, headMul:1, rpm:16, mag:1, reserve:16, reload:3.2, spreadHip:3, spreadAds:2.5, recoil:1.4, recSide:0.4, adsFov:62, kick:0.12, mortar:true, tracer:1 },
// ---- 支援兵种自卫武器 (弱化型) ----
m1carb:   { name:'M1 卡宾枪', mode:'半自动', type:'semi', snd:'smg', dmg:22, headMul:1.9, rpm:340, mag:15, reserve:75, reload:2.2, spreadHip:2.8, spreadAds:0.55, recoil:0.6, recSide:0.35, adsFov:56, kick:0.04, model:'garand', tracer:3 },
g33:      { name:'G33/40 骑枪', mode:'栓动', type:'bolt', snd:'sniper', dmg:60, headMul:2.2, rpm:48, mag:5, reserve:35, reload:3.4, spreadHip:5.2, spreadAds:0.22, recoil:2.2, recSide:0.5, adsFov:50, kick:0.1, boltT:1.15, model:'kar98', tracer:1 },
m38carb:  { name:'莫辛 M38 骑枪', mode:'栓动', type:'bolt', snd:'sniper', dmg:62, headMul:2.2, rpm:46, mag:5, reserve:35, reload:3.5, spreadHip:5.4, spreadAds:0.24, recoil:2.3, recSide:0.5, adsFov:50, kick:0.1, boltT:1.2, model:'mosin', tracer:1 },
// ---- 芬兰军 ----
finmosin: { name:'芬兰莫辛 M/28-30', mode:'栓动', type:'bolt', snd:'sniper', dmg:88, headMul:2.5, rpm:50, mag:5, reserve:50, reload:3.3, spreadHip:4.4, spreadAds:0.07, recoil:2.45, recSide:0.45, adsFov:48, kick:0.11, boltT:1.0, model:'mosin', tracer:1 },
finmosins:{ name:'莫辛 M/28-76 狙', mode:'栓动 · 3.5x', type:'bolt', snd:'sniper', dmg:96, headMul:2.5, rpm:48, mag:5, reserve:40, reload:3.5, spreadHip:5, spreadAds:0.02, recoil:2.6, recSide:0.5, adsFov:21, kick:0.12, scoped:true, boltT:1.08, model:'mosinpu', tracer:1 },
suomi:    { name:'索米 KP/-31', mode:'全自动', type:'auto', snd:'smg', dmg:20, headMul:1.8, rpm:850, mag:71, reserve:213, reload:3.3, spreadHip:3.2, spreadAds:0.85, recoil:0.48, recSide:0.38, adsFov:56, kick:0.04, wg:'drum', model:'ppsh', tracer:4 },
ls26:     { name:'拉蒂 M/26 轻机枪', mode:'全自动', type:'auto', snd:'mg', dmg:30, headMul:1.9, rpm:500, mag:20, reserve:100, reload:3.4, spreadHip:3.9, spreadAds:0.55, recoil:0.9, recSide:0.5, adsFov:54, kick:0.06, wg:'topmag', model:'type96', tracer:3 },
// 已移除: l39(拉蒂 L-39 反坦克枪)
l35:      { name:'拉蒂 L-35', mode:'半自动', type:'semi', snd:'pistol', dmg:24, headMul:2.0, rpm:430, mag:8, reserve:40, reload:1.9, spreadHip:2.6, spreadAds:0.5, recoil:0.76, recSide:0.4, adsFov:60, kick:0.05, pistol:true, model:'tt33', tracer:2 },
type38c:  { name:'三八式骑枪', mode:'栓动', type:'bolt', snd:'sniper', dmg:58, headMul:2.2, rpm:50, mag:5, reserve:35, reload:3.3, spreadHip:5.2, spreadAds:0.22, recoil:2.0, recSide:0.45, adsFov:50, kick:0.09, boltT:1.1, model:'arisaka', tracer:1 },
laotao:   { name:'老套筒(汉阳早期)', mode:'栓动', type:'bolt', snd:'sniper', dmg:54, headMul:2.1, rpm:44, mag:5, reserve:30, reload:3.7, spreadHip:5.8, spreadAds:0.3, recoil:2.2, recSide:0.55, adsFov:50, kick:0.1, boltT:1.25, model:'hanyang', tracer:1 },
// ---- 现代 2000-2020 ----
m4:      { name:'M4 卡宾枪', mode:'全自动', type:'auto', snd:'rifle', dmg:26, headMul:1.9, rpm:760, mag:30, reserve:150, reload:2.4, spreadHip:2.8, spreadAds:0.32, recoil:0.7, recSide:0.42, adsFov:54, kick:0.05, tracer:3 },
g36c:    { name:'G36C 紧凑型', mode:'全自动', type:'auto', snd:'rifle', dmg:25, headMul:1.9, rpm:700, mag:30, reserve:150, reload:2.4, spreadHip:2.9, spreadAds:0.35, recoil:0.72, recSide:0.42, adsFov:54, kick:0.05, tracer:3 },
m24:     { name:'M24 狙击步枪', mode:'栓动 · 4x', type:'bolt', snd:'sniper', dmg:96, headMul:2.5, rpm:50, mag:5, reserve:40, reload:3.4, spreadHip:5, spreadAds:0.02, recoil:2.6, recSide:0.5, adsFov:20, kick:0.12, scoped:true, boltT:1.05, tracer:1 },
g28:     { name:'G28 半自动', mode:'半自动 · 3x', type:'semi', snd:'sniper', dmg:68, headMul:2.2, rpm:160, mag:20, reserve:80, reload:2.8, spreadHip:4.0, spreadAds:0.05, recoil:1.5, recSide:0.4, adsFov:30, kick:0.09, scoped:true, tracer:1 },
mp5:     { name:'MP5 冲锋枪', mode:'全自动', type:'auto', snd:'smg', dmg:20, headMul:1.8, rpm:800, mag:30, reserve:180, reload:2.2, spreadHip:2.6, spreadAds:0.55, recoil:0.4, recSide:0.3, adsFov:56, kick:0.04, tracer:4 },
// 已移除: at4(AT4) / pf3(铁拳3) —— 火箭筒类
p320:    { name:'SIG P320', mode:'半自动', type:'semi', snd:'pistol', dmg:26, headMul:2.0, rpm:440, mag:17, reserve:68, reload:2.0, spreadHip:2.6, spreadAds:0.5, recoil:0.8, recSide:0.4, adsFov:60, kick:0.05, pistol:true, tracer:2 },
 g17:     { name:'格洛克 G17', mode:'半自动', type:'semi', snd:'pistol', dmg:24, headMul:2.0, rpm:450, mag:17, reserve:68, reload:2.0, spreadHip:2.7, spreadAds:0.5, recoil:0.75, recSide:0.4, adsFov:60, kick:0.05, pistol:true, tracer:2 },
 // ============ 俄制 2000-2020 ============
 ak74m:   { name:'AK-74M', mode:'全自动', type:'auto', snd:'rifle', dmg:27, headMul:1.9, rpm:650, mag:30, reserve:150, reload:2.5, spreadHip:3.0, spreadAds:0.34, recoil:0.75, recSide:0.45, adsFov:54, kick:0.05, tracer:3 },
 svd:     { name:'SVD 德拉贡诺夫', mode:'半自动 · 4x', type:'semi', snd:'sniper', dmg:72, headMul:2.2, rpm:150, mag:10, reserve:60, reload:2.9, spreadHip:4.2, spreadAds:0.04, recoil:1.6, recSide:0.45, adsFov:28, kick:0.1, scoped:true, tracer:1 },
 pp19:    { name:'PP-19 勇士', mode:'全自动', type:'auto', snd:'smg', dmg:21, headMul:1.8, rpm:750, mag:30, reserve:180, reload:2.3, spreadHip:2.7, spreadAds:0.5, recoil:0.42, recSide:0.32, adsFov:56, kick:0.04, tracer:4 },
 // 已移除: rpg7(RPG-7 火箭筒)
  pyat:    { name:'MP-443 乌鸦', mode:'半自动', type:'semi', snd:'pistol', dmg:25, headMul:2.0, rpm:440, mag:18, reserve:72, reload:2.0, spreadHip:2.7, spreadAds:0.5, recoil:0.76, recSide:0.4, adsFov:60, kick:0.05, pistol:true, tracer:2 },
};
// ---------- BF7 / BF8 武器库：轻量聚合入口 ----------
const ARSENAL_ERA={
 garand:'ww2', thompson:'ww2', bar:'ww2', springfield:'ww2', m1911:'ww2', kar98:'ww2', kar98zf:'ww2',
 mp40:'ww2', stg44:'ww2', p38:'ww2', m1903:'ww2',
 mosin:'ww2', mosinpu:'ww2', ppsh:'ww2', dp28:'ww2', tt33:'ww2',
 arisaka:'ww2', type97s:'ww2', type100:'ww2', type96:'ww2', nambu:'ww2',
 zhongzheng:'ww2', zhongzhengs:'ww2', mp18:'ww2', zb26:'ww2', c96:'ww2',
 hanyang:'ww2', c96auto:'ww2', type11:'ww2', mortar:'ww2', m1carb:'ww2', g33:'ww2',
 m38carb:'ww2', finmosin:'ww2', finmosins:'ww2', suomi:'ww2', ls26:'ww2',
 l35:'ww2', type38c:'ww2', laotao:'ww2',
 m4:'modern', g36c:'modern', m24:'modern', g28:'modern', mp5:'modern',
 p320:'modern', g17:'modern', ak74m:'modern', svd:'modern', pp19:'modern', pyat:'modern'
};
// 过滤 &&WPN_DEFS[k]: 已移除的武器(火箭筒/反坦克枪)若仍残留在 ARSENAL_ERA 里,
// 下游 initMenuUI 直接读 d.name 会整页崩溃 —— 这里兜底剔除不存在的武器
const ARSENAL_SETS=[
 { id:'ww2', name:'BF7 · 二战兵器', keys:Object.keys(ARSENAL_ERA).filter(k=>ARSENAL_ERA[k]==='ww2'&&WPN_DEFS[k]) },
 { id:'modern', name:'BF8 · 现代兵器', keys:Object.keys(ARSENAL_ERA).filter(k=>ARSENAL_ERA[k]==='modern'&&WPN_DEFS[k]) }
];
let PLAYER_ARSENAL_KEY=(()=>{
 try {
   const k=localStorage.getItem('bf_arsenal_key')||'m4';
   return WPN_DEFS[k]?k:'m4';
 } catch(e){ return 'm4'; }
})();
const CLASSES=[
{ name:'突击兵', nades:2, smoke:1 },
{ name:'狙击手', nades:1, smoke:1 },
{ name:'医疗兵', nades:2, smoke:2 },
{ name:'反坦克兵', nades:4, atn:3, smoke:0 },
{ name:'工程兵', nades:1, smoke:1, deploy:'build' },
];;
const CLS_POOL=[0,0,0,0,1,1,2,2,2,3,3,3,4,4];
// ===== 枪械专用 SVG 纹理: 细腻木纹 / 发蓝钢 / 磷化钢 / 胶木 =====
TEX.gunwood=(function(){
const R=texRng(201); let grain='';
for(let i=0;i<34;i++){
const y=R()*128;
grain+=`<path d="M0 ${y.toFixed(1)} C 32 ${(y+(R()-0.5)*7).toFixed(1)}, 96 ${(y+(R()-0.5)*7).toFixed(1)}, 128 ${(y+(R()-0.5)*10).toFixed(1)}" stroke="rgba(66,44,24,${(0.25+R()*0.3).toFixed(2)})" stroke-width="${(0.5+R()*0.9).toFixed(1)}" fill="none"/>`;
}
grain+=`<ellipse cx="${(30+R()*70).toFixed(0)}" cy="${(R()*128).toFixed(0)}" rx="4" ry="7" fill="rgba(52,32,16,.5)"/>`;
const body=`<defs>${svgGrain('gwn','0.5 0.04','3',7)}</defs>`+
`<rect width="128" height="128" fill="#7a5a34"/>`+grain+
`<rect width="128" height="128" filter="url(#gwn)" opacity="0.22" style="mix-blend-mode:multiply"/>`;
return svgTex(128,128,body,1,1,'#7a5a34');
})();
TEX.gunwoodD=(function(){
const R=texRng(211); let grain='';
for(let i=0;i<30;i++){
const y=R()*128;
grain+=`<path d="M0 ${y.toFixed(1)} C 40 ${(y+(R()-0.5)*8).toFixed(1)}, 90 ${(y+(R()-0.5)*8).toFixed(1)}, 128 ${(y+(R()-0.5)*11).toFixed(1)}" stroke="rgba(38,24,12,${(0.3+R()*0.3).toFixed(2)})" stroke-width="${(0.6+R()*1).toFixed(1)}" fill="none"/>`;
}
const body=`<defs>${svgGrain('gwdn','0.5 0.05','3',9)}</defs>`+
`<rect width="128" height="128" fill="#573e22"/>`+grain+
`<rect width="128" height="128" filter="url(#gwdn)" opacity="0.24" style="mix-blend-mode:multiply"/>`;
return svgTex(128,128,body,1,1,'#573e22');
})();
TEX.blued=(function(){
const R=texRng(221); let wear='';
for(let i=0;i<10;i++){
wear+=`<line x1="${(R()*128).toFixed(0)}" y1="${(R()*128).toFixed(0)}" x2="${(R()*128).toFixed(0)}" y2="${(R()*128).toFixed(0)}" stroke="rgba(150,155,160,${(0.06+R()*0.1).toFixed(2)})" stroke-width="0.7"/>`;
}
const body=`<defs>${svgGrain('bln','0.04 0.5','3',5)}</defs>`+
`<rect width="128" height="128" fill="#25282b"/>`+
`<rect width="128" height="128" filter="url(#bln)" opacity="0.12" style="mix-blend-mode:screen"/>`+wear;
return svgTex(128,128,body,1,1,'#25282b');
})();
TEX.park=(function(){
const R=texRng(231); let wear='';
for(let i=0;i<8;i++){
wear+=`<circle cx="${(R()*128).toFixed(0)}" cy="${(R()*128).toFixed(0)}" r="${(1+R()*2.4).toFixed(1)}" fill="rgba(120,124,116,${(0.1+R()*0.14).toFixed(2)})"/>`;
}
const body=`<defs>${svgGrain('pkn','0.7','2',15)}</defs>`+
`<rect width="128" height="128" fill="#3d423c"/>`+
`<rect width="128" height="128" filter="url(#pkn)" opacity="0.14" style="mix-blend-mode:overlay"/>`+wear;
return svgTex(128,128,body,1,1,'#3d423c');
})();
const vmMats = {
wood: new THREE.MeshLambertMaterial({map:TEX.gunwood}),
woodD: new THREE.MeshLambertMaterial({map:TEX.gunwoodD}),
gun: new THREE.MeshLambertMaterial({map:TEX.blued}),
gunL: new THREE.MeshLambertMaterial({color:0x44484a}),
park: new THREE.MeshLambertMaterial({map:TEX.park}),
bakelite: new THREE.MeshLambertMaterial({color:0x6b3f26}),
brass: new THREE.MeshLambertMaterial({color:0xb89440}),
sleeve0: new THREE.MeshLambertMaterial({color:0x4d5240}),
sleeve1: new THREE.MeshLambertMaterial({color:0x4a4d52}),
skin: new THREE.MeshLambertMaterial({color:0xc09878}),
nade: new THREE.MeshLambertMaterial({color:0x3a4232}),
};
vmMats.sleeve0.color.set(TEAM_FACTION[0].sleeve);
vmMats.sleeve1.color.set(TEAM_FACTION[1].sleeve);

// =====================================================================
// CQB 平衡补丁 (阴暗街区战役)
// ---------------------------------------------------------------------
// 设计目标: 让 5~40m 的近距交火成为绝对主导, 同时削弱狙击枪在
// 高湿度 / 低光照环境下的远距离统治力。
//
//   近战武器 (半自动/全自动/手枪/冲锋枪类) : 伤害 +20% ~ +40%
//   狙击类   (栓动 / 半自动狙击)            : 伤害衰减 + 精度衰减 + 开镜变慢
//   反器材/火箭筒/迫击炮                      : 不动 (它们是结构破坏工具, 不是对枪武器)
//
// 说明: 该补丁在武器数据定义完成后、任何射击逻辑读取之前执行,
//       因此运行时读到的始终是已平衡后的数值。
// =====================================================================
const CQB_BALANCE=(()=>{
// ---- 近战伤害倍率表: 按武器定位细分档位 ----
const NEAR_MUL={
  smg:1.40,      // 冲锋枪: 街道/室内主力, 提升最大
  pistol:1.34,   // 手枪: 狭窄空间反应快, 给足回报
  auto:1.30,     // 全自动步枪/轻机枪: 稳定提升
  semi:1.24,     // 半自动步枪: 略低 (射程仍占优)
};
// ---- 狙击削弱: 伤害衰减 / 精度衰减 / 开镜时间加成(秒) ----
const SNIPER={
  dmgMul:0.72,        // 伤害 -28%: 一枪难秒满血, 迫使补枪/换位
  adsSpreadMul:2.6,   // 开镜散布 ×2.6: 远距离首发不中
  hipSpreadMul:1.35,  // 腰射散布 ×1.35
  adsTimeAdd:0.42,    // 开镜额外 +0.42s: 遭遇战来不及架枪
  recoilMul:1.15,     // 后坐力 +15%: 连狙更难压
};
const applied=[];
for(const key in WPN_DEFS){
const md=WPN_DEFS[key];
if(md.rocket||md.mortar||md.atRifle) continue;   // 结构破坏类不参与对枪平衡
const isSniper = md.snd==='sniper' && (md.type==='bolt' || md.scoped || md.type==='semi'&&md.dmg>=60);
const isNear   = !isSniper && NEAR_MUL[md.type]!=null;
md.cqbBase=(md.cqbBase==null)?{dmg:md.dmg, spreadAds:md.spreadAds, spreadHip:md.spreadHip, recoil:md.recoil}:md.cqbBase;
if(isSniper){
md.dmg      = Math.round(md.cqbBase.dmg*SNIPER.dmgMul);
md.spreadAds= +(md.cqbBase.spreadAds*SNIPER.adsSpreadMul).toFixed(3);
md.spreadHip= +(md.cqbBase.spreadHip*SNIPER.hipSpreadMul).toFixed(2);
md.recoil   = +(md.cqbBase.recoil*SNIPER.recoilMul).toFixed(2);
md.adsTime  = (md.adsTime||0.28) + SNIPER.adsTimeAdd;   // 开镜时间(供射击逻辑读取)
md.cqbNerf  = true;
applied.push(key+':sniper');
}else if(isNear){
md.dmg      = Math.round(md.cqbBase.dmg*NEAR_MUL[md.type]);
md.cqbBuff  = true;
applied.push(key+':near');
}
}
return {nearMul:NEAR_MUL, sniper:SNIPER, applied};
})();
// 供 UI / 调试展示
const CQB_NOTE='CQB 平衡已应用: 近战武器伤害 +24%~40%, 狙击枪伤害 -28% / 开镜 +0.42s / 散布大幅衰减';
