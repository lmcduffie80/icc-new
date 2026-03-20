'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DataTable, Column } from '@/components/admin/data-table';
import { Edit, Trash2, Package, Loader2, Save, X, Warehouse } from 'lucide-react';
import { getImageProxyUrl } from '@/lib/image-proxy';
import { getGallonsFromContainerSize } from '@/lib/utils';
import { MarginApprovalModal } from '@/components/supplier/margin-approval-modal';

interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: string;
  supplier_price: string | null;
  original_price: string | null;
  image: string | null;
  in_stock: boolean;
  inventory_count: number;
  created_at: string;
  approval_status: string;
  sku: string | null;
  icc_available_quantity: number;
  margin_split_percentage: string | null;
  margin_approval_status: string | null;
  margin_approval_notes: string | null;
  icc_margin_percent: string | null;
  customer_margin_percent: string | null;
  margin_proposal_source?: string | null;
  supplier_margin_approval_status?: string | null;
  admin_proposed_margin_percent?: string | null;
  admin_proposed_margin_at?: string | null;
  attributes?: { containerSizes?: string } | null;
  label_url: string | null;
  warehouses?: Array<{
    warehouse_id: string;
    warehouse_name: string;
    inventory_count: number;
  }>;
}

interface Warehouse {
  id: string;
  name: string;
  is_primary: boolean;
}

interface SupplierProductsTableProps {
  products: Product[];
}

