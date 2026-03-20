/**
 * PDF Generation Utilities
 * 
 * This file provides multiple PDF generation options for serverless environments.
 * Choose the option that best fits your needs and budget.
 */

/**
 * Option 1: PDFShift API (Recommended for simplicity)
 * 
 * Pros:
 * - Simple API, no authentication complexity
 * - Free tier: 100 PDFs/month
 * - Works great in serverless
 * - Good documentation
 * 
 * Cons:
 * - Requires API key
 * - Paid plans for higher volume
 * 
 * Setup:
 * 1. Sign up at https://pdfshift.io
 * 2. Get your API key
 * 3. Add to .env.local: PDFSHIFT_API_KEY=your_key
 */
export async function generatePDFWithPDFShift(html: string): Promise<Buffer> {
  console.log('PDFShift function called!');
  const apiKey = process.env.PDFSHIFT_API_KEY;
  console.log('PDFShift: API key check - exists:', !!apiKey, 'length:', apiKey?.length || 0);
  if (!apiKey) {
    console.error('PDFShift: API key is missing!');
    throw new Error('PDFSHIFT_API_KEY not configured');
  }
  console.log('PDFShift: API key found, proceeding...');

  console.log('PDFShift: Starting PDF generation...');
  console.log('PDFShift: HTML length:', html.length, 'characters');

  // PDFShift accepts HTML as source directly
  // The source can be:
  // - A URL (string starting with http:// or https://)
  // - HTML content (string)
  // - Base64 encoded HTML (data: text/html;base64,...)
  const requestBody: {
    source: string;
    landscape: boolean;
    format: string;
    margin: string;
    sandbox: boolean;
  } = {
    source: html,
    landscape: false,
    format: 'Letter',
    margin: '0.5in',
    sandbox: false, // Set to false to avoid watermarks
  };

  console.log('PDFShift: Sending request to API...');
  const response = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  console.log('PDFShift: Response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('PDFShift: API error response:', errorText);
    throw new Error(`PDFShift API error: ${response.status} ${errorText}`);
  }

  const contentType = response.headers.get('content-type');
  console.log('PDFShift: Response Content-Type:', contentType);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log('PDFShift: Received PDF buffer, size:', buffer.length, 'bytes');
  
  // Validate it's a PDF
  const pdfHeader = buffer.toString('ascii', 0, 4);
  if (pdfHeader !== '%PDF') {
    console.error('PDFShift: Response is not a valid PDF. Header:', pdfHeader);
    throw new Error('PDFShift returned invalid PDF');
  }

  console.log('PDFShift: PDF generated successfully');
  return buffer;
}

/**
 * Option 2: HTMLPDF API
 * 
 * Pros:
 * - Simple REST API
 * - Good free tier
 * - Fast conversion
 * 
 * Cons:
 * - Requires API key
 * 
 * Setup:
 * 1. Sign up at https://htmlpdfapi.com
 * 2. Get your API key
 * 3. Add to .env.local: HTMLPDF_API_KEY=your_key
 */
