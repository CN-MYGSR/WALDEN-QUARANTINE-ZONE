// 把 MEMORY.md 的 §8/§9 压成「要点 + 指向 REF」，让核心记忆落进 ~10.5k 字符的注入预算内。
const fs = require('fs');
const path = require('path');
const P = path.join(path.resolve(__dirname, '..'), '.workbuddy-ai', 'memory', 'MEMORY.md');
let s = fs.readFileSync(P, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const i = s.indexOf('## 8.');
if (i < 0) { console.log('❌ 找不到 §8 锚点'); process.exit(1); }

const tail = [
  '## 8. 加「物品类别」/「地图」清单（**全清单见 REF，别漏步骤**）',
  '- ⚠️ 加新物品类别要走完：定义表 → 物品函数（**37_meta 与 38_tarkov 两层，必须改 38_tarkov 那层**）→ `ITEM_CATALOG`/`TRADE_KEYS` → 价格/描述/图标 → 掉落池 → 存档迁移 → **仓库/商店/市集三个 tab 的列表来源** → **动作按钮的槽位映射** → HUD。踩过两次：仓库列表漏加新类别（买了看不见、无法装备）；「装备」按钮槽位写死 `kind===\'armor\'?\'armor\':\'primary\'`。',
  '- ⚠️ `itemIconOf` 按 **`itemKind()` 的返回值**分支，新类别图标分支**必须排在通用分支之前**。⚠️ **同一个物品只能有一处定义**（`MISC_DEFS.nvg` 与 `NVG_DEFS.nvg` 曾重复 → MISC 分支抢先命中，价格/描述不一致）。⚠️ `ownedPackList()` 在 **38_tarkov.js**（放 37_meta 会 TDZ）。',
  '- ⚠️ **老档迁移不能只写在 `if(!m.seeded)` 里**（老档 `seeded` 早是 `true`，整块被跳过）：类型归一化无条件做；引用 DEF 表的校验放在定义该表的文件里。',
  '- ⚠️ `setLoadout` 的 `if(!key) return` 会让「不携带/不佩戴」失效 —— 可选槽位必须在 `OPTIONAL_LOADOUT_SLOTS` 里放行。',
  '- 三个 tab 不同源：商店 `ITEM_CATALOG` / 市集 **`TRADE_KEYS`** / 仓库全部 owned 列表。⚠️ 新增 HUD 元素必须同时给 CSS（否则渲染成页面左上角裸文本）。',
  '- **加地图 5 处**：`01_data` 四处（`CAMPAIGNS`+`THEMES`+`CAMPAIGN_WEATHER`+`WEATHER_FX`）、新建 `07f_xxx.js`（照抄 `07e_port.js`）、`08_world` 的 `switch`、`43_maps` 的 `MAP_RULES`、`index.html` script 放在 `08_world` **之前**。商店简介上限 2000。',
  '',
  '## 9. 发布 / 环境 / 测试（细节见 REF）',
  '- **slug `escape-from-walden`**；⚠️ **只能 `update` 不能 `deploy`**；CLI = `%LOCALAPPDATA%\\VibeHub\\bin\\vibehub-windows-x64.exe`（**用 Bash 调**）；目录 `dist/`。',
  '  ⚠️ **`update` 无论有没有变化都会新建 release**（不能"顺手跑一下"）；`--note-file`/`--description-file` **都 2000 字符上限**；',
  '  ⚠️ **`rm -rf dist` 被安全删除策略拦**（`&&` 链断但 `echo` 照打 → 假"重建成功"）→ 用原地覆盖 `cp`。',
  '- **版本号 = `20260919m`**（m=修重开残留 NPC / l=修模型躯干发黄 / k=修夜视仪仓库与使用 / j=夜视仪三型+ISO+微光补光 / i=模型按护甲配色；更早见 REF）。',
  '- ⚠️ **8123 服务器**：`serve_nocache.py` 已改 `ThreadingTCPServer` —— 单线程时并发拉 60+ 脚本会 502 → 跨文件连锁 `xxx is not defined`，**看起来像自己把游戏改崩了**。',
  '  **排查顺序：先 `curl -w \'%{http_code}\'` 逐个脚本 + 看 `location.href`，别先怀疑自己的代码。** ⚠️ 后台进程在两条 bash 命令之间会死 → 起服务器与跑探针放进**同一条**命令。',
  '- ⚠️ **主循环存活判据**：**`nowT` 递增 ≠ 循环正常** → 要看**循环靠后的副作用**（如 `#stamBar` 的 `style.width`）。抓这类问题用 `_tools/_firsterr.js`。',
  '- ⚠️ 探针：本地启动 12~15s（线上用 **45000**）；`Runtime.evaluate` 看不到顶层 `const`/`let`；无头拿不到指针锁定；',
  '  ⚠️ `gamesvibe.app/play/<ID>` 是 Next.js 外壳（游戏在 iframe），对它验收全是 undefined **不是回归**；发版后 CDN 边缘会短暂 404/520，**先重试**。',
  '- 测试：`start.bat`（8123）。`_allmaps_probe.js`（四图回归）/`bld_probe.js <idx>`/`_static_audit.js`/`_audit_refs.js`/`_check_tbtn_layout.js`/`_dist_boot_check.js`。',
  '  绿色基线：`stairOut=0 stairDead=0 sealedBuildings=0 doorGapsAvg≈4`、CONSOLE ERRORS 0、四图 `场景对象=24`。',
  '',
].join(eol);

const head = s.slice(0, i);
const before = s.length;
s = head + tail;
fs.writeFileSync(P, s, 'utf8');
console.log('✅ §8/§9 已压缩：' + before + ' → ' + s.length + ' 字符');
