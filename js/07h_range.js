// ===== 室内靶场 =====
// 36m 长 × 18m 宽 × 4.8m 高的封闭靶道。射击线在 z=12.5，靶位从 2m 到 30m（z = 12.5 - d）。
// 靶子本身由 61_range.js 在部署后生成（要动/要算命中），这里只搭场地。
'use strict';

function layoutRange(){
  const E=MAP_EDGE;
  const W=18, Z0=-20, Z1=16, H=4.8;
  const cz=(Z0+Z1)/2, LEN=Z1-Z0;      // cz=-2, LEN=36

  // ---- 1) 地面: 整张图铺装, 靶道铺木地板 ----
  apPave(0,0,E*2,E*2,0.02,MAT.stone);
  apPave(0,cz,W,LEN,0.06,MAT.stone);          // 浅色石材地面 (深色木地板在室内看着像黑洞)

  // ---- 2) 四面墙 (solidBox → 同时挡子弹与人) ----
  portWallRun(-W/2,cz,LEN,HPI,H,0.6,MAT.portConcrete,0);
  portWallRun( W/2,cz,LEN,HPI,H,0.6,MAT.portConcrete,0);
  portWallRun(0,Z0,W+1.2,0,H,0.8,MAT.portConcrete,0);   // 靶区后墙
  portWallRun(0,Z1,W+1.2,0,H,0.8,MAT.portConcrete,0);   // 入口墙

  // ---- 3) 天花板: ⚠️ 只能用 mesh, 不能用 solidBox ----
  // solidBox 会把整片区域写进 OCC(2D 栅格) → findFreeSpawn 认为整个靶道都被堵住 → 玩家可能生成在场外
  {
    const ceil=mesh(new THREE.BoxGeometry(W+1.2,0.3,LEN+1.2),MAT.labSlabA,0,H+0.15,cz,0,false,true);
    if(ceil) ceil.receiveShadow=true;
  }

  // ---- 4) 射击线与距离标线 ----
  mesh(new THREE.BoxGeometry(W-1,0.04,0.35),MAT.labHazard,0,0.09,12.5,0,false,false);
  for(const d of [5,10,15,20,25,30]){
    mesh(new THREE.BoxGeometry(W-1.6,0.03,0.10),MAT.labHazard,0,0.085,12.5-d,0,false,false);
  }

  // ---- 5) 射击台 (两条) ----
  for(const x of [-5.4,5.4]){
    solidBox(MAT.woodDark,3.4,0.92,0.72,x,0.46,13.7,0);
    solidBox(MAT.metalDark,0.12,0.06,0.72,x-1.5,0.95,13.7,0);
    solidBox(MAT.metalDark,0.12,0.06,0.72,x+1.5,0.95,13.7,0);
  }

  // ---- 6) 靶区挡弹墙: 沙袋堆 (低矮, 不挡视线) ----
  for(let x=-7.6;x<=7.6;x+=2.0){
    solidBox(MAT.sandbag,1.85,1.15,1.0,x,0.58,Z0+1.1,0);
  }
  // 后墙上的吸弹软垫
  for(let x=-6;x<=6;x+=3){
    mesh(new THREE.BoxGeometry(2.6,2.6,0.12),MAT.labSlabA,x,2.0,Z0+0.55,0,false,false);
  }

  // ---- 7) 顶部灯带 + 实际照明 ----
  // ⚠️ 靶场是封闭盒子: 阳光被四面墙挡住, 只靠半球光会黑得看不清靶子。
  //    这里既放自发光灯板(MeshBasic 不受光照, 永远亮), 也放几盏点光源真正照亮地面。
  const lampMat=new THREE.MeshBasicMaterial({color:0xfff3d6});
  for(const z of [13.5,7,-0.5,-8,-15.5]){
    mesh(new THREE.BoxGeometry(13,0.10,0.55),lampMat,0,H-0.22,z,0,false,false);
    mesh(new THREE.BoxGeometry(1.4,0.06,0.55),lampMat,-7.2,H-0.22,z,0,false,false);
    mesh(new THREE.BoxGeometry(1.4,0.06,0.55),lampMat, 7.2,H-0.22,z,0,false,false);
  }
  for(const z of [11,2,-7,-16]){
    const pl=new THREE.PointLight(0xfff0d2,1.5,34,1.7);
    pl.position.set(0,H-0.55,z);
    scene.add(pl);
  }

  // ---- 8) 侧墙吸音板 (纯装饰) ----
  for(let z=-16;z<=12;z+=4){
    for(const sx of [-W/2+0.12,W/2-0.12]){
      mesh(new THREE.BoxGeometry(0.10,1.5,2.6),MAT.labGreen,sx,2.4,z,0,false,false);
    }
  }

  // ---- 9) 入口小桌 (放装备/提示) ----
  solidBox(MAT.woodDark,2.2,0.85,0.8,-6.6,0.43,15.0,0);
  solidBox(MAT.woodDark,2.2,0.85,0.8, 6.6,0.43,15.0,0);
  mesh(new THREE.BoxGeometry(2.4,0.06,1.0),MAT.labHazard,-6.6,0.88,15.0,0,false,false);
  mesh(new THREE.BoxGeometry(2.4,0.06,1.0),MAT.labHazard, 6.6,0.88,15.0,0,false,false);
}
