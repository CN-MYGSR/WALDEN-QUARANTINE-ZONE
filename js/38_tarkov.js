'use strict';
// ===================== 塔科夫化系统 =====================
// 部位血量 / 出血骨折 / 医疗品 / 食物 / 水分保食度 / 搜尸面板(F+方向键) /
// 背包容重 / 保险 / 市集交易 / 货币改枪工坊 / NVG 装备化
// 本文件在 37_meta.js 之后加载, 以下物品与经济 API 为最终统一版本。

// ---------- 部位 ----------
const BODY_DEFS={
head:{name:"头部",hp:35},
thorax:{name:"胸部",hp:85},
stomach:{name:"胃部",hp:70},
armL:{name:"左臂",hp:60},
armR:{name:"右臂",hp:60},
legL:{name:"左腿",hp:65},
legR:{name:"右腿",hp:65}
};
const BODY_ORDER=["head","thorax","stomach","armL","armR","legL","legR"];
const SECURE_SLOTS=4;
// 血量上限(全身总血量) = 各部位之和 = 440
// 头部35 + 胸部85 + 胃部70 + 左臂60 + 右臂60 + 左腿65 + 右腿65
// 由 BODY_DEFS 自动推导, 调部位数值时无需同步改这里
const BODY_TOTAL_HP=BODY_ORDER.reduce((a,k)=>a+BODY_DEFS[k].hp,0);

// ---------- 医疗品 (取代原绷带/夹板) ----------
// uses: 单件可用次数 · utime: 使用耗时(秒) · heal: 各部位恢复量
const MED_DEFS={
tourniquet:{name:"止血带",size:1,weight:0.2,price:260,utime:4.5,uses:1,treat:"bleed",desc:"止住轻度/重度出血"},
painkiller:{name:"止痛药",size:1,weight:0.1,price:240,utime:2.0,uses:1,treat:"pain",desc:"180 秒止痛 · 失血减缓 · 移速 +11% · 散布 -22%"},
antibiotic:{name:"抗生素",size:1,weight:0.15,price:380,utime:3.5,uses:1,treat:"infection",desc:"清除内出血"},
morphine:{name:"吗啡",size:1,weight:0.1,price:620,utime:3.0,uses:1,treat:"pain2",desc:"300 秒强效止痛 · 失血大减 · 移速 +19% · 散布 -40%"},
adrenaline:{name:"肾上腺素",size:1,weight:0.1,price:540,utime:1.5,uses:1,treat:"stim",desc:"体力全回 · 25 秒不消耗体力"},
medkit:{name:"医疗包",size:1,weight:0.7,price:680,utime:5.0,uses:3,treat:"heal",desc:"各部位恢复 45 点 · 止轻度出血"},
cms:{name:"手术包",size:1,weight:1.4,price:1750,utime:9.0,uses:2,treat:"black",desc:"黑色肢体恢复至 30% · 正骨折 · 止重度出血"}
};

// ---------- 食物 (恢复水分/保食度) ----------
const FOOD_DEFS={
water:{name:"矿泉水",size:1,weight:0.6,price:90,utime:2.5,water:65,food:5,desc:"补水主力 · 微量饱食"},
juice:{name:"果汁",size:1,weight:0.8,price:160,utime:3.0,water:45,food:15,desc:"补水兼补充热量"},
beer:{name:"啤酒",size:1,weight:0.9,price:120,utime:3.0,water:30,food:10,desc:"劣质补给 · 补水效率低"},
noodles:{name:"方便面",size:1,weight:0.5,price:180,utime:6.0,water:15,food:40,desc:"需要下咽时间 · 热量可观"},
cannedmeat:{name:"肉罐头",size:1,weight:0.6,price:320,utime:6.0,water:5,food:55,desc:"高热量主食"},
biscuit:{name:"压缩饼干",size:1,weight:0.3,price:150,utime:4.0,water:0,food:45,desc:"轻量高热量"},
chocolate:{name:"巧克力",size:1,weight:0.15,price:130,utime:2.0,water:3,food:25,desc:"快速零食"},
milk:{name:"炼乳",size:1,weight:0.4,price:220,utime:3.5,water:10,food:35,desc:"高糖 · 饱食补水兼顾"}
};

// ---------- 杂物 / 贵重物资 ----------
const MISC_DEFS={
cig:{name:"香烟",size:1,weight:0.1,price:210,tier:1,desc:"黑市硬通货"},
screwdriver:{name:"螺丝刀",size:1,weight:0.4,price:130,tier:1,desc:"基础五金工具"},
wrench:{name:"扳手",size:1,weight:0.8,price:190,tier:1,desc:"维修用五金工具"},
disinfectant:{name:"消毒液",size:1,weight:0.6,price:260,tier:1,desc:"医用化学品"},
creditcard:{name:"信用卡",size:1,weight:0.05,price:480,tier:2,desc:"还能刷的旧时代卡片"},
radio:{name:"对讲机",size:1,weight:0.3,price:380,tier:2,desc:"军规通讯器材"},
detonator:{name:"雷管",size:1,weight:0.3,price:720,tier:2,desc:"爆破作业元件"},
phone:{name:"手机",size:1,weight:0.2,price:850,tier:3,desc:"存储芯片值钱"},
dogtag:{name:"狗牌",size:1,weight:0.05,price:260,tier:1,desc:"击杀凭证, 商人高价收购"},
coffee:{name:"咖啡罐",size:1,weight:0.5,price:240,tier:1,desc:"黑市抢手货"},
gasoline:{name:"汽油桶",size:2,weight:4.5,price:640,tier:2,desc:"工业燃料 · 沉重"},
battery:{name:"汽车蓄电池",size:2,weight:6.0,price:1350,tier:2,desc:"沉重高价"},
tools:{name:"工具套装",size:2,weight:3.0,price:780,tier:2,desc:"成套维修工具"},
chip:{name:"电子芯片",size:1,weight:0.1,price:900,tier:3,desc:"稀有电子元件"},
watch:{name:"机械名表",size:1,weight:0.1,price:1650,tier:3,desc:"贵重收藏品"},
satphone:{name:"卫星电话",size:1,weight:1.2,price:2100,tier:4,desc:"战区外仍可通讯"},
docs:{name:"机密文件",size:1,weight:0.05,price:2000,tier:4,desc:"密封的军方档案"},
gpu:{name:"图形处理器",size:1,weight:0.3,price:2400,tier:4,desc:"顶级电子物资"},
keycard:{name:"通行卡",size:1,weight:0.05,price:2800,tier:5,desc:"通往高价值区域"},
ledx:{name:"医疗记录仪",size:1,weight:0.2,price:3200,tier:5,desc:"实验室级器材"},
// 2026-09-19: 删掉旧的 'nvg' 杂物条目 —— 它与下面的 NVG_DEFS.nvg 重复, 且 itemPriceOf/itemDescOf/itemName
// 的 MISC 分支都排在 NVG_DEFS 之前 → 会抢先命中, 于是「原夜视仪」是 ¥2200 / 杂物风格描述,
// 而新增的 nvg_pano/nvg_thermal 走 NVG_DEFS (¥6200 / ¥9800) → 三型表现不一致。
// 夜视仪现在**只由 NVG_DEFS 定义**; 老存档的 META.owned.nvg 与 TRADE_KEYS 里的 'nvg' 键都不受影响。
pass:{name:"撤离通行证",size:1,weight:0.05,price:12000,tier:5,desc:"瓦尔登港的船票 · 完成全部任务后可购买 · 只在「港口」有效：持证从港口撤离点登船即完成「离开禁区」，解锁结局并可重生 · 其他地图持证没有作用（不消耗、不解锁结局）· 用掉时消耗一张"}
};

// ---------- 背包 ----------
const PACK_DEFS={
// 2026-09-19: 改用真实型号名, 容量按需求重排为 16 / 20 / 30 / 40
// ⚠️ 键名保持不变 —— 老存档的 META.loadout.pack / owned 里存的是这些 key
packSmall:{name:"Flyye MBSS 背包",size:5,weight:1.2,price:620,tier:1,slots:16,desc:"通用迷彩 · 容量 16 格"},
packAssault:{name:"LBT-8005A Day Pack 背包",size:6,weight:2.2,price:1500,tier:2,slots:20,desc:"黑系复合迷彩 · 容量 20 格"},
packRaid:{name:"Gruppa 99 T30 背包",size:8,weight:3.6,price:3400,tier:3,slots:30,desc:"复合迷彩 · 容量 30 格"},
packTT45:{name:"Tasmanian Tiger Modular Pack 45 Plus 模块化背包",size:9,weight:4.8,price:6200,tier:5,slots:40,desc:"黑色 · 容量 40 格"}
};
// 仓库列背包用 (PACK_DEFS 定义在本文件, 所以列表函数也放这里)
function ownedPackList(){ return Object.keys(META.owned).filter(k=>PACK_DEFS[k]&&META.owned[k]>0); }

// ---------- 胸挂 (2026-09-19) ----------
// 与背包共存, 容量相加; 但**只收尺寸 <= CHEST_MAX_SIZE 的物品**。
// 用途: 容量大但塞不进大件 —— 想让玩家为"带大件还是带一堆小件"做取舍。
const CHEST_MAX_SIZE=2;
const CHEST_DEFS={
chest56:{name:"56式胸挂",color:"",hex:0x6b6a4a,size:3,weight:0.8,price:900,tier:1,slots:10,desc:"容量 10 格 · 仅收 ≤2 格物品"},
chestBH:{name:"Blackhawk! Commando 胸挂",color:"游骑兵黄",hex:0xc8a03c,size:3,weight:1.1,price:2200,tier:2,slots:16,desc:"容量 16 格 · 仅收 ≤2 格物品"},
chestMK3:{name:"WARTECH MK3 TV-104 胸挂",color:"黑",hex:0x1c1c1c,size:4,weight:1.6,price:4200,tier:4,slots:25,desc:"容量 25 格 · 仅收 ≤2 格物品"}
};
function ownedChestList(){ return Object.keys(META.owned).filter(k=>CHEST_DEFS[k]&&META.owned[k]>0); }

// ---------- 夜视仪 (2026-09-19) ----------
// 三档: 普通 / 全景(视野更大) / 热成像(只把 NPC 标红, 其余同普通)。
//   fov   开启时的相机视场角 (越大越"全景")
//   gain  着色器 uGain 倍率 —— 这就是"ISO"
//   boost 场景光/曝光增强倍率 (实验室那种微光地图靠它提亮)
const NVG_DEFS={
 nvg:        {name:'PVS-14 单目夜视仪', size:2, weight:0.4, price:2600, fov:94,  gain:1.00, boost:1.00, thermal:false, desc:'绿/蓝/白三色滤镜 · 夜间增强 · 白天过曝'},
 nvg_pano:   {name:'GPNVG-18 全景夜视仪', size:2, weight:0.7, price:6200, fov:118, gain:1.15, boost:1.10, thermal:false, desc:'四目全景 · 视野明显更宽 (118°)'},
 nvg_thermal:{name:'T-7 热成像仪', size:3, weight:1.0, price:9800, fov:78,  gain:1.35, boost:1.25, thermal:true,  desc:'把 NPC 标成红色方框 · 其余同普通夜视仪'},
};
function ownedNvgList(){ return Object.keys(META.owned).filter(k=>NVG_DEFS[k]&&META.owned[k]>0); }
// 型号合法性收口: 存档里的型号必须真存在。37_meta 的迁移只能做类型判断(它加载更早, 看不到 NVG_DEFS),
// 所以真正「型号是否存在」的校验放在这里。
if(META.loadout.nvg&&!NVG_DEFS[META.loadout.nvg]) META.loadout.nvg='';

