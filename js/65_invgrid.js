'use strict';
// =====================================================================
// 65_invgrid.js — 网格库存 (仓库 / 背包 / 胸挂 / 安全箱 / 物资容器)
// ---------------------------------------------------------------------
// · 数据真相仍是 META.owned / META.loot / RUN.loot / RUN.secure 的计数;
//   这里只维护每个物品的网格位置 (layout[key]={x,y,rot})。
// · 占格面积 = itemSizeOf(key), 所以容量规则与旧背包完全一致。
// · 交互: 拖拽换位/跨容器拖拽; 触屏可"点物品 → 点目标格"。
// =====================================================================
const INVGRID=(()=>{
  const BASE=46;
  const grids=new Map();          // gid -> {cfg, host, grid}
  let selected=null;              // {gid,key}
  let drag=null;
  let ghost=null;

  // ---------- 占位 ----------
  function foot(key){
    const s=(typeof itemSizeOf==='function')?itemSizeOf(key):1;
    if(typeof PLATE_DEFS!=='undefined'&&PLATE_DEFS[key]) return {w:2,h:1};
    if(typeof WPN_DEFS!=='undefined'&&WPN_DEFS[key]) return WPN_DEFS[key].pistol?{w:1,h:2}:{w:4,h:2};
    if(typeof ARMOR_DEFS!=='undefined'&&ARMOR_DEFS[key]) return {w:3,h:4};
    if(typeof HELMET_DEFS!=='undefined'&&HELMET_DEFS[key]) return {w:2,h:2};
    if(typeof HEADSET_DEFS!=='undefined'&&HEADSET_DEFS[key]) return {w:2,h:1};
    if(typeof PACK_DEFS!=='undefined'&&PACK_DEFS[key]) return {w:2,h:3};
    if(typeof CHEST_DEFS!=='undefined'&&CHEST_DEFS[key]) return {w:3,h:1};
    if(typeof NVG_DEFS!=='undefined'&&NVG_DEFS[key]) return {w:2,h:1};
    if(s>=4) return {w:2,h:2};
    if(s===3) return {w:3,h:1};
    if(s===2) return {w:2,h:1};
    return {w:1,h:1};
  }
  function dims(key,rot){ const f=foot(key); return rot?{w:f.h,h:f.w}:{w:f.w,h:f.h}; }

  function fits(layout,key,x,y,rot,cols,rows,ignore){
    if(!Number.isInteger(x)||!Number.isInteger(y)) return false;
    const d=dims(key,rot);
    if(x<0||y<0||x+d.w>cols||y+d.h>rows) return false;
    for(const k in layout){
      if(k===ignore||k===key) continue;
      const p=layout[k]; if(!p) continue;
      const q=dims(k,p.rot);
      if(x<p.x+q.w && x+d.w>p.x && y<p.y+q.h && y+d.h>p.y) return false;
    }
    return true;
  }

  // 保留仍然合法的旧位置, 其余按面积从大到小自动摆; 返回摆不下的 key
  function packInto(keys,layout,cols,rows){
    const used={};
    for(const k of keys){
      const p=layout[k];
      if(p && fits(used,k,p.x,p.y,p.rot,cols,rows)) used[k]=p; else delete layout[k];
    }
    const rest=keys.filter(k=>!used[k]).sort((a,b)=>area(b)-area(a));
    const out=[];
    for(const k of rest){
      let ok=false;
      for(let y=0;y<rows&&!ok;y++){
        for(let x=0;x<cols&&!ok;x++){
          for(const r of [0,1]){
            if(fits(used,k,x,y,r,cols,rows)){ layout[k]={x:x,y:y,rot:r}; used[k]=layout[k]; ok=true; break; }
          }
        }
      }
      if(!ok) out.push(k);
    }
    return out;
  }
  function area(key){ const f=foot(key); return f.w*f.h; }
  function extent(keys,layout,cols){
    let maxY=0;
    for(const k of keys){ const p=layout[k]; if(!p) continue; const d=dims(k,p.rot); maxY=Math.max(maxY,p.y+d.h); }
    return maxY;
  }
  function dropMissing(keys,layout){
    const set=new Set(keys);
    for(const k in layout) if(!set.has(k)) delete layout[k];
  }

  // ---------- 渲染 ----------
  function cellPx(cfg){ return cfg.cell||((typeof TOUCHUI!=='undefined'&&TOUCHUI)?38:BASE); }

  function render(host,cfg){
    if(!host||!cfg) return;
    cfg.cols=Math.max(1,cfg.cols|0||1);
    cfg.rows=Math.max(1,cfg.rows|0||1);
    cfg.layout=cfg.layout||{};
    cfg.items=cfg.items||[];
    const keys=cfg.items.map(it=>it.key).filter(Boolean);
    dropMissing(keys,cfg.layout);
    const cell=cfg.cell=cellPx(cfg);
    const un=packInto(keys,cfg.layout,cfg.cols,cfg.rows);
    let rows=Math.max(cfg.rows,extent(keys,cfg.layout,cfg.cols));
    cfg.overflow=0;
    if(un.length){
      const extra=Math.ceil(un.reduce((a,k)=>a+area(k),0)/cfg.cols)+1;
      const still=packInto(keys,cfg.layout,cfg.cols,rows+extra);
      cfg.overflow=still.length;
      rows=Math.max(rows+extra,extent(keys,cfg.layout,cfg.cols));
    }
    cfg.rows=rows;
    const byKey={};
    for(const it of cfg.items) byKey[it.key]=it;

    host.innerHTML='';
    const g=document.createElement('div');
    g.className='invGrid'+(cfg.className?' '+cfg.className:'');
    g.dataset.gid=cfg.id;
    g.style.setProperty('--cell',cell+'px');
    g.style.width=(cfg.cols*cell)+'px';
    g.style.height=(cfg.rows*cell)+'px';
    for(const k of keys){
      const p=cfg.layout[k]; if(!p) continue;
      const d=dims(k,p.rot);
      const n=(byKey[k]&&byKey[k].n)||1;
      const t=document.createElement(cfg.id==='arGrid'?'button':'div');
      const kind=(typeof itemKind==='function')?itemKind(k):'misc';
      t.className='invTile k-'+kind+((selected&&selected.gid===cfg.id&&selected.key===k)?' sel':'');
      t.dataset.key=k; t.dataset.gid=cfg.id;
      const nm=invName(k);
      const ds=invDesc(k);
      if(cfg.id==='arGrid'){
        t.type='button';
        t.setAttribute('aria-label',nm+' ×'+n);
        t.setAttribute('aria-pressed',String(t.classList.contains('sel')));
      }
      t.dataset.name=(nm+' '+ds).toLowerCase();
      t.style.left=(p.x*cell)+'px'; t.style.top=(p.y*cell)+'px';
      t.style.width=(d.w*cell-2)+'px'; t.style.height=(d.h*cell-2)+'px';
      t.title=nm+'\n'+ds+'\n占 '+area(k)+' 格'+(typeof itemSellPrice==='function'?' · 售价 ¥'+formatMoney(itemSellPrice(k)):'');
      t.innerHTML='<span class="itIco">'+((typeof itemIconOf==='function')?itemIconOf(k):'📦')+'</span>'
        +'<span class="itName">'+nm+'</span>'
        +(n>1?'<span class="itQty">×'+n+'</span>':'');
      if(cfg.id==='lootSrc'){
        const take=document.createElement('button');
        take.type='button'; take.className='takeItem'; take.textContent='拿取';
        take.setAttribute('aria-label','拿取一件'+nm);
        take.disabled=!canCarry(k,1);
        if(take.disabled) take.textContent='放不下';
        t.appendChild(take);
      }
      g.appendChild(t);
    }
    host.appendChild(g);
    grids.set(cfg.id,{cfg:cfg,host:host,grid:g});
    bindGrid(g,cfg);
  }

  function cellAt(g,x,y){
    const rec=grids.get(g.dataset.gid); if(!rec) return null;
    const cfg=rec.cfg, r=g.getBoundingClientRect(), cell=cfg.cell;
    const cx=Math.floor((x-r.left)/cell), cy=Math.floor((y-r.top)/cell);
    if(cx<0||cy<0||cx>=cfg.cols||cy>=cfg.rows) return null;
    return {gid:cfg.id,x:cx,y:cy};
  }

  // ---------- 交互 ----------
  function bindGrid(g,cfg){
    g.addEventListener('pointerdown',ev=>{
      if(ev.button!==undefined&&ev.button!==0) return;
      if(g.closest('[data-view="list"]')) return;
      const t=ev.target&&ev.target.closest?ev.target.closest('.invTile'):null;
      if(!t) return;
      const key=t.dataset.key;
      const tr=t.getBoundingClientRect();
      const cell=cfg.cell;
      drag={gid:cfg.id,key:key,x0:ev.clientX,y0:ev.clientY,moved:false,
            rot:(cfg.layout[key]&&cfg.layout[key].rot)||0,
            gx:Math.floor((ev.clientX-tr.left)/cell), gy:Math.floor((ev.clientY-tr.top)/cell)};
      try{ t.setPointerCapture(ev.pointerId); }catch(e){}
    });
    g.addEventListener('dblclick',ev=>{
      if(ev.target.closest('.takeItem')) return;
      const t=ev.target&&ev.target.closest?ev.target.closest('.invTile'):null;
      if(!t) return;
      if(cfg.onDouble) cfg.onDouble(t.dataset.key);
    });
    // 触屏/鼠标: 点物品选中; 再点空格移动
    g.addEventListener('click',ev=>{
      const tile=ev.target.closest?.('.invTile');
      if(tile){
        if(ev.target.closest('.takeItem')){ lootTakeToBag(tile.dataset.key); return; }
        if(cfg.onSelect){
          selected={gid:cfg.id,key:tile.dataset.key};
          cfg.onSelect(tile.dataset.key);
        }
        return;
      }
      if(g.closest('[data-view="list"]')) return;
      const c=cellAt(g,ev.clientX,ev.clientY); if(!c||!selected) return;
      const dst=grids.get(c.gid); if(!dst) return;
      if(selected.gid===c.gid){ if(dst.cfg.onMove) dst.cfg.onMove(selected.key,c.x,c.y,0); }
      else if(dst.cfg.onDrop){ dst.cfg.onDrop(selected.gid,selected.key,c.x,c.y,0); }
    });
  }

  function makeGhost(){
    const rec=grids.get(drag.gid); if(!rec) return;
    const cfg=rec.cfg, d=dims(drag.key,drag.rot), cell=cfg.cell;
    ghost=document.createElement('div');
    ghost.className='invGhost';
    ghost.innerHTML=((typeof itemIconOf==='function')?itemIconOf(drag.key):'📦')
      +'<b>'+invName(drag.key)+'</b>';
    ghost.style.width=(d.w*cell-6)+'px';
    ghost.style.height=(d.h*cell-6)+'px';
    ghost.style.left=drag.x0+'px';
    ghost.style.top=drag.y0+'px';
    document.body.appendChild(ghost);
  }
  function cleanGhost(){ if(ghost){ ghost.remove(); ghost=null; } }

  addEventListener('pointermove',ev=>{
    if(!drag) return;
    if(!drag.moved&&Math.hypot(ev.clientX-drag.x0,ev.clientY-drag.y0)>6){ drag.moved=true; makeGhost(); }
    if(drag.moved&&ghost){
      ghost.style.left=ev.clientX+'px'; ghost.style.top=ev.clientY+'px';
    }
  },{passive:true});

  addEventListener('pointerup',ev=>{
    if(!drag) return;
    const d=drag, moved=d.moved;
    if(moved){
      const el=document.elementFromPoint(ev.clientX,ev.clientY);
      const g=el&&el.closest?el.closest('.invGrid'):null;
      if(g){
        const c=cellAt(g,ev.clientX,ev.clientY);
        if(c){
          const dst=grids.get(c.gid);
          const x=c.x-d.gx, y=c.y-d.gy;
          if(dst&&c.gid===d.gid){ if(dst.cfg.onMove) dst.cfg.onMove(d.key,x,y,d.rot); }
          else if(dst&&dst.cfg.onDrop){ dst.cfg.onDrop(d.gid,d.key,x,y,d.rot); }
        }
      }
      cleanGhost(); drag=null;
      return;
    }
    drag=null; cleanGhost();
  });
  addEventListener('pointercancel',()=>{ drag=null; cleanGhost(); });

  // 拖拽时 R 旋转 (捕获阶段, 避免触发换弹)
  addEventListener('keydown',ev=>{
    if(!drag||!drag.moved||ev.code!=='KeyR') return;
    ev.preventDefault(); ev.stopPropagation();
    drag.rot=drag.rot?0:1; cleanGhost(); makeGhost();
  },true);

  // ---------- 对外 API ----------
  function setSelected(gid,key){ selected=key?{gid:gid,key:key}:null; }
  function getSelected(){ return selected; }
  function fitsAt(gid,key,x,y,rot){
    const rec=grids.get(gid); if(!rec) return false;
    const cfg=rec.cfg;
    return fits(cfg.layout,key,x,y,rot,cfg.cols,cfg.rows,key);
  }
  function moveIn(gid,key,x,y,rot){
    const rec=grids.get(gid); if(!rec) return false;
    const cfg=rec.cfg;
    if(!fits(cfg.layout,key,x,y,rot,cfg.cols,cfg.rows,key)) return false;
    cfg.layout[key]={x:x,y:y,rot:rot?1:0};
    return true;
  }
  // 原地旋转 (触屏没有 R 键时用按钮)
  function rotate(gid,key){
    const rec=grids.get(gid); if(!rec) return false;
    const cfg=rec.cfg, pos=cfg.layout[key]; if(!pos) return false;
    const nr=pos.rot?0:1;
    if(!fits(cfg.layout,key,pos.x,pos.y,nr,cfg.cols,cfg.rows,key)) return false;
    pos.rot=nr;
    return true;
  }
  function refresh(gid){
    const rec=grids.get(gid); if(!rec) return;
    render(rec.host,rec.cfg);
  }
  function clearSelection(){ selected=null; }

  return {
    render:render, foot:foot, dims:dims, area:area,
    fitsAt:fitsAt, moveIn:moveIn, place:moveIn, rotate:rotate, refresh:refresh,
    setSelected:setSelected, getSelected:getSelected, clearSelection:clearSelection,
    packInto:packInto, extent:extent, dropMissing:dropMissing
  };
})();

