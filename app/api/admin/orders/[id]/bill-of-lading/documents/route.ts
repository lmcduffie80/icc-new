import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query } from '@/lib/db';

interface SDSDocument {
  name: string;
  url: string;
  productName: string;
  productId: string;
}

/**
 * Normalize URL by extracting the actual S3 URL from proxy URLs
 * This ensures we can detect duplicates regardless of URL format
 * 
 * Examples:
 * - /api/images/proxy?url=https%3A%2F%2Fs3.com%2Ffile.pdf -> https://s3.com/file.pdf
 * - https://s3.com/file.pdf -> https://s3.com/file.pdf
 */
function normalizeUrl(url: string): string {
  // If it's a proxy URL, extract the actual S3 URL
  if (url.startsWith('/api/images/proxy?url=')) {
    try {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const actualUrl = urlParams.get('url');
      return actualUrl || url;
    } catch {
      return url;
    }
  }
  return url;
}

/**
 * GET /api/admin/orders/[id]/bill-of-lading/documents
 * Fetch all SDS documents from order items for selection
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.view');
  if (auth.error) return auth.error;

  const { id: orderId } = await params;

  try {
    // Fetch order items with product documents
    const itemsData = await query<{
      id: string;
      product_id: string;
      name: string;
      documents: unknown;
      attributes: unknown;
      sds_url: string | null;
    }>(
      `SELECT 
        oi.id,
        oi.product_id,
        oi.name,
        p.documents,
        p.attributes,
        p.sds_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id AND p.deleted_at IS NULL
       WHERE oi.order_id = $1
       ORDER BY oi.name`,
      [orderId]
    );

    const sdsDocuments: SDSDocument[] = [];
    const seenUrls = new Set<string>(); // Avoid duplicates

    itemsData.forEach((item) => {
      // Parse product-level documents (Features & Docs)
      let productDocuments = item.documents;
      if (typeof productDocuments === 'string') {
        try {
          productDocuments = JSON.parse(productDocuments);
        } catch {
          productDocuments = [];
        }
      }

      // Parse attributes documents
      let attrs = item.attributes;
      if (typeof attrs === 'string') {
        try {
          attrs = JSON.parse(attrs);
        } catch {
          attrs = {};
        }
      }

      // Check product-level documents (Features & Docs)
      const productDocs = Array.isArray(productDocuments) ? productDocuments : [];
      productDocs.forEach((doc: unknown) => {
        if (typeof doc !== 'object' || doc === null) return;
        const docObj = doc as { name?: string; url?: string };
        if (docObj.name && docObj.url) {
          const docNameLower = docObj.name.toLowerCase();
          const docUrlLower = docObj.url.toLowerCase();
          const isSDS =
            docNameLower.includes('sds') ||
            docNameLower.includes('safety data sheet') ||
            docNameLower.includes('safety datasheet') ||
            docUrlLower.includes('sds');

          if (isSDS) {
            const normalizedUrl = normalizeUrl(docObj.url);
            if (!seenUrls.has(normalizedUrl)) {
              seenUrls.add(normalizedUrl);
              sdsDocuments.push({
                name: docObj.name,
                url: docObj.url,
                productName: item.name,
                productId: item.product_id,
              });
            }
          }
        }
      });

      // Also check attributes documents (for backward compatibility)
      const attrsObj = attrs as Record<string, unknown> | null;
      const attrDocuments = Array.isArray(attrsObj?.documents) ? attrsObj.documents : [];
      attrDocuments.forEach((doc: unknown) => {
        if (typeof doc !== 'object' || doc === null) return;
        const docObj = doc as { name?: string; url?: string };
        if (docObj.name && docObj.url) {
          const docNameLower = docObj.name.toLowerCase();
          const docUrlLower = docObj.url.toLowerCase();
          const isSDS =
            docNameLower.includes('sds') ||
            docNameLower.includes('safety data sheet') ||
            docNameLower.includes('safety datasheet') ||
            docUrlLower.includes('sds');

          if (isSDS) {
            const normalizedUrl = normalizeUrl(docObj.url);
            if (!seenUrls.has(normalizedUrl)) {
              seenUrls.add(normalizedUrl);
              sdsDocuments.push({
                name: docObj.name,
                url: docObj.url,
                productName: item.name,
                productId: item.product_id,
              });
            }
          }
        }
      });

      // Check sds_url column (most common location for SDS files)
      if (item.sds_url) {
        const normalizedUrl = normalizeUrl(item.sds_url);
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          sdsDocuments.push({
            name: 'Safety Data Sheet (SDS)',
            url: item.sds_url,
            productName: item.name,
            productId: item.product_id,
          });
        }
      }
    });

    return NextResponse.json({
      sdsDocuments,
      count: sdsDocuments.length,
    });
  } catch (error) {
    console.error('Error fetching SDS documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SDS documents' },
      { status: 500 }
    );
  }
}

