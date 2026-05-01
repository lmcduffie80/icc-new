import { query, queryOne } from './db';

export interface TaxRate {
  id: string;
  stateCode: string;
  rate: number;
  effectiveDate: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  country: string;
  taxType: string | null;
}

interface DbTaxRate {
  id: string;
  state_code: string;
  rate: string;
  effective_date: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  country: string;
  tax_type: string | null;
}

/**
 * Get the current tax rate for a specific state or province.
 * @param stateOrProvince - Two-letter code (e.g., 'CA', 'ON')
 * @param country - 'US' (default) or 'CA'
 * @returns Tax rate as decimal (e.g., 0.13 for 13%)
 */
export async function getTaxRateForState(
  stateOrProvince: string,
  country: string = 'US'
): Promise<number> {
  if (!stateOrProvince || stateOrProvince.length !== 2) {
    return 0;
  }

  const code = stateOrProvince.toUpperCase();
  const countryCode = country.toUpperCase();

  try {
    const result = await queryOne<DbTaxRate>(
      `SELECT rate 
       FROM tax_rates 
       WHERE state_code = $1
         AND country = $2
         AND is_active = true 
         AND effective_date <= NOW()
       ORDER BY effective_date DESC 
       LIMIT 1`,
      [code, countryCode]
    );

    if (!result) {
      return 0;
    }

    return parseFloat(result.rate);
  } catch (error) {
    console.error('Error fetching tax rate for state/province:', stateOrProvince, country, error);
    return 0;
  }
}

/**
 * Calculate tax amount for a given subtotal, state/province, and country.
 * Tax is only applied to the product subtotal, not shipping.
 * @param subtotal - Product subtotal amount
 * @param stateOrProvince - Two-letter code
 * @param country - 'US' (default) or 'CA'
 * @returns Tax amount rounded to 2 decimal places
 */
export async function calculateTax(
  subtotal: number,
  stateOrProvince: string,
  country: string = 'US'
): Promise<number> {
  if (subtotal <= 0) {
    return 0;
  }

  const rate = await getTaxRateForState(stateOrProvince, country);
  const taxAmount = subtotal * rate;
  return Math.round(taxAmount * 100) / 100;
}

/**
 * Get all active tax rates, optionally filtered by country.
 * Returns the currently active rate for each state/province.
 * @param country - Optional: 'US' | 'CA'. If omitted returns all.
 * @returns Array of active tax rates
 */
export async function getActiveTaxRates(country?: string): Promise<TaxRate[]> {
  try {
    const results = await query<DbTaxRate>(
      `SELECT DISTINCT ON (state_code, country) 
         id, state_code, rate, effective_date, is_active, 
         created_by, created_at, updated_at,
         COALESCE(country, 'US') AS country,
         tax_type
       FROM tax_rates 
       WHERE is_active = true 
         AND effective_date <= NOW()
         ${country ? `AND country = '${country.toUpperCase()}'` : ''}
       ORDER BY state_code, country, effective_date DESC`
    );

    return results.map((row) => ({
      id: row.id,
      stateCode: row.state_code,
      rate: parseFloat(row.rate),
      effectiveDate: row.effective_date,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      country: row.country,
      taxType: row.tax_type,
    }));
  } catch (error) {
    console.error('Error fetching active tax rates:', error);
    return [];
  }
}

/**
 * Get all tax rates (including historical) for a specific state/province.
 * @param stateOrProvince - Two-letter code
 * @param country - 'US' (default) or 'CA'
 * @returns Array of tax rates ordered by effective date (newest first)
 */
export async function getTaxRatesForState(
  stateOrProvince: string,
  country: string = 'US'
): Promise<TaxRate[]> {
  if (!stateOrProvince || stateOrProvince.length !== 2) {
    return [];
  }

  const stateCode = stateOrProvince.toUpperCase();
  const countryCode = country.toUpperCase();

  try {
    const results = await query<DbTaxRate>(
      `SELECT id, state_code, rate, effective_date, is_active,
         created_by, created_at, updated_at,
         COALESCE(country, 'US') AS country, tax_type
       FROM tax_rates 
       WHERE state_code = $1 AND COALESCE(country, 'US') = $2
       ORDER BY effective_date DESC`,
      [stateCode, countryCode]
    );

    return results.map((row) => ({
      id: row.id,
      stateCode: row.state_code,
      rate: parseFloat(row.rate),
      effectiveDate: row.effective_date,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      country: row.country ?? 'US',
      taxType: row.tax_type,
    }));
  } catch (error) {
    console.error('Error fetching tax rates for state:', stateOrProvince, error);
    return [];
  }
}

/**
 * Get all tax rates with history
 * @returns Array of all tax rates ordered by state and effective date
 */
export async function getAllTaxRates(): Promise<TaxRate[]> {
  try {
    const results = await query<DbTaxRate>(
      `SELECT id, state_code, rate, effective_date, is_active,
         created_by, created_at, updated_at,
         COALESCE(country, 'US') AS country, tax_type
       FROM tax_rates 
       ORDER BY country, state_code, effective_date DESC`
    );

    return results.map((row) => ({
      id: row.id,
      stateCode: row.state_code,
      rate: parseFloat(row.rate),
      effectiveDate: row.effective_date,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      country: row.country ?? 'US',
      taxType: row.tax_type,
    }));
  } catch (error) {
    console.error('Error fetching all tax rates:', error);
    return [];
  }
}

