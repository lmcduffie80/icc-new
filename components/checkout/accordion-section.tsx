import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { CheckoutStep } from '@/lib/types/checkout';

interface AccordionSectionProps {
  step: CheckoutStep;
  title: string;
  children: React.ReactNode;
  currentStep: CheckoutStep;
  completedSteps: CheckoutStep[];
  onStepChange: (step: CheckoutStep) => void;
  stepNumber: number;
}

export function AccordionSection({
  step,
  title,
  children,
  currentStep,
  completedSteps,
  onStepChange,
  stepNumber,
}: AccordionSectionProps) {
  const isCompleted = completedSteps.includes(step);
  const isActive = currentStep === step;
  // First step (order-summary) is always expandable to prevent stuck states
  const canExpand = isCompleted || isActive || step === 'order-summary';

  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => canExpand && onStepChange(step)}
        className={`w-full px-6 py-5 flex items-center justify-between transition-colors ${
          canExpand
            ? 'cursor-pointer hover:bg-gray-50'
            : 'cursor-default opacity-60'
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isCompleted
                ? 'bg-primary text-white'
                : isActive
                ? 'bg-black text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {isCompleted ? (
              <Check className="w-5 h-5" />
            ) : (
              <span className="text-sm font-medium">{stepNumber}</span>
            )}
          </div>
          <h2
            className={`text-xl font-semibold ${
              isCompleted && !isActive ? 'text-green-700' : ''
            }`}
          >
            {title}
          </h2>
        </div>
        {canExpand &&
          (isActive ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ))}
      </button>
      {isActive && <div className="px-6 py-6 bg-gray-50">{children}</div>}
    </div>
  );
}