// ---------- 物品通用属性 (统一 API: 武器/护甲/医疗/食物/杂物/背包/NVG) ----------
function itemSizeOf(key){
if(WPN_DEFS[key]) return 6;
if(ARMOR_DEFS[key]) return 4;
if(HELMET_DEFS[key]) return 3;
if(HEADSET_DEFS[key]) return 2;
if(CHEST_DEFS[key]) return CHEST_DEFS[key].size||3;
if(NVG_DEFS[key]) return NVG_DEFS[key].size||2;
if(MED_DEFS[key]) return 1;
if(FOOD_DEFS[key]) return 1;
if(MISC_DEFS[key]) return MISC_DEFS[key].size||1;
if(PACK_DEFS[key]) return PACK_DEFS[key].size||5;
return 1;
}
function itemWeightOf(key){
if(WPN_DEFS[key]){ const d=WPN_DEFS[key]; return d.pistol?1.1:Math.round((2.6+(d.dmg||20)*0.05)*10)/10; }
if(ARMOR_DEFS[key]) return ARMOR_DEFS[key].weight||3;
if(HELMET_DEFS[key]) return HELMET_DEFS[key].weight||2;
if(HEADSET_DEFS[key]) return HEADSET_DEFS[key].weight||0.4;
if(CHEST_DEFS[key]) return CHEST_DEFS[key].weight||1;
if(NVG_DEFS[key]) return NVG_DEFS[key].weight||0.5;
if(MED_DEFS[key]) return MED_DEFS[key].weight||0.2;
if(FOOD_DEFS[key]) return FOOD_DEFS[key].weight||0.3;
if(MISC_DEFS[key]) return MISC_DEFS[key].weight||0.3;
if(PACK_DEFS[key]) return PACK_DEFS[key].weight||1;
return 0.5;
}
function itemPriceOf(key){
if(MED_DEFS[key]) return MED_DEFS[key].price;
if(FOOD_DEFS[key]) return FOOD_DEFS[key].price;
if(MISC_DEFS[key]) return MISC_DEFS[key].price;
if(PACK_DEFS[key]) return PACK_DEFS[key].price;
if(CHEST_DEFS[key]) return CHEST_DEFS[key].price;
if(NVG_DEFS[key]) return NVG_DEFS[key].price;
return ITEM_PRICES[key]||0;
}
function itemLabel(key){
if(MED_DEFS[key]) return MED_DEFS[key].name;
if(FOOD_DEFS[key]) return FOOD_DEFS[key].name;
if(MISC_DEFS[key]) return MISC_DEFS[key].name;
if(PACK_DEFS[key]) return PACK_DEFS[key].name;
if(typeof itemName==="function") return itemName(key);
return key;
}
// 覆盖 37_meta 版本: 收购价 45%, 医疗/食物等一律适用
function itemSellPrice(key){
if(MED_DEFS[key]||FOOD_DEFS[key]||MISC_DEFS[key]||PACK_DEFS[key]||CHEST_DEFS[key]||NVG_DEFS[key]) return Math.max(15,Math.floor(itemPriceOf(key)*0.45));
if(WPN_DEFS[key]||ARMOR_DEFS[key]||HELMET_DEFS[key]||HEADSET_DEFS[key]) return Math.max(1,Math.floor((ITEM_PRICES[key]||0)*0.45));
return 15;
}
function itemDescOf(key){
if(MED_DEFS[key]){ const d=MED_DEFS[key]; return d.desc+" · 使用 "+d.utime+"s"+(d.uses>1?" · "+d.uses+" 次":""); }
if(FOOD_DEFS[key]){ const d=FOOD_DEFS[key]; return d.desc+" · 水+"+d.water+" 食+"+d.food+" · 食用 "+d.utime+"s"; }
if(MISC_DEFS[key]) return "物资 · 占 "+MISC_DEFS[key].size+" 格 · 重 "+MISC_DEFS[key].weight+"kg · "+MISC_DEFS[key].desc;
if(PACK_DEFS[key]) return PACK_DEFS[key].desc+" · 重 "+PACK_DEFS[key].weight+"kg";
if(CHEST_DEFS[key]) return CHEST_DEFS[key].desc+" · 重 "+CHEST_DEFS[key].weight+"kg";
if(NVG_DEFS[key]) return NVG_DEFS[key].desc+" · 视野 "+NVG_DEFS[key].fov+"° · ISO ×"+NVG_DEFS[key].gain+" · 重 "+NVG_DEFS[key].weight+"kg";
if(HEADSET_DEFS[key]){ const e=HEADSET_DEFS[key]; return `耳机 · 听力范围 ${e.range}m · 脚步/枪声 ×${e.amp} · 环境音 ×${e.ambient} · ${e.earMuff?'耳罩式(与 Altyn 冲突)':'入耳式(兼容 Altyn)'}`; }
if(HELMET_DEFS[key]){ const h=HELMET_DEFS[key]; return `头盔 Lv${h.level} · 护头耐久 ${h.hp} · 减伤 ${Math.round(h.resist*100)}% · 重量 ${h.weight}`; }
if(ARMOR_DEFS[key]){ const a=ARMOR_DEFS[key]; return `护甲 Lv${a.level} · 胸腹耐久 ${a.hp} · 减伤 ${Math.round(a.resist*100)}% · 重量 ${a.weight}`; }
const d=WPN_DEFS[key];
return d?`${d.mode} · 伤害 ${d.dmg} · 弹匣 ${d.mag} / 备弹 ${d.reserve}`:'';
}
// 覆盖 37_meta 版本: 全物品统一名称/分类/价格/描述
function itemName(key){
if(WPN_DEFS[key]) return WPN_DEFS[key].name;
if(ARMOR_DEFS[key]) return ARMOR_DEFS[key].name;
if(HELMET_DEFS[key]) return HELMET_DEFS[key].name;
if(HEADSET_DEFS[key]) return HEADSET_DEFS[key].name+' '+HEADSET_DEFS[key].color;
if(MED_DEFS[key]) return MED_DEFS[key].name;
if(FOOD_DEFS[key]) return FOOD_DEFS[key].name;
if(MISC_DEFS[key]) return MISC_DEFS[key].name;
if(PACK_DEFS[key]) return PACK_DEFS[key].name;
if(CHEST_DEFS[key]) return CHEST_DEFS[key].name+(CHEST_DEFS[key].color?(' '+CHEST_DEFS[key].color):'');
if(NVG_DEFS[key]) return NVG_DEFS[key].name;
return '未知物品';
}
function itemKind(key){
if(WPN_DEFS[key]) return 'weapon';
if(ARMOR_DEFS[key]) return 'armor';
if(HELMET_DEFS[key]) return 'helmet';
if(HEADSET_DEFS[key]) return 'headset';
if(MED_DEFS[key]) return 'med';
if(FOOD_DEFS[key]) return 'food';
if(MISC_DEFS[key]) return 'misc';
if(PACK_DEFS[key]) return 'pack';
if(CHEST_DEFS[key]) return 'chest';
if(NVG_DEFS[key]) return 'gear';
return 'misc';
}
function itemPrice(key){ return ITEM_PRICES[key]||itemPriceOf(key); }
function itemDesc(key){ return itemDescOf(key); }
function itemIconOf(key){
const k=itemKind(key);
if(k==='armor') return '🛡';
if(k==='helmet') return '🪖';
if(k==='headset') return '🎧';
if(k==='weapon') return '🔫';
if(k==='med') return '✚';
if(k==='food') return '🍖';
if(k==='pack') return '🎒';
if(k==='chest') return '🦺';
if(NVG_DEFS[key]) return '🌙';
if(k==='gear') return '◐';
return '📦';
}

// ---------- 局外交易目录 (市集) ----------
const TRADE_KEYS=[
...Object.keys(FOOD_DEFS),
...Object.keys(MED_DEFS),
'cig','screwdriver','wrench','disinfectant','creditcard','radio','detonator','phone','dogtag','coffee','gasoline','battery','tools','chip','watch','satphone','docs','gpu','keycard','ledx',
'packSmall','packAssault','packRaid','packTT45','chest56','chestBH','chestMK3',
'nvg','nvg_pano','nvg_thermal','pass'
];

