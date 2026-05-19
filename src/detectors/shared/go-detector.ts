import { Detector, DimensionResult, Finding } from '../../core/types';

/** Simplified Go test file AST analysis using regex-based parsing */

interface GoTestFunc {
  name: string;
  body: string;
  line: number;
  assertions: number;
  hasTableDriven: boolean;
  hasErrorAssert: boolean;
  isHelper: boolean;
  hasSubTests: boolean;
}

function extractGoTestFuncs(source: string): GoTestFunc[] {
  const funcs: GoTestFunc[] = [];
  const lines = source.split('\n');
  const funcRe = /^func\s+(Test\w+)\s*\(/;
  const tRunRe = /\.Run\(/;
  const helperRe = /\.Helper\(\)/;
  const tableRe = /\[\]struct\s*\{|tt\s*:=\s*\[\]|tests\s*:=\s*\[\]/;

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(funcRe);
    if (m) {
      const name = m[1];
      const startLine = i + 1;
      // Find the opening brace
      let braceCount = 0;
      let inBody = false;
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && (braceCount > 0 || !inBody)) {
        const line = lines[i];
        for (const ch of line) {
          if (ch === '{') { braceCount++; inBody = true; }
          else if (ch === '}') { braceCount--; }
        }
        if (inBody && braceCount > 0) bodyLines.push(line);
        else if (inBody && braceCount === 0) { /* closing brace — don't include */ }
        i++;
      }
      const body = bodyLines.join('\n');
      const assertionCount = (body.match(/(\.Equal\b|\.Error\b|\.Fail\b|\.Log\b)/g) || []).length;
      funcs.push({
        name, body, line: startLine,
        assertions: assertionCount,
        hasTableDriven: tableRe.test(body),
        hasErrorAssert: /\bError\b|\bErrorf\b/.test(body),
        isHelper: helperRe.test(body),
        hasSubTests: tRunRe.test(body),
      });
    } else {
      i++;
    }
  }
  return funcs;
}

function analyzeGoAssertions(funcs: GoTestFunc[]): { findings: Finding[]; score: number } {
  const findings: Finding[] = [];
  let weakCount = 0;
  let totalAssertions = 0;

  for (const fn of funcs) {
    totalAssertions += fn.assertions;
    if (fn.assertions === 0 && !fn.isHelper) {
      findings.push({
        type: 'no-assertions',
        severity: 'medium',
        line: fn.line,
        message: `Test "${fn.name}" has no assertions`,
        suggestion: 'Add assertions using t.Equal(), t.Error(), or t.Fail()',
      });
      weakCount++;
    }
    if (!fn.hasErrorAssert && fn.assertions > 0) {
      findings.push({
        type: 'no-error-test',
        severity: 'low',
        line: fn.line,
        message: `Test "${fn.name}" has no error case testing`,
        suggestion: 'Add a test case that expects an error or edge condition',
      });
    }
  }

  const ratio = totalAssertions > 0 ? weakCount / totalAssertions : 1;
  const score = totalAssertions === 0 ? 3 : ratio < 0.2 ? 10 : ratio < 0.4 ? 8 : ratio < 0.6 ? 5 : 2;
  return { findings, score };
}

function analyzeGoTableDriven(funcs: GoTestFunc[]): { findings: Finding[]; score: number } {
  const findings: Finding[] = [];
  const total = funcs.length;
  const tableDriven = funcs.filter((f) => f.hasTableDriven).length;

  if (total > 2 && tableDriven < total * 0.3) {
    findings.push({
      type: 'few-table-driven',
      severity: 'low',
      line: 0,
      message: `Only ${tableDriven}/${total} tests use table-driven testing`,
      suggestion: 'Consider table-driven tests for better coverage and readability',
    });
  }

  const score = total <= 2 ? 10 : tableDriven / total >= 0.5 ? 10 : tableDriven / total >= 0.3 ? 7 : 5;
  return { findings, score };
}

function analyzeGoSubTests(funcs: GoTestFunc[]): { findings: Finding[]; score: number } {
  const findings: Finding[] = [];
  const hasSubTests = funcs.filter((f) => f.hasSubTests).length;
  const tableDrivenWithSub = funcs.filter((f) => f.hasTableDriven && !f.hasSubTests).length;

  if (tableDrivenWithSub > 0) {
    findings.push({
      type: 'missing-subtest',
      severity: 'low',
      line: 0,
      message: `${tableDrivenWithSub} table-driven test(s) don't use t.Run() for subtests`,
      suggestion: 'Use t.Run() for each table entry to get better error reporting',
    });
  }

  const score = hasSubTests > 0 ? 10 : funcs.length > 3 ? 6 : 10;
  return { findings, score };
}

export const goDetector: Detector = {
  id: 'go-test',
  name: 'Go Test',

  analyze(_ast: any, source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];
    const funcs = extractGoTestFuncs(source);

    if (funcs.length === 0) {
      return { id: 'go-test', name: 'Go Test', score: 10, maxScore: 10, findings: [] };
    }

    const assertionResult = analyzeGoAssertions(funcs);
    const tableResult = analyzeGoTableDriven(funcs);
    const subTestResult = analyzeGoSubTests(funcs);

    findings.push(...assertionResult.findings, ...tableResult.findings, ...subTestResult.findings);

    const score = Math.round((assertionResult.score + tableResult.score + subTestResult.score) / 3);
    return { id: 'go-test', name: 'Go Test', score, maxScore: 10, findings };
  },
};
