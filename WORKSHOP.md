# 撤离瓦尔登 · VibeHub 创意工坊 Mod 开发指南

> 本文件是《撤离瓦尔登》(Escape from Walden) 创意工坊的**作者-创作者约定**。平台不会扫描或限制 Mod 代码，但它会读取 `WORKSHOP_CAPABILITIES.json` 决定 UI 上展示哪些能力；下面的指南告诉 Mod 创作者**什么是稳定可用的、什么是会破坏游戏的、什么可能在未来版本失效**。

---

## 1. 玩家可以制作哪些 Mod

| 类别 | 示例 | 用到的主要 API |
|---|---|---|
| **新武器 / 改枪** | 「Kar98k 黄金版：伤害 +15%、自带 4x 镜」 / 「一把苏联版 M1 加兰德」 | `weapons.register(key, def)` |
| **NPC 行为修复** | 「让所有敌方血量 ×1.5，反应时间 ×0.8」 / 「NBK 守备必须携带 SV-98」 / 「区域守备难度按地图分档」 | `npcs.register-template(template)` |
| **玩家模型 / 伤害** | 「医疗兵穿红色头盔」 / 「玩家血量上限 150，但腿部受伤 ×1.5」 | `player.set-visual(opts)` + `player.hook-damage(fn)` |
| **新地图 / 改地图** | 「加一张『工厂』地图，3×3 街区 80m 见方」 / 「改街区的撤离点位置」 | `maps.register(def)` / `maps.select(id)` |
| **子弹 / 命中规则** | 「穿甲弹：命中后 60% 伤害穿透到下一个目标」 | `player.hook-fire(fn)` |
| **事件驱动 Mod** | 「每击杀一个敌方 +¥50」 / 「死亡时弹出死亡信息」 / 「完成一局后写战绩」 | `events.on(event, fn)` |

> ⚠️ **多 Mod 叠加**：上面的所有能力都支持叠加。`npcs.register-template` 多个模板同时存在时按「相乘」叠加，`weapons.register` 同 key 后注册的覆盖先注册的。

---

## 2. 公共对象、注册函数、事件

Mod 只能接触以下「公共对象」，其他全局变量都不保证稳定。

### 2.1 入口：`window.VibeHubGame.modApi`

```js
// 在 Mod 脚本里直接读
const api = window.VibeHubGame.modApi;
```

### 2.2 注册函数

| API | 用途 | 调用时机 |
|---|---|---|
| `api.weapons.register(key, def)` | 注册/覆盖武器到 `WPN_DEFS` | beforeStart |
| `api.weapons.get(key)` | 读单个武器 | 任意 |
| `api.weapons.listAll()` | 列所有武器 key | 任意 |
| `api.weapons.listModded()` | 列本 Mod 注册的 key | 任意 |
| `api.npcs.register(template)` | 注册 NPC 模板（自动注入到所有敌方 Bot） | beforeStart |
| `api.npcs.applyTo(bot)` | 手动对一个 bot 应用所有模板 | afterStart |
| `api.npcs.snapshot()` | 读所有 combatants 浅拷贝 | 任意 |
| `api.maps.register(def)` | 注册/覆盖地图到 `CAMPAIGNS` | beforeStart |
| `api.maps.list()` | 读所有地图浅拷贝 | 任意 |
| `api.maps.select(idOrIdx)` | 选中某张地图（写 localStorage，需要 reload） | 任意 |
| `api.player.snapshot()` | 玩家只读快照（hp/limbs/team/cls/pos） | 任意 |
| `api.player.heal(amount)` | 给自己加血 | 任意 |
| `api.player.setVisual(opts)` | 注册玩家外观覆盖（多个 Mod 按 id 顺序叠加） | beforeStart |
| `api.player.hookDamage(fn)` | 注册伤害钩子（玩家受击时拦截） | afterStart |
| `api.player.hookFireBullet(fn)` | 注册子弹钩子（任意单位开火前拦截） | afterStart |
| `api.events.on(event, fn)` | 订阅平台事件 | afterStart |
| `api.events.off(event, fn)` | 退订 | 任意 |
| `api.events.emit(name, payload)` | 广播自定义事件 | 任意 |
| `api.refs.WPN_DEFS / CAMPAIGNS / FACTIONS / ELO` | 只读引用 | 任意 |
| `api.util.isWeaponKey(k)` / `isFaction(k)` | 工具查询 | 任意 |

