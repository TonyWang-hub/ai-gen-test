#!/usr/bin/env python3
"""Parse a Python test file and output test analysis as JSON."""
import ast
import json
import sys


def analyze_file(filepath: str) -> dict:
    with open(filepath, encoding="utf-8") as f:
        source = f.read()

    try:
        tree = ast.parse(source, filename=filepath)
    except SyntaxError as e:
        return {"error": str(e), "filepath": filepath}

    functions = []
    classes = []

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            func_info = {
                "name": node.name,
                "line": node.lineno,
                "is_test": node.name.startswith("test_") or node.name.endswith("_test"),
                "has_assertions": False,
                "has_mocks": False,
                "assertion_count": 0,
                "mock_count": 0,
                "body_lines": len(node.body) if node.body else 0,
                "decorators": [ast.unparse(d) for d in node.decorator_list],
            }
            for n in ast.walk(node):
                if isinstance(n, ast.Assert):
                    func_info["has_assertions"] = True
                    func_info["assertion_count"] += 1
                elif isinstance(n, ast.Call):
                    call_str = ast.unparse(n.func) if isinstance(n.func, ast.Attribute) else ""
                    if "assert" in call_str or n.func.id == "assertEqual" if isinstance(n.func, ast.Name) else False:
                        func_info["has_assertions"] = True
                        func_info["assertion_count"] += 1
                    elif isinstance(n.func, ast.Name) and n.func.id in ("Mock", "MagicMock", "patch", "mock"):
                        func_info["has_mocks"] = True
                        func_info["mock_count"] += 1
                    elif isinstance(n.func, ast.Attribute):
                        fname = ast.unparse(n.func)
                        if "mock" in fname or "patch" in fname:
                            func_info["has_mocks"] = True
                            func_info["mock_count"] += 1
            functions.append(func_info)

        elif isinstance(node, ast.ClassDef):
            classes.append({
                "name": node.name,
                "line": node.lineno,
                "is_test": node.name.endswith("Test"),
                "methods": len([n for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]),
            })

    return {
        "filepath": filepath,
        "functions": functions,
        "classes": classes,
        "total_assertions": sum(f["assertion_count"] for f in functions),
        "total_mocks": sum(f["mock_count"] for f in functions),
        "test_functions": [f for f in functions if f["is_test"]],
        "test_assertion_count": sum(f["assertion_count"] for f in functions if f["is_test"]),
        "test_mock_count": sum(f["mock_count"] for f in functions if f["is_test"]),
        "empty_tests": [f["name"] for f in functions if f["is_test"] and f["body_lines"] == 0],
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file specified"}))
        sys.exit(1)
    result = analyze_file(sys.argv[1])
    print(json.dumps(result))
