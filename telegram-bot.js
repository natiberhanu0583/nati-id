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
    const ebrimaBoldPath = 'C:\\Windows\\Fonts\\ebrimabd.ttf';
    if (fs.existsSync(ebrimaBoldPath)) registerFont(ebrimaBoldPath, { family: 'EbrimaBold' });
    const fontPath = path.join(__dirname, 'public', 'NOKIA ኖኪያ ቀላል.TTF');
    if (fs.existsSync(fontPath)) registerFont(fontPath, { family: 'AmharicFont' });
} catch (e) {}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(session());

const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTY0YTkyYTBiYzlhMDlmMjdmYjY0YjkiLCJpYXQiOjE3NzMxNjI3ODUsImV4cCI6MTc3Mzc2NzU4NX0.sBYNIOPetKwecdp_aCZZLqUkvAsOY-4hK__wHubL0SY";
const API_URL = "https://api.affiliate.pro.et/api/v1/process-screenshots";

const INITIAL_SESSION = { 
    step: 0, images: [], allProcessedData: [],
    templateChoice: 'front-template.jpg',
    backTemplateChoice: 'back-template.jpg',
    filterChoice: 'color', isC: false
};

bot.start((ctx) => {
    ctx.session = { ...INITIAL_SESSION, allProcessedData: [] };
    ctx.reply('Welcome! 🇪🇹 Upload **Image 1 (Popup/Photo + QR)**. (Or /skip)');
});

bot.command('skip', (ctx) => {
    if (!ctx.session || (ctx.session.step !== 0 && ctx.session.step !== 1)) return;
    ctx.session.images[ctx.session.step] = null;
    ctx.session.step++;
    ctx.reply(`Skipped. Upload **Image ${ctx.session.step + 1}**.`);
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
                    [Markup.button.callback('Template A', 'tpl_a'), Markup.button.callback('Template B', 'tpl_b')],
                    [Markup.button.callback('Template C (Modern)', 'tpl_c')]
                ])
            );
        }
    } catch (e) { ctx.reply('❌ Error: ' + e.message); }
}

bot.action('tpl_c', async (ctx) => {
    ctx.session.templateChoice = 'front-template.jpg';
    ctx.session.backTemplateChoice = 'back-template.jpg';
    ctx.session.isC = true;
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('Choose Photo Style:', Markup.inlineKeyboard([
        [Markup.button.callback('🌈 Color', 'style_color'), Markup.button.callback('⚫️ B&W', 'style_bw')]
    ]));
});

bot.action(['tpl_a', 'tpl_b'], async (ctx) => {
    const m = { 'tpl_a':['front-template.jpg','back-template.jpg'], 'tpl_b':['front-templateb.jpg','back-template.jpg'] };
    [ctx.session.templateChoice, ctx.session.backTemplateChoice] = m[ctx.match];
    ctx.session.isC = false;
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('Choose Photo Style:', Markup.inlineKeyboard([
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
        filter: ctx.session.filterChoice,
        isTemplateC: ctx.session.isC
    });
    ctx.session.images = []; ctx.session.step = 0;
    await ctx.editMessageText(`✅ ID Added! Total Batch: ${ctx.session.allProcessedData.length}`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('➕ Add Another ID', 'add_more')],
            [Markup.button.callback('🖼 Bulk Individual (JPG)', 'gen_bulk_jpg')],
            [Markup.button.callback('📝 Shelf (Word)', 'gen_word')],
            [Markup.button.callback('🔄 Restart Batch', 'restart')]
        ])
    );
});

bot.action('add_more', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('Upload **Image 1** for the next ID:');
});

bot.action('restart', async (ctx) => {
    ctx.session = { ...INITIAL_SESSION, allProcessedData: [] };
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('Cleared. Send **Image 1**:');
});

const templateCache = {};
async function getCachedTemplate(name) {
    if (templateCache[name]) return templateCache[name];
    const fullPath = path.join(__dirname, 'public', name);
    if (!fs.existsSync(fullPath)) throw new Error(`Template not found: ${name}`);
    return templateCache[name] = await loadImage(fullPath);
}

function getFullUrl(p) {
    if (!p) return null;
    return p.startsWith('http') ? p : `https://api.affiliate.pro.et/${p.startsWith('/') ? p.substring(1) : p}`;
}

const fontStack = '"EbrimaBold", "AmharicFont", "Arial"';
const ID_W = 1280;
const ID_H = 800;