### 2.3 平台事件

| 事件名 | payload | 何时触发 |
|---|---|---|
| `weapon:registered` | `{ key, def, replaced }` | 任意 Mod 调用 `weapons.register` |
| `npc:registered` | `{ id }` | 任意 Mod 调用 `npcs.register` |
| `map:registered` | `{ id, def }` | 任意 Mod 调用 `maps.register` |
| `damage` | `{ amount, attacker, target, info }` | 玩家受击时（在 hook 链跑完之后） |
| `kill` | `{ attacker, victim, isHead }` | 任意击杀记入 killfeed 时 |
| `death` | `{ attacker, isHead, target }` | 玩家死亡时 |
| `round:end` | `{ reason }` | 撤离/失败/胜利导致一局结束时 |

### 2.4 钩子签名

```js
// 玩家受击钩子
api.player.hookDamage((amount, attacker, target, info) => {
  // amount: 原始伤害数值
  // attacker: 攻击者对象 (可能是 bot 或 player)
  // target: 玩家对象
  // info: { isHead, part, isPlayer }
  // 返回新值 = 改写伤害；返回 undefined = 透传
});

// 子弹钩子
api.player.hookFireBullet((def, shooter, origin, dir) => {
  // def: 当前武器定义 (含 dmg/headMul/spreadAds 等)
  // shooter / origin / dir: 与 fireBullet 参数一致
  // 返回新 def = 替换；返回 undefined = 透传
});
```

---

## 3. 最小可运行 Mod

### 3.1 启动前注册 Mod（武器 / 地图 / NPC / 玩家外观）

`entryType: classic` + `loadPhase: before-start`：

```js
// mod.js
(function(){
  if(!window.VibeHubGame || !window.VibeHubGame.modApi) return;
  const api = window.VibeHubGame.modApi;

  // 1) 注册新武器
  api.weapons.register('mosin_gold', {
    name: '黄金莫辛(试作)', type: 'bolt', snd: 'sniper',
    dmg: 110, headMul: 2.6, rpm: 50, mag: 5, reserve: 50, reload: 3.3,
    spreadHip: 4.5, spreadAds: 0.05, recoil: 2.5, recSide: 0.45,
    adsFov: 22, kick: 0.11, scoped: true, boltT: 1.05, tracer: 1,
    model: 'mosin'   // 复用既有的莫辛 3D 模型
  });

  // 2) 让所有敌方 Bot 血量 ×1.2、反应 ×0.9（更快）
  api.npcs.register({
    id: 'slightly_tougher',
    hpMul: 1.2,
    reactMul: 0.9
  });

  // 3) 玩家穿红色头盔
  api.player.setVisual({ helmColor: 0xc83030 });
})();
```

### 3.2 启动后订阅 Mod（事件 / 伤害钩子）

`entryType: classic` + `loadPhase: after-start`：

```js
// mod_after.js
(async function(){
  if(!window.VibeHubGame || !window.VibeHubGame.modApi) return;
  const api = window.VibeHubGame.modApi;

  // 等游戏真正 ready
  await new Promise(r => {
    if(api.phase.ready) return r();
    api.phase.onReady(r);
  });

  // 1) 玩家受致命伤时减伤 30%
  api.player.hookDamage((amount, attacker, target, info) => {
    if(amount >= 60) return amount * 0.7;
  });

  // 2) 每局结束播报
  api.events.on('round:end', () => {
    console.log('[mod] 一局结束了');
  });

  // 3) 击杀时给自己加血（联机策略 author-managed 下不推荐; 单机本地 mod 允许）
  api.events.on('kill', ({ victim }) => {
    if(!victim || !victim.isPlayer) api.player.heal(8);
  });
})();
```

