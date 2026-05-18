#!/usr/bin/env node
import { scan } from '../src/core/scanner';
import { runDetectors } from '../src/core/runner';
import { runPythonDetectors } from '../src/core/python-runner';
import { Detector, TestFileResult } from '../src/core/types';
import { AigenTestConfig, loadConfig } from '../src/core/config';
import { generateTerminalReport, generateJSONReport, generateSARIFReport, generateSummary } from '../src/cli/reporter';
import { generateHTMLReport } from '../src/cli/html-reporter';

// Import JS/TS detectors
import { AssertionStrengthDetector } from '../src/detectors/shared/assertion-strength';
import { tautologyDetector } from '../src/detectors/shared/tautology';
import { aiPatternsDetector } from '../src/detectors/js/ai-patterns';
import overMockingDetector from '../src/detectors/js/over-mocking';
import { testSmellsDetector } from '../src/detectors/shared/test-smells';
import { readabilityDetector } from '../src/detectors/shared/readability';
import { edgeCoverageDetector } from '../src/detectors/shared/edge-coverage';
import { mutationPredictionDetector } from '../src/detectors/shared/mutation-prediction';
import { flakyDetector } from '../src/detectors/shared/flaky-detection';

function isPythonFile(filePath: string): boolean {
  return filePath.endsWith('.py');
}

function parseArgs(): Partial<AigenTestConfig> & { path?: string } {
  const args = process.argv.slice(2);
  const config: Partial<AigenTestConfig> & { path?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold' && i + 1 < args.length) {
      config.threshold = parseInt(args[++i], 10);
    } else if (args[i] === '--format' && i + 1 < args.length) {
      const val = args[++i];
      if (['terminal', 'json', 'sarif', 'html'].includes(val)) {
        config.format = val as AigenTestConfig['format'];
      }
    } else if (args[i] === '--ignore' && i + 1 < args.length) {
      config.ignore = args[++i].split(',');
    } else if (args[i] === '--output' && i + 1 < args.length) {
      config.output = args[++i];
    } else if (args[i] === '--version') {
      console.log('aigen-test v0.1.0');
      process.exit(0);
    } else if (!args[i].startsWith('--')) {
      config.path = args[i];
    }
  }

  return config;
}

function main(): void {
  const cliConfig = parseArgs();
  const config = loadConfig(process.cwd(), cliConfig);
  const targetPath = cliConfig.path || '.';

  // Register JS/TS detectors
  const detectors: Detector[] = [
    new AssertionStrengthDetector(),
    tautologyDetector,
    aiPatternsDetector,
    overMockingDetector,
    testSmellsDetector,
    readabilityDetector,
    edgeCoverageDetector,
    mutationPredictionDetector,
    flakyDetector,
  ];

  const enabledDetectors = config.detectors
    ? detectors.filter((d) => config.detectors![d.id]?.enabled !== false)
    : detectors;

  // Scan for test files
  const scannerResult = scan(targetPath, config.ignore);

  if (scannerResult.total === 0) {
    console.log('No test files found.');
    process.exit(0);
  }

  // Separate Python and JS/TS files
  const jsFiles = scannerResult.filePaths.filter((fp) => !isPythonFile(fp));
  const pyFiles = scannerResult.filePaths.filter(isPythonFile);

  // Run detectors
  const results: TestFileResult[] = [];

  // JS/TS files (sync)
  for (const fp of jsFiles) {
    results.push(runDetectors(fp, enabledDetectors));
  }

  // Python files (subprocess)
  for (const fp of pyFiles) {
    results.push(runPythonDetectors(fp));
  }

  // Generate summary and report
  const summary = generateSummary(results, config.threshold);

  const format = config.format || 'terminal';
  if (format === 'json') {
    const output = generateJSONReport(results, summary);
    if (config.output) { require('fs').writeFileSync(config.output, output); }
    else { console.log(output); }
  } else if (format === 'sarif') {
    const output = generateSARIFReport(results, summary);
    if (config.output) { require('fs').writeFileSync(config.output, output); }
    else { console.log(output); }
  } else if (format === 'html') {
    const output = generateHTMLReport(results, summary);
    if (config.output) { require('fs').writeFileSync(config.output, output); }
    else { console.log(output); }
  } else {
    console.log(generateTerminalReport(results, summary));
  }

  if (summary.result === 'failed') {
    process.exit(1);
  }
}

main();
