import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneInput, formatPhoneNumber, getPhoneDigits } from '@/components/ui/phone-input';

describe('formatPhoneNumber utility', () => {
  it('should format empty string correctly', () => {
    expect(formatPhoneNumber('')).toBe('');
  });

  it('should format 1-3 digits with opening parenthesis', () => {
    expect(formatPhoneNumber('5')).toBe('(5');
    expect(formatPhoneNumber('55')).toBe('(55');
    expect(formatPhoneNumber('555')).toBe('(555');
  });

  it('should format 4-6 digits with area code and space', () => {
    expect(formatPhoneNumber('5551')).toBe('(555) 1');
    expect(formatPhoneNumber('55512')).toBe('(555) 12');
    expect(formatPhoneNumber('555123')).toBe('(555) 123');
  });

  it('should format 7-10 digits with full phone format', () => {
    expect(formatPhoneNumber('5551234')).toBe('(555) 123-4');
    expect(formatPhoneNumber('55512345')).toBe('(555) 123-45');
    expect(formatPhoneNumber('555123456')).toBe('(555) 123-456');
    expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567');
  });

  it('should limit to 10 digits', () => {
    expect(formatPhoneNumber('55512345678901')).toBe('(555) 123-4567');
  });

  it('should strip non-numeric characters', () => {
    expect(formatPhoneNumber('555-123-4567')).toBe('(555) 123-4567');
    expect(formatPhoneNumber('(555) 123-4567')).toBe('(555) 123-4567');
    expect(formatPhoneNumber('abc555def123ghi4567')).toBe('(555) 123-4567');
  });

  it('should handle already formatted numbers', () => {
    expect(formatPhoneNumber('(555) 123-4567')).toBe('(555) 123-4567');
  });
});

describe('getPhoneDigits utility', () => {
  it('should extract digits from formatted phone number', () => {
    expect(getPhoneDigits('(555) 123-4567')).toBe('5551234567');
  });

  it('should remove all non-numeric characters', () => {
    expect(getPhoneDigits('abc-555-def-123-ghi-4567')).toBe('5551234567');
  });

  it('should limit to 10 digits', () => {
    expect(getPhoneDigits('555123456789012')).toBe('5551234567');
  });

  it('should return empty string for no digits', () => {
    expect(getPhoneDigits('abc-def-ghi')).toBe('');
  });
});

describe('PhoneInput component', () => {
  describe('rendering', () => {
    it('should render input element', () => {
      render(<PhoneInput />);
      
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
    });

    it('should have tel type', () => {
      render(<PhoneInput />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'tel');
    });

    it('should have placeholder', () => {
      render(<PhoneInput />);
      
      const input = screen.getByPlaceholderText('(555) 555-5555');
      expect(input).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<PhoneInput className="custom-phone" />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-phone');
    });

    it('should have default styling classes', () => {
      render(<PhoneInput />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('rounded-md');
      expect(input).toHaveClass('border');
      expect(input).toHaveClass('border-input');
    });
  });

  describe('user input and formatting', () => {
    it('should format input as user types', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      
      render(<PhoneInput onChange={handleChange} />);
      
      const input = screen.getByRole('textbox');
      
      await user.type(input, '5551234567');
      
      // Check that onChange was called with formatted value
      expect(handleChange).toHaveBeenLastCalledWith('(555) 123-4567');
    });

    it('should format value prop when provided', () => {
      render(<PhoneInput value="5551234567" onChange={vi.fn()} />);
      
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('(555) 123-4567');
    });

    it('should format unformatted value prop', () => {
      render(<PhoneInput value="555-123-4567" onChange={vi.fn()} />);
      
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('(555) 123-4567');
    });

    it('should strip non-numeric characters from input', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      
      render(<PhoneInput onChange={handleChange} />);
      
      const input = screen.getByRole('textbox');
      await user.type(input, 'abc555def123ghi4567');
      
      expect(handleChange).toHaveBeenLastCalledWith('(555) 123-4567');
    });

    it('should limit input to 10 digits', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      
      render(<PhoneInput onChange={handleChange} />);
      
      const input = screen.getByRole('textbox');
      await user.type(input, '12345678901234567890');
      
      expect(handleChange).toHaveBeenLastCalledWith('(123) 456-7890');
    });

    it('should handle clearing input', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      
      render(<PhoneInput onChange={handleChange} />);
      
      const input = screen.getByRole('textbox');
      await user.type(input, '555');
      await user.clear(input);
      
      expect(handleChange).toHaveBeenLastCalledWith('');
    });
  });

  describe('controlled component', () => {
    it('should work as controlled component', async () => {
      const user = userEvent.setup();
      let value = '';
      const handleChange = vi.fn((newValue) => {
        value = newValue;
      });
      
      const { rerender } = render(<PhoneInput value={value} onChange={handleChange} />);
      
      const input = screen.getByRole('textbox');
      await user.type(input, '5');
      
      expect(handleChange).toHaveBeenCalledWith('(5');
      
      // Simulate parent component updating value
      rerender(<PhoneInput value="(5" onChange={handleChange} />);
      
      const updatedInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(updatedInput.value).toBe('(5');
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      
      render(<PhoneInput />);
      
      const input = screen.getByRole('textbox');
      await user.tab();
      
      expect(input).toHaveFocus();
    });

    it('should support aria-label', () => {
      render(<PhoneInput aria-label="Phone number" />);
      
      const input = screen.getByRole('textbox', { name: /phone number/i });
      expect(input).toBeInTheDocument();
    });

    it('should support required attribute', () => {
      render(<PhoneInput required />);
      
      const input = screen.getByRole('textbox');
      expect(input).toBeRequired();
    });

    it('should support disabled attribute', () => {
      render(<PhoneInput disabled />);
      
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to input element', () => {
      const ref = React.createRef<HTMLInputElement>();

      render(<PhoneInput ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });
  });

  describe('props pass-through', () => {
    it('should pass through id prop', () => {
      render(<PhoneInput id="phone-input" />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('id', 'phone-input');
    });

    it('should pass through name prop', () => {
      render(<PhoneInput name="phone" />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('name', 'phone');
    });

    it('should pass through autocomplete prop', () => {
      render(<PhoneInput autoComplete="tel" />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('autocomplete', 'tel');
    });
  });
});

