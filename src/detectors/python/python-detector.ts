import { DimensionResult, Finding } from '../../core/types';
import { PythonAstResult } from '../../parser/python-parser';

function analyzeAssertions(ast: PythonAstResult): { findings: Finding[]; score: number } {
  const findings: Finding[] = [];
  const testFuncs = ast.test_functions || [];

  let weakCount = 0;
  let totalAssertions = 0;

  for (const fn of testFuncs) {
    if (fn.assertion_count === 0 && fn.body_lines > 1) {
      // Function has body but no assertions — suspicious
      findings.push({
        type: 'no-assertions',
        severity: 'medium',
        line: fn.line,
        message: `Test "${fn.name}" has code but no assertions`,
        suggestion: 'Add assertions to verify behavior',
      });
    }
    totalAssertions += fn.assertion_count;
    // Track bare asserts as potentially weak (simplified check)
    if (fn.assertion_count > 0 && hasWeakPattern(fn.name)) {
      weakCount++;
    }
  }

  const weakRatio = totalAssertions > 0 ? weakCount / totalAssertions : 1;
  const score = totalAssertions === 0 ? 3 : weakRatio < 0.2 ? 10 : weakRatio < 0.4 ? 8 : weakRatio < 0.6 ? 5 : 2;

  return { findings, score };
}

function hasWeakPattern(name: string): boolean {
  return /^test_\d+$/.test(name) || /^test_something$/.test(name);
}

function analyzeMocking(ast: PythonAstResult): { findings: Finding[]; score: number } {
  const findings: Finding[] = [];
  const testFuncs = ast.test_functions || [];
  const testAssertions = ast.test_assertion_count || 0;
  const testMocks = ast.test_mock_count || 0;

  const ratio = testAssertions > 0 ? testMocks / testAssertions : testMocks > 0 ? 1 : 0;
  const score = ratio < 0.5 ? 10 : ratio < 0.8 ? 6 : 3;

  if (testMocks > testAssertions) {
    findings.push({
      type: 'over-mocking',
      severity: 'medium',
      line: testFuncs[0]?.line || 0,
      message: `Tests have ${testMocks} mock(s) but only ${testAssertions} assertion(s)`,
      suggestion: 'Reduce mocking or add more assertions to validate behavior',
    });
  }

  return { findings, score };
}

function analyzeTestSmells(ast: PythonAstResult): { findings: Finding[]; score: number } {
  const findings: Finding[] = [];
  const testFuncs = ast.test_functions || [];

  let deductions = 0;

  // Empty tests
  for (const name of ast.empty_tests || []) {
    deductions += 3;
    const fn = testFuncs.find((f) => f.name === name);
    findings.push({
      type: 'empty-test',
      severity: 'high',
      line: fn?.line || 0,
      message: `Test "${name}" is empty`,
      suggestion: 'Remove the empty test or add test logic',
    });
  }

  // Generic naming
  for (const fn of testFuncs) {
    if (/^test_\d+$/.test(fn.name) || fn.name === 'test_something') {
      deductions += 1;
      findings.push({
        type: 'generic-naming',
        severity: 'low',
        line: fn.line,
        message: `Test name "${fn.name}" is too generic`,
        suggestion: 'Use a descriptive name like test_method_expected_behavior',
      });
    }
  }

  // Assertion roulette — multiple tests without assertions covering similar logic
  const noAssertTests = testFuncs.filter((f) => f.assertion_count === 0);
  if (noAssertTests.length > 1) {
    deductions += 2;
    findings.push({
      type: 'assertion-roulette',
      severity: 'medium',
      line: noAssertTests[0].line,
      message: `Multiple tests (${noAssertTests.map(f => f.name).join(', ')}) without assertions`,
      suggestion: 'Add assertions to each test or remove placeholder tests',
    });
  }

  const score = Math.max(0, 10 - deductions);
  return { findings, score };
}

export function analyzePythonFile(ast: PythonAstResult): DimensionResult[] {
  if (ast.error) {
    return [{
      id: 'py-parse', name: 'Python Parse', score: 0, maxScore: 10,
      findings: [{ type: 'parse-error', severity: 'high', line: 0, message: ast.error }],
    }];
  }

  const assertionResult = analyzeAssertions(ast);
  const mockResult = analyzeMocking(ast);
  const smellResult = analyzeTestSmells(ast);

  return [
    { id: 'py-assertion-strength', name: 'Py Assertion Strength', score: assertionResult.score, maxScore: 10, findings: assertionResult.findings },
    { id: 'py-over-mocking', name: 'Py Over-Mocking', score: mockResult.score, maxScore: 10, findings: mockResult.findings },
    { id: 'py-test-smells', name: 'Py Test Smells', score: smellResult.score, maxScore: 10, findings: smellResult.findings },
  ];
}
