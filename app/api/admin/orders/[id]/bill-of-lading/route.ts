import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { getStoreInfo } from '@/lib/store-info';
import { type WarehouseAllocation } from '@/lib/warehouse-allocation';
import { type ProductAttributes } from '@/lib/products';
import { generatePDFWithPDFShift } from '@/lib/pdf-generation';

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
  address1?: string;
  address2?: string;
  zip?: string;
  street?: string;
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
  nmfc_number?: string | null;
  freight_class?: string | null;
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

// GET /api/admin/orders/[id]/bill-of-lading?download=true
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin('orders.view');
  if (auth.error) return auth.error;

  const { id: orderId } = await params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get('download') === 'true'; // If true, generate PDF for download
  console.log('🔍 BOL: Request received, orderId:', orderId, 'download param:', searchParams.get('download'), 'download flag:', download);

  try {
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
      nmfc_number: string | null;
      freight_class: string | null;
      freight_class_ai_suggestion: string | null;
      specifications: unknown;
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
        p.nmfc_number,
        p.freight_class,
        p.freight_class_ai_suggestion,
        p.specifications
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id AND p.deleted_at IS NULL
       WHERE oi.order_id = $1
       ORDER BY oi.name`,
      [orderId]
    );

    let items: OrderItem[] = itemsData.map((item) => {
      // Parse product-level documents (Features & Docs) if it's a string
      let productDocuments = item.documents;
      if (typeof productDocuments === 'string') {
        try {
          productDocuments = JSON.parse(productDocuments);
        } catch {
          productDocuments = [];
        }
      }
      // Ensure productDocuments is always an array
      if (!Array.isArray(productDocuments)) {
        productDocuments = [];
      }
      
      // Parse attributes documents if it's a string
      let attrs: ProductAttributes = (item.attributes || {}) as ProductAttributes;
      if (typeof attrs === 'string') {
        try {
          attrs = JSON.parse(attrs) as ProductAttributes;
        } catch {
          attrs = {} as ProductAttributes;
        }
      }
      // Ensure attrs.documents is always an array if it exists
      // Note: documents is not in ProductAttributes type but may exist in actual data
      if (attrs && typeof attrs === 'object' && 'documents' in attrs && !Array.isArray((attrs as Record<string, unknown>).documents)) {
        (attrs as Record<string, unknown>).documents = [];
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
        nmfc_number: item.nmfc_number,
        freight_class: item.freight_class ?? item.freight_class_ai_suggestion,
        specifications: (specifications || {}) as Record<string, unknown>,
        productDocuments: (Array.isArray(productDocuments) ? productDocuments : []) as Array<{ name: string; url: string }>,
        attributes: (attrs || {}) as ProductAttributes,
      };
    });

    // Get store info
    const storeInfo = await getStoreInfo();
    if (!storeInfo) {
      console.error('❌ BOL: Store info not found');
      return NextResponse.json(
        { error: 'Store information not available' },
        { status: 500 }
      );
    }

    // Parse addresses with error handling
    let shippingAddress: Address;
    let billingAddress: Address;
    try {
      shippingAddress = typeof order.shipping_address === 'string'
        ? JSON.parse(order.shipping_address)
        : order.shipping_address;
      billingAddress = typeof order.billing_address === 'string'
        ? JSON.parse(order.billing_address)
        : order.billing_address;
      
      if (!shippingAddress || !billingAddress) {
        throw new Error('Missing shipping or billing address');
      }
    } catch (parseError) {
      console.error('❌ BOL: Error parsing addresses:', parseError);
      return NextResponse.json(
        { error: 'Invalid address data' },
        { status: 400 }
      );
    }

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

    // If we have multiple warehouse allocations, generate separate BOLs
    if (warehouseAllocations && warehouseAllocations.length > 1) {
      const bols: string[] = [];
      
      for (let i = 0; i < warehouseAllocations.length; i++) {
        const allocation = warehouseAllocations[i];
          
        // Get warehouse details
        const warehouse = await queryOne<{
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

        if (!warehouse) {
          console.error(`❌ BOL: Warehouse not found for allocation ${i + 1}, warehouse_id: ${allocation.warehouse_id}`);
          return NextResponse.json(
            { error: `Warehouse not found for allocation ${i + 1}` },
            { status: 404 }
          );
        }

        // Filter items for this warehouse - only include items that have allocations for this warehouse
        // Use allocation quantity if available, otherwise use original order quantity
        const warehouseItems = items
          .filter(item => 
            allocation.items.some(allocItem => allocItem.product_id === item.product_id && allocItem.quantity > 0)
          )
          .map(item => {
            const allocItem = allocation.items.find(ai => ai.product_id === item.product_id);
            // Use allocation quantity (which represents what's being shipped from this warehouse)
            // If no allocation found, skip this item (shouldn't happen due to filter, but safety check)
            return {
              ...item,
              quantity: allocItem?.quantity || 0,
            };
          })
          .filter(item => item.quantity > 0); // Only include items with quantity > 0

        // Get NMFC number for this warehouse (use index to match with nmfcInfo array)
        let warehouseNmfcNumber = 'TBD';
        if (nmfcInfo && nmfcInfo.length > i) {
          const nmfcEntry = nmfcInfo[i];
          warehouseNmfcNumber = nmfcEntry.shippingType === 'TL' ? 'TL' : (nmfcEntry.number || 'TBD');
        } else if (nmfcNumber) {
          // Fallback to legacy single NMFC number
          warehouseNmfcNumber = nmfcNumber;
        }

        // Generate BOL for this warehouse
        const bolHtml = generateBillOfLadingHTML({
          order: {
            ...order,
            order_number: `${order.order_number}-W${i + 1}`, // Add warehouse suffix
          },
          items: warehouseItems,
          storeInfo,
          shippingAddress,
          billingAddress,
          warehouse: warehouse || null,
          nmfcNumber: warehouseNmfcNumber, // Pass warehouse-specific NMFC number
        });

        bols.push(bolHtml);
      }

      // Combine all BOLs with page breaks
      const combinedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Bill of Lading - ${order.order_number}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            }
            .bol-page {
              page-break-after: always;
              page-break-inside: avoid;
              min-height: 100vh;
              margin-bottom: 0;
            }
            .bol-page:first-child {
              page-break-before: auto;
            }
            .bol-page:not(:first-child) {
              page-break-before: always;
            }
            .bol-page:last-child {
              page-break-after: auto;
            }
            @media print {
              .bol-page {
                page-break-after: always;
                page-break-inside: avoid;
              }
              .bol-page:first-child {
                page-break-before: auto;
              }
              .bol-page:not(:first-child) {
                page-break-before: always;
              }
              .bol-page:last-child {
                page-break-after: auto;
              }
            }
          </style>
        </head>
        <body>
          ${bols.map((bol, index) => `
            <div class="bol-page">
              <h2 style="text-align: center; margin-bottom: 20px; font-size: 18px; font-weight: 600; color: #1f2937;">Shipment ${index + 1} of ${bols.length}</h2>
              ${bol}
            </div>
          `).join('')}
        </body>
        </html>
      `;

      // If download=true, generate PDF using PDFShift
      if (download) {
        console.log('🔍 BOL: Generating PDF for multiple warehouses, order:', order.order_number);
        try {
          console.log('🔍 BOL: Combined HTML length:', combinedHtml.length, 'characters');
          const pdfBuffer = await generatePDFWithPDFShift(combinedHtml);
          console.log('🔍 BOL: PDF generated successfully for multiple warehouses, size:', pdfBuffer.length, 'bytes');
          const filename = `BOL-${order.order_number}-MULTI.pdf`;
          
          return new NextResponse(new Uint8Array(pdfBuffer), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'private, no-cache',
            },
          });
        } catch (pdfError) {
          console.error('❌ BOL: Error generating PDF with PDFShift for multiple warehouses:', pdfError);
          console.error('❌ BOL: PDF error details:', pdfError instanceof Error ? pdfError.message : String(pdfError));
          // Fallback to HTML if PDF generation fails
          const filename = `BOL-${order.order_number}-MULTI.html`;
          return new NextResponse(combinedHtml, {
            headers: {
              'Content-Type': 'text/html',
              'Content-Disposition': `attachment; filename="${filename}"`,
            },
          });
        }
      } else {
        // Return HTML for viewing in browser
        const filename = `BOL-${order.order_number}-MULTI.html`;
        return new NextResponse(combinedHtml, {
          headers: {
            'Content-Type': 'text/html',
            'Content-Disposition': `inline; filename="${filename}"`,
          },
        });
      }
    }

    // Single warehouse or no allocation - generate single BOL
    // Fetch warehouse details if warehouse_id is set
    let warehouse = null;
    if (order.warehouse_id) {
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
    } else if (warehouseAllocations && warehouseAllocations.length === 1) {
      // Single warehouse allocation
      const allocation = warehouseAllocations[0];
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
        [allocation.warehouse_id]
      );

      if (!warehouse) {
        console.error(`❌ BOL: Warehouse not found for single allocation, warehouse_id: ${allocation.warehouse_id}`);
        return NextResponse.json(
          { error: 'Warehouse not found' },
          { status: 404 }
        );
      }

      // Filter items for this warehouse - use allocation quantities
      const filteredItems = items
        .filter(item => 
          allocation.items.some(allocItem => allocItem.product_id === item.product_id && allocItem.quantity > 0)
        )
        .map(item => {
          const allocItem = allocation.items.find(ai => ai.product_id === item.product_id);
          // Use allocation quantity (which represents what's being shipped from this warehouse)
          return {
            ...item,
            quantity: allocItem?.quantity || 0,
          };
        })
        .filter(item => item.quantity > 0); // Only include items with quantity > 0
      
      // If filtered items result in empty array or zero total quantity, use original items
      // This handles cases where allocations might not be set up correctly
      const totalFilteredQuantity = filteredItems.reduce((sum, item) => sum + item.quantity, 0);
      if (filteredItems.length > 0 && totalFilteredQuantity > 0) {
        items = filteredItems;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[BOL] Using warehouse allocation quantities: ${filteredItems.length} items, total quantity: ${totalFilteredQuantity}`);
        }
      } else {
        // Fallback to original items if allocations result in empty/zero quantities
        console.warn(`[BOL] Warehouse allocation resulted in empty items or zero quantities for order ${order.order_number}. Using original order items.`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[BOL] Original items count: ${items.length}, total quantity: ${items.reduce((sum, item) => sum + item.quantity, 0)}`);
        }
      }
    }
    
    // Ensure we have items before generating BOL
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'No items found for this order' },
        { status: 400 }
      );
    }

    // Generate HTML Bill of Lading
    const html = generateBillOfLadingHTML({
      order,
      items,
      storeInfo,
      shippingAddress,
      billingAddress,
      warehouse,
    });

    // If download=true, generate PDF using PDFShift
    if (download) {
      console.log('🔍 BOL: Generating PDF for download, order:', order.order_number);
      try {
        console.log('🔍 BOL: HTML length:', html.length, 'characters');
        const pdfBuffer = await generatePDFWithPDFShift(html);
        console.log('🔍 BOL: PDF generated successfully, size:', pdfBuffer.length, 'bytes');
        const filename = `BOL-${order.order_number}.pdf`;
        
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'private, no-cache',
          },
        });
      } catch (pdfError) {
        console.error('❌ BOL: Error generating PDF with PDFShift:', pdfError);
        console.error('❌ BOL: PDF error details:', pdfError instanceof Error ? pdfError.message : String(pdfError));
        // Fallback to HTML if PDF generation fails
        const filename = `BOL-${order.order_number}.html`;
        return new NextResponse(html, {
          headers: {
            'Content-Type': 'text/html',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
    } else {
      console.log('🔍 BOL: Returning HTML for viewing, order:', order.order_number);
      // Return HTML for viewing in browser
      const filename = `BOL-${order.order_number}.html`;
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `inline; filename="${filename}"`,
        },
      });
    }
  } catch (error) {
    console.error('❌ BOL: Error generating bill of lading:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('❌ BOL: Error details:', {
      message: errorMessage,
      stack: errorStack,
      orderId,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return NextResponse.json(
      { 
        error: 'Failed to generate bill of lading',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
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
  nmfcNumber?: string; // Optional: warehouse-specific NMFC number
}

function generateBillOfLadingHTML(data: BOLData): string {
  const { order, items, storeInfo, shippingAddress, warehouse } = data;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  // Collect only SDS documents from all items (from Features & Docs and attributes)
  const allDocuments = new Map<string, string>();
  items.forEach((item) => {
    // Check product-level documents (Features & Docs)
    // Ensure productDocuments is always an array
    const productDocs = Array.isArray(item.productDocuments) ? item.productDocuments : [];
    productDocs.forEach((doc: unknown) => {
      if (typeof doc !== 'object' || doc === null) return;
      const docObj = doc as { name?: string; url?: string };
      // Only include SDS (Safety Data Sheet) documents
      if (docObj.name && docObj.url) {
        const docNameLower = docObj.name.toLowerCase();
        const docUrlLower = docObj.url.toLowerCase();
        if (
          docNameLower.includes('sds') ||
          docNameLower.includes('safety data sheet') ||
          docNameLower.includes('safety datasheet') ||
          docUrlLower.includes('sds')
        ) {
          allDocuments.set(docObj.name, docObj.url);
        }
      }
    });
    
    // Also check attributes documents (for backward compatibility)
    const attrs = item.attributes || {};
    // Ensure attrDocuments is always an array
    // Note: documents is not in ProductAttributes type but may exist in actual data
    const attrDocuments: unknown[] = (attrs && typeof attrs === 'object' && 'documents' in attrs && Array.isArray((attrs as Record<string, unknown>).documents))
      ? (attrs as Record<string, unknown>).documents as unknown[]
      : [];
    attrDocuments.forEach((doc: unknown) => {
      if (typeof doc !== 'object' || doc === null) return;
      const docObj = doc as { name?: string; url?: string };
      // Only include SDS (Safety Data Sheet) documents
      if (docObj.name && docObj.url) {
        const docNameLower = docObj.name.toLowerCase();
        const docUrlLower = docObj.url.toLowerCase();
        if (
          docNameLower.includes('sds') ||
          docNameLower.includes('safety data sheet') ||
          docNameLower.includes('safety datasheet') ||
          docUrlLower.includes('sds')
        ) {
          allDocuments.set(docObj.name, docObj.url);
        }
      }
    });
  });

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

  // Calculate totals - ensure we're using the actual items passed to this function
  let totalPieces = 0;
  let totalShippingWeight = 0;
  const itemWeights: Array<{ weight: number; quantity: number }> = [];

  // Debug: Log items being processed
  if (process.env.NODE_ENV === 'development') {
    console.log(`[BOL] Processing ${items.length} items for order ${order.order_number}`);
    items.forEach((item, idx) => {
      console.log(`[BOL] Item ${idx + 1}: ${item.name}, quantity: ${item.quantity}, unit_of_measure: ${item.unit_of_measure}`);
    });
  }

  const itemsHTML = items
    .map(
      (item, index) => {
        const attrs = (item.attributes || {}) as ProductAttributes;
        const specs = (item.specifications || {}) as Record<string, string>;

        // Item number - use SKU if available, otherwise use item number
        const itemNumber = item.sku || `ITEM-${index + 1}`;

        // Package type - derive from container sizes or specifications
        const packageType = attrs.containerSizes || specs['Package Type'] || specs['Container Type'] || 'Box';
        
        // Weight - get from attributes first, then fall back to specifications
        // Check multiple possible locations for weight data
        const weightStr = attrs.weight || 
                         specs['Bag Weight'] || 
                         specs['Weight'] || 
                         specs['Package Weight'] ||
                         specs['Net Weight'] ||
                         specs['Shipping Weight'] ||
                         specs['Gross Weight'] ||
                         'N/A';
        
        // Parse weight for calculation (extract numeric value)
        let weightValue = 0;
        if (weightStr !== 'N/A' && weightStr !== '' && weightStr !== null && weightStr !== undefined) {
          // If weightStr is already a number, parse it directly
          const numericWeight = parseFloat(weightStr.toString().replace(/[^0-9.]/g, ''));
          if (!isNaN(numericWeight) && numericWeight > 0) {
            weightValue = numericWeight;
          } else {
            // Try to extract number from string (e.g., "2650 lbs" -> 2650, "50.5" -> 50.5)
            const weightMatch = weightStr.toString().match(/([\d.]+)/);
            if (weightMatch) {
              const extractedWeight = parseFloat(weightMatch[1]);
              if (!isNaN(extractedWeight) && extractedWeight > 0) {
                weightValue = extractedWeight;
              }
            }
          }
        }
        
        // Debug: Log weight parsing issues
        if (process.env.NODE_ENV === 'development' && weightValue === 0 && item.quantity > 0) {
          console.log(`[BOL] Weight parsing failed for item: ${item.name}, weightStr: ${weightStr}, attrs.weight: ${attrs.weight}, specs keys:`, Object.keys(specs));
        }
        
        // Calculate net weight (weight per unit × quantity)
        const netWeight = weightValue > 0 ? weightValue * item.quantity : 0;
        const netWeightStr = netWeight > 0 ? `${netWeight.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} lbs` : 'N/A';
        
        // Description - include SDS information, EPA establishment number, and DOT information
        const sdsInfo = attrs.sdsInformation || '';
        const epaEstablishment = attrs.epaRegistrationNumber || '';
        const dotRegulated = attrs.dotRegulated || '';
        const dotHazardClass = attrs.dotHazardClass || 'N/A';
        const dotUnNumber = attrs.dotUnNumber || 'N/A';
        const dotPackingGroup = attrs.dotPackingGroup || '';
        
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
        
        // Accumulate totals - always add quantity, even if weight is 0
        totalPieces += item.quantity;
        if (weightValue > 0) {
          totalShippingWeight += netWeight;
          itemWeights.push({ weight: weightValue, quantity: item.quantity });
        }
        
        // Debug: Log weight calculation
        if (process.env.NODE_ENV === 'development') {
          console.log(`[BOL] Item: ${item.name}, quantity: ${item.quantity}, weightStr: ${weightStr}, weightValue: ${weightValue}, netWeight: ${netWeight}`);
        }
        
        // Use product-specific NMFC number, falling back to order-level value
        const itemNmfc = item.nmfc_number || nmfcNumberToUse;
        const itemFreightClass = item.freight_class || '—';

        return `
    <tr>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${itemNumber}</td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${packageType}</td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${netWeightStr}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #e5e7eb; font-size: 11px;">
        <div>${qtyNumber}</div>
        ${qtyUOM ? `<div style="font-size: 10px; color: #6b7280;">${qtyUOM}</div>` : ''}
      </td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${description}</td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${itemNmfc}</td>
      <td style="padding: 10px; border: 1px solid #e5e7eb; font-size: 11px;">${itemFreightClass}</td>
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
    // If no totes found but we have items, default to 1 pallet
    totalPallets = totalTotes > 0 ? totalTotes : (totalPieces > 0 ? 1 : 0);
  }
  
  // Debug: Log calculated totals
  if (process.env.NODE_ENV === 'development') {
    console.log(`[BOL] Calculated totals - totalPieces: ${totalPieces}, totalPallets: ${totalPallets}, totalShippingWeight: ${totalShippingWeight}`);
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
    @media print {
      body {
        padding: 20px;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-container">
        <img src="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/logo.png" alt="Innovative Crop Care Logo" />
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
        <h3>Shipper (From)</h3>
        <p><strong>Innovative CropCare, LLC</strong></p>
        ${warehouse ? `<p>C/O: ${warehouse.name}</p>` : ''}
        ${warehouse ? `<p>${warehouse.address_street}</p>` : '<p>181 Cedar Ridge Rd.</p>'}
        ${warehouse ? `<p>${warehouse.address_city}, ${warehouse.address_state} ${warehouse.address_zip}</p>` : '<p>Tifton, Ga. 31794</p>'}
        ${warehouse && warehouse.phone ? `<p>Phone: ${warehouse.phone}</p>` : '<p>Phone: (229) 326-5408</p>'}
        ${warehouse && warehouse.email ? `<p>Email: ${warehouse.email}</p>` : '<p>Email: billing@innovativecropcare.com</p>'}
      </div>
      <div class="company-section">
        <h3>Consignee (To)</h3>
        <p><strong>${(shippingAddress.firstName || '')} ${(shippingAddress.lastName || '')}</strong></p>
        <p>${shippingAddress.line1 || shippingAddress.address1 || shippingAddress.street || 'N/A'}</p>
        ${(shippingAddress.line2 || shippingAddress.address2) ? `<p>${shippingAddress.line2 || shippingAddress.address2}</p>` : ''}
        <p>${shippingAddress.city || 'N/A'}, ${shippingAddress.state || 'N/A'} ${shippingAddress.zipCode || shippingAddress.zip || 'N/A'}</p>
        ${shippingAddress.phone ? `<p>Phone: ${shippingAddress.phone}</p>` : ''}
        ${shippingAddress.email ? `<p>Email: ${shippingAddress.email}</p>` : ''}
      </div>
    </div>

    <div class="company-info" style="margin-top: 20px;">
      <div class="company-section">
        <h3>Billing Address</h3>
        <p><strong>Innovative CropCare, LLC</strong></p>
        <p>181 Cedar Ridge Rd.</p>
        <p>Tifton, Ga. 31794</p>
        <p>Phone: (229) 326-5408</p>
        <p>Email: billing@innovativecropcare.com</p>
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
          <th>Freight Class</th>
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

