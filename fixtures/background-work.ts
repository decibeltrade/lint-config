// Every statement in `violations` MUST be flagged by custom/no-unowned-background-work; nothing in `allowed*` may be.
declare function fetchX(): Promise<void>;
declare function foo(): Promise<void>;
declare function log(err: unknown): void;
declare function cleanup(): void;
declare const client: { fetch: () => Promise<void> } | undefined;
declare const p: Promise<void>;
declare const api: { load: () => Promise<void> };
declare function persist(): Promise<void>;
declare const emitter: { on: (event: string, listener: () => unknown) => void };
declare const background: {
  spawn: (run: (signal: AbortSignal) => Promise<unknown>) => void;
  every: (intervalMs: number, run: (signal: AbortSignal) => Promise<void>) => void;
};

export function violations(): void {
  void fetchX();
  void (async () => {})();
  void foo().then(log);
  void client?.fetch();
  foo().catch(log);
  foo().then(log, log);
  foo().finally(() => log("done"));
  foo()
    .then(() => log("ok"))
    .catch(log);
  api.load().then(log);
  new Promise<void>((resolve) => resolve()).catch(log);
  setTimeout(() => void persist(), 1);
  emitter.on("x", () => foo().catch(log));
}

export async function allowedOwnedOrAwaited(): Promise<Promise<void>> {
  background.spawn(() => foo());
  background.spawn(async () => {
    await foo().catch(log);
  });
  background.every(1_000, () => foo());
  void background.spawn(() => foo());
  await foo();
  await foo().catch(log);
  const p = foo();
  const q = foo().catch(log);
  await Promise.all([p, q]);
  return foo().finally(() => log("done"));
}

export class AllowedHandlerOnExistingPromise {
  constructor(private readonly p: Promise<void>) {}

  attach(): void {
    p.catch(log);
    p.finally(cleanup);
    this.p.then(log, log);
  }
}

export function allowedNonCall(value: unknown): void {
  void 0;
  void value;
  log(value);
}

export function allowedConciseArrows(): void {
  setTimeout(() => background.spawn(() => persist()), 1);
  emitter.on("x", () => p.catch(log));
  const f = () => void 0;
  f();
}

export async function allowedReturnedChains(): Promise<void> {
  background.spawn(() => foo().catch(log));
  background.every(1_000, async (signal) => foo().finally(() => log(signal)));
  const release = (): Promise<void> => foo().catch(log);
  await foo().then(() => foo().catch(log));
  await release();
}
