// ===== 药品轮盘 (2026-09-16) =====
// 按 B 打开, 列出身上所有可用的药品, 选一种直接使用。
//
// 为什么是"方向选格 + 左键确认"而不是鼠标点格子:
//   桌面端游戏过程中指针是**锁定**的(document.pointerLockElement === canvas),
//   没有可见光标, 鼠标事件全部指向锁定的 canvas —— DOM 元素的 hover/click 根本收不到。
//   所以走战地式操作: movementX/Y 的合成方向落在哪个扇区就选中哪个, 左键确认, 右键取消。
//   手机端没有指针锁定, 直接点格子即可(触控层被 z-index 60 的全屏遮罩挡住, 不会误触)。
//
// 药品数据源 = 局内背包 RUN.loot 里的 MED_DEFS;
// 使用走 40_raidshop 的 useLootFromBag() → 扣物品 / 任务计数 / 经验值全部自动生效,
// 不需要任何新字段。
'use strict';
const MEDWHEEL = { open: false, sel: 0, keys: [], ax: 0, ay: 0 };

function medWheelIsOpen() { return MEDWHEEL.open; }

// 身上"现在能用"的药品(局内背包里的)
function medWheelKeys() {
  const ks = (typeof bagEntryKeys === 'function') ? bagEntryKeys() : Object.keys((typeof RUN !== 'undefined' && RUN.loot) || {});
  return ks.filter(k => MED_DEFS[k] && (RUN.loot[k] || 0) > 0);
}

function medWheelRadius() {
  return Math.max(78, Math.min(168, Math.min(innerWidth, innerHeight) * 0.34));
}

function medWheelRender() {
  const ring = el('mwRing');
  if (!ring) return;
  const ks = MEDWHEEL.keys, n = ks.length;
  if (MEDWHEEL.sel >= n) MEDWHEEL.sel = Math.max(0, n - 1);
  const r = medWheelRadius();
  let h = '';
  for (let i = 0; i < n; i++) {
    const k = ks[i];
    const a = -Math.PI / 2 + i * Math.PI * 2 / n;   // 从正上方开始, 顺时针
    const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
    h += `<div class="mwItem${i === MEDWHEEL.sel ? ' sel' : ''}" data-mwk="${encodeURIComponent(k)}"`
      + ` style="transform:translate(-50%,-50%) translate(${x}px,${y}px)">`
      + `<div class="mwIco">${itemIconOf(k)}</div>`
      + `<div class="mwName">${itemLabel(k)}</div>`
      + `<div class="mwQty">×${RUN.loot[k] || 0}</div>`
      + `</div>`;
  }
  ring.innerHTML = h;
  const sel = ks[MEDWHEEL.sel];
  el('mwTitle').textContent = '药 品 · ' + n + ' 种';
  el('mwSub').textContent = sel ? (((MED_DEFS[sel] && MED_DEFS[sel].desc) || '') + ' · 持有 ' + (RUN.loot[sel] || 0)) : '';
}

function openMedWheel() {
  if (MEDWHEEL.open) return false;
  const p = (typeof player !== 'undefined') ? player : null;
  if (!p || !p.alive || !p.deployed || (typeof matchOver !== 'undefined' && matchOver)) return false;
  if (p.onMG || p.onAT || p.onAA || (typeof handsFreeVeh === 'function' && !handsFreeVeh())) {
    if (typeof showScorePop === 'function') showScorePop('当前姿态无法使用药品');
    return false;
  }
  const ks = medWheelKeys();
  if (!ks.length) { if (typeof showScorePop === 'function') showScorePop('身上没有可用的药品'); return false; }
  MEDWHEEL.keys = ks; MEDWHEEL.sel = 0; MEDWHEEL.ax = 0; MEDWHEEL.ay = 0; MEDWHEEL.open = true;
  medWheelRender();
  const root = el('medWheel'); if (root) root.classList.remove('hidden');
  if (typeof AudioSys !== 'undefined' && AudioSys.click) AudioSys.click(1100, 0.12, 0.04);
  return true;
}

function closeMedWheel() {
  if (!MEDWHEEL.open) return;
  MEDWHEEL.open = false;
  MEDWHEEL.ax = 0; MEDWHEEL.ay = 0;
  const root = el('medWheel'); if (root) root.classList.add('hidden');
}

function toggleMedWheel() { if (MEDWHEEL.open) closeMedWheel(); else openMedWheel(); }

// 鼠标方向选格: 把 movementX/Y 做一次指数平滑(单帧位移可能很小), 再按扇区取整
function medWheelAim(mx, my) {
  if (!MEDWHEEL.open) return;
  const n = MEDWHEEL.keys.length;
  if (n <= 1) return;
  if (!isFinite(mx) || !isFinite(my)) return;
  MEDWHEEL.ax = MEDWHEEL.ax * 0.72 + mx;
  MEDWHEEL.ay = MEDWHEEL.ay * 0.72 + my;
  if (Math.hypot(MEDWHEEL.ax, MEDWHEEL.ay) < 26) return;   // 死区: 没推出去就保持当前选中
  let a = Math.atan2(MEDWHEEL.ay, MEDWHEEL.ax) + Math.PI / 2;   // 换算成"从正上方起算"
  if (a < 0) a += Math.PI * 2;
  const seg = Math.PI * 2 / n;
  const i = Math.round(a / seg) % n;
  if (i !== MEDWHEEL.sel) {
    MEDWHEEL.sel = i;
    medWheelRender();
    if (typeof AudioSys !== 'undefined' && AudioSys.click) AudioSys.click(1300, 0.06, 0.03);
  }
}

function medWheelConfirm() {
  if (!MEDWHEEL.open) return false;
  const k = MEDWHEEL.keys[MEDWHEEL.sel];
  closeMedWheel();
  if (k && typeof useLootFromBag === 'function') useLootFromBag(k);
  return true;
}

// ---- DOM 绑定(只做一次) ----
(function () {
  const ring = el('mwRing');
  if (ring && !ring._mwBound) {
    ring._mwBound = true;
    ring.addEventListener('click', ev => {
      const it = ev.target && ev.target.closest ? ev.target.closest('.mwItem') : null;
      if (!it || !it.dataset.mwk) return;
      ev.stopPropagation(); ev.preventDefault();
      const k = decodeURIComponent(it.dataset.mwk);
      const i = MEDWHEEL.keys.indexOf(k);
      if (i >= 0) MEDWHEEL.sel = i;
      medWheelConfirm();
    });
  }
  const c = el('mwClose');
  if (c) c.onclick = ev => { ev.stopPropagation(); ev.preventDefault(); closeMedWheel(); };
  // 点空白处(全屏遮罩本体)也关掉 —— 手机端靠这个退出
  const root = el('medWheel');
  if (root && !root._mwBound) {
    root._mwBound = true;
    root.addEventListener('click', ev => { if (ev.target === root) closeMedWheel(); });
  }
})();