async function renderAndSendSingleID(ctx, id, idx) {
    const name = id.data.english_name || 'Unnamed';
    const pPath = id.data.images && (id.data.images[1] || id.data.images[0]);
    const mPath = id.data.images && id.data.images[0];
    const qPath = id.data.images && (id.data.images[3] || id.data.images[2]);

    const urls = [getFullUrl(pPath), getFullUrl(mPath), getFullUrl(qPath)];
    const fetchPromises = urls.map(u => u ? axios.get(u, { responseType: 'arraybuffer', timeout: 15000 }).then(r => loadImage(Buffer.from(r.data))).catch(() => null) : Promise.resolve(null));
    const [pImg, mImg, qImg] = await Promise.all(fetchPromises);

    const render = async (isFront) => {
        const canvas = createCanvas(ID_W, ID_H);
        const g = canvas.getContext('2d');
        if (isFront) {
            const tpl = await getCachedTemplate(id.template);
            g.drawImage(tpl, 0, 0, ID_W, ID_H);
            if (pImg) {
                g.save();
                g.filter = id.filter === 'bw' ? 'grayscale(100%) brightness(110%) contrast(110%)' : 'saturate(45%) brightness(100%) grayscale(74%) sepia(10%)';
                g.drawImage(pImg, 55, 170, 440, 540); 
                g.restore();
            }
            if (mImg) g.drawImage(mImg, 1030, 600, 100, 130);
            if (id.data.fcn_id) await drawBarcode(g, id.data.fcn_id);
            drawText(g, id.data, id.isTemplateC);
        } else {
            const bTpl = await getCachedTemplate(id.backTemplate);
            g.drawImage(bTpl, 0, 0, ID_W, ID_H);
            if (qImg) {
                g.fillStyle = 'white';
                g.fillRect(576, 40, 666, 650);
                g.drawImage(qImg, 576, 40, 666, 650);
            }
            drawBackInfo(g, id.data, id.isTemplateC);
        }
        return canvas.toBuffer('image/jpeg', { quality: 0.95 }); 
    };

    const frontBuf = await render(true);
    const backBuf = await render(false);
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
    try {
        await ctx.replyWithDocument({ source: frontBuf, filename: `${safeName}_Front.jpg` });
        await ctx.replyWithDocument({ source: backBuf, filename: `${safeName}_Back.jpg` });
    } catch (e) {
        await ctx.replyWithPhoto({ source: frontBuf }, { caption: `${safeName} Front` });
        await ctx.replyWithPhoto({ source: backBuf }, { caption: `${safeName} Back` });
    }
    return { frontBuf, backBuf, name: safeName };
}

bot.action('gen_bulk_jpg', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const ids = ctx.session.allProcessedData || [];
    if (!ids.length) return ctx.reply('❌ No IDs found.');
    await ctx.reply(`🖼 Processing ${ids.length} individual IDs...`);
    for (let i = 0; i < ids.length; i++) {
        try { await renderAndSendSingleID(ctx, ids[i], i); } catch (e) {}
    }
    ctx.reply('✨ Done!');
});

bot.action('gen_word', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const ids = ctx.session.allProcessedData || [];
    if (!ids.length) return;
    try {
        const sections = [];
        for (let i = 0; i < ids.length; i++) {
            const r = await renderAndSendSingleID(ctx, ids[i], i).catch(() => null);
            if (r) {
                sections.push({
                    children: [
                        new Paragraph({ children: [new ImageRun({ data: r.frontBuf, transformation: { width: 450, height: 281 } })], alignment: AlignmentType.CENTER }),
                        new Paragraph({ children: [new ImageRun({ data: r.backBuf, transformation: { width: 450, height: 281 } })], alignment: AlignmentType.CENTER })
                    ]
                });
            }
        }
        const doc = new Document({ sections });
        const buffer = await Packer.toBuffer(doc);
        await ctx.replyWithDocument({ source: buffer, filename: `Batch_${Date.now()}.docx` });
    } catch (e) { ctx.reply('❌ error'); }
});

async function drawBarcode(g, fcn) {
    try {
        const bBuf = await bwipjs.toBuffer({ bcid: 'code128', text: fcn.replace(/\s/g,''), scale: 3, height: 10, backgroundcolor: 'FFFFFF' });
        const bImg = await loadImage(bBuf);
        g.fillStyle='white'; g.fillRect(570, 620, 400, 120);
        g.fillStyle='black'; g.font = `bold 24px ${fontStack}`; g.textAlign='center';
        g.textBaseline = 'top';
        const spacing = 5;
        const text = fcn;
        let x = 770 - (g.measureText(text).width + (text.length-1)*spacing)/2;
        for(let i=0; i<text.length; i++) {
            g.fillText(text[i], x, 630);
            x += g.measureText(text[i]).width + spacing;
        }
        g.drawImage(bImg, 595, 660, 350, 60);
    } catch (e) {}
}

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
        g.save(); g.translate(26, 560); g.rotate(-Math.PI/2); g.fillText(d.issue_date_ethiopian||'',0,0); g.restore();
        g.save(); g.translate(26, 200); g.rotate(-Math.PI/2); g.fillText(d.issue_date_gregorian||'',0,0); g.restore();
    }
}

function drawBackInfo(g, d, isC) {
    g.fillStyle = 'black'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = `bold 32px ${fontStack}`;
    if (d.phone_number) g.fillText(d.phone_number, 40, 93);
    g.font = `bold 32px ${fontStack}`;
    let y = 290;
    if (isC && d.amharic_nationality) { g.fillText(`${d.amharic_nationality} | ${d.english_nationality}`, 43, 220); }
    if (d.amharic_city) { g.fillText(d.amharic_city, 43, y); y += 28; } 
    if (d.english_city) { g.fillText(d.english_city, 43, y); y += 52; }
    if (d.amharic_sub_city) { g.fillText(d.amharic_sub_city, 43, y); y += 28; }
    if (d.english_sub_city) { g.fillText(d.english_sub_city, 43, y); y += 52; }
    if (d.amharic_woreda) { g.fillText(d.amharic_woreda, 43, y); y += 28; }
    if (d.english_woreda) { g.fillText(d.english_woreda, 43, y); }

    g.textBaseline = 'bottom';
    // User requested: small down at fin (further from top), move up small at sn (closer to top)
    g.font = `bold 30px ${fontStack}`;
    if (d.fin_number) { g.fillText(d.fin_number, 171, 800 - 105); } // Was 113, now 105 (Small down)
    
    const sn = 'S' + Math.floor(100000000 + Math.random() * 900000000).toString();
    g.font = `bold 28px ${fontStack}`; 
    g.fillText(sn, 1070, 800 - 35); // Was 27, now 35 (Move up small)
}

bot.launch().then(() => console.log('Bot Final Micro-Adjustments Applied!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
