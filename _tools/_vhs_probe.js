// VHS 后处理探针: 进靶场 → 开/关 VHS 各抓一张 → 解 PNG 算指标
// 验证: ① 无控制台异常 ② 开关 VHS 平均亮度接近(说明 linear→sRGB 没搞反)
//       ③ 开 VHS 后高频能量上升(扫描线/噪点) ④ 暗角(角落比中心暗)
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'),
  WS = require('./ws'), { spawn } = require('child_process');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PORT = 9726;
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws;
const out = [];
let pass = 0, fail = 0;
const ok = m => { pass++; out.push('  ✅ ' + m); };
const bad = m => { fail++; out.push('  ❌ ' + m); };
const log = m => out.push(m);
function finish(c) {
  const t = out.join('\n');
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_probe.txt'), t + '\n', 'utf8');
  console.log(t);
  try { if (ws) ws.close(); } catch (e) {}
  try { if (proc) proc.kill(); } catch (e) {}
  process.exit(c);
}

/* ---------- 极简 PNG 解码 (Chrome 截图: 8bit, 非隔行, colorType 2/6) ---------- */
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('bitDepth ' + bd);
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!ch) throw new Error('colorType ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, img = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++]; const row = raw.slice(q, q + stride); q += stride;
    const cur = img.slice(y * stride, (y + 1) * stride);
    const prev = y ? img.slice((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev ? prev[x] : 0, c = (prev && x >= ch) ? prev[x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
  }
  return { w, h, ch, data: img };
}
function stats(img) {
  const { w, h, ch, data } = img;
  let sum = 0, n = 0, hf = 0;
  const lum = (x, y) => { const i = (y * w + x) * ch; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  // 中心/角落 (取 40% 区域均值, 避开 HUD 文字)
  let cSum = 0, cN = 0, kSum = 0, kN = 0;
  for (let y = Math.floor(h * 0.30); y < h * 0.62; y++)
    for (let x = Math.floor(w * 0.38); x < w * 0.62; x++) { cSum += lum(x, y); cN++; }
  for (const [x0, x1, y0, y1] of [[0, 0.10, 0.20, 0.55], [0.90, 1, 0.20, 0.55]]) {
    for (let y = Math.floor(h * y0); y < h * y1; y++)
      for (let x = Math.floor(w * x0); x < w * x1; x++) { kSum += lum(x, y); kN++; }
  }
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w - 1; x += 2) {
    const l = lum(x, y); sum += l; n++;
    hf += Math.abs(l - lum(x + 1, y));
  }
  return { mean: sum / n, center: cSum / cN, corner: kSum / kN, hf: hf / n };
}

(async () => {
  const ud = path.join(require('os').tmpdir(), 'vh_' + Date.now());
  proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--window-size=1280,760', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', 'about:blank'],
    { stdio: 'ignore' });
  await sleep(2500);
  let list = null;
  for (let i = 0; i < 40; i++) {
    try {
      list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/json/list', r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
      }).on('error', rej));
      if (list && list.length) break;
    } catch (e) { await sleep(500); }
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) { log('NO_PAGE'); return finish(1); }

  ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pend = {}; const errs = [];
  ws.on('message', m => {
    const j = JSON.parse(m);
    if (j.id && pend[j.id]) pend[j.id](j);
    else if (j.method === 'Runtime.exceptionThrown') errs.push('EXC ' + ((j.params.exceptionDetails.exception || {}).description || j.params.exceptionDetails.text || '').split('\n')[0]);
    else if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error')
      errs.push('ERR ' + j.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 200));
  });
  await new Promise(r => ws.on('open', r));
  const rpc = (me, pa) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  const ev = async e => {
    const o = await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (o.result && o.result.exceptionDetails) return 'EXC:' + ((o.result.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return o.result && o.result.result ? o.result.result.value : String(o);
  };

  await rpc('Page.navigate', { url: URL });
  await sleep(14000);
  log('=== VHS 探针 ===');
  const hasVhs = await ev(`typeof VHS==='object'&&typeof VHS.render==='function'`);
  hasVhs === true ? ok('VHS 已加载') : bad('VHS 未加载: ' + hasVhs);
  // 63_scope 之后 NVG.render 的最外层是镜片包装, VHS 在链上但不一定出现在源码里
  const patched = await ev(`(function(){ const s=String(NVG.render); return s.indexOf('SCOPE.overlaySafe')>=0||s.indexOf('VHS.render')>=0; })()`);
  patched === true ? ok('NVG.render 已被后处理接管 (VHS / 镜片在链上)') : bad('NVG.render 未被接管');

  // 进靶场(室内、画面稳定、无雨雪)
  const idx = await ev(`(function(){ for(let i=0;i<CAMPAIGNS.length;i++) if(CAMPAIGNS[i].rangeOnly) return i; return -1; })()`);
  await ev(`(function(){ localStorage.setItem('sf_campaign','${idx}'); localStorage.setItem('sf_range','1'); localStorage.setItem('sf_autodeploy','1'); return 1; })()`);
  await rpc('Page.navigate', { url: URL });
  await sleep(17000);
  await ev(`(function(){ document.getElementById('deployBtn').click(); return 1; })()`);
  await sleep(4000);
  await ev(`(function(){ player.pos.x=0; player.yaw=0; player.pitch=0; return 1; })()`);
  await sleep(1500);

  const shotA = await rpc('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_on.png'), Buffer.from(shotA.result.data, 'base64'));
  const rtInfo = await ev(`(function(){ const s=VHS.state(); return JSON.stringify({on:s.on,fish:s.fish,ca:s.ca,scan:s.scan}); })()`);
  log('  参数: ' + rtInfo);

  await ev(`VHS.setEnabled(false)`);
  await sleep(900);
  const shotB = await rpc('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_off.png'), Buffer.from(shotB.result.data, 'base64'));
  await ev(`VHS.setEnabled(true)`);
  await sleep(600);

  // 夜视路径: 强制装 gear_nvg + RUN.nvgKey 后开夜视, 验证 setRenderTarget 重定向没把画面搞黑
  const nvgOn = await ev(`(function(){ try{
    RUN.nvgBrought=true; RUN.nvgKey='nvg';
    const k=(player.curW&&player.curW.key)||META.loadout.primary;
    if(!PLAYER_MODS[k]) PLAYER_MODS[k]={};
    PLAYER_MODS[k].gear='gear_nvg';
    if(!NVG.active()) NVG.toggle();
    return JSON.stringify({active:NVG.active(), gear:(typeof getModChoice==='function')?getModChoice(k,'gear'):'?'});
  }catch(e){ return 'EXC '+e.message; } })()`);
  await sleep(1400);
  const shotC = await rpc('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_nvg.png'), Buffer.from(shotC.result.data, 'base64'));
  log('  夜视: ' + nvgOn);

  // 诊断: 逐项归零, 定位画面异常来自哪个效果 (先关掉夜视, 否则看到的是夜视画面)
  await ev(`(function(){ if(NVG.active()) NVG.toggle(); return 1; })()`);
  await sleep(900);
  await ev(`VHS.tune({fish:0,ca:0,noise:0,scan:0,vig:0})`);
  await sleep(800);
  const sF = await rpc('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_flat.png'), Buffer.from(sF.result.data, 'base64'));
  await ev(`VHS.tune({ca:0.0022})`);
  await sleep(800);
  const sCa = await rpc('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_ca.png'), Buffer.from(sCa.result.data, 'base64'));
  await ev(`VHS.tune({ca:0,fish:0.25})`);
  await sleep(800);
  const sFi = await rpc('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, '_tools', '_vhs_fish.png'), Buffer.from(sFi.result.data, 'base64'));
  await ev(`VHS.tune({ca:0.0022,noise:0.030,scan:0.075,vig:0.50})`);

  const A = stats(decodePNG(fs.readFileSync(path.join(ROOT, '_tools', '_vhs_on.png'))));  const B = stats(decodePNG(fs.readFileSync(path.join(ROOT, '_tools', '_vhs_off.png'))));
  log(`  VHS 开: 平均 ${A.mean.toFixed(1)} 中心 ${A.center.toFixed(1)} 角落 ${A.corner.toFixed(1)} 高频 ${A.hf.toFixed(2)}`);
  log(`  VHS 关: 平均 ${B.mean.toFixed(1)} 中心 ${B.center.toFixed(1)} 角落 ${B.corner.toFixed(1)} 高频 ${B.hf.toFixed(2)}`);

  // ① 亮度不能差太多 (差太多 = linear/sRGB 搞反了)
  const dLum = Math.abs(A.mean - B.mean) / Math.max(B.mean, 1);
  if (dLum < 0.16) ok(`开关亮度接近 (差 ${(dLum * 100).toFixed(1)}% ≤16%) —— 色彩空间正确`);
  else bad(`开关亮度差 ${(dLum * 100).toFixed(1)}% > 16% —— linear→sRGB 可能反了`);
  // ② 高频能量: 扫描线 + 噪点
  if (A.hf > B.hf * 1.12) ok(`开 VHS 高频能量上升 (${B.hf.toFixed(2)} → ${A.hf.toFixed(2)}) = 扫描线/噪点在起作用`);
  else bad(`高频没明显上升 (${B.hf.toFixed(2)} → ${A.hf.toFixed(2)}) —— 扫描线/噪点可能没生效`);
  // ③ 暗角
  const vigA = A.corner / Math.max(A.center, 1), vigB = B.corner / Math.max(B.center, 1);
  if (vigA < vigB - 0.05) ok(`暗角生效 (角落/中心 ${vigB.toFixed(2)} → ${vigA.toFixed(2)})`);
  else bad(`暗角不明显 (角落/中心 ${vigB.toFixed(2)} → ${vigA.toFixed(2)})`);
  // ④ 画面不能全黑/全白
  if (A.mean > 12 && A.mean < 235) ok(`画面亮度正常 (${A.mean.toFixed(1)})`);
  else bad(`画面亮度异常 (${A.mean.toFixed(1)}) —— 可能 RT 是空的`);
  // ⑤ 夜视 + VHS 叠加: 画面不能被重定向搞黑
  const C = stats(decodePNG(fs.readFileSync(path.join(ROOT, '_tools', '_vhs_nvg.png'))));
  log(`  夜视: 平均 ${C.mean.toFixed(1)} 中心 ${C.center.toFixed(1)}`);
  if (/active":true/.test(String(nvgOn))) {
    if (C.mean > 25) ok(`夜视路径有画面 (平均 ${C.mean.toFixed(1)}) —— setRenderTarget 重定向正常`);
    else bad(`夜视路径几乎全黑 (平均 ${C.mean.toFixed(1)}) —— VHS 重定向把 NVG 的 quad 吞了`);
  } else bad('夜视没能激活, 无法验证与 VHS 的叠加: ' + nvgOn);

  // ⑥ 控制台
  if (!errs.length) ok('无控制台异常');
  else { bad(`控制台有 ${errs.length} 条异常`); errs.slice(0, 6).forEach(e => log('     ' + e)); }

  log('');
  log(fail ? `❌ ${fail} 项失败 / ${pass} 项通过` : `✅ 全部 ${pass} 项通过`);
  return finish(fail ? 1 : 0);
})().catch(e => { log('FATAL ' + e.message + '\n' + e.stack); finish(1); });
