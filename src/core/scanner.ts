import * as fs from 'fs';
import * as path from 'path';
import { ScannerResult } from './types';

const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /^test_.*\.py$/,
  /.*_test\.py$/,
  /.*_test\.go$/,
];
const TEST_DIR_PATTERNS = [/__tests__$/];
const DEFAULT_IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next']);

function isTestFile(fileName: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(fileName));
}

function hasIgnorePrefix(name: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((p) => {
    const stripped = p.replace(/\/+$/, '');
    return name === stripped || name.startsWith(stripped + '/') || name === path.basename(stripped);
  });
}

function scanDir(dirPath: string, results: string[], extraIgnore: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (DEFAULT_IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    if (hasIgnorePrefix(entry.name, extraIgnore)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, results, extraIgnore);
    } else if (entry.isFile() && isTestFile(entry.name)) {
      results.push(fullPath);
    }
  }
}

export function scan(configPath: string, extraIgnore?: string[]): ScannerResult {
  const absPath = path.resolve(configPath);
  const stats = fs.statSync(absPath);
  const ignoreList = extraIgnore || [];

  const filePaths: string[] = [];

  if (stats.isFile()) {
    if (isTestFile(path.basename(absPath))) {
      filePaths.push(absPath);
    }
  } else if (stats.isDirectory()) {
    scanDir(absPath, filePaths, ignoreList);
  }

  return { filePaths: [...new Set(filePaths)], total: filePaths.length };
}

export function lookForTestDir(configPath: string): boolean {
  const absPath = path.resolve(configPath);
  if (!fs.existsSync(absPath)) return false;
  const stats = fs.statSync(absPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(absPath)) {
      if (entry === '__tests__' || entry.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) return true;
      const fullPath = path.join(absPath, entry);
      if (fs.statSync(fullPath).isFile() && isTestFile(entry)) return true;
    }
  }
  return stats.isFile() && isTestFile(path.basename(absPath));
}
