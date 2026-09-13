import io
P = r'D:/Escape from TakeFu/js/07e_port.js'
src = io.open(P, encoding='utf-8').read()
new = io.open(r'D:/Escape from TakeFu/_tools/_new_port_block.js', encoding='utf-8').read()
START = '// 开敞式仓库棚: 立柱 + 屋面 + 两侧山墙, 前后通透 → 天然的穿行掩体与搜刮点'
END = '// 油罐区: 圆柱形储罐 + 管道 + 围堰'
i = src.find(START); j = src.find(END)
assert i >= 0, 'start not found'
assert j > i, 'end not found'
old = src[i:j]
for must in ['function portShed', 'function portWarehouse', 'function portOffice']:
    assert must in old, must
out = src[:i] + new + '\n' + src[j:]
io.open(P, 'w', encoding='utf-8', newline='').write(out)
print('OK replaced %d -> %d chars' % (len(old), len(new)))
for must in ['function portShed', 'function portWarehouse', 'function portOffice', 'CQ_BUILDINGS.push']:
    assert must in out, must
print('CQ_BUILDINGS pushes:', out.count('CQ_BUILDINGS.push'))
