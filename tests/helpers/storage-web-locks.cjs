'use strict';
// Per-name, per-document Web Locks model. A session lease is released by
// document destruction, not by an arbitrary timer or the test's next request.
class WebLocks {
  held = new Map(); queues = new Map(); next = 0; maximum = 0; active = 0;
  client() {
    const owner = ++this.next;
    return { request: (name, options, action) => this.request(owner, name, options, action),
      close: () => { for (const [name, item] of this.held) if (item.owner === owner) this.release(name, item); } };
  }
  release(name, item) {
    if (this.held.get(name) !== item) return;
    this.held.delete(name);
    if (name === 'bao-lab:story-storage-v1') this.active--;
    this.queues.get(name)?.shift()?.();
  }
  request(owner, name, options, action) {
    if (options.ifAvailable && this.held.has(name)) return Promise.resolve().then(() => action(null));
    return new Promise((resolve, reject) => {
      const run = () => {
        const item = { owner }; this.held.set(name, item);
        if (name === 'bao-lab:story-storage-v1') { this.active++; this.maximum = Math.max(this.maximum, this.active); }
        Promise.resolve().then(() => action({ name, mode: 'exclusive' })).then(resolve, reject).finally(() => this.release(name, item));
      };
      if (this.held.has(name)) {
        if (!this.queues.has(name)) this.queues.set(name, []);
        this.queues.get(name).push(run);
      } else run();
    });
  }
}
const singleDocumentLocks = () => new WebLocks().client();
module.exports = { WebLocks, singleDocumentLocks };
