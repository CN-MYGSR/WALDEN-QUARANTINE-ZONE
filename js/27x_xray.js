// ===== X光击杀回放 (战雷风格): 载具炮弹命中载具时, 右上角重放 发射→飞行→击中→击穿 =====
'use strict';
const xrayCv=document.getElementById('xrayCv');
const xrayCtx=xrayCv.getContext('2d');
let xray=null, xrayT=0;

function xrayTrigger(s,hitP,pen,victimNm){
 const rec=s.rec;
 if(!rec||rec.length<2) return;
 xray={
  sh:s.owner&&s.owner.isPlayer?'你':(s.owner&&s.owner.name?s.owner.name:'?'),
  vi:victimNm,
  pts:rec,
  hitP:hitP.clone(),
  pen:!!pen,
 };
 xrayT=0;
 xrayCv.style.display='block';
}
function drawTankX(ctx,x,baseY,ang,col,alpha,inner){
 const L=56, trH=11, H=21, trW=32;
 ctx.save();
 ctx.translate(x,baseY);
 ctx.strokeStyle=col; ctx.lineWidth=1.6; ctx.globalAlpha=alpha;
 ctx.beginPath();
 ctx.rect(-L/2,-H,L,trH);
 ctx.rect(-L/2,-H-trH,L,trH);
 ctx.moveTo(-trW/2,-H-trH); ctx.lineTo(-trW/2+5,-H-trH-11); ctx.lineTo(trW/2-5,-H-trH-11); ctx.lineTo(trW/2,-H-trH);
 ctx.stroke();
 if(inner){
  ctx.fillStyle=inner;
  ctx.beginPath();
  ctx.arc(-10,-H-trH-5,2.2,0,7);
  ctx.arc(6,-H-trH-5,2.2,0,7);
  ctx.arc(14,-H-4,3,0,7);
  ctx.fill();
 }
 ctx.save();
 ctx.translate(0,-H-trH-8);
 ctx.rotate(ang);
 ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(32,0); ctx.stroke();
 ctx.restore();
 ctx.restore();
}
function updateXray(dt){
 if(!xray) return;
 xrayT+=dt;
 const X=xray;
 const dur=2.7;
 if(xrayT>=dur){ xray=null; xrayCv.style.display='none'; return; }
 const W=xrayCv.width, H=xrayCv.height, ctx=xrayCtx;
 ctx.clearRect(0,0,W,H);
 ctx.fillStyle='rgba(6,12,24,.88)';
 ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='rgba(90,170,255,.35)'; ctx.lineWidth=1;
 ctx.strokeRect(0.5,0.5,W-1,H-1);
 ctx.fillStyle='#8fd0ff'; ctx.font='bold 12px "Microsoft YaHei","Segoe UI",sans-serif';
 ctx.textAlign='left';
 ctx.fillText('X 光回放',10,20);
 ctx.fillStyle='#ccc'; ctx.font='11px "Microsoft YaHei","Segoe UI",sans-serif';
 ctx.fillText(X.sh+' → '+X.vi,10,36);
 const f=X.pts[0], l=X.pts[X.pts.length-1];
 const dX=l.x-f.x, dZ=l.z-f.z;
 const D=Math.hypot(dX,dZ)||1;
 const ux=dX/D, uz=dZ/D;
 const groundY=Math.min(f.y,l.y);
 const scale=Math.min(300/D,3.6);
 const baseX=78, baseY=H-52;
 const xOf=p=>baseX+(p.x-f.x)*ux*scale+(p.z-f.z)*uz*scale;
 const yOf=p=>baseY-(p.y-groundY)*scale;
 const hitX=xOf(X.hitP), hitY=yOf(X.hitP);
 const tgtX=clamp(hitX,150,W-30);
 ctx.strokeStyle='rgba(255,255,255,.10)'; ctx.lineWidth=1;
 ctx.beginPath(); ctx.moveTo(baseX-30,baseY); ctx.lineTo(tgtX+30,baseY); ctx.stroke();
 ctx.strokeStyle='rgba(255,225,130,.35)'; ctx.lineWidth=1.2; ctx.beginPath();
 for(let i=0;i<X.pts.length;i++){ const p=X.pts[i]; if(i===0) ctx.moveTo(xOf(p),yOf(p)); else ctx.lineTo(xOf(p),yOf(p)); }
 ctx.stroke();
 const shAng=Math.atan2(l.y-f.y,D);
 drawTankX(ctx,baseX+8,baseY,shAng,'rgba(110,195,255,.9)',0.95,null);
 const pen=X.pen;
 const viAng=Math.atan2(f.y-l.y,-D);
 drawTankX(ctx,tgtX-8,baseY,viAng,pen?'rgba(255,130,80,.95)':'rgba(190,200,215,.9)',pen?0.95:0.6,pen?'rgba(255,170,70,.8)':'rgba(255,255,255,.35)');
 const tFly=clamp((l.t-f.t)*0.45,0.5,1.0);
 if(xrayT<tFly){
  const pt=(xrayT/tFly)*(l.t-f.t)+f.t;
  let seg=0;
  while(seg<X.pts.length-2&&X.pts[seg+1].t<pt) seg++;
  const p0=X.pts[seg], p1=X.pts[seg+1];
  const a=(pt-p0.t)/((p1.t-p0.t)||1);
  const px=lerp(p0.x,p1.x,a), py=lerp(p0.y,p1.y,a), pz=lerp(p0.z,p1.z,a);
  const hx=xOf({x:px,y:py,z:pz}), hy=yOf({x:px,y:py,z:pz});
  ctx.beginPath(); ctx.arc(hx,hy,5.5,0,7); ctx.fillStyle='rgba(255,224,102,.35)'; ctx.fill();
  ctx.beginPath(); ctx.arc(hx,hy,2.8,0,7); ctx.fillStyle='#ffe066'; ctx.fill();
 } else {
  const ht=xrayT-tFly;
  const k2=clamp(1-ht/0.4,0,1);
  ctx.strokeStyle='rgba(255,190,80,'+(0.9*k2).toFixed(3)+')'; ctx.lineWidth=2;
  for(let i2=0;i2<10;i2++){
   const an=i2/10*Math.PI*2, rr=6+(16+10*(1-k2))*Math.random()*0.7;
   ctx.beginPath(); ctx.moveTo(hitX+Math.cos(an)*6,hitY+Math.sin(an)*6); ctx.lineTo(hitX+Math.cos(an)*rr,hitY+Math.sin(an)*rr); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(hitX,hitY,4+6*(1-k2),0,7); ctx.fillStyle='rgba(255,240,180,'+(0.9*k2).toFixed(3)+')'; ctx.fill();
  if(ht>=0.22){
   if(pen){
    ctx.fillStyle='rgba(255,150,60,'+(0.25+0.18*Math.sin(nowT*14)).toFixed(3)+')';
    ctx.fillRect(tgtX-8-27,baseY-32,54,32);
   }
   ctx.font='bold 24px "Microsoft YaHei","Segoe UI",sans-serif';
   ctx.textAlign='center';
   ctx.shadowColor='rgba(0,0,0,.85)'; ctx.shadowBlur=6;
   ctx.fillStyle=pen?'#ffb347':'#ff8f6b';
   ctx.fillText(pen?'击穿!':'弹开',tgtX,baseY-138);
   ctx.shadowBlur=0;
  }
 }
 ctx.fillStyle='rgba(255,255,255,.15)';
 ctx.fillRect(10,H-8,(W-20)*Math.min(xrayT,dur)/dur,3);
}
