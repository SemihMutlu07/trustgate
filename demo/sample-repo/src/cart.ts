export interface CartItem {
  id: string;
  name: string;
  price: number;
}

export function calculateTotal(items: CartItem[], isVip: boolean): number {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  if (isVip) {
    const discount = subtotal * 0.10; // 10% VIP Discount
    const total = subtotal - discount;
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }

  return Math.round((subtotal + Number.EPSILON) * 100) / 100;
}
