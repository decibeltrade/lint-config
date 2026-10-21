// Every call in `violations*` MUST be flagged by custom/no-unsafe-log-fields; nothing in `allowed*` may be.
interface Log {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}
declare const logger: Log;
declare const loopLogger: Log;
declare const keepaliveLog: Log;
declare const request: { log: Log };
declare const metrics: Log;
declare function work(): Promise<void>;
declare const sessionId: string;
declare const tokenAddress: string;
declare const accountAddress: string;

export function violationsSpread(): void {
  try {
    void work();
  } catch (e) {
    logger.error({ ...(e as object) }, "1");
    request.log.error({ details: { ...(e as object) } }, "2");
  }
  void work().then(undefined, (rejection: unknown) => {
    keepaliveLog.warn({ ...(rejection as object) }, "3");
  });
}

export function violationsCredential(): void {
  logger.info({ sessionId }, "1");
  logger.info({ newSessionId: sessionId }, "2");
  logger.info({ APIKEY: "k", api_key: "k" }, "3,4");
  logger.info({ authorization: "Bearer x" }, "5");
  logger.info({ headers: { cookie: "c" } }, "6");
  loopLogger.warn({ privateKey: "p", writeKey: "w" }, "7,8");
}

export function allowedCaught(): void {
  try {
    void work();
  } catch (err) {
    logger.error({ err }, "shorthand err");
  }
  try {
    void work();
  } catch (error) {
    logger.error({ error, attempt: 1 }, "shorthand error");
  }
  try {
    void work();
  } catch (e) {
    logger.error({ error: e }, "keyed error");
    logger.error({ reason: e }, "keyed reason");
    // The runtime formatter allowlists errors under any key.
    logger.error({ cause: e }, "custom key");
    loopLogger.warn({ failure: e as Error }, "custom key with cast");
    request.log.error({ details: { e } }, "nested");
    logger.error({ error: (e as Error).message }, "message only");
    logger.error(e);
    metrics.error({ cause: e }, "not a logger");
    // A same-named callback param is not the caught error.
    ["a"].forEach((e) => {
      logger.info({ label: e }, "shadowed");
    });
  }
  void work().catch((reason: unknown) => {
    logger.warn({ reason }, "rejection under reason");
  });
  void work().catch((failure: unknown) => {
    keepaliveLog.warn({ failure }, "rejection under a custom key");
  });
  const built = new Error("not caught");
  logger.error({ cause: built }, "not a caught binding");
}

export function allowedFields(): void {
  logger.info(
    { tokenAddress, tokenSymbol: "APT", tokenId: 1, sessionCount: 2, accountAddress },
    "partial words and correlation ids",
  );
  metrics.info({ sessionId, apiKey: "k" }, "not a logger");
}
