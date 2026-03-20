import { DollarSign, MessageCircle, ShieldCheck, Lightbulb, Headphones, Truck } from 'lucide-react';

const features = [
  {
    icon: DollarSign,
    title: 'Pricing Transparency',
    description:
      'Compare crop input pricing with growers in your region. Make informed decisions and drive down costs together.',
  },
  {
    icon: MessageCircle,
    title: 'Farmer Network',
    description:
      'Connect with other growers to discuss real-life issues, share insights, and learn from collective experience.',
  },
  {
    icon: Headphones,
    title: 'Expert Agronomists',
    description:
      'Get direct access to professional agronomists who understand your specific crops and regional challenges.',
  },
  {
    icon: Lightbulb,
    title: 'Crop Planning Tools',
    description:
      'Comprehensive planning resources to help you realize your full profitability potential every season.',
  },
  {
    icon: ShieldCheck,
    title: 'Quality Guaranteed',
    description:
      'Every product is vetted and backed by manufacturer warranties. What goes in your ground works.',
  },
  {
    icon: Truck,
    title: 'Direct to Farm',
    description:
      'Streamlined ordering and delivery process designed around your schedule and operation needs.',
  },
];

export function WhyChooseUsSection() {
  return (
    <section className="bg-muted/30 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mb-4">Why Growers Choose Us</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            We&apos;re building tools and connections that put farmers first. Here&apos;s how we&apos;re different.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl bg-card p-6 shadow-sm transition-all hover:shadow-md border border-border"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
