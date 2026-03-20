'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, Download } from 'lucide-react';
import { POEmailModal } from './po-email-modal';

interface POEmailButtonProps {
  poId: string;
  poNumber: string;
  status: string;
}

export function POEmailButton({ poId, poNumber, status }: POEmailButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/admin/purchase-orders/${poId}/pdf`);
      if (!response.ok) throw new Error('Failed to download PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${poNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  // Only show email button for approved/sent POs
  const showEmailButton = status === 'APPROVED' || status === 'SENT';

  return (
    <>
      <div className="flex gap-2">
        <Button
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          variant="outline"
        >
          <Download className="mr-2 h-4 w-4" />
          {isDownloading ? 'Downloading...' : 'Download PDF'}
        </Button>
        
        {showEmailButton && (
          <Button
            onClick={() => setShowEmailModal(true)}
          >
            <Mail className="mr-2 h-4 w-4" />
            Email to Vendor
          </Button>
        )}
      </div>

      <POEmailModal
        poId={poId}
        poNumber={poNumber}
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSuccess={() => {
          setShowEmailModal(false);
          alert('Purchase order sent successfully!');
        }}
      />
    </>
  );
}
