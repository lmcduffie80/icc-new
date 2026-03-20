interface QuantitySelectorProps {
  quantity: number;
  onQuantityChange: (qty: number) => void;
  size?: 'default' | 'compact';
  showLabel?: boolean;
}

export function QuantitySelector({ 
  quantity, 
  onQuantityChange,
  size = 'default',
  showLabel = true,
}: QuantitySelectorProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string while typing
    if (value === '') return;
    
    const newQty = parseInt(value);
    if (!isNaN(newQty) && newQty > 0) {
      onQuantityChange(newQty);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // If empty or invalid on blur, reset to 1
    const value = e.target.value;
    if (value === '' || parseInt(value) < 1) {
      onQuantityChange(1);
    }
  };

  const increment = () => {
    onQuantityChange(quantity + 1);
  };

  const decrement = () => {
    // Allow decrementing to 0 (which will remove the item in cart context)
    onQuantityChange(quantity - 1);
  };

  const isCompact = size === 'compact';
  
  const buttonClasses = isCompact
    ? "px-2 py-1 hover:bg-muted transition-colors"
    : "px-3 py-2 hover:bg-muted transition-colors";
  
  const iconClasses = isCompact ? "h-3 w-3" : "h-4 w-4";
  
  const inputClasses = isCompact
    ? "px-3 py-1 text-sm w-12 text-center border-0 focus:outline-none"
    : "w-16 text-center border-0 py-2 focus:outline-none focus:ring-0";
  
  const wrapperClasses = isCompact
    ? "flex items-center gap-2 flex-shrink-0"
    : "flex items-center gap-2";

  return (
    <div className={wrapperClasses}>
      {showLabel && (
        <label htmlFor="quantity" className="text-sm font-medium">
          Quantity:
        </label>
      )}
      <div className="flex items-center border border-input rounded-md flex-shrink-0">
        <button
          onClick={decrement}
          className={buttonClasses}
          type="button"
          aria-label="Decrease quantity"
        >
          <svg className={iconClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <input
          id="quantity"
          type="number"
          min="1"
          value={quantity}
          onChange={handleInputChange}
          onBlur={handleBlur}
          className={inputClasses}
          aria-label="Product quantity"
        />
        <button
          onClick={increment}
          className={buttonClasses}
          type="button"
          aria-label="Increase quantity"
        >
          <svg className={iconClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

