import { execSync } from 'child_process';
import * as path from 'path';

export interface PythonAstResult {
  filepath: string;
  error?: string;
  functions?: PythonFunction[];
  classes?: PythonClass[];
  total_assertions?: number;
  total_mocks?: number;
  test_functions?: PythonFunction[];
  test_assertion_count?: number;
  test_mock_count?: number;
  empty_tests?: string[];
}

interface PythonFunction {
  name: string;
  line: number;
  is_test: boolean;
  has_assertions: boolean;
  has_mocks: boolean;
  assertion_count: number;
  mock_count: number;
  body_lines: number;
  decorators: string[];
}

interface PythonClass {
  name: string;
  line: number;
  is_test: boolean;
  methods: number;
}

export function parsePythonFile(filePath: string): PythonAstResult {
  const scriptPath = path.join(__dirname, 'py_ast_parser.py');
  try {
    const output = execSync(`python3 "${scriptPath}" "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return JSON.parse(output);
  } catch (e: any) {
    // Try to extract stdout even on error
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch {}
    }
    return { filepath: filePath, error: e.message || 'Parse failed' };
  }
}
