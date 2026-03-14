const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// Find the exact location where we need to add closing tags
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  // Look for the line that ends the individual ID sections
  if (lines[i] === '                      )}') {
    // Check if the next few lines contain the Preview section
    if (i + 2 < lines.length && lines[i + 2].includes('                  {/* Preview All Uploaded IDs */}')) {
      // Insert the missing closing tags
      lines.splice(i + 1, 0, '                    </div>');  // Close the Multi-ID Mode Interface div
      lines.splice(i + 2, 0, '                  )}');      // Close the isMultiScreenshotMode conditional
      break;
    }
  }
}

content = lines.join('\n');
fs.writeFileSync('src/app/page.tsx', content);
console.log('Fixed JSX structure with precise closing tags');