// =====================================================================
// 背包面板 (Tab) — 网格版
// =====================================================================
function invCellPx(){ return (typeof TOUCHUI!=='undefined'&&TOUCHUI)?38:46; }
function invName(k){ try{ return (typeof itemLabel==='function')?itemLabel(k):((typeof itemName==='function')?itemName(k):String(k)); }catch(e){ return String(k); } }
function invDesc(k){ try{ return (typeof itemDesc==='function')?itemDesc(k):''; }catch(e){ return ''; } }

for(const panel of [el('bagPanel'),el('lootPanel')]){
  const views=panel.querySelector('.inventoryViews');
  views.addEventListener('click',ev=>{
    const button=ev.target.closest('button[data-view]');
    if(!button) return;
    panel.dataset.view=button.dataset.view;
    for(const choice of views.children) choice.setAttribute('aria-pressed',String(choice===button));
    if(panel.id==='bagPanel') renderBagPanel(); else renderLootPanel();
  });
}

function renderBagPanelGrid(){
  const pnl=el('bagPanel');
  if(!pnl) return;
  if(!BAG_UI.open||!player.alive){ pnl.classList.add('hidden'); return; }
  pnl.classList.remove('hidden');
  const focusedAction=document.activeElement?.dataset.bact;
  const bagScroll=(el('bagPanelList')&&el('bagPanelList').scrollTop)||0;
  const ks=bagEntryKeys();
  const used=bagUsed(), cap=bagCapacity();
  if(BAG_UI.sel>=ks.length) BAG_UI.sel=Math.max(0,ks.length-1);
  BAG_UI.key=ks[BAG_UI.sel]||null;
  el('bagPanelStat').textContent=used+'/'+cap+' 格 · '+bagWeight()+' kg · ¥'+formatMoney(bagValue())+' · 安全箱 '+secureUsed()+'/'+SECURE_SLOTS;
  const oldSec=el('secBox'); if(oldSec) oldSec.classList.add('hidden');

  RUN.grid=RUN.grid||{};
  RUN.grid.pack=RUN.grid.pack||{};
  RUN.grid.chest=RUN.grid.chest||{};
  const chestKeys=[], packKeys=[];
  for(const k of ks){
    if(RUN.grid.chest[k]&&itemSizeOf(k)<=CHEST_MAX_SIZE) chestKeys.push(k); else packKeys.push(k);
  }
  for(const k of chestKeys) delete RUN.grid.pack[k];
  for(const k of packKeys) delete RUN.grid.chest[k];
  const cols=5, chestCols=4;
  const baseRows=Math.max(1,Math.ceil(bagPackSlots()/cols));
  const chestBase=Math.ceil(bagChestSlots()/chestCols);
  let un=INVGRID.packInto(packKeys,RUN.grid.pack,cols,baseRows);
  const spill=un.filter(k=>itemSizeOf(k)<=CHEST_MAX_SIZE);
  un=un.filter(k=>itemSizeOf(k)>CHEST_MAX_SIZE);
  for(const k of spill){ chestKeys.push(k); delete RUN.grid.pack[k]; }
  const un2=INVGRID.packInto(chestKeys,RUN.grid.chest,chestCols,chestBase);
  for(const k of un2){ un.push(k); delete RUN.grid.chest[k]; }
  if(un.length){
    const extra=Math.ceil(un.reduce((a,k)=>a+INVGRID.area(k),0)/cols)+1;
    INVGRID.packInto(ks.filter(k=>!RUN.grid.chest[k]),RUN.grid.pack,cols,baseRows+extra);
  }
  const packList=ks.filter(k=>RUN.grid.pack[k]);
  const chestList=ks.filter(k=>RUN.grid.chest[k]);
  const packRows=Math.max(baseRows,INVGRID.extent(packList,RUN.grid.pack,cols));
  const chestRows=Math.max(chestBase,INVGRID.extent(chestList,RUN.grid.chest,chestCols));
  const selKey=BAG_UI.key||ks[0]||null;
  const selGid=selKey&&RUN.grid.chest[selKey]?'bagChest':(selKey&&RUN.grid.pack[selKey]?'bagPack':null);

  el('bagPanelList').innerHTML=
    '<div class="invSection"><div class="invHead">背包 <span>'+bagPackSlots()+' 格</span></div><div id="bagPackHost" class="invHost"></div></div>'
    +(bagChestSlots()>0?'<div class="invSection"><div class="invHead">胸挂 <span>'+bagChestSlots()+' 格 · 只收 ≤2 格</span></div><div id="bagChestHost" class="invHost"></div></div>':'')
    +'<div class="invSection"><div class="invHead">安全箱 <span>'+secureUsed()+'/'+SECURE_SLOTS+'</span></div><div id="bagSecHost" class="invHost"></div></div>';

  INVGRID.setSelected(selGid,selKey);
  const pick=function(k){
    if(BAG_UI.key!==k) bagDisarmDropAll();
    BAG_UI.key=k;
    BAG_UI.sel=bagEntryKeys().indexOf(k);
    renderBagPanel();
    try{ AudioSys.click(1400,0.08,0.03); }catch(e){}
  };
  INVGRID.render(el('bagPackHost'),{
    id:'bagPack',cols:cols,rows:packRows,layout:RUN.grid.pack,
    items:packList.map(k=>({key:k,n:RUN.loot[k]})),selected:selKey,
    onSelect:pick,
    onMove:function(k,x,y,rot){ if(INVGRID.moveIn('bagPack',k,x,y,rot)) renderBagPanel(); else showScorePop('这里放不下'); },
    onDrop:function(src,k,x,y,rot){
      if(src!=='bagChest') return;
      if(!INVGRID.moveIn('bagPack',k,x,y,rot)){ showScorePop('这里放不下'); return; }
      delete RUN.grid.chest[k]; renderBagPanel();
    }
  });
  if(bagChestSlots()>0){
    INVGRID.render(el('bagChestHost'),{
      id:'bagChest',cols:chestCols,rows:chestRows,layout:RUN.grid.chest,
      items:chestList.map(k=>({key:k,n:RUN.loot[k]})),selected:selKey,
      onSelect:pick,
      onMove:function(k,x,y,rot){ if(INVGRID.moveIn('bagChest',k,x,y,rot)) renderBagPanel(); else showScorePop('胸挂这里放不下'); },
      onDrop:function(src,k,x,y,rot){
        if(src!=='bagPack') return;
        if(itemSizeOf(k)>CHEST_MAX_SIZE){ showScorePop('胸挂只收 ≤2 格物品'); return; }
        if(!INVGRID.moveIn('bagChest',k,x,y,rot)){ showScorePop('胸挂这里放不下'); return; }
        delete RUN.grid.pack[k]; renderBagPanel();
      }
    });
  }

  // 安全箱: 4 个 1x1 格, 点一下取出
  const secHost=el('bagSecHost');
  if(secHost){
    const sec=RUN.secure||[], c=invCellPx();
    let sh='<div class="invGrid invSecGrid" style="width:'+(SECURE_SLOTS*c)+'px;height:'+c+'px">';
    for(let i=0;i<SECURE_SLOTS;i++){
      const k=sec[i]; if(!k) continue;
      sh+='<button type="button" class="invTile sm k-'+itemKind(k)+' secTile" data-sk="'+encodeURIComponent(k)+'" style="left:'+(i*c)+'px;top:0;width:'+(c-2)+'px;height:'+(c-2)+'px" title="'+invName(k)+' · 点击取出"><span class="itIco">'+itemIconOf(k)+'</span><span class="itName">'+invName(k)+'</span><span class="secTakeLabel">取出</span></button>';
    }
    sh+='</div>';
    secHost.innerHTML=sh;
    secHost.querySelectorAll('.secTile').forEach(function(t){
      t.onclick=function(){
        const k=decodeURIComponent(t.dataset.sk);
        secureTake(k);
        try{ AudioSys.click(1000,0.2,0.05); }catch(e){}
        renderBagPanel();
      };
    });
  }

  const detail=el('bagDetail');
  if(detail){
    if(selKey&&RUN.loot[selKey]){
      detail.innerHTML='<div class="invDName">'+itemIconOf(selKey)+' '+itemLabel(selKey)+' ×'+RUN.loot[selKey]+'</div>'
        +'<div class="invDDesc">'+itemDesc(selKey)+'</div>'
        +'<div class="invDHint">每件 '+itemSizeOf(selKey)+' 格 · 售价 ¥'+formatMoney(itemSellPrice(selKey))+'</div>';
    } else {
      detail.textContent='背包是空的。靠近物资箱或尸体，'+(TOUCHUI?'点屏幕上的搜刮按钮':'按 '+keyLabelOf('interact'))+' 取物。';
    }
  }
  el('bagPanelHint').innerHTML=bagHintHTML();
  renderBagActions();
  if(focusedAction){
    const actions=el('bagPanelBtns');
    (actions.querySelector('[data-bact="'+focusedAction+'"]')||actions.querySelector('[data-bact="close"]')).focus({preventScroll:true});
  }
  const bl=el('bagPanelList'); if(bl) bl.scrollTop=bagScroll;
}

