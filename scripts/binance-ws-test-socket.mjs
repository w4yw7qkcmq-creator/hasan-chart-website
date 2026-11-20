import { EventEmitter } from "node:events";

export const openSockets = globalThis.__hcBinanceTestSockets || new Set();
globalThis.__hcBinanceTestSockets = openSockets;

export default class FakeWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.retained = Buffer.alloc(8 * 1024, 7);
    openSockets.add(this);
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.emit("open");
    });
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.retained = null;
    openSockets.delete(this);
    this.emit("close", 1000, Buffer.from(""));
  }

  terminate() {
    this.close();
  }
}
