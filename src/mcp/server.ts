#!/usr/bin/env node
/**
 * ai-gen-test MCP Server
 * Exposes test quality analysis as MCP tools for Claude Code and other MCP clients.
 *
 * Usage:
 *   npx tsx src/mcp/server.ts
 *   # Or add to Claude Code MCP config:
 *   {
 *     "mcpServers": {
 *       "ai-gen-test": {
 *         "command": "npx",
 *         "args": ["tsx", "path/to/src/mcp/server.ts"]
 *       }
 *     }
 *   }
 */
import { scan } from '../core/scanner';
import { runDetectors } from '../core/runner';
import { runPythonDetectors } from '../core/python-runner';
import { Detector, TestFileResult } from '../core/types';

// Import JS/TS detectors
import { AssertionStrengthDetector } from '../detectors/shared/assertion-strength';
import { tautologyDetector } from '../detectors/shared/tautology';
import { aiPatternsDetector } from '../detectors/js/ai-patterns';
import overMockingDetector from '../detectors/js/over-mocking';
import { testSmellsDetector } from '../detectors/shared/test-smells';
import { readabilityDetector } from '../detectors/shared/readability';
import { edgeCoverageDetector } from '../detectors/shared/edge-coverage';
import { mutationPredictionDetector } from '../detectors/shared/mutation-prediction';
import { flakyDetector } from '../detectors/shared/flaky-detection';

function isPythonFile(fp: string): boolean { return fp.endsWith('.py'); }

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any;
}

function runAnalysis(targetPath: string) {
  const jsDetectors: Detector[] = [
    new AssertionStrengthDetector(), tautologyDetector, aiPatternsDetector,
    overMockingDetector, testSmellsDetector, readabilityDetector,
    edgeCoverageDetector, mutationPredictionDetector, flakyDetector,
  ];

  const scanResult = scan(targetPath);
  const jsFiles = scanResult.filePaths.filter((f) => !isPythonFile(f));
  const pyFiles = scanResult.filePaths.filter(isPythonFile);

  const results: TestFileResult[] = [];
  for (const fp of jsFiles) results.push(runDetectors(fp, jsDetectors));
  for (const fp of pyFiles) results.push(runPythonDetectors(fp));

  return {
    totalFiles: results.length,
    files: results.map((r) => ({
      file: r.filePath,
      dimensions: r.dimensions.map((d) => ({
        name: d.name,
        score: d.score,
        maxScore: d.maxScore,
        findings: d.findings.slice(0, 3).map((f) => ({
          severity: f.severity, line: f.line, message: f.message,
        })),
      })),
      error: r.parseError,
    })),
  };
}

const STDIN = process.stdin;
const STDOUT = process.stdout;
let buffer = '';

STDIN.setEncoding('utf-8');
STDIN.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const req: MCPRequest = JSON.parse(line);
      handleRequest(req);
    } catch { /* skip malformed */ }
  }
});

function sendResponse(id: number, result: any) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
  STDOUT.write(msg);
}

function sendError(id: number, code: number, message: string) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n';
  STDOUT.write(msg);
}

function handleRequest(req: MCPRequest) {
  switch (req.method) {
    case 'initialize':
      sendResponse(req.id, {
        protocolVersion: '0.1.0',
        capabilities: { tools: {} },
        serverInfo: { name: 'ai-gen-test', version: '0.1.0' },
      });
      break;

    case 'tools/list':
      sendResponse(req.id, {
        tools: [
          {
            name: 'analyze_tests',
            description: 'Analyze test file quality across multiple dimensions',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Path to test files or directory' },
              },
              required: ['path'],
            },
          },
        ],
      });
      break;

    case 'tools/call':
      if (req.params?.name === 'analyze_tests') {
        const path = req.params.arguments?.path || '.';
        try {
          const result = runAnalysis(path);
          sendResponse(req.id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          });
        } catch (e: any) {
          sendError(req.id, -1, e.message);
        }
      } else {
        sendError(req.id, -32601, `Tool not found: ${req.params?.name}`);
      }
      break;

    default:
      sendResponse(req.id, {});
  }
}
