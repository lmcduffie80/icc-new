import { z } from 'zod';

// Common validation patterns
export const emailSchema = z.string().email().max(255);
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format');
export const nameSchema = z.string().min(1).max(100).trim();
export const passwordSchema = z.string().min(8).max(100);
export const urlSchema = z.string().url().max(500);
export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().min(0);
export const priceSchema = z.number().positive().multipleOf(0.01);
export const zipCodeSchema = z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code');

// Contact form validation
export const contactFormSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format').min(10).max(20).optional()
  ),
  message: z.string().min(10).max(5000).trim(),
  subject: z.string().min(1).max(200).trim(),
  recaptchaToken: z.string().optional(),
  website: z.string().optional(),
  form_loaded_at: z.string().optional(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

// Order validation
export const addressSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  line1: z.string().min(1).max(200).trim(),
  line2: z.string().max(200).trim().optional(),
  city: z.string().min(1).max(100).trim(),
  state: z.string().length(2).regex(/^[A-Z]{2}$/, 'State must be 2-letter code'),
  zipCode: zipCodeSchema,
  country: z.string().default('US'),
});

export const orderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveIntSchema,
  price: priceSchema,
  name: z.string().min(1).max(200),
  image: urlSchema.optional(),
  unitOfMeasure: z.string().nullable().optional(),
});

export const orderCreateSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(100),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  email: emailSchema,
  phone: phoneSchema,
  paymentIntentId: z.string().min(1).max(255).optional(),
  notes: z.string().max(1000).trim().optional(),
  skipPayment: z.boolean().optional().default(false), // Allow creating orders without payment
});

export type OrderCreateData = z.infer<typeof orderCreateSchema>;

// Product validation
const productBaseSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(5000).trim(),
  price: priceSchema,
  msrp: priceSchema.optional(),
  sku: z.string().min(1).max(100).trim(),
  inventory: nonNegativeIntSchema,
  images: z.array(urlSchema).max(10),
  category: z.string().min(1).max(100).trim(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isActive: z.boolean().default(true),
  weight: z.number().positive().optional(),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
});

export const productCreateSchema = productBaseSchema.refine(
  (data) => !data.msrp || data.msrp >= data.price,
  { message: "MSRP must be greater than or equal to store price", path: ["msrp"] }
);

export const productUpdateSchema = productBaseSchema.partial().refine(
  (data) => !data.msrp || !data.price || data.msrp >= data.price,
  { message: "MSRP must be greater than or equal to store price", path: ["msrp"] }
);

export type ProductCreateData = z.infer<typeof productCreateSchema>;
export type ProductUpdateData = z.infer<typeof productUpdateSchema>;

// Profile validation
export const profileUpdateSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.optional(),
  defaultShippingAddress: addressSchema.optional(),
  defaultBillingAddress: addressSchema.optional(),
  marketingEmails: z.boolean().optional(),
});

export type ProfileUpdateData = z.infer<typeof profileUpdateSchema>;

// Farm profile validation
export const farmAcresOptions = ['1-99', '100-249', '250-500', '500+'] as const;
export type FarmAcres = typeof farmAcresOptions[number];

export const farmProfileSchema = z.object({
  farmName: z.string().min(1, 'Farm name is required').max(200).trim(),
  zipCode: zipCodeSchema,
  cropTypes: z.string().min(1, 'Please describe your crops').max(2000).trim(),
  farmAcres: z.enum(farmAcresOptions, { message: 'Please select your farm size' }),
});

export type FarmProfileData = z.infer<typeof farmProfileSchema>;

// Admin validation
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(100),
});

export type AdminLoginData = z.infer<typeof adminLoginSchema>;

export const adminUserCreateSchema = z.object({
  username: z.string().min(3).max(50).trim(),
  password: passwordSchema,
  email: emailSchema,
  name: nameSchema,
  role: z.enum(['super_admin', 'admin', 'manager', 'support']),
  permissions: z.array(z.string()).optional(),
});

export type AdminUserCreateData = z.infer<typeof adminUserCreateSchema>;

// Tax rate validation
export const taxRateCreateSchema = z.object({
  stateCode: z.string().length(2).regex(/^[A-Z]{2}$/, 'State code must be 2 uppercase letters'),
  rate: z.number().min(0).max(1, 'Rate must be between 0 and 100%'),
  effectiveDate: z.string().datetime().optional(),
});

