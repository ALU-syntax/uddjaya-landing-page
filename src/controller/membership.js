import asyncHandler from 'express-async-handler';

import pool from '../config/mysql.js';

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

const store = asyncHandler(async (req, res) => {
  const registrationLink = await findRegistrationLinkByCode(req.params.code);

  if (!registrationLink) {
    return sendRegistrationLinkNotFound(res);
  }

  const {
    name,
    phone,
    email,
    birth_date: birthDate,
    gender,
    community_id: communityId,
    referral,
  } = req.body;

  const phonePattern = /^\d{1,13}$/;
  const referralPattern = /^\d{0,13}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const genderOptions = ['laki-laki', 'perempuan'];

  if (!name || !phone || !email || !birthDate || !gender || !communityId) {
    return res.status(400).json({
      message: 'Semua field wajib diisi kecuali referral.',
    });
  }

  if (!phonePattern.test(phone)) {
    return res.status(400).json({
      message: 'Nomor telepon hanya boleh angka dan maksimal 13 digit.',
    });
  }

  if (!emailPattern.test(email)) {
    return res.status(400).json({
      message: 'Format email tidak valid.',
    });
  }

  if (!genderOptions.includes(gender)) {
    return res.status(400).json({
      message: 'Gender tidak valid.',
    });
  }

  if (referral && !referralPattern.test(referral)) {
    return res.status(400).json({
      message: 'Referral hanya boleh angka dan maksimal 13 digit.',
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
      communityId,
      outletName: registrationLink.outlet_name,
      referral: referral || null,
    },
  });
});

export default {
  register,
  store,
};
