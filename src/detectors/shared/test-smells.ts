import { DimensionResult, Finding } from '../../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestBlock {
  type: 'it' | 'test' | 'describe';
  name: string;
  body: any;
  line: number;
  isSkipped: boolean;
  isOnly: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERIC_NAME_PATTERNS: RegExp[] = [
  /^should work$/i,
  /^test function$/i,
  /^test\d+$/i,
  /^correct behavior$/i,
  /^test$/i,
  /^works fine$/i,
  /^passes$/i,
];

// ---------------------------------------------------------------------------
// AST Helpers
// ---------------------------------------------------------------------------

function isIdentifier(node: any, name?: string): boolean {
  return node?.type === 'Identifier' && (name ? node.name === name : true);
}

function isCallExpression(node: any): boolean {
  return node?.type === 'CallExpression';
}

function isMemberExpression(node: any): boolean {
  return node?.type === 'MemberExpression';
}

function isLiteral(node: any): boolean {
  return node?.type === 'Literal';
}

function isStringLiteral(node: any): boolean {
  return isLiteral(node) && typeof node.value === 'string';
}

function getMemberPropertyName(node: any): string | null {
  if (!isMemberExpression(node) || !isIdentifier(node.property)) return null;
  return node.property.name;
}

// ---------------------------------------------------------------------------
// AST Walker
// ---------------------------------------------------------------------------

function walk(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && typeof item.type === 'string') {
          walk(item, visitor);
        }
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      walk(child, visitor);
    }
  }
}

// ---------------------------------------------------------------------------
// Test-Block Discovery
// ---------------------------------------------------------------------------

/**
 * Recursively walk the AST and collect all it/test/describe call blocks.
 */
function findTestBlocks(ast: any): TestBlock[] {
  const blocks: TestBlock[] = [];

  walk(ast, (node) => {
    if (!isCallExpression(node)) return;

    const callee = node.callee;
    let testType: 'it' | 'test' | 'describe' | null = null;
    let isSkipped = false;
    let isOnly = false;

    if (isIdentifier(callee)) {
      switch (callee.name) {
        case 'it':
          testType = 'it';
          break;
        case 'test':
          testType = 'test';
          break;
        case 'describe':
          testType = 'describe';
          break;
        case 'xit':
          testType = 'it';
          isSkipped = true;
          break;
        case 'xdescribe':
          testType = 'describe';
          isSkipped = true;
          break;
        case 'fit':
          testType = 'it';
          isOnly = true;
          break;
      }
    } else if (isMemberExpression(callee) && isIdentifier(callee.object)) {
      const objName = callee.object.name;
      const propName = getMemberPropertyName(callee);
      if (propName && (propName === 'skip' || propName === 'only')) {
        if (objName === 'it' || objName === 'test') {
          testType = objName;
          isSkipped = propName === 'skip';
          isOnly = propName === 'only';
        } else if (objName === 'describe') {
          testType = 'describe';
          isSkipped = propName === 'skip';
          isOnly = propName === 'only';
        }
      }
    }

    if (!testType) return;

    const nameArg = node.arguments?.[0];
    const name = isStringLiteral(nameArg) ? nameArg.value : '';
    const callback = node.arguments?.[1] ?? null;
    const line = node.loc?.start?.line ?? 0;

    blocks.push({
      type: testType,
      name,
      body: callback,
      line,
      isSkipped,
      isOnly,
    });
  });

  return blocks;
}

// ---------------------------------------------------------------------------
// Assertion Detection
// ---------------------------------------------------------------------------

/**
 * Determine whether `node` is an `expect(...)` call (root of a chain).
 */
function isExpectRootCall(node: any): boolean {
  return isCallExpression(node) && isIdentifier(node.callee, 'expect');
}

/**
 * Count assertions inside a test body and determine whether any of them
 * carry an explicit description / message argument.
 *
 * Recognised assertion families:
 *   - expect(...) / expect(...).matcher(...)
 *   - assert.xxx(...) / assert(...)
 *   - t.xxx(...)   (Node tap / ava style)
 */
