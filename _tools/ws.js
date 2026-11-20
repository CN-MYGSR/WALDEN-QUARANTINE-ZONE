'use strict';
// 无 node_modules 的 ws 兼容层 (2026-11-20)
// Node 22+ 自带全局 WebSocket，这里补上 `ws` 包常用的事件 API：
//   on/off/once('open'|'message'|'error'|'close'), send(), close()
// 供 _tools 下的 CDP 探针直接 require('./ws')，不再依赖 npm 安装。
class WS {
  constructor(url){
    this._ws = new WebSocket(url);
    this._ws.binaryType = 'arraybuffer';
    this._ls = Object.create(null);
    this._ws.addEventListener('open', () => this._emit('open'));
    this._ws.addEventListener('close', (e) => this._emit('close', e.code, e.reason));
    this._ws.addEventListener('error', (e) => this._emit('error', e.error || e));
    this._ws.addEventListener('message', (e) => this._emit('message', e.data));
  }
  on(ev, fn){
    const a = this._ls[ev] || (this._ls[ev] = []);
    a.push(fn);
    return this;
  }
  off(ev, fn){
    const a = this._ls[ev];
    if(!a) return this;
    const i = a.indexOf(fn);
    if(i >= 0) a.splice(i, 1);
    return this;
  }
  once(ev, fn){
    const w = (...args) => { this.off(ev, w); fn.apply(this, args); };
    return this.on(ev, w);
  }
  _emit(ev, ...args){
    const a = this._ls[ev];
    if(!a) return;
    for(const fn of a.slice()){
      try{ fn.apply(this, args); }
      catch(err){ try{ console.error('[ws] listener error', err); }catch(e){} }
    }
  }
  send(data){ this._ws.send(data); }
  close(code, reason){ try{ this._ws.close(code, reason); }catch(e){} }
  get readyState(){ return this._ws.readyState; }
}
module.exports = WS;
module.exports.WebSocket = WS;
