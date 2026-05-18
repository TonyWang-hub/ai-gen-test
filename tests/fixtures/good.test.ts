import { describe, it, expect } from 'vitest';

interface User {
  id: number;
  name: string;
  email: string;
}

let nextId = 1000;
function createUser(name: string, email: string): User {
  return { id: nextId++, name, email };
}

function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}

describe('createUser', () => {
  it('should create a user with the provided name and email', () => {
    const user = createUser('Alice', 'alice@example.com');
    expect(user.name).toBe('Alice');
    expect(user.email).toBe('alice@example.com');
    expect(user.id).toBeGreaterThan(0);
  });

  it('should generate a unique id for each user', () => {
    const user1 = createUser('Alice', 'alice@example.com');
    const user2 = createUser('Bob', 'bob@example.com');
    expect(user1.id).not.toBe(user2.id);
  });
});

describe('calculateTotal', () => {
  it('should sum all numbers in the array', () => {
    expect(calculateTotal([1, 2, 3])).toBe(6);
  });

  it('should return 0 for an empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('should handle negative numbers', () => {
    expect(calculateTotal([-1, 0, 1])).toBe(0);
  });

  it('should handle single element array', () => {
    expect(calculateTotal([42])).toBe(42);
  });
});
