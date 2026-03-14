const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = content.split('\n');

console.log('Lines around 850-860:');
for (let i = 848; i < 862 && i < lines.length; i++) {
  const lineNum = i + 1;
  const line = lines[i];
  console.log(`${lineNum}: [${JSON.stringify(line)}]`);
}

// Look for the specific pattern
console.log('\nLooking for pattern "                      )}"');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('                      )}')) {
    console.log(`Found at line ${i + 1}: ${JSON.stringify(lines[i])}`);
    console.log(`Next line ${i + 2}: ${JSON.stringify(lines[i + 1] || '')}`);
    console.log(`Next line ${i + 3}: ${JSON.stringify(lines[i + 2] || '')}`);
  }
}
