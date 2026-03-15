const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const { Telegraf, session } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Register fonts for Amharic support
try {
    const ebrimaPath = 'C:\\Windows\\Fonts\\ebrima.ttf';
    const ebrimaBoldPath = 'C:\\Windows\\Fonts\\ebrimabd.ttf';
    
    if (fs.existsSync(ebrimaPath)) {
        registerFont(ebrimaPath, { family: 'Ebrima' });
        console.log('Ebrima font registered');
    }
    if (fs.existsSync(ebrimaBoldPath)) {
        registerFont(ebrimaBoldPath, { family: 'EbrimaBold' });
        console.log('Ebrima Bold font registered');
    }

    // Keep Nokia fonts as backup
    const fontPath = path.join(__dirname, 'public', 'NOKIA ኖኪያ ቀላል.TTF');
    if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'AmharicFont' });
} catch (e) {
    console.error('Font registration failed:', e.message);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Use session to store image state per user
bot.use(session());

const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTY0YTkyYTBiYzlhMDlmMjdmYjY0YjkiLCJpYXQiOjE3NzMxNjI3ODUsImV4cCI6MTc3Mzc2NzU4NX0.sBYNIOPetKwecdp_aCZZLqUkvAsOY-4hK__wHubL0SY";
const API_URL = "https://api.affiliate.pro.et/api/v1/process-screenshots";

bot.start((ctx) => {
    ctx.session = { step: 0, images: [] };
    ctx.reply('Welcome! 🇪🇹\nI will help you process your Fayda ID.\n\nPlease upload **Image 1 (Popup/Photo + QR)**. (Or type /skip)');
});

bot.command('skip', (ctx) => {
    if (!ctx.session || (ctx.session.step !== 0 && ctx.session.step !== 1)) return ctx.reply('Invalid command for this step.');
    
    ctx.session.images[ctx.session.step] = null;
    ctx.session.step++;
    const nextMsg = ctx.session.step === 1 ? 'Now please upload **Image 2 (Front ID Card)**.' : 'Now please upload **Image 3 (Back ID Card)**.';
    ctx.reply('Skipped. ' + nextMsg);
});

bot.on('photo', async (ctx) => {
    if (!ctx.session) ctx.session = { step: 0, images: [] };
    
    const photo = ctx.message.photo.pop();
    const fileId = photo.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    ctx.session.images[ctx.session.step] = fileLink.href;
    
    if (ctx.session.step === 0) {
        ctx.session.step = 1;
        ctx.reply('✅ Image 1 received.\nNow please upload **Image 2 (Front ID Card)**.');
    } else if (ctx.session.step === 1) {
        ctx.session.step = 2;
        ctx.reply('✅ Image 2 received.\nNow please upload **Image 3 (Back ID Card)**.');
    } else if (ctx.session.step === 2) {
        ctx.reply('🚀 All images received! Generating your ID card... ⏳');
        await processId(ctx);
    }
});

async function processId(ctx) {
    try {
        const formData = new FormData();
        const [img1, img2, img3] = ctx.session.images;
        
        if (img1) {
            const resp1 = await axios.get(img1, { responseType: 'arraybuffer' });
            formData.append('image1', Buffer.from(resp1.data), { filename: 'image1.jpg' });
        }
        
        const resp2 = await axios.get(img2, { responseType: 'arraybuffer' });
        formData.append('image2', Buffer.from(resp2.data), { filename: 'image2.jpg' });
        
        const resp3 = await axios.get(img3, { responseType: 'arraybuffer' });
        formData.append('image3', Buffer.from(resp3.data), { filename: 'image3.jpg' });

        const response = await axios.post(API_URL, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${JWT_TOKEN}`
            }
        });

        if (response.data) {
            const data = response.data;
            data.source = 'screenshot'; // Mark as screenshot for bot processing
            
            // 1. Send Text Info
            let message = `✅ **ID Processed!**\n\n`;
            message += `👤 **Name:** ${data.english_name || 'N/A'}\n`;
            message += `🆔 **FCN:** ${data.fcn_id || 'N/A'}\n`;
            message += `🗓 **Birth:** ${data.birth_date_gregorian || 'N/A'}\n`;
            
            await ctx.replyWithMarkdown(message);

            // 2. Render Template
            ctx.reply('🎨 **Rendering ID Card Templates...**');
            await renderTemplates(ctx, data);

        } else {
            ctx.reply('❌ Failed to process the ID. Please try again.');
        }
    } catch (error) {
        console.error('Error processing ID:', error.message);
        ctx.reply('❌ Error: ' + (error.response?.data?.message || error.message));
    } finally {
        ctx.session = { step: 0, images: [] };
    }
}

function getFullUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `https://api.affiliate.pro.et/${cleanPath}`;
}

async function renderTemplates(ctx, data) {
    try {
        const canvas = createCanvas(1280, 800);
        const g = canvas.getContext('2d');

        // --- RENDER FRONT ---
        const frontTpl = await loadImage(path.join(__dirname, 'public', 'front-template.jpg'));
        g.drawImage(frontTpl, 0, 0, 1280, 800);

        // Photo (Index 1 is usually the profile)
        const profilePath = data.images && (data.images[1] || data.images[0]);
        if (profilePath) {
            try {
                const profileImg = await loadImage(getFullUrl(profilePath));
                
                // Apply filters if supported by this canvas version
                // Saturation: 45%, Brightness: 100%, Grayscale: 74%, Sepia: 10%
                g.save();
                if (g.filter !== undefined) {
                    g.filter = 'saturate(45%) brightness(100%) grayscale(74%) sepia(10%)';
                }
                g.drawImage(profileImg, 55, 170, 440, 540);
                g.restore();
            } catch (e) {
                console.error('Failed to load profile image:', e.message);
            }
        }
        
        // Mini Photo (Index 0 is usually the original)
        const miniPath = data.images && data.images[0];
        if (miniPath) {
            try {
                const miniImg = await loadImage(getFullUrl(miniPath));
                g.drawImage(miniImg, 1030, 600, 100, 130); // Mini profile pos
            } catch (e) {}
        }


        // Barcode
        if (data.fcn_id) {
            const cleanFcn = data.fcn_id.replace(/\s/g, '');
            try {
                const barcodeBuffer = await bwipjs.toBuffer({
                    bcid: 'code128',
                    text: cleanFcn,
                    scale: 3,
                    height: 10,
                    includetext: false,
                    backgroundcolor: 'FFFFFF'
                });
                const barcodeImg = await loadImage(barcodeBuffer);
                // Draw white background for barcode area
                g.fillStyle = 'white';
                g.fillRect(570, 620, 400, 120);
                
                // Draw FCN ID text
                g.fillStyle = 'black';
                g.font = 'bold 24px "Arial"';
                g.textAlign = 'center';
                g.fillText(data.fcn_id, 770, 650);
                
                // Draw Barcode
                g.drawImage(barcodeImg, 595, 660, 350, 60);
            } catch (e) {
                console.error('Barcode generation failed:', e.message);
            }
        }

        // Text Styling
        g.textAlign = 'left';
        g.fillStyle = 'black';
        
        // Name
        g.font = 'bold 36px "EbrimaBold", "Ebrima", "Arial"';
        if (data.amharic_name) g.fillText(data.amharic_name, 510, 245);
        if (data.english_name) g.fillText(data.english_name, 510, 290);

        // Dates
        g.font = 'bold 34px "EbrimaBold", "Ebrima", "Arial"';
        const dob = `${data.birth_date_ethiopian || ''} | ${data.birth_date_gregorian || ''}`;
        g.fillText(dob, 512, 408);

        const gender = `${data.amharic_gender || ''} | ${data.english_gender || ''}`;
        g.fillText(gender, 512, 491);

        const expiry = `${data.expiry_date_ethiopian || ''} | ${data.expiry_date_gregorian || ''}`;
        g.fillText(expiry, 512, 574);

        // Sidebar Issue Dates (Rotated)
        g.save();
        g.translate(46, 560);
        g.rotate(-Math.PI / 2);
        g.font = 'bold 28px "EbrimaBold", "Ebrima", "Arial"';
        g.fillText(data.issue_date_ethiopian || '', 0, 0);
        g.restore();

        g.save();
        g.translate(46, 200);
        g.rotate(-Math.PI / 2);
        g.font = 'bold 28px "EbrimaBold", "Ebrima", "Arial"';
        g.fillText(data.issue_date_gregorian || '', 0, 0);
        g.restore();

        // Send Front
        const frontBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        await ctx.replyWithPhoto({ source: frontBuffer }, { caption: '🆔 ID Front Card' });

        // --- RENDER BACK ---
        g.clearRect(0, 0, 1280, 800);
        const backTpl = await loadImage(path.join(__dirname, 'public', 'back-template.jpg'));
        g.drawImage(backTpl, 0, 0, 1280, 800);

        // QR Code on the Back
        const qrPath = data.images && (data.images[3] || data.images[2]);
        if (qrPath) {
            try {
                const qrImg = await loadImage(getFullUrl(qrPath));
                g.fillStyle = 'white';
                g.fillRect(576, 40, 666, 650);
                g.drawImage(qrImg, 576, 40, 666, 650);
            } catch (e) {
                console.error('Failed to load QR image on back:', e.message);
            }
        }

        g.fillStyle = 'black';
        g.font = 'bold 32px "EbrimaBold", "Ebrima", "Arial"';
        g.textAlign = 'left';
        
        // Phone
        if (data.phone_number) g.fillText(data.phone_number, 45, 130);

        // Address Section (Stacked Amharic & English to match Web)
        g.font = 'bold 28px "EbrimaBold", "Ebrima", "AmharicFont"';
        let currentY = 320;
        
        // City
        if (data.amharic_city) {
            g.fillText(data.amharic_city, 43, currentY);
            currentY += 35;
        }
        if (data.english_city) {
            g.fillText(data.english_city, 43, currentY);
            currentY += 50; // Extra gap between sections
        }

        // Sub-City
        if (data.amharic_sub_city) {
            g.fillText(data.amharic_sub_city, 43, currentY);
            currentY += 35;
        }
        if (data.english_sub_city) {
            g.fillText(data.english_sub_city, 43, currentY);
            currentY += 50;
        }

        // Woreda
        if (data.amharic_woreda) {
            g.fillText(data.amharic_woreda, 43, currentY);
            currentY += 35;
        }
        if (data.english_woreda) {
            g.fillText(data.english_woreda, 43, currentY);
        }

        // FIN Number
        if (data.fin_number) {
            g.font = 'bold 30px "EbrimaBold", "Ebrima", "Arial"';
            g.textAlign = 'left';
            g.fillText(data.fin_number, 171, 687);
        }

        // Serial Number
        const serialNumber = 'S' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        g.font = 'bold 28px "EbrimaBold", "Ebrima", "Arial"';
        g.textAlign = 'left';
        g.fillText(serialNumber, 1070, 750);

        // Send Back
        const backBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        await ctx.replyWithPhoto({ source: backBuffer }, { caption: '🆔 ID Back Card' });

        ctx.reply('✨ Done! You can now download your cards.');

    } catch (error) {
        console.error('Rendering error:', error);
        ctx.reply('⚠️ Error while rendering the template. Sending extracted parts instead.');
    }
}

bot.launch().then(() => {
    console.log('Telegram Bot started successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

