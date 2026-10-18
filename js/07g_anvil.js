'use strict';
// =====================================================================
// 铁砧 (ANVIL) —— 剧情模式专用地图构建
//   ① layoutAnvilYard()  地表「铁砧外围」: 工业堆场 + 钻井塔 + 竖井口   (mapSize 210)
//   ② layoutAnvilB2()    地下「铁砧 B2」: 封存冷库 + 生物制剂区 + 升降机 (mapSize 170)
// 加载位置: 07f_airport 之后 / 08_world 之前 —— buildWorld() 会按 CAMPAIGN.layout 调用。
// ---------------------------------------------------------------------
// ⚠️ 本文件**大量复用**既有构建助手, 注意它们参数顺序不同:
//    portWallRun(cx,cz,len,ry,h,t,mat,g0)     ← mat 在前
//    labWallRun (cx,cz,len,ry,h,t,g0,mat)     ← g0 在前  (两者相反!)
//    labWallDoor(cx,cz,len,ry,h,t,g0,mat,doorW)
//    labCeilSlab(cx,cz,w,d,y) / labLamp(x,z,y,ry,mat,w) / labFloorMark(x,z,w,d,mat)
//    portContainer(x,z,ry,levels,tint) / portCrane(x,z) / portShed(x,z,w,d)
//    portWarehouse(x,z,w,d,ry) / portOffice(x,z,ry) / portTankFarm(x,z)
//    apPave(x,z,w,d,y,mat) / apLightMast(x,z,h) / apFence(x1,z1,x2,z2,mat)
// ⚠️ 散落物必须避开建筑与出生/撤离安全区 (portInBuilding / cqbInSafe), 否则会堵死通道。
// =====================================================================

const ANVIL_DOOR=3.4;    // 门洞净宽
const ANVIL_H=4.4;       // 地下净高
const ANVIL_T=0.45;      // 隔断厚

// ---------- 通用小件 ----------
// 钢构立柱 (钻井塔 / 管廊支架)
function anvilPillar(x,z,h,t,mat){
  solidBox(mat||MAT.metalDark,t,h,t,x,h/2,z,0);
}
// 一段管廊: 两根立柱 + 顶上一根横管
function anvilPipeRack(x,z,len,ry,h){
  const ax=ry===0?1:0, az=ry===0?0:1;
  const o=len/2-0.6;
  anvilPillar(x-ax*o,z-az*o,h,0.34);
  anvilPillar(x+ax*o,z+az*o,h,0.34);
  const g=new THREE.CylinderGeometry(0.19,0.19,len,8); g.rotateZ(HPI);
  mesh(g,MAT.metal,x,h+0.25,z,ry,true,false);
  const g2=new THREE.CylinderGeometry(0.13,0.13,len,8); g2.rotateZ(HPI);
  mesh(g2,MAT.metalDark,x,h+0.62,z,ry,true,false);
}
// 竖井口: 一个下沉的方形井 + 护栏 (纯视觉, 不做真实垂直通道)
function anvilShaftMouth(x,z){
  const g0=heightAt(x,z);
  // 井壁
  solidBox(MAT.concreteBarrier,7.6,0.5,0.6,x,g0+0.25,z-3.5,0);
  solidBox(MAT.concreteBarrier,7.6,0.5,0.6,x,g0+0.25,z+3.5,0);
  solidBox(MAT.concreteBarrier,0.6,0.5,7.6,x-3.5,g0+0.25,z,0);
  solidBox(MAT.concreteBarrier,0.6,0.5,7.6,x+3.5,g0+0.25,z,0);
  // 井内黑洞 (低亮度平面, 让人一眼看出"这里通地下")
  const hole=new THREE.Mesh(new THREE.PlaneGeometry(6.4,6.4),new THREE.MeshBasicMaterial({color:0x05070a,fog:false}));
  hole.rotation.x=-HPI; hole.position.set(x,g0+0.06,z); world.add(hole);
  // 护栏立柱 + 横杆
  for(const [dx,dz] of [[-3.2,-3.2],[3.2,-3.2],[-3.2,3.2],[3.2,3.2]]) anvilPillar(x+dx,z+dz,1.1,0.12,MAT.metal);
  solidBox(MAT.metal,7.0,0.09,0.09,x,g0+1.05,z-3.2,0);
  solidBox(MAT.metal,7.0,0.09,0.09,x,g0+1.05,z+3.2,0);
  solidBox(MAT.metal,0.09,0.09,7.0,x-3.2,g0+1.05,z,0);
  solidBox(MAT.metal,0.09,0.09,7.0,x+3.2,g0+1.05,z,0);
  // 警示牌 + 状态灯
  mesh(new THREE.BoxGeometry(1.5,0.6,0.12),MAT.labHazard,x,g0+1.5,z-3.5,0,false,false);
  mesh(new THREE.BoxGeometry(0.34,0.34,0.34),MAT.labAmber,x+3.2,g0+1.45,z-3.2,0,false,false);
}

