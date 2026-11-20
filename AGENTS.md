# AI 工程规范 · Escape from TakeFu（撤离瓦尔登）

本文件是后续所有 AI 开发的默认约定。动手前先读，冲突时以线上规范为准。

## 0. 真相源（每次任务重新拉取，不用记忆/旧副本）

- https://gamesvibe.app/llms.txt
- https://gamesvibe.app/api/skill —— CLI 唯一操作规范；每次任务重拉一次
- https://gamesvibe.app/sdk/v3/llms-full.txt —— SDK 红线、同步模型、性能、API
- 本机 CLI：`%LOCALAPPDATA%\VibeHub\bin\vibehub-windows-x64.exe`
- 发布/更新前先跑官方安装器确认版本，再 `whoami` → `list` 取精确 slug。

## 1. 项目身份

- 项目 slug：`escape-from-walden`（`VibeHub.init({work})`、CLI `--slug`、试玩路径都用它）
- 作品 ID：`OV7HCwbazBp6HqrNiyljS` —— 只用于主站 `/works/`、`/play/` 路由，禁止传给 SDK 或 CLI
- 平台域：`https://vibe.lumigrav.space`（见 `.vibehub/project.json`）
- 部署目录：`dist/`，顶层必须有 `index.html`；根目录是源码，`dist/` 是它的镜像

## 2. 架构红线

- 只用 `window.VibeHub`；禁止自建后端、数据库、WebSocket。
- SDK 必须用**绝对地址**引入；禁止 `/sdk/v3/vibehub.js` 这类相对路径。
- 禁止 `setInterval(fetch)` 或任何轮询同步；禁止把坐标、速度、比分、每帧状态写库。
- 渲染用 Canvas/WebGL + `requestAnimationFrame`；UI 状态与游戏循环分离。
- 实时状态走 `room.sendRealtime()`（可丢、合并最新）；开火/伤害/拾取/撤离/聊天/结算走 `room.send()`（可靠）。
- 单条消息编码后 ≤ 65535 bytes；大状态优先二进制。
- 初始化多 key 用 `get(["a","b"])` 批量读；热数据依赖 SDK 内置 LRU，不做冗余 get。
- 读取存档/设置必须做版本兼容（`if(!p.v2) ...`）；SDK 不自动迁移。

## 3. 同步模型（本项目：state-sync + 房主权威 NPC）

- 玩家自身：本人权威，20Hz `sendRealtime` 广播位置/姿态。
- 敌方 NPC：房主 15Hz 演算并广播快照，客户端只插值应用、不跑 AI。
- 伤害/击杀/拾取/撤离/结算：可靠 `send`，房主仲裁。
- 理由：实时动作 + 大量 AI，state-sync 比 lockstep 稳；本人权威保证移动手感。

## 4. 数据分层

- `vibe.save`：玩家 KD、货币、仓库价值等私人持久数据（本人读写）。
- `room.data`：单局元数据（仅房主写）。
- `vibe.global`：全服榜单/配置（创作者写、所有人读；写失败要降级并说明）。
- 高频对局数据一律不进以上三层。

## 5. 配音规范

- 音源：由用户提供的 TTS 生成，音频随作品本地打包；**默认不再调用 CLI 生成语音、不消耗积分**。只有用户明确要求时才走 CLI。
- 脚本：`assets/vo/VO_SCRIPT.md` 是台词与声色需求的唯一来源（30 条：剧情 21 + 对局 9）；改台词先改这里，再改 manifest。
- 语言：**英文配音 + 中文字幕**；字幕用中文原文，不改写、不机翻回填。
- 交付规格：单声道 44.1/48 kHz、16/24-bit WAV 或 160–192 kbps MP3；-18 LUFS、true peak ≤ -3 dBTP；首尾 80–150 ms 静音；干声，无音乐/混响/噪声。
- 资源放 `assets/vo/`；`assets/vo/manifest.json` 是运行时唯一索引（id、file、en、zh、duration）。
- 换音频/改台词后：跑 `python _tools/build_vo_manifest.py` 重建清单，再用 `node _tools/vo_probe.js <url>` 验收清单、播放、字幕与 duck。
- 若用户改回用 CLI：全部台词同一档（优先 `voice-hd`，积分不足整体降 `voice`，不得混档），只传 `contracts.allow` 字段，禁止直连上游 API。
- 语音只读本地文件：不联网、不写库、不进 `room`；多人各自本地播放，不做网络同步。
- 播放单通道：新台词打断旧台词；剧情优先级高于对局播报。
- 字幕：底部居中 `#voSub`，中文，最多两行，`aria-live="polite"`；音频结束或超时立即隐藏。
- 混音：播放时压低音效总线（duck），结束/出错必须恢复；不得覆盖玩家的音量设置。
- 自动播放：必须等首次用户手势；禁止在加载时抢播。
- 禁止在每帧循环里 new Audio、改 DOM 或做字符串拼接。

## 6. 代码与文件约定

