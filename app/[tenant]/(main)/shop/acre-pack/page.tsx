import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Layers,
  ChevronRight,
  Wheat,
  Sprout,
  Leaf,
  Sun,
  Calculator,
  ShoppingCart,
  ClipboardList,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Innovative Crop Planning | Innovative Crop Care',
  description:
    'Build your complete crop input plan. Select your crop, enter your acreage, and get a customized product recommendation with exact quantities and cost per acre.',
};

const CROPS = [
  {
    slug: 'corn',
    label: 'Corn',
    tagline: 'Pre-emerge, post-emerge, and fungicide passes for maximum yield.',
    icon: <Sun className="h-12 w-12 text-yellow-500" />,
    gradient: 'from-yellow-400 to-amber-500',
    cardBg: 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200',
    badgeColor: 'bg-yellow-100 text-yellow-800',
    btnClass: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  },
  {
    slug: 'soybeans',
    label: 'Soybeans',
    tagline: 'Full-season weed and disease management for high-protein beans.',
    icon: <Sprout className="h-12 w-12 text-green-600" />,
    gradient: 'from-green-500 to-emerald-600',
    cardBg: 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200',
    badgeColor: 'bg-green-100 text-green-800',
    btnClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  {
    slug: 'wheat',
    label: 'Wheat',
    tagline: 'Fall burndown through spring head scab protection.',
    icon: <Wheat className="h-12 w-12 text-amber-600" />,
    gradient: 'from-amber-500 to-orange-500',
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-800',
    btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  {
    slug: 'cotton',
    label: 'Cotton',
    tagline: 'Burndown, pre-emerge, and in-season passes for cotton production.',
    icon: <Leaf className="h-12 w-12 text-sky-600" />,
    gradient: 'from-sky-500 to-blue-600',
    cardBg: 'bg-gradient-to-br from-sky-50 to-blue-50 border-sky-200',
    badgeColor: 'bg-sky-100 text-sky-800',
    btnClass: 'bg-sky-600 hover:bg-sky-700 text-white',
  },
];

const TRUST_ITEMS = [
  { icon: <Users className="h-5 w-5" />, label: 'Agronomist-curated programs' },
  { icon: <Layers className="h-5 w-5" />, label: '4 crops supported' },
  { icon: <Calculator className="h-5 w-5" />, label: 'Exact quantities calculated' },
  { icon: <CheckCircle2 className="h-5 w-5" />, label: 'No math required' },
];

const STEPS = [
  {
    step: '1',
    icon: <ClipboardList className="h-8 w-8 text-emerald-600" />,
    title: 'Pick Your Crop & Acres',
    desc: 'Choose from corn, soybeans, wheat, or cotton and enter your total acreage.',
  },
  {
    step: '2',
    icon: <Calculator className="h-8 w-8 text-emerald-600" />,
    title: 'Select Products Per Pass',
    desc: 'Walk through each application timing. Adjust rates with a slider — we calculate the exact quantity to order.',
  },
  {
    step: '3',
    icon: <ShoppingCart className="h-8 w-8 text-emerald-600" />,
    title: 'Add All to Cart',
    desc: 'Review your complete program with total cost per acre, then add everything to your cart in one click.',
  },
];

export default function AcrePackLandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-800 py-24 text-white">
        {/* Subtle field texture overlay */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-yellow-400 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-5 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Innovative Crop Planning
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-emerald-100/90 sm:text-xl">
            Stop guessing on rates and quantities. ICC agronomists have built application programs
            for every major crop. Enter your acres, pick your products, and walk out with an exact
            order — cost per acre included.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="bg-white text-emerald-900 hover:bg-emerald-50 font-bold px-8 text-base hover:cursor-pointer"
            >
              <a href="#choose-crop">
                Build My Pack
                <ChevronRight className="ml-1 h-5 w-5" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-emerald-400 text-emerald-100 hover:bg-emerald-800/60 bg-transparent px-8 text-base hover:cursor-pointer"
            >
              <Link href="/contact">Talk to an Agronomist</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-border/40 bg-emerald-900 py-4">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {TRUST_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm font-medium text-emerald-100">
                <span className="text-emerald-400">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-slate-900">How It Works</h2>
            <p className="mt-2 text-slate-500">Three steps from crop selection to cart.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map(({ step, icon, title, desc }) => (
              <div
                key={step}
                className="relative flex flex-col items-center rounded-2xl border border-border/50 bg-white p-8 text-center shadow-sm"
              >
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
                  {icon}
                </div>
                <span className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow">
                  {step}
                </span>
                <h3 className="mb-2 text-lg font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Crop cards */}
      <section id="choose-crop" className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Choose Your Crop</h2>
            <p className="mt-3 text-slate-500 text-lg">
              Every program is built by ICC agronomists using products available in our store.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {CROPS.map((crop) => (
              <div
                key={crop.slug}
                className={`group relative overflow-hidden rounded-2xl border-2 p-7 transition-all hover:shadow-xl hover:-translate-y-0.5 ${crop.cardBg}`}
              >
                {/* Decorative gradient blob */}
                <div
                  className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${crop.gradient} opacity-10 blur-2xl`}
                />
                <div className="relative">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                      {crop.icon}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${crop.badgeColor}`}>
                      {crop.label}
                    </span>
                  </div>
                  <h3 className="mb-2 text-2xl font-extrabold text-slate-900">{crop.label} Program</h3>
                  <p className="mb-6 text-sm text-slate-600 leading-relaxed">{crop.tagline}</p>
                  <Link
                    href={`/shop/acre-pack/${crop.slug}`}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-colors hover:cursor-pointer ${crop.btnClass}`}
                  >
                    Build {crop.label} Pack
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agronomist CTA */}
      <section className="border-t border-border/40 bg-gradient-to-br from-emerald-950 to-emerald-900 py-16 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700/60">
              <Users className="h-7 w-7 text-emerald-300" />
            </div>
          </div>
          <h2 className="mb-3 text-2xl font-bold sm:text-3xl">Not sure where to start?</h2>
          <p className="mb-8 text-emerald-100/80 text-lg">
            Our agronomists can build a custom program tailored to your operation, soil type, and
            yield goals — at no extra cost.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-white text-emerald-900 hover:bg-emerald-50 font-bold px-10 text-base hover:cursor-pointer"
          >
            <Link href="/contact">Talk to an Agronomist</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
