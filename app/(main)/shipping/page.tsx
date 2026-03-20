import type { Metadata } from 'next';
import { getStoreInfo } from '@/lib/store-info';

export const metadata: Metadata = {
  title: 'Shipping Information | Innovative Crop Care, LLC',
  description: 'Everything you need to know about our shipping policies and delivery options.',
};

export default async function ShippingPage() {
  const storeInfo = await getStoreInfo();
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Shipping Information
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to know about our shipping policies and delivery options
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-12">
          {/* Shipping Options */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Shipping Options
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
                <h3 className="text-lg font-semibold">Standard Shipping</h3>
                <p className="mt-2 text-3xl font-bold">$9.99</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Delivery in 5-7 business days
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li>✓ Free on orders over $150</li>
                  <li>✓ Tracking included</li>
                  <li>✓ Signature not required</li>
                </ul>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
                <h3 className="text-lg font-semibold">Expedited Shipping</h3>
                <p className="mt-2 text-3xl font-bold">$24.99</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Delivery in 2-3 business days
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li>✓ Priority handling</li>
                  <li>✓ Real-time tracking</li>
                  <li>✓ Signature on delivery</li>
                </ul>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
                <h3 className="text-lg font-semibold">Bulk/Freight</h3>
                <p className="mt-2 text-3xl font-bold">Custom</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Delivery in 7-14 business days
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li>✓ Pallet shipping available</li>
                  <li>✓ Flexible scheduling</li>
                  <li>✓ Dedicated support</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Shipping Zones */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Shipping Zones & Restrictions
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Domestic Shipping</h3>
                <p className="text-muted-foreground">
                  We ship to all 50 states within the United States. Shipping times and costs may vary based on your location. Alaska and Hawaii orders may require additional shipping time and fees.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Product Restrictions</h3>
                <p className="text-muted-foreground">
                  Certain agricultural chemicals and pesticides may have state-specific shipping restrictions. These restrictions are clearly marked on product pages. If you have questions about shipping a specific product to your state, please contact our support team.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">International Shipping</h3>
                <p className="text-muted-foreground">
                  International shipping is currently unavailable for most products due to agricultural import/export regulations. Please contact us at international@innovativecropcare.com for special requests.
                </p>
              </div>
            </div>
          </section>

          {/* Processing Time */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Order Processing
            </h2>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Orders are typically processed within 1-2 business days. You will receive an email confirmation when your order is placed and another email with tracking information once your order ships.
              </p>
              <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
                <h3 className="font-semibold mb-3">Order Processing Timeline</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><strong>Orders placed before 2 PM EST:</strong> Typically ship same business day</li>
                  <li><strong>Orders placed after 2 PM EST:</strong> Ship next business day</li>
                  <li><strong>Weekend orders:</strong> Begin processing on Monday</li>
                  <li><strong>Holiday orders:</strong> May experience delays during peak seasons</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Tracking */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Order Tracking
            </h2>
            <p className="text-muted-foreground">
              Once your order ships, you&apos;ll receive a confirmation email with your tracking number. You can track your package using the carrier&apos;s tracking system. Please allow 24 hours for tracking information to update after receiving your shipping confirmation.
            </p>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
              <h3 className="font-semibold mb-2">Having trouble with delivery?</h3>
              <p className="text-sm text-muted-foreground">
                If your package is delayed or has delivery issues, please contact us at shipping@innovativecropcare.com with your order number, and we&apos;ll work with the carrier to resolve the issue quickly.
              </p>
            </div>
          </section>

          {/* Damaged Packages */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Damaged or Lost Packages
            </h2>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                We take great care in packaging all orders to ensure safe delivery. However, if you receive a damaged package or if your order is lost in transit:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Take photos of any damage to the packaging and products</li>
                <li>Contact us within 48 hours of delivery at {storeInfo.support_email}</li>
                <li>Provide your order number and tracking information</li>
                <li>We&apos;ll file a claim with the carrier and send a replacement or issue a refund</li>
              </ul>
            </div>
          </section>

          {/* Contact CTA */}
          <div className="mt-16 rounded-lg border border-border/40 bg-muted/20 p-8 text-center">
            <h3 className="text-xl font-semibold">Questions about shipping?</h3>
            <p className="mt-2 text-muted-foreground">
              Our customer service team is ready to help with your shipping questions.
            </p>
            <a
              href="/contact"
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Contact Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

