import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.PDFSHIFT_API_KEY;
  
  // Test actual API call
  let apiTestResult = null;
  if (apiKey) {
    try {
      console.log('Test endpoint: Testing PDFShift API call...');
      const response = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: '<html><body><h1>Test PDF</h1></body></html>',
          landscape: false,
          use_print: false,
          format: 'Letter',
          margin: {
            top: '48',
            right: '48',
            bottom: '48',
            left: '48',
          },
          disable_backgrounds: false,
          sandbox: false,
          encode: false,
        }),
      });
      
      const apiTestResultData: {
        status: number;
        statusText: string;
        ok: boolean;
        contentType: string | null;
        pdfSize?: number;
        size?: number;
        isPDF?: boolean;
        error?: string;
      } = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
      };
      
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        apiTestResultData.size = buffer.length;
        apiTestResultData.isPDF = buffer.toString('ascii', 0, 4) === '%PDF';
      } else {
        const errorText = await response.text();
        apiTestResultData.error = errorText;
      }
      
      apiTestResult = apiTestResultData;
    } catch (error) {
      apiTestResult = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  return NextResponse.json({
    apiKeyExists: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    apiKeyPreview: apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET',
    allEnvVars: Object.keys(process.env).filter(k => k.includes('PDF') || k.includes('SHIFT')),
    apiTest: apiTestResult,
  });
}
