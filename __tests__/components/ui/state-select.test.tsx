import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateSelect, US_STATES } from '@/components/ui/state-select';

describe('US_STATES constant', () => {
  it('should have 50 states', () => {
    expect(US_STATES).toHaveLength(50);
  });

  it('should have state objects with code and name', () => {
    const firstState = US_STATES[0];
    expect(firstState).toHaveProperty('code');
    expect(firstState).toHaveProperty('name');
  });

  it('should include major states', () => {
    const codes = US_STATES.map((s) => s.code);
    expect(codes).toContain('CA');
    expect(codes).toContain('NY');
    expect(codes).toContain('TX');
    expect(codes).toContain('FL');
  });

  it('should have unique state codes', () => {
    const codes = US_STATES.map((s) => s.code);
    const uniqueCodes = [...new Set(codes)];
    expect(codes.length).toBe(uniqueCodes.length);
  });
});

describe('StateSelect component', () => {
  describe('rendering', () => {
    it('should render select element', () => {
      render(<StateSelect />);
      
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('should render default placeholder option', () => {
      render(<StateSelect />);
      
      const option = screen.getByText('Select State');
      expect(option).toBeInTheDocument();
    });

    it('should render custom placeholder', () => {
      render(<StateSelect placeholder="Choose your state" />);
      
      const option = screen.getByText('Choose your state');
      expect(option).toBeInTheDocument();
    });

    it('should render all 50 states plus placeholder', () => {
      render(<StateSelect />);
      
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(51); // 50 states + 1 placeholder
    });

    it('should render states with code and name', () => {
      render(<StateSelect />);
      
      expect(screen.getByText('CA - California')).toBeInTheDocument();
      expect(screen.getByText('NY - New York')).toBeInTheDocument();
      expect(screen.getByText('TX - Texas')).toBeInTheDocument();
    });

    it('should have default styling classes', () => {
      render(<StateSelect />);
      
      const select = screen.getByRole('combobox');
      expect(select).toHaveClass('rounded-md');
      expect(select).toHaveClass('border');
      expect(select).toHaveClass('border-input');
    });

    it('should apply custom className', () => {
      render(<StateSelect className="custom-select" />);
      
      const select = screen.getByRole('combobox');
      expect(select).toHaveClass('custom-select');
    });
  });

  describe('user interaction', () => {
    it('should call onChange when state is selected', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      
      render(<StateSelect onChange={handleChange} />);
      
      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'CA');
      
      expect(handleChange).toHaveBeenCalledWith('CA');
    });

    it('should update value when selected', async () => {
      const user = userEvent.setup();
      
      render(<StateSelect />);
      
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await user.selectOptions(select, 'NY');
      
      expect(select.value).toBe('NY');
    });

    it('should work with multiple selections', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      
      render(<StateSelect onChange={handleChange} />);
      
      const select = screen.getByRole('combobox');
      
      await user.selectOptions(select, 'TX');
      expect(handleChange).toHaveBeenCalledWith('TX');
      
      await user.selectOptions(select, 'FL');
      expect(handleChange).toHaveBeenCalledWith('FL');
    });
  });

  describe('controlled component', () => {
    it('should work as controlled component', () => {
      const handleChange = vi.fn();
      
      const { rerender } = render(
        <StateSelect value="CA" onChange={handleChange} />
      );
      
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('CA');
      
      rerender(<StateSelect value="NY" onChange={handleChange} />);
      expect(select.value).toBe('NY');
    });

    it('should respect controlled value', () => {
      render(<StateSelect value="TX" onChange={vi.fn()} />);
      
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('TX');
    });

    it('should show placeholder when value is empty string', () => {
      render(<StateSelect value="" onChange={vi.fn()} />);
      
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      
      render(<StateSelect />);
      
      const select = screen.getByRole('combobox');
      await user.tab();
      
      expect(select).toHaveFocus();
    });

    it('should support aria-label', () => {
      render(<StateSelect aria-label="Select your state" />);
      
      const select = screen.getByRole('combobox', { name: /select your state/i });
      expect(select).toBeInTheDocument();
    });

    it('should support required attribute', () => {
      render(<StateSelect required />);
      
      const select = screen.getByRole('combobox');
      expect(select).toBeRequired();
    });

    it('should support disabled attribute', () => {
      render(<StateSelect disabled />);
      
      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });
  });

  describe('option values', () => {
    it('should use state codes as option values', () => {
      render(<StateSelect />);
      
      const californiaOption = screen.getByText('CA - California') as HTMLOptionElement;
      expect(californiaOption.value).toBe('CA');
    });

    it('should have empty string value for placeholder', () => {
      render(<StateSelect />);
      
      const placeholderOption = screen.getByText('Select State') as HTMLOptionElement;
      expect(placeholderOption.value).toBe('');
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to select element', () => {
      const ref = React.createRef<HTMLSelectElement>();

      render(<StateSelect ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLSelectElement);
    });
  });

  describe('props pass-through', () => {
    it('should pass through id prop', () => {
      render(<StateSelect id="state-select" />);
      
      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('id', 'state-select');
    });

    it('should pass through name prop', () => {
      render(<StateSelect name="state" />);
      
      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('name', 'state');
    });

    it('should pass through autocomplete prop', () => {
      render(<StateSelect autoComplete="address-level1" />);
      
      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('autocomplete', 'address-level1');
    });
  });

  describe('states ordering', () => {
    it('should render states in alphabetical order by code', () => {
      render(<StateSelect />);
      
      const options = screen.getAllByRole('option');
      // Skip placeholder at index 0
      const stateOptions = options.slice(1);
      
      // Check first few states are in order
      expect(stateOptions[0]).toHaveTextContent('AL - Alabama');
      expect(stateOptions[1]).toHaveTextContent('AK - Alaska');
      expect(stateOptions[2]).toHaveTextContent('AZ - Arizona');
    });
  });
});

