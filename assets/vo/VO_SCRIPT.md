# 配音脚本 · Escape from TakeFu（撤离瓦尔登）

版本：2026-11-15
用途：英文配音 + 中文字幕。音频随作品本地打包。

## 交付规格

- 单声道；44.1 kHz（48 kHz 亦可）；16/24-bit WAV，或 160–192 kbps MP3。
- 响度 -18 LUFS integrated，true peak ≤ -3 dBTP，每条保持一致。
- 首尾各留 80–150 ms 静音；不要淡入淡出。
- 干声交付：不要音乐、音效、房间混响、无线电噪声——引擎统一加滤波和距离衰减。
- 每条一个文件，一镜到底，不拼接；文件名必须等于下面的 id（例如 `s1_brief.wav`）。
- 同一句只交一版；需要备选时加 `_v2` 并在文件名里说明。

## 音色设定

### Raven One（主声线：全部剧情简报与绝大多数播报）

- 性别/年龄：男声，35–45 岁。
- 音色：中低音、胸腔共鸣、略带沙哑；不要预告片式低音炮。
- 距离感：贴麦近讲，像耳麦/电台，不是礼堂演讲。
- 语速：150–165 wpm；逗号停 150–250 ms，句号停 350–500 ms。
- 情绪基线：克制、专业、疲惫但清醒；紧张时压低音量，不拔高。
- 禁止：播音腔、上扬尾音（upspeak）、唱歌式拖腔、夸张表演、笑声。

### Raven 6（玩家，可选）

- 男声，27–32 岁；比 Raven One 高半档，呼吸感更近。
- 语速 165–180 wpm，句子更短更急，报告式。
- 只用于 `s1_e2`、`s3_e1`、`s5_e2` 三句确认；不做也完全可以，统一用 Raven One。

## 发音

- Walden → WAWL-den
- Anvil → AN-vil
- NBK → en-bee-kay
- USEC → YOU-sek
- Raven One → RAY-ven One
- exfil → EX-fil
- gantry → GAN-tree
- manifest → MAN-i-fest
- Warsaw Pact → WAR-saw Pact

## 剧情模式

### 第 1 章 · 封锁线

#### s1_brief
- 角色：Raven One ｜ 目标时长：33 s ｜ 文件：`s1_brief.wav`

**英文**

> Raven team, this is Raven One. Airdrop confirmed — you're on the north side of old Walden. NBK has breached a sealed level under the industrial yard. Find the derrick, confirm the shaft head is still intact, then exfil to the south pickup. Don't get bogged down. This run is just to confirm the door is still open.

**中文字幕**

> 渡鸦小队，这里是「渡鸦一号」。
> 空投已确认，你现在站在瓦尔登老城北侧。NBK 在城里打穿了一个封存层，就在那片工业堆场底下——找到井架，确认竖井口还在，然后撤到南侧接应点。
> 别恋战。这一趟只是确认门还开着。

朗读：开场简报，平稳、清晰，像在念任务卡；"still open" 放慢半拍收尾。

#### s1_e0
- 角色：Raven One ｜ 目标时长：12 s ｜ 文件：`s1_e0.wav`

**英文**

> The derrick's still showing red. That means there's power below — which means someone's been maintaining it. Watch yourself.

**中文字幕**

> 渡鸦一号：井架还亮着红灯，说明下面的电还在。小心，那也说明有人维护它。

朗读：提醒，不是惊慌；"someone" 轻微加重。

#### s1_e1
- 角色：Raven One ｜ 目标时长：8 s ｜ 文件：`s1_e1.wav`

**英文**

> Shaft in sight. Don't get too close — NBK left people around the head.

**中文字幕**

> 看到井口了。别靠太近——NBK 在井口周围留了人。

朗读：压低、短促；破折号后停半拍。

#### s1_e2
- 角色：Raven 6（可换 Raven One）｜ 目标时长：7 s ｜ 文件：`s1_e2.wav`

**英文**

> Confirmed: shaft head is intact. We can go down. Moving out now.

**中文字幕**

> 确认：竖井口完好，可以下。现在撤。

朗读：报告式，干脆；"intact" 重读。

### 第 2 章 · 封存层

#### s2_brief
- 角色：Raven One ｜ 目标时长：36 s ｜ 文件：`s2_brief.wav`

**英文**

> You're down. This is Anvil, level three — dug by the Warsaw Pact in the eighties, sealed in ninety-one, reopened by NBK in twenty twenty-one. Cold storage is at the north end. Those cryo tanks are where the leak started. Bring up three agent samples — it's the only proof of what NBK is doing here. Be advised: pulling samples will trip their alarm.

**中文字幕**

> 你下来了。
> 这里是铁砧第三层——1980 年代华约挖的，1991 年封的，2021 年被 NBK 重新打开。
> 北端是封存冷库，那一排低温罐就是当年泄漏的源头。带 3 份制剂样本上来，这是唯一能证明 NBK 在做什么的东西。
> 注意：取样本会触发他们的警报。

