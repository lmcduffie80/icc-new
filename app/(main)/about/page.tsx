import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | Innovative Crop Care, LLC',
  description: 'Empowering farmers with cutting-edge technology and trusted partnerships.',
};

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative flex min-h-[60vh] items-center justify-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1593113598332-cd288d649433?q=80&w=2070&auto=format&fit=crop"
            alt="Modern farming and agriculture"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="mb-6 text-balance leading-tight text-white">
            About Innovative Crop Care
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-white/90">
            Empowering farmers with cutting-edge technology and trusted partnerships
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="mb-6">Our Mission</h2>
              <p className="mb-4 text-muted-foreground">
                At Innovative Crop Care, we&apos;re committed to revolutionizing agriculture through transparency, technology, and community. Our mission is to empower farmers with the tools and knowledge they need to maximize yields while minimizing costs.
              </p>
              <p className="mb-4 text-muted-foreground">
                We believe that farmers deserve access to fair pricing, expert advice, and a community of peers who understand their challenges. That&apos;s why we&apos;ve built a platform that brings together growers, suppliers, and agronomists in one collaborative ecosystem.
              </p>
              <p className="text-muted-foreground">
                Through our innovative approach to crop input pricing transparency, educational resources, and direct access to agricultural experts, we&apos;re helping to shape the future of sustainable farming.
              </p>
            </div>
            <div className="relative h-[400px] overflow-hidden rounded-lg">
              <Image
                src="/katherine-volkovski-Q_MJjEN14uk-unsplash.jpg"
                alt="Sustainable farming and modern agriculture"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4">Our Values</h2>
            <p className="text-muted-foreground">
              The principles that guide everything we do
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {values.map((value) => (
              <Card key={value.title} className="border-2">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {value.icon}
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{value.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* History Section */}
      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4">Our Story</h2>
          </div>
          <div className="space-y-8">
            {history.map((milestone, index) => (
              <div key={index} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    {milestone.year}
                  </div>
                  {index !== history.length - 1 && (
                    <div className="mt-2 h-full w-0.5 bg-border" />
                  )}
                </div>
                <div className="flex-1 pb-8">
                  <h3 className="mb-2 text-lg font-semibold">{milestone.title}</h3>
                  <p className="text-muted-foreground">{milestone.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4">Ready to Get Started?</h2>
          <p className="mb-8 text-muted-foreground">
            Explore our products or get in touch with our team
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/shop">Shop Now</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/contact">Contact Us</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

const values = [
  {
    title: 'Transparency',
    description: 'We believe in open communication and fair pricing. Farmers deserve to know exactly what they\'re paying for and why.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  },
  {
    title: 'Innovation',
    description: 'We leverage cutting-edge technology to solve age-old agricultural challenges and create new opportunities for growth.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M2 12h20"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  },
  {
    title: 'Community',
    description: 'Farming is better together. We foster connections between growers, suppliers, and experts to share knowledge and support.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
];

const history = [
  {
    year: '2022',
    title: 'The Beginning',
    description: 'Founded by a group of farmers and technologists who saw the need for greater transparency and community in agriculture.',
  },
  {
    year: '2025',
    title: 'The Launch',
    description: 'Expanded our services nationwide, serving farmers across all major agricultural regions.',
  },
];

