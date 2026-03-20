'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DataTable, Column } from '@/components/admin/data-table';
import { Permission } from '@/lib/permissions';
import { Edit, Trash2, Package, Save, X, Loader2 } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  description: string | null;
  price: string;
  original_price: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  icc_available_quantity: number;
  created_at: string;
  updated_at: string;
  supplier_id?: string | null;
  approval_status?: string;
  deletion_requested_at?: string | null;
  supplier_name?: string | null;
  supplier_company?: string | null;
  warehouses?: Array<{
    warehouse_id: string;
    warehouse_name: string;
    inventory_count: number;
  }>;
  total_warehouse_inventory?: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// Map complex approval statuses to simplified display status
const getSimplifiedStatus = (approvalStatus: string | undefined | null): 'pending' | 'approved' | 'rejected' | null => {
  if (!approvalStatus) return null;
  
  // Map to "Approved" 
  if (['admin_approved', 'supplier_approved', 'published'].includes(approvalStatus)) {
    return 'approved';
  }
  
  // Map to "Pending"
  if (['pending', 'label_pending_supplier_approval'].includes(approvalStatus)) {
    return 'pending';
  }
  
  // Keep "Rejected"
  if (approvalStatus === 'rejected') {
    return 'rejected';
  }
  
  return null;
};

interface ProductsTableProps {
  products: Product[];
  permissions: Permission[];
}

