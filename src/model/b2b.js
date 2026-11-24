import pool from '../config/mysql.js';
import { regionLevels } from '../constants/b2b.js';

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
