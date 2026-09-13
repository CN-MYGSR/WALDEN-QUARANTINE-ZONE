import io
P = r'D:/Escape from TakeFu/js/07c_buildings.js'
s = io.open(P, encoding='utf-8').read()
reps = []

# 1) _cqbWallOpen: 开口支持 {c,w} 对象形式(同一面墙可混用不同宽度的门), 并给 NAV_CLEARS 半径设上限
reps.append((
"""const dw=doorW||CQB_DW, ww=winW||1.4;
const ops=[];
for(const c of (doors||[])) if(c>a0+dw*0.5&&c<a1-dw*0.5) ops.push({c,w:dw,kind:'door'});
for(const c of (wins||[]))  if(c>a0+ww*0.5&&c<a1-ww*0.5) ops.push({c,w:ww,kind:'win'});""",
"""const dw=doorW||CQB_DW, ww=winW||1.4;
const ops=[];
const push=(o,def,kind)=>{
const c=(o&&typeof o==='object')?o.c:o, w=(o&&typeof o==='object'&&o.w)?o.w:def;
if(c>a0+w*0.5&&c<a1-w*0.5) ops.push({c,w,kind});
};
for(const o of (doors||[])) push(o,dw,'door');
for(const o of (wins||[]))  push(o,ww,'win');"""))

reps.append((
"""const q=(axis==='x')?L(o.c,at):L(at,o.c);
NAV_CLEARS.push({x:q[0],z:q[1],r:Math.max(1.0,dw*0.5+0.5)});""",
"""const q=(axis==='x')?L(o.c,at):L(at,o.c);
NAV_CLEARS.push({x:q[0],z:q[1],r:Math.min(2.4,Math.max(1.0,o.w*0.5+0.5))});"""))

# 2) _cqbStairShaft: 增加 axis 参数(可沿局部 X 上行), 供大跨仓库/库房使用
reps.append((
"""function _cqbStairShaft(L,ry,shaft,y0,y1,mat){
const cx=(shaft.x0+shaft.x1)/2, cz=(shaft.z0+shaft.z1)/2;
const runW=shaft.x1-shaft.x0, runL=shaft.z1-shaft.z0;
stairFlight(mat, L(cx,cz)[0], L(cx,cz)[1], ry, runW, runL, y0, y1);
return {hole:{x0:shaft.x0,x1:shaft.x1,z0:shaft.z0,z1:shaft.z1}, shaft};
}""",
"""function _cqbStairShaft(L,ry,shaft,y0,y1,mat,axis){
const cx=(shaft.x0+shaft.x1)/2, cz=(shaft.z0+shaft.z1)/2;
let runW,runL,ryP;
if(axis==='x'){ runW=shaft.z1-shaft.z0; runL=shaft.x1-shaft.x0; ryP=ry+HPI; }
else          { runW=shaft.x1-shaft.x0; runL=shaft.z1-shaft.z0; ryP=ry; }
stairFlight(mat, L(cx,cz)[0], L(cx,cz)[1], ryP, runW, runL, y0, y1);
return {hole:{x0:shaft.x0,x1:shaft.x1,z0:shaft.z0,z1:shaft.z1}, shaft, axis:axis||'z'};
}"""))

for a, b in reps:
    assert s.count(a) == 1, 'count=%d for %r' % (s.count(a), a[:70])
    s = s.replace(a, b)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('07c patched: %d' % len(reps))
