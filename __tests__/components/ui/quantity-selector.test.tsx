import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuantitySelector } from '@/components/ui/quantity-selector';

describe('QuantitySelector component', () => {
  const mockOnQuantityChange = vi.fn();

  describe('rendering', () => {
    it('should render with default props', () => {
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} />);
      
      expect(screen.getByLabelText('Quantity:')).toBeInTheDocument();
      expect(screen.getByLabelText('Product quantity')).toHaveValue(1);
    });

    it('should render without label when showLabel is false', () => {
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} showLabel={false} />);
      
      expect(screen.queryByText('Quantity:')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Product quantity')).toBeInTheDocument();
    });

    it('should render with compact size', () => {
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} size="compact" />);
      
      expect(screen.getByLabelText('Product quantity')).toBeInTheDocument();
    });

    it('should display the correct quantity value', () => {
      render(<QuantitySelector quantity={5} onQuantityChange={mockOnQuantityChange} />);
      
      expect(screen.getByLabelText('Product quantity')).toHaveValue(5);
    });
  });

  describe('increment/decrement buttons', () => {
    it('should have increase and decrease buttons', () => {
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} />);
      
      expect(screen.getByLabelText('Increase quantity')).toBeInTheDocument();
      expect(screen.getByLabelText('Decrease quantity')).toBeInTheDocument();
    });

    it('should call onQuantityChange with incremented value when plus button is clicked', async () => {
      const user = userEvent.setup();
      mockOnQuantityChange.mockClear();
      
      render(<QuantitySelector quantity={3} onQuantityChange={mockOnQuantityChange} />);
      
      const increaseButton = screen.getByLabelText('Increase quantity');
      await user.click(increaseButton);
      
      expect(mockOnQuantityChange).toHaveBeenCalledWith(4);
    });

    it('should call onQuantityChange with decremented value when minus button is clicked', async () => {
      const user = userEvent.setup();
      mockOnQuantityChange.mockClear();
      
      render(<QuantitySelector quantity={3} onQuantityChange={mockOnQuantityChange} />);
      
      const decreaseButton = screen.getByLabelText('Decrease quantity');
      await user.click(decreaseButton);
      
      expect(mockOnQuantityChange).toHaveBeenCalledWith(2);
    });

    it('should allow decrementing below 1 (for cart removal)', async () => {
      const user = userEvent.setup();
      mockOnQuantityChange.mockClear();
      
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} />);
      
      const decreaseButton = screen.getByLabelText('Decrease quantity');
      await user.click(decreaseButton);
      
      // Component allows 0 to be passed (for cart item removal)
      expect(mockOnQuantityChange).toHaveBeenCalledWith(0);
    });
  });

  describe('direct input', () => {
    it('should have number input type', () => {
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} />);
      
      const input = screen.getByLabelText('Product quantity');
      expect(input).toHaveAttribute('type', 'number');
      expect(input).toHaveAttribute('min', '1');
    });

    it('should call onQuantityChange when valid number is typed', async () => {
      const user = userEvent.setup();
      mockOnQuantityChange.mockClear();
      
      render(<QuantitySelector quantity={5} onQuantityChange={mockOnQuantityChange} />);
      
      const input = screen.getByLabelText('Product quantity') as HTMLInputElement;
      // Triple-click to select all and type new value
      await user.tripleClick(input);
      await user.keyboard('7');
      
      // Should be called with the new value
      expect(mockOnQuantityChange).toHaveBeenCalled();
      // Should be called with 7
      expect(mockOnQuantityChange).toHaveBeenCalledWith(7);
    });

    it('should not call onQuantityChange for invalid input', async () => {
      const user = userEvent.setup();
      mockOnQuantityChange.mockClear();
      
      render(<QuantitySelector quantity={5} onQuantityChange={mockOnQuantityChange} />);
      
      const input = screen.getByLabelText('Product quantity');
      await user.clear(input);
      await user.type(input, 'abc');
      
      // Should not be called for non-numeric input
      expect(mockOnQuantityChange).not.toHaveBeenCalled();
    });

    it('should reset to 1 when input is cleared and blurred', () => {
      mockOnQuantityChange.mockClear();
      
      render(<QuantitySelector quantity={5} onQuantityChange={mockOnQuantityChange} />);
      
      const input = screen.getByLabelText('Product quantity') as HTMLInputElement;
      
      // Set the input value directly and trigger blur with that value
      Object.defineProperty(input, 'value', {
        writable: true,
        value: ''
      });
      
      // Trigger blur event which should reset to 1
      fireEvent.blur(input);
      
      expect(mockOnQuantityChange).toHaveBeenCalledWith(1);
    });

    it('should reset to 1 when negative number is entered and blurred', () => {
      mockOnQuantityChange.mockClear();
      
      render(<QuantitySelector quantity={5} onQuantityChange={mockOnQuantityChange} />);
      
      const input = screen.getByLabelText('Product quantity') as HTMLInputElement;
      
      // Set the input value directly to a negative number
      Object.defineProperty(input, 'value', {
        writable: true,
        value: '-5'
      });
      
      // Trigger blur event which should reset to 1
      fireEvent.blur(input);
      
      // Should reset to 1 on blur when value is negative
      expect(mockOnQuantityChange).toHaveBeenCalledWith(1);
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} />);
      
      expect(screen.getByLabelText('Increase quantity')).toBeInTheDocument();
      expect(screen.getByLabelText('Decrease quantity')).toBeInTheDocument();
      expect(screen.getByLabelText('Product quantity')).toBeInTheDocument();
    });

    it('should have associated label when showLabel is true', () => {
      render(<QuantitySelector quantity={1} onQuantityChange={mockOnQuantityChange} showLabel={true} />);
      
      const label = screen.getByText('Quantity:');
      expect(label).toBeInTheDocument();
      expect(label).toHaveAttribute('for', 'quantity');
    });
  });
});

