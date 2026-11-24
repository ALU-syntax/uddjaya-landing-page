import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import {
  accountProviderGroups,
  customerTypes,
  ewalletProviderCodes,
  maxAccountsPerCustomer,
  regionLevels,
} from '../constants/b2b.js';
import { findProvinces, findRegionChildren } from '../model/b2b.js';

// Pendaftaran umum customer B2B (Budiman Roastery). Customer langsung aktif dan muncul di backoffice
// pos-udjay dengan label "Daftar via form" (b2b_customers.registered_via = 'portal').

const getTurnstileSiteKey = () => {
  const value = process.env.TURNSTILE_SITE_KEY?.trim();

  return value && value.toLowerCase() !== 'null' ? value : null;
};

const regionQuerySchema = z.object({
  level: z.enum(Object.keys(regionLevels)),
  parent: z.string().trim().regex(/^[\d.]{1,13}$/),
});

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

export default {
  register,
  regions,
};
