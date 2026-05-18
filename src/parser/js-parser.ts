import * as fs from 'fs';
import { parse as tsParse } from '@typescript-eslint/parser';

export interface ParseResult {
  ast: any;
  source: string;
  filePath: string;
  error?: string;
}

export function parseFile(filePath: string): ParseResult {
  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const ast = tsParse(source, {
      range: true,
      loc: true,
      comment: true,
      ecmaFeatures: { jsx: true },
      sourceType: 'module',
    });
    return { ast, source, filePath };
  } catch (e: any) {
    return {
      ast: null,
      source: '',
      filePath,
      error: e.message || 'Parse error',
    };
  }
}
