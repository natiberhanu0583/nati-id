const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const { Telegraf, session, Markup } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Register fonts
try {
    const ebrimaPath = 'C:\\Windows\\Fonts\\ebrima.ttf';
    const ebrimaBoldPath = 'C:\\Windows\\Fonts\\ebrimabd.ttf';
    if (fs.existsSync(ebrimaPath)) registerFont(ebrimaPath, { family: 'Ebrima' });
    if (fs.existsSync(ebrimaBoldPath)) registerFont(ebrimaBoldPath, { family: 'EbrimaBold' });
} catch (e) {
    console.error('Font registration failed:', e.message);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(session());

const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTY0YTkyYTBiYzlhMDlmMjdmYjY0YjkiLCJpYXQiOjE3NzMxNjI3ODUsImV4cCI6MTc3Mzc2NzU4NX0.sBYNIOPetKwecdp_aCZZLqUkvAsOY-4hK__wHubL0SY";
const API_URL = "https://api.affiliate.pro.et/api/v1/process-screenshots";

const INITIAL_SESSION = { 
    step: 0, images: [], data: null, allProcessedData: [],
    templateChoice: 'front-template.jpg',
    backTemplateChoice: 'back-template.jpg',
    filterChoice: 'color'
};

bot.start((ctx) => {
    ctx.session = { ...INITIAL_SESSION, allProcessedData: [] };
    ctx.reply('Welcome! 🇪🇹 Upload **Image 1 (Popup/Photo + QR)**. (Or /skip)');
});

bot.command('skip', (ctx) => {
    if (!ctx.session || (ctx.session.step !== 0 && ctx.session.step !== 1)) return;
    ctx.session.images[ctx.session.step] = null;
    ctx.session.step++;
    const nextMsg = ctx.session.step === 1 ? 'Upload **Image 2 (Front)**.' : 'Upload **Image 3 (Back)**.';
    ctx.reply('Skipped. ' + nextMsg);
});

bot.on('photo', async (ctx) => {
    if (!ctx.session) ctx.session = { ...INITIAL_SESSION, allProcessedData: [] };
    const photo = ctx.message.photo.pop();
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    ctx.session.images[ctx.session.step] = fileLink.href;
    
    if (ctx.session.step === 0) {
        ctx.session.step = 1;
        ctx.reply('✅ Image 1 received. Upload **Image 2 (Front)**.');
    } else if (ctx.session.step === 1) {
        ctx.session.step = 2;
        ctx.reply('✅ Image 2 received. Upload **Image 3 (Back)**.');
    } else if (ctx.session.step === 2) {
        ctx.reply('🚀 Processing ID... ⏳');
        await processId(ctx);
    }
});

async function processId(ctx) {
    try {
        const formData = new FormData();
        const urls = ctx.session.images;
        
        const buffers = await Promise.all(urls.map(url => 
            url ? axios.get(url, { responseType: 'arraybuffer' }).then(r => Buffer.from(r.data)) : Promise.resolve(null)
        ));

        if (buffers[0]) formData.append('image1', buffers[0], { filename: '1.jpg' });
        formData.append('image2', buffers[1], { filename: '2.jpg' });
        formData.append('image3', buffers[2], { filename: '3.jpg' });

        const response = await axios.post(API_URL, formData, {
            headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${JWT_TOKEN}` }
        });

        if (response.data) {
            ctx.session.currentIdData = response.data;
            await ctx.reply('✅ Extracted! Choose Template:', 
                Markup.inlineKeyboard([
                    [Markup.button.callback('Template A', 'tpl_a')],
                    [Markup.button.callback('Template B', 'tpl_b')],
                    [Markup.button.callback('Template C', 'tpl_c')]
                ])
            );
        }
    } catch (e) { ctx.reply('❌ Error: ' + e.message); }
}

bot.action(['tpl_a', 'tpl_b', 'tpl_c'], async (ctx) => {
    const m = { 'tpl_a':['front-template.jpg','back-template.jpg'], 'tpl_b':['front-templateb.jpg','back-template.jpg'], 'tpl_c':['front-template-c.jpg','back-template-c.jpg'] };
    [ctx.session.templateChoice, ctx.session.backTemplateChoice] = m[ctx.match];
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('Choose Style:', Markup.inlineKeyboard([
        [Markup.button.callback('🌈 Color', 'style_color'), Markup.button.callback('⚫️ B&W', 'style_bw')]
    ]));
});

bot.action(['style_color', 'style_bw'], async (ctx) => {
    ctx.session.filterChoice = ctx.match === 'style_color' ? 'color' : 'bw';
    await ctx.answerCbQuery().catch(() => {});
    
    ctx.session.allProcessedData.push({
        data: ctx.session.currentIdData,
        template: ctx.session.templateChoice,
        backTemplate: ctx.session.backTemplateChoice,
        filter: ctx.session.filterChoice
    });
    
    await ctx.editMessageText(`✅ ID Added! Total: ${ctx.session.allProcessedData.length}`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('➕ Add Another', 'add_more'), Markup.button.callback('📄 Bulk Shelf', 'gen_shelf')],
            [Markup.button.callback('🔄 Restart', 'restart')]
        ])
    );
});

bot.action('add_more', async (ctx) => {
    ctx.session.step = 0; ctx.session.images = [];
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('Upload **Image 1** for the next ID:');
});

bot.action('restart', async (ctx) => {
    ctx.session = { ...INITIAL_SESSION, allProcessedData: [] };
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('Cleared. Send **Image 1**:');
});

function getFullUrl(p) {
    if (!p) return null;
    return p.startsWith('http') ? p : `https://api.affiliate.pro.et/${p.startsWith('/') ? p.substring(1) : p}`;
}

const templateCache = {};
async function getCachedTemplate(name) {
    if (templateCache[name]) return templateCache[name];
    return templateCache[name] = await loadImage(path.join(__dirname, 'public', name));
}

bot.action('gen_shelf', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const ids = ctx.session.allProcessedData;
    if (!ids.length) return;

    await ctx.reply(`🚀 Generating Bulk Shelf for ${ids.length} IDs... Parallel fetching active. ⏳`);
    
    // Efficiency: Pre-fetch ALL external images in parallel
    const externalImages = [];
    ids.forEach((id, idx) => {
        const pPath = id.data.images && (id.data.images[1] || id.data.images[0]);
        const mPath = id.data.images && id.data.images[0];
        const qPath = id.data.images && (id.data.images[3] || id.data.images[2]);
        
        if (pPath) externalImages.push({ idx, type: 'profile', url: getFullUrl(pPath) });
        if (mPath) externalImages.push({ idx, type: 'mini', url: getFullUrl(mPath) });
        if (qPath) externalImages.push({ idx, type: 'qr', url: getFullUrl(qPath) });
    });

    const fetchedImages = {};
    await Promise.all(externalImages.map(async (item) => {
        try {
            const res = await axios.get(item.url, { responseType: 'arraybuffer' });
            const img = await loadImage(Buffer.from(res.data));
            if (!fetchedImages[item.idx]) fetchedImages[item.idx] = {};
            fetchedImages[item.idx][item.type] = img;
        } catch (e) { console.error(`Failed to fetch ${item.url}`); }
    }));

    const cardW = 1280, cardH = 800, pad = 40;
    const shelfH = (cardH * 2 * ids.length) + (pad * (ids.length * 2 + 1));
    const shelfCanvas = createCanvas(cardW + pad * 2, shelfH);
    const s = shelfCanvas.getContext('2d');
    s.fillStyle = '#FFFFFF'; s.fillRect(0, 0, shelfCanvas.width, shelfCanvas.height);

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const yTop = pad + (i * (cardH * 2 + pad * 2));
        const yBot = yTop + cardH + pad;
        const images = fetchedImages[i] || {};

        // Front
        s.save(); s.translate(pad, yTop);
        const fTpl = await getCachedTemplate(id.template);
        s.drawImage(fTpl, 0, 0);
        if (images.profile) {
            s.save();
            s.filter = id.filter === 'bw' ? 'grayscale(100%)' : 'saturate(45%) brightness(100%) grayscale(74%) sepia(10%)';
            s.drawImage(images.profile, 55, 170, 440, 540); 
            s.restore();
        }
        if (images.mini) s.drawImage(images.mini, 1030, 600, 100, 130);
        if (id.data.fcn_id) await drawBarcode(s, id.data.fcn_id);
        drawText(s, id.data, id.template.includes('-c'));
        s.restore();

        // Back
        s.save(); s.translate(pad, yBot);
        const bTpl = await getCachedTemplate(id.backTemplate);
        s.drawImage(bTpl, 0, 0);
        if (images.qr) { s.fillStyle='white'; s.fillRect(576, 40, 666, 650); s.drawImage(images.qr, 576, 40, 666, 650); }
        drawBackInfo(s, id.data, id.template.includes('-c'));
        s.restore();
    }

    const buf = shelfCanvas.toBuffer('image/jpeg', { quality: 0.85 });
    await ctx.replyWithDocument({ source: buf, filename: `batch_${Date.now()}.jpg` });
});

async function drawBarcode(g, fcn) {
    try {
        const bBuf = await bwipjs.toBuffer({ bcid: 'code128', text: fcn.replace(/\s/g,''), scale: 3, height: 10, backgroundcolor: 'FFFFFF' });
        const bImg = await loadImage(bBuf);
        g.fillStyle='white'; g.fillRect(570, 620, 400, 120);
        g.fillStyle='black'; g.font='bold 24px "EbrimaBold"'; g.textAlign='center';
        g.fillText(fcn, 770, 650); g.drawImage(bImg, 595, 660, 350, 60);
    } catch (e) {}
}

function drawText(g, d, isC) {
    g.fillStyle = 'black';
    if (isC) {
        g.textAlign = 'center'; g.font = 'bold 36px "EbrimaBold"';
        if (d.amharic_name) g.fillText(d.amharic_name, 640, 275);
        if (d.english_name) g.fillText(d.english_name, 640, 315);
        g.font = 'bold 34px "EbrimaBold"';
        const dob = `${d.birth_date_ethiopian || ''} | ${d.birth_date_gregorian || ''}`;
        g.fillText(dob, 640, 445);
        g.fillText(`${d.amharic_gender || ''} | ${d.english_gender || ''}`, 640, 530);
        g.fillText(`${d.expiry_date_ethiopian || ''} | ${d.expiry_date_gregorian || ''}`, 640, 615);
        if (d.fcn_id) { g.font='bold 32px "EbrimaBold"'; g.fillText(d.fcn_id, 640, 770); }
    } else {
        g.textAlign = 'left'; g.font = 'bold 36px "EbrimaBold"';
        if (d.amharic_name) g.fillText(d.amharic_name, 510, 245);
        if (d.english_name) g.fillText(d.english_name, 510, 290);
        g.font = 'bold 34px "EbrimaBold"';
        const dob = `${d.birth_date_ethiopian || ''} | ${d.birth_date_gregorian || ''}`;
        g.fillText(dob, 512, 408);
        g.fillText(`${d.amharic_gender || ''} | ${d.english_gender || ''}`, 512, 491);
        g.fillText(`${d.expiry_date_ethiopian || ''} | ${d.expiry_date_gregorian || ''}`, 512, 574);
        g.save(); g.translate(36, 560); g.rotate(-Math.PI/2); g.font='bold 28px "EbrimaBold"'; g.fillText(d.issue_date_ethiopian||'',0,0); g.restore();
        g.save(); g.translate(36, 200); g.rotate(-Math.PI/2); g.font='bold 28px "EbrimaBold"'; g.fillText(d.issue_date_gregorian||'',0,0); g.restore();
    }
}

function drawBackInfo(g, d, isC) {
    g.fillStyle = 'black'; g.textAlign = 'left'; g.font = 'bold 32px "EbrimaBold"';
    if (d.phone_number) g.fillText(d.phone_number, 45, 130);
    if (isC) { g.fillText(`${d.amharic_nationality || ''} | ${d.english_nationality || ''}`, 43, 240); }
    g.font = 'bold 28px "EbrimaBold"';
    let y = isC ? 335 : 320;
    if (d.amharic_city) { g.fillText(d.amharic_city, 43, y); y += 35; }
    if (d.english_city) { g.fillText(d.english_city, 43, y); y += 50; }
    if (d.amharic_sub_city) { g.fillText(d.amharic_sub_city, 43, y); y += 35; }
    if (d.english_sub_city) { g.fillText(d.english_sub_city, 43, y); y += 50; }
    if (d.amharic_woreda) { g.fillText(d.amharic_woreda, 43, y); y += 35; }
    if (d.english_woreda) { g.fillText(d.english_woreda, 43, y); }
    if (d.fin_number) { g.font='bold 30px "EbrimaBold"'; g.fillText(d.fin_number, 171, 687); }
    const sn = 'S' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    g.font='bold 28px "EbrimaBold"'; g.fillText(sn, 1070, 762);
}

bot.launch().then(() => console.log('Telegram Bot Optimized!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
