import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Una cuenta nueva que entra por /login se transfiere al registro: ese destino también debe ser la app,
// o Clerk usa su URL por defecto (la portada).
test('login y registro fuerzan la app también en la transferencia entre ambos', () => {
  const login = readFileSync(new URL('../src/app/login/[[...login]]/page.js', import.meta.url), 'utf8');
  const signup = readFileSync(new URL('../src/app/sign-up/[[...sign-up]]/page.js', import.meta.url), 'utf8');
  assert.match(login, /signUpForceRedirectUrl=\{returnTo\}/);
  assert.match(login, /signUpFallbackRedirectUrl=\{returnTo\}/);
  assert.match(signup, /signInForceRedirectUrl=\{returnTo\}/);
  assert.match(signup, /signInFallbackRedirectUrl=\{returnTo\}/);
});
