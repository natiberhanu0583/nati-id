const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// Fix multiple JSX structure errors
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Fix line 511 - missing closing div
  if (line.includes('<div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8">')) {
    // Find the matching closing div later
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('</div>')) {
        lines.splice(i + 1, 0, '                  </div>');
        console.log('Fixed missing closing div at line 512');
        break;
      }
    }
  }
  
  // Fix line 563 - missing closing Card
  if (line.includes('<Card className="shadow-xl border-blue-100/50 backdrop-blur-sm bg-white/90">')) {
    // Find the matching closing Card later
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('</Card>')) {
        lines.splice(i + 1, 0, '        </Card>');
        console.log('Fixed missing closing Card at line 564');
        break;
      }
    }
  }
  
  // Fix line 607 - missing closing div
  if (line.includes('<form onSubmit={handleUpload} className="space-y-6">')) {
    // Find the matching closing div later
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('</form>')) {
        lines.splice(i + 1, 0, '                </form>');
        console.log('Fixed missing closing form at line 608');
        break;
      }
    }
  }
  
  // Fix line 671 - add missing closing div
  if (line.includes('                              </div>') && i > 0 && !lines[i-1].includes('</div>')) {
    lines.splice(i + 1, 0, '                            </div>');
    console.log('Fixed missing closing div at line 672');
  }
  
  // Fix line 679 - add missing closing div
  if (line.includes('                              </div>') && i > 0 && !lines[i-1].includes('</div>')) {
    lines.splice(i + 1, 0, '                            </div>');
    console.log('Fixed missing closing div at line 680');
  }
  
  // Fix line 696 - add missing closing div
  if (line.includes('                      )))}') && i > 0 && !lines[i-1].includes('</div>')) {
    lines.splice(i + 1, 0, '                      )))}</div>');
    console.log('Fixed missing closing div at line 697');
  }
  
  // Fix line 716 - add missing closing form
  if (line.includes('<form onSubmit={handleScreenshotUpload} className="space-y-6">')) {
    // Find the matching closing form later
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('</form>')) {
        lines.splice(i + 1, 0, '                </form>');
        console.log('Fixed missing closing form at line 717');
        break;
      }
    }
  }
  
  // Fix line 733 - add missing closing div
  if (line.includes('<div className="space-y-6 border-t border-blue-100 pt-6">')) {
    // Find the matching closing div later
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('</div>')) {
        lines.splice(i + 1, 0, '                  </div>');
        console.log('Fixed missing closing div at line 734');
        break;
      }
    }
  }
  
  // Fix line 775 - add missing closing div
  if (line.includes('<div className="space-y-6 border-t border-blue-100 pt-6">')) {
    // Find the matching closing div later
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('</div>')) {
        lines.splice(i + 1, 0, '                  </div>');
        console.log('Fixed missing closing div at line 776');
        break;
      }
    }
  }
}

content = lines.join('\n');
fs.writeFileSync('src/app/page.tsx', content);
console.log('Fixed major JSX structure errors');
