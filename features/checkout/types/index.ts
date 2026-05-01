export interface CheckoutAddress {
  firstName?: string;
  lastName?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: 'US' | 'CA';
}

export interface CheckoutItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  unitOfMeasure?: string | null;
}

export interface CheckoutSummary {
  items: CheckoutItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
}
