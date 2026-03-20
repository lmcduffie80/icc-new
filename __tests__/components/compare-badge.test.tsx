import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareBadge } from '@/components/compare-badge';
import { useCompareStore } from '@/lib/compare-store';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('CompareBadge component', () => {
  beforeEach(() => {
    // Clear the compare store before each test
    useCompareStore.getState().clearCompare();
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('visibility', () => {
    it('should not render when count is 0', () => {
      render(<CompareBadge />);
      
      // Button should not be in the document
      const button = screen.queryByRole('button');
      expect(button).not.toBeInTheDocument();
    });

    it('should render when count is 1', async () => {
      // Add a product to compare
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      // Wait for component to mount (handles hydration)
      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });

    it('should render when count is 3', async () => {
      const store = useCompareStore.getState();
      store.addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });
      store.addProduct({
        id: '2',
        name: 'Product 2',
        price: '39.99',
        image: '/image2.jpg',
        category: 'test',
      });
      store.addProduct({
        id: '3',
        name: 'Product 3',
        price: '49.99',
        image: '/image3.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });
  });

  describe('count display', () => {
    it('should display correct count (1)', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByText('Compare (1)')).toBeInTheDocument();
      });
    });

    it('should display correct count (2)', async () => {
      const store = useCompareStore.getState();
      store.addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });
      store.addProduct({
        id: '2',
        name: 'Product 2',
        price: '39.99',
        image: '/image2.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByText('Compare (2)')).toBeInTheDocument();
      });
    });

    it('should display correct count (3)', async () => {
      const store = useCompareStore.getState();
      store.addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });
      store.addProduct({
        id: '2',
        name: 'Product 2',
        price: '39.99',
        image: '/image2.jpg',
        category: 'test',
      });
      store.addProduct({
        id: '3',
        name: 'Product 3',
        price: '49.99',
        image: '/image3.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByText('Compare (3)')).toBeInTheDocument();
      });
    });
  });

  describe('user interaction', () => {
    it('should navigate to /compare when clicked', async () => {
      const user = userEvent.setup();
      
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      const button = screen.getByRole('button');
      await user.click(button);
      
      expect(mockPush).toHaveBeenCalledWith('/compare');
    });
  });

  describe('styling', () => {
    it('should have fixed positioning', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toHaveClass('fixed');
        expect(button).toHaveClass('bottom-6');
        expect(button).toHaveClass('right-6');
      });
    });

    it('should have primary background', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toHaveClass('bg-primary');
        expect(button).toHaveClass('text-primary-foreground');
      });
    });

    it('should have rounded-full shape', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toHaveClass('rounded-full');
      });
    });

    it('should have shadow effects', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toHaveClass('shadow-lg');
      });
    });
  });

  describe('icon', () => {
    it('should render comparison icon', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      const { container } = render(<CompareBadge />);
      
      await waitFor(() => {
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper aria-label', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        const button = screen.getByRole('button', { 
          name: /view 1 product comparison/i 
        });
        expect(button).toBeInTheDocument();
      });
    });

    it('should update aria-label with count', async () => {
      const store = useCompareStore.getState();
      store.addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });
      store.addProduct({
        id: '2',
        name: 'Product 2',
        price: '39.99',
        image: '/image2.jpg',
        category: 'test',
      });

      render(<CompareBadge />);
      
      await waitFor(() => {
        const button = screen.getByRole('button', { 
          name: /view 2 product comparisons/i 
        });
        expect(button).toBeInTheDocument();
      });
    });
  });

  describe('reactivity to store changes', () => {
    it('should appear when product is added', async () => {
      const { rerender } = render(<CompareBadge />);
      
      // Initially no button
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      
      // Add product
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });
      
      // Force rerender to pick up store change
      rerender(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });

    it('should disappear when all products are removed', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      const { rerender } = render(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
      
      // Clear products
      useCompareStore.getState().clearCompare();
      
      // Force rerender
      rerender(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
      });
    });

    it('should update count when products change', async () => {
      useCompareStore.getState().addProduct({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        category: 'test',
      });

      const { rerender } = render(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByText('Compare (1)')).toBeInTheDocument();
      });
      
      // Add another product
      useCompareStore.getState().addProduct({
        id: '2',
        name: 'Product 2',
        price: '39.99',
        image: '/image2.jpg',
        category: 'test',
      });
      
      rerender(<CompareBadge />);
      
      await waitFor(() => {
        expect(screen.getByText('Compare (2)')).toBeInTheDocument();
      });
    });
  });
});

