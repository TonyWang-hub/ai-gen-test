import { TestFileResult, Finding } from './types';
import { goDetector } from '../detectors/shared/go-detector';
import * as fs from 'fs';

export function runGoDetectors(filePath: string): TestFileResult {
  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const result = goDetector.analyze(null, source, filePath);

    // Also add a basic test-smell analysis for Go
    const smellFindings: Finding[] = [];
    if (!source.includes('testing.T')) {
      smellFindings.push({ type: 'missing-testing-import', severity: 'high', line: 0, message: 'Missing "testing" import', suggestion: 'Add import "testing" to write Go tests' });
    }

    const allFindings = [...result.findings, ...smellFindings];
    return {
      filePath,
      dimensions: [{ ...result, findings: allFindings }],
    };
  } catch (e: any) {
    return { filePath, dimensions: [], parseError: e.message };
  }
}
