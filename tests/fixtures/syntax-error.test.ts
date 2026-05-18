import { describe, it, expect } from 'vitest';

function broken(): void {
  const x = ;
}

describe('broken tests', () => {
  it('should not parse', () => {
    expect(true).toBe(true);
  });
});