- `js/NN_name.js` 按序加载；新模块编号递增并放在 `index.html` 末尾，依赖前面已存在的全局。
- 每帧新增逻辑必须包 `try/catch` 且只报一次错，不能拖垮主循环。
- 不改 `RUN` 重置点与 `META` 迁移规则；剧情进度继续存独立 `localStorage`。
- 瞄具倍率统一走 `adsFovOf()` / `zoomOf()`（14b）；相机、鼠标灵敏度、镜内渲染不得各自读 `adsFov`。
- 镜内画面走双摄像机：`SCOPE.preRender()` 先把场景渲进 RT，再由枪模目镜 quad 采样；不要在 `NVG.render` 外恢复全屏镜片，也不要重新引入 VHS/鱼眼后处理。
- 镜片遮罩 = 目镜本体：开镜时由 `63_scope.sightScale()` 反算倍率，`15_viewmodel` 把整个视模型（枪身+手臂）等比放大，目镜推到 `SCOPE.adsDist()`；狙击 82% / 非狙击 55% 屏高由目镜半径自动满足。不要再把遮罩单独放大成"全屏圆盘"，否则会出现遮罩巨大、枪身很小的割裂。
- 库存 UI 统一走 `65_invgrid`：占位面积 = `itemSizeOf()`；`META.owned/META.loot/RUN.loot/RUN.secure` 仍是计数真相，layout 只存 `{x,y,rot}`，面板不要直接改计数。
- 当前占格：背包 2×3、头盔 2×2、护甲 3×4、长枪 4×2、手枪/副武器 1×2；改尺寸必须同时改 `itemSizeOf()` 与 `INVGRID.foot()`，保持面积相等。
- 弹药：开局 `mag/reserve=0`，由部署界面带入弹盒；弹种 0 RIP / 1 普通 / 2 M855 / 3 M995 / 4 AP，装填走 `loadAmmoFromBag()`，穿透只在 `applyPlayerBodyDamage()` 结算。不要恢复免费备弹或允许弹种混装。
- 护甲：无插板=凯夫拉（`armorResist*0.35`）；插板等级存 `p.plateLevel`，破甲规则在 `applyPlayerBodyDamage()`；面罩用 `p.faceLevel` / `RUN.faceDown`，展开期间必须禁用 NVG。
- 面罩与 NVG 共用 `N` 轻按：面罩/夜视二选一（`RUN.headGear`），所有头盔 `faceShield:true`；触屏 `tNvg` 文案跟随。库存旋转统一走 `INVGRID.rotate()`（触屏按钮，不依赖 R）。新增武器必须同时补 `WPN_DEFS`、`MOD_AVAIL`、`ARSENAL_ERA` 与枪模别名。
- 改装视觉：镜座已在 14b 抬高；自带镜武器不使用外置镜模型；夜视仪占 `gear` 槽时 `effectiveOptic()` 会强制机瞄，UI 必须同步提示。
- BOSS：每张可交战地图一名，定义在 `66_boss`（队伍=玩家对面，`unitId='BOSS'`，不编队、不倒地）。**不显示任何 BOSS 血量 HUD**。街区 `bfruins` 的守备与 BOSS 互不交火；其他地图允许同阵营 BOSS 与守备互相攻击。所有新的敌我过滤点必须走 `isHostileUnit(a,b)`，不要只写 `a.team===b.team`。
- 背包/模态输入：Tab 打开背包时必须 `releaseAllInputs()` + 取消开镜 + `exitPointerLock()`；面板打开期间键盘只允许 Tab/Esc（关闭）、R（旋转）、↑/↓（选择），其余按键在 24_input 最前面吞掉且不写入 `keys`。`pointerlockchange` 在背包打开时不得弹部署界面；关闭背包后要恢复指针锁定（`bagRelockPointer`），画布点击也不得在背包打开时抢锁。
- 依赖加载：`node_modules/` 已移除。浏览器端裸模块名走 `index.html` 的 Import Map：`three → ./vendor/three.module.min.js`、`cannon-es → ./vendor/cannon-es.js`。新增浏览器库必须放 `vendor/` 并补 import map，不要重新引入 node_modules 运行时依赖；经典脚本仍用 `vendor/three.min.js` 的全局 `THREE`。
- `_tools` 探针不再依赖 `ws` 包：统一 `require('./ws')`（封装 Node 自带 WebSocket，见 `_tools/ws.js`）。Node 版本需 ≥22。
- 修改后同步 `dist/`（index.html、css、js、vendor、assets）；`_tools`、截图、`.vibehub` 不进部署目录。
- 部署只用 `vibehub update --slug escape-from-walden --dir dist`；禁止手写上传或调用平台接口。
- 不覆盖用户已有改动；不执行破坏性 git 命令（`reset --hard`、`checkout --`）。

## 7. 交付前自检

- [ ] 本地 `python _tools/serve_nocache.py 8123` 启动，控制台无报错
- [ ] 剧情：6 章简报可播放；局内事件同时出英文语音与中文字幕
- [ ] 对局：部署/进撤离点/撤离成功/信号丢失/胜负均有播报
- [ ] 语音结束、切图、死亡、重开时字幕不残留，duck 已恢复
- [ ] 设置音量/静音生效；移动端字幕不遮挡 HUD
- [ ] `dist/` 启动检查通过；CLI `update` 成功并回读线上地址
