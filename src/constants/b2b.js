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
