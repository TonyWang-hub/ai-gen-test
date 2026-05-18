---
name: ai-gen-test
description: Run test quality analysis on your project's test files
---

Run `ai-gen-test` on the project's test files and report the results.

1. Run: `npx ai-gen-test ./tests --format terminal`
2. If the project uses Python for testing, also check: `npx ai-gen-test ./tests --format terminal`
3. Report the key findings: which dimensions scored low, and what specific issues were found
4. If any dimension scored below 6, suggest specific improvements