export function SupplierProductsTable({ products }: SupplierProductsTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [editingWarehouse, setEditingWarehouse] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [updatingWarehouse, setUpdatingWarehouse] = useState<string | null>(null);
  const [approvalProduct, setApprovalProduct] = useState<Product | null>(null);

  // Fetch supplier warehouses
  useEffect(() => {
    async function fetchWarehouses() {
      try {
        const response = await fetch('/api/supplier/warehouses');
        if (response.ok) {
          const data = await response.json();
          setWarehouses(data.warehouses || []);
        }
      } catch (error) {
        console.error('Error fetching warehouses:', error);
      } finally {
        setLoadingWarehouses(false);
      }
    }
    fetchWarehouses();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) return;

    setDeleting(id);
    try {
      const response = await fetch(`/api/supplier/products/${id}`, {
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

  const formatCurrency = (amount: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      parseFloat(amount)
    );

  const handleStartEditWarehouse = (product: Product) => {
    setEditingWarehouse(product.id);
    // Set initial warehouse selection - use first warehouse if product has warehouses
    const currentWarehouse = product.warehouses && product.warehouses.length > 0
      ? product.warehouses[0].warehouse_id
      : '';
    setSelectedWarehouseId(currentWarehouse);
  };

  const handleCancelEditWarehouse = () => {
    setEditingWarehouse(null);
    setSelectedWarehouseId('');
  };

  const handleSaveWarehouse = async (productId: string) => {
    if (!selectedWarehouseId) {
      alert('Please select a warehouse');
      return;
    }

    setUpdatingWarehouse(productId);
    try {
      // Find the product to get its current ICC quantity
      const product = products.find(p => p.id === productId);
      const iccQuantity = product?.icc_available_quantity || 0;

      // Update the product with warehouse_id
      const response = await fetch(`/api/supplier/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: selectedWarehouseId,
          icc_available_quantity: iccQuantity, // Include ICC quantity to ensure inventory_count is set
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Failed to update warehouse:', data);
        alert(data.error || 'Failed to update warehouse');
        return;
      }

      await response.json();

      // Refresh the page to show updated warehouse information
      router.refresh();
      setEditingWarehouse(null);
      setSelectedWarehouseId('');
    } catch (error) {
      console.error('Error updating warehouse:', error);
      alert('Failed to update warehouse');
    } finally {
      setUpdatingWarehouse(null);
    }
  };

  const columns: Column<Product>[] = [
    {
      key: 'image',
      header: '',
      className: 'w-16',
      render: (product) => (
        <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-100">
          {product.image ? (
            <Image
              src={getImageProxyUrl(product.image) || product.image || '/placeholder.png'}
              alt={product.name}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized={product.image?.includes('s3.amazonaws.com') || product.image?.includes('.s3.')}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-5 w-5 text-slate-400" />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'label',
      header: 'Label',
      className: 'w-16',
      render: (product) => {
        if (!product.label_url) {
          return <span className="text-xs text-slate-400">No label</span>;
        }
        return (
          <a
            href={getImageProxyUrl(product.label_url) || product.label_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Image
              src={getImageProxyUrl(product.label_url) || product.label_url}
              alt="Product Label"
              width={40}
              height={40}
              className="rounded object-cover hover:opacity-75 transition-opacity"
              unoptimized
            />
          </a>
        );
      },
    },
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      render: (product) => (
        <div>
          <p className="font-medium text-slate-900">{product.name}</p>
          <p className="text-sm text-slate-500">{product.category}</p>
          {product.sku && (
            <p className="text-xs text-slate-400">SKU: {product.sku}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => {
        const badges = [];

        // Check for pending admin margin proposal
        if (product.margin_proposal_source === 'admin' && 
            product.supplier_margin_approval_status === 'pending') {
          badges.push(
            <button
              key="margin-approval"
              type="button"
              onClick={() => setApprovalProduct(product)}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors hover:cursor-pointer"
            >
              Margin Approval Needed
            </button>
          );
        }

        // Show approval status badge if exists
        if (product.approval_status && product.approval_status !== 'published') {
          const statusColors: Record<string, string> = {
            pending: 'bg-yellow-100 text-yellow-800',
            admin_approved: 'bg-blue-100 text-blue-800',
            label_pending_supplier_approval: 'bg-orange-100 text-orange-800',
            supplier_approved: 'bg-green-100 text-green-800',
            rejected: 'bg-red-100 text-red-800',
          };
          
          badges.push(
            <span
              key="approval-status"
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                statusColors[product.approval_status] || 'bg-slate-100 text-slate-800'
              }`}
            >
              {product.approval_status.replace(/_/g, ' ')}
            </span>
          );
        }

        return badges.length > 0 ? (
          <div className="flex flex-col gap-1">
            {badges}
          </div>
        ) : null;
      },
    },
    {
      key: 'price',
      header: 'Store Pricing',
      sortable: true,
      render: (product) => {
        const containerSize = product.attributes?.containerSizes || null;
        const gallons = getGallonsFromContainerSize(containerSize);
        const storePrice = parseFloat(product.price);
        const supplierPrice = parseFloat(product.supplier_price || product.price);

        if (gallons) {
          // Show per-gallon pricing for gallon-based containers
          const storePricePerGal = storePrice / gallons;

          return (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Per Gallon
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-slate-500">Store:</span>
                  <span className="font-bold text-slate-900">
                    ${storePricePerGal.toFixed(4)}/gal
                  </span>
                </div>
              </div>
              <div className="pt-1 mt-1 border-t border-slate-200">
                <div className="text-xs text-slate-500">
                  Total: ${storePrice.toFixed(2)} ({containerSize})
                </div>
              </div>
            </div>
          );
        }

        // For non-gallon products, show regular pricing
        return (
          <div>
            <p className="font-medium text-slate-900">{formatCurrency(product.price)}</p>
          </div>
        );
      },
    },
    {
      key: 'icc_available_quantity',
      header: 'ICC Qty',
      sortable: true,
      render: (product) => (
        <span className="font-medium text-slate-900">{product.icc_available_quantity}</span>
      ),
    },
    {
      key: 'margin_split_percentage',
      header: 'Margins',
      sortable: true,
      render: (product) => {
        const iccPercent = product.icc_margin_percent
          ? parseFloat(product.icc_margin_percent)
          : product.margin_split_percentage
            ? parseFloat(product.margin_split_percentage)
            : null;

        if (iccPercent === null) {
          return <span className="text-slate-400">Not set</span>;
        }

        return (
          <div className="flex flex-col gap-1">
            <div className="text-xs text-slate-600">
              ICC: {iccPercent.toFixed(1)}% •
              Supplier: {(100 - iccPercent).toFixed(1)}%
            </div>
            <div className="text-xs font-medium text-emerald-600">
              You get: ${
                (() => {
                  const supplierCost = product.original_price || product.supplier_price;
                  if (!product.price || !supplierCost) return '0.00';
                  const storePrice = parseFloat(product.price);
                  const supplierBasePrice = parseFloat(supplierCost);
                  const totalMargin = storePrice - supplierBasePrice;
                  const supplierMarginShare = totalMargin * ((100 - iccPercent) / 100);
                  return supplierMarginShare.toFixed(2);
                })()
              } per unit
            </div>
          </div>
        );
      },
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      sortable: false,
      render: (product) => {
        const isEditing = editingWarehouse === product.id;
        const isUpdating = updatingWarehouse === product.id;

        if (isEditing) {
          return (
            <div className="flex items-center gap-2">
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                disabled={isUpdating || loadingWarehouses}
              >
                <option value="">No warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} {warehouse.is_primary && '(Primary)'}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleSaveWarehouse(product.id)}
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
                onClick={handleCancelEditWarehouse}
                disabled={isUpdating}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        }

        const warehouseName = product.warehouses && product.warehouses.length > 0
          ? product.warehouses[0].warehouse_name
          : 'No warehouse';

        return (
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-slate-400" />
            <button
              type="button"
              className="cursor-pointer font-medium text-slate-700 hover:text-emerald-600 text-left bg-transparent border-0 p-0"
              onClick={() => handleStartEditWarehouse(product)}
              title="Click to edit warehouse"
            >
              {warehouseName}
            </button>
            {product.warehouses && product.warehouses.length > 1 && (
              <span className="text-xs text-slate-400">
                (+{product.warehouses.length - 1} more)
              </span>
            )}
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

  const actions = (product: Product) => (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/supplier/products/${product.id}`}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <Edit className="h-4 w-4" />
      </Link>
      <button
        onClick={() => handleDelete(product.id)}
        disabled={deleting === product.id}
        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        title="Delete product"
      >
        {deleting === product.id ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </div>
  );

  return (
    <>
      <DataTable
        data={products}
        columns={columns}
        keyExtractor={(product) => product.id}
        searchKeys={['name', 'category', 'description', 'sku']}
        searchPlaceholder="Search products..."
        emptyMessage="No approved products found"
        actions={actions}
      />

      {approvalProduct && (
        <MarginApprovalModal
          product={approvalProduct}
          onSuccess={() => {
            setApprovalProduct(null);
            router.refresh();
          }}
          onClose={() => setApprovalProduct(null)}
        />
      )}
    </>
  );
}

