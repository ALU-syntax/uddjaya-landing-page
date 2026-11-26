import pool from '../config/mysql.js';
import { portalReminderDays, regionLevels, reminderChannelEmail, reminderChannelWhatsApp } from '../constants/b2b.js';

// Penulisan ke tabel b2b_* milik backoffice (repo pos-udjay). Urutan & isi kolom mengikuti
// App\Services\B2b\CustomerService::create + SequenceService::customerCode + ActivityLogger.
// Timestamp = jam dinding WIB, sama dengan Laravel (AppServiceProvider: date_default_timezone_set('Asia/Jakarta'),
// jadi now() bernilai WIB walau config app.timezone = UTC). Dihitung di Node supaya tidak bergantung zona waktu MySQL.

/** "YYYY-MM-DD HH:mm:ss" jam Asia/Jakarta, format yang ditulis Laravel ke kolom timestamp. */
export function wibNow(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

// = (new App\Models\B2b\Customer)->getMorphClass() — tanpa morph map, jadi nama kelas penuh.
const customerMorphClass = 'App\\Models\\B2b\\Customer';

const retryableErrors = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

/** Transaksi dengan percobaan ulang bila MySQL membatalkannya karena deadlock (seluruh transaksi diulang dari awal). */
export async function runInTransaction(callback, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const result = await callback(connection);

      await connection.commit();

      return result;
    } catch (error) {
      await connection.rollback();

      if (!retryableErrors.has(error?.code) || attempt >= attempts) {
        throw error;
      }
    } finally {
      connection.release();
    }
  }
}

/**
 * Bank & e-wallet aktif dari master account_providers (diisi AccountProviderSeeder di pos-udjay), urut seperti backoffice.
 * @returns {Promise<Map<string, { code: string, type: string, name: string }>>}
 */
export async function findActiveAccountProviders() {
  const [rows] = await pool.query(`
    SELECT code, type, name
    FROM account_providers
    WHERE is_active = 1
    ORDER BY sort_order, name
  `);

  return new Map(rows.map((row) => [row.code, row]));
}

export async function findProvinces() {
  const [rows] = await pool.query(`
    SELECT code, name
    FROM provinces
    ORDER BY name
  `);

  return rows;
}

/** Wilayah satu tingkat di bawah induknya (sama dengan WilayahService::children); kelurahan/desa membawa kode pos. */
export async function findRegionChildren(level, parentCode) {
  const config = regionLevels[level];

  if (!config || !parentCode) {
    return [];
  }

  // Nama tabel & kolom hanya dari daftar regionLevels (bukan input user), jadi aman disisipkan.
  const columns = level === 'villages' ? 'code, name, postal_code' : 'code, name';
  const [rows] = await pool.query(
    `
      SELECT ${columns}
      FROM ${config.table}
      WHERE ${config.parentColumn} = ?
      ORDER BY name
    `,
    [parentCode],
  );

  return rows;
}

/**
 * Cek wilayah berjenjang seperti CustomerRequest: tiap kode harus ada dan berada di bawah induknya.
 * @returns {Promise<Record<string, string>>} field yang tidak valid => pesan
 */
export async function findInvalidRegions({ province_code: province, regency_code: regency, district_code: district, village_code: village }) {
  const checks = [
    ['province_code', 'provinsi', province, 'SELECT 1 FROM provinces WHERE code = ?', [province]],
    ['regency_code', 'kota/kabupaten', regency, 'SELECT 1 FROM regencies WHERE code = ? AND province_code = ?', [regency, province]],
    ['district_code', 'kecamatan', district, 'SELECT 1 FROM districts WHERE code = ? AND regency_code = ?', [district, regency]],
    ['village_code', 'kelurahan/desa', village, 'SELECT 1 FROM villages WHERE code = ? AND district_code = ?', [village, district]],
  ];
  const errors = {};

  for (const [field, label, value, sql, params] of checks) {
    if (!value) {
      continue;
    }

    const [rows] = await pool.query(`${sql} LIMIT 1`, params);

    if (rows.length === 0) {
      errors[field] = `Pilihan ${label} tidak valid.`;
    }
  }

  return errors;
}

/** Rekening (provider + nomor) yang sudah terdaftar di customer mana pun. */
export async function findTakenAccounts(accounts, connection = pool) {
  if (accounts.length === 0) {
    return [];
  }

  const conditions = accounts.map(() => '(provider = ? AND account_number = ?)').join(' OR ');
  const params = accounts.flatMap((account) => [account.provider, account.account_number]);
  const [rows] = await connection.query(
    `
      SELECT provider, account_number
      FROM b2b_customer_accounts
      WHERE ${conditions}
    `,
    params,
  );

  return rows;
}

