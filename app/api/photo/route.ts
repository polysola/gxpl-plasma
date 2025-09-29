import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      prompt,
      amount = 1,
      resolution = '512x512',
      model = 'gpt-image-1'
    } = body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new NextResponse(JSON.stringify({ error: 'Prompt is required' }), { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse(
        JSON.stringify({
          error: 'OpenAI API key not configured on the server. Set process.env.OPENAI_API_KEY',
        }),
        { status: 500 }
      );
    }

    // Timeout bằng Promise.race thay vì signal
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OpenAI API request timed out')), 50000)
    );

    // Validate resolution strictly to three allowed sizes
    const allowedSizes = new Set(['256x256', '512x512', '1024x1024']);
    const size = typeof resolution === 'string' ? resolution : '1024x1024';
    if (!allowedSizes.has(size)) {
      return NextResponse.json({
        error: 'Invalid resolution',
        message: 'resolution must be one of: 256x256, 512x512, 1024x1024'
      }, { status: 400 });
    }

    const sizeTyped = size as '256x256' | '512x512' | '1024x1024';
    const responsePromise = openai.images.generate({
      model,
      prompt,
      n: Number(amount) || 1,
      size: sizeTyped,
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);

    const images: string[] = [];
    try {
      const data = (response as any).data ?? (response as any).output ?? null;
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.b64_json) images.push(`data:image/png;base64,${item.b64_json}`);
          else if (item.url) images.push(item.url);
          else if (item.base64) images.push(`data:image/png;base64,${item.base64}`);
        }
      }
    } catch {
      return NextResponse.json({ raw: response }, { status: 200 });
    }

    return NextResponse.json({ images }, { status: 200 });
  } catch (err: any) {
    if (err?.message?.includes('timed out')) {
      return NextResponse.json({ error: 'OpenAI API request timed out' }, { status: 504 });
    }

    const message = err?.message ?? 'Unknown error';
    const details = (err?.response && err.response.data) ? err.response.data : undefined;

    console.error('Image generation error:', message, details);

    return NextResponse.json({ error: message, details }, { status: 500 });
  }
}
