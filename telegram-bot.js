const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const { Telegraf, session, Markup } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Register fonts for Amharic support
try {
    const ebrimaPath = 'C:\\Windows\\Fonts\\ebrima.ttf';
    const ebrimaBoldPath = 'C:\\Windows\\Fonts\\ebrimabd.ttf';
    
    if (fs.existsSync(ebrimaPath)) {
        registerFont(ebrimaPath, { family: 'Ebrima' });
    }
    if (fs.existsSync(ebrimaBoldPath)) {
        registerFont(ebrimaBoldPath, { family: 'EbrimaBold' });
    }

    const fontPath = path.join(__dirname, 'public', 'NOKIA ኖኪያ ቀላል.TTF');
    if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'AmharicFont' });
    console.log('Fonts registered');
} catch (e) {
    console.error('Font registration failed:', e.message);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Use session to store state per user
bot.use(session());

const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTY0YTkyYTBiYzlhMDlmMjdmYjY0YjkiLCJpYXQiOjE3NzMxNjI3ODUsImV4cCI6MTc3Mzc2NzU4NX0.sBYNIOPetKwecdp_aCZZLqUkvAsOY-4hK__wHubL0SY";
const API_URL = "https://api.affiliate.pro.et/api/v1/process-screenshots";

bot.start((ctx) => {
    ctx.session = { step: 0, images: [], data: null };
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
        ctx.reply('🚀 All images received! Processing data... ⏳');
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
            ctx.session.data = response.data;
            
            // Ask for Template Choice
            await ctx.reply('✅ Data Extracted! Now choose your Template:', 
                Markup.inlineKeyboard([
                    [Markup.button.callback('Template A (Standard)', 'tpl_a')],
                    [Markup.button.callback('Template B (Alternative)', 'tpl_b')],
                    [Markup.button.callback('Template C (Modern)', 'tpl_c')]
                ])
            );
        } else {
            ctx.reply('❌ Failed to process the ID. Please try again.');
        }
    } catch (error) {
        console.error('Error processing ID:', error.message);
        ctx.reply('❌ Error: ' + (error.response?.data?.message || error.message));
    }
}

// Template Choice Handler
bot.action(['tpl_a', 'tpl_b', 'tpl_c'], async (ctx) => {
    if (ctx.match === 'tpl_a') {
        ctx.session.templateChoice = 'front-template.jpg';
        ctx.session.backTemplateChoice = 'back-template.jpg';
    } else if (ctx.match === 'tpl_b') {
        ctx.session.templateChoice = 'front-templateb.jpg';
        ctx.session.backTemplateChoice = 'back-template.jpg';
    } else if (ctx.match === 'tpl_c') {
        ctx.session.templateChoice = 'front-template-c.jpg';
        ctx.session.backTemplateChoice = 'back-template-c.jpg';
    }
    
    await ctx.answerCbQuery();
    await ctx.editMessageText('Template selected! Now choose Photo Style:', 
        Markup.inlineKeyboard([
            [Markup.button.callback('🌈 Color Photo', 'style_color')],
            [Markup.button.callback('⚫️ Black & White', 'style_bw')]
        ])
    );
});

