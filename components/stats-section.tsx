import { TrendingUp, Users, MapPin, Award } from 'lucide-react';

const stats = [
  {
    icon: TrendingUp,
    value: '30%',
    label: 'Average Cost Savings',
    description: 'On crop inputs through pricing transparency',
  },
  {
    icon: Users,
    value: '500+',
    label: 'Farmers Connected',
    description: 'Networking across the Midwest',
  },
  {
    icon: MapPin,
    value: '12',
    label: 'States Served',
    description: 'And growing every season',
  },
  {
    icon: Award,
    value: '100%',
    label: 'Quality Guaranteed',
    description: 'All products manufacturer-backed',
  },
];

export function StatsSection() {
  return (
    <section className="bg-primary py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div className="text-3xl font-bold text-white md:text-4xl">{stat.value}</div>
              <div className="mt-1 text-sm font-medium text-white">{stat.label}</div>
              <div className="mt-1 text-xs text-white/70">{stat.description}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
