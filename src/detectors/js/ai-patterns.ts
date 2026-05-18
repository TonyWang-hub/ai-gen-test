import type { DimensionResult, Detector, Finding } from '../../core/types';

// ---------------------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------------------

/** Test names that match known template / placeholder patterns. */
const TEMPLATE_NAME_RE = [
  /^should work$/i,
  /^should pass$/i,
  /^test function$/i,
  /^test case$/i,
  /^test\d*$/i,
  /^my test$/i,
  /^sample test$/i,
  /^unit test$/i,
  /^integration test$/i,
  /^correct behavior$/i,
  /^basic test$/i,
  /^simple test$/i,
  /^default test$/i,
  /^test$/i,
];

/** Callee names / member paths that represent a defensive null/undefined check. */
const DEFENSIVE_CALLEES = new Set([
  'assertNotNull',
  'assert.isNotNull',
  'assertDefined',
  'assert.isDefined',
  'assert',
]);

/** Suffixes of member-expression property names that are defensive checks. */
const DEFENSIVE_EXPECT_SUFFIXES = new Set([
  'toBeNull',
  'toBeUndefined',
  'toBeDefined',
  'toBeTruthy',
  'toBeFalsy',
]);

// ---------------------------------------------------------------------------
// AST walking helpers
// ---------------------------------------------------------------------------

/**
 * Walk an ESTree node recursively, calling `visitors[node.type]` when
 * a matching type is encountered.
 */
function walkAST(
  node: any,
  visitors: Record<string, (node: any, parent: any) => void>,
  parent: any = null,
): void {
  if (!node || typeof node !== 'object') return;

  const handler = visitors[node.type];
  if (handler) handler(node, parent);

  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        walkAST(item, visitors, node);
      }
    } else if (child && typeof child.type === 'string') {
      walkAST(child, visitors, node);
    }
  }
}

/**
 * Walk upward through member-expression chain and build the dotted path,
 * e.g. `a.b.c` -> `"a.b.c"`.  Returns `null` for dynamic / computed properties.
 */
function memberExpressionPath(node: any): string | null {
  if (node.type !== 'MemberExpression') return null;
  const parts: string[] = [];
  let current = node;
  while (current.type === 'MemberExpression') {
    if (current.computed) return null; // skip computed access
    const prop = current.property;
    if (prop.type === 'Identifier') {
      parts.unshift(prop.name);
    } else {
      return null;
    }
    current = current.object;
  }
  if (current.type === 'Identifier') {
    parts.unshift(current.name);
    return parts.join('.');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Statement / expression signature helpers (for copy-paste detection)
// ---------------------------------------------------------------------------

function exprSignature(expr: any): string {
  if (!expr || typeof expr !== 'object') return '?';
  switch (expr.type) {
    case 'CallExpression':
      return `Call(${exprSignature(expr.callee)})`;
    case 'NewExpression':
      return `New(${exprSignature(expr.callee)})`;
    case 'MemberExpression':
      if (expr.computed) {
        return `MemberComputed(${exprSignature(expr.object)},${exprSignature(expr.property)})`;
      }
      return `Member(${exprSignature(expr.object)}.${expr.property?.name ?? '?'})`;
    case 'Identifier':
      return `Id(${expr.name})`;
    case 'Literal':
      return `Lit(${typeof expr.value})`;
    case 'TemplateLiteral':
      return 'TemplateLit';
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return 'Fn';
    case 'AwaitExpression':
      return `Await(${exprSignature(expr.argument)})`;
    case 'ObjectExpression':
      return `Object{${(expr.properties ?? []).map((p: any) => exprSignature(p.value)).join(',')}}`;
    case 'ArrayExpression':
      return `Array[${(expr.elements ?? []).map((e: any) => exprSignature(e)).join(',')}]`;
    case 'UnaryExpression':
      return `${expr.operator}(${exprSignature(expr.argument)})`;
    case 'BinaryExpression':
      return `${expr.operator}(${exprSignature(expr.left)},${exprSignature(expr.right)})`;
    case 'ConditionalExpression':
      return `Ternary(${exprSignature(expr.test)},${exprSignature(expr.consequent)},${exprSignature(expr.alternate)})`;
    case 'AssignmentExpression':
      return `Assign(${exprSignature(expr.left)},${exprSignature(expr.right)})`;
    default:
      return expr.type;
  }
}

function stmtSignature(stmt: any): string {
  if (!stmt || typeof stmt !== 'object') return '';
  switch (stmt.type) {
    case 'ExpressionStatement':
      return `Expr(${exprSignature(stmt.expression)})`;
    case 'VariableDeclaration':
      return `VarDecl(${stmt.kind},${(stmt.declarations ?? [])
        .map((d: any) => (d.init ? exprSignature(d.init) : '?'))
        .join('|')})`;
    case 'ReturnStatement':
      return `Return(${stmt.argument ? exprSignature(stmt.argument) : ''})`;
    case 'ThrowStatement':
      return `Throw(${stmt.argument ? exprSignature(stmt.argument) : ''})`;
    case 'IfStatement':
      return `If(${exprSignature(stmt.test)})`;
    default:
      return stmt.type;
  }
}

/** Extract the first `n` expression-ish statements from a block. */
function firstNStmts(body: any[], n: number): string[] {
  return body.slice(0, n).map(stmtSignature);
}

// ---------------------------------------------------------------------------
// Assertion checks
// ---------------------------------------------------------------------------

/**
 * Test whether a CallExpression (or one of its descendants) looks like a
 * test assertion (expect / assert.* / should).
 */
function isAssertionCall(expr: any): boolean {
  if (!expr || typeof expr !== 'object') return false;
  if (expr.type === 'CallExpression') {
    const callee = expr.callee;
    // expect(...)
    if (callee.type === 'Identifier' && callee.name === 'expect') return true;
    // assert.xxx
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'assert'
    )
      return true;
    // standalone assertion: assertNotNull, assertDefined, should, ...
    if (
      callee.type === 'Identifier' &&
      (callee.name.startsWith('assert') || callee.name === 'should')
    )
      return true;
    // .should.xxx chain (prototype-chain style)
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'CallExpression' &&
      callee.object.callee.type === 'MemberExpression' &&
      callee.object.callee.property?.name === 'should'
    )
      return true;
  }
  return false;
}

