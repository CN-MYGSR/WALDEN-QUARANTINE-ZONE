// 武器平衡运行时探针: 通过 CDP 连接已打开的页面, 读取 CQB 平衡后的武器数值
const http = require('http');
const WS = require('ws');
(async () => {
  const list = await new Promise(r => http.get('http://127.0.0.1:9222/json/list', res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => r(JSON.parse(d)));
  }));
  const page = list.find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pending = {};
  ws.on('message', m => { const j = JSON.parse(m); if (j.id && pending[j.id]) pending[j.id](j); });
  await new Promise(r => ws.on('open', r));
  const rpc = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });

  const expr = `(function(){
 const keys=['mp40','thompson','m1911','stg44','m4','ak74m','kar98','springfield','mosinpu','svd','m24','garand','ppsh','bazooka'];
 const rep={};
 for(const k of keys){ const d=WPN_DEFS[k]; if(!d) continue;
   rep[k]={t:d.type,snd:d.snd,dmg:d.dmg,base:d.cqbBase&&d.cqbBase.dmg,pct:d.cqbBase?Math.round(d.dmg/d.cqbBase.dmg*100):null,
           adsT:d.adsTime||null,spreadAds:d.spreadAds,nerf:!!d.cqbNerf,buff:!!d.cqbBuff}; }
 rep.__applied=(typeof CQB_BALANCE!=='undefined')?{near:CQB_BALANCE.applied.filter(s=>s.endsWith(':near')).length,sniper:CQB_BALANCE.applied.filter(s=>s.endsWith(':sniper')).length}:null;
 return JSON.stringify(rep,null,1);})()`;

  const out = await rpc('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(out.result.result.value);
  ws.close(); process.exit(0);
})();
