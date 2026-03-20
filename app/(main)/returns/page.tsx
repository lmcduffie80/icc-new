import type { Metadata } from 'next';
import { getStoreInfo } from '@/lib/store-info';

export const metadata: Metadata = {
  title: 'Returns & Refunds | Innovative Crop Care, LLC',
  description: 'We stand behind our products with a straightforward return policy.',
};

export default async function ReturnsPage() {
  const storeInfo = await getStoreInfo();
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Returns & Refunds Policy
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            We stand behind our products with a straightforward return policy
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-12">
          {/* Overview */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Return Policy Overview
            </h2>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
              <p className="text-lg">
                At Innovative Crop Care, we want you to be completely satisfied with your purchase. If you&apos;re not happy with your order, we accept returns within <strong>30 days of delivery</strong> for most products.
              </p>
            </div>
          </section>

          {/* Eligible Items */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              What Can Be Returned?
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-green-500/20 bg-primary/5 p-6">
                <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
                  ✓ Eligible for Return
                </h3>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li>• Unopened seeds in original packaging</li>
                  <li>• Unused equipment and tools</li>
                  <li>• Irrigation supplies in original condition</li>
                  <li>• Books and educational materials</li>
                  <li>• Defective or damaged products</li>
                  <li>• Items that arrived incorrectly</li>
                </ul>
              </div>

              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6">
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">
                  ✗ Not Eligible for Return
                </h3>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li>• Opened seed packets</li>
                  <li>• Used or opened fertilizers</li>
                  <li>• Pesticides and chemicals (unless defective)</li>
                  <li>• Custom or special order items</li>
                  <li>• Clearance or final sale items</li>
                  <li>• Gift cards</li>
                </ul>
              </div>
            </div>
            <div className="rounded-lg border border-border/40 bg-yellow-500/5 p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> For safety and regulatory reasons, certain agricultural chemicals cannot be returned once shipped. Please verify product details before ordering.
              </p>
            </div>
          </section>

          {/* Return Process */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              How to Return an Item
            </h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-medium">Contact Us</h3>
                  <p className="mt-1 text-muted-foreground">
                    Email {storeInfo.support_email} or call {storeInfo.phone} with your order number. Our team will review your request and provide return authorization if eligible.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-medium">Pack Your Items</h3>
                  <p className="mt-1 text-muted-foreground">
                    Securely package the items in their original packaging if possible. Include all accessories, manuals, and documentation that came with the product. Include a copy of your order confirmation or packing slip.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  3
                </div>
                <div>
                  <h3 className="text-lg font-medium">Ship Your Return</h3>
                  <p className="mt-1 text-muted-foreground">
                    Use the prepaid shipping label we provide (for defective items or our error) or ship at your own cost. We recommend using a trackable shipping method. Keep your tracking number for reference.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  4
                </div>
                <div>
                  <h3 className="text-lg font-medium">Receive Your Refund</h3>
                  <p className="mt-1 text-muted-foreground">
                    Once we receive and inspect your return, we&apos;ll process your refund within 5-7 business days. Refunds are issued to the original payment method.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Refund Information */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Refund Details
            </h2>
            <div className="space-y-4">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
                <h3 className="font-semibold mb-3">Refund Processing Time</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong>Inspection:</strong> 2-3 business days after receiving your return</li>
                  <li>• <strong>Processing:</strong> 5-7 business days to process refund</li>
                  <li>• <strong>Bank Processing:</strong> Additional 3-5 business days depending on your financial institution</li>
                </ul>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-6">
                <h3 className="font-semibold mb-3">Refund Amount</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Full purchase price for defective items or our error</li>
                  <li>• Purchase price minus return shipping for customer preference returns</li>
                  <li>• Original shipping charges are non-refundable (except for defective items)</li>
                  <li>• Restocking fee of 15% may apply to certain equipment returns</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Exchanges */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Exchanges
            </h2>
            <p className="text-muted-foreground">
              If you&apos;d like to exchange an item for a different product, please return the original item following our return process and place a new order for the desired product. This ensures you receive your replacement as quickly as possible.
            </p>
            <p className="text-muted-foreground">
              For defective or damaged items, we&apos;ll expedite the exchange process and ship your replacement immediately upon notification.
            </p>
          </section>

          {/* Defective Products */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">
              Defective or Damaged Items
            </h2>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-6 space-y-4">
              <p className="text-muted-foreground">
                If you receive a defective or damaged product, please contact us immediately. We&apos;ll make it right with a full refund or replacement, whichever you prefer.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>For damaged items, please:</strong>
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground ml-4">
                <li>• Take photos of the damage</li>
                <li>• Keep all packaging materials</li>
                <li>• Contact us within 48 hours of delivery</li>
                <li>• Provide your order number and description of the issue</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                We&apos;ll provide a prepaid return label and process your refund or replacement immediately.
              </p>
            </div>
          </section>

          {/* Contact CTA */}
          <div className="mt-16 rounded-lg border border-border/40 bg-muted/20 p-8 text-center">
            <h3 className="text-xl font-semibold">Need to return an item?</h3>
            <p className="mt-2 text-muted-foreground">
              Contact our customer service team to start your return.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/contact"
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
              >
                Contact Support
              </a>
              <a
                href={`mailto:${storeInfo.support_email}`}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
              >
                Email Support Team
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

