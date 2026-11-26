// Konstanta pendaftaran customer B2B. Data ditulis langsung ke tabel b2b_* milik backoffice (repo pos-udjay),
// jadi nilai di sini HARUS sama dengan sumbernya di Laravel. Ubah keduanya bersamaan.

// = App\Models\B2b\Customer::TYPES
export const customerTypes = {
  individual: 'Perorangan',
  pt: 'PT',
  cv: 'CV',
};

export const accountTypeBank = 'bank';
export const accountTypeEwallet = 'ewallet';

// Daftar bank / e-wallet dibaca dari tabel master account_providers (sama dengan backoffice), bukan dari kode.

// Reminder pendaftar form umum: semua jadwal Customer::REMINDER_DAYS (H-7, H-3, H-1, Hari H) + harian setelah lewat
// jatuh tempo (reminder_overdue_daily; di Laravel harian s.d. H+7 lalu mingguan). Kunci = Customer::REMINDER_CHANNELS.
export const portalReminderDays = [-7, -3, -1, 0];
export const reminderChannelEmail = 'email';
export const reminderChannelWhatsApp = 'whatsapp';

// = CustomerAccount::MAX_PER_CUSTOMER
export const maxAccountsPerCustomer = 10;

// = App\Services\WilayahService::CHILD_LEVELS. Kode wilayah Kemendagri bertitik: 32 / 32.01 / 32.01.01 / 32.01.01.1001.
export const regionLevels = {
  regencies: { table: 'regencies', parentColumn: 'province_code' },
  districts: { table: 'districts', parentColumn: 'regency_code' },
  villages: { table: 'villages', parentColumn: 'district_code' },
};

/** Pilihan dropdown dikelompokkan per jenis: [{ label: 'Bank', options: [{ code, name }] }, ...]. */
export function groupAccountProviders(providers) {
  const labels = { [accountTypeBank]: 'Bank', [accountTypeEwallet]: 'E-wallet' };

  return Object.entries(labels)
    .map(([type, label]) => ({
      label,
      options: [...providers.values()].filter((provider) => provider.type === type).map(({ code, name }) => ({ code, name })),
    }))
    .filter((group) => group.options.length > 0);
}
