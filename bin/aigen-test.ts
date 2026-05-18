#!/usr/bin/env node
import { scan } from '../src/core/scanner';
import { runDetectors } from '../src/core/runner';
import { Detector, AigenTestConfig } from '../src/core/types';
import { generateTerminalReport, generateJSONReport, generateSARIFReport, generateSummary } from '../src/cli/reporter';

// Import detectors
import { AssertionStrengthDetector } from '../src/detectors/shared/assertion-strength';
import { tautologyDetector } from '../src/detectors/shared/tautology';
import { aiPatternsDetector } from '../src/detectors/js/ai-patterns';
import overMockingDetector from '../src/detectors/js/over-mocking';
import { testSmellsDetector } from '../src/detectors/shared/test-smells';
import { readabilityDetector } from '../src/detectors/shared/readability';

function parseArgs(): AigenTestConfig {
  const args = process.argv.slice(2);
  const config: AigenTestConfig = { path: '.' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold' && i + 1 < args.length) {
      config.threshold = parseInt(args[++i], 10);
    } else if (args[i] === '--format' && i + 1 < args.length) {
      const val = args[++i];
      if (val === 'terminal' || val === 'json' || val === 'sarif') {
        config.format = val;
      }
    } else if (args[i] === '--ignore' && i + 1 < args.length) {
      config.ignore = args[++i].split(',');
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
  const config = parseArgs();

  // Register all detectors
  const detectors: Detector[] = [
    new AssertionStrengthDetector(),
    tautologyDetector,
    aiPatternsDetector,
    overMockingDetector,
    testSmellsDetector,
    readabilityDetector,
  ];

  // Scan for test files
  const scannerResult = scan(config.path, config.ignore);

  if (scannerResult.total === 0) {
    console.log('No test files found.');
    process.exit(0);
  }

  // Run detectors on each file
  const results = scannerResult.filePaths.map((fp) => runDetectors(fp, detectors));

  // Generate summary and report
  const summary = generateSummary(results, config.threshold);

  const format = config.format || 'terminal';
  if (format === 'json') {
    console.log(generateJSONReport(results, summary));
  } else if (format === 'sarif') {
    console.log(generateSARIFReport(results, summary));
  } else {
    console.log(generateTerminalReport(results, summary));
  }

  if (summary.result === 'failed') {
    process.exit(1);
  }
}

main();
