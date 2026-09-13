'use strict';
// ===================== 军械库 / 市集 物品搜索 =====================
// 商店物品太多 → 加一个搜索框, 按"名称 + 描述"即时过滤列表。
// 覆盖所有走 #arList + .arRow 的页签: 商店 / 市集 / 仓库 / 战利品(以及工坊/任务)。
// 用包裹式扩展 renderArmory: 原逻辑渲染完 DOM 后, 依据当前查询串过滤 .arRow 的显示。
let SHOP_QUERY='';
function shopApplyFilter(){
 const list=document.getElementById('arList');
 if(!list) return;
 const q=SHOP_QUERY;
 const rows=list.querySelectorAll('.arRow');
 let shown=0;
 for(const r of rows){
  const name=r.querySelector('.arName'), desc=r.querySelector('.arDesc');
  const text=((name?name.textContent:'')+' '+(desc?desc.textContent:'')).toLowerCase();
  const hit=!q||text.indexOf(q)>=0;
  r.style.display=hit?'':'none';
  if(hit) shown++;
 }
 let empty=list.querySelector('.arEmpty');
 if(!q){ if(empty) empty.remove(); return; }
 if(shown===0){
  if(!empty){ empty=document.createElement('div'); empty.className='arEmpty'; list.appendChild(empty); }
  empty.textContent='没有匹配「'+q+'」的物品';
 } else if(empty){ empty.remove(); }
}
function shopBindSearch(){
 const inp=document.getElementById('arSearch');
 if(!inp) return;
 inp.addEventListener('input',()=>{ SHOP_QUERY=(inp.value||'').trim().toLowerCase(); shopApplyFilter(); });
}
// 包裹 renderArmory: 每次重绘(切页签/买卖后)都重新套用当前搜索串
const _sRenderArmory=renderArmory;
renderArmory=function(tab){
 const r=_sRenderArmory.apply(this,arguments);
 try{ shopApplyFilter(); }catch(e){}
 return r;
};
shopBindSearch();
