/**
 * Fayda ID PDF Downloader Bot
 * ────────────────────────────────────────────────────────────────
 * Downloads Ethiopian National ID (Fayda) PDF via OTP verification.
 *
 * Required env vars in .env.local:
 *   FAYDA_BOT_TOKEN   – Telegram bot token for this bot
 *   FAYDA_API_BASE    – Base URL of the Fayda/MOSIP resident API
 *                       e.g. https://resident.fayda.et
 *
 * Optional env vars:
 *   FAYDA_PARTNER_ID      – Partner ID for OTP request (if required)
 *   FAYDA_PARTNER_APIKEY  – Partner API key (if required)
 *
 * Run: node fayda-downloader-bot.js
 */

'use strict';

console.log('🔄 Initializing Fayda Downloader Bot...');

require('dotenv').config({ path: '.env.local' });

const { Telegraf, session, Markup } = require('telegraf');
const axios = require('axios');

// ─── Configuration ────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.FAYDA_BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ FAYDA_BOT_TOKEN is not set in .env.local');
    process.exit(1);
}

const FAYDA_API_BASE =
    (process.env.FAYDA_API_BASE || 'https://resident.fayda.et').replace(/\/$/, '');

const PARTNER_ID = process.env.FAYDA_PARTNER_ID || '';
const PARTNER_APIKEY = process.env.FAYDA_PARTNER_APIKEY || '';

// Max OTP attempts before locking the session
const MAX_OTP_RETRIES = 3;

// ─── Session shape ────────────────────────────────────────────────────────────

const INITIAL_SESSION = {
    step: 'idle',       // idle | awaiting_fayda_id | awaiting_otp
    faydaId: null,      // cleaned Fayda/UIN number
    token: null,        // auth token returned after OTP verification
    otpRetries: 0,
};

// ─── Bot setup ────────────────────────────────────────────────────────────────

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip spaces and validate that the ID is 9–16 digits (Fayda UIN range).
 */
function isValidFaydaId(raw) {
    return /^\d{9,16}$/.test(raw.replace(/\s/g, ''));
}

function cleanId(raw) {
    return raw.replace(/\s/g, '');
}

/**
 * Cancel keyboard shortcut reused across many messages.
 */
function cancelKb() {
    return Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel')]]);
}

function otpKb() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Resend OTP', 'resend_otp')],
        [Markup.button.callback('❌ Cancel', 'cancel')],
    ]);
}

/**
 * Extracts a user-friendly error reason from an axios error object.
 */
function getErrorMessage(err) {
    return err?.response?.data?.errors?.[0]?.message
        || err?.response?.data?.message
        || err.message
        || 'Unknown error';
}

// ─── Fayda API calls ──────────────────────────────────────────────────────────

/**
 * Request an OTP to be sent to the phone registered with the given Fayda ID.
 *
 * MOSIP resident API:  POST /resident/v1/req/otp
 * Adjust the path / body to match the actual Fayda endpoint.
 */
async function requestOtp(faydaId) {
    const url = `${FAYDA_API_BASE}/resident/v1/req/otp`;
    const body = {
        id: 'mosip.resident.otp',
        version: '1.0',
        requesttime: new Date().toISOString(),
        request: {
            individualId: faydaId,
            individualIdType: 'UIN',
            otpChannel: ['PHONE'],
        },
    };

    const headers = { 'Content-Type': 'application/json' };
    if (PARTNER_ID) headers['partner-id'] = PARTNER_ID;
    if (PARTNER_APIKEY) headers['partner-api-key'] = PARTNER_APIKEY;

    const resp = await axios.post(url, body, { headers, timeout: 30_000 });
    // Expected: { response: { status: 'SENT' }, errors: [] }
    const errors = resp.data?.errors;
    if (errors && errors.length > 0) {
        throw new Error(errors[0]?.message || 'OTP request failed');
    }
    return resp.data;
}

/**
 * Verify OTP and obtain a session/auth token for the download step.
 *
 * MOSIP resident API:  POST /resident/v1/req/auth-otp   (or similar)
 * Returns a bearer token used to download the ID card PDF.
 */
