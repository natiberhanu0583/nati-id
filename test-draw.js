const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const bwipjs = require('bwip-js');

try {
    const ebrimaBoldPath = 'C:\\Windows\\Fonts\\ebrimabd.ttf';
    if (fs.existsSync(ebrimaBoldPath)) registerFont(ebrimaBoldPath, { family: 'EbrimaBold' });
    const fontPath = path.join(__dirname, 'public', 'NOKIA ኖኪያ ቀላል.TTF');
    if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'AmharicFont' });
} catch (e) {}

const fontStack = '"EbrimaBold", "AmharicFont", "Arial"';
const ID_W = 1280;
const ID_H = 800;

function drawText(g, d, isC) {
    g.fillStyle = 'black';
    g.textBaseline = 'top';
    const o = 5;
    if (isC) {
        g.textAlign = 'center'; const x = 640;
        g.font = `bold 36px ${fontStack}`;
        if (d.amharic_name) g.fillText(d.amharic_name, x, 250);
        if (d.english_name) g.fillText(d.english_name, x, 295);
        g.font = `bold 34px ${fontStack}`;
        g.fillText(`${d.birth_date_ethiopian || ''} | ${d.birth_date_gregorian || ''}`, x, 420);
        g.fillText(`${d.amharic_gender || ''} | ${d.english_gender || ''}`, x, 505);
        g.fillText(`${d.expiry_date_ethiopian || ''} | ${d.expiry_date_gregorian || ''}`, x, 590);
        if (d.fcn_id) { g.font=`bold 32px ${fontStack}`; g.fillText(d.fcn_id, x, 750); }
    } else {
        g.textAlign = 'left'; 
        g.font = `bold 34px ${fontStack}`;
        if (d.amharic_name) g.fillText(d.amharic_name, 510, 210 + o);
        if (d.english_name) g.fillText(d.english_name, 510, 210 + 44 + o);
        g.fillText(`${d.birth_date_ethiopian || ''} | ${d.birth_date_gregorian || ''}`, 512, 374 + o);
        g.fillText(`${d.amharic_gender || ''} | ${d.english_gender || ''}`, 512, 457 + o);
        g.fillText(`${d.expiry_date_ethiopian || ''} | ${d.expiry_date_gregorian || ''}`, 512, 542 + o);
        g.font = `bold 28px ${fontStack}`;
        g.save(); g.translate(20, 560); g.rotate(-Math.PI/2); g.fillText(d.issue_date_ethiopian||'',0,0); g.restore();
        g.save(); g.translate(20, 200); g.rotate(-Math.PI/2); g.fillText(d.issue_date_gregorian||'',0,0); g.restore();
    }
}

async function run() {
    const canvas = createCanvas(ID_W, ID_H);
    const g = canvas.getContext('2d');
    
    // Fill background so we can see stuff
    g.fillStyle = '#f0f0f0';
    g.fillRect(0, 0, ID_W, ID_H);
    
    const d = {
        amharic_name: 'የኃለሽት አየለ ጉብረሖት',
        english_name: 'Yehualeshet Ayele Gebrehot',
        birth_date_ethiopian: '11/06/1991',
        birth_date_gregorian: '1999/Feb/18',
        amharic_gender: 'ሴት',
        english_gender: 'Female',
        issue_date_ethiopian: '2018/03/08',
        issue_date_gregorian: '2025/Nov/17',
        expiry_date_ethiopian: '2026/03/08',
        expiry_date_gregorian: '2033/Nov/17',
        fcn_id: '4017 4973 0523 7984'
    };
    
    drawText(g, d, false);
    
    const buf = canvas.toBuffer('image/png');
    fs.writeFileSync('test_bot_canvas.png', buf);
    console.log("Saved test_bot_canvas.png");
}

run();
