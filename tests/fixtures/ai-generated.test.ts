import { describe, it, expect, vi } from 'vitest';

interface User {
  id: number;
  name: string;
  email: string;
}

function fetchUser(id: number): Promise<User | null> {
  return Promise.resolve({ id, name: 'Test', email: 'test@example.com' });
}

function sendEmail(to: string, subject: string, body: string): boolean {
  return true;
}

describe('User tests', () => {
  it('should work correctly', () => {
    expect(1).toBe(1);
  });

  it('test function', () => {
    const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
    expect(user).not.toBeNull();
    expect(user.name).toBeDefined();
    expect(user.email).toBeDefined();
  });

  it('correct behavior', () => {
    const x = fetchUser(1);
    expect(x).toBeDefined();
  });
});

describe('Email tests', () => {
  it('should send email', () => {
    const result = sendEmail('a@test.com', 'Subject', 'Body');
    expect(result).not.toBeNull();
  });

  it('test1', () => {
    expect(sendEmail('b@test.com', 'Test', 'Hello')).toBeDefined();
  });
});

describe('Duplicate block tests', () => {
  it('should test case A', () => {
    const items = [1, 2, 3];
    const result = items.reduce((a, b) => a + b, 0);
    expect(result).toBe(6);
  });

  it('should test case B', () => {
    const items = [1, 2, 3];
    const result = items.reduce((a, b) => a + b, 0);
    expect(result).toBe(6);
  });

  it('should test case C', () => {
    const items = [1, 2, 3];
    const result = items.reduce((a, b) => a + b, 0);
    expect(result).toBe(6);
  });
});
