import { TestFileResult } from './types';
import { parsePythonFile } from '../parser/python-parser';
import { analyzePythonFile } from '../detectors/python/python-detector';

export function runPythonDetectors(filePath: string): TestFileResult {
  const parseResult = parsePythonFile(filePath);

  if (parseResult.error) {
    return { filePath, dimensions: [], parseError: parseResult.error };
  }

  const dimensions = analyzePythonFile(parseResult);
  return { filePath, dimensions };
}
