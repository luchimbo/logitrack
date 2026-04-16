import { NextResponse } from "next/server";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function extractMaxCoordinate(rawZpl, axisIndex) {
  const zpl = String(rawZpl || "");
  const regex = /\^(?:FO|FT)(\d+),(\d+)/gi;
  let match;
  let max = 0;
  while ((match = regex.exec(zpl)) !== null) {
    const value = Number(match[axisIndex]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

function extractLabelDimensionsInches(rawZpl) {
  const defaultDims = { width: 4, height: 6 };
  if (!rawZpl) return defaultDims;

  const pwMatch = String(rawZpl).match(/\^PW(\d{2,5})/i);
  const llMatch = String(rawZpl).match(/\^LL(\d{2,5})/i);

  const dotsPerInch = 203.2;
  const widthFromPw = pwMatch ? Number(pwMatch[1]) / dotsPerInch : null;
  const heightFromLl = llMatch ? Number(llMatch[1]) / dotsPerInch : null;

  const maxX = extractMaxCoordinate(rawZpl, 1);
  const maxY = extractMaxCoordinate(rawZpl, 2);
  const widthFromContent = maxX > 0 ? (maxX + 80) / dotsPerInch : null;
  const heightFromContent = maxY > 0 ? (maxY + 300) / dotsPerInch : null;

  const width = clamp(
    Math.max(
      defaultDims.width,
      Number.isFinite(widthFromPw) ? widthFromPw : 0,
      Number.isFinite(widthFromContent) ? widthFromContent : 0
    ),
    2,
    8
  );
  const baseHeight = clamp(
    Math.max(
      defaultDims.height,
      Number.isFinite(heightFromLl) ? heightFromLl : 0,
      Number.isFinite(heightFromContent) ? heightFromContent : 0
    ),
    2,
    24
  );
  const height = clamp(baseHeight * 1.35, 2, 24);

  return {
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
  };
}

export async function POST(request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const rawZpl = typeof body.raw_zpl === "string" ? body.raw_zpl.trim() : "";
    if (!rawZpl) {
      return NextResponse.json({ error: "raw_zpl is required" }, { status: 400 });
    }

    const dims = extractLabelDimensionsInches(rawZpl);
    const labelaryUrl = `https://api.labelary.com/v1/printers/8dpmm/labels/${dims.width}x${dims.height}/0/`;
    const attemptHeaders = [
      { Accept: "image/png", "Content-Type": "application/x-www-form-urlencoded" },
      { Accept: "image/png", "Content-Type": "text/plain" },
    ];

    let response = null;
    for (const headers of attemptHeaders) {
      response = await fetch(labelaryUrl, {
        method: "POST",
        headers,
        body: rawZpl,
      });
      if (response.ok || response.status !== 415) break;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return NextResponse.json({ error: `Labelary: ${errorText}` }, { status: 502 });
    }

    const imageBuffer = await response.arrayBuffer();
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Preview failed" }, { status: 500 });
  }
}