export async function generatePDFWithHTMLPDF(html: string): Promise<Buffer> {
  const apiKey = process.env.HTMLPDF_API_KEY;
  if (!apiKey) {
    throw new Error('HTMLPDF_API_KEY not configured');
  }

  const response = await fetch('https://htmlpdfapi.com/api/v1/pdf', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      html,
      format: 'Letter',
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTMLPDF API error: ${response.status} ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Option 3: PDFLayer API
 * 
 * Pros:
 * - Reliable service
 * - Good documentation
 * - Multiple output formats
 * 
 * Cons:
 * - Requires API key
 * 
 * Setup:
 * 1. Sign up at https://pdflayer.com
 * 2. Get your API key
 * 3. Add to .env.local: PDFLAYER_API_KEY=your_key
 */
export async function generatePDFWithPDFLayer(html: string): Promise<Buffer> {
  const apiKey = process.env.PDFLAYER_API_KEY;
  if (!apiKey) {
    throw new Error('PDFLAYER_API_KEY not configured');
  }

  // PDFLayer requires the HTML to be base64 encoded or a URL
  // For HTML content, we'll use their document parameter
  const response = await fetch(
    `https://api.pdflayer.com/api/convert?access_key=${apiKey}&document=${encodeURIComponent(html)}&format=Letter&margin=0.5in`,
    {
      method: 'GET',
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PDFLayer API error: ${response.status} ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Option 4: Browserless.io (Headless Chrome Service)
 * 
 * Pros:
 * - Most accurate rendering (real browser)
 * - Handles complex CSS/JS
 * - Good for complex documents
 * 
 * Cons:
 * - More expensive
 * - Requires API key
 * 
 * Setup:
 * 1. Sign up at https://www.browserless.io
 * 2. Get your API key
 * 3. Add to .env.local: BROWSERLESS_API_KEY=your_key
 */
export async function generatePDFWithBrowserless(html: string): Promise<Buffer> {
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) {
    throw new Error('BROWSERLESS_API_KEY not configured');
  }

  const response = await fetch(`https://chrome.browserless.io/pdf?token=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      html,
      options: {
        format: 'Letter',
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
        },
        printBackground: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Browserless API error: ${response.status} ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Main PDF generation function with fallback chain
 * 
 * Tries multiple services in order, falling back to HTML if all fail
 */
export async function generatePDF(html: string): Promise<{ buffer: Buffer; isPDF: boolean }> {
  console.log('=== generatePDF: Starting PDF generation process ===');
  console.log('generatePDF: HTML length:', html.length, 'characters');
  console.log('generatePDF: Checking environment variables...');
  console.log('generatePDF: PDFSHIFT_API_KEY exists:', !!process.env.PDFSHIFT_API_KEY);
  console.log('generatePDF: PDFSHIFT_API_KEY length:', process.env.PDFSHIFT_API_KEY?.length || 0);
  console.log('generatePDF: All PDF-related env vars:', Object.keys(process.env).filter(k => k.includes('PDF') || k.includes('SHIFT')));
  
  const services = [
    { name: 'PDFShift', fn: generatePDFWithPDFShift },
    { name: 'HTMLPDF', fn: generatePDFWithHTMLPDF },
    { name: 'PDFLayer', fn: generatePDFWithPDFLayer },
    { name: 'Browserless', fn: generatePDFWithBrowserless },
  ];

  for (const service of services) {
    try {
      // Check if service is configured
      const envVar = service.name === 'PDFShift' ? 'PDFSHIFT_API_KEY' :
                     service.name === 'HTMLPDF' ? 'HTMLPDF_API_KEY' :
                     service.name === 'PDFLayer' ? 'PDFLAYER_API_KEY' :
                     'BROWSERLESS_API_KEY';
      
      console.log(`generatePDF: Checking ${service.name} (env var: ${envVar})...`);
      const envValue = process.env[envVar];
      console.log(`generatePDF: ${envVar} exists:`, !!envValue);
      
      if (!envValue) {
        console.log(`${service.name} not configured (${envVar} not set), skipping...`);
        continue;
      }
      
      console.log(`${service.name} is configured, attempting to use it...`);

      console.log(`Trying ${service.name} for PDF generation...`);
      const buffer = await service.fn(html);
      
      // Validate it's a PDF
      if (buffer.toString('ascii', 0, 4) === '%PDF') {
        console.log(`${service.name} generated PDF successfully`);
        return { buffer, isPDF: true };
      } else {
        console.log(`${service.name} returned invalid PDF, trying next service...`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`${service.name} failed with error:`, errorMsg);
      if (errorStack) {
        console.error(`${service.name} error stack:`, errorStack);
      }
      // Continue to next service
    }
  }

  // All services failed, return HTML as fallback
  console.log('All PDF services failed, returning HTML fallback');
  return { buffer: Buffer.from(html), isPDF: false };
}

