export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function extractMaxCoordinate(rawZpl, axisIndex) {
    const zpl = String(rawZpl || '');
    const regex = /\^(?:FO|FT)(\d+),(\d+)/gi;
    let match;
    let max = 0;
    while ((match = regex.exec(zpl)) !== null) {
        const value = Number(match[axisIndex]);
        if (Number.isFinite(value) && value > max) max = value;
    }
    return max;
}

export function extractLabelDimensionsInches(rawZpl) {
    const defaultDims = { width: 4, height: 6 };
    if (!rawZpl) return defaultDims;

    const pwMatch = String(rawZpl).match(/\^PW(\d{2,5})/i);
    const llMatch = String(rawZpl).match(/\^LL(\d{2,5})/i);

    const dotsPerInch = 203.2; // 8 dpmm
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
            Number.isFinite(widthFromContent) ? widthFromContent : 0,
        ),
        2,
        8,
    );
    const baseHeight = clamp(
        Math.max(
            defaultDims.height,
            Number.isFinite(heightFromLl) ? heightFromLl : 0,
            Number.isFinite(heightFromContent) ? heightFromContent : 0,
        ),
        2,
        24,
    );
    const height = clamp(baseHeight * 1.35, 2, 24);

    return {
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
    };
}