async function verifyOtp(faydaId, otp) {
    const url = `${FAYDA_API_BASE}/resident/v1/req/auth-otp`;
    const body = {
        id: 'mosip.resident.auth',
        version: '1.0',
        requesttime: new Date().toISOString(),
        request: {
            individualId: faydaId,
            individualIdType: 'UIN',
            otp,
        },
    };

    const headers = { 'Content-Type': 'application/json' };
    if (PARTNER_ID) headers['partner-id'] = PARTNER_ID;
    if (PARTNER_APIKEY) headers['partner-api-key'] = PARTNER_APIKEY;

    const resp = await axios.post(url, body, { headers, timeout: 30_000 });

    const errors = resp.data?.errors;
    if (errors && errors.length > 0) {
        throw new Error(errors[0]?.message || 'OTP verification failed');
    }

    // Token may live at different paths depending on implementation
    const token =
        resp.data?.response?.token ||
        resp.data?.response?.access_token ||
        resp.data?.token ||
        resp.headers?.authorization?.replace('Bearer ', '');

    if (!token) throw new Error('Authentication succeeded but no token was returned');
    return token;
}

/**
 * Download the Fayda ID PDF using the bearer token obtained after OTP verification.
 *
 * MOSIP resident API:  GET /resident/v1/download/uin-card
 */
async function downloadPdf(token) {
    const url = `${FAYDA_API_BASE}/resident/v1/download/uin-card`;
    const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 60_000,
    });
    return Buffer.from(resp.data);
}

// ─── Step handlers ────────────────────────────────────────────────────────────

async function handleFaydaId(ctx, raw) {
    const faydaId = cleanId(raw);

    if (!isValidFaydaId(faydaId)) {
        return ctx.reply(
            '⚠️ Invalid Fayda ID. Please enter a valid *9–16 digit* Fayda ID number:',
            { parse_mode: 'Markdown', ...cancelKb() },
        );
    }

    ctx.session.faydaId = faydaId;
    await ctx.reply('⏳ Sending OTP to your registered phone number…');

    try {
        await requestOtp(faydaId);
        ctx.session.step = 'awaiting_otp';
        ctx.session.otpRetries = 0;

        await ctx.reply(
            `✅ *OTP Sent!*\n\nAn OTP has been sent to the phone number linked to Fayda ID \`${faydaId}\`.\n\n` +
            `📱 Please enter the OTP:`,
            { parse_mode: 'Markdown', ...otpKb() },
        );
    } catch (err) {
        const reason = getErrorMessage(err);
        ctx.session.step = 'idle';
        await ctx.reply(
            `❌ *Failed to send OTP*\n\nReason: ${reason}\n\n` +
            `Please verify your Fayda ID and try again with /download.`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Try Again', 'try_again')]]) },
        );
    }
}

async function handleOtp(ctx, raw) {
    const otp = raw.replace(/\s/g, '');

    if (!/^\d{4,8}$/.test(otp)) {
        return ctx.reply(
            '⚠️ Please enter the *numeric OTP* (4–8 digits) sent to your phone:',
            { parse_mode: 'Markdown', ...otpKb() },
        );
    }

    await ctx.reply('⏳ Verifying OTP…');

    try {
        const token = await verifyOtp(ctx.session.faydaId, otp);
        ctx.session.token = token;

        await ctx.reply('✅ Verified! Downloading your Fayda ID PDF… 📄');

        const pdfBuffer = await downloadPdf(token);
        const filename = `Fayda_ID_${ctx.session.faydaId}.pdf`;

        await ctx.replyWithDocument(
            { source: pdfBuffer, filename },
            {
                caption: `🇪🇹 *Your Fayda ID PDF*\nID: \`${ctx.session.faydaId}\``,
                parse_mode: 'Markdown',
            },
        );

        ctx.session = { ...INITIAL_SESSION };
        await ctx.reply(
            '✨ *Download complete!*\n\nSend /download to download another ID.',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('📥 Download Another', 'download_another')]]),
            },
        );
    } catch (err) {
        ctx.session.otpRetries += 1;

        const reason = getErrorMessage(err);
        if (ctx.session.otpRetries >= MAX_OTP_RETRIES) {
            ctx.session = { ...INITIAL_SESSION };
            return ctx.reply(
                `❌ Too many failed attempts.\n\n${reason}\n\nPlease start over with /download.`,
                Markup.inlineKeyboard([[Markup.button.callback('🔄 Start Over', 'start_over')]]),
            );
        }

        await ctx.reply(
            `❌ *Verification failed*\n\nReason: ${reason}\n\n` +
            `Attempt ${ctx.session.otpRetries}/${MAX_OTP_RETRIES}. Please try again:`,
            { parse_mode: 'Markdown', ...otpKb() },
        );
    }
}

