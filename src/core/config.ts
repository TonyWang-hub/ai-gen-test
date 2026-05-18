import * as fs from 'fs';
import * as path from 'path';

export interface AigenTestConfig {
  threshold?: number;
  format?: 'terminal' | 'json' | 'sarif' | 'html';
  ignore?: string[];
  output?: string;
  detectors?: {
    [key: string]: { enabled: boolean };
  };
}

const DEFAULT_CONFIG: AigenTestConfig = {};

function findConfigFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const configPath = path.join(dir, 'aigen-test.config.json');
    if (fs.existsSync(configPath)) return configPath;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadConfigFile(configPath: string): Partial<AigenTestConfig> {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadPackageConfig(startDir: string): Partial<AigenTestConfig> {
  try {
    const pkgPath = path.join(path.resolve(startDir), 'package.json');
    if (!fs.existsSync(pkgPath)) return {};
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg['aigen-test'] || {};
  } catch {
    return {};
  }
}

export function loadConfig(cwd: string, cliConfig: Partial<AigenTestConfig>): AigenTestConfig {
  const configPath = findConfigFile(cwd);
  const fileConfig = configPath ? loadConfigFile(configPath) : {};
  const pkgConfig = loadPackageConfig(cwd);

  // Merge: defaults < package.json < config file < CLI
  const merged: AigenTestConfig = { ...DEFAULT_CONFIG };

  if (pkgConfig.threshold !== undefined) merged.threshold = pkgConfig.threshold;
  if (pkgConfig.ignore) merged.ignore = pkgConfig.ignore;
  if (pkgConfig.format) merged.format = pkgConfig.format;

  if (fileConfig.threshold !== undefined) merged.threshold = fileConfig.threshold;
  if (fileConfig.ignore) merged.ignore = fileConfig.ignore;
  if (fileConfig.format) merged.format = fileConfig.format;
  if (fileConfig.output) merged.output = fileConfig.output;
  if (fileConfig.detectors) merged.detectors = fileConfig.detectors;

  if (cliConfig.threshold !== undefined) merged.threshold = cliConfig.threshold;
  if (cliConfig.ignore) merged.ignore = cliConfig.ignore;
  if (cliConfig.format) merged.format = cliConfig.format;
  if (cliConfig.output) merged.output = cliConfig.output;

  return merged;
}
