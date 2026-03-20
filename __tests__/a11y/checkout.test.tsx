import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import React from 'react';

// Extend expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Import form components used in checkout
import { PhoneInput } from '@/components/ui/phone-input';
import { StateSelect } from '@/components/ui/state-select';
import { Button } from '@/components/ui/button';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * These tests verify accessibility patterns used in the checkout flow.
 * Testing the full checkout page requires extensive mocking,
 * so we test the patterns and components separately.
 */
describe('Checkout Flow Accessibility (WCAG 2.1 AA)', () => {
  describe('Accordion Step Pattern', () => {
    // Simulates the checkout accordion pattern
    const AccordionStep = ({
      title,
      stepNumber,
      isExpanded,
      isCompleted,
      onClick,
      children,
    }: {
      title: string;
      stepNumber: number;
      isExpanded: boolean;
      isCompleted: boolean;
      onClick: () => void;
      children: React.ReactNode;
    }) => (
      <div>
        <h2 id={`step-${stepNumber}-header`}>
          <button
            type="button"
            onClick={onClick}
            aria-expanded={isExpanded}
            aria-controls={`step-${stepNumber}-content`}
            className="w-full flex items-center justify-between p-4"
          >
            <span className="flex items-center gap-2">
              <span
                aria-label={isCompleted ? `Step ${stepNumber} completed` : `Step ${stepNumber}`}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isCompleted ? 'bg-green-500 text-white' : 'bg-gray-200'
                }`}
              >
                {isCompleted ? '✓' : stepNumber}
              </span>
              <span>{title}</span>
            </span>
          </button>
        </h2>
        <div
          id={`step-${stepNumber}-content`}
          aria-labelledby={`step-${stepNumber}-header`}
          hidden={!isExpanded}
        >
          {children}
        </div>
      </div>
    );

    it('should have accessible accordion headers', async () => {
      const { container } = render(
        <AccordionStep
          title="Order Summary"
          stepNumber={1}
          isExpanded={true}
          isCompleted={false}
          onClick={() => {}}
        >
          <p>Order details here</p>
        </AccordionStep>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button).toHaveAttribute('aria-controls');
    });

    it('should indicate completed steps', () => {
      render(
        <AccordionStep
          title="Order Summary"
          stepNumber={1}
          isExpanded={false}
          isCompleted={true}
          onClick={() => {}}
        >
          <p>Order details here</p>
        </AccordionStep>
      );

      // Check for completion indicator
      expect(screen.getByLabelText('Step 1 completed')).toBeTruthy();
    });

    it('should hide collapsed content accessibly', () => {
      render(
        <AccordionStep
          title="Payment"
          stepNumber={3}
          isExpanded={false}
          isCompleted={false}
          onClick={() => {}}
        >
          <p>Payment form here</p>
        </AccordionStep>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      // Content should be hidden using hidden attribute
      const contentDiv = document.getElementById('step-3-content');
      expect(contentDiv).toHaveAttribute('hidden');
    });
  });

  describe('Shipping Address Form', () => {
    const ShippingAddressForm = () => (
      <form aria-label="Shipping address form">
        <fieldset>
          <legend className="text-lg font-semibold mb-4">Shipping Address</legend>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName">
                First Name <span aria-hidden="true">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                required
                aria-required="true"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="lastName">
                Last Name <span aria-hidden="true">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                required
                aria-required="true"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="col-span-2">
              <label htmlFor="email">
                Email <span aria-hidden="true">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                aria-required="true"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="col-span-2">
              <label htmlFor="phone">
                Phone <span aria-hidden="true">*</span>
              </label>
              <PhoneInput id="phone" aria-required="true" />
            </div>

            <div className="col-span-2">
              <label htmlFor="address1">
                Address Line 1 <span aria-hidden="true">*</span>
              </label>
              <input
                id="address1"
                type="text"
                required
                aria-required="true"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="col-span-2">
              <label htmlFor="address2">Address Line 2 (Optional)</label>
              <input id="address2" type="text" className="w-full border rounded px-3 py-2" />
            </div>

            <div>
              <label htmlFor="city">
                City <span aria-hidden="true">*</span>
              </label>
              <input
                id="city"
                type="text"
                required
                aria-required="true"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="state">
                State <span aria-hidden="true">*</span>
              </label>
              <StateSelect id="state" aria-required="true" />
            </div>

            <div className="col-span-2">
              <label htmlFor="zipCode">
                ZIP Code <span aria-hidden="true">*</span>
              </label>
              <input
                id="zipCode"
                type="text"
                required
                aria-required="true"
                pattern="[0-9]{5}(-[0-9]{4})?"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
        </fieldset>
      </form>
    );

    it('should have no accessibility violations', async () => {
      const { container } = render(<ShippingAddressForm />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper label associations', () => {
      render(<ShippingAddressForm />);

      // All inputs should have associated labels
      expect(screen.getByLabelText(/First Name/)).toBeTruthy();
      expect(screen.getByLabelText(/Last Name/)).toBeTruthy();
      expect(screen.getByLabelText(/Email/)).toBeTruthy();
      expect(screen.getByLabelText(/Phone/)).toBeTruthy();
      expect(screen.getByLabelText(/Address Line 1/)).toBeTruthy();
      expect(screen.getByLabelText(/City/)).toBeTruthy();
      expect(screen.getByLabelText(/State/)).toBeTruthy();
      expect(screen.getByLabelText(/ZIP Code/)).toBeTruthy();
    });

    it('should indicate required fields', () => {
      render(<ShippingAddressForm />);

      const firstName = screen.getByLabelText(/First Name/);
      expect(firstName).toHaveAttribute('aria-required', 'true');
      expect(firstName).toBeRequired();
    });
  });

  describe('Delivery Options', () => {
    const DeliveryOptions = ({
      selectedOption,
      onSelect,
    }: {
      selectedOption: string;
      onSelect: (value: string) => void;
    }) => (
      <fieldset>
        <legend className="text-lg font-semibold mb-4">Delivery Options</legend>
        <div role="radiogroup" aria-label="Select delivery method">
          {[
            { id: 'standard', name: 'Standard Shipping', price: '$9.99', time: '5-7 business days' },
            { id: 'express', name: 'Express Shipping', price: '$19.99', time: '2-3 business days' },
          ].map((option) => (
            <label
              key={option.id}
              className="flex items-center justify-between p-4 border rounded cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="delivery"
                  value={option.id}
                  checked={selectedOption === option.id}
                  onChange={(e) => onSelect(e.target.value)}
                  aria-describedby={`${option.id}-details`}
                />
                <div>
                  <span className="font-medium">{option.name}</span>
                  <span id={`${option.id}-details`} className="block text-sm text-gray-600">
                    {option.time}
                  </span>
                </div>
              </div>
              <span className="font-semibold">{option.price}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );

    it('should have no accessibility violations', async () => {
      const { container } = render(<DeliveryOptions selectedOption="standard" onSelect={() => {}} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should use proper radiogroup pattern', () => {
      render(<DeliveryOptions selectedOption="standard" onSelect={() => {}} />);

      const radiogroup = screen.getByRole('radiogroup');
      expect(radiogroup).toHaveAttribute('aria-label', 'Select delivery method');

      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(2);
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(<DeliveryOptions selectedOption="standard" onSelect={onSelect} />);

      const radios = screen.getAllByRole('radio');
      await user.click(radios[0]);
      expect(radios[0]).toHaveFocus();

      // Arrow down should work in radio groups
      await user.keyboard('{ArrowDown}');
    });
  });

  describe('Order Summary', () => {
    const OrderSummary = () => (
      <section aria-labelledby="order-summary-heading">
        <h2 id="order-summary-heading" className="text-xl font-semibold mb-4">
          Order Total
        </h2>

        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>$99.99</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd>$9.99</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax</dt>
            <dd>$8.25</dd>
          </div>
          <div className="flex justify-between font-bold border-t pt-2">
            <dt>Total</dt>
            <dd>$118.23</dd>
          </div>
        </dl>
      </section>
    );

    it('should have no accessibility violations', async () => {
      const { container } = render(<OrderSummary />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should use semantic HTML for pricing', () => {
      render(<OrderSummary />);

      // Should use definition list for key-value pairs
      const dlElement = document.querySelector('dl');
      expect(dlElement).toBeTruthy();

      // Should have dt and dd elements
      const dtElements = document.querySelectorAll('dt');
      const ddElements = document.querySelectorAll('dd');
      expect(dtElements.length).toBeGreaterThan(0);
      expect(ddElements.length).toBeGreaterThan(0);
    });

    it('should have labeled section', () => {
      render(<OrderSummary />);

      const section = screen.getByRole('region');
      expect(section).toHaveAttribute('aria-labelledby', 'order-summary-heading');
    });
  });

  describe('Payment Section', () => {
    const TermsCheckbox = ({
      checked,
      onChange,
    }: {
      checked: boolean;
      onChange: (checked: boolean) => void;
    }) => (
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-describedby="terms-description"
            required
          />
          <span id="terms-description">
            I agree to the{' '}
            <a href="/terms" className="underline">
              Terms & Conditions
            </a>{' '}
            and{' '}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>
          </span>
        </label>
      </div>
    );

    it('should have accessible terms checkbox', async () => {
      const { container } = render(<TermsCheckbox checked={false} onChange={() => {}} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should associate terms text with checkbox', () => {
      render(<TermsCheckbox checked={false} onChange={() => {}} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-describedby', 'terms-description');
    });

    it('should have accessible links within terms', () => {
      render(<TermsCheckbox checked={false} onChange={() => {}} />);

      const termsLink = screen.getByRole('link', { name: /Terms & Conditions/ });
      const privacyLink = screen.getByRole('link', { name: /Privacy Policy/ });

      expect(termsLink).toHaveAttribute('href', '/terms');
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });
  });

  describe('Submit Button States', () => {
    it('should indicate disabled state accessibly', async () => {
      const { container } = render(
        <Button disabled aria-disabled="true">
          Place Order
        </Button>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should indicate loading state accessibly', async () => {
      const { container } = render(
        <Button disabled aria-busy="true" aria-live="polite">
          <span className="animate-spin mr-2" aria-hidden="true">
            ⟳
          </span>
          Processing...
        </Button>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Error Handling', () => {
    const ErrorAlert = ({ message }: { message: string }) => (
      <div role="alert" aria-live="assertive" className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-600">{message}</p>
      </div>
    );

    it('should announce errors to screen readers', async () => {
      const { container } = render(<ErrorAlert message="Payment failed. Please try again." />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });
  });
});
