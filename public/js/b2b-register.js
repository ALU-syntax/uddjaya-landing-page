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

  // Perorangan: PIC biasanya orang yang sama, jadi nama PIC bisa disamakan dengan nama lengkap (bisa dilepas).
  const nameInput = document.getElementById('name');
  const picInput = document.getElementById('contact_name');
  const picSameLabel = document.querySelector('[data-pic-same]');
  const picSame = document.getElementById('pic_same');

  function syncPic() {
    picInput.readOnly = picSame.checked;

    if (picSame.checked) {
      picInput.value = nameInput.value;
      picInput.closest('.form-field').classList.remove('is-invalid');
      picInput.closest('.form-field').querySelector('.field-error')?.remove();
    }
  }

  function updatePicShortcut() {
    const individual = document.querySelector('input[name="type"]:checked')?.value === 'individual';
    const wasMirrored = picSame.checked;

    picSameLabel.hidden = !individual;
    picSame.checked = individual;

    // Pindah ke PT/CV: nama PIC hasil salinan dikosongkan supaya diisi orang yang benar.
    if (!individual && wasMirrored) {
      picInput.value = '';
    }

    syncPic();
  }

  nameInput.addEventListener('input', () => picSame.checked && syncPic());
  picSame.addEventListener('change', () => {
    syncPic();

    if (!picSame.checked) {
      picInput.focus();
      picInput.select();
    }
  });

  document.querySelectorAll('input[name="type"]').forEach((radio) => radio.addEventListener('change', () => {
    updateTypeHints();
    updatePicShortcut();
  }));
  updateTypeHints();
  updatePicShortcut();

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

  // Kirim pendaftaran sebagai JSON (rekening berupa array), lalu tampilkan error per field dari server.
  const form = document.getElementById('b2b-register-form');
  const submitButton = form.querySelector('.b2b-submit');

  // Kunci error server: "phone", "accounts.0.account_number", "turnstile", "form".
  function fieldFor(key) {
    if (key === 'turnstile') {
      return form.querySelector('.turnstile-field');
    }

    const [name, index, sub] = key.split('.');
    const inputName = index !== undefined && sub ? `${name}[${index}][${sub}]` : name;

    return form.querySelector(`[name="${inputName}"]`)?.closest('.form-field') ?? null;
  }

  function clearError(field) {
    field?.classList.remove('is-invalid');
    field?.querySelector('.field-error')?.remove();
  }

  function clearErrors() {
    form.querySelectorAll('.form-field.is-invalid').forEach(clearError);
  }

  function showErrors(errors) {
    let first = null;

    Object.entries(errors || {}).forEach(([key, messages]) => {
      const field = fieldFor(key);

      if (!field) {
        return;
      }

      clearError(field);
      field.classList.add('is-invalid');
      const error = document.createElement('small');
      error.className = 'field-error';
      error.textContent = messages[0];
      field.appendChild(error);
      first ??= field;
    });

    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return first !== null;
  }

  form.addEventListener('input', (event) => clearError(event.target.closest('.form-field')));
  form.addEventListener('change', (event) => clearError(event.target.closest('.form-field')));
  window.addEventListener('load', () => window.jQuery?.('.js-region').on('change', function () {
    clearError(this.closest('.form-field'));
  }));

  function payload() {
    const value = (name) => form.elements[name]?.value ?? '';
    const data = {
      type: form.querySelector('input[name="type"]:checked')?.value ?? '',
      accounts: [...accountRows.querySelectorAll('.b2b-account')].map((row) => ({
        provider: row.querySelector('[data-field="provider"]').value,
        account_number: row.querySelector('[data-field="account_number"]').value,
        account_name: row.querySelector('[data-field="account_name"]').value,
      })),
      'cf-turnstile-response': value('cf-turnstile-response'),
    };

    ['name', 'npwp', 'contact_name', 'phone', 'email', 'address', 'province_code', 'regency_code', 'district_code', 'village_code', 'postal_code']
      .forEach((name) => { data[name] = value(name); });

    return data;
  }

  function showSuccess(result) {
    const success = document.getElementById('b2b-success');

    success.querySelector('[data-success-name]').textContent = result.data?.name ?? '';
    success.querySelector('[data-success-code]').textContent = result.data?.code ?? '';
    window.iziToast?.destroy();
    form.hidden = true;
    success.hidden = false;
    success.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (submitButton.disabled) {
      return;
    }

    clearErrors();
    submitButton.disabled = true;
    submitButton.textContent = 'Mengirim...';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload()),
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        showSuccess(result);

        return;
      }

      const shown = showErrors(result.errors);
      showToast('error', shown ? 'Periksa kembali isian yang ditandai.' : result.message || 'Pendaftaran gagal. Silakan coba lagi.');
    } catch {
      showToast('error', 'Koneksi bermasalah. Silakan coba lagi.');
    } finally {
      // Token Turnstile hanya berlaku sekali; minta token baru setelah setiap percobaan.
      window.turnstile?.reset?.();
      submitButton.disabled = false;
      submitButton.textContent = 'Daftar sebagai Customer B2B';
    }
  });
})();
