'use strict';
// ===================== 战役 / 阵营 / 环境主题 =====================
// 每个战役: 独立地形结构(terr) + 独立布局(layout) + 专属玩法(mode) + 旗点/基地/道路/战壕
const CAMPAIGNS=[
{ id:'bfruins', title:'街区', sub:'废城巷战 · 逐屋清剿 · 搜刮带出', f:['us','ger'], theme:'cqb',
 terr:'urban', layout:'cqb', mode:'extract', atk:0, modeName:'撤离 · 街区', mapSize:200,
 flags:[], bases:[{x:-76,z:0},{x:76,z:0}], sineRoad:false,
 roads:[[-76,0,0,0],[0,0,76,0]], trench:[],
 // 地图卡片上的说明 (29_menus / 43_maps 读取)
 mapName:'街区',
 mapTag:'废城地表 · 中等风险',
 mapDesc:'坍塌公寓与被弹坑撕开的马路。光照昏暗、掩体密集，适合近距交火与逐屋清剿。物资以中低档杂物与生活品为主，敌方守备为普通清场分队。',
 mapLoot:'物资箱 ×14 · 中低价值为主',
 mapThreat:'守备强度 ★★☆☆☆',
 mapDiff:1, extract:[{x:0,z:88},{x:-76,z:-76},{x:76,z:-76}] },
{ id:'lab', title:'秘密实验室', sub:'地下生物设施 · 高价值物资 · 精锐守备', f:['us','ger'], theme:'lab',
 terr:'flat', layout:'lab', mode:'extract', atk:0, modeName:'撤离 · 实验室', mapSize:190,
 flags:[], bases:[{x:-72,z:0},{x:72,z:0}], sineRoad:false,
 roads:[], trench:[],
 mapName:'秘密实验室',
 mapTag:'铁砧地下层 · 高风险',
 mapDesc:'NBK 封存在铁砧地下三层的生物制剂设施。全封闭室内、照明几乎失效，走廊狭窄、房间密布。物资箱密度与稀有度大幅提升（芯片/名表/GPU/通行卡/医疗记录仪），但守备是 NBK 的合同精锐，更强、更快、更准。',
 mapLoot:'物资箱 ×22+ · 高价值密集',
 mapThreat:'守备强度 ★★★★☆',
 mapDiff:4, enemyBots:20,
 // 敌方强化倍率 (43_maps 读取, 与 NG+ prestige 叠加)
 botMul:{ enemyHp:1.28, enemyReact:0.74, enemySpread:0.72, friendHp:0.92 },
 extract:[{x:0,z:74}],
 lootSpots:[] },
{ id:'port', title:'港口', sub:'瓦尔登港 · 集装箱码头 · 出海唯一通道', f:['us','ger'], theme:'port',
 terr:'harbor', layout:'port', mode:'extract', atk:0, modeName:'撤离 · 港口', mapSize:220,
 flags:[], bases:[{x:-70,z:-64},{x:-70,z:64}], sineRoad:false,
 roads:[[-70,-64,44,0],[-70,64,44,0],[-96,0,-40,0]], trench:[],
 mapName:'港口',
 mapTag:'瓦尔登港区 · 出海通道',
 mapDesc:'封锁前最后的出海通道。集装箱堆场被潮气和铁锈吃透，龙门吊还挂在岸线上，泊位外那艘船始终没有离港。箱列把视野切成一条条走廊，交火距离短、可绕行的方向也少。',
 mapLoot:'物资箱 ×18+ · 报关货物价值高',
 mapThreat:'守备强度 ★★★☆☆',
 mapDiff:3, enemyBots:18,
 // 敌方强化介于街区与实验室之间
 botMul:{ enemyHp:1.15, enemyReact:0.82, enemySpread:0.82, friendHp:0.96 },
 extract:[{x:44,z:0}],
 lootSpots:[] },
];
// 地图选择持久化: localStorage.sf_campaign (旧版只写不读, 这里补上读取)
let CAMPAIGN_IDX=(()=>{
let i=NaN;
try{ i=parseInt(localStorage.getItem('sf_campaign')||'',10); }catch(e){ i=NaN; }
if(!isFinite(i)||i<0||i>=CAMPAIGNS.length) i=0;
return i;
})();
const CAMPAIGN=CAMPAIGNS[CAMPAIGN_IDX];
// 玩法归属战役: 征服 / 攻防(atk=进攻方) / 破袭(摧毁补给库)
let GAMEMODE=CAMPAIGN.mode;
const ATK=CAMPAIGN.atk||0, DEF=1-ATK;
let assaultIdx=0;
const DEPOTS=[];
// 战役天气: 雨/雪/阴天/雷暴 (天气选择模式下被覆盖)
// CQB 默认阴天 —— 低光照 + 中距离雾, 强制近战交火
const CAMPAIGN_WEATHER={rhine:'overcast',alps:'snow',delta:'storm',berlin:'overcast',moscow:'snow',bfruins:'overcast',lab:'labhaze',port:'seahaze'}[CAMPAIGN.id]||'overcast';
// ===== 天气模式: 战役界面选择, localStorage sf_weather =====
const WEATHER_MODES={clear:{name:'晴朗'},fog:{name:'迷雾'},rain:{name:'雨天'},storm:{name:'雷暴雨'},night:{name:'黑夜'},overcast:{name:'阴天'},dusk:{name:'黄昏'}};
const WEATHER_MODE=(()=>{ const v=localStorage.getItem('sf_weather'); return WEATHER_MODES[v]?v:'clear'; })();
const WEATHER=WEATHER_MODE==='night'?'clear':(WEATHER_MODE!=='clear'?WEATHER_MODE:CAMPAIGN_WEATHER);
// 各天气的画面/视距参数: fogFar=雾远×, fogNear=雾近, sun/hemi=光照×, skyDark=天空压暗, sight=bot视距×
const WEATHER_FX={
clear:{fogFar:1,fogNear:40,sun:1,hemi:1,skyDark:0,sight:1},
fog:{fogFar:0.26,fogNear:6,sun:0.45,hemi:0.6,skyDark:0.42,sight:0.5},
rain:{fogFar:0.78,fogNear:30,sun:0.65,hemi:0.85,skyDark:0.2,sight:0.82},
storm:{fogFar:0.6,fogNear:24,sun:0.5,hemi:0.72,skyDark:0.36,sight:0.68},
night:{fogFar:1,fogNear:18,sun:1,hemi:1,skyDark:0,sight:1},
// CQB 专用: 阴天压低能见度, 黄昏/雾霾进一步压缩交火距离
// 注 1: 阴天/雷暴/雨天的光照强度由 12_weather_fx.js 顶部硬编码覆盖
// (overcast = KEY_BASE*0.55 + THEME.hemi[2]*1.15), 所以本表的 sun/hemi 对这三种天气不生效,
// 只有 fogFar/fogNear/skyDark 生效 —— 街区提亮必须改 THEMES.cqb, 它才是覆盖公式的输入。
// 注 2: sight 目前没有任何读取点 (唯一未被消费的字段), 保留以备后续接入 bot 视距。
overcast:{fogFar:0.62,fogNear:20,sun:0.42,hemi:0.55,skyDark:0.24,sight:0.55},
dusk:{fogFar:0.38,fogNear:9,sun:0.3,hemi:0.4,skyDark:0.52,sight:0.42},
// 秘密实验室专用: 地下设施的浮尘/制冷雾气 —— 能见度低、顶光几乎为零、色调被环境光压暗
// sight 0.45: 守备几乎不能远距发现玩家, 交火全部发生在走廊与房间内的近距离
labhaze:{fogFar:0.30,fogNear:7,sun:0.22,hemi:0.62,skyDark:0.62,sight:0.45},
// 港口专用: 海雾 —— 能见度比街区好(视野开阔), 但湿冷、压抑, 远处海面被雾吃掉
seahaze:{fogFar:0.42,fogNear:16,sun:0.38,hemi:0.5,skyDark:0.44,sight:0.5}
};
// 注意: 必须取 WEATHER(已折算战役默认天气) 而非 WEATHER_MODE,
// 否则玩家未显式选天气时, 战役默认阴天/黄昏的能见度参数不会生效。
const WFX=WEATHER_FX[WEATHER]||WEATHER_FX.clear;
// 河流 (进入地形生成)
const RIVER={
delta:{pts:[[-165,-30],[-70,-18],[-8,-38],[60,-10],[120,-30],[165,-14]],w:8,ice:false},
moscow:{pts:[[-165,-66],[-90,-30],[-24,-52],[52,-22],[110,-64],[165,-38]],w:8,ice:true},
// 港口: 东侧整片海面 —— 沿 x≈86 下切 26m 宽的水体, 岸线自然落在 x≈60
port:{pts:[[86,-118],[86,118]],w:26,ice:false},
}[CAMPAIGN.id]||null;
const SIZE_OPTS=[{n:'标准',bots:16,tk:330},{n:'加强',bots:20,tk:430},{n:'史诗',bots:24,tk:540}];
let SIZE_IDX=clamp(parseInt(localStorage.getItem('sf_size')||'0')||0,0,2);
// 移动端自动检测 (触屏 + 粗指针)
const MOBILE=(()=>{
try{ return navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches; }catch(e){ return 'ontouchstart' in window; }
})();
const THEMES={
green:{ sky:['#5e7ca0','#93aec0','#c3cdc2','#d8d3b8','#c9c3a4'], fog:0xb8c4bc, hemi:[0xcfd8e8,0x5a5844,0.75], sun:0xffeed0, sunI:2.0,
ground:0xffffff, grassC:0xffffff, leaf:0xffffff, roof:0xffffff, dead:0.08, ruinAdd:0, rubbleN:0, snow:false, birds:true, treeN:95, grassMul:1 },
winter:{ sky:['#6b7684','#939aa4','#b8bcc2','#c8cacc','#bfc2c4'], fog:0xbcc2c8, hemi:[0xcdd4de,0x777d84,0.8], sun:0xe8ecf2, sunI:1.5,
ground:0xdfe4ea, grassC:0xc8ccd2, leaf:0x5a5148, roof:0xb8bcc2, dead:0.7, ruinAdd:0.35, rubbleN:14, snow:true, birds:false, treeN:55, grassMul:0.3 },
ruin:{ sky:['#5f5a55','#8a7f74','#a89a88','#b3a48e','#a3947e'], fog:0xa89c8c, hemi:[0xc2b8a8,0x5f584c,0.7], sun:0xffd9a8, sunI:1.7,
ground:0xb8b0a2, grassC:0x9a9482, leaf:0x6a6a52, roof:0x8f8578, dead:0.5, ruinAdd:0.5, rubbleN:20, snow:false, birds:false, treeN:45, grassMul:0.45 },
china:{ sky:['#7d93a8','#a8b8bc','#cfc8b2','#ddd2ac','#cfc29e'], fog:0xc6bfa6, hemi:[0xd8d8c8,0x5f5c48,0.75], sun:0xffe8c0, sunI:1.85,
ground:0xf2ecd8, grassC:0xd8e0b8, leaf:0xd0ffb0, roof:0x6a7076, dead:0.15, ruinAdd:0.2, rubbleN:8, snow:false, birds:true, treeN:80, grassMul:0.9 },
loess:{ sky:['#8a97a4','#b5b3a4','#d8cba4','#e0d0a0','#d4c294'], fog:0xd2c49e, hemi:[0xe0d8c0,0x6f6448,0.75], sun:0xffe2b0, sunI:1.9,
ground:0xf0dfb2, grassC:0xe8d8a0, leaf:0xc8d890, roof:0x9a9078, dead:0.3, ruinAdd:0.1, rubbleN:5, snow:false, birds:true, treeN:60, grassMul:0.55 },
jungle:{ sky:['#5f7d8c','#8fae9c','#b8c8a0','#c8cf9a','#b8c288'], fog:0xaebf96, hemi:[0xc8d8c0,0x40523c,0.8], sun:0xfff2c8, sunI:1.7,
ground:0xa8c078, grassC:0x8fb860, leaf:0x69a83c, roof:0x8a8468, dead:0.05, ruinAdd:0, rubbleN:0, snow:false, birds:true, treeN:185, grassMul:1.7 },
alpine:{ sky:['#5a6a80','#8b98a8','#c2c8ce','#d8dade','#ccd0d4'], fog:0xc6ccd4, hemi:[0xd0d8e4,0x6a7078,0.82], sun:0xeef2f8, sunI:1.55,
ground:0xe6eaf0, grassC:0xc8d0d8, leaf:0x3d5a44, roof:0xd8dce2, dead:0.25, ruinAdd:0.1, rubbleN:4, snow:true, birds:false, treeN:150, grassMul:0.35 },
taiga:{ sky:['#55627a','#828ea4','#b6c0cc','#d2d8de','#c6ccd4'], fog:0xbac6d0, hemi:[0xc4d0de,0x64707c,0.8], sun:0xe8eef6, sunI:1.5,
ground:0xd4dae0, grassC:0xbcc6cc, leaf:0x2c4a3e, roof:0xd0d6dc, dead:0.2, ruinAdd:0.05, rubbleN:3, snow:true, birds:false, treeN:175, grassMul:0.3 },
// ===== CQB 阴暗街区: 低饱和度 / 压抑 / 破败都市战 (参考《逃离塔科夫》城市冲突) =====
// 调色思路: 天空去蓝偏灰褐, 雾色接近脏水泥灰, 环境光低强度冷灰 + 地面反射暖灰,
// 主光(太阳/月亮)为低强度漫射白, 植被几乎枯死, 瓦砾密度拉满, 树木极少。
cqb:{ sky:['#5a5f66','#7c8084','#9c9a94','#b0aca4','#a09b92'], fog:0x8b8a84,
hemi:[0xbcc4cc,0x55504a,0.62], sun:0xd8d4c6, sunI:1.45,
ground:0xb2ada4, grassC:0x97937b, leaf:0x6e7058, roof:0x8a857c, dead:0.62, ruinAdd:0.72,
rubbleN:34, snow:false, birds:false, treeN:16, grassMul:0.32, cqb:true, vigA:0.24 },
// ===== 港口: 海雾笼罩的集装箱码头 / 湿冷 / 铁锈与混凝土 =====
// 调色思路: 天空是低饱和的青灰(海雾), 雾色带一点水汽的蓝绿, 主光弱而弥散;
// 地面几乎是纯混凝土灰(码头面), 植被只留零星杂草, 树木极少(堆场没有绿化);
// 靠集装箱的铁锈橙、黄色警示条、以及岸线灯带提供色彩对比。
port:{ sky:['#4d5a63','#6d7c86','#8d99a1','#9fa8ad','#8e979d'], fog:0x7f8c93,
hemi:[0xaebcc6,0x3c444a,0.58], sun:0xccd2d4, sunI:1.2,
ground:0xc6c8c4, grassC:0x8f9484, leaf:0x5e6350, roof:0x767b80, dead:0.85, ruinAdd:0.4,
rubbleN:18, snow:false, birds:true, treeN:10, grassMul:0.16, cqb:true, vigA:0.32 },
// ===== 秘密实验室: 全封闭地下设施 / 无天光 / 冷白应急照明 / 高湿度雾气 (参考《逃离塔科夫》实验室) =====
// 调色思路: 天空几乎全黑(设施无天空可言), 雾色是偏青的深灰(制冷雾气 + 浮尘),
// 环境光为低强度冷白 + 地面反射近黑, 保证"能看清轮廓但看不清细节"的压迫感;
// 植被彻底清除(室内), 瓦砾极少(设施完好), 靠灯板/警示色提供唯一的高饱和色。
lab:{ sky:['#070a0c','#0d1316','#131b1f','#182227','#141c20'], fog:0x121a1e,
hemi:[0xa8bcc6,0x0a0e10,0.72], sun:0xb8c8d2, sunI:0.95,
ground:0x3c4145, grassC:0x2e3438, leaf:0x26302c, roof:0x2a3136, dead:1.0, ruinAdd:0.08,
rubbleN:6, snow:false, birds:false, treeN:0, grassMul:0.02, cqb:true, lab:true },
};
const THEME=THEMES[CAMPAIGN.theme];
// ===== 夜战: 由天气模式(黑夜)或旧版 sf_night 开关, 切换后重载重建世界 =====
const NIGHT = WEATHER_MODE==='night' || localStorage.getItem('sf_night')==='1';
function weatherSkyStop(c,f){ // 天空色整体压暗偏灰 (迷雾/雨/雷暴)
  const n=parseInt(c.slice(1),16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  const rr=Math.round(r*(1-f)+128*f*0.6), gg=Math.round(g*(1-f)+128*f*0.6), bb=Math.round(b*(1-f)+134*f*0.6);
  return '#'+((1<<24)|(rr<<16)|(gg<<8)|bb).toString(16).slice(1);
}
const NIGHT_FOG = 0x0c1526;
const NIGHT_HEMI = [0x2e3f68, 0x0d1424, 0.34];
const NIGHT_SUN = 0xa8bfe8;
// 昼/夜统一的主方向光基准强度 (天气系统按它乘系数)
const KEY_BASE = NIGHT ? THEME.sunI*0.13 : THEME.sunI;
function nightSkyStop(c){ // 昼间天空色压暗偏蓝 → 夜战天空渐变
  const n=parseInt(c.slice(1),16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  const rr=Math.round(r*0.14+14), gg=Math.round(g*0.15+18), bb=Math.round(b*0.2+42);
  return '#'+((1<<24)|(rr<<16)|(gg<<8)|bb).toString(16).slice(1);
}
const FACTIONS={
us:{ name:'美国陆军', short:'美军', sym:'★', flagBg:'#3a5f9e', atn5:3,
coat:0x4c5a4a, pants:0x8a7f5e, helm:0x4a5240, skin:0xc09878, sleeve:0x4d5240, helmet:'mod', nade:'egg',
names:['米勒','雷本','杰克逊','霍瓦特','梅利什','厄本','韦德','卡帕佐','德尔安科','麦克','唐尼','史密斯','布鲁尔','泰勒'],
cls:[['m4','p320'],['m24','p320'],['mp5','p320'],['m4','p320'],['mp5','p320']],
tanks:[{name:'M1A2 艾布拉姆斯',cls:'heavy',hp:1500,spd:6.0,rev:2.8,turn:0.75,reload:4.6,tRate:0.42,dmg:460,pen:270,armor:{f:205,s:90,r:60,t:128,top:24},crew:['driver','gunner','commander'],col:0x5a6644,colT:0x46513a,heavy:true,barrelL:4.6,hullL:7.0},
{name:'M2 布雷德利',cls:'medium',hp:950,spd:6.4,rev:3.2,turn:0.9,reload:4.0,tRate:0.55,dmg:340,pen:175,armor:{f:100,s:55,r:38,t:65,top:16},crew:['driver','gunner','loader'],col:0x58604a,colT:0x454c3c,heavy:false,barrelL:3.6,hullL:6.2}],
trucks:[{name:'悍马 HMMWV',hp:520,spd:9.6,rev:4.6,turn:1.2,seats:6,open:true,mg:true,col:0x5a6848}],
  planes:[{name:'F-16 战隼',hp:130,spd:[18,36],rof:0.07,mgDmg:19,bombs:2,col:0x6a7a86,size:1},
 {name:'F-15 鹰',hp:185,spd:[16,32],rof:0.09,mgDmg:22,bombs:4,col:0x5a6a78,size:1.18},
 {name:'F-35A 闪电II',hp:150,spd:[17,37],rof:0.06,mgDmg:18,bombs:3,col:0x76808c,size:1.1,vtol:true},
 {name:'UH-60 黑鹰',hp:150,spd:[14,28],rof:0.08,mgDmg:17,bombs:0,col:0x4a5248,size:1,chopper:true}] },
ger:{ name:'德国联邦国防军', short:'德军', sym:'✠', flagBg:'#8a2020', atn5:3,
coat:0x545c50, pants:0x46484e, helm:0x3e4246, skin:0xc8a080, sleeve:0x4a4d52, helmet:'mod', nade:'egg',
names:['施泰纳','穆勒','克格勒','汉森','冯·克劳克','贝克','施密特','里希特','沃尔夫','凯撒','布劳恩','菲舍尔','霍夫曼','克鲁格'],
cls:[['g36c','g17'],['g28','g17'],['mp5','g17'],['g36c','g17'],['mp5','g17']],
tanks:[{name:'豹2A6',cls:'heavy',hp:1480,spd:5.8,rev:2.6,turn:0.7,reload:6.4,tRate:0.42,dmg:570,pen:305,armor:{f:200,s:85,r:58,t:120,top:24},crew:['driver','gunner','loader'],col:0x565e52,colT:0x454c40,heavy:true,barrelL:4.8,hullL:7.2},
{name:'美洲狮',cls:'medium',hp:1050,spd:6.2,rev:3.0,turn:0.85,reload:4.4,tRate:0.55,dmg:350,pen:160,armor:{f:110,s:58,r:40,t:70,top:16},crew:['driver','gunner','loader'],col:0x555c54,colT:0x434a42,heavy:false,barrelL:3.5,hullL:6.2}],
trucks:[{name:'狐式装甲车',hp:500,spd:9.4,rev:4.4,turn:1.15,seats:6,open:true,mg:true,col:0x525a50}],
  planes:[{name:'台风 EF2000',hp:120,spd:[19,38],rof:0.07,mgDmg:18,bombs:2,col:0x6a6e78,size:1},
 {name:'F-4 鬼怪',hp:170,spd:[14,29],rof:0.095,mgDmg:22,bombs:4,col:0x5c626c,size:1.18},
 {name:'H145M 直升机',hp:120,spd:[15,30],rof:0.085,mgDmg:16,bombs:0,col:0x464c46,size:0.95,chopper:true}] },
 rus:{ name:'俄罗斯联邦武装力量', short:'俄军', sym:'☭', flagBg:'#3a7a3a',
 coat:0x555f4e, pants:0x4a5238, helm:0x3e4436, skin:0xc8a080, sleeve:0x4e5748, helmet:'mod', nade:'egg', atn5:3,
 names:['伊万诺夫','彼得罗夫','瓦西里耶夫','斯米尔诺夫','库兹涅佐夫','索科洛夫','波波夫','列别捷夫','科兹洛夫','诺维科夫','莫罗佐夫','费多罗夫','沃尔科夫','索洛维约夫'],
 cls:[['ak74m','pyat'],['svd','pyat'],['pp19','pyat'],['ak74m','pyat'],['pp19','pyat']],
 tanks:[{name:'T-90A',cls:'heavy',hp:1600,spd:5.4,rev:2.2,turn:0.7,reload:5.4,tRate:0.42,dmg:530,pen:290,armor:{f:255,s:95,r:70,t:135,top:24},crew:['driver','gunner','commander'],col:0x4f5c40,colT:0x3c4832,heavy:true,barrelL:4.8,hullL:7.0,rus:true},
 {name:'BMP-3',cls:'medium',hp:980,spd:6.6,rev:3.4,turn:0.95,reload:4.6,tRate:0.6,dmg:390,pen:165,armor:{f:95,s:52,r:36,t:62,top:16},crew:['driver','gunner','commander'],col:0x505c44,colT:0x3f4a36,heavy:false,barrelL:3.4,hullL:6.2,rus:true},
 {name:'BMPT-72 终结者',cls:'heavy',hp:1500,spd:5.9,rev:2.9,turn:0.72,reload:0.3,tRate:1.4,dmg:80,pen:95,armor:{f:250,s:95,r:65,t:145,top:28},crew:['driver','gunner','loader'],col:0x4f5c40,colT:0x3c4832,heavy:true,barrelL:3.9,hullL:7.2,rus:true,bmpt:true,rockets:4}],
 trucks:[{name:'乌拉尔-4320 卡车',hp:300,spd:8.8,rev:4.2,turn:1.12,seats:6,open:true,mg:true,rus:true,col:0x4f5a42}],
  planes:[{name:'苏-35S 侧卫',hp:135,spd:[18,36],rof:0.075,mgDmg:20,bombs:3,col:0x6b7268,size:1,rus:true},
 {name:'苏-34 鸭嘴兽',hp:200,spd:[15,30],rof:0.1,mgDmg:21,bombs:5,col:0x5c6458,size:1.18,rus:true},
 {name:'卡-52 短吻鳄',hp:170,spd:[14,28],rof:0.07,mgDmg:21,bombs:2,col:0x50584c,size:1,chopper:true,rus:true}] },
sov:{ name:'苏联红军', short:'苏军', sym:'☭', flagBg:'#b03030',
coat:0x6b6a4f, pants:0x5c5a42, helm:0x515c3e, skin:0xc8a080, sleeve:0x62614a, helmet:'ssh', nade:'stickS',
names:['伊万诺夫','彼得罗夫','瓦西里','安德烈','谢尔盖','德米特里','尼古拉','阿列克谢','米哈伊尔','尤里','奥列格','弗拉基米尔','康斯坦丁','格里高利'],
cls:[['mosin','tt33'],['ppsh','tt33'],['dp28','tt33'],['mosinpu','tt33'],['mosin','tt33'],['mosin','tt33'],['m38carb','tt33'],['m38carb','tt33']],
tanks:[{name:'T-34/76',cls:'medium',hp:850,spd:7.0,rev:3.6,turn:0.95,reload:5.0,tRate:0.5,dmg:335,pen:102,armor:{f:90,s:52,r:45,t:74,top:16},crew:['driver','gunner','commander'],col:0x4f5c40,colT:0x3c4832,heavy:false,barrelL:3.4,hullL:5.9},
{name:'KV-1 重型',cls:'heavy',hp:1400,spd:4.6,rev:2.5,turn:0.65,reload:6.8,tRate:0.36,dmg:420,pen:108,armor:{f:100,s:76,r:70,t:95,top:31},crew:['driver','gunner','commander','loader'],col:0x53604a,colT:0x404c3a,heavy:true,barrelL:3.9,hullL:6.5},
{name:'SU-76 自行火炮',cls:'td',hp:560,spd:6.6,rev:3.4,turn:0.9,reload:4.6,tRate:0.32,dmg:330,pen:105,armor:{f:35,s:16,r:10,t:12,top:0},openTop:true,casemate:true,crew:['driver','gunner','loader'],col:0x556248,colT:0x424e38,heavy:false,barrelL:3.5,hullL:5.0},],
trucks:[{name:'嘎斯-AA 卡车',hp:300,spd:9.2,rev:4.4,turn:1.15,seats:6,open:true,mg:false,col:0x525c46}],
 planes:[{name:'La-5',hp:100,spd:[16,32],rof:0.075,mgDmg:17,bombs:1,col:0x5f7062,size:1},
 {name:'IL-2 强击机',hp:180,spd:[13,25],rof:0.095,mgDmg:22,bombs:3,col:0x556052,size:1.2}] },
fin:{ name:'芬兰国防军', short:'芬军', sym:'❂', flagBg:'#2a4a9e',
coat:0x777c72, pants:0x6b7066, helm:0x737872, skin:0xc8a080, sleeve:0x71766c, helmet:'ssh', nade:'egg',
names:['海基宁','西米莱','科斯基','莱赫托','马基宁','涅米宁','维尔塔宁','拉赫蒂','图奥米','萨洛','劳塔宁','库西宁','阿尔托','拉明恩'],
cls:[['finmosin','l35'],['suomi','l35'],['suomi','l35'],['finmosins','l35'],['finmosin','l35'],['finmosin','l35'],['finmosin','l35'],['finmosin','l35']],
tanks:[{name:'维克斯6吨',cls:'light',hp:500,spd:6.2,rev:3.4,turn:0.95,reload:4.8,tRate:0.6,dmg:220,pen:60,armor:{f:17,s:13,r:10,t:17,top:9},crew:['driver','gunner'],col:0x6a7068,colT:0x52584f,heavy:false,barrelL:2.8,hullL:5.2},
{name:'T-26(缴获)',cls:'light',hp:620,spd:6.6,rev:3.5,turn:0.95,reload:4.6,tRate:0.62,dmg:240,pen:66,armor:{f:16,s:15,r:10,t:16,top:10},crew:['driver','gunner','commander'],col:0x66705c,colT:0x4e584a,heavy:false,barrelL:3.0,hullL:5.4},
{name:'T-28(缴获)',cls:'medium',hp:800,spd:5.6,rev:2.8,turn:0.8,reload:5.4,tRate:0.45,dmg:340,pen:100,armor:{f:40,s:24,r:20,t:45,top:12},crew:['driver','gunner','commander','loader'],col:0x5f6858,colT:0x4a523f,heavy:false,barrelL:3.5,hullL:6.6}],
trucks:[{name:'改装民用卡车',hp:270,spd:8.8,rev:4.2,turn:1.12,seats:6,open:true,mg:false,civ:true,col:0x6a6456}],
 planes:[{name:'福克 D.XXI',hp:95,spd:[15.5,31],rof:0.075,mgDmg:17,bombs:1,col:0x7a8276,size:0.98},
 {name:'布伦海姆',hp:170,spd:[13.5,26],rof:0.09,mgDmg:20,bombs:3,col:0x6d7868,size:1.18}] },
jp:{ name:'日本帝国陆军', short:'日军', sym:'☀', flagBg:'#8a2020',
coat:0x7a6f4a, pants:0x6e6444, helm:0x60593a, skin:0xc8a078, sleeve:0x6f6543, helmet:'jp', nade:'egg',
names:['田中','佐藤','铃木','高桥','渡边','伊藤','山本','中村','小林','加藤','吉田','山田','佐佐木','松本'],
cls:[['arisaka','nambu'],['type100','nambu'],['type96','nambu'],['type97s','nambu'],['arisaka','nambu'],['arisaka','nambu'],['type38c','nambu'],['type38c','nambu']],
tanks:[{name:'九五式轻战车',cls:'light',hp:430,spd:7.6,rev:3.8,turn:1.1,reload:4.2,tRate:0.7,dmg:160,pen:42,armor:{f:12,s:12,r:10,t:12,top:9},crew:['driver','gunner'],col:0x756e48,colT:0x5e583c,heavy:false,barrelL:2.4,hullL:4.4},
{name:'九七式改中战车',cls:'medium',hp:650,spd:6.6,rev:3.4,turn:0.95,reload:4.8,tRate:0.55,dmg:260,pen:86,armor:{f:47,s:25,r:20,t:47,top:12},crew:['driver','gunner','commander'],col:0x6f6a4c,colT:0x585340,heavy:false,barrelL:2.9,hullL:5.4},
{name:'一式炮战车',cls:'td',hp:500,spd:6.0,rev:3.0,turn:0.85,reload:5.2,tRate:0.32,dmg:330,pen:104,armor:{f:50,s:25,r:12,t:16,top:0},openTop:true,casemate:true,crew:['driver','gunner','loader'],col:0x6a6548,colT:0x53503c,heavy:true,barrelL:3.4,hullL:5.5},],
trucks:[{name:'九四式六轮卡车',hp:280,spd:9.0,rev:4.4,turn:1.15,seats:6,open:true,mg:false,col:0x6b6547}],
 planes:[{name:'零式舰战',hp:90,spd:[16.5,33],rof:0.07,mgDmg:16,bombs:1,col:0x8a9284,size:0.96},
 {name:'一式战 隼',hp:150,spd:[14.5,28],rof:0.085,mgDmg:20,bombs:3,col:0x77806e,size:1.12}] },
kmt:{ name:'国民革命军', short:'国军', sym:'✷', flagBg:'#2050b0',
coat:0x5a6a72, pants:0x52606a, helm:0x46525a, skin:0xc8a078, sleeve:0x53626b, helmet:'stahl', nade:'stick',
names:['王大山','李长贵','张铁柱','刘志','陈国栋','杨得胜','赵铁牛','黄浦生','周卫国','吴天亮','徐虎','孙立','马汉山','胡铁军'],
cls:[['zhongzheng','c96'],['mp18','c96'],['zb26','c96'],['zhongzhengs','c96'],['hanyang','c96'],['zhongzheng','c96'],['laotao','c96'],['laotao','c96']],
tanks:[{name:'维克斯6吨',cls:'light',hp:520,spd:6.0,rev:3.2,turn:0.95,reload:4.6,tRate:0.65,dmg:210,pen:52,armor:{f:17,s:13,r:10,t:17,top:9},crew:['driver','gunner'],col:0x5c6858,colT:0x475244,heavy:false,barrelL:2.7,hullL:5.2},
{name:'T-26(援华)',cls:'light',hp:640,spd:6.4,rev:3.4,turn:0.9,reload:5.0,tRate:0.6,dmg:250,pen:70,armor:{f:15,s:15,r:10,t:15,top:10},crew:['driver','gunner','commander'],col:0x556050,colT:0x424c3e,heavy:true,barrelL:3.0,hullL:5.4},
{name:'M3 斯图亚特(美援)',cls:'light',hp:620,spd:7.8,rev:4.0,turn:1.1,reload:3.8,tRate:0.7,dmg:200,pen:70,armor:{f:44,s:29,r:25,t:44,top:13},crew:['driver','gunner','commander'],col:0x5d7050,colT:0x475840,heavy:false,barrelL:2.6,hullL:4.8},],
trucks:[{name:'CCKW 十轮卡(援华)',hp:320,spd:9.2,rev:4.4,turn:1.1,seats:6,open:true,mg:false,col:0x5a6456}],
 planes:[{name:'霍克III',hp:95,spd:[15,29],rof:0.08,mgDmg:16,bombs:1,col:0x6f7a68,size:0.98},
 {name:'伊-16(援华)',hp:140,spd:[14,27],rof:0.085,mgDmg:19,bombs:2,col:0x5f6a58,size:1.05}] },
cpc:{ name:'八路军', short:'八路', sym:'✭', flagBg:'#b03030',
coat:0x777d72, pants:0x6d736a, helm:0x777d72, skin:0xc8a078, sleeve:0x6f756a, helmet:'cap', nade:'stick', atn5:4,
names:['李云龙','赵刚','王铁蛋','孙德胜','张大彪','魏和尚','段鹏','沈泉','邢志国','陈铁柱','石头','柱子','二娃','铁蛋'],
cls:[['hanyang','c96'],['c96auto','c96'],['type11','c96'],['zhongzhengs','c96'],['hanyang','c96'],['hanyang','c96'],['laotao','c96'],['laotao','c96']],
tanks:[{name:'九七式(缴获)',cls:'medium',hp:600,spd:6.6,rev:3.4,turn:0.95,reload:4.8,tRate:0.55,dmg:250,pen:86,armor:{f:47,s:25,r:20,t:47,top:12},crew:['driver','gunner','commander'],col:0x6d7268,colT:0x565b52,heavy:false,barrelL:2.9,hullL:5.4},
{name:'九五式(缴获)',cls:'light',hp:430,spd:7.6,rev:3.8,turn:1.1,reload:4.2,tRate:0.7,dmg:160,pen:42,armor:{f:12,s:12,r:10,t:12,top:9},crew:['driver','gunner'],col:0x687062,colT:0x51584c,heavy:true,barrelL:2.4,hullL:4.4},],
trucks:[{name:'改装民用卡车',hp:260,spd:8.6,rev:4.2,turn:1.1,seats:6,open:true,mg:false,civ:true,col:0x5e5a4a}],
 planes:[{name:'隼(缴获)',hp:150,spd:[14.5,28],rof:0.085,mgDmg:20,bombs:2,col:0x6f7a6a,size:1.12},
 {name:'九九式(缴获)',hp:140,spd:[13.5,26],rof:0.09,mgDmg:19,bombs:3,col:0x667062,size:1.15}] },
};
const TEAM_FACTION=[FACTIONS[CAMPAIGN.f[0]],FACTIONS[CAMPAIGN.f[1]]];
const TEAM_NAME=[TEAM_FACTION[0].short,TEAM_FACTION[1].short];
const TEAM_COL=[0x8fc1ff,0xff9c8a];
const MAP_SIZE=CAMPAIGN.mapSize||(CAMPAIGN.layout==='city'?420:360);
const MAP_HALF=MAP_SIZE/2, MAP_EDGE=MAP_HALF-8;
let BOTS_PER_TEAM=16;
// 撤离突袭小队编制: 玩家小队 4 人(玩家+3 AI), 敌方 3 支独立 4 人小队, 全场共 16 人 / 15 NPC
const FRIENDLY_SQUAD_COUNT=1;
const FRIENDLY_SQUAD_SIZE=4;
const FRIENDLY_BOT_COUNT=(FRIENDLY_SQUAD_SIZE-1)*FRIENDLY_SQUAD_COUNT;   // 3 个 AI 队友
// 敌方守备: 固定 12 人, 3 支 4 人独立小队 (忽略 CAMPAIGN.enemyBots, 保证全场 16 人)
let ENEMY_BOT_COUNT=12;
const ENEMY_SQUAD_COUNT=3;
const ENEMY_SQUAD_SIZE=4;
const START_TICKETS=330;
const US_NAMES=['米勒','雷本','杰克逊','霍瓦特','梅利什','厄本','韦德','卡帕佐','德尔安科','麦克','唐尼','史密斯','布鲁尔','泰勒'];
const GER_NAMES=['施泰纳','穆勒','克格勒','汉森','冯·克劳克','贝克','施密特','里希特','沃尔夫','凯撒','布劳恩','菲舍尔','霍夫曼','克鲁格'];