export type TaxRateCreateData = z.infer<typeof taxRateCreateSchema>;

export const taxRateUpdateSchema = z.object({
  rate: z.number().min(0).max(1, 'Rate must be between 0 and 100%').optional(),
  effectiveDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export type TaxRateUpdateData = z.infer<typeof taxRateUpdateSchema>;

export const taxCalculateSchema = z.object({
  subtotal: priceSchema,
  state: z.string().length(2).regex(/^[A-Z]{2}$/, 'State code must be 2 uppercase letters'),
});

export type TaxCalculateData = z.infer<typeof taxCalculateSchema>;

// Membership validation
export const consultationRequestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  preferredDate: z.string().datetime(),
  preferredTime: z.enum(['morning', 'afternoon', 'evening']),
  message: z.string().max(1000).trim().optional(),
});

export type ConsultationRequestData = z.infer<typeof consultationRequestSchema>;

// Appointment validation
export const appointmentCreateSchema = z.object({
  appointmentTypeId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  customerName: nameSchema,
  customerEmail: emailSchema,
  customerPhone: phoneSchema,
  notes: z.string().max(1000).trim().optional(),
});

export type AppointmentCreateData = z.infer<typeof appointmentCreateSchema>;

// File upload validation
export const imageUploadSchema = z.object({
  filename: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid filename'),
  contentType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']),
  size: z.number().positive().max(5 * 1024 * 1024, 'File size must be less than 5MB'),
});

export type ImageUploadData = z.infer<typeof imageUploadSchema>;

// Admin document upload schema (PDFs only for labels/SDS)
export const adminDocumentUploadSchema = z.object({
  filename: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid filename'),
  contentType: z.literal('application/pdf'),
  size: z.number().positive().max(10 * 1024 * 1024, 'File size must be less than 10MB'),
});

export type AdminDocumentUploadData = z.infer<typeof adminDocumentUploadSchema>;

// Supplier upload schema (supports images and PDFs for SDS/labels)
export const supplierUploadSchema = z.object({
  filename: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid filename'),
  contentType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']),
  size: z.number().positive().max(5 * 1024 * 1024, 'File size must be less than 5MB'),
});

export type SupplierUploadData = z.infer<typeof supplierUploadSchema>;

// Invoice upload validation
export const invoiceUploadSchema = z.object({
  filename: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid filename'),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']),
  size: z.number().positive().max(5 * 1024 * 1024, 'File size must be less than 5MB'),
  state: z.string().length(2).regex(/^[A-Z]{2}$/, 'State must be 2-letter code'),
});

export type InvoiceUploadData = z.infer<typeof invoiceUploadSchema>;

// Invoice confirmation schema (for PATCH endpoint)
export const invoiceConfirmSchema = z.object({
  invoiceUrl: z.string().url().max(500),
  state: z.string().length(2).regex(/^[A-Z]{2}$/),
  filename: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
});

export type InvoiceConfirmData = z.infer<typeof invoiceConfirmSchema>;

// Pesticide applicator license upload validation
export const licenseUploadSchema = z.object({
  filename: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid filename'),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']),
  size: z.number().positive().max(5 * 1024 * 1024, 'File size must be less than 5MB'),
  state: z.string().length(2).regex(/^[A-Z]{2}$/, 'State must be 2-letter code').optional(),
});

export type LicenseUploadData = z.infer<typeof licenseUploadSchema>;

// License confirmation schema (for PATCH endpoint)
export const licenseConfirmSchema = z.object({
  licenseUrl: z.string().url().max(500),
  state: z.string().length(2).regex(/^[A-Z]{2}$/).optional(),
  filename: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
});

export type LicenseConfirmData = z.infer<typeof licenseConfirmSchema>;

