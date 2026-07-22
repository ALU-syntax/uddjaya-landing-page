import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import {
  createCustomer,
  createHistoryExpMembershipLevel,
  createCustomerPointExpLog,
  createCustomerReferral,
  findActivePettyCashByOutletId,
  findCommunityById,
  findCommunities,
  findCustomerByPhone,
  findLowestActiveLevelMembership,
  findOutletById,
  findOutlets,
  findUsedCustomerContacts,
  incrementCustomerPoint,
  runInTransaction,
} from '../model/membership.js';
import { publicAssetPath, sendMail } from '../service/mail.service.js';

const genderOptions = ['laki-laki', 'perempuan'];
const referralPoint = 75;
const referralPointLog = 'mendapatkan poin dari referee sebesar 75 poin';
const turnstileSiteverifyUrl =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const turnstileAction = 'membership-register';
const finishAccessCookieName = 'membership_register_finish';
const finishAccessMaxAgeMs = 10 * 60 * 1000;

const normalizeEnv = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : null;
};

const generatedFinishAccessSecret = randomBytes(32).toString('hex');

const getFinishAccessSecret = () =>
  normalizeEnv(process.env.FINISH_ACCESS_SECRET) ??
  normalizeEnv(process.env.COOKIE_SECRET) ??
  generatedFinishAccessSecret;

const getCookieOptions = () => ({
  httpOnly: true,
  maxAge: finishAccessMaxAgeMs,
  path: '/membership/register/finish',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
});

const signFinishAccessPayload = (payload) =>
  createHmac('sha256', getFinishAccessSecret())
    .update(payload)
    .digest('base64url');

const createFinishAccessToken = () => {
  const payload = `${Date.now()}.${randomBytes(16).toString('base64url')}`;

  return `${payload}.${signFinishAccessPayload(payload)}`;
};

const parseCookies = (cookieHeader = '') =>
  cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const separatorIndex = cookie.indexOf('=');

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = cookie.slice(0, separatorIndex);
      const value = cookie.slice(separatorIndex + 1);

      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }

      return cookies;
    }, {});

const isValidFinishAccessToken = (token) => {
  if (typeof token !== 'string') {
    return false;
  }

  const [timestamp, nonce, signature, ...extraParts] = token.split('.');

  if (!timestamp || !nonce || !signature || extraParts.length > 0) {
    return false;
  }

  const createdAt = Number(timestamp);

  if (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > finishAccessMaxAgeMs
  ) {
    return false;
  }

  const payload = `${timestamp}.${nonce}`;
  const expectedSignature = signFinishAccessPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  return (
    signatureBuffer.length === expectedSignatureBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  );
};

const setFinishAccessCookie = (res) => {
  res.cookie(
    finishAccessCookieName,
    createFinishAccessToken(),
    getCookieOptions(),
  );
};

const clearFinishAccessCookie = (res) => {
  res.clearCookie(finishAccessCookieName, {
    path: getCookieOptions().path,
    sameSite: getCookieOptions().sameSite,
    secure: getCookieOptions().secure,
  });
};

const getTurnstileSiteKey = () => normalizeEnv(process.env.TURNSTILE_SITE_KEY);

const getTurnstileSecretKey = () =>
  normalizeEnv(process.env.TURNSTILE_SECRET_KEY);

const getTurnstileExpectedHostname = () =>
  normalizeEnv(process.env.TURNSTILE_EXPECTED_HOSTNAME);

const getTurnstileExpectedHostnames = () =>
  getTurnstileExpectedHostname()
    ?.split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean) ?? [];

const isTurnstileRequired = () =>
  process.env.NODE_ENV === 'production' ||
  Boolean(getTurnstileSiteKey() || getTurnstileSecretKey());

const requiredString = (fieldName, validate = (schema) => schema) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : ''),
    validate(z.string().min(1, `${fieldName} wajib diisi.`)),
  );

const optionalString = (validate = (schema) => schema) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : ''),
    validate(z.string()),
  );

