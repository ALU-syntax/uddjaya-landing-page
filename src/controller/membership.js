import asyncHandler from 'express-async-handler';

const register = asyncHandler(async (req, res) => {
  res.render('register', {
    title: 'Registrasi Membership',
    communities: [],
  });
});

const store = asyncHandler(async (req, res) => {
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
      referral: referral || null,
    },
  });
});

export default {
  register,
  store,
};
