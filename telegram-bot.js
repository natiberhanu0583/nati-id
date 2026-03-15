require('dotenv').config({ path: '.env.local' });
const { Telegraf, session } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Use session to store image state per user
bot.use(session());

const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTY0YTkyYTBiYzlhMDlmMjdmYjY0YjkiLCJpYXQiOjE3NzMxNjI3ODUsImV4cCI6MTc3Mzc2NzU4NX0.sBYNIOPetKwecdp_aCZZLqUkvAsOY-4hK__wHubL0SY";
const API_URL = "https://api.affiliate.pro.et/api/v1/process-screenshots";

bot.start((ctx) => {
    ctx.session = { step: 0, images: [] };
    ctx.reply('Welcome! Let\'s process your ID screenshots.\n\nPlease upload **Image 1 (Popup/Photo + QR)**. (Or type /skip if you don\'t have it)');
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
        ctx.reply('Image 1 received. Now please upload **Image 2 (Front ID Card)**.');
    } else if (ctx.session.step === 1) {
        ctx.session.step = 2;
        ctx.reply('Image 2 received. Now please upload **Image 3 (Back ID Card)**.');
    } else if (ctx.session.step === 2) {
        ctx.reply('All images received! Processing your ID... ⏳');
        await processId(ctx);
    }
});

async function processId(ctx) {
    try {
        const formData = new FormData();
        
        // Download images and append to form data
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
            let message = `✅ **ID Processed Successfully!**\n\n`;
            message += `**Name:** ${data.english_name || 'N/A'}\n`;
            message += `**ID Number:** ${data.fcn_id || 'N/A'}\n`;
            message += `**Nationality:** ${data.english_nationality || 'N/A'}\n`;
            message += `**Gender:** ${data.english_gender || 'N/A'}\n`;
            message += `**Birth Date:** ${data.birth_date_gregorian || 'N/A'}\n`;
            message += `**Issue Date:** ${data.issue_date_gregorian || 'N/A'}\n`;
            message += `**Expiry Date:** ${data.expiry_date_gregorian || 'N/A'}\n`;
            
            await ctx.replyWithMarkdown(message);
            
            // Send extracted images
            if (data.images && Array.from(data.images).length > 0) {
                ctx.reply('📥 **Sending Extracted Images...**');
                
                const mediaGroup = [];
                const images = data.images.map(img => 
                    img.startsWith('http') ? img : `https://api.affiliate.pro.et${img}`
                );

                for (let i = 0; i < images.length; i++) {
                    const imgUrl = images[i];
                    try {
                        // Send as Photo for preview
                        await ctx.replyWithPhoto(imgUrl, { caption: `Image ${i + 1}` });
                        
                        // Send as Document for high quality download
                        await ctx.replyWithDocument(imgUrl, { filename: `extracted_id_part_${i + 1}.jpg` });
                    } catch (e) {
                        console.error(`Failed to send image ${i}:`, e.message);
                    }
                }
            }

            ctx.reply('✨ All images and data have been extracted.');
        } else {
            ctx.reply('❌ Failed to process the ID. Please try again.');
        }
    } catch (error) {
        console.error('Error processing ID:', error.message);
        ctx.reply('❌ Error: ' + (error.response?.data?.message || error.message));
    } finally {
        ctx.session = { step: 0, images: [] }; // Reset session
    }
}

bot.launch().then(() => {
    console.log('Telegram Bot started successfully!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
