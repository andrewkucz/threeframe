import type { StateValue } from "./manifest";

/**
 * A test against game state. Either an expression such as `coins >= 10 && !cursed` or
 * `completed("cellar")`, or the equivalent JSON form: `{ var, op?, value? }`, `{ all: [...] }`,
 * `{ any: [...] }`, `{ not: ... }`, `{ completed: id }`.
 */
export type Condition =
  | string
  | boolean
  | {
      var: string;
      op?: ComparisonOperator;
      /** Defaults to `true`. */
      value?: StateValue;
    }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] }
  | { not: Condition }
  /** A scene or level id that has been completed. */
  | { completed: string };

export type ComparisonOperator = "==" | "!=" | ">" | ">=" | "<" | "<=";

export interface ConditionContext {
  variables: Readonly<Record<string, StateValue>>;
  /** Whether a scene or level id has been completed. */
  completed: (id: string) => boolean;
}

type Node =
  | { type: "literal"; value: StateValue }
  | { type: "var"; name: string }
  | { type: "call"; name: string; args: Node[] }
  | { type: "not"; operand: Node }
  | { type: "binary"; op: string; left: Node; right: Node };

const TOKEN =
  /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(&&|\|\||==|!=|>=|<=|[<>!(),])|([A-Za-z_][\w.]*))/y;
const cache = new Map<string, Node>();

function parseExpression(source: string): Node {
  const cached = cache.get(source);
  if (cached) return cached;
  const tokens: { kind: "number" | "string" | "op" | "word"; text: string }[] = [];
  TOKEN.lastIndex = 0;
  let index = 0;
  while (index < source.length) {
    if (!source.slice(index).trim()) break;
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(source);
    if (!match) throw new Error(`Unexpected "${source.slice(index).trim()[0]}" in: ${source}`);
    index = TOKEN.lastIndex;
    if (match[1]) tokens.push({ kind: "number", text: match[1] });
    else if (match[2]) tokens.push({ kind: "string", text: match[2] });
    else if (match[3]) tokens.push({ kind: "op", text: match[3] });
    else tokens.push({ kind: "word", text: match[4] });
  }
  let position = 0;
  const peek = () => tokens[position];
  const accept = (text: string) => {
    if (peek()?.kind === "op" && peek().text === text) {
      position++;
      return true;
    }
    return false;
  };
  const expect = (text: string) => {
    if (!accept(text)) throw new Error(`Expected "${text}" in: ${source}`);
  };
  const binary = (next: () => Node, ops: string[]) => (): Node => {
    let left = next();
    for (;;) {
      const op = ops.find((candidate) => accept(candidate));
      if (!op) return left;
      left = { type: "binary", op, left, right: next() };
    }
  };
  const primary = (): Node => {
    const token = tokens[position++];
    if (!token) throw new Error(`Unexpected end of condition: ${source}`);
    if (token.kind === "number") return { type: "literal", value: Number(token.text) };
    if (token.kind === "string")
      return {
        type: "literal",
        value: token.text.startsWith('"')
          ? (JSON.parse(token.text) as string)
          : token.text.slice(1, -1).replace(/\\(.)/g, "$1"),
      };
    if (token.kind === "op" && token.text === "!") return { type: "not", operand: primary() };
    if (token.kind === "op" && token.text === "(") {
      const inner = or();
      expect(")");
      return inner;
    }
    if (token.kind === "word") {
      if (token.text === "true" || token.text === "false")
        return { type: "literal", value: token.text === "true" };
      if (token.text === "not") return { type: "not", operand: primary() };
      if (accept("(")) {
        const args: Node[] = [];
        if (!accept(")")) {
          do args.push(or());
          while (accept(","));
          expect(")");
        }
        return { type: "call", name: token.text, args };
      }
      return { type: "var", name: token.text };
    }
    throw new Error(`Unexpected "${token.text}" in: ${source}`);
  };
  const comparison = binary(primary, ["==", "!=", ">=", "<=", ">", "<"]);
  const and = binary(comparison, ["&&"]);
  const or: () => Node = binary(and, ["||"]);
  const root = or();
  if (position < tokens.length)
    throw new Error(`Unexpected "${tokens[position].text}" in: ${source}`);
  cache.set(source, root);
  return root;
}

function compare(op: string, left: StateValue, right: StateValue): boolean {
  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    default:
      throw new Error(`Unknown operator: ${op}`);
  }
}

function evaluateNode(node: Node, context: ConditionContext): StateValue {
  switch (node.type) {
    case "literal":
      return node.value;
    case "var":
      if (!(node.name in context.variables)) throw new Error(`Unknown variable: ${node.name}`);
      return context.variables[node.name];
    case "not":
      return !evaluateNode(node.operand, context);
    case "call": {
      if (node.name !== "completed" || node.args.length !== 1)
        throw new Error(`Unknown function: ${node.name}`);
      return context.completed(String(evaluateNode(node.args[0], context)));
    }
    case "binary":
      if (node.op === "&&")
        return !!evaluateNode(node.left, context) && !!evaluateNode(node.right, context);
      if (node.op === "||")
        return !!evaluateNode(node.left, context) || !!evaluateNode(node.right, context);
      return compare(node.op, evaluateNode(node.left, context), evaluateNode(node.right, context));
  }
}

/** Evaluates a condition. Throws on syntax errors and unknown variables. */
export function evaluateCondition(condition: Condition, context: ConditionContext): boolean {
  if (typeof condition === "boolean") return condition;
  if (typeof condition === "string") return !!evaluateNode(parseExpression(condition), context);
  if ("all" in condition) return condition.all.every((part) => evaluateCondition(part, context));
  if ("any" in condition) return condition.any.some((part) => evaluateCondition(part, context));
  if ("not" in condition) return !evaluateCondition(condition.not, context);
  if ("completed" in condition) return context.completed(condition.completed);
  if (!(condition.var in context.variables)) throw new Error(`Unknown variable: ${condition.var}`);
  return compare(condition.op ?? "==", context.variables[condition.var], condition.value ?? true);
}

/** Syntax and reference problems in a condition, for editors; empty when it is valid. */
export function checkCondition(condition: Condition, variables: readonly string[]): string[] {
  const problems: string[] = [];
  const names = new Set(variables);
  const visitNode = (node: Node) => {
    if (node.type === "var" && !names.has(node.name))
      problems.push(`Unknown variable: ${node.name}`);
    if (node.type === "call" && node.name !== "completed")
      problems.push(`Unknown function: ${node.name}`);
    if (node.type === "not") visitNode(node.operand);
    if (node.type === "call") node.args.forEach(visitNode);
    if (node.type === "binary") {
      visitNode(node.left);
      visitNode(node.right);
    }
  };
  const visit = (part: Condition) => {
    if (typeof part === "boolean") return;
    if (typeof part === "string") {
      try {
        visitNode(parseExpression(part));
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    } else if ("all" in part) part.all.forEach(visit);
    else if ("any" in part) part.any.forEach(visit);
    else if ("not" in part) visit(part.not);
    else if ("var" in part && !names.has(part.var)) problems.push(`Unknown variable: ${part.var}`);
  };
  visit(condition);
  return problems;
}
