# Label Template System

## Overview

The Label Template System allows admins to create reusable product label templates with images and descriptions that suppliers can select when creating products. This streamlines product creation and ensures consistency across similar products.

## Features

- **Admin Template Management**: Create, edit, approve, and manage label templates
- **Image Storage**: Label images stored securely on AWS S3
- **Auto-Population**: Templates auto-fill short and long descriptions when selected
- **Approval Workflow**: Templates must be approved before suppliers can use them
- **Product Name Matching**: Templates are tied to specific product names for easy discovery

## Database Schema

### label_templates Table

```sql
- id: Unique identifier (UUID)
- product_name: Product name this template applies to
- template_name: Descriptive name for the template
- label_image_url: S3 URL of the label image
- short_description: Brief description (10-500 chars)
- long_description: Detailed description (up to 5000 chars)
- approval_status: 'pending', 'approved', or 'rejected'
- created_by_admin_id: Admin who created the template
- approved_by_admin_id: Admin who approved/rejected
- approved_at: Timestamp of approval/rejection
- rejection_reason: Optional reason for rejection
- is_active: Soft delete flag
- created_at, updated_at: Timestamps
```

### products Table Update

```sql
- label_template_id: Reference to the template used (nullable)
```

## Admin Workflow

### 1. Creating a Label Template

1. Navigate to **Admin Dashboard** → **Label Templates**
2. Click **New Template**
3. Fill in the form:
   - **Product Name**: The product name this template applies to (e.g., "Premium Nitrogen Fertilizer")
   - **Template Name**: Descriptive name (e.g., "Standard Label - 50lb Bag")
   - **Label Image**: Upload the product label image (PNG, JPG, GIF up to 5MB)
   - **Short Description**: Brief description (10-500 characters, required)
   - **Long Description**: Detailed description (up to 5000 characters, optional)
4. Click **Create Template**
5. Template is created with status "Pending"

### 2. Approving/Rejecting Templates

**Option A: From the List View**
1. Go to **Label Templates** page
2. Find the template card
3. Click the **✓** (approve) or **✗** (reject) button
4. For rejections, optionally provide a reason

**Option B: From the Detail View**
1. Click **View** on any template
2. Review the template details and image
3. Click **Approve** or **Reject** button
4. For rejections, optionally provide a reason

### 3. Editing Templates

1. Find the template in the list
2. Click **Edit**
3. Modify any fields (product name, template name, image, descriptions)
4. Click **Update Template**
5. **Note**: Editing a template does NOT reset its approval status

### 4. Deleting Templates

1. Find the template in the list
2. Click the **🗑️** (trash) button
3. Confirm deletion
4. Template is soft-deleted (hidden from suppliers but retained in database)

### 5. Filtering Templates

Use the filters at the top:
- **Search**: Filter by product name or template name
- **Status Filter**: Show only Pending, Approved, or Rejected templates

## Supplier Workflow

### Using Label Templates When Creating Products

1. Navigate to **Supplier Dashboard** → **Products** → **New Product**
2. Fill in the **Product Name** field
3. After entering the name (3+ characters), the system automatically searches for matching templates
4. If templates are found, a blue box appears with a dropdown:
   - "Use Label Template (Optional)"
5. Select a template from the dropdown
6. **Automatic Population**:
   - Short Description is auto-filled
   - Long Description is auto-filled
   - Product Label image is set
7. You can still edit the descriptions manually after selection
8. Continue with the rest of the product form (pricing, inventory, etc.)
9. Submit the product

**Notes**:
- Only **approved** templates are shown to suppliers
- Templates are filtered by product name (case-insensitive partial match)
- Selecting a template is optional - you can still manually fill in descriptions
- Template selection helps maintain consistency but doesn't restrict customization

## API Endpoints

### Admin Endpoints

```
GET    /api/admin/label-templates
       Query params: ?product_name=...&approval_status=...&is_active=...
       Returns: List of templates with filters

POST   /api/admin/label-templates
       Body: { product_name, template_name, label_image_url, short_description, long_description }
       Returns: Created template

GET    /api/admin/label-templates/[id]
       Returns: Template details

PUT    /api/admin/label-templates/[id]
       Body: Partial template fields to update
       Returns: Updated template

DELETE /api/admin/label-templates/[id]
       Returns: Success (soft delete)

POST   /api/admin/label-templates/[id]/approve
       Returns: Approved template

POST   /api/admin/label-templates/[id]/reject
       Body: { rejection_reason: string (optional) }
       Returns: Rejected template

POST   /api/admin/label-templates/upload
       Body: FormData with 'file' and 'product_name'
       Returns: { url, filename, size, contentType }
```

### Supplier Endpoints