// User invoice response schema (for API responses from user_invoices table)
export const userInvoiceSchema = z.object({
  id: z.string(),
  state: z.string().length(2),
  fileUrl: z.string().url(),
  filename: z.string(),
  fileType: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserInvoice = z.infer<typeof userInvoiceSchema>;

// Pagination validation
export const paginationSchema = z.object({
  page: positiveIntSchema.default(1),
  limit: positiveIntSchema.max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationData = z.infer<typeof paginationSchema>;

// Stripe payment validation
export const paymentIntentCreateSchema = z.object({
  amount: priceSchema,
  items: z.array(orderItemSchema).min(1).max(100),
  deliveryFee: z.number().min(0).multipleOf(0.01).default(0), // Allow 0 for free shipping
  tax: z.number().min(0).multipleOf(0.01), // Allow 0 tax
  deliveryMethod: z.string().min(1).max(100).regex(/^[^\x00-\x1F\x7F]+$/, 'Invalid delivery method').default('standard'),
  state: z.string().length(2).regex(/^[A-Z]{2}$/, 'State must be 2-letter code'),
  freightQuoteId: z.string().max(200).nullable().optional(),
  shippingCarrier: z.string().max(100).nullable().optional(),
  liftgateFee: z.number().min(0).multipleOf(0.01).default(0),
});

export type PaymentIntentCreateData = z.infer<typeof paymentIntentCreateSchema>;

export const paymentMethodSaveSchema = z.object({
  paymentMethodId: z.string().min(1).max(255),
  setAsDefault: z.boolean().default(false),
});

export type PaymentMethodSaveData = z.infer<typeof paymentMethodSaveSchema>;

export const paymentMethodSetDefaultSchema = z.object({
  paymentMethodId: z.string().min(1).max(255),
});

export type PaymentMethodSetDefaultData = z.infer<typeof paymentMethodSetDefaultSchema>;

export const setupIntentCreateSchema = z.object({
  // No additional fields required, just validates request structure
});

export type SetupIntentCreateData = z.infer<typeof setupIntentCreateSchema>;

export const orderWithPaymentSchema = orderCreateSchema.extend({
  paymentIntentId: z.string().min(1).max(255),
  savePaymentMethod: z.boolean().default(false),
  invoiceMetadata: z.object({
    invoice_url: z.string().url(),
    invoice_state: z.string().length(2).regex(/^[A-Z]{2}$/),
    invoice_uploaded_at: z.string().datetime().optional(),
    invoice_filename: z.string().min(1).max(255),
    invoice_file_type: z.string().min(1).max(100),
  }).passthrough(),
});

export type OrderWithPaymentData = z.infer<typeof orderWithPaymentSchema>;

// Helper function to validate and return data
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Helper function that returns validation result with errors
export function safeValidateData<T>(schema: z.ZodSchema<T>, data: unknown): 
  { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// Email validation schemas
export const emailSendSchema = z.object({
  to: emailSchema,
  subject: z.string().min(1).max(200).trim(),
  body: z.string().min(1).max(10000).trim(),
});

export type EmailSendData = z.infer<typeof emailSendSchema>;

// Admin password reset validation
export const requestResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().length(64).regex(/^[a-f0-9]{64}$/, 'Invalid token format'),
  newPassword: passwordSchema, // Min 8 chars, already defined
});

export type RequestResetData = z.infer<typeof requestResetSchema>;
export type ResetPasswordData = z.infer<typeof resetPasswordSchema>;

// Supplier validation
export const supplierLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(100),
});

export const supplierCreateSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  companyName: z.string().min(1).max(200).trim(),
  password: passwordSchema,
  phone: z.string().regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format').min(10).max(20).optional(),
});

// Admin supplier user creation schema (accepts company_name instead of companyName)
// Note: supplier_number is auto-generated by the database, so it's not in the schema
export const supplierUserCreateSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  company_name: z.string().min(1).max(200).trim(),
  password: passwordSchema,
  phone: z.string().regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format').min(10).max(20).optional(),
  tax_exempt: z.boolean().default(false),
  address_street: z.string().min(1).max(200).trim().optional(),
  address_city: z.string().min(1).max(100).trim().optional(),
  address_state: z.string().length(2).regex(/^[A-Z]{2}$/, 'State must be 2-letter code').optional(),
  address_zip: zipCodeSchema.optional(),
});

export const supplierUserUpdateSchema = z.object({
  email: emailSchema.optional(),
  name: nameSchema.optional(),
  company_name: z.string().min(1).max(200).trim().optional(),
  phone: z.string().regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format').min(10).max(20).optional().nullable(),
  is_active: z.boolean().optional(),
  tax_exempt: z.boolean().optional(),
  address_street: z.string().min(1).max(200).trim().optional().nullable(),
  address_city: z.string().min(1).max(100).trim().optional().nullable(),
  address_state: z.string().length(2).regex(/^[A-Z]{2}$/, 'State must be 2-letter code').optional().nullable(),
  address_zip: zipCodeSchema.optional().nullable(),
});