function containsAssertion(node: any): boolean {
  if (isAssertionCall(node)) return true;
  if (!node || typeof node !== 'object') return false;
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range' || key === 'raw' || key === 'comments')
      continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (containsAssertion(item)) return true;
      }
    } else if (child && typeof child.type === 'string') {
      if (containsAssertion(child)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Test-block extraction
// ---------------------------------------------------------------------------

interface TestBlock {
  node: any;
  name: string;
  line: number;
  bodyStmts: any[];
}

/** Collect all `it(...)` / `test(...)` call expressions in the AST. */
function collectTestBlocks(ast: any): TestBlock[] {
  const blocks: TestBlock[] = [];

  walkAST(ast, {
    CallExpression(node: any) {
      const callee = node.callee;
      if (!callee) return;

      const fnName =
        callee.type === 'Identifier'
          ? callee.name
          : callee.type === 'MemberExpression' &&
              callee.property?.type === 'Identifier'
            ? callee.property.name
            : null;

      if (fnName !== 'it' && fnName !== 'test') return;

      // First arg should be the test name (string literal or template)
      const nameArg = node.arguments[0];
      let name: string = '';
      if (nameArg?.type === 'Literal' && typeof nameArg.value === 'string') {
        name = nameArg.value;
      } else if (nameArg?.type === 'TemplateLiteral' && nameArg.quasis?.length) {
        name = nameArg.quasis[0].value?.raw ?? '';
      }

      // Second arg is the function body
      const fnArg = node.arguments[1];
      if (!fnArg) return;
      if (fnArg.type !== 'ArrowFunctionExpression' && fnArg.type !== 'FunctionExpression') return;

      let bodyStmts: any[] = [];
      if (fnArg.body.type === 'BlockStatement') {
        bodyStmts = fnArg.body.body;
      } else {
        // expression-body arrow: wrap as a single-element array
        bodyStmts = [{ type: 'ExpressionStatement', expression: fnArg.body }];
      }

      blocks.push({
        node,
        name,
        line: node.loc?.start?.line ?? 0,
        bodyStmts,
      });
    },
  });

  return blocks;
}

// ---------------------------------------------------------------------------
// Pattern detectors (each returns an array of Findings)
// ---------------------------------------------------------------------------

/**
 * 1. Defensive assertions
 *    `assertNotNull(x)` or `expect(x).not.toBeNull()` where `x` was
 *    declared / assigned within 2 lines above.
 */
function detectDefensiveAssertions(ast: any): Finding[] {
  // Map variable name -> line of declaration
  const declarations = new Map<string, number>();

  walkAST(ast, {
    VariableDeclarator(node: any) {
      if (node.id?.type === 'Identifier') {
        declarations.set(node.id.name, node.loc?.start?.line ?? 0);
      }
    },
  });

  const findings: Finding[] = [];

  // Walk for defensive assertion patterns
  walkAST(ast, {
    ExpressionStatement(node: any) {
      const expr = node.expression;
      if (!expr || expr.type !== 'CallExpression') return;

      const assertLine = node.loc?.start?.line ?? 0;

      // --- Pattern A: direct / member assertion calls ---
      // e.g. assertNotNull(x), assert.isNotNull(x)
      const { callee } = expr;
      let calleePath: string | null = null;
      if (callee?.type === 'Identifier') {
        calleePath = callee.name;
      } else if (callee?.type === 'MemberExpression') {
        calleePath = memberExpressionPath(callee);
      }

      if (calleePath && DEFENSIVE_CALLEES.has(calleePath)) {
        const firstArg = expr.arguments[0];
        if (firstArg?.type === 'Identifier') {
          const declLine = declarations.get(firstArg.name);
          if (declLine != null && assertLine - declLine >= 0 && assertLine - declLine <= 2) {
            findings.push({
              type: 'defensive-assertion',
              severity: 'medium',
              line: assertLine,
              message: `Defensive assertion on variable '${firstArg.name}' declared on line ${declLine}`,
              suggestion:
                'Remove the assertion; the variable was just declared and cannot be null at this point.',
            });
          }
        }
        return;
      }

      // --- Pattern B: expect(x).not.toBeNull() / expect(x).toBeDefined() ---
      // Walk the chain:  expect(x).not.toBeNull()
      //                   ^-- CallExpression
      // from the outermost call inward
      let chain: any = expr;
      while (chain.type === 'CallExpression') {
        const chainCallee = chain.callee;
        if (chainCallee?.type !== 'MemberExpression') break;

        const propName = chainCallee.property?.name;
        if (propName && DEFENSIVE_EXPECT_SUFFIXES.has(propName)) {
          // Backtrack to find the expect(...) call
          let obj = chainCallee.object;

          // Skip through `.not` / `.to` / `.resolves` / `.rejects` chain
          while (
            obj.type === 'MemberExpression' &&
            (obj.property?.name === 'not' ||
              obj.property?.name === 'to' ||
              obj.property?.name === 'resolves' ||
              obj.property?.name === 'rejects')
          ) {
            obj = obj.object;
          }

          // obj should now be `expect(x)`
          if (
            obj.type === 'CallExpression' &&
            obj.callee?.type === 'Identifier' &&
            obj.callee.name === 'expect'
          ) {
            const targetArg = obj.arguments[0];
            if (targetArg?.type === 'Identifier') {
              const declLine = declarations.get(targetArg.name);
              if (declLine != null && assertLine - declLine >= 0 && assertLine - declLine <= 2) {
                findings.push({
                  type: 'defensive-assertion',
                  severity: 'medium',
                  line: assertLine,
                  message: `Defensive assertion on variable '${targetArg.name}' declared on line ${declLine}`,
                  suggestion:
                    'Remove the assertion; the variable was just declared and cannot be null at this point.',
                });
              }
            }
          }
        }

        // Walk inward for nested chains
        chain = chainCallee.object;
        while (chain?.type === 'MemberExpression') {
          chain = chain.object;
        }
      }
    },
  });

  return findings;
}

/**
 * 2. Template assertion messages
 *    Test names matching generic / placeholder patterns.
 */
function detectTemplateNames(ast: any): Finding[] {
  const blocks = collectTestBlocks(ast);
  const findings: Finding[] = [];

  for (const block of blocks) {
    for (const re of TEMPLATE_NAME_RE) {
      if (re.test(block.name.trim())) {
        findings.push({
          type: 'template-name',
          severity: 'medium',
          line: block.line,
          message: `Test name '${block.name}' matches template pattern '${re.source}'`,
          suggestion: 'Replace with a descriptive name that explains the test intent.',
        });
        break;
      }
    }
  }

  return findings;
}

/**
 * 3. Copy-paste test blocks
 *    Two-or-more it()/test() blocks where the first 3 body statements are
 *    structurally identical (ignoring literal values).
 */
function detectCopyPaste(ast: any): Finding[] {
  const blocks = collectTestBlocks(ast);

  // Only consider blocks with at least 3 statements
  const eligible = blocks.filter((b) => b.bodyStmts.length >= 3);
  if (eligible.length < 2) return [];

  // Generate signature (first 3 statements) for each block
  const groups = new Map<string, TestBlock[]>();
  for (const block of eligible) {
    const sig = firstNStmts(block.bodyStmts, 3).join(' ||| ');
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(block);
  }

  const findings: Finding[] = [];
  groups.forEach((group) => {
    if (group.length < 2) return;

    const linesStr = group.map((b) => `line ${b.line}`).join(', ');
    for (const block of group) {
      const others = group.filter((b) => b !== block);
      const otherLines = others.map((b) => `line ${b.line}`).join(', ');
      findings.push({
        type: 'copy-paste',
        severity: 'high',
        line: block.line,
        message: `Test '${block.name}' at line ${block.line} is structurally identical to ${otherLines}`,
        suggestion:
          'Extract shared setup into a beforeEach or helper function to reduce duplication.',
      });
    }
  });

  return findings;
}

/**
 * 4. Boilerplate tests
 *    it()/test() with a descriptive name but body contains zero assertions
 *    (only setup / calls).
 */
function detectBoilerplate(ast: any): Finding[] {
  const blocks = collectTestBlocks(ast);
  const templateNames = detectTemplateNames(ast);
  const templateNameLines = new Set(templateNames.map((f) => f.line));

  const findings: Finding[] = [];

  for (const block of blocks) {
    // Skip template-named tests  (those are already flagged)
    if (templateNameLines.has(block.line)) continue;

    // Must have at least one statement in the body
    if (block.bodyStmts.length === 0) continue;

    // Only ExpressionStatement, VariableDeclaration, etc.  (ignore comments)
    const realStmts = block.bodyStmts.filter(
      (s) => s.type !== 'EmptyStatement' && !isCommentOnly(s),
    );
    if (realStmts.length === 0) continue;

    // Check for any assertion
    const hasAssert = block.bodyStmts.some((s) => containsAssertion(s));
    if (!hasAssert) {
      findings.push({
        type: 'boilerplate',
        severity: 'high',
        line: block.line,
        message: `Test '${block.name}' at line ${block.line} has no assertions`,
        suggestion: 'Add assertions to verify the expected behavior, or remove the empty test.',
      });
    }
  }

  return findings;
}

/** Heuristic: a statement is "comment-only" if it has no real tokens. */
function isCommentOnly(stmt: any): boolean {
  return false; // ESTree doesn't give us a clean way here; rely on EmptyStatement filter
}

/**
 * 5. Excessive async patterns
 *    async test functions that never use `await`.
 */
function detectExcessiveAsync(ast: any): Finding[] {
  const blocks = collectTestBlocks(ast);
  const findings: Finding[] = [];

  for (const block of blocks) {
    // Check if the callback is async
    const fnArg = block.node.arguments[1];
    if (!fnArg) continue;
    if (!fnArg.async) continue;

    // Walk body for AwaitExpression
    let hasAwait = false;
    walkAST(fnArg.body, {
      AwaitExpression() {
        hasAwait = true;
      },
    });

    if (!hasAwait) {
      findings.push({
        type: 'excessive-async',
        severity: 'low',
        line: block.line,
        message: `Test '${block.name}' at line ${block.line} is declared async but never uses await`,
        suggestion:
          'Remove the async keyword unless the test calls asynchronous operations.',
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function computeScore(findings: Finding[]): number {
  let score = 10; // start

  const countByType = (type: string) => findings.filter((f) => f.type === type).length;

  // Defensive assertions: -1 each
  score -= countByType('defensive-assertion');

  // Template names: -1 each
  score -= countByType('template-name');

  // Boilerplate: -2 each
  score -= countByType('boilerplate') * 2;

  // Copy-paste pairs: -2 per pair
  // A group of n identical blocks yields (n * (n-1)) / 2 pairs
  // We stored one finding per block; pair-count from findings:
  // group each "copy-paste" by message to find how many blocks per group
  const cpFindings = findings.filter((f) => f.type === 'copy-paste');
  // Group by message (each unique message = one group of identical blocks)
  const cpGroups = new Map<string, number>();
  for (const f of cpFindings) {
    cpGroups.set(f.message, (cpGroups.get(f.message) ?? 0) + 1);
  }
  cpGroups.forEach((n) => {
    const pairs = (n * (n - 1)) / 2;
    score -= pairs * 2;
  });

  // Excessive async: no score penalty per spec (but still reported)
  // (spec doesn't list a penalty for excessive-async)

  return Math.max(0, score);
}

// ---------------------------------------------------------------------------
// Detector export
// ---------------------------------------------------------------------------

export const aiPatternsDetector: Detector = {
  id: 'ai-patterns',
  name: 'AI Patterns Detector',
  analyze(ast: any, source: string, filePath: string): DimensionResult {
    const findings: Finding[] = [
      ...detectDefensiveAssertions(ast),
      ...detectTemplateNames(ast),
      ...detectCopyPaste(ast),
      ...detectBoilerplate(ast),
      ...detectExcessiveAsync(ast),
    ];

    const score = computeScore(findings);

    return {
      id: 'ai-patterns',
      name: 'AI Patterns Detector',
      score,
      maxScore: 10,
      findings,
    };
  },
};

export default aiPatternsDetector;