const requiredInteger = (fieldName) =>
  requiredString(fieldName, (schema) =>
    schema
      .regex(/^\d+$/, `${fieldName} tidak valid.`)
      .transform((value) => Number(value))
      .refine((value) => value > 0, `${fieldName} tidak valid.`),
  );

function isValidDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const registrationSchema = z.object({
  outlet_id: requiredInteger('Outlet'),
  name: requiredString('Nama', (schema) =>
    schema.max(244, 'Nama maksimal 244 karakter.'),
  ),
  phone: requiredString('Nomor telepon', (schema) =>
    schema.regex(
      /^08\d{0,11}$/,
      'Nomor telepon harus diawali 08, hanya boleh angka, dan maksimal 13 digit.',
    ),
  ),
  email: requiredString('Email', (schema) =>
    schema
      .email('Format email tidak valid.')
      .max(244, 'Email maksimal 244 karakter.'),
  ),
  domisili: requiredString('Domisili', (schema) =>
    schema.max(200, 'Domisili maksimal 200 karakter.'),
  ),
  birth_date: requiredString('Tanggal lahir', (schema) =>
    schema.refine(
      isValidDateInput,
      'Tanggal lahir harus berupa tanggal valid dengan format YYYY-MM-DD.',
    ),
  ),
  gender: requiredString('Gender', (schema) =>
    schema.refine(
      (value) => genderOptions.includes(value),
      'Gender tidak valid.',
    ),
  ),
  community_id: optionalString(),
  referral: optionalString((schema) =>
    schema.regex(
      /^(?:08\d{0,11})?$/,
      'Referral harus diawali 08, hanya boleh angka, dan maksimal 13 digit.',
    ),
  ),
  promo_kol: optionalString((schema) =>
    schema.max(100, 'Promo KoL maksimal 100 karakter.'),
  ),
});

const referralCheckSchema = z.object({
  phone: requiredString('Nomor referral', (schema) =>
    schema.regex(
      /^08\d{0,11}$/,
      'Nomor referral harus diawali 08, hanya boleh angka, dan maksimal 13 digit.',
    ),
  ),
});

const promoKolCheckSchema = z.object({
  code: requiredString('Promo KoL', (schema) =>
    schema.max(100, 'Promo KoL maksimal 100 karakter.'),
  ),
});

function calculateAge(birthDateInput) {
  const [birthYear, birthMonth, birthDay] = birthDateInput
    .split('-')
    .map(Number);
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  if (
    currentMonth < birthMonth ||
    (currentMonth === birthMonth && currentDay < birthDay)
  ) {
    age -= 1;
  }

  return age;
}

function formatDateId(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

function getMembershipExpiredDate() {
  const expiredDate = new Date();
  expiredDate.setFullYear(expiredDate.getFullYear() + 1);

  return formatDateId(expiredDate);
}

function getHeaderFirstValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' ? value : null;
}

function getClientIp(req) {
  const cloudflareIp = getHeaderFirstValue(req.headers['cf-connecting-ip']);
  const forwardedFor = getHeaderFirstValue(req.headers['x-forwarded-for']);

  return (
    cloudflareIp ||
    forwardedFor?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );
}

async function validateTurnstile(req) {
  if (!isTurnstileRequired()) {
    return { success: true };
  }

  if (!getTurnstileSiteKey() || !getTurnstileSecretKey()) {
    return {
      success: false,
      message: 'Konfigurasi verifikasi keamanan belum lengkap.',
    };
  }

  const token = req.body?.['cf-turnstile-response'];

  if (typeof token !== 'string' || !token.trim()) {
    return {
      success: false,
      message: 'Verifikasi keamanan wajib diselesaikan.',
    };
  }

  const body = new URLSearchParams({
    secret: getTurnstileSecretKey(),
    response: token,
  });
  const remoteIp = getClientIp(req);

  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch(turnstileSiteverifyUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    const expectedHostnames = getTurnstileExpectedHostnames();
    const hostnameMatches =
      expectedHostnames.length === 0 ||
      expectedHostnames.includes(result.hostname);

    if (
      response.ok &&
      result.success === true &&
      result.action === turnstileAction &&
      hostnameMatches
    ) {
      return { success: true };
    }

    console.warn('Turnstile validation failed:', result['error-codes']);

    return {
      success: false,
      message: 'Verifikasi keamanan gagal. Silakan coba lagi.',
    };
  } catch (error) {
    console.error('Turnstile validation error:', error);

    return {
      success: false,
      message: 'Verifikasi keamanan belum bisa diproses. Silakan coba lagi.',
    };
  }
}

