import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { db } from '@/lib/db';
import { createPrivateFileUrl, deletePrivateFile, uploadPrivateFile } from '@/lib/storage';
import mammoth from 'mammoth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_PDF_PAGES = 5;
const SUPPORTED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

type OcrLine = { text: string; confidence: number };

function safeFilename(name: string) {
  const basename = name.split(/[\\/]/).pop() || 'cahier';
  return basename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'cahier';
}

function textLines(text: string, confidence: number): OcrLine[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ text: line, confidence }));
}

async function recognizeWithVision(image: Buffer): Promise<{ text: string; lines: OcrLine[]; confidence: number } | null> {
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!key) return null;
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content: image.toString('base64') }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error('Le service OCR est temporairement indisponible.');
  const payload = await response.json() as {
    responses?: Array<{ fullTextAnnotation?: { text?: string; pages?: Array<{ blocks?: Array<{ confidence?: number; paragraphs?: Array<{ words?: Array<{ confidence?: number; symbols?: Array<{ text?: string }> }> }> }> }> } }>;
  };
  const annotation = payload.responses?.[0]?.fullTextAnnotation;
  const text = annotation?.text?.trim() || '';
  const confidences = (annotation?.pages || []).flatMap((page) => (page.blocks || []).flatMap((block) =>
    (block.paragraphs || []).flatMap((paragraph) => (paragraph.words || []).map((word) => word.confidence).filter((value): value is number => typeof value === 'number'))
  ));
  const confidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length * 100 : 0;
  return { text, lines: textLines(text, confidence), confidence };
}

function collectText(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => collectText(item, depth + 1)).filter(Boolean).join('\n');
  if (typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['text', 'markdown', 'content', 'html', 'result', 'output', 'pages', 'data', 'choices']) {
    const text = collectText(record[key], depth + 1);
    if (text) return text;
  }
  return '';
}

async function recognizeWithGLMOcr(signedUrl: string): Promise<{ text: string; lines: OcrLine[]; confidence: null } | null> {
  const key = process.env.GLM_API_KEY || process.env.GLM_API_TOKEN;
  if (!key) return null;
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/layout_parsing', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'glm-ocr', file: signedUrl }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    // Keep provider details and credentials out of logs and user responses.
    console.error('[Cahier OCR] GLM-OCR returned HTTP', response.status);
    throw new Error('Le moteur OCR manuscrit est temporairement indisponible. Réessayez dans quelques instants.');
  }
  const payload = await response.json() as unknown;
  const text = collectText(payload).trim();
  if (text.length < 2) throw new Error('Le moteur OCR n’a pas trouvé de contenu lisible.');
  return { text, lines: textLines(text, 0), confidence: null };
}

async function recognizeWithTesseract(image: Buffer): Promise<{ text: string; lines: OcrLine[]; confidence: number }> {
  const worker = await createWorker('fra+eng', undefined, { logger: () => undefined });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const result = await worker.recognize(image, {}, { blocks: true });
    const blocks = result.data.blocks || [];
    const lines = blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.map((line) => ({
      text: line.text.trim(),
      confidence: line.confidence,
    })))).filter((line) => line.text);
    const confidence = result.data.confidence || 0;
    return { text: result.data.text.trim(), lines: lines.length ? lines : textLines(result.data.text, confidence), confidence };
  } finally {
    await worker.terminate();
  }
}

