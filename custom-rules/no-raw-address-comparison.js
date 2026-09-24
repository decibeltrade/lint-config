// `addr` must start a camel/snake segment so words like `paddr` stay out.
const ADDRESS_NAME = /(?:[Aa]ddress|(?:^|_)addr|(?:^|[a-z0-9_])Addr)$/;
// Collections are named plurally, so the singular pattern misses the receiver of a membership test.
const ADDRESS_COLLECTION = /(?:[Aa]ddress(?:es)?|(?:^|_)addrs?|(?:^|[a-z0-9_])Addrs?)$/;
const SCREAMING_SNAKE = /^[A-Z0-9_]*[A-Z][A-Z0-9_]*$/;
// ADDRESS_NAME is case-sensitive, so all-caps address constants need their own check.
const ADDRESS_LIKE_CONST = /(?:ADDRESS|(?:^|_)ADDR)$/;
const HEX_ADDRESS_LITERAL = /^0x[0-9a-fA-F]+$/;
const CANONICALIZERS = new Set(["canonicalAptosAddress", "addressComparisonKey", "addressesEqual"]);
const CASE_NORMALIZERS = new Set(["toLowerCase", "toUpperCase"]);
const MEMBERSHIP_METHODS = new Set(["includes", "indexOf", "lastIndexOf", "has"]);
// A canonical key can be hoisted through several consts before it reaches the compare.
const MAX_RESOLVE_DEPTH = 6;

// Case folding cannot restore leading zero bytes trimmed by RPC responses.
function unwrapCaseNormalization(node) {
  let current = node;
  while (
    current.type === "CallExpression" &&
    current.arguments.length === 0 &&
    current.callee.type === "MemberExpression" &&
    !current.callee.computed &&
    current.callee.property?.type === "Identifier" &&
    CASE_NORMALIZERS.has(current.callee.property.name)
  ) {
    current = current.callee.object;
  }
  return current;
}

function terminalName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

function isCanonicalizerCall(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier") return CANONICALIZERS.has(callee.name);
  return (
    callee.type === "MemberExpression" &&
    callee.property?.type === "Identifier" &&
    CANONICALIZERS.has(callee.property.name)
  );
}

function soleInitializer(node, scope) {
  if (node.type !== "Identifier" || !scope) return null;
  let current = scope;
  while (current) {
    const variable = current.variables.find((v) => v.name === node.name);
    if (variable) {
      const writes = variable.defs.filter((d) => d.node?.type === "VariableDeclarator");
      if (writes.length !== 1 || variable.references.some((r) => r.isWrite() && !r.init))
        return null;
      return writes[0].node.init ?? null;
    }
    current = current.upper;
  }
  return null;
}

/**
 * The repo idiom hoists the key out of the loop (`const k = addressComparisonKey(x)`),
 * so a compare against a bare identifier is still canonical when that identifier
 * traces back to a canonicalizer.
 */
function isCanonical(node, scope, depth = 0) {
  if (depth > MAX_RESOLVE_DEPTH) return false;
  if (isCanonicalizerCall(node)) return true;
  if (node.type === "LogicalExpression") return isCanonical(node.right, scope, depth + 1);
  if (node.type === "ConditionalExpression") {
    // A guarded canonicalizer falls back to undefined; that branch carries no address.
    const branches = [node.consequent, node.alternate].filter((b) => !isSentinel(b));
    return branches.length > 0 && branches.every((b) => isCanonical(b, scope, depth + 1));
  }
  if (node.type === "TSNonNullExpression" || node.type === "TSAsExpression") {
    return isCanonical(node.expression, scope, depth + 1);
  }
  const init = soleInitializer(node, scope);
  return init ? isCanonical(init, scope, depth + 1) : false;
}

// A SCREAMING_SNAKE name is a module-constant placeholder, not an address read off the chain.
function isSentinel(node) {
  const name = terminalName(node);
  if (node.type === "Literal") {
    // A 0x-prefixed literal is an address, and comparing one raw is the padding bug itself.
    return typeof node.value !== "string" || !HEX_ADDRESS_LITERAL.test(node.value);
  }
  return (
    node.type === "TemplateLiteral" ||
    (node.type === "Identifier" && node.name === "undefined") ||
    (node.type === "UnaryExpression" && node.operator === "typeof") ||
    (name !== null && SCREAMING_SNAKE.test(name) && !ADDRESS_LIKE_CONST.test(name))
  );
}

// A hex literal never makes a comparison address-typed on its own — `status === "0x1"`
// is a status code. It only loses its sentinel exemption when the other side is an address.
function isAddressLike(node) {
  const name = terminalName(node);
  return name !== null && ADDRESS_NAME.test(name);
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow raw ===/!== comparison of Aptos addresses",
      url: "https://github.com/aptos-labs/etna/blob/main/typescript/apps/web/src/utils/address.ts",
    },
    messages: {
      forbidden:
        "Compare Aptos addresses via addressesEqual()/addressComparisonKey() — raw compares silently fail for addresses with a leading zero byte.",
      halfCanonical:
        "One side is canonicalized and the other is not, so this never matches a short-form address. Canonicalize both sides.",
      membership:
        "Membership tests on Aptos addresses need canonical keys on both sides — compare via addressComparisonKey().",
    },
    schema: [],
  },
  create(context) {
    const scopeFor = (node) =>
      context.sourceCode?.getScope ? context.sourceCode.getScope(node) : null;

    return {
      BinaryExpression(node) {
        if (node.operator !== "===" && node.operator !== "!==") return;
        if (node.left.type === "PrivateIdentifier") return;

        const scope = scopeFor(node);
        const left = unwrapCaseNormalization(node.left);
        const right = unwrapCaseNormalization(node.right);

        const leftCanonical = isCanonical(left, scope);
        const rightCanonical = isCanonical(right, scope);
        if (leftCanonical && rightCanonical) return;

        if (leftCanonical !== rightCanonical) {
          // Only an address-NAMED raw side is reportable. A bare `key`/`wanted` is
          // almost always a callback param already holding a canonical value, and
          // the rule has no types to tell the two apart.
          const raw = leftCanonical ? right : left;
          if (isAddressLike(raw)) context.report({ node, messageId: "halfCanonical" });
          return;
        }

        if (isSentinel(left) || isSentinel(right)) return;

        const leftName = terminalName(left);
        const rightName = terminalName(right);
        if (leftName === "length" || rightName === "length") return;

        if (isAddressLike(left) || isAddressLike(right)) {
          context.report({ node, messageId: "forbidden" });
        }
      },

      // `markets.includes(addr)` is the same bug as `===`, and the BinaryExpression visitor cannot see it.
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property?.type !== "Identifier" ||
          !MEMBERSHIP_METHODS.has(callee.property.name) ||
          node.arguments.length !== 1
        ) {
          return;
        }

        const scope = scopeFor(node);
        const needle = unwrapCaseNormalization(node.arguments[0]);
        if (needle.type === "SpreadElement") return;
        if (isCanonical(needle, scope)) return;
        if (isSentinel(needle)) return;

        const receiverName = terminalName(callee.object);
        const receiverIsAddressCollection =
          receiverName !== null && ADDRESS_COLLECTION.test(receiverName);

        if (isAddressLike(needle) || receiverIsAddressCollection) {
          context.report({ node, messageId: "membership" });
        }
      },
    };
  },
};
