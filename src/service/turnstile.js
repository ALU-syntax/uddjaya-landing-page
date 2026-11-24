// Verifikasi Cloudflare Turnstile untuk form publik. Logika sama dengan form membership
// (membership.controller.js), tetapi action bisa dipilih per form.

const siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const normalizeEnv = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : null;
};

export const getTurnstileSiteKey = () => normalizeEnv(process.env.TURNSTILE_SITE_KEY);

const getSecretKey = () => normalizeEnv(process.env.TURNSTILE_SECRET_KEY);

const getExpectedHostnames = () =>
  normalizeEnv(process.env.TURNSTILE_EXPECTED_HOSTNAME)
    ?.split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean) ?? [];

// Wajib di production, atau di mana pun kunci Turnstile diisi.
const isRequired = () =>
  process.env.NODE_ENV === 'production' || Boolean(getTurnstileSiteKey() || getSecretKey());

const firstHeader = (value) => (Array.isArray(value) ? value[0] ?? null : typeof value === 'string' ? value : null);

function clientIp(req) {
  return (
    firstHeader(req.headers['cf-connecting-ip']) ||
    firstHeader(req.headers['x-forwarded-for'])?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );
}

/** @returns {Promise<{ success: true } | { success: false, message: string }>} */
export async function validateTurnstile(req, action) {
  if (!isRequired()) {
    return { success: true };
  }

  if (!getTurnstileSiteKey() || !getSecretKey()) {
    return { success: false, message: 'Konfigurasi verifikasi keamanan belum lengkap.' };
  }

  const token = req.body?.['cf-turnstile-response'];

  if (typeof token !== 'string' || !token.trim()) {
    return { success: false, message: 'Verifikasi keamanan wajib diselesaikan.' };
  }

  const body = new URLSearchParams({ secret: getSecretKey(), response: token });
  const remoteIp = clientIp(req);

  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch(siteverifyUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    const expectedHostnames = getExpectedHostnames();
    const hostnameMatches = expectedHostnames.length === 0 || expectedHostnames.includes(result.hostname);

    if (response.ok && result.success === true && result.action === action && hostnameMatches) {
      return { success: true };
    }

    console.warn('Turnstile validation failed:', result['error-codes']);

    return { success: false, message: 'Verifikasi keamanan gagal. Silakan coba lagi.' };
  } catch (error) {
    console.error('Turnstile validation error:', error);

    return { success: false, message: 'Verifikasi keamanan belum bisa diproses. Silakan coba lagi.' };
  }
}
