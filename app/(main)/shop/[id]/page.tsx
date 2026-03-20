import { notFound } from 'next/navigation';
import { ProductDetailContent } from './product-detail-content';
import { queryOne, query } from '@/lib/db';
import { getDocumentProxyUrl } from '@/lib/s3';
import type { Metadata } from 'next';
import type { ProductDetailDB, ProductDetailView, ProductDocument, SimilarProduct } from '@/lib/products';

// Force dynamic rendering to prevent caching issues with URL conversion
export const dynamic = 'force-dynamic';

async function getProduct(id: string): Promise<ProductDetailView | null> {
  const product = await queryOne<ProductDetailDB>(
    `SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  if (!product) {
    return null;
  }

  // Default attributes structure
  const defaultAttributes = {
    activeIngredients: 'N/A',
    epaSignalWord: 'Not Applicable',
    epaRegistrationNumber: 'Not Applicable',
    applicationRateRange: 'N/A',
    containerSizes: 'N/A',
    availabilityDate: 'Year-round',
  };

  // Build documents array from documents JSONB and separate URL columns
  // Ensure documents is always an array (handle case where it might be an object or null)
  let documents: ProductDocument[] = [];
  if (product.documents) {
    if (Array.isArray(product.documents)) {
      // Convert S3 URLs to proxy URLs for all existing documents
      documents = product.documents.map(doc => ({
        ...doc,
        url: getDocumentProxyUrl(doc.url) || doc.url,
      }));
    }
    // If it's not an array (e.g., an object), treat it as empty array
  }
  
  // Add SDS URL if it exists and not already in documents (convert to proxy URL)
  if (product.sds_url) {
    const sdsProxyUrl = getDocumentProxyUrl(product.sds_url) || product.sds_url;
    // Check if SDS is already in documents by comparing both original and proxy URLs
    const sdsExists = documents.some(doc => 
      doc.url === product.sds_url || 
      doc.url === sdsProxyUrl ||
      doc.name?.toLowerCase().includes('safety data sheet') ||
      doc.name?.toLowerCase().includes('sds')
    );
    
    if (!sdsExists) {
      documents.push({
        name: 'Safety Data Sheet (SDS)',
        url: sdsProxyUrl,
      });
      console.log(`[getProduct] Added SDS with proxy URL: ${sdsProxyUrl}`);
    }
  }
  
  // Add Label URL (prefer admin_label_url if available, otherwise label_url) - convert to proxy URL
  const labelUrl = product.admin_label_url || product.label_url;
  if (labelUrl) {
    const labelProxyUrl = getDocumentProxyUrl(labelUrl) || labelUrl;
    // Check if label is already in documents by comparing both original and proxy URLs
    const labelExists = documents.some(doc => 
      doc.url === labelUrl || 
      doc.url === labelProxyUrl ||
      doc.name?.toLowerCase().includes('label')
    );
    
    if (!labelExists) {
      documents.push({
        name: product.admin_label_url ? 'Product Label (Modified)' : 'Product Label',
        url: labelProxyUrl,
      });
      console.log(`[getProduct] Added Label with proxy URL: ${labelProxyUrl}`);
    }
  }

  // Map database fields to the view format expected by ProductDetailContent
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description || '',
    fullDescription: product.full_description || product.description || '',
    price: product.price,
    originalPrice: product.msrp || undefined,
    unitOfMeasure: product.unit_of_measure,
    image: product.image || '',
    inStock: product.in_stock,
    sku: product.sku || '',
    rating: product.rating ? parseFloat(product.rating) : 0,
    reviewCount: product.review_count || 0,
    attributes: { ...defaultAttributes, ...product.attributes },
    approvedStates: product.approved_states || [],
    features: product.features || [],
    specifications: product.specifications || {},
    documents,
    restrictedUse: product.restricted_use,
    comparedTo: product.compared_to || null,
    truckloadEligible: product.truckload_eligible ?? false,
    casesPerPallet: product.cases_per_pallet ?? null,
    bulkDensityLbsPerGallon: product.bulk_density_lbs_per_gallon ?? null,
    gallonsPerCase: product.gallons_per_case ?? null,
  };
}

async function getSimilarProducts(category: string, excludeId: string): Promise<SimilarProduct[]> {
  try {
    return await query<SimilarProduct>(
      `SELECT id, name, category, price, original_price, unit_of_measure, attributes, image,
        (inventory_count > 0 OR COALESCE(icc_available_quantity, 0) > 0 OR in_stock) AS in_stock
       FROM products
       WHERE category = $1
         AND id != $2
         AND deleted_at IS NULL
         AND (supplier_id IS NULL OR approval_status = 'published')
       ORDER BY created_at DESC
       LIMIT 4`,
      [category, excludeId]
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  
  if (!product) {
    return {
      title: 'Product Not Found | Innovative Crop Care, LLC',
    };
  }
  
  return {
    title: `${product.name} | Innovative Crop Care, LLC`,
    description: product.description,
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  const similarProducts = await getSimilarProducts(product.category, product.id);

  return <ProductDetailContent product={product} similarProducts={similarProducts} />;
}
