import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import React from 'react';

// Extend expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Import form components
import { PhoneInput } from '@/components/ui/phone-input';
import { StateSelect } from '@/components/ui/state-select';
import { Button } from '@/components/ui/button';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Form Components Accessibility (WCAG 2.1 AA)', () => {
  describe('PhoneInput Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <div>
          <label htmlFor="phone">Phone Number</label>
          <PhoneInput id="phone" aria-label="Phone number" />
        </div>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have correct input type for phone', () => {
      render(<PhoneInput data-testid="phone-input" />);
      const input = screen.getByTestId('phone-input');
      expect(input).toHaveAttribute('type', 'tel');
    });

    it('should have placeholder text for guidance', () => {
      render(<PhoneInput data-testid="phone-input" />);
      const input = screen.getByTestId('phone-input');
      expect(input).toHaveAttribute('placeholder', '(555) 555-5555');
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <div>
          <label htmlFor="phone">Phone</label>
          <PhoneInput id="phone" onChange={onChange} />
        </div>
      );

      const input = screen.getByLabelText('Phone');
      await user.tab();
      expect(input).toHaveFocus();
    });

    it('should accept aria-describedby for error messages', () => {
      render(
        <div>
          <label htmlFor="phone">Phone</label>
          <PhoneInput id="phone" aria-describedby="phone-error" aria-invalid="true" />
          <span id="phone-error">Please enter a valid phone number</span>
        </div>
      );

      const input = screen.getByLabelText('Phone');
      expect(input).toHaveAttribute('aria-describedby', 'phone-error');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('StateSelect Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <div>
          <label htmlFor="state">State</label>
          <StateSelect id="state" />
        </div>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have a default placeholder option', () => {
      render(<StateSelect data-testid="state-select" />);
      const select = screen.getByTestId('state-select');
      const options = select.querySelectorAll('option');

      // First option should be placeholder
      expect(options[0]).toHaveTextContent('Select State');
      expect(options[0]).toHaveValue('');
    });

    it('should have accessible state options', () => {
      render(<StateSelect data-testid="state-select" />);
      const select = screen.getByTestId('state-select');
      const options = select.querySelectorAll('option');

      // Should have all 50 states plus placeholder
      expect(options.length).toBe(51);

      // Each state option should have a value and readable text
      const californiaOption = Array.from(options).find((opt) =>
        opt.textContent?.includes('California')
      );
      expect(californiaOption).toBeTruthy();
      expect(californiaOption).toHaveValue('CA');
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <label htmlFor="state">State</label>
          <StateSelect id="state" />
        </div>
      );

      const select = screen.getByLabelText('State');
      await user.tab();
      expect(select).toHaveFocus();
    });

    it('should work with custom placeholder', () => {
      render(<StateSelect data-testid="state-select" placeholder="Choose your state" />);
      const select = screen.getByTestId('state-select');
      const firstOption = select.querySelector('option');
      expect(firstOption).toHaveTextContent('Choose your state');
    });
  });

  describe('Button Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(<Button>Submit</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should be focusable', async () => {
      const user = userEvent.setup();
      render(<Button>Click me</Button>);

      await user.tab();
      expect(screen.getByRole('button')).toHaveFocus();
    });

    it('should handle disabled state accessibly', () => {
      render(<Button disabled>Disabled Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should work with aria-label for icon buttons', async () => {
      const { container } = render(
        <Button aria-label="Close dialog" size="icon">
          <span>×</span>
        </Button>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Close dialog');
    });

    it('should indicate loading state accessibly', async () => {
      const { container } = render(
        <Button disabled aria-busy="true">
          <span aria-hidden="true">Loading...</span>
          <span className="sr-only">Loading, please wait</span>
        </Button>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Form Patterns', () => {
    it('should have accessible form with proper label associations', async () => {
      const { container } = render(
        <form aria-label="Contact form">
          <div>
            <label htmlFor="name">Full Name</label>
            <input id="name" type="text" required />
          </div>
          <div>
            <label htmlFor="email">Email Address</label>
            <input id="email" type="email" required />
          </div>
          <div>
            <label htmlFor="phone">Phone Number</label>
            <PhoneInput id="phone" />
          </div>
          <div>
            <label htmlFor="state">State</label>
            <StateSelect id="state" />
          </div>
          <Button type="submit">Submit</Button>
        </form>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have accessible error states', async () => {
      const { container } = render(
        <form aria-label="Registration form">
          <div>
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              aria-invalid="true"
              aria-describedby="email-error"
              required
            />
            <span id="email-error" role="alert">
              Please enter a valid email address
            </span>
          </div>
          <Button type="submit">Register</Button>
        </form>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      // Error message should be associated with input
      const input = screen.getByLabelText('Email Address');
      expect(input).toHaveAttribute('aria-describedby', 'email-error');
    });

    it('should have accessible required field indicators', async () => {
      const { container } = render(
        <form aria-label="Required fields form">
          <div>
            <label htmlFor="required-field">
              Required Field <span aria-hidden="true">*</span>
            </label>
            <input id="required-field" type="text" required aria-required="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            <span aria-hidden="true">*</span> indicates required field
          </p>
        </form>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have accessible fieldset grouping', async () => {
      const { container } = render(
        <form aria-label="Address form">
          <fieldset>
            <legend>Shipping Address</legend>
            <div>
              <label htmlFor="street">Street Address</label>
              <input id="street" type="text" />
            </div>
            <div>
              <label htmlFor="city">City</label>
              <input id="city" type="text" />
            </div>
            <div>
              <label htmlFor="state">State</label>
              <StateSelect id="state" />
            </div>
          </fieldset>
          <Button type="submit">Save Address</Button>
        </form>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
