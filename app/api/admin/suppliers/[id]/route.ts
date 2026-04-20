import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { supplierUserUpdateSchema } from '@/lib/validation';
import { supplierEmailExists } from '@/lib/supplier-auth';
import { getClientIp } from '@/lib/rate-limit';
import { securityLogger } from '@/lib/security-logger';
// import { hash } from '@/lib/password'; // May be needed for password updates in future

// GET /api/admin/suppliers/[id] - Get a single supplier user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.view');
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  const { id } = await params;

  try {
    const supplier = await queryOne<{
      id: string;
      email: string;
      name: string;
      company_name: string;
      phone: string | null;
      supplier_number: string | null;
      is_active: boolean;
      tax_exempt: boolean;
      address_street: string | null;
      address_city: string | null;
      address_state: string | null;
      address_zip: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, email, name, company_name, phone, supplier_number, is_active, tax_exempt, address_street, address_city, address_state, address_zip, created_at, updated_at
       FROM supplier_users
       WHERE id = $1`,
      [id]
    );

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier user not found' }, { status: 404 });
    }

    return NextResponse.json(supplier);
  } catch (error) {
    securityLogger.logError('Failed to fetch supplier user', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/suppliers/[id] - Update a supplier user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.create');
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  const { id } = await params;

  try {
    const body = await request.json();
    
    // Validate input
    const validationResult = supplierUserUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      securityLogger.logValidationFailure(
        `/api/admin/suppliers/${id}`,
        ip,
        validationResult.error.issues,
        'PUT'
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    // Check if supplier exists
    const existingSupplier = await queryOne<{
      id: string;
      email: string;
      name: string;
      company_name: string;
      phone: string | null;
      is_active: boolean;
      tax_exempt: boolean;
      address_street: string | null;
      address_city: string | null;
      address_state: string | null;
      address_zip: string | null;
    }>(
      'SELECT id, email, name, company_name, phone, is_active, tax_exempt, address_street, address_city, address_state, address_zip FROM supplier_users WHERE id = $1',
      [id]
    );

    if (!existingSupplier) {
      return NextResponse.json({ error: 'Supplier user not found' }, { status: 404 });
    }

    // Check if email is being changed and if it already exists
    if (updateData.email && updateData.email !== existingSupplier.email) {
      if (await supplierEmailExists(updateData.email)) {
        return NextResponse.json(
          { error: 'A supplier with this email already exists' },
          { status: 400 }
        );
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramIndex = 1;

    if (updateData.email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      updateValues.push(updateData.email);
    }
    if (updateData.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(updateData.name);
    }
    if (updateData.company_name !== undefined) {
      updateFields.push(`company_name = $${paramIndex++}`);
      updateValues.push(updateData.company_name);
    }
    if (updateData.phone !== undefined) {
      updateFields.push(`phone = $${paramIndex++}`);
      updateValues.push(updateData.phone);
    }
    if (updateData.is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(updateData.is_active);
    }
    if (updateData.tax_exempt !== undefined) {
      updateFields.push(`tax_exempt = $${paramIndex++}`);
      updateValues.push(updateData.tax_exempt);
    }
    if (updateData.address_street !== undefined) {
      updateFields.push(`address_street = $${paramIndex++}`);
      updateValues.push(updateData.address_street);
    }
    if (updateData.address_city !== undefined) {
      updateFields.push(`address_city = $${paramIndex++}`);
      updateValues.push(updateData.address_city);
    }
    if (updateData.address_state !== undefined) {
      updateFields.push(`address_state = $${paramIndex++}`);
      updateValues.push(updateData.address_state);
    }
    if (updateData.address_zip !== undefined) {
      updateFields.push(`address_zip = $${paramIndex++}`);
      updateValues.push(updateData.address_zip);
    }

    // Always update updated_at
    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    // Update supplier if there are fields to update
    if (updateFields.length > 1) {
      await query(
        `UPDATE supplier_users SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );
    }

    // Fetch updated supplier
    const updatedSupplier = await queryOne<{
      id: string;
      email: string;
      name: string;
      company_name: string;
      phone: string | null;
      supplier_number: string | null;
      is_active: boolean;
      tax_exempt: boolean;
      address_street: string | null;
      address_city: string | null;
      address_state: string | null;
      address_zip: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, email, name, company_name, phone, supplier_number, is_active, tax_exempt, address_street, address_city, address_state, address_zip, created_at, updated_at
       FROM supplier_users
       WHERE id = $1`,
      [id]
    );

    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'update',
      resourceType: 'admin_user', // Using admin_user as closest match
      resourceId: id,
      before: {
        email: existingSupplier.email,
        name: existingSupplier.name,
        company_name: existingSupplier.company_name,
        phone: existingSupplier.phone,
        is_active: existingSupplier.is_active,
        tax_exempt: existingSupplier.tax_exempt,
        address_street: existingSupplier.address_street,
        address_city: existingSupplier.address_city,
        address_state: existingSupplier.address_state,
        address_zip: existingSupplier.address_zip,
        type: 'supplier_user',
      } as unknown as Record<string, unknown>,
      after: {
        email: updatedSupplier!.email,
        name: updatedSupplier!.name,
        company_name: updatedSupplier!.company_name,
        phone: updatedSupplier!.phone,
        is_active: updatedSupplier!.is_active,
        tax_exempt: updatedSupplier!.tax_exempt,
        address_street: updatedSupplier!.address_street,
        address_city: updatedSupplier!.address_city,
        address_state: updatedSupplier!.address_state,
        address_zip: updatedSupplier!.address_zip,
        type: 'supplier_user',
      } as unknown as Record<string, unknown>,
    });

    securityLogger.logEvent({
      type: 'admin_action',
      ip,
      path: `/api/admin/suppliers/${id}`,
      method: 'PUT',
      details: {
        action: 'supplier_user_updated',
        supplier_id: id,
        updated_fields: Object.keys(updateData),
      },
      severity: 'low',
    });

    return NextResponse.json(updatedSupplier);
  } catch (error) {
    securityLogger.logError('Failed to update supplier user', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/suppliers/[id] - Delete a supplier user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('admins.create');
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  const { id } = await params;

  try {
    // Check if supplier exists
    const existingSupplier = await queryOne<{
      id: string;
      email: string;
      name: string;
      company_name: string;
    }>(
      'SELECT id, email, name, company_name FROM supplier_users WHERE id = $1',
      [id]
    );

    if (!existingSupplier) {
      return NextResponse.json(
        { error: 'Supplier user not found' },
        { status: 404 }
      );
    }

    // Wrapped in a transaction so any future related cleanup statements
    // added here will inherit atomicity. The DELETE itself cascades to
    // supplier_sessions and supplier_warehouses; products.supplier_id is
    // set to NULL (ON DELETE SET NULL).
    await withTransaction(async (client) => {
      await client.query('DELETE FROM supplier_users WHERE id = $1', [id]);
    });

    // Log the action
    await logAction({
      adminUserId: auth.session.adminUser.id,
      action: 'delete',
      resourceType: 'supplier_user',
      resourceId: id,
      before: {
        email: existingSupplier.email,
        name: existingSupplier.name,
        company_name: existingSupplier.company_name,
      },
    });

    // Security logging
    securityLogger.logEvent({
      type: 'admin_action',
      userId: auth.session.adminUser.id,
      username: auth.session.adminUser.email,
      ip,
      path: `/api/admin/suppliers/${id}`,
      method: 'DELETE',
      details: {
        action: 'supplier_deleted',
        supplier_id: id,
        supplier_email: existingSupplier.email,
        supplier_name: existingSupplier.name,
        company_name: existingSupplier.company_name,
      },
      severity: 'critical',
    });

    return NextResponse.json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    securityLogger.logError('Failed to delete supplier user', error, ip);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
