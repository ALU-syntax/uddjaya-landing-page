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

// = App\Models\B2b\CustomerAccount::PROVIDERS (kode => [jenis, nama tampil]). Daftar baku, tanpa ketik bebas.
export const accountProviders = {
  bca: [accountTypeBank, 'BCA'],
  mandiri: [accountTypeBank, 'Mandiri'],
  bri: [accountTypeBank, 'BRI'],
  bni: [accountTypeBank, 'BNI'],
  bsi: [accountTypeBank, 'BSI'],
  cimb: [accountTypeBank, 'CIMB Niaga'],
  danamon: [accountTypeBank, 'Danamon'],
  permata: [accountTypeBank, 'Permata'],
  btn: [accountTypeBank, 'BTN'],
  ocbc: [accountTypeBank, 'OCBC'],
  panin: [accountTypeBank, 'Panin'],
  maybank: [accountTypeBank, 'Maybank'],
  mega: [accountTypeBank, 'Bank Mega'],
  jenius: [accountTypeBank, 'Jenius / SMBC Indonesia'],
  jago: [accountTypeBank, 'Bank Jago'],
  seabank: [accountTypeBank, 'SeaBank'],
  blu: [accountTypeBank, 'blu by BCA Digital'],
  bjb: [accountTypeBank, 'Bank BJB'],
  dki: [accountTypeBank, 'Bank DKI'],
  jateng: [accountTypeBank, 'Bank Jateng'],
  jatim: [accountTypeBank, 'Bank Jatim'],
  gopay: [accountTypeEwallet, 'GoPay'],
  ovo: [accountTypeEwallet, 'OVO'],
  dana: [accountTypeEwallet, 'DANA'],
  shopeepay: [accountTypeEwallet, 'ShopeePay'],
  linkaja: [accountTypeEwallet, 'LinkAja'],
};

// = CustomerAccount::MAX_PER_CUSTOMER
export const maxAccountsPerCustomer = 10;

// = App\Services\WilayahService::CHILD_LEVELS. Kode wilayah Kemendagri bertitik: 32 / 32.01 / 32.01.01 / 32.01.01.1001.
export const regionLevels = {
  regencies: { table: 'regencies', parentColumn: 'province_code' },
  districts: { table: 'districts', parentColumn: 'regency_code' },
  villages: { table: 'villages', parentColumn: 'district_code' },
};

/** Pilihan dropdown dikelompokkan per jenis: [{ label: 'Bank', options: [{ code, name }] }, ...]. */
export function accountProviderGroups() {
  const labels = { [accountTypeBank]: 'Bank', [accountTypeEwallet]: 'E-wallet' };

  return Object.entries(labels).map(([type, label]) => ({
    label,
    options: Object.entries(accountProviders)
      .filter(([, [providerType]]) => providerType === type)
      .map(([code, [, name]]) => ({ code, name })),
  }));
}

export const ewalletProviderCodes = Object.entries(accountProviders)
  .filter(([, [type]]) => type === accountTypeEwallet)
  .map(([code]) => code);
