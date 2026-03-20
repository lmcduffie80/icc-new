import { generatePDFWithPDFShift } from '@/lib/pdf-generation';

interface ContractProduct {
  product_id: string;
  name: string;
  sku?: string | null;
  supplier_price: string;
  store_price: string;
  margin_split_icc_percent: string;
  margin_split_supplier_percent: string;
  icc_margin_amount: string;
  supplier_margin_amount: string;
  unit_of_measure?: string | null;
}

interface ContractContent {
  template: string;
  effective_date: string;
  expiry_date?: string | null;
  supplier_name: string;
  supplier_company: string;
  supplier_address_street?: string | null;
  supplier_address_city?: string | null;
  supplier_address_state?: string | null;
  supplier_address_zip?: string | null;
  terms: string;
  custom_clauses?: string[];
  products: ContractProduct[];
  version_notes?: string | null;
}

interface ContractPDFData {
  content: ContractContent;
  contractType: string;
  version: number;
  status: string;
  adminSignedAt?: string | null;
  adminSignedByName?: string | null;
  supplierSignedAt?: string | null;
  supplierSignedByName?: string | null;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTermsHtml(terms: string): string {
  return terms
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      return escaped.trim() === '' ? '<br>' : `<p style="margin:0 0 6px 0;">${escaped}</p>`;
    })
    .join('');
}

function buildSupplierAddressHtml(content: ContractContent): string {
  const lines: string[] = [];
  if (content.supplier_address_street) {
    lines.push(`<div>${escapeHtml(content.supplier_address_street)}</div>`);
  }
  const cityStateZip = [
    content.supplier_address_city,
    content.supplier_address_state,
    content.supplier_address_zip,
  ]
    .filter(Boolean)
    .join(', ');
  if (cityStateZip) {
    lines.push(`<div>${escapeHtml(cityStateZip)}</div>`);
  }
  return lines.join('');
}

