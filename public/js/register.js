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

let submitLoaderAnimation = null;
let submitLoaderHideTimer = null;

function initializeSubmitLoaderAnimation() {
    const animationElement = document.getElementById('submit-loader-animation');

    if (!animationElement || submitLoaderAnimation) {
        return;
    }

    if (!window.lottie?.loadAnimation) {
        console.error('Library lottie-web belum berhasil dimuat.');
        return;
    }

    submitLoaderAnimation = window.lottie.loadAnimation({
        container: animationElement,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        path: '/animations/morning-coffee.json',
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
        },
    });

    submitLoaderAnimation.addEventListener('data_failed', () => {
        console.error('File animasi Morning Coffee gagal dimuat.');
    });
}

function showSubmitLoader(message = 'Mengirim data...') {
    const loaderElement = document.getElementById('submit-loader');
    const messageElement = document.getElementById('submit-loader-message');

    if (!loaderElement) {
        return;
    }

    initializeSubmitLoaderAnimation();
    window.clearTimeout(submitLoaderHideTimer);

    if (messageElement) {
        messageElement.textContent = message;
    }

    loaderElement.hidden = false;
    loaderElement.setAttribute('aria-hidden', 'false');
    document.body.classList.add('submit-loading');

    window.requestAnimationFrame(() => {
        loaderElement.classList.add('is-active');
        submitLoaderAnimation?.goToAndPlay(0, true);
        window.lottie?.resize();
    });
}

function hideSubmitLoader() {
    const loaderElement = document.getElementById('submit-loader');

    if (!loaderElement) {
        return;
    }

    loaderElement.classList.remove('is-active');
    loaderElement.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('submit-loading');
    submitLoaderAnimation?.stop();

    submitLoaderHideTimer = window.setTimeout(() => {
        loaderElement.hidden = true;
    }, 200);
}

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
    submitButton.classList.toggle('is-submitting', isSubmitting);
    submitButton.setAttribute('aria-disabled', String(isSubmitting));

    if (!isSubmitting) {
        submitButton.removeAttribute('aria-disabled');
    }
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

function setPromoKolChecking(button, isChecking) {
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

async function checkPromoKol(form) {
    const promoKolInput = form.elements.namedItem('promo_kol');
    const checkButton = form.querySelector('.js-promo-kol-check');
    const promoKol = promoKolInput?.value.trim() ?? '';

    if (!promoKolInput) {
        return;
    }

    clearFieldError(promoKolInput);

    if (!promoKol) {
        setFieldError(promoKolInput, 'Isi Promo KoL terlebih dahulu.');
        promoKolInput.focus();
        return;
    }

    if (promoKol.length > 100) {
        setFieldError(promoKolInput, 'Promo KoL maksimal 100 karakter.');
        promoKolInput.focus();
        return;
    }

    setPromoKolChecking(checkButton, true);

    try {
        const url = new URL(`${form.action.replace(/\/$/, '')}/promo-kol`);
        url.searchParams.set('code', promoKol);

        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
            },
        });
        const payload = await parseResponse(response);
        const message = payload.message ?? 'Promo KoL tidak ditemukan.';

        if (!response.ok || !payload.valid) {
            setFieldError(promoKolInput, message);
            showToast('error', message);
            return;
        }

        setFieldSuccess(promoKolInput, message);
        showToast('success', message);
    } catch (error) {
        showToast('error', 'Koneksi bermasalah. Silakan coba lagi.');
    } finally {
        setPromoKolChecking(checkButton, false);
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

    form.querySelector('.js-promo-kol-check')?.addEventListener('click', () => {
        checkPromoKol(form);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (form.dataset.submitting === 'true') {
            return;
        }

        clearFormErrors(form);

        if (!form.reportValidity()) {
            return;
        }

        form.dataset.submitting = 'true';
        setSubmitting(form, true);
        showSubmitLoader(form.dataset.loadingText || 'Memproses pendaftaran...');

        let keepLoaderVisible = false;

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

            keepLoaderVisible = true;
            window.location.assign(payload.redirectTo ?? '/membership/register/finish');
        } catch (error) {
            showToast('error', 'Koneksi bermasalah. Silakan coba lagi.');
            resetTurnstile();
        } finally {
            if (!keepLoaderVisible) {
                delete form.dataset.submitting;
                setSubmitting(form, false);
                hideSubmitLoader();
            }
        }
    });
});

window.addEventListener('pageshow', (event) => {
    if (!event.persisted) {
        return;
    }

    hideSubmitLoader();

    document.querySelectorAll('.register-form').forEach((form) => {
        delete form.dataset.submitting;
        setSubmitting(form, false);
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
