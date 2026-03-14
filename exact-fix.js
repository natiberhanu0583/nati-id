const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// The exact pattern with \r characters
const pattern = '                      )}\r\n\r\n                  {/* Preview All Uploaded IDs */}';
const replacement = '                      )}\r\n                    </div>\r\n                  )}\r\n\r\n                  {/* Preview All Uploaded IDs */}';

if (content.includes(pattern)) {
  content = content.replace(pattern, replacement);
  fs.writeFileSync('src/app/page.tsx', content);
  console.log('Successfully fixed JSX structure with exact pattern');
} else {
  console.log('Exact pattern not found. Trying alternative...');
  
  // Try without \r characters
  const altPattern = '                      )}\n\n                  {/* Preview All Uploaded IDs */}';
  const altReplacement = '                      )}\n                    </div>\n                  )}\n\n                  {/* Preview All Uploaded IDs */}';
  
  if (content.includes(altPattern)) {
    content = content.replace(altPattern, altReplacement);
    fs.writeFileSync('src/app/page.tsx', content);
    console.log('Fixed with alternative pattern');
  } else {
    console.log('Neither pattern found');
  }
}
