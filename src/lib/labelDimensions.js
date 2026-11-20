export function extractLabelDimensionsInches(rawZpl) {
    const dotsPerInch = 203.2; // 8 dpmm
    let width = 4 * dotsPerInch;
    let height = 6 * dotsPerInch;
    let homeX = 0;
    let homeY = 0;

    // Cada campo usa el origen ^LH vigente cuando se declara su posición.
    const commands = String(rawZpl || '').matchAll(/\^XA|\^(LH|FO|FT|PW|LL)([\d,]+)([^]*?)(?=\^(?:XA|XZ|LH|FO|FT|PW|LL)|$)/gi);
    for (const [command, type, args, field] of commands) {
        if (command.toUpperCase() === '^XA') {
            homeX = homeY = 0;
            continue;
        }
        const [x = 0, y = 0] = args.split(',').map(Number);
        switch (type.toUpperCase()) {
            case 'LH':
                homeX = x;
                homeY = y;
                break;
            case 'PW':
                width = Math.max(width, x);
                break;
            case 'LL':
                height = Math.max(height, x);
                break;
            default: {
                const box = field.match(/\^GB(\d+),(\d+),(\d+)/i);
                const block = field.match(/\^FB(\d+),(\d+)(?:,(-?\d+))?/i);
                const font = field.match(/\^A[0-9A-Z][NRIB]?,(\d+)/i);
                const barcode = field.match(/\^B[C3](?:[NRIB])?,(\d+)/i);
                const textHeight = Number(font?.[1] || 0);
                const lines = Number(block?.[2] || 1);
                const lineSpacing = Number(block?.[3] || 0);
                const fieldWidth = box ? Math.max(Number(box[1]), Number(box[3])) : Number(block?.[1] || 80);
                const fieldHeight = box ? Math.max(Number(box[2]), Number(box[3])) : Math.max(
                    textHeight * lines + lineSpacing * (lines - 1),
                    Number(barcode?.[1] || 0) + (barcode ? 40 : 0),
                    80,
                );
                width = Math.max(width, homeX + x + fieldWidth + 8);
                height = Math.max(height, homeY + y + fieldHeight + 8);
            }
        }
    }

    // Redondear hacia arriba para conservar el margen de los campos.
    const inches = (dots) => Math.ceil(dots / dotsPerInch * 100) / 100;
    return { width: inches(width), height: inches(height) };
}
