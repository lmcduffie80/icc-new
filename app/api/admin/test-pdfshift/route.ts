import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-middleware';
// import { getClientIp } from '@/lib/rate-limit'; // May be needed for logging in future

interface PDFShiftTestResult {
  success: boolean;
  checks: {
    apiKey: {
      valid: boolean;
      message: string;
    };
  };
  testConversion?: {
    success: boolean;
    error?: string;
    pdfSize?: number;
  };
}

/**
 * POST /api/admin/test-pdfshift
 * Test PDFShift API key and make a test conversion
 */
export async function POST(request: NextRequest) {
  // const ip = getClientIp(request); // Unused - may be needed for logging in future

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const result: PDFShiftTestResult = {
      success: false,
      checks: {
        apiKey: { valid: false, message: '' },
      },
    };

    // Check 1: PDFSHIFT_API_KEY
    const apiKey = process.env.PDFSHIFT_API_KEY;
    if (!apiKey) {
      result.checks.apiKey = {
        valid: false,
        message: 'PDFSHIFT_API_KEY environment variable is not set',
      };
      return NextResponse.json(result, { status: 400 });
    } else if (apiKey.length < 10) {
      result.checks.apiKey = {
        valid: false,
        message: 'PDFSHIFT_API_KEY appears to be invalid (too short)',
      };
      return NextResponse.json(result, { status: 400 });
    } else {
      result.checks.apiKey = {
        valid: true,
        message: `PDFSHIFT_API_KEY is set (${apiKey.substring(0, 7)}...)`,
      };
    }

    // Test 2: Make a simple test conversion
    if (result.checks.apiKey.valid) {
      try {
        const testHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>PDFShift Test</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #333; }
              </style>
            </head>
            <body>
              <h1>PDFShift API Test</h1>
              <p>This is a test document to verify PDFShift API is working correctly.</p>
              <p>Generated at: ${new Date().toISOString()}</p>
            </body>
          </html>
        `;

        const response = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
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

        if (!response.ok) {
          const errorText = await response.text();
          result.testConversion = {
            success: false,
            error: `PDFShift API error: ${response.status} ${response.statusText} - ${errorText}`,
          };
        } else {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Validate it's a PDF
          const pdfHeader = buffer.toString('ascii', 0, 4);
          if (pdfHeader !== '%PDF') {
            result.testConversion = {
              success: false,
              error: 'PDFShift returned invalid PDF (header check failed)',
            };
          } else {
            result.testConversion = {
              success: true,
              pdfSize: buffer.length,
            };
            result.success = true;
          }
        }
      } catch (testError: unknown) {
        result.testConversion = {
          success: false,
          error: testError instanceof Error ? testError.message : 'Unknown error during test conversion',
        };
      }
    }

    return NextResponse.json(result, { status: result.success ? 200 : 400 });

  } catch (error) {
    console.error('Error in test PDFShift endpoint:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test PDFShift configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

