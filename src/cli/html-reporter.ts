import { TestFileResult, SummaryResult } from '../core/types';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreColor(score: number): string {
  if (score >= 8) return '#22c55e';
  if (score >= 5) return '#eab308';
  return '#ef4444';
}

function scoreBar(score: number): string {
  const pct = (score / 10) * 100;
  return `<div style="background:#e5e7eb;border-radius:4px;height:20px;overflow:hidden">
    <div style="width:${pct}%;height:100%;background:${scoreColor(score)};border-radius:4px;transition:width 0.3s"></div>
  </div>`;
}

function severityBadge(severity: string): string {
  const colors: Record<string, string> = {
    critical: '#7c3aed',
    high: '#ef4444',
    medium: '#eab308',
    low: '#3b82f6',
  };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff;background:${colors[severity] || '#6b7280'}">${severity}</span>`;
}

function generateFileHTML(result: TestFileResult): string {
  const fileName = result.filePath.split('/').pop() || result.filePath;
  const dirName = result.filePath.split('/').slice(0, -1).join('/');

  if (result.parseError) {
    return `<div class="file-card parse-error">
      <h3>${escapeHtml(fileName)}</h3>
      <p style="color:#ef4444">Parse error: ${escapeHtml(result.parseError)}</p>
    </div>`;
  }

  const dimRows = result.dimensions.map((d) => `
    <div class="dimension-row">
      <div class="dim-header">
        <span class="dim-name">${escapeHtml(d.name)}</span>
        <span class="dim-score" style="color:${scoreColor(d.score)}">${d.score}/${d.maxScore}</span>
      </div>
      ${scoreBar(d.score)}
      ${d.findings.length > 0 ? `
        <div class="findings" style="margin-top:8px">
          ${d.findings.slice(0, 5).map((f) => `
            <div class="finding" style="margin:4px 0;font-size:13px">
              ${severityBadge(f.severity)} <span style="color:#6b7280;font-size:12px">L${f.line}</span>
              ${escapeHtml(f.message)}
              ${f.suggestion ? `<br><span style="color:#6b7280;margin-left:4px">→ ${escapeHtml(f.suggestion)}</span>` : ''}
            </div>
          `).join('')}
          ${d.findings.length > 5 ? `<div style="color:#9ca3af;font-size:12px;margin-top:4px">... and ${d.findings.length - 5} more findings</div>` : ''}
        </div>
      ` : '<div style="color:#22c55e;font-size:13px;margin-top:4px">✓ All checks passed</div>'}
    </div>
  `).join('');

  return `<div class="file-card">
    <div class="file-header" onclick="this.nextElementSibling.classList.toggle('open')">
      <span class="file-name">${escapeHtml(fileName)}</span>
      <span class="file-dir">${escapeHtml(dirName)}</span>
      <span class="toggle">▼</span>
    </div>
    <div class="file-body open">${dimRows}</div>
  </div>`;
}

export function generateHTMLReport(results: TestFileResult[], summary: SummaryResult): string {
  const filesHTML = results.map(generateFileHTML).join('\n');

  const totalPassed = results.filter((r) => !r.parseError && r.dimensions.every((d) => d.score >= 6)).length;
  const totalFailed = results.length - totalPassed - results.filter((r) => r.parseError).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>aigen-test Report</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f9fafb; color:#111827; padding:24px; }
.header { margin-bottom:24px; }
.header h1 { font-size:24px; font-weight:700; color:#111827; }
.summary { display:flex; gap:16px; margin-bottom:24px; }
.stat { padding:16px 24px; border-radius:8px; text-align:center; min-width:100px; }
.stat-value { font-size:28px; font-weight:700; }
.stat-label { font-size:13px; color:#6b7280; }
.file-card { background:#fff; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin-bottom:12px; overflow:hidden; }
.file-header { padding:12px 16px; cursor:pointer; display:flex; align-items:center; gap:8px; user-select:none; }
.file-header:hover { background:#f3f4f6; }
.file-name { font-weight:600; font-size:15px; }
.file-dir { font-size:12px; color:#9ca3af; flex:1; }
.toggle { font-size:12px; color:#9ca3af; transition:transform 0.2s; }
.file-body { padding:0 16px 16px; }
.file-body:not(.open) { display:none; }
.dimension-row { margin-top:12px; padding:12px; background:#f9fafb; border-radius:6px; }
.dim-header { display:flex; justify-content:space-between; margin-bottom:6px; }
.dim-name { font-weight:500; font-size:14px; }
.dim-score { font-weight:700; font-size:14px; }
.parse-error { border-left:4px solid #ef4444; }
</style>
</head>
<body>
<div class="header">
  <h1>aigen-test Report</h1>
  <p style="color:#6b7280;margin-top:4px">${summary.totalFiles} file(s) · ${summary.threshold !== undefined ? `Threshold: ${summary.threshold}/10 · ${summary.result === 'passed' ? '✅ PASSED' : '❌ FAILED'}` : ''}</p>
</div>
<div class="summary">
  <div class="stat" style="background:#e0f2fe"><div class="stat-value" style="color:#0284c7">${summary.totalFiles}</div><div class="stat-label">Total Files</div></div>
  <div class="stat" style="background:#dcfce7"><div class="stat-value" style="color:#16a34a">${totalPassed}</div><div class="stat-label">Passed</div></div>
  <div class="stat" style="background:#fef9c3"><div class="stat-value" style="color:#ca8a04">${summary.warnings}</div><div class="stat-label">Warnings</div></div>
  <div class="stat" style="background:#fce7f3"><div class="stat-value" style="color:#db2777">${totalFailed}</div><div class="stat-label">Failed</div></div>
</div>
${filesHTML}
<script>
document.querySelectorAll('.file-header').forEach(function(h) {
  h.addEventListener('click', function() {
    var body = this.nextElementSibling;
    body.classList.toggle('open');
    var toggle = this.querySelector('.toggle');
    toggle.textContent = body.classList.contains('open') ? '▼' : '▶';
  });
});
</script>
</body>
</html>`;
}
