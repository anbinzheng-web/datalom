// Research only: decode a reviewed public asset, never imported by the worker.
import { parse } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import { generate } from "@babel/generator";
import { createContext, runInContext } from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const source = readFileSync(
  process.argv[2] ?? "/tmp/datalom-x-ondemand.js",
  "utf8",
);
const sha256 = createHash("sha256").update(source).digest("hex");
// The decoder and table rotation are reviewed before execution. VM is not a security boundary.
if (
  sha256 !== "1b0ac38199e80c9d4a3042a0cc767e4d5077007204ce87da2e678aa5d716163e"
)
  throw Error("Unreviewed source version; review decoder before adding hash");
const ast = parse(source);
let modulePath: any;
traverse(ast, {
  ObjectMethod(p) {
    if (p.node.key.type === "NumericLiteral" && p.node.key.value === 208932)
      modulePath = p;
  },
});
const statements = modulePath.get("body.body");
const decoder = statements[0],
  table = statements[1];
const rotation = statements[2].get("expression.expressions").at(-1);
const sandbox = createContext(Object.create(null), {
  codeGeneration: { strings: false, wasm: false },
});
runInContext(
  [decoder, table].map((p: any) => generate(p.node).code).join("\n") +
    "\n(" +
    generate(rotation.node).code +
    ");",
  sandbox,
  { timeout: 1000 },
);
const UNKNOWN = Symbol("unknown");
function value(p: any, env = new Map<any, any>(), depth = 0): any {
  if (!p?.node || depth > 35) return UNKNOWN;
  const n = p.node,
    next = (q: any) => value(q, env, depth + 1);
  if (p.isLiteral() && "value" in n) return n.value;
  if (p.isIdentifier()) {
    if (n.name === "NaN") return NaN;
    const b = p.scope.getBinding(n.name);
    if (env.has(b)) return env.get(b);
    if (b?.constant && b.path.isVariableDeclarator())
      return next(b.path.get("init"));
    return UNKNOWN;
  }
  if (p.isUnaryExpression()) {
    const a = next(p.get("argument"));
    if (a === UNKNOWN) return UNKNOWN;
    switch (n.operator) {
      case "-":
        return -a;
      case "+":
        return +a;
      case "!":
        return !a;
      case "~":
        return ~a;
      case "void":
        return undefined;
    }
  }
  if (p.isBinaryExpression()) {
    const a = next(p.get("left")),
      b = next(p.get("right"));
    if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
    switch (n.operator) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return a / b;
      case "%":
        return a % b;
      case "**":
        return a ** b;
      case "===":
        return a === b;
      case "!==":
        return a !== b;
      case "==":
        return a == b;
      case "!=":
        return a != b;
    }
  }
  if (
    p.isAssignmentExpression() &&
    n.operator === "=" &&
    p.get("left").isIdentifier()
  ) {
    const a = next(p.get("right"));
    env.set(p.scope.getBinding(n.left.name), a);
    return a;
  }
  if (p.isSequenceExpression()) {
    let a: any;
    for (const q of p.get("expressions")) a = next(q);
    return a;
  }
  if (p.isMemberExpression()) {
    const obj = p.get("object"),
      key = n.computed ? next(p.get("property")) : n.property.name;
    const b = obj.isIdentifier()
      ? obj.scope.getBinding(obj.node.name)
      : undefined;
    const init = b?.path.isVariableDeclarator() ? b.path.get("init") : obj;
    if (init?.isObjectExpression()) {
      const prop = init
        .get("properties")
        .find(
          (x: any) =>
            x.isObjectProperty() &&
            (x.node.computed
              ? next(x.get("key"))
              : (x.node.key.name ?? x.node.key.value)) === key,
        );
      if (prop) return next(prop.get("value"));
    }
  }
  if (p.isCallExpression()) {
    const callee = p.get("callee"),
      args = p.get("arguments").map(next);
    const binding = callee.isIdentifier()
      ? callee.scope.getBinding(callee.node.name)
      : undefined;
    if (binding?.path === decoder) {
      if (
        args.some((x: any) => x === UNKNOWN) ||
        typeof args[0] !== "number" ||
        typeof args[1] !== "string"
      )
        return UNKNOWN;
      return runInContext(`r(${args[0]},${JSON.stringify(args[1])})`, sandbox, {
        timeout: 100,
      });
    }
    let fn: any = binding?.path.isFunctionDeclaration()
      ? binding.path
      : callee.isFunctionExpression()
        ? callee
        : undefined;
    if (!fn) return UNKNOWN;
    const returns = fn
      .get("body.body")
      .filter((x: any) => x.isReturnStatement());
    if (
      returns.length !== 1 ||
      !fn
        .get("body.body")
        .every((x: any) => x.isReturnStatement() || x.isVariableDeclaration())
    )
      return UNKNOWN;
    const inner = new Map(env);
    fn.get("params").forEach((x: any, i: number) =>
      inner.set(x.scope.getBinding(x.node.name), args[i]),
    );
    return value(returns[0].get("argument"), inner, depth + 1);
  }
  return UNKNOWN;
}
let decoded = 0;
modulePath.get("body").traverse({
  CallExpression: {
    exit(p: NodePath<any>) {
      if (p.node.start! >= 5971) {
        const v = value(p);
        if (typeof v === "string") {
          p.replaceWith({ type: "StringLiteral", value: v });
          decoded++;
        }
      }
    },
  },
});
// Fold concatenated strings/property keys, retaining the original factory logic.
for (let pass = 0; pass < 3; pass++)
  modulePath.get("body").traverse({
    BinaryExpression: {
      exit(p: NodePath<any>) {
        if (p.node.start! < 5971) return;
        const v = value(p);
        if (typeof v === "string")
          p.replaceWith({ type: "StringLiteral", value: v });
      },
    },
    MemberExpression: {
      exit(p: NodePath<any>) {
        if (
          p.node.computed &&
          p.node.property.type === "StringLiteral" &&
          /^[$A-Z_a-z][$\w]*$/.test(p.node.property.value)
        ) {
          p.node.computed = false;
          p.node.property = { type: "Identifier", name: p.node.property.value };
        }
      },
    },
  });
const factory = modulePath.get("body.body")[3];
mkdirSync("artifacts/x/source-analysis", { recursive: true });
const file = "artifacts/x/source-analysis/transaction.decoded.js";
writeFileSync(
  file,
  `// Original public asset SHA256: ${sha256}\n// String decoding only. Dead branches and wrapper calls are retained.\n${generate(factory.node, { comments: true }).code}\n`,
);
writeFileSync(
  "artifacts/x/source-analysis/transaction-source.json",
  JSON.stringify(
    { sha256, decoded, originalBytes: source.length, file },
    null,
    2,
  ),
);
console.log({ sha256, decoded, file });
