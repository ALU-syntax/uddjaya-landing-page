function limitDigits(input) {
    const maxlength = Number(input.dataset.maxlength ?? input.maxLength);
    const digits = input.value.replace(/\D/g, '');

    input.value = Number.isFinite(maxlength) && maxlength > 0
        ? digits.slice(0, maxlength)
        : digits;
}

document.querySelectorAll('.js-digits-only').forEach((input) => {
    input.addEventListener('input', () => limitDigits(input));
});

window.addEventListener('DOMContentLoaded', () => {
    if (!window.jQuery?.fn?.select2) {
        return;
    }

    window.jQuery('.js-community-select').select2({
        placeholder: 'Pilih community',
        width: '100%',
    });
});
