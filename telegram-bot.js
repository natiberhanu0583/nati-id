const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const { Telegraf, session, Markup } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { Document, Packer, Paragraph, ImageRun, AlignmentType } = require('docx');

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
            [Markup.button.callback('➕ Add Another', 'add_more')],
            [Markup.button.callback('🖼 Bulk Individual (JPG)', 'gen_bulk_jpg'), Markup.button.callback('📝 Shelf (Word)', 'gen_word')],
            [Markup.button.callback('🔄 Restart', 'restart')]
        ])
    );
});

bot.action('gen_bulk_jpg', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const ids = ctx.session.allProcessedData;
    if (!ids.length) return;
    await ctx.reply(`🖼 Sending ${ids.length * 2} individual files... ⏳`);

    const rendered = await renderAllIDs(ids);
    for (const r of rendered) {
        const safeName = r.name.replace(/\s+/g, '_');
        await ctx.replyWithDocument({ source: r.front, filename: `${safeName}_Front.jpg` });
        await ctx.replyWithDocument({ source: r.back, filename: `${safeName}_Back.jpg` });
    }
    ctx.reply('✨ All individual files sent!');
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

// Generate shared render function
async function renderAllIDs(ids) {
    // Pre-fetch ALL external images in parallel
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

    const results = [];
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const images = fetchedImages[i] || {};
        
        // Front Card
        const fCanvas = createCanvas(1280, 800);
        const f = fCanvas.getContext('2d');
        const fTpl = await getCachedTemplate(id.template);
        f.drawImage(fTpl, 0, 0);
        if (images.profile) {
            f.save();
            f.filter = id.filter === 'bw' ? 'grayscale(100%)' : 'saturate(45%) brightness(100%) grayscale(74%) sepia(10%)';
            f.drawImage(images.profile, 55, 170, 440, 540); 
            f.restore();
        }
        if (images.mini) f.drawImage(images.mini, 1030, 600, 100, 130);
        if (id.data.fcn_id) await drawBarcode(f, id.data.fcn_id);
        drawText(f, id.data, id.template.includes('-c'));

        // Back Card
        const bCanvas = createCanvas(1280, 800);
        const b = bCanvas.getContext('2d');
        const bTpl = await getCachedTemplate(id.backTemplate);
        b.drawImage(bTpl, 0, 0);
        if (images.qr) { b.fillStyle='white'; b.fillRect(576, 40, 666, 650); b.drawImage(images.qr, 576, 40, 666, 650); }
        drawBackInfo(b, id.data, id.template.includes('-c'));

        results.push({
            name: id.data.english_name || `ID_${i+1}`,
            front: fCanvas.toBuffer('image/jpeg', { quality: 0.9 }),
            back: bCanvas.toBuffer('image/jpeg', { quality: 0.9 })
        });
    }
    return results;
}


bot.action('gen_word', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const ids = ctx.session.allProcessedData;
    if (!ids.length) return;
    await ctx.reply('📝 Generating Word Document... ⏳');

    const rendered = await renderAllIDs(ids);
    const sections = [];
    
    for (const r of rendered) {
        sections.push({
            children: [
                new Paragraph({ children: [new ImageRun({ data: r.front, transformation: { width: 500, height: 312 } })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new ImageRun({ data: r.back, transformation: { width: 500, height: 312 } })], alignment: AlignmentType.CENTER })
            ]
        });
    }

    const doc = new Document({ sections });
    const buffer = await Packer.toBuffer(doc);
    await ctx.replyWithDocument({ source: buffer, filename: `Fayda_Batch_${Date.now()}.docx` });
});

bot.action(/^dl_(f|b)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const type = ctx.match[1];
    const idx = parseInt(ctx.match[2]);
    const items = ctx.session.lastRendered;
    if (!items || !items[idx]) return ctx.reply('Data expired. Please re-generate.');

    const item = items[idx];
    const buffer = type === 'f' ? item.front : item.back;
    const name = `${item.name.replace(/\s+/g, '_')}_${type === 'f' ? 'Front' : 'Back'}.jpg`;
    await ctx.replyWithDocument({ source: buffer, filename: name });
});

async function drawBarcode(g, fcn) {
    try {
        const bBuf = await bwipjs.toBuffer({ bcid: 'code128', text: fcn.replace(/\s/g,''), scale: 1.5, height: 10, backgroundcolor: 'FFFFFF' });
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
        g.fillText(`${d.birth_date_ethiopian || ''} | ${d.birth_date_gregorian || ''}`, 640, 445);
        g.fillText(`${d.amharic_gender || ''} | ${d.english_gender || ''}`, 640, 530);
        g.fillText(`${d.expiry_date_ethiopian || ''} | ${d.expiry_date_gregorian || ''}`, 640, 615);
        if (d.fcn_id) { g.font='bold 32px "EbrimaBold"'; g.fillText(d.fcn_id, 640, 770); }
    } else {
        g.textAlign = 'left'; g.font = 'bold 36px "EbrimaBold"';
        if (d.amharic_name) g.fillText(d.amharic_name, 510, 245);
        if (d.english_name) g.fillText(d.english_name, 510, 290);
        g.font = 'bold 34px "EbrimaBold"';
        g.fillText(`${d.birth_date_ethiopian || ''} | ${d.birth_date_gregorian || ''}`, 512, 408);
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

bot.launch().then(() => console.log('Telegram Bot Optimized with Word/Named Export!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
