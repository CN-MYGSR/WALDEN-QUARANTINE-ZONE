// 全量回归: 依次跑所有探针, 汇总结果
// 背景: 2026-09-19 改了 01_data.js(天气随机/光照) 这类全局初始化文件, 必须全量重验
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';

const SUITES = [
  ['编制/对局时间/超时', '_roster_probe.js', '_roster_probe.txt', [
    /^=====|实际编制|matchTime|撤离读条|结算标题|^无$/m,
  ]],
  ['联机接入', '_net_probe.js', '_net_probe.txt', [
    /VIBE\.client|面板可见|unitBlocks 已打补丁|^无$/m,
  ]],
  ['头盔系统', '_helmet_probe.js', '_helmet_probe.txt', [
    /1级 PACA|1级 SSh-68|itemKind|20 伤害打头|护甲不该|helmetHud|带头盔的尸体|货架命中|^无$/m,
  ]],
  ['耳机系统', '_headset_probe.js', '_headset_probe.txt', [
    /听力 67m|kind=headset|Altyn \+|SSh-68 \+|禁用|NPC 脚步音次数|戴ComTac gain|货架命中|^无$/m,
  ]],
  ['背包', '_pack_probe.js', '_pack_probe.txt', [
    /Flyye|LBT-8005A|Gruppa|Tasmanian|bagCapacity|货架命中|^无$/m,
  ]],
  ['胸挂', '_chest_probe.js', '_chest_probe.txt', [
    /胸挂定义|56式|Commando|WARTECH|背包 16|正确拒绝|小件还能塞|胸挂下拉|装备槽位|^无$/m,
  ]],
  ['仓库', '_warehouse_probe.js', '_warehouse_probe.txt', [
    /行数 =|仓库里的胸挂|护甲→|^无$/m,
  ]],
  ['尸体掉枪', '_corpse_probe.js', '_corpse_probe.txt', [
    /有枪的尸体|完整链路|背包里的枪|^无$/m,
  ]],
  ['敌方散布', '_spread_probe.js', '_spread_probe.txt', [
    /^=====|包围盒|异常 =/m,
  ]],
];

const report = [];
report.push('全量回归 · ' + new Date().toLocaleString('zh-CN'));
report.push('URL: ' + URL);
report.push('');

let fail = 0;
for (const [name, script, outFile, greps] of SUITES) {
  const t0 = Date.now();
  let crashed = '';
  try {
    execFileSync(process.execPath, [path.join(ROOT, '_tools', script), URL], {
      cwd: ROOT, timeout: 420000, stdio: 'pipe',
    });
  } catch (e) {
    crashed = '（探针退出码非 0: ' + (e.status != null ? e.status : e.message) + '）';
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  report.push('======== ' + name + '  (' + secs + 's) ' + crashed);
  let txt = '';
  try { txt = fs.readFileSync(path.join(ROOT, '_tools', outFile), 'utf8'); } catch (e) { txt = ''; }
  if (!txt) { report.push('  ❌ 没有输出文件'); fail++; report.push(''); continue; }
  const lines = txt.split('\n');
  const picked = lines.filter(l => greps.some(g => g.test(l)));
  report.push(picked.length ? picked.map(l => '  ' + l.trim()).join('\n') : '  （没有匹配到关键行）');
  // 异常行
  const idx = lines.findIndex(l => /^=== 异常/.test(l));
  if (idx >= 0) {
    const rest = lines.slice(idx + 1).filter(Boolean);
    if (rest.length && rest[0].trim() !== '无') { report.push('  ⚠️ 异常: ' + rest.slice(0, 4).join(' | ')); fail++; }
  }
  report.push('');
}

report.push(fail ? ('⚠️ 有 ' + fail + ' 项需要关注') : '✅ 全部通过');
fs.writeFileSync(path.join(ROOT, '_tools', '_full_regression.txt'), report.join('\n') + '\n', 'utf8');
console.log(report.join('\n'));
