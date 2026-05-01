import type { Plan } from '@/lib/tenant';

interface AgroVusBadgeProps {
  plan: Plan | null;
}

/**
 * "Powered by Agrovus" footer badge.
 * Suppressed automatically for Enterprise tenants with white_label: true.
 */
export function AgroVusBadge({ plan }: AgroVusBadgeProps) {
  if (plan?.features?.white_label === true) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <a
        href="https://agrovus.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
      >
        Powered by{' '}
        <span className="font-semibold text-foreground">Agrovus</span>
      </a>
    </div>
  );
}
