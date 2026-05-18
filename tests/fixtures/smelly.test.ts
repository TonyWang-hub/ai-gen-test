import { describe, it, expect } from 'vitest';

function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

// it('should do something', () => {
//   expect(add(1, 2)).toBe(3);
// });

// it.skip('commented test', () => {
//   expect(add(2, 2)).toBe(4);
// });

describe('Math operations', () => {
  it('should work', () => {
  });

  it('test1', () => {
    expect(add(1, 2)).toBe(3);
    expect(add(3, 4)).toBe(7);
    expect(add(5, 6)).toBe(11);
    expect(add(7, 8)).toBe(15);
    expect(add(9, 10)).toBe(19);
  });

  it('should work correctly', () => {
    expect(multiply(2, 3)).toBe(6);
    expect(multiply(4, 5)).toBe(20);
    expect(multiply(6, 7)).toBe(42);
  });

  it.only('focused test', () => {
    expect(add(0, 0)).toBe(0);
  });
});

it.skip('skipped top-level test', () => {
  expect(true).toBe(true);
});
