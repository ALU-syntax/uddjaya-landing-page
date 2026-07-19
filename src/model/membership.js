import pool from '../config/mysql.js';

export async function findRegistrationLinkByCode(code) {
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

export async function findCustomerByPhone(phone) {
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

export async function findActivePettyCashByOutletId(outletId) {
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

export async function findLowestActiveLevelMembership() {
  const [levelMemberships] = await pool.query(
    `
      SELECT *
      FROM level_memberships
      WHERE is_active = 1
        AND deleted_at IS NULL
      ORDER BY benchmark ASC
      LIMIT 1
    `,
  );

  return levelMemberships[0] ?? null;
}

export async function findUsedCustomerContacts(phone, email) {
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

export async function findCommunitiesByOutletId(outletId) {
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
