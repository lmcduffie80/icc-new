import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import { ApprovalForm } from './approval-form';

interface PODetails {
  id: number;
  po_number: string;
  vendor_id: number | null;
  supplier_id: string | null;
  vendor_name: string | null;
  supplier_name: string | null;
  supplier_address_street: string | null;
  supplier_address_city: string | null;
  supplier_address_state: string | null;
  supplier_address_zip: string | null;
  order_date: string;
  buyer_name: string;
  payment_terms: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes: string | null;
  ship_to_company: string;
  ship_to_address: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
}

interface POLine {
  line_number: number;
  item_number: string;
  description: string;
  quantity: number;
  uom: string;
  unit_price: number;
  taxable: boolean;
  line_total: number;
}

interface ApprovalRequest {
  id: number;
  requested_by: string | null;
  requested_at: string;
  status: string;
  assigned_to_name: string | null;
}

async function getPOWithApproval(poId: number) {
  const po = await queryOne<PODetails>(`
    SELECT 
      po.id, po.po_number, po.vendor_id, po.supplier_id,
      v.name as vendor_name,
      su.company_name as supplier_name,
      su.address_street as supplier_address_street,
      su.address_city as supplier_address_city,
      su.address_state as supplier_address_state,
      su.address_zip as supplier_address_zip,
      po.order_date, po.buyer_name, po.payment_terms,
      po.subtotal_amount, po.tax_amount, po.total_amount, po.status, po.notes,
      ship.company_name as ship_to_company, ship.address1 as ship_to_address,
      ship.city as ship_to_city, ship.state as ship_to_state, ship.zip_code as ship_to_zip
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    LEFT JOIN supplier_users su ON su.id = po.supplier_id
    LEFT JOIN addresses ship ON ship.id = po.ship_to_address_id
    WHERE po.id = $1
  `, [poId]);

  const lines = await query<POLine>(`
    SELECT line_number, item_number, description, quantity, uom, unit_price, taxable, line_total
    FROM purchase_order_lines
    WHERE purchase_order_id = $1
    ORDER BY line_number
  `, [poId]);

  const approval = await queryOne<ApprovalRequest>(`
    SELECT ar.id, ar.requested_by, ar.requested_at, ar.status,
           au.name as assigned_to_name
    FROM po_approval_requests ar
    LEFT JOIN admin_users au ON au.id = ar.assigned_to
    WHERE ar.purchase_order_id = $1
    ORDER BY ar.created_at DESC
    LIMIT 1
  `, [poId]);

  return { po, lines, approval };
}

export default async function POApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    redirect('/admin/auth/signin');
  }

  const { id } = await params;
  const poId = parseInt(id, 10);

  if (isNaN(poId)) {
    redirect('/admin/purchase-orders');
  }

  const { po, lines, approval } = await getPOWithApproval(poId);

  if (!po) {
    redirect('/admin/purchase-orders');
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Purchase Order Approval</h1>
        <p className="text-muted-foreground">Review and approve purchase order {po.po_number}</p>
      </div>

      <div className="grid gap-6">
        {/* PO Header Info */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Order Information</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">PO Number</dt>
              <dd className="text-lg font-semibold">{po.po_number}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Status</dt>
              <dd className="text-lg">
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  po.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                  po.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {po.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{po.supplier_id ? 'Supplier' : 'Vendor'}</dt>
              <dd className="text-lg">{po.supplier_name || po.vendor_name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Buyer</dt>
              <dd className="text-lg">{po.buyer_name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Order Date</dt>
              <dd className="text-lg">{new Date(po.order_date).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Payment Terms</dt>
              <dd className="text-lg">{po.payment_terms.replace(/_/g, ' ')}</dd>
            </div>
          </dl>
        </div>

        {/* Supplier Address */}
        {po.supplier_id && (po.supplier_address_street || po.supplier_address_city) && (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-xl font-semibold mb-4">Supplier Address</h2>
            {po.supplier_address_street && (
              <p className="text-sm">{po.supplier_address_street}</p>
            )}
            {(po.supplier_address_city || po.supplier_address_state || po.supplier_address_zip) && (
              <p className="text-sm">
                {[po.supplier_address_city, po.supplier_address_state, po.supplier_address_zip]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Ship To Address */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Ship To</h2>
          <p className="text-sm">{po.ship_to_company}</p>
          <p className="text-sm">{po.ship_to_address}</p>
          <p className="text-sm">{po.ship_to_city}, {po.ship_to_state} {po.ship_to_zip}</p>
        </div>

        {/* Line Items */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Line Items</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Item Number</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                  <th className="pb-2 font-medium">UOM</th>
                  <th className="pb-2 font-medium text-right">Unit Price</th>
                  <th className="pb-2 font-medium text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.line_number} className="border-b">
                    <td className="py-2">{line.line_number}</td>
                    <td className="py-2">{line.item_number}</td>
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    <td className="py-2">{line.uom}</td>
                    <td className="py-2 text-right">${Number(line.unit_price).toFixed(2)}</td>
                    <td className="py-2 text-right font-medium">${Number(line.line_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="rounded-lg border bg-card p-6">
          <dl className="space-y-2 max-w-sm ml-auto">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal:</dt>
              <dd className="font-medium">${Number(po.subtotal_amount).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax:</dt>
              <dd className="font-medium">${Number(po.tax_amount).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt className="text-lg font-semibold">Total:</dt>
              <dd className="text-lg font-bold">${Number(po.total_amount).toFixed(2)}</dd>
            </div>
          </dl>
        </div>

        {/* Approval Status & Actions */}
        {approval && (
          <ApprovalForm 
            poId={po.id} 
            poNumber={po.po_number}
            approvalStatus={approval.status}
            requestedAt={approval.requested_at}
            assignedTo={approval.assigned_to_name}
          />
        )}

        {po.notes && (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-xl font-semibold mb-4">Notes</h2>
            <p className="text-sm whitespace-pre-wrap">{po.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