/**
 * Get a specific tax rate by ID
 * @param id - Tax rate ID
 * @returns Tax rate or null if not found
 */
export async function getTaxRateById(id: string): Promise<TaxRate | null> {
  try {
    const result = await queryOne<DbTaxRate>(
      `SELECT id, state_code, rate, effective_date, is_active,
         created_by, created_at, updated_at,
         COALESCE(country, 'US') AS country, tax_type
       FROM tax_rates 
       WHERE id = $1`,
      [id]
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      stateCode: result.state_code,
      rate: parseFloat(result.rate),
      effectiveDate: result.effective_date,
      isActive: result.is_active,
      createdBy: result.created_by,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      country: result.country ?? 'US',
      taxType: result.tax_type,
    };
  } catch (error) {
    console.error('Error fetching tax rate by ID:', id, error);
    return null;
  }
}

/**
 * Check if a tax rate can be modified or deleted
 * Only future-effective rates can be modified/deleted
 * @param effectiveDate - Effective date of the tax rate
 * @returns True if the rate can be modified
 */
export function canModifyTaxRate(effectiveDate: string): boolean {
  const effective = new Date(effectiveDate);
  const now = new Date();
  return effective > now;
}

/**
 * Create a new tax rate
 * @param stateCode - Two-letter state code
 * @param rate - Tax rate as decimal (e.g., 0.021 for 2.1%)
 * @param effectiveDate - When the tax rate becomes effective
 * @param createdBy - ID of the admin who created the rate
 * @returns The created tax rate
 */
export async function createTaxRate(
  stateCode: string,
  rate: number,
  effectiveDate: Date | string,
  createdBy: string
): Promise<TaxRate> {
  // Convert Date to ISO string if necessary
  const dateValue = effectiveDate instanceof Date 
    ? effectiveDate.toISOString() 
    : effectiveDate;
  
  const result = await queryOne<DbTaxRate>(
    `INSERT INTO tax_rates (state_code, rate, effective_date, is_active, created_by)
     VALUES ($1, $2, $3, true, $4)
     RETURNING id, state_code, rate, effective_date, is_active, created_by, created_at, updated_at,
               COALESCE(country, 'US') AS country, tax_type`,
    [stateCode.toUpperCase(), rate, dateValue, createdBy]
  );

  if (!result) {
    throw new Error('Failed to create tax rate');
  }

  return {
    id: result.id,
    stateCode: result.state_code,
    rate: parseFloat(result.rate),
    effectiveDate: result.effective_date,
    isActive: result.is_active,
    createdBy: result.created_by,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
    country: result.country ?? 'US',
    taxType: result.tax_type,
  };
}

/**
 * Update a tax rate
 * Only future-effective rates can be updated
 * @param id - Tax rate ID
 * @param updates - Object containing fields to update
 * @returns Updated tax rate or null if cannot be modified
 */
export async function updateTaxRate(
  id: string,
  updates: {
    rate?: number;
    effectiveDate?: Date | string;
    isActive?: boolean;
  }
): Promise<TaxRate | null> {
  // Get existing tax rate to check if it can be modified
  const existing = await getTaxRateById(id);
  if (!existing) {
    return null;
  }

  if (!canModifyTaxRate(existing.effectiveDate)) {
    return null; // Cannot modify already-effective rates
  }

  // Build update query dynamically based on provided fields
  const updateFields: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (updates.rate !== undefined) {
    updateFields.push(`rate = $${paramCount}`);
    values.push(updates.rate);
    paramCount++;
  }

  if (updates.effectiveDate !== undefined) {
    updateFields.push(`effective_date = $${paramCount}`);
    // Convert Date to ISO string if necessary
    const dateValue = updates.effectiveDate instanceof Date 
      ? updates.effectiveDate.toISOString() 
      : updates.effectiveDate;
    values.push(dateValue);
    paramCount++;
  }

  if (updates.isActive !== undefined) {
    updateFields.push(`is_active = $${paramCount}`);
    values.push(updates.isActive);
    paramCount++;
  }

  if (updateFields.length === 0) {
    return existing; // No changes
  }

  updateFields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await queryOne<DbTaxRate>(
    `UPDATE tax_rates 
     SET ${updateFields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING id, state_code, rate, effective_date, is_active, created_by, created_at, updated_at,
               COALESCE(country, 'US') AS country, tax_type`,
    values
  );

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    stateCode: result.state_code,
    rate: parseFloat(result.rate),
    effectiveDate: result.effective_date,
    isActive: result.is_active,
    createdBy: result.created_by,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
    country: result.country ?? 'US',
    taxType: result.tax_type,
  };
}

/**
 * Delete a tax rate
 * Only future-effective rates can be deleted
 * @param id - Tax rate ID
 * @returns True if deleted, false if cannot be modified or not found
 */
export async function deleteTaxRate(id: string): Promise<boolean> {
  const existing = await getTaxRateById(id);
  if (!existing) {
    return false;
  }

  try {
    await query('DELETE FROM tax_rates WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.error('Error deleting tax rate:', id, error);
    return false;
  }
}

