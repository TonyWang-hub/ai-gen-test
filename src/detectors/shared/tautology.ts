import { Detector, DimensionResult, Finding } from '../../core/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AST property keys that contain no child nodes and should be skipped. */
const SKIP_KEYS = new Set([
  'type',
  'loc',
  'range',
  'start',
  'end',
  'comments',
  'tokens',
  'leadingComments',
  'trailingComments',
  'extra',
  'errors',
  'parent',
]);

/** Matchers that do not accept a user-supplied comparison value. */
const NO_ARG_MATCHERS = new Set([
  'toBeNull',
  'toBeUndefined',
  'toBeDefined',
  'toBeTruthy',
  'toBeFalsy',
  'toBeNaN',
  'toHaveReturned',
  'toHaveReturnedUndefined',
  'toThrow',
  'toThrowError',
]);

// ---------------------------------------------------------------------------
// AST Walk
// ---------------------------------------------------------------------------

/**
 * Depth-first traversal of an ESTree-compatible AST.  Only visits objects
 * that have a string `.type` property, which is the standard way to identify
 * AST nodes.
 */
function walk(node: unknown, visitor: (node: any) => void): void {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (SKIP_KEYS.has(key)) continue;
    const child = (node as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && typeof (item as any).type === 'string') {
          walk(item, visitor);
        }
      }
    } else if (child && typeof child === 'object' && typeof (child as any).type === 'string') {
      walk(child, visitor);
    }
  }
}

function nodeLine(node: any): number {
  return node.loc?.start?.line ?? 0;
}

// ---------------------------------------------------------------------------
// Structural AST Comparison
// ---------------------------------------------------------------------------

/**
 * Compare two AST nodes structurally.
 *
 * Returns `false` for `Literal` nodes because comparing a value against a
 * known literal is legitimate (e.g. `expect(result).toBe(42)`).
 */
function nodesEqual(a: any, b: any): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'Identifier':
      return a.name === b.name;

    case 'Literal':
      return false;

    case 'CallExpression':
      return (
        nodesEqual(a.callee, b.callee) &&
        a.arguments.length === b.arguments.length &&
        a.arguments.every((arg: any, i: number) => nodesEqual(arg, b.arguments[i]))
      );

    case 'MemberExpression':
      return (
        nodesEqual(a.object, b.object) &&
        nodesEqual(a.property, b.property) &&
        a.computed === b.computed
      );

    case 'ArrayExpression':
      return (
        a.elements.length === b.elements.length &&
        a.elements.every((el: any, i: number) => nodesEqual(el, b.elements[i]))
      );

    case 'UnaryExpression':
      return a.operator === b.operator && nodesEqual(a.argument, b.argument);

    case 'BinaryExpression':
      return (
        a.operator === b.operator &&
        nodesEqual(a.left, b.left) &&
        nodesEqual(a.right, b.right)
      );

    case 'TemplateLiteral':
      return (
        a.expressions.length === b.expressions.length &&
        a.expressions.every((exp: any, i: number) => nodesEqual(exp, b.expressions[i]))
      );

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Assertion Chain Detection
// ---------------------------------------------------------------------------

/**
 * True when `node` is the outermost CallExpression of a Jest/Vitest
 * assertion chain, e.g. `expect(…).toXxx(…)`.
 *
 * The chain may contain intermediate modifiers such as `.resolves`,
 * `.rejects`, or `.not`:
 *   expect(x).toBe(y)             → true
 *   expect(fn()).resolves.toBe(y) → true
 *   Math.max(1, 2)                → false
 */
function isAssertionChain(node: any): boolean {
  if (node?.type !== 'CallExpression') return false;
  if (node.callee?.type !== 'MemberExpression') return false;
  if (node.callee.property?.type !== 'Identifier') return false;

  const matcherName: string = node.callee.property.name;
  if (!matcherName.startsWith('to')) return false;

  // Walk down the MemberExpression chain looking for expect(…)
  let current: any = node.callee.object;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee?.type === 'Identifier' &&
      current.callee.name === 'expect'
    ) {
      return true;
    }
    if (current.type === 'MemberExpression') {
      current = current.object;
    } else {
      break;
    }
  }

  return false;
}