function getAssertionDetail(body: any): { count: number; hasMessages: boolean } {
  let count = 0;
  let hasMessages = false;

  walk(body, (node) => {
    if (!isCallExpression(node)) return;

    // --- expect(...) -------------------------------------------------------
    if (isExpectRootCall(node)) {
      count++;
      // Check expect(value, 'message') — second arg is the hint
      const args = node.arguments ?? [];
      for (let i = 1; i < args.length; i++) {
        if (isStringLiteral(args[i]) && args[i].value.length > 0) {
          hasMessages = true;
        }
      }
    }

    // --- expect(...).matcher(...) chain ------------------------------------
    // The matcher call carries the message: expect(x).toBe(y, 'message')
    if (
      isMemberExpression(node.callee) &&
      isCallExpression(node.callee.object) &&
      isExpectRootCall(node.callee.object)
    ) {
      const args = node.arguments ?? [];
      for (const arg of args) {
        if (isStringLiteral(arg) && arg.value.length > 0) {
          hasMessages = true;
        }
      }
    }

    // --- assert / assert.xxx ----------------------------------------------
    if (
      isIdentifier(node.callee, 'assert') ||
      (isMemberExpression(node.callee) && isIdentifier(node.callee.object, 'assert'))
    ) {
      count++;
      const args = node.arguments ?? [];
      if (args.length > 0) {
        const last = args[args.length - 1];
        if (isStringLiteral(last) && last.value.length > 0) {
          hasMessages = true;
        }
      }
    }

    // --- t.xxx  (tap / ava) -----------------------------------------------
    if (isIdentifier(node.callee, 't')) {
      count++;
      const args = node.arguments ?? [];
      if (args.length > 2) {
        const last = args[args.length - 1];
        if (isStringLiteral(last) && last.value.length > 0) {
          hasMessages = true;
        }
      }
    }
  });

  return { count, hasMessages };
}

// ---------------------------------------------------------------------------
// Empty-Test Check
// ---------------------------------------------------------------------------

