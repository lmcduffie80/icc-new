import type { Metadata } from 'next';
import { getStoreInfo, formatAddress } from '@/lib/store-info';

export const metadata: Metadata = {
  title: 'Terms of Service | Innovative Crop Care, LLC',
  description: 'Terms and conditions for using Innovative Crop Care services and products.',
};

export default async function TermsPage() {
  const storeInfo = await getStoreInfo();
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Terms of Service
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Last Updated: December 2, 2025
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          {/* Introduction */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              1. Agreement to Terms
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to Innovative Crop Care. These Terms of Service (&ldquo;Terms&rdquo;) govern your use of our website, products, and services. By accessing or using our website, you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not access our services.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting to the website. Your continued use of our services after changes are posted constitutes acceptance of the modified Terms.
            </p>
          </section>

          {/* Eligibility */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              2. Eligibility
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You must be at least 18 years old to use our services and make purchases. By using our website, you represent and warrant that you are of legal age and have the legal capacity to enter into these Terms.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              If you are using our services on behalf of a business or organization, you represent that you have the authority to bind that entity to these Terms.
            </p>
          </section>

          {/* Account Registration */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              3. Account Registration
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              To access certain features of our services, you may be required to create an account. You agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We reserve the right to suspend or terminate accounts that violate these Terms or are inactive for extended periods.
            </p>
          </section>

          {/* Products and Orders */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              4. Products and Orders
            </h2>
            
            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.1 Product Information</h3>
              <p className="text-muted-foreground leading-relaxed">
                We strive to provide accurate product descriptions, images, and pricing. However, we do not warrant that product descriptions, images, or other content is accurate, complete, or error-free. If a product is not as described, your sole remedy is to return it in accordance with our Returns Policy.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.2 Pricing and Availability</h3>
              <p className="text-muted-foreground leading-relaxed">
                All prices are subject to change without notice. We reserve the right to limit quantities, discontinue products, or refuse orders at our discretion. In the event of a pricing error, we will notify you and give you the option to cancel your order or proceed at the correct price.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.3 Order Acceptance</h3>
              <p className="text-muted-foreground leading-relaxed">
                Your receipt of an order confirmation does not constitute our acceptance of your order. We reserve the right to accept or decline your order for any reason, including product availability, errors in pricing or product information, or suspected fraudulent activity.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.4 Payment</h3>
              <p className="text-muted-foreground leading-relaxed">
                Payment is due at the time of purchase. We accept major credit cards, debit cards, and PayPal. By providing payment information, you represent that you are authorized to use the payment method and authorize us to charge the full amount to your payment method.
              </p>
            </div>
          </section>

          {/* Shipping and Delivery */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              5. Shipping and Delivery
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Shipping and delivery terms are outlined in our Shipping Policy. We are not responsible for delays caused by shipping carriers, natural disasters, or other circumstances beyond our control. Risk of loss and title pass to you upon delivery to the carrier.
            </p>
          </section>

          {/* Returns and Refunds */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              6. Returns and Refunds
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Our Returns Policy governs returns and refunds. Please review our Returns Policy for complete information on eligible items, return procedures, and refund processing.
            </p>
          </section>

          {/* Product Use and Safety */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              7. Product Use and Safety
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Agricultural products, including pesticides, fertilizers, and chemicals, must be used in accordance with:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>All applicable federal, state, and local laws and regulations</li>
              <li>Manufacturer instructions and product labels</li>
              <li>Industry best practices and safety guidelines</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You are solely responsible for the proper storage, handling, application, and disposal of all products purchased. We are not liable for misuse, improper application, or failure to follow safety guidelines.
            </p>
          </section>

          {/* Intellectual Property */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              8. Intellectual Property Rights
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              All content on our website, including text, graphics, logos, images, videos, and software, is the property of Innovative Crop Care or its licensors and is protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You may not reproduce, distribute, modify, create derivative works from, publicly display, or exploit any content without our express written permission.
            </p>
          </section>

          {/* Prohibited Activities */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              9. Prohibited Activities
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You may not use our services to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Violate any laws or regulations</li>
              <li>Infringe upon intellectual property rights</li>
              <li>Transmit harmful code or malware</li>
              <li>Engage in fraudulent activities</li>
              <li>Harass, abuse, or harm others</li>
              <li>Interfere with website functionality or security</li>
              <li>Collect user data without authorization</li>
              <li>Impersonate any person or entity</li>
              <li>Use automated systems to access our website (scraping, bots)</li>
            </ul>
          </section>

          {/* Disclaimers and Warranties */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              10. Disclaimers and Warranties
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              OUR SERVICES AND PRODUCTS ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We do not warrant that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Our services will be uninterrupted, secure, or error-free</li>
              <li>Products will meet your specific requirements</li>
              <li>Results from product use will be as expected</li>
              <li>All errors will be corrected</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Any advice or information obtained from us does not create any warranty not expressly stated in these Terms.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              11. Limitation of Liability
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, INNOVATIVE CROP CARE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE, ARISING OUT OF OR RELATED TO THESE TERMS OR YOUR USE OF OUR SERVICES.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Our total liability for any claims arising from or related to these Terms or our services shall not exceed the amount you paid to us in the twelve (12) months preceding the event giving rise to liability.
            </p>
          </section>

          {/* Indemnification */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              12. Indemnification
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify, defend, and hold harmless Innovative Crop Care, its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses, including legal fees, arising from:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Your use of our services</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of third parties</li>
              <li>Your use or misuse of products purchased from us</li>
            </ul>
          </section>

          {/* Governing Law */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              13. Governing Law and Dispute Resolution
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Any disputes arising from these Terms or your use of our services shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. You waive your right to participate in class action lawsuits or class-wide arbitration.
            </p>
          </section>

          {/* Severability */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              14. Severability
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If any provision of these Terms is found to be unlawful, void, or unenforceable, that provision shall be deemed severable and shall not affect the validity and enforceability of the remaining provisions.
            </p>
          </section>

          {/* Entire Agreement */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              15. Entire Agreement
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms, together with our Privacy Policy and other policies referenced herein, constitute the entire agreement between you and Innovative Crop Care regarding your use of our services and supersede all prior agreements and understandings.
            </p>
          </section>

          {/* Contact Information */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              16. Contact Information
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-6 mt-4">
              <p className="font-semibold">{storeInfo.store_name}</p>
              <p className="text-muted-foreground mt-2">Email: {storeInfo.support_email}</p>
              <p className="text-muted-foreground">Phone: {storeInfo.phone}</p>
              <p className="text-muted-foreground">Mail: {formatAddress(storeInfo)}</p>
            </div>
          </section>

          {/* Acknowledgment */}
          <section className="space-y-4 pb-8">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
              <p className="text-sm text-muted-foreground">
                BY USING OUR WEBSITE AND SERVICES, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS OF SERVICE.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

