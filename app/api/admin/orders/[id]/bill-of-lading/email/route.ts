import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { getStoreInfo } from '@/lib/store-info';
import { Resend } from 'resend';
import { getFileFromS3, getKeyFromUrl, uploadToS3 } from '@/lib/s3';
import { type WarehouseAllocation, deductWarehouseInventory } from '@/lib/warehouse-allocation';
import { PDFDocument } from 'pdf-lib';

// Increase timeout for this route (90 seconds) - needed for large email attachments, especially multiple attachments
export const maxDuration = 90;

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';

// Lazy-load Resend client to avoid initialization errors
let resendClient: Resend | null = null;

/**
 * Compress PDF buffer by optimizing and removing unused objects
 * Returns compressed buffer or original buffer if compression fails
 */
async function compressPDF(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    const originalSize = pdfBuffer.length;
    console.log(`📦 PDF Compression: Starting compression (original size: ${originalSize} bytes / ${(originalSize / 1024).toFixed(2)} KB)`);
    
    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    // Save the PDF with optimization (removes unused objects, compresses streams)
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true, // Enable object streams for better compression
      addDefaultPage: false,
    });
    
    const compressedBuffer = Buffer.from(compressedBytes);
    const compressedSize = compressedBuffer.length;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    
    console.log(`📦 PDF Compression: Complete (compressed size: ${compressedSize} bytes / ${(compressedSize / 1024).toFixed(2)} KB, reduction: ${compressionRatio}%)`);
    
    // Only return compressed if it's actually smaller (sometimes optimization can make it slightly larger)
    if (compressedSize < originalSize) {
      return compressedBuffer;
    } else {
      console.log(`📦 PDF Compression: Compressed version is larger, using original`);
      return pdfBuffer;
    }
  } catch (error) {
    console.error('📦 PDF Compression: Error compressing PDF, using original:', error);
    // Return original buffer if compression fails
    return pdfBuffer;
  }
}

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

interface Address {
  firstName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  email?: string;
  phone?: string;
}

interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  shipping_address: Address | string;
  billing_address: Address | string;
  delivery_method: string;
  delivery_fee: string;
  subtotal: string;
  tax: string;
  total: string;
  created_at: string;
  user_email: string;
  user_name: string;
  warehouse_id: string | null;
  metadata?: Record<string, unknown> | string; // JSONB field from database
}

interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  price: string;
  quantity: number;
  unit_of_measure: string | null;
  sku?: string | null;
  specifications?: Record<string, unknown>;
  productDocuments?: Array<{ name: string; url: string }>;
  attributes?: {
    epaSignalWord?: string;
    epaRegistrationNumber?: string;
    containerSizes?: string;
    documents?: Array<{ name: string; url: string }>;
    weight?: string;
    sdsInformation?: string;
  };
}

