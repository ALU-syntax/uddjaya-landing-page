import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import pool from '../config/mysql.js';

const genderOptions = ['laki-laki', 'perempuan'];

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
  name: requiredString('Nama'),
  phone: requiredString('Nomor telepon', (schema) =>
    schema.regex(
      /^08\d{0,11}$/,
      'Nomor telepon harus diawali 08, hanya boleh angka, dan maksimal 13 digit.',
    ),
  ),
  email: requiredString('Email', (schema) =>
    schema.email('Format email tidak valid.'),
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
});

const referralCheckSchema = z.object({
  phone: requiredString('Nomor referral', (schema) =>
    schema.regex(
      /^08\d{0,11}$/,
      'Nomor referral harus diawali 08, hanya boleh angka, dan maksimal 13 digit.',
    ),
  ),
});

async function findRegistrationLinkByCode(code) {
  const [rows] = await pool.query(
    `
      SELECT
        membership_registration_links.id,
        membership_registration_links.name,
        membership_registration_links.code,
        membership_registration_links.outlet_id,
        outlets.name AS outlet_name
      FROM membership_registration_links
      JOIN outlets ON outlets.id = membership_registration_links.outlet_id
      WHERE membership_registration_links.code = ?
      LIMIT 1
    `,
    [code],
  );

  return rows[0] ?? null;
}

async function findCustomerByPhone(phone) {
  const [customers] = await pool.query(
    `
      SELECT id
      FROM customers
      WHERE telfon = ?
      LIMIT 1
    `,
    [phone],
  );

  return customers[0] ?? null;
}

async function findActivePettyCashByOutletId(outletId) {
  const [pettyCashes] = await pool.query(
    `
      SELECT user_id_started
      FROM petty_cashes
      WHERE outlet_id = ?
        AND user_id_ended IS NULL
      ORDER BY open DESC, id DESC
      LIMIT 1
    `,
    [outletId],
  );

  return pettyCashes[0] ?? null;
}

async function findUsedCustomerContacts(phone, email) {
  const [customers] = await pool.query(
    `
      SELECT telfon, email
      FROM customers
      WHERE telfon = ?
        OR LOWER(email) = LOWER(?)
    `,
    [phone, email],
  );

  return {
    phone: customers.some((customer) => customer.telfon === phone),
    email: customers.some(
      (customer) => customer.email?.toLowerCase() === email.toLowerCase(),
    ),
  };
}

async function findCommunitiesByOutletId(outletId) {
  const [communities] = await pool.query(
    `
      SELECT id, name
      FROM communities
      WHERE outlet_id = ?
        AND status = 1
        AND deleted_at IS NULL
      ORDER BY name ASC
    `,
    [outletId],
  );

  return communities;
}

function sendRegistrationLinkNotFound(res) {
  return res.status(404).send('Link registrasi membership tidak ditemukan.');
}

const register = asyncHandler(async (req, res) => {
  const registrationLink = await findRegistrationLinkByCode(req.params.code);

  if (!registrationLink) {
    return sendRegistrationLinkNotFound(res);
  }

  res.render('register', {
    title: `Registrasi Membership ${registrationLink.name}`,
    communities: [],
    registrationLink,
  });
});

const communities = asyncHandler(async (req, res) => {
  const registrationLink = await findRegistrationLinkByCode(req.params.code);

  if (!registrationLink) {
    return res.status(404).json({
      message: 'Link registrasi membership tidak ditemukan.',
    });
  }

  return res.json({
    data: await findCommunitiesByOutletId(registrationLink.outlet_id),
  });
});

const referral = asyncHandler(async (req, res) => {
  const registrationLink = await findRegistrationLinkByCode(req.params.code);

  if (!registrationLink) {
    return res.status(404).json({
      message: 'Link registrasi membership tidak ditemukan.',
    });
  }

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

const store = asyncHandler(async (req, res) => {
  const registrationLink = await findRegistrationLinkByCode(req.params.code);

  if (!registrationLink) {
    return sendRegistrationLinkNotFound(res);
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
    name,
    phone,
    email,
    birth_date: birthDate,
    gender,
    community_id: communityId,
    referral,
  } = validation.data;

  const activePettyCash = await findActivePettyCashByOutletId(
    registrationLink.outlet_id,
  );

  if (!activePettyCash) {
    return res.status(400).json({
      message: 'Store telah tutup, silahkan daftar kembali besok ya warga',
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

  if (referral && !(await findCustomerByPhone(referral))) {
    return res.status(400).json({
      message: 'Nomor referral tidak terdaftar sebagai customer.',
      errors: {
        referral: ['Nomor referral tidak terdaftar sebagai customer.'],
      },
    });
  }

  return res.status(201).json({
    message: 'Registrasi membership berhasil.',
    data: {
      name,
      phone,
      email,
      birthDate,
      gender,
      communityId: communityId || null,
      outletName: registrationLink.outlet_name,
      referral: referral || null,
    },
  });
});

export default {
  communities,
  referral,
  register,
  store,
};
