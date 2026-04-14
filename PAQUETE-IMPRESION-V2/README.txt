PAQUETE IMPRESION V2 (portable)

Que contiene:
- imprimir-v2.bat
- reintentar-sync-v2.bat
- print-agent/ (script, parser, config y data)

Requisitos en la PC nueva:
1) Node.js instalado (version 18 o superior)
2) Impresora Zebra compartida en Windows con nombre exacto:
   \\127.0.0.1\ZDesigner ZD420-203dpi ZPL

Si tu share tiene otro nombre, usar variable de entorno antes de ejecutar:
set PRINT_V2_PRINTER_PATH=\\127.0.0.1\TU_SHARE

Configuracion:
1) Abrir print-agent\config.json
2) Verificar:
   - printerPath
   - syncUrl (ya viene con https://logitrack-tan.vercel.app/api/v2/print-jobs/intake)
   - workspaceKey (sale de Setup Impresion en la app)
   - dryRun=false

Uso:
1) Arrastrar archivos .txt/.zpl sobre imprimir-v2.bat
2) El sistema ordena por SKU (cantidad desc, empate alfabetico)
3) Imprime y luego sincroniza con la app
4) Si falla sync, queda en cola pendiente y reintenta en cada corrida

Si queres enviar data a la app sin reimprimir:
- usar reingestar-sin-imprimir-v2.bat

Control de integridad (obligatorio):
- antes de imprimir compara etiquetas entrada/salida por hash
- si detecta diferencia, NO imprime y NO ejecuta fallback legacy
- deja reporte en print-agent\data\*.integrity.json

Reintento manual de pendientes:
- ejecutar reintentar-sync-v2.bat

Diagnostico de impresora:
- ejecutar diagnostico-impresora-v2.bat

Importante para espacios nuevos:
- antes de imprimir por primera vez, completar la configuracion inicial del workspace en la app
- copiar el `workspaceKey` al `config.json` del agente
- sin ese paso, la impresion V2 no queda aislada por workspace

Archivos de diagnostico:
- print-agent\data\last_run.log
- ultimo_ordenado_v2.txt (preview del ultimo orden generado)
