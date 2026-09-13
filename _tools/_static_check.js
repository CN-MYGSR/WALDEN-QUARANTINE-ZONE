// 静态集成检查 (不需要浏览器): HTML 元素/脚本顺序/CSS 括号/被包裹的全局函数是否存在
const fs = require('fs');
const out = [];
const html = fs.readFileSync('index.html', 'utf8');
['killInfo', 'kcBanner', 'hideGunTip', 'fovRange', 'fovVal'].forEach(id => {
  out.push('div #' + id + ': ' + (html.indexOf('id="' + id + '"') >= 0 ? 'OK' : 'MISSING'));
});
// FOV 设置链路
const core = fs.readFileSync('js/00_core.js', 'utf8');
out.push('SETTINGS.fov 定义: ' + (/fov:\(function\(\)/.test(core) ? 'OK' : 'MISSING'));
out.push('BASE_FOV_74 常量: ' + (/const BASE_FOV_74/.test(core) ? 'OK' : 'MISSING'));
const vm = fs.readFileSync('js/15_viewmodel.js', 'utf8');
out.push('15 使用 SETTINGS.fov: ' + (/SETTINGS&&SETTINGS\.fov/.test(vm) ? 'OK' : 'MISSING'));
out.push('15 adsZLimit 计算: ' + (/measureAdsZLimit\(\)/.test(vm) ? 'OK' : 'MISSING'));
out.push('15 adsZLimit 生效: ' + (/adsPosZ>VM\.adsZLimit/.test(vm) ? 'OK' : 'MISSING'));
out.push('15 VM_ADS_MIN_CLEAR: ' + (/const VM_ADS_MIN_CLEAR=/.test(vm) ? 'OK' : 'MISSING'));
const mn = fs.readFileSync('js/29_menus.js', 'utf8');
out.push('29 绑定 fovRange: ' + (/fovRange/.test(mn) ? 'OK' : 'MISSING'));
const dc = fs.readFileSync('js/44_deathcam.js', 'utf8');
out.push('44 默认不隐藏枪身: ' + (/let HIDE_GUN_ADS=false/.test(dc) ? 'OK' : 'STILL TRUE'));
// 主页战役选择已删除
out.push('#mCamp 面板已移除: ' + (html.indexOf('id="mCamp"') < 0 ? 'OK' : 'STILL THERE'));
out.push('选择战役导航按钮已移除: ' + (html.indexOf('data-p="mCamp"') < 0 ? 'OK' : 'STILL THERE'));
out.push('29 不再引用 campRow: ' + (/campRow/.test(fs.readFileSync('js/29_menus.js', 'utf8')) ? 'STILL THERE' : 'OK'));
out.push('29 showPanel 对缺失面板做了存在性判断: ' + (/const e=el\(pid\); if\(e\)/.test(fs.readFileSync('js/29_menus.js', 'utf8')) ? 'OK' : 'MISSING'));
// 资源防缓存
out.push('脚本带 ?v= 版本号: ' + (html.match(/script src="js\/[^"]+\?v=/g) || []).length + ' / ' + (html.match(/script src="js\//g) || []).length);
out.push('CSS 带 ?v=: ' + (/stylesheet" href="css\/style\.css\?v=/.test(html) ? 'OK' : 'MISSING'));
const i43 = html.indexOf('js/43_maps.js'), i44 = html.indexOf('js/44_deathcam.js'), i32 = html.indexOf('js/32_boot.js');
out.push('script order 43<44<32: ' + ((i43 >= 0 && i44 > i43 && i32 > i44) ? 'OK' : 'BAD ' + [i43, i44, i32].join(',')));
const css = fs.readFileSync('css/style.css', 'utf8');
let depth = 0; for (const c of css) { if (c === '{') depth++; else if (c === '}') depth--; }
out.push('css brace balance: ' + (depth === 0 ? 'OK' : 'BROKEN ' + depth));
out.push('css has #killInfo rule: ' + (css.indexOf('#killInfo') >= 0 ? 'OK' : 'MISSING'));
out.push('css has .deathBox rule: ' + (css.indexOf('.deathBox') >= 0 ? 'OK' : 'MISSING'));
// 收集所有 js 顶层的 function 声明 (用于确认"包裹式扩展"的目标确实是全局函数)
const files = fs.readdirSync('js').filter(f => f.endsWith('.js'));
const dec = {};
files.forEach(f => {
  const s = fs.readFileSync('js/' + f, 'utf8');
  const re = /^function\s+([A-Za-z_$][\w$]*)/gm;
  let m; while ((m = re.exec(s))) dec[m[1]] = f;
});
['updateCamera', 'updateViewModel', 'updateHUD', 'showDeploy', 'finishRaid'].forEach(n => {
  out.push('wrapper target ' + n + ': ' + (dec[n] ? 'OK (' + dec[n] + ')' : 'NOT A GLOBAL FUNCTION'));
});
// ---- 投掷物自费化 (46_throwables) ----
['throwRow', 'flashOv'].forEach(id => {
  out.push('div #' + id + ': ' + (html.indexOf('id="' + id + '"') >= 0 ? 'OK' : 'MISSING'));
});
const i46 = html.indexOf('js/46_throwables.js');
out.push('script order 44<46<32: ' + ((i44 >= 0 && i46 > i44 && i32 > i46) ? 'OK' : 'BAD ' + [i44, i46, i32].join(',')));
['buildDeployConsumables', 'updateConsumSummary', 'applyDeployLoadout', 'deployPlayer',
 'rollCrateLootList', 'rollCorpseLoot',
 'itemSizeOf', 'itemWeightOf', 'itemPriceOf', 'itemLabel', 'itemName', 'itemDescOf',
 'itemKind', 'itemIconOf', 'itemSellPrice'].forEach(n => {
  out.push('46 wrapper target ' + n + ': ' + (dec[n] ? 'OK (' + dec[n] + ')' : 'NOT A GLOBAL FUNCTION'));
});
// 46 引用的全局必须在更早的文件里已定义
const early46 = {};
files.filter(f => f < '46_throwables.js').forEach(f => {
  const s = fs.readFileSync('js/' + f, 'utf8');
  [/^const\s+([A-Za-z_$][\w$]*)/gm, /^let\s+([A-Za-z_$][\w$]*)/gm, /^function\s+([A-Za-z_$][\w$]*)/gm,
   /^class\s+([A-Za-z_$][\w$]*)/gm].forEach(re => {
    let m; while ((m = re.exec(s))) early46[m[1]] = f;
  });
});
['META', 'RUN', 'saveMeta', 'ownedCount', 'Bot', 'V3', 'angDiff', 'addTrauma', 'showScorePop',
 'raycastWorld', 'TRADE_KEYS', 'TRADE_LEVEL', 'soldiers', 'nowT', 'player', 'CAMPAIGN'].forEach(n => {
  out.push('46 global ' + n + ': ' + (early46[n] ? 'OK (' + early46[n] + ')' : 'NOT FOUND BEFORE 46'));
});
// AT 雷已整体移除
const b19 = fs.readFileSync('js/19_bot.js', 'utf8');
const i24 = fs.readFileSync('js/24_input.js', 'utf8');
out.push('19_bot 不再投 AT 雷: ' + (/this\.atn>0/.test(b19) ? 'STILL THERE' : 'OK'));
out.push('24_input 无 throwAT: ' + (/throwAT/.test(i24) ? 'STILL THERE' : 'OK'));
out.push('快捷键 3/4/5: ' + (
  /Digit3'\)\s*InputActions\.nadeEquip/.test(i24) &&
  /Digit4'\)\s*InputActions\.throwFlash/.test(i24) &&
  /Digit5'\)\s*InputActions\.throwSmoke/.test(i24) ? 'OK' : 'BAD'));
out.push('工程兵工事改 6 键: ' + (/Digit6/.test(i24) ? 'OK' : 'MISSING'));

// ---- 单位编队 (47_units) ----
const i47 = html.indexOf('js/47_units.js');
out.push('script order 46<47<32: ' + ((i46 >= 0 && i47 > i46 && i32 > i47) ? 'OK' : 'BAD ' + [i46, i47, i32].join(',')));
out.push('47 wrapper target startMatch: ' + (dec['startMatch'] ? 'OK (' + dec['startMatch'] + ')' : 'NOT A GLOBAL FUNCTION'));
// 过滤钩子是否真的插进了目标选择 / 伤害结算的每一处
const hookOf = { '19_bot.js': [/unitBlocks\(this,e\)/g, 2], '17_ragdoll.js': [/unitBlocks\(shooter,s\)/g, 1], '18_ballistics.js': [/unitBlocks\(attacker,s\)/g, 1], '20_tank.js': [/unitBlocks\(attacker,s\)/g, 1] };
for (const f in hookOf) {
  const s = fs.readFileSync('js/' + f, 'utf8');
  const n = (s.match(hookOf[f][0]) || []).length;
  out.push('unitBlocks 钩子 ' + f + ': ' + n + '/' + hookOf[f][1] + (n >= hookOf[f][1] ? ' OK' : ' MISSING'));
}
const b19b = fs.readFileSync('js/19_bot.js', 'utf8');
out.push('19_bot damage 同单位硬闸: ' + (/unitBlocks\(attacker,this\)/.test(b19b) ? 'OK' : 'MISSING'));
out.push('23_player damage 同单位硬闸: ' + (/unitBlocks\(attacker,this\)/.test(fs.readFileSync('js/23_player.js', 'utf8')) ? 'OK' : 'MISSING'));

// 确认 44_deathcam 引用的全局在更早的文件里已定义
const early = {};
files.filter(f => f < '44_deathcam.js').forEach(f => {
  const s = fs.readFileSync('js/' + f, 'utf8');
  [/^const\s+([A-Za-z_$][\w$]*)/gm, /^let\s+([A-Za-z_$][\w$]*)/gm, /^function\s+([A-Za-z_$][\w$]*)/gm].forEach(re => {
    let m; while ((m = re.exec(s))) early[m[1]] = f;
  });
});
['clamp', 'lerp', 'dampF', 'player', 'VM', 'vmCamera', 'camera', 'soldiers', 'TEAM_NAME', 'WPN_DEFS', 'matchOver', 'nowT'].forEach(n => {
  out.push('global ' + n + ': ' + (early[n] ? 'OK (' + early[n] + ')' : 'NOT FOUND BEFORE 44'));
});
fs.writeFileSync('_tools/_static.txt', out.join('\n') + '\n', 'utf8');
