import { DimensionResult, Finding, Detector } from '../../core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GENERIC_NAME_PATTERNS: RegExp[] = [
  /^test\d*$/i,                   // "test", "Test", "test1"
  /^should\s*(work|pass|fail|handle|be|do|run|return|test|check)$/i,  // "should work", "should pass" (short vague only)
  /^should\s+\w{1,4}$/i,          // "should do", "should be" (very short should-phrases)
  /^\d+$/,                        // purely numeric: "1", "123"
];

function isGenericTestName(name: string): boolean {
  return GENERIC_NAME_PATTERNS.some((p) => p.test(name));
}

function isTestCallExpression(node: any): boolean {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee) return false;

  // it(...) / test(...)
  if (callee.type === 'Identifier') {
    return callee.name === 'it' || callee.name === 'test';
  }

  // it.only(...) / it.skip(...) / test.only(...) / etc.
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier'
  ) {
    return (
      (callee.object.name === 'it' || callee.object.name === 'test') &&
      ['only', 'skip', 'todo'].includes(callee.property.name)
    );
  }

  return false;
}

interface TestBlock {
  /** Human-readable test name (first arg of it/test). */
  name: string;
  /** The Literal AST node holding the name. */
  nameNode: any;
  /** The callback function node (ArrowFunctionExpression or FunctionExpression). */
  callbackNode: any;
  /** Total lines of the callback body (based on loc). */
  lines: number;
}

/**
 * Walk the AST and collect every it() / test() call (and their .only / .skip
 * variants) that has a string first-argument and a function second-argument.
 */
function collectTestBlocks(node: any, blocks: TestBlock[] = []): void {
  if (!node || typeof node !== 'object') return;

  if (isTestCallExpression(node)) {
    const nameArg = node.arguments[0];
    const callbackArg = node.arguments[1];

    if (
      nameArg &&
      nameArg.type === 'Literal' &&
      typeof nameArg.value === 'string' &&
      callbackArg &&
      (callbackArg.type === 'ArrowFunctionExpression' ||
        callbackArg.type === 'FunctionExpression')
    ) {
      const body = callbackArg.body;
      const lineCount = body.loc
        ? body.loc.end.line - body.loc.start.line + 1
        : 0;

      blocks.push({
        name: nameArg.value,
        nameNode: nameArg,
        callbackNode: callbackArg,
        lines: lineCount,
      });
    }

    // Do not recurse into known test calls to avoid nested it() counts.
    return;
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    collectTestBlocks(node[key], blocks);
  }
}

/**
 * Return the array of statement nodes inside the test callback body.
 * For expression-body arrow functions the expression itself is treated as a
 * single statement so that duplicate-arrange detection still applies.
 */
function getBodyStatements(block: TestBlock): any[] {
  const body = block.callbackNode.body;
  if (body.type === 'BlockStatement') {
    return body.body ?? [];
  }
  // Arrow function with expression body, e.g. () => expect(x).toBe(1)
  return [body];
}

/**
 * Produce a structural hash of an AST node subtree, ignoring positions and
 * parent references.  Two nodes with the same structure produce the same hash.
 */
function structuralHash(node: any): string {
  return JSON.stringify(node, (key, value) => {
    if (['loc', 'range', 'start', 'end', 'parent', 'leadingComments', 'trailingComments'].includes(key)) {
      return undefined;
    }
    return value;
  });
}

/**
 * Return all unordered pairs [i, j] (i < j) of test-block indices whose
 * first N (=3) consecutive statements are structurally identical.
 */
function findDuplicateArrangePairs(blocks: TestBlock[]): Array<[number, number]> {
  const N = 3;
  const hashes: string[] = blocks.map((block) => {
    const stmts = getBodyStatements(block);
    const firstN = stmts.slice(0, N);
    if (firstN.length < N) return ''; // not enough statements to compare
    return firstN.map((s) => structuralHash(s)).join('||');
  });

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < hashes.length; i++) {
    if (!hashes[i]) continue;
    for (let j = i + 1; j < hashes.length; j++) {
      if (hashes[i] === hashes[j]) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

/**
 * Compute the comment-to-code ratio per file.
 * Comment lines are derived from `ast.comments` (available because the parser
 * was invoked with `comment: true`).  The denominator is the number of
 * non-empty source lines.
 */
function computeCommentRatio(source: string, ast: any): number {
  const lines = source.split('\n');
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0).length;
  if (nonEmptyLines === 0) return 0;

  const commentLineNumbers = new Set<number>();
  for (const comment of ast.comments ?? []) {
    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
      commentLineNumbers.add(line);
    }
  }

  return commentLineNumbers.size / nonEmptyLines;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const readabilityDetector: Detector = {
  id: 'readability',
  name: 'Readability',

  analyze(ast: any, source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];
    let score = 10;
    const maxScore = 10;

    const blocks: TestBlock[] = [];
    collectTestBlocks(ast, blocks);

    // ---------- 1. Naming quality ----------
    for (const block of blocks) {
      if (isGenericTestName(block.name)) {
        const line = block.nameNode.loc?.start?.line ?? 0;
        findings.push({
          type: 'generic-naming',
          severity: 'medium',
          line,
          message: `Test name "${block.name}" is generic and does not describe test intent`,
          suggestion: 'Use a descriptive name that explains what behaviour the test verifies, e.g. "returns 401 when token is expired"',
        });
        score -= 1;
      }
    }

    // ---------- 2. Test length ----------
    for (const block of blocks) {
      if (block.lines > 30) {
        const line = block.nameNode.loc?.start?.line ?? 0;
        findings.push({
          type: 'overlong-test',
          severity: 'medium',
          line,
          message: `Test "${block.name}" is ${block.lines} lines long (max: 30)`,
          suggestion: 'Split this test into smaller, focused tests that each verify a single behaviour',
        });
        score -= 1;
      }
    }

    // ---------- 3. Duplicate arrange ----------
    const dupPairs = findDuplicateArrangePairs(blocks);
    for (const [i, j] of dupPairs) {
      const line = blocks[j].nameNode.loc?.start?.line ?? 0;
      findings.push({
        type: 'duplicate-arrange',
        severity: 'medium',
        line,
        message: `Test "${blocks[j].name}" shares the same first 3 statements as "${blocks[i].name}"`,
        suggestion: 'Extract the common setup into a beforeEach/describe block or a shared factory function',
      });
      score -= 2;
    }

    // ---------- 4. Comment ratio ----------
    const ratio = computeCommentRatio(source, ast);
    if (ratio < 0.05 || ratio > 0.5) {
      const isTooFew = ratio < 0.05;
      findings.push({
        type: 'comment-ratio-anomaly',
        severity: isTooFew ? 'low' : 'medium',
        line: 1,
        message: isTooFew
          ? `Comment ratio is ${(ratio * 100).toFixed(1)}% — too few comments (minimum 5%)`
          : `Comment ratio is ${(ratio * 100).toFixed(1)}% — too many comments (maximum 50%)`,
        suggestion: isTooFew
          ? 'Add comments to explain test intent, edge cases, and complex logic'
          : 'Reduce redundant comments or move detailed documentation outside the test file',
      });
      score -= 2;
    }

    return {
      id: 'readability',
      name: 'Readability',
      score: Math.max(0, score),
      maxScore,
      findings,
    };
  },
};
