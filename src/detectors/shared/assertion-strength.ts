import { Detector, DimensionResult, Finding } from '../../core/types';

// ---------------------------------------------------------------------------
// Constants — weak matcher / assertion names
// ---------------------------------------------------------------------------

/** Jest / Vitest `.expect()` matchers that are considered weak. */
const WEAK_MATCHERS = new Set([
  'toBeDefined',
  'toBeTruthy',
  'toBeFalsy',
  'toBeNull',
  'toBeUndefined',
]);

/** Classic `assert.*` function names that are considered weak. */
const WEAK_ASSERT_FUNCTIONS = new Set([
  'assertNotNull',
  'assertNull',
  'assertTrue',
  'assertFalse',
]);

/**
 * AST property keys that contain no child nodes (metadata, tokens, etc.)
 * and should be skipped during tree walking.
 */
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

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

interface AssertionRecord {
  isWeak: boolean;
  severity: 'low' | 'medium';
  line: number;
  matcher?: string;
  message: string;
  suggestion?: string;
}

interface ExpectChainResult {
  isExpectBased: boolean;
  chainHasResolvesOrRejects: boolean;
  parts: string[];
}

// ---------------------------------------------------------------------------
// AssertionStrengthDetector
// ---------------------------------------------------------------------------

export class AssertionStrengthDetector implements Detector {
  readonly id = 'assertion-strength';
  readonly name = 'Assertion Strength';

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  analyze(ast: any, _source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];
    let totalAssertions = 0;
    let weakAssertions = 0;
    let toStrictEqualCount = 0;

    const record: (info: AssertionRecord) => void = (info) => {
      totalAssertions++;
      if (info.isWeak) {
        weakAssertions++;
        findings.push({
          type: 'weak-assertion',
          severity: info.severity,
          line: info.line,
          message: info.message,
          suggestion: info.suggestion,
        });
      }
      if (info.matcher === 'toStrictEqual') {
        toStrictEqualCount++;
      }
    };

