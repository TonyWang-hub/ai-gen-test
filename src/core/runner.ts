import { Detector, TestFileResult } from './types';
import { parseFile } from '../parser/js-parser';

export function runDetectors(
  filePath: string,
  detectors: Detector[]
): TestFileResult {
  const parseResult = parseFile(filePath);

  if (parseResult.error) {
    return {
      filePath,
      dimensions: [],
      parseError: parseResult.error,
    };
  }

  const dimensions = detectors.map((detector) => {
    try {
      return detector.analyze(parseResult.ast, parseResult.source, filePath);
    } catch (e: any) {
      return {
        id: detector.id,
        name: detector.name,
        score: 0,
        maxScore: 10,
        findings: [
          {
            type: 'runtime-error',
            severity: 'high' as const,
            line: 0,
            message: `Detector crashed: ${e.message || 'Unknown error'}`,
          },
        ],
      };
    }
  });

  return { filePath, dimensions };
}