export function ProductsTable({ products, permissions }: ProductsTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingInventory, setEditingInventory] = useState<string | null>(null);
  const [inventoryValue, setInventoryValue] = useState<number>(0);
  const [updatingInventory, setUpdatingInventory] = useState<string | null>(null);

  const canUpdate = permissions.includes('products.update');
  const canDelete = permissions.includes('products.delete');
  const canManageInventory = permissions.includes('products.manage_inventory');

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    setDeleting(id);
    try {
      const response = await fetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete product');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    } finally {
      setDeleting(null);
    }
  };

  const handleStartEditInventory = (product: Product) => {
    setEditingInventory(product.id);
    // For supplier products, use ICC Qty if available, otherwise use inventory_count
    const initialValue = product.supplier_id && product.icc_available_quantity !== null 
      ? product.icc_available_quantity 
      : product.inventory_count;
    setInventoryValue(initialValue);
  };

  const handleCancelEditInventory = () => {
    setEditingInventory(null);
    setInventoryValue(0);
  };

  const handleSaveInventory = async (productId: string) => {
    setUpdatingInventory(productId);
    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_count: inventoryValue,
          in_stock: inventoryValue > 0,
        }),
      });

      if (response.ok) {
        router.refresh();
        setEditingInventory(null);
        setInventoryValue(0);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update inventory');
      }
    } catch (error) {
      console.error('Error updating inventory:', error);
      alert('Failed to update inventory');
    } finally {
      setUpdatingInventory(null);
    }
  };

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      parseFloat(amount)
    );

  const columns: Column<Product>[] = [
    {
      key: 'image',
      header: '',
      className: 'w-16',
      render: (product) => (
        <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-100">
          {product.image ? (
            (product.image.includes('s3.amazonaws.com') || product.image.includes('.s3.')) ? (
              // Use proxy URL for S3 images to avoid 403 errors
              <Image
                src={`/api/images/proxy?url=${encodeURIComponent(product.image)}`}
                alt={product.name}
                fill
                sizes="48px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-5 w-5 text-slate-400" />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      render: (product) => (
        <span className="text-sm text-slate-700">
          {product.sku || <span className="text-slate-400">N/A</span>}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      render: (product) => (
        <div>
          <p className="font-medium text-slate-900">{product.name}</p>
          <p className="text-sm text-slate-500">{product.category}</p>
          {product.supplier_id && (
            <p className="text-xs text-slate-400">
              Supplier: {product.supplier_company || product.supplier_name || 'Unknown'}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'approval_status',
      header: 'Status',
      render: (product) => {
        // Show deletion request alert first if present
        if (product.deletion_requested_at) {
          const simplifiedStatus = getSimplifiedStatus(product.approval_status);
          return (
            <div className="flex flex-col gap-1">
              <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-red-100 text-red-800">
                Deletion Requested
              </span>
              {simplifiedStatus && (
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    statusColors[simplifiedStatus]
                  }`}
                >
                  {statusLabels[simplifiedStatus]}
                </span>
              )}
            </div>
          );
        }
        
        // Show simplified status for all products
        const simplifiedStatus = getSimplifiedStatus(product.approval_status);
        
        // If no approval_status, default to 'approved' for non-supplier products (legacy products)
        const displayStatus = simplifiedStatus || (product.supplier_id ? 'pending' : 'approved');
        
        return (
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
              statusColors[displayStatus]
            }`}
          >
            {statusLabels[displayStatus]}
          </span>
        );
      },
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      render: (product) => (
        <p className="font-medium text-slate-900">{formatCurrency(product.price)}</p>
      ),
    },
    {
      key: 'original_price',
      header: 'Supplier Price',
      sortable: true,
      render: (product) => (
        <p className="font-medium text-slate-700">
          {product.original_price ? formatCurrency(product.original_price) : <span className="text-slate-400">—</span>}
        </p>
      ),
    },
    {
      key: 'inventory_count',
      header: 'Inventory',
      sortable: true,
      render: (product) => {
        const isEditing = editingInventory === product.id;
        const isUpdating = updatingInventory === product.id;

        if (isEditing && canManageInventory) {
          return (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={inventoryValue}
                onChange={(e) => setInventoryValue(parseInt(e.target.value) || 0)}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                disabled={isUpdating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveInventory(product.id);
                  } else if (e.key === 'Escape') {
                    handleCancelEditInventory();
                  }
                }}
              />
              <button
                onClick={() => handleSaveInventory(product.id)}
                disabled={isUpdating}
                className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                title="Save"
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={handleCancelEditInventory}
                disabled={isUpdating}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        }

        // Calculate display count:
        // 1. If product has warehouses, always use the sum of warehouse inventory
        // 2. For supplier products without warehouses, show ICC Qty if available
        // 3. Otherwise, show inventory_count from products table
        let displayCount: number;
        if (product.warehouses && product.warehouses.length > 0) {
          // Sum all warehouse inventory counts (always use this if warehouses exist)
          displayCount = product.warehouses.reduce((sum, wh) => sum + (wh.inventory_count || 0), 0);
        } else if (product.supplier_id && product.icc_available_quantity !== null) {
          displayCount = product.icc_available_quantity;
        } else {
          displayCount = product.inventory_count;
        }

        return (
          <div className="flex items-center gap-2">
            {canManageInventory ? (
              <span
                className="font-medium cursor-pointer hover:text-emerald-600"
                onClick={() => handleStartEditInventory(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleStartEditInventory(product);
                  }
                }}
                role="button"
                tabIndex={0}
                title="Click to edit inventory"
              >
                {displayCount}
              </span>
            ) : (
              <span className="font-medium">
                {displayCount}
              </span>
            )}
            {product.warehouses && product.warehouses.length > 0 && (
              <span className="text-xs text-slate-400" title={`Sum of ${product.warehouses.length} warehouse(s)`}>
                ({product.warehouses.length} warehouse{product.warehouses.length > 1 ? 's' : ''})
              </span>
            )}
            {product.supplier_id && product.icc_available_quantity !== null && (
              <span className="text-xs text-slate-400">
                (ICC: {product.icc_available_quantity})
              </span>
            )}
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                product.in_stock
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {product.in_stock ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (product) => (
        <span className="text-slate-500">
          {new Date(product.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const handleApproveDeletion = async (productId: string) => {
    if (!confirm('Are you sure you want to approve the deletion of this product? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/products/${productId}/deletion/approve`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to approve deletion');
        return;
      }

      router.refresh();
      alert('Product deletion approved. The product has been removed from the store.');
    } catch (error) {
      console.error('Error approving deletion:', error);
      alert('Failed to approve deletion');
    }
  };

  const handleRejectDeletion = async (productId: string) => {
    const reason = prompt('Please provide a reason for rejecting this deletion request (optional):');
    
    try {
      const response = await fetch(`/api/admin/products/${productId}/deletion/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || '' }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to reject deletion');
        return;
      }

      router.refresh();
      alert('Deletion request rejected. The product remains in the store.');
    } catch (error) {
      console.error('Error rejecting deletion:', error);
      alert('Failed to reject deletion');
    }
  };

  const actions = (product: Product) => (
    <div className="flex items-center justify-end gap-2">
      {/* Deletion request actions */}
      {product.deletion_requested_at && canDelete && (
        <>
          <button
            onClick={() => handleApproveDeletion(product.id)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            title="Approve deletion"
          >
            Approve Deletion
          </button>
          <button
            onClick={() => handleRejectDeletion(product.id)}
            className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            title="Reject deletion"
          >
            Reject
          </button>
        </>
      )}
      {/* Normal approval review */}
      {!product.deletion_requested_at && product.supplier_id && product.approval_status === 'pending' && canUpdate && (
        <Link
          href={`/admin/products/${product.id}/approve`}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
        >
          Review
        </Link>
      )}
      {canUpdate && (
        <Link
          href={`/admin/products/${product.id}`}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Edit className="h-4 w-4" />
        </Link>
      )}
      {canDelete && !product.deletion_requested_at && (
        <button
          onClick={() => handleDelete(product.id)}
          disabled={deleting === product.id}
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <DataTable
      data={products}
      columns={columns}
      keyExtractor={(product) => product.id}
      searchKeys={['name', 'category', 'description']}
      searchPlaceholder="Search products..."
      emptyMessage="No products found"
      actions={canUpdate || canDelete ? actions : undefined}
    />
  );
}

