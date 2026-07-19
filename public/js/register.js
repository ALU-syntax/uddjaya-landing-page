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

function showToast(type, message) {
    if (window.iziToast?.[type]) {
        window.iziToast[type]({
            title: type === 'success' ? 'Berhasil' : 'Gagal',
            message,
            position: 'topRight',
            timeout: 4500,
        });

        return;
    }

    window.alert(message);
}

function getFormControl(form, name) {
    const field = form.elements.namedItem(name);

    if (!field) {
        return null;
    }

    return typeof RadioNodeList !== 'undefined' && field instanceof RadioNodeList
        ? field[0]
        : field;
}

function clearFieldError(control) {
    const formField = control.closest('.form-field');

    if (!formField) {
        return;
    }

    formField.classList.remove('is-invalid');
    formField.querySelector('.field-error')?.remove();
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
}

function clearFormErrors(form) {
    form.querySelectorAll('input, select, textarea').forEach((control) => {
        clearFieldError(control);
    });
}

function setFieldError(control, message) {
    const formField = control.closest('.form-field');

    if (!formField) {
        return;
    }

    const errorId = `${control.id || control.name}-error`;
    const errorMessage = document.createElement('p');

    formField.classList.add('is-invalid');
    formField.querySelector('.field-error')?.remove();

    errorMessage.id = errorId;
    errorMessage.className = 'field-error';
    errorMessage.textContent = message;

    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', errorId);
    formField.append(errorMessage);
}

function applyFieldErrors(form, errors = {}) {
    let firstInvalidControl = null;

    Object.entries(errors).forEach(([name, messages]) => {
        const control = getFormControl(form, name);
        const message = Array.isArray(messages) ? messages[0] : messages;

        if (!control || !message) {
            return;
        }

        setFieldError(control, message);
        firstInvalidControl ??= control;
    });

    if (firstInvalidControl) {
        firstInvalidControl.focus({ preventScroll: true });
        firstInvalidControl.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }
}

async function parseResponse(response) {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
        return response.json();
    }

    return {
        message: await response.text(),
    };
}

function setSubmitting(form, isSubmitting) {
    const submitButton = form.querySelector('.submit-button');

    if (!submitButton) {
        return;
    }

    if (!submitButton.dataset.defaultText) {
        submitButton.dataset.defaultText = submitButton.textContent;
    }

    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting
        ? 'Memproses...'
        : submitButton.dataset.defaultText;
}

document.querySelectorAll('.register-form').forEach((form) => {
    form.querySelectorAll('input, select, textarea').forEach((control) => {
        control.addEventListener('input', () => clearFieldError(control));
        control.addEventListener('change', () => clearFieldError(control));
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFormErrors(form);

        if (!form.reportValidity()) {
            return;
        }

        setSubmitting(form, true);

        try {
            const response = await fetch(form.action, {
                method: form.method,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                },
                body: new URLSearchParams(new FormData(form)),
            });
            const payload = await parseResponse(response);
            const message = payload.message ?? 'Terjadi kesalahan. Silakan coba lagi.';

            if (!response.ok) {
                applyFieldErrors(form, payload.errors);
                showToast('error', message);
                return;
            }

            showToast('success', message);
            form.reset();

            if (window.jQuery?.fn?.select2) {
                window.jQuery('.js-community-select').val('').trigger('change');
            }
        } catch (error) {
            showToast('error', 'Koneksi bermasalah. Silakan coba lagi.');
        } finally {
            setSubmitting(form, false);
        }
    });
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
