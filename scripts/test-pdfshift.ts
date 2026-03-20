/**
 * Test PDFShift API Key
 *
 * Run with: pnpm test:pdfshift
 */

const apiKey = process.env.PDFSHIFT_API_KEY;

if (!apiKey) {
  console.error('❌ PDFSHIFT_API_KEY is not set in .env.local');
  process.exit(1);
}

console.log('🔍 Testing PDFShift API Key...');
console.log(`📝 API Key: ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`);
console.log('');

const testHtml = `
<!DOCTYPE html>
<html>
  <head>
    <title>PDFShift Test</title>
    <style>
      body { 
        font-family: Arial, sans-serif; 
        padding: 40px; 
        max-width: 800px;
        margin: 0 auto;
      }
      h1 { 
        color: #10b981; 
        border-bottom: 2px solid #10b981;
        padding-bottom: 10px;
      }
      .info {
        background: #f0fdf4;
        border-left: 4px solid #10b981;
        padding: 15px;
        margin: 20px 0;
      }
    </style>
  </head>
  <body>
    <h1>✅ PDFShift API Test</h1>
    <div class="info">
      <p><strong>Status:</strong> API Key is working correctly!</p>
      <p><strong>Generated at:</strong> ${new Date().toISOString()}</p>
      <p><strong>Test Type:</strong> Simple HTML to PDF conversion</p>
    </div>
    <p>If you can see this PDF, your PDFShift API key is configured correctly and working.</p>
  </body>
</html>
`;

async function testPDFShift() {
  try {
    console.log('📤 Sending test request to PDFShift API...');
    
    if (!apiKey) {
      throw new Error('PDFSHIFT_API_KEY is not set');
    }
    
    const response = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: testHtml,
        landscape: false,
        format: 'Letter',
        margin: '0.5in',
        sandbox: false,
      }),
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log('');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PDFShift API Error:');
      console.error(`   Status: ${response.status}`);
      console.error(`   Message: ${errorText}`);
      
      // Parse common errors
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          console.error(`   Details: ${errorJson.message}`);
        }
        if (errorJson.code) {
          console.error(`   Error Code: ${errorJson.code}`);
        }
      } catch {
        // Not JSON, use raw text
      }
      
      process.exit(1);
    }

    const contentType = response.headers.get('content-type');
    console.log(`📄 Content-Type: ${contentType}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`📦 PDF Size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(2)} KB)`);
    console.log('');

    // Validate it's a PDF
    const pdfHeader = buffer.toString('ascii', 0, 4);
    if (pdfHeader !== '%PDF') {
      console.error('❌ Invalid PDF: Response does not start with %PDF');
      console.error(`   Header: ${pdfHeader}`);
      process.exit(1);
    }

    console.log('✅ PDFShift API Key is working correctly!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   ✓ API Key is set');
    console.log('   ✓ API Key is valid');
    console.log('   ✓ Test conversion successful');
    console.log('   ✓ PDF generated correctly');
    console.log('');
    console.log('🎉 Your PDFShift integration is ready to use!');
    
  } catch (error) {
    console.error('❌ Error testing PDFShift API:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testPDFShift();

