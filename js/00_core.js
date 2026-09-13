'use strict';
const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const TAU=Math.PI*2, HPI=Math.PI/2;
const dampF=(cur,tgt,k,dt)=>lerp(tgt,cur,Math.exp(-k*dt));
const SETTINGS = { team:0, diff:1, quality:1, sens:1.0, vol:0.8,
// 基础视野(FOV): 徒步持枪时的相机 FOV, 默认 74。开镜 FOV 按同比例缩放, 所以改它不会改变开镜倍率。
fov:(function(){
try{
const v=parseFloat(localStorage.getItem('sf_fov'));
if(isFinite(v)) return clamp(v,60,100);
}catch(e){}
return 74;
})(),
adsToggle:(function(){ try{ return localStorage.getItem('sf_adsmode')==='toggle'; }catch(e){ return false; } })() };
// 历史基准: 徒步腰射 FOV 74 / 开镜默认 60, 两者的比值就是"开镜倍率", 设置里只允许改基准值。
const BASE_FOV_74=74;
const DIFF_TABLE = [
{ react:0.95, spreadMul:2.0, dmgMul:0.55, visMul:0.7, name:'新兵' },
{ react:0.65,  spreadMul:1.3, dmgMul:0.88, visMul:0.9, name:'老兵' },
{ react:0.42, spreadMul:0.8, dmgMul:1.15, visMul:1.2, name:'精英' },
];