    // ---- 1. Walk the entire AST ----
    this.walkAST(ast, null, (node, parent) => {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'CallExpression') {
        this.analyzeCallExpression(node, parent, record);
        return;
      }

      if (node.type === 'MemberExpression') {
        this.analyzeMemberExpression(node, parent, record);
      }
    });

    // ---- 2. Excessive toStrictEqual penalty ----
    if (toStrictEqualCount > 3) {
      weakAssertions++;
      findings.push({
        type: 'style-assertion',
        severity: 'low',
        line: 0,
        message:
          `Excessive use of toStrictEqual (${toStrictEqualCount} times). ` +
          'Consider using more targeted matchers like .toEqual() for simpler comparisons.',
        suggestion:
          'Use .toEqual() for simple object comparisons and reserve .toStrictEqual() ' +
          'for cases where type-level equality matters.',
      });
    }

    // ---- 3. No assertions at all ----
    if (totalAssertions === 0) {
      findings.push({
        type: 'no-assertions',
        severity: 'high',
        line: 0,
        message: 'No test assertions found in this file.',
        suggestion:
          'Add expect() calls or assertion-library calls to verify test outcomes.',
      });
    }

    // ---- 4. Score ----
    const score = this.calculateScore(weakAssertions, totalAssertions);

    return { id: this.id, name: this.name, score, maxScore: 10, findings };
  }

  // -----------------------------------------------------------------------
  // Call-expression analysis
  // -----------------------------------------------------------------------

  private analyzeCallExpression(
    node: any,
    parent: any,
    record: (info: AssertionRecord) => void,
  ): void {
    const callee = node.callee;
    if (!callee) return;

    /* ------------------------------------------------------------------ */
    /*  Pattern: expect(...)  standalone  (no chained matcher)            */
    /* ------------------------------------------------------------------ */
    if (callee.type === 'Identifier' && callee.name === 'expect') {
      // When expect() is the object of a MemberExpression it *is* chained.
      if (
        parent &&
        parent.type === 'MemberExpression' &&
        parent.object === node
      ) {
        return;
      }
      record({
        isWeak: true,
        severity: 'medium',
        line: this.getLine(node),
        message: 'expect() call without a chained matcher.',
        suggestion:
          'Chain a matcher like .toEqual(expected) or .toBe(expected).',
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /*  Pattern: expect(…).matcher()   or   expect(…).a.b.c()            */
    /* ------------------------------------------------------------------ */
    if (callee.type === 'MemberExpression') {
      const chain = this.extractExpectChain(callee);
      if (!chain.isExpectBased) return;

      const matcherName: string | undefined = callee.property?.name;
      if (!matcherName) return;

      // --- weak matchers ---
      if (WEAK_MATCHERS.has(matcherName)) {
        record({
          isWeak: true,
          severity: 'low',
          line: this.getLine(node),
          matcher: matcherName,
          message: chain.chainHasResolvesOrRejects
            ? `Weak assertion: .${matcherName}() after .resolves/.rejects only checks existence/null.`
            : `Weak assertion: .${matcherName}() only checks existence or null state.`,
          suggestion: this.expectSuggestion(matcherName),
        });
        return;
      }

      // --- non-weak (counted for total) ---
      record({
        isWeak: false,
        severity: 'low',
        line: this.getLine(node),
        matcher: matcherName,
        message: '',
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /*  Pattern: assertNotNull(x)  /  assertNull(x)                      */
    /*           assertTrue(x)    /  assertFalse(x)  (simple expr only)  */
    /* ------------------------------------------------------------------ */
    if (
      callee.type === 'Identifier' &&
      WEAK_ASSERT_FUNCTIONS.has(callee.name)
    ) {
      // For assertTrue / assertFalse only flag when the argument is a
      // simple expression (Identifier, Literal, Unary !, MemberExpression).
      if (
        (callee.name === 'assertTrue' || callee.name === 'assertFalse') &&
        node.arguments?.[0] &&
        !this.isSimpleExpression(node.arguments[0])
      ) {
        return;
      }

      record({
        isWeak: true,
        severity: 'low',
        line: this.getLine(node),
        matcher: callee.name,
        message: `Weak assertion: ${callee.name}() only checks boolean/null state.`,
        suggestion: this.assertSuggestion(callee.name),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Member-expression analysis  (orphaned .resolves / .rejects)
  // -----------------------------------------------------------------------

  private analyzeMemberExpression(
    node: any,
    parent: any,
    record: (info: AssertionRecord) => void,
  ): void {
    const propName: string | undefined = node.property?.name;
    if (propName !== 'resolves' && propName !== 'rejects') return;
    if (!this.isExpectCall(node.object)) return;

    // If the parent continues the call-chain we are NOT orphaned.
    if (this.isPartOfCallChain(node, parent)) return;

    record({
      isWeak: true,
      severity: 'medium',
      line: this.getLine(node),
      matcher: propName,
      message: `.${propName} used without a chained matcher — the assertion is incomplete.`,
      suggestion:
        `Chain a matcher after .${propName}, e.g., .${propName}.toEqual(expected).`,
    });
  }

  // -----------------------------------------------------------------------
  // Chain helpers
  // -----------------------------------------------------------------------

  /**
   * Walk up from a `MemberExpression` callee to check whether it
   * originates from an `expect(…)` call.
   */
  private extractExpectChain(callee: any): ExpectChainResult {
    const parts: string[] = [];
    let current = callee;
    let expectFound = false;

    while (current && current.type === 'MemberExpression') {
      const name: string | undefined = current.property?.name;
      if (name) parts.unshift(name);

      const obj = current.object;
      if (
        obj?.type === 'CallExpression' &&
        obj?.callee?.type === 'Identifier' &&
        obj?.callee?.name === 'expect'
      ) {
        expectFound = true;
        break;
      }
      current = obj;
    }

    return {
      isExpectBased: expectFound,
      chainHasResolvesOrRejects: parts.some(
        (p) => p === 'resolves' || p === 'rejects',
      ),
      parts,
    };
  }

  private isExpectCall(node: any): boolean {
    return (
      node?.type === 'CallExpression' &&
      node?.callee?.type === 'Identifier' &&
      node?.callee?.name === 'expect'
    );
  }

  /** True when `node` is used inside a longer call-member chain. */
  private isPartOfCallChain(node: any, parent: any): boolean {
    if (!parent) return false;

    // node is the object of an outer MemberExpression → chain continues
    if (parent.type === 'MemberExpression' && parent.object === node) return true;

    // node is being invoked as a function
    if (parent.type === 'CallExpression' && parent.callee === node) return true;

    return false;
  }

  // -----------------------------------------------------------------------
  // Expression complexity  (for assertTrue / assertFalse)
  // -----------------------------------------------------------------------

  /**
   * Returns true for "simple" expressions — identifiers, constants,
   * simple negations, and property accesses — where using assertTrue(x)
   * is trivially weak because it only checks truthiness.
   *
   * Complex expressions (binary, call, logical, conditional, etc.) are
   * excluded because the developer is verifying an actual condition.
   */
  private isSimpleExpression(node: any): boolean {
    if (!node) return false;
    if (node.type === 'Identifier') return true;
    if (node.type === 'Literal') return true;
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      return this.isSimpleExpression(node.argument);
    }
    if (node.type === 'MemberExpression') return true;
    return false;
  }

  // -----------------------------------------------------------------------
  // Suggestions
  // -----------------------------------------------------------------------

  private expectSuggestion(matcher: string): string {
    switch (matcher) {
      case 'toBeDefined':
        return 'Replace with a specific value assertion like .toEqual(expected).';
      case 'toBeTruthy':
        return 'Replace with a more targeted assertion, e.g., .toBe(true) or check the actual expected value.';
      case 'toBeFalsy':
        return 'Replace with a more targeted assertion, e.g., .toBe(false), .toEqual(0), or .toBeNull().';
      case 'toBeNull':
        return 'Replace with a more specific assertion, or compare against the actual expected value.';
      case 'toBeUndefined':
        return 'Replace with a more specific assertion, or compare against the actual expected value.';
      default:
        return 'Use a more specific value assertion.';
    }
  }

  private assertSuggestion(name: string): string {
    switch (name) {
      case 'assertNotNull':
        return 'Replace with assert.strictEqual(value, expected) or a library-specific equality assertion.';
      case 'assertNull':
        return 'Replace with assert.strictEqual(value, null) or a more targeted assertion.';
      case 'assertTrue':
        return 'Replace with assert.strictEqual(value, true) or a specific comparison.';
      case 'assertFalse':
        return 'Replace with assert.strictEqual(value, false) or a specific comparison.';
      default:
        return 'Use a more specific value assertion.';
    }
  }

  // -----------------------------------------------------------------------
  // Scoring
  // -----------------------------------------------------------------------

  /**
   * Map the ratio of weak / total assertions onto a 0-10 score.
   *
   *  Ratio              Score
   *  < 20 %              10
   *  20 % – 40 %         7 – 10   (linear)
   *  40 % – 60 %         3 –  7   (linear)
   *  > 60 %              0 –  3   (linear)
   *
   *  No assertions → 10 (nothing to penalise; a separate finding warns).
   */
  private calculateScore(weakCount: number, totalCount: number): number {
    if (totalCount === 0) return 10;

    const ratio = weakCount / totalCount;

    if (ratio < 0.2) return 10;

    if (ratio < 0.4) {
      // 20 % – 40 %  →  10 – 7
      const t = (ratio - 0.2) / 0.2;
      return Math.round(10 - t * 3);
    }

    if (ratio < 0.6) {
      // 40 % – 60 %  →  7 – 3
      const t = (ratio - 0.4) / 0.2;
      return Math.round(7 - t * 4);
    }

    // > 60 %  →  3 – 0
    const t = Math.min(1, (ratio - 0.6) / 0.4);
    return Math.round(3 - t * 3);
  }

  // -----------------------------------------------------------------------
  // AST traversal
  // -----------------------------------------------------------------------

  private getLine(node: any): number {
    return node?.loc?.start?.line ?? 0;
  }

  /**
   * Walk an ESTree-compatible AST depth-first, passing every node and its
   * parent to `callback`.  A `visited` set protects against cycles (should
   * not normally occur in a parser-generated tree).
   */
  private walkAST(
    node: any,
    parent: any | null,
    callback: (node: any, parent: any | null) => void,
    visited: Set<any> = new Set(),
  ): void {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    callback(node, parent);

    if (Array.isArray(node)) {
      for (const child of node) {
        if (child && typeof child === 'object') {
          this.walkAST(child, node, callback, visited);
        }
      }
      return;
    }

    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const child = node[key];
      if (child && typeof child === 'object') {
        this.walkAST(child, node, callback, visited);
      }
    }
  }
}