function isEmptyTest(body: any): boolean {
  if (!body) return true;

  // Arrow or regular function
  if (body.type === 'ArrowFunctionExpression' || body.type === 'FunctionExpression') {
    const fnBody = body.body;
    if (!fnBody) return true;

    // Expression body: () => someExpr — not empty
    if (fnBody.type !== 'BlockStatement') return false;

    // Block body: () => { ... }
    const stmts: any[] = fnBody.body ?? [];
    return stmts.length === 0;
  }

  // Direct BlockStatement (unusual for a test callback but handle it)
  if (body.type === 'BlockStatement') {
    const stmts: any[] = body.body ?? [];
    return stmts.length === 0;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Generic-Name Check
// ---------------------------------------------------------------------------

function isGenericName(name: string): boolean {
  const trimmed = name.trim();
  return GENERIC_NAME_PATTERNS.some((re) => re.test(trimmed));
}

// ---------------------------------------------------------------------------
// Source-Text Pattern Scans  (for smells invisible in the AST)
// ---------------------------------------------------------------------------

function findCommentedTestsInSource(source: string): { line: number }[] {
  const results: { line: number }[] = [];
  const lines = source.split('\n');
  // Matches:
  //   // it(   // test(   /* it(   * it(
  // but does NOT match // it.skip(  etc. because `it\(` excludes following chars.
  const re = /\/\/\s*(?:it|test)\s*\(|(?:\/\*|\*)\s*(?:it|test)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      results.push({ line: i + 1 });
    }
  }
  return results;
}

function findSkippedPatternsInSource(source: string): { line: number }[] {
  const results: { line: number }[] = [];
  const re = /(?:it|test)\.skip\s*\(|xit\s*\(|xdescribe\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const lineNum = source.slice(0, match.index).split('\n').length;
    results.push({ line: lineNum });
  }
  return results;
}

function findOnlyPatternsInSource(source: string): { line: number }[] {
  const results: { line: number }[] = [];
  const re = /(?:it|test)\.only\s*\(|fit\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const lineNum = source.slice(0, match.index).split('\n').length;
    results.push({ line: lineNum });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Detector Object
// ---------------------------------------------------------------------------

export const testSmellsDetector = {
  id: 'test-smells',
  name: 'Test Smells',

  analyze(ast: any, source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];
    const testBlocks = findTestBlocks(ast);

    const itTestBlocks = testBlocks.filter(
      (b) => b.type === 'it' || b.type === 'test',
    );

    // ---- 1. Assertion Roulette --------------------------------------------
    for (const block of itTestBlocks) {
      if (!block.body) continue;
      const { count, hasMessages } = getAssertionDetail(block.body);
      if (count > 2 && !hasMessages) {
        findings.push({
          type: 'assertion-roulette',
          severity: 'medium',
          line: block.line,
          message: block.name
            ? `Test "${block.name}" has ${count} assertions without descriptions, making it hard to identify which one fails`
            : `Test at line ${block.line} has ${count} assertions without descriptions`,
          suggestion:
            'Add a descriptive message to each assertion, or split the test into multiple smaller tests, each focused on a single behavior',
        });
      }
    }

    // ---- 2. Empty Test ----------------------------------------------------
    for (const block of itTestBlocks) {
      if (isEmptyTest(block.body)) {
        findings.push({
          type: 'empty-test',
          severity: 'high',
          line: block.line,
          message: block.name
            ? `Test "${block.name}" is empty — it has no statements`
            : `Test at line ${block.line} is empty — it has no statements`,
          suggestion:
            'Remove the empty test body or add the missing assertions',
        });
      }
    }

    // ---- 3. Generic Naming ------------------------------------------------
    for (const block of itTestBlocks) {
      if (block.name && isGenericName(block.name)) {
        findings.push({
          type: 'generic-naming',
          severity: 'low',
          line: block.line,
          message: `Test name "${block.name}" is too generic and does not describe the expected behavior`,
          suggestion:
            'Use a descriptive test name that explains what behavior is being verified',
        });
      }
    }

    // ---- 4. Commented Test (source-text only)-------------------------------
    const commentedTests = findCommentedTestsInSource(source);
    for (const ct of commentedTests) {
      // Deduplicate: a line might hold a commented it/test that also matches
      // another category; still flag it as commented-test at most once.
      if (!findings.some((f) => f.type === 'commented-test' && f.line === ct.line)) {
        findings.push({
          type: 'commented-test',
          severity: 'medium',
          line: ct.line,
          message: 'Commented-out test declaration detected',
          suggestion:
            'Remove commented-out test code, or uncomment the test if it should be active',
        });
      }
    }

    // ---- 5. Skipped Test --------------------------------------------------
    // From AST (active skip modifiers)
    for (const block of testBlocks) {
      if (block.isSkipped) {
        findings.push({
          type: 'skipped-test',
          severity: 'low',
          line: block.line,
          message: block.name
            ? `Test "${block.name}" is skipped`
            : `Test at line ${block.line} is skipped`,
          suggestion:
            'Fix the test and unskip it, or remove it entirely if it is no longer relevant',
        });
      }
    }
    // From source text (catches commented-out skip patterns the AST misses)
    const skippedInSource = findSkippedPatternsInSource(source);
    for (const s of skippedInSource) {
      if (!findings.some((f) => f.type === 'skipped-test' && f.line === s.line)) {
        findings.push({
          type: 'skipped-test',
          severity: 'low',
          line: s.line,
          message: 'Skipped test detected (active or commented-out)',
          suggestion:
            'Fix the test and unskip it, or remove it entirely if it is no longer relevant',
        });
      }
    }

    // ---- 6. Only Test -----------------------------------------------------
    // From AST (active only modifiers)
    for (const block of testBlocks) {
      if (block.isOnly) {
        findings.push({
          type: 'only-test',
          severity: 'critical',
          line: block.line,
          message: block.name
            ? `Test "${block.name}" is marked with "only" — this will skip every other test in the file`
            : `Test at line ${block.line} is marked with "only"`,
          suggestion:
            'Remove ".only" before committing to ensure all tests run in CI',
        });
      }
    }
    // From source text (commented-out only patterns)
    const onlyInSource = findOnlyPatternsInSource(source);
    for (const o of onlyInSource) {
      if (!findings.some((f) => f.type === 'only-test' && f.line === o.line)) {
        findings.push({
          type: 'only-test',
          severity: 'critical',
          line: o.line,
          message: 'Test marked with "only" detected (active or commented-out)',
          suggestion:
            'Remove ".only" before committing to ensure all tests run in CI',
        });
      }
    }

    // ---- Score ------------------------------------------------------------
    let score = 10;
    const penalties: Record<string, number> = {
      'assertion-roulette': 2,
      'empty-test': 3,
      'generic-naming': 1,
      'commented-test': 2,
      'skipped-test': 1,
      'only-test': 2,
    };
    for (const f of findings) {
      score -= penalties[f.type] ?? 0;
    }
    score = Math.max(0, score);

    return {
      id: 'test-smells',
      name: 'Test Smells',
      score,
      maxScore: 10,
      findings,
    };
  },
};
