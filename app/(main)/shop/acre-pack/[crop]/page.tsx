import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { AcrePackBuilder } from './acre-pack-builder';
import { OrderByDeadline } from '@/components/crop/order-by-deadline';
import type { AcrePackProgram } from '@/app/api/acre-pack/[crop]/route';

const VALID_CROPS = ['corn', 'soybeans', 'wheat', 'cotton'];

const CROP_LABELS: Record<string, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
  cotton: 'Cotton',
};

async function getProgram(crop: string): Promise<AcrePackProgram | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/acre-pack/${crop}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ crop: string }> }
): Promise<Metadata> {
  const { crop } = await params;
  const label = CROP_LABELS[crop.toLowerCase()] ?? crop;
  return {
    title: `${label} Crop Plan | Innovative Crop Care`,
    description: `Build your complete ${label.toLowerCase()} input plan. Select products for each application pass, adjust rates, and add everything to your cart.`,
  };
}

export default async function AcrePackCropPage(
  { params }: { params: Promise<{ crop: string }> }
) {
  const { crop } = await params;
  const cropLower = crop.toLowerCase();

  if (!VALID_CROPS.includes(cropLower)) {
    notFound();
  }

  const program = await getProgram(cropLower);

  if (!program) {
    notFound();
  }

  // Get farm zip for logged-in users (for order-by deadline)
  let farmZip: string | null = null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    const farm = await queryOne<{ zip_code: string }>(
      `SELECT zip_code FROM farm_profiles WHERE user_id = $1`,
      [session.user.id]
    );
    farmZip = farm?.zip_code ?? null;
  }

  return (
    <div className="flex flex-col">
      {/* Breadcrumb */}
      <div className="border-b border-border/40 bg-muted/10 py-3">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/shop" className="hover:text-foreground transition-colors">
              Shop
            </Link>
            <span>/</span>
            <Link href="/shop/acre-pack" className="hover:text-foreground transition-colors">
              Crop Planning
            </Link>
            <span>/</span>
            <span className="font-medium text-foreground">{program.name}</span>
          </nav>
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-900 to-green-800 py-10 text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/shop/acre-pack"
            className="mb-4 inline-flex items-center gap-1 text-sm text-emerald-200 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            All Programs
          </Link>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{program.name}</h1>
          {program.description && (
            <p className="mt-2 max-w-2xl text-emerald-100">{program.description}</p>
          )}
          <p className="mt-3 text-sm text-emerald-200">
            {program.passes.length} application pass{program.passes.length !== 1 ? 'es' : ''} ·{' '}
            {program.passes.reduce((sum, p) => sum + p.products.length, 0)} products available
          </p>
        </div>
      </div>

      {/* Order-by deadline (when farm zip available) */}
      {farmZip && (
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-4">
          <OrderByDeadline crop={cropLower} zip={farmZip} variant="compact" />
        </div>
      )}

      {/* Builder */}
      <AcrePackBuilder program={program} />
    </div>
  );
}
