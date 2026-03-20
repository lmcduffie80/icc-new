import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CompareProduct {
  id: string;
  name: string;
  price: string;
  image: string;
  category: string;
}

interface CompareStore {
  products: CompareProduct[];
  addProduct: (product: CompareProduct) => void;
  removeProduct: (id: string) => void;
  clearCompare: () => void;
  isInCompare: (id: string) => boolean;
  getCount: () => number;
  canAddMore: () => boolean;
}

const MAX_COMPARE_PRODUCTS = 3;

export const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      products: [],
      
      addProduct: (product) => {
        const products = get().products;
        
        // Check if already in compare list
        if (products.some((p) => p.id === product.id)) {
          return;
        }
        
        // Check if at max capacity
        if (products.length >= MAX_COMPARE_PRODUCTS) {
          return;
        }
        
        set({
          products: [...products, product],
        });
      },
      
      removeProduct: (id) => {
        set({ products: get().products.filter((product) => product.id !== id) });
      },
      
      clearCompare: () => {
        set({ products: [] });
      },
      
      isInCompare: (id) => {
        return get().products.some((product) => product.id === id);
      },
      
      getCount: () => {
        return get().products.length;
      },
      
      canAddMore: () => {
        return get().products.length < MAX_COMPARE_PRODUCTS;
      },
    }),
    {
      name: 'compare-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