// ---------- 部位血量初始化 ----------
function initRaidBody(p,opt){
const armor=(opt&&opt.armor)||{level:0,hp:0,resist:0};
const bonus=(armor.level>=4)?8:((armor.level>=2)?4:0);
p._thoraxBonus=bonus;
p.body={};
for(const k of BODY_ORDER){
const mx=(k==="thorax")?(BODY_DEFS.thorax.hp+bonus):BODY_DEFS[k].hp;
p.body[k]={hp:mx,max:mx};
}
// 总血量语义: p.maxHp = 全身总血量上限(440 + 护甲胸甲加成), p.hp = 各部位当前之和
p.maxHp=BODY_TOTAL_HP+bonus;
p.hp=p.maxHp;
p.limbs={head:100,arms:100,torso:100,legs:100};
p.armorDur=armor.hp||0; p.armorMax=armor.hp||0;
p.armorResist=armor.resist||0;
 // 头盔: 独立耐久, 只吃头部伤害
 p.helmetDur=(p.helmetDef&&p.helmetDef.hp)||0; p.helmetMax=p.helmetDur;
 p.helmetResist=(p.helmetDef&&p.helmetDef.resist)||0;
p.bleedLight=0; p.bleedHeavy=0; p.fractures=[]; p.blacked={};
p.painT=0; p.painPow=0; p.medUseT=0; p.medSel="";
p.hydration=100; p.satiety=100; p.stimT=0;
p.medItems=(RUN.medItems||[]).slice();
p.foodItems=(RUN.foodItems||[]).slice();
p.foodSel=0;
p._armorBroke=false; p.bleedTick=0;
tkSyncLegacy(p);
}
// ---------- 总血量 (上限 440) ----------
// 440 = 头35 + 胸85 + 胃70 + 左臂60 + 右臂60 + 左腿65 + 右腿65
// p.hp / p.maxHp 走"全身总血量"语义; 致死仍按塔科夫规则(头/胸被打黑), 与总血量不挂钩。
function bodyHpTotal(p){
if(!p||!p.body) return 0;
let s=0;
for(const k of BODY_ORDER){ const pt=p.body[k]; if(pt) s+=Math.max(0,pt.hp||0); }
return s;
}
function bodyHpMax(p){
if(!p||!p.body) return BODY_TOTAL_HP;
let s=0;
for(const k of BODY_ORDER){ const pt=p.body[k]; if(pt) s+=(pt.max||0); }
return s;
}
// 把总血量写回 p.hp / p.maxHp —— 旧血条、濒死暗角、包扎判断都读这两个字段
function tkSyncHp(p){
if(!p||!p.body) return;
p.maxHp=bodyHpMax(p);
p.hp=bodyHpTotal(p);
}
// 濒死比例(0~1): 取"胸部比例"与"全身比例"中更危险的一个。
// 只按总血量算的话胸部打空也才掉到 355/440=0.81, 暗角永远不会出现, 必须并入胸部比例。
function tkLowHpRatio(p){
if(!p||!p.alive||!p.body) return 0;
const mx=bodyHpMax(p)||1;
const tot=Math.max(0,Math.min(1,bodyHpTotal(p)/mx));
const th=(p.body.thorax&&p.body.thorax.max>0)?Math.max(0,Math.min(1,p.body.thorax.hp/p.body.thorax.max)):1;
return Math.min(tot,th);
}
function tkSyncLegacy(p){
if(!p||!p.body||!p.limbs) return;
const b=p.body;
p.limbs.head=Math.max(0,Math.round(b.head.hp/b.head.max*100));
p.limbs.arms=Math.max(0,Math.round(Math.min(b.armL.hp/b.armL.max,b.armR.hp/b.armR.max)*100));
p.limbs.torso=Math.max(0,Math.round(b.thorax.hp/b.thorax.max*100));
p.limbs.legs=Math.max(0,Math.round(Math.min(b.legL.hp/b.legL.max,b.legR.hp/b.legR.max)*100));
tkSyncHp(p); // 同步 p.hp / p.maxHp = 全身总血量
}
function tarkovPartOf(part,isHead){
if(isHead||part==="head") return "head";
if(part==="arms") return Math.random()<0.5?"armL":"armR";
if(part==="legs") return Math.random()<0.5?"legL":"legR";
if(part==="torso") return Math.random()<0.62?"thorax":"stomach";
if(part==="stomach"||part==="thorax") return part;
if(part&&BODY_DEFS[part]) return part;
return "thorax";
}
// 玩家受击统一入口 (覆盖 23_player 的旧肢体版本)
function applyPlayerBodyDamage(amt,attacker,isHead,part){
const p=player;
if(!p.alive||matchOver) return;
if(!p.body) initRaidBody(p,{armor:p.armorDef||{level:0}});
let target=tarkovPartOf(part,isHead);
let dmg=Math.max(1,amt);
if((target==="thorax"||target==="stomach")&&p.armorDur>0&&p.armorResist>0){
const absorb=dmg*p.armorResist;
dmg-=absorb;
p.armorDur=Math.max(0,p.armorDur-absorb*1.25);
if(p.armorDur<=0&&!p._armorBroke){ p._armorBroke=true; showScorePop("防弹衣已报废"); }
 }
 // 头盔: 只吃头部伤害, 耐久单独计算 (打光后头部恢复全额伤害)
 if(target==="head"&&p.helmetDur>0&&p.helmetResist>0){
  const absorb=dmg*p.helmetResist;
  dmg-=absorb;
  p.helmetDur=Math.max(0,p.helmetDur-absorb*1.3);
  if(p.helmetDur<=0&&!p._helmetBroke){ p._helmetBroke=true; showScorePop("头盔已报废"); }
 }
damageBodyPart(target,dmg,attacker,isHead);
p.lastDmgT=nowT;
if(p.medUseT>0){ p.medUseT=0; showScorePop("使用被打断!"); }
AudioSys.hurt();
dmgFlash=Math.min(1,dmgFlash+0.5);
if(typeof shakeHit==='function') shakeHit(0.25, isHead||target==='head'); else addTrauma(0.25);
if(attacker&&attacker.pos){
const a=Math.atan2(attacker.pos.x-p.pos.x,attacker.pos.z-p.pos.z);
addDirHit(a);
}
}
function damageBodyPart(key,dmg,attacker,isHead){
const p=player,b=p.body;
let target=key,eff=dmg;
if(b[target].hp<=0&&target!=="thorax"&&target!=="head"){ eff=dmg*1.5; target="thorax"; }
const part=b[target];
part.hp=Math.max(0,part.hp-eff);
if(target==="thorax") tkSyncHp(p);
if(part.hp<=0) onPartBlacked(target);
rollWounds(target,eff);
tkSyncLegacy(p);
if(b.head.hp<=0||b.thorax.hp<=0){
tkSyncHp(p); // 死亡瞬间也写回总血量, 保持字段语义一致
p.die(attacker,isHead||b.head.hp<=0);
}
}
function onPartBlacked(key){
const p=player;
if(!p.blacked||p.blacked[key]) return;
p.blacked[key]=true;
if(key==="stomach") showScorePop("胃部重伤 · 持续内出血");
else if(key==="armL"||key==="armR") showScorePop(BODY_DEFS[key].name+"重伤 · 操作变慢");
else if(key==="legL"||key==="legR") showScorePop(BODY_DEFS[key].name+"重伤 · 行动迟缓");
else if(key==="head") showScorePop("头部重创");
else showScorePop("胸部重创");
}
function rollWounds(key,dmg){
const p=player;
if(!p.body||dmg<5||key==="head") return;
const heavyC=Math.min(0.30,dmg/260);
const lightC=Math.min(0.55,dmg/95);
if(Math.random()<heavyC){ p.bleedHeavy=(p.bleedHeavy||0)+1; showScorePop("重度出血!"); }
else if(Math.random()<lightC){ p.bleedLight=(p.bleedLight||0)+1; }
if((key==="legL"||key==="legR"||key==="armL"||key==="armR")&&dmg>16&&Math.random()<0.16){
if(p.fractures.indexOf(key)<0){ p.fractures.push(key); showScorePop("骨折: "+BODY_DEFS[key].name); }
}
if(key==="stomach"&&dmg>22&&Math.random()<0.22){ p.bleedHeavy=(p.bleedHeavy||0)+1; }
}
function healPlayerAll(n){
const p=player;
if(!p.body) return;
for(const k of BODY_ORDER){
const pt=p.body[k];
if(pt.hp>0) pt.hp=Math.min(pt.max,pt.hp+n);
}
p.bleedLight=0;
tkSyncHp(p);
tkSyncLegacy(p);
}

// ---------- 疼痛 / 止痛药·吗啡 ----------
// 未止痛: 骨折 / 黑肢体 / 重度出血 / 任一部位见底 -> 处于疼痛(手抖 + 腿软)
// 止痛生效: 疼痛归零, 并额外获得"暂缓扣血 + 移速增加 + 准度提升"三重增益
// painPow: 1=止痛药, 1.7=吗啡(更强更久)
const PAIN_POW={pain:1,pain2:1.7};
function playerInPain(p){
if(!p||!p.body) return false;
if(p.painT>0) return false;
if((p.bleedHeavy||0)>0) return true;
if(p.fractures&&p.fractures.length) return true;
if(p.blacked){ for(const k in p.blacked) if(p.blacked[k]) return true; }
for(const k of BODY_ORDER){ const pt=p.body[k]; if(pt.hp>0&&pt.hp<pt.max*0.35) return true; }
return false;
}
// 止痛效力: 0=未止痛, 1=止痛药, 1.7=吗啡
function painPower(p){ return (p&&p.painT>0)?(p.painPow||1):0; }
// 暂缓扣血: 出血 / 内出血的每秒伤害倍率 (止痛药 ×0.65, 吗啡 ×0.52)
function painBleedMul(p){ const pk=painPower(p); return pk>0?1/(1+0.55*pk):1; }
// 移速: 止痛药 +11%, 吗啡 +19%; 未止痛且疼痛时 ×0.9
function painSpeedMul(p){ const pk=painPower(p); if(pk>0) return 1+0.11*pk; return playerInPain(p)?0.9:1; }
// 准度: 止痛药 散布 -22%, 吗啡 -37%; 未止痛且疼痛时 散布 ×1.3
function painSpreadMul(p){ const pk=painPower(p); if(pk>0) return Math.max(0.45,1-0.22*pk); return playerInPain(p)?1.3:1; }

// ---------- 左下角人体状态图 (取代血条) ----------
const BODY_FIG_PARTS=["head","thorax","stomach","armR","armL","legL","legR"];
// 白=满血 · 黄=轻伤到中伤 · 红=重伤 · 黑=严重重伤/已报废
function limbColorOf(r,blacked){
if(blacked||r<=0.001) return '#151515';
if(r>0.80) return '#f2f2f2';
if(r>0.45) return '#e8e8e8';
if(r>0.15) return '#d94a3d';
return '#151515';
}
let _bodyFigSig='';
function renderBodyFigure(idle){
const p=player;
let sig=idle?'idle|':'';
if(!idle&&p&&p.body){
for(const k of BODY_FIG_PARTS){ const pt=p.body[k]; if(pt) sig+=Math.round(pt.hp)+'/'+Math.round(pt.max)+','; }
sig+=(p.blacked&&p.blacked.stomach?'B':'');
}
if(sig===_bodyFigSig) return;
_bodyFigSig=sig;
for(const k of BODY_FIG_PARTS){
const e2=el('bp-'+k); if(!e2) continue;
const tt=e2.querySelector('title');
// 必须用 style.fill / style.stroke: 样式表里的 #bodyFig .bp{fill:...} 优先级高于
// SVG 的 fill="" 表现属性, 用 setAttribute 改颜色会被 CSS 吃掉, 永远显示白色。
if(idle||!p||!p.body){
e2.style.fill='#8a8a8a'; e2.style.stroke='rgba(0,0,0,.6)';
if(tt) tt.textContent=BODY_DEFS[k].name;
continue;
}
const pt=p.body[k]; if(!pt) continue;
const r=pt.max>0?pt.hp/pt.max:0;
const c=limbColorOf(r,!!(p.blacked&&p.blacked[k]));
e2.style.fill=c;
e2.style.stroke=c==='#151515'?'#9a9a9a':'rgba(0,0,0,.65)';
if(tt) tt.textContent=BODY_DEFS[k].name+' '+Math.ceil(pt.hp)+'/'+pt.max+(c==='#151515'?' · 严重重伤':'');
}
}

// ---------- 伤势/状态 每帧更新 ----------
function updateTarkov(dt){
const p=player;
updateLootUI();
if(!p||!p.alive||!p.body||matchOver){ updateRaidHUDBars(true); return; }
const b=p.body;
let fatal=0;
const bleed=(p.bleedHeavy||0)*2.6+(p.bleedLight||0)*0.9;
if(bleed>0){
fatal+=bleed*dt;
p.bleedTick=(p.bleedTick||0)+dt;
if(p.bleedTick>6){ p.bleedTick=0; showScorePop("失血中 · 按[H]使用止血带/医疗包"); }
}
if(p.blacked&&p.blacked.stomach) fatal+=1.1*dt;
if(fatal>0) fatal*=painBleedMul(p); // 止痛药/吗啡: 暂缓扣血速度
if(fatal>0){
b.thorax.hp=Math.max(0,b.thorax.hp-fatal);
tkSyncHp(p);
if(b.thorax.hp<=0){ tkSyncLegacy(p); p.die(null,false); return; }
}
// 水分 / 保食度 衰减 (疾跑加速)
const sprinting=p.sprinting?1:0;
p.hydration=Math.max(0,p.hydration-dt*(0.055+0.05*sprinting));
p.satiety=Math.max(0,p.satiety-dt*(0.045+0.04*sprinting));
if(p.hydration<=0){
b.thorax.hp=Math.max(0,b.thorax.hp-1.2*dt);
tkSyncHp(p);
if(b.thorax.hp<=0){ tkSyncLegacy(p); p.die(null,false); showScorePop("脱水而死"); return; }
} else if(p.hydration<=0.01){ }
if(p.satiety<=0){
b.thorax.hp=Math.max(0,b.thorax.hp-0.6*dt);
tkSyncHp(p);
if(b.thorax.hp<=0){ tkSyncLegacy(p); p.die(null,false); showScorePop("饿死在废墟里"); return; }
}
if(p.painT>0){ p.painT=Math.max(0,p.painT-dt); if(p.painT<=0) p.painPow=0; }
if(p.stimT>0) p.stimT=Math.max(0,p.stimT-dt);
// 药品/食物 使用进度
if(p.medUseT>0){
p.medUseT-=dt;
if(p.medUseT<=0){ p.medUseT=0; (p.usingKind==='food')?finishFoodUse():finishMedUse(); }
}
// 脱水/饥饿警告
if(p.hydration<25&&nowT-(p._waterWarnT||0)>10){ p._waterWarnT=nowT; showScorePop(p.hydration<=0?"严重脱水!":"水分不足 · 按[K]喝水"); }
if(p.satiety<25&&nowT-(p._foodWarnT||0)>10){ p._foodWarnT=nowT; showScorePop(p.satiety<=0?"严重饥饿!":"保食度不足 · 按[K]进食"); }
// 自然恢复已移除 (2026-09-15): 受伤后不会随时间自动恢复。
// 曾经这里有一条"脱战 12 秒后全身各部位缓慢回到 70%"(3.5/s, 抗生素期间 6/s),
// 玩家反映不该有自动回血 —— 现在唯一的回血途径是绷带 / 医疗品 / 医疗箱, 全都要消耗物品。
tkSyncLegacy(p);
updateRaidHUDBars(false);
}
function tarkovSpeedMul(p){
if(!p||!p.body) return 1;
let m=1;
const blackLeg=(p.blacked&&(p.blacked.legL||p.blacked.legR));
const fracLeg=p.fractures&&(p.fractures.indexOf("legL")>=0||p.fractures.indexOf("legR")>=0);
if(blackLeg) m*=0.6; else if(fracLeg) m*=0.78;
const w=bagWeight();
if(w>22) m*=Math.max(0.6,1-(w-22)*0.012);
m*=painSpeedMul(p); // 止痛药/吗啡: 移速增加 (未止痛且疼痛时减速)
if(p.satiety<=0) m*=0.92;
return m;
}
function tarkovStaminaMul(p){
const w=bagWeight();
let m=clamp(1+(w-16)*0.02,0.8,2.6);
const p2=player;
if(p2&&p2.hydration<=0) m*=1.5;
else if(p2&&p2.hydration<25) m*=1.3;
if(p2&&p2.satiety<=0) m*=1.4;
else if(p2&&p2.satiety<25) m*=1.2;
return m;
}
function tarkovActionMul(p){
if(!p||!p.body) return 1;
return (p.blacked&&(p.blacked.armL||p.blacked.armR))?1.35:1;
}

