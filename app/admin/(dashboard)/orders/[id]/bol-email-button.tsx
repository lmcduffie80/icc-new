'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BOLEmailModal } from './bol-email-modal';

interface BOLEmailButtonProps {
  orderId: string;
  orderNumber: string;
}

export function BOLEmailButton({ orderId, orderNumber }: BOLEmailButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsModalOpen(true)}
        variant="outline"
        size="sm"
        className="w-full"
      >
        <Mail className="h-4 w-4 mr-2" />
        Email to Carrier
      </Button>
      <BOLEmailModal
        orderId={orderId}
        orderNumber={orderNumber}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