export const productWarehouseSchema = z.object({
  warehouse_id: z.string().uuid(),
  inventory_count: z.number().int().min(0),
});

export const supplierProductCreateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  category: z.string().min(1).max(100).trim(),
  description: z.string().min(1).max(5000).trim(),
  full_description: z.string().max(10000).trim().optional(),
  price: priceSchema,
  supplier_price: priceSchema.optional(),
  sku: z.string().min(1).max(100).trim().optional(),
  unit_of_measure: z.string().max(50).trim().optional(),
  image: urlSchema.optional(),
  attributes: z.record(z.string(), z.any()).optional(),
  approved_states: z.array(z.string().length(2)).optional(),
  features: z.array(z.string()).optional(),
  specifications: z.record(z.string(), z.string()).optional(),
  restricted_use: z.boolean().default(false),
  icc_available_quantity: z.number().int().min(0).default(0),
  warehouse_id: z.string().uuid().optional(), // Deprecated - kept for backward compatibility
  warehouses: z.array(productWarehouseSchema).optional(), // New: multiple warehouses
  label_url: urlSchema.optional(),
  sds_url: urlSchema.optional(),
  label_template_id: z.string().uuid().optional(),
  margin_split_percentage: z.number().min(0).max(100).optional(),
  icc_margin_percent: z.number().min(0).max(100).optional(),
});

export const supplierProductUpdateSchema = supplierProductCreateSchema.partial().extend({
  id: z.string().uuid(),
});

// Restricted schema for new supplier workflow (admin creates products, suppliers only manage pricing/inventory/docs)
export const supplierProductUpdateRestrictedSchema = z.object({
  id: z.string().uuid(),
  // Only pricing, inventory, and documents can be updated by suppliers
  supplier_price: priceSchema.optional(),
  margin_split_percentage: z.number().min(0).max(100).optional(),
  icc_available_quantity: z.number().int().min(0).optional(),
  sds_url: z.string().url().optional().nullable(),
  label_url: z.string().url().optional().nullable(),
  warehouses: z.array(z.object({
    warehouse_id: z.string().uuid(),
    quantity: z.number().int().min(0),
  })).optional(),
});

export const labelApprovalSchema = z.object({
  token: z.string().min(32).max(64), // Token is a hex string, not UUID
  action: z.enum(['approve', 'reject']).optional(), // Optional since it's determined by the endpoint
});

export type SupplierLoginData = z.infer<typeof supplierLoginSchema>;
export type SupplierCreateData = z.infer<typeof supplierCreateSchema>;
export type SupplierProductCreateData = z.infer<typeof supplierProductCreateSchema>;
export type SupplierProductUpdateData = z.infer<typeof supplierProductUpdateSchema>;
export type SupplierProductUpdateRestrictedData = z.infer<typeof supplierProductUpdateRestrictedSchema>;
export type LabelApprovalData = z.infer<typeof labelApprovalSchema>;

// Margin approval validation
export const marginUpdateSchema = z.object({
  margin_split_percentage: z.number().min(0).max(100),
});

export const marginApprovalSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(1000).optional(),
});

// Admin margin proposal validation (admin proposes margin to supplier)
export const adminMarginProposalSchema = z.object({
  margin_percent: z.number().min(0).max(100),
  notes: z.string().max(1000).optional(),
});

// Supplier margin decision validation (supplier approves/rejects admin's proposal)
export const supplierMarginDecisionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(1000).optional(),
});

export type MarginUpdateData = z.infer<typeof marginUpdateSchema>;
export type MarginApprovalData = z.infer<typeof marginApprovalSchema>;
export type AdminMarginProposalData = z.infer<typeof adminMarginProposalSchema>;
export type SupplierMarginDecisionData = z.infer<typeof supplierMarginDecisionSchema>;

// Reports validation
export const timePeriodSchema = z.enum(['all_time', '30_days', '90_days', '180_days', 'year']);

