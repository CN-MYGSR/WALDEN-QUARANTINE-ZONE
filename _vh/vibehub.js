/*!
 * VibeHub 游戏 SDK — 账号 / 云存档 / 联机（WebRTC P2P + VibeNet 自适应中继）
 * 无依赖，全局挂载 window.VibeHub。
 *
 *   // work 是项目 slug（来自 vibeapps 试玩路径 / vibehub list），不是主站 /works/ 的作品 ID。
 *   const vibe = await VibeHub.init({ work: 'my-game' });
 *   const user = await vibe.login();                     // 弹窗授权，返回 {id,name,image}
 *   const offAuth = vibe.onAuthChange((user) => {});     // 返回取消监听函数
 *   // 用户主动退出时调用 vibe.logout();                  // 不退出 VibeHub 主站
 *   await vibe.save.set('progress', { level: 3 });
 *   const room = await vibe.room.join('room1');          // 默认 host 拓扑, relay 自动开启
 *   room.onMessage((msg, fromId) => ...);  room.send(data);
 *   room.peers();  // [{id, open, latency, relay, score}]
 *   await room.diagnostics();  // RTC/ICE 状态与候选类型（不含候选 IP）
 *
 * VibeNet 中继: 一个主路径 + 最多一个暖备 + 切换期短暂双发。
 * - SDK 初始化即尽力贡献全局节点；登录、退出和 Room 生命周期不改变贡献状态
 * - 主线程运行, 探测用 requestIdleCallback 分片 (不阻塞游戏循环)
 * - 按目标混合直连/Relay，房内端点自动收敛到共同 Relay
 * - 断线自动提升暖备，恢复后经短暂双发切回直连
 * - 重连指数退避: 1s → 2s → 4s → ... → 60s max
 */