// POST /api/admin/orders/[id]/bill-of-lading/email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('\n🚀🚀🚀 ========================================');
  console.log('🚀🚀🚀 BOL EMAIL ROUTE: Route handler called');
  console.log('🚀🚀🚀 Timestamp:', new Date().toISOString());
  console.log('🚀🚀🚀 ========================================\n');
  
  // Try with just admin access first (no specific permission)
  const auth = await requireAdmin();
  if (auth.error) {
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Auth failed - no admin session');
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Error status:', auth.error.status);
    const errorText = await auth.error.text().catch(() => 'Could not read error body');
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Error body:', errorText);
    return auth.error;
  }
  
  console.log('🚀🚀🚀 BOL EMAIL ROUTE: Auth successful');
  console.log('🚀🚀🚀 BOL EMAIL ROUTE: Admin user ID:', auth.session.adminUser?.id || auth.session.user?.id);
  console.log('🚀🚀🚀 BOL EMAIL ROUTE: Permissions:', auth.session.permissions);

  // Validate Resend configuration early
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('🚀🚀🚀 BOL EMAIL ROUTE: RESEND_API_KEY is not set');
    return NextResponse.json(
      {
        error: 'Email service not configured',
        message: 'RESEND_API_KEY environment variable is not set. Please configure your Resend API key.',
        suggestion: 'Add RESEND_API_KEY to your environment variables. See RESEND_SETUP.md for instructions.',
      },
      { status: 500 }
    );
  }
  
  if (!apiKey.startsWith('re_')) {
    console.error('🚀🚀🚀 BOL EMAIL ROUTE: RESEND_API_KEY appears invalid (does not start with "re_")');
    return NextResponse.json(
      {
        error: 'Invalid email service configuration',
        message: 'RESEND_API_KEY appears to be invalid. Resend API keys should start with "re_".',
        suggestion: 'Verify your RESEND_API_KEY in the Resend dashboard at https://resend.com/api-keys',
      },
      { status: 500 }
    );
  }

  // Test Resend API connectivity (quick DNS check)
  try {
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Testing Resend API connectivity...');
    const connectivityTest = await fetch('https://api.resend.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    }).catch(() => null);
    
    if (!connectivityTest) {
      console.warn('⚠️⚠️⚠️ BOL EMAIL ROUTE: Cannot reach Resend API - possible network/DNS issue');
      console.warn('⚠️⚠️⚠️ BOL EMAIL ROUTE: This may cause email sending to fail');
      console.warn('⚠️⚠️⚠️ BOL EMAIL ROUTE: Check: 1) Internet connection, 2) DNS resolution, 3) Firewall/proxy settings');
    } else {
      console.log('✅ BOL EMAIL ROUTE: Resend API is reachable');
    }
  } catch (connectivityError) {
    console.warn('⚠️⚠️⚠️ BOL EMAIL ROUTE: Connectivity test failed:', connectivityError instanceof Error ? connectivityError.message : String(connectivityError));
    console.warn('⚠️⚠️⚠️ BOL EMAIL ROUTE: Email sending may fail due to network issues');
  }

  try {
    const { id: orderId } = await params;
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Order ID:', orderId);
    const body = await request.json();
    // Default to sending PDFs as email attachments (can be overridden with useS3Links=true)
    const { email, carrierName, includeBOL = true, includeSDS = [], useS3Links = false } = body;
    console.log('🚀 BOL EMAIL ROUTE: Email:', email, 'Carrier:', carrierName);
    console.log('🚀 BOL EMAIL ROUTE: Include BOL:', includeBOL, 'Include SDS:', includeSDS);
    console.log('🚀 BOL EMAIL ROUTE: Use S3 Links:', useS3Links);

    // Parse email - can be string or array
    let emailList: string[] = [];
    if (Array.isArray(email)) {
      emailList = email.map(e => typeof e === 'string' ? e.trim() : String(e).trim()).filter(e => e.length > 0);
    } else if (typeof email === 'string') {
      // Support comma or newline separated emails
      emailList = email
        .split(/[,\n]/)
        .map(e => e.trim())
        .filter(e => e.length > 0);
    }

    if (emailList.length === 0) {
      return NextResponse.json({ error: 'At least one email address is required' }, { status: 400 });
    }

    // Validate all email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(e => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { error: `Invalid email address(es): ${invalidEmails.join(', ')}` },
        { status: 400 }
      );
    }

    console.log('🚀 BOL EMAIL ROUTE: Validated email list:', emailList);

    // Fetch order
    const order = await queryOne<Order>(
      `SELECT o.*, u.email as user_email, u.name as user_name
       FROM orders o
       JOIN "user" u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch order items with product attributes
    const itemsData = await query<{
      id: string;
      product_id: string;
      name: string;
      price: string;
      quantity: number;
      unit_of_measure: string | null;
      attributes: unknown;
      documents: unknown;
      sku: string | null;
      specifications: unknown;
      sds_url: string | null;
      label_url: string | null;
      admin_label_url: string | null;
    }>(
      `SELECT 
        oi.id,
        oi.product_id,
        oi.name,
        oi.price,
        oi.quantity,
        oi.unit_of_measure,
        p.attributes,
        p.documents,
        p.sku,
        p.specifications,
        p.sds_url,
        p.label_url,
        p.admin_label_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id AND p.deleted_at IS NULL
       WHERE oi.order_id = $1
       ORDER BY oi.name`,
      [orderId]
    );

    const items: OrderItem[] = itemsData.map((item) => {
      // Parse product-level documents (Features & Docs) if it's a string
      let productDocuments: Array<{ name?: string; url?: string }> = [];
      if (typeof item.documents === 'string') {
        try {
          const parsed = JSON.parse(item.documents);
          if (Array.isArray(parsed)) {
            productDocuments = parsed;
          }
        } catch {
          productDocuments = [];
        }
      } else if (Array.isArray(item.documents)) {
        productDocuments = item.documents as Array<{ name?: string; url?: string }>;
      }

      // Add SDS URL if it exists and not already in documents
      if (item.sds_url && !productDocuments.some((doc) => doc.url === item.sds_url || doc.name?.toLowerCase().includes('sds'))) {
        productDocuments.push({
          name: 'Safety Data Sheet (SDS)',
          url: item.sds_url,
        });
      }

      // Add Label URL (prefer admin_label_url if available, otherwise label_url)
      const labelUrl = item.admin_label_url || item.label_url;
      if (labelUrl && !productDocuments.some((doc) => doc.url === labelUrl || doc.name?.toLowerCase().includes('label'))) {
        productDocuments.push({
          name: item.admin_label_url ? 'Product Label (Modified)' : 'Product Label',
          url: labelUrl,
        });
      }
      
      // Parse attributes documents if it's a string
      let attrs = item.attributes;
      if (typeof attrs === 'string') {
        try {
          attrs = JSON.parse(attrs);
        } catch {
          attrs = {};
        }
      }
      
      // Parse specifications if it's a string
      let specifications = item.specifications;
      if (typeof specifications === 'string') {
        try {
          specifications = JSON.parse(specifications);
        } catch {
          specifications = {};
        }
      }
      
      return {
        id: item.id,
        product_id: item.product_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        unit_of_measure: item.unit_of_measure,
        sku: item.sku,
        specifications: (specifications || {}) as Record<string, unknown>,
        productDocuments: (Array.isArray(productDocuments) ? productDocuments : []) as Array<{ name: string; url: string }>,
        attributes: (attrs || {}) as OrderItem['attributes'],
      };
    });

    // Get store info
    const storeInfo = await getStoreInfo();

    // Check for warehouse allocations and NMFC info in metadata
    let warehouseAllocations: WarehouseAllocation[] | null = null;
    let nmfcInfo: Array<{ number?: string; shippingType: 'TL' | 'LTL' }> | null = null;
    let nmfcNumber: string | null = null; // Legacy fallback
    let parsedMetadata: Record<string, unknown> | null = null;
    
    if (order.metadata && typeof order.metadata === 'string') {
      try {
        parsedMetadata = JSON.parse(order.metadata);
        warehouseAllocations = Array.isArray(parsedMetadata?.warehouse_allocations)
          ? parsedMetadata.warehouse_allocations as WarehouseAllocation[]
          : null;
      } catch {
        // Metadata is not valid JSON, ignore
      }
    } else if (order.metadata && typeof order.metadata === 'object') {
      parsedMetadata = order.metadata as Record<string, unknown>;
      warehouseAllocations = Array.isArray(parsedMetadata?.warehouse_allocations)
        ? parsedMetadata.warehouse_allocations as WarehouseAllocation[]
        : null;
    }
    
    // Extract NMFC info from metadata
    if (parsedMetadata) {
      // New format: array of NMFC info
      if (parsedMetadata.nmfcInfo && Array.isArray(parsedMetadata.nmfcInfo)) {
        nmfcInfo = parsedMetadata.nmfcInfo as Array<{ number?: string; shippingType: 'TL' | 'LTL' }>;
      }
      // Legacy format: single NMFC number
      const legacyNmfcNumber = parsedMetadata.nmfcNumber;
      if (typeof legacyNmfcNumber === 'string') {
        nmfcNumber = legacyNmfcNumber;
        // Convert to new format if not already set
        if (!nmfcInfo) {
          if (legacyNmfcNumber === 'TL') {
            nmfcInfo = [{ shippingType: 'TL', number: undefined }];
          } else {
            nmfcInfo = [{ shippingType: 'LTL', number: legacyNmfcNumber }];
          }
        }
      }
    }

    // Fetch warehouse information if warehouse_id is set (for single warehouse)
    let warehouse = null;
    if (order.warehouse_id && (!warehouseAllocations || warehouseAllocations.length === 0)) {
      warehouse = await queryOne<{
        id: string;
        name: string;
        address_street: string;
        address_city: string;
        address_state: string;
        address_zip: string;
        phone: string | null;
        email: string | null;
      }>(
        'SELECT id, name, address_street, address_city, address_state, address_zip, phone, email FROM warehouses WHERE id = $1',
        [order.warehouse_id]
      );
    }

    // Parse addresses
    const shippingAddress = typeof order.shipping_address === 'string'
      ? JSON.parse(order.shipping_address)
      : order.shipping_address;
    
    const billingAddress = typeof order.billing_address === 'string'
      ? JSON.parse(order.billing_address)
      : order.billing_address;

    // Collect SDS documents BEFORE generating HTML (so we can use them in email)
    // Only collect documents that are in the includeSDS array (user-selected)
    const allDocuments = new Map<string, string>();
    const selectedSDSUrls = Array.isArray(includeSDS) ? includeSDS : [];
    
    // Normalize URLs for comparison (remove trailing slashes, normalize encoding)
    const normalizeUrl = (url: string | null | undefined): string => {
      if (!url || typeof url !== 'string') {
        return '';
      }
      try {
        const urlObj = new URL(url);
        // Remove trailing slash from pathname
        urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
        return urlObj.toString();
      } catch (error) {
        // If URL parsing fails, just trim and return
        console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to normalize URL "${url}":`, error);
        return url.trim().replace(/\/$/, '');
      }
    };
    
    const normalizedSelectedUrls = new Set(selectedSDSUrls.map(normalizeUrl));
    
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Starting SDS document collection`);
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Selected SDS URLs count: ${selectedSDSUrls.length}`);
    if (selectedSDSUrls.length > 0) {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Selected SDS URLs:`, selectedSDSUrls);
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Normalized selected URLs:`, Array.from(normalizedSelectedUrls));
    }
    
    if (selectedSDSUrls.length > 0) {
      items.forEach((item, itemIndex) => {
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Processing item ${itemIndex + 1}: ${item.name}`);
        
        // Check product-level documents (Features & Docs)
        // Ensure productDocs is always an array
        const productDocs = Array.isArray(item.productDocuments) ? item.productDocuments : [];
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Item ${itemIndex + 1} has ${productDocs.length} product documents`);
        productDocs.forEach((doc: unknown, docIndex: number) => {
          if (typeof doc !== 'object' || doc === null) return;
          const docObj = doc as { name?: string; url?: string };
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Item ${itemIndex + 1}, Doc ${docIndex + 1}: name="${docObj.name}", url="${docObj.url}"`);
          // Only include SDS documents that are in the selected list
          if (docObj.name && docObj.url) {
            const normalizedDocUrl = normalizeUrl(docObj.url);
            const isInSelectedList = normalizedSelectedUrls.has(normalizedDocUrl) || selectedSDSUrls.includes(docObj.url);

            if (isInSelectedList) {
              const docNameLower = docObj.name.toLowerCase();
              const docUrlLower = docObj.url.toLowerCase();
              const isSDS =
                docNameLower.includes('sds') ||
                docNameLower.includes('safety data sheet') ||
                docNameLower.includes('safety datasheet') ||
                docUrlLower.includes('sds');

              console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Doc "${docObj.name}" - isSDS: ${isSDS}, URL in selected list: ${isInSelectedList}`);

              if (isSDS) {
                allDocuments.set(docObj.name, docObj.url);
                console.log(`🚀🚀🚀 BOL EMAIL ROUTE: ✓ Added selected SDS document: ${docObj.name} -> ${docObj.url}`);
              }
            } else {
              console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Doc "${docObj.name}" URL not in selected list (normalized: ${normalizedDocUrl})`);
            }
          } else {
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Doc ${docIndex + 1} missing name or url`);
          }
        });
        
        // Also check attributes documents (for backward compatibility)
        const attrs = item.attributes || {};
        // Ensure attrDocuments is always an array
        const attrDocuments = Array.isArray(attrs.documents) ? attrs.documents : [];
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Item ${itemIndex + 1} has ${attrDocuments.length} attribute documents`);
        attrDocuments.forEach((doc: unknown, docIndex: number) => {
          if (typeof doc !== 'object' || doc === null) return;
          const docObj = doc as { name?: string; url?: string };
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Item ${itemIndex + 1}, Attr Doc ${docIndex + 1}: name="${docObj.name}", url="${docObj.url}"`);
          // Only include SDS documents that are in the selected list
          if (docObj.name && docObj.url) {
            const normalizedDocUrl = normalizeUrl(docObj.url);
            const isInSelectedList = normalizedSelectedUrls.has(normalizedDocUrl) || selectedSDSUrls.includes(docObj.url);

            if (isInSelectedList) {
              const docNameLower = docObj.name.toLowerCase();
              const docUrlLower = docObj.url.toLowerCase();
              const isSDS =
                docNameLower.includes('sds') ||
                docNameLower.includes('safety data sheet') ||
                docNameLower.includes('safety datasheet') ||
                docUrlLower.includes('sds');

              console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Attr Doc "${docObj.name}" - isSDS: ${isSDS}, URL in selected list: ${isInSelectedList}`);

              if (isSDS) {
                allDocuments.set(docObj.name, docObj.url);
                console.log(`🚀🚀🚀 BOL EMAIL ROUTE: ✓ Added selected SDS document from attributes: ${docObj.name} -> ${docObj.url}`);
              }
            } else {
              console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Attr Doc "${docObj.name}" URL not in selected list (normalized: ${normalizedDocUrl})`);
            }
          } else {
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Attr Doc ${docIndex + 1} missing name or url`);
          }
        });
      });
    } else {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: No SDS documents selected by user (includeSDS is empty)`);
    }
    
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Found ${allDocuments.size} selected SDS document(s) to attach`);
    if (allDocuments.size > 0) {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Selected SDS documents:`, Array.from(allDocuments.entries()).map(([name, url]) => `${name} -> ${url}`));
    } else {
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: No SDS documents found in allDocuments Map!`);
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: This could mean:`);
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: 1. No SDS documents were selected in the modal`);
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: 2. SDS documents don't match the selected URLs`);
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: 3. Items don't have productDocuments or attributes.documents`);
    }

    // Only generate BOL if it's selected
    let bolHTML = ''; // For single BOL or fallback
    const bolPDFs: Array<{ buffer: Buffer; filename: string }> = []; // For multiple warehouse BOLs
    let pdfBuffer: Buffer | null = null; // For single BOL (backward compatibility)
    let isPDF = false;
    let pdfErrorDetails: Record<string, unknown> | null = null;
    let filename = '';

    if (includeBOL) {
      console.log('🚀🚀🚀 BOL EMAIL ROUTE: BOL is selected, generating BOL PDF(s)...');
      
      // Filter items if we have a single warehouse allocation
      let itemsToUse = items;
      let warehouseToUse = warehouse;
      
      if (warehouseAllocations && warehouseAllocations.length === 1) {
        // Single warehouse allocation - filter items
        const allocation = warehouseAllocations[0];
        warehouseToUse = await queryOne<{
          id: string;
          name: string;
          address_street: string;
          address_city: string;
          address_state: string;
          address_zip: string;
          phone: string | null;
          email: string | null;
        }>(
          'SELECT id, name, address_street, address_city, address_state, address_zip, phone, email FROM warehouses WHERE id = $1',
          [allocation.warehouse_id]
        );

        itemsToUse = items.filter(item => 
          allocation.items.some(allocItem => allocItem.product_id === item.product_id)
        ).map(item => {
          const allocItem = allocation.items.find(ai => ai.product_id === item.product_id);
          return {
            ...item,
            quantity: allocItem?.quantity || item.quantity,
          };
        });
        
        // Generate single BOL HTML
        bolHTML = generateBillOfLadingHTML({
          order,
          items: itemsToUse,
          storeInfo,
          shippingAddress,
          billingAddress,
          warehouse: warehouseToUse,
        });
      } else if (warehouseAllocations && warehouseAllocations.length > 1) {
        // Multiple warehouses - generate SEPARATE PDFs for each warehouse
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Generating ${warehouseAllocations.length} separate BOL PDFs...`);
        
        const PDFSHIFT_API_KEY = process.env.PDFSHIFT_API_KEY;
        
        if (!PDFSHIFT_API_KEY) {
          console.error('🚀🚀🚀 BOL EMAIL ROUTE: PDFSHIFT_API_KEY not configured for multiple warehouse BOLs');
          return NextResponse.json(
            { error: 'PDF generation service not configured' },
            { status: 500 }
          );
        }
        
        // Generate a separate PDF for each warehouse
        for (let i = 0; i < warehouseAllocations.length; i++) {
          const allocation = warehouseAllocations[i];
          const shipmentNumber = i + 1;
          const totalShipments = warehouseAllocations.length;
          
          const warehouseDetails = await queryOne<{
            id: string;
            name: string;
            address_street: string;
            address_city: string;
            address_state: string;
            address_zip: string;
            phone: string | null;
            email: string | null;
          }>(
            'SELECT id, name, address_street, address_city, address_state, address_zip, phone, email FROM warehouses WHERE id = $1',
            [allocation.warehouse_id]
          );

          const warehouseItems = items.filter(item => 
            allocation.items.some(allocItem => allocItem.product_id === item.product_id)
          ).map(item => {
            const allocItem = allocation.items.find(ai => ai.product_id === item.product_id);
            return {
              ...item,
              quantity: allocItem?.quantity || item.quantity,
            };
          });

          // Get NMFC number for this warehouse (use index to match with nmfcInfo array)
          let warehouseNmfcNumber = 'TBD';
          if (nmfcInfo && nmfcInfo.length > i) {
            const nmfcEntry = nmfcInfo[i];
            warehouseNmfcNumber = nmfcEntry.shippingType === 'TL' ? 'TL' : (nmfcEntry.number || 'TBD');
          } else if (nmfcNumber) {
            // Fallback to legacy single NMFC number
            warehouseNmfcNumber = nmfcNumber;
          }

          const bolHtml = generateBillOfLadingHTML({
            order: {
              ...order,
              order_number: order.order_number, // Keep original order number
            },
            items: warehouseItems,
            storeInfo,
            shippingAddress,
            billingAddress,
            warehouse: warehouseDetails,
            shipmentNumber,
            totalShipments,
            nmfcNumber: warehouseNmfcNumber, // Pass warehouse-specific NMFC number
          });

          // Generate PDF for this warehouse
          try {
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Generating PDF ${shipmentNumber} of ${totalShipments} for warehouse ${warehouseDetails?.name}...`);
            
            const requestBody: Record<string, unknown> = {
              source: bolHtml,
              landscape: false,
              use_print: false,
              format: 'Letter',
              margin: {
                top: '48',
                right: '48',
                bottom: '48',
                left: '48',
              },
              disable_backgrounds: false,
              sandbox: false,
              encode: false,
            };
            
            const response = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
              method: 'POST',
              headers: {
                'X-API-Key': PDFSHIFT_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: PDFShift API error for shipment ${shipmentNumber}:`, response.status, errorText);
              throw new Error(`PDFShift API error (${response.status}): ${errorText.substring(0, 500)}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            let pdfBuffer = Buffer.from(arrayBuffer);
            
            // Validate it's a PDF
            const pdfHeader = pdfBuffer.toString('ascii', 0, 4);
            if (pdfHeader !== '%PDF') {
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Invalid PDF for shipment ${shipmentNumber}, header: ${pdfHeader}`);
              throw new Error(`Invalid PDF response for shipment ${shipmentNumber}`);
            }
            
            // Compress PDF before adding to attachments
            console.log(`📦 Compressing PDF ${shipmentNumber} of ${totalShipments}...`);
            const compressedBuffer = await compressPDF(pdfBuffer);
            pdfBuffer = Buffer.from(compressedBuffer);
            
            const bolFilename = `BOL-${order.order_number}-Shipment${shipmentNumber}of${totalShipments}.pdf`;
            bolPDFs.push({
              buffer: pdfBuffer,
              filename: bolFilename,
            });
            
            console.log(`✓ Generated and compressed PDF ${shipmentNumber} of ${totalShipments}: ${bolFilename} (${pdfBuffer.length} bytes)`);
          } catch (error) {
            console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Error generating PDF for shipment ${shipmentNumber}:`, error);
            throw error; // Fail if any PDF generation fails
          }
        }
        
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Successfully generated ${bolPDFs.length} separate BOL PDFs`);
      } else {
        // Generate BOL HTML (no allocation - single warehouse or default)
        bolHTML = generateBillOfLadingHTML({
          order,
          items: itemsToUse,
          storeInfo,
          shippingAddress,
          billingAddress,
          warehouse: warehouseToUse,
        });
      }

      // Convert HTML to PDF using PDFShift API directly (only for single BOL)
      // Multiple warehouse BOLs are already generated as separate PDFs above
      if (bolPDFs.length === 0 && bolHTML) {
        // Only generate PDF if we don't already have multiple PDFs and we have HTML
        console.log('=== BOL Email Route: Starting PDF generation for single BOL ===');
        console.log('BOL Email Route: BOL HTML length:', bolHTML.length, 'characters');
        
        const PDFSHIFT_API_KEY = process.env.PDFSHIFT_API_KEY;
        
        console.log('\n🚀🚀🚀 BOL EMAIL ROUTE: Starting PDF generation...');
        console.log('🚀🚀🚀 BOL EMAIL ROUTE: PDFSHIFT_API_KEY exists:', !!PDFSHIFT_API_KEY);
        console.log('🚀🚀🚀 BOL EMAIL ROUTE: PDFSHIFT_API_KEY length:', PDFSHIFT_API_KEY?.length || 0);
        
        if (PDFSHIFT_API_KEY) {
          try {
            console.log('\n🚀🚀🚀 BOL EMAIL ROUTE: Calling PDFShift API...');
            console.log('🚀 BOL EMAIL ROUTE: HTML length:', bolHTML.length);
            console.log('🚀 BOL EMAIL ROUTE: HTML first 100 chars:', bolHTML.substring(0, 100));
            
            // PDFShift accepts HTML as source directly
            console.log('🚀 BOL EMAIL ROUTE: Sending HTML to PDFShift...');
            const requestBody: Record<string, unknown> = {
              source: bolHTML,
              landscape: false,
              use_print: false,
              format: 'Letter',
              margin: {
                top: '48',
                right: '48',
                bottom: '48',
                left: '48',
              },
              disable_backgrounds: false,
              sandbox: false,
              encode: false,
            };
            
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: About to call PDFShift API...');
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: API Key exists:', !!PDFSHIFT_API_KEY);
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: API Key length:', PDFSHIFT_API_KEY?.length || 0);
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: API Key preview:', PDFSHIFT_API_KEY ? `${PDFSHIFT_API_KEY.substring(0, 10)}...` : 'NOT SET');
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: Request body size:', JSON.stringify(requestBody).length, 'bytes');
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: HTML source length:', bolHTML.length, 'characters');
            
            // Check if HTML is too large (PDFShift has limits)
            if (bolHTML.length > 1000000) {
              console.warn('⚠️ BOL EMAIL ROUTE: HTML is very large (' + bolHTML.length + ' chars). PDFShift may have issues.');
            }
            
            // Make sure the request body is properly formatted
            const requestBodyJson = JSON.stringify(requestBody);
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: Request body JSON length:', requestBodyJson.length, 'bytes');
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: Request body preview (first 500 chars):', requestBodyJson.substring(0, 500));
            
            const response = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
              method: 'POST',
              headers: {
                'X-API-Key': PDFSHIFT_API_KEY!,
                'Content-Type': 'application/json',
              },
              body: requestBodyJson,
            });

            console.log('🚀🚀🚀 BOL EMAIL ROUTE: PDFShift API call completed!');
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: Response status:', response.status, response.statusText);
            console.log('🚀 BOL EMAIL ROUTE: Response headers:', Object.fromEntries(response.headers.entries()));

            // Check response content type first
            const contentType = response.headers.get('content-type');
            console.log('🚀 BOL EMAIL ROUTE: Response Content-Type:', contentType);
            
            if (!response.ok) {
              // Read response as text to get error details
              const errorText = await response.text();
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: PDFShift API error response');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Status:', response.status, response.statusText);
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error response (first 2000 chars):', errorText.substring(0, 2000));
              
              // Try to parse JSON error if possible (unused for now, but available for debugging)

              throw new Error(`PDFShift API error (${response.status}): ${errorText.substring(0, 500)}`);
            }
            
            // Read the response first to check what we actually got
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: Reading response as ArrayBuffer...');
            const arrayBuffer = await response.arrayBuffer();
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');
            
            pdfBuffer = Buffer.from(arrayBuffer);
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: Buffer created, size:', pdfBuffer.length, 'bytes');
            
            // Check the first few bytes to see what we got
            const pdfHeader = pdfBuffer.toString('ascii', 0, 4);
            const firstBytes = pdfBuffer.toString('utf-8', 0, Math.min(200, pdfBuffer.length));
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: First 4 bytes (header):', pdfHeader);
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: First 200 bytes:', firstBytes);
            
            // Check if content-type is HTML (early detection)
            if (contentType && contentType.includes('text/html')) {
              const errorHtml = pdfBuffer.toString('utf-8');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: PDFShift returned HTML instead of PDF!');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: HTML response (first 1000 chars):', errorHtml.substring(0, 1000));
              throw new Error(`PDFShift returned HTML error page instead of PDF. Status: ${response.status}`);
            }
            
            // Check if the buffer itself is HTML (even if content-type says otherwise)
            // Check multiple HTML patterns to catch all cases
            const isHtmlResponse = 
              pdfHeader === '<!DO' || 
              pdfHeader === '<htm' || 
              pdfHeader.startsWith('<!') ||
              firstBytes.includes('<!DOCTYPE') || 
              firstBytes.includes('<html') ||
              firstBytes.includes('<HTML') ||
              firstBytes.trim().startsWith('<');
              
            if (isHtmlResponse) {
              const errorHtml = pdfBuffer.toString('utf-8');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Buffer contains HTML, not PDF!');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: HTML content (first 2000 chars):', errorHtml.substring(0, 2000));
              
              // Try to extract error message from various HTML error page patterns
              const titleMatch = errorHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
              const h1Match = errorHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
              const errorMatch = errorHtml.match(/error[^>]*>([^<]+)/i);
              const messageMatch = errorHtml.match(/message[^>]*>([^<]+)/i);
              
              const errorMsg = 
                titleMatch?.[1]?.trim() || 
                h1Match?.[1]?.trim() || 
                errorMatch?.[1]?.trim() ||
                messageMatch?.[1]?.trim() ||
                'PDFShift returned HTML error page instead of PDF';
              
              // Store the HTML response for debugging
              pdfErrorDetails = {
                message: `PDFShift returned HTML instead of PDF: ${errorMsg}`,
                htmlResponse: errorHtml.substring(0, 5000), // More context for debugging
                fullHtmlLength: errorHtml.length,
                responseStatus: response.status,
                responseStatusText: response.statusText,
                contentType: contentType,
                pdfHeader: pdfHeader,
                firstBytes: firstBytes.substring(0, 200),
              };
              
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: PDFShift returned HTML error page');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error message:', errorMsg);
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Response status:', response.status);
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Content-Type:', contentType);
              
              // Don't throw - instead fall through to catch block which will use HTML fallback
              // But log this as a critical error
              throw new Error(`PDFShift returned HTML error page: ${errorMsg} (Status: ${response.status})`);
            }
            
            // Validate it's a PDF - check for PDF magic number
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: PDF header check:', pdfHeader, '(expected: %PDF)');
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: First 10 bytes (hex):', Array.from(pdfBuffer.slice(0, 10) as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join(' '));
            console.log('🚀🚀🚀 BOL EMAIL ROUTE: First 10 bytes (ascii):', pdfBuffer.toString('ascii', 0, 10));
            
            // PDF files start with %PDF- followed by version number (e.g., %PDF-1.4)
            const isPDFFile = pdfHeader === '%PDF';
            
            if (isPDFFile) {
              console.log('🚀🚀🚀 BOL EMAIL ROUTE: ✓ PDF validated successfully! Setting isPDF = true');
              console.log('🚀🚀🚀 BOL EMAIL ROUTE: PDF size:', pdfBuffer.length, 'bytes');
              console.log('🚀🚀🚀 BOL EMAIL ROUTE: PDF version:', pdfBuffer.toString('ascii', 0, 8));
              
              // Compress PDF before using it
              console.log('📦 Compressing single BOL PDF...');
              const compressedBuffer = await compressPDF(pdfBuffer);
              pdfBuffer = Buffer.from(compressedBuffer);
              
              isPDF = true;
              if (!filename) {
                filename = `BOL-${order.order_number}.pdf`;
              }
              console.log('🚀🚀🚀 BOL EMAIL ROUTE: Filename set to:', filename);
            } else {
              // This should never happen because we check for HTML above, but just in case
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: ✗ PDF validation failed!');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Expected header: %PDF');
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Actual header:', pdfHeader);
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: First 10 bytes (hex):', Array.from(pdfBuffer.slice(0, 10) as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join(' '));
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: First 200 bytes:', firstBytes);
              throw new Error(`PDFShift returned invalid PDF. Header: "${pdfHeader}" (expected: "%PDF")`);
            }
          } catch (pdfError) {
            const errorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);
            const errorStack = pdfError instanceof Error ? pdfError.stack : undefined;
            console.error('🚀🚀🚀 BOL EMAIL ROUTE: PDFShift failed with error:', errorMsg);
            if (errorStack) {
              console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error stack:', errorStack);
            }
            
            // Store error details for debugging
            pdfErrorDetails = {
              message: errorMsg,
              stack: errorStack,
              ...(pdfErrorDetails || {}), // Preserve any error details from earlier
            };
            
            // Log full error details
            console.error('🚀🚀🚀 BOL EMAIL ROUTE: PDF generation failed. Error details:', JSON.stringify(pdfErrorDetails, null, 2));
            console.error('🚀🚀🚀 BOL EMAIL ROUTE: This error will be returned to the user. HTML fallback disabled.');
            
            // Return error instead of falling back to HTML
            // The user expects PDF, and sending HTML causes confusion
            return NextResponse.json(
              {
                error: 'Failed to generate PDF',
                message: 'PDFShift API failed to generate PDF. Please check server logs for details.',
                details: {
                  error: errorMsg,
                  pdfErrorDetails: pdfErrorDetails,
                  suggestion: 'Check PDFShift API key, account status, and API logs. HTML fallback has been disabled to prevent confusion.',
                },
              },
              { status: 500 }
            );
          }
        } else {
          console.log('🚀 BOL EMAIL ROUTE: PDFSHIFT_API_KEY not configured, using HTML format');
          pdfBuffer = Buffer.from(bolHTML);
          isPDF = false;
          filename = `BOL-${order.order_number}.html`;
          console.log('🚀🚀🚀 BOL EMAIL ROUTE: Filename set to:', filename);
        }
    } else {
      console.log('🚀🚀🚀 BOL EMAIL ROUTE: BOL is not selected, skipping BOL generation');
    }
    }
    
    // Validate we have something to send
    if (!includeBOL && allDocuments.size === 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - No documents to send (includeBOL=false, allDocuments.size=0)');
      return NextResponse.json(
        { error: 'No documents selected to send. Please select at least one document (BOL or SDS).' },
        { status: 400 }
      );
    }
    
    // Generate email HTML (pass allDocuments so it can list SDS documents)
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Generating email HTML...');
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: includeBOL:', includeBOL);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: allDocuments.size:', allDocuments.size);
    
    let emailHTML: string;
    try {
      const bolCount = bolPDFs.length > 0 ? bolPDFs.length : (includeBOL && pdfBuffer ? 1 : 0);
      emailHTML = generateBOLEmailHTML({
        order,
        carrierName: carrierName || 'Carrier',
        storeInfo,
        sdsDocuments: allDocuments,
        includeBOL,
        bolCount,
      });
      console.log('🚀🚀🚀 BOL EMAIL ROUTE: Email HTML generated successfully, length:', emailHTML.length);
    } catch (htmlError) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR generating email HTML:', htmlError);
      return NextResponse.json(
        { 
          error: 'Failed to generate email content',
          message: htmlError instanceof Error ? htmlError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }

    // Send email with selected attachments
    console.log('🚀 BOL EMAIL ROUTE: Sending email via Resend...');
    console.log('🚀 BOL EMAIL ROUTE: Include BOL:', includeBOL);
    console.log('🚀 BOL EMAIL ROUTE: Include SDS count:', allDocuments.size);
    
    // Fetch and prepare SDS documents as attachments
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Collecting SDS documents for email attachments...');
    const sdsAttachments: Array<{ filename: string; content: string }> = [];
    
    // allDocuments Map contains SDS documents (name -> url)
    // Wrap in try-catch to prevent SDS fetching errors from breaking email sending
    try {
      for (const [docName, docUrl] of allDocuments.entries()) {
        try {
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Fetching SDS document: ${docName} from ${docUrl}`);
          
          if (!docUrl || typeof docUrl !== 'string') {
            console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Invalid URL for ${docName}: ${docUrl}`);
            continue;
          }
          
          let fileBuffer: Buffer;
          let contentType = 'application/pdf'; // Default to PDF
          
          // Handle proxy URLs - extract the actual URL from the proxy endpoint
          let actualUrl = docUrl;
          if (docUrl.includes('/api/images/proxy')) {
            try {
              // Handle both absolute and relative proxy URLs
              let urlObj: URL;
              if (docUrl.startsWith('http://') || docUrl.startsWith('https://')) {
                urlObj = new URL(docUrl);
              } else {
                // Relative URL - use a dummy base
                urlObj = new URL(docUrl, 'http://localhost');
              }
              const urlParam = urlObj.searchParams.get('url');
              if (urlParam) {
                actualUrl = decodeURIComponent(urlParam);
                console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Extracted actual URL from proxy: ${actualUrl}`);
              } else {
                console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: Proxy URL found but no 'url' parameter, using original: ${docUrl}`);
              }
            } catch (parseError) {
              console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to parse proxy URL, using original: ${docUrl}`, parseError);
            }
          }
          
          // Check if it's an S3 URL
          const s3Key = getKeyFromUrl(actualUrl);
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: URL: ${docUrl}`);
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Actual URL: ${actualUrl}`);
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Extracted S3 key: ${s3Key || 'null (not an S3 URL)'}`);
          
          if (s3Key) {
            // Fetch from S3
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Fetching from S3, key: ${s3Key}`);
            try {
              const s3File = await getFileFromS3(s3Key);
              if (!s3File) {
                console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to fetch ${docName} from S3 - file not found`);
                console.error(`🚀🚀🚀 BOL EMAIL ROUTE: S3 Key used: ${s3Key}`);
                console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Original URL: ${docUrl}`);
                // Try fetching as external URL as fallback
                console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Attempting to fetch as external URL as fallback...`);
                try {
                  const response = await fetch(actualUrl, {
                    method: 'GET',
                    headers: {
                      'User-Agent': 'Mozilla/5.0',
                    },
                  });
                  if (!response.ok) {
                    console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to fetch ${docName} as external URL: ${response.status} ${response.statusText}`);
                    continue;
                  }
                  const arrayBuffer = await response.arrayBuffer();
                  fileBuffer = Buffer.from(arrayBuffer);
                  contentType = response.headers.get('content-type') || 'application/pdf';
                  console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Successfully fetched ${docName} as external URL, size: ${fileBuffer.length} bytes`);
                } catch (fetchError) {
                  console.error(`🚀🚀🚀 BOL EMAIL ROUTE: External URL fetch also failed for ${docName}:`, fetchError);
                  continue;
                }
              } else {
                fileBuffer = s3File.buffer;
                contentType = s3File.contentType || 'application/pdf';
                console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Successfully fetched ${docName} from S3, size: ${fileBuffer.length} bytes`);
              }
            } catch (s3Error) {
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: S3 error fetching ${docName}:`, s3Error);
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: S3 Key that failed: ${s3Key}`);
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Original URL: ${docUrl}`);
              // Try fetching as external URL as fallback
              console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Attempting to fetch as external URL as fallback...`);
              try {
                const response = await fetch(docUrl, {
                  method: 'GET',
                  headers: {
                    'User-Agent': 'Mozilla/5.0',
                  },
                });
                if (!response.ok) {
                  console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to fetch ${docName} as external URL: ${response.status} ${response.statusText}`);
                  continue;
                }
                const arrayBuffer = await response.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
                contentType = response.headers.get('content-type') || 'application/pdf';
                console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Successfully fetched ${docName} as external URL (fallback), size: ${fileBuffer.length} bytes`);
              } catch (fetchError) {
                console.error(`🚀🚀🚀 BOL EMAIL ROUTE: External URL fetch also failed for ${docName}:`, fetchError);
                continue;
              }
            }
          } else {
            // Fetch from external URL
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Fetching from external URL: ${actualUrl}`);
            try {
              const response = await fetch(actualUrl, {
                method: 'GET',
                headers: {
                  'User-Agent': 'Mozilla/5.0',
                },
              });
              if (!response.ok) {
                console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to fetch ${docName}: ${response.status} ${response.statusText}`);
                continue;
              }
              const arrayBuffer = await response.arrayBuffer();
              fileBuffer = Buffer.from(arrayBuffer);
              contentType = response.headers.get('content-type') || 'application/pdf';
            } catch (fetchError) {
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Fetch error for ${docName}:`, fetchError);
              continue;
            }
          }
          
          // Validate buffer
          if (!fileBuffer || fileBuffer.length === 0) {
            console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Empty buffer for ${docName}`);
            continue;
          }
          
          // Determine filename - sanitize and ensure .pdf extension if it's a PDF
          let sdsFilename = docName || 'SDS-Document';
          const isPDF = contentType.includes('pdf') || fileBuffer.toString('ascii', 0, 4) === '%PDF';
          if (!sdsFilename.toLowerCase().endsWith('.pdf') && isPDF) {
            sdsFilename = `${sdsFilename}.pdf`;
          }
          // Sanitize filename
          sdsFilename = sdsFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
          
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Successfully fetched ${docName}, size: ${fileBuffer.length} bytes, type: ${contentType}`);
          
          // Skip compression for SDS documents - compression can cause issues with some PDF formats
          // SDS documents are typically already optimized, and compression with pdf-lib can corrupt them
          // BOL documents are generated fresh so compression works fine for them
          if (false && isPDF) { // Disabled compression for SDS
            console.log(`📦 Compressing SDS PDF: ${sdsFilename}...`);
            const compressedBuffer = await compressPDF(fileBuffer);
            fileBuffer = Buffer.from(compressedBuffer);
            console.log(`📦 Compressed ${sdsFilename}: ${fileBuffer.length} bytes`);
          }
          
          sdsAttachments.push({
            filename: sdsFilename,
            content: fileBuffer.toString('base64'),
          });
        } catch (error) {
          console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Error fetching SDS document ${docName}:`, error);
          // Continue with other documents even if one fails
        }
      }
    } catch (error) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error in SDS document collection loop:', error);
      // Continue with email sending even if SDS collection fails
    }
    
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Collected ${sdsAttachments.length} SDS document(s) for attachment`);
    
    // Log each SDS attachment that was collected
    sdsAttachments.forEach((sds, index) => {
      const size = Buffer.from(sds.content, 'base64').length;
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: SDS Attachment ${index + 1}: filename="${sds.filename}", size=${size} bytes`);
      if (!sds.filename || sds.filename.trim() === '') {
        console.error(`🚀🚀🚀 BOL EMAIL ROUTE: ERROR - SDS Attachment ${index + 1} has empty filename!`);
      }
      if (!sds.content || sds.content.length === 0) {
        console.error(`🚀🚀🚀 BOL EMAIL ROUTE: ERROR - SDS Attachment ${index + 1} has empty content!`);
      }
    });
    
    // Build attachments array: BOL first (if selected), then SDS documents
    const attachments: Array<{ filename: string; content: string }> = [];
    
    // Add BOL(s) if selected
    if (includeBOL) {
      if (bolPDFs.length > 0) {
        // Multiple warehouse BOLs - add each as separate attachment
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Adding ${bolPDFs.length} separate BOL PDF attachments...`);
        for (const bolPDF of bolPDFs) {
          attachments.push({
            filename: bolPDF.filename,
            content: bolPDF.buffer.toString('base64'),
          });
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Added BOL attachment: ${bolPDF.filename}, size: ${bolPDF.buffer.length} bytes`);
        }
      } else if (pdfBuffer && filename) {
        // Single BOL - add as single attachment
        // Validate filename is not empty
        if (!filename || filename.trim() === '') {
          console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - filename is empty!');
          filename = `BOL-${order.order_number}.${isPDF ? 'pdf' : 'html'}`;
          console.log('🚀🚀🚀 BOL EMAIL ROUTE: Using fallback filename:', filename);
        }
        
        attachments.push({
          filename,
          content: pdfBuffer.toString('base64'),
        });
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Added BOL attachment: ${filename}, size: ${pdfBuffer.length} bytes`);
      } else if (includeBOL && !pdfBuffer && bolPDFs.length === 0) {
        console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - includeBOL is true but no PDF buffer or PDFs array!');
      }
    }
    
    // Add selected SDS documents
    if (sdsAttachments.length > 0) {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Adding ${sdsAttachments.length} SDS attachment(s) to email`);
      sdsAttachments.forEach((sds, index) => {
        const size = Buffer.from(sds.content, 'base64').length;
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Adding SDS attachment ${index + 1}: "${sds.filename}" (${size} bytes)`);
        attachments.push({
          filename: sds.filename,
          content: sds.content,
        });
      });
    } else {
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: No SDS attachments to add (sdsAttachments.length = 0)`);
    }
    
    const bolCountForLogging = bolPDFs.length > 0 ? bolPDFs.length : (includeBOL && pdfBuffer ? 1 : 0);
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Total attachments: ${attachments.length} (${bolCountForLogging > 0 ? `${bolCountForLogging} BOL${bolCountForLogging > 1 ? 's' : ''} + ` : ''}${sdsAttachments.length} SDS)`);
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Final attachment list:`, attachments.map((a, idx) => `${idx + 1}. "${a.filename}" (${Buffer.from(a.content, 'base64').length} bytes)`));
    
    // Validate we have at least one attachment
    if (attachments.length === 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - No attachments to send!');
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: includeBOL:', includeBOL);
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: bolPDFs.length:', bolPDFs.length);
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: sdsAttachments.length:', sdsAttachments.length);
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: allDocuments.size:', allDocuments.size);
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: pdfBuffer exists:', !!pdfBuffer);
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: filename:', filename);
      return NextResponse.json(
        { 
          error: 'No documents selected to send. Please select at least one document (BOL or SDS).',
          debug: {
            includeBOL,
            sdsAttachmentsCount: sdsAttachments.length,
            allDocumentsCount: allDocuments.size,
            hasPdfBuffer: !!pdfBuffer,
          },
        },
        { status: 400 }
      );
    }
    
    // Validate all attachments have valid filenames
    const invalidAttachments = attachments.filter(a => !a.filename || a.filename.trim() === '');
    if (invalidAttachments.length > 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - Found attachments with empty filenames:', invalidAttachments.length);
      return NextResponse.json(
        { error: 'Invalid attachment: filename is required' },
        { status: 500 }
      );
    }
    
    // Validate all attachments have valid content
    const emptyAttachments = attachments.filter(a => !a.content || a.content.length === 0);
    if (emptyAttachments.length > 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - Found attachments with empty content:', emptyAttachments.length);
      return NextResponse.json(
        { error: 'Invalid attachment: content is required' },
        { status: 500 }
      );
    }
    
    // Verify allDocuments was populated
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: allDocuments Map size: ${allDocuments.size}`);
    if (allDocuments.size > 0) {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: allDocuments entries:`, Array.from(allDocuments.entries()));
    } else {
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: No SDS documents found in allDocuments Map!`);
      console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: Items count: ${items.length}`);
      items.forEach((item, idx) => {
        console.warn(`⚠️⚠️⚠️ BOL EMAIL ROUTE: Item ${idx + 1}: ${item.name}, productDocuments: ${JSON.stringify(item.productDocuments)}, attributes.documents: ${JSON.stringify(item.attributes?.documents)}`);
      });
    }
    
    // Determine email subject based on what's being sent
    const bolCountForEmail = bolPDFs.length > 0 ? bolPDFs.length : (includeBOL && pdfBuffer ? 1 : 0);
    const emailSubject = bolCountForEmail > 0 && allDocuments.size > 0
      ? bolCountForEmail > 1
        ? `Bills of Lading (${bolCountForEmail}) and Safety Data Sheets - Order ${order.order_number}`
        : `Bill of Lading and Safety Data Sheets - Order ${order.order_number}`
      : bolCountForEmail > 0
        ? bolCountForEmail > 1
          ? `Bills of Lading (${bolCountForEmail}) - Order ${order.order_number}`
          : `Bill of Lading - Order ${order.order_number}`
        : allDocuments.size > 0
          ? `Safety Data Sheets - Order ${order.order_number}`
          : `Order ${order.order_number} Documents`;
    
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Email subject:', emailSubject);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Email HTML length:', emailHTML.length);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Attachments count:', attachments.length);
    
    // Validate email fields before sending
    if (!FROM_EMAIL || !FROM_EMAIL.trim()) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - FROM_EMAIL is not set!');
      return NextResponse.json(
        { error: 'Email configuration error: FROM_EMAIL is not set' },
        { status: 500 }
      );
    }
    
    // emailList is already validated above, so we don't need to check email here
    // This check is redundant but kept for safety - emailList should never be empty at this point
    if (emailList.length === 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - Recipient email list is empty!');
      return NextResponse.json(
        { error: 'Recipient email address is required' },
        { status: 400 }
      );
    }
    
    if (!emailHTML || emailHTML.trim().length === 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - Email HTML is empty!');
      return NextResponse.json(
        { error: 'Email content is empty' },
        { status: 500 }
      );
    }
    
    // Validate attachments format
    const validAttachments = attachments.filter(a => {
      if (!a.filename || a.filename.trim() === '') {
        console.error('🚀🚀🚀 BOL EMAIL ROUTE: Invalid attachment - missing filename');
        return false;
      }
      if (!a.content || a.content.length === 0) {
        console.error('🚀🚀🚀 BOL EMAIL ROUTE: Invalid attachment - missing content:', a.filename);
        return false;
      }
      // Validate base64 content
      try {
        Buffer.from(a.content, 'base64');
      } catch {
        console.error('🚀🚀🚀 BOL EMAIL ROUTE: Invalid attachment - invalid base64:', a.filename);
        return false;
      }
      return true;
    });
    
    if (validAttachments.length !== attachments.length) {
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: ERROR - ${attachments.length - validAttachments.length} invalid attachment(s) removed`);
      return NextResponse.json(
        { 
          error: 'One or more attachments are invalid',
          details: {
            totalAttachments: attachments.length,
            validAttachments: validAttachments.length,
            invalidCount: attachments.length - validAttachments.length,
          },
        },
        { status: 500 }
      );
    }
    
    // Final check - ensure we have at least one valid attachment
    if (validAttachments.length === 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ERROR - No valid attachments after validation!');
      return NextResponse.json(
        { 
          error: 'No valid attachments to send. Please ensure at least one document (BOL or SDS) is selected and valid.',
          debug: {
            includeBOL,
            allDocumentsCount: allDocuments.size,
            originalAttachmentsCount: attachments.length,
          },
        },
        { status: 400 }
      );
    }
    
    // Log final request details
    console.log('\n🚀🚀🚀 ========================================');
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: FINAL REQUEST SUMMARY');
    console.log('🚀🚀🚀 ========================================');
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - From:', FROM_EMAIL);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - To:', emailList.length === 1 ? emailList[0] : `${emailList.length} recipients`);
    if (emailList.length > 1) {
      emailList.forEach((email, idx) => {
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   Recipient ${idx + 1}: ${email}`);
      });
    }
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - Subject:', emailSubject);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - HTML length:', emailHTML.length);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - Valid attachments:', validAttachments.length);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - includeBOL:', includeBOL);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - allDocuments.size:', allDocuments.size);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - sdsAttachments.length:', sdsAttachments.length);
    
    if (validAttachments.length > 0) {
      // Calculate total sizes
      const totalDecodedSize = validAttachments.reduce((sum, att) => {
        return sum + Buffer.from(att.content, 'base64').length;
      }, 0);
      const totalBase64Size = validAttachments.reduce((sum, att) => {
        return sum + att.content.length;
      }, 0);
      const totalRequestSize = emailHTML.length + totalBase64Size;
      
      console.log('🚀🚀🚀 BOL EMAIL ROUTE: Attachment details:');
      validAttachments.forEach((att, idx) => {
        const decodedSize = Buffer.from(att.content, 'base64').length;
        const base64Size = att.content.length;
        const sizeMB = (decodedSize / 1024 / 1024).toFixed(3);
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   ${idx + 1}. "${att.filename}"`);
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE:      Decoded: ${decodedSize.toLocaleString()} bytes (${sizeMB} MB)`);
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE:      Base64: ${base64Size.toLocaleString()} bytes`);
      });
      console.log('🚀🚀🚀 BOL EMAIL ROUTE: Total attachment sizes:');
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   Decoded: ${totalDecodedSize.toLocaleString()} bytes (${(totalDecodedSize / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   Base64: ${totalBase64Size.toLocaleString()} bytes (${(totalBase64Size / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   Email HTML: ${emailHTML.length.toLocaleString()} bytes (${(emailHTML.length / 1024).toFixed(2)} KB)`);
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   Total request size: ${totalRequestSize.toLocaleString()} bytes (${(totalRequestSize / 1024 / 1024).toFixed(2)} MB)`);
      
      // Log total size (will use attachments unless size exceeds 25MB)
      if (totalRequestSize > 1 * 1024 * 1024) { // 1 MB
        console.log('🚀🚀🚀 BOL EMAIL ROUTE: Total request size: ' + (totalRequestSize / 1024 / 1024).toFixed(2) + ' MB (will use attachments unless size exceeds 25MB)');
      }
    } else {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: ⚠️ WARNING - No valid attachments!');
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: This should have been caught by validation above.');
    }
    console.log('🚀🚀🚀 ========================================\n');
    
    // Double-check: If we have no attachments, don't send
    if (validAttachments.length === 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: CRITICAL ERROR - Attempting to send email with 0 attachments!');
      return NextResponse.json(
        { 
          error: 'No valid attachments to send',
          message: 'Cannot send email without attachments. Please ensure at least one document (BOL or SDS) is selected and valid.',
          debug: {
            includeBOL,
            allDocumentsCount: allDocuments.size,
            sdsAttachmentsCount: sdsAttachments.length,
            originalAttachmentsCount: attachments.length,
            validAttachmentsCount: validAttachments.length,
          },
        },
        { status: 400 }
      );
    }
    
    // Final validation before sending
    // Ensure we have at least one attachment (this should never fail due to validation above, but double-check)
    if (validAttachments.length === 0) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: CRITICAL - No valid attachments at final check!');
      return NextResponse.json(
        { 
          error: 'No valid attachments to send',
          message: 'Cannot send email without attachments. Please ensure at least one document (BOL or SDS) is selected and valid.',
        },
        { status: 400 }
      );
    }
    
    // Deduct inventory from all warehouses if we have warehouse allocations and include BOL
    let inventoryWarnings: string[] = [];
    if (includeBOL && warehouseAllocations && warehouseAllocations.length > 0) {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Deducting inventory from ${warehouseAllocations.length} warehouse(s)...`);
      const inventoryResult = await deductWarehouseInventory(warehouseAllocations);
      
      if (!inventoryResult.success) {
        console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to deduct inventory:`, inventoryResult.errors);
        return NextResponse.json(
          {
            error: 'Failed to deduct warehouse inventory',
            message: inventoryResult.errors.join(', '),
          },
          { status: 500 }
        );
      }
      
      // Log warnings if any (partial deductions, etc.) but continue with email sending
      if (inventoryResult.warnings && inventoryResult.warnings.length > 0) {
        console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: Inventory deduction warnings:`, inventoryResult.warnings);
        inventoryWarnings = inventoryResult.warnings;
        
        // Update order metadata to mark as partially fulfilled
        try {
          const currentMetadata = order.metadata 
            ? (typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata)
            : {};
          
          const updatedMetadata = {
            ...currentMetadata,
            partially_fulfilled: true,
            partial_fulfillment_date: new Date().toISOString(),
            partial_fulfillment_warnings: inventoryResult.warnings,
          };
          
          await queryOne(
            `UPDATE orders 
             SET metadata = $1, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(updatedMetadata), order.id]
          );
          
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Marked order ${order.id} as partially fulfilled in metadata`);
        } catch (metadataError) {
          console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to update order metadata:`, metadataError);
          // Continue even if metadata update fails
        }
      } else {
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Successfully deducted inventory from ${warehouseAllocations.length} warehouse(s)`);
      }
    }

    // Check if we should use S3 links instead of attachments (automatic fallback for large files)
    // Calculate total attachment size for S3 fallback decision
    validAttachments.reduce((sum, att) => {
      return sum + Buffer.from(att.content, 'base64').length;
    }, 0);
    const totalBase64Size = validAttachments.reduce((sum, att) => {
      return sum + att.content.length;
    }, 0);
    const totalRequestSize = emailHTML.length + totalBase64Size;
    
    // Use S3 links only if:
    // 1. Explicitly requested (useS3Links = true)
    // 2. Total size exceeds 20MB (approaching Resend's 25MB hard limit)
    // 
    // We default to sending PDFs as attachments for better user experience.
    // Only use S3 links for truly large files to avoid hitting Resend's limits.
    const RESEND_SIZE_LIMIT = 25 * 1024 * 1024; // 25MB (Resend's hard limit)
    const S3_LINK_THRESHOLD = 20 * 1024 * 1024; // 20MB (safety margin before 25MB limit)
    const shouldUseS3Links = 
      useS3Links === true || 
      totalRequestSize > S3_LINK_THRESHOLD;
    
    if (totalRequestSize > RESEND_SIZE_LIMIT && !useS3Links) {
      console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: ⚠️ Total size (${(totalRequestSize / 1024 / 1024).toFixed(2)} MB) exceeds Resend's 25MB limit. Automatically switching to S3 links.`);
    } else if (totalRequestSize > S3_LINK_THRESHOLD && !useS3Links) {
      console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: ⚠️ Total size (${(totalRequestSize / 1024 / 1024).toFixed(2)} MB) exceeds ${(S3_LINK_THRESHOLD / 1024 / 1024).toFixed(0)}MB threshold. Automatically switching to S3 links to stay under Resend's 25MB limit.`);
    } else {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Sending ${validAttachments.length} PDF attachment(s) (total size: ${(totalRequestSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    let finalAttachments = validAttachments;
    let finalEmailHTML = emailHTML;
    const s3DownloadLinks: Array<{ filename: string; url: string }> = [];
    
    if (shouldUseS3Links) {
      const reason = useS3Links === true ? 'explicitly requested' : 'size exceeds 25MB limit';
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Using S3 links instead of attachments (${reason}, size: ${(totalRequestSize / 1024 / 1024).toFixed(2)} MB)`);
      
      // Upload all attachments to S3
      for (const attachment of validAttachments) {
        try {
          const buffer = Buffer.from(attachment.content, 'base64');
          const timestamp = Date.now();
          const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const s3Key = `bol-email/${order.id}/${timestamp}-${sanitizedFilename}`;
          
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Uploading ${attachment.filename} to S3...`);
          const uploadResult = await uploadToS3(
            buffer,
            s3Key,
            'application/pdf',
            60 * 60 * 24 * 7 // 7 days expiry
          );
          
          if ('error' in uploadResult) {
            console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Failed to upload ${attachment.filename} to S3:`, uploadResult.error);
            // Fall back to attachment if S3 upload fails
            continue;
          }
          
          s3DownloadLinks.push({
            filename: attachment.filename,
            url: uploadResult.downloadUrl,
          });
          console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Successfully uploaded ${attachment.filename} to S3: ${uploadResult.key}`);
        } catch (uploadError) {
          console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Error uploading ${attachment.filename} to S3:`, uploadError);
          // Fall back to attachment if S3 upload fails
        }
      }
      
      // If we successfully uploaded some files to S3, update email HTML with download links
      if (s3DownloadLinks.length > 0) {
        const linksHTML = s3DownloadLinks.map(link => 
          `<li style="margin: 10px 0;"><a href="${link.url}" style="color: #059669; text-decoration: underline;">${link.filename}</a> (expires in 7 days)</li>`
        ).join('');
        
        const downloadSection = `
          <div style="background: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="color: #059669; margin-top: 0;">Download Documents</h3>
            <p style="margin-bottom: 10px;">Due to the size of the documents, please download them using the links below:</p>
            <ul style="list-style: none; padding-left: 0;">
              ${linksHTML}
            </ul>
            <p style="margin-top: 15px; font-size: 14px; color: #6b7280;"><em>Note: These links will expire in 7 days for security purposes.</em></p>
          </div>
        `;
        
        // Insert download section before closing body tag
        finalEmailHTML = emailHTML.replace('</body>', downloadSection + '</body>');
        
        // Remove uploaded attachments from the payload
        finalAttachments = validAttachments.filter(att => 
          !s3DownloadLinks.some(link => link.filename === att.filename)
        );
        
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: ${s3DownloadLinks.length} file(s) uploaded to S3, ${finalAttachments.length} file(s) remaining as attachments`);
      } else {
        console.warn('🚀🚀🚀 BOL EMAIL ROUTE: S3 upload failed for all files, falling back to attachments');
      }
    } else {
      console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Sending ${validAttachments.length} PDF attachment(s) with email (total size: ${(totalRequestSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Build Resend payload - ensure all required fields are present and valid
    const resendPayload: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      attachments: Array<{ filename: string; content: string }>;
    } = {
      from: FROM_EMAIL,
      to: emailList.length === 1 ? emailList[0] : emailList, // Single email as string, multiple as array
      subject: emailSubject,
      html: finalEmailHTML,
      attachments: finalAttachments, // Use filtered attachments (may be empty if all uploaded to S3)
    };
    
    // Validate payload before sending
    const toEmails = Array.isArray(resendPayload.to) ? resendPayload.to : [resendPayload.to];
    if (!resendPayload.from || toEmails.length === 0 || !resendPayload.subject || !resendPayload.html) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: Invalid payload:', {
        hasFrom: !!resendPayload.from,
        hasTo: toEmails.length > 0,
        toCount: toEmails.length,
        hasSubject: !!resendPayload.subject,
        hasHtml: !!resendPayload.html,
        attachmentsCount: resendPayload.attachments.length,
      });
      return NextResponse.json(
        { error: 'Invalid email payload - missing required fields' },
        { status: 500 }
      );
    }
    
    // Log the exact payload we're sending (without base64 content for brevity)
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: Resend payload summary:');
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - From:', resendPayload.from);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - To:', Array.isArray(resendPayload.to) ? `${resendPayload.to.length} recipients` : resendPayload.to);
    if (Array.isArray(resendPayload.to)) {
      resendPayload.to.forEach((email, idx) => {
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   Recipient ${idx + 1}: ${email}`);
      });
    }
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - Subject:', resendPayload.subject);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - HTML length:', resendPayload.html.length);
    console.log('🚀🚀🚀 BOL EMAIL ROUTE: - Attachments count:', resendPayload.attachments?.length || 0);
    if (resendPayload.attachments) {
      resendPayload.attachments.forEach((att: { filename?: string; content?: string; path?: string }, idx: number) => {
        const size = att.content ? Buffer.from(att.content, 'base64').length : 0;
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE:   Attachment ${idx + 1}: "${att.filename}" (${size} bytes)`);
      });
    }
    
    // Send emails - if multiple recipients, send individually to avoid potential issues
    let result: { data?: { id?: string }; error?: unknown } | undefined;
    const results: Array<{ email: string; success: boolean; messageId?: string; error?: string }> = [];
    
    try {
      const resend = getResendClient();
      
      // Use direct fetch for emails with large attachments (SDS documents)
      // The Resend SDK has issues with large payloads, so we use fetch for reliability
      const sendWithRetry = async (payload: Record<string, unknown>, maxRetries = 3, timeoutMs = 90000) => {
        // Calculate total attachment size to decide which method to use
        const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
        const _totalAttachmentSize = attachments.reduce((sum: number, att: unknown) => {
          try {
            if (typeof att === 'object' && att !== null && 'content' in att) {
              const content = (att as { content?: string }).content;
              return sum + (Buffer.from(content || '', 'base64').length || 0);
            }
            return sum;
          } catch {
            return sum;
          }
        }, 0);
        // Always use SDK - it handles large attachments better via FormData
        // Direct fetch with JSON.stringify() struggles with large payloads
        let lastError: unknown;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Resend API attempt ${attempt}/${maxRetries} (using SDK, attachment size: ${(_totalAttachmentSize / 1024).toFixed(2)} KB)...`);
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Resend API request timed out after ${timeoutMs / 1000} seconds`)), timeoutMs)
            );
            const sendPromise = resend.emails.send(payload as unknown as Parameters<typeof resend.emails.send>[0]);
            const result = await Promise.race([sendPromise, timeoutPromise]) as Record<string, unknown>;
            
            // Log the actual response structure for debugging
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Resend API attempt ${attempt} - checking result...`);
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Raw result:`, JSON.stringify(result, null, 2));
            
            // Check for error first - Resend SDK/API returns { error: {...} } on failure
            if (result?.error) {
              const resendError = result.error as { message?: string; name?: string };
              const errorMsg = resendError.message || resendError.name || 'Unknown Resend API error';
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Resend API returned error:`, result.error);
              throw new Error(errorMsg);
            }
            
            // API returns { data: { id: string } } on success
            const resultData = result?.data as { id?: string } | undefined;
            const resultId = result?.id as string | undefined;
            if (resultData?.id) {
              console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Resend API attempt ${attempt} succeeded with messageId: ${resultData.id}`);
              return { data: { id: resultData.id }, error: null };
            } else if (resultId) {
              // Sometimes API returns { id: string } directly
              console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Resend API attempt ${attempt} succeeded with messageId: ${resultId}`);
              return { data: { id: resultId }, error: null };
            } else {
              // Unexpected format - this shouldn't happen
              console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Unexpected API response format (no data.id and no error):`, result);
              throw new Error('Resend API returned unexpected response format');
            }
          } catch (error: unknown) {
            lastError = error;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isNetworkError =
              errorMessage.includes('Unable to fetch data') ||
              errorMessage.includes('request could not be resolved') ||
              errorMessage.includes('fetch failed') ||
              errorMessage.includes('timed out') ||
              (error instanceof Error && error.name && (error.name === 'FetchError' || error.name === 'AbortError' || error.name === 'TypeError')) ||
              (error as { isNetworkError?: boolean })?.isNetworkError === true;
            
            // Only retry on network errors, not on API errors (invalid key, domain, etc.)
            if (isNetworkError && attempt < maxRetries) {
              const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
              console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: Network error on attempt ${attempt}, retrying in ${delayMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            }
            
            // If it's not a network error or we've exhausted retries, throw
            throw error;
          }
        }
        
        // If we get here, all retries failed
        throw lastError;
      };
      
      if (emailList.length === 1) {
        // Single recipient - send directly
        console.log('🚀🚀🚀 BOL EMAIL ROUTE: Calling Resend API for single recipient...');
        console.log('🚀🚀🚀 BOL EMAIL ROUTE: Request timeout set to 90 seconds, max retries: 3');
        
        // Try sending with retry logic
        let lastResult: { data?: { id?: string }; error?: unknown } | undefined;
        let retryCount = 0;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            result = await sendWithRetry(resendPayload, 1, 90000); // Single attempt per call, retry handled externally, 90s timeout for multiple large attachments
            lastResult = result;
            
            // If we get here, the call succeeded
            // sendWithRetry returns { data, error: null } on success
            // Success, break out of retry loop
            break;
          } catch (error: unknown) {
            lastResult = { error };
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isNetworkError =
              errorMessage.includes('Unable to fetch data') ||
              errorMessage.includes('request could not be resolved') ||
              errorMessage.includes('Network error') ||
              (error as { isNetworkError?: boolean })?.isNetworkError === true;
            
            if (isNetworkError && attempt < maxRetries) {
              retryCount++;
              const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
              console.warn(`🚀🚀🚀 BOL EMAIL ROUTE: Network exception, retrying (${attempt}/${maxRetries}) in ${delayMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            }
            
            // Non-retryable error or max retries reached
            throw error;
          }
        }
        
        result = lastResult;
        console.log('🚀🚀🚀 BOL EMAIL ROUTE: Resend API call completed');
        console.log('🚀🚀🚀 BOL EMAIL ROUTE: Resend result:', {
          hasData: !!result?.data,
          messageId: result?.data?.id,
          retryCount,
        });
        results.push({
          email: emailList[0],
          success: true,
          messageId: result?.data?.id,
        });
      } else {
        // Multiple recipients - send individually to ensure reliability
        console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Sending to ${emailList.length} recipients individually...`);
        for (const recipientEmail of emailList) {
          try {
            const individualPayload = {
              ...resendPayload,
              to: recipientEmail, // Single email as string
            };
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Sending to ${recipientEmail}...`);
            const individualResult = await sendWithRetry(individualPayload);
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Resend result for ${recipientEmail}:`, {
              hasData: !!individualResult?.data,
              messageId: individualResult?.data?.id,
            });
            results.push({
              email: recipientEmail,
              success: true,
              messageId: individualResult?.data?.id,
            });
            console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Sent to ${recipientEmail}: SUCCESS`);
          } catch (individualError) {
            console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Error sending to ${recipientEmail}:`, individualError);
            results.push({
              email: recipientEmail,
              success: false,
              error: individualError instanceof Error ? individualError.message : String(individualError),
            });
          }
        }
        // Create a combined result for compatibility
        result = {
          data: { id: results.filter(r => r.success).map(r => r.messageId).filter(Boolean).join(',') },
          error: results.some(r => !r.success) ? { message: 'Some emails failed to send' } : undefined,
        };
      }
    } catch (resendError) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: Resend API exception:', resendError);
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: Exception type:', resendError instanceof Error ? resendError.constructor.name : typeof resendError);
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: Exception message:', resendError instanceof Error ? resendError.message : String(resendError));
      if (resendError instanceof Error && resendError.stack) {
        console.error('🚀🚀🚀 BOL EMAIL ROUTE: Exception stack:', resendError.stack);
      }
      
      // Detect network errors and other specific error types
      const errorMessage = resendError instanceof Error ? resendError.message : String(resendError);
      const errorObj = resendError instanceof Error ? resendError : null;
      const isNetworkError = 
        errorMessage.includes('Unable to fetch data') ||
        errorMessage.includes('request could not be resolved') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('network') ||
        errorMessage.includes('timed out') ||
        (errorObj && errorObj.name === 'FetchError') ||
        ((errorObj as { isNetworkError?: boolean })?.isNetworkError === true);
      
      // Check for API key or domain verification errors
      const isApiKeyError = 
        errorMessage.includes('API key') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('Invalid API key') ||
        (typeof resendError === 'object' && resendError && 'statusCode' in resendError && (resendError as { statusCode: number }).statusCode === 401);
      
      const isDomainError = 
        errorMessage.includes('domain') ||
        errorMessage.includes('Domain not verified') ||
        errorMessage.includes('sender domain');
      
      const totalSize = emailHTML.length + (resendPayload.attachments?.reduce((sum, att) => sum + att.content.length, 0) || 0);
      const isLikelySizeIssue = totalSize > 20 * 1024 * 1024; // 20MB (threshold for S3 link conversion)
      
      let suggestion = '';
      if (isApiKeyError) {
        suggestion = 'The Resend API key may be invalid or expired. Please verify RESEND_API_KEY in your environment variables and ensure it starts with "re_". Check your Resend dashboard at https://resend.com/api-keys.';
      } else if (isDomainError) {
        suggestion = 'The sender domain may not be verified in Resend. Please verify your domain in the Resend dashboard at https://resend.com/domains. Ensure EMAIL_FROM uses a verified domain.';
      } else if (isNetworkError && isLikelySizeIssue) {
        suggestion = 'This appears to be a network timeout likely caused by very large attachments (>20MB). If this persists, you can use S3 download links by setting useS3Links=true in the request.';
      } else if (isNetworkError) {
        suggestion = 'This appears to be a network connectivity issue with the email service. Please check your internet connection and try again. If the problem persists, verify your RESEND_API_KEY and check Resend service status.';
      } else if (isLikelySizeIssue) {
        suggestion = 'The attachments may be too large (>20MB). If this error persists, you can use S3 download links by setting useS3Links=true in the request.';
      } else {
        suggestion = 'Please check your Resend API key, domain verification, and network connection. Visit https://resend.com for more information.';
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to send email',
          message: errorMessage,
          details: process.env.NODE_ENV === 'development' ? {
            name: isNetworkError ? 'application_error' : (resendError instanceof Error ? resendError.constructor.name : typeof resendError),
            statusCode: null, // Network errors don't have HTTP status codes
            message: errorMessage,
            isNetworkError,
            isLikelySizeIssue,
            totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
            payloadSummary: {
              from: resendPayload.from,
              to: Array.isArray(resendPayload.to) ? `${resendPayload.to.length} recipients` : resendPayload.to,
              toCount: Array.isArray(resendPayload.to) ? resendPayload.to.length : 1,
              subject: resendPayload.subject,
              htmlLength: resendPayload.html.length,
              attachmentsCount: resendPayload.attachments?.length || 0,
            },
          } : {
            name: isNetworkError ? 'application_error' : 'unknown_error',
            statusCode: null,
            message: errorMessage,
          },
          suggestion,
        },
        { status: 500 }
      );
    }
    
    console.log(`🚀🚀🚀 BOL EMAIL ROUTE: Resend API response - Success: ${!result?.error}, Message ID: ${result?.data?.id}`);
    if (result?.error) {
      const errorObj = result.error as { name?: string; message?: string; statusCode?: number };
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Resend error object:`, JSON.stringify(result.error, null, 2));
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Resend error name:`, errorObj.name);
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Resend error message:`, errorObj.message);
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Resend error statusCode:`, errorObj.statusCode);
      
      // Check if it's a size-related error
      const totalAttachmentSize = validAttachments.reduce((sum, att) => {
        return sum + Buffer.from(att.content, 'base64').length;
      }, 0);
      const base64Size = validAttachments.reduce((sum, att) => {
        return sum + att.content.length;
      }, 0);
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Total attachment size (decoded): ${totalAttachmentSize} bytes (${(totalAttachmentSize / 1024 / 1024).toFixed(2)} MB)`);
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Total attachment size (base64): ${base64Size} bytes (${(base64Size / 1024 / 1024).toFixed(2)} MB)`);
      console.error(`🚀🚀🚀 BOL EMAIL ROUTE: Total request size (approx): ${emailHTML.length + base64Size} bytes (${((emailHTML.length + base64Size) / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    console.log('🚀 BOL EMAIL ROUTE: Email sent. Result:', result?.error ? 'ERROR' : 'SUCCESS');

    if (result?.error) {
      const resendErr = result.error as { message?: string; name?: string };
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error sending BOL email:', result.error);

      // Provide more helpful error message
      let errorMessage = 'Failed to send email';
      if (resendErr.message) {
        errorMessage = resendErr.message;
      } else if (resendErr.name) {
        errorMessage = `Resend API error: ${resendErr.name}`;
      }

      return NextResponse.json(
        {
          error: 'Failed to send email',
          message: errorMessage,
          details: result.error,
          suggestion: resendErr.message?.includes('Unable to fetch data')
            ? 'This error often indicates a network issue, request timeout, or the attachment may be too large. Try sending with a smaller attachment or check your network connection.'
            : undefined,
        },
        { status: 500 }
      );
    }

    const recipientCount = emailList.length;
    const successCount = results.length > 0 ? results.filter(r => r.success).length : (result?.error ? 0 : 1);
    const failedCount = recipientCount - successCount;
    
    // If some emails failed, return partial success
    if (failedCount > 0) {
      const failedEmails = results.filter(r => !r.success).map(r => ({ email: r.email, error: r.error }));
      return NextResponse.json({
        success: successCount > 0,
        messageId: results.filter(r => r.success).map(r => r.messageId).filter(Boolean).join(','),
        message: `Email sent to ${successCount} of ${recipientCount} recipient${recipientCount > 1 ? 's' : ''}. ${failedCount} failed.${inventoryWarnings.length > 0 ? ' (with inventory warnings)' : ''}`,
        recipientCount,
        successCount,
        failedCount,
        recipients: emailList,
        results: results,
        failedEmails: failedEmails,
        inventoryWarnings: inventoryWarnings.length > 0 ? inventoryWarnings : undefined,
        debug: {
          includeBOL,
          wasPDF: includeBOL ? isPDF : false,
          filename: includeBOL ? filename : 'N/A',
          bufferSize: includeBOL && pdfBuffer ? pdfBuffer.length : 0,
          pdfHeader: includeBOL && pdfBuffer ? (isPDF ? pdfBuffer.toString('ascii', 0, 4) : (pdfBuffer.length > 0 ? pdfBuffer.toString('ascii', 0, 4) : 'EMPTY')) : 'N/A',
          sdsCount: allDocuments.size,
          attachmentsCount: attachments.length,
        },
      }, { status: 200 }); // Use 200 instead of 207 to avoid response.ok issues
    }
    
    const response = NextResponse.json({
      success: true,
      messageId: result?.data?.id,
      message: `Email sent successfully to ${recipientCount} recipient${recipientCount > 1 ? 's' : ''}${inventoryWarnings.length > 0 ? ' (with inventory warnings)' : ''}`,
      recipientCount,
      successCount,
      recipients: emailList,
      results: results.length > 0 ? results : undefined,
      inventoryWarnings: inventoryWarnings.length > 0 ? inventoryWarnings : undefined,
      debug: {
        includeBOL,
        wasPDF: includeBOL ? isPDF : false,
        filename: includeBOL ? filename : 'N/A',
        bufferSize: includeBOL && pdfBuffer ? pdfBuffer.length : 0,
        pdfHeader: includeBOL && pdfBuffer ? (isPDF ? pdfBuffer.toString('ascii', 0, 4) : (pdfBuffer.length > 0 ? pdfBuffer.toString('ascii', 0, 4) : 'EMPTY')) : 'N/A',
        sdsCount: allDocuments.size,
        attachmentsCount: attachments.length,
      },
    });
    
    // Add debug header
    response.headers.set('X-BOL-Debug', JSON.stringify({
      wasPDF: includeBOL ? isPDF : false,
      filename: includeBOL ? filename : 'N/A',
    }));
    
    console.log('🚀 BOL EMAIL ROUTE: Response sent. Debug info:', {
      includeBOL,
      wasPDF: includeBOL ? isPDF : false,
      filename: includeBOL ? filename : 'N/A',
      bufferSize: includeBOL && pdfBuffer ? pdfBuffer.length : 0,
    });
    
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('🚀🚀🚀 BOL EMAIL ROUTE: ========================================');
    console.error('🚀🚀🚀 BOL EMAIL ROUTE: CRITICAL ERROR in route handler');
    console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error message:', errorMessage);
    if (errorStack) {
      console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error stack:', errorStack);
    }
    console.error('🚀🚀🚀 BOL EMAIL ROUTE: Error details:', error);
    console.error('🚀🚀🚀 BOL EMAIL ROUTE: ========================================');
    return NextResponse.json(
      { 
        error: 'Failed to send email',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? { stack: errorStack } : undefined,
      },
      { status: 500 }
    );
  }
}

interface BOLData {
  order: Order;
  items: OrderItem[];
  storeInfo: Awaited<ReturnType<typeof getStoreInfo>>;
  shippingAddress: Address;
  billingAddress: Address;
  warehouse: {
    id: string;
    name: string;
    address_street: string;
    address_city: string;
    address_state: string;
    address_zip: string;
    phone: string | null;
    email: string | null;
  } | null;
  shipmentNumber?: number;
  totalShipments?: number;
  nmfcNumber?: string; // Optional: warehouse-specific NMFC number
}

function generateBillOfLadingHTML(data: BOLData): string {
  const { order, items, storeInfo, shippingAddress, billingAddress, warehouse } = data;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  // Note: SDS documents are collected in the email route handler before calling this function
  // This function doesn't need to collect them again since they're not used in the BOL HTML

  // Get NMFC number and pallet count from order metadata or passed parameter
  // Use passed nmfcNumber if provided (for warehouse-specific), otherwise extract from metadata
  let nmfcNumberToUse = data.nmfcNumber || 'TBD'; // Use passed value or default
  let manualPalletCount: number | null = null;
  
  // If nmfcNumber wasn't passed, try to get from metadata
  if (!data.nmfcNumber && order.metadata) {
    const metadata = typeof order.metadata === 'string' 
      ? JSON.parse(order.metadata) 
      : order.metadata;
    // Legacy format: single NMFC number
    if (metadata.nmfcNumber) {
      nmfcNumberToUse = metadata.nmfcNumber;
    }
  }
  
  // Get pallet count from metadata
  if (order.metadata) {
    const metadata = typeof order.metadata === 'string' 
      ? JSON.parse(order.metadata) 
      : order.metadata;
    if (metadata.palletCount && typeof metadata.palletCount === 'number') {
      manualPalletCount = metadata.palletCount;
    }
  }

  // Calculate totals
  let totalPieces = 0;
  let totalShippingWeight = 0;
  const itemWeights: Array<{ weight: number; quantity: number }> = [];

  const itemsHTML = items
    .map(
      (item, index) => {
        const attrs = item.attributes || {};
        const specs = item.specifications || {};
        
        // Item number - use SKU if available, otherwise use item number
        const itemNumber = item.sku || `ITEM-${index + 1}`;
        
        // Package type - derive from container sizes or specifications
        const packageType = String(attrs.containerSizes || specs['Package Type'] || specs['Container Type'] || 'Box');
        
        // Weight - get from attributes first, then fall back to specifications
        const weightStr = attrs.weight || specs['Bag Weight'] || specs['Weight'] || specs['Package Weight'] || 'N/A';
        
        // Parse weight for calculation (extract numeric value)
        let weightValue = 0;
        if (weightStr !== 'N/A') {
          const weightMatch = weightStr.toString().match(/([\d.]+)/);
          if (weightMatch) {
            weightValue = parseFloat(weightMatch[1]);
          }
        }
        
        // Description - include SDS information, EPA establishment number, and DOT information
        const sdsInfo = attrs.sdsInformation || '';
        const epaEstablishment = attrs.epaRegistrationNumber || '';
        // DOT properties may exist on attributes but are not in the type definition
        const attrsAny = attrs as Record<string, unknown>;
        const dotRegulated = attrsAny.dotRegulated || '';
        const dotHazardClass = attrsAny.dotHazardClass || 'N/A';
        const dotUnNumber = attrsAny.dotUnNumber || 'N/A';
        const dotPackingGroup = attrsAny.dotPackingGroup || '';
        
        // Build description with proper formatting using line breaks
        let description = `<div style="line-height: 1.6;">`;
        description += `<strong>${item.name}</strong><br>`;
        
        if (sdsInfo) {
          description += `${sdsInfo}<br>`;
        }
        
        if (epaEstablishment && epaEstablishment !== 'N/A' && epaEstablishment !== 'Not Applicable') {
          description += `EPA Est. #${epaEstablishment}<br>`;
        }
        
        // Add DOT information - always include default format
        description += `<br>`;
        if (dotRegulated) {
          description += `${dotRegulated}<br>`;
        } else {
          description += `Not regulated by DOT<br>`;
        }
        description += `DOT HAZARD CLASS: ${dotHazardClass}<br>`;
        description += `UN NUMBER: ${dotUnNumber}<br>`;
        if (dotPackingGroup) {
          description += `DOT PACKING GROUP: ${dotPackingGroup}`;
        } else {
          description += `DOT PACKING GROUP: III`;
        }
        
        description += `</div>`;
        
        // Quantity - show number ordered and UOM separately
        const qtyNumber = item.quantity.toString();
        let qtyUOM = item.unit_of_measure || '';
        
        // Normalize UOM for 2x2.5 gal cases - should show "case" not "tote"
        // Check package type, product name, and description for 2x2.5 gal indicators
        const itemNameLower = item.name.toLowerCase();
        const packageTypeLower = packageType.toLowerCase();
        const is2x25GalCase = 
          packageTypeLower.includes('2x2.5') || 
          packageTypeLower.includes('2 x 2.5') || 
          packageTypeLower.includes('2x 2.5') ||
          (packageTypeLower.includes('case') && packageTypeLower.includes('2.5')) ||
          itemNameLower.includes('2x2.5') ||
          itemNameLower.includes('2 x 2.5') ||
          itemNameLower.includes('2x 2.5') ||
          (packageTypeLower === '2.5' && itemNameLower.includes('2x'));
        
        if (is2x25GalCase && (qtyUOM.toLowerCase().includes('tote') || qtyUOM.toLowerCase().includes('tank'))) {
          qtyUOM = 'case';
        }
        
        // Calculate net weight (weight per unit × quantity)
        const netWeight = weightValue > 0 ? weightValue * item.quantity : 0;
        const netWeightDisplay = netWeight > 0 ? `${netWeight.toFixed(2)} lbs` : 'N/A';
        
        // Accumulate totals
        totalPieces += item.quantity;
        if (weightValue > 0) {
          totalShippingWeight += netWeight;
          itemWeights.push({ weight: weightValue, quantity: item.quantity });
        }
        
        return `
    <tr>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${itemNumber}</td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${packageType}</td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${netWeightDisplay}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #e5e7eb; font-size: 11px;">
        <div>${qtyNumber}</div>
        ${qtyUOM ? `<div style="font-size: 10px; color: #6b7280;">${qtyUOM}</div>` : ''}
      </td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${description}</td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${nmfcNumberToUse}</td>
    </tr>
  `;
      }
    )
    .join('');

  // Calculate total pallets
  // First check if manual pallet count is set in order metadata
  let totalPallets: number;
  if (manualPalletCount !== null && manualPalletCount > 0) {
    totalPallets = manualPalletCount;
  } else {
    // Count the actual number of totes shipping out
    let totalTotes = 0;
    items.forEach((item) => {
      const unitOfMeasure = (item.unit_of_measure || '').toLowerCase();
      // Count items where unit of measure is "tote" (case-insensitive)
      if (unitOfMeasure.includes('tote')) {
        totalTotes += item.quantity;
      }
    });
    
    // Total pallets = total number of totes
    totalPallets = totalTotes > 0 ? totalTotes : 1;
  }

  // Generate additional documents section (now handled inline in the template)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bill of Lading - ${order.order_number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: #1f2937;
      background: #ffffff;
      padding: 40px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #059669;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .header .subtitle {
      font-size: 14px;
      color: #6b7280;
    }
    .company-info {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      gap: 30px;
    }
    .company-section {
      flex: 1;
    }
    .company-section h3 {
      font-size: 14px;
      font-weight: 600;
      color: #059669;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 2px solid #059669;
    }
    .company-section p {
      font-size: 13px;
      color: #374151;
      margin: 3px 0;
    }
    .logo-container {
      text-align: center;
      margin-bottom: 15px;
    }
    .logo-container img {
      max-height: 50px;
      width: auto;
    }
    .bol-info {
      background: #f9fafb;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 30px;
    }
    .bol-info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .bol-info-item {
      display: flex;
      flex-direction: column;
    }
    .bol-info-label {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .bol-info-value {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background: #f3f4f6;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #e5e7eb;
    }
    th:nth-child(4),
    td:nth-child(4) {
      text-align: center;
    }
    td {
      padding: 10px;
      border: 1px solid #e5e7eb;
      font-size: 13px;
    }
    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
      padding-top: 30px;
      border-top: 2px solid #e5e7eb;
    }
    .signature-box {
      border: 1px solid #d1d5db;
      padding: 20px;
      min-height: 100px;
    }
    .signature-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 40px;
    }
    .signature-line {
      border-top: 1px solid #9ca3af;
      margin-top: 10px;
      padding-top: 5px;
      font-size: 11px;
      color: #6b7280;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-container">
        <a href="https://innovativecropcare.com">
          <img src="https://innovativecropcare.com/logo.png" alt="${storeInfo.store_name} Logo" />
        </a>
      </div>
      <h1>BILL OF LADING</h1>
      <p class="subtitle">Original - Not Negotiable</p>
    </div>

    <div class="bol-info">
      <div class="bol-info-grid">
        <div class="bol-info-item">
          <span class="bol-info-label">BOL Number</span>
          <span class="bol-info-value">BOL-${order.order_number}</span>
        </div>
        <div class="bol-info-item">
          <span class="bol-info-label">Order Number</span>
          <span class="bol-info-value">${order.order_number}</span>
        </div>
        <div class="bol-info-item">
          <span class="bol-info-label">Date</span>
          <span class="bol-info-value">${formatDate(order.created_at)}</span>
        </div>
        <div class="bol-info-item">
          <span class="bol-info-label">Delivery Method</span>
          <span class="bol-info-value">${order.delivery_method}</span>
        </div>
      </div>
    </div>

    <div class="company-info">
      <div class="company-section">
        <h3>Ship From</h3>
        <p><strong>Innovative CropCare, LLC</strong></p>
        ${warehouse ? `<p>C/O: ${warehouse.name}</p>` : ''}
        <p>${warehouse ? warehouse.address_street : '181 Cedar Ridge Rd.'}</p>
        <p>${warehouse ? `${warehouse.address_city}, ${warehouse.address_state} ${warehouse.address_zip}` : 'Tifton, Ga. 31794'}</p>
        <p>${warehouse && warehouse.phone ? warehouse.phone : '(229) 326-5408'}</p>
      </div>
      <div class="company-section">
        <h3>Ship To</h3>
        <p><strong>${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}</strong></p>
        <p>${shippingAddress.line1}</p>
        ${shippingAddress.line2 ? `<p>${shippingAddress.line2}</p>` : ''}
        <p>${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zipCode}</p>
        ${shippingAddress.phone ? `<p>Phone: ${shippingAddress.phone}</p>` : ''}
        ${shippingAddress.email ? `<p>Email: ${shippingAddress.email}</p>` : ''}
      </div>
    </div>

    <div class="company-info" style="margin-top: 20px;">
      <div class="company-section">
        <h3>Bill To</h3>
        <p><strong>${billingAddress.firstName || ''} ${billingAddress.lastName || ''}</strong></p>
        <p>${billingAddress.line1 || ''}</p>
        ${billingAddress.line2 ? `<p>${billingAddress.line2}</p>` : ''}
        <p>${billingAddress.city || ''}, ${billingAddress.state || ''} ${billingAddress.zipCode || ''}</p>
        ${billingAddress.phone ? `<p>Phone: ${billingAddress.phone}</p>` : ''}
        ${billingAddress.email ? `<p>Email: ${billingAddress.email}</p>` : ''}
      </div>
      <div class="company-section">
        <!-- Empty section for layout balance -->
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item Number</th>
          <th>Package Type</th>
          <th>Weight</th>
          <th>Qty</th>
          <th>Description</th>
          <th>NMFC Number</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>

    <div style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
      <h3 style="font-size: 14px; font-weight: 600; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 2px solid #059669;">
        Shipping Summary
      </h3>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
        <div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">
            Total Pieces
          </div>
          <div style="font-size: 18px; font-weight: 600; color: #1f2937;">
            ${totalPieces}
          </div>
        </div>
        <div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">
            Total Pallets
          </div>
          <div style="font-size: 18px; font-weight: 600; color: #1f2937;">
            ${totalPallets}
          </div>
        </div>
        <div>
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">
            Total Shipping Weight
          </div>
          <div style="font-size: 18px; font-weight: 600; color: #1f2937;">
            ${totalShippingWeight > 0 ? `${totalShippingWeight.toFixed(2)} lbs` : 'N/A'}
          </div>
        </div>
      </div>
    </div>


    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-label">Shipper Signature</div>
        <div class="signature-line">Name: _________________________</div>
        <div class="signature-line">Date: _________________________</div>
      </div>
      <div class="signature-box">
        <div class="signature-label">Carrier Signature</div>
        <div class="signature-line">Name: _________________________</div>
        <div class="signature-line">Date: _________________________</div>
      </div>
    </div>

    <div class="footer">
      <p><strong>Important:</strong> This Bill of Lading must be signed by both shipper and carrier.</p>
      <p>For questions, contact ${storeInfo.support_email} or call ${storeInfo.phone}</p>
    </div>
  </div>
</body>
</html>`;
}

interface BOLEmailData {
  order: Order;
  carrierName: string;
  storeInfo: Awaited<ReturnType<typeof getStoreInfo>>;
  sdsDocuments?: Map<string, string>; // SDS documents (name -> url)
  includeBOL?: boolean; // Whether BOL is included
  bolCount?: number; // Number of BOL PDFs (for multiple warehouses)
}

function generateBOLEmailHTML(data: BOLEmailData): string {
  const { order, carrierName, storeInfo, sdsDocuments = new Map(), includeBOL = true, bolCount = 1 } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <a href="https://innovativecropcare.com">
      <img src="https://innovativecropcare.com/logo.png" alt="${storeInfo.store_name} Logo" style="max-height: 50px; width: auto;">
    </a>
  </div>
  
  <h1 style="color: #059669; font-size: 24px; margin-bottom: 20px;">${includeBOL ? 'Bill of Lading' : 'Safety Data Sheets'} - Order ${order.order_number}</h1>
  
  <p style="margin-bottom: 15px;">Dear ${carrierName},</p>
  
  <p style="margin-bottom: 15px;">
    ${includeBOL 
      ? 'Please find attached the Bill of Lading for Order #' + order.order_number + '.'
      : sdsDocuments.size > 0
        ? 'Please find attached the Safety Data Sheets (SDS) for Order #' + order.order_number + '.'
        : 'Please review the order details for Order #' + order.order_number + '.'}
  </p>
  
  <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.order_number}</p>
    <p style="margin: 5px 0;"><strong>Delivery Method:</strong> ${order.delivery_method}</p>
    <p style="margin: 5px 0;"><strong>Total Value:</strong> $${parseFloat(order.total || '0').toFixed(2)}</p>
  </div>
  
  <p style="margin-top: 20px; margin-bottom: 15px;">
    ${includeBOL && sdsDocuments.size > 0 
      ? bolCount > 1
        ? 'The ' + bolCount + ' Bills of Lading documents and selected Safety Data Sheets (SDS) are attached to this email. Please review all EPA information, container sizes, and SDS documents before shipping.'
        : 'The Bill of Lading document and selected Safety Data Sheets (SDS) are attached to this email. Please review all EPA information, container sizes, and SDS documents before shipping.'
      : includeBOL 
        ? bolCount > 1
          ? 'The ' + bolCount + ' Bills of Lading documents are attached to this email. Each BOL corresponds to a different warehouse shipment. Please review all EPA information and container sizes before shipping.'
          : 'The Bill of Lading document is attached to this email. Please review all EPA information and container sizes before shipping.'
        : sdsDocuments.size > 0
          ? 'The selected Safety Data Sheets (SDS) are attached to this email. Please review all SDS documents before shipping.'
          : 'Please review the order details below.'}
  </p>
  
  ${(includeBOL || sdsDocuments.size > 0) ? `
  <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; font-weight: 600; color: #1e40af; margin-bottom: 10px;">📎 Attached Documents:</p>
    <ul style="margin: 0; padding-left: 20px; color: #1e40af;">
      ${includeBOL ? (bolCount > 1 ? '<li>' + String(bolCount) + ' Bills of Lading (PDF)</li>' : '<li>Bill of Lading (PDF)</li>') : ''}
      ${Array.from(sdsDocuments.keys()).map((name: string) => '<li>' + name + '</li>').join('')}
    </ul>
  </div>
  ` : ''}
  
  <p style="margin-top: 20px; margin-bottom: 15px;">
    If you have any questions, please contact us at ${storeInfo.support_email} or ${storeInfo.phone}.
  </p>
  
  <p style="margin-top: 30px;">
    Best regards,<br>
    <strong>${storeInfo.store_name}</strong>
  </p>
</body>
</html>
  `;
}
