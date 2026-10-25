import type { ProcessingSettings, PuzzleResult, WorkerResponse } from "./types";

export interface ProcessCallbacks {
  onProgress: (stage: string, progress: number) => void;
  onComplete: (result: PuzzleResult) => void;
  onError: (message: string) => void;
}

interface PendingRequest extends ProcessCallbacks {
  worker: Worker;
  timeout: number;
}

const pending = new Map<string, PendingRequest>();
let sharedWorker: Worker | null = null;

function worker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL("./processor.worker.ts", import.meta.url), { type: "module" });
    sharedWorker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const request = pending.get(message.requestId);
      if (!request) return;
      if (message.type === "progress") request.onProgress(message.stage, message.progress);
      if (message.type === "result") {
        window.clearTimeout(request.timeout);
        pending.delete(message.requestId);
        request.onComplete(message.result);
      }
      if (message.type === "error") {
        window.clearTimeout(request.timeout);
        pending.delete(message.requestId);
        request.onError(message.message);
      }
    });
    sharedWorker.addEventListener("error", (event) => {
      for (const [id, request] of pending) {
        window.clearTimeout(request.timeout);
        request.onError(event.message || "The local image processor stopped unexpectedly.");
        pending.delete(id);
      }
      sharedWorker?.terminate();
      sharedWorker = null;
    });
  }
  return sharedWorker;
}

export function processImage(file: File, settings: ProcessingSettings, callbacks: ProcessCallbacks): string {
  const requestId = crypto.randomUUID();
  const instance = worker();
  const timeout = window.setTimeout(() => {
    pending.delete(requestId);
    instance.postMessage({ type: "cancel", requestId });
    callbacks.onError("This image took too long to process. Try lowering detail or using a smaller image.");
  }, 180_000);
  pending.set(requestId, { ...callbacks, worker: instance, timeout });
  instance.postMessage({ type: "process", requestId, file, settings });
  return requestId;
}

export function cancelProcessing(requestId: string): void {
  const request = pending.get(requestId);
  if (!request) return;
  window.clearTimeout(request.timeout);
  pending.delete(requestId);
  request.worker.postMessage({ type: "cancel", requestId });
}