// =====================================================================
// 物资容器 / 尸体 面板 — 左容器右背包, 拖拽拿取
// =====================================================================
function lootTakeToBag(key,x,y,rot){
  const ref=LOOT_UI.ref;
  if(!takeLootItem(ref,key)) return false;
  if(ref.grid) delete ref.grid[key];
  RUN.grid=RUN.grid||{pack:{},chest:{}};
  if(INVGRID.fitsAt('lootBag',key,x,y,rot)) INVGRID.moveIn('lootBag',key,x,y,rot);
  recordLootPickup();
  showScorePop('拿取: '+itemLabel(key));
  if(!Object.keys(ref.loot).length){
    ref.searched=true;
    if(ref.glow) ref.glow.visible=false;
    lootPanelClose();
    renderRaidBag();
    return true;
  }
  renderLootPanel();
  renderRaidBag();
  return true;
}

function lootPutBack(key,x,y,rot){
  const ref=LOOT_UI.ref;
  if(!ref||!RUN.loot[key]) return;
  const n=RUN.loot[key];
  RUN.loot[key]=0;
  delete RUN.loot[key];
  if(RUN.grid){ delete RUN.grid.pack[key]; delete RUN.grid.chest[key]; }
  ref.loot[key]=(ref.loot[key]||0)+n;
  moveStowedWeapons(RUN,ref,key,n);
  ref.grid=ref.grid||{};
  if(INVGRID.fitsAt('lootSrc',key,x,y,rot)) INVGRID.moveIn('lootSrc',key,x,y,rot);
  showScorePop('放回: '+itemLabel(key)+' ×'+n);
  renderLootPanel();
  renderRaidBag();
}

