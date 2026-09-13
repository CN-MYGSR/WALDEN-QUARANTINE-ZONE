import io
P = r'D:/Escape from TakeFu/js/07c_buildings.js'
s = io.open(P, encoding='utf-8').read()
a = """const push=(o,def,kind)=>{
const c=(o&&typeof o==='object')?o.c:o, w=(o&&typeof o==='object'&&o.w)?o.w:def;
if(c>a0+w*0.5&&c<a1-w*0.5) ops.push({c,w,kind});
};"""
b = """const push=(o,def,kind)=>{
const obj=(o&&typeof o==='object');
const c=obj?o.c:o, w=(obj&&o.w)?o.w:def, nav=!(obj&&o.nav===false);
if(c>a0+w*0.5&&c<a1-w*0.5) ops.push({c,w,kind,nav});
};"""
assert s.count(a) == 1
s = s.replace(a, b)
a2 = """const q=(axis==='x')?L(o.c,at):L(at,o.c);
NAV_CLEARS.push({x:q[0],z:q[1],r:Math.min(2.4,Math.max(1.0,o.w*0.5+0.5))});"""
b2 = """if(o.nav!==false){
const q=(axis==='x')?L(o.c,at):L(at,o.c);
NAV_CLEARS.push({x:q[0],z:q[1],r:Math.min(2.4,Math.max(1.0,o.w*0.5+0.5))});
}"""
assert s.count(a2) == 1
s = s.replace(a2, b2)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('nav:false 支持已加入')