// ---------- 背包 / 安全箱 ----------
function raidLoadout(){
if(RUN.scav&&RUN.scavLoadout) return RUN.scavLoadout;
return META.loadout;
}
// ===== SCAV 拾荒者出击 =====
// 阵营带 scav:true 时 (见 01_data.js 的 FACTIONS.us), 本局主武器从二战兵器池随机,
// 并复用 RUN.scav 既有语义: 不带仓库主武器 / 无保险 / 阵亡不掉仓库装备 / XP 减半。
// 必须在 showDeploy() 之前调用 —— 部署界面的兵种卡要显示本局随机到的那把枪。
// 幂等: 同一局重复调用不会重掷 (每局只随机一次)。
function ensureScavLoadout(){
const F=TEAM_FACTION[player.team];
if(!F||!F.scav){ RUN.scav=false; RUN.scavLoadout=null; return null; }
if(RUN.scavLoadout) return RUN.scavLoadout;
const L=META.loadout;
RUN.scav=true;
RUN.scavLoadout={
primary:(typeof rollScavWeapon==='function')?rollScavWeapon():'m1911',
secondary:L.secondary||'',
armor:L.armor||'',
pack:L.pack||'packSmall',
meds:(L.meds||[]).slice(),
foods:(L.foods||[]).slice(),
nvg:false
};
return RUN.scavLoadout;
}
function bagPackKey(){
const L=raidLoadout();
return (L&&L.pack)||"packSmall";
}
function bagChestKey(){
const L=raidLoadout();
return (L&&L.chest)||"";
}
function bagPackSlots(){ const d=PACK_DEFS[bagPackKey()]; return (d&&d.slots)||10; }
function bagChestSlots(){ const d=CHEST_DEFS[bagChestKey()]; return (d&&d.slots)||0; }
// 背包 + 胸挂 的总格数
function bagCapacity(){ return bagPackSlots()+bagChestSlots(); }
// 大件只能进背包, 小件两处都行 —— 分开统计才能表达胸挂的限制
function bagUsedBig(){ let n=0; for(const k in RUN.loot){ const s=itemSizeOf(k); if(s>CHEST_MAX_SIZE) n+=s*RUN.loot[k]; } return n; }
function bagUsedSmall(){ let n=0; for(const k in RUN.loot){ const s=itemSizeOf(k); if(s<=CHEST_MAX_SIZE) n+=s*RUN.loot[k]; } return n; }
function bagUsed(){ return bagUsedBig()+bagUsedSmall(); }
function bagFree(){ return Math.max(0,bagCapacity()-bagUsed()); }
function bagValue(){
let v=0;
for(const k in RUN.loot) v+=itemSellPrice(k)*RUN.loot[k];
return v;
}
function bagWeight(){
let w=0;
for(const k in RUN.loot) w+=itemWeightOf(k)*RUN.loot[k];
const L=raidLoadout();
if(L){
if(L.primary) w+=itemWeightOf(L.primary);
if(L.secondary) w+=itemWeightOf(L.secondary);
if(L.armor) w+=itemWeightOf(L.armor);
if(L.pack) w+=itemWeightOf(L.pack);
}
if(player.medItems){ for(const m of player.medItems) w+=itemWeightOf(m.key); }
if(player.foodItems){ for(const m of player.foodItems) w+=itemWeightOf(m.key); }
if(RUN.nvgBrought) w+=itemWeightOf(RUN.nvgKey||'nvg');
return Math.round(w*10)/10;
}
function canCarry(key,n){
const s=itemSizeOf(key)*(n||1);
const big=bagUsedBig(), small=bagUsedSmall();
// 大件: 只能占背包的格数
if(itemSizeOf(key)>CHEST_MAX_SIZE) return (big+s)<=bagPackSlots();
// 小件: 背包 + 胸挂 合计
return (big+small+s)<=(bagPackSlots()+bagChestSlots());
}
function addLootToBag(key,n){
n=n||1;
if(!canCarry(key,n)){
 const s=itemSizeOf(key)*(n||1);
 // 区分"总容量不够"和"胸挂不收大件" —— 后者玩家很难自己想到
 if(itemSizeOf(key)>CHEST_MAX_SIZE && (bagUsedBig()+s)>bagPackSlots() && bagPackSlots()+bagChestSlots()>=bagUsed()+s)
  showScorePop("胸挂只收 ≤2 格物品 · 大件只能放背包");
 else showScorePop("背包已满");
 return false;
}
RUN.loot[key]=(RUN.loot[key]||0)+n;
renderRaidBag();
return true;
}
function secureUsed(){ return (RUN.secure||[]).length; }
function canSecure(key){
if(!(MED_DEFS[key]||FOOD_DEFS[key]||MISC_DEFS[key])) return false;
return itemSizeOf(key)<=1;
}
function secureAdd(key){
RUN.secure=RUN.secure||[];
if(!canSecure(key)){ showScorePop("安全箱只能放小件物资"); return false; }
if(RUN.secure.length>=SECURE_SLOTS){ showScorePop("安全箱已满"); return false; }
if(!RUN.loot[key]) return false;
RUN.loot[key]--;
if(RUN.loot[key]<=0) delete RUN.loot[key];
RUN.secure.push(key);
renderRaidBag();
return true;
}
// 从安全箱取回背包 —— 以前只有 secureAdd, 放进去就再也拿不出来。
// 背包满了就取不出来(否则会超容量), 这时给明确提示而不是静默失败。
function secureTake(key){
if(!player.alive||matchOver) return false;
RUN.secure=RUN.secure||[];
const i=RUN.secure.indexOf(key);
if(i<0) return false;
if(!canCarry(key,1)){ showScorePop('背包已满 · 装不下「'+itemLabel(key)+'」'); return false; }
RUN.secure.splice(i,1);
RUN.loot[key]=(RUN.loot[key]||0)+1;
showScorePop('取出: '+itemLabel(key));
AudioSys.click(760,0.2,0.05);
renderRaidBag();
return true;
}
function dropBagItem(key){
if(!RUN.loot[key]) return;
RUN.loot[key]--;
if(RUN.loot[key]<=0) delete RUN.loot[key];
renderRaidBag();
}

// ---------- HUD: 背包/快捷栏/状态条 ----------
// 左下角常驻背包条(bagHud)已移除: 背包信息统一收进 Tab 面板, 不再遮挡状态栏。
// 本函数保留为"背包相关 UI 同步刷新"的统一入口, 供各处调用。
function renderRaidBag(){
if(typeof BAG_UI!=='undefined'&&typeof renderBagPanel==='function') renderBagPanel();
}
function updateRaidHUDBars(idle){
const p=player;
const wb=el('waterBar'),fb=el('foodBar');
if(wb&&fb){
const hv=idle?100:clamp(p.hydration||0,0,100), fv=idle?100:clamp(p.satiety||0,0,100);
wb.firstElementChild.style.width=hv+'%';
wb.firstElementChild.style.background=hv>50?'#d8d8d8':(hv>25?'#e0e0e0':'#e07060');
fb.firstElementChild.style.width=fv+'%';
fb.firstElementChild.style.background=fv>50?'#d8d8d8':(fv>25?'#e0e0e0':'#e07060');
}
// 总血量读数: 当前全身总血量 / 上限(440 + 护甲胸甲加成)
const ht=el('hpTotal');
if(ht){
if(idle||!p.alive||!p.body){ ht.textContent=BODY_TOTAL_HP+' / '+BODY_TOTAL_HP; ht.className=''; }
else{
const cur=Math.ceil(bodyHpTotal(p)), mx=bodyHpMax(p);
ht.textContent=cur+' / '+mx;
const r=mx>0?cur/mx:0;
ht.className=r>0.8?'':(r>0.45?'hurt':'bad');
}
}
const q=el('quickHud');
if(q){
if(idle||!p.alive||!p.body){ q.style.display='none'; return; }
q.style.display='block';
const med=(p.medItems||[]).find(m=>m.uses>0);
const fd=(p.foodItems||[])[p.foodSel||0];
const bleed=(p.bleedHeavy||0)+(p.bleedLight||0)>0?'<span style="color:#e07060">⬤出血</span>':'';
const frac=(p.fractures&&p.fractures.length)?'<span style="color:#e0e0e0">⬤骨折</span>':'';
const pk=painPower(p);
const pkTxt=pk>0?`<span style="color:#9fe0ff">⬤止痛${pk>1.2?'·吗啡':''} ${Math.ceil(p.painT)}s</span>`:(playerInPain(p)?'<span style="color:#ff9c7a">⬤疼痛</span>':'');
q.innerHTML=`[H] ${med?MED_DEFS[med.key].name+'×'+med.uses:'<span style="opacity:.5">无药品</span>'} · [K] ${fd?FOOD_DEFS[fd.key].name:'<span style="opacity:.5">无食物</span>'}${(p.foodItems&&p.foodItems.length>1)?' [J]换':''} · ${bleed}${frac}${pkTxt}`;
}
}

