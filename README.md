# aigen-test

**ESLint for AI-generated tests** — static analysis tool that evaluates the quality of your test files across multiple dimensions.

```
npx aigen-test ./tests
```

---

## Why?

AI coding tools generate a lot of tests. Many of them look correct but:

- Use weak assertions (`toBeDefined()` instead of `toBe(42)`)
- Encode the same logic as the implementation (pass trivially, catch nothing)
- Over-mock dependencies (test mock setup, not real behavior)
- Skip edge cases entirely

`aigen-test` catches these patterns — no LLM cost, <1s per 1000 tests.

## Install

```bash
# Run without installing
npx aigen-test ./tests

# Or install globally
npm install -g aigen-test
aigen-test ./tests
```

## Usage

```bash
# Check all test files in a directory
aigen-test ./tests

# Check a single file
aigen-test tests/user.test.ts

# CI mode — fail if any dimension below threshold
aigen-test ./tests --threshold 6
echo $?  # 1 if any dimension < 6

# JSON output
aigen-test --format json
aigen-test --format json > report.json
```

## Dimensions

| Dimension | Measures | Why It Matters |
|-----------|----------|----------------|
| **Assertion Strength** | Are assertions verifying specific values or just checking existence? | `expect(result).toBeDefined()` tells you nothing about correctness |
| **Tautology** | Does the test encode the same logic as the code? | `expect(double(5)).toBe(double(5))` always passes — catches nothing |
| **AI Patterns** | Defensive assertions, template names, copy-paste blocks | AI-generated tests have distinct bad habits (Ouedraogo 2024) |
| **Over-Mocking** | Ratio of mocks to assertions | >80% mocked means you're testing mock behavior, not real code |
| **Test Smells** | Assertion roulette, empty tests, generic naming, skipped/only | Structural problems that erode test maintainability |
| **Readability** | Naming quality, test length, duplicate arrange blocks | Hard-to-read tests become technical debt |

## Examples

```bash
# A well-written test file
aigen-test tests/fixtures/good.test.ts
# → All dimensions ≥ 8/10 ✅

# AI-generated tests with weak assertions
aigen-test tests/fixtures/bad-assertions.test.ts
# → Assertion Strength 1/10 🔴
# → 9 weak assertions found

# Over-mocked test file
aigen-test tests/fixtures/over-mocked.test.ts
# → Over-Mocking 3/10 🔴
# → 14 mocks for 4 assertions
```

## CI Integration

```yaml
# .github/workflows/test-quality.yml
name: Test Quality
on: [pull_request]
jobs:
  aigen-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx aigen-test ./tests --threshold 6
```

## Philosophy

- **No LLM cost** — purely static analysis, no API calls, runs in <1s
- **No composite score** — each dimension scored independently (0–10)
- **False-positive aware** — conservative rules, no data-flow analysis beyond block scope
- **CI-first** — `--threshold` gates pull requests on test quality

## Development

```bash
npm install
npm run build
npm test  # vitest
```

## License

MIT