/**
 * Walk backwards through an expect(…).foo.bar(…) chain to find the argument
 * that was passed to `expect(…)`.
 *
 *   expect(x).toBe(y)        → Identifier(x)
 *   expect(fn()).toBe(y)     → CallExpression(fn)
 *   expect(a.b).resolves.toBe(y) → MemberExpression(a.b)
 */
function expectArgFromChain(outerCall: any): any | null {
  let current: any = outerCall;
  for (;;) {
    if (
      current.type === 'CallExpression' &&
      current.callee?.type === 'Identifier' &&
      current.callee.name === 'expect'
    ) {
      return current.arguments[0] ?? null;
    }
    if (current.type === 'CallExpression' && current.callee?.type === 'MemberExpression') {
      current = current.callee.object;
    } else if (current.type === 'MemberExpression') {
      current = current.object;
    } else {
      return null;
    }
  }
}

/**
 * Extract assertion metadata from the outermost CallExpression of an
 * assertion chain.
 *
 * Returns `null` when the node is not a value-level assertion (e.g. uses a
 * no-argument matcher like `toBeNull`).
 */
function assertionInfo(
  outerCall: any,
): { method: string; assertArg: any | null; expectArg: any | null } | null {
  if (outerCall?.type !== 'CallExpression') return null;

  const callee = outerCall.callee;
  if (callee?.type !== 'MemberExpression' || callee.property?.type !== 'Identifier') return null;

  const method: string = callee.property.name;
  if (!method.startsWith('to')) return null;
  if (NO_ARG_MATCHERS.has(method)) return null;

  // toHaveProperty(propPath, expected) — comparison value is the second arg
  const assertArg =
    method === 'toHaveProperty'
      ? (outerCall.arguments[1] ?? null)
      : (outerCall.arguments[0] ?? null);

  const expectArg = expectArgFromChain(outerCall);

  return { method, assertArg, expectArg };
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

/** Produce a human-readable callee description (e.g. `obj.method`). */
function describeCallee(callee: any): string {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') {
    const obj = describeCallee(callee.object);
    const prop = callee.property.type === 'Identifier' ? callee.property.name : '';
    return `${obj}.${prop}`;
  }
  return '<anonymous>';
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const tautologyDetector: Detector = {
  id: 'tautology',
  name: 'Tautology Detector',

  analyze(ast: any, _source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];

    // ---- 1. Locate it() / test() blocks ----------------------------------

    const testBlocks: Array<{ callback: any; line: number }> = [];

    walk(ast, (node) => {
      if (node.type !== 'CallExpression') return;

      const callee = node.callee;
      if (!callee) return;

      // Direct call: it(...) / test(...)
      if (
        callee.type === 'Identifier' &&
        (callee.name === 'it' || callee.name === 'test') &&
        node.arguments.length >= 2
      ) {
        const fn = node.arguments[1];
        if (
          fn &&
          (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')
        ) {
          testBlocks.push({ callback: fn, line: nodeLine(node) });
        }
        return;
      }

      // Chained: it.skip(...) / test.only(...) / test.todo(...)
      if (
        callee.type === 'MemberExpression' &&
        callee.object?.type === 'Identifier' &&
        (callee.object.name === 'it' || callee.object.name === 'test') &&
        callee.property?.type === 'Identifier' &&
        (callee.property.name === 'skip' ||
          callee.property.name === 'only' ||
          callee.property.name === 'todo') &&
        node.arguments.length >= 2
      ) {
        const fn = node.arguments[1];
        if (
          fn &&
          (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')
        ) {
          testBlocks.push({ callback: fn, line: nodeLine(node) });
        }
      }
    });

    // ---- 2. Analyze each block -------------------------------------------

    for (const block of testBlocks) {
      // Maps variable name → its initializer AST node so we can detect
      // indirect tautologies (Pattern 3).
      const varDecls = new Map<string, any>();

      // Collect every value-level assertion found inside the callback.
      const blockAssertions: Array<{
        line: number;
        expectArg: any;
        assertArg: any;
        method: string;
      }> = [];

      // Walk the entire callback recursively in a single pass.
      walk(block.callback, (node) => {
        // Collect variable declarations
        if (
          node.type === 'VariableDeclarator' &&
          node.id?.type === 'Identifier' &&
          node.init
        ) {
          varDecls.set(node.id.name, node.init);
        }

        // Detect assertion chains
        if (isAssertionChain(node)) {
          const info = assertionInfo(node);
          if (info) {
            blockAssertions.push({
              line: nodeLine(node),
              expectArg: info.expectArg,
              assertArg: info.assertArg,
              method: info.method,
            });
          }
        }
      });

      // ---- 3. Check for tautologies within this block --------------------

      for (const { expectArg, assertArg, line, method } of blockAssertions) {
        if (!expectArg || !assertArg) continue;

        // Pattern 1 & 3: same identifier on both sides
        if (
          expectArg.type === 'Identifier' &&
          assertArg.type === 'Identifier' &&
          expectArg.name === assertArg.name
        ) {
          findings.push({
            type: 'same-variable',
            severity: 'high',
            line,
            message: `Tautology: expect(${expectArg.name}).${method}(${expectArg.name}) compares a variable with itself.`,
            suggestion:
              'Replace with an assertion against an expected value, or remove the test.',
          });
          continue;
        }

        // Pattern 2: same function call on both sides
        if (nodesEqual(expectArg, assertArg)) {
          if (expectArg.type === 'CallExpression') {
            const calleeStr = describeCallee(expectArg.callee);
            findings.push({
              type: 'same-function-call',
              severity: 'high',
              line,
              message: `Tautology: calling ${calleeStr}() twice and comparing the results is meaningless — each call may return a different value.`,
              suggestion:
                'Store the result in a variable and assert against a concrete expected value.',
            });
          } else {
            // Same non-identifier, non-call expression on both sides
            // e.g. expect(a.b).toEqual(a.b) or expect(a + b).toBe(a + b)
            findings.push({
              type: 'same-expression',
              severity: 'high',
              line,
              message: `Tautology: the same expression appears on both sides of expect().${method}().`,
              suggestion:
                'Assert against an independent expected value instead.',
            });
          }
        }
      }

      // ---- 4. Pattern 4: Setup-only (no assertions found) ----------------

      if (blockAssertions.length === 0) {
        // Check whether the body actually contains something executable.
        const body = block.callback.body;
        const stmts: any[] =
          body.type === 'BlockStatement' ? (body.body ?? []) : [body];

        if (stmts.length > 0) {
          findings.push({
            type: 'setup-only',
            severity: 'low',
            line: block.line,
            message:
              'Test block contains code but no assertions. It may be incomplete or a dead test.',
            suggestion:
              'Add an assertion to verify behaviour, or remove the block if it is unused.',
          });
        }
      }
    }

    // ---- 5. Score --------------------------------------------------------
    //
    //   0 tautologies → 10
    //   1 tautology   →  7
    //   2+ tautologies →  4
    //   Setup-only findings do not affect the tautology score.

    const tautologyCount = findings.filter(
      (f) => f.type !== 'setup-only',
    ).length;

    let score: number;
    if (tautologyCount === 0) {
      score = 10;
    } else if (tautologyCount === 1) {
      score = 7;
    } else {
      score = 4;
    }

    return {
      id: 'tautology',
      name: 'Tautology Detector',
      score,
      maxScore: 10,
      findings,
    };
  },
};
