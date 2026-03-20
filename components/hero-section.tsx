import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden">
      {/* Full-bleed background image */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/hero-corn-field.jpg"
          alt="Corn field"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="mb-6 text-balance leading-tight text-white">
          Revolutionizing the Future of Ag Technology
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-white/90">
          At the forefront of a global transformation, our agricultural practices harness the power of innovation to feed a growing world sustainably. Join us in redefining the future of farming with cutting-edge technologies that set the standard for tomorrow.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/contact">Start Your Journey to Better Yields</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

