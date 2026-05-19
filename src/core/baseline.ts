/**
 * Self-calibration baseline for project-local quality thresholds.
 *
 * When run for the first time on a project, ai-gen-test scans all test files
 * and records the scores as a "baseline". Subsequent runs compare against
 * this baseline, helping teams track quality trends over time.
 *
 * Usage:
 *   ai-gen-test --baseline  record current scores as baseline
 *   ai-gen-test --compare   compare against baseline (default if baseline exists)
 */
import * as fs from 'fs';
import * as path from 'path';
import { TestFileResult } from './types';

export interface BaselineData {
  createdAt: string;
  projectHash?: string;
  dimensions: {
    [id: string]: {
      avgScore: number;
      minScore: number;
      maxScore: number;
      passing: boolean;
    };
  };
  summary: {
    totalFiles: number;
    avgScore: number;
    passingFiles: number;
  };
}

function computeBaseline(results: TestFileResult[]): BaselineData {
  const dimScores: { [id: string]: number[] } = {};

  for (const r of results) {
    for (const d of r.dimensions) {
      if (!dimScores[d.id]) dimScores[d.id] = [];
      dimScores[d.id].push(d.score);
    }
  }

  const dimensions: BaselineData['dimensions'] = {};
  for (const [id, scores] of Object.entries(dimScores)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    dimensions[id] = {
      avgScore: Math.round(avg * 10) / 10,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      passing: avg >= 6,
    };
  }

  const allScores = Object.values(dimensions);
  const totalAvg = allScores.length > 0
    ? allScores.reduce((a, d) => a + d.avgScore, 0) / allScores.length
    : 0;

  return {
    createdAt: new Date().toISOString(),
    dimensions,
    summary: {
      totalFiles: results.length,
      avgScore: Math.round(totalAvg * 10) / 10,
      passingFiles: results.filter((r) =>
        !r.parseError && r.dimensions.length > 0 &&
        r.dimensions.every((d) => d.score >= 6)
      ).length,
    },
  };
}

export function baselinePath(cwd: string): string {
  return path.join(cwd, '.ai-gen-test-baseline.json');
}

export function saveBaseline(cwd: string, results: TestFileResult[]): BaselineData {
  const data = computeBaseline(results);
  const outPath = baselinePath(cwd);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Baseline saved to ${outPath}`);
  return data;
}

export function loadBaseline(cwd: string): BaselineData | null {
  const bp = baselinePath(cwd);
  try {
    return JSON.parse(fs.readFileSync(bp, 'utf-8'));
  } catch {
    return null;
  }
}

export function compareToBaseline(results: TestFileResult[], baseline: BaselineData): string {
  const lines: string[] = [];
  lines.push('\n📈 Quality Trend vs Baseline');
  lines.push('━'.repeat(40));

  const current = computeBaseline(results);

  for (const [id, dim] of Object.entries(baseline.dimensions)) {
    const curr = current.dimensions[id];
    if (!curr) continue;

    const diff = curr.avgScore - dim.avgScore;
    const arrow = diff > 0.5 ? '📈' : diff < -0.5 ? '📉' : '➡️';
    const sign = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    lines.push(`  ${arrow} ${id.padEnd(22)} baseline ${dim.avgScore.toFixed(1)} → current ${curr.avgScore.toFixed(1)} (${sign})`);
  }

  const avgDiff = current.summary.avgScore - baseline.summary.avgScore;
  lines.push(`  ${avgDiff > 0 ? '📈' : '📉'} OVERALL              baseline ${baseline.summary.avgScore.toFixed(1)} → current ${current.summary.avgScore.toFixed(1)} (${avgDiff > 0 ? '+' : ''}${avgDiff.toFixed(1)})`);
  lines.push('');

  return lines.join('\n');
}
