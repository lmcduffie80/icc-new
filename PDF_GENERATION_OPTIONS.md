# PDF Generation Options

This document outlines the available PDF generation options for the Bill of Lading and Invoice generation features.

## Current Implementation

The system now uses a **multi-service fallback approach** that tries multiple PDF generation services in order, falling back to HTML if all services fail.

## Available Services

### 1. PDFShift (Recommended) ⭐

**Best for:** Most users - simple, reliable, good free tier

- **Free Tier:** 100 PDFs/month
- **Pricing:** $9/month for 1,000 PDFs
- **Setup:**
  1. Sign up at https://pdfshift.io
  2. Get your API key
  3. Add to `.env.local`: `PDFSHIFT_API_KEY=your_key`

**Pros:**
- Simple API, no complex authentication
- Works great in serverless environments
- Good documentation
- Reliable service

**Cons:**
- Requires API key
- Paid plans for higher volume

---

### 2. HTMLPDF API

**Best for:** Users who want an alternative simple service

- **Free Tier:** Limited free tier
- **Pricing:** Pay-as-you-go
- **Setup:**
  1. Sign up at https://htmlpdfapi.com
  2. Get your API key
  3. Add to `.env.local`: `HTMLPDF_API_KEY=your_key`

**Pros:**
- Simple REST API
- Fast conversion
- Good for HTML-to-PDF

**Cons:**
- Requires API key
- Less well-known service

---

### 3. PDFLayer

**Best for:** Users who need multiple output formats

- **Free Tier:** Limited
- **Pricing:** Pay-as-you-go
- **Setup:**
  1. Sign up at https://pdflayer.com
  2. Get your API key
  3. Add to `.env.local`: `PDFLAYER_API_KEY=your_key`

**Pros:**
- Reliable service
- Good documentation
- Multiple output formats

**Cons:**
- Requires API key
- Less popular than PDFShift

---

### 4. Browserless.io

**Best for:** Complex documents with advanced CSS/JavaScript

- **Free Tier:** Limited
- **Pricing:** Starts at $25/month
- **Setup:**
  1. Sign up at https://www.browserless.io
  2. Get your API key
  3. Add to `.env.local`: `BROWSERLESS_API_KEY=your_key`

**Pros:**
- Most accurate rendering (real browser)
- Handles complex CSS/JS
- Best for complex documents

**Cons:**
- More expensive
- Requires API key
- Overkill for simple documents

---

## How It Works

The system automatically tries services in this order:

1. **PDFShift** (if `PDFSHIFT_API_KEY` is set)
2. **HTMLPDF** (if `HTMLPDF_API_KEY` is set)
3. **PDFLayer** (if `PDFLAYER_API_KEY` is set)
4. **Browserless** (if `BROWSERLESS_API_KEY` is set)
5. **HTML Fallback** (if all services fail or are unconfigured)

The first service that successfully generates a PDF is used. If all services fail, the system sends an HTML file that the recipient can open in a browser and print to PDF.

## Configuration

Add one or more API keys to your `.env.local`:

```env
# Recommended: Start with PDFShift
PDFSHIFT_API_KEY=your_pdfshift_api_key

# Optional: Add additional services as backups
HTMLPDF_API_KEY=your_htmlpdf_api_key
PDFLAYER_API_KEY=your_pdflayer_api_key
BROWSERLESS_API_KEY=your_browserless_api_key
```

## Recommendation

**For most users:** Start with **PDFShift**
- Simple setup
- Good free tier (100 PDFs/month)
- Reliable service
- Easy to upgrade if needed

**For high volume:** Consider **Browserless.io**
- Better for complex documents
- More expensive but handles edge cases better

## HTML Fallback

If all PDF services fail or are unconfigured, the system automatically falls back to sending an HTML file. Recipients can:
1. Open the HTML file in any browser
2. Use the browser's "Print" function
3. Select "Save as PDF" as the destination

This ensures the BOL/invoice is always sent, even if PDF generation fails.

## Testing

To test PDF generation:

1. Add at least one API key to `.env.local`
2. Try sending a Bill of Lading via email
3. Check server logs to see which service was used
4. Verify the PDF is generated correctly

## Troubleshooting

**No PDF services configured:**
- System will automatically use HTML fallback
- This is fine for testing, but you should configure at least one service for production

**All services failing:**
- Check your API keys are correct
- Verify you have credits/quota remaining
- Check server logs for specific error messages
- System will automatically fall back to HTML

**PDF quality issues:**
- Try Browserless.io for better rendering
- Check your HTML/CSS is print-friendly
- Ensure images are properly formatted