(function (global) {
  "use strict";

  function detectReleaseChannel() {
    var script = global.document && global.document.currentScript;
    var source = script && script.src ? script.src : "";
    if (/\/sdk\/beta\//.test(source)) return "beta";
    if (/\/sdk\/v\d+\//.test(source)) return "stable";
    return "unknown";
  }

  var STUN_HOST = (function () {
    var h = global.location && global.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "localhost";
    return "vibeturn.lumigrav.space";
  })();
  var BASE_ICE_SERVERS = [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["stun:" + STUN_HOST + ":3478"] },
  ];
  var RECEIVE_WINDOW_SIZE = 512;
  var ICE_DISCONNECT_MS = 5000;

  // VibeRelay 有限主备参数
  var RELAY_CANDIDATE_COUNT = 4;
  var RELAY_PATH_LIMIT = 2;
  var RELAY_PENDING_MS = 10000;
  var RELAY_SWITCH_OVERLAP_MS = 3000;
  var RELAY_PROBE_MS = 10000;
  var RELAY_STATE_TTL_MS = 35000;
  var RELAY_STATE_MAX_IDS = 8;
  var RELAY_CONVERGENCE_RETRY_MS = 8000;
  var RELAY_PRUNE_SCORE = 0.10;
  var RELAY_MAX_CONSEC_FAILS = 3;
  var RELAY_COOLDOWN_MS = 120000;     // 冷却 2min 后可复活
  var RELAY_RESURRECT_SCORE = 0.35;

  // 重连指数退避
  var RECONNECT_BASE_MS = 1000;
  var RECONNECT_MAX_MS = 60000;
  var RECONNECT_GRACE_MS = 120000;    // 2min 宽限期
  var RTC_DIAGNOSTIC_HISTORY_LIMIT = 24;

  // 信令轮询
  var SIGNAL_POLL_FAST_COUNT = 5;     // 前 N 次用快速间隔
  var SIGNAL_POLL_FAST_MS = 100;      // 快速轮询间隔
  var SIGNAL_POLL_NORMAL_MS = 300;    // 正常轮询间隔
  var SIGNAL_POLL_RETRY_BASE_MS = 1000;
  var SIGNAL_POLL_RETRY_MAX_MS = 10000;
  var SIGNAL_POLL_RATE_LIMIT_MAX_MS = 60000;

  // 心跳
  var PRESENCE_HB_MS = 20000;         // presence 心跳间隔
  var ROOM_ANNOUNCE_HB_MS = 25000;    // 房间 announce 续期间隔
  var AUTH_REFRESH_MARGIN_MS = 15 * 60 * 1000;
  var AUTH_REFRESH_RETRY_MS = 30 * 1000;
  var TURN_REFRESH_MARGIN_MS = 10 * 60 * 1000;
  var TURN_REFRESH_RETRY_MS = 30 * 1000;
  var ROOM_CAPABILITY_REFRESH_MARGIN_MS = 10 * 60 * 1000;
  var ROOM_CAPABILITY_REFRESH_RETRY_MS = 30 * 1000;
  var QUALITY_SAMPLE_MS = 2000;
  var QUALITY_STALE_MS = 10000;
  var REALTIME_MAX_BUFFERED_BYTES = 64 * 1024;
  var REALTIME_BUFFERED_LOW_BYTES = 16 * 1024;

  // 评分引擎
  var SCORE_LAT_MAX = 500;            // 延迟评分上限 (ms), 超此值 latencyScore=0
  var SCORE_EMA_ALPHA = 0.2;          // 延迟 EMA 平滑系数
  var SCORE_FAIL_PENALTY = 0.5;       // 失败惩罚系数 (乘以当前分)
  var SCORE_LOSSRATE_DECAY = 0.02;    // 成功时丢包率衰减量
  var SCORE_LOSSRATE_RISE = 1.5;      // 失败时丢包率增长因子
  var SCORE_RECALC_WEIGHT = 0.7;      // 重算时的旧分权重
  var SCORE_MAX_STABLE = 0.85;        // 稳定 relay 分数上限 (boost 到此后不再加)

  // 探测
  var PROBE_ACK_TIMEOUT_MS = 3000;    // 探测 ACK 超时
  var PROBE_PAYLOAD = new Uint8Array([1]);   // 探测包 payload
  var WIRE_FLAG = 1;
  var WIRE_ENVELOPE_FLAG = 32;
  var WIRE_ENCRYPTED_FLAG = 64;

  // 评分 / 分数常量
  var RELAY_PRUNE_GRACE_MS = 90000;    // 新 relay 保护期 (1.5min 内不因低分被剪枝)
  var SCORE_PICK_MIN = 0.08;           // pickTop 最低分数阈值
  var SCORE_INIT = 0.5;                // 新 relay 初始分
  var SCORE_INIT_LATENCY = 100;        // 新 relay 初始延迟估算 (ms)
  var SCORE_RESURRECT_LATENCY = 200;   // 复活 relay 初始延迟估算 (ms)
  var SCORE_RESURRECT_LOSS = 0.15;     // 复活 relay 的保守初始丢包率
  var SCORE_INIT_LOSS = 0.05;          // 新 relay 初始丢包率
  var SCORE_RECALC_LAT_WEIGHT = 0.2;   // _recalc 延迟评分权重
  var SCORE_RECALC_LOSS_WEIGHT = 0.1;   // _recalc 丢包评分权重
  var SCORE_MIN_FLOOR = 0.01;           // 分数最小值 (避免降至 0)
  var SCORE_LOSSRATE_FAIL_FLOOR = 0.03; // reportFail: 丢包率增长的绝对加数
  var STREAM_PROBE = 0;
  var STREAM_GAME = 1;
  var STREAM_QUALITY = 2;
  var STREAM_REALTIME = 3;
  var REALTIME_GAME_LABEL = "game-realtime";
  var REALTIME_RELAY_LABEL = "relay-realtime";

  function parseRetryAfterMs(value, now) {
    if (typeof value !== "string" || !value.trim()) return 0;
    var seconds = Number(value);
    if (isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    var retryAt = Date.parse(value);
    return isNaN(retryAt) ? 0 : Math.max(0, retryAt - (typeof now === "number" ? now : Date.now()));
  }

  function signalPollRetryMs(error, failures) {
    if (error && error.status === 429 && error.retryAfterMs > 0) {
      return Math.min(
        SIGNAL_POLL_RATE_LIMIT_MAX_MS,
        Math.max(SIGNAL_POLL_NORMAL_MS, error.retryAfterMs),
      );
    }
    var exponent = Math.max(0, Math.min(10, (failures || 1) - 1));
    return Math.min(SIGNAL_POLL_RETRY_MAX_MS, SIGNAL_POLL_RETRY_BASE_MS * Math.pow(2, exponent));
  }

  function randomId() {
    return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function defaultApiBase() {
    var h = global.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return global.location.origin;
    return "https://vibe.lumigrav.space";
  }

  function tokenExpiresAt(token) {
    if (!token || typeof token !== "string" || !global.atob) return 0;
    try {
      var body = token.slice(0, token.lastIndexOf(".")).replace(/-/g, "+").replace(/_/g, "/");
      while (body.length % 4) body += "=";
      var payload = JSON.parse(global.atob(body));
      return typeof payload.exp === "number" && isFinite(payload.exp) ? payload.exp : 0;
    } catch (_error) {
      return 0;
    }
  }

  var contributorLoad = null;
  function ensureVibeNetContributor(apiBase) {
    if (global.__VibeHubVibeNetContributor) return Promise.resolve();
    if (contributorLoad) return contributorLoad;
    if (!global.document || !global.document.createElement) return Promise.resolve();
    contributorLoad = new Promise(function (resolve, reject) {
      var script = global.document.createElement("script");
      script.src = apiBase.replace(/\/$/, "") + "/relay-worker.js";
      script.async = true;
      script.dataset.vibehubVibenet = "global";
      script.onload = function () { resolve(); };
      script.onerror = function () {
        contributorLoad = null;
        reject(new Error("[VibeHub] VibeNet 贡献程序加载失败"));
      };
      (global.document.head || global.document.documentElement).appendChild(script);
    });
    return contributorLoad;
  }

  // ----------------------------------------------------------------
  // VibeRelay 评分引擎 (冷却池 + 复活 + 定期加分)
  // ----------------------------------------------------------------
  function RelayScorer() {
    this.scores = {};     // relayId -> {score,latency,lossRate,failStreak,firstSeen,lastProbe,lastFail}
    this.cooldown = {};   // relayId -> {until,prevScore}
    this._probeSeq = 0;
  }
  RelayScorer.prototype._now = function () { return Date.now(); };

  RelayScorer.prototype.add = function (relayId) {
    if (this.scores[relayId]) return true;
    var cd = this.cooldown[relayId];
    if (cd && this._now() < cd.until) return false; // 冷却中
    var resurrect = cd && this._now() >= cd.until;
    delete this.cooldown[relayId];
    this.scores[relayId] = {
      score: resurrect ? RELAY_RESURRECT_SCORE : SCORE_INIT,
      latency: resurrect ? SCORE_RESURRECT_LATENCY : SCORE_INIT_LATENCY,
      lossRate: resurrect ? SCORE_RESURRECT_LOSS : SCORE_INIT_LOSS,
      failStreak: 0,
      firstSeen: this._now(),
      lastProbe: 0,
      lastFail: 0,
      _ackPending: 0,
      _probeAckSeq: -1,
    };
    return true;
  };

  // 放入冷却池 (而非永久删除)
  RelayScorer.prototype.remove = function (relayId) {
    var s = this.scores[relayId];
    if (s) {
      var now = this._now();
      this.cooldown[relayId] = {
        until: now + RELAY_COOLDOWN_MS,
        retryAfter: now + RELAY_CONVERGENCE_RETRY_MS,
        prevScore: s.score,
      };
    }
    delete this.scores[relayId];
  };

  RelayScorer.prototype.has = function (relayId) {
    return !!this.scores[relayId];
  };

  RelayScorer.prototype.reportLatency = function (relayId, ms) {
    var s = this.scores[relayId]; if (!s) return;
    ms = Math.max(1, Math.min(SCORE_LAT_MAX * 10, ms));
    s.latency = s.latency * (1 - SCORE_EMA_ALPHA) + ms * SCORE_EMA_ALPHA;
    s.lossRate = Math.max(0, s.lossRate - SCORE_LOSSRATE_DECAY);
    s.failStreak = 0;
    s.lastProbe = this._now();
    this._recalc(relayId);
  };

  RelayScorer.prototype.reportFail = function (relayId) {
    var s = this.scores[relayId]; if (!s) return;
    s.failStreak++;
    s.lossRate = Math.min(1, s.lossRate * SCORE_LOSSRATE_RISE + SCORE_LOSSRATE_FAIL_FLOOR);
    s.lastFail = this._now();
    s.score *= SCORE_FAIL_PENALTY;
    this._recalc(relayId);
  };

  RelayScorer.prototype.reportAck = function (relayId, rtt) {
    this.reportLatency(relayId, rtt);
    var s = this.scores[relayId]; if (s) s._ackPending = Math.max(0, s._ackPending - 1);
  };

  RelayScorer.prototype._recalc = function (relayId) {
    var s = this.scores[relayId]; if (!s) return;
    var latScore = Math.max(0, 1 - s.latency / SCORE_LAT_MAX);
    var lossPenalty = Math.max(0, 1 - s.lossRate);
    s.score = Math.max(SCORE_MIN_FLOOR, Math.min(SCORE_MAX_STABLE, s.score * SCORE_RECALC_WEIGHT + latScore * SCORE_RECALC_LAT_WEIGHT + lossPenalty * SCORE_RECALC_LOSS_WEIGHT));
  };

  RelayScorer.prototype.pickFailing = function () {
    var now = this._now(), out = [];
    for (var id in this.scores) {
      var s = this.scores[id];
      if (s.failStreak >= RELAY_MAX_CONSEC_FAILS) { out.push(id); continue; }
      if (s.score < RELAY_PRUNE_SCORE && now - s.firstSeen > RELAY_PRUNE_GRACE_MS) { out.push(id); }
    }
    return out;
  };

  RelayScorer.prototype.pickTop = function (k) {
    var list = [];
    for (var id in this.scores) list.push({ id: id, s: this.scores[id] });
    list.sort(function (a, b) { return b.s.score - a.s.score; });
    var picked = [];
    for (var i = 0; i < list.length && picked.length < k; i++) {
      if (list[i].s.score < SCORE_PICK_MIN) continue;
      picked.push(list[i].id);
    }
    return picked;
  };

  // ----------------------------------------------------------------
  // 认证后接收窗口：按 sender + epoch + stream 做 uint32 滑动去重
  // ----------------------------------------------------------------
  function ReceiveWindow(size) {
    this._size = size;
    this._states = {};
    this._maxStates = 128;
  }
  ReceiveWindow.prototype.accept = function (fromId, epoch, stream, seq) {
    var key = fromId + ":" + epoch + ":" + stream;
    var state = this._states[key];
    if (!state) {
      if (Object.keys(this._states).length >= this._maxStates) {
        var oldestKey = null, oldestAt = Infinity;
        for (var existing in this._states) {
          if (this._states[existing].touchedAt < oldestAt) {
            oldestAt = this._states[existing].touchedAt;
            oldestKey = existing;
          }
        }
        if (oldestKey) delete this._states[oldestKey];
      }
      var firstSeen = {};
      firstSeen[seq >>> 0] = true;
      this._states[key] = {
        highest: seq >>> 0,
        seen: firstSeen,
        touchedAt: Date.now(),
      };
      return true;
    }
    state.touchedAt = Date.now();
    seq = seq >>> 0;
    if (state.seen[seq]) return false;
    var forward = (seq - state.highest) >>> 0;
    if (forward > 0 && forward < 0x80000000) {
      state.highest = seq;
    } else {
      var behind = (state.highest - seq) >>> 0;
      if (behind >= this._size) return false;
    }
    state.seen[seq] = true;
    for (var value in state.seen) {
      if (((state.highest - (Number(value) >>> 0)) >>> 0) >= this._size) {
        delete state.seen[value];
      }
    }
    return true;
  };

  // ----------------------------------------------------------------
  // StateManager — 自动状态同步 (P0)
  //   开发者视角: room.state.set('key', val) → 自动广播到全房
  //   底层: LWW 冲突解决, 权威检查, 变更监听
  // ----------------------------------------------------------------
  function StateManager(opts) {
    opts = opts || {};
    this._store = {};         // key → { value, _ts, _by }
    this._listeners = {};     // key → [callback]
    this._isHost = !!opts.isHost;
    this._authorityMode = opts.authorityMode || "host"; // "host" | "anyone"
    this._sendFn = opts.sendFn || null; // called as _sendFn(key, value) to broadcast
  }

  StateManager.prototype.set = function (key, value) {
    if (this._authorityMode === "host" && !this._isHost) {
      throw new Error("[VibeHub] state: 仅房主可写入 (authority=host)");
    }
    var old = this._store[key] ? this._store[key].value : undefined;
    var entry = { value: value, _ts: Date.now(), _by: "local" };
    this._store[key] = entry;
    this._fire(key, value, old);
    // 广播到其他客户端
    if (this._sendFn) this._sendFn(key, value, entry._ts);
    return this;
  };

  StateManager.prototype.get = function (key) {
    var entry = this._store[key];
    return entry ? entry.value : undefined;
  };

  StateManager.prototype.on = function (key, callback) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(callback);
    var self = this;
    return function () { self.off(key, callback); };
  };

  StateManager.prototype.off = function (key, callback) {
    var list = this._listeners[key];
    if (!list) return;
    var i = list.indexOf(callback);
    if (i >= 0) list.splice(i, 1);
  };

  StateManager.prototype._fire = function (key, newVal, oldVal) {
    var list = this._listeners[key];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](newVal, oldVal); } catch (e) { console.error("[VibeHub] state listener error:", e); }
    }
  };

  // 处理来自网络的远程更新
  StateManager.prototype._applyRemote = function (key, value, sourcePeerId, messageTs) {
    // 新协议把时间戳放在 state 消息顶层；仍兼容旧客户端把 _ts 放进 value 的情况。
    var remoteTs = typeof messageTs === "number"
      ? messageTs
      : ((value && typeof value._ts === "number") ? value._ts : 0);
    var existing = this._store[key];
    // LWW: 更新的时间戳优先; 平局时 peerId 小的赢 (确定性)
    if (existing) {
      var localTs = existing._ts || 0;
      if (remoteTs < localTs) return false;            // 旧数据, 忽略
      if (remoteTs === localTs && sourcePeerId >= this._peerId) return false; // 平局确定性
    }
    var old = existing ? existing.value : undefined;
    this._store[key] = { value: value, _ts: remoteTs, _by: sourcePeerId || "remote" };
    this._fire(key, value, old);
    return true;
  };

  StateManager.prototype.snapshot = function () {
    var out = {};
    for (var k in this._store) {
      if (Object.prototype.hasOwnProperty.call(this._store, k)) {
        out[k] = this._store[k].value;
      }
    }
    return out;
  };

  // Set peerId for LWW tie-breaking
  StateManager.prototype._setPeerId = function (id) { this._peerId = id; };

  // ----------------------------------------------------------------
  // 扩展 StateManager.prototype → Room.state
  // ----------------------------------------------------------------
  function _stateToRemoteMsg(key, value) {
    return JSON.stringify({ t: "state", key: key, value: value, _ts: Date.now() });
  }
  function _stateFromRemoteMsg(text) {
    try { var o = JSON.parse(text); if (o && o.t === "state") return o; } catch (e) {}
    return null;
  }

  // ----------------------------------------------------------------
  // SnapshotInterp — 快照插值 (P1)
  // ----------------------------------------------------------------
  function SnapshotInterp(opts) {
    opts = opts || {};
    this._buffers = {};        // key → [{_t, ...other fields}]
    this._bufferSize = opts.bufferSize || 60;
    this._interpDelayMs = opts.interpDelayMs || 100;
  }

  SnapshotInterp.prototype.push = function (key, snap) {
    if (!snap || typeof snap !== "object") return;
    if (!this._buffers[key]) this._buffers[key] = [];
    var buf = this._buffers[key];
    // 保持有序插入 (按 _t 升序)
    var copy = shallowCopy(snap);
    var t = typeof copy._t === "number" ? copy._t : Date.now();
    copy._t = t;
    var ins = buf.length;
    for (var i = buf.length - 1; i >= 0; i--) {
      if (buf[i]._t <= t) { ins = i + 1; break; }
      ins = i;
    }
    buf.splice(ins, 0, copy);
    // 溢出: 淘汰最旧的
    while (buf.length > this._bufferSize) buf.shift();
  };

  SnapshotInterp.prototype.get = function (key, renderTime) {
    var buf = this._buffers[key];
    if (!buf || buf.length === 0) return null;
    if (typeof renderTime !== "number" || !Number.isFinite(renderTime)) {
      renderTime = Date.now() - this._interpDelayMs;
    }
    // 找插值区间: 第一个 ≥ renderTime 的 snap
    var i;
    for (i = 0; i < buf.length; i++) { if (buf[i]._t >= renderTime) break; }
    if (i === 0) return shallowCopy(buf[0]);   // 所有 snap 都比 renderTime 新 → 用最旧的
    if (i >= buf.length) {                       // 所有 snap 都比 renderTime 旧 → 外推
      if (buf.length >= 2) return extrapolate(buf[buf.length - 2], buf[buf.length - 1], renderTime);
      return shallowCopy(buf[buf.length - 1]);
    }
    // 在 buf[i-1] 和 buf[i] 之间插值
    return interpolate(buf[i - 1], buf[i], renderTime);
  };

  function shallowCopy(o) {
    var c = {}; for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; } return c;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function interpolate(a, b, renderTime) {
    var range = b._t - a._t;
    if (range <= 0) return shallowCopy(b);
    var t = (renderTime - a._t) / range;
    t = Math.max(0, Math.min(1, t));
    var out = shallowCopy(b);
    for (var k in a) {
      if (k === "_t") continue;
      if (typeof a[k] === "number" && typeof b[k] === "number") out[k] = lerp(a[k], b[k], t);
    }
    return out;
  }

  function extrapolate(a, b, renderTime) {
    var dt = b._t - a._t;
    if (dt <= 0) return shallowCopy(b);
    var steps = (renderTime - b._t) / dt;
    // Clamp extrapolation to 3 steps max to prevent fly-away
    steps = Math.min(steps, 3);
    var out = shallowCopy(b);
    for (var k in a) {
      if (k === "_t") continue;
      if (typeof a[k] === "number" && typeof b[k] === "number") {
        out[k] = b[k] + (b[k] - a[k]) * steps;
      }
    }
    out._t = renderTime;
    return out;
  }

  // ----------------------------------------------------------------
  // ClientCache — 客户端 LRU 缓存 (减少 HTTP 往返)
  // ----------------------------------------------------------------
  function ClientCache(maxSize) {
    this._maxSize = maxSize || 256;
    this._map = {};
    this._lru = []; // 最近使用排在末尾
  }
  ClientCache.prototype._packKey = function (scope, ns, key) {
    return scope + "::" + ns + "::" + key;
  };
  ClientCache.prototype.get = function (scope, ns, key) {
    var ck = this._packKey(scope, ns, key);
    var entry = this._map[ck];
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.del(scope, ns, key);
      return null;
    }
    // Move to end (most recently used)
    var idx = this._lru.indexOf(ck);
    if (idx >= 0) { this._lru.splice(idx, 1); this._lru.push(ck); }
    return entry.value;
  };
  ClientCache.prototype.set = function (scope, ns, key, value, expiresAt) {
    var ck = this._packKey(scope, ns, key);
    if (this._map[ck]) {
      this._map[ck].value = value;
      this._map[ck].ts = Date.now();
      this._map[ck].expiresAt = expiresAt || null;
      // Move to end
      var idx = this._lru.indexOf(ck);
      if (idx >= 0) { this._lru.splice(idx, 1); this._lru.push(ck); }
      return;
    }
    // Evict if full
    while (this._lru.length >= this._maxSize) {
      var old = this._lru.shift();
      if (old) delete this._map[old];
    }
    this._map[ck] = { value: value, ts: Date.now(), expiresAt: expiresAt || null };
    this._lru.push(ck);
  };
  ClientCache.prototype.del = function (scope, ns, key) {
    var ck = this._packKey(scope, ns, key);
    delete this._map[ck];
    var idx = this._lru.indexOf(ck);
    if (idx >= 0) this._lru.splice(idx, 1);
  };
  ClientCache.prototype.clearScope = function (scope) {
    var prefix = scope + "::";
    for (var i = this._lru.length - 1; i >= 0; i--) {
      if (this._lru[i].indexOf(prefix) === 0) {
        delete this._map[this._lru[i]];
        this._lru.splice(i, 1);
      }
    }
  };

  var clientCache = new ClientCache(256);

  SnapshotInterp.prototype.clear = function (key) {
    if (key) delete this._buffers[key];
    else this._buffers = {};
  };

  // ----------------------------------------------------------------
  // Binary wire
  // ----------------------------------------------------------------
  function strToBytes(s) { return new TextEncoder().encode(s); }
  function bytesToStr(b) { return new TextDecoder().decode(b); }

  function packRelayWire(fromId, toId, epoch, stream, seq, payload, flags) {
    var fb = strToBytes(fromId), tb = strToBytes(toId);
    var pb = payload instanceof ArrayBuffer ? new Uint8Array(payload) : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    if (fb.length > 255 || tb.length > 255) throw new Error("[VibeHub] peerId 过长");
    if (pb.length > 65535) throw new Error("[VibeHub] 单条联机消息不能超过 65535 字节");
    var len = 18 + fb.length + tb.length + pb.length;
    var buf = new ArrayBuffer(len), v = new DataView(buf), a = new Uint8Array(buf);
    a[0] = 0x56; a[1] = 0x4e; a[2] = 2;
    v.setUint8(3, typeof flags === "number" ? flags : 1);
    v.setUint32(4, epoch >>> 0);
    v.setUint16(8, stream & 0xffff);
    v.setUint32(10, seq >>> 0);
    v.setUint8(14, fb.length); v.setUint8(15, tb.length);
    v.setUint16(16, pb.length);
    a.set(fb, 18); a.set(tb, 18 + fb.length);
    // bit 0: VibeHub wire；bit 1-2: hop；bit 3: probe；bit 4: probe ACK。
    a.set(pb, 18 + fb.length + tb.length);
    return buf;
  }

  function unpackRelayWire(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < 7) throw new Error("无效 wire 包");
    var v = new DataView(buf), a = new Uint8Array(buf);
    if (a[0] === 0x56 && a[1] === 0x4e && a[2] === 2) {
      if (buf.byteLength < 18) throw new Error("无效 wire v2 包");
      var fromLenV2 = v.getUint8(14), toLenV2 = v.getUint8(15);
      var headerLenV2 = 18 + fromLenV2 + toLenV2;
      if (headerLenV2 > a.length) throw new Error("无效 wire v2 包头");
      var payloadLenV2 = v.getUint16(16);
      if (headerLenV2 + payloadLenV2 !== a.length) throw new Error("无效 wire v2 包长度");
      return {
        version: 2,
        flags: v.getUint8(3),
        epoch: v.getUint32(4),
        stream: v.getUint16(8),
        seq: v.getUint32(10),
        fromId: bytesToStr(a.subarray(18, 18 + fromLenV2)),
        toId: bytesToStr(a.subarray(18 + fromLenV2, 18 + fromLenV2 + toLenV2)),
        payloadLen: payloadLenV2,
        payload: a.subarray(headerLenV2),
      };
    }
    var seq = v.getUint16(0), fromLen = v.getUint8(2), toLen = v.getUint8(3);
    var headerLen = 7 + fromLen + toLen;
    if (headerLen > a.length) throw new Error("无效 wire 包头");
    var fromId = bytesToStr(a.subarray(4, 4 + fromLen));
    var toId = bytesToStr(a.subarray(4 + fromLen, 4 + fromLen + toLen));
    var payloadLen = v.getUint16(4 + fromLen + toLen);
    var flags = v.getUint8(6 + fromLen + toLen);
    if (headerLen + payloadLen !== a.length) throw new Error("无效 wire 包长度");
    var payload = a.subarray(7 + fromLen + toLen, 7 + fromLen + toLen + payloadLen);
    return {
      version: 1,
      epoch: 0,
      stream: flags & 8 || flags & 16 ? STREAM_PROBE : STREAM_GAME,
      seq: seq,
      fromId: fromId,
      toId: toId,
      payloadLen: payloadLen,
      flags: flags,
      payload: payload,
    };
  }

  // ----------------------------------------------------------------
  // Room
  // ----------------------------------------------------------------
  function Room(sdk, roomId, topology, opts) {
    this._sdk = sdk;
    this.roomId = roomId;
    this.topology = topology;
    this.peerId = randomId();
    this.isHost = false;
    this.hostId = null;
    this._peers = {};
    this._relays = {};
    this._scorer = new RelayScorer();
    this._probeTimer = null;
    this._cursor = 0;
    this._handlers = { message: [], peer: [] };
    this._closed = false;
    this._pollTimer = null;
    this._fastPoll = SIGNAL_POLL_FAST_COUNT;
    this._pollFails = 0;
    this._pollRetryMs = 0;
    this._pathEpoch = global.crypto && global.crypto.getRandomValues
      ? global.crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 0xffffffff);
    this._sequence = 0;
    this._reliableSendChain = Promise.resolve();
    this._receiveWindow = new ReceiveWindow(RECEIVE_WINDOW_SIZE);
    this._primaryRelayId = null;
    this._warmRelayId = null;
    this._pendingRelays = {};
    this._remoteRelayStates = {};
    this._relayStateRevision = 0;
    this._relayConnectPromise = null;
    this._relayMaintenanceTimer = null;
    this._transportState = "direct";
    this._relayDualSendUntil = 0;
    this._directRelayDualUntil = 0;
    this._directRecoveryTimer = null;
    this._duplicateSuppressed = 0;
    this._lastSwitchReason = "initial";
    this._initDone = null;
    this._reconnectGraceTimers = {};
    this._reconnectDeadlines = {};
    this._roomToken = null;
    this._roomTokenExpiresAt = 0;
    this._roomRefreshPromise = null;
    this._roomRefreshTimer = null;
    this._roomRefreshCount = 0;
    this._lastRoomRefreshAt = null;
    this._wireKeyPromise = null;
    this._deliveryChain = Promise.resolve();
    this._deliveryChains = {};
    this._rtcHistory = [];
    this._rtcDiagnosticTasks = [];
    this._peerCapabilities = {};
    this._realtimePending = {};
    this._realtimeEnabled = !(
      opts &&
      (opts.realtime === false ||
        (opts.realtime && opts.realtime.enabled === false))
    );
    var realtimeOptions =
      opts && opts.realtime && typeof opts.realtime === "object"
        ? opts.realtime
        : {};
    this._realtimeMaxBufferedBytes =
      Number.isSafeInteger(realtimeOptions.maxBufferedBytes) &&
      realtimeOptions.maxBufferedBytes >= 4096
        ? Math.min(1024 * 1024, realtimeOptions.maxBufferedBytes)
        : REALTIME_MAX_BUFFERED_BYTES;
    this._realtimeBufferedLowBytes =
      Number.isSafeInteger(realtimeOptions.bufferedAmountLowThreshold) &&
      realtimeOptions.bufferedAmountLowThreshold >= 0
        ? Math.min(
            this._realtimeMaxBufferedBytes,
            realtimeOptions.bufferedAmountLowThreshold,
          )
        : REALTIME_BUFFERED_LOW_BYTES;
    this._realtimeStats = {
      sent: 0,
      deferred: 0,
      dropped: 0,
      fallback: 0,
      received: 0,
    };
    this._qualityTimer = null;
    this._qualitySequence = 0;
    this._qualityPending = {};
    this._peerQuality = {};
    this._qualitySampleMs =
      Number.isSafeInteger(realtimeOptions.qualityIntervalMs) &&
      realtimeOptions.qualityIntervalMs >= 1000
        ? Math.min(10000, realtimeOptions.qualityIntervalMs)
        : QUALITY_SAMPLE_MS;
    this._diagnosticForceRelayId = null;
    this._authExpired = false;
    this._authExpiryWarned = false;
    this._iceCredentialRotations = 0;
    this._lastIceCredentialRotationAt = null;
    this._lastIceCredentialRotationError = null;
    this._diagnosticRelayId =
      opts && typeof opts.diagnosticRelayId === "string" ? opts.diagnosticRelayId : null;
    this._diagnosticTurnOnly = !!(opts && opts.diagnosticTurnOnly === true);
    // 公开快照插值工具：room.sync.push/get/clear。
    this.sync = new SnapshotInterp((opts && opts.sync) || {});
  }

  Room.prototype.onMessage = function (cb) { this._handlers.message.push(cb); return this; };
  Room.prototype.onPeer = function (cb) { this._handlers.peer.push(cb); return this; };
  // ── 错误诊断 ──
  Room.prototype._warn = function (reason, detail) {
    var msg = "[VibeHub] " + reason + (detail ? ": " + detail : "");
    var consoleFn = global.console && global.console.warn ? global.console.warn : global.console && global.console.log ? global.console.log : function () {};
    consoleFn(msg);
    this._emit("peer", { type: "error", reason: reason, detail: detail || "" });
  };
  Room.prototype._emit = function (type) {
    var args = Array.prototype.slice.call(arguments, 1);
    this._handlers[type].forEach(function (cb) { try { cb.apply(null, args); } catch (e) { console.error(e); } });
  };
  Room.prototype._signal = function (to, kind, payload) {
    var self = this;
    return this._ensureRoomCapability().then(function () {
      var headers = self._roomToken ? { "X-Vibe-Room": self._roomToken } : {};
      return self._sdk._fetch("/api/sdk/signal", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ room: self.roomId, from: self.peerId, to: to, kind: kind, payload: payload }),
      });
    });
  };

  Room.prototype._rtcConfiguration = function () {
    if (this._sdk && typeof this._sdk._rtcConfiguration === "function") {
      return this._sdk._rtcConfiguration(this._diagnosticTurnOnly);
    }
    return {
      iceServers: BASE_ICE_SERVERS.slice(),
      iceTransportPolicy: this._diagnosticTurnOnly ? "relay" : "all",
    };
  };

  Room.prototype._refreshRelayGrant = function (relayId) {
    var self = this;
    return this._ensureRoomCapability()
      .then(function () {
        return self._sdk._fetch(
          "/api/relay/nodes?room=" + encodeURIComponent(self.roomId) +
            "&peer=" + encodeURIComponent(self.peerId) +
            "&n=1&prefer=" + encodeURIComponent(relayId),
          { headers: { "X-Vibe-Room": self._roomToken } },
        );
      })
      .then(function (result) {
        var nodes = result && Array.isArray(result.nodes) ? result.nodes : [];
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].peerId === relayId && nodes[i].grant) return nodes[i].grant;
        }
        throw new Error("当前 Relay 已不可用");
      });
  };

  Room.prototype._wireRelayNegotiation = function (relayId, entry) {
    var self = this;
    var pc = entry.pc;
    entry.makingOffer = false;
    pc.onnegotiationneeded = function () {
      if (self._closed || entry.makingOffer) return;
      entry.makingOffer = true;
      self._refreshRelayGrant(relayId)
        .then(function (grant) {
          entry._relayGrant = grant;
          return pc.setLocalDescription();
        })
        .then(function () {
          return self._signal(relayId, "offer-relay", {
            description: pc.localDescription,
            grant: entry._relayGrant,
            realtime: self._realtimeEnabled ? 1 : 0,
          });
        })
        .catch(function (error) {
          self._lastIceCredentialRotationError =
            error && error.message ? error.message : "Relay ICE Restart 失败";
        })
        .finally(function () {
          entry.makingOffer = false;
        });
    };
  };

  Room.prototype._rotateIceCredentials = function () {
    var configuration = this._rtcConfiguration();
    var rotated = 0;
    var errors = [];
    function restart(entry, id) {
      if (!entry || !entry.pc || entry.pc.connectionState === "closed") return;
      try {
        entry.pc.setConfiguration(configuration);
        if (typeof entry.pc.restartIce !== "function") {
          throw new Error("当前浏览器不支持 restartIce()");
        }
        entry.pc.restartIce();
        rotated++;
      } catch (error) {
        errors.push(id + ": " + ((error && error.message) || "ICE Restart 失败"));
      }
    }
    for (var peerId in this._peers) restart(this._peers[peerId], peerId);
    for (var relayId in this._relays) restart(this._relays[relayId], relayId);
    if (rotated) {
      this._iceCredentialRotations++;
      this._lastIceCredentialRotationAt = Date.now();
    }
    this._lastIceCredentialRotationError = errors.length ? errors.join("; ") : null;
    if (errors.length) return Promise.reject(new Error(this._lastIceCredentialRotationError));
    return Promise.resolve({ connections: rotated });
  };

  Room.prototype._serverRelayDiagnostics = function () {
    if (this._sdk && typeof this._sdk._turnDiagnostics === "function") {
      return this._sdk._turnDiagnostics(this._diagnosticTurnOnly);
    }
    return {
      configured: false,
      available: false,
      expiresAt: null,
      transports: [],
      forced: this._diagnosticTurnOnly,
      error: null,
    };
  };

  Room.prototype._attachRtcDiagnostics = function (entry) {
    entry._iceErrors = entry._iceErrors || [];
    entry.pc.onicecandidateerror = function (event) {
      entry._iceErrors.push({
        at: new Date().toISOString(),
        errorCode: typeof event.errorCode === "number" ? event.errorCode : null,
        errorText: typeof event.errorText === "string" ? event.errorText : "",
      });
      if (entry._iceErrors.length > 8) entry._iceErrors.shift();
    };
  };

  Room.prototype._candidateDiagnostics = function (candidate) {
    if (!candidate) return null;
    return {
      candidateType: candidate.candidateType || null,
      protocol: candidate.protocol || null,
      relayProtocol: candidate.relayProtocol || null,
      tcpType: candidate.tcpType || null,
      networkType: candidate.networkType || null,
    };
  };

  Room.prototype._collectRtcDiagnostics = function (id, entry, relay, reason) {
    var pc = entry && entry.pc;
    var base = {
      id: id,
      relay: !!relay,
      open: !!(entry && entry.open),
      reason: reason || "snapshot",
      connectionState: pc?.connectionState || null,
      signalingState: pc?.signalingState || null,
      iceConnectionState: pc?.iceConnectionState || null,
      iceGatheringState: pc?.iceGatheringState || null,
      iceErrors: entry && entry._iceErrors ? entry._iceErrors.slice() : [],
      channels: {
        reliable: {
          open: !!(entry && entry.open),
          bufferedAmount: Math.max(0, entry?.dc?.bufferedAmount || 0),
        },
        realtime: {
          supported: !!(entry && entry.realtimeCapable),
          open: !!(entry && entry.rtOpen),
          bufferedAmount: Math.max(0, entry?.rtDc?.bufferedAmount || 0),
        },
      },
      selectedCandidatePair: null,
    };
    if (!pc || typeof pc.getStats !== "function") return Promise.resolve(base);
    var self = this;
    return pc.getStats()
      .then(function (report) {
        var stats = [];
        if (report && typeof report.forEach === "function") {
          report.forEach(function (item) { stats.push(item); });
        } else if (report && typeof report[Symbol.iterator] === "function") {
          for (var item of report) stats.push(item[1] || item);
        }
        var byId = {};
        for (var i = 0; i < stats.length; i++) {
          if (stats[i] && stats[i].id) byId[stats[i].id] = stats[i];
        }
        var transport = null;
        var pair = null;
        for (var j = 0; j < stats.length; j++) {
          var current = stats[j];
          if (current?.type === "transport" && current.selectedCandidatePairId) {
            transport = current;
            pair = byId[current.selectedCandidatePairId] || null;
            break;
          }
        }
        if (!pair) {
          for (var k = 0; k < stats.length; k++) {
            var candidatePair = stats[k];
            if (
              candidatePair?.type === "candidate-pair" &&
              candidatePair.state === "succeeded" &&
              (candidatePair.nominated || !pair)
            ) {
              pair = candidatePair;
              if (candidatePair.nominated) break;
            }
          }
        }
        if (pair) {
          base.selectedCandidatePair = {
            state: pair.state || null,
            nominated: !!pair.nominated,
            currentRoundTripTime:
              typeof pair.currentRoundTripTime === "number" ? pair.currentRoundTripTime : null,
            availableOutgoingBitrate:
              typeof pair.availableOutgoingBitrate === "number"
                ? pair.availableOutgoingBitrate
                : null,
            bytesSent: typeof pair.bytesSent === "number" ? pair.bytesSent : null,
            bytesReceived: typeof pair.bytesReceived === "number" ? pair.bytesReceived : null,
            local: self._candidateDiagnostics(byId[pair.localCandidateId]),
            remote: self._candidateDiagnostics(byId[pair.remoteCandidateId]),
          };
        }
        if (transport && typeof transport.dtlsState === "string") {
          base.dtlsState = transport.dtlsState;
        }
        return base;
      })
      .catch(function (error) {
        base.statsError = error && error.message ? error.message : "getStats() failed";
        return base;
      });
  };

  Room.prototype._applyRtcQuality = function (id, entry, snapshot, relay) {
    if (!entry || !snapshot) return;
    var pair = snapshot.selectedCandidatePair;
    var transportRttMs =
      pair && typeof pair.currentRoundTripTime === "number"
        ? pair.currentRoundTripTime * 1000
        : null;
    entry._transportQuality = {
      sampledAt: Date.now(),
      rttMs: transportRttMs,
      availableOutgoingBitrate:
        pair && typeof pair.availableOutgoingBitrate === "number"
          ? pair.availableOutgoingBitrate
          : null,
      local: pair?.local || null,
      remote: pair?.remote || null,
    };
    if (!relay) {
      var endToEnd = this._peerQuality[id];
      if (
        Number.isFinite(transportRttMs) &&
        (!endToEnd || Date.now() - endToEnd.sampledAt > QUALITY_STALE_MS)
      ) {
        entry._cachedLatency = Math.round(transportRttMs);
      }
    }
  };

  Room.prototype._sampleQuality = function () {
    if (this._closed) return Promise.resolve();
    var self = this;
    var now = performance.now();
    for (var pendingKey in this._qualityPending) {
      if (now - this._qualityPending[pendingKey] > QUALITY_STALE_MS) {
        delete this._qualityPending[pendingKey];
      }
    }
    var targets = this._transportTargets("*");
    for (var targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      var targetId = targets[targetIndex];
      if (!this._peerCapabilities[targetId]?.realtime) continue;
      this._qualitySequence = (this._qualitySequence + 1) >>> 0;
      if (this._qualitySequence === 0) this._qualitySequence = 1;
      var qualitySequence = this._qualitySequence;
      this._qualityPending[targetId + ":" + qualitySequence] = performance.now();
      this._sendQualityMessage(targetId, { t: "q", n: qualitySequence });
    }
    var tasks = [];
    for (var peerId in this._peers) {
      (function (id, entry) {
        tasks.push(
          self
            ._collectRtcDiagnostics(id, entry, false, "quality-sample")
            .then(function (snapshot) {
              self._applyRtcQuality(id, entry, snapshot, false);
            }),
        );
      })(peerId, this._peers[peerId]);
    }
    for (var relayId in this._relays) {
      (function (id, entry) {
        tasks.push(
          self
            ._collectRtcDiagnostics(id, entry, true, "quality-sample")
            .then(function (snapshot) {
              self._applyRtcQuality(id, entry, snapshot, true);
            }),
        );
      })(relayId, this._relays[relayId]);
    }
    return Promise.all(tasks).then(function () {});
  };

  Room.prototype._startQualitySampling = function () {
    if (this._qualityTimer || this._closed) return;
    var self = this;
    function schedule() {
      if (self._closed) return;
      self._qualityTimer = setTimeout(function () {
        self._qualityTimer = null;
        if (self._closed) return;
        var run = function () {
          self._sampleQuality().finally(schedule);
        };
        if (global.requestIdleCallback) {
          global.requestIdleCallback(run, { timeout: 500 });
        } else {
          run();
        }
      }, self._qualitySampleMs);
    }
    schedule();
  };

  Room.prototype._recordRtcSnapshot = function (id, entry, relay, reason) {
    var self = this;
    var task = this._collectRtcDiagnostics(id, entry, relay, reason).then(function (snapshot) {
      snapshot.capturedAt = new Date().toISOString();
      self._rtcHistory.push(snapshot);
      if (self._rtcHistory.length > RTC_DIAGNOSTIC_HISTORY_LIMIT) self._rtcHistory.shift();
      return snapshot;
    });
    this._rtcDiagnosticTasks.push(task);
    if (this._rtcDiagnosticTasks.length > RTC_DIAGNOSTIC_HISTORY_LIMIT) {
      this._rtcDiagnosticTasks.shift();
    }
    return task;
  };

  Room.prototype._capabilityPayload = function (extra) {
    var payload = extra && typeof extra === "object" ? shallowCopy(extra) : {};
    payload.realtime = this._realtimeEnabled ? 1 : 0;
    return payload;
  };

  Room.prototype._recordPeerCapabilities = function (remoteId, payload) {
    if (!remoteId || !payload || typeof payload !== "object") return;
    var capabilities = this._peerCapabilities[remoteId] || {};
    if (Object.prototype.hasOwnProperty.call(payload, "realtime")) {
      capabilities.realtime =
        this._realtimeEnabled &&
        (payload.realtime === 1 || payload.realtime === true);
    }
    this._peerCapabilities[remoteId] = capabilities;
    var entry = this._peers[remoteId];
    if (entry && capabilities.realtime) {
      entry.realtimeCapable = true;
      this._ensureRealtimeChannel(remoteId, entry, false);
    } else if (entry && !capabilities.realtime) {
      entry.realtimeCapable = false;
      if (entry.rtDc) {
        try { entry.rtDc.close(); } catch (error) {}
        entry.rtDc = null;
        entry.rtOpen = false;
      }
    }
  };

  Room.prototype._acceptDataChannel = function (remoteId, entry, dc, isRelay) {
    var realtime =
      dc &&
      (dc.label === REALTIME_GAME_LABEL || dc.label === REALTIME_RELAY_LABEL);
    if (realtime) {
      if (entry.rtDc) {
        try { dc.close(); } catch (error) {}
        return;
      }
      entry.rtDc = dc;
      entry.realtimeCapable = true;
      this._wireChannel(remoteId, dc, isRelay, true);
      return;
    }
    if (entry.dc) {
      try { dc.close(); } catch (error) {}
      return;
    }
    entry.dc = dc;
    this._wireChannel(remoteId, dc, isRelay, false);
  };

  Room.prototype._ensureRealtimeChannel = function (remoteId, entry, isRelay) {
    if (
      !this._realtimeEnabled ||
      !entry ||
      !entry.realtimeCapable ||
      !entry.initiator ||
      entry.rtDc ||
      !entry.pc ||
      entry.pc.connectionState === "closed"
    ) {
      return;
    }
    var label = isRelay ? REALTIME_RELAY_LABEL : REALTIME_GAME_LABEL;
    try {
      entry.rtDc = entry.pc.createDataChannel(label, {
        ordered: false,
        maxRetransmits: 0,
      });
      this._wireChannel(remoteId, entry.rtDc, isRelay, true);
    } catch (error) {
      entry.rtDc = null;
      this._warn(
        "实时通道创建失败",
        remoteId.slice(0, 8) + ": " + (error && error.message ? error.message : "unknown"),
      );
    }
  };

  // ── Peer ──
  Room.prototype._createPeer = function (remoteId, initiator) {
    if (this._peers[remoteId]) return this._peers[remoteId];
    var self = this;
    var pc = new RTCPeerConnection(this._rtcConfiguration());
    var entry = {
      pc: pc, dc: null, rtDc: null, open: false, rtOpen: false, relay: false,
      polite: this.peerId < remoteId, makingOffer: false, ignoreOffer: false, reconnecting: false,
      initiator: !!initiator,
      realtimeCapable: !!this._peerCapabilities[remoteId]?.realtime,
    };
    this._attachRtcDiagnostics(entry);
    this._peers[remoteId] = entry;
    this._emit("peer", { type: "connecting", id: remoteId });

    pc.onicecandidate = function (e) { if (e.candidate) self._signal(remoteId, "ice", e.candidate.toJSON()); };
    pc.onconnectionstatechange = function () {
      var st = pc.connectionState;
      if (st === "failed" || st === "closed") {
        self._onPeerFailure(remoteId);
      } else if (st === "disconnected") {
        entry.dcDiscoTimer = setTimeout(function () { self._onPeerFailure(remoteId); }, ICE_DISCONNECT_MS);
      } else if (st === "connected") {
        if (entry.dcDiscoTimer) { clearTimeout(entry.dcDiscoTimer); entry.dcDiscoTimer = null; }
        if (entry.reconnecting) entry.reconnecting = false;
        self._beginDirectRecovery("direct-connected");
        self._cancelReconnectGrace(remoteId);
      }
    };
    pc.onnegotiationneeded = function () {
      entry.makingOffer = true;
      pc.setLocalDescription()
        .then(function () { self._signal(remoteId, "offer", pc.localDescription); })
        .catch(function (e) { console.error("offer", e); })
        .finally(function () { entry.makingOffer = false; });
    };
    pc.ondatachannel = function (e) {
      self._acceptDataChannel(remoteId, entry, e.channel, false);
    };

    if (initiator) {
      entry.dc = pc.createDataChannel("game");
      this._wireChannel(remoteId, entry.dc, false, false);
      this._ensureRealtimeChannel(remoteId, entry, false);
    }
    return entry;
  };

  // ── Relay：按目标选路，一个主路径 + 最多一个暖备 ──
  Room.prototype._relayOpen = function (relayId) {
    var relay = relayId && this._relays[relayId];
    return !!(relay && relay.open && relay.dc);
  };

  Room.prototype._openRelayIds = function () {
    var self = this;
    var open = [];
    for (var id in this._relays) {
      if (this._relayOpen(id)) open.push(id);
    }
    open.sort(function (a, b) {
      if (a === self._primaryRelayId) return -1;
      if (b === self._primaryRelayId) return 1;
      if (a === self._warmRelayId) return -1;
      if (b === self._warmRelayId) return 1;
      var scoreA = self._scorer.scores[a]?.score || 0;
      var scoreB = self._scorer.scores[b]?.score || 0;
      return scoreB - scoreA || a.localeCompare(b);
    });
    return open;
  };

  Room.prototype._relaySlotCount = function () {
    var slots = Object.keys(this._relays).length;
    for (var pendingId in this._pendingRelays) {
      if (!this._relays[pendingId]) slots++;
    }
    return slots;
  };

  Room.prototype._scheduleRelayMaintenance = function () {
    if (this._relayMaintenanceTimer || this._closed) return;
    var self = this;
    this._relayMaintenanceTimer = setTimeout(function () {
      self._relayMaintenanceTimer = null;
      self._refillRelays();
    }, RELAY_PENDING_MS + 50);
  };

  Room.prototype._freshRemoteRelayState = function (peerId) {
    var state = this._remoteRelayStates[peerId];
    if (!state) return null;
    if (Date.now() - state.receivedAt > RELAY_STATE_TTL_MS) {
      delete this._remoteRelayStates[peerId];
      return null;
    }
    return state;
  };

  Room.prototype._transportTargets = function (toId) {
    if (this.topology === "host" && !this.isHost) {
      return this.hostId && this.hostId !== this.peerId ? [this.hostId] : [];
    }
    var known = {};
    for (var peerId in this._peers) known[peerId] = true;
    for (var reconnectId in this._reconnectDeadlines) known[reconnectId] = true;
    for (var remoteId in this._remoteRelayStates) {
      if (this._freshRemoteRelayState(remoteId)) known[remoteId] = true;
    }
    delete known[this.peerId];
    if (toId && toId !== "*") return [toId];
    return Object.keys(known).sort();
  };

  Room.prototype._directPeerOpen = function (peerId) {
    var peer = peerId && this._peers[peerId];
    return !!(peer && peer.open && peer.dc);
  };

  Room.prototype._unresolvedTransportTargets = function () {
    var targets = this._transportTargets("*");
    var unresolved = [];
    for (var i = 0; i < targets.length; i++) {
      if (!this._directPeerOpen(targets[i])) unresolved.push(targets[i]);
    }
    return unresolved;
  };

  Room.prototype._allTransportTargetsDirect = function () {
    var targets = this._transportTargets("*");
    if (!targets.length) return false;
    return this._unresolvedTransportTargets().length === 0;
  };

  Room.prototype._desiredRelayCount = function () {
    if (this._diagnosticForceRelayId) return RELAY_PATH_LIMIT;
    return this._unresolvedTransportTargets().length > 0 ||
      this._transportState === "relay" ||
      this._transportState === "mixed"
      ? RELAY_PATH_LIMIT
      : 1;
  };

  Room.prototype._relayStateSnapshot = function (advanceRevision) {
    var unavailable = [];
    var proposals = [];
    var proposed = {};
    var now = Date.now();
    for (var id in this._scorer.cooldown) {
      if (this._scorer.cooldown[id].until > now) unavailable.push(id);
    }
    for (var relayId in this._relays) {
      if (!this._relayOpen(relayId)) {
        proposed[relayId] = true;
        proposals.push(relayId);
      }
    }
    for (var pendingId in this._pendingRelays) {
      if (!proposed[pendingId] && !this._relayOpen(pendingId)) proposals.push(pendingId);
    }
    unavailable.sort();
    proposals.sort();
    return {
      revision: advanceRevision ? ++this._relayStateRevision : this._relayStateRevision,
      relays: this._openRelayIds().slice(0, RELAY_PATH_LIMIT),
      proposals: proposals.slice(0, RELAY_STATE_MAX_IDS),
      unavailable: unavailable.slice(0, RELAY_STATE_MAX_IDS),
    };
  };

  Room.prototype._publishRelayState = function () {
    if (!this._started || this._closed || !this._roomToken) return;
    this._signal("*", "relay-state", this._relayStateSnapshot(true)).catch(function () {});
  };

  Room.prototype._acceptRelayState = function (peerId, payload) {
    if (!payload || typeof payload !== "object") return;
    var revision = Number(payload.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    var previous = this._freshRemoteRelayState(peerId);
    if (previous && revision <= previous.revision) return;
    function boundedIds(value) {
      if (!Array.isArray(value)) return [];
      var seen = {};
      var ids = [];
      for (var i = 0; i < value.length && ids.length < RELAY_STATE_MAX_IDS; i++) {
        var id = value[i];
        if (typeof id !== "string" || !id || id.length > 128 || seen[id]) continue;
        seen[id] = true;
        ids.push(id);
      }
      return ids;
    }
    this._remoteRelayStates[peerId] = {
      revision: revision,
      relays: boundedIds(payload.relays),
      proposals: boundedIds(payload.proposals),
      unavailable: boundedIds(payload.unavailable),
      receivedAt: Date.now(),
    };
    this._convergeRelayPaths("remote-relay-state");
  };

  Room.prototype._remoteSupportsRelay = function (relayId) {
    for (var peerId in this._remoteRelayStates) {
      var state = this._freshRemoteRelayState(peerId);
      if (
        state &&
        (state.relays.indexOf(relayId) >= 0 ||
          (state.proposals || []).indexOf(relayId) >= 0)
      ) {
        return true;
      }
    }
    return false;
  };

  Room.prototype._canRetryConsensusRelay = function (relayId, now) {
    var cooldown = this._scorer.cooldown[relayId];
    if (!cooldown) return true;
    if (cooldown.until <= now) {
      delete this._scorer.cooldown[relayId];
      return true;
    }
    return (
      this._remoteSupportsRelay(relayId) &&
      now >= (cooldown.retryAfter || cooldown.until)
    );
  };

  Room.prototype._consensusRelayIds = function () {
    var states = [this._relayStateSnapshot(false)];
    for (var peerId in this._remoteRelayStates) {
      var remote = this._freshRemoteRelayState(peerId);
      if (remote) states.push(remote);
    }
    var candidates = {};
    var unavailableVotes = {};
    for (var i = 0; i < states.length; i++) {
      var state = states[i];
      var seen = {};
      var relays = state.relays || [];
      for (var rank = 0; rank < relays.length; rank++) {
        var relayId = relays[rank];
        if (!candidates[relayId]) {
          candidates[relayId] = {
            id: relayId,
            supporters: 0,
            openSupporters: 0,
            unavailable: 0,
            rank: 0,
          };
        }
        if (seen[relayId]) continue;
        seen[relayId] = true;
        candidates[relayId].supporters++;
        candidates[relayId].openSupporters++;
        candidates[relayId].rank += rank;
      }
      var proposals = state.proposals || [];
      for (var proposalRank = 0; proposalRank < proposals.length; proposalRank++) {
        var proposalId = proposals[proposalRank];
        if (!candidates[proposalId]) {
          candidates[proposalId] = {
            id: proposalId,
            supporters: 0,
            openSupporters: 0,
            unavailable: 0,
            rank: 0,
          };
        }
        if (seen[proposalId]) continue;
        seen[proposalId] = true;
        candidates[proposalId].supporters++;
        candidates[proposalId].rank += RELAY_PATH_LIMIT + proposalRank;
      }
      var rejected = {};
      var unavailable = state.unavailable || [];
      for (var u = 0; u < unavailable.length; u++) {
        var unavailableId = unavailable[u];
        if (rejected[unavailableId]) continue;
        rejected[unavailableId] = true;
        unavailableVotes[unavailableId] = (unavailableVotes[unavailableId] || 0) + 1;
      }
    }
    for (var candidateId in candidates) {
      candidates[candidateId].unavailable = unavailableVotes[candidateId] || 0;
    }
    return Object.keys(candidates)
      .map(function (id) { return candidates[id]; })
      .sort(function (a, b) {
        return b.supporters - a.supporters ||
          a.unavailable - b.unavailable ||
          b.openSupporters - a.openSupporters ||
          a.rank - b.rank ||
          a.id.localeCompare(b.id);
      })
      .map(function (entry) { return entry.id; });
  };

  Room.prototype._commonRelayIdsForPeer = function (peerId) {
    var remote = this._freshRemoteRelayState(peerId);
    if (!remote) return [];
    var remoteSet = {};
    for (var i = 0; i < remote.relays.length; i++) remoteSet[remote.relays[i]] = true;
    return this._openRelayIds().filter(function (relayId) { return remoteSet[relayId]; });
  };

  Room.prototype._refreshTransportState = function (reason) {
    var targets = this._transportTargets("*");
    var direct = 0;
    for (var i = 0; i < targets.length; i++) {
      if (this._directPeerOpen(targets[i])) direct++;
    }
    var next = !targets.length || direct === targets.length
      ? "direct"
      : direct > 0
        ? "mixed"
        : "relay";
    if (this._transportState === "recovering" && next === "direct") return;
    if (next !== this._transportState) {
      this._pathEpoch = (this._pathEpoch + 1) >>> 0;
      this._lastSwitchReason = reason || "path-coverage-changed";
      this._transportState = next;
    }
  };

  Room.prototype._trimRelayPaths = function () {
    var desired = this._desiredRelayCount();
    var consensus = this._consensusRelayIds();
    var priority = [];
    function prioritize(relayId) {
      if (relayId && priority.indexOf(relayId) < 0) priority.push(relayId);
    }
    prioritize(this._diagnosticForceRelayId);
    // 协商新共同节点时保留一条已打开路径，避免两个槽位同时被未完成的探测替换。
    if (this._relayOpen(this._primaryRelayId)) prioritize(this._primaryRelayId);
    for (var consensusIndex = 0; consensusIndex < consensus.length; consensusIndex++) {
      prioritize(consensus[consensusIndex]);
    }
    var open = this._openRelayIds();
    for (var i = 0; i < open.length; i++) {
      prioritize(open[i]);
    }
    for (var relayId in this._relays) {
      prioritize(relayId);
    }
    for (var pendingId in this._pendingRelays) {
      prioritize(pendingId);
    }
    var keep = priority.slice(0, desired);
    for (var existingId in this._relays) {
      if (keep.indexOf(existingId) < 0) {
        this._dropRelay(existingId, { failed: false, skipRefill: true, reason: "relay-cap-trim" });
      }
    }
    for (var queuedId in this._pendingRelays) {
      if (!this._relays[queuedId] && keep.indexOf(queuedId) < 0) {
        this._dropRelay(queuedId, {
          failed: false,
          skipRefill: true,
          reason: "relay-cap-trim",
        });
      }
    }
  };

  Room.prototype._rebalanceRelayRoles = function (reason) {
    var open = this._openRelayIds();
    var consensus = this._consensusRelayIds();
    var self = this;
    open.sort(function (a, b) {
      if (a === self._diagnosticForceRelayId) return -1;
      if (b === self._diagnosticForceRelayId) return 1;
      var consensusA = consensus.indexOf(a);
      var consensusB = consensus.indexOf(b);
      if (consensusA < 0) consensusA = Number.MAX_SAFE_INTEGER;
      if (consensusB < 0) consensusB = Number.MAX_SAFE_INTEGER;
      if (consensusA !== consensusB) return consensusA - consensusB;
      var scoreA = self._scorer.scores[a]?.score || 0;
      var scoreB = self._scorer.scores[b]?.score || 0;
      return scoreB - scoreA || a.localeCompare(b);
    });
    var oldPrimary = this._primaryRelayId;
    this._primaryRelayId = open[0] || null;
    this._warmRelayId =
      open.filter(function (relayId) { return relayId !== self._primaryRelayId; })[0] || null;
    if (oldPrimary && oldPrimary !== this._primaryRelayId) {
      this._pathEpoch = (this._pathEpoch + 1) >>> 0;
      this._relayDualSendUntil = Date.now() + RELAY_SWITCH_OVERLAP_MS;
      this._lastSwitchReason = reason || "relay-primary-changed";
    }
  };

  Room.prototype._enterRelayPath = function (reason) {
    var targets = this._transportTargets("*");
    var anyDirect = targets.some(function (peerId) {
      return this._directPeerOpen(peerId);
    }, this);
    var nextState = anyDirect ? "mixed" : "relay";
    if (this._transportState !== nextState) {
      this._pathEpoch = (this._pathEpoch + 1) >>> 0;
      this._relayDualSendUntil = Date.now() + RELAY_SWITCH_OVERLAP_MS;
    }
    this._transportState = nextState;
    this._lastSwitchReason = reason || "direct-unavailable";
    this._rebalanceRelayRoles(reason);
    this._refillRelays();
  };

  Room.prototype._beginDirectRecovery = function (reason) {
    if (!this._allTransportTargetsDirect()) {
      this._refreshTransportState(reason || "partial-direct");
      this._refillRelays();
      return;
    }
    if (this._transportState === "direct" || this._transportState === "recovering") return;
    this._pathEpoch = (this._pathEpoch + 1) >>> 0;
    this._transportState = "recovering";
    this._directRelayDualUntil = Date.now() + RELAY_SWITCH_OVERLAP_MS;
    this._lastSwitchReason = reason || "direct-recovered";
    this._rebalanceRelayRoles(reason);
    if (this._directRecoveryTimer) clearTimeout(this._directRecoveryTimer);
    var self = this;
    this._directRecoveryTimer = setTimeout(function () {
      self._directRecoveryTimer = null;
      if (self._closed) return;
      if (self._allTransportTargetsDirect()) {
        self._transportState = "direct";
        self._directRelayDualUntil = 0;
        self._trimRelayPaths();
      } else {
        self._enterRelayPath("direct-recovery-failed");
      }
    }, RELAY_SWITCH_OVERLAP_MS);
  };

  Room.prototype._convergeRelayPaths = function (reason) {
    if (this._closed) return;
    this._refreshTransportState(reason);
    if (this._diagnosticForceRelayId) {
      this._trimRelayPaths();
      this._rebalanceRelayRoles(reason || "diagnostic-forced-relay");
      this._refillRelays();
      return;
    }
    var desired = this._desiredRelayCount();
    var consensus = this._consensusRelayIds();
    var preferred = null;
    for (var i = 0; i < consensus.length; i++) {
      if (!this._relays[consensus[i]] && !this._pendingRelays[consensus[i]]) {
        preferred = consensus[i];
        break;
      }
    }
    if (preferred && this._relaySlotCount() >= desired) {
      var replace = null;
      for (var pendingId in this._pendingRelays) {
        if (!this._relays[pendingId] && pendingId !== preferred) {
          this._dropRelay(pendingId, {
            failed: false,
            skipRefill: true,
            reason: "common-relay-convergence",
          });
          replace = pendingId;
          break;
        }
      }
      if (!replace) {
        for (var connectingId in this._relays) {
          if (
            connectingId !== preferred &&
            connectingId !== this._primaryRelayId &&
            !this._relayOpen(connectingId)
          ) {
            replace = connectingId;
            break;
          }
        }
      }
      if (!replace) {
        for (var warmId in this._relays) {
          if (warmId !== preferred && warmId !== this._primaryRelayId) {
            replace = warmId;
            break;
          }
        }
      }
      if (replace && this._relays[replace]) {
        this._dropRelay(replace, {
          failed: false,
          skipRefill: true,
          reason: "common-relay-convergence",
        });
      }
    }
    this._trimRelayPaths();
    this._rebalanceRelayRoles(reason || "common-relay-convergence");
    this._refillRelays();
  };

  Room.prototype._dropRelay = function (relayId, options) {
    options = options || {};
    var r = this._relays[relayId];
    var hadPending = !!this._pendingRelays[relayId];
    if (!r && !hadPending) return;
    if (options.notify !== false) {
      this._signal(relayId, "leave-relay", {
        reason: options.reason || "relay-dropped",
      }).catch(function (error) {
        var consoleFn =
          global.console && global.console.warn
            ? global.console.warn
            : global.console && global.console.log
              ? global.console.log
              : function () {};
        consoleFn(
          "[VibeHub] Relay 释放信令失败: " +
            relayId +
            " (" +
            (error && error.message ? error.message : "unknown") +
            ")",
        );
      });
    }
    var wasPrimary = relayId === this._primaryRelayId;
    if (r) this._recordRtcSnapshot(relayId, r, true, options.reason || "relay-dropped");
    this._clearRealtimeEndpoint(relayId, true);
    delete this._relays[relayId];
    delete this._pendingRelays[relayId];
    if (options.failed === false) {
      delete this._scorer.scores[relayId];
    } else {
      this._scorer.reportFail(relayId);
      this._scorer.remove(relayId);
    }
    if (r) try { r.pc.close(); } catch (e) {}
    if (relayId === this._warmRelayId) this._warmRelayId = null;
    this._rebalanceRelayRoles(
      options.reason || (wasPrimary ? "primary-relay-failed" : "warm-relay-failed"),
    );
    if (wasPrimary && options.failed !== false) this._enterRelayPath("primary-relay-failed");
    this._publishRelayState();
    if (!options.skipRefill) this._refillRelays();
    this._emit("peer", { type: "relay", id: relayId, active: false });
  };

  // ── Channel ──
  Room.prototype._cancelReconnectGrace = function (remoteId) {
    var timer = this._reconnectGraceTimers[remoteId];
    if (timer) {
      clearTimeout(timer);
      delete this._reconnectGraceTimers[remoteId];
    }
    delete this._reconnectDeadlines[remoteId];
  };

  Room.prototype._markAuthExpired = function (remoteId) {
    this._authExpired = true;
    if (remoteId) {
      if (this._reconnectTimers && this._reconnectTimers[remoteId]) {
        clearTimeout(this._reconnectTimers[remoteId]);
        delete this._reconnectTimers[remoteId];
      }
      this._cancelReconnectGrace(remoteId);
    } else {
      for (var reconnectId in (this._reconnectTimers || {})) {
        clearTimeout(this._reconnectTimers[reconnectId]);
      }
      this._reconnectTimers = {};
      for (var graceId in this._reconnectGraceTimers) {
        clearTimeout(this._reconnectGraceTimers[graceId]);
      }
      this._reconnectGraceTimers = {};
      this._reconnectDeadlines = {};
      if (this._roomRefreshTimer) clearTimeout(this._roomRefreshTimer);
      this._roomRefreshTimer = null;
    }
    if (!this._authExpiryWarned) {
      this._authExpiryWarned = true;
      this._warn("登录已过期", "请由玩家重新登录并加入房间");
    }
  };

  Room.prototype._scheduleRoomCapabilityRefresh = function (retryDelay) {
    if (this._roomRefreshTimer) clearTimeout(this._roomRefreshTimer);
    this._roomRefreshTimer = null;
    if (this._closed || !this._roomTokenExpiresAt) return;
    var self = this;
    var delay =
      typeof retryDelay === "number"
        ? retryDelay
        : Math.max(
            1000,
            this._roomTokenExpiresAt - Date.now() - ROOM_CAPABILITY_REFRESH_MARGIN_MS,
          );
    this._roomRefreshTimer = setTimeout(function () {
      self._roomRefreshTimer = null;
      self._claimRoomCapability(false).catch(function (error) {
        if (self._closed) return;
        self._warn(
          "房间凭证续期失败",
          (error && error.message) || "将在后台重试",
        );
        self._scheduleRoomCapabilityRefresh(ROOM_CAPABILITY_REFRESH_RETRY_MS);
      });
    }, delay);
  };

  Room.prototype._applyRoomClaim = function (claim, initial) {
    this.isHost = !!(claim && claim.owner);
    this.hostId = (claim && claim.hostPeerId) || (this.isHost ? this.peerId : null);
    this._roomToken = claim && claim.roomToken;
    this._roomTokenExpiresAt =
      claim && typeof claim.roomTokenExpiresAt === "number" ? claim.roomTokenExpiresAt : 0;
    if (!this._roomToken || !(claim && claim.wireKey)) {
      throw new Error("[VibeHub] 房间安全凭证缺失");
    }
    this._sdk._roomTokens[this.roomId] = this._roomToken;
    if (this.topology === "host" && !this.isHost && !this.hostId) {
      throw new Error("[VibeHub] 房间正在从旧版协议迁移，请约 60 秒后重试");
    }
    if (!initial) {
      this._roomRefreshCount++;
      this._lastRoomRefreshAt = Date.now();
    }
    this._scheduleRoomCapabilityRefresh();
    return this._setWireKey(claim.wireKey);
  };

  Room.prototype._claimRoomCapability = function (initial) {
    if (this._roomRefreshPromise) return this._roomRefreshPromise;
    var self = this;
    this._roomRefreshPromise = this._sdk
      ._fetch("/api/sdk/rooms", {
        method: "POST",
        body: JSON.stringify({ room: this.roomId, action: "claim", peer: this.peerId }),
      })
      .then(function (claim) {
        return self._applyRoomClaim(claim, initial).then(function () {
          return claim;
        });
      })
      .finally(function () {
        self._roomRefreshPromise = null;
      });
    return this._roomRefreshPromise;
  };

  Room.prototype._ensureRoomCapability = function () {
    if (!this._roomToken && !this._started) return Promise.resolve(null);
    if (this._roomToken && !this._roomTokenExpiresAt) return Promise.resolve(this._roomToken);
    if (
      this._roomToken &&
      this._roomTokenExpiresAt > Date.now() + ROOM_CAPABILITY_REFRESH_MARGIN_MS
    ) {
      return Promise.resolve(this._roomToken);
    }
    return this._claimRoomCapability(false).then(function (claim) {
      return claim.roomToken;
    });
  };

  Room.prototype._prepareReconnect = function (remoteId) {
    var self = this;
    return this._sdk._ensureIceServers().then(function () {
      if (self._closed) return false;
      if (!self._sdk.token) {
        self._markAuthExpired(remoteId);
        return false;
      }
      return true;
    });
  };

  Room.prototype._setWireKey = function (encoded) {
    if (!encoded || !global.crypto || !global.crypto.subtle) {
      return Promise.reject(new Error("[VibeHub] 当前浏览器不支持安全的 VibeNet 加密"));
    }
    var normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) normalized += "=";
    var raw = global.atob(normalized);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    this._wireKeyPromise = global.crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    return this._wireKeyPromise;
  };

  Room.prototype._wireAad = function (fromId, toId, epoch, stream, seq, flags) {
    return strToBytes(
      "2\0" + fromId + "\0" + toId + "\0" + epoch + "\0" + stream + "\0" +
        seq + "\0" + (flags & ~6),
    );
  };

  Room.prototype._encryptPayload = function (payload, fromId, toId, epoch, stream, seq, flags) {
    var self = this;
    if (!this._wireKeyPromise) return Promise.resolve({ payload: payload, flags: flags });
    return this._wireKeyPromise.then(function (key) {
      var nonce = global.crypto.getRandomValues(new Uint8Array(12));
      var encryptedFlags = flags | WIRE_ENCRYPTED_FLAG;
      return global.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData: self._wireAad(
            fromId,
            toId,
            epoch,
            stream,
            seq,
            encryptedFlags,
          ),
        },
        key,
        payload,
      ).then(function (ciphertext) {
        var cipher = new Uint8Array(ciphertext);
        var result = new Uint8Array(nonce.length + cipher.length);
        result.set(nonce, 0);
        result.set(cipher, nonce.length);
        return { payload: result, flags: encryptedFlags };
      });
    });
  };

  Room.prototype._decryptPayload = function (wire) {
    if (!(wire.flags & WIRE_ENCRYPTED_FLAG)) return Promise.resolve(wire.payload);
    if (!this._wireKeyPromise || wire.payload.length <= 12) {
      return Promise.reject(new Error("[VibeHub] 缺少房间 wire key"));
    }
    var self = this;
    var nonce = wire.payload.subarray(0, 12);
    var ciphertext = wire.payload.subarray(12);
    return this._wireKeyPromise.then(function (key) {
      return global.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData:
            wire.version === 1
              ? strToBytes(
                  wire.fromId + "\0" + wire.toId + "\0" + wire.seq + "\0" +
                    (wire.flags & ~6),
                )
              : self._wireAad(
                  wire.fromId,
                  wire.toId,
                  wire.epoch,
                  wire.stream,
                  wire.seq,
                  wire.flags,
                ),
        },
        key,
        ciphertext,
      );
    }).then(function (plain) { return new Uint8Array(plain); });
  };

  Room.prototype._decodePayload = function (payload, flags) {
    if (flags & WIRE_ENVELOPE_FLAG) {
      if (payload.length < 5) return { accepted: false, data: null };
      var type = payload[0];
      var content = payload.subarray(5);
      if (type === 2) {
        return {
          accepted: true,
          data: content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
        };
      }
      if (type === 3) return { accepted: true, data: new Uint8Array(content) };
      var text = bytesToStr(content);
      if (type === 1) return { accepted: true, data: text };
      try {
        return { accepted: true, data: JSON.parse(text) };
      } catch (error) {
        return { accepted: true, data: text };
      }
    }

    // 兼容尚未更新的直连客户端；经 relay 的新房间会拒绝未加密 wire。
    var data = payload;
    try {
      data = bytesToStr(payload);
      data = JSON.parse(data);
    } catch (x) {}
    return { accepted: true, data: data };
  };

  Room.prototype._deliverMessage = function (data, fromId) {
    if (data && typeof data === "object" && data.t === "state" && this.state) {
      // host authority: host 不接受远端 state，客户端只接受当前 host 的 state。
      if (this.isHost || fromId !== this.hostId) return false;
      this.state._applyRemote(data.key, data.value, fromId, data._ts);
    }
    this._emit("message", data, fromId);
    return true;
  };

  Room.prototype._recordQualitySample = function (remoteId, rttMs) {
    if (!Number.isFinite(rttMs) || rttMs < 0 || rttMs > 60000) return;
    var previous = this._peerQuality[remoteId] || {
      rttMs: null,
      jitterMs: 0,
      samples: 0,
      sampledAt: 0,
    };
    var priorRtt = Number.isFinite(previous.rttMs) ? previous.rttMs : rttMs;
    var delta = Math.abs(rttMs - priorRtt);
    previous.rttMs =
      previous.samples > 0 ? previous.rttMs * 0.8 + rttMs * 0.2 : rttMs;
    previous.jitterMs =
      previous.samples > 0 ? previous.jitterMs * 0.8 + delta * 0.2 : 0;
    previous.samples++;
    previous.sampledAt = Date.now();
    this._peerQuality[remoteId] = previous;
    var entry = this._peers[remoteId];
    if (entry) entry._cachedLatency = Math.round(previous.rttMs);
  };

  Room.prototype._handleQualityMessage = function (data, fromId) {
    if (!data || typeof data !== "object" || !Number.isSafeInteger(data.n)) return;
    if (data.t === "q") {
      this._sendQualityMessage(fromId, { t: "a", n: data.n });
      return;
    }
    if (data.t !== "a") return;
    var key = fromId + ":" + data.n;
    var startedAt = this._qualityPending[key];
    if (!Number.isFinite(startedAt)) return;
    delete this._qualityPending[key];
    this._recordQualitySample(fromId, performance.now() - startedAt);
  };

  Room.prototype._deliverWire = function (wire, incomingId, incomingIsRelay) {
    var self = this;
    var chainKey = wire.fromId + "|" + wire.stream;
    var chain = this._deliveryChains[chainKey] || Promise.resolve();
    this._deliveryChains[chainKey] = chain
      .then(function () { return self._decryptPayload(wire); })
      .then(function (payload) {
        if (
          !self._receiveWindow.accept(
            wire.fromId,
            wire.epoch,
            wire.stream,
            wire.seq,
          )
        ) {
          self._duplicateSuppressed++;
          return;
        }
        var decoded = self._decodePayload(payload, wire.flags);
        if (
          decoded.accepted &&
          (wire.toId === self.peerId || wire.toId === "*")
        ) {
          if (wire.stream === STREAM_QUALITY) {
            self._handleQualityMessage(decoded.data, wire.fromId);
          } else {
            self._deliverMessage(decoded.data, wire.fromId);
          }
        }
        self._forwardWire(wire, incomingId, incomingIsRelay);
      })
      .catch(function () {
        self._warn("已丢弃无法验证的联机消息", wire.fromId.slice(0, 8));
      });
    this._deliveryChain = Promise.all(
      Object.keys(this._deliveryChains).map(function (key) {
        return self._deliveryChains[key];
      }),
    ).then(function () {});
    return true;
  };

  Room.prototype._forwardWire = function (wire, incomingId, incomingIsRelay) {
    if (wire.toId === this.peerId) return;
    var hop = (wire.flags >> 1) & 3;
    if (hop >= 2) return;
    var packet = packRelayWire(
      wire.fromId,
      wire.toId,
      wire.epoch,
      wire.stream,
      wire.seq,
      wire.payload,
      (wire.flags & ~6) | ((hop + 1) << 1),
    );
    var target = wire.toId;
    if (this.topology === "host" && !this.isHost && !incomingIsRelay) return;
    var targets = this._transportTargets(target);
    var unresolved = [];
    for (var i = 0; i < targets.length; i++) {
      var targetId = targets[i];
      if (targetId === incomingId || targetId === wire.fromId) continue;
      if (
        !this._sendDirectTarget(
          packet,
          targetId,
          wire.stream === STREAM_REALTIME || wire.stream === STREAM_QUALITY,
        )
      ) {
        unresolved.push(targetId);
      }
    }
    if (!unresolved.length) return;
    this._sendRelayIds(
      packet,
      this._relayIdsForTargets(
        unresolved,
        Date.now() < this._relayDualSendUntil,
      ),
      incomingId,
      wire.stream === STREAM_REALTIME || wire.stream === STREAM_QUALITY,
    );
  };

  Room.prototype._handleWire = function (wire, incomingId, incomingIsRelay) {
    if (!(wire.flags & WIRE_FLAG)) return false;
    var hop = (wire.flags >> 1) & 3;
    if (
      this._wireKeyPromise &&
      (wire.version === 2 || incomingIsRelay || hop > 0) &&
      !(wire.flags & WIRE_ENCRYPTED_FLAG)
    ) {
      return false;
    }
    this._deliverWire(wire, incomingId, incomingIsRelay);
    return true;
  };

  Room.prototype._sendStateSnapshot = function (remoteId) {
    if (!this.state || !this.isHost) return;
    for (var key in this.state._store) {
      if (!Object.prototype.hasOwnProperty.call(this.state._store, key)) continue;
      var entry = this.state._store[key];
      this.send({ t: "state", key: key, value: entry.value, _ts: entry._ts }, remoteId);
    }
  };

  Room.prototype._realtimeEndpoint = function (remoteId, isRelay) {
    return (isRelay ? "relay:" : "peer:") + remoteId;
  };

  Room.prototype._queueRealtimeWire = function (endpoint, entry, wire) {
    var route;
    try {
      route = unpackRelayWire(wire);
    } catch (error) {
      this._realtimeStats.dropped++;
      return false;
    }
    var key = endpoint + "|" + route.stream + "|" + route.toId;
    if (this._realtimePending[key]) this._realtimeStats.dropped++;
    else this._realtimeStats.deferred++;
    this._realtimePending[key] = {
      endpoint: endpoint,
      entry: entry,
      wire: wire,
    };
    return true;
  };

  Room.prototype._flushRealtimeEndpoint = function (endpoint, entry) {
    var dc = entry && entry.rtDc;
    if (!dc || !entry.rtOpen || dc.readyState !== "open") return;
    for (var key in this._realtimePending) {
      var pending = this._realtimePending[key];
      if (!pending || pending.endpoint !== endpoint || pending.entry !== entry) continue;
      if (
        dc.bufferedAmount + pending.wire.byteLength >
        this._realtimeMaxBufferedBytes
      ) {
        return;
      }
      delete this._realtimePending[key];
      try {
        dc.send(pending.wire);
        this._realtimeStats.sent++;
      } catch (error) {
        this._realtimeStats.dropped++;
        entry.rtOpen = false;
        return;
      }
    }
  };

  Room.prototype._sendRealtimeChannel = function (remoteId, entry, wire, isRelay) {
    if (!entry || !entry.realtimeCapable) return false;
    var endpoint = this._realtimeEndpoint(remoteId, isRelay);
    var dc = entry.rtDc;
    if (!dc || !entry.rtOpen || dc.readyState !== "open") {
      return this._queueRealtimeWire(endpoint, entry, wire);
    }
    if (
      dc.bufferedAmount + wire.byteLength >
      this._realtimeMaxBufferedBytes
    ) {
      return this._queueRealtimeWire(endpoint, entry, wire);
    }
    try {
      dc.send(wire);
      this._realtimeStats.sent++;
      return true;
    } catch (error) {
      this._realtimeStats.dropped++;
      entry.rtOpen = false;
      return false;
    }
  };

  Room.prototype._clearRealtimeEndpoint = function (remoteId, isRelay) {
    var endpoint = this._realtimeEndpoint(remoteId, isRelay);
    for (var key in this._realtimePending) {
      if (this._realtimePending[key]?.endpoint === endpoint) {
        delete this._realtimePending[key];
        this._realtimeStats.dropped++;
      }
    }
  };

  Room.prototype._wireChannel = function (remoteId, dc, isRelay, realtime) {
    var self = this;
    dc.binaryType = "arraybuffer";
    if (realtime) {
      dc.bufferedAmountLowThreshold = this._realtimeBufferedLowBytes;
      dc.onbufferedamountlow = function () {
        var entry = isRelay ? self._relays[remoteId] : self._peers[remoteId];
        if (entry) self._flushRealtimeEndpoint(self._realtimeEndpoint(remoteId, isRelay), entry);
      };
    }
    dc.onopen = function () {
      var entry = isRelay ? self._relays[remoteId] : self._peers[remoteId];
      if (!entry) return;
      if (realtime) {
        entry.rtOpen = true;
        entry.realtimeCapable = true;
        self._flushRealtimeEndpoint(self._realtimeEndpoint(remoteId, isRelay), entry);
        return;
      }
      entry.open = true;
      entry.reconnecting = false;
      if (isRelay) {
        delete self._pendingRelays[remoteId];
        if (entry && entry._connectStart) self._scorer.reportLatency(remoteId, Date.now() - entry._connectStart);
        self._rebalanceRelayRoles("relay-open");
        self._trimRelayPaths();
        self._publishRelayState();
        self._convergeRelayPaths("relay-open");
        self._refillRelays();
        self._startProbing();
        self._emit("peer", { type: "relay", id: remoteId, active: true });
      } else {
        self._cancelReconnectGrace(remoteId);
        self._beginDirectRecovery("direct-channel-open");
        self._publishRelayState();
        self._emit("peer", { type: "join", id: remoteId });
        self._sendStateSnapshot(remoteId);
      }
    };
    dc.onclose = function () {
      if (realtime) {
        var entry = isRelay ? self._relays[remoteId] : self._peers[remoteId];
        if (entry && entry.rtDc === dc) {
          entry.rtOpen = false;
          entry.rtDc = null;
          if (entry.initiator && entry.pc?.connectionState !== "closed") {
            self._ensureRealtimeChannel(remoteId, entry, isRelay);
          }
        }
        return;
      }
      if (isRelay) { self._dropRelay(remoteId, { reason: "relay-channel-closed" }); return; }
      self._onPeerFailure(remoteId);
    };
    dc.onmessage = function (e) {
      if (isRelay) {
        if (!(e.data instanceof ArrayBuffer)) return;
        try { self._handleRelayMessage(e.data, remoteId); } catch (err) {}
        return;
      }
      var data = e.data;
      if (data instanceof ArrayBuffer) {
        try {
          var wire = unpackRelayWire(data);
          if (wire.flags & 1) {
            if ((wire.flags & 16) && wire.payload && wire.payload.length === 1 && wire.payload[0] === 2) {
              // probe ACK
              var s = self._scorer.scores[remoteId] || self._scorer.scores[wire.fromId];
              if (s) {
                s._probeAckSeq = wire.seq;
                self._scorer.reportAck(wire.fromId, self._scorer._now() - (s._probeSentAt || self._scorer._now()));
              }
              return;
            }
            self._handleWire(wire, remoteId, false);
            if (wire.stream === STREAM_REALTIME) self._realtimeStats.received++;
            return;
          }
        } catch (x) {}
        self._emit("message", data, remoteId);
      } else {
        var data = e.data;
        try { data = JSON.parse(data); } catch (x) {}
        self._deliverMessage(data, remoteId);
      }
    };
  };

  Room.prototype._handleRelayMessage = function (raw, remoteId) {
    var wire = unpackRelayWire(raw);
    // relay 对探测包的 ACK。ACK 终止在发起探测的客户端，不进入游戏消息回调。
    if ((wire.flags & 16) && wire.toId === this.peerId && wire.payload && wire.payload.length === 1 && wire.payload[0] === 2) {
      var score = this._scorer.scores[wire.fromId];
      if (score) {
        score._probeAckSeq = wire.seq;
        this._scorer.reportAck(wire.fromId, this._scorer._now() - (score._probeSentAt || this._scorer._now()));
      }
      return;
    }
    // probe: to=from → ACK echo
    if ((wire.flags & 8) && wire.toId === wire.fromId && wire.payload && wire.payload.length === 1) {
      var ack = packRelayWire(
        this.peerId,
        wire.fromId,
        wire.epoch,
        STREAM_PROBE,
        wire.seq,
        new Uint8Array([2]),
        17,
      );
      var reply = this._relays[remoteId];
      if (reply && reply.open && reply.dc) try { reply.dc.send(ack); } catch (x) {}
      return;
    }
    if (wire.stream === STREAM_REALTIME) this._realtimeStats.received++;
    this._handleWire(wire, remoteId, true);
  };

  // ── Send ──
  Room.prototype._encodePayload = function (data, sequence) {
    var type;
    var content;
    if (data instanceof ArrayBuffer) {
      type = 2;
      content = new Uint8Array(data);
    } else if (
      data instanceof Uint8Array ||
      (ArrayBuffer.isView && ArrayBuffer.isView(data))
    ) {
      type = 3;
      content =
        data instanceof Uint8Array
          ? data
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (typeof data === "string") {
      type = 1;
      content = strToBytes(data);
    } else {
      type = 0;
      content = strToBytes(JSON.stringify(data));
    }
    var envelope = new Uint8Array(content.length + 5);
    envelope[0] = type;
    // 保留 4 字节 envelope 序号以兼容旧数据布局；最终去重使用已认证 wire v2 身份。
    new DataView(envelope.buffer).setUint32(1, sequence >>> 0);
    envelope.set(content, 5);
    return envelope;
  };

  Room.prototype._prepareWire = function (payload, targetId, stream, seq) {
    var self = this;
    var epoch = this._pathEpoch;
    var flags = WIRE_FLAG | WIRE_ENVELOPE_FLAG;
    function pack(prepared) {
      return packRelayWire(
        self.peerId,
        targetId,
        epoch,
        stream,
        seq,
        prepared.payload,
        prepared.flags,
      );
    }
    if (!this._wireKeyPromise) {
      return pack({ payload: payload, flags: flags });
    }
    return this._encryptPayload(
      payload,
      this.peerId,
      targetId,
      epoch,
      stream,
      seq,
      flags,
    ).then(pack);
  };

  Room.prototype._dispatchWire = function (wire, targetId, realtime) {
    var now = Date.now();
    if (this._diagnosticForceRelayId && this._relayOpen(this._diagnosticForceRelayId)) {
      this._sendRelayIds(wire, [this._diagnosticForceRelayId], null, realtime);
      return;
    }
    var targets = this._transportTargets(targetId);
    if (!targets.length) {
      this._enterRelayPath("no-known-target");
      this._sendRelayWire(wire, now < this._relayDualSendUntil, realtime);
      return;
    }
    var unresolved = [];
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      if (!this._sendDirectTarget(wire, target, realtime)) unresolved.push(target);
    }
    if (unresolved.length) {
      this._enterRelayPath("partial-direct-coverage");
      this._sendRelayIds(
        wire,
        this._relayIdsForTargets(
          unresolved,
          now < this._relayDualSendUntil || now < this._directRelayDualUntil,
        ),
        null,
        realtime,
      );
      return;
    }
    this._refreshTransportState("all-targets-direct");
    if (this._transportState === "recovering" && now < this._directRelayDualUntil) {
      this._sendRelayWire(wire, false, realtime);
    }
  };

  Room.prototype.send = function (data, toId) {
    this._sequence = (this._sequence + 1) >>> 0;
    if (this._sequence === 0) this._sequence = 1;
    var self = this;
    var seq = this._sequence;
    var targetId = toId || "*";
    var payload = this._encodePayload(data, seq);
    if (!this._wireKeyPromise) {
      this._dispatchWire(
        this._prepareWire(payload, targetId, STREAM_GAME, seq),
        targetId,
        false,
      );
      return;
    }
    var sendTask = function () {
      return Promise.resolve(
        self._prepareWire(payload, targetId, STREAM_GAME, seq),
      )
        .then(function (wire) { self._dispatchWire(wire, targetId, false); });
    };
    this._reliableSendChain = this._reliableSendChain
      .then(sendTask, sendTask)
      .catch(function () {
        self._warn("联机消息加密失败", "消息未发送");
      });
  };

  Room.prototype._sendRealtimePayload = function (data, toId, stream) {
    this._sequence = (this._sequence + 1) >>> 0;
    if (this._sequence === 0) this._sequence = 1;
    var self = this;
    var seq = this._sequence;
    var payload = this._encodePayload(data, seq);
    var logicalTargetId = toId || "*";
    var targets = this._transportTargets(logicalTargetId);
    if (!targets.length) {
      this._realtimeStats.dropped++;
      return;
    }
    var routedTargets =
      this.topology === "host" && !this.isHost
        ? [{ wireTargetId: logicalTargetId, capabilityId: targets[0] }]
        : targets.map(function (targetId) {
            return { wireTargetId: targetId, capabilityId: targetId };
          });
    routedTargets.forEach(function (route) {
      var realtimeCapable =
        self._realtimeEnabled &&
        !!self._peerCapabilities[route.capabilityId]?.realtime;
      var selectedStream = realtimeCapable ? stream : STREAM_GAME;
      if (!realtimeCapable) self._realtimeStats.fallback++;
      var prepared = self._prepareWire(
        payload,
        route.wireTargetId,
        selectedStream,
        seq,
      );
      if (!(prepared && typeof prepared.then === "function")) {
        self._dispatchWire(prepared, route.wireTargetId, realtimeCapable);
        return;
      }
      prepared
        .then(function (wire) {
          self._dispatchWire(wire, route.wireTargetId, realtimeCapable);
        })
        .catch(function () {
          self._realtimeStats.dropped++;
          self._warn(
            "实时联机消息加密失败",
            route.capabilityId.slice(0, 8),
          );
        });
    });
  };

  Room.prototype.sendRealtime = function (data, toId) {
    this._sendRealtimePayload(data, toId, STREAM_REALTIME);
  };

  Room.prototype._sendQualityMessage = function (toId, data) {
    if (!this._peerCapabilities[toId]?.realtime) return;
    this._sendRealtimePayload(data, toId, STREAM_QUALITY);
  };

  Room.prototype._sendDirectTarget = function (wire, targetId, realtime) {
    var entry = this._peers[targetId];
    if (!entry || !entry.open || !entry.dc) return false;
    if (realtime && entry.realtimeCapable) {
      return this._sendRealtimeChannel(targetId, entry, wire, false);
    }
    if (realtime) this._realtimeStats.fallback++;
    try {
      entry.dc.send(wire);
      return true;
    } catch (error) {
      return false;
    }
  };

  Room.prototype._relayIdsForTargets = function (targets, includeWarm) {
    var selected = [];
    for (var i = 0; i < targets.length; i++) {
      var common = this._commonRelayIdsForPeer(targets[i]);
      var primary = common[0] || this._primaryRelayId;
      if (primary && selected.indexOf(primary) < 0) selected.push(primary);
      if (includeWarm) {
        var secondary = common.length ? common[1] : this._warmRelayId;
        if (secondary && selected.indexOf(secondary) < 0) selected.push(secondary);
      }
    }
    if (!selected.length && this._primaryRelayId) selected.push(this._primaryRelayId);
    return selected.slice(0, RELAY_PATH_LIMIT);
  };

  Room.prototype._sendRelayIds = function (wire, relayIds, incomingId, realtime) {
    var sent = 0;
    var used = {};
    for (var i = 0; i < relayIds.length && sent < RELAY_PATH_LIMIT; i++) {
      var relayId = relayIds[i];
      if (!relayId || relayId === incomingId || used[relayId]) continue;
      used[relayId] = true;
      var relay = this._relays[relayId];
      if (!relay || !relay.open || !relay.dc) continue;
      if (realtime && relay.realtimeCapable) {
        if (this._sendRealtimeChannel(relayId, relay, wire, true)) sent++;
        continue;
      }
      if (realtime) this._realtimeStats.fallback++;
      try {
        relay.dc.send(wire);
        sent++;
      } catch (error) {
        this._dropRelay(relayId, { reason: "relay-send-failed" });
      }
    }
    return sent;
  };

  Room.prototype._sendRelayWire = function (wire, includeWarm, realtime) {
    this._rebalanceRelayRoles("send");
    var paths = [this._primaryRelayId];
    if (
      includeWarm &&
      this._warmRelayId &&
      this._warmRelayId !== this._primaryRelayId
    ) {
      paths.push(this._warmRelayId);
    }
    return this._sendRelayIds(wire, paths, null, realtime);
  };

  // ── Reconnect (指数退避) ──
  Room.prototype._onPeerFailure = function (remoteId) {
    var entry = this._peers[remoteId]; if (!entry) return;
    this._recordRtcSnapshot(remoteId, entry, false, "direct-peer-failed");
    if (entry.dcDiscoTimer) { clearTimeout(entry.dcDiscoTimer); entry.dcDiscoTimer = null; }
    // 暖备已连接时立即提升；没有可用 relay 时异步补位。
    this._enterRelayPath("direct-failed");
    this._warn("P2P 连接断开, 切换 relay 模式", remoteId.slice(0, 8));

    if (!entry.reconnecting) {
      entry.reconnecting = true;
      this._clearRealtimeEndpoint(remoteId, false);
      try { entry.pc.close(); } catch (x) {}
      delete this._peers[remoteId];
      this._emit("peer", { type: "reconnecting", id: remoteId });

      var self = this;
      var attempt = 0;
      function tryReconnect() {
        if (self._closed) return;
        if (
          self._reconnectDeadlines[remoteId] &&
          Date.now() >= self._reconnectDeadlines[remoteId]
        ) return;
        if (self._peers[remoteId] && !self._peers[remoteId].reconnecting) return;
        self._prepareReconnect(remoteId).then(function (ready) {
          if (!ready || self._closed) return;
          if (
            self._reconnectDeadlines[remoteId] &&
            Date.now() >= self._reconnectDeadlines[remoteId]
          ) return;
          if (self._peers[remoteId] && !self._peers[remoteId].reconnecting) return;
          attempt++;
          var reconnectEntry = null;
          if (self.topology === "host" && self.isHost) reconnectEntry = self._createPeer(remoteId, true);
          else if (self.topology === "mesh") reconnectEntry = self._createPeer(remoteId, self.peerId < remoteId);
          else {
            self._signal(
              remoteId,
              "join",
              self._capabilityPayload({
                topology: self.topology,
                reconnect: true,
                attempt: attempt,
              }),
            );
          }
          if (reconnectEntry) reconnectEntry.reconnecting = true;
          var delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, attempt));
          self._reconnectTimers = self._reconnectTimers || {};
          self._reconnectTimers[remoteId] = setTimeout(tryReconnect, delay);
        });
      }
      tryReconnect();
    } else {
      // 当前重连尝试本身失败：清掉坏连接，交给已存在的退避定时器发起下一次尝试。
      this._clearRealtimeEndpoint(remoteId, false);
      try { entry.pc.close(); } catch (x) {}
      delete this._peers[remoteId];
    }

    // 第一次失败建立固定截止时间；后续失败不能延长两分钟宽限期。
    if (!this._reconnectDeadlines[remoteId]) {
      var self2 = this;
      this._reconnectDeadlines[remoteId] = Date.now() + RECONNECT_GRACE_MS;
      this._reconnectGraceTimers[remoteId] = setTimeout(function () {
        delete self2._reconnectGraceTimers[remoteId];
        if (self2._closed) return;
        var current = self2._peers[remoteId];
        if (current && current.open) {
          self2._cancelReconnectGrace(remoteId);
          return;
        }
        self2._warn("P2P 重连超时(" + (RECONNECT_GRACE_MS/1000) + "s), 永久丢失", remoteId.slice(0, 8));
        self2._dropPeer(remoteId);
      }, RECONNECT_GRACE_MS);
    }
  };

  Room.prototype._dropPeer = function (remoteId) {
    var e = this._peers[remoteId];
    var hadPeer = !!e || !!this._reconnectDeadlines[remoteId];
    this._cancelReconnectGrace(remoteId);
    if (this._reconnectTimers && this._reconnectTimers[remoteId]) { clearTimeout(this._reconnectTimers[remoteId]); delete this._reconnectTimers[remoteId]; }
    if (e) {
      this._recordRtcSnapshot(remoteId, e, false, "peer-dropped");
      if (e.dcDiscoTimer) { clearTimeout(e.dcDiscoTimer); }
      this._clearRealtimeEndpoint(remoteId, false);
      try { e.pc.close(); } catch (x) {}
      delete this._peers[remoteId];
    }
    delete this._peerCapabilities[remoteId];
    delete this._peerQuality[remoteId];
    for (var qualityKey in this._qualityPending) {
      if (qualityKey.indexOf(remoteId + ":") === 0) delete this._qualityPending[qualityKey];
    }
    for (var deliveryKey in this._deliveryChains) {
      if (deliveryKey.indexOf(remoteId + "|") === 0) delete this._deliveryChains[deliveryKey];
    }
    delete this._remoteRelayStates[remoteId];
    this._refreshTransportState("peer-left");
    this._publishRelayState();
    if (hadPeer) this._emit("peer", { type: "leave", id: remoteId });
  };

  // 手动重连 API
  Room.prototype.reconnect = function (remoteId) {
    var e = this._peers[remoteId];
    if (e && e.open) return; // 已连
    if (e) {
      this._recordRtcSnapshot(remoteId, e, false, "manual-reconnect");
      this._clearRealtimeEndpoint(remoteId, false);
      try { e.pc.close(); } catch (x) {}
      delete this._peers[remoteId];
    }
    this._emit("peer", { type: "reconnecting", id: remoteId });
    var self = this;
    this._prepareReconnect(remoteId).then(function (ready) {
      if (!ready || self._closed) return;
      if (self.topology === "host" && self.isHost) self._createPeer(remoteId, true);
      else if (self.topology === "mesh") self._createPeer(remoteId, self.peerId < remoteId);
      else {
        self._signal(
          remoteId,
          "join",
          self._capabilityPayload({ topology: self.topology, reconnect: true }),
        );
      }
    });
  };

  // ── Relay 生命周期: 探测 + 剪枝 + 复活 + 补充 ──
  Room.prototype._startProbing = function () {
    if (this._probeTimer || this._closed) return;
    var self = this;
    this._probeTimer = setInterval(function () {
      if (self._closed) { clearInterval(self._probeTimer); self._probeTimer = null; return; }
      // 用 requestIdleCallback 分片 (不阻塞游戏循环)
      if (global.requestIdleCallback) {
        global.requestIdleCallback(function () { self._probeAndMaintain(); });
      } else {
        setTimeout(function () { self._probeAndMaintain(); }, 0);
      }
    }, RELAY_PROBE_MS);

  };

  Room.prototype._probeAndMaintain = function () {
    this._probeRelays();
    this._pruneRelays();
    this._publishRelayState();
    this._convergeRelayPaths("periodic-relay-state");
    this._refillRelays();
  };

  Room.prototype._probeRelays = function () {
    this._scorer._probeSeq = (this._scorer._probeSeq + 1) & 0xffff;
    var seq = this._scorer._probeSeq, sentAt = this._scorer._now(), self = this;
    for (var id in this._relays) {
      (function (rid) {
        var r = self._relays[rid]; if (!r || !r.open || !r.dc) return;
        try {
          r.dc.send(
            packRelayWire(
              self.peerId,
              self.peerId,
              self._pathEpoch,
              STREAM_PROBE,
              seq,
              PROBE_PAYLOAD,
              9,
            ),
          );
          setTimeout(function () {
            if (self._scorer.scores[rid] && self._scorer.scores[rid]._probeAckSeq !== seq) self._scorer.reportFail(rid);
          }, PROBE_ACK_TIMEOUT_MS);
          self._scorer.scores[rid]._probeAckSeq = -1;
          self._scorer.scores[rid]._probeSentAt = sentAt;
        } catch (x) { self._scorer.reportFail(rid); self._warn("Relay 探测发送失败", rid.slice(0, 8)); }
      })(id);
    }
  };

  Room.prototype._pruneRelays = function () {
    var failing = this._scorer.pickFailing();
    for (var i = 0; i < failing.length; i++) {
      this._warn("Relay 已淘汰 (低分/连续失败)", failing[i].slice(0, 8));
      this._dropRelay(failing[i]);
    }
  };

  Room.prototype._refillRelays = function () {
    if (this._closed) return;
    var now = Date.now();
    var expired = false;
    var staleConnections = [];
    for (var existingId in this._relays) {
      var existing = this._relays[existingId];
      if (
        !existing.open &&
        existing._connectStart &&
        now - existing._connectStart >= RELAY_PENDING_MS
      ) {
        staleConnections.push(existingId);
      }
    }
    for (var staleIndex = 0; staleIndex < staleConnections.length; staleIndex++) {
      this._dropRelay(staleConnections[staleIndex], {
        skipRefill: true,
        reason: "relay-handshake-timeout",
      });
      expired = true;
    }
    for (var relayId in this._pendingRelays) {
      if (now - this._pendingRelays[relayId] >= RELAY_PENDING_MS) {
        this._dropRelay(relayId, {
          skipRefill: true,
          reason: "relay-discovery-timeout",
        });
        expired = true;
      }
    }
    if (expired) this._publishRelayState();
    this._trimRelayPaths();
    if (this._relaySlotCount() < this._desiredRelayCount()) {
      this._connectRelays().catch(function (e) {
        this._warn("Relay 节点发现失败", "无法获取新 relay: " + (e && e.message));
      }.bind(this));
    }
    var unsettled = Object.keys(this._pendingRelays).length > 0;
    if (!unsettled) {
      for (var unsettledId in this._relays) {
        if (!this._relays[unsettledId].open) { unsettled = true; break; }
      }
    }
    if (
      unsettled ||
      (this._unresolvedTransportTargets().length > 0 &&
        this._relaySlotCount() < this._desiredRelayCount())
    ) {
      this._scheduleRelayMaintenance();
    }
  };

  // ── 信令处理 ──
  Room.prototype._handleSignal = function (msg) {
    var self = this;
    if (msg.to !== this.peerId && msg.to !== "*") return;
    if (msg.from === this.peerId) return;

    // relay signals
    if (msg.kind === "join-relay") return;
    if (msg.kind === "relay-state") {
      this._acceptRelayState(msg.from, msg.payload);
      return;
    }
    if (msg.kind === "offer-relay") {
      var entryR = this._relays[msg.from];
      if (!entryR) {
        if (!this._pendingRelays[msg.from] && this._relaySlotCount() >= this._desiredRelayCount()) {
          return;
        }
        if (!this._scorer.add(msg.from)) return;
        entryR = {
          pc: new RTCPeerConnection(self._rtcConfiguration()),
          dc: null,
          rtDc: null,
          open: false,
          rtOpen: false,
          _connectStart: Date.now(),
          initiator: false,
          realtimeCapable:
            !!(
              this._realtimeEnabled &&
              msg.payload &&
              (msg.payload.realtime === 1 || msg.payload.realtime === true)
            ),
        };
        this._attachRtcDiagnostics(entryR);
        this._wireRelayNegotiation(msg.from, entryR);
        delete this._pendingRelays[msg.from];
        this._relays[msg.from] = entryR;
        this._scheduleRelayMaintenance();
        var newRpc = entryR.pc;
        newRpc.onicecandidate = function (e) { if (e.candidate) self._signal(msg.from, "ice-relay", e.candidate.toJSON()); };
        newRpc.onconnectionstatechange = function () {
          if (
            newRpc.connectionState === "failed" ||
            newRpc.connectionState === "closed" ||
            newRpc.connectionState === "disconnected"
          ) {
            self._dropRelay(msg.from, { reason: "relay-ice-failed" });
          }
        };
        newRpc.ondatachannel = function (e) {
          self._acceptDataChannel(msg.from, entryR, e.channel, true);
        };
      }
      if (
        this._realtimeEnabled &&
        msg.payload &&
        (msg.payload.realtime === 1 || msg.payload.realtime === true)
      ) {
        entryR.realtimeCapable = true;
      }
      var rpc = entryR.pc;
      var relayDescription =
        msg.payload && msg.payload.description ? msg.payload.description : msg.payload;
      var relayCollision = entryR.makingOffer || rpc.signalingState !== "stable";
      Promise.resolve()
        .then(function () {
          if (relayCollision) return rpc.setLocalDescription({ type: "rollback" });
        })
        .then(function () { return rpc.setRemoteDescription(relayDescription); })
        .then(function () { return rpc.setLocalDescription(); })
        .then(function () { return self._signal(msg.from, "answer-relay", rpc.localDescription); })
        .catch(function (e) {
          console.error("relay answer", e);
          self._dropRelay(msg.from, { reason: "relay-answer-failed" });
        });
      return;
    }
    if (msg.kind === "answer-relay") {
      var eA = this._relays[msg.from]; if (eA && eA.pc.signalingState === "have-local-offer") eA.pc.setRemoteDescription(msg.payload).catch(function () {});
      return;
    }
    if (msg.kind === "ice-relay") {
      var eI = this._relays[msg.from]; if (eI) eI.pc.addIceCandidate(msg.payload).catch(function () {});
      return;
    }

    // peer signals
    if (msg.kind === "join") {
      this._recordPeerCapabilities(msg.from, msg.payload);
      if (this.topology === "mesh") {
        // 双方都会收到 join；只允许 peerId 较小的一端创建 DataChannel，
        // 否则会同时生成两条 channel，并各自忽略对方的入站 channel。
        var initiator = this.peerId < msg.from;
        if (!this._peers[msg.from]) this._createPeer(msg.from, initiator);
        // 老玩家的广播 join 可能已过信令保留期；非发起端回一条定向 join，
        // 确保晚加入且 peerId 更小的玩家也能发现老玩家并发起连接。
        if (!initiator && !(msg.payload && msg.payload.reply)) {
          this._signal(
            msg.from,
            "join",
            this._capabilityPayload({ topology: this.topology, reply: true }),
          ).catch(function () {});
        }
        return;
      }
      if (this.isHost) {
        if (!this._peers[msg.from]) this._createPeer(msg.from, true);
        if (!(msg.payload && msg.payload.reply)) {
          this._signal(
            msg.from,
            "join",
            this._capabilityPayload({
              topology: this.topology,
              hostId: this.peerId,
              reply: true,
            }),
          ).catch(function () {});
        }
      }
      return;
    }
    if (msg.kind === "leave") {
      delete this._remoteRelayStates[msg.from];
      this._dropPeer(msg.from);
      return;
    }
    if (msg.kind === "offer") {
      var entry = this._peers[msg.from] || this._createPeer(msg.from, false), pc = entry.pc;
      var collision = entry.makingOffer || pc.signalingState !== "stable";
      entry.ignoreOffer = !entry.polite && collision;
      if (entry.ignoreOffer) return;
      Promise.resolve()
        .then(function () { if (collision) return pc.setLocalDescription({ type: "rollback" }); })
        .then(function () { return pc.setRemoteDescription(msg.payload); })
        .then(function () { return pc.setLocalDescription(); })
        .then(function () { self._signal(msg.from, "answer", pc.localDescription); })
        .catch(function (e) { console.error("answer", e); });
      return;
    }
    if (msg.kind === "answer") { var e2 = this._peers[msg.from]; if (e2 && e2.pc.signalingState === "have-local-offer") e2.pc.setRemoteDescription(msg.payload).catch(function () {}); return; }
    if (msg.kind === "ice") { var e3 = this._peers[msg.from]; if (!e3 || e3.ignoreOffer) return; e3.pc.addIceCandidate(msg.payload).catch(function () {}); return; }
  };

  // ── Poll ──
  Room.prototype._poll = function () {
    var self = this; if (this._closed) return;
    this._ensureRoomCapability()
      .then(function () {
        return self._sdk._fetch(
          "/api/sdk/signal?room=" + encodeURIComponent(self.roomId) +
            "&peer=" + encodeURIComponent(self.peerId) +
            "&after=" + self._cursor,
          { headers: self._roomToken ? { "X-Vibe-Room": self._roomToken } : {} },
        );
      })
      .then(function (r) {
        self._pollFails = 0;
        self._pollRetryMs = 0;
        if (!r || !r.messages) return;
        r.messages.forEach(function (m) { self._handleSignal(m); });
        if (typeof r.cursor === "number" && r.cursor > self._cursor) self._cursor = r.cursor;
      })
      .catch(function (error) {
        if (error && error.status === 401) {
          self._markAuthExpired();
          return;
        }
        self._pollFails += 1;
        self._pollRetryMs = signalPollRetryMs(error, self._pollFails);
        if (self._pollFails === 1 || self._pollFails % 30 === 0) {
          var status = error && error.status ? "HTTP " + error.status + "，" : "";
          self._warn(
            "信号轮询失败",
            status + "连续 " + self._pollFails + " 次，将在 " + Math.ceil(self._pollRetryMs / 1000) + " 秒后重试",
          );
        }
      })
      .finally(function () {
        if (self._closed || self._authExpired) return;
        var ms = self._pollRetryMs || (self._fastPoll > 0 ? SIGNAL_POLL_FAST_MS : SIGNAL_POLL_NORMAL_MS);
        if (!self._pollRetryMs && self._fastPoll > 0) self._fastPoll--;
        self._pollTimer = setTimeout(function () { self._poll(); }, ms);
      });
  };

  // ── Start：服务端 claim 原子确定 owner + hostPeerId，P2P 与数据权限使用同一房主 ──
  Room.prototype._start = function () {
    var self = this; this._fastPoll = SIGNAL_POLL_FAST_COUNT;
    return this._sdk._ensureIceServers().then(function () {
      return self._claimRoomCapability(true);
    }).then(function (claim) {
      return self._signal(
        "*",
        "join",
        self._capabilityPayload({ topology: self.topology, hostId: self.hostId }),
      );
    }).then(function () {
      self._poll(); self._heartbeat();
      self._startQualitySampling();
      self._started = true;
      self._sdk._registerRoom(self);
      if (!self.state) {
        self.state = new StateManager({
          isHost: self.isHost,
          authorityMode: "host",
          sendFn: function (key, value, ts) {
            self.send({ t: "state", key: key, value: value, _ts: ts });
          },
        });
        self.state._setPeerId(self.peerId);
      }
      if (self.isHost) {
        self._meta = { open: false, listed: false };
        self._startAnnounceHeartbeat();
      }
      self._publishRelayState();
      return self._connectRelays()
        .catch(function(e) {
          self._warn("VibeNet 暖备暂不可用", (e && e.message) || "节点发现失败");
        })
        .then(function () { return self; });
    });
  };

  Room.prototype._connectRelays = function () {
    if (this._relayConnectPromise) return this._relayConnectPromise;
    var self = this;
    var task = this._ensureRoomCapability().then(function () {
      if (self._closed || self._relaySlotCount() >= self._desiredRelayCount()) return;
      var excluded = {};
      var now = Date.now();
      for (var relayId in self._relays) excluded[relayId] = true;
      for (var pendingId in self._pendingRelays) excluded[pendingId] = true;
      for (var peerId in self._peers) excluded[peerId] = true;
      var preferred = self._diagnosticRelayId;
      if (preferred && self._scorer.cooldown[preferred]) {
        delete self._scorer.cooldown[preferred];
      } else if (!preferred) {
        var consensus = self._consensusRelayIds();
        for (var c = 0; c < consensus.length; c++) {
          var candidate = consensus[c];
          if (excluded[candidate] || !self._canRetryConsensusRelay(candidate, now)) continue;
          preferred = candidate;
          if (self._scorer.cooldown[candidate]) delete self._scorer.cooldown[candidate];
          break;
        }
      }
      for (var cooldownId in self._scorer.cooldown) {
        if (self._scorer.cooldown[cooldownId].until > now) {
          if (cooldownId !== preferred) excluded[cooldownId] = true;
        } else {
          delete self._scorer.cooldown[cooldownId];
        }
      }
      var excludeQuery = Object.keys(excluded).slice(0, 16).join(",");
      return self._sdk._fetch(
        "/api/relay/nodes?room=" + encodeURIComponent(self.roomId) +
          "&peer=" + encodeURIComponent(self.peerId) +
          "&n=" + RELAY_CANDIDATE_COUNT +
          (excludeQuery ? "&exclude=" + encodeURIComponent(excludeQuery) : "") +
          (preferred ? "&prefer=" + encodeURIComponent(preferred) : ""),
        { headers: { "X-Vibe-Room": self._roomToken } },
      );
    })
      .then(function (r) {
        if (!r || !r.nodes || !r.nodes.length) return;
        var added = false;
        for (var index = 0; index < r.nodes.length; index++) {
          if (self._relaySlotCount() >= self._desiredRelayCount()) break;
          var n = r.nodes[index];
          if (n.peerId === self.peerId) continue;
          if (
            self._relays[n.peerId] ||
            self._pendingRelays[n.peerId] ||
            self._peers[n.peerId]
          ) {
            continue;
          }
          if (!self._scorer.add(n.peerId)) continue;
          self._pendingRelays[n.peerId] = Date.now();
          added = true;
          self._scheduleRelayMaintenance();
          var candidateId = n.peerId;
          self._signal(candidateId, "join-relay", {
            room: self.roomId,
            grant: n.grant || null,
            realtime: self._realtimeEnabled ? 1 : 0,
          }).catch((function (relayId) {
            return function () {
              self._dropRelay(relayId, {
                skipRefill: true,
                reason: "relay-join-signal-failed",
              });
              if (!self._closed) self._refillRelays();
            };
          })(candidateId));
        }
        if (added) self._publishRelayState();
      });
    this._relayConnectPromise = task.finally(function () {
      self._relayConnectPromise = null;
    });
    return this._relayConnectPromise;
  };

  // 仅供平台诊断器验证指定匿名节点确实承载业务流量，不属于公开 SDK API。
  Room.prototype._forceRelayForDiagnostics = function (relayId) {
    var selected = relayId || this._diagnosticRelayId;
    if (!selected || !this._relayOpen(selected)) return false;
    this._diagnosticForceRelayId = selected;
    this._primaryRelayId = selected;
    this._enterRelayPath("diagnostic-forced-relay");
    return this._primaryRelayId === selected && this._relayOpen(selected);
  };

  Room.prototype._resumeDirectForDiagnostics = function () {
    var directOpen = false;
    for (var peerId in this._peers) {
      if (this._peers[peerId]?.open) {
        directOpen = true;
        break;
      }
    }
    if (!directOpen) return false;
    this._diagnosticForceRelayId = null;
    this._refreshTransportState("diagnostic-direct-resumed");
    this._lastSwitchReason = "diagnostic-direct-resumed";
    this._relayDualSendUntil = 0;
    this._directRelayDualUntil = 0;
    this._trimRelayPaths();
    return true;
  };

  // ── Leave ──
  Room.prototype.leave = function () {
    this._closed = true;
    if (this._pollTimer) clearTimeout(this._pollTimer);
    if (this._hbTimer) clearTimeout(this._hbTimer);
    if (this._announceTimer) clearInterval(this._announceTimer);
    if (this._roomRefreshTimer) clearTimeout(this._roomRefreshTimer);
    if (this._probeTimer) clearInterval(this._probeTimer);
    if (this._directRecoveryTimer) clearTimeout(this._directRecoveryTimer);
    if (this._relayMaintenanceTimer) clearTimeout(this._relayMaintenanceTimer);
    if (this._qualityTimer) clearTimeout(this._qualityTimer);
    if (this._reconnectTimers) { for (var k in this._reconnectTimers) clearTimeout(this._reconnectTimers[k]); }
    if (this._reconnectGraceTimers) { for (var g in this._reconnectGraceTimers) clearTimeout(this._reconnectGraceTimers[g]); }
    this._signal("*", "leave", null).catch(function () {});
    for (var id in this._peers) this._dropPeer(id);
    var relayIds = {};
    for (var connectedRelayId in this._relays) relayIds[connectedRelayId] = true;
    for (var pendingRelayId in this._pendingRelays) relayIds[pendingRelayId] = true;
    for (var id in relayIds) {
      this._dropRelay(id, { failed: false, skipRefill: true, reason: "room-left" });
    }
    if (this._sdk._roomTokens[this.roomId] === this._roomToken) {
      delete this._sdk._roomTokens[this.roomId];
    }
    this._realtimePending = {};
    this._qualityPending = {};
    this._deliveryChain = Promise.resolve();
    this._deliveryChains = {};
    this._sdk._unregisterRoom(this);
  };

  // ── API ──
  Room.prototype.peers = function () {
    var list = [];
    for (var id in this._peers) {
      var peerQuality = this._peerQuality[id];
      list.push({
        id: id,
        open: this._peers[id].open,
        latency: this._peers[id]._cachedLatency || 0,
        jitter:
          peerQuality && Date.now() - peerQuality.sampledAt <= QUALITY_STALE_MS
            ? Math.round(peerQuality.jitterMs)
            : 0,
        relay: false,
        realtime: !!(
          this._peers[id].realtimeCapable && this._peers[id].rtOpen
        ),
        reconnecting: !!this._peers[id].reconnecting,
        connectionState: this._peers[id].pc?.connectionState || null,
        iceConnectionState: this._peers[id].pc?.iceConnectionState || null,
      });
    }
    for (var rid in this._relays) {
      var s = this._scorer.scores[rid];
      list.push({
        id: rid,
        open: this._relays[rid].open,
        latency: s ? Math.round(s.latency) : 0,
        jitter: 0,
        relay: true,
        realtime: !!(
          this._relays[rid].realtimeCapable && this._relays[rid].rtOpen
        ),
        role: rid === this._primaryRelayId ? "primary" : rid === this._warmRelayId ? "warm" : "candidate",
        score: s ? +s.score.toFixed(3) : 0,
        reconnecting: false,
      });
    }
    return list;
  };

  Room.prototype.networkStats = function () {
    var targets = this._transportTargets("*");
    var paths = {};
    var peerQuality = {};
    var freshRtts = [];
    var freshJitters = [];
    var directCount = 0;
    var relayCovered = 0;
    for (var i = 0; i < targets.length; i++) {
      var peerId = targets[i];
      var common = this._commonRelayIdsForPeer(peerId);
      var direct = this._directPeerOpen(peerId);
      var endToEnd = this._peerQuality[peerId] || null;
      var directEntry = this._peers[peerId] || null;
      var transportQuality = directEntry?._transportQuality || null;
      if (!transportQuality && !direct) {
        for (var relayQualityIndex = 0; relayQualityIndex < common.length; relayQualityIndex++) {
          var relayQuality = this._relays[common[relayQualityIndex]]?._transportQuality;
          if (relayQuality) {
            transportQuality = relayQuality;
            break;
          }
        }
      }
      var sampleAgeMs = endToEnd ? Math.max(0, Date.now() - endToEnd.sampledAt) : null;
      var fresh = endToEnd && sampleAgeMs <= QUALITY_STALE_MS;
      var transportFresh =
        transportQuality &&
        Date.now() - transportQuality.sampledAt <= QUALITY_STALE_MS;
      var rttMs = fresh
        ? endToEnd.rttMs
        : transportFresh && Number.isFinite(transportQuality?.rttMs)
          ? transportQuality.rttMs
          : null;
      var jitterMs = fresh ? endToEnd.jitterMs : null;
      if (direct) directCount++;
      else if (common.length) relayCovered++;
      paths[peerId] = {
        path: direct ? "direct" : common.length ? "relay" : "unavailable",
        direct: direct,
        commonRelayIds: common,
      };
      peerQuality[peerId] = {
        rttMs: Number.isFinite(rttMs) ? Math.round(rttMs) : null,
        jitterMs: Number.isFinite(jitterMs) ? Math.round(jitterMs) : null,
        sampledAt: fresh
          ? endToEnd.sampledAt
          : transportQuality?.sampledAt || null,
        stale: !fresh && !transportFresh,
        source:
          fresh
            ? "end-to-end"
            : transportFresh && Number.isFinite(transportQuality?.rttMs)
              ? "ice"
              : "unavailable",
        availableOutgoingBitrate:
          transportQuality?.availableOutgoingBitrate || null,
        localCandidate: transportQuality?.local || null,
        remoteCandidate: transportQuality?.remote || null,
        reliableBufferedAmount: Math.max(0, directEntry?.dc?.bufferedAmount || 0),
        realtimeBufferedAmount: Math.max(0, directEntry?.rtDc?.bufferedAmount || 0),
      };
      if (Number.isFinite(rttMs)) freshRtts.push(rttMs);
      if (Number.isFinite(jitterMs)) freshJitters.push(jitterMs);
    }
    var derivedState = this._transportState;
    if (this._diagnosticForceRelayId) {
      derivedState = "relay";
    } else if (targets.length) {
      derivedState = directCount === targets.length
        ? this._transportState === "recovering" ? "recovering" : "direct"
        : directCount > 0
          ? "mixed"
          : "relay";
    }
    var relayOpen = 0;
    var relayConnecting = 0;
    for (var relayId in this._relays) {
      if (this._relays[relayId].open) relayOpen++;
      else relayConnecting++;
    }
    var relayPending = 0;
    for (var pendingId in this._pendingRelays) {
      if (!this._relays[pendingId]) relayPending++;
    }
    var remoteRelayStates = {};
    for (var remoteId in this._remoteRelayStates) {
      var remote = this._freshRemoteRelayState(remoteId);
      if (!remote) continue;
      remoteRelayStates[remoteId] = {
        relays: remote.relays.slice(),
        proposals: (remote.proposals || []).slice(),
        unavailable: remote.unavailable.slice(),
        ageMs: Date.now() - remote.receivedAt,
      };
    }
    var reliableBufferedAmount = 0;
    var realtimeBufferedAmount = 0;
    var directRealtimeOpen = 0;
    var relayRealtimeOpen = 0;
    for (var directPeerId in this._peers) {
      reliableBufferedAmount += Math.max(0, this._peers[directPeerId].dc?.bufferedAmount || 0);
      realtimeBufferedAmount += Math.max(0, this._peers[directPeerId].rtDc?.bufferedAmount || 0);
      if (this._peers[directPeerId].rtOpen) directRealtimeOpen++;
    }
    for (var connectedRelayId in this._relays) {
      reliableBufferedAmount += Math.max(0, this._relays[connectedRelayId].dc?.bufferedAmount || 0);
      realtimeBufferedAmount += Math.max(0, this._relays[connectedRelayId].rtDc?.bufferedAmount || 0);
      if (this._relays[connectedRelayId].rtOpen) relayRealtimeOpen++;
    }
    function percentile(values, ratio) {
      if (!values.length) return null;
      var sorted = values.slice().sort(function (a, b) { return a - b; });
      return Math.round(
        sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)],
      );
    }
    return {
      state: derivedState,
      pathEpoch: this._pathEpoch,
      primaryRelayId: this._primaryRelayId,
      warmRelayId: this._warmRelayId,
      switching:
        Date.now() < this._relayDualSendUntil ||
        Date.now() < this._directRelayDualUntil,
      lastSwitchReason: this._lastSwitchReason,
      duplicateSuppressed: this._duplicateSuppressed,
      targets: paths,
      quality: {
        peers: peerQuality,
        rttP50Ms: percentile(freshRtts, 0.5),
        rttP95Ms: percentile(freshRtts, 0.95),
        jitterP95Ms: percentile(freshJitters, 0.95),
      },
      realtime: {
        enabled: this._realtimeEnabled,
        directOpen: directRealtimeOpen,
        relayOpen: relayRealtimeOpen,
        maxBufferedBytes: this._realtimeMaxBufferedBytes,
        bufferedAmountLowThreshold: this._realtimeBufferedLowBytes,
        reliableBufferedAmount: reliableBufferedAmount,
        realtimeBufferedAmount: realtimeBufferedAmount,
        pending: Object.keys(this._realtimePending).length,
        sent: this._realtimeStats.sent,
        received: this._realtimeStats.received,
        deferred: this._realtimeStats.deferred,
        dropped: this._realtimeStats.dropped,
        fallback: this._realtimeStats.fallback,
      },
      coverage: {
        targets: targets.length,
        direct: directCount,
        relay: relayCovered,
        unavailable: Math.max(0, targets.length - directCount - relayCovered),
      },
      relays: {
        limit: RELAY_PATH_LIMIT,
        desired: this._desiredRelayCount(),
        total: relayOpen + relayConnecting + relayPending,
        open: relayOpen,
        connecting: relayConnecting,
        pending: relayPending,
        consensus: this._consensusRelayIds().slice(0, RELAY_PATH_LIMIT),
        proposals: this._relayStateSnapshot(false).proposals,
        cooldown: Object.keys(this._scorer.cooldown).slice(0, RELAY_STATE_MAX_IDS),
      },
      lifecycle: {
        authExpiresAt: this._sdk._authExpiresAt || null,
        authRefreshCount: this._sdk._authRefreshCount || 0,
        turnExpiresAt: this._sdk._turnExpiresAt || null,
        turnRefreshCount: this._sdk._turnRefreshCount || 0,
        roomCapabilityExpiresAt: this._roomTokenExpiresAt || null,
        roomCapabilityRefreshCount: this._roomRefreshCount,
        lastRoomCapabilityRefreshAt: this._lastRoomRefreshAt,
        iceCredentialRotations: this._iceCredentialRotations,
        lastIceCredentialRotationAt: this._lastIceCredentialRotationAt,
        lastIceCredentialRotationError: this._lastIceCredentialRotationError,
      },
      remoteRelayStates: remoteRelayStates,
    };
  };

  Room.prototype.diagnostics = function () {
    var self = this;
    var pending = this._rtcDiagnosticTasks.slice();
    var current = [];
    for (var peerId in this._peers) {
      current.push(this._collectRtcDiagnostics(peerId, this._peers[peerId], false, "current"));
    }
    for (var relayId in this._relays) {
      current.push(this._collectRtcDiagnostics(relayId, this._relays[relayId], true, "current"));
    }
    return Promise.all(pending)
      .catch(function () { return []; })
      .then(function () { return Promise.all(current); })
      .then(function (connections) {
        return {
          capturedAt: new Date().toISOString(),
          network: self.networkStats(),
          peers: self.peers(),
          serverRelay: self._serverRelayDiagnostics(),
          connections: connections,
          history: self._rtcHistory.slice(),
        };
      });
  };

  // ── Room management ──
  Object.defineProperty(Room.prototype, "data", {
    get: function () {
      return this._sdk._data("room", this.roomId, this._ensureRoomCapability.bind(this));
    },
  });

  Room.prototype.announce = function (meta) {
    var self = this; this._meta = meta || {};
    return this._announceOnce().then(function (r) { self._startAnnounceHeartbeat(); return r; });
  };
  Room.prototype._announceOnce = function () {
    var self = this;
    return this._ensureRoomCapability().then(function () {
      return self._sdk._fetch("/api/sdk/rooms", {
        method: "POST",
        headers: self._roomToken ? { "X-Vibe-Room": self._roomToken } : {},
        body: JSON.stringify({ room: self.roomId, action: "announce", peer: self.peerId, meta: self._meta || {} }),
      });
    });
  };
  Room.prototype._startAnnounceHeartbeat = function () {
    var self = this; if (this._announceTimer || this._closed) return;
    this._announceTimer = setInterval(function () {
      if (self._closed) { clearInterval(self._announceTimer); self._announceTimer = null; return; }
      self._announceOnce().catch(function () {});
    }, ROOM_ANNOUNCE_HB_MS);
  };
  Room.prototype.close = function () {
    if (this._announceTimer) { clearInterval(this._announceTimer); this._announceTimer = null; }
    var self = this;
    return this._ensureRoomCapability().then(function () {
      return self._sdk._fetch("/api/sdk/rooms", {
        method: "POST",
        headers: self._roomToken ? { "X-Vibe-Room": self._roomToken } : {},
        body: JSON.stringify({ room: self.roomId, action: "close", peer: self.peerId }),
      });
    });
  };
  Room.prototype._heartbeat = function () {
    var self = this; if (this._closed) return;
    this._ensureRoomCapability().then(function () {
      return self._sdk._fetch("/api/sdk/rooms", {
        method: "POST",
        headers: self._roomToken ? { "X-Vibe-Room": self._roomToken } : {},
        body: JSON.stringify({ room: self.roomId, action: "presence", peer: self.peerId, name: (self._sdk.user && self._sdk.user.name) || "" }),
      });
    }).catch(function (error) {
      if (error && error.status === 401) self._markAuthExpired();
    }).finally(function () {
      if (!self._closed && !self._authExpired) {
        self._hbTimer = setTimeout(function () { self._heartbeat(); }, PRESENCE_HB_MS);
      }
    });
  };

  // ----------------------------------------------------------------
  // SDK
  // ----------------------------------------------------------------
  function VibeSDK(opts) {
    this.work = opts.work;
    this.apiBase = (opts.apiBase || defaultApiBase()).replace(/\/$/, "");
    this.token = null; this.user = null;
    this._authExpiresAt = 0;
    this._authRefreshPromise = null;
    this._authRefreshTimer = null;
    this._authRefreshCount = 0;
    this._lastAuthRefreshAt = null;
    this._lastAuthRefreshError = null;
    this._authHandlers = [];
    this._authGeneration = 0;
    this._logoutStorageKey = "vibehub_logged_out_" + this.work;
    this._roomTokens = {};
    this._activeRooms = [];
    this._iceServers = BASE_ICE_SERVERS.slice();
    this._turnExpiresAt = 0;
    this._turnLoadPromise = null;
    this._turnRefreshTimer = null;
    this._turnRefreshCount = 0;
    this._lastTurnRefreshAt = null;
    this._turnStatus = {
      configured: false,
      available: false,
      expiresAt: null,
      transports: [],
      error: null,
    };
    // 作品共享 vibeapps origin，Bearer token 绝不能进入 localStorage/sessionStorage。
    // 只保存在当前 JS 实例内；顺手清掉旧 SDK 为本作品留下的遗留项。
    this._legacyStorageKey = "vibehub_token_" + this.work;
    try { global.localStorage.removeItem(this._legacyStorageKey); } catch (e) {}
  }

  // 公开认证 API:
  // login() 弹窗登录/授权; logout() 清除当前作品的本地登录态;
  // isLoggedIn() 返回当前实例状态; onAuthChange(cb) 返回取消监听函数。
  VibeSDK.prototype._emitAuth = function () { var u = this.user; this._authHandlers.forEach(function (cb) { try { cb(u); } catch (e) { console.error(e); } }); };
  VibeSDK.prototype.onAuthChange = function (cb) { this._authHandlers.push(cb); var self = this; return function () { var i = self._authHandlers.indexOf(cb); if (i >= 0) self._authHandlers.splice(i, 1); }; };
  VibeSDK.prototype.isLoggedIn = function () { return !!this.user; };
  VibeSDK.prototype._requestParentAuth = function (token) {
    var self = this;
    if (!global.parent || global.parent === global || !global.MessageChannel || !global.crypto || !global.crypto.getRandomValues) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var bytes = new Uint8Array(18);
      global.crypto.getRandomValues(bytes);
      var requestId = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      var channels = [];
      var finished = false;
      function finish(data) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearInterval(retry);
        channels.forEach(function (channel) { channel.port1.close(); channel.port2.close(); });
        resolve(data);
      }
      var timer = setTimeout(function () { finish(null); }, 2000);
      function send() {
        var channel = new global.MessageChannel();
        channels.push(channel);
        channel.port1.onmessage = function (event) {
          var data = event.data;
          if (!data || data.requestId !== requestId) return;
          if (data.status === 102) clearInterval(retry);
          else finish(data);
        };
        try {
          global.parent.postMessage({ type: "vibehub:auth:restore", work: self.work, requestId: requestId, token: token || undefined }, new URL(self.apiBase).origin, [channel.port2]);
        } catch (e) { finish(null); }
      }
      // The game may execute before the React player hydrates. Retry only the
      // handshake, stopping as soon as the parent acknowledges the request.
      var retry = setInterval(send, 200);
      send();
    });
  };
  VibeSDK.prototype._restoreAuth = function () {
    var self = this;
    var generation = this._authGeneration;
    try { if (global.localStorage.getItem(this._logoutStorageKey) === "1") return Promise.resolve(); } catch (e) {}
    return this._requestParentAuth().then(function (data) {
      if (generation !== self._authGeneration || !(data && data.status === 200 && data.work === self.work && data.token && data.user && data.user.id)) return;
      self._acceptToken(data.token, data.expiresAt);
      self.user = data.user;
      self._emitAuth();
    }).catch(function () { /* Restore is optional: guests can always start playing. */ });
  };
  VibeSDK.prototype._acceptToken = function (token, expiresAt) {
    this.token = token;
    if (!this._authSessionHandler && global.addEventListener) {
      var self = this;
      this._authSessionHandler = function (event) {
        if (event.source !== global.parent || event.origin !== new URL(self.apiBase).origin || !event.data || event.data.type !== "vibehub:auth:session" || !self.token) return;
        try {
          var body = self.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
          while (body.length % 4) body += "=";
          var payload = JSON.parse(global.atob(body));
          if (payload.sid && payload.sid !== event.data.sessionId) self._invalidateAuth(true);
        } catch (e) {}
      };
      global.addEventListener("message", this._authSessionHandler);
    }
    this._authExpiresAt =
      typeof expiresAt === "number" && isFinite(expiresAt) ? expiresAt : tokenExpiresAt(token);
    this._lastAuthRefreshError = null;
    this._scheduleAuthRefresh();
  };
  VibeSDK.prototype._clearAuthRefreshTimer = function () {
    if (this._authRefreshTimer) clearTimeout(this._authRefreshTimer);
    this._authRefreshTimer = null;
  };
  VibeSDK.prototype._scheduleAuthRefresh = function (retryDelay) {
    this._clearAuthRefreshTimer();
    if (!this.token || !this._authExpiresAt) return;
    var self = this;
    var delay =
      typeof retryDelay === "number"
        ? retryDelay
        : Math.max(1000, this._authExpiresAt - Date.now() - AUTH_REFRESH_MARGIN_MS);
    this._authRefreshTimer = setTimeout(function () {
      self._authRefreshTimer = null;
      self._refreshAuth().catch(function () {
        if (self.token) self._scheduleAuthRefresh(AUTH_REFRESH_RETRY_MS);
      });
    }, delay);
  };
  VibeSDK.prototype._markRoomsAuthExpired = function () {
    this._activeRooms.slice().forEach(function (room) {
      if (room && !room._closed) room._markAuthExpired();
    });
  };
  VibeSDK.prototype._invalidateAuth = function (notifyRooms) {
    this._authGeneration++;
    if (this._authSessionHandler) global.removeEventListener("message", this._authSessionHandler);
    this._authSessionHandler = null;
    var hadAuth = !!(this.token || this.user);
    if (hadAuth) clientCache.clearScope(this._cacheScope("player"));
    this.token = null;
    this.user = null;
    this._authExpiresAt = 0;
    this._clearAuthRefreshTimer();
    if (this._turnRefreshTimer) clearTimeout(this._turnRefreshTimer);
    this._turnRefreshTimer = null;
    if (hadAuth) this._emitAuth();
    if (notifyRooms) this._markRoomsAuthExpired();
  };
  VibeSDK.prototype._refreshAuth = function () {
    if (this._authRefreshPromise) return this._authRefreshPromise;
    if (!this.token) {
      var missing = new Error("请先登录");
      missing.status = 401;
      return Promise.reject(missing);
    }
    var self = this;
    var currentToken = this.token;
    var generation = this._authGeneration;
    this._authRefreshPromise = this._requestParentAuth(currentToken).then(function (bridge) {
      if (bridge && bridge.status === 200 && bridge.work === self.work && bridge.token) {
        return { ok: true, status: 200, json: function () { return Promise.resolve(bridge); } };
      }
      if (bridge && (bridge.status === 401 || bridge.status === 403)) {
        var error = new Error(bridge.error || "网站登录已变化，请重新登录"); error.status = bridge.status; throw error;
      }
      return fetch(self.apiBase + "/api/game-auth", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + currentToken,
      },
      body: JSON.stringify({ work: self.work }),
      });
    })
      .then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (!response.ok || !(data && data.token)) {
            var error = new Error((data && data.error) || "游戏授权续期失败");
            error.status = response.status;
            throw error;
          }
          if (generation !== self._authGeneration || self.token !== currentToken) throw new Error("登录状态已变化");
          self._acceptToken(data.token, data.expiresAt);
          self._authRefreshCount++;
          self._lastAuthRefreshAt = Date.now();
          return data.token;
        });
      })
      .catch(function (error) {
        self._lastAuthRefreshError =
          error && error.message ? error.message : "游戏授权续期失败";
        if (generation === self._authGeneration && ((error && (error.status === 401 || error.status === 403)) || (self._authExpiresAt && Date.now() >= self._authExpiresAt))) {
          self._invalidateAuth(true);
        }
        throw error;
      })
      .finally(function () {
        self._authRefreshPromise = null;
      });
    return this._authRefreshPromise;
  };
  VibeSDK.prototype._ensureAuthFresh = function () {
    if (!this.token || !this._authExpiresAt) return Promise.resolve(this.token);
    if (this._authExpiresAt > Date.now() + AUTH_REFRESH_MARGIN_MS) {
      return Promise.resolve(this.token);
    }
    return this._refreshAuth();
  };
  VibeSDK.prototype._registerRoom = function (room) {
    if (this._activeRooms.indexOf(room) < 0) this._activeRooms.push(room);
  };
  VibeSDK.prototype._unregisterRoom = function (room) {
    var index = this._activeRooms.indexOf(room);
    if (index >= 0) this._activeRooms.splice(index, 1);
  };
  VibeSDK.prototype._cacheScope = function (scope, roomId) {
    var userId = scope === "player" ? ((this.user && this.user.id) || "anonymous") : "";
    return this.work + "::" + scope + "::" + userId + "::" + (roomId || "");
  };
  VibeSDK.prototype.logout = function () {
    var token = this.token;
    try { global.localStorage.setItem(this._logoutStorageKey, "1"); } catch (e) {}
    clientCache.clearScope(this._cacheScope("player"));
    this._invalidateAuth(false);
    try { global.localStorage.removeItem(this._legacyStorageKey); } catch (e) {}
    if (token) fetch(this.apiBase + "/api/game-auth/logout", {
      method: "POST", keepalive: true,
      headers: { Authorization: "Bearer " + token },
    }).catch(function () { /* Local opt-out still prevents restoration when offline. */ });
  };

  VibeSDK.prototype._fetch = function (path, init) {
    var self = this;
    init = init || {};
    return this._ensureAuthFresh().then(function () {
      var requestInit = Object.assign({}, init);
      requestInit.headers = Object.assign({}, init.headers, {
        "Content-Type": "application/json",
        Authorization: "Bearer " + self.token,
      });
      return fetch(self.apiBase + path, requestInit).then(function (r) {
        var retryAfter = r.headers && typeof r.headers.get === "function"
          ? r.headers.get("Retry-After")
          : null;
        return r.json().catch(function () { return null; }).then(function (data) {
          if (r.status === 401 && self.token) {
            self._invalidateAuth(true);
            var expired = new Error((data && data.error) || "授权已过期，请由玩家重新登录");
            expired.status = 401;
            expired.code = "AUTH_EXPIRED";
            throw expired;
          }
          if (!r.ok) {
            var err = new Error((data && data.error) || ("HTTP " + r.status));
            err.status = r.status;
            if (r.status === 429) err.retryAfterMs = parseRetryAfterMs(retryAfter);
            throw err;
          }
          return data;
        });
      });
    });
  };

  VibeSDK.prototype._rtcConfiguration = function (turnOnly) {
    var config = { iceServers: this._iceServers.slice() };
    if (turnOnly) config.iceTransportPolicy = "relay";
    return config;
  };

  VibeSDK.prototype._turnDiagnostics = function (turnOnly) {
    return {
      configured: !!this._turnStatus.configured,
      available: !!this._turnStatus.available,
      expiresAt: this._turnStatus.expiresAt || null,
      transports: (this._turnStatus.transports || []).slice(),
      forced: !!turnOnly,
      error: this._turnStatus.error || null,
    };
  };

  VibeSDK.prototype._scheduleTurnRefresh = function (retryDelay) {
    if (this._turnRefreshTimer) clearTimeout(this._turnRefreshTimer);
    this._turnRefreshTimer = null;
    if (!this.token) return;
    if (typeof retryDelay !== "number" && !this._turnExpiresAt) return;
    var self = this;
    var delay =
      typeof retryDelay === "number"
        ? retryDelay
        : Math.max(1000, this._turnExpiresAt - Date.now() - TURN_REFRESH_MARGIN_MS);
    this._turnRefreshTimer = setTimeout(function () {
      self._turnRefreshTimer = null;
      self._ensureIceServers().catch(function () {
        if (self.token) self._scheduleTurnRefresh(TURN_REFRESH_RETRY_MS);
      });
    }, delay);
  };

  VibeSDK.prototype._rotateActiveRoomIce = function () {
    this._activeRooms.slice().forEach(function (room) {
      if (!room || room._closed || typeof room._rotateIceCredentials !== "function") return;
      room._rotateIceCredentials().catch(function (error) {
        room._warn(
          "ICE 凭证轮换失败",
          (error && error.message) || "将在连接失败时自动重试",
        );
      });
    });
  };

  VibeSDK.prototype._ensureIceServers = function () {
    var self = this;
    if (!this.token) return Promise.resolve(this._iceServers);
    if (
      this._turnExpiresAt > Date.now() + TURN_REFRESH_MARGIN_MS &&
      this._turnStatus.available
    ) {
      return Promise.resolve(this._iceServers);
    }
    if (this._turnLoadPromise) return this._turnLoadPromise;

    var previousServers = this._iceServers.slice();
    var previousExpiresAt = this._turnExpiresAt;
    var previousStatus = Object.assign({}, this._turnStatus);
    var previousUsername = null;
    previousServers.some(function (server) {
      if (!server || !server.username) return false;
      previousUsername = server.username;
      return true;
    });
    this._turnLoadPromise = this._fetch("/api/sdk/turn")
      .then(function (result) {
        var servers = result && Array.isArray(result.iceServers) ? result.iceServers : [];
        if (!servers.length || !servers[0].username || !servers[0].credential) {
          throw new Error("服务器中继凭证响应无效");
        }
        var transports = [];
        servers.forEach(function (server) {
          var urls = Array.isArray(server.urls) ? server.urls : [server.urls];
          urls.forEach(function (url) {
            var match = /[?&]transport=([^&]+)/.exec(url || "");
            var transport =
              match && match[1]
                ? match[1].toLowerCase()
                : /^turns:/i.test(url || "")
                  ? "tls"
                  : null;
            if (transport && transports.indexOf(transport) < 0) transports.push(transport);
          });
        });
        self._iceServers = BASE_ICE_SERVERS.concat(servers);
        self._turnExpiresAt =
          typeof result.expiresAt === "number" ? result.expiresAt : Date.now() + 5 * 60 * 1000;
        self._turnStatus = {
          configured: true,
          available: true,
          expiresAt: self._turnExpiresAt,
          transports: transports,
          error: null,
        };
        self._scheduleTurnRefresh();
        var nextUsername = servers[0] && servers[0].username;
        if (previousUsername && nextUsername && previousUsername !== nextUsername) {
          self._turnRefreshCount++;
          self._lastTurnRefreshAt = Date.now();
          self._rotateActiveRoomIce();
        }
        return self._iceServers;
      })
      .catch(function (error) {
        var errorMessage = error && error.message ? error.message : "服务器中继凭证获取失败";
        if (previousStatus.available && previousExpiresAt > Date.now()) {
          self._iceServers = previousServers;
          self._turnExpiresAt = previousExpiresAt;
          self._turnStatus = Object.assign({}, previousStatus, { error: errorMessage });
          self._scheduleTurnRefresh(TURN_REFRESH_RETRY_MS);
        } else {
          self._iceServers = BASE_ICE_SERVERS.slice();
          self._turnExpiresAt = 0;
          self._turnStatus = {
            configured: false,
            available: false,
            expiresAt: null,
            transports: [],
            error: errorMessage,
          };
          if (self.token) self._scheduleTurnRefresh(TURN_REFRESH_RETRY_MS);
        }
        if (global.console && global.console.warn) {
          global.console.warn(
            "[VibeHub] TURN 服务器兜底暂不可用，继续尝试 P2P/VibeNet:",
            self._turnStatus.error,
          );
        }
        return self._iceServers;
      })
      .finally(function () {
        self._turnLoadPromise = null;
      });
    return this._turnLoadPromise;
  };

  VibeSDK.prototype.diagnostics = function () {
    return {
      auth: {
        loggedIn: !!this.user,
        expiresAt: this._authExpiresAt || null,
        refreshCount: this._authRefreshCount,
        lastRefreshAt: this._lastAuthRefreshAt,
        lastRefreshError: this._lastAuthRefreshError,
      },
      serverRelay: Object.assign(this._turnDiagnostics(false), {
        refreshCount: this._turnRefreshCount,
        lastRefreshAt: this._lastTurnRefreshAt,
      }),
      activeRooms: this._activeRooms.length,
    };
  };

  VibeSDK.prototype._captureHashToken = function () { var m = /[#&]token=([^&]+)/.exec(global.location.hash || ""); if (m) { try { global.history.replaceState(null, "", global.location.pathname + global.location.search); } catch (e) {} return decodeURIComponent(m[1]); } return null; };
  VibeSDK.prototype.login = function () {
    var self = this, t = this._captureHashToken();
    if (this.token && this.user) return Promise.resolve(this.user);
    this._authGeneration++;
    if (t) {
      var generation = this._authGeneration;
      this._acceptToken(t);
      return this._fetch("/api/sdk/me").then(function (u) {
        if (generation !== self._authGeneration) throw new Error("登录已取消");
        try { global.localStorage.removeItem(self._logoutStorageKey); } catch (e) {}
        self.user = u;
        self._emitAuth();
        return u;
      });
    }
    return global.crossOriginIsolated && global.crypto && global.crypto.subtle
      ? this._isolatedLogin()
      : this._popupLogin();
  };
  VibeSDK.prototype._isolatedLogin = function () {
    var self = this;
    var generation = this._authGeneration;
    function randomBase64Url(size) {
      var random = new Uint8Array(size);
      global.crypto.getRandomValues(random);
      var value = Array.prototype.map.call(random, function (byte) {
        return String.fromCharCode(byte);
      }).join("");
      return global.btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    var verifier = randomBase64Url(32);
    var intentId = randomBase64Url(24);
    var authorizeUrl = self.apiBase + "/connect?work=" + encodeURIComponent(self.work) +
      "&intent=" + encodeURIComponent(intentId);
    // 必须在 login() 的用户手势内直接打开最终 URL。隔离 iframe 中 COOP 可能让
    // window.open() 在窗口已创建时仍返回 null，因此 intent 流程不能依赖 WindowProxy。
    var win = global.open(authorizeUrl, "vibehub_login", "width=520,height=640");
    var encoded = new global.TextEncoder().encode(verifier);
    function accept(data, resolve, reject) {
      if (generation !== self._authGeneration) { reject(new Error("登录已取消")); return; }
      self._acceptToken(data.token, data.expiresAt);
      self._fetch("/api/sdk/me").then(function (user) {
        if (generation !== self._authGeneration) throw new Error("登录已取消");
        try { global.localStorage.removeItem(self._logoutStorageKey); } catch (e) {}
        self.user = user;
        self._emitAuth();
        resolve(user);
      }).catch(function (error) {
        if (generation === self._authGeneration) self._invalidateAuth(false);
        reject(error);
      });
    }
    return new Promise(function (resolve, reject) {
      var deadline = Date.now() + 5 * 60 * 1000;
      global.crypto.subtle.digest("SHA-256", encoded).then(function (digest) {
        var challengeBytes = new Uint8Array(digest);
        var challenge = Array.prototype.map.call(challengeBytes, function (byte) {
          return String.fromCharCode(byte);
        }).join("");
        challenge = global.btoa(challenge).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        return fetch(self.apiBase + "/api/game-auth/intents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work: self.work, challenge: challenge, intentId: intentId }),
        });
      }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (!response.ok || !(data && data.intentId === intentId)) {
            throw new Error((data && data.error) || "无法创建登录请求");
          }
          function poll() {
            if (generation !== self._authGeneration) {
              try { if (win) win.close(); } catch (e) {}
              reject(new Error("登录已取消")); return;
            }
            if (Date.now() >= deadline) {
              reject(new Error("登录超时"));
              return;
            }
            fetch(self.apiBase + "/api/game-auth/intents/" + encodeURIComponent(data.intentId) + "/claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ verifier: verifier }),
            }).then(function (claimResponse) {
              return claimResponse.json().catch(function () { return null; }).then(function (claim) {
                if (claimResponse.status === 202) {
                  setTimeout(poll, 1000);
                  return;
                }
                if (!claimResponse.ok || !(claim && claim.token)) {
                  throw new Error((claim && claim.error) || "登录请求已失效");
                }
                try { if (win) win.close(); } catch (e) {}
                accept(claim, resolve, reject);
              });
            }).catch(reject);
          }
          poll();
        });
      }).catch(function (error) {
        try { if (win) win.close(); } catch (e) {}
        reject(error);
      });
    });
  };
  VibeSDK.prototype._popupLogin = function () {
    var self = this;
    var generation = this._authGeneration;
    var random = new Uint8Array(18);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(random);
    else for (var i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 256);
    var state = Array.prototype.map.call(random, function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    var r = global.location.origin + global.location.pathname + global.location.search;
    var url = this.apiBase + "/connect?work=" + encodeURIComponent(this.work) +
      "&redirect=" + encodeURIComponent(r) + "&state=" + encodeURIComponent(state);
    var win = global.open(url, "vibehub_login", "width=520,height=640");
    if (!win) return Promise.reject(new Error("请允许弹窗以完成登录"));
    return new Promise(function (resolve, reject) {
      var done = false;
      function clean() { global.removeEventListener("message", onMsg); clearInterval(civ); clearTimeout(tov); }
      function ok(t, expiresAt) {
        if (done) return;
        done = true;
        clean();
        if (generation !== self._authGeneration) { reject(new Error("登录已取消")); return; }
        self._acceptToken(t, expiresAt);
        self._fetch("/api/sdk/me").then(function (u) {
          if (generation !== self._authGeneration) throw new Error("登录已取消");
          try { global.localStorage.removeItem(self._logoutStorageKey); } catch (e) {}
          self.user = u;
          self._emitAuth();
          resolve(u);
        }).catch(function (error) {
          if (generation === self._authGeneration) self._invalidateAuth(false);
          reject(error);
        });
      }
      function onMsg(e) {
        if (
          e.source === win &&
          e.origin === self.apiBase &&
          e.data &&
          e.data.type === "vibehub:token" &&
          e.data.state === state &&
          e.data.token
        ) ok(e.data.token, e.data.expiresAt);
      }
      global.addEventListener("message", onMsg);
      var civ = setInterval(function () { if ((win.closed || generation !== self._authGeneration) && !done) { done = true; clean(); try { win.close(); } catch (e) {} reject(new Error("已取消登录")); } }, 500);
      var tov = setTimeout(function () { if (!done) { done = true; clean(); reject(new Error("登录超时")); } }, 5 * 60 * 1000);
    });
  };

  VibeSDK.prototype._data = function (scope, roomId, ensureAccess) {
    var self = this;
    function qs(ns, key) { var q = "?scope=" + scope + "&ns=" + encodeURIComponent(ns || "default"); if (scope === "room") q += "&room=" + encodeURIComponent(roomId); if (key) q += "&key=" + encodeURIComponent(key); return q; }
    function cacheScope() { return self._cacheScope(scope, roomId); }
    function ready() {
      return typeof ensureAccess === "function" ? ensureAccess() : Promise.resolve();
    }
    function roomHeaders() {
      var roomToken = scope === "room" ? self._roomTokens[roomId] : null;
      return roomToken ? { "X-Vibe-Room": roomToken } : {};
    }
    return {
      set: function (k, v, ns, opts) {
        if (ns && typeof ns === "object" && !Array.isArray(ns) && opts === undefined) {
          opts = ns;
          ns = "default";
        }
        ns = ns || "default";
        var body = { value: v };
        if (opts && typeof opts.ttl === "number") body.ttl = opts.ttl;
        return ready()
          .then(function () {
            return self._fetch("/api/sdk/data" + qs(ns, k), {
              method: "PUT",
              headers: roomHeaders(),
              body: JSON.stringify(body),
            });
          })
          .then(function (result) {
            var ttl = opts && typeof opts.ttl === "number" ? Math.max(0, Math.floor(opts.ttl)) : (scope === "room" ? 86400 : 0);
            var expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : null;
            clientCache.set(cacheScope(), ns, k, v, expiresAt);
            return result;
          });
      },
      get: function (k, ns) {
        ns = ns || "default";
        if (typeof k === "string") {
          var cached = clientCache.get(cacheScope(), ns, k);
          if (cached !== null) return Promise.resolve(cached);
          return ready()
            .then(function () {
              return self._fetch("/api/sdk/data" + qs(ns, k), { headers: roomHeaders() });
            })
            .then(function (r) {
              if (r.value !== null && r.value !== undefined) clientCache.set(cacheScope(), ns, k, r.value, r.expiresAt || null);
              return r.value;
            });
        }
        // Batch get: array of keys
        if (Array.isArray(k)) {
          var keysStr = k.join(",");
          return ready()
            .then(function () {
              return self._fetch("/api/sdk/data" + qs(ns) + "&keys=" + encodeURIComponent(keysStr), { headers: roomHeaders() });
            })
            .then(function (r) {
              var batchData = r.data || {};
              var expirations = r.expiresAt || {};
              for (var key in batchData) {
                if (Object.prototype.hasOwnProperty.call(batchData, key)) {
                  clientCache.set(cacheScope(), ns, key, batchData[key], expirations[key] || null);
                }
              }
              return batchData;
            });
        }
        return Promise.reject(new Error("get() 需要字符串 key 或字符串数组"));
      },
      all: function (ns) {
        return ready()
          .then(function () {
            return self._fetch("/api/sdk/data" + qs(ns), { headers: roomHeaders() });
          })
          .then(function (r) { return r.data; });
      },
      remove: function (k, ns) {
        ns = ns || "default";
        return ready()
          .then(function () {
            return self._fetch("/api/sdk/data" + qs(ns, k), {
              method: "DELETE",
              headers: roomHeaders(),
            });
          })
          .then(function (result) {
            clientCache.del(cacheScope(), ns, k);
            return result;
          });
      },
    };
  };
  Object.defineProperty(VibeSDK.prototype, "save", { get: function () { return this._data("player"); } });
  Object.defineProperty(VibeSDK.prototype, "global", { get: function () { return this._data("global"); } });
  Object.defineProperty(VibeSDK.prototype, "rooms", {
    get: function () {
      var self = this;
      return {
        list: function () { return self._fetch("/api/sdk/rooms").then(function (r) { return r.rooms; }); },
        get: function (rid) { return self._fetch("/api/sdk/rooms?room=" + encodeURIComponent(rid)).then(function (r) { return r.room; }); },
        quickJoin: function (opts) {
          return self.rooms.list().then(function (rooms) {
            for (var i = 0; i < rooms.length; i++) { var r = rooms[i]; if (r.open === false) continue; if (r.max && r.players >= r.max) continue; if (opts && opts.filter && !opts.filter(r)) continue; return r.roomId; }
            return null;
          });
        },
      };
    },
  });
  Object.defineProperty(VibeSDK.prototype, "room", {
    get: function () {
      var self = this;
      return {
        join: function (rid, opts) { var top = (opts && opts.topology) || "host"; var room = new Room(self, rid, top, opts); return room._start(); },
      };
    },
  });

  global.VibeHub = {
    version: "3.7.0",
    channel: detectReleaseChannel(),
    init: function (opts) {
      opts = opts || {};
      if (!opts.work || typeof opts.work !== "string") return Promise.reject(new Error("[VibeHub] init({ work }) 需要作品 slug"));
      var sdk = new VibeSDK(opts);
      ensureVibeNetContributor(sdk.apiBase).catch(function (error) {
        if (global.console && global.console.warn) global.console.warn(error.message);
      });
      var token = sdk._captureHashToken();
      if (!token) return opts.autoLogin === false ? Promise.resolve(sdk) : sdk._restoreAuth().then(function () { return sdk; });
      sdk._acceptToken(token);
      return sdk._fetch("/api/sdk/me").then(function (user) {
        try { global.localStorage.removeItem(sdk._logoutStorageKey); } catch (e) {}
        sdk.user = user;
        sdk._emitAuth();
        return sdk;
      }).catch(function (error) {
        sdk._invalidateAuth(false);
        throw error;
      });
    },
  };
  // expose for testing
  global.__VibeHubInternals = {
    RelayScorer: RelayScorer,
    ReceiveWindow: ReceiveWindow,
    _packRelayWire: packRelayWire,
    _unpackRelayWire: unpackRelayWire,
    // P0/P1
    StateManager: StateManager,
    SnapshotInterp: SnapshotInterp,
    Room: Room,
    VibeSDK: VibeSDK,
    _parseRetryAfterMs: parseRetryAfterMs,
    _signalPollRetryMs: signalPollRetryMs,
    _cache: clientCache,
  };
})(typeof window !== "undefined" ? window : this);