/**
 * = SequenceService::customerCode(): baris sequence dikunci sampai transaksi selesai, jadi kode tidak pernah dobel.
 * Baris dikunci dulu (FOR UPDATE); INSERT IGNORE hanya bila baris belum ada. INSERT IGNORE pada baris yang sudah ada
 * mengambil shared lock, dan dua pendaftaran bersamaan yang sama-sama memegangnya lalu meminta FOR UPDATE = deadlock.
 */
async function nextCustomerCode(connection, now) {
  const lockSequence = async () => {
    const [[row]] = await connection.query(
      `
        SELECT id, last_number
        FROM b2b_sequences
        WHERE type = 'customer' AND period = 'all'
        FOR UPDATE
      `,
    );

    return row;
  };

  let sequence = await lockSequence();

  if (!sequence) {
    await connection.query(
      `
        INSERT IGNORE INTO b2b_sequences (type, period, last_number, created_at, updated_at)
        VALUES ('customer', 'all', 0, ?, ?)
      `,
      [now, now],
    );
    sequence = await lockSequence();
  }

  const number = Number(sequence.last_number) + 1;

  await connection.query(
    'UPDATE b2b_sequences SET last_number = ?, updated_at = ? WHERE id = ?',
    [number, now, sequence.id],
  );

  return `CUS-B2B-${String(number).padStart(4, '0')}`;
}

/**
 * Pengaturan reminder pendaftar (format sama dengan cast array Laravel): channel mengikuti kontak yang diisi,
 * semua jadwal + harian setelah lewat jatuh tempo. Tanpa email dan telepon = mati dengan daftar kosong.
 */
export function portalReminderSettings(data) {
  const channels = [
    data.email ? reminderChannelEmail : null,
    data.phone ? reminderChannelWhatsApp : null,
  ].filter(Boolean);
  const enabled = channels.length > 0;

  return { enabled, channels, days: enabled ? portalReminderDays : [] };
}

/** = CustomerAccount::summary(): "BCA 1234567890 a.n. PT Maju". */
const accountSummary = (account, providers) =>
  `${providers.get(account.provider)?.name ?? account.provider.toUpperCase()} ${account.account_number} a.n. ${account.account_name}`;

/**
 * Simpan pendaftar sebagai customer B2B aktif beserta rekeningnya, lalu catat log "customer.created".
 * Reminder langsung aktif dengan semua jadwal (portalReminderDays + harian setelah lewat jatuh tempo) lewat channel
 * yang kontaknya diisi: email bila ada, WhatsApp bila ada telepon. Tanpa kontak sama sekali = reminder mati.
 * `providers` = hasil findActiveAccountProviders(), untuk jenis rekening & ringkasan log.
 */
export async function createPortalCustomer(data, providers, connection) {
  const now = wibNow();
  const code = await nextCustomerCode(connection, now);
  const reminder = portalReminderSettings(data);
  const [result] = await connection.query(
    `
      INSERT INTO b2b_customers (
        code, type, name, npwp, phone, email, contact_name,
        address, province_code, regency_code, district_code, village_code, postal_code,
        reminder_enabled, reminder_channels, reminder_days, reminder_overdue_daily,
        notes, is_active, registered_via, created_by, modified_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'portal', NULL, NULL, ?, ?)
    `,
    [
      code,
      data.type,
      data.name,
      data.npwp,
      data.phone,
      data.email,
      data.contact_name,
      data.address,
      data.province_code,
      data.regency_code,
      data.district_code,
      data.village_code,
      data.postal_code,
      reminder.enabled ? 1 : 0,
      JSON.stringify(reminder.channels),
      JSON.stringify(reminder.days),
      reminder.enabled ? 1 : 0,
      now,
      now,
    ],
  );
  const customerId = result.insertId;

  for (const account of data.accounts) {
    await connection.query(
      `
        INSERT INTO b2b_customer_accounts (b2b_customer_id, type, provider, account_number, account_name, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [customerId, providers.get(account.provider).type, account.provider, account.account_number, account.account_name, now, now],
    );
  }

  await connection.query(
    `
      INSERT INTO b2b_activity_logs (user_id, subject_type, subject_id, action, changes, created_at)
      VALUES (NULL, ?, ?, 'customer.created', ?, ?)
    `,
    [customerMorphClass, customerId, JSON.stringify({ accounts: data.accounts.map((account) => accountSummary(account, providers)), registered_via: 'portal' }), now],
  );

  return { id: customerId, code };
}
