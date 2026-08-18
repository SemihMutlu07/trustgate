import { describe, it, expect } from 'vitest';
import { calculateTotal } from '../src/cart.js';

describe('Cart Total Calculation', () => {
  const items = [
    { id: '1', name: 'Keyboard', price: 100 },
    { id: '2', name: 'Mouse', price: 50 },
  ];

  it('calculates full price for regular users', () => {
    expect(calculateTotal(items, false)).toBe(150);
  });

  it('applies 10% discount for VIP users', () => {
    // 150 - 15 = 135
    expect(calculateTotal(items, true)).toBe(135);
  });

  it('handles empty items list', () => {
    expect(calculateTotal([], false)).toBe(0);
    expect(calculateTotal([], true)).toBe(0);
  });

  it('handles floating point precision and rounds to 2 decimal places', () => {
    const decimalItems = [{ id: '1', name: 'Book', price: 19.99 }];
    // 19.99 * 0.9 = 17.991 -> rounds to 17.99
    expect(calculateTotal(decimalItems, true)).toBe(17.99);
  });
});
