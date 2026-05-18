import { Detector, DimensionResult, Finding } from '../../core/types';

/**
 * Over-Mocking Detector
 *
 * Finds tests that mock too many dependencies by calculating the ratio of
 * mock/stub/spy calls to assertion calls across a test file.
 *
 * Scoring:
 *   - mock/assertion ratio < 50%  => 10 (good)
 *   - mock/assertion ratio 50-80% =>  6 (acceptable)
 *   - mock/assertion ratio > 80%  =>  3 (over-mocking)
 *   - no assertions found         =>  0 (likely not a real test)
 */

// --- Mock patterns ---

const MOCK_OBJECT_NAMES = ['jest', 'vi', 'sinon'];
const MOCK_MEMBER_PROPERTIES: Record<string, string[]> = {
  jest: ['mock', 'fn', 'spyOn', 'mockImplementation', 'doMock'],
  vi: ['mock', 'fn', 'spyOn', 'doMock'],
  sinon: ['mock', 'stub', 'spy'],
};
// Flatten all known mock member properties for generic matching
const MOCK_PROPERTIES: string[] = [];
const seen = new Set<string>();
for (const props of Object.values(MOCK_MEMBER_PROPERTIES)) {
  for (const p of props) {
    if (!seen.has(p)) {
      seen.add(p);
      MOCK_PROPERTIES.push(p);
    }
  }
}

const STANDALONE_MOCK_NAMES = new Set(['createMock', 'mock', 'Mock']);

// --- Assertion patterns ---

const ASSERTION_IDENTIFIERS = new Set(['expect', 'assert', 'verify', 'calledWith']);

