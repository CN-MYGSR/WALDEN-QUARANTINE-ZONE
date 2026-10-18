'use strict';
// ===================== 战役 / 阵营 / 环境主题 =====================
// 每个战役: 独立地形结构(terr) + 独立布局(layout) + 专属玩法(mode) + 旗点/基地/道路/战壕
const CAMPAIGNS=[
{ id:'bfruins', title:'街区', sub:'废城巷战 · 逐屋清剿 · 搜刮带出', f:['usec','ger'], theme:'cqb', npcNeutral:true, allyBots:3, enemyBots:8,
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
{ id:'lab', title:'秘密实验室', sub:'地下生物设施 · 高价值物资 · PMC 守备', f:['usec','pmc'], theme:'lab', allyBots:3, enemyBots:8, dimLight:0.42,
 terr:'flat', layout:'lab', mode:'extract', atk:0, modeName:'撤离 · 实验室', mapSize:190,
 flags:[], bases:[{x:-72,z:0},{x:72,z:0}], sineRoad:false,
 roads:[], trench:[],
 mapName:'秘密实验室',
 mapTag:'铁砧地下层 · 高风险',
 mapDesc:'USEC 封存在铁砧地下三层的生物制剂设施。全封闭室内、照明几乎失效，走廊狭窄、房间密布。物资箱密度与稀有度大幅提升（芯片/名表/GPU/通行卡/医疗记录仪），但守备是 PMC 的合同精锐，更强、更快、更准。',
 mapLoot:'物资箱 ×22+ · 高价值密集',
 mapThreat:'守备强度 ★★★★☆',
 mapDiff:4,
 // 敌方强化倍率 (43_maps 读取, 与 NG+ prestige 叠加)
 botMul:{ enemyHp:1.28, enemyReact:0.74, enemySpread:0.72, friendHp:0.92 },
 extract:[{x:0,z:74}],
 lootSpots:[] },
{ id:'port', title:'港口', sub:'瓦尔登港 · 集装箱码头 · PMC 守备 · 出海唯一通道', f:['usec','pmc'], theme:'port', allyBots:3, enemyBots:12,
 terr:'harbor', layout:'port', mode:'extract', atk:0, modeName:'撤离 · 港口', mapSize:220,
 flags:[], bases:[{x:-70,z:-64},{x:-70,z:64}], sineRoad:false,
 roads:[[-70,-64,44,0],[-70,64,44,0],[-96,0,-40,0]], trench:[],
 mapName:'港口',
 mapTag:'瓦尔登港区 · 出海通道',
 mapDesc:'封锁前最后的出海通道。集装箱堆场被潮气和铁锈吃透，龙门吊还挂在岸线上，泊位外那艘船始终没有离港。箱列把视野切成一条条走廊，交火距离短、可绕行的方向也少。',
 mapLoot:'物资箱 ×18+ · 报关货物价值高',
 mapThreat:'守备强度 ★★★☆☆',
 mapDiff:3,
 // 敌方强化介于街区与实验室之间
 botMul:{ enemyHp:1.15, enemyReact:0.82, enemySpread:0.82, friendHp:0.96 },
extract:[{x:44,z:0}],
lootSpots:[] },
{ id:'airport', title:'瓦尔登机场', sub:'废弃国际机场 · 航站楼与货运区 · 资料/电子产品密集', f:['usec','pmc'], theme:'airport', allyBots:3, enemyBots:8,
terr:'flat', layout:'airport', mode:'extract', atk:0, modeName:'撤离 · 机场', mapSize:260,
flags:[], bases:[{x:-112,z:-46},{x:-112,z:46}], sineRoad:false,
// roads 只用于 roadDist() 的散布排除与小地图绘制, 不是铺装 —— 跑道/滑行道的实际铺装见 07f_airport
roads:[[-112,-46,-78,-26],[-112,46,-78,26],[-78,-26,-78,26],[-78,0,72,0]],
trench:[],
mapName:'瓦尔登机场',
mapTag:'废弃国际机场 · 高风险',
mapDesc:'封锁当天被放弃的国际机场。航站楼的玻璃幕墙碎了一半，值机岛、安检口与行李转盘还停在当天的样子；跑道尽头停着没来得及起飞的货机。这里的物资以文件、芯片、显卡、手机、卫星电话这类资料与电子产品为主 —— 轻、值钱、不占地方，也是封锁前最紧俏的硬通货。守备是 PMC 合同兵，比港口的更硬、更准。',
mapLoot:'物资箱 ×20+ · 资料 / 电子产品密集',
mapThreat:'守备强度 ★★★★☆',
mapDiff:4,
// 介于港口与实验室之间: 开阔地给了玩家机动空间, 所以守备比港口强、比实验室弱
botMul:{ enemyHp:1.22, enemyReact:0.78, enemySpread:0.76, friendHp:0.94 },
extract:[{x:116,z:0}],
lootSpots:[] },
// ===== 剧情模式专用地图 (必须追加在末尾: localStorage.sf_campaign 存的是索引) =====
{ id:'anvil_yard', title:'铁砧外围', sub:'剧情 · 第一章 · 工业堆场 · 找到竖井口', f:['usec','pmc'], theme:'anvil', allyBots:1, enemyBots:6,
 terr:'flat', layout:'anvil_yard', mode:'extract', atk:0, modeName:'剧情 · 铁砧外围', mapSize:210,
 flags:[], bases:[{x:-88,z:0},{x:88,z:0}], sineRoad:false,
 roads:[], trench:[],
 mapName:'铁砧外围',
 mapTag:'剧情 · 地表工业堆场',
 mapDesc:'NBK 打通地下封层的地方。锈蚀的围墙、四座厂房、成列集装箱，正中一座还在亮着红灯的钻井井架——井口就是通往铁砧的门。守备是 PMC 的合同兵，人不多但位置刁。',
 mapLoot:'物资箱 ×16 · 中低价值为主',
 mapThreat:'守备强度 ★★★☆☆',
 mapDiff:3,
 forceWeather:'anvilhaze',
 botMul:{ enemyHp:1.10, enemyReact:0.86, enemySpread:0.86, friendHp:0.98 },
 extract:[{x:0,z:92}] },
{ id:'anvil_b2', title:'铁砧 · B2 层', sub:'剧情 · 第二章 · 地下封存库 · 取回制剂样本', f:['usec','pmc'], theme:'anvilb2', allyBots:1, enemyBots:8, dimLight:0.34,
 terr:'flat', layout:'anvil_b2', mode:'extract', atk:0, modeName:'剧情 · 铁砧 B2', mapSize:170,
 flags:[], bases:[{x:-70,z:0},{x:70,z:0}], sineRoad:false,
 roads:[], trench:[],
 mapName:'铁砧 · B2 层',
 mapTag:'剧情 · 地下封存层',
 mapDesc:'华约封存、NBK 重新打开的第三层。中央十字大厅贯通四象限，北端是封存冷库——那一排低温罐里就是泄漏事故的源头。照明几乎全废，只有应急灯板还亮着。',
 mapLoot:'物资箱 ×20 · 高价值密集',
 mapThreat:'守备强度 ★★★★☆',
 mapDiff:4,
 forceWeather:'labhaze',
 botMul:{ enemyHp:1.24, enemyReact:0.78, enemySpread:0.76, friendHp:0.95 },
 extract:[{x:0,z:66}] },
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
const CAMPAIGN_WEATHER={rhine:'overcast',alps:'snow',delta:'storm',berlin:'overcast',moscow:'snow',bfruins:'overcast',lab:'labhaze',port:'seahaze',airport:'airporthaze',anvil_yard:'anvilhaze',anvil_b2:'labhaze'}[CAMPAIGN.id]||'overcast';
// ===== 天气模式: 战役界面选择, localStorage sf_weather =====
const WEATHER_MODES={clear:{name:'晴朗'},fog:{name:'迷雾'},rain:{name:'雨天'},storm:{name:'雷暴雨'},night:{name:'黑夜'},overcast:{name:'阴天'},dusk:{name:'黄昏'},
 // ⚠️ 下面 4 个不是玩家可选项, 而是 CAMPAIGN_WEATHER / CAMPAIGN.forceWeather 的取值。
 //    必须留在这张表里 —— 29_menus 会拿 WEATHER_MODE 直接查它 (缺了会让主菜单初始化抛错)。
 labhaze:{name:'地下浮尘'},seahaze:{name:'海雾'},airporthaze:{name:'清晨薄霾'},anvilhaze:{name:'工业尘霾'}};
// 2026-09-19: 天气改为**随机**（每局开始掷一次），玩家不再能选。
// 掷点权重: 晴朗/阴天常见, 雾与雨次之, 雷暴与黑夜稀有 —— 稀有感更强。
const WEATHER_POOL=[
 ['clear',18],['overcast',20],['dusk',12],['fog',14],
 ['rain',14],['storm',10],['night',12],
];
const WEATHER_MODE=(()=>{
 // 剧情章节可以固定天气 (CAMPAIGN.forceWeather) —— 绕过随机池, 让每章的气氛可控
 if(CAMPAIGN.forceWeather) return CAMPAIGN.forceWeather;
 let total=0; for(const p of WEATHER_POOL) total+=p[1];
 let r=Math.random()*total;
 for(const p of WEATHER_POOL){ r-=p[1]; if(r<=0) return p[0]; }
 return 'overcast';
})();
try{ localStorage.setItem('sf_weather_last',WEATHER_MODE); }catch(e){}
const WEATHER=WEATHER_MODE==='night'?'clear':(WEATHER_MODE!=='clear'?WEATHER_MODE:CAMPAIGN_WEATHER);
// 各天气的画面/视距参数: fogFar=雾远×, fogNear=雾近, sun/hemi=光照×, skyDark=天空压暗, sight=bot视距×
const WEATHER_FX={
clear:{fogFar:1,fogNear:40,sun:1,hemi:1,skyDark:0,sight:1},
// 2026-09-19 需求: 迷雾/雨天/雷暴**再次降低能见度** (fogFar 越小雾越近)
fog:{fogFar:0.13,fogNear:4,sun:0.36,hemi:0.5,skyDark:0.55,sight:0.28},
rain:{fogFar:0.46,fogNear:18,sun:0.5,hemi:0.68,skyDark:0.34,sight:0.55},
storm:{fogFar:0.32,fogNear:13,sun:0.38,hemi:0.55,skyDark:0.5,sight:0.42},
// ⚠️ sight 必须跟着亮度一起降: 夜晚玩家几乎看不见, AI 却全视距就是单方面挨打
night:{fogFar:1,fogNear:18,sun:1,hemi:1,skyDark:0,sight:0.18},
// CQB 专用: 阴天压低能见度, 黄昏/雾霾进一步压缩交火距离
// 注 1: 阴天/雷暴/雨天的光照强度由 12_weather_fx.js 顶部硬编码覆盖
// (overcast = KEY_BASE*0.55 + THEME.hemi[2]*1.15), 所以本表的 sun/hemi 对这三种天气不生效,
// 只有 fogFar/fogNear/skyDark 生效 —— 街区提亮必须改 THEMES.cqb, 它才是覆盖公式的输入。
// 注 2: sight 目前没有任何读取点 (唯一未被消费的字段), 保留以备后续接入 bot 视距。
overcast:{fogFar:0.62,fogNear:20,sun:0.42,hemi:0.55,skyDark:0.24,sight:0.55},
dusk:{fogFar:0.38,fogNear:9,sun:0.3,hemi:0.4,skyDark:0.52,sight:0.42},
// 秘密实验室专用: 地下设施的浮尘/制冷雾气 —— 能见度低、顶光几乎为零、色调被环境光压暗
// sight 0.45: 守备几乎不能远距发现玩家, 交火全部发生在走廊与房间内的近距离
labhaze:{fogFar:0.30,fogNear:7,sun:0.22,hemi:0.62,skyDark:0.62,sight:0.30},
// 港口专用: 海雾 —— 能见度比街区好(视野开阔), 但湿冷、压抑, 远处海面被雾吃掉
seahaze:{fogFar:0.42,fogNear:16,sun:0.38,hemi:0.5,skyDark:0.44,sight:0.5},
// 机场专用: 清晨的薄霾 —— 跑道是开阔地, 能见度必须比港口好(否则远距离狙击位形同虚设),
// 但航站楼与机库的轮廓被霾吃掉, 中远距离交火仍是主流
airporthaze:{fogFar:0.58,fogNear:28,sun:0.42,hemi:0.54,skyDark:0.30,sight:0.62},
// 铁砧外围专用: 工业尘霾 —— 比海雾更呛、比实验室亮, 钢构与堆场轮廓在中距被吃掉
anvilhaze:{fogFar:0.50,fogNear:22,sun:0.40,hemi:0.56,skyDark:0.40,sight:0.60}
};
// 注意: 必须取 WEATHER(已折算战役默认天气) 而非 WEATHER_MODE,
// 否则玩家未显式选天气时, 战役默认阴天/黄昏的能见度参数不会生效。
// ⚠️ 取副本而不是原表引用 —— 下面会按地图调暗, 直接改原表会污染整张表。
const WFX=Object.assign({}, WEATHER_FX[WEATHER]||WEATHER_FX.clear);
// 地图级微光: 与天气无关的固定压暗 (秘密实验室是地下设施, 任何天气都该是微光)
const MAP_DIM=Math.max(0,Math.min(1,CAMPAIGN.dimLight!=null?CAMPAIGN.dimLight:1));
if(MAP_DIM<1){
 WFX.sun*=MAP_DIM; WFX.hemi*=MAP_DIM;
 WFX.fogFar*=Math.max(0.25,MAP_DIM);
 WFX.fogNear=Math.max(3,WFX.fogNear*MAP_DIM);
 WFX.skyDark=Math.min(1,WFX.skyDark+(1-MAP_DIM)*0.5);
 // ⚠️ sight 也要乘 —— 实验室微光对 AI 一样成立, 否则它在微光里仍能远距发现玩家
 WFX.sight*=MAP_DIM;
}
// 河流 (进入地形生成)
const RIVER={
delta:{pts:[[-165,-30],[-70,-18],[-8,-38],[60,-10],[120,-30],[165,-14]],w:8,ice:false},
moscow:{pts:[[-165,-66],[-90,-30],[-24,-52],[52,-22],[110,-64],[165,-38]],w:8,ice:true},
// 港口: 东侧整片海面 —— 沿 x≈86 下切 26m 宽的水体, 岸线自然落在 x≈60
port:{pts:[[86,-118],[86,118]],w:26,ice:false},
}[CAMPAIGN.id]||null;
// 移动端自动检测 (触屏 + 粗指针)
const MOBILE=(()=>{
try{ return navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches; }catch(e){ return 'ontouchstart' in window; }
})();
// ===== 虚拟按键开关 TOUCHUI (2026-09-28) =====
// ⚠️ 为什么和 MOBILE 分开: MOBILE 只管「手机/平板」, 它还控制一整套 body.mobile 的移动端 UI 适配
//    (隐藏任务 HUD / 放大背包按钮…)。带触控屏的 PC 只是**缺虚拟按键**, 不该顺手改掉别的。
// 判定 = MOBILE(手机/平板) 或 「有触摸屏 + 检测不到键盘」。
// ⚠️ 浏览器没有「有没有键盘」的 API, 只能用两个近似信号:
//    ① 媒体查询 (hover:hover && pointer:fine): 能悬停 + 主指针精细的设备基本都配键盘/触控板
//    ② 运行时: 真的按下过物理键 → 一定有键盘 (见 31_touch 的 keydown 监听, 会写 sf_kb)
const HAS_TOUCH=(()=>{ try{ return (navigator.maxTouchPoints|0)>0||('ontouchstart' in window); }catch(e){ return false; } })();
const COARSE_PTR=(()=>{ try{ return matchMedia('(pointer:coarse)').matches; }catch(e){ return false; } })();
const KB_HINT=(()=>{ try{ return matchMedia('(hover:hover) and (pointer:fine)').matches; }catch(e){ return true; } })();
const TOUCHUI=(()=>{
 try{
  const ov=localStorage.getItem('sf_touch');
  if(ov==='1') return true;                       // 设置里强制常开
  if(ov==='0') return false;                      // 设置里强制常关
  if(MOBILE) return true;                          // 手机 / 平板
  return HAS_TOUCH&&!KB_HINT&&!localStorage.getItem('sf_kb');   // 触控屏 PC: 有触摸 + 没检测到键盘
 }catch(e){ return MOBILE; }
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
// ===== 废弃机场: 开阔地 + 大玻璃幕 + 混凝土/沥青 =====
// 调色思路: 天空是清晨的冷蓝灰(薄霾), 雾色偏白蓝 —— 开阔地必须留出足够远的视距,
// 否则跑道这种大尺度空间会失去意义; 地面几乎全被沥青(近黑)与混凝土(浅灰)覆盖,
// 所以 grassMul/treeN 压到极低(机场没有绿化, 只有跑道缝里的杂草)。
// 高饱和色只留给跑道标线(白)、滑行道引导线(黄)与塔台玻璃, 其余一律低饱和。
airport:{ sky:['#5b6a7c','#8a97a6','#b8c0c6','#c8ccce','#b8bdc0'], fog:0xbfc6cb,
hemi:[0xc6d0da,0x4e5258,0.66], sun:0xdcd8cc, sunI:1.35,
ground:0xb4b7b6, grassC:0x9aa08c, leaf:0x5f6a52, roof:0x8e9398, dead:0.9, ruinAdd:0.22,
rubbleN:12, snow:false, birds:true, treeN:6, grassMul:0.14, cqb:true, vigA:0.22 },
// ===== 剧情模式专用主题 =====
// 铁砧外围: 工业尘霾, 锈蚀混凝土 + 钢构, 几乎没有植被
anvil:{ sky:['#565b60','#7d8286','#9c988e','#a89f8e','#9a9284'], fog:0x9aa0a2, hemi:[0xc2c8ce,0x5a5a52,0.66], sun:0xffe6c4, sunI:1.55,
ground:0xc8c4bc, grassC:0x9a9a8c, leaf:0x6a6a58, roof:0x8e9398, dead:0.78, ruinAdd:0.34,
rubbleN:14, snow:false, birds:false, treeN:5, grassMul:0.12 },
// 铁砧 B2: 地下封存层, 只剩应急灯
anvilb2:{ sky:['#1c2026','#22272d','#282e34','#2c3238','#262c32'], fog:0x181c20, hemi:[0x8ea0b2,0x3a4046,0.40], sun:0xbfd0e0, sunI:0.45,
ground:0xffffff, grassC:0xffffff, leaf:0xffffff, roof:0xffffff, dead:0.9, ruinAdd:0.2,
rubbleN:6, snow:false, birds:false, treeN:0, grassMul:0 }
};
const THEME=THEMES[CAMPAIGN.theme];
// ===== 夜战: 由天气模式(黑夜)或旧版 sf_night 开关, 切换后重载重建世界 =====
const NIGHT = WEATHER_MODE==='night' || localStorage.getItem('sf_night')==='1';
function weatherSkyStop(c,f){ // 天空色整体压暗偏灰 (迷雾/雨/雷暴)
  const n=parseInt(c.slice(1),16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  const rr=Math.round(r*(1-f)+128*f*0.6), gg=Math.round(g*(1-f)+128*f*0.6), bb=Math.round(b*(1-f)+134*f*0.6);
  return '#'+((1<<24)|(rr<<16)|(gg<<8)|bb).toString(16).slice(1);
}
// 2026-09-19 需求: 夜晚亮度再降 —— 雾色更深、环境光更弱、主光只剩一点点
const NIGHT_FOG = 0x05080f;
const NIGHT_HEMI = [0x16203a, 0x04060c, 0.16];
const NIGHT_SUN = 0x8aa2cc;
// 昼/夜统一的主方向光基准强度 (天气系统按它乘系数)
const KEY_BASE = NIGHT ? THEME.sunI*0.055 : THEME.sunI;
function nightSkyStop(c){ // 昼间天空色压暗偏蓝 → 夜战天空渐变
  const n=parseInt(c.slice(1),16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  const rr=Math.round(r*0.14+14), gg=Math.round(g*0.15+18), bb=Math.round(b*0.2+42);
  return '#'+((1<<24)|(rr<<16)|(gg<<8)|bb).toString(16).slice(1);
}
const FACTIONS={
us:{ name:'SCAV 拾荒者', short:'SCAV', sym:'☠', flagBg:'#3a5f9e', atn5:3, scav:true,
coat:0x4c5a4a, pants:0x8a7f5e, helm:0x4a5240, skin:0xc09878, sleeve:0x4d5240, helmet:'mod', nade:'egg',
names:['米勒','雷本','杰克逊','霍瓦特','梅利什','厄本','韦德','卡帕佐','德尔安科','麦克','唐尼','史密斯','布鲁尔','泰勒'],
cls:[['m4','p320'],['m24','p320'],['mp5','p320'],['m4','p320'],['mp5','p320']],
 },
// ===== 德国联邦国防军 (街区守备) =====
ger:{ name:'德国联邦国防军', short:'德军', sym:'✠', flagBg:'#8a2020', atn5:3,
coat:0x545c50, pants:0x46484e, helm:0x3e4246, skin:0xc8a080, sleeve:0x4a4d52, helmet:'mod', nade:'egg',
names:['施泰纳','穆勒','克格勒','汉森','冯·克劳克','贝克','施密特','里希特','沃尔夫','凯撒','布劳恩','菲舍尔','霍夫曼','克鲁格'],
cls:[['g36c','g17'],['g28','g17'],['mp5','g17'],['g36c','g17'],['mp5','g17']],
 },
// ===== PMC 私人军事承包商 (实验室/港口守备, 也可作为玩家阵营) =====
// 土黄承包商配色, 与 USEC(全黑) / 德军(灰绿) / SCAV(橄榄) 一眼可区分; 纯步兵, 不带载具。
pmc:{ name:'PMC 私人军事承包商', short:'PMC', sym:'◆', flagBg:'#6b5a2a', atn5:3,
coat:0x6b6247, pants:0x5a5340, helm:0x4e4838, skin:0xc8a080, sleeve:0x635b42, helmet:'mod', nade:'egg',
names:['施泰纳','穆勒','克格勒','汉森','冯·克劳克','贝克','施密特','里希特','沃尔夫','凯撒','布劳恩','菲舍尔','霍夫曼','克鲁格'],
cls:[['g36c','g17'],['g28','g17'],['mp5','g17'],['g36c','g17'],['mp5','g17']],
},
 rus:{ name:'俄罗斯联邦武装力量', short:'俄军', sym:'☭', flagBg:'#3a7a3a',
 coat:0x555f4e, pants:0x4a5238, helm:0x3e4436, skin:0xc8a080, sleeve:0x4e5748, helmet:'mod', nade:'egg', atn5:3,
 names:['伊万诺夫','彼得罗夫','瓦西里耶夫','斯米尔诺夫','库兹涅佐夫','索科洛夫','波波夫','列别捷夫','科兹洛夫','诺维科夫','莫罗佐夫','费多罗夫','沃尔科夫','索洛维约夫'],
 cls:[['ak74m','pyat'],['svd','pyat'],['pp19','pyat'],['ak74m','pyat'],['pp19','pyat']],
 },
sov:{ name:'苏联红军', short:'苏军', sym:'☭', flagBg:'#b03030',
coat:0x6b6a4f, pants:0x5c5a42, helm:0x515c3e, skin:0xc8a080, sleeve:0x62614a, helmet:'ssh', nade:'stickS',
names:['伊万诺夫','彼得罗夫','瓦西里','安德烈','谢尔盖','德米特里','尼古拉','阿列克谢','米哈伊尔','尤里','奥列格','弗拉基米尔','康斯坦丁','格里高利'],
cls:[['mosin','tt33'],['ppsh','tt33'],['dp28','tt33'],['mosinpu','tt33'],['mosin','tt33'],['mosin','tt33'],['m38carb','tt33'],['m38carb','tt33']],
 },
fin:{ name:'芬兰国防军', short:'芬军', sym:'❂', flagBg:'#2a4a9e',
coat:0x777c72, pants:0x6b7066, helm:0x737872, skin:0xc8a080, sleeve:0x71766c, helmet:'ssh', nade:'egg',
names:['海基宁','西米莱','科斯基','莱赫托','马基宁','涅米宁','维尔塔宁','拉赫蒂','图奥米','萨洛','劳塔宁','库西宁','阿尔托','拉明恩'],
cls:[['finmosin','l35'],['suomi','l35'],['suomi','l35'],['finmosins','l35'],['finmosin','l35'],['finmosin','l35'],['finmosin','l35'],['finmosin','l35']],
 },
jp:{ name:'日本帝国陆军', short:'日军', sym:'☀', flagBg:'#8a2020',
coat:0x7a6f4a, pants:0x6e6444, helm:0x60593a, skin:0xc8a078, sleeve:0x6f6543, helmet:'jp', nade:'egg',
names:['田中','佐藤','铃木','高桥','渡边','伊藤','山本','中村','小林','加藤','吉田','山田','佐佐木','松本'],
cls:[['arisaka','nambu'],['type100','nambu'],['type96','nambu'],['type97s','nambu'],['arisaka','nambu'],['arisaka','nambu'],['type38c','nambu'],['type38c','nambu']],
 },
kmt:{ name:'国民革命军', short:'国军', sym:'✷', flagBg:'#2050b0',
coat:0x5a6a72, pants:0x52606a, helm:0x46525a, skin:0xc8a078, sleeve:0x53626b, helmet:'stahl', nade:'stick',
names:['王大山','李长贵','张铁柱','刘志','陈国栋','杨得胜','赵铁牛','黄浦生','周卫国','吴天亮','徐虎','孙立','马汉山','胡铁军'],
cls:[['zhongzheng','c96'],['mp18','c96'],['zb26','c96'],['zhongzhengs','c96'],['hanyang','c96'],['zhongzheng','c96'],['laotao','c96'],['laotao','c96']],
 },
cpc:{ name:'八路军', short:'八路', sym:'✭', flagBg:'#b03030',
coat:0x777d72, pants:0x6d736a, helm:0x777d72, skin:0xc8a078, sleeve:0x6f756a, helmet:'cap', nade:'stick', atn5:4,
names:['李云龙','赵刚','王铁蛋','孙德胜','张大彪','魏和尚','段鹏','沈泉','邢志国','陈铁柱','石头','柱子','二娃','铁蛋'],
cls:[['hanyang','c96'],['c96auto','c96'],['type11','c96'],['zhongzhengs','c96'],['hanyang','c96'],['hanyang','c96'],['laotao','c96'],['laotao','c96']],
 },
// ===== USEC 联合安保 (SWAT 风) =====
// 设计与既有机能匹配: coat/pants/helm/skin + sleeve/coat 用于模型材质 (16_soldier 顶部 uniformMats),
// helmet='mod' 走通用战术盔外形, nade='egg' 用美式手雷。cls 是 Bot 出生时的武器组合表。
// 这是 4-6 人小队的"合同雇佣兵", 没有坦克/卡车/战机, 完全步兵守备。
usec:{ name:'USEC 联合安保', short:'USEC', sym:'✠', flagBg:'#0a0a0a',
 coat:0x181818, pants:0x101010, helm:0x050505, skin:0x8a7060, sleeve:0x1a1a1a,
 helmet:'mod', nade:'egg', atn5:3,
 names:['格里尔','哈洛威','沃尔科娃','布雷克','塔克','哈格蒂','邓恩','洛根','桑托斯','里维拉','克罗斯','范德','兰格','丹尼尔斯','尤金','瓦伦'],
 // USEC 统一装备 M4 + P320: 所有 6 槽都是同一套, 让 USEC 走 numeric cls 路径时全员统一武器
 cls:[['m4','p320'],['m4','p320'],['m4','p320'],['m4','p320'],['m4','p320'],['m4','p320']],
 },
};
// ===== 阵营选择: 玩家扮演 USEC 还是 PMC =====
// 玩家永远是 team 0; 「选择阵营」栏改的是 team 0 到底是哪一方, 敌方由战役配置的 f[1] 决定
// (街区 = 德军, 实验室/港口 = PMC)。选择存 localStorage, 切换后整页重载,
// 这样 TEAM_FACTION / 制服配色 / 地图卡片 / 兵种卡全部按新阵营重算, 不留半旧状态。
const PLAYABLE_FACTIONS=['usec','pmc'];
const FACTION_PICK=(()=>{
try{ const k=localStorage.getItem('sf_faction'); return PLAYABLE_FACTIONS.includes(k)?k:PLAYABLE_FACTIONS[0]; }catch(e){ return PLAYABLE_FACTIONS[0]; }
})();
// 玩家恰好选了本图守备方时(例如在实验室选了 PMC)自动把敌方换成另一方, 避免同阵营内战
const _foeKey=(CAMPAIGN.f[1]===FACTION_PICK)?PLAYABLE_FACTIONS.find(k=>k!==FACTION_PICK):CAMPAIGN.f[1];
const TEAM_FACTION=[FACTIONS[FACTION_PICK],FACTIONS[_foeKey]];
const TEAM_NAME=[TEAM_FACTION[0].short,TEAM_FACTION[1].short];
const TEAM_COL=[0x8fc1ff,0xff9c8a];
// 中立 NPC 开关: 战役带 npcNeutral 标记时(街区), 全场 NPC 互不主动交火,
// 只在被攻击后对该攻击者(连同其同小队)还击。消费点见 19_bot.js 的 aggroOk/aggroOn。
// 用 var 而非 const: 方便其它脚本 typeof 探测, 也避免重名时抛 already declared。
var NPC_NEUTRAL=!!CAMPAIGN.npcNeutral;
const MAP_SIZE=CAMPAIGN.mapSize||(CAMPAIGN.layout==='city'?420:360);
const MAP_HALF=MAP_SIZE/2, MAP_EDGE=MAP_HALF-8;
// 编制: 由每张地图的 CAMPAIGNS 决定 (2026-09-18 用户要求「不要在对局前选人数」)。
// 我方固定 4 人(玩家 + 3 AI); 敌方按地图: 街区/实验室/机场 8 人, 港口 12 人。
const FRIENDLY_SQUAD_COUNT=1;
const FRIENDLY_SQUAD_SIZE=4;
let FRIENDLY_BOT_COUNT=(CAMPAIGN.allyBots!=null)?CAMPAIGN.allyBots:(FRIENDLY_SQUAD_SIZE-1)*FRIENDLY_SQUAD_COUNT;   // 3 个 AI 队友
// 敌方守备: 按地图编制拆成 4 人独立小队
let ENEMY_BOT_COUNT=(CAMPAIGN.enemyBots!=null)?CAMPAIGN.enemyBots:8;
const ENEMY_SQUAD_COUNT=Math.max(1,Math.ceil(ENEMY_BOT_COUNT/4));
const ENEMY_SQUAD_SIZE=4;
const START_TICKETS=330;
const US_NAMES=['米勒','雷本','杰克逊','霍瓦特','梅利什','厄本','韦德','卡帕佐','德尔安科','麦克','唐尼','史密斯','布鲁尔','泰勒'];
const GER_NAMES=['施泰纳','穆勒','克格勒','汉森','冯·克劳克','贝克','施密特','里希特','沃尔夫','凯撒','布劳恩','菲舍尔','霍夫曼','克鲁格'];
