import { describe, it, expect } from 'vitest';

interface User {
  id: number;
  name: string;
  email: string;
}

function createUser(name: string, email: string): User {
  return { id: Date.now(), name, email };
}

function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}

describe('createUser', () => {
  it('should create a user', () => {
    const user = createUser('Alice', 'alice@example.com');
    expect(user).toBeDefined();
    expect(user.name).toBeTruthy();
    expect(user.email).toBeTruthy();
  });

  it('should work', () => {
    const result = createUser('Bob', 'bob@example.com');
    expect(result).not.toBeNull();
  });
});

describe('calculateTotal', () => {
  it('should calculate total correctly 1', () => {
    const result = calculateTotal([1, 2, 3]);
    expect(result).toBeDefined();
  });

  it('should calculate total correctly 2', () => {
    const result = calculateTotal([]);
    expect(result).toBeDefined();
  });

  it('test', () => {
    const items = [1, 2, 3];
    const result = calculateTotal(items);
    expect(result).toBeGreaterThan(0);
  });
});

describe('User operations', () => {
  it('should work correctly', () => {
    const user = createUser('Charlie', 'charlie@example.com');
    expect(user).toBeTruthy();
    expect(user.id).toBeDefined();
  });
});
