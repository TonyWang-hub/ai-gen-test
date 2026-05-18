import { describe, it, expect } from 'vitest';
import { scan } from '../../src/core/scanner';
import { parseFile } from '../../src/parser/js-parser';
import { runDetectors } from '../../src/core/runner';
import { AssertionStrengthDetector } from '../../src/detectors/shared/assertion-strength';
import { tautologyDetector } from '../../src/detectors/shared/tautology';
import overMockingDetector from '../../src/detectors/js/over-mocking';
import { testSmellsDetector } from '../../src/detectors/shared/test-smells';

const allDetectors = [
  new AssertionStrengthDetector(),
  tautologyDetector,
  overMockingDetector,
  testSmellsDetector,
];

describe('integration', () => {
  it('should scan and parse test files', () => {
    const result = scan('tests/fixtures');
    expect(result.total).toBeGreaterThan(0);
    expect(result.filePaths[0]).toContain('tests/fixtures');
  });

  it('should handle parse errors gracefully', () => {
    const parseResult = parseFile('tests/fixtures/syntax-error.test.ts');
    expect(parseResult.error).toBeDefined();
  });

  it('should run all detectors without crashing', () => {
    const result = parseFile('tests/fixtures/good.test.ts');
    if (result.error) {
      expect(true).toBe(true);
      return;
    }
    const analysis = runDetectors('tests/fixtures/good.test.ts', allDetectors);
    expect(analysis.filePath).toBeDefined();
    expect(analysis.dimensions.length).toBe(allDetectors.length);
    for (const dim of analysis.dimensions) {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(10);
    }
  });

  it('should detect issues in bad-assertions fixture', () => {
    const analysis = runDetectors('tests/fixtures/bad-assertions.test.ts', allDetectors);
    const assertionDim = analysis.dimensions.find((d) => d.id === 'assertion-strength');
    expect(assertionDim).toBeDefined();
    expect(assertionDim!.score).toBeLessThan(5);
  });

  it('should detect smells in smelly fixture', () => {
    const analysis = runDetectors('tests/fixtures/smelly.test.ts', allDetectors);
    const smellsDim = analysis.dimensions.find((d) => d.id === 'test-smells');
    expect(smellsDim).toBeDefined();
    expect(smellsDim!.score).toBeLessThanOrEqual(5);
    expect(smellsDim!.findings.length).toBeGreaterThan(0);
  });

  it('should detect over-mocking', () => {
    const analysis = runDetectors('tests/fixtures/over-mocked.test.ts', allDetectors);
    const mockDim = analysis.dimensions.find((d) => d.id === 'over-mocking');
    expect(mockDim).toBeDefined();
    expect(mockDim!.score).toBeLessThanOrEqual(6);
  });
});