// ---------- 用药 (H: 按伤势自动选择) ----------
function bestMedIndex(){
const p=player,items=p.medItems||[];
let best=-1,bestSc=0;
const anyBlacked=Object.keys(p.blacked||{}).some(k=>p.blacked[k]);
for(let i=0;i<items.length;i++){
const it=items[i];
if(!it||it.uses<=0||!MED_DEFS[it.key]) continue;
const d=MED_DEFS[it.key];
let sc=0;
if(d.treat==='black'&&(anyBlacked||(p.fractures&&p.fractures.length))) sc=6;
else if(d.treat==='bleed'&&(p.bleedHeavy>0||p.bleedLight>0)) sc=5;
else if(d.treat==='infection'&&(p.blacked&&p.blacked.stomach)) sc=4;
else if(d.treat==='heal'&&p.body&&bodyHpTotal(p)<bodyHpMax(p)*0.96) sc=3;
else if((d.treat==='pain'||d.treat==='pain2')&&p.painT<=0&&playerInPain(p)) sc=5.5;
else if(d.treat==='stim'&&p.stamina<0.25) sc=1;
if(sc>bestSc){ bestSc=sc; best=i; }
}
return best;
}
function startUseAnim(dur,kind){
const p=player;
p.medUseT=dur; p.usingKind=kind||'med';
VM.state='bandage'; VM.stateT=0; VM.stateDur=dur;
vmSndFlags={};
}
function useMedQuick(){
const p=player;
if(!p.alive||!p.body||p.medUseT>0) return;
if(player.onMG||player.onAT||player.onAA||!handsFreeVeh()) return;
if(VM.state!=='idle') return;
const i=bestMedIndex();
if(i<0){
if((p.medItems||[]).some(m=>m.uses>0)) showScorePop("当前伤势无需用药");
else showScorePop("没有可用的医疗品");
return;
}
const it=p.medItems[i];
startUseAnim(MED_DEFS[it.key].utime,'med');
p._medIdx=i;
showScorePop("使用 "+MED_DEFS[it.key].name+" …");
AudioSys.metalSlide(0.14,0.25,400,700);
}
function finishMedUse(){
const p=player,i=p._medIdx;
if(i===undefined||!p.medItems||!p.medItems[i]){ p._medIdx=undefined; return; }
const it=p.medItems[i],d=MED_DEFS[it.key];
if(!d){ p._medIdx=undefined; return; }
switch(d.treat){
case 'bleed': p.bleedHeavy=0; p.bleedLight=0; showScorePop("出血已止住"); break;
case 'pain':
case 'pain2':{
const isM=d.treat==='pain2';
p.painT=isM?300:180;
p.painPow=PAIN_POW[d.treat]||1;
if(isM) for(const k of ["armL","armR","legL","legR"]){
const pt=p.body[k];
if(pt.hp>0) pt.hp=Math.min(pt.max,pt.hp+15);
}
showScorePop(isM?"吗啡 · 止痛 300s · 失血 -48% 移速 +19% 散布 -37%":"止痛药 · 止痛 180s · 失血 -35% 移速 +11% 散布 -22%");
break;
}
case 'infection': if(p.blacked) p.blacked.stomach=false; showScorePop("内出血已清除"); break;
case 'stim': p.stamina=1; p.stimT=25; showScorePop("肾上腺素 · 体力拉满 25s"); break;
case 'heal': healPlayerAll(45); showScorePop("医疗包 · 各部位 +45"); break;
case 'black':{
let done=false;
for(const k of BODY_ORDER){
if(k==='head'||k==='thorax') continue;
const pt=p.body[k];
if(pt.hp<=0){ pt.hp=Math.max(1,pt.max*0.3); p.blacked[k]=false; done=true; }
}
if(p.fractures&&p.fractures.length){ p.fractures.length=0; done=true; }
if(p.bleedHeavy>0){ p.bleedHeavy=0; }
showScorePop(done?"手术完成 · 肢体恢复 30%":"手术包 · 无需手术");
break;
}
}
it.uses--;
if(it.uses<=0) p.medItems.splice(i,1);
p._medIdx=undefined;
tkSyncLegacy(p);
updateRaidHUDBars(false);
AudioSys.click(1200,0.3,0.06);
}
// ---------- 进食 (K: 吃选中食物 · J: 切换) ----------
function useFoodQuick(){
const p=player;
if(!p.alive||!p.body||p.medUseT>0) return;
if(player.onMG||player.onAT||player.onAA||!handsFreeVeh()) return;
if(VM.state!=='idle') return;
const fd=(p.foodItems||[])[p.foodSel||0];
if(!fd){ showScorePop("没有携带食物"); return; }
startUseAnim(FOOD_DEFS[fd.key].utime,'food');
showScorePop("食用 "+FOOD_DEFS[fd.key].name+" …");
AudioSys.metalSlide(0.1,0.2,600,900);
}
function finishFoodUse(){
const p=player;
const fd=(p.foodItems||[])[p.foodSel||0];
if(!fd){ return; }
const d=FOOD_DEFS[fd.key];
if(!d){ return; }
const w0=p.hydration,f0=p.satiety;
p.hydration=Math.min(100,p.hydration+d.water);
p.satiety=Math.min(100,p.satiety+d.food);
showScorePop(`水分 +${Math.round(p.hydration-w0)} · 保食度 +${Math.round(p.satiety-f0)}`);
p.foodItems.splice(p.foodSel||0,1);
if(p.foodSel>=p.foodItems.length) p.foodSel=0;
updateRaidHUDBars(false);
AudioSys.click(900,0.25,0.05);
}
function cycleFood(){
const p=player;
if(!p.foodItems||p.foodItems.length<2) return;
p.foodSel=((p.foodSel||0)+1)%p.foodItems.length;
showScorePop("选中食物: "+FOOD_DEFS[p.foodItems[p.foodSel].key].name);
updateRaidHUDBars(false);
}

// ---------- 战利品表 ----------
const LOOT_MISC=["cig","dogtag","screwdriver","wrench","disinfectant","creditcard","radio","coffee","detonator","phone","gasoline","battery","tools","chip","watch","satphone","docs","gpu","keycard","ledx"];
const LOOT_MED=["tourniquet","painkiller","antibiotic","morphine","adrenaline","medkit","cms"];
const LOOT_FOOD=["water","juice","beer","noodles","cannedmeat","biscuit","chocolate","milk"];
const MISC_WEIGHT={cig:14,dogtag:12,screwdriver:10,wrench:9,disinfectant:8,creditcard:8,radio:7,coffee:7,detonator:6,phone:6,gasoline:6,battery:5,tools:5,chip:4,watch:4,satphone:3,docs:3,gpu:2,keycard:2,ledx:2};
const FOOD_WEIGHT={water:20,noodles:16,biscuit:14,cannedmeat:12,chocolate:12,juice:10,milk:8,beer:8};
const MED_WEIGHT={tourniquet:22,painkiller:20,antibiotic:12,adrenaline:10,medkit:14,morphine:8,cms:4};
function weightedPick(list,w){
let tot=0;
for(let i=0;i<list.length;i++) tot+=(w&&w[list[i]])?w[list[i]]:1;
let r=Math.random()*tot;
for(let i=0;i<list.length;i++){
r-=((w&&w[list[i]])?w[list[i]]:1);
if(r<=0) return list[i];
}
return list[list.length-1];
}
function rollCrateLootList(){
const out={};
const n=randi(3,5);
for(let i=0;i<n;i++){
const r=Math.random();
if(r<0.34) out[weightedPick(LOOT_FOOD,FOOD_WEIGHT)]=(out[weightedPick(LOOT_FOOD,FOOD_WEIGHT)]||0)+1;
else if(r<0.60) out[weightedPick(LOOT_MED,MED_WEIGHT)]=(out[weightedPick(LOOT_MED,MED_WEIGHT)]||0)+1;
else if(r<0.92) out[weightedPick(LOOT_MISC,MISC_WEIGHT)]=(out[weightedPick(LOOT_MISC,MISC_WEIGHT)]||0)+1;
else if(r<0.97){ const weapons=Object.keys(WPN_DEFS); out[weapons[randi(0,weapons.length-1)]]=1; }
else { const armors=Object.keys(ARMOR_DEFS); out[armors[randi(0,Math.min(2,armors.length-1))]]=1; }
}
return out;
}
function rollCorpseLoot(bot){
const out={};
const wkey=(bot&&(bot.customWeapon||bot.wpnKey))||"";
// 尸体必定带着他的枪 (2026-09-18 用户反馈「杀人后搜不到枪」) —— 原为 45% 概率掉落
if(wkey&&WPN_DEFS[wkey]) out[wkey]=1;
const armors=Object.keys(ARMOR_DEFS);
// 护具掉落: 低阶护甲/头盔常见, 高阶稀有
if(Math.random()<0.22) out[armors[randi(0,Math.min(2,armors.length-1))]]=1;
const helmets=Object.keys(HELMET_DEFS);
if(Math.random()<0.20) out[helmets[randi(0,Math.min(2,helmets.length-1))]]=1;
if(Math.random()<0.05) out[helmets[randi(0,helmets.length-1)]]=1;
// 耳机掉落: 相对稀有
const headsets=Object.keys(HEADSET_DEFS);
if(Math.random()<0.12) out[headsets[randi(0,headsets.length-1)]]=1;
const mk=randi(1,2);
for(let i=0;i<mk;i++) out[weightedPick(LOOT_MISC,MISC_WEIGHT)]=(out[weightedPick(LOOT_MISC,MISC_WEIGHT)]||0)+1;
if(Math.random()<0.55) out[weightedPick(LOOT_FOOD,FOOD_WEIGHT)]=1;
if(Math.random()<0.40) out[weightedPick(LOOT_MED,MED_WEIGHT)]=1;
// NPC 也会搜刮容器/尸体: 它生前拿走的东西死后全部掉回来(击杀它就能抢回来)
if(bot&&bot.stash){
for(const k in bot.stash){
const n=bot.stash[k]|0;
if(n>0) out[k]=(out[k]||0)+n;
}
}
return out;
}

// ---------- 尸体 / 物资箱 搜刮面板 ----------
const CORPSES=[];
function registerCorpse(bot){
if(!bot||bot.isPlayer) return;
const loot=rollCorpseLoot(bot);
CORPSES.push({x:bot.pos.x,z:bot.pos.z,loot:loot,searched:false,t:nowT});
while(CORPSES.length>40) CORPSES.shift();
}
function corpseNear(x,z,r){
let best=null,bd=r||2.6;
for(const c of CORPSES){
if(c.searched) continue;
if(!Object.keys(c.loot).length){ c.searched=true; continue; }
const d=Math.hypot(c.x-x,c.z-z);
if(d<bd){ bd=d; best=c; }
}
return best;
}
const LOOT_UI={open:false,kind:'',ref:null,sel:0};
function lootEntries(ref){
return Object.entries(ref.loot).sort((a,b)=>itemSizeOf(a[0])-itemSizeOf(b[0])||itemPriceOf(b[0])-itemPriceOf(a[0]));
}
function lootTargetNear(){
if(!player.alive||!player.deployed) return null;
const p=player.pos;
const c=corpseNear(p.x,p.z,2.6);
if(c) return {kind:'corpse',ref:c};
for(const lc of LOOT_CRATES){
if(lc.searched) continue;
if(!lc.loot) lc.loot=rollCrateLootList(lc);
if(!Object.keys(lc.loot).length){ lc.searched=true; if(lc.glow) lc.glow.visible=false; continue; }
if(Math.hypot(lc.x-p.x,lc.z-p.z)<2.7) return {kind:'crate',ref:lc};
}
return null;
}
function openLootPanel(t){
LOOT_UI.open=true; LOOT_UI.kind=t.kind; LOOT_UI.ref=t.ref;
LOOT_UI.sel=0;
renderLootPanel();
AudioSys.click(700,0.2,0.05);
}
function lootPanelClose(){
if(!LOOT_UI.open) return;
LOOT_UI.open=false; LOOT_UI.ref=null;
const pnl=el('lootPanel');
if(pnl) pnl.classList.add('hidden');
}
function lootSelMove(d){
if(!LOOT_UI.open) return;
const n=lootEntries(LOOT_UI.ref).length;
if(!n) return;
LOOT_UI.sel=(LOOT_UI.sel+d+n)%n;
renderLootPanel();
AudioSys.click(1400,0.1,0.03);
}
function lootTakeSelected(){
if(!LOOT_UI.open||!LOOT_UI.ref) return;
const entries=lootEntries(LOOT_UI.ref);
if(!entries.length){ lootPanelClose(); return; }
const i=Math.min(LOOT_UI.sel,entries.length-1);
const key=entries[i][0];
if(addLootToBag(key,1)){
LOOT_UI.ref.loot[key]--;
if(LOOT_UI.ref.loot[key]<=0) delete LOOT_UI.ref.loot[key];
RUN.searches=(RUN.searches||0)+1;
addXP(6);
showScorePop("拿取: "+itemLabel(key));
const left=Object.keys(LOOT_UI.ref.loot).length;
if(!left){
if(LOOT_UI.kind==='crate'){
LOOT_UI.ref.searched=true;
if(LOOT_UI.ref.glow) LOOT_UI.ref.glow.visible=false;
} else LOOT_UI.ref.searched=true;
lootPanelClose();
renderRaidBag();
return;
}
renderLootPanel();
}
renderRaidBag();
}
function renderLootPanel(){
const pnl=el('lootPanel');
if(!pnl) return;
if(!LOOT_UI.open||!LOOT_UI.ref){ pnl.classList.add('hidden'); return; }
pnl.classList.remove('hidden');
el('lootTitle').textContent=LOOT_UI.kind==='corpse'?'尸 体':'物 资 箱';
const entries=lootEntries(LOOT_UI.ref);
let rows='';
entries.forEach(([key,n],i)=>{
const cant=!canCarry(key,1);
rows+=`<div class="lootRow${i===LOOT_UI.sel?' sel':''}${cant?' cant':''}"><span class="lrMark">${i===LOOT_UI.sel?'▸':' '}</span><span class="lrName">${itemIconOf(key)} ${itemLabel(key)}</span><span class="lrInfo">×${n} · ${itemSizeOf(key)}格 · ¥${formatMoney(itemSellPrice(key))}</span></div>`;
});
if(!rows) rows='<div class="lootRow empty">空空如也</div>';
el('lootList').innerHTML=rows;
el('lootHint').innerHTML=`背包 ${bagUsed()}/${bagCapacity()}格 · <b>↑/↓</b> 选择 · <b>F</b> 拿取选中 · 移动离开关闭`;
// 触屏按钮
const tb=el('tSelUp'),tb2=el('tSelDown'),tb3=el('tTake');
if(tb) tb.style.display=tb2.style.display=tb3.style.display=(TOUCHUI&&entries.length)?'flex':'none';
}
function updateLootUI(){
if(!LOOT_UI.open){
const t=lootTargetNear();
INTERACT_LOOT=t;
return;
}
const r=LOOT_UI.ref;
const gone=!r||(LOOT_UI.kind==='crate'?(r.searched||!Object.keys(r.loot).length):((r.searched||!Object.keys(r.loot).length)));
const far=Math.hypot(r.x-player.pos.x,r.z-player.pos.z)>3.4;
if(gone||far||!player.alive){ lootPanelClose(); INTERACT_LOOT=lootTargetNear(); return; }
INTERACT_LOOT={kind:LOOT_UI.kind,ref:r};
}
let INTERACT_LOOT=null;
function tryLootInteract(){
if(LOOT_UI.open){ lootTakeSelected(); return true; }
if(INTERACT_LOOT){ openLootPanel(INTERACT_LOOT); return true; }
return false;
}

