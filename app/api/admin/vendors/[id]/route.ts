import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
import { query, queryOne } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
import { z } from 'zod';

const vendorUpdateSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  address_id: z.number().int().positive().nullable().optional(),
  address1: z.string().max(255).trim().optional().nullable(),
  address2: z.string().max(255).trim().optional().nullable(),
  city: z.string().max(100).trim().optional().nullable(),
  state: z.string().max(2).trim().optional().nullable(),
  zip_code: z.string().max(20).trim().optional().nullable(),
  country: z.string().max(100).trim().optional().nullable(),
  tax_exempt: z.boolean().optional(),
  default_payment_terms: z.enum(['DUE_UPON_RECEIPT', 'NET_30', 'NET_60', 'NET_90', 'NET_180']).nullable().optional(),
  notes: z.string().max(5000).trim().nullable().optional(),
  is_active: z.boolean().optional(),
}).partial();

// GET /api/admin/vendors/[id] - Get a single vendor
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { id } = await params;
  const ip = getClientIp(request);

  try {
    const vendorId = parseInt(id, 10);
    if (isNaN(vendorId)) {
      return NextResponse.json(
        { error: 'Invalid vendor ID' },
        { status: 400 }
      );
    }

    const vendor = await queryOne<{
      id: number;
      vendor_number: string;
      name: string;
      address_id: number | null;
      tax_exempt: boolean;
      default_payment_terms: string | null;
      folder_path: string;
      is_active: boolean;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, vendor_number, name, address_id, tax_exempt, default_payment_terms, 
              folder_path, is_active, notes, created_at, updated_at
       FROM vendors
       WHERE id = $1`,
      [vendorId]
    );

    if (!vendor) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Fetch address if it exists
    let address = null;
    if (vendor.address_id) {
      address = await queryOne<{
        id: number;
        address1: string;
        address2: string | null;
        city: string;
        state: string;
        zip_code: string;
        country: string;
      }>(
        'SELECT id, address1, address2, city, state, zip_code, country FROM addresses WHERE id = $1',
        [vendor.address_id]
      );
    }

    return NextResponse.json({ ...vendor, address });
  } catch (error) {
    securityLogger.logError('Failed to fetch vendor', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/vendors/[id] - Update a vendor
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { id } = await params;
  const ip = getClientIp(request);

  try {
    const vendorId = parseInt(id, 10);
    if (isNaN(vendorId)) {
      return NextResponse.json(
        { error: 'Invalid vendor ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const validationResult = vendorUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        '/api/admin/vendors/[id]',
        ip,
        validationResult.error.issues,
        'PUT'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    // Get existing vendor to check current address_id
    const existingVendor = await queryOne<{ id: number; address_id: number | null; name: string }>(
      'SELECT id, address_id, name FROM vendors WHERE id = $1',
      [vendorId]
    );

    if (!existingVendor) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    let finalAddressId = existingVendor.address_id;
    const vendorName = validationResult.data.name || existingVendor.name;

    // Handle address creation/update if address fields are provided
    const { address1, address2, city, state, zip_code, country, address_id } = validationResult.data;
    if (address1 && city && state && zip_code) {
      // If vendor has an existing address, update it; otherwise create new
      if (finalAddressId) {
        await query(
          `UPDATE addresses 
           SET company_name = $1, address1 = $2, address2 = $3, city = $4, state = $5, zip_code = $6, country = $7, updated_at = NOW()
           WHERE id = $8`,
          [
            vendorName,
            address1,
            address2 || null,
            city,
            state,
            zip_code,
            country || 'United States',
            finalAddressId,
          ]
        );
      } else {
        // Create new address
        const newAddress = await queryOne<{ id: number }>(
          `INSERT INTO addresses (type, company_name, address1, address2, city, state, zip_code, country)
           VALUES ('VENDOR', $1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            vendorName,
            address1,
            address2 || null,
            city,
            state,
            zip_code,
            country || 'United States',
          ]
        );
        if (newAddress) {
          finalAddressId = newAddress.id;
        }
      }
    } else if (address_id !== undefined) {
      // If address_id is explicitly provided, validate and use it
      if (address_id !== null) {
        const address = await queryOne<{ id: number }>(
          'SELECT id FROM addresses WHERE id = $1',
          [address_id]
        );
        if (!address) {
          return NextResponse.json(
            { error: 'Address not found' },
            { status: 400 }
          );
        }
      }
      finalAddressId = address_id;
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validationResult.data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(validationResult.data.name);
      // Also update address company_name if address exists
      if (finalAddressId) {
        await query(
          'UPDATE addresses SET company_name = $1, updated_at = NOW() WHERE id = $2',
          [validationResult.data.name, finalAddressId]
        );
      }
    }
    if (finalAddressId !== existingVendor.address_id) {
      updates.push(`address_id = $${paramIndex++}`);
      values.push(finalAddressId);
    }
    if (validationResult.data.tax_exempt !== undefined) {
      updates.push(`tax_exempt = $${paramIndex++}`);
      values.push(validationResult.data.tax_exempt);
    }
    if (validationResult.data.default_payment_terms !== undefined) {
      updates.push(`default_payment_terms = $${paramIndex++}`);
      values.push(validationResult.data.default_payment_terms);
    }
    if (validationResult.data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(validationResult.data.notes);
    }
    if (validationResult.data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(validationResult.data.is_active);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    values.push(vendorId);

    const vendor = await queryOne<{
      id: number;
      vendor_number: string;
      name: string;
      address_id: number | null;
      tax_exempt: boolean;
      default_payment_terms: string | null;
      folder_path: string;
      is_active: boolean;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `UPDATE vendors 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, vendor_number, name, address_id, tax_exempt, default_payment_terms, 
                 folder_path, is_active, notes, created_at, updated_at`,
      values
    );

    if (!vendor) {
      return NextResponse.json(
        { error: 'Failed to update vendor' },
        { status: 500 }
      );
    }

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/admin/vendors/[id]',
      method: 'PUT',
      details: {
        action: 'vendor_updated',
        vendor_id: vendor.id,
        vendor_number: vendor.vendor_number,
      },
      severity: 'low',
    });

    return NextResponse.json(vendor);
  } catch (error) {
    securityLogger.logError('Failed to update vendor', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/vendors/[id] - Delete a vendor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  const { id } = await params;
  const ip = getClientIp(request);

  try {
    const vendorId = parseInt(id, 10);
    if (isNaN(vendorId)) {
      return NextResponse.json(
        { error: 'Invalid vendor ID' },
        { status: 400 }
      );
    }

    // Check if vendor exists
    const vendor = await queryOne<{ id: number; vendor_number: string; name: string }>(
      'SELECT id, vendor_number, name FROM vendors WHERE id = $1',
      [vendorId]
    );

    if (!vendor) {
      return NextResponse.json(
        { error: 'Vendor not found' },
        { status: 404 }
      );
    }

    // Check if vendor has purchase orders (cascade will handle, but we can warn)
    const poCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM purchase_orders WHERE vendor_id = $1',
      [vendorId]
    );

    if (poCount && parseInt(poCount.count, 10) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete vendor with existing purchase orders' },
        { status: 400 }
      );
    }

    await query('DELETE FROM vendors WHERE id = $1', [vendorId]);

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: '/api/admin/vendors/[id]',
      method: 'DELETE',
      details: {
        action: 'vendor_deleted',
        vendor_id: vendorId,
        vendor_number: vendor.vendor_number,
        vendor_name: vendor.name,
      },
      severity: 'medium',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    securityLogger.logError('Failed to delete vendor', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

