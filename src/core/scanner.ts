import * as fs from 'fs';
import * as path from 'path';
import { ScannerResult } from './types';

const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
];
const TEST_DIR_PATTERNS = [/__tests__$/];
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next']);

function isTestFile(fileName: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(fileName));
}

function isTestDir(dirName: string): boolean {
  return TEST_DIR_PATTERNS.some((p) => p.test(dirName));
}

function shouldIgnoreDir(dirName: string): boolean {
  return IGNORE_DIRS.has(dirName) || dirName.startsWith('.');
}

function scanDir(dirPath: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!shouldIgnoreDir(entry.name)) {
        scanDir(fullPath, results);
      }
    } else if (entry.isFile() && isTestFile(entry.name)) {
      results.push(fullPath);
    }
  }
}

export function scan(configPath: string): ScannerResult {
  const absPath = path.resolve(configPath);
  const stats = fs.statSync(absPath);

  const filePaths: string[] = [];

  if (stats.isFile()) {
    if (isTestFile(path.basename(absPath))) {
      filePaths.push(absPath);
    }
  } else if (stats.isDirectory()) {
    scanDir(absPath, filePaths);
  }

  return { filePaths: [...new Set(filePaths)], total: filePaths.length };
}

export function lookForTestDir(configPath: string): boolean {
  const absPath = path.resolve(configPath);
  if (!fs.existsSync(absPath)) return false;
  const stats = fs.statSync(absPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(absPath)) {
      if (isTestDir(entry)) return true;
      const fullPath = path.join(absPath, entry);
      if (fs.statSync(fullPath).isFile() && isTestFile(entry)) return true;
    }
  }
  return stats.isFile() && isTestFile(path.basename(absPath));
}