// ---------- ① 铁砧外围 (地表工业堆场) ----------
function layoutAnvilYard(){
  const E=MAP_EDGE;               // 97
  // ---- 1) 铺装地面 (盖住草皮) ----
  apPave(0,0,E*2+16,E*2+16,0.04,MAT.stone);
  apPave(0,0,E*2-4,17,0.06,MAT.woodDark);      // 中央主通道
  apPave(0,0,17,E*2-4,0.06,MAT.woodDark);
  // ---- 2) 外围墙 (北侧留 14m 缺口 = 剧情入口) ----
  portWallRun(0,-E,E*2,0,4.6,1.4,MAT.portConcrete,0);
  portWallRun(0, E,E*2,0,4.6,1.4,MAT.portConcrete,0);
  portWallRun(-E,0,E*2,HPI,4.6,1.4,MAT.portConcrete,0);
  portWallRun( E,0,E*2,HPI,4.6,1.4,MAT.portConcrete,0);
  // 缺口两侧的门柱
  anvilPillar(-7,-E,5.4,0.6,MAT.metal); anvilPillar(7,-E,5.4,0.6,MAT.metal);
  mesh(new THREE.BoxGeometry(14,0.7,0.3),MAT.labHazard,0,-E+0.2,5.9,0,false,false);

  // ---- 3) 中央钻井塔 + 竖井口 ----
  {
    const g0=heightAt(0,0);
    // 四根主腿 (向上收拢一点, 像井架)
    for(const [dx,dz] of [[-3.4,-3.4],[3.4,-3.4],[-3.4,3.4],[3.4,3.4]])
      solidBox(MAT.metalDark,0.5,13,0.5,dx,g0+6.5,dz,0);
    // 四层平台 (留出中心, 不遮住井口)
    for(let i=0;i<4;i++){
      const y=g0+3.2+i*3.0;
      const s=8.4-i*0.5;
      solidBox(MAT.metal,s,0.16,1.1,-3.2,y,0,0);   // 西侧环
      solidBox(MAT.metal,s,0.16,1.1, 3.2,y,0,0);   // 东侧环
      solidBox(MAT.metal,1.1,0.16,s-2.2,0,y,-3.2,0);
      solidBox(MAT.metal,1.1,0.16,s-2.2,0,y, 3.2,0);
      // 平台之间的斜撑
      if(i<3){ solidBox(MAT.metalDark,0.16,3.0,0.16,-3.4,y+1.5,-3.4,0); solidBox(MAT.metalDark,0.16,3.0,0.16,3.4,y+1.5,3.4,0); }
    }
    // 顶部吊臂 + 天轮
    solidBox(MAT.metalDark,0.4,0.4,10.5,0,g0+13.4,2.2,0);
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,0.3,12),MAT.metal);
    wheel.rotation.z=HPI; wheel.position.set(0,g0+13.0,6.8); world.add(wheel);
    // 井口
    anvilShaftMouth(0,0);
    // 塔顶状态灯 (剧情地标: 远处就能看见)
    mesh(new THREE.BoxGeometry(0.5,0.5,0.5),MAT.labWarn,0,g0+13.9,-2.6,0,false,false);
  }

  // ---- 4) 厂房 / 仓库 / 办公 ----
  portWarehouse(-62,-58,46,32,0);      // 西北大厂房
  portShed(62,-58,42,30);              // 东北棚厂
  portOffice(60,56,0);                 // 东南调度楼
  portTankFarm(-62,56);                // 西南储罐区

  // ---- 5) 集装箱掩体 (成列, 避开建筑与安全区) ----
  const spots=[
    [-34,-20,0],[-34,-8,0],[-34,4,0],[-34,16,0],
    [ 34,-20,0],[ 34,-8,0],[ 34,4,0],[ 34,16,0],
    [-18,34,HPI],[ -6,34,HPI],[ 6,34,HPI],[ 18,34,HPI],
    [-18,-40,0],[ 18,-40,0],[ 0,-62,HPI],[ 0,62,HPI],
  ];
  for(const [x,z,ry] of spots){
    if(portInBuilding(x,z,3.2)||cqbInSafe(x,z,4)) continue;
    portContainer(x,z,ry,1+(Math.random()<0.3?1:0),0);
  }

  // ---- 6) 管廊 / 隔离墩 / 照明 ----
  anvilPipeRack(-40,0,26,0,4.2);
  anvilPipeRack( 40,0,26,0,4.2);
  anvilPipeRack(0,-46,26,HPI,4.0);
  for(let i=0;i<10;i++){
    const x=rand(-E+14,E-14), z=rand(-E+14,E-14);
    if(portInBuilding(x,z,2.4)||cqbInSafe(x,z,3)) continue;
    solidBox(MAT.concreteBarrier,rand(1.6,3.0),0.8,0.7,x,heightAt(x,z)+0.4,z,rand(0,3));
  }
  for(const [x,z] of [[-E+10,-E+10],[E-10,-E+10],[-E+10,E-10],[E-10,E-10],[0,-E+8]])
    apLightMast(x,z,11);
  // 起重机 (龙门吊) 两座
  portCrane(-30,-86); portCrane(30,-86);

  // ---- 7) 剧情地标: 竖井口前的地面标识 ----
  labFloorMark(0,10,9,0.6,MAT.labAmber);
  labFloorMark(0,-10,9,0.6,MAT.labAmber);
  labFloorMark(10,0,0.6,9,MAT.labAmber);
  labFloorMark(-10,0,0.6,9,MAT.labAmber);
}