const register = asyncHandler(async (req, res) => {
  res.render('register', {
    title: 'Registrasi Membership',
    communities: await findCommunities(),
    outlets: await findOutlets(),
    turnstileSiteKey: getTurnstileSiteKey(),
  });
});

const finish = asyncHandler(async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const finishAccessToken = cookies[finishAccessCookieName];

  res.set('Cache-Control', 'no-store');
  clearFinishAccessCookie(res);

  if (!isValidFinishAccessToken(finishAccessToken)) {
    return res.redirect('/membership/register');
  }

  res.render('register-finish', {
    title: 'Registrasi Berhasil',
  });
});

const communities = asyncHandler(async (req, res) => {
  return res.json({
    data: await findCommunities(),
  });
});

const referral = asyncHandler(async (req, res) => {
  const validation = referralCheckSchema.safeParse(req.query);

  if (!validation.success) {
    return res.status(400).json({
      message:
        validation.error.issues[0]?.message ??
        'Nomor referral tidak valid.',
      errors: {
        referral: validation.error.issues.map((issue) => issue.message),
      },
    });
  }

  const customer = await findCustomerByPhone(validation.data.phone);

  if (!customer) {
    return res.status(404).json({
      valid: false,
      message: 'Nomor referral tidak terdaftar sebagai customer.',
    });
  }

  return res.json({
    valid: true,
    message: 'Nomor referral terdaftar sebagai customer.',
  });
});

const promoKol = asyncHandler(async (req, res) => {
  const validation = promoKolCheckSchema.safeParse(req.query);

  if (!validation.success) {
    return res.status(400).json({
      valid: false,
      message:
        validation.error.issues[0]?.message ?? 'Promo KoL tidak valid.',
      errors: {
        promo_kol: validation.error.issues.map((issue) => issue.message),
      },
    });
  }

  return res.status(404).json({
    valid: false,
    message: 'Promo KoL tidak ditemukan.',
  });
});