function buildProductsTableHtml(products: ContractProduct[]): string {
  if (!products || products.length === 0) return '';

  const rows = products
    .map(
      (p) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:8pt;">${escapeHtml(p.name)}${p.sku ? `<br><span style="color:#6b7280;font-size:7pt;">SKU: ${escapeHtml(p.sku)}</span>` : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:8pt;text-align:right;">$${escapeHtml(p.supplier_price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:8pt;text-align:right;">$${escapeHtml(p.store_price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:8pt;text-align:right;">${escapeHtml(p.margin_split_icc_percent)}%</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:8pt;text-align:right;">$${escapeHtml(p.icc_margin_amount)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:8pt;text-align:right;">$${escapeHtml(p.supplier_margin_amount)}</td>
    </tr>`,
    )
    .join('');

  return `
    <div style="margin-top:24px;">
      <div style="border-top:1px solid #d1d5db;margin-bottom:12px;"></div>
      <h3 style="font-size:10pt;font-weight:700;color:#1f2937;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Products and Pricing Schedule</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:6px 8px;text-align:left;font-size:8pt;font-weight:700;color:#374151;border-bottom:2px solid #d1d5db;">Product</th>
            <th style="padding:6px 8px;text-align:right;font-size:8pt;font-weight:700;color:#374151;border-bottom:2px solid #d1d5db;">Supplier Cost</th>
            <th style="padding:6px 8px;text-align:right;font-size:8pt;font-weight:700;color:#374151;border-bottom:2px solid #d1d5db;">Store Price</th>
            <th style="padding:6px 8px;text-align:right;font-size:8pt;font-weight:700;color:#374151;border-bottom:2px solid #d1d5db;">ICC %</th>
            <th style="padding:6px 8px;text-align:right;font-size:8pt;font-weight:700;color:#374151;border-bottom:2px solid #d1d5db;">ICC Gets</th>
            <th style="padding:6px 8px;text-align:right;font-size:8pt;font-weight:700;color:#374151;border-bottom:2px solid #d1d5db;">Supplier Gets</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildCustomClausesHtml(clauses: string[]): string {
  if (!clauses || clauses.length === 0) return '';

  const items = clauses
    .map(
      (clause, i) =>
        `<p style="margin:0 0 8px 0;font-size:9pt;"><strong>${i + 1}.</strong> ${escapeHtml(clause)}</p>`,
    )
    .join('');

  return `
    <div style="margin-top:24px;">
      <div style="border-top:1px solid #d1d5db;margin-bottom:12px;"></div>
      <h3 style="font-size:10pt;font-weight:700;color:#1f2937;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Additional Clauses</h3>
      ${items}
    </div>`;
}

function buildSignatureHtml(
  adminSignedAt: string | null | undefined,
  adminSignedByName: string | null | undefined,
  supplierSignedAt: string | null | undefined,
  supplierCompany: string,
  supplierSignedByName?: string | null,
): string {
  const adminCursiveName = escapeHtml(adminSignedByName || 'Admin');
  const supplierCursiveName = escapeHtml(supplierSignedByName || supplierCompany);

  const adminSig = adminSignedAt
    ? `<div style="font-family:'Dancing Script',cursive;font-size:22pt;color:#065f46;line-height:1.2;margin-bottom:4px;">${adminCursiveName}</div>
       <div style="border-top:1px solid #374151;padding-top:6px;">
         <div style="font-size:8pt;color:#6b7280;">Authorized Signature</div>
         <div style="color:#065f46;font-size:8pt;margin-top:2px;">Signed by ${adminCursiveName} on ${formatDate(adminSignedAt)}</div>
       </div>`
    : `<div style="border-top:1px dashed #d1d5db;padding-top:6px;margin-top:28px;">
         <div style="font-size:8pt;color:#6b7280;">Authorized Signature</div>
         <div style="color:#9ca3af;font-size:8pt;margin-top:2px;">Signature pending</div>
       </div>`;

  const supplierSig = supplierSignedAt
    ? `<div style="font-family:'Dancing Script',cursive;font-size:22pt;color:#065f46;line-height:1.2;margin-bottom:4px;">${supplierCursiveName}</div>
       <div style="border-top:1px solid #374151;padding-top:6px;">
         <div style="font-size:8pt;color:#6b7280;">Authorized Signature</div>
         <div style="color:#065f46;font-size:8pt;margin-top:2px;">Signed by ${supplierCursiveName} on ${formatDate(supplierSignedAt)}</div>
       </div>`
    : `<div style="border-top:1px dashed #d1d5db;padding-top:6px;margin-top:28px;">
         <div style="font-size:8pt;color:#6b7280;">Authorized Signature</div>
         <div style="color:#9ca3af;font-size:8pt;margin-top:2px;">Signature pending</div>
       </div>`;

  return `
    <div style="margin-top:32px;">
      <div style="border-top:1px solid #d1d5db;margin-bottom:16px;"></div>
      <h3 style="font-size:10pt;font-weight:700;color:#1f2937;margin:0 0 20px 0;text-transform:uppercase;letter-spacing:0.05em;">Signatures</h3>
      <div style="display:table;width:100%;">
        <div style="display:table-cell;width:48%;vertical-align:top;padding-right:4%;">
          <div style="font-size:9pt;font-weight:700;color:#1f2937;margin-bottom:16px;">Innovative CropCare, LLC</div>
          ${adminSig}
        </div>
        <div style="display:table-cell;width:48%;vertical-align:top;">
          <div style="font-size:9pt;font-weight:700;color:#1f2937;margin-bottom:16px;">${escapeHtml(supplierCompany)}</div>
          ${supplierSig}
        </div>
      </div>
    </div>`;
}

/**
 * Generates a PDF buffer for a structured in-app contract using PDFShift.
 */
export async function generateContractPDF(data: ContractPDFData): Promise<Uint8Array> {
  const { content, contractType, version, status, adminSignedAt, adminSignedByName, supplierSignedAt, supplierSignedByName } = data;

  const supplierAddressHtml = buildSupplierAddressHtml(content);
  const productsHtml = buildProductsTableHtml(content.products);
  const clausesHtml = buildCustomClausesHtml(content.custom_clauses || []);
  const signaturesHtml = buildSignatureHtml(adminSignedAt, adminSignedByName, supplierSignedAt, content.supplier_company, supplierSignedByName);

  const versionStatusText = `Version ${version} &nbsp;|&nbsp; Status: ${escapeHtml(status.replace(/_/g, ' '))}`;

  const versionNotesHtml = content.version_notes
    ? `<div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:4px;border:1px solid #e5e7eb;">
        <div style="font-size:8pt;font-weight:700;color:#6b7280;margin-bottom:4px;">VERSION NOTES</div>
        <div style="font-size:8pt;color:#4b5563;">${escapeHtml(content.version_notes)}</div>
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .page {
      padding: 40px 50px;
      max-width: 750px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="margin-bottom:24px;">
    <div style="font-size:16pt;font-weight:700;color:#065f46;margin-bottom:4px;">INNOVATIVE CROPCARE, LLC</div>
    <div style="font-size:13pt;font-weight:700;color:#374151;margin-bottom:4px;">${escapeHtml(contractType.toUpperCase())}</div>
    <div style="font-size:8pt;color:#9ca3af;">${versionStatusText}</div>
  </div>

  <!-- Parties -->
  <div style="border-top:1px solid #d1d5db;padding-top:16px;margin-bottom:20px;">
    <h3 style="font-size:10pt;font-weight:700;color:#1f2937;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Parties</h3>
    <div style="display:table;width:100%;">
      <div style="display:table-cell;width:48%;vertical-align:top;padding-right:4%;">
        <div style="font-size:7.5pt;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Party A</div>
        <div style="font-size:10pt;font-weight:700;color:#1f2937;">Innovative CropCare, LLC</div>
        <div style="font-size:8.5pt;color:#4b5563;">3800 Camp Creek Pkwy, Building 1400</div>
        <div style="font-size:8.5pt;color:#4b5563;">Atlanta, GA 30331</div>
      </div>
      <div style="display:table-cell;width:48%;vertical-align:top;">
        <div style="font-size:7.5pt;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Party B</div>
        <div style="font-size:10pt;font-weight:700;color:#1f2937;">${escapeHtml(content.supplier_company)}</div>
        <div style="font-size:8.5pt;color:#4b5563;">${escapeHtml(content.supplier_name)}</div>
        ${supplierAddressHtml ? `<div style="font-size:8.5pt;color:#4b5563;">${supplierAddressHtml}</div>` : ''}
      </div>
    </div>
    <div style="margin-top:12px;font-size:8.5pt;color:#4b5563;">
      <strong>Effective Date:</strong> ${formatDate(content.effective_date)}
      ${content.expiry_date ? `&nbsp;&nbsp;&nbsp;<strong>Expiry Date:</strong> ${formatDate(content.expiry_date)}` : ''}
    </div>
  </div>

  <!-- Terms and Conditions -->
  <div style="margin-top:24px;">
    <div style="border-top:1px solid #d1d5db;margin-bottom:12px;"></div>
    <h3 style="font-size:10pt;font-weight:700;color:#1f2937;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Terms and Conditions</h3>
    <div style="font-size:9pt;color:#374151;line-height:1.5;">
      ${formatTermsHtml(content.terms)}
    </div>
  </div>

  ${clausesHtml}
  ${productsHtml}
  ${signaturesHtml}
  ${versionNotesHtml}

</div>
</body>
</html>`;

  const buffer = await generatePDFWithPDFShift(html);
  return new Uint8Array(buffer);
}