// ===================== 背包面板 (Tab) =====================
// 目的: 1) 背包信息统一收进面板, 不再有左下角常驻 HUD 遮挡状态栏
//       2) 提供"丢弃物资"机制, 解决只能拿不能扔导致背包塞满的问题
const BAG_UI={open:false,sel:0};
function bagEntryKeys(){ return Object.keys(RUN.loot).filter(k=>RUN.loot[k]>0); }
function toggleBagPanel(){
if(!player.alive||matchOver) return;
BAG_UI.open=!BAG_UI.open;
if(typeof bagDisarmDropAll==='function') bagDisarmDropAll();   // 开关面板都清掉"待确认"状态
if(BAG_UI.open){ BAG_UI.sel=0; lootPanelClose(); }
renderRaidBag();   // 内部会同步刷新面板, 并隐藏/恢复左下角常驻背包 HUD
if(BAG_UI.open) AudioSys.click(900,0.2,0.04); else AudioSys.click(600,0.16,0.04);
}
function bagPanelClose(){
if(!BAG_UI.open) return;
BAG_UI.open=false;
renderRaidBag();   // 内部会隐藏面板并恢复常驻 HUD
}
function bagSelMove(d){
if(!BAG_UI.open) return;
const ks=bagEntryKeys(); if(!ks.length) return;
BAG_UI.sel=(BAG_UI.sel+d+ks.length)%ks.length;
renderBagPanel(); AudioSys.click(1400,0.1,0.03);
}
// 丢弃选中物: 会从背包移除; 若是武器/护甲则直接回到仓库(避免误丢高价值装备)
function bagDropSelected(all){
if(!player.alive||matchOver) return;
// 触屏"丢弃"按钮可能在面板关闭时被触发: 这里自动开面板, 避免静默失效
if(!BAG_UI.open) toggleBagPanel();
const ks=bagEntryKeys(); if(!ks.length) return;
const i=Math.min(BAG_UI.sel,ks.length-1);
const key=ks[i];
const n=all?RUN.loot[key]:1;
const isGear=!!(WPN_DEFS[key]||ARMOR_DEFS[key]);
if(isGear){
// 装备类: 放回仓库而不是凭空消失
META.owned[key]=(META.owned[key]||0)+n;
showScorePop('放回仓库: '+itemLabel(key)+' ×'+n);
}else{
showScorePop('丢弃: '+itemLabel(key)+' ×'+n);
}
RUN.loot[key]-=n;
if(RUN.loot[key]<=0) delete RUN.loot[key];
BAG_UI.sel=Math.min(BAG_UI.sel,Math.max(0,bagEntryKeys().length-1));
saveMeta();
renderBagPanel();
renderRaidBag();
AudioSys.click(420,0.22,0.05);
}
function bagDropAllOfSelected(){
if(!player.alive||matchOver) return;
if(!BAG_UI.open) toggleBagPanel();
if(!bagEntryKeys().length) return;
bagDropSelected(true);
}
// 把背包里的武器装到快捷栏 (slotIdx 0=主武器 / 1=副武器)。
// 以前缴获的敌方武器只能躺在背包里当战利品, 没有任何装备入口。
// 换下来的那把放回背包(不凭空消失); 背包塞不下换下来的那把就拒绝, 免得物品丢失。
function bagEquipWeapon(key,slotIdx){
if(!player.alive||matchOver) return false;
if(typeof WPN_DEFS==='undefined'||!WPN_DEFS[key]){ showScorePop('只能装备武器'); return false; }
if(!RUN.loot[key]) return false;
if(player.onMG||player.onAT||player.onAA||(typeof handsFreeVeh==='function'&&!handsFreeVeh())){
showScorePop('当前姿态无法换武器'); return false;
}
const old=player.slots[slotIdx];
const newSize=itemSizeOf(key);
if(old&&old.key&&old.key!==key&&bagFree()+newSize<itemSizeOf(old.key)){
showScorePop('背包放不下换下来的「'+itemLabel(old.key)+'」');
return false;
}
const md=(typeof moddedDef==='function'&&moddedDef(key))||WPN_DEFS[key];
const slot={key:key,def:md,mag:md.mag,reserve:md.reserve};
RUN.loot[key]--;
if(RUN.loot[key]<=0) delete RUN.loot[key];
if(old&&old.key&&old.key!==key) RUN.loot[old.key]=(RUN.loot[old.key]||0)+1;
// 槽位: 副武器槽可能还不存在(slots 是 [主武器, 副武器] 过滤掉空值建出来的)
if(!player.slots.length) slotIdx=0;
if(slotIdx===0) player.slots[0]=slot;
else if(player.slots.length<2) player.slots.push(slot);
else player.slots[1]=slot;
// 明确换手。不能调 switchSlot(): i===curSlot 时它直接 return, 而且 VM 忙的时候它也不切。
VM.state='idle'; VM.stateT=0;
player.curSlot=slotIdx;
player.curW=slot;
if(typeof vmEquip==='function') vmEquip(slot.key,player.team);
showScorePop('已装备'+(slotIdx===0?'主武器':'副武器')+' · '+itemLabel(key));
if(typeof AudioSys!=='undefined'&&AudioSys.metalSlide) AudioSys.metalSlide(0.3,0.18,500,900);
renderRaidBag();
return true;
}
// 面板底部提示: 桌面列快捷键, 手机显示触屏说明(手机没有键盘, 列快捷键只会误导)
function bagHintHTML(){
const hasUse=(typeof bagUsableKeys==='function')&&bagUsableKeys().length>0;
const key=bagActKey();
const isWpn=!!(key&&typeof WPN_DEFS!=='undefined'&&WPN_DEFS[key]);
if(typeof TOUCHUI!=='undefined'&&TOUCHUI){
return isWpn?'点一行选中 · 武器可用下面的按钮装备到快捷栏':'点一行选中 · 用下面的按钮操作';
}
let s='<b>↑/↓</b> 选择';
if(hasUse) s+=' · <b>E</b> 立即使用';
if(isWpn) s+=' · <b>1/2</b> 装备到主/副武器';
return s+' · <b>G</b> 丢弃 1 个 · <b>Shift+G</b> 全部丢弃(装备类放回仓库) · <b>Q</b> 存入安全箱 · <b>Tab</b> 关闭';
}
// 操作条作用于"选中项", 与键盘 G/Q 用的是同一个游标 BAG_UI.sel
function bagActKey(){
const ks=bagEntryKeys();
if(!ks.length) return null;
return ks[Math.min(BAG_UI.sel,ks.length-1)];
}
// "全部丢弃"不可撤销, 手机上一误触就没了 —— 要点两下确认, 3 秒内没点第二下自动取消
let bagDropAllArmed=false, bagDropAllTimer=0;
function bagDisarmDropAll(){ if(bagDropAllTimer){ clearTimeout(bagDropAllTimer); bagDropAllTimer=0; } bagDropAllArmed=false; }
function renderBagActions(){
const box=el('bagPanelBtns');
if(!box) return;
const key=bagActKey();
// 武器不能进安全箱, 但有"装备到快捷栏"的需求 —— 选中武器时把「存入安全箱」换成两个装备键
const isWpn=!!(key&&typeof WPN_DEFS!=='undefined'&&WPN_DEFS[key]);
let html='';
if(isWpn){
html+=`<button class="bagAct eq" data-bact="eq0">装备到主武器</button>`
+`<button class="bagAct eq" data-bact="eq1">装备到副武器</button>`;
}else{
html+=`<button class="bagAct" data-bact="secure">存入安全箱</button>`;
}
html+=`<button class="bagAct" data-bact="drop1">丢弃 1 个</button>`
+`<button class="bagAct danger${bagDropAllArmed?' armed':''}" data-bact="dropall">${bagDropAllArmed?'确认全部丢弃?':'全部丢弃'}</button>`
+`<button class="bagAct ghost" data-bact="close">关闭</button>`;
box.innerHTML=html;
if(box._bound) return;
box._bound=true;
box.addEventListener('click',ev=>{
const b=ev.target&&ev.target.closest?ev.target.closest('.bagAct'):null;
if(!b) return;
ev.stopPropagation(); ev.preventDefault();
const act=b.dataset.bact;
if(act==='close'){ bagDisarmDropAll(); bagPanelClose(); return; }
const key=bagActKey();
if(!key){ bagDisarmDropAll(); return; }
if(act==='eq0'||act==='eq1'){
bagDisarmDropAll();
bagEquipWeapon(key,act==='eq0'?0:1);
return;
}
if(act==='secure'){
// 不在这里预判能不能放: 让 secureAdd 自己给出原因(只能放小件 / 安全箱已满)
if(secureAdd(key)){ bagDisarmDropAll(); AudioSys.click(1000,0.2,0.05); renderBagPanel(); }
else renderBagActions();
return;
}
if(act==='drop1'){ bagDisarmDropAll(); bagDropSelected(false); return; }
if(act==='dropall'){
if(bagDropAllArmed){ bagDisarmDropAll(); bagDropSelected(true); return; }
bagDropAllArmed=true;
bagDropAllTimer=setTimeout(()=>{ bagDropAllArmed=false; bagDropAllTimer=0; renderBagActions(); },3200);
renderBagActions(); AudioSys.click(600,0.15,0.04);
return;
}
});
}
function renderBagPanel(){
const pnl=el('bagPanel');
if(!pnl) return;
if(!BAG_UI.open||!player.alive){ pnl.classList.add('hidden'); return; }
pnl.classList.remove('hidden');
const used=bagUsed(),cap=bagCapacity();
const ks=bagEntryKeys();
if(BAG_UI.sel>=ks.length) BAG_UI.sel=Math.max(0,ks.length-1);
el('bagPanelStat').textContent=`${used}/${cap} 格 · ${bagWeight()} kg · ¥${formatMoney(bagValue())} · 安全箱 ${secureUsed()}/${SECURE_SLOTS}`;
let rows='';
ks.forEach((key,i)=>{
const n=RUN.loot[key];
const canSec=canSecure(key);
const isWpn=!!(typeof WPN_DEFS!=='undefined'&&WPN_DEFS[key]);
rows+=`<div class="lootRow bagRow${i===BAG_UI.sel?' sel':''}" data-bk="${encodeURIComponent(key)}">`
+`<span class="lrMark">${i===BAG_UI.sel?'▸':' '}</span>`
+`<span class="lrName">${itemIconOf(key)} ${itemLabel(key)}</span>`
+`<span class="lrQty">×${n}</span>`
+`<span class="lrInfo">${itemSizeOf(key)}格 · ¥${formatMoney(itemSellPrice(key))}${canSec?' · <b style="color:#8fd0a8">可入安全箱</b>':''}${isWpn?' · <b style="color:#8fd0a8">可装备</b>':''}</span>`
+`</div>`;
});
if(!rows) rows='<div class="bagEmpty">背包是空的 · 在物资箱与尸体上按 F 搜刮</div>';
el('bagPanelList').innerHTML=rows;
// ---- 安全箱: 列出箱里装了什么 + 每行一个「取出」(以前只能放进去, 看不到也拿不出来) ----
const sec=RUN.secure||[];
const secBox=el('secBox');
if(secBox){
if(sec.length){
secBox.classList.remove('hidden');
el('secStat').textContent=sec.length+'/'+SECURE_SLOTS;
let sr='';
for(const sk of sec){
sr+=`<div class="lootRow secRow" data-sk="${encodeURIComponent(sk)}">`
+`<span class="lrName">${itemIconOf(sk)} ${itemLabel(sk)}</span>`
+`<span class="lrInfo">${itemSizeOf(sk)}格 · ¥${formatMoney(itemSellPrice(sk))}</span>`
+`<button class="secTake" data-stk="${encodeURIComponent(sk)}">取出</button>`
+`</div>`;
}
el('secList').innerHTML=sr;
}else{
secBox.classList.add('hidden');
}
}
el('bagPanelHint').innerHTML=bagHintHTML();
renderBagActions();
// 鼠标/触屏: 点击行=选中, 双击=丢弃1个; 右键=丢弃1个
const listEl=el('bagPanelList');
if(listEl&&!listEl._bagBound){
listEl._bagBound=true;
listEl.addEventListener('click',ev=>{
const row=ev.target&&ev.target.closest?ev.target.closest('.bagRow'):null;
if(!row||!row.dataset.bk) return;
const ks=bagEntryKeys();
const key=decodeURIComponent(row.dataset.bk);
const idx=ks.indexOf(key);
if(idx>=0){ BAG_UI.sel=idx; renderBagPanel(); }
});
listEl.addEventListener('dblclick',ev=>{
const row=ev.target&&ev.target.closest?ev.target.closest('.bagRow'):null;
if(!row||!row.dataset.bk) return;
bagDropSelected(false);
});
listEl.addEventListener('contextmenu',ev=>{
const row=ev.target&&ev.target.closest?ev.target.closest('.bagRow'):null;
if(!row) return;
ev.preventDefault();
if(!row.dataset.bk) return;
bagDropSelected(false);
});
}
// 安全箱行的「取出」按钮(委托绑定, 只绑一次)
const secListEl=el('secList');
if(secListEl&&!secListEl._secBound){
secListEl._secBound=true;
secListEl.addEventListener('click',ev=>{
const b=ev.target&&ev.target.closest?ev.target.closest('.secTake'):null;
if(!b||!b.dataset.stk) return;
ev.stopPropagation(); ev.preventDefault();
secureTake(decodeURIComponent(b.dataset.stk));
});
}
}
// 背包打开时接管这些按键(在输入层优先调用), 返回 true 表示已消费
function bagPanelKey(code,shift){
if(!BAG_UI.open) return false;
if(code==='ArrowUp'){ bagSelMove(-1); return true; }
if(code==='ArrowDown'){ bagSelMove(1); return true; }
if(code==='KeyG'){ if(shift) bagDropAllOfSelected(); else bagDropSelected(false); return true; }
// 面板内 1/2 = 把选中的武器装备到主/副武器槽。
// 选中项不是武器时不消费这两个键, 让它们照常去切枪。
if(code==='Digit1'||code==='Digit2'){
const ks=bagEntryKeys();
const wkey=ks.length?ks[Math.min(BAG_UI.sel,ks.length-1)]:null;
if(wkey&&typeof WPN_DEFS!=='undefined'&&WPN_DEFS[wkey]){
bagEquipWeapon(wkey,code==='Digit1'?0:1);
return true;
}
return false;
}
if(code==='KeyQ'){
const ks=bagEntryKeys();
if(ks.length){ const key=ks[Math.min(BAG_UI.sel,ks.length-1)]; secureAdd(key); renderBagPanel(); }
return true;
}
if(code==='Escape'){ bagPanelClose(); return true; }
return false;
}

