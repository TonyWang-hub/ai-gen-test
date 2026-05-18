export interface AigenTestConfig {
  path: string;
  threshold?: number;
  format?: 'terminal' | 'json' | 'sarif';
  ignore?: string[];
}

export interface TestFileResult {
  filePath: string;
  dimensions: DimensionResult[];
  parseError?: string;
}

export interface DimensionResult {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  findings: Finding[];
}

export interface Finding {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  line: number;
  message: string;
  suggestion?: string;
}

export interface SummaryResult {
  totalFiles: number;
  passed: number;
  warnings: number;
  errors: number;
  threshold?: number;
  result: 'passed' | 'failed';
}

export interface Detector {
  id: string;
  name: string;
  analyze(ast: any, source: string, filePath: string): DimensionResult;
}

export interface ScannerResult {
  filePaths: string[];
  total: number;
}
