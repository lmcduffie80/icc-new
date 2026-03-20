/**
 * Application configuration
 * Centralized configuration for feature flags and system settings
 */

/**
 * Inventory management configuration
 */
export const INVENTORY_CONFIG = {
  /**
   * Enable FIFO (First-In-First-Out) inventory allocation
   * When enabled, inventory will be allocated from oldest supplier warehouses first
   * Set USE_FIFO_ALLOCATION=true in .env to enable
   */
  USE_FIFO_ALLOCATION: process.env.USE_FIFO_ALLOCATION === 'true',

  /**
   * Allow product substitution when using FIFO
   * When true, allows using "like products" (same name, different supplier)
   * When false, only uses exact product ordered
   */
  ALLOW_PRODUCT_SUBSTITUTION: process.env.ALLOW_PRODUCT_SUBSTITUTION !== 'false', // Default true

  /**
   * Log FIFO allocation decisions for audit trail
   */
  LOG_FIFO_DECISIONS: process.env.LOG_FIFO_DECISIONS !== 'false', // Default true
};

/**
 * Order processing configuration
 */
export const ORDER_CONFIG = {
  /**
   * Maximum order amount before requiring admin review
   */
  MAX_ORDER_AMOUNT: parseInt(process.env.MAX_ORDER_AMOUNT || '100000', 10),

  /**
   * Enable partial order fulfillment
   */
  ALLOW_PARTIAL_FULFILLMENT: process.env.ALLOW_PARTIAL_FULFILLMENT !== 'false', // Default true
};

/**
 * Security configuration
 */
export const SECURITY_CONFIG = {
  /**
   * Enable security logging
   */
  ENABLE_SECURITY_LOGGING: process.env.ENABLE_SECURITY_LOGGING !== 'false', // Default true
};