// ---------- 保险 ----------
function insuranceCost(){
const L=raidLoadout();
if(!L||RUN.scav) return 0;
let v=0;
if(L.primary) v+=itemPriceOf(L.primary);
if(L.secondary) v+=itemPriceOf(L.secondary);
if(L.armor) v+=itemPriceOf(L.armor);
if(L.nvg&&NVG_DEFS[L.nvg]) v+=itemPriceOf(L.nvg);
return Math.round(v*0.14);
}
function equipKeysOfLoadout(){
const L=raidLoadout();
if(!L) return [];
const keys=[L.primary,L.secondary,L.armor].filter(Boolean);
if(L.nvg&&NVG_DEFS[L.nvg]) keys.push(L.nvg);
return keys;
}
function raidDeathPenalty(){
const lost=[],returned=[];
if(!RUN.scav){
const insured=!!RUN.insured;
for(const k of equipKeysOfLoadout()){
if(!ownedCount(k)) continue;
META.owned[k]--;
if(META.owned[k]<=0) delete META.owned[k];
if(insured&&Math.random()<0.7){ META.insurance.push({key:k,n:1}); returned.push(k); }
else lost.push(k);
}
}
if(RUN.secure&&RUN.secure.length){
for(const k of RUN.secure){ META.loot[k]=(META.loot[k]||0)+1; }
}
RUN.lostGear=lost; RUN.returnedGear=returned;
RUN.loot={};
RUN.secure=[];
saveMeta();
return {lost:lost,returned:returned};
}
function deliverInsurance(){
if(!META.insurance||!META.insurance.length) return 0;
let n=0;
for(const it of META.insurance){
META.owned[it.key]=(META.owned[it.key]||0)+(it.n||1);
n+=(it.n||1);
}
META.insurance=[];
saveMeta();
return n;
}
// 玩家死亡 (撤离模式) = 撤离失败: 装备/背包丢失, 安全箱保留, 保险赔付待领取
// 额外: 结算失败补偿 +500, 并保证不会因卖光装备而无法再开局
function onPlayerRaidDeath(){
if(GAMEMODE!=='extract'||matchOver) return;
if(typeof bagPanelClose==='function') bagPanelClose();
raidDeathPenalty();
// ===== 失败补偿 =====
// 击杀数少量加成, 让"虽败犹荣"也有回报(每杀 +40, 上限 +200)
const bonus=Math.min(200,(RUN.kills||0)*40);
RUN.failComp=grantFailCompensation(bonus);
RUN.autoKit=ensureSafetyKit('fail');
setTimeout(()=>{
if(!matchOver&&typeof finishRaid==='function') finishRaid(false);
},2600);
}

// ---------- 等级 / 解锁 ----------
const LEVEL_XP=[0,300,800,1600,2800,4400,6500,9200,12500,16500,21000,26500,33000,41000,50000];
function xpLevel(xp){
let lv=1;
for(let i=0;i<LEVEL_XP.length;i++){ if(xp>=LEVEL_XP[i]) lv=i+1; }
return lv;
}
function xpNextNeed(xp){
const lv=xpLevel(xp);
return LEVEL_XP[lv]||null;
}
function addXP(n){
if(!n) return;
if(RUN.scav) n=Math.round(n*0.5);
const before=xpLevel(META.xp||0);
META.xp=(META.xp||0)+n;
const after=xpLevel(META.xp);
if(after>before) showScorePop("等级提升 · Lv"+after);
saveMeta();
return after;
}
function itemLevelReq(key){
if(ARMOR_DEFS[key]) return [1,2,3,5,7,9][ARMOR_DEFS[key].level-1]||1;
if(PACK_DEFS[key]) return PACK_DEFS[key].tier||1;
if(MISC_DEFS[key]) return MISC_DEFS[key].tier||1;
if(MED_DEFS[key]) return key==="cms"?4:(key==="medkit"?2:1);
if(FOOD_DEFS[key]) return 1;
if(WPN_DEFS[key]){
const p=itemPriceOf(key);
if(p<600) return 1;
if(p<900) return 2;
if(p<1300) return 3;
if(p<2000) return 5;
if(p<3000) return 7;
return 9;
}
return 1;
}
function playerLevel(){ return xpLevel(META.xp||0); }

