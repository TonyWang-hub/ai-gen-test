# ai-gen-test

**ESLint for AI-generated tests** — static analysis tool that evaluates test file quality across 12 dimensions.

**AI 生成测试的质量分析工具** — 纯静态分析，零 LLM 成本，12 个维度评估测试质量。

---

## Quick Start / 快速开始

```bash
# Analyze a directory / 分析目录
npx ai-gen-test ./tests

# CI gate / CI 门禁
npx ai-gen-test ./tests --threshold 6

# HTML report / HTML 报告
npx ai-gen-test ./tests --format html -o report.html

# Baseline for trend tracking / 建立质量基线
npx ai-gen-test ./tests --baseline
npx ai-gen-test ./tests --compare
```

## Why ai-gen-test? / 为什么需要这个工具？

**English:** AI coding tools generate a lot of tests, but many have systematic quality issues — weak assertions, tautologies, over-mocking, flaky patterns. ai-gen-test catches these with pure static analysis: no LLM cost, <1s per 1000 tests.

**中文：** AI 编码工具大量生成测试，但这些测试存在系统性的质量问题——弱断言、同义反复（永远通过但抓不到 bug）、过度模拟、不稳定模式。ai-gen-test 在不调用 LLM 的前提下快速识别这些问题，零成本、毫秒级。

## Installation / 安装

```bash
npm install -g ai-gen-test

# Or run directly without install / 或直接运行
npx ai-gen-test ./tests
```

## Detectors / 检测器

### JavaScript / TypeScript (9 detectors)

| Detector / 检测器 | What it checks / 检测内容 |
|-------------------|--------------------------|
| **Assertion Strength / 断言强度** | Specific value checks vs existence-only (`toBeDefined`) |
| **Tautology / 同义反复** | Self-referencing assertions (`expect(x).toBe(x)`) |
| **AI Patterns / AI 坏味** | Defensive assertions, template names, copy-paste blocks |
| **Over-Mocking / 过度模拟** | Mock-to-assertion ratio (>80% = testing mocks, not code) |
| **Test Smells / 测试坏味** | Empty tests, generic naming, assertion roulette, skipped/only |
| **Readability / 可读性** | Naming quality, test length, duplicate arrange, comment ratio |
| **Edge Coverage / 边界覆盖** | Missing null, zero, negative, empty value tests |
| **Mutation Resilience / 变异韧性** | Static prediction of mutation score (Zhang & Mesbah, FSE 2015) |
| **Flaky Patterns / 不稳定模式** | setTimeout, Date.now, Math.random, process.env, locale |

### Python (3 detectors)

| Detector / 检测器 | What it checks / 检测内容 |
|-------------------|--------------------------|
| **Py Assertion Strength** | pytest `assert` and unittest assertion quality |
| **Py Over-Mocking** | mock.patch / MagicMock ratio analysis |
| **Py Test Smells** | Empty tests, generic naming, missing assertions |

### Go (1 detector)

| Detector / 检测器 | What it checks / 检测内容 |
|-------------------|--------------------------|
| **Go Test** | Assertion quality, table-driven test coverage, subtest usage |

## Languages / 支持的语言

| Language / 语言 | Status / 状态 | Test Frameworks / 测试框架 |
|----------------|---------------|--------------------------|
| JavaScript / TypeScript | ✅ Stable | Jest, Vitest, Mocha, Playwright |
| Python | ✅ Beta | pytest, unittest |
| Go | ✅ Alpha | testing (go test) |

## Usage / 使用方法

```bash
# Analyze a directory / 分析目录
npx ai-gen-test ./tests

# Single file / 单文件
npx ai-gen-test tests/user.test.ts

# CI gate — fail if any dimension below threshold / CI 门禁
npx ai-gen-test ./tests --threshold 6

# Python tests / Python 测试
npx ai-gen-test tests/ --format terminal

# JSON output / JSON 输出
npx ai-gen-test --format json > report.json

# SARIF for GitHub Code Scanning / SARIF 格式
npx ai-gen-test --format sarif > report.sarif

# HTML report / HTML 可视化报告
npx ai-gen-test --format html -o report.html

# Ignore paths / 排除目录
npx ai-gen-test ./tests --ignore build,dist

# Record baseline / 记录质量基线
npx ai-gen-test ./tests --baseline

# Compare against baseline / 对比基线趋势
npx ai-gen-test ./tests --compare
```

## Config File / 配置文件

Create `aigen-test.config.json` in your project root / 在项目根目录创建：

```json
{
  "threshold": 6,
  "ignore": ["dist", "build"],
  "detectors": {
    "assertion-strength": { "enabled": true },
    "tautology": { "enabled": true },
    "flaky-detection": { "enabled": true }
  }
}
```

CLI arguments override config file / CLI 参数优先于配置文件。

## Baseline / 质量基线

Track your project's test quality over time / 追踪测试质量变化趋势：

```bash
# First run — record current state / 首次运行，记录当前状态
npx ai-gen-test ./tests --baseline

# Later — compare against baseline / 后续运行，对比趋势
npx ai-gen-test ./tests --compare
# 📈 assertion-strength   baseline 7.2 → current 8.5 (+1.3)
# 📉 flaky-detection      baseline 9.0 → current 7.5 (-1.5)
```

## CI Integration / CI 集成

```yaml
# .github/workflows/test-quality.yml
name: Test Quality / 测试质量门禁
on: [pull_request]
jobs:
  ai-gen-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx ai-gen-test ./tests --threshold 6
```

## Claude Code Integration / Claude Code 集成

This project includes a [Claude Code Skill](skills/ai-gen-test.md) and an MCP server:

```json
{
  "mcpServers": {
    "ai-gen-test": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"]
    }
  }
}
```

## Sample Output / 输出示例

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AIgen-Test Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 tests/user.test.ts
  🔴 Assertion Strength      1/10  12 tests, 8 use toBeDefined() only
     → Use .toEqual(expected) instead of toBeDefined()
  ✅ Tautology              10/10  No tautological patterns found
  ⚠️ Flaky Patterns          7/10  Uses setTimeout + Date.now()
───
3 file(s) / 1 error | threshold 6 → ❌ FAILED
```

## Output Formats / 输出格式

| Format / 格式 | Command / 命令 | Use Case / 使用场景 |
|---------------|----------------|-------------------|
| Terminal | default | Local dev / 本地开发 |
| JSON | `--format json` | CI / programmatic |
| SARIF | `--format sarif` | GitHub Code Scanning |
| HTML | `--format html` | Visual reports / 可视化报告 |

## Philosophy / 设计理念

**English:**
- **No LLM cost** — purely static analysis, runs in <1s per 1000 tests
- **No composite score** — each dimension scored independently (0-10)
- **Zero external dependencies** — install and run, no config needed
- **CI-first** — `--threshold` gates PRs on test quality

**中文：**
- **零 LLM 成本** — 纯静态分析，1000 个测试不到 1 秒
- **不合成总分** — 每个维度独立评分（0-10），不给忽悠人的综合分
- **零外部依赖** — 装完就能用，不需要配置
- **CI 优先** — `--threshold` 在 PR 阶段拦截低质量测试

## Development / 开发

```bash
npm install
npm run build   # TypeScript compile / 编译
npm test        # Run tests / 运行测试
npm run dev     # Watch mode / 监听模式
```

## License / 许可

MIT

---

**ai-gen-test** · [GitHub](https://github.com/TonyWang-hub/ai-gen-test) · `npx ai-gen-test ./tests`
