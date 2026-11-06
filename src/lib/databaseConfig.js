export const PCMIDI_DATABASE_URL = 'https://pcmidi.tailef6e62.ts.net';

export function databaseConfig(env = process.env, { readOnly = false, production = false } = {}) {
  const suffix = production ? '_PROD' : '';
  const url = String(env[`DATABASE_URL${suffix}`] || (production ? PCMIDI_DATABASE_URL : '')).trim();
  const tokenKey = readOnly ? 'DATABASE_READONLY_AUTH_TOKEN' : 'DATABASE_AUTH_TOKEN';
  const authToken = String(env[`${tokenKey}${suffix}`] || (production ? env[tokenKey] : '') || '').trim();
  if (!url || !authToken) throw new Error(`Faltan DATABASE_URL${suffix} o ${tokenKey}${suffix}. Configurá libSQL de PC MIDI.`);
  const parsed = new URL(url);
  if (parsed.hostname.endsWith('.turso.io') || parsed.hostname === 'turso.io') {
    throw new Error('GeoModi usa libSQL de PC MIDI. No se permite conectar a Turso.');
  }
  if (production && parsed.href !== `${PCMIDI_DATABASE_URL}/`) {
    throw new Error('La base de producción debe ser el servicio HTTPS de PC MIDI.');
  }
  return { url, authToken };
}
