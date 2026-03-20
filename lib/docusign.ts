import { securityLogger } from './security-logger';
import { sign } from 'jsonwebtoken';

// DocuSign OAuth scopes
const SCOPES = 'signature impersonation';

// Access token cache
let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;

// DocuSign envelope status type
interface DocuSignEnvelopeStatus {
  envelopeId: string;
  status: string;
  statusDateTime: string;
  recipients?: {
    signers?: Array<{
      recipientId: string;
      status: string;
      signedDateTime?: string;
    }>;
  };
  [key: string]: unknown; // Allow additional properties from DocuSign API
}

/**
 * Get DocuSign access token using JWT authentication
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (accessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId = process.env.DOCUSIGN_USER_ID;
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY;

  if (!integrationKey || !userId || !privateKey) {
    throw new Error('DocuSign environment variables not configured. Please set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, and DOCUSIGN_PRIVATE_KEY');
  }

  try {
    // Create JWT assertion
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: integrationKey,
      sub: userId,
      aud: 'account-d.docusign.com',
      iat: now,
      exp: now + 3600, // 1 hour
      scope: SCOPES,
    };

    // Sign JWT with private key
    const assertion = sign(jwtPayload, privateKey.replace(/\\n/g, '\n'), {
      algorithm: 'RS256',
    });

    // Exchange JWT for access token
    const response = await fetch('https://account-d.docusign.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DocuSign OAuth failed: ${error}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    
    // Set token expiration (1 hour minus 5 minutes buffer)
    tokenExpiresAt = Date.now() + (55 * 60 * 1000);

    console.log('✅ DocuSign access token obtained successfully');
    return accessToken!; // Non-null assertion - we just assigned it above
  } catch (error) {
    accessToken = null;
    tokenExpiresAt = null;
    securityLogger.logError('DocuSign authentication failed', error);
    throw new Error('Failed to authenticate with DocuSign. Please check your credentials.');
  }
}

/**
 * Create envelope and get embedded signing URL for admin
 */
export async function createEnvelopeWithEmbeddedSigning(
  pdfBuffer: Buffer,
  filename: string,
  adminName: string,
  adminEmail: string,
  supplierName: string,
  supplierEmail: string,
  contractType: string
): Promise<{
  envelopeId: string;
  adminSigningUrl: string;
}> {
  const token = await getAccessToken();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;
  const basePath = process.env.DOCUSIGN_BASE_PATH || 'https://na4.docusign.net/restapi';

  // Create envelope definition
  const envelopeDefinition = {
    emailSubject: `${contractType} - Signature Required`,
    documents: [
      {
        documentBase64: pdfBuffer.toString('base64'),
        name: filename,
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers: [
        {
          email: adminEmail,
          name: adminName,
          recipientId: '1',
          routingOrder: '1',
          clientUserId: 'admin', // Required for embedded signing
          tabs: {
            signHereTabs: [
              {
                anchorString: '/admin_sig/',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
              },
            ],
            dateSignedTabs: [
              {
                anchorString: '/admin_date/',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
              },
            ],
          },
        },
        {
          email: supplierEmail,
          name: supplierName,
          recipientId: '2',
          routingOrder: '2',
          // No clientUserId = remote signing via email
          tabs: {
            signHereTabs: [
              {
                anchorString: '/supplier_sig/',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
              },
            ],
            dateSignedTabs: [
              {
                anchorString: '/supplier_date/',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
              },
            ],
          },
        },
      ],
    },
    status: 'sent',
  };

  // Create envelope via REST API
  const createResponse = await fetch(
    `${basePath}/v2.1/accounts/${accountId}/envelopes`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelopeDefinition),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create DocuSign envelope: ${error}`);
  }

  const createData = await createResponse.json();
  const envelopeId = createData.envelopeId;

  // Get embedded signing URL for admin
  const viewRequest = {
    returnUrl: `${process.env.BETTER_AUTH_URL}/admin/partners/contracts?signed=true`,
    authenticationMethod: 'none',
    email: adminEmail,
    userName: adminName,
    clientUserId: 'admin',
  };

  const viewResponse = await fetch(
    `${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/views/recipient`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(viewRequest),
    }
  );

  if (!viewResponse.ok) {
    const error = await viewResponse.text();
    throw new Error(`Failed to get signing URL: ${error}`);
  }

  const viewData = await viewResponse.json();

  return {
    envelopeId,
    adminSigningUrl: viewData.url,
  };
}

/**
 * Get envelope status from DocuSign
 */
export async function getEnvelopeStatus(
  envelopeId: string
): Promise<DocuSignEnvelopeStatus> {
  const token = await getAccessToken();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;
  const basePath = process.env.DOCUSIGN_BASE_PATH || 'https://na4.docusign.net/restapi';

  const response = await fetch(
    `${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get envelope status: ${error}`);
  }

  return await response.json();
}

/**
 * Download completed document from DocuSign
 */
export async function downloadCompletedDocument(
  envelopeId: string,
  documentId: string = '1'
): Promise<Buffer> {
  const token = await getAccessToken();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;
  const basePath = process.env.DOCUSIGN_BASE_PATH || 'https://na4.docusign.net/restapi';

  const response = await fetch(
    `${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/${documentId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to download document: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Void an envelope (cancel signing process)
 */
export async function voidEnvelope(
  envelopeId: string,
  reason: string = 'Contract cancelled'
): Promise<void> {
  const token = await getAccessToken();
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;
  const basePath = process.env.DOCUSIGN_BASE_PATH || 'https://na4.docusign.net/restapi';

  const response = await fetch(
    `${basePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'voided',
        voidedReason: reason,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to void envelope: ${error}`);
  }
}