// Style Choice Handler
bot.action(['style_color', 'style_bw'], async (ctx) => {
    ctx.session.filterChoice = ctx.match === 'style_color' ? 'color' : 'bw';
    await ctx.answerCbQuery();
    await ctx.editMessageText('⚙️ Choices saved! Generating your ID cards... ⏳');
    
    await renderTemplates(ctx, ctx.session.data);
    // Reset session after rendering
    ctx.session = { step: 0, images: [], data: null };
});

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
        const templateFile = ctx.session.templateChoice || 'front-template.jpg';
        const frontTpl = await loadImage(path.join(__dirname, 'public', templateFile));
        g.drawImage(frontTpl, 0, 0, 1280, 800);

        // Photo Rendering
        const profilePath = data.images && (data.images[1] || data.images[0]);
        if (profilePath) {
            try {
                const profileImg = await loadImage(getFullUrl(profilePath));
                g.save();
                
                // Apply Filter Choice
                if (ctx.session.filterChoice === 'bw') {
                    // Full Black and White
                    g.filter = 'grayscale(100%) brightness(110%) contrast(110%)';
                } else {
                    // Optimized Color (Same as web default)
                    g.filter = 'saturate(45%) brightness(100%) grayscale(74%) sepia(10%)';
                }
                
                g.drawImage(profileImg, 55, 170, 440, 540);
                g.restore();
            } catch (e) {
                console.error('Failed to load profile image:', e.message);
            }
        }
        
        // Mini Photo
        const miniPath = data.images && data.images[0];
        if (miniPath) {
            try {
                const miniImg = await loadImage(getFullUrl(miniPath));
                g.drawImage(miniImg, 1030, 600, 100, 130);
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
                g.fillStyle = 'white';
                g.fillRect(570, 620, 400, 120);
                g.fillStyle = 'black';
                g.font = 'bold 24px "Arial"';
                g.textAlign = 'center';
                g.fillText(data.fcn_id, 770, 650);
                g.drawImage(barcodeImg, 595, 660, 350, 60);
            } catch (e) {}
        }

        // Text Rendering
        const isTemplateC = templateFile === 'front-template-c.jpg';
        g.fillStyle = 'black';
        
        if (isTemplateC) {
            g.textAlign = 'center';
            const centerX = 640;
            
            g.font = 'bold 36px "EbrimaBold", "Ebrima", "Arial"';
            if (data.amharic_name) g.fillText(data.amharic_name, centerX, 275);
            if (data.english_name) g.fillText(data.english_name, centerX, 315);

            g.font = 'bold 34px "EbrimaBold", "Ebrima", "Arial"';
            const dob = `${data.birth_date_ethiopian || ''} | ${data.birth_date_gregorian || ''}`;
            g.fillText(dob, centerX, 445);

            const gender = `${data.amharic_gender || ''} | ${data.english_gender || ''}`;
            g.fillText(gender, centerX, 530);

            const expiry = `${data.expiry_date_ethiopian || ''} | ${data.expiry_date_gregorian || ''}`;
            g.fillText(expiry, centerX, 615);

            if (data.fcn_id) {
                g.font = 'bold 32px "EbrimaBold", "Arial"';
                g.fillText(data.fcn_id, centerX, 770);
            }
        } else {
            g.textAlign = 'left';
            g.font = 'bold 36px "EbrimaBold", "Ebrima", "Arial"';
            if (data.amharic_name) g.fillText(data.amharic_name, 510, 245);
            if (data.english_name) g.fillText(data.english_name, 510, 290);

            g.font = 'bold 34px "EbrimaBold", "Ebrima", "Arial"';
            g.fillText(`${data.birth_date_ethiopian || ''} | ${data.birth_date_gregorian || ''}`, 512, 408);
            g.fillText(`${data.amharic_gender || ''} | ${data.english_gender || ''}`, 512, 491);
            g.fillText(`${data.expiry_date_ethiopian || ''} | ${data.expiry_date_gregorian || ''}`, 512, 574);
        }

        // Sides (Only for Template A/B)
        if (!isTemplateC) {
            g.save();
            g.translate(36, 560);
            g.rotate(-Math.PI / 2);
            g.font = 'bold 28px "EbrimaBold", "Ebrima", "Arial"';
            g.fillText(data.issue_date_ethiopian || '', 0, 0);
            g.restore();
            g.save();
            g.translate(36, 200);
            g.rotate(-Math.PI / 2);
            g.font = 'bold 28px "EbrimaBold", "Ebrima", "Arial"';
            g.fillText(data.issue_date_gregorian || '', 0, 0);
            g.restore();
        }

        const frontBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        await ctx.replyWithPhoto({ source: frontBuffer }, { caption: '🆔 ID Front Card' });

        // --- RENDER BACK ---
        g.clearRect(0, 0, 1280, 800);
        const backTemplateFile = ctx.session.backTemplateChoice || 'back-template.jpg';
        const backTpl = await loadImage(path.join(__dirname, 'public', backTemplateFile));
        g.drawImage(backTpl, 0, 0, 1280, 800);

        const qrPath = data.images && (data.images[3] || data.images[2]);
        if (qrPath) {
            try {
                const qrImg = await loadImage(getFullUrl(qrPath));
                g.fillStyle = 'white';
                g.fillRect(576, 40, 666, 650);
                g.drawImage(qrImg, 576, 40, 666, 650);
            } catch (e) {}
        }

        g.fillStyle = 'black';
        g.font = 'bold 32px "EbrimaBold", "Ebrima", "Arial"';
        if (data.phone_number) g.fillText(data.phone_number, 45, 130);

        // Nationality (Template C only)
        if (templateFile === 'front-template-c.jpg') {
            const nationality = `${data.amharic_nationality || ''} | ${data.english_nationality || ''}`;
            g.fillText(nationality, 43, 240);
        }

        // Address Section (Stacked Amharic & English to match Web)
        g.font = 'bold 28px "EbrimaBold", "Ebrima", "Arial"';
        let currentY = templateFile === 'front-template-c.jpg' ? 335 : 320;
        if (data.amharic_city) { g.fillText(data.amharic_city, 43, currentY); currentY += 35; }
        if (data.english_city) { g.fillText(data.english_city, 43, currentY); currentY += 50; }
        if (data.amharic_sub_city) { g.fillText(data.amharic_sub_city, 43, currentY); currentY += 35; }
        if (data.english_sub_city) { g.fillText(data.english_sub_city, 43, currentY); currentY += 50; }
        if (data.amharic_woreda) { g.fillText(data.amharic_woreda, 43, currentY); currentY += 35; }
        if (data.english_woreda) { g.fillText(data.english_woreda, 43, currentY); }

        if (data.fin_number) {
            g.font = 'bold 30px "EbrimaBold", "Ebrima", "Arial"';
            g.fillText(data.fin_number, 171, 687);
        }

        const serialNumber = 'S' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        g.font = 'bold 28px "EbrimaBold", "Ebrima", "Arial"';
        g.fillText(serialNumber, 1070, 762);

        const backBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        await ctx.replyWithPhoto({ source: backBuffer }, { caption: '🆔 ID Back Card' });

        ctx.reply('✨ All cards generated successfully!');

    } catch (error) {
        console.error('Rendering error:', error);
        ctx.reply('⚠️ Error during rendering. Please try again.');
    }
}

bot.launch().then(() => {
    console.log('Telegram Bot started successfully with interactive buttons!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