---

## 4. 哪些 Mod 应在游戏启动前/启动后加载

| 时机 | 适合做的事 | 不适合做的事 |
|---|---|---|
| **before-start** | 注册武器、地图、NPC 模板、玩家外观 | 订阅运行时事件、修改运行中的 bot |
| **after-start** | 订阅事件、注册伤害钩子、查询当前状态 | 注册新地图（已经过去 initMenuUI 渲染时机） |

> before-start Mod 执行顺序：**平台 → 你的 Mod（按依赖顺序）→ 玩家点开始**。
> after-start Mod 执行顺序：游戏启动完成（`markGameReady`） → 平台 → 你的 Mod。

---

## 5. 基础 Mod API 与跨阶段依赖

| 阶段 | 平台提供的「基础」Mod API | 禁止的依赖 |
|---|---|---|
| before-start | `api.weapons / maps / npcs.register-template / player.set-visual` / `api.events.on`（只是注册，不触发） | 不要在 before-start 调用 `player.heal()` / `hookDamage()` / `hookFireBullet()` —— 此时玩家对象和 fireBullet 已被 modApi 包装，钩子是覆盖式的，多次注册会并存但顺序混乱 |
| after-start | 全部 API 开放，包括 `player.snapshot()` / `npcs.snapshot()` / 事件订阅 | 不要再 `weapons.register()`（已经过了 initMenuUI 渲染，新武器不会出现在选枪界面） |

**禁止的跨阶段依赖**：
- 「启动前 Mod」不能依赖「启动后 Mod」提供的能力（平台不保证加载顺序）
- 「启动后 Mod」不能修改已被 initMenuUI 渲染过的地图选择卡（UI 已生成）

---

## 6. 多 Mod 同时启用：命名 / 去重 / 冲突

### 6.1 命名

- **武器 key** 用小写英文 + 数字 + 下划线，**带 mod 前缀**避免冲突，例如 `goldenmod_mosin` 而不是 `mosin_gold`
- **NPC 模板 id** 同上规则
- **地图 id** 同上规则
- **玩家外观覆盖 id** 通过 `setVisual({ id: 'mymod_xxx', ... })` 显式指定

### 6.2 去重

| 注册 | 重名时怎么处理 |
|---|---|
| `weapons.register(sameKey, def)` | 后注册的覆盖先注册的；可通过 `events.on('weapon:registered', ...)` 监听覆盖链 |
| `npcs.register(sameId, tpl)` | 后注册的覆盖先注册的 |
| `maps.register(sameId, def)` | 后注册的覆盖先注册的（同 id 替换而非追加） |
| `player.setVisual` | 多个 mod 共存时按 `id` 顺序合并（后注册的 `id` 字段会覆盖前面的） |
| `player.hookDamage / hookFireBullet` | **多个钩子并存**，按注册顺序串联调用；任何一个返回 number/object 就改写 |
| `events.on(event, fn)` | 多个监听器并存，全部触发；off 需要拿到原 fn 引用 |

### 6.3 冲突解决建议

- 不要「独占」某个 key —— 用前缀命名并允许他人覆盖
- 复杂叠加逻辑通过 `events.on` 监听其他 Mod 的注册，自己延后处理
- 不要阻塞主线程（同步循环超过 100ms 会让游戏卡顿）

---

## 7. 存档 / 联机 / 加载顺序 / 版本兼容

### 7.1 存档

- Mod **不应**直接读写 `localStorage` / `indexedDB`；平台对游戏存档的 schema 有版本管理，Mod 注入可能让用户升级游戏后无法读档
- 如需持久化，用 `events.on('round:end', ...)` 把进度写到自己的 mod key 命名空间（开发中，目前 Mod 没有持久化 API）

