'use strict';
// =====================================================================
// VibeHub Workshop · 游戏侧 Mod API
// ---------------------------------------------------------------------
// 这是 Mod 与游戏之间的**唯一稳定接触面**。所有 mod 通过
// `window.VibeHubGame.modApi.xxx()` 访问, 不依赖私有 DOM/全局内部符号。
//
// 设计原则 (与项目"扩展模式 = 包裹式"一致):
//   · Mod 在 beforeStart 阶段调用注册函数, 把数据/钩子塞进游戏的注册表
//   · Mod 在 afterStart 阶段绑定运行时事件(伤害/击杀/局末), 不修改游戏代码
//   · 所有注册表按 ID 去重, 后注册覆盖先注册
//   · 不暴露: localStorage / 物理引擎 / 导航网格 / 武器 3D 模型 / 网络层
//
// 加载位置: 所有游戏脚本加载完之后, Workshop Loader 之前
//          (即 index.html 里把它放在 js/32_boot.js 后面)
// =====================================================================

(function(){
  if(window.VibeHubGame && window.VibeHubGame.__workshop) return;
  const game = window.VibeHubGame = window.VibeHubGame || {};
  game.__workshop = true;

  // -------------------------------------------------------------------
  // 内部: 简易事件总线
  // -------------------------------------------------------------------
  const _bus = (function(){
    const listeners = new Map();
    return {
      on(event, fn){
        if(typeof fn !== 'function') return () => {};
        if(!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return () => listeners.get(event).delete(fn);
      },
      off(event, fn){
        const s = listeners.get(event); if(s && fn) s.delete(fn);
      },
      emit(event, payload){
        const s = listeners.get(event); if(!s) return;
        // 拷贝一份后再迭代, 允许监听器内 off 自己
        for(const fn of Array.from(s)){
          try { fn(payload); } catch(err){ console.error('[workshop] handler', event, err); }
        }
      },
      list(){ return Array.from(listeners.keys()); }
    };
  })();

  // -------------------------------------------------------------------
  // 内部: 通用注册表 { id -> value }, 后注册覆盖
  // -------------------------------------------------------------------
  function makeReg(){
    const map = new Map();
    return {
      set(id, value){ if(typeof id === 'string' && id) map.set(id, value); },
      get(id){ return map.get(id); },
      has(id){ return map.has(id); },
      delete(id){ return map.delete(id); },
      entries(){ return Array.from(map.entries()); },
      ids(){ return Array.from(map.keys()); }
    };
  }
  const _weaponReg  = makeReg();   // 注册的新武器 (写入 WPN_DEFS)
  const _botTplReg  = makeReg();   // 注册的 NPC 模板 (注入到 applyPrestigeBot)
  const _campReg    = makeReg();   // 注册的新地图 (追加到 CAMPAIGNS)
  const _modelReg   = makeReg();   // 注册的玩家模型覆盖
  const _damageHooks = [];          // (amount, attacker, target, info) -> number | undefined
  const _fireHooks   = [];          // (def, shooter, origin, dir) -> def | undefined

  // -------------------------------------------------------------------
  // 1. 武器 (新建 / 修改 / 读取)
  // -------------------------------------------------------------------
  const weapons = {
    /** 注册或覆盖一把武器。返回原 def, 失败返回 null。
     *  def 字段参考 WPN_DEFS 既有键 (dmg/headMul/rpm/mag/spreadAds/recoil/adsFov 等)。
     *  type: 'auto'|'semi'|'bolt'; snd: 'rifle'|'smg'|'mg'|'sniper'|'pistol'|'cannon' */
    register(key, def){
      if(typeof key !== 'string' || !key) return null;
      if(!def || typeof def !== 'object') return null;
      if(typeof WPN_DEFS === 'undefined') return null;
      const prev = WPN_DEFS[key];
      // 浅合并: 原值优先, 但允许覆盖; 缺失 name 用 key
      const merged = Object.assign({ name: key }, prev || {}, def);
      WPN_DEFS[key] = merged;
      _weaponReg.set(key, merged);
      _bus.emit('weapon:registered', { key, def: merged, replaced: !!prev });
      return prev || null;
    },
    /** 读取 (无副作用) */
    get(key){ return typeof WPN_DEFS !== 'undefined' ? WPN_DEFS[key] : undefined; },
    /** 列出 mod 自注册的 id (不包括游戏原生的) */
    listModded(){ return _weaponReg.ids(); },
    /** 列出所有当前可用武器 key */
    listAll(){ return typeof WPN_DEFS !== 'undefined' ? Object.keys(WPN_DEFS) : []; }
  };

  // -------------------------------------------------------------------
  // 2. NPC / Bot (修复 NPC 行为 / 难度)
  // -------------------------------------------------------------------
  const npcs = {
    /** 注册一个 Bot 模板, 会被注入到所有敌方 Bot 的 spawn 流程里。
     *  template: {
     *    id: 'heavy_scout',
     *    match: (bot, ctx) => boolean,   // 可选; 默认对所有敌方 Bot 生效
     *    hpMul: number,                  // 血量倍率
     *    reactMul: number,               // 反应倍率 (<1 = 更快)
     *    sprMul: number,                 // 散布倍率 (<1 = 更准)
     *    visMul: number,                 // 视野倍率
     *    dmgMul: number,                 // 受伤倍率 (<1 = 更抗揍)
     *    weapon: string,                 // 强制使用 WPN_DEFS[key]
     *    namePrefix: string,             // 名字前缀
     *  }
     *  多个模板都对一个 bot 生效时, 数值按"相乘"叠加。 */
    register(template){
      if(!template || typeof template !== 'object') return false;
      const id = String(template.id || '').trim();
      if(!id) return false;
      _botTplReg.set(id, Object.assign({ id }, template));
      _bus.emit('npc:registered', { id });
      return true;
    },
    remove(id){ return _botTplReg.delete(id); },
    list(){ return _botTplReg.ids(); },
    /** 只读快照: 当前所有 bot 数组 (不要直接修改) */
    snapshot(){ return (typeof combatants !== 'undefined' ? combatants : []).slice(); },
    /** 给单个 bot 应用 mod 模板 (若模板有 match 则按 match 过滤) */
    applyTo(bot){
      if(!bot || bot.__player) return;
      const ctx = { source: 'mod' };
      for(const [, tpl] of _botTplReg.entries()){
        try{
          if(tpl.match && !tpl.match(bot, ctx)) continue;
          if(isFinite(tpl.hpMul))    bot.hpMul    = (bot.hpMul    || 1) * tpl.hpMul;
          if(isFinite(tpl.reactMul)) bot.reactMul = (bot.reactMul || 1) * tpl.reactMul;
          if(isFinite(tpl.sprMul))   bot.sprMul   = (bot.sprMul   || 1) * tpl.sprMul;
          if(isFinite(tpl.visMul))   bot.visMul   = (bot.visMul   || 1) * tpl.visMul;
          if(isFinite(tpl.dmgMul))   bot.dmgMul   = (bot.dmgMul   || 1) * tpl.dmgMul;
          if(tpl.weapon && typeof WPN_DEFS !== 'undefined' && WPN_DEFS[tpl.weapon]){
            bot.customWeapon = tpl.weapon;
          }
          if(typeof tpl.namePrefix === 'string' && bot.name){
            bot.name = tpl.namePrefix + bot.name;
          }
        } catch(err){ console.error('[workshop] applyTo', id, err); }
      }
      bot.__modScaled = true;
    }
  };

  // 包裹既有 applyPrestigeBot, 让 mod 注入成为最外层 (与 39/41/43/45 同构)
  if(typeof applyPrestigeBot === 'function'){
    const _orig = applyPrestigeBot;
    applyPrestigeBot = function(bot){
      const r = _orig.apply(this, arguments);
      try { npcs.applyTo(bot); } catch(err){ console.error('[workshop] applyPrestigeBot', err); }
      return r;
    };
  } else {
    // 没找到时降级: mod 仍然可以在 afterStart 阶段手动遍历 combatants 调 npcs.applyTo
    applyPrestigeBot = function(bot){ npcs.applyTo(bot); };
  }

  // -------------------------------------------------------------------
  // 3. 地图 / 关卡
  // -------------------------------------------------------------------
  const maps = {
    /** 注册一张新地图。def 字段参考 CAMPAIGNS[0] 的形状。
     *  必填: id, title, modeName, layout, terr, theme, f, mapSize, bases[], extract[]
     *  可选: mode, atk, flags, roads, trench, mapName, mapTag, mapDesc,
     *        mapLoot, mapThreat, mapDiff, enemyBots, botMul
     *  注册后会追加到 CAMPAIGNS 末尾, 用户在部署界面可选。 */
    register(def){
      if(!def || typeof def !== 'object') return null;
      if(typeof def.id !== 'string' || !def.id) return null;
      if(typeof CAMPAIGNS === 'undefined') return null;
      const idx = CAMPAIGNS.findIndex(c => c.id === def.id);
      const merged = Object.assign({
        title: def.id, sub: '', mode: 'extract', f: ['usec','pmc'],
        flags: [], bases: [{x:-72,z:0},{x:72,z:0}], roads: [], trench: [],
        sineRoad: false
      }, def);
      if(idx >= 0){ CAMPAIGNS[idx] = merged; }
      else { CAMPAIGNS.push(merged); }
      _campReg.set(def.id, merged);
      _bus.emit('map:registered', { id: def.id, def: merged });
      return merged;
    },
    list(){ return typeof CAMPAIGNS !== 'undefined' ? CAMPAIGNS.slice() : []; },
    /** 不重新加载直接切换当前地图 (会触发页面刷新让 01_data 重建布局)。
     *  需要 localStorage 可写。返回写入的 sf_campaign 值, 失败返回 null。 */
    select(idOrIdx){
      try {
        if(typeof CAMPAIGNS === 'undefined') return null;
        let idx = (typeof idOrIdx === 'number')
          ? idOrIdx
          : CAMPAIGNS.findIndex(c => c.id === idOrIdx);
        if(idx < 0 || idx >= CAMPAIGNS.length) return null;
        localStorage.setItem('sf_campaign', String(idx));
        return idx;
      } catch(err){ return null; }
    }
  };

  // -------------------------------------------------------------------
  // 4. 玩家模型 / 伤害
  // -------------------------------------------------------------------
  const playerApi = {
    /** 读取玩家对象的"只读快照"。Mod 不应直接修改返回对象, 走 hooks 才稳定。 */
    snapshot(){
      if(typeof player === 'undefined') return null;
      return {
        hp: player.hp, alive: player.alive, team: player.team, cls: player.cls,
        pos: player.pos ? { x: player.pos.x, y: player.pos.y, z: player.pos.z } : null,
        limbs: player.limbs ? Object.assign({}, player.limbs) : null,
        maxHp: player.maxHp || 100,
        armorResist: player.armorResist || 0,
        helmetKey: player.helmetKey || '',
        helmetResist: player.helmetResist || 0,
        helmetDur: player.helmetDur || 0,
        helmetKey: player.helmetKey || '',
        helmetResist: player.helmetResist || 0,
        helmetDur: player.helmetDur || 0
      };
    },
    /** 给自己加血 (Mod 直接生效, 不参与公式)。返回实际加上的值。 */
    heal(amount){
      if(typeof player === 'undefined' || !player.alive) return 0;
      const max = player.maxHp || 100;
      const before = player.hp;
      player.hp = Math.min(max, player.hp + amount);
      for(const k in player.limbs){ player.limbs[k] = Math.min(100, player.limbs[k] + amount); }
      return player.hp - before;
    },
    /** 注册玩家视觉模型覆盖。
     *  opts: { skinColor, coatColor, pantsColor, helmColor }
     *  通过 modApi 后面的 applyPlayerModel 在合适的时机应用一次。 */
    setVisual(opts){
      if(!opts || typeof opts !== 'object') return false;
      const id = opts.id || ('mod_' + (++playerApi._vid));
      _modelReg.set(id, Object.assign({ id }, opts));
      return id;
    },
    _vid: 0,
    /** 在 player 存在后调用一次, 应用所有 setVisual 注册的覆盖 (按 id 顺序叠加) */
    applyVisuals(){
      if(typeof player === 'undefined') return false;
      const F = (typeof TEAM_FACTION !== 'undefined' && TEAM_FACTION[player.team]) || {};
      let merged = {};
      for(const [, o] of _modelReg.entries()){
        merged = Object.assign(merged, o);
      }
      if(isFinite(merged.skinColor))  player.skinColor  = merged.skinColor;
      if(isFinite(merged.coatColor))  player.coatColor  = merged.coatColor;
      if(isFinite(merged.pantsColor)) player.pantsColor = merged.pantsColor;
      if(isFinite(merged.helmColor))  player.helmColor  = merged.helmColor;
      player.__modVisual = merged.id || true;
      return true;
    },
    /** 注册伤害钩子。fn(amount, attacker, target, info) -> number | undefined。
     *  返回新值时改写伤害, 返回 undefined 时透传。info = { isHead, part, isPlayer }。 */
    hookDamage(fn){
      if(typeof fn !== 'function') return false;
      _damageHooks.push(fn);
      return true;
    },
    /** 注册子弹钩子 (修改 WPN_DEFS[].dmg 或其他属性, 优先级高于 WPN_DEFS 原值)。
     *  fn(def, shooter, origin, dir) -> def | undefined。返回新 def 时改写。 */
    hookFireBullet(fn){
      if(typeof fn !== 'function') return false;
      _fireHooks.push(fn);
      return true;
    }
  };

  // 包裹 player.damage 注入 mod 伤害钩子
  if(typeof player !== 'undefined' && typeof player.damage === 'function'){
    const _origDmg = player.damage;
    player.damage = function(amt, attacker, isHead, part){
      let cur = amt;
      const info = { isHead: !!isHead, part: part || (isHead?'head':'torso'), isPlayer: true };
      for(const fn of _damageHooks){
        try {
          const r = fn(cur, attacker, this, info);
          if(isFinite(r)) cur = r;
        } catch(err){ console.error('[workshop] hookDamage', err); }
      }
      _bus.emit('damage', { amount: cur, attacker, target: this, info });
      return _origDmg.call(this, cur, attacker, isHead, part);
    };
  }

  // 包裹 fireBullet 注入 mod 子弹钩子
  if(typeof fireBullet === 'function'){
    const _origFire = fireBullet;
    fireBullet = function(shooter, origin, dir, def, visMuzzle){
      let cur = def;
      for(const fn of _fireHooks){
        try {
          const r = fn(cur, shooter, origin, dir);
          if(r && typeof r === 'object') cur = r;
        } catch(err){ console.error('[workshop] hookFireBullet', err); }
      }
      return _origFire.call(this, shooter, origin, dir, cur, visMuzzle);
    };
  }

  // -------------------------------------------------------------------
  // 5. 通用事件 (afterStart 之后订阅)
  // -------------------------------------------------------------------
  const events = {
    on: _bus.on.bind(_bus),
    off: _bus.off.bind(_bus),
    /** 主动广播一个事件 (其他 mod 可以订阅) */
    emit: _bus.emit.bind(_bus),
    /** 列出平台已注册的事件类型 (用于文档同步) */
    list(){
      return [
        'weapon:registered',
        'npc:registered',
        'map:registered',
        'damage',
        'kill',
        'round:start',
        'round:end',
        'extract',
        'death'
      ];
    }
  };

  // 暴露: 击杀 / 局末 / 死亡 等运行时事件 (包裹既有逻辑, 不假设内部调用点)
  // - 击杀: 23_player.die 写入 addKillfeed 的位置 -> 我们改在 _bus.emit kill
  // - 局末: 35_extraction / 38_tarkov 等处用 finishRaid 标记
  // 由于事件分散, 我们提供"声明式订阅": mod 在 afterStart 阶段可定时轮询
  // 或者通过 hookDamage(已实现) + 包装 addKillfeed / finishRaid 来订阅。
  // 这里做最小实现: 暴露 addKillfeed / finishRaid 包裹, 让订阅者拿到 kill / roundEnd。
  if(typeof addKillfeed === 'function'){
    const _origAdd = addKillfeed;
    addKillfeed = function(attacker, victim, isHead){
      try { _bus.emit('kill', { attacker, victim, isHead: !!isHead }); } catch(err){}
      return _origAdd.apply(this, arguments);
    };
  }
  if(typeof finishRaid === 'function'){
    const _origFin = finishRaid;
    finishRaid = function(){
      try { _bus.emit('round:end', { reason: 'finished' }); } catch(err){}
      return _origFin.apply(this, arguments);
    };
  }

  // -------------------------------------------------------------------
  // 6. 玩家玩家死亡 (提取自 player.die 已包裹)
  // -------------------------------------------------------------------
  if(typeof player !== 'undefined' && typeof player.die === 'function'){
    const _origDie = player.die;
    player.die = function(attacker, isHead){
      try { _bus.emit('death', { attacker, isHead: !!isHead, target: this }); } catch(err){}
      return _origDie.apply(this, arguments);
    };
  }

  // -------------------------------------------------------------------
  // 7. 公共注册: 把 modApi 挂到 window.MyGame (兼容示例命名) + VibeHubGame.modApi
  // -------------------------------------------------------------------
  const modApi = {
    version: '1.0.0',
    /** 当前游戏的全局命名空间引用, 用于"读多写少"的内部数据。
     *  Mod 应优先使用具名注册函数, 不要直接改这里的对象。 */
    refs: {
      get WPN_DEFS(){ return typeof WPN_DEFS !== 'undefined' ? WPN_DEFS : undefined; },
      get CAMPAIGNS(){ return typeof CAMPAIGNS !== 'undefined' ? CAMPAIGNS : undefined; },
      get FACTIONS(){ return typeof FACTIONS !== 'undefined' ? FACTIONS : undefined; },
      get ELO(){ return typeof ELO !== 'undefined' ? ELO : undefined; }
    },
    weapons, npcs, maps, player: playerApi, events,
    /** 游戏启动阶段常量 */
    phase: {
      /** Loader 完成 beforeStart 后, 此值变为 true */
      get ready(){ return !!game.__ready; },
      /** 监听 ready 变更 (Mod 可在 beforeStart 阶段预订) */
      onReady(fn){
        if(game.__ready) try{ fn(); }catch(err){}
        else _bus.on('__ready__', fn);
      }
    },
    /** 工具: 安全地把字符串 id 转成 WPN_DEFS / FACTIONS 键, 给错误信息 */
    util: {
      isWeaponKey(k){ return typeof WPN_DEFS !== 'undefined' && !!WPN_DEFS[k]; },
      isFaction(k){ return typeof FACTIONS !== 'undefined' && !!FACTIONS[k]; }
    }
  };
  game.modApi = modApi;
  // 兼容 Loader 示例里的命名
  window.MyGame = game;
  // 标 markGameReady 用
  game.__ready = false;
  Object.defineProperty(game, '__ready', {
    configurable: true, get(){ return game.__markReadyCalled; }
  });

  // 备用: 让 modApi 引用稳定
  game.modApi = modApi;
  window.VibeHubGame = game;
})();
