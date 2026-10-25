// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket (Node 22+). No dependencies.
// One browser-level socket; page targets are driven through flattened sessions (sessionId on every message).
export class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();   // "sessionId|Method.name" -> [fn]
    this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve(this);
      ws.onerror = () => reject(new Error('CDP: cannot open ' + this.url));
      ws.onmessage = (ev) => this._onMessage(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      ws.onclose = () => {
        this.closed = true;
        for (const p of this.pending.values()) p.reject(new Error('CDP: socket closed during ' + p.method));
        this.pending.clear();
      };
    });
  }

  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('CDP: socket closed (' + method + ')'));
    const id = ++this.nextId;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(msg));
    });
  }

  on(sessionId, method, fn) {
    const key = (sessionId || '') + '|' + method;
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    this.handlers.get(key).push(fn);
  }

  off(sessionId) {
    const prefix = (sessionId || '') + '|';
    for (const k of [...this.handlers.keys()]) if (k.startsWith(prefix)) this.handlers.delete(k);
  }

  _onMessage(text) {
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (m.id !== undefined) {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(p.method + ': ' + m.error.message + (m.error.data ? ' (' + m.error.data + ')' : '')));
      else p.resolve(m.result || {});
      return;
    }
    if (m.method) {
      const list = this.handlers.get((m.sessionId || '') + '|' + m.method);
      if (list) for (const fn of list.slice()) { try { fn(m.params || {}); } catch (e) { /* a handler must never break the socket */ } }
    }
  }

  close() {
    try { this.ws && this.ws.close(); } catch (e) { /* already gone */ }
  }
}