// ---------- ② 铁砧 B2 (地下封存层) ----------
function layoutAnvilB2(){
  const E=MAP_EDGE;               // 77
  const H=ANVIL_H, T=ANVIL_T;
  // ---- 1) 整浇底板 ----
  {
    const s=MAP_SIZE-6;
    const g=new THREE.PlaneGeometry(s,s); g.rotateX(-HPI);
    const floor=new THREE.Mesh(g,MAT.labFloor);
    floor.position.set(0,0.05,0); floor.receiveShadow=true; floor.renderOrder=0;
    world.add(floor);
  }
  // ---- 2) 外周墙 (四边不留门) + 内墙灯带 ----
  {
    const L=E*2+2;
    labWallRun(0,-E,L,0,7.0,1.6,0,MAT.labWall);
    labWallRun(0, E,L,0,7.0,1.6,0,MAT.labWall);
    labWallRun(-E,0,L,HPI,7.0,1.6,0,MAT.labWall);
    labWallRun( E,0,L,HPI,7.0,1.6,0,MAT.labWall);
    for(let t=-E+8;t<E-8;t+=12){
      mesh(new THREE.BoxGeometry(1.4,0.12,0.12),MAT.labGreen,t,3.5,-E+0.9,0,false,false);
      mesh(new THREE.BoxGeometry(1.4,0.12,0.12),MAT.labGreen,t,3.5, E-0.9,0,false,false);
      mesh(new THREE.BoxGeometry(0.12,0.12,1.4),MAT.labGreen,-E+0.9,3.5,t,0,false,false);
      mesh(new THREE.BoxGeometry(0.12,0.12,1.4),MAT.labGreen, E-0.9,3.5,t,0,false,false);
    }
  }
  // ---- 3) 全层顶板 ----
  labCeilSlab(0,0,(E+2)*2,(E+2)*2,H+0.16);

  // ---- 4) 中央十字大厅 (比实验室窄, 更压抑) ----
  const HW=7;                     // 大厅半宽 7m
  {
    labFloorMark(0,0,15,E*2-20,MAT.labSlabA);
    labFloorMark(0,0,13,E*2-24,MAT.labSlabB);
    labFloorMark(0,0,E*2-20,15,MAT.labSlabA);
    labFloorMark(0,0,E*2-24,13,MAT.labSlabB);
    // 承重柱
    for(let t=-60;t<=60;t+=20){
      if(Math.abs(t)<HW+3) continue;
      labColumn(-(HW-1.4),t); labColumn(HW-1.4,t);
      labColumn(t,-(HW-1.4)); labColumn(t,HW-1.4);
    }
    // 顶部主管道
    labPipeRun(0,-(E-8),0,E-8,3.8);
    labPipeRun(-5.2,-(E-8),-5.2,E-8,4.0);
    labPipeRun( 5.2,-(E-8), 5.2,E-8,4.0);
    labPipeRun(-(E-8),0,E-8,0,3.9);
  }

  // ---- 5) 四象限房间: 每象限 2×2 = 16 间 (隔断带门洞) ----
  //    象限中心 (±39,±39), 每间 26×26, 走 4.5m 走廊
  const QS=[[-1,-1],[1,-1],[-1,1],[1,1]];
  const ROOM_KIND=['实验区','隔离舱','机房','仓储','办公','安保','动力间','医疗'];
  let roomIdx=0;
  for(const [sx,sz] of QS){
    // 象限内的两道隔断 (形成 2×2)
    for(const t of [-26,26]){
      labWallDoor(sx*39,sz*39+t,52,0,H,T,0,MAT.labWall,ANVIL_DOOR);   // 横向隔断
      labWallDoor(sx*39+t,sz*39,52,HPI,H,T,0,MAT.labWall,ANVIL_DOOR); // 纵向隔断
    }
    // 象限外墙 (把象限与大厅隔开, 每边留一个门)
    const qe=sx*39, qz=sz*39;
    labWallDoor(qe, qz-52*(sz<0?1:-1),52,0,H,T,0,MAT.labWall,ANVIL_DOOR);
    labWallDoor(qe-52*(sx<0?1:-1), qz,52,HPI,H,T,0,MAT.labWall,ANVIL_DOOR);
    // 房间陈设
    for(const [rx,rz] of [[-13,-13],[13,-13],[-13,13],[13,13]]){
      const x=qe+rx, z=qz+rz;
      const kind=ROOM_KIND[roomIdx++%ROOM_KIND.length];
      labLamp(x,z-9,H-0.3,0,MAT.labLamp,1.8);
      if(kind==='实验区'){ labBench(x-3,z,0); labBench(x+3,z,0); labTube(x,z-5); }
      else if(kind==='隔离舱'){ labCell(x-6,z-6,0); labCell(x+6,z+6,0); }
      else if(kind==='机房'){ for(let i=0;i<3;i++) labRack(x-5+i*5,z-4,0); }
      else if(kind==='仓储'){ for(let i=0;i<4;i++) labCrate(x-6+(i%2)*8,z-5+Math.floor(i/2)*9,rand(0,3),1); labRack(x+7,z+5,HPI); }
      else if(kind==='办公'){ labLocker(x-6,z+5,0,3); labBench(x+4,z-4,HPI); }
      else if(kind==='安保'){ labLocker(x,z-7,0,4); labCrate(x+6,z+6,0,1); }
      else if(kind==='动力间'){ labTank(x-5,z-4,1.5,2.6); labTank(x+5,z-4,1.5,2.6); labPipeRun(x-8,z+6,x+8,z+6,3.4); }
      else { labBench(x,z,0); labLocker(x+7,z-6,HPI,2); }
      if(Math.random()<0.5) labBarrel(x+rand(-8,8),z+rand(-8,8));
    }
  }

  // ---- 6) 北端: 封存冷库 (剧情核心) + 升降机舱 (撤离点) ----
  {
    // 冷库: 一个贯通大厅北端的大房间
    labWallDoor(0,-46,52,HPI,H,T,0,MAT.labWall,ANVIL_DOOR+1.0);
    labWallDoor(-26,-58,26,0,H,T,0,MAT.labWall,ANVIL_DOOR);
    labWallDoor( 26,-58,26,0,H,T,0,MAT.labWall,ANVIL_DOOR);
    labFloorMark(0,-58,44,20,MAT.labSlabB);
    for(let i=0;i<6;i++){
      const x=-18+(i%3)*18, z=-64+Math.floor(i/3)*12;
      labTank(x,z,1.9,3.4);
      mesh(new THREE.BoxGeometry(0.5,0.5,0.5),MAT.labBio,x,3.9,z,0,false,false);
    }
    labLamp(-12,-58,H-0.3,0,MAT.labLampCold,2.4);
    labLamp( 12,-58,H-0.3,0,MAT.labLampCold,2.4);
    mesh(new THREE.BoxGeometry(2.6,0.7,0.14),MAT.labHazard,0,-50.6,0,false,false);
    mesh(new THREE.BoxGeometry(0.4,0.4,0.4),MAT.labWarn,22,-46,0,false,false);
    mesh(new THREE.BoxGeometry(0.4,0.4,0.4),MAT.labWarn,-22,-46,0,false,false);
  }
  {
    // 升降机舱 (撤离点 0,66)
    labWallDoor(0,66,26,HPI,H,T,0,MAT.labWall,ANVIL_DOOR+0.8);
    labFloorMark(0,66,16,16,MAT.labSlabA);
    for(const [dx,dz] of [[-5,-5],[5,-5],[-5,5],[5,5]])
      solidBox(MAT.labTrim,0.5,4.2,0.5,dx,2.1,66+dz,0);
    labLamp(0,62,H-0.3,0,MAT.labGreen,3.2);
    labLamp(0,70,H-0.3,0,MAT.labGreen,3.2);
    mesh(new THREE.BoxGeometry(9,0.2,9),MAT.labPanel,0,0.12,66,0,false,true);
  }

  // ---- 7) 东西入口区 (双方出生点) ----
  for(const s of [-1,1]){
    labFloorMark(s*66,0,16,16,MAT.labSlabB);
    labLamp(s*66,-4,H-0.3,0,MAT.labLamp,2.0);
    labLamp(s*66, 4,H-0.3,0,MAT.labLamp,2.0);
    for(const dz of [-6,6]) labLocker(s*72,dz,0,2);
  }

  // ---- 8) 散落杂物 (避开出生/撤离安全区) ----
  for(let i=0;i<14;i++){
    const x=rand(-(E-14),E-14), z=rand(-(E-14),E-14);
    if(cqbInSafe(x,z,3)) continue;
    if(Math.random()<0.5) labCrate(x,z,rand(0,3),0.9); else labBarrel(x,z);
  }
}