const store = asyncHandler(async (req, res) => {
  const turnstileValidation = await validateTurnstile(req);

  if (!turnstileValidation.success) {
    return res.status(400).json({
      message: turnstileValidation.message,
      errors: {
        turnstile: [turnstileValidation.message],
      },
    });
  }

  const validation = registrationSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      message:
        validation.error.issues[0]?.message ??
        'Data registrasi membership tidak valid.',
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const {
    outlet_id: outletId,
    name,
    phone,
    email,
    domisili,
    birth_date: birthDate,
    gender,
    community_id: communityId,
    referral,
    promo_kol: promoKolCode,
  } = validation.data;

  const registrationOutlet = await findOutletById(outletId);

  if (!registrationOutlet) {
    return res.status(400).json({
      message: 'Outlet tidak ditemukan.',
      errors: {
        outlet_id: ['Outlet tidak ditemukan.'],
      },
    });
  }

  const activePettyCash = await findActivePettyCashByOutletId(
    registrationOutlet.outlet_id,
  );

  if (!activePettyCash) {
    return res.status(400).json({
      message: 'Store telah tutup, silahkan daftar kembali besok ya warga',
    });
  }

  const lowestLevelMembership = await findLowestActiveLevelMembership();

  if (!lowestLevelMembership) {
    return res.status(400).json({
      message: 'Level membership aktif tidak ditemukan.',
    });
  }

  const usedContacts = await findUsedCustomerContacts(phone, email);

  if (usedContacts.phone || usedContacts.email) {
    const errors = {};

    if (usedContacts.phone) {
      errors.phone = ['Nomor telepon sudah terdaftar.'];
    }

    if (usedContacts.email) {
      errors.email = ['Email sudah terdaftar.'];
    }

    return res.status(400).json({
      message:
        usedContacts.phone && usedContacts.email
          ? 'Nomor telepon dan email sudah terdaftar.'
          : Object.values(errors)[0][0],
      errors,
    });
  }

  const referralCustomer = referral ? await findCustomerByPhone(referral) : null;

  if (referral && !referralCustomer) {
    return res.status(400).json({
      message: 'Nomor referral tidak terdaftar sebagai customer.',
      errors: {
        referral: ['Nomor referral tidak terdaftar sebagai customer.'],
      },
    });
  }

  if (promoKolCode) {
    return res.status(400).json({
      message: 'Promo KoL tidak ditemukan.',
      errors: {
        promo_kol: ['Promo KoL tidak ditemukan.'],
      },
    });
  }

  const community = communityId ? await findCommunityById(communityId) : null;

  if (communityId && !community) {
    return res.status(400).json({
      message: 'Community tidak valid.',
      errors: {
        community_id: ['Community tidak valid.'],
      },
    });
  }

  const userId = activePettyCash.user_id_started;
  const customer = await runInTransaction(async (connection) => {
    const createdCustomer = await createCustomer(
      {
        name,
        phone,
        age: calculateAge(birthDate),
        email,
        birthDate,
        domisili,
        gender,
        communityId: communityId || null,
        referralId: referralCustomer?.id ?? null,
        levelMembershipId: lowestLevelMembership.id,
        userId,
      },
      connection,
    );

    await createHistoryExpMembershipLevel(
      {
        customerId: createdCustomer.id,
        levelMembershipId: lowestLevelMembership.id,
        exp: lowestLevelMembership.benchmark,
      },
      connection,
    );

    if (referralCustomer) {
      await createCustomerReferral(
        {
          customerId: createdCustomer.id,
          referralId: referralCustomer.id,
          userId,
        },
        connection,
      );

      await incrementCustomerPoint(
        referralCustomer.id,
        referralPoint,
        connection,
      );

      await createCustomerPointExpLog(
        {
          customerId: referralCustomer.id,
          point: referralPoint,
          refereeId: createdCustomer.id,
          log: referralPointLog,
        },
        connection,
      );
    }

    return createdCustomer;
  });

  const expired = getMembershipExpiredDate();

  if (community) {
    await sendMail({
      to: email,
      subject: 'Registrasi Membership Komunitas',
      template: 'registrasi-membership-komunitas.ejs',
      data: {
        name,
        namaKomunitas: community.name,
        poin: 0,
        exp: 0,
        expCommunity: community.exp,
        expired,
        logoUrl: 'cid:uddjaya-logo',
      },
      attachments: [
        {
          filename: 'logo.png',
          path: publicAssetPath('img', 'logo.png'),
          cid: 'uddjaya-logo',
        },
      ],
    });
  }

  await sendMail({
    to: email,
    subject: 'Registrasi Membership',
    template: 'registrasi-membership.ejs',
    data: {
      name,
      email,
      level_member: lowestLevelMembership.name,
      expired,
      logoUrl: 'cid:uddjaya-logo',
    },
    attachments: [
      {
        filename: 'logo.png',
        path: publicAssetPath('img', 'logo.png'),
        cid: 'uddjaya-logo',
      },
    ],
  });

  setFinishAccessCookie(res);

  return res.status(201).json({
    message: 'Registrasi membership berhasil.',
    redirectTo: '/membership/register/finish',
    data: {
      id: customer.id,
      name,
      phone,
      email,
      domisili,
      birthDate,
      gender,
      communityId: communityId || null,
      communityName: community?.name ?? null,
      levelMembershipId: lowestLevelMembership.id,
      outletName: registrationOutlet.outlet_name,
      referralId: referralCustomer?.id ?? null,
    },
  });
});

export default {
  communities,
  finish,
  promoKol,
  referral,
  register,
  store,
};
