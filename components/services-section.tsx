import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const services = [
  {
    image: '/crop-corn-field.jpg',
    heading: 'For the Farmer',
    body: 'Revolutionizing farming by communicating Crop Input Pricing with others growers in a Geographical Region, Podcasts and Videos, and ability to talk with an Agronomist.',
    cta: 'Contact Us',
    href: '/contact',
  },
  {
    image: '/crop-soil-hands.jpg',
    heading: 'The Supplier',
    body: 'Networking between one another to discuss real-life issues on the Farm. Pricing transparency to drive input costs down. Crop Planning to help the Grower realize all of their profitability potential.',
    cta: 'Contact Us',
    href: '/contact',
  },
  {
    image: '/crop-wheat-field-brown.jpg',
    heading: 'E-commerce',
    body: 'All products will be vetted and backed by a Manufacturer\'s warranty to ensure the product you put into the ground is going to work.',
    cta: 'Shop Now',
    href: '/shop',
  },
];

export function ServicesSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mb-4">Discover Our Services</h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {services.map((service) => (
            <Card key={service.heading} className="group overflow-hidden border-2 transition-all hover:border-primary/50 hover:shadow-lg p-0">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={service.image}
                  alt={service.heading}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <CardContent className="p-6">
                <h3 className="mb-3 text-xl font-semibold">{service.heading}</h3>
                <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                  {service.body}
                </p>
                <Button asChild className="w-full">
                  <Link href={service.href}>{service.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