async function recognizeImage(image: Buffer) {
  const processed = await sharp(image, { limitInputPixels: 60_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 10 })
    .resize({ width: 2400, height: 3200, fit: 'inside', withoutEnlargement: false })
    .median(1)
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
  const vision = await recognizeWithVision(processed);
  if (vision) return { ...vision, provider: 'google-vision' };
  const local = await recognizeWithTesseract(processed);
  return { ...local, provider: 'tesseract' };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (!['TEACHER', 'ADMIN'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès réservé aux professeurs et administrateurs.' }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const classId = form.get('classId');
    const courseId = form.get('courseId');
    if (!(file instanceof File) || typeof classId !== 'string' || typeof courseId !== 'string') {
      return NextResponse.json({ error: 'Fichier, classe et matière requis.' }, { status: 400 });
    }
    const isDocx = file.name.toLowerCase().endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if ((!SUPPORTED_TYPES.has(file.type) && !isDocx) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Choisissez une image JPEG, PNG, WebP, un PDF ou DOCX de 12 Mo maximum.' }, { status: 400 });
    }

    const course = await db.course.findFirst({
      where: { id: courseId, classId, schoolId: auth.schoolId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!course || (auth.role === 'TEACHER' && course.teacherId !== auth.userId)) {
      return NextResponse.json({ error: 'Cette classe ou cette matière ne vous est pas attribuée.' }, { status: 403 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    const storedPath = `cahier/${auth.schoolId}/${classId}/${randomUUID()}-${safeFilename(file.name)}`;

    let pageImages: Buffer[] = [];
    let extractedText = '';
    if (isDocx) {
      const extracted = await mammoth.extractRawText({ buffer: original });
      extractedText = extracted.value.trim();
    } else if (file.type === 'application/pdf') {
      const parser = new PDFParse({ data: original });
      try {
        const info = await parser.getInfo();
        if (info.total > MAX_PDF_PAGES) {
          return NextResponse.json({ error: `Le PDF contient ${info.total} pages. Limite : ${MAX_PDF_PAGES} pages par import.` }, { status: 400 });
        }
        const pdfText = await parser.getText({ cellSeparator: ' | ', lineEnforce: true });
        extractedText = pdfText.text.trim();
        if (extractedText.length < 30) {
          const screenshots = await parser.getScreenshot({ scale: 2, imageBuffer: true, imageDataUrl: false });
          pageImages = screenshots.pages.slice(0, MAX_PDF_PAGES).map((page) => Buffer.from(page.data));
        }
      } finally {
        await parser.destroy();
      }
    } else {
      pageImages = [original];
    }

    await uploadPrivateFile(original, storedPath, file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    let result: { text: string; lines: OcrLine[]; confidence: number | null; provider: string };
    if (process.env.GLM_API_KEY || process.env.GLM_API_TOKEN) {
      try {
        const signedUrl = await createPrivateFileUrl(storedPath, 180);
        const glm = await recognizeWithGLMOcr(signedUrl);
        if (glm) result = { ...glm, provider: 'glm-ocr' };
        else throw new Error('GLM-OCR is not configured.');
      } catch (error) {
        await deletePrivateFile(storedPath);
        throw error;
      }
    } else if (extractedText) {
      result = { text: extractedText, lines: textLines(extractedText, 0), confidence: null, provider: 'pdf-text' };
    } else {
      if (!pageImages.length) return NextResponse.json({ error: 'Aucun contenu lisible détecté dans le document.' }, { status: 422 });
      const pages: Awaited<ReturnType<typeof recognizeImage>>[] = [];
      for (const image of pageImages) pages.push(await recognizeImage(image));
      result = {
        text: pages.map((page) => page.text).filter(Boolean).join('\n\n'),
        lines: pages.flatMap((page) => page.lines),
        confidence: pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length,
        provider: pages[0]?.provider || 'tesseract',
      };
    }

    if (!result.text) {
      return NextResponse.json({ error: 'Aucun texte n’a pu être reconnu. Essayez une photo plus nette et bien cadrée.' }, { status: 422 });
    }
    return NextResponse.json({
      text: result.text.slice(0, 30_000),
      lines: result.lines.slice(0, 1_500),
      confidence: result.confidence === null ? null : Math.round(result.confidence * 10) / 10,
      provider: result.provider,
      sourceDocumentPath: storedPath,
      sourceDocumentName: safeFilename(file.name),
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : 'Échec de l’import OCR.';
    console.error('[Cahier OCR] import failed:', message);
    return NextResponse.json({ error: message.includes('service OCR') || message.includes('securely') || message.includes('storage') ? message : 'L’import OCR a échoué. Vérifiez le fichier puis réessayez.' }, { status: 500 });
  }
}