function renderLootPanelGrid(){
  const pnl=el('lootPanel');
  if(!pnl) return;
  if(!LOOT_UI.open||!LOOT_UI.ref){ pnl.classList.add('hidden'); return; }
  pnl.classList.remove('hidden');
  const ref=LOOT_UI.ref;
  ref.grid=ref.grid||{};
  const entries=lootEntries(ref);
  const srcKeys=entries.map(e=>e[0]);
  INVGRID.dropMissing(srcKeys,ref.grid);
  const srcArea=srcKeys.reduce((a,k)=>a+INVGRID.area(k)*(ref.loot[k]||1),0);
  const srcRows=Math.max(4,Math.ceil(srcArea/5)+1);
  const bagKeys=bagEntryKeys();
  RUN.grid=RUN.grid||{pack:{},chest:{}};
  const bagPackKeys=bagKeys.filter(k=>!RUN.grid.chest[k]);
  const bagRows=Math.max(3,Math.ceil(bagPackSlots()/5));
  LOOT_UI.sel=Math.min(LOOT_UI.sel,Math.max(0,entries.length-1));
  const selEntry=entries[LOOT_UI.sel];
  const selKey=selEntry?selEntry[0]:null;

  el('lootTitle').textContent=LOOT_UI.kind==='corpse'?'尸 体':'物 资 箱';
  el('lootSpace').textContent='背包剩余 '+bagFree()+' 格';
  el('lootList').innerHTML='<div class="lootWrap">'
    +'<div class="lootCol"><div class="invHead">'+(LOOT_UI.kind==='corpse'?'尸体':'物资箱')+' <span>'+srcKeys.length+' 种</span></div><div id="lootSrcHost" class="invHost"></div></div>'
    +'<div class="lootCol"><div class="invHead">背包 <span>'+bagUsed()+'/'+bagCapacity()+' 格</span></div><div id="lootBagHost" class="invHost"></div></div>'
    +'</div>';

  INVGRID.setSelected(selKey?'lootSrc':null,selKey);
  INVGRID.render(el('lootSrcHost'),{
    id:'lootSrc',cols:5,rows:srcRows,layout:ref.grid,
    items:srcKeys.map(k=>({key:k,n:ref.loot[k]})),selected:selKey,
    onSelect:function(k){
      const i=lootEntries(ref).findIndex(e=>e[0]===k);
      if(i<0) return;
      LOOT_UI.sel=i;
      for(const tile of el('lootSrcHost').querySelectorAll('.invTile')){
        tile.classList.toggle('sel',tile.dataset.key===k);
      }
      showLootDetail(k);
    },
    onMove:function(k,x,y,rot){ if(INVGRID.moveIn('lootSrc',k,x,y,rot)) renderLootPanel(); },
    onDrop:function(src,k,x,y,rot){ if(src==='lootBag') lootPutBack(k,x,y,rot); },
    onDouble:function(k){ lootTakeToBag(k); }
  });
  INVGRID.render(el('lootBagHost'),{
    id:'lootBag',cols:5,rows:bagRows,layout:RUN.grid.pack,
    items:bagPackKeys.map(k=>({key:k,n:RUN.loot[k]})),selected:null,
    onSelect:function(k){ INVGRID.setSelected('lootBag',k); },
    onMove:function(k,x,y,rot){ if(INVGRID.moveIn('lootBag',k,x,y,rot)){ renderLootPanel(); renderBagPanel(); } },
    onDrop:function(src,k,x,y,rot){ if(src==='lootSrc') lootTakeToBag(k,x,y,rot); }
  });

  function showLootDetail(key){
    const take=el('lootTakeOne');
    take.disabled=!key||!canCarry(key,1);
    take.textContent=key&&take.disabled?'背包放不下':'拿取所选';
    el('lootDetail').innerHTML=key
      ? '<div class="invDName">'+itemIconOf(key)+' '+itemLabel(key)+' ×'+ref.loot[key]+'</div>'
        +'<div class="invDDesc">'+itemDesc(key)+'</div>'
        +'<div class="invDHint">每件占 '+itemSizeOf(key)+' 格</div>'
        +'<div class="invDBtns"><button class="optBtn" id="lootRotate">旋转</button></div>'
      : '<div class="invDHint">容器已空</div>';
    const rb=el('lootRotate');
    if(rb) rb.onclick=function(){ if(INVGRID.rotate('lootSrc',key)) renderLootPanel(); else showScorePop('旋转后放不下'); };
  }
  showLootDetail(selKey);
  el('lootTakeOne').onclick=lootTakeSelected;
  el('lootClose').onclick=()=>lootPanelClose();
  el('lootHint').textContent=TOUCHUI?(pnl.dataset.view==='grid'?'拖到背包可拿取':'点物品看详情') :
    keyLabelOf('lootUp')+' / '+keyLabelOf('lootDown')+' 选择　'+keyLabelOf('interact')+' 拿取　Esc 关闭';
}

