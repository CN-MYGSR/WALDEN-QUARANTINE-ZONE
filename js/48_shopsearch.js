'use strict';
function shopApplyFilter(){
 const list=el('arList');
 if(!list||list.dataset.section==='workbench') return;
 const q=el('arSearch').value.trim().toLowerCase(), kind=el('arCategory').hidden?'':el('arCategory').value;
 const tiles=list.querySelectorAll('.invTile'), rows=list.querySelectorAll('.arRow');
 let shown=0,firstMatch=null,selectionVisible=false;
 for(const node of [...tiles,...rows]){
  const key=node.dataset.key;
  const name=node.querySelector('.arName')?.textContent||'';
  const desc=node.querySelector('.arDesc')?.textContent||'';
  const words=node.dataset.name||(name+' '+desc).toLowerCase();
  const category=key?armoryCategory(key):node.dataset.category;
  const hit=(!kind||category===kind)&&(!q||words.includes(q));
  node.hidden=!hit;
  if(!hit) continue;
  shown++;
  if(key){
   if(!firstMatch) firstMatch=node;
   if(node.classList.contains('sel')) selectionVisible=true;
  }
 }
 if(tiles.length){
  if(firstMatch&&!selectionVisible) firstMatch.click();
  el('arGridHost').hidden=!firstMatch;
  el('arDetail').hidden=!firstMatch;
 }
 const all=el('sellAllLoot');
 if(all){
  all.hidden=!!(q||kind);
  if(all.dataset.confirm) all.nextElementSibling.hidden=all.hidden;
 }
 let empty=list.querySelector('.arSearchEmpty');
 if(!shown&&(q||kind)&&(tiles.length||rows.length)){
  if(!empty){
   empty=document.createElement('div');
   empty.className='arEmpty arSearchEmpty';
   empty.innerHTML='<span></span><button class="optBtn" type="button">清除筛选</button>';
   empty.lastElementChild.onclick=()=>{el('arSearch').value='';el('arCategory').value='';shopApplyFilter();el('arSearch').focus();};
   list.prepend(empty);
  }
  empty.firstElementChild.textContent=q?'没有匹配「'+q+'」的结果':'这个分类暂无物品';
 }else empty?.remove();
}
el('arSearch').addEventListener('input',shopApplyFilter);
el('arCategory').addEventListener('change',shopApplyFilter);
