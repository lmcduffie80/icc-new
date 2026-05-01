import type { Metadata } from 'next';
import { getStoreInfo, formatAddress } from '@/lib/store-info';

export const metadata: Metadata = {
  title: 'Privacy Policy | Innovative Crop Care, LLC',
  description: 'Learn how Innovative Crop Care protects your privacy and handles your personal information.',
};

export default async function PrivacyPage() {
  const storeInfo = await getStoreInfo();
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Privacy Policy
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
              1. Introduction
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Innovative Crop Care (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services. Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              2. Information We Collect
            </h2>
            
            <div className="space-y-4">
              <h3 className="text-xl font-medium">2.1 Personal Information</h3>
              <p className="text-muted-foreground leading-relaxed">
                We may collect personal information that you voluntarily provide to us when you:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Register for an account</li>
                <li>Place an order</li>
                <li>Subscribe to our newsletter</li>
                <li>Contact customer support</li>
                <li>Participate in surveys or promotions</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                This information may include: name, email address, phone number, shipping address, billing address, payment information, and farm/business details.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium">2.2 Automatically Collected Information</h3>
              <p className="text-muted-foreground leading-relaxed">
                When you visit our website, we automatically collect certain information about your device and browsing actions, including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>IP address and location data</li>
                <li>Browser type and version</li>
                <li>Operating system</li>
                <li>Pages visited and time spent on pages</li>
                <li>Referring website addresses</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              3. How We Use Your Information
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the information we collect for various purposes, including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Processing and fulfilling your orders</li>
              <li>Managing your account and providing customer support</li>
              <li>Sending order confirmations, shipping updates, and service notifications</li>
              <li>Processing payments and preventing fraud</li>
              <li>Personalizing your experience and product recommendations</li>
              <li>Sending marketing communications (with your consent)</li>
              <li>Analyzing website usage and improving our services</li>
              <li>Complying with legal obligations</li>
              <li>Enforcing our terms and conditions</li>
            </ul>
          </section>

          {/* Information Sharing */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              4. How We Share Your Information
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We may share your information in the following circumstances:
            </p>
            
            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.1 Service Providers</h3>
              <p className="text-muted-foreground leading-relaxed">
                We share information with third-party service providers who perform services on our behalf, such as payment processing, shipping, email delivery, customer service, and marketing assistance.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.2 Business Transfers</h3>
              <p className="text-muted-foreground leading-relaxed">
                If we are involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.3 Legal Requirements</h3>
              <p className="text-muted-foreground leading-relaxed">
                We may disclose your information if required by law, court order, or governmental request, or to protect our rights, property, or safety.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium">4.4 With Your Consent</h3>
              <p className="text-muted-foreground leading-relaxed">
                We may share your information for any other purpose with your explicit consent.
              </p>
            </div>
          </section>

          {/* Data Security */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              5. Data Security
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your personal information from unauthorized access, disclosure, alteration, or destruction. These measures include:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>SSL encryption for data transmission</li>
              <li>Secure payment processing through PCI-compliant providers</li>
              <li>Regular security audits and updates</li>
              <li>Restricted access to personal information</li>
              <li>Employee training on data protection</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          {/* Your Rights */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              6. Your Privacy Rights
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Depending on your location, you may have certain rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
              <li><strong>Data Portability:</strong> Request transfer of your data to another service</li>
              <li><strong>Restrict Processing:</strong> Request limitation on how we use your data</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise any of these rights, please contact us at privacy@innovativecropcare.com.
            </p>
          </section>

          {/* Cookies */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              7. Cookies and Tracking Technologies
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar tracking technologies to enhance your browsing experience, analyze site traffic, and understand where our audience comes from. You can control cookie settings through your browser preferences. Note that disabling cookies may limit certain features of our website.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Types of cookies we use include:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li><strong>Essential Cookies:</strong> Required for website functionality</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how visitors use our site</li>
              <li><strong>Marketing Cookies:</strong> Used to deliver relevant advertisements</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
            </ul>
          </section>

          {/* Third-Party Links */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              8. Third-Party Links
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Our website may contain links to third-party websites. We are not responsible for the privacy practices of these external sites. We encourage you to read the privacy policies of any third-party sites you visit.
            </p>
          </section>

          {/* Children's Privacy */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              9. Children&apos;s Privacy
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately, and we will take steps to delete such information.
            </p>
          </section>

          {/* Data Retention */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              10. Data Retention
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When we no longer need your information, we will securely delete or anonymize it.
            </p>
          </section>

          {/* Changes to Policy */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              11. Changes to This Privacy Policy
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our practices or for legal, regulatory, or operational reasons. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the &ldquo;Last Updated&rdquo; date. Your continued use of our services after changes are posted constitutes your acceptance of the updated policy.
            </p>
          </section>

          {/* Contact Us */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">
              12. Contact Us
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-6 mt-4">
              <p className="font-semibold">{storeInfo.store_name}</p>
              <p className="text-muted-foreground mt-2">Email: {storeInfo.support_email}</p>
              <p className="text-muted-foreground">Phone: {storeInfo.phone}</p>
              <p className="text-muted-foreground">Mail: {formatAddress(storeInfo)}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

