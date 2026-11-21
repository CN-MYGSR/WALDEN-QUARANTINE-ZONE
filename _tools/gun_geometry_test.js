// node _tools/gun_geometry_test.js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../vendor/three.min.js');
const faction = {sleeve:0x404040, coat:0x454545, pants:0x404040, helm:0x474747, skin:0x80634e};
const ctx = vm.createContext({
  THREE, HPI:Math.PI/2, V3:(x,y,z)=>new THREE.Vector3(x,y,z),
  clamp:(x,min,max)=>Math.min(Math.max(x,min),max), TEAM_FACTION:[faction,faction], FACTIONS:{},
  localStorage:{getItem:()=>null,setItem(){}}, texRng:()=>()=>0.5,
  makeTex:()=>new THREE.Texture(), svgTex:()=>new THREE.Texture()
});
for(const file of ['13_weapons_data','14_gunmodels','14b_weapon_mods','16_soldier']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),ctx,{filename:file+'.js'});
}
const {defs,era} = vm.runInContext('({defs:WPN_DEFS,era:ARSENAL_ERA})',ctx);
let peakMeshes=0,peakTriangles=0;
for(const [key,def] of Object.entries(defs)){
  const p=ctx.buildGunModel(key);
  assert.ok(Number.isFinite(p.anchors.ads.pos.lengthSq()+p.muzzle.lengthSq()),key+' anchor');
  let meshes=0,triangles=0;
  p.gun.traverse(o=>{
    if(!o.isMesh) return;
    const geo=o.geometry;
    assert.ok(geo.attributes.position.array.every(Number.isFinite),key+' vertices');
    assert.ok(geo.attributes.normal.array.every(Number.isFinite),key+' normals');
    assert.equal(o.material.map,null,key+' material must be texture-free');
    meshes++; triangles+=(geo.index||geo.attributes.position).count/3;
  });
  assert.ok(meshes>0,key);
  peakMeshes=Math.max(meshes,peakMeshes); peakTriangles=Math.max(triangles,peakTriangles);
  if(p.slide) assert.equal(p.slide.position.z,p.slide.userData.z0,key+' animated slide origin');
  if(def.scoped) assert.ok(p.gun.userData.scopeLens,key+' integral lens');
  const world=ctx.worldGunModel(ctx.gunKindOf(key),0,key);
  if(def.pistol||era[key]==='modern'){
    assert.equal(world.children.length,1,key+' world mesh count');
    assert.equal(world.children[0].material.vertexColors,true,key+' world finishes');
  }
}
for(const [key,optic] of [['m4','optic_2x'],['awm','optic_4x'],['kar98zf','optic_4x']]){
  ctx.setModChoice(key,'optic',optic);
  const gun=ctx.buildGunModel(key).gun;
  const eye=gun.userData.scopeLens;
  assert.ok(eye,key+' lens');
  gun.updateMatrixWorld(true);
  const origin=eye.pos.clone(); origin.z+=.15;
  const ray=new THREE.Raycaster(origin,new THREE.Vector3(0,0,-1));
  const visible=o=>o&&o.visible&&(o.parent?visible(o.parent):true);
  assert.ok(!ray.intersectObject(gun,true).some(h=>visible(h.object)&&h.point.z>eye.pos.z+.0002),key+' eye relief');
  ray.ray.origin.x+=eye.r*1.06;
  assert.ok(ray.intersectObject(gun,true).some(h=>Math.abs(h.point.z-eye.pos.z)<eye.r*.10),key+' lens rim');
}
console.log(Object.keys(defs).length+' weapon models, built-in and attached eyepieces passed. Max '+
  peakMeshes+' meshes / '+peakTriangles+' triangles in a default view model.');
