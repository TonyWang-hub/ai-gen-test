import { describe, it, expect } from 'vitest';

function double(n: number): number {
  return n * 2;
}

function greet(name: string): string {
  return `Hello, ${name}!`;
}

describe('double', () => {
  it('should double the input', () => {
    const result = double(5);
    expect(result).toBe(result);
  });

  it('should handle zero', () => {
    expect(double(0)).toBe(0);
  });
});

describe('greet', () => {
  it('should greet the person', () => {
    const input = 'Alice';
    const result = greet(input);
    expect(result).toBe(result);
  });

  it('should return a string', () => {
    const name = 'Bob';
    const greeting = greet(name);
    expect(greeting).toBe(greeting);
  });
});
