import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim();

export async function POST(request: NextRequest): Promise<Response> {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return NextResponse.json(
      { error: { message: "ElevenLabs API key or voice ID not configured." } },
      { status: 500 },
    );
  }

  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: { message: "text is required." } },
      { status: 400 },
    );
  }

  const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;

  const upstream = await fetch(elevenLabsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "Unknown error");
    return NextResponse.json(
      { error: { message: `ElevenLabs error: ${errorText}` } },
      { status: upstream.status },
    );
  }

  if (!upstream.body) {
    return NextResponse.json(
      { error: { message: "No audio stream from ElevenLabs." } },
      { status: 502 },
    );
  }

  // Proxy the audio stream directly to the client
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