async function resendOtp(ctx) {
    await ctx.reply('⏳ Sending a new OTP…');

    try {
        await requestOtp(ctx.session.faydaId);
        ctx.session.otpRetries = 0; // Reset retries on successful resend
        await ctx.reply('✅ New OTP sent! Please enter it below:', otpKb());
    } catch (err) {
        await ctx.reply(`❌ Could not resend OTP.\n\nReason: ${getErrorMessage(err)}`, otpKb());
    }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
    ctx.session = { ...INITIAL_SESSION, step: 'awaiting_fayda_id' };
    await ctx.reply(
        '🇪🇹 *Ethiopian Fayda ID Downloader*\n\n' +
        'Download your National ID card PDF in seconds.\n\n' +
        'Enter your *Fayda ID number* to begin:',
        { parse_mode: 'Markdown', ...cancelKb() },
    );
});

bot.command('download', async (ctx) => {
    ctx.session = { ...INITIAL_SESSION, step: 'awaiting_fayda_id' };
    await ctx.reply(
        '📥 *Download Fayda ID PDF*\n\nEnter your *Fayda ID number*:',
        { parse_mode: 'Markdown', ...cancelKb() },
    );
});

bot.command('cancel', async (ctx) => {
    ctx.session = { ...INITIAL_SESSION };
    await ctx.reply('❌ Cancelled. Send /download to start again.');
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        '📖 *Fayda ID Downloader – Help*\n\n' +
        '`/download` – Start the download process\n' +
        '`/cancel`   – Cancel the current process\n' +
        '`/help`     – Show this message\n\n' +
        '*Steps:*\n' +
        '1️⃣ Enter your Fayda ID number\n' +
        '2️⃣ Receive OTP on your registered phone\n' +
        '3️⃣ Enter the OTP\n' +
        '4️⃣ Get your ID PDF ✅',
        { parse_mode: 'Markdown' },
    );
});

// ─── Inline actions ───────────────────────────────────────────────────────────

bot.action('cancel', async (ctx) => {
    ctx.session = { ...INITIAL_SESSION };
    await ctx.answerCbQuery('Cancelled').catch(() => { });
    await ctx.editMessageText('❌ Cancelled. Send /download to start again.').catch(() => { });
});

const startDownloadFlow = async (ctx, isEdit = false) => {
    ctx.session = { ...INITIAL_SESSION, step: 'awaiting_fayda_id' };
    await ctx.answerCbQuery().catch(() => { });
    const message = '📌 Enter your *Fayda ID number*:';
    const extra = { parse_mode: 'Markdown', ...cancelKb() };
    if (isEdit) {
        await ctx.editMessageText(message, extra).catch(() => ctx.reply(message, extra));
    } else {
        await ctx.reply(message, extra);
    }
};

bot.action('try_again', (ctx) => startDownloadFlow(ctx, true));
bot.action(['start_over', 'download_another'], (ctx) => startDownloadFlow(ctx, false));

bot.action('resend_otp', async (ctx) => {
    await ctx.answerCbQuery('Resending OTP…').catch(() => { });
    if (!ctx.session?.faydaId) {
        return ctx.reply('⚠️ Session expired. Please start again with /download.');
    }
    await resendOtp(ctx);
});

// ─── Text message router ──────────────────────────────────────────────────────

bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { ...INITIAL_SESSION };

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;          // handled by command middleware

    switch (ctx.session.step) {
        case 'awaiting_fayda_id':
            return handleFaydaId(ctx, text);
        case 'awaiting_otp':
            return handleOtp(ctx, text);
        default:
            return ctx.reply(
                '👋 Send /download to download your Fayda ID PDF, or /help for instructions.',
            );
    }
});

// ─── Launch ───────────────────────────────────────────────────────────────────

bot.launch()
    .then(() => console.log('🇪🇹 Fayda ID Downloader Bot is running!'))
    .catch(err => {
        console.error('❌ Failed to launch Fayda Bot.');
        console.error('   Error:', err.message);
        if (err.message.includes('409')) {
            console.error('   👉 CAUSE: Another instance is already running. Close other terminal windows.');
        } else if (err.message.includes('401')) {
            console.error('   👉 CAUSE: Invalid FAYDA_BOT_TOKEN. Check your .env.local file.');
        }
        process.exit(1);
    });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
