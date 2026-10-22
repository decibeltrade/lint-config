// Type-aware violations; requires oxlint --type-aware (tsgolint).
declare function setTimeout(callback: () => void, ms: number): unknown;
declare const emitter: { on: (event: string, listener: () => void) => void };

async function doWork(): Promise<void> {
  return Promise.resolve();
}

export function floatingPromise(): void {
  // typescript/no-floating-promises MUST flag this call.
  doWork();
}

export function unsafeCall(value: unknown): void {
  // typescript/no-unsafe-call MUST flag this call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (value as any)();
}

export function asyncTimerCallback(): void {
  // typescript/no-misused-promises MUST flag this callback.
  setTimeout(async () => {
    await doWork();
  }, 0);
}

export function asyncListener(): void {
  // typescript/no-misused-promises MUST flag this listener.
  emitter.on("x", async () => {
    await doWork();
  });
}
