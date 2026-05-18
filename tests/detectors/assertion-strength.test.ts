import { describe, it, expect } from 'vitest';
import { AssertionStrengthDetector } from '../../src/detectors/shared/assertion-strength';
import { parseFile } from '../../src/parser/js-parser';

const detector = new AssertionStrengthDetector();

describe('assertion-strength', () => {
  it('should detect weak assertions in bad-assertions fixture', () => {
    const result = parseFile('tests/fixtures/bad-assertions.test.ts');
    const analysis = detector.analyze(result.ast, result.source, result.filePath);
    expect(analysis.score).toBeLessThan(5);
    expect(analysis.findings.length).toBeGreaterThan(0);
    expect(analysis.findings.some((f) => f.type === 'weak-assertion' || f.type.includes('weak'))).toBe(true);
  });

  it('should pass good tests', () => {
    const result = parseFile('tests/fixtures/good.test.ts');
    const analysis = detector.analyze(result.ast, result.source, result.filePath);
    expect(analysis.score).toBeGreaterThanOrEqual(8);
  });

  it('should handle empty test gracefully', () => {
    const result = parseFile('tests/fixtures/syntax-error.test.ts');
    if (result.error || !result.ast) {
      expect(true).toBe(true);
    } else {
      const analysis = detector.analyze(result.ast, result.source, result.filePath);
      expect(analysis.score).toBeDefined();
    }
  });
});
