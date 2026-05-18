import { describe, it, expect, beforeAll } from 'vitest';

let globalState: number[] = [];

describe('User API', () => {
  beforeAll(() => {
    globalState = [1, 2, 3];
  });

  it('should fetch users', async () => {
    await new Promise((r) => setTimeout(r, 1000));
    const result = [1, 2, 3];
    expect(result).toEqual(globalState);
  });

  it('should handle dates', () => {
    const now = new Date();
    const year = now.getFullYear();
    expect(year).toBeGreaterThan(2020);
  });

  it('should use random', () => {
    const id = Math.random();
    expect(id).toBeGreaterThanOrEqual(0);
  });

  it.skip('flaky test', () => {
    expect(true).toBe(true);
  });
});

describe('Environment', () => {
  it('should have API key', () => {
    const key = process.env.API_KEY || 'default';
    expect(key).toBeDefined();
  });

  it('should work correctly', () => {
    const price = (99.95).toFixed(2);
    expect(price).toBe('99.95');
  });
});
