import { NextResponse } from 'next/server';

// Etiqueta ZPL de prueba — simula una etiqueta térmica 10x15 cm estilo ML.
const TEST_ZPL = `^XA
^PW800
^LL1200
^CI28

^FO30,30^GB740,1,3^FS

^FO30,50^A0N,40,40^FDGEOMODI - PRUEBA DE IMPRESION^FS
^FO30,100^A0N,28,28^FDEtiqueta de test (no es una venta real)^FS

^FO30,150^GB740,1,2^FS

^FO30,180^A0N,24,24^FDDESTINATARIO^FS
^FO30,210^A0N,36,36^FDJuan Perez^FS
^FO30,255^A0N,28,28^FDCalle Falsa 123, Piso 4 Dto B^FS
^FO30,290^A0N,28,28^FDC1043 - Buenos Aires, CABA^FS
^FO30,325^A0N,28,28^FDTEL: (011) 1234-5678^FS

^FO30,375^GB740,1,2^FS

^FO30,400^A0N,24,24^FDREMITENTE^FS
^FO30,430^A0N,30,30^FDMi Tienda Online^FS
^FO30,468^A0N,24,24^FDLogistica 456 - Villa Crespo, CABA^FS

^FO30,520^GB740,1,2^FS

^FO30,545^A0N,22,22^FDNUMERO DE ENVIO^FS
^FO30,575^BY3^BCN,100,Y,N,N^FD1234567890^FS

^FO30,700^A0N,22,22^FDPESO: 1.5 kg   BULTOS: 1^FS
^FO30,735^A0N,22,22^FDSERVICIO: Envio a domicilio^FS

^FO30,775^GB740,1,2^FS

^FO30,800^A0N,20,20^FD** ETIQUETA GENERADA PARA TEST - NO DESPACHAR **^FS

^FO550,810
^BQN,2,7
^FDLA,TEST-GEOMODI-2024^FS

^FO30,870^GB740,1,3^FS

^XZ`;

async function zplToPdf(zpl) {
    const labelaryUrl = `https://api.labelary.com/v1/printers/8dpmm/labels/3.94x6.5/`;
    const response = await fetch(labelaryUrl, {
        method: 'POST',
        headers: { Accept: 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: zpl,
    });
    if (!response.ok) {
        const err = await response.text().catch(() => 'Unknown error');
        throw new Error(`Labelary error: ${err}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

export async function GET() {
    try {
        const pdf = await zplToPdf(TEST_ZPL);
        return new NextResponse(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="etiqueta-test.pdf"',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error generando etiqueta de test:', error);
        return NextResponse.json({ error: error.message }, { status: 502 });
    }
}
