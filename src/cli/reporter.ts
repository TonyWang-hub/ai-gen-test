import { TestFileResult, SummaryResult, Finding } from '../core/types';

const BAR_WIDTH = 10;

function scoreBar(score: number): string {
  const filled = Math.round((score / 10) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const filledStr = '█'.repeat(filled);
  const emptyStr = '▌'.repeat(empty > 0 ? 1 : 0);

  if (score >= 7) return `${filledStr}${'░'.repeat(empty)}`;
  if (score >= 5) return `${filledStr}${'▒'.repeat(empty)}`;
  return `${filledStr}${'▓'.repeat(empty)}`;
}

function scoreColor(score: number): string {
  if (score >= 8) return '';
  if (score >= 6) return '';
  return '';
}

function severitySymbol(severity: string): string {
  switch (severity) {
    case 'critical': return '💀';
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return 'ℹ️';
    default: return '•';
  }
}

function formatScore(score: number): string {
  if (score >= 8) return '✅';
  if (score >= 6) return '⚠️';
  return '🔴';
}

function printFileReport(result: TestFileResult): string {
  const lines: string[] = [];
  lines.push(`\n📊 ${result.filePath}`);

  if (result.parseError) {
    lines.push(`  ⚠️  Parse error: ${result.parseError} (skipped)`);
    return lines.join('\n');
  }

  for (const dim of result.dimensions) {
    const bar = scoreBar(dim.score);
    const icon = formatScore(dim.score);
    lines.push(`  ${icon} ${dim.name.padEnd(22)} ${dim.score.toString().padStart(2)}/10  ${bar}`);

    const topFindings = dim.findings.slice(0, 3);
    for (const f of topFindings) {
      const sym = severitySymbol(f.severity);
      lines.push(`     ${sym} L${f.line}: ${f.message}`);
      if (f.suggestion) {
        lines.push(`       → ${f.suggestion}`);
      }
    }
    if (dim.findings.length > 3) {
      lines.push(`     ... and ${dim.findings.length - 3} more findings`);
    }
  }

  return lines.join('\n');
}

export function generateSummary(results: TestFileResult[], threshold?: number): SummaryResult {
  let passed = 0;
  let warnings = 0;
  let errors = 0;

  for (const r of results) {
    if (r.parseError) {
      errors++;
      continue;
    }
    const allPassed = r.dimensions.every((d) => {
      if (!threshold) return true;
      return d.score >= threshold;
    });
    if (allPassed) passed++;
    else if (threshold) errors++;
    else warnings++;
  }

  const result: 'passed' | 'failed' =
    threshold !== undefined && errors > 0 ? 'failed' : 'passed';

  return {
    totalFiles: results.length,
    passed,
    warnings,
    errors,
    threshold,
    result,
  };
}

export function generateTerminalReport(
  results: TestFileResult[],
  summary: SummaryResult
): string {
  const lines: string[] = [];
  lines.push('━'.repeat(50));
  lines.push('AIgen-Test Report');
  lines.push('━'.repeat(50));

  for (const r of results) {
    lines.push(printFileReport(r));
  }

  lines.push('\n───');
  lines.push(
    `${summary.totalFiles} file(s) checked | ${summary.passed} passed | ${summary.warnings} warning(s) | ${summary.errors} error(s)`
  );

  if (summary.threshold !== undefined) {
    const status = summary.result === 'passed' ? '✅ PASSED' : '❌ FAILED';
    lines.push(`Threshold: ${summary.threshold}/10 → ${status}`);
  }

  return lines.join('\n');
}

export function generateJSONReport(
  results: TestFileResult[],
  summary: SummaryResult
): string {
  return JSON.stringify({ files: results, summary }, null, 2);
}

export function generateSARIFReport(
  results: TestFileResult[],
  _summary: SummaryResult
): string {
  const runs = results
    .filter((r) => !r.parseError)
    .map((r) => ({
      tool: {
        driver: {
          name: 'aigen-test',
          version: '0.1.0',
          informationUri: 'https://github.com/TonyWang-hub/ai-gen-test',
          rules: r.dimensions.map((d) => ({
            id: d.id,
            name: d.name,
            shortDescription: { text: `${d.name} test quality check` },
            properties: { score: d.score, maxScore: d.maxScore },
          })),
        },
      },
      results: r.dimensions.flatMap((d) =>
        d.findings.map((f) => ({
          ruleId: d.id,
          level: f.severity === 'critical' ? 'error' : f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
          message: { text: f.suggestion ? `${f.message}. ${f.suggestion}` : f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: r.filePath },
                region: { startLine: f.line },
              },
            },
          ],
        }))
      ),
    }));

  return JSON.stringify({ $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json', version: '2.1.0', runs }, null, 2);
}
