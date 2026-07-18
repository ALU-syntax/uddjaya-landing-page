import crypto from 'node:crypto';

import pool from '../../src/config/mysql.js';

function generateCode() {
  return crypto.randomBytes(16).toString('hex');
}

async function createUniqueCode(connection) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const [[existingCode]] = await connection.query(
      `
        SELECT id
        FROM membership_registration_links
        WHERE code = ?
        LIMIT 1
      `,
      [code],
    );

    if (!existingCode) {
      return code;
    }
  }

  throw new Error('Gagal membuat kode registrasi membership yang unik.');
}

async function ensureCodeUniqueIndex(connection) {
  const [[index]] = await connection.query(`
    SELECT COUNT(*) AS total
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'membership_registration_links'
      AND index_name = 'membership_registration_links_code_unique'
  `);

  if (Number(index.total) === 0) {
    await connection.query(`
      ALTER TABLE membership_registration_links
      ADD UNIQUE KEY membership_registration_links_code_unique (code)
    `);
  }
}

async function up() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS membership_registration_links (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(255) NOT NULL,
        outlet_id BIGINT(20) UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY membership_registration_links_code_unique (code),
        KEY membership_registration_links_outlet_id_foreign (outlet_id),
        CONSTRAINT membership_registration_links_outlet_id_foreign
          FOREIGN KEY (outlet_id) REFERENCES outlets (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [outdatedLinks] = await connection.query(`
      SELECT id
      FROM membership_registration_links
      WHERE code LIKE 'register-outlet-%'
    `);

    let updatedCodeCount = 0;

    for (const link of outdatedLinks) {
      const code = await createUniqueCode(connection);

      await connection.query(
        `
          UPDATE membership_registration_links
          SET code = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [code, link.id],
      );

      updatedCodeCount += 1;
    }

    await ensureCodeUniqueIndex(connection);

    const [updatedNames] = await connection.query(`
      UPDATE membership_registration_links
      JOIN outlets ON outlets.id = membership_registration_links.outlet_id
      SET
        membership_registration_links.name = outlets.name,
        membership_registration_links.updated_at = NOW()
      WHERE membership_registration_links.name <> outlets.name
    `);

    const [outlets] = await connection.query(`
      SELECT outlets.id, outlets.name
      FROM outlets
      WHERE NOT EXISTS (
        SELECT 1
        FROM membership_registration_links
        WHERE membership_registration_links.outlet_id = outlets.id
      )
    `);

    let insertedCount = 0;

    for (const outlet of outlets) {
      const code = await createUniqueCode(connection);

      await connection.query(
        `
          INSERT INTO membership_registration_links
            (name, code, outlet_id, created_at, updated_at)
          VALUES (?, ?, ?, NOW(), NOW())
        `,
        [outlet.name, code, outlet.id],
      );

      insertedCount += 1;
    }

    await connection.commit();

    console.log(
      [
        'Migration selesai.',
        `${insertedCount} membership registration link ditambahkan.`,
        `${updatedNames.affectedRows} nama link diperbarui.`,
        `${updatedCodeCount} kode lama diganti menjadi kode acak.`,
      ].join(' '),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

up()
  .catch((error) => {
    console.error('Migration gagal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
