import { Detector, DimensionResult, Finding } from '../../core/types';

interface FlakyRule { name: string; pattern: RegExp; severity: 'high' | 'medium' | 'low'; msg: string; suggestion: string; }
const FLAKY_RULES: FlakyRule[] = [
  { name: 'hard-sleep', pattern: /setTimeout\(|setInterval\(|\.sleep\(/, severity: 'high', msg: 'Hard-coded timing — flaky across environments', suggestion: 'Use waitFor() or retry with polling' },
  { name: 'skipped-test', pattern: /\b(it|test|describe)\.skip\b|xit\(|xdescribe\(/, severity: 'low', msg: 'Skipped test — may hide regressions', suggestion: 'Remove skip or fix the underlying issue' },
  { name: 'current-date', pattern: /new Date\(\)|Date\.now\(\)/, severity: 'medium', msg: 'Uses current date/time — non-deterministic', suggestion: 'Use a fixed timestamp or mock Date' },
  { name: 'random-value', pattern: /Math\.random\(\)/, severity: 'medium', msg: 'Uses random values — non-deterministic', suggestion: 'Use a seeded random or fixed value' },
  { name: 'env-dependency', pattern: /process\.env/, severity: 'medium', msg: 'Depends on environment variables — may fail in CI', suggestion: 'Set env vars explicitly in test setup' },
  { name: 'console-output', pattern: /console\.(log|error)\(/, severity: 'low', msg: 'Console output in test — may interfere', suggestion: 'Remove console.log or use a proper logger' },
  { name: 'locale-formatting', pattern: /\.toFixed\(|parseFloat\(|parseInt\(/, severity: 'low', msg: 'Numeric formatting — locale-dependent results', suggestion: 'Use toBeCloseTo() for floating comparison' },
];

export const flakyDetector: Detector = {
  id: 'flaky-detection',
  name: 'Flaky Patterns',

  analyze(_ast: any, source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];
    const lines = source.split('\n');
    const seen = new Set<string>();

    for (const rule of FLAKY_RULES) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          const key = `${rule.name}:${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({ type: rule.name, severity: rule.severity, line: i + 1, message: rule.msg, suggestion: rule.suggestion });
        }
      }
    }

    const score = Math.max(0, 10 - findings.reduce((acc, f) => acc + (f.severity === 'high' ? 2 : f.severity === 'medium' ? 1 : 0.5), 0));
    return { id: 'flaky-detection', name: 'Flaky Patterns', score, maxScore: 10, findings };
  },
};
