import { Detector, DimensionResult, Finding } from '../../core/types';

function walk(node: any, visitor: (n: any) => void): void {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent' || key === 'start' || key === 'end' || key === 'comments' || key === 'tokens') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && typeof item.type === 'string') walk(item, visitor);
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      walk(child, visitor);
    }
  }
}

interface TestStats {
  assertionCount: number;
  mockCount: number;
  testCount: number;
  avgAssertionsPerTest: number;
  totalStatements: number;
  hasConditionalLogic: boolean;
}

function analyzeTestStats(ast: any): TestStats {
  const stats: TestStats = {
    assertionCount: 0,
    mockCount: 0,
    testCount: 0,
    avgAssertionsPerTest: 0,
    totalStatements: 0,
    hasConditionalLogic: false,
  };

  walk(ast, (node) => {
    // Count expect() calls
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'expect') {
      stats.assertionCount++;
    }
    // Count it/test blocks
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if (callee.type === 'Identifier' && (callee.name === 'it' || callee.name === 'test')) {
        stats.testCount++;
      } else if (callee.type === 'MemberExpression' && callee.object?.type === 'Identifier' &&
                 (callee.object.name === 'it' || callee.object.name === 'test')) {
        stats.testCount++;
      }
    }
    // Count mock calls
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
      const obj = node.callee.object;
      const prop = node.callee.property;
      if (obj?.type === 'Identifier' && prop?.type === 'Identifier') {
        if ((obj.name === 'jest' || obj.name === 'vi') && (prop.name === 'fn' || prop.name === 'mock' || prop.name === 'spyOn')) {
          stats.mockCount++;
        }
      }
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'vi' && node.arguments?.[0]) {
      stats.mockCount++;
    }
    // Conditional logic
    if (node.type === 'IfStatement' || node.type === 'ConditionalExpression') {
      stats.hasConditionalLogic = true;
    }
    // Statement count for complexity
    if (node.type === 'ExpressionStatement') {
      stats.totalStatements++;
    }
  });

  stats.avgAssertionsPerTest = stats.testCount > 0 ? stats.assertionCount / stats.testCount : 0;
  return stats;
}

export const mutationPredictionDetector: Detector = {
  id: 'mutation-prediction',
  name: 'Mutation Resilience',

  analyze(ast: any, _source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];
    const stats = analyzeTestStats(ast);

    if (stats.testCount === 0) {
      return { id: 'mutation-prediction', name: 'Mutation Resilience', score: 10, maxScore: 10, findings: [] };
    }

    // Based on Zhang & Mesbah (FSE 2015): assertion count correlates with mutation score
    // Gil & Ma'ayan (TechRxiv 2021): static features predict mutation score

    // Score contributors
    let score = 5; // baseline

    // Assertion density: higher = better mutation resilience
    if (stats.avgAssertionsPerTest >= 2) score += 2;
    else if (stats.avgAssertionsPerTest >= 1) score += 1;
    else score -= 1;

    // Mock ratio: less mocking = better (tests real code)
    const mockRatio = stats.assertionCount > 0 ? stats.mockCount / stats.assertionCount : 0;
    if (mockRatio < 0.3) score += 1.5;
    else if (mockRatio > 0.8) score -= 1.5;

    // Test count: more tests = wider coverage
    if (stats.testCount >= 5) score += 1;
    else if (stats.testCount >= 3) score += 0.5;

    // Conditional logic in tests: indicates more thorough testing
    if (stats.hasConditionalLogic) score += 0.5;

    // Complexity: tests with more statements tend to cover more code
    const stmtsPerTest = stats.testCount > 0 ? stats.totalStatements / stats.testCount : 0;
    if (stmtsPerTest >= 3 && stmtsPerTest <= 15) score += 0.5;
    else if (stmtsPerTest > 15) score -= 0.5; // very long tests may be diffused

    // Clamp to 0-10
    const finalScore = Math.max(0, Math.min(10, Math.round(score)));

    // Generate insights
    if (mockRatio > 0.8) {
      findings.push({
        type: 'high-mock-ratio',
        severity: 'medium',
        line: 0,
        message: `Mock ratio ${(mockRatio * 100).toFixed(0)}% — high mocking may reduce mutation resilience`,
        suggestion: 'Reduce mocking and add integration-style tests',
      });
    }

    if (stats.avgAssertionsPerTest < 1) {
      findings.push({
        type: 'low-assertion-density',
        severity: 'high',
        line: 0,
        message: `Average ${stats.avgAssertionsPerTest.toFixed(1)} assertion(s) per test — low assertion density correlates with lower mutation scores`,
        suggestion: 'Add more assertions per test to improve defect detection',
      });
    }

    if (stats.testCount < 3) {
      findings.push({
        type: 'few-tests',
        severity: 'low',
        line: 0,
        message: `Only ${stats.testCount} test(s) — limited coverage may miss edge cases`,
        suggestion: 'Add more tests covering different scenarios',
      });
    }

    return { id: 'mutation-prediction', name: 'Mutation Resilience', score: finalScore, maxScore: 10, findings };
  },
};
