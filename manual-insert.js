const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// Find the exact pattern and replace it
const pattern = /(\s+)}\)\s*\n\s*\/\* Preview All Uploaded IDs \*\//;
const match = content.match(pattern);

if (match) {
  const replacement = match[0].replace(')}', ')}\n                    </div>\n                  )}');
  content = content.replace(match[0], replacement);
  fs.writeFileSync('src/app/page.tsx', content);
  console.log('Successfully inserted missing closing tags');
} else {
  console.log('Pattern not found. Let me try a simpler approach...');
  
  // Simple string replacement
  const simplePattern = '                      )}\n\n                  {/* Preview All Uploaded IDs */}';
  if (content.includes(simplePattern)) {
    const replacement = '                      )}\n                    </div>\n                  )}\n\n                  {/* Preview All Uploaded IDs */}';
    content = content.replace(simplePattern, replacement);
    fs.writeFileSync('src/app/page.tsx', content);
    console.log('Fixed with simple pattern replacement');
  } else {
    console.log('Simple pattern not found either');
  }
}
