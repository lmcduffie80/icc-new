import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartItem {
  id: string;
  name: string;
  price: string;
  image: string;
  quantity: number;
  inStock: boolean;
  approvedStates?: string[];
  unitOfMeasure?: string | null;
  truckloadEligible?: boolean;
  casesPerPallet?: number | null;
  bulkDensityLbsPerGallon?: number | null;
  gallonsPerCase?: number | null;
  labelUrl?: string | null;
  restrictedUse?: boolean;
  attributes?: {
    containerSizes?: string;
  } | null;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getSubtotal: () => number;
  refreshMetadata: (updates: Record<string, Partial<CartItem>>) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      
      addItem: (item) => {
        const items = get().items;
        const existingItem = items.find((i) => i.id === item.id);
        
        if (existingItem) {
          // Update quantity and refresh product metadata (e.g. truckloadEligible flag)
          set({
            items: items.map((i) =>
              i.id === item.id
                ? { ...item, quantity: i.quantity + (item.quantity || 1) }
                : i
            ),
          });
        } else {
          // Add new item
          set({
            items: [...items, { ...item, quantity: item.quantity || 1 }],
          });
        }
      },
      
      removeItem: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },
      
      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
        } else {
          set({
            items: get().items.map((item) =>
              item.id === id ? { ...item, quantity } : item
            ),
          });
        }
      },
      
      clearCart: () => {
        set({ items: [] });
      },

      refreshMetadata: (updates) => {
        set({
          items: get().items.map((i) =>
            updates[i.id] ? { ...i, ...updates[i.id] } : i
          ),
        });
      },
      
      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
      
      getSubtotal: () => {
        return get().items.reduce(
          (total, item) => total + parseFloat(item.price) * item.quantity,
          0
        );
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

