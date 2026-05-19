# ai-gen-test

**ESLint for AI-generated tests** — static analysis tool that evaluates test file quality across 12 dimensions.

**AI 生成测试的质量分析工具** — 纯静态分析，零 LLM 成本，从 12 个维度评估测试质量。

---

## Quick Start / 快速开始

```bash
# Run without installing / 无需安装直接运行
npx ai-gen-test ./tests

# CI mode / CI 门禁模式
npx ai-gen-test ./tests --threshold 6 --format json

# HTML report / HTML 报告
npx ai-gen-test ./tests --format html -o report.html
```

## Why / 为什么需要这个工具？

AI coding tools generate a lot of tests, but many have systematic quality issues:

- **Weak assertions**: `expect(x).toBeDefined()` checks existence, not correctness
- **Tautologies**: tests that encode the same logic as the code — always pass, catch nothing
- **AI patterns**: defensive assertions, template names, copy-paste blocks
- **Over-mocking**: testing mock setup, not real behavior
- **Flaky patterns**: time-dependent, random, environment-dependent tests

AI 编码工具大量生成测试，但这些测试存在系统性的质量问题——弱断言、同义反复、过度模拟、不稳定模式。ai-gen-test 在不调用 LLM 的前提下快速识别这些问题。

## Installation / 安装

```bash
npm install -g ai-gen-test
# or / 或
npx ai-gen-test ./tests
```

## Detectors / 检测器

### 9 JS/TS Detectors

| Detector | Measures | Why It Matters |
|----------|----------|----------------|
| **Assertion Strength** | Are assertions specific or just existence checks? | `expect(x).toBeDefined()` tells you nothing about correctness |
| **Tautology** | Does the test encode the same logic as the code? | `expect(fn()).toBe(fn())` always passes — catches nothing |
| **AI Patterns** | Defensive assertions, template names, copy-paste | AI-generated tests have distinct bad habits |
| **Over-Mocking** | Ratio of mocks to assertions | > 80% mocked = testing mocks, not real code |
| **Test Smells** | Assertion roulette, empty tests, generic naming | Structural problems erode maintainability |
| **Readability** | Naming quality, test length, duplicate arrange | Hard-to-read tests become tech debt |
| **Edge Coverage** | Missing null/zero/negative/empty test values | Edge cases cause most production bugs |
| **Mutation Resilience** | Static prediction of mutation score | Based on Zhang & Mesbah (FSE 2015) |
| **Flaky Patterns** | Sleep, Date, Math.random, process.env, locale | Non-deterministic tests break CI randomly |

### 3 Python Detectors

| Detector | Measures |
|----------|----------|
| **Py Assertion Strength** | PyTest/Unittest assertion quality |
| **Py Over-Mocking** | Mock ratio analysis |
| **Py Test Smells** | Empty tests, generic naming, missing assertions |

## Usage / 使用方法

```bash
# Analyze a directory
npx ai-gen-test ./tests

# Single file
npx ai-gen-test tests/user.test.ts

# CI mode — fail if any dimension below threshold
npx ai-gen-test ./tests --threshold 6

# Python support
npx ai-gen-test tests/ --format terminal

# JSON output
npx ai-gen-test --format json > report.json

# SARIF (GitHub Code Scanning)
npx ai-gen-test --format sarif > report.sarif

# HTML report
npx ai-gen-test --format html -o report.html

# Ignore paths
npx ai-gen-test ./tests --ignore build,dist

# Config file
echo '{ "threshold": 6, "ignore": ["build"] }' > aigen-test.config.json
npx ai-gen-test
```

## CI Integration / CI 集成

```yaml
# .github/workflows/test-quality.yml
name: Test Quality
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

## Claude Code Integration

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

## Config File / 配置文件

Create `aigen-test.config.json` in your project root:

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

## Sample Output / 输出示例

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AIgen-Test Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 tests/user.test.ts
  🔴 Assertion Strength      1/10  12 tests, 8 use toBeDefined() only
     → Use toEqual(expected) instead of toBeDefined()
  ✅ Tautology              10/10  No tautological patterns found
  ⚠️ Flaky Patterns          7/10  Uses sleep() + Date.now()
  ⚠️ Edge Coverage           4/10  Missing: null, empty string, negative
───
3 file(s) checked | 1 error | —threshold 6 → ❌ FAILED
```

## Output Formats / 输出格式

| Format | Command | Use Case |
|--------|---------|----------|
| Terminal | default | Local development |
| JSON | `--format json` | CI / programmatic |
| SARIF | `--format sarif` | GitHub Code Scanning |
| HTML | `--format html` | Visual reports |

## Supported Languages / 支持的语言

| Language | Status | Test Frameworks |
|----------|--------|-----------------|
| JavaScript / TypeScript | ✅ GA | Jest, Vitest, Mocha, Playwright |
| Python | ✅ beta | pytest, unittest |
| Go | ⬜ Planned | |
| Java | ⬜ Planned | |

## Philosophy / 设计理念

- **No LLM cost** — purely static analysis, runs in <1s per 1000 tests
- **No composite score** — each dimension scored independently (0-10)
- **Zero external dependencies** — install and run, no config needed
- **CI-first** — `--threshold` gates PRs on test quality

## Development

```bash
npm install
npm run build
npm test
```

## License / 许可

MIT

---

**ai-gen-test** · [GitHub](https://github.com/TonyWang-hub/ai-gen-test) · `npx ai-gen-test`
