require('dotenv').config({ path: '.env.local' });
const { Telegraf, session } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Register fonts for Amharic support
try {
    registerFont(path.join(__dirname, 'public', 'NOKIA ኖኪያ ቀላል.TTF'), { family: 'AmharicFont' });
    registerFont(path.join(__dirname, 'public', 'NOKIAPUREHEADLINE.TTF'), { family: 'AmharicHeadline' });
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
    if (!ctx.session || ctx.session.step !== 0) return ctx.reply('Invalid command for this step.');
    
    ctx.session.images.push(null);
    ctx.session.step = 1;
    ctx.reply('Skipped Image 1. Now please upload **Image 2 (Front ID Card)**.');
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

async function renderTemplates(ctx, data) {
    try {
        const canvas = createCanvas(1280, 800);
        const g = canvas.getContext('2d');

        // --- RENDER FRONT ---
        const frontTpl = await loadImage(path.join(__dirname, 'public', 'front-template.jpg'));
        g.drawImage(frontTpl, 0, 0, 1280, 800);

        // Profile Photo
        if (data.images && data.images[1]) {
            try {
                const profileImg = await loadImage(`https://api.affiliate.pro.et${data.images[1]}`);
                g.drawImage(profileImg, 55, 170, 440, 540);
            } catch (e) {}
        }
        
        // Mini Photo
        if (data.images && data.images[0]) {
            try {
                const miniImg = await loadImage(`https://api.affiliate.pro.et${data.images[0]}`);
                g.drawImage(miniImg, 1030, 600, 100, 130);
            } catch (e) {}
        }

        // Text Styling
        g.fillStyle = 'black';
        g.font = 'bold 34px "AmharicFont"';

        // Name
        if (data.amharic_name) g.fillText(data.amharic_name, 510, 245);
        if (data.english_name) g.fillText(data.english_name, 510, 290);

        // Birth Date
        const dob = `${data.birth_date_ethiopian || ''} | ${data.birth_date_gregorian || ''}`;
        g.fillText(dob, 512, 408);

        // Gender
        const gender = `${data.amharic_gender || ''} | ${data.english_gender || ''}`;
        g.fillText(gender, 512, 491);

        // FCN ID (above barcode area) - just text for now
        g.font = 'bold 28px "Arial"';
        if (data.fcn_id) g.fillText(data.fcn_id, 580, 650);

        // Send Front
        const frontBuffer = canvas.toBuffer('image/jpeg');
        await ctx.replyWithPhoto({ source: frontBuffer }, { caption: '🆔 ID Front Card' });

        // --- RENDER BACK ---
        g.clearRect(0, 0, 1280, 800);
        const backTpl = await loadImage(path.join(__dirname, 'public', 'back-template.jpg'));
        g.drawImage(backTpl, 0, 0, 1280, 800);

        g.fillStyle = 'black';
        g.font = 'bold 32px "AmharicFont"';
        
        // Phone
        if (data.phone_number) g.fillText(data.phone_number, 40, 130);

        // Send Back
        const backBuffer = canvas.toBuffer('image/jpeg');
        await ctx.replyWithPhoto({ source: backBuffer }, { caption: '🆔 ID Back Card' });

        ctx.reply('✨ Done! You can now download your cards.');

    } catch (error) {
        console.error('Rendering error:', error);
        ctx.reply('⚠️ Error while rendering the template. Sending raw data instead.');
    }
}

bot.launch().then(() => {
    console.log('Telegram Bot started successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

