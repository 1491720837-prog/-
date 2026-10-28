import { workerData } from "node:worker_threads";

// Web workers have their own globals: main-thread polyfills cannot fix them.
for (const key of ["toHex", "toBase64", "setFromHex", "setFromBase64"])
  delete Uint8Array.prototype[key];
for (const key of ["fromHex", "fromBase64"]) delete Uint8Array[key];

const { WorkerMessageHandler } = await import(workerData.module);
WorkerMessageHandler.initializeFromPort(workerData.port);
