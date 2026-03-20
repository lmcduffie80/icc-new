'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface SignContractModalProps {
  contract: {
    id: string;
    contract_type: string;
    filename: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

export function SignContractModal({ contract, onConfirm, onCancel }: SignContractModalProps) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-2xl font-bold">Sign Contract</h2>
        
        <div className="space-y-2">
          <p className="font-medium">{contract.contract_type}</p>
          <p className="text-sm text-gray-600">{contract.filename}</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <p className="text-sm">
            By clicking &ldquo;I Agree&rdquo;, you are digitally signing this contract. This action is legally binding and cannot be undone.
          </p>
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="agree"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1"
          />
          <label htmlFor="agree" className="text-sm">
            I have read and agree to the terms of this contract
          </label>
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            onClick={onConfirm}
            disabled={!agreed}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            I Agree
          </Button>
          <Button onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
