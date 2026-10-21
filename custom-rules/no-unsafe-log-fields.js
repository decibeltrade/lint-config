const LOG_METHODS = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);
// Whole-key match after lowercasing and dropping `_`/`-`, so `tokenAddress` stays allowed.
const CREDENTIAL_KEYS = new Set(
  [
    "sessionId",
    "newSessionId",
    "token",
    "accessToken",
    "refreshToken",
    "idToken",
    "apiKey",
    "secret",
    "clientSecret",
    "password",
    "authorization",
    "cookie",
    "privateKey",
    "mnemonic",
    "writeKey",
  ].map(normalizeKey),
);
const TS_WRAPPERS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
]);

function normalizeKey(key) {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function unwrap(node) {
  let current = node;
  while (TS_WRAPPERS.has(current.type)) current = current.expression;
  return current;
}

function terminalName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

function isLoggerCall(node) {
  const callee = node.callee;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property?.type !== "Identifier" ||
    !LOG_METHODS.has(callee.property.name)
  ) {
    return false;
  }
  const name = terminalName(callee.object);
  return name !== null && (name === "log" || /[Ll]ogger$/.test(name) || /[a-z0-9]Log$/.test(name));
}

function propertyKey(property) {
  if (!property.computed && property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal" && typeof property.key.value === "string") {
    return property.key.value;
  }
  return null;
}

function isRejectionHandler(fn, param) {
  if (fn.params[0] !== param) return false;
  const call = fn.parent;
  if (call?.type !== "CallExpression" || call.callee.type !== "MemberExpression") return false;
  const method = terminalName(call.callee);
  return (
    (method === "catch" && call.arguments[0] === fn) ||
    (method === "then" && call.arguments[1] === fn)
  );
}

function isCaughtError(node, scope) {
  if (node.type !== "Identifier") return false;
  for (let current = scope; current; current = current.upper) {
    const variable =
      current.set?.get(node.name) ?? current.variables.find((v) => v.name === node.name);
    if (!variable) continue;
    return variable.defs.some(
      (def) =>
        def.type === "CatchClause" ||
        (def.type === "Parameter" && isRejectionHandler(def.node, def.name)),
    );
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow spreading caught errors into log objects and logging bearer credentials",
    },
    messages: {
      caughtSpread:
        "Spreading a caught error copies its raw fields into the log line. Log it under `err` or `error` instead.",
      credential:
        "`{{key}}` names a bearer credential and must never be logged. Correlate with accountAddress instead.",
    },
    schema: [],
  },
  create(context) {
    const scopeFor = (node) =>
      context.sourceCode?.getScope ? context.sourceCode.getScope(node) : null;

    function checkObject(object) {
      for (const property of object.properties) {
        if (property.type === "SpreadElement") {
          const argument = unwrap(property.argument);
          if (isCaughtError(argument, scopeFor(argument))) {
            context.report({ node: property, messageId: "caughtSpread" });
          }
          continue;
        }

        const key = propertyKey(property);
        if (key !== null && CREDENTIAL_KEYS.has(normalizeKey(key))) {
          context.report({ node: property, messageId: "credential", data: { key } });
          continue;
        }

        const value = unwrap(property.value);
        if (value.type === "ObjectExpression") checkObject(value);
      }
    }

    return {
      CallExpression(node) {
        if (!isLoggerCall(node)) return;
        const first = node.arguments[0];
        if (first?.type !== "ObjectExpression") return;
        checkObject(first);
      },
    };
  },
};
