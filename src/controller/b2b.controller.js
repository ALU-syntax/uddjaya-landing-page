import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import {
  accountProviderGroups,
  accountProviders,
  accountTypeEwallet,
  customerTypes,
  ewalletProviderCodes,
  maxAccountsPerCustomer,
  regionLevels,
} from '../constants/b2b.js';
import {
  createPortalCustomer,
  findInvalidRegions,
  findProvinces,
  findRegionChildren,
  findTakenAccounts,
  runInTransaction,
} from '../model/b2b.js';
import { getTurnstileSiteKey, validateTurnstile } from '../service/turnstile.js';

// Pendaftaran umum customer B2B (Budiman Roastery). Customer langsung aktif dan muncul di backoffice
// pos-udjay dengan label "Daftar via form" (b2b_customers.registered_via = 'portal').
// Aturan validasi = App\Http\Requests\B2b\CustomerRequest, ditambah wajib PIC + telepon.

const turnstileAction = 'b2b-register';
const takenAccountMessage = 'Rekening ini sudah terdaftar. Hubungi kami bila ini rekening Anda.';

// Seperti middleware TrimStrings + ConvertEmptyStringsToNull di Laravel: teks dirapikan, kosong = null.
const text = (max, label) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null),
    z.string().max(max, `${label} maksimal ${max} karakter.`).nullable(),
  );

const requiredText = (max, label) =>
  text(max, label).refine((value) => value !== null, `${label} wajib diisi.`);

const regionCode = (max) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null),
    z.string().max(max).regex(/^[\d.]+$/, 'Pilihan wilayah tidak valid.').nullable(),
  );

const registrationSchema = z
  .object({
    type: z.enum(Object.keys(customerTypes), { message: 'Pilih jenis usaha.' }),
    name: requiredText(255, 'Nama'),
    npwp: text(30, 'NPWP'),
    contact_name: requiredText(255, 'Nama PIC'),
    phone: requiredText(30, 'Telepon').refine(
      (value) => value === null || /^08\d{8,13}$/.test(value),
      'Telepon harus diawali 08 dan berisi 10–15 angka.',
    ),
    email: text(255, 'Email')
      .transform((value) => value?.toLowerCase() ?? null)
      .refine((value) => value === null || z.email().safeParse(value).success, 'Format email tidak valid.'),
    address: text(1000, 'Alamat'),
    province_code: regionCode(2),
    regency_code: regionCode(5),
    district_code: regionCode(8),
    village_code: regionCode(13),
    postal_code: text(10, 'Kode pos'),
    accounts: z.array(z.unknown()).max(maxAccountsPerCustomer, `Maksimal ${maxAccountsPerCustomer} rekening.`).default([]),
  })
  // = required_with di CustomerRequest: tingkat atas wajib bila tingkat di bawahnya diisi.
  .superRefine((data, ctx) => {
    const chain = [
      ['province_code', 'Provinsi', ['regency_code', 'district_code', 'village_code']],
      ['regency_code', 'Kota/kabupaten', ['district_code', 'village_code']],
      ['district_code', 'Kecamatan', ['village_code']],
    ];

    for (const [field, label, below] of chain) {
      if (!data[field] && below.some((child) => data[child])) {
        ctx.addIssue({ code: 'custom', path: [field], message: `${label} wajib dipilih.` });
      }
    }
  });

/** = CustomerAccount::normalizeNumber(): angka saja; nomor e-wallet 62… diseragamkan ke 08…. */
function normalizeAccountNumber(number, provider) {
  let digits = String(number ?? '').replace(/\D+/g, '');

  if (accountProviders[provider]?.[0] === accountTypeEwallet && digits.startsWith('62')) {
    digits = `0${digits.slice(2)}`;
  }

  return digits;
}

/** = CustomerRequest::normalizedAccounts() + aturan rekening. Baris yang seluruhnya kosong dibuang. */
function parseAccounts(rows) {
  const accounts = rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const provider = String(row.provider ?? '').trim();

      return {
        provider,
        account_number: normalizeAccountNumber(row.account_number, provider),
        account_name: String(row.account_name ?? '').trim(),
      };
    })
    .filter((row) => row.provider || row.account_number || row.account_name);
  const errors = {};
  const seen = new Map();

  accounts.forEach((account, index) => {
    const key = `accounts.${index}`;

    if (!accountProviders[account.provider]) {
      errors[`${key}.provider`] = ['Pilih bank / e-wallet dari daftar.'];
    }

    if (!account.account_number) {
      errors[`${key}.account_number`] = ['Nomor wajib diisi.'];
    } else if (!/^\d{6,20}$/.test(account.account_number)) {
      errors[`${key}.account_number`] = ['Nomor harus 6–20 angka.'];
    } else if (accountProviders[account.provider]?.[0] === accountTypeEwallet && !/^08\d{8,13}$/.test(account.account_number)) {
      errors[`${key}.account_number`] = ['Nomor e-wallet berupa nomor HP, contoh 081234567890.'];
    }

    if (!account.account_name) {
      errors[`${key}.account_name`] = ['Nama pemilik wajib diisi.'];
    } else if (account.account_name.length > 255) {
      errors[`${key}.account_name`] = ['Nama pemilik maksimal 255 karakter.'];
    }

    const identity = `${account.provider}|${account.account_number}`;

    if (seen.has(identity) && !errors[`${key}.account_number`]) {
      errors[`${key}.account_number`] = [`Rekening ini sudah ada di baris ${seen.get(identity) + 1}.`];
    }

    if (!seen.has(identity)) {
      seen.set(identity, index);
    }
  });

  return { accounts, errors };
}

