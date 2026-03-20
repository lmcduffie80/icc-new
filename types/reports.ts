export interface TopProduct {
  product_id: string;
  product_name: string;
  category: string;
  image: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_contact: string | null;
  total_quantity: string;
  total_revenue: string;
  unique_customers: string;
  avg_order_value: string;
}

export interface CustomerStats {
  total_customers: number;
  active_customers: number;
  new_customers: number;
  retention_rate: number;
  avg_lifetime_value: number;
}

export type TimePeriod = 'all_time' | '30_days' | '90_days' | '180_days' | 'year';
