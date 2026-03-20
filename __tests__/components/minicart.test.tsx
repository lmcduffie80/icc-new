import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Minicart } from '@/components/minicart';
import { useCartStore } from '@/lib/cart-store';

// Mock Next.js Link and Image components
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => <img src={src} alt={alt} {...props} />,
}));

// Mock scroll-lock
vi.mock('@/lib/scroll-lock', () => ({
  lockScroll: vi.fn(),
  unlockScroll: vi.fn(),
}));

describe('Minicart component', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    // Clear cart and mocks before each test
    useCartStore.getState().clearCart();
    mockOnClose.mockClear();
  });

  describe('visibility', () => {
    it('should not render when isOpen is false', () => {
      render(<Minicart isOpen={false} onClose={mockOnClose} />);
      
      expect(screen.queryByText(/shopping cart/i)).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText(/shopping cart/i)).toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('should display "Shopping Cart" title', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Shopping Cart')).toBeInTheDocument();
    });

    it('should display item count in title when cart has items', () => {
      useCartStore.getState().addItem({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 2,
      });

      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText(/shopping cart \(2\)/i)).toBeInTheDocument();
    });

    it('should have close button', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const closeButton = screen.getByLabelText(/close cart/i);
      expect(closeButton).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const closeButton = screen.getByLabelText(/close cart/i);
      await user.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty state', () => {
    it('should show empty cart message when no items', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
      expect(screen.getByText('Start adding products to your cart')).toBeInTheDocument();
    });

    it('should show Browse Products button in empty state', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const browseButton = screen.getAllByText('Browse Products')[0];
      expect(browseButton).toBeInTheDocument();
    });

    it('should show Search Products button in empty state', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Search Products')).toBeInTheDocument();
    });

    it('should not show footer when cart is empty', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.queryByText(/proceed to checkout/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/subtotal/i)).not.toBeInTheDocument();
    });
  });

  describe('cart with items', () => {
    beforeEach(() => {
      const store = useCartStore.getState();
      store.addItem({
        id: '1',
        name: 'Test Product 1',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 2,
      });
      store.addItem({
        id: '2',
        name: 'Test Product 2',
        price: '49.99',
        image: '/image2.jpg',
        inStock: true,
        quantity: 1,
      });
    });

    it('should display all cart items', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Test Product 1')).toBeInTheDocument();
      expect(screen.getByText('Test Product 2')).toBeInTheDocument();
    });

    it('should display item prices', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('$29.99')).toBeInTheDocument();
      expect(screen.getByText('$49.99')).toBeInTheDocument();
    });

    it('should display item quantities', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      // Quantities are now in input fields, not text
      const quantityInputs = screen.getAllByLabelText(/product quantity/i);
      expect(quantityInputs.length).toBe(2);
      expect(quantityInputs[0]).toHaveValue(2);
      expect(quantityInputs[1]).toHaveValue(1);
    });

    it('should display item images', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('quantity controls', () => {
    beforeEach(() => {
      useCartStore.getState().addItem({
        id: '1',
        name: 'Test Product',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 2,
      });
    });

    it('should have increase quantity button', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const increaseButtons = screen.getAllByLabelText(/increase quantity/i);
      expect(increaseButtons.length).toBeGreaterThan(0);
    });

    it('should have decrease quantity button', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const decreaseButtons = screen.getAllByLabelText(/decrease quantity/i);
      expect(decreaseButtons.length).toBeGreaterThan(0);
    });

    it('should have editable quantity input field', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const quantityInputs = screen.getAllByLabelText(/product quantity/i);
      expect(quantityInputs.length).toBeGreaterThan(0);
      expect(quantityInputs[0]).toHaveAttribute('type', 'number');
    });

    it('should update quantity when typing directly in input', async () => {
      const user = userEvent.setup();
      
      // Set initial quantity to 1 for easier testing
      useCartStore.getState().updateQuantity('1', 1);
      
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const quantityInput = screen.getByLabelText(/product quantity/i) as HTMLInputElement;
      
      // Triple-click to select all, then type new value
      await user.tripleClick(quantityInput);
      await user.keyboard('5');
      
      const items = useCartStore.getState().items;
      expect(items[0].quantity).toBe(5);
    });

    it('should increase quantity when plus button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const increaseButton = screen.getByLabelText(/increase quantity/i);
      await user.click(increaseButton);
      
      const items = useCartStore.getState().items;
      expect(items[0].quantity).toBe(3);
    });

    it('should decrease quantity when minus button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const decreaseButton = screen.getByLabelText(/decrease quantity/i);
      await user.click(decreaseButton);
      
      const items = useCartStore.getState().items;
      expect(items[0].quantity).toBe(1);
    });

    it('should remove item when quantity decreases to 0', async () => {
      const user = userEvent.setup();
      
      // Set quantity to 1 first
      useCartStore.getState().updateQuantity('1', 1);
      
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const decreaseButton = screen.getByLabelText(/decrease quantity/i);
      await user.click(decreaseButton);
      
      const items = useCartStore.getState().items;
      expect(items.length).toBe(0);
    });
  });

  describe('remove item', () => {
    beforeEach(() => {
      useCartStore.getState().addItem({
        id: '1',
        name: 'Test Product',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 2,
      });
    });

    it('should have remove button', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const removeButton = screen.getByLabelText(/remove item/i);
      expect(removeButton).toBeInTheDocument();
    });

    it('should remove item when remove button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const removeButton = screen.getByLabelText(/remove item/i);
      await user.click(removeButton);
      
      const items = useCartStore.getState().items;
      expect(items.length).toBe(0);
    });
  });

  describe('out of stock indicator', () => {
    it('should show out of stock message for out of stock items', () => {
      useCartStore.getState().addItem({
        id: '1',
        name: 'Out of Stock Product',
        price: '29.99',
        image: '/image1.jpg',
        inStock: false,
        quantity: 1,
      });

      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Out of Stock')).toBeInTheDocument();
    });

    it('should not show out of stock message for in-stock items', () => {
      useCartStore.getState().addItem({
        id: '1',
        name: 'In Stock Product',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 1,
      });

      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.queryByText('Out of Stock')).not.toBeInTheDocument();
    });
  });

  describe('subtotal and footer', () => {
    beforeEach(() => {
      const store = useCartStore.getState();
      store.addItem({
        id: '1',
        name: 'Product 1',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 2,
      });
      store.addItem({
        id: '2',
        name: 'Product 2',
        price: '49.99',
        image: '/image2.jpg',
        inStock: true,
        quantity: 1,
      });
    });

    it('should display subtotal', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Subtotal:')).toBeInTheDocument();
      // 29.99 * 2 + 49.99 * 1 = 109.97
      expect(screen.getByText('$109.97')).toBeInTheDocument();
    });

    it('should have Proceed to Checkout button', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Proceed to Checkout')).toBeInTheDocument();
    });

    it('should have Continue Shopping button', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Continue Shopping')).toBeInTheDocument();
    });

    it('should show shipping and tax note', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByText('Shipping and taxes calculated at checkout')).toBeInTheDocument();
    });
  });

  describe('backdrop', () => {
    it('should render backdrop when open', () => {
      const { container } = render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();
    });

    it('should call onClose when backdrop is clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/50') as HTMLElement;
      await user.click(backdrop);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      useCartStore.getState().addItem({
        id: '1',
        name: 'Test Product',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 1,
      });
    });

    it('should have link to product page', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const productLinks = screen.getAllByRole('link');
      const productPageLink = productLinks.find(link => 
        link.getAttribute('href') === '/shop/1'
      );
      expect(productPageLink).toBeInTheDocument();
    });

    it('should have link to checkout', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const checkoutLink = screen.getByText('Proceed to Checkout').closest('a');
      expect(checkoutLink).toHaveAttribute('href', '/checkout');
    });

    it('should have link to shop', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      const shopLinks = screen.getAllByRole('link');
      const shopLink = shopLinks.find(link => 
        link.getAttribute('href') === '/shop'
      );
      expect(shopLink).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByLabelText(/close cart/i)).toBeInTheDocument();
    });

    it('should have proper button labels for quantity controls', () => {
      useCartStore.getState().addItem({
        id: '1',
        name: 'Test Product',
        price: '29.99',
        image: '/image1.jpg',
        inStock: true,
        quantity: 1,
      });

      render(<Minicart isOpen={true} onClose={mockOnClose} />);
      
      expect(screen.getByLabelText(/increase quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/decrease quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/remove item/i)).toBeInTheDocument();
    });
  });
});