function invalid(res, errors) {
  return res.status(422).json({ message: Object.values(errors)[0]?.[0] ?? 'Data pendaftaran tidak valid.', errors });
}

const register = asyncHandler(async (req, res) => {
  res.render('b2b/register', {
    title: 'Pendaftaran Customer B2B',
    customerTypes,
    providerGroups: accountProviderGroups(),
    ewalletProviderCodes,
    maxAccounts: maxAccountsPerCustomer,
    provinces: await findProvinces(),
    turnstileSiteKey: getTurnstileSiteKey(),
  });
});

const regionQuerySchema = z.object({
  level: z.enum(Object.keys(regionLevels)),
  parent: z.string().trim().regex(/^[\d.]{1,13}$/),
});

/** Pilihan dropdown wilayah berjenjang. Format sama dengan backoffice: { data: [{ id, text, postal_code? }] }. */
const regions = asyncHandler(async (req, res) => {
  const validation = regionQuerySchema.safeParse(req.query);

  if (!validation.success) {
    return res.status(400).json({ message: 'Permintaan wilayah tidak valid.' });
  }

  const { level, parent } = validation.data;
  const rows = await findRegionChildren(level, parent);

  res.set('Cache-Control', 'public, max-age=86400');

  return res.json({
    data: rows.map((row) => ({
      id: row.code,
      text: row.name,
      ...(row.postal_code ? { postal_code: row.postal_code } : {}),
    })),
  });
});

const store = asyncHandler(async (req, res) => {
  const turnstile = await validateTurnstile(req, turnstileAction);

  if (!turnstile.success) {
    return invalid(res, { turnstile: [turnstile.message] });
  }

  // Perorangan: PIC kosong = orang yang sama dengan nama lengkap (centang "PIC sama dengan nama lengkap").
  const body = { ...(req.body ?? {}) };

  if (body.type === 'individual' && !String(body.contact_name ?? '').trim()) {
    body.contact_name = body.name;
  }

  const validation = registrationSchema.safeParse(body);

  if (!validation.success) {
    const errors = {};

    for (const issue of validation.error.issues) {
      const field = issue.path.join('.') || 'form';
      errors[field] ??= [issue.message];
    }

    return invalid(res, errors);
  }

  const data = validation.data;
  const { accounts, errors: accountErrors } = parseAccounts(data.accounts);

  if (Object.keys(accountErrors).length > 0) {
    return invalid(res, accountErrors);
  }

  const regionErrors = await findInvalidRegions(data);

  if (Object.keys(regionErrors).length > 0) {
    return invalid(res, Object.fromEntries(Object.entries(regionErrors).map(([field, message]) => [field, [message]])));
  }

  // Satu rekening hanya milik satu customer. Pesan sengaja tidak menyebut pemiliknya (form publik).
  const takenErrors = (taken) =>
    Object.fromEntries(
      accounts
        .map((account, index) => [account, index])
        .filter(([account]) => taken.some((row) => row.provider === account.provider && row.account_number === account.account_number))
        .map(([, index]) => [`accounts.${index}.account_number`, [takenAccountMessage]]),
    );
  const taken = takenErrors(await findTakenAccounts(accounts));

  if (Object.keys(taken).length > 0) {
    return invalid(res, taken);
  }

  try {
    const customer = await runInTransaction((connection) => createPortalCustomer({ ...data, accounts }, connection));

    return res.status(201).json({
      message: 'Pendaftaran berhasil.',
      data: { code: customer.code, name: data.name },
    });
  } catch (error) {
    // Rekening didaftarkan orang lain di antara pengecekan dan penyimpanan (indeks unik provider + nomor).
    if (error?.code === 'ER_DUP_ENTRY') {
      const nowTaken = takenErrors(await findTakenAccounts(accounts));

      return invalid(res, Object.keys(nowTaken).length ? nowTaken : { form: ['Data sudah terdaftar. Silakan periksa kembali.'] });
    }

    throw error;
  }
});

export default {
  register,
  regions,
  store,
};