朗读：前半段平铺历史信息，后半段转任务指令；"trip their alarm" 放慢。

#### s2_e0
- 角色：Raven One ｜ 目标时长：12 s ｜ 文件：`s2_e0.wav`

**英文**

> Cold storage is north. Emergency lights are still on, so main power's live — stay away from the breaker panels.

**中文字幕**

> 渡鸦一号：冷库在北端。应急灯还亮着，说明主电源没断——别碰配电箱。

朗读：技术提醒；"breaker panels" 清楚、略重。

#### s2_e1
- 角色：Raven One ｜ 目标时长：6 s ｜ 文件：`s2_e1.wav`

**英文**

> Alarm's up. They know you're here. Get to the north lift.

**中文字幕**

> 警报响了。他们知道你在这儿了，往北端升降机跑。

朗读：第一次真正紧张：语速加快，但不喊。

#### s2_e2
- 角色：Raven One ｜ 目标时长：7 s ｜ 文件：`s2_e2.wav`

**英文**

> Careful — the central hall is wide open, and both flanks have rooms.

**中文字幕**

> 小心，中央大厅是开阔地，两侧都有房间。

朗读：战术提示；"wide open" 加重。

### 第 3 章 · 证词

#### s3_brief
- 角色：Raven One ｜ 目标时长：25 s ｜ 文件：`s3_brief.wav`

**英文**

> Samples prove what was there, not who did it. USEC sealed a facility of their own under Anvil — NBK's work logs are inside. Bring out two files. The security down there is contract PMC, a lot harder than the crew at the shaft.

**中文字幕**

> 样本只能证明「有什么」，证明不了「谁干的」。
> USEC 在铁砧地下封了一个自己的设施，里面有 NBK 的作业记录。拿 2 份文件出来。
> 那里的守备是 PMC 合同精锐——比井口那批硬得多。

朗读：冷静分析口吻；"who did it" 与 "a lot harder" 两处加重。

#### s3_e0
- 角色：Raven One ｜ 目标时长：13 s ｜ 文件：`s3_e0.wav`

**英文**

> Most of the lighting on this level is dead. Navigate by the emergency panels. No white light — you'll be a target.

**中文字幕**

> 渡鸦一号：这层的照明几乎全废了。靠应急灯板认路，别开强光——你会变成靶子。

朗读：压低、近乎耳语；"target" 冷硬，不要拖长。

#### s3_e1
- 角色：Raven 6（可换 Raven One）｜ 目标时长：5 s ｜ 文件：`s3_e1.wav`

**英文**

> Logs are in hand. Pull out. Don't get greedy with the crates.

**中文字幕**

> 记录到手。撤，别贪箱子。

朗读：短句、命令式；三句之间各留半拍。

### 第 4 章 · 押运

#### s4_brief
- 角色：Raven One ｜ 目标时长：28 s ｜ 文件：`s4_brief.wav`

**英文**

> The logs give us a name — the dispatcher who was on duty at the port the day of the lockdown. He's still in the city, and he's willing to talk. Find him and bring him to the boarding point at the pier. He has to arrive alive. Your squad moves with you — don't let him fall behind.

**中文字幕**

> 记录里提到一个名字——封锁当天在港区值班的调度员。
> 他还在城里，而且愿意说话。找到他，把他带到码头前沿的登船点。
> 他必须活着到。你的队友会跟着你，别让他掉队。

朗读：强调 "alive"；最后一句放慢，带一点压力。

#### s4_e0
- 角色：Raven One ｜ 目标时长：14 s ｜ 文件：`s4_e0.wav`

**英文**

> Sea fog over the port. Visibility's fair, but the container yard is full of blind corners. Stick to the lanes — don't cut between the containers.

**中文字幕**

> 渡鸦一号：港区是海雾，能见度一般，但堆场里全是死角。走通道，别钻箱子缝。

朗读：环境简报；"blind corners" 加重。

#### s4_e1
- 角色：Raven One ｜ 目标时长：6 s ｜ 文件：`s4_e1.wav`

**英文**

> The asset says he heard movement by the gantry cranes.

**中文字幕**

> 渡鸦一号：线人说他听见龙门吊那边有动静。

朗读：不确定情报：语气略收，"movement" 不要拖长。

### 第 5 章 · 航线

#### s5_brief
- 角色：Raven One ｜ 目标时长：31 s ｜ 文件：`s5_brief.wav`

**英文**

> The asset gave us something: a cargo plane never took off the day of the lockdown. Its hold was loaded with the last of what NBK wanted out. The manifest is in the terminal, but peacekeepers are already on site — they don't want anyone reaching it. You have ninety seconds. The runway is open ground — don't stop out there.

**中文字幕**

> 线人交代了一件事：封锁当天有一架货机没起飞，货舱里是 NBK 要运走的最后一批东西。
> 航单在航站楼里，但维和部队已经进场了——他们不想让任何人拿到它。
> 你有 90 秒。跑道是开阔地，别在那儿停。

