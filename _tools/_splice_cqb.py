import io, sys, re
p = r'D:/Escape from TakeFu/js/07c_buildings.js'
src = io.open(p, encoding='utf-8').read()
new = io.open(r'D:/Escape from TakeFu/_tools/_new_cqb_block.js', encoding='utf-8').read()

START = '// ===================== CQB 多层可清剿建筑库 (阴暗街区) ====================='
END = '// 竹丛(丛林)'
i = src.find(START)
j = src.find(END)
assert i >= 0, 'start marker not found'
assert j > i, 'end marker not found'
old = src[i:j]
assert 'function cqbShopfront' in old and 'function cqbApartment' in old, 'unexpected old block'
# 保留旧块之外的内容
out = src[:i] + new + '\n' + src[j:]
io.open(p, 'w', encoding='utf-8', newline='').write(out)
print('OK  replaced %d chars with %d chars' % (len(old), len(new)))
# 断言: 旧块中的独有标识应已消失, 新标识存在
for must in ['_cqbWallOpen', '_cqbStairShaft', '_cqbSlab', 'const CQ_BUILDINGS=[]']:
    assert must in out, 'missing ' + must
print('occurrences CQ_BUILDINGS:', out.count('CQ_BUILDINGS'))
