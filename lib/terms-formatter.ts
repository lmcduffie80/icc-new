/**
 * Terms and Conditions Formatting Utilities
 * 
 * Converts plain text terms content to HTML format for PDF generation
 */

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Parse terms content into structured sections
 * Identifies numbered headings (e.g., "1. ACCEPTANCE OF ORDER")
 */
export interface TermsSection {
  heading: string;
  content: string;
}

export function parseTermsSections(plainText: string): TermsSection[] {
  const sections: TermsSection[] = [];
  const lines = plainText.split('\n');
  
  let currentSection: TermsSection | null = null;
  
  for (const line of lines) {
    // Match numbered headings like "1. ACCEPTANCE OF ORDER"
    const headingMatch = line.match(/^(\d+)\.\s+([A-Z\s&]+)$/);
    
    if (headingMatch) {
      // Save previous section if exists
      if (currentSection) {
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        heading: `${headingMatch[1]}. ${headingMatch[2]}`,
        content: '',
      };
    } else if (currentSection && line.trim()) {
      // Add content to current section
      currentSection.content += (currentSection.content ? '\n' : '') + line;
    }
  }
  
  // Don't forget the last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Convert section content to HTML
 * Handles paragraphs and bullet lists
 */
export function formatSectionContent(content: string): string {
  const lines = content.trim().split('\n');
  const html: string[] = [];
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) {
      // Empty line closes list if open
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }
    
    // Check if line starts with bullet point
    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`  <li>${escapeHtml(line.substring(2))}</li>`);
    } else {
      // Regular paragraph
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  
  // Close list if still open
  if (inList) {
    html.push('</ul>');
  }
  
  return html.join('\n');
}

/**
 * Generate complete HTML for Terms and Conditions PDF
 */
export function generateTermsHTML(title: string, content: string): string {
  const sections = parseTermsSections(content);
  
  const sectionsHTML = sections.map(section => `
  <div class="section">
    <h2>${escapeHtml(section.heading)}</h2>
    ${formatSectionContent(section.content)}
  </div>`).join('\n');
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Purchase Order</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
      font-size: 11px;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #059669;
      padding-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      color: #059669;
      font-size: 24px;
      font-weight: bold;
    }
    .header p {
      margin: 5px 0;
      color: #666;
      font-size: 12px;
    }
    .section {
      margin-bottom: 25px;
    }
    .section h2 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: bold;
      color: #333;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    .section h3 {
      margin: 15px 0 8px 0;
      font-size: 12px;
      font-weight: bold;
      color: #333;
    }
    .section p {
      margin: 8px 0;
      text-align: justify;
    }
    .section ul {
      margin: 8px 0;
      padding-left: 25px;
    }
    .section li {
      margin: 5px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title).toUpperCase()}</h1>
    <p>Purchase Order Terms and Conditions</p>
    <p>Innovative CropCare, LLC</p>
  </div>

${sectionsHTML}

  <div class="footer">
    <p>This document contains the standard terms and conditions applicable to all purchase orders issued by Innovative CropCare, LLC.</p>
    <p>181 Cedar Ridge Rd., Tifton, GA 31794 | Phone: (229) 326-5408</p>
  </div>
</body>
</html>
  `;
}
