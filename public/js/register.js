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
    formField.classList.remove('is-valid');
    formField.querySelector('.field-error')?.remove();
    formField.querySelector('.field-success')?.remove();
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

function setFieldSuccess(control, message) {
    const formField = control.closest('.form-field');

    if (!formField) {
        return;
    }

    const successMessage = document.createElement('p');

    formField.classList.remove('is-invalid');
    formField.classList.add('is-valid');
    formField.querySelector('.field-error')?.remove();
    formField.querySelector('.field-success')?.remove();

    successMessage.className = 'field-success';
    successMessage.textContent = message;

    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
    formField.append(successMessage);
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

function resetTurnstile() {
    if (window.turnstile?.reset) {
        window.turnstile.reset();
    }
}

function resetCommunityOptions(select) {
    select.replaceChildren(new Option('Pilih community', '', true, true));
}

async function loadCommunities(form) {
    const select = form.querySelector('.js-community-select');

    if (!select) {
        return;
    }

    resetCommunityOptions(select);
    select.disabled = true;

    try {
        const url = new URL(`${form.action.replace(/\/$/, '')}/communities`);

        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
            },
        });
        const payload = await parseResponse(response);

        if (!response.ok) {
            throw new Error(payload.message ?? 'Gagal memuat community.');
        }

        (payload.data ?? []).forEach((community) => {
            select.add(new Option(community.name, community.id));
        });
    } catch (error) {
        showToast('error', error.message || 'Gagal memuat community.');
    } finally {
        select.disabled = false;

        if (window.jQuery?.fn?.select2) {
            window.jQuery(select).trigger('change');
        }
    }
}

function setReferralChecking(button, isChecking) {
    if (!button) {
        return;
    }

    if (!button.dataset.defaultText) {
        button.dataset.defaultText = button.textContent;
    }

    button.disabled = isChecking;
    button.textContent = isChecking ? 'Cek...' : button.dataset.defaultText;
}

async function checkReferral(form) {
    const referralInput = form.elements.namedItem('referral');
    const checkButton = form.querySelector('.js-referral-check');
    const referral = referralInput?.value.trim() ?? '';

    if (!referralInput) {
        return;
    }

    clearFieldError(referralInput);

    if (!referral) {
        setFieldError(referralInput, 'Isi nomor referral terlebih dahulu.');
        referralInput.focus();
        return;
    }

    setReferralChecking(checkButton, true);

    try {
        const url = new URL(`${form.action.replace(/\/$/, '')}/referral`);
        url.searchParams.set('phone', referral);

        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
            },
        });
        const payload = await parseResponse(response);
        const message = payload.message ?? 'Nomor referral tidak valid.';

        if (!response.ok || !payload.valid) {
            setFieldError(referralInput, message);
            showToast('error', message);
            return;
        }

        setFieldSuccess(referralInput, message);
        showToast('success', message);
    } catch (error) {
        showToast('error', 'Koneksi bermasalah. Silakan coba lagi.');
    } finally {
        setReferralChecking(checkButton, false);
    }
}

document.querySelectorAll('.register-form').forEach((form) => {
    form.querySelectorAll('input, select, textarea').forEach((control) => {
        control.addEventListener('input', () => clearFieldError(control));
        control.addEventListener('change', () => clearFieldError(control));
    });

    form.querySelector('.js-referral-check')?.addEventListener('click', () => {
        checkReferral(form);
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
                resetTurnstile();
                return;
            }

            window.location.assign(payload.redirectTo ?? '/membership/register/finish');
        } catch (error) {
            showToast('error', 'Koneksi bermasalah. Silakan coba lagi.');
            resetTurnstile();
        } finally {
            setSubmitting(form, false);
        }
    });
});

window.addEventListener('DOMContentLoaded', () => {
    if (!window.jQuery?.fn?.select2) {
        document.querySelectorAll('.register-form').forEach((form) => {
            loadCommunities(form);
        });

        return;
    }

    window.jQuery('.js-outlet-select').select2({
        placeholder: 'Pilih outlet',
        width: '100%',
    });

    window.jQuery('.js-community-select').select2({
        allowClear: true,
        placeholder: 'Pilih community',
        width: '100%',
    });

    document.querySelectorAll('.register-form').forEach((form) => {
        loadCommunities(form);
    });
});
