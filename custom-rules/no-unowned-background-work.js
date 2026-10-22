const CHAIN_METHODS = new Set(["then", "catch", "finally"]);
const OWNER_METHODS = new Set(["spawn", "every"]);
const WRAPPERS = new Set([
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
]);

function unwrap(node) {
  let current = node;
  while (WRAPPERS.has(current.type)) current = current.expression;
  return current;
}

function methodName(call) {
  const callee = unwrap(call.callee);
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  return callee.property?.type === "Identifier" ? callee.property.name : null;
}

// A chain on an existing promise (`p.catch(log)`) only attaches a handler; one rooted at a call starts work.
function chainStartsWork(call) {
  let current = call;
  while (current.type === "CallExpression" && CHAIN_METHODS.has(methodName(current))) {
    current = unwrap(unwrap(current.callee).object);
  }
  return current.type === "CallExpression" || current.type === "NewExpression";
}

function isUnowned(expression) {
  let call = null;
  if (expression.type === "UnaryExpression" && expression.operator === "void") {
    const argument = unwrap(expression.argument);
    if (argument.type === "CallExpression") call = argument;
  } else if (
    expression.type === "CallExpression" &&
    CHAIN_METHODS.has(methodName(expression)) &&
    chainStartsWork(expression)
  ) {
    call = expression;
  }
  return call !== null && !OWNER_METHODS.has(methodName(call));
}

// A returned chain leaks only through a callback whose caller drops the result (timers, listeners).
function callbackResultDropped(arrow) {
  const parent = arrow.parent;
  if (parent?.type !== "CallExpression" || !parent.arguments.includes(arrow)) return false;
  const name = methodName(parent);
  return !OWNER_METHODS.has(name) && !CHAIN_METHODS.has(name);
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow fire-and-forget promise work that no TaskGroup owns",
    },
    messages: {
      unowned:
        "Fire-and-forget work outlives its caller, so shutdown cannot wait for it. Await it, or hand it to a TaskGroup (`background.spawn` for request work).",
    },
    schema: [],
  },
  create(context) {
    return {
      ExpressionStatement(node) {
        if (isUnowned(unwrap(node.expression))) context.report({ node, messageId: "unowned" });
      },
      ArrowFunctionExpression(node) {
        if (node.body.type === "BlockStatement") return;
        const body = unwrap(node.body);
        const discarded = body.type === "UnaryExpression" || callbackResultDropped(node);
        if (discarded && isUnowned(body)) context.report({ node: node.body, messageId: "unowned" });
      },
    };
  },
};
