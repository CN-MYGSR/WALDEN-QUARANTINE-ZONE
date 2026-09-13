import io
p = r'D:/Escape from TakeFu/js/07c_buildings.js'
src = io.open(p, encoding='utf-8').read()
reps = []

# --- 公寓: 西墙破口移出内隔断位置(原 z=0 与隔断冲突), 窗位重排 ---
reps.append((
"_cqbWallOpen(MAT.plaster,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[0],[1.9],[d*0.32,-d*0.32],1.4,wallGs);   // 西侧落地破口(中间大开口)",
"_cqbWallOpen(MAT.plaster,L,ry,'z',-w/2,-d/2,d/2,g0,fh,t,[d*0.5],[1.9],[-d*0.3,-d*0.78],1.4,wallGs);   // 西侧落地破口(前室) + 后室两窗"))

# --- 公寓: 家具只靠西墙, 不侵入走廊/井道通道 ---
reps.append((
"""_cqbFurniture(L,ry,w,d,g0,[
[-w*0.3,IZ*0.55,0,'wood'],[w*0.22,IZ*0.62,0,'sand'],
[-w*0.32,-IZ*0.6,0,'metal'],[(cwX+ceX)/2,-IZ*0.35,0,'sand'],
[shX0-0.75,shZ1+0.55,0,'wood']
]);""",
"""_cqbFurniture(L,ry,w,d,g0,[
[-IX+0.85,IZ*0.5,0,'wood'],[-IX+0.9,-IZ*0.55,0,'metal'],
[-IX+0.8,0.15,0,'sand'],[-IX+0.85,-IZ*0.85,0,'wood']
]);"""))

reps.append((
"""_cqbFurniture(L,ry,w,d,by,[
[-w*0.3,IZ*0.5,0,'wood'],[w*0.3,-IZ*0.55,0,'metal'],
[cwX-0.9,-IZ*0.3,0,'sand']
]);""",
"""_cqbFurniture(L,ry,w,d,by,[
[-IX+0.85,IZ*0.45,0,'wood'],[-IX+0.9,-IZ*0.5,0,'metal'],
[-IX+0.8,0.1,0,'sand']
]);"""))

# --- 联排窄楼: 家具原坐标落在楼梯井内 ---
reps.append((
"""_cqbFurniture(L,ry,w,d,g0,[
[-w*0.22,pz+1.5,0,'wood'],[w*0.22,pz+1.2,0,'sand'],
[-w*0.2,pz-1.6,0,'metal']
]);""",
"""_cqbFurniture(L,ry,w,d,g0,[
[-IX+0.75,IZ*0.5,0,'wood'],[-IX+0.7,-IZ*0.6,0,'metal'],
[-IX+0.8,IZ*0.78,0,'sand']
]);"""))

reps.append((
"""_cqbFurniture(L,ry,w,d,by,[
[-w*0.2,pz+1.4,0,'wood'],[w*0.24,pz-1.5,0,'sand']
]);""",
"""_cqbFurniture(L,ry,w,d,by,[
[-IX+0.75,IZ*0.45,0,'wood'],[-IX+0.7,-IZ*0.55,0,'sand']
]);"""))

# --- 商铺: 货架全部贴西墙, 避开后仓门与井道出口 ---
reps.append((
"""_cqbFurniture(L,ry,w,d,g0,[
[-w*0.3,IZ*0.35,0,'wood'],[w*0.05,IZ*0.2,0,'wood'],[-w*0.1,-IZ*0.2,0,'metal'],
[-w*0.3,-IZ*0.68,0,'sand'],[shX0-0.8,shZ1+0.5,0,'wood']
]);""",
"""_cqbFurniture(L,ry,w,d,g0,[
[-IX+0.9,IZ*0.35,0,'wood'],[-IX+0.95,IZ*0.62,0,'wood'],
[-IX+0.9,-IZ*0.5,0,'metal'],[-IX+0.85,-IZ*0.78,0,'sand']
]);"""))

reps.append((
"""_cqbFurniture(L,ry,w,d,by,[
[-w*0.28,IZ*0.3,0,'wood'],[w*0.1,-IZ*0.3,0,'metal']
]);""",
"""_cqbFurniture(L,ry,w,d,by,[
[-IX+0.9,IZ*0.3,0,'wood'],[-IX+0.9,-IZ*0.35,0,'metal']
]);"""))

for old, new in reps:
    n = src.count(old)
    assert n == 1, 'expect 1 occurrence, got %d for:\n%s' % (n, old[:90])
    src = src.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('OK  applied %d replacements' % len(reps))