朗读：倒数第二句开始提速；"ninety seconds" 清楚、前后各停半拍。

#### s5_e0
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`s5_e0.wav`

**英文**

> Extraction window opens in ninety seconds. Hold.

**中文字幕**

> 渡鸦一号：接应窗口 90 秒后打开。撑住。

朗读：短促；"Hold" 单独一顿。

#### s5_e1
- 角色：Raven One ｜ 目标时长：8 s ｜ 文件：`s5_e1.wav`

**英文**

> They're adding bodies. Run for the east end — the pickup's at the far end of the runway.

**中文字幕**

> 他们加人了。往东端跑，接应车在跑道尽头。

朗读：紧迫但不喊；"Run" 加重。

#### s5_e2
- 角色：Raven 6（可换 Raven One）｜ 目标时长：5 s ｜ 文件：`s5_e2.wav`

**英文**

> Manifest secured. Don't linger on the runway.

**中文字幕**

> 航单到手。别在跑道上停留。

朗读：报告 + 提醒；第二句压低。

### 第 6 章 · 灯亮着，就走

#### s6_brief
- 角色：Raven One ｜ 目标时长：29 s ｜ 文件：`s6_brief.wav`

**英文**

> You're holding three things: the samples, the logs, the manifest. That leaves one last job — get out of Walden. There's an exfil pass moving through the port. Take it, get on the boat, and leave the zone from the harbor. The blockade won't open for you twice.

**中文字幕**

> 你手里有三样东西：样本、记录、航单。
> 现在只剩最后一件事——离开瓦尔登。
> 港口有一张撤离通行证在流通。拿到它，带上船，从港口登船离开禁区。
> 封锁线不会为你打开第二次。

朗读：收束感；三样东西逐项点名；最后一句放慢、下沉。

#### s6_e0
- 角色：Raven One ｜ 目标时长：12 s ｜ 文件：`s6_e0.wav`

**英文**

> The pass is in the warehouse. Slot it into your exfil pass before you deploy. Don't forget.

**中文字幕**

> 渡鸦一号：证在仓库里，出击前要在「撤离通行证」槽带上。别忘。

朗读：事务性提醒；"Don't forget" 短而干。

#### s6_e1
- 角色：Raven One ｜ 目标时长：4 s ｜ 文件：`s6_e1.wav`

**英文**

> The boat's waiting.

**中文字幕**

> 渡鸦一号：船在等你。

朗读：全片最轻的一句；几乎是叹气，不要煽情。

### 正常对局

#### m_deploy
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`m_deploy.wav`

**英文**

> You're on the ground. Stay sharp.

**中文字幕**

> 已落地。保持警觉。

朗读：常规进场播报，平稳。

#### m_extract_hold
- 角色：Raven One ｜ 目标时长：6 s ｜ 文件：`m_extract_hold.wav`

**英文**

> Extraction point reached. Hold the zone.

**中文字幕**

> 已到达撤离点。保持在区域内。

朗读：确认 + 指令；"Hold" 加重。

#### m_extract_ok
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`m_extract_ok.wav`

**英文**

> Extraction confirmed. Good work.

**中文字幕**

> 撤离确认。干得好。

朗读：放松半档，带一点认可，不笑。

#### m_signal_lost
- 角色：Raven One ｜ 目标时长：6 s ｜ 文件：`m_signal_lost.wav`

**英文**

> Radio signal lost. You're on your own.

**中文字幕**

> 无线电信号丢失。现在只能靠你自己。

朗读：信号中断感：第二句更近、更低。

#### m_victory
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`m_victory.wav`

**英文**

> Objective secure. Victory is ours.

**中文字幕**

> 目标已控制。我们赢了。

朗读：克制的高兴；不要喊。

#### m_defeat
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`m_defeat.wav`

**英文**

> We've lost the field. Fall back.

**中文字幕**

> 我们失去了战场。撤退。

朗读：低沉、短；"Fall back" 清楚。

#### m_draw
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`m_draw.wav`

**英文**

> Match drawn. Nobody won this one.

**中文字幕**

> 平局。谁也没赢。

朗读：平铺、收着；不要讽刺。

#### m_objective
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`m_objective.wav`

**英文**

> Objective captured. Hold it.

**中文字幕**

> 据点已占领。守住它。

朗读：快节奏播报；两句连读。

#### m_squad_ai
- 角色：Raven One ｜ 目标时长：5 s ｜ 文件：`m_squad_ai.wav`

**英文**

> Squad link down. AI's taking the slot.

**中文字幕**

> 队友断线。AI 已顶替。

朗读：平静、事务性；"link down" 略重。

## 交付检查

- [ ] 30 个文件齐全，文件名与 id 完全一致
- [ ] 全部同一音色、同一响度；没有一条突然变响或变闷
- [ ] 没有音乐、音效、混响；首尾静音不超过 150 ms
- [ ] 专名按上面的发音表读
- [ ] 简报语速自然不赶；事件台词短促但不喊