// Terms and Conditions validation
export const termsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less').trim(),
  content: z.string().min(10, 'Content must be at least 10 characters').max(50000, 'Content must be 50,000 characters or less').trim(),
});

export type TermsData = z.infer<typeof termsSchema>;

// Contract management validation
export const contractDocumentUploadSchema = z.object({
  contentType: z.literal('application/pdf'),
  fileName: z.string().min(1).max(255),
  size: z.number().min(1).max(10 * 1024 * 1024), // 10MB
  supplierId: z.string().uuid()
});

export type ContractDocumentUploadData = z.infer<typeof contractDocumentUploadSchema>;export const contractCreateSchema = z.object({
  supplierId: z.string().uuid(),
  fileUrl: z.string().url(),
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  contractType: z.enum(['Supply Agreement', 'Service Agreement', 'NDA', 'Pricing Agreement', 'Other']),
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  version: z.number().int().positive().default(1)
});

export type ContractCreateData = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = z.object({
  contractType: z.enum(['Supply Agreement', 'Service Agreement', 'NDA', 'Pricing Agreement', 'Other']).optional(),
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
});

export type ContractUpdateData = z.infer<typeof contractUpdateSchema>;

// Label template validation
export const labelTemplateSchema = z.object({
  product_name: z.string().min(1).max(200).trim(),
  template_name: z.string().min(1).max(200).trim(),
  label_image_url: z.string().url().max(500),
  short_description: z.string().min(10).max(500).trim(),
  long_description: z.string().max(5000).trim().optional().nullable(),
});

export type LabelTemplateData = z.infer<typeof labelTemplateSchema>;

export const labelTemplateUpdateSchema = z.object({
  product_name: z.string().min(1).max(200).trim().optional(),
  template_name: z.string().min(1).max(200).trim().optional(),
  label_image_url: z.string().url().max(500).optional(),
  short_description: z.string().min(10).max(500).trim().optional(),
  long_description: z.string().max(5000).trim().optional().nullable(),
});

export type LabelTemplateUpdateData = z.infer<typeof labelTemplateUpdateSchema>;

export const labelTemplateApprovalSchema = z.object({
  rejection_reason: z.string().max(1000).trim().optional().nullable(),
});

export type LabelTemplateApprovalData = z.infer<typeof labelTemplateApprovalSchema>;

// Contract builder validation (in-app structured contracts)
export const contractBuilderProductSchema = z.object({
  product_id: z.string().min(1),
  name: z.string().min(1).max(200),
  sku: z.string().max(100).optional().nullable(),
  supplier_price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid price'),
  store_price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid price'),
  margin_split_icc_percent: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid percentage'),
  margin_split_supplier_percent: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid percentage'),
  icc_margin_amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount'),
  supplier_margin_amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount'),
  unit_of_measure: z.string().max(50).optional().nullable(),
});

export const contractBuilderSchema = z.object({
  supplierId: z.string().min(1, 'Partner ID is required'),
  partnerType: z.enum(['supplier', 'vendor']).default('supplier'),
  contractType: z.enum(['Supply Agreement', 'Service Agreement', 'NDA', 'Pricing Agreement', 'Other']),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  terms: z.string().min(10).max(50000),
  customClauses: z.array(z.string().max(5000)).max(20).optional(),
  products: z.array(contractBuilderProductSchema).min(1, 'At least one product is required'),
  parentContractId: z.string().optional().nullable(),
  versionNotes: z.string().max(2000).optional().nullable(),
  status: z.enum(['draft', 'pending_supplier_signature']).default('draft'),
  supplierAddressStreet: z.string().max(500).optional().nullable(),
  supplierAddressCity: z.string().max(200).optional().nullable(),
  supplierAddressState: z.string().max(50).optional().nullable(),
  supplierAddressZip: z.string().max(20).optional().nullable(),
});

export type ContractBuilderData = z.infer<typeof contractBuilderSchema>;
export type ContractBuilderProductData = z.infer<typeof contractBuilderProductSchema>;

export const contractSendEmailSchema = z.object({
  recipientEmail: z.string().email('Must be a valid email address'),
  recipientName: z.string().min(1, 'Recipient name is required').max(200),
  message: z.string().max(2000).optional().nullable(),
  ccAdmin: z.boolean().optional().default(false),
});
