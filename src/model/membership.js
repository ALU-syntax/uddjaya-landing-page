import pool from '../config/mysql.js';

export async function runInTransaction(callback) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await callback(connection);

    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function findOutletById(outletId) {
  const [outlets] = await pool.query(
    `
      SELECT
        id AS outlet_id,
        name AS outlet_name
      FROM outlets
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
    `,
    [outletId],
  );

  return outlets[0] ?? null;
}

export async function findOutlets() {
  const [outlets] = await pool.query(
    `
      SELECT
        id,
        name
      FROM outlets
      WHERE is_active = 1
      ORDER BY id ASC
    `,
  );

  return outlets;
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

export async function findCommunities() {
  const [communities] = await pool.query(
    `
      SELECT id, name
      FROM communities
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `,
  );

  return communities;
}

export async function findCommunityById(id) {
  const [communities] = await pool.query(
    `
      SELECT id, name, exp
      FROM communities
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [id],
  );

  return communities[0] ?? null;
}

export async function createCustomer(customer, connection = pool) {
  const [result] = await connection.query(
    `
      INSERT INTO customers (
        name,
        telfon,
        umur,
        email,
        tanggal_lahir,
        domisili,
        gender,
        community_id,
        deleted_at,
        created_at,
        updated_at,
        exp,
        point,
        referral_id,
        level_memberships_id,
        user_id,
        level_batch
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        NULL,
        NOW(),
        NOW(),
        0,
        0,
        ?,
        ?,
        ?,
        1
      )
    `,
    [
      customer.name,
      customer.phone,
      customer.age,
      customer.email,
      customer.birthDate,
      customer.domisili,
      customer.gender,
      customer.communityId,
      customer.referralId,
      customer.levelMembershipId,
      customer.userId,
    ],
  );

  return {
    id: result.insertId,
  };
}

export async function createCustomerReferral(customerReferral, connection = pool) {
  const [result] = await connection.query(
    `
      INSERT INTO customer_referrals (
        customer_id,
        referral_id,
        user_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, NOW(), NOW())
    `,
    [
      customerReferral.customerId,
      customerReferral.referralId,
      customerReferral.userId,
    ],
  );

  return {
    id: result.insertId,
  };
}

export async function createHistoryExpMembershipLevel(history, connection = pool) {
  const [result] = await connection.query(
    `
      INSERT INTO history_exp_membership_levels (
        customer_id,
        level_memberships_id,
        exp,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, NOW(), NOW())
    `,
    [
      history.customerId,
      history.levelMembershipId,
      history.exp,
    ],
  );

  return {
    id: result.insertId,
  };
}

export async function incrementCustomerPoint(customerId, point, connection = pool) {
  await connection.query(
    `
      UPDATE customers
      SET
        point = COALESCE(point, 0) + ?,
        updated_at = NOW()
      WHERE id = ?
    `,
    [point, customerId],
  );
}

export async function createCustomerPointExpLog(pointExpLog, connection = pool) {
  const [result] = await connection.query(
    `
      INSERT INTO customer_poin_exps (
        customer_id,
        point,
        referee_id,
        log,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `,
    [
      pointExpLog.customerId,
      pointExpLog.point,
      pointExpLog.refereeId,
      pointExpLog.log,
    ],
  );

  return {
    id: result.insertId,
  };
}
