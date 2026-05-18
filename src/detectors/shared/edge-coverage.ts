import { Detector, DimensionResult, Finding } from '../../core/types';

function walk(node: any, visitor: (n: any) => void): void {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent' || key === 'start' || key === 'end' || key === 'comments' || key === 'tokens') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && typeof item.type === 'string') walk(item, visitor);
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      walk(child, visitor);
    }
  }
}

function collectLiterals(body: any): { value: any; line: number }[] {
  const lits: { value: any; line: number }[] = [];
  walk(body, (node) => {
    if (node.type === 'Literal') {
      lits.push({ value: node.value, line: node.loc?.start?.line ?? 0 });
    }
  });
  return lits;
}

function collectArguments(ast: any): string[] {
  const args: string[] = [];
  walk(ast, (node) => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' &&
        (node.callee.name === 'it' || node.callee.name === 'test') &&
        node.arguments?.length >= 2) {
      const callback = node.arguments[1];
      if (callback && (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')) {
        for (const param of (callback.params || [])) {
          if (param.type === 'Identifier') args.push(param.name);
          else if (param.type === 'AssignmentPattern' && param.left?.type === 'Identifier') args.push(param.left.name);
        }
      }
    }
  });
  return args;
}

function hasEdgeCaseValues(literals: { value: any; line: number }[]): { hasNull: boolean; hasZero: boolean; hasNegative: boolean; hasEmpty: boolean; hasLarge: boolean } {
  return {
    hasNull: literals.some((l) => l.value === null || l.value === undefined),
    hasZero: literals.some((l) => l.value === 0 || l.value === 0.0),
    hasNegative: literals.some((l) => typeof l.value === 'number' && l.value < 0),
    hasEmpty: literals.some((l) => l.value === '' || (Array.isArray(l.value) && l.value.length === 0) || (typeof l.value === 'object' && l.value !== null && Object.keys(l.value).length === 0)),
    hasLarge: literals.some((l) => typeof l.value === 'number' && Math.abs(l.value) > 1000000),
  };
}

function findTestBlocks(ast: any): { name: string; body: any; line: number }[] {
  const blocks: { name: string; body: any; line: number }[] = [];
  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    let callee = node.callee;
    if (callee.type === 'MemberExpression') callee = callee.object;
    if (callee.type !== 'Identifier' || (callee.name !== 'it' && callee.name !== 'test')) return;
    const nameArg = node.arguments?.[0];
    const name = nameArg?.type === 'Literal' ? String(nameArg.value) : '';
    const callback = node.arguments?.[1];
    const line = node.loc?.start?.line ?? 0;
    blocks.push({ name, body: callback, line });
  });
  return blocks;
}

export const edgeCoverageDetector: Detector = {
  id: 'edge-coverage',
  name: 'Edge Coverage',

  analyze(ast: any, _source: string, _filePath: string): DimensionResult {
    const findings: Finding[] = [];
    const blocks = findTestBlocks(ast);

    if (blocks.length === 0) {
      return { id: 'edge-coverage', name: 'Edge Coverage', score: 10, maxScore: 10, findings: [] };
    }

    // Collect literals across all test blocks
    const allLiterals: { value: any; line: number }[] = [];
    for (const block of blocks) {
      if (block.body) {
        const lits = collectLiterals(block.body);
        allLiterals.push(...lits);
      }
    }

    const edgeCases = hasEdgeCaseValues(allLiterals);
    const missingEdges: string[] = [];

    if (!edgeCases.hasNull) missingEdges.push('null/undefined');
    if (!edgeCases.hasZero) missingEdges.push('zero');
    if (!edgeCases.hasNegative) missingEdges.push('negative numbers');
    if (!edgeCases.hasEmpty) missingEdges.push('empty string/array/object');

    if (missingEdges.length > 0) {
      findings.push({
        type: 'missing-edge-cases',
        severity: missingEdges.length > 3 ? 'high' : missingEdges.length > 1 ? 'medium' : 'low',
        line: blocks[0]?.line || 0,
        message: `Tests may be missing edge case coverage: ${missingEdges.join(', ')}`,
        suggestion: `Add test cases for: ${missingEdges.join(', ')}`,
      });
    }

    // Check for error case testing
    let hasErrorTest = false;
    for (const block of blocks) {
      walk(block.body, (node) => {
        if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
          const prop = node.callee.property?.name || '';
          if (prop === 'rejects' || prop === 'toThrow' || prop === 'toThrowError') {
            hasErrorTest = true;
          }
        }
      });
    }

    if (!hasErrorTest && blocks.length > 0) {
      findings.push({
        type: 'missing-error-tests',
        severity: 'medium',
        line: blocks[0].line,
        message: 'No error/exception handling tests detected',
        suggestion: 'Add tests that verify the code handles errors and edge cases correctly',
      });
    }

    // Score: start at 10, deduct per missing edge
    const missingCount = missingEdges.length + (hasErrorTest ? 0 : 1);
    const score = Math.max(0, 10 - missingCount * 2);

    return { id: 'edge-coverage', name: 'Edge Coverage', score, maxScore: 10, findings };
  },
};
