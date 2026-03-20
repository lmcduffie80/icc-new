import { Quote } from 'lucide-react';

const testimonials = [
  {
    quote:
      "The pricing transparency alone saved us over $15,000 on inputs this season. Being able to see what others in the area are paying changed how we negotiate.",
    author: 'Mike Johnson',
    role: 'Corn & Soybean Farmer',
    location: 'Central Iowa',
  },
  {
    quote:
      "Having direct access to agronomists who actually understand our soil conditions has been a game-changer. Their recommendations are practical and profitable.",
    author: 'Sarah Mitchell',
    role: 'Family Farm Operator',
    location: 'Southern Illinois',
  },
  {
    quote:
      "Finally, an e-commerce platform built for farmers. The products are quality, the warranties are solid, and they actually deliver when they say they will.",
    author: 'Robert Chen',
    role: 'Commercial Grower',
    location: 'Nebraska',
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mb-4">What Farmers Are Saying</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Real results from real growers across the heartland.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.author}
              className="relative rounded-xl bg-card p-8 shadow-sm border border-border"
            >
              <Quote className="absolute right-6 top-6 h-8 w-8 text-primary/20" />
              <p className="mb-6 text-muted-foreground leading-relaxed italic">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="border-t border-border pt-4">
                <div className="font-semibold">{testimonial.author}</div>
                <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                <div className="text-sm text-primary">{testimonial.location}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