const overMockingDetector: Detector = {
  id: 'over-mocking',
  name: 'Over-Mocking Detector',

  analyze(ast: any, _source: string, filePath: string): DimensionResult {
    let mockCount = 0;
    let assertionCount = 0;
    const findings: Finding[] = [];

    walkAST(ast, (node) => {
      // --- Decorator: @Mock ---
      if (node.type === 'Decorator' && node.expression) {
        const expr = node.expression;
        if (
          (expr.type === 'Identifier' && expr.name === 'Mock') ||
          (expr.type === 'CallExpression' &&
            expr.callee?.type === 'Identifier' &&
            expr.callee.name === 'Mock')
        ) {
          mockCount++;
          findings.push({
            type: 'mock',
            severity: 'low',
            line: loc(node),
            message: `Mock decorator found: @Mock`,
          });
          return;
        }
      }

      // --- CallExpression ---
      if (node.type !== 'CallExpression' || !node.callee) return;

      const callee = node.callee;

      if (isMockCall(callee)) {
        mockCount++;
        findings.push({
          type: 'mock',
          severity: 'low',
          line: loc(node),
          message: `Mock call found: ${formatCallee(callee)}`,
        });
      }

      if (isAssertionCall(node)) {
        assertionCount++;
        findings.push({
          type: 'assertion',
          severity: 'low',
          line: loc(node),
          message: `Assertion call found: ${formatCallee(callee)}`,
        });
      }
    });

    // --- Score calculation ---
    const maxScore = 10;
    let score: number;

    if (assertionCount === 0) {
      score = 0;
      findings.push({
        type: 'no-assertions',
        severity: 'high',
        line: 0,
        message:
          'No assertion calls found in this file. The test file may be missing assertions or may not be a valid test.',
        suggestion:
          'Add assertion calls (expect, assert, verify, calledWith, etc.) to validate test behavior.',
      });
    } else {
      const ratio = mockCount / assertionCount;
      if (ratio < 0.5) {
        score = 10;
      } else if (ratio <= 0.8) {
        score = 6;
      } else {
        score = 3;
      }
    }

    return {
      id: 'over-mocking',
      name: 'Over-Mocking Detector',
      score,
      maxScore,
      findings,
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely extract the starting line number from an AST node. */
function loc(node: any): number {
  return node?.loc?.start?.line ?? 0;
}

// ---- Mock detection ----

/**
 * Returns `true` when the callee of a `CallExpression` matches one of the
 * known mock/stub/spy patterns.
 */
function isMockCall(callee: any): boolean {
  if (!callee || typeof callee !== 'object') return false;

  // Pattern 1: `jest.mock()`, `jest.fn()`, `vi.spyOn()`, `sinon.stub()`, ...
  if (callee.type === 'MemberExpression') {
    if (
      callee.object?.type === 'Identifier' &&
      callee.property?.type === 'Identifier' &&
      MOCK_OBJECT_NAMES.includes(callee.object.name) &&
      MOCK_PROPERTIES.includes(callee.property.name)
    ) {
      return true;
    }
    return false;
  }

  // Pattern 2: `createMock()`, `mock()`, `Mock()` (standalone)
  if (callee.type === 'Identifier') {
    return STANDALONE_MOCK_NAMES.has(callee.name);
  }

  return false;
}

// ---- Assertion detection ----

/**
 * Returns `true` when the `CallExpression` represents an assertion.
 */
function isAssertionCall(node: any): boolean {
  const callee = node.callee;
  if (!callee || typeof callee !== 'object') return false;

  // `expect(...)` (the entry point of an expect chain)
  if (callee.type === 'Identifier' && callee.name === 'expect') {
    return true;
  }

  // `assert(...)` or `assert.xxx(...)`
  if (callee.type === 'Identifier' && callee.name === 'assert') {
    return true;
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'assert'
  ) {
    return true;
  }

  // `verify()` (Mockito-style behaviour verification)
  if (callee.type === 'Identifier' && callee.name === 'verify') {
    return true;
  }

  // `calledWith()` (sinon/Mockito argument verification)
  if (callee.type === 'Identifier' && callee.name === 'calledWith') {
    return true;
  }

  // `to.*` matchers chained off an `expect()` call, e.g.
  //   expect(x).toBe(y)
  //   expect(x).not.toBe(y)
  //   expect(x).resolves.toEqual(z)
  if (
    callee.type === 'MemberExpression' &&
    callee.property?.type === 'Identifier' &&
    callee.property.name.startsWith('to') &&
    callee.property.name.length > 2 /* "to" plus at least one more char */ &&
    originatesFromExpect(callee.object)
  ) {
    return true;
  }

  return false;
}

/**
 * Walk up a member-expression chain and return `true` when the root is an
 * `expect(...)` call.
 *
 * Handles intermediate properties such as `.not`, `.resolves`, `.rejects`.
 *
 * Examples that return `true`:
 *   expect(x).toBe(y)
 *   expect(x).not.toBe(y)
 *   expect(x).resolves.toEqual(z)
 *   expect(x).rejects.toThrow()
 */
function originatesFromExpect(chainNode: any): boolean {
  if (!chainNode || typeof chainNode !== 'object') return false;

  if (chainNode.type === 'CallExpression') {
    // Direct `expect(...)`
    if (
      chainNode.callee?.type === 'Identifier' &&
      chainNode.callee.name === 'expect'
    ) {
      return true;
    }
    // Recurse through intermediate member expressions, e.g. `.not`
    if (chainNode.callee?.type === 'MemberExpression') {
      return originatesFromExpect(chainNode.callee.object);
    }
  }

  // Walk through `.not`, `.resolves`, `.rejects`, etc.
  if (chainNode.type === 'MemberExpression') {
    return originatesFromExpect(chainNode.object);
  }

  return false;
}

/** Human-readable description of a callee expression. */
function formatCallee(callee: any): string {
  if (!callee) return '<unknown>';
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') {
    const obj =
      callee.object?.type === 'Identifier'
        ? callee.object.name
        : '<expr>';
    const prop =
      callee.property?.type === 'Identifier'
        ? callee.property.name
        : '<prop>';
    return `${obj}.${prop}`;
  }
  return '<unknown>';
}

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

/**
 * Depth-first traversal of every node in the ESTree-compatible AST.
 * `visit` is called for each node exactly once.
 */
function walkAST(node: any, visit: (node: any) => void): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) {
      walkAST(child, visit);
    }
    return;
  }

  visit(node);

  for (const key of Object.keys(node)) {
    // Skip the `.parent` back-reference inserted by some AST transforms
    // to avoid infinite recursion.
    if (key === 'parent') continue;
    walkAST((node as any)[key], visit);
  }
}

export default overMockingDetector;
