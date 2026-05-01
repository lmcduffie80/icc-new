import type { Metadata } from 'next';
import { getStoreInfo } from '@/lib/store-info';

export const metadata: Metadata = {
  title: 'FAQ | Innovative Crop Care, LLC',
  description: 'Frequently asked questions about our products, services, and policies.',
};

export default async function FAQPage() {
  const storeInfo = await getStoreInfo();

  const faqs = [
    {
      category: "Orders & Products",
      questions: [
        {
          q: "How do I place an order?",
          a: "You can browse our shop, select the products you need, and proceed to checkout. We accept all major credit cards and PayPal for secure payment processing."
        },
        {
          q: "What agricultural products do you offer?",
          a: "We offer a comprehensive range of agricultural supplies including seeds, fertilizers, pesticides, irrigation equipment, and farming tools. All products are sourced from trusted manufacturers and meet industry standards."
        },
        {
          q: "Do you offer bulk pricing?",
          a: "Yes! We offer competitive bulk pricing for large orders. Contact our sales team for a custom quote based on your specific needs."
        },
        {
          q: "Are your products certified organic?",
          a: "We carry both conventional and USDA certified organic products. Each product listing clearly indicates its certification status."
        }
      ]
    },
    {
      category: "Shipping & Delivery",
      questions: [
        {
          q: "How long does shipping take?",
          a: "Standard shipping typically takes 5-7 business days. Expedited options are available at checkout for faster delivery within 2-3 business days."
        },
        {
          q: "Do you ship internationally?",
          a: "Currently, we ship within the United States only. International shipping may be available for certain products - please contact us for more information."
        },
        {
          q: "Can I track my order?",
          a: "Yes! Once your order ships, you'll receive a tracking number via email to monitor your delivery status in real-time."
        }
      ]
    },
    {
      category: "Returns & Refunds",
      questions: [
        {
          q: "What is your return policy?",
          a: "We accept returns within 30 days of delivery for most products. Items must be unused and in their original packaging. See our Returns page for complete details."
        },
        {
          q: "How do I initiate a return?",
          a: "Contact our customer service team with your order number, and they'll provide you with return instructions and a prepaid shipping label if applicable."
        },
        {
          q: "When will I receive my refund?",
          a: "Refunds are processed within 5-7 business days after we receive your returned items. The refund will be credited to your original payment method."
        }
      ]
    },
    {
      category: "Support",
      questions: [
        {
          q: "How can I contact customer support?",
          a: `You can reach us via our Contact page, email us at ${storeInfo.support_email}, or call us at ${storeInfo.phone} during business hours (${storeInfo.business_hours}).`
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Find answers to common questions about our products, services, and policies
          </p>
        </div>
      </div>

      {/* FAQ Content */}
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-12">
          {faqs.map((section, idx) => (
            <div key={idx} className="space-y-6">
              <h2 className="text-2xl font-semibold border-b pb-2">
                {section.category}
              </h2>
              <div className="space-y-6">
                {section.questions.map((faq, qIdx) => (
                  <div key={qIdx} className="space-y-2">
                    <h3 className="text-lg font-medium">{faq.q}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-16 rounded-lg border border-border/40 bg-muted/20 p-8 text-center">
          <h3 className="text-xl font-semibold">Still have questions?</h3>
          <p className="mt-2 text-muted-foreground">
            Our team is here to help. Contact us for personalized assistance.
          </p>
          <a
            href="/contact"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