// ---------- 部署: 背包/药品/食物/保险/NVG ----------
function buildDeployConsumables(){
const L=META.loadout;
L.pack=L.pack||'packSmall';
L.meds=Array.isArray(L.meds)?L.meds:['','',''];
while(L.meds.length<3) L.meds.push('');
L.foods=Array.isArray(L.foods)?L.foods:['',''];
while(L.foods.length<2) L.foods.push('');
const fill=(sel,cur,kind,allowEmpty,defList)=>{
if(!sel) return;
sel.innerHTML='';
if(allowEmpty){
const o=document.createElement('option');
o.value=''; o.textContent='— 空 —';
sel.appendChild(o);
}
const src=defList||Object.keys(META.owned).filter(k=>kind==='med'?MED_DEFS[k]:(kind==='food'?FOOD_DEFS[k]:PACK_DEFS[k])).filter(k=>META.owned[k]>0);
for(const k of src){
if(!src) continue;
const o=document.createElement('option');
o.value=k;
o.textContent=`${itemLabel(k)}${defList?'':` ×${META.owned[k]}`}${defList?` (${formatMoney(itemPriceOf(k))})`:''}`;
sel.appendChild(o);
}
 sel.value=(cur&&ownedCount(cur)>0)?cur:'';
 // 存档记录的物品已耗尽: 回退到空选项/首项, 避免下拉框空白
 if(sel.selectedIndex<0) sel.selectedIndex=0;
};
const ps=el('packSelect');
if(ps){
fill(ps,L.pack,'pack',false);
ps.value=PACK_DEFS[L.pack]?L.pack:'packSmall';
if(!ownedCount(ps.value)&&ps.value!=='packSmall') ps.value='packSmall';
ps.onchange=()=>{ L.pack=ps.value||'packSmall'; saveMeta(); updateConsumSummary(); };
}
['medSel1','medSel2','medSel3'].forEach((id,i)=>{
const s=el(id);
if(!s) return;
fill(s,L.meds[i],'med',true);
s.onchange=()=>{ L.meds[i]=s.value; saveMeta(); updateConsumSummary(); };
});
['foodSel1','foodSel2'].forEach((id,i)=>{
const s=el(id);
if(!s) return;
fill(s,L.foods[i],'food',true);
s.onchange=()=>{ L.foods[i]=s.value; saveMeta(); updateConsumSummary(); };
});
// 撤离通行证槽: 仓库里有证才能携带。携带后才算「持证」, 才能在「港口」登船离开禁区。
const psel=el('passSelect');
if(psel){
const n=ownedCount('pass');
if(!n) L.pass=false;
psel.innerHTML='';
const o0=document.createElement('option');
o0.value=''; o0.textContent=n>0?'— 不携带 —':'— 未持有（完成全部任务后在市集购买）—';
psel.appendChild(o0);
if(n>0){
const o1=document.createElement('option');
o1.value='pass'; o1.textContent=`撤离通行证 ×${n}（仅「港口」登船有效）`;
psel.appendChild(o1);
}
psel.value=L.pass?'pass':'';
psel.disabled=n<=0;
psel.onchange=()=>{ L.pass=psel.value==='pass'; saveMeta(); updateConsumSummary(); };
}
const chk=el('insureChk');
if(chk) chk.onchange=()=>{ RUN.insureWanted=chk.checked; updateConsumSummary(); };
updateConsumSummary();
}
function updateConsumSummary(){
const sum=el('consumSummary');
const chk=el('insureChk');
if(chk) chk.checked=!!RUN.insureWanted;
if(!sum) return;
const L=META.loadout;
const cost=insuranceCost();
const _scav=!!(TEAM_FACTION[player.team]&&TEAM_FACTION[player.team].scav);
const _passN=ownedCount('pass');
sum.innerHTML=`背包: ${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].name:'Flyye MBSS 背包'} (${PACK_DEFS[L.pack]?PACK_DEFS[L.pack].slots:16}格) · 医疗: ${L.meds.filter(Boolean).length||'无'} · 食物: ${L.foods.filter(Boolean).length||'无'}${RUN.insureWanted&&!_scav?` · 保险 ¥${formatMoney(cost)}`:''}`
 +(_passN>0?(L.pass?'<br><span style="color:#d8b878">撤离通行证：已携带 · 在「港口」登船成功时消耗，解锁结局与重生</span>':'<br><span style="color:#9a9a9a">撤离通行证：未携带 · 带在身上才能在「港口」登船离开禁区</span>'):'')
 +(_scav?'<br><span style="color:#d8d8d8">拾荒者出击 · 主武器每局从二战兵器里随机抽取, 仓库里的主武器不会带出</span>':'');
}
// 部署时结算: 消耗品从仓库扣除, NVG 随身, 保险扣费
function applyDeployLoadout(){
const L=META.loadout;
L.meds=Array.isArray(L.meds)?L.meds:[];
L.foods=Array.isArray(L.foods)?L.foods:[];
RUN.medItems=[];
RUN.foodItems=[];
for(const k of L.meds){
if(k&&MED_DEFS[k]&&ownedCount(k)>0){
META.owned[k]--;
RUN.medItems.push({key:k,uses:MED_DEFS[k].uses||1});
}
}
for(const k of L.foods){
if(k&&FOOD_DEFS[k]&&ownedCount(k)>0){
META.owned[k]--;
RUN.foodItems.push({key:k});
}
}
// 2026-09-19: L.nvg 由布尔改为**型号键** ('' = 不带)。老档在 normalizeMeta 里迁移。
RUN.nvgBrought=false;
RUN.nvgKey='';
const primaryKey=L.primary;
const _nvgWant=(typeof L.nvg==='string')?L.nvg:'';
if(primaryKey&&getModChoice(primaryKey,'gear')==='gear_nvg'&&_nvgWant&&ownedCount(_nvgWant)>0){
RUN.nvgBrought=true;
RUN.nvgKey=_nvgWant;
}
// 撤离通行证: 携带才生效。不在这里扣除 —— 只有真的在港口登船成功才消耗
// (见 39_quests.consumeExtractionPass; 阵亡时证还在仓库里, 不额外惩罚)。
RUN.passBrought=!!L.pass&&ownedCount('pass')>0;
if(!RUN.passBrought) L.pass=false;
RUN.insured=false;
if(RUN.insureWanted&&!RUN.scav){
const cost=insuranceCost();
if(cost>0&&META.wallet>=cost){
META.wallet-=cost;
RUN.insured=true;
showScorePop("已购保险 ¥"+formatMoney(cost)+" · 阵亡 70% 返还装备");
}
}
saveMeta();
renderRaidBag();
}

// ---------- 市集 (局外交易) ----------
function renderMarketRows(tab){
let rows='';
for(const key of TRADE_KEYS){
// 通行证: 20 个任务全部完成后才出现在市集 (见 39_quests)
if(key==='pass'&&!(typeof questsAllDone==='function'&&questsAllDone())) continue;
const owned=ownedCount(key);
const price=itemPriceOf(key),sell=itemSellPrice(key);
// 等级锁: 未达到等级显示锁定, 禁止购买
const lockLv=typeof tradeLockLevel==='function'?tradeLockLevel(key):1;
const locked=lockLv>(META.level||1);
const buyBtn=locked
?`<button class="optBtn arBtn" disabled style="opacity:.45">🔒 Lv.${lockLv} 解锁</button>`
:`<button class="optBtn arBtn" data-key="${key}" data-action="buy">买入</button>`;
rows+=`<div class="arRow"${locked?' style="opacity:.6"':''}><div class="arIcon">${itemIconOf(key)}</div><div class="arBody"><div class="arName">${itemLabel(key)}</div><div class="arDesc">${itemDescOf(key)}</div>${owned?`<div class="arOwned">库存 ${owned}</div>`:''}</div><span class="arPrice">¥${formatMoney(price)} <span style="opacity:.6">/售 ¥${formatMoney(sell)}</span></span>${buyBtn}${owned?`<button class="optBtn arBtn" data-key="${key}" data-action="sell">卖出</button>`:''}</div>`;
}
return rows;
}

// ---------- 改枪工坊 (货币结算) ----------
const MOD_SLOT_NAMES={optic:'瞄具',muzzle:'枪口',mag:'弹匣',stock:'枪托',grip:'握把',gear:'战术配件',light:'照明'};
function chargeModChoice(key,slot,mid){
const cur=getModChoice(key,slot);
if(cur===mid) return true;
const cost=ALL_MODS[mid]&&ALL_MODS[mid].cost||0;
if(cost>0){
if(META.wallet<cost){ showScorePop('货币不足 · 需要 ¥'+formatMoney(cost)); return false; }
META.wallet-=cost;
showScorePop('改装费 -¥'+formatMoney(cost));
saveMeta();
}
setModChoice(key,slot,mid);
// 改装必须立刻反映到"手上这把枪": 重建视图模型 + 刷新槽位数值。
// 否则玩家在暂停菜单里改完件回到游戏, 枪还是旧模型(mesh 数不变),
// 而且 dmg/后坐/弹匣容量 这些属性也仍然是部署时的旧值。
try{ if(typeof applyModsToLiveWeapon==='function') applyModsToLiveWeapon(key); }catch(e){}
renderArmory('workbench');
return true;
}
// 把新改装应用到"已经在手上"的武器: 原地改 slots(这样 player.curW 指向的同一对象同步更新),
// 再重建第一人称视图模型。不在局内时 player.slots 为空, 下次部署自然会读最新改装。
function applyModsToLiveWeapon(key){
if(typeof player==='undefined'||!player||!player.slots||!player.slots.length) return false;
if(typeof moddedDef!=='function') return false;
const md=moddedDef(key)||WPN_DEFS[key];
if(!md) return false;
let touched=false;
player.slots.forEach(s=>{
if(!s||s.key!==key) return;
const oldMag=s.mag;
s.def=md;
// 扩容/快拔弹匣会改容量: 保留已装填量, 夹到新容量范围内, 至少留 1 发
const newMax=Math.max(1,md.mag||1);
s.mag=Math.max(1,Math.min(oldMag==null?newMax:oldMag,newMax));
if(s.reserve==null) s.reserve=md.reserve;
touched=true;
});
if(!touched) return false;
// 视图模型重建: 只动手上正是这把枪的情况
if(typeof VM!=='undefined'&&VM&&VM.key===key&&typeof vmEquip==='function'){
vmEquip(key, player.team);
}
return true;
}
function renderWorkbenchRows(){
const weapons=ownedWeaponList();
let rows='';
if(!weapons.length) return '<div class="arEmpty">仓库中没有武器。先在商店购买。</div>';
rows+=`<div class="arRow wbPick"><div class="arBody"><div class="arName">选择武器</div><select id="wbWeapon" style="width:100%;padding:6px;border-radius:6px;background:#2b2b2b;color:#eaeaea;border:1px solid #666666"></select></div></div>`;
const cur=WORKBENCH_KEY&&ownedCount(WORKBENCH_KEY)>0?WORKBENCH_KEY:(META.loadout.primary&&ownedCount(META.loadout.primary)?META.loadout.primary:weapons[0]);
WORKBENCH_KEY=cur;
const avail=getModSlots(cur);
rows+=`<div class="arRow"><div class="arBody"><div class="arName">${itemName(cur)}</div><div class="arDesc">${itemDesc(cur)}</div><div class="arOwned">当前改装: ${modDisplayName(cur)} · 整套市价 ¥${formatMoney(modTotalCost(cur))}</div></div></div>`;
['optic','muzzle','mag','stock','grip','gear','light'].forEach(slot=>{
const list=avail[slot]||[];
if(!list.length) return;
const curMid=getModChoice(cur,slot);
rows+=`<div class="arRow"><div class="arBody"><div class="arName">${MOD_SLOT_NAMES[slot]}</div><div class="rowFlex" style="flex-wrap:wrap;margin-top:4px">`;
list.forEach(mid=>{
const m=ALL_MODS[mid];
const sel=mid===curMid;
let disabled=false,tip=m.desc||'';
if(slot==='optic'&&OPTIC_BLOCKED.includes(mid)&&curMid==='gear_nvg'){ disabled=true; tip='夜视仪使用中，光学瞄具不可用'; }
if(slot==='optic'&&mid==='optic_nvg'&&getModChoice(cur,'gear')!=='gear_nvg'){ disabled=true; tip='需先在战术配件槽装入夜视仪'; }
if(slot==='gear'&&mid==='gear_nvg'&&ownedNvgList().length<=0){ disabled=true; tip='需要仓库拥有夜视仪 (市集可购)'; }
const costStr=m.cost?` ¥${formatMoney(m.cost)}`:'';
rows+=`<button class="optBtn modOptBtn${sel?' sel':''}" data-wb="1" data-slot="${slot}" data-mid="${mid}" ${disabled?'disabled':''} title="${tip}" style="font-size:12px;padding:5px 10px;${disabled?'opacity:.4':''}">${(m.icon||'')} ${m.name}${costStr}</button>`;
});
rows+='</div></div></div>';
});
return rows;
}
let WORKBENCH_KEY='';
function bindWorkbench(){
const sel=el('wbWeapon');
if(sel){
const weapons=ownedWeaponList();
for(const k of weapons){
const o=document.createElement('option');
o.value=k; o.textContent=itemName(k);
o.selected=k===WORKBENCH_KEY;
sel.appendChild(o);
}
sel.onchange=()=>{ WORKBENCH_KEY=sel.value; renderArmory('workbench'); };
}
document.querySelectorAll('[data-wb]').forEach(b=>{
b.onclick=()=>{ chargeModChoice(WORKBENCH_KEY,b.dataset.slot,b.dataset.mid); };
});
}

// ---------- 全局接线: 玩家受击走部位系统 ----------
(function wirePlayerDamage(){
const old=player.damage.bind(player);
player.damage=function(amt,attacker,isHead,part){
applyPlayerBodyDamage(amt,attacker,isHead,part);
};
})();
