/* Pendaftaran customer B2B: dropdown wilayah berjenjang, baris rekening, dan petunjuk sesuai jenis usaha. */
(function () {
  const config = JSON.parse(document.getElementById('b2b-config')?.textContent || '{}');
  const ewalletProviders = config.ewalletProviders || [];

  function showToast(type, message) {
    if (window.iziToast) {
      window.iziToast[type]({ message, position: 'topRight', timeout: 4000 });
    }
  }

  // Input angka saja (telepon, kode pos, nomor rekening).
  document.addEventListener('input', (event) => {
    const input = event.target;

    if (input.classList?.contains('js-digits-only')) {
      input.value = input.value.replace(/\D+/g, '');
    }
  });

  // Label & petunjuk nama mengikuti jenis usaha.
  const typeHints = {
    individual: ['Nama lengkap', 'Nama sesuai KTP.', 'Budi Santoso'],
    pt: ['Nama usaha', 'Tulis lengkap dengan PT seperti di dokumen resmi.', 'PT Kopi Nusantara'],
    cv: ['Nama usaha', 'Tulis lengkap dengan CV seperti di dokumen resmi.', 'CV Kopi Nusantara'],
  };

  function updateTypeHints() {
    const type = document.querySelector('input[name="type"]:checked')?.value;
    const [label, help, placeholder] = typeHints[type] || typeHints.pt;

    document.querySelector('[data-type-label]').textContent = label;
    document.querySelector('[data-type-help]').textContent = help;
    document.getElementById('name').placeholder = placeholder;
  }

  document.querySelectorAll('input[name="type"]').forEach((radio) => radio.addEventListener('change', updateTypeHints));
  updateTypeHints();

  // Rekening pengirim: nama input diurutkan ulang (accounts[i][field]) setiap baris ditambah/dihapus.
  const accountRows = document.getElementById('account-rows');
  const accountAdd = document.getElementById('account-add');
  const accountTemplate = document.getElementById('account-row-template');
  const accountMax = Number(accountRows.dataset.max || 10);

  function reindexAccounts() {
    const rows = accountRows.querySelectorAll('.b2b-account');

    rows.forEach((row, index) => {
      row.querySelectorAll('[data-field]').forEach((field) => {
        field.name = `accounts[${index}][${field.dataset.field}]`;
        field.id = `accounts-${index}-${field.dataset.field}`;
        field.closest('.form-field').querySelector('label').htmlFor = field.id;
      });
    });
    accountAdd.disabled = rows.length >= accountMax;
    accountAdd.textContent = rows.length ? '+ Tambah rekening lain' : '+ Tambah rekening';
  }

  accountAdd.addEventListener('click', () => {
    if (accountRows.children.length >= accountMax) {
      return;
    }

    accountRows.appendChild(accountTemplate.content.cloneNode(true));
    reindexAccounts();
    accountRows.lastElementChild.querySelector('[data-field="provider"]').focus();
  });

  accountRows.addEventListener('click', (event) => {
    if (event.target.closest('.b2b-account__remove')) {
      event.target.closest('.b2b-account').remove();
      reindexAccounts();
    }
  });

  // E-wallet memakai nomor HP, bank memakai nomor rekening.
  accountRows.addEventListener('change', (event) => {
    if (event.target.dataset.field !== 'provider') {
      return;
    }

    const isEwallet = ewalletProviders.includes(event.target.value);
    const row = event.target.closest('.b2b-account');
    const number = row.querySelector('[data-field="account_number"]');

    row.querySelector(`label[for="${number.id}"]`).textContent = isEwallet ? 'Nomor HP e-wallet' : 'Nomor rekening';
    number.placeholder = isEwallet ? '081234567890' : '1234567890';
    number.maxLength = isEwallet ? 15 : 20;
  });

  reindexAccounts();

  // Wilayah berjenjang (sama dengan form customer di backoffice): mengganti satu tingkat mengosongkan tingkat di bawahnya.
  window.addEventListener('load', () => {
    const $ = window.jQuery;

    if (!$?.fn?.select2) {
      return;
    }

    const regions = $('.js-region');

    regions.each(function () {
      $(this).select2({
        width: '100%',
        placeholder: this.dataset.placeholder,
        allowClear: true,
        language: { noResults: () => 'Tidak ditemukan' },
      });
    });

    regions.on('change', function () {
      // Kelurahan/desa membawa kode pos; tetap bisa diubah manual.
      const postalCode = $(this).find(':selected').data('postal-code');

      if (postalCode) {
        $('#postal_code').val(postalCode);
      }

      const below = regions.slice(regions.index(this) + 1);

      below.each(function () {
        $(this).empty().append('<option value=""></option>').prop('disabled', true).trigger('change.select2');
      });

      const next = below.first();
      const parent = this.value;

      if (!next.length || !parent) {
        return;
      }

      fetch(`/b2b/regions?${new URLSearchParams({ level: next.data('level'), parent })}`, { headers: { Accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : Promise.reject(response)))
        .then((result) => {
          if (this.value !== parent) {
            return; // pilihan sudah diganti lagi sebelum respons datang
          }

          (result.data || []).forEach((item) => {
            const option = new Option(item.text, item.id);

            if (item.postal_code) {
              option.dataset.postalCode = item.postal_code;
            }

            next.append(option);
          });
          next.prop('disabled', false).trigger('change.select2');
        })
        .catch(() => showToast('error', 'Gagal memuat pilihan wilayah. Silakan coba lagi.'));
    });
  });

  // Pengiriman form dibangun di langkah berikutnya (POST /b2b/register).
  document.getElementById('b2b-register-form').addEventListener('submit', (event) => {
    event.preventDefault();
    showToast('info', 'Penyimpanan pendaftaran belum aktif.');
  });
})();