### 7.2 联机

- **当前游戏是单人模式**，没有真正的联机匹配
- `WORKSHOP_CAPABILITIES.json` 全部声明 `multiplayer: local`
- 联机策略 = `author-managed`：平台不会因为 Mod 改动拒绝匹配；**由游戏自行决定**（目前游戏是单人，所以 Mod 改动只影响本地表现）
- **未来若游戏加入联机**：本指南会更新为 `mods-disabled` 或保留 `author-managed`；Mod 作者应预留 `getEnabledMods()` 检查

### 7.3 加载顺序（同一作者 / 多作者）

```
VibeHub Loader (同步) → 拉取所有 before-start Mod (并行)
                       ↓
                       按 dependencyIds 拓扑排序（开发中，目前按拉取顺序）
                       ↓
                       等待所有 before-start 完成
                       ↓
                       window._wfBoot()  // 启动游戏
                       ↓
                       markGameReady()
                       ↓
                       拉取所有 after-start Mod (并行)
                       ↓
                       等待所有 after-start 完成
```

### 7.4 游戏版本兼容

- 游戏大版本升级（如 v1 → v2）可能修改 `WPN_DEFS` / `CAMPAIGNS` 字段；Mod 注册 `vibehub.mod.json` 的 `version` 不应跟游戏版本强绑定，建议在 Mod 描述里写明兼容版本范围
- 平台对 Mod 的 `vibehub.mod.json.capabilities` 做轻量校验：如果游戏升级后删除了某个能力，会在 Mod 列表里标红「已不兼容」

---

## 8. 明确禁止使用的能力

**这些行为可能在任何版本失效；如果你用了，平台不提供兼容性保证：**

| 禁止 | 原因 |
|---|---|
| 直接读写 `localStorage` / `indexedDB` | 与游戏存档 schema 冲突，可能导致玩家升级后无法读档 |
| 操作 DOM（除通过 modApi 暴露的事件外） | 触屏/控件/菜单的 DOM 结构可能在任意小版本调整 |
| 覆盖或重写 `window._wfBoot` / `window.VibeHubGame` / `window.MyGame` | modApi 通过 Object.defineProperty 锁了部分字段，直接覆盖会让后续 Mod 失效 |
| 直接 `mutate` `CAMPAIGNS[i].bases[i]` / `WPN_DEFS[key]` 而不走 `register` | 注册表是平台监测的稳定接触面；私有字段可能在版本升级时改名 |
| 修改游戏存档字段（如 `META`） | 升级时 schema 改变会读不出 |
| 读取 / 写入网络层 / WebSocket / `fetch` 调用第三方服务 | 平台不会为 Mod 网络行为背书；可能造成玩家账号风险 |
| 通过 `dangerouslyDisableSandbox` 等平台内部开关绕过 Loader | Loader 是创作者与作者之间的协议入口，绕过会破坏工坊体系 |
| 直接调用 `combatants.push` / `combatants.splice` 修改 NPC 列表 | 应通过 `npcs.snapshot()` + 自己的状态机，或 `npcs.register-template` |
| 修改 `TEX.*` / `MAT.*` / `vmMats.*` 纹理 / 材质 | 这是私有渲染资源 |
| 修改 `NAV` / `OCC` 导航网格 | 私有寻路实现 |
| 修改 `CANNON` 物理世界 | 私有物理引擎引用 |
| 操作 `#scopeOv` / `#flashOv` 等 HUD 节点 | HUD DOM 可能在任意小版本调整 |

**再次强调**：能力声明（`multiplayer: local`）**不是安全沙箱**。平台不会阻止越权代码；越权代码带来的所有后果由 Mod 作者承担，作者应在 Mod 描述里明确告诉玩家 Mod 做了什么。