// =====================================================================
// 军械库「仓库 / 战利品」— 网格版 (其他页签保持原列表)
// =====================================================================
let ARMORY_GRID_SEL=null;
function armoryTileKey(e){
  const tile=e.target.closest('.invTile');
  if(!tile||e.altKey||e.ctrlKey||e.metaKey) return;
  if(e.code==='KeyR'){
    e.preventDefault(); e.stopPropagation();
    if(e.repeat) return;
    if(!armoryGridMode){ armoryGridMode=true; renderArmory(ARMORY_TAB); }
    el('arRotate')?.click();
    el('arGridHost').querySelector('.sel')?.focus();
    return;
  }
  const step={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(!step) return;
  e.preventDefault(); e.stopPropagation();
  const origin=tile.getBoundingClientRect();
  const cx=origin.left+origin.width/2, cy=origin.top+origin.height/2;
  let best=null, bestAligned=false, bestDistance=Infinity;
  for(const candidate of e.currentTarget.querySelectorAll('.invTile')){
    const rect=candidate.getBoundingClientRect();
    if(!rect.width) continue;
    const dx=rect.left+rect.width/2-cx, dy=rect.top+rect.height/2-cy;
    if(dx*step[0]+dy*step[1]<=0) continue;
    // 同一行或列优先；空格和搜索隐藏的物品都可跳过。
    const aligned=step[0] ? rect.top<origin.bottom&&rect.bottom>origin.top
                          : rect.left<origin.right&&rect.right>origin.left;
    const distance=dx*dx+dy*dy;
    if(!best||(aligned&&!bestAligned)||(aligned===bestAligned&&distance<bestDistance)){
      best=candidate; bestAligned=aligned; bestDistance=distance;
    }
  }
  if(best) best.focus();
}
function renderArmoryGrid(tab){
  const list=el('arList');
  if(!list) return;
  const arScroll=list.scrollTop||0;
  const isOwned=tab==='warehouse';
  const stock=(isOwned?META.owned:META.loot)||{};
  const keys=Object.keys(stock).filter(k=>stock[k]>0&&/^[\w-]+$/.test(k));
  const layout=isOwned?(META.gridOwned=META.gridOwned||{}):(META.gridLoot=META.gridLoot||{});
  INVGRID.dropMissing(keys,layout);
  if(!keys.length){
    list.innerHTML='<div class="arEmpty">'+(isOwned?'仓库暂无物品。可从补给采购补货。':'暂无撤离战利品。成功撤离后可在这里入库或出售。')+'</div>';
    return;
  }
  if(!keys.includes(ARMORY_GRID_SEL)) ARMORY_GRID_SEL=keys[0];
  const rows=Math.max(10,INVGRID.extent(keys,layout,10)+2);
  list.innerHTML='<div class="arInventory"><div class="arStockItems"><div id="arGridHost" class="invHost"></div>'
    +(isOwned?'':'<button type="button" class="optBtn arSellAll" id="sellAllLoot">出售全部战利品 · ¥'+formatMoney(keys.reduce((a,k)=>a+stock[k]*itemSellPrice(k),0))+'</button>')
    +'</div><aside id="arDetail" class="invDetail" aria-label="所选物品"></aside></div>';
  const host=el('arGridHost');
  function selectItem(k){
    if(!k||ARMORY_GRID_SEL===k) return;
    ARMORY_GRID_SEL=k;
    INVGRID.setSelected('arGrid',k);
    for(const t of host.querySelectorAll('.invTile')){
      const active=t.dataset.key===k;
      if(t.classList.contains('sel')===active) continue;
      t.classList.toggle('sel',active);
      t.setAttribute('aria-pressed',String(active));
    }
    renderArmoryDetail(tab,k);
  }
  INVGRID.setSelected('arGrid',ARMORY_GRID_SEL);
  if(armoryGridMode){
    INVGRID.render(host,{
      id:'arGrid',cols:10,rows,layout,
      items:keys.map(k=>({key:k,n:stock[k]})),
      selected:ARMORY_GRID_SEL,onSelect:selectItem,
      onMove(k,x,y,rot){ if(INVGRID.moveIn('arGrid',k,x,y,rot)){ saveMeta(); renderArmoryGrid(tab); } }
    });
  } else {
    const entries=document.createElement('div');
    entries.className='arStockList';
    for(const k of keys){
      const b=document.createElement('button');
      b.type='button'; b.className='invTile arStockItem';
      b.dataset.key=k; b.dataset.name=(invName(k)+' '+invDesc(k)).toLowerCase();
      b.classList.toggle('sel',k===ARMORY_GRID_SEL); b.setAttribute('aria-pressed',String(k===ARMORY_GRID_SEL));
      b.innerHTML='<span class="arGlyph" aria-hidden="true"></span><span class="arItemLabel"></span><span class="arAmount"></span>';
      b.children[0].textContent=itemIconOf(k); b.children[1].textContent=invName(k); b.children[2].textContent='×'+stock[k];
      entries.appendChild(b);
    }
    host.appendChild(entries);
    host.addEventListener('click',e=>selectItem(e.target.closest('[data-key]')?.dataset.key));
  }
  host.addEventListener('focusin',e=>selectItem(e.target.dataset.key));
  host.addEventListener('keydown',armoryTileKey);
  renderArmoryDetail(tab,ARMORY_GRID_SEL);
  const sa=el('sellAllLoot');
  if(sa) sa.onclick=()=>{
    if(sa.dataset.confirm){ sellAllLoot(); return; }
    sa.dataset.confirm='1';
    sa.textContent='确认出售全部战利品？';
    const cancel=document.createElement('button');
    cancel.type='button'; cancel.className='optBtn'; cancel.textContent='取消';
    cancel.onclick=()=>{ renderArmoryGrid(tab); el('sellAllLoot')?.focus(); };
    sa.after(cancel); cancel.focus();
  };
  if(typeof shopApplyFilter==='function') shopApplyFilter();
  list.scrollTop=arScroll;
}
function renderArmoryDetail(tab,k){
  const owned=tab==='warehouse', n=owned?ownedCount(k):META.loot[k]||0;
  const kind=itemKind(k), L=META.loadout;
  const slots={armor:'armor',helmet:'helmet',headset:'headset',pack:'pack',chest:'chest',gear:'nvg',plate:'plate'};
  const action=(id,label,disabled=false)=>'<button class="optBtn arBtn" data-key="'+k+'" data-action="'+id+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
  let acts='';
  if(!owned) acts=action('loot-keep','移入仓库');
  else if(kind==='weapon'){
    acts=action('equip',L.primary===k?'已装备主武器':'装入主武器',L.primary===k)
        +(L.primary!==k?action('equip-side',L.secondary===k?'已装备副武器':'装入副武器',L.secondary===k):'')
        +action('workbench','改装此枪')+action('find-supply','查找配套弹药');
  }else if(slots[kind]){
    const active=L[slots[kind]]===k;
    acts=action('equip',active?'已装备':'装备',active);
  }
  if(owned&&kind!=='weapon'&&TRADE_KEYS.includes(k)) acts+=action('find-supply','同款补货');
  const detail=el('arDetail');
  detail.innerHTML='<div class="arDetailTop"><span class="arGlyph"></span><strong class="invDName"></strong></div><div class="invDDesc"></div>'
    +'<dl class="arFacts"><div><dt>数量</dt><dd>'+n+'</dd></div><div><dt>单件占用</dt><dd>'+itemSizeOf(k)+' 格</dd></div><div><dt>单件售价</dt><dd>¥'+formatMoney(itemSellPrice(k))+'</dd></div></dl>'
    +'<div class="invDBtns">'+acts+action(owned?'sell':'loot-sell','出售 1 件')+(armoryGridMode?'<button class="optBtn" id="arRotate">旋转格位</button>':'')+'</div>';
  detail.querySelector('.arGlyph').textContent=itemIconOf(k);
  detail.querySelector('strong').textContent=invName(k); detail.querySelector('.invDDesc').textContent=invDesc(k);
  const rb=el('arRotate');
  if(rb) rb.onclick=()=>{
    if(INVGRID.rotate('arGrid',k)){ saveMeta(); renderArmoryGrid(tab); }
    else showScorePop('旋转后放不下');
  };
}
