import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/admin/test-email/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/admin-middleware', () => ({
  verifyAdminAuth: vi.fn(() =>
    Promise.resolve({
      authorized: true,
      session: { 
        id: 'session-123',
        admin_user_id: 'admin-123', 
        admin_email: 'admin@test.com',
        admin_name: 'Test Admin',
        role_name: 'admin',
        token: 'test-token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: [],
      },
    })
  ),
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

// Mock Resend
const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: mockSend,
    };
  },
}));

vi.mock('@/lib/security-logger', () => ({
  securityLogger: {
    logEvent: vi.fn(),
    logError: vi.fn(),
  },
}));

describe('POST /api/admin/test-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test_api_key_1234567890';
    process.env.EMAIL_FROM = 'test@example.com';
    mockSend.mockResolvedValue({ data: { id: 'test-email-123' } });
  });

  it('should validate RESEND_API_KEY is set', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.resendApiKey.valid).toBe(true);
    expect(data.checks.resendApiKey.message).toContain('RESEND_API_KEY is set');
  });

  it('should validate EMAIL_FROM is set', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.emailFrom.valid).toBe(false); // false because it's example.com
    expect(data.checks.emailFrom.value).toBe('test@example.com');
  });

  it('should detect missing RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY;

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.resendApiKey.valid).toBe(false);
    expect(data.checks.resendApiKey.message).toContain('not set');
    expect(data.testEmail?.sent).toBe(false);
  });

  it('should detect missing EMAIL_FROM', async () => {
    delete process.env.EMAIL_FROM;

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.emailFrom.valid).toBe(false);
    expect(data.checks.emailFrom.message).toContain('not set');
    expect(data.checks.emailFrom.value).toContain('default fallback');
  });

  it('should detect invalid EMAIL_FROM format', async () => {
    process.env.EMAIL_FROM = 'invalid-email';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.emailFrom.valid).toBe(false);
    expect(data.checks.emailFrom.message).toContain('invalid email format');
  });

  it('should warn about example.com domain', async () => {
    process.env.EMAIL_FROM = 'noreply@example.com';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.emailFrom.valid).toBe(false);
    expect(data.checks.emailFrom.message).toContain('example.com');
    expect(data.checks.emailFrom.message).toContain('verified domain');
  });

  it('should send test email successfully', async () => {
    process.env.EMAIL_FROM = 'test@mydomain.com';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'recipient@test.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.testEmail?.sent).toBe(true);
    expect(data.testEmail?.messageId).toBe('test-email-123');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'test@mydomain.com',
        to: 'recipient@test.com',
        subject: 'Test Email from E-Commerce Platform',
      })
    );
  });

  it('should handle email send failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('Domain not verified'));
    process.env.EMAIL_FROM = 'test@mydomain.com';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'recipient@test.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.testEmail?.sent).toBe(false);
    expect(data.testEmail?.error).toContain('Domain verification required');
  });

  it('should parse Resend API key errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('Invalid API key'));
    process.env.EMAIL_FROM = 'test@mydomain.com';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'recipient@test.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.testEmail?.sent).toBe(false);
    expect(data.testEmail?.error).toContain('Invalid RESEND_API_KEY');
  });

  it('should parse rate limit errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('Rate limit exceeded'));
    process.env.EMAIL_FROM = 'test@mydomain.com';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'recipient@test.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.testEmail?.sent).toBe(false);
    expect(data.testEmail?.error).toContain('Rate limit exceeded');
  });

  it('should handle ADMIN_EMAIL optional field', async () => {
    process.env.ADMIN_EMAIL = 'admin@test.com';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'recipient@test.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.adminEmail.valid).toBe(true);
    expect(data.checks.adminEmail.value).toBe('admin@test.com');
  });

  it('should return 400 if recipient not provided and no admin email', async () => {
    // Mock verifyAdminAuth to return no email
    const { verifyAdminAuth } = await import('@/lib/admin-middleware');
    vi.mocked(verifyAdminAuth).mockResolvedValueOnce({
      authorized: true,
      session: { 
        id: 'session-123',
        admin_user_id: 'admin-123',
        admin_email: '', // No email
        admin_name: 'Test Admin',
        role_name: 'admin',
        token: 'test-token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: [],
      },
    });

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toContain('recipient not provided');
  });

  it('should include HTML and text content in test email', async () => {
    process.env.EMAIL_FROM = 'test@mydomain.com';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'recipient@test.com' }),
    });

    await POST(request);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Email Configuration Test'),
        text: expect.stringContaining('EMAIL CONFIGURATION TEST'),
      })
    );
  });

  it('should validate short API key', async () => {
    process.env.RESEND_API_KEY = 'short';

    const request = new NextRequest('http://localhost:3000/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.checks.resendApiKey.valid).toBe(false);
    expect(data.checks.resendApiKey.message).toContain('too short');
  });
});

