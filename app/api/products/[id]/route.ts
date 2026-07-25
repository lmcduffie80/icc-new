import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getDocumentProxyUrl } from '@/lib/s3';
import { getRequiredTenantId, MissingTenantError } from '@/lib/tenant';

export interface ProductDetail {
  id: string;
  name: string;
  category: string;
  description: string | null;
  full_description: string | null;
  price: string;
  original_price: string | null;
  unit_of_measure: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  sku: string | null;
  rating: string | null;
  review_count: number;
  attributes: Record<string, string>;
  approved_states: string[];
  features: string[];
  specifications: Record<string, string>;
  documents: Array<{ name: string; url: string }>;
  sds_url: string | null;
  label_url: string | null;
  admin_label_url: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/products/:id - Get single product with full details, scoped to the caller's tenant (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let tenantId: string;
  try {
    tenantId = getRequiredTenantId(request);
  } catch (err) {
    if (err instanceof MissingTenantError) {
      return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 });
    }
    throw err;
  }

  try {
    const product = await queryOne<ProductDetail>(
      `SELECT * FROM products 
       WHERE id = $1
         AND tenant_id = $2
         AND deleted_at IS NULL
         AND (supplier_id IS NULL OR approval_status = 'published')`,
      [id, tenantId]
    );

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Build documents array from documents JSONB and separate URL columns
    // Ensure documents is always an array (handle case where it might be an object or null)
    let documents: Array<{ name: string; url: string }> = [];
    if (product.documents && Array.isArray(product.documents)) {
      // Convert S3 URLs to proxy URLs for all existing documents
      documents = product.documents.map(doc => ({
        ...doc,
        url: getDocumentProxyUrl(doc.url) || doc.url,
      }));
    }
    
    // Add SDS URL if it exists and not already in documents (convert to proxy URL)
    if (product.sds_url && !documents.some(doc => doc.url === product.sds_url || doc.url === getDocumentProxyUrl(product.sds_url))) {
      documents.push({
        name: 'Safety Data Sheet (SDS)',
        url: getDocumentProxyUrl(product.sds_url) || product.sds_url,
      });
    }
    
    // Add Label URL (prefer admin_label_url if available, otherwise label_url) - convert to proxy URL
    const labelUrl = product.admin_label_url || product.label_url;
    if (labelUrl && !documents.some(doc => doc.url === labelUrl || doc.url === getDocumentProxyUrl(labelUrl))) {
      documents.push({
        name: product.admin_label_url ? 'Product Label (Modified)' : 'Product Label',
        url: getDocumentProxyUrl(labelUrl) || labelUrl,
      });
    }

    // Return product with updated documents array
    return NextResponse.json(
      {
        ...product,
        documents,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=7200',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}
