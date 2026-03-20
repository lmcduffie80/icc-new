'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateWarehouseModal } from './create-warehouse-modal';

export function CreateWarehouseButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Warehouse
      </Button>

      <CreateWarehouseModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

