export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  msrp: number | null;
  category: string;
  imageUrl: string | null;
  unitOfMeasure: string | null;
  isActive: boolean;
  isFeatured: boolean;
  tenantId: string;
}

export interface ProductFilter {
  category?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}