```
GET    /api/supplier/label-templates
       Query params: ?product_name=...
       Returns: List of approved templates only
```

## Security Features

- **Authentication**: All admin endpoints require `verifyAdminAuth()`
- **Rate Limiting**: 
  - Upload endpoint: 10 req/min (strict)
  - Other endpoints: 20 req/min (moderate)
- **Input Validation**: All inputs validated with Zod schemas
- **File Validation**: Image uploads validated for type, size (max 5MB)
- **Image Optimization**: Images automatically optimized before S3 upload
- **Audit Logging**: All admin actions logged via `logAdminAction()` and `securityLogger`
- **Soft Deletes**: Templates are never permanently deleted, only hidden

## S3 Storage Structure

```
label-templates/
  ├── premium-nitrogen-fertilizer/
  │   ├── 1706234567890-label.png
  │   └── 1706234890123-label-updated.png
  ├── organic-pesticide/
  │   └── 1706235123456-label.jpg
  └── ...
```

## Testing Checklist

1. **Admin Creates Template**
   - ✅ Upload label image to S3
   - ✅ Fill in product name, template name, descriptions
   - ✅ Submit creates template with 'pending' status
   - ✅ Template appears in list view

2. **Admin Approves Template**
   - ✅ Click approve button
   - ✅ Status changes to 'approved'
   - ✅ Approval timestamp recorded

3. **Supplier Sees Template**
   - ✅ Login as supplier
   - ✅ Start creating new product
   - ✅ Enter matching product name
   - ✅ Template dropdown appears (after 3+ characters)
   - ✅ Only approved templates shown

4. **Supplier Uses Template**
   - ✅ Select template from dropdown
   - ✅ Short description auto-fills
   - ✅ Long description auto-fills
   - ✅ Label image is set
   - ✅ Can still edit descriptions manually
   - ✅ Product saves with label_template_id reference

5. **Admin Edits Template**
   - ✅ Navigate to template edit page
   - ✅ Update fields
   - ✅ Submit updates template
   - ✅ Changes reflected immediately

6. **Admin Deletes Template**
   - ✅ Click delete button
   - ✅ Confirm deletion
   - ✅ Template hidden from suppliers
   - ✅ Template retained in database (soft delete)

## Common Use Cases

### Use Case 1: Standard Product Labels
**Scenario**: You have multiple sizes of the same product (e.g., 50lb, 100lb bags)

1. Create template: "Nitrogen Fertilizer - Standard Label"
2. Upload the standard label image
3. Add generic descriptions
4. Approve template
5. Suppliers select this template for all nitrogen fertilizer products
6. They customize the container size, pricing, etc. while keeping descriptions consistent

### Use Case 2: Seasonal Products
**Scenario**: Products with recurring seasonal availability

1. Create template with product name and seasonal details
2. Include availability dates in descriptions
3. Approve template
4. Suppliers reuse template each season
5. Update template annually to reflect new dates

### Use Case 3: Regulated Products
**Scenario**: Products requiring EPA-approved label language

1. Create template with exact EPA-approved text
2. Upload official label image
3. Approve template
4. Suppliers use template to ensure compliance
5. Prevents manual entry errors in regulatory text

## Troubleshooting

### Template Dropdown Not Appearing
- Ensure product name has 3+ characters
- Check if any templates exist for that product name
- Verify templates are approved (status = 'approved')
- Verify templates are active (is_active = true)

### Image Not Loading
- Check S3 bucket permissions
- Verify AWS credentials in .env.local
- Ensure `/api/images/proxy` endpoint is working
- Check browser console for 403 errors

### Template Not Saving
- Verify admin is authenticated
- Check label image has been uploaded (required field)
- Ensure short description is 10-500 characters
- Check browser console for validation errors

## Future Enhancements

Potential improvements for future development:

1. **Bulk Template Management**: Import/export templates via CSV
2. **Template Categories**: Group templates by product category
3. **Version History**: Track changes to templates over time
4. **Template Analytics**: See which templates are most used
5. **Duplicate Detection**: Warn about similar existing templates
6. **Multi-language Support**: Templates in multiple languages
7. **Template Search**: Advanced search with filters
8. **Template Preview**: Preview how template will look in product listing

## Related Files

- **Migration**: `migrations/040_create_label_templates.sql`
- **Validation**: `lib/validation.ts` (labelTemplateSchema)
- **Admin API**: `app/api/admin/label-templates/**`
- **Supplier API**: `app/api/supplier/label-templates/route.ts`
- **Admin Pages**: `app/admin/(dashboard)/label-templates/**`
- **Supplier Form**: `components/supplier/product-form.tsx`
- **Navigation**: `components/admin/admin-sidebar.tsx`
- **CSP Config**: `next.config.ts` (frame-src for DocuSign)
