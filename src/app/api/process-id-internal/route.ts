import { NextResponse } from 'next/server';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Global worker for speed - Singleton pattern
let workerInstance: any = null;

async function getOptimizedWorker() {
  if (workerInstance) return workerInstance;
  
  console.log('[API]: Initializing Local Tesseract Engine...');
  const cachePath = path.join(process.cwd(), 'tesseract-cache');
  if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath, { recursive: true });

  workerInstance = await createWorker('eng+amh', 1, {
    cachePath: cachePath,
    logger: m => {
      if (m.status === 'recognizing text') {
        console.log(`[OCR Progress]: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  
  return workerInstance;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    // The browser pre-processor sends the image as 'file'
    const file = (formData.get('file')) as File;
    if (!file) {
        console.error('[API Error]: No file found in FormData!');
        return NextResponse.json({ message: 'No image found!' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength < 100) {
        console.error('[API Error]: Buffer too small (invalid image)!');
        return NextResponse.json({ message: 'Invalid or empty image file' }, { status: 400 });
    }

    let buffer = Buffer.from(arrayBuffer as ArrayBuffer);

    // --- TURBO OCR PRE-PROCESSING ---
    console.log('[API]: Preparing image for OCR...');
    const ocrBuffer = await sharp(buffer)
      .resize(1000) 
      .grayscale()
      .modulate({ brightness: 1.1, contrast: 1.2 })
      .toBuffer();

    const worker = await getOptimizedWorker();
    console.log('[API]: Scanning ID Text...');
    const { data: { text: fullText } } = await worker.recognize(ocrBuffer);

    // --- SMART PARSING ---
    const data = parseEthiopianID(fullText);

    // --- FACE PHOTO EXTRACTION ---
    const timestamp = Date.now();
    const outputDir = path.join(process.cwd(), 'public', 'extracted');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const faceFilename = `face_${timestamp}_${Math.random().toString(36).substring(7)}.jpg`;
    const meta = await sharp(buffer).metadata();
    
    await sharp(buffer)
      .extract({ 
        left: Math.round((meta.width || 1000) * 0.05), 
        top: Math.round((meta.height || 800) * 0.1), 
        width: Math.round((meta.width || 1000) * 0.35), 
        height: Math.round((meta.height || 800) * 0.45) 
      })
      .toFile(path.join(outputDir, faceFilename));

    return NextResponse.json({
      ...data,
      images: [`/extracted/${faceFilename}`],
      source: 'local_turbo'
    });

  } catch (error: any) {
    console.error('[API Fatal Error]:', error.message);
    return NextResponse.json({ message: 'Processing Error: ' + error.message }, { status: 500 });
  }
}

function parseEthiopianID(text: string) {
  const getField = (regex: RegExp) => (text.match(regex)?.[1] || '').trim();
  // Standard Fayda ID fields
  return {
    english_name: getField(/Full Name\s*\n?\s*([A-Za-z\s]+)/i) || 'Detection Pending',
    amharic_name: text.match(/የሙሉ ስም\s*\n?\s*([^\sA-Za-z0-9\/]+)/)?.[1] || '',
    fcn_id: (text.match(/\d{4}\s\d{4}\s\d{4}\s\d{4}/)?.[0] || 'Unknown').trim(),
    english_nationality: 'Ethiopian',
    english_gender: getField(/Sex\s*\/\s*ጾታ\s*\n?\s*(Male|Female)/i),
    birth_date_gregorian: getField(/Date Of Birth\s*\/\s*የትውልድ ዘመን\s*\n?\s*(\d{4}\/[A-Za-z]{3}\/\d{2})/i),
  };
}
