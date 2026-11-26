/**
 * LingoAuth - Email/Password, Google Identity Services & Session UI Module
 */
(function (global) {
  'use strict';

  const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
  const AUTH_ME_URL = 'api/auth/me.php';
  const AUTH_LOGIN_URL = 'api/auth/login.php';
  const AUTH_REGISTER_URL = 'api/auth/register.php';
  const AUTH_GOOGLE_URL = 'api/auth/google.php';
  const AUTH_GOOGLE_START_URL = 'api/auth/google-start.php';
  const AUTH_LOGOUT_URL = 'api/auth/logout.php';

  const AUTH_ERROR_MESSAGES = {
    google_not_configured: 'Đăng nhập Google chưa được cấu hình trên máy chủ. Vui lòng thiết lập google_client_id và google_client_secret trong config.local.php.',
    access_denied: 'Bạn đã hủy yêu cầu đăng nhập bằng Google.',
    invalid_state: 'Phiên xác thực Google đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.',
    missing_code: 'Không nhận được mã xác thực từ Google. Vui lòng thử lại.',
    token_exchange_failed: 'Không thể trao đổi mã xác thực với Google. Vui lòng kiểm tra lại cấu hình OAuth và thử lại.',
    invalid_token: 'Không thể xác minh tài khoản Google. Vui lòng thử lại.',
    token_verification_failed: 'Không thể xác minh tài khoản Google. Vui lòng thử lại.',
    email_not_verified: 'Tài khoản Google này chưa xác minh địa chỉ email.',
    oauth_error: 'Đã xảy ra lỗi khi đăng nhập bằng Google. Vui lòng thử lại.',
    server_error: 'Lỗi máy chủ khi xử lý đăng nhập Google. Vui lòng thử lại.'
  };

  let gsiLoadPromise = null;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const parsed = new URL(url, global.location ? global.location.href : 'https://localhost');
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
    } catch (_) {}
    return '';
  }

  function getInitial(user) {
    const label = (user && (user.displayName || user.email)) || 'U';
    return String(label).trim().charAt(0).toUpperCase() || 'U';
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function getResponseContentType(res) {
    try {
      if (res && res.headers && typeof res.headers.get === 'function') {
        return String(res.headers.get('content-type') || '').toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  function loadGsiScript() {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Document is not available'));
    }
    if (global.google && global.google.accounts && global.google.accounts.id) {
      return Promise.resolve(global.google);
    }
    if (gsiLoadPromise) {
      return gsiLoadPromise;
    }

    gsiLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + GSI_SCRIPT_SRC + '"]');
      if (existing) {
        if (global.google && global.google.accounts && global.google.accounts.id) {
          resolve(global.google);
          return;
        }
        existing.addEventListener('load', () => resolve(global.google), { once: true });
        existing.addEventListener('error', () => {
          gsiLoadPromise = null;
          reject(new Error('Failed to load Google Identity Services'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GSI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (global.google && global.google.accounts && global.google.accounts.id) {
          resolve(global.google);
        } else {
          gsiLoadPromise = null;
          reject(new Error('Google Identity Services did not initialize'));
        }
      };
      script.onerror = () => {
        gsiLoadPromise = null;
        reject(new Error('Failed to load Google Identity Services'));
      };
      document.head.appendChild(script);
    });

    return gsiLoadPromise;
  }

  const state = {
    containerEl: null,
    onAuthChange: null,
    user: null,
    googleClientId: null,
    googleOAuthReady: false,
    googleRedirectUri: null,
    busy: false,
    modalEl: null,
    activeTab: 'login',
    modalOpen: false,
    lastFocusedEl: null,
    keydownBound: false,
    i18nSubscribed: false
  };

  function notifyAuthChange(user) {
    if (typeof state.onAuthChange === 'function') {
      try {
        state.onAuthChange(user);
      } catch (err) {
        console.error('LingoAuth onAuthChange callback error:', err);
      }
    }
  }

  function getI18nText(key, fallback) {
    if (global.LingoI18n && typeof global.LingoI18n.t === 'function') {
      return global.LingoI18n.t(key, fallback);
    }
    return fallback;
  }

  function renderSignedIn(user) {
    const el = state.containerEl;
    if (!el) return;

    const safeName = escapeHtml(user.displayName || user.email || 'Account');
    const safeEmail = escapeHtml(user.email || '');
    const safeAvatar = sanitizeImageUrl(user.avatarUrl);
    const initial = escapeHtml(getInitial(user));
    const signOutText = getI18nText('nav.signout', 'Đăng xuất');
    const safeSignOutText = escapeHtml(signOutText);

    const avatarHtml = safeAvatar
      ? '<img class="auth-avatar" src="' + escapeHtml(safeAvatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="auth-avatar-fallback" aria-hidden="true">' + initial + '</span>';

    el.innerHTML =
      '<div class="auth-user-pill" title="' + safeEmail + '">' +
        avatarHtml +
        '<span class="auth-user-name">' + safeName + '</span>' +
        '<button type="button" class="auth-signout-btn" aria-label="' + safeSignOutText + ' (' + safeName + ')"' + (state.busy ? ' disabled' : '') + '>' +
          safeSignOutText +
        '</button>' +
      '</div>';

    const signOutBtn = el.querySelector('.auth-signout-btn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', handleLogout);
    }

    const imgEl = el.querySelector('.auth-avatar');
    if (imgEl) {
      imgEl.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'auth-avatar-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = getInitial(user);
        imgEl.replaceWith(fallback);
      }, { once: true });
    }
  }

  function renderSignedOut() {
    const el = state.containerEl;
    if (!el) return;

    const signInText = getI18nText('nav.signin', 'Đăng nhập');
    const safeSignInText = escapeHtml(signInText);

    el.innerHTML =
      '<button type="button" class="auth-open-btn" aria-haspopup="dialog" aria-expanded="' + (state.modalOpen ? 'true' : 'false') + '">' +
        '<svg class="auth-open-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
          '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' +
        '</svg>' +
        '<span>' + safeSignInText + '</span>' +
      '</button>';

    const openBtn = el.querySelector('.auth-open-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => openModal('login'));
    }
  }

  function render() {
    if (!state.containerEl) return;
    if (state.user) {
      renderSignedIn(state.user);
    } else {
      renderSignedOut();
    }
  }

  function setModalError(message) {
    if (!state.modalEl) return;
    const errEl = state.modalEl.querySelector('.auth-error-msg');
    if (!errEl) return;
    if (message) {
      errEl.textContent = message;
      errEl.classList.remove('hidden');
      errEl.hidden = false;
    } else {
      errEl.textContent = '';
      errEl.classList.add('hidden');
      errEl.hidden = true;
    }
  }

  function setGoogleBtnState(disabled, labelText) {
    if (!state.modalEl) return;
    const googleBtn = state.modalEl.querySelector('.auth-google-btn');
    if (!googleBtn) return;
    googleBtn.disabled = Boolean(disabled);
    const labelEl = googleBtn.querySelector('.auth-google-btn-label');
    if (labelEl && labelText) {
      labelEl.textContent = labelText;
    }
  }

  function setSubmitLoading(loading) {
    if (!state.modalEl) return;
    const loginBtn = state.modalEl.querySelector('[data-auth-submit="login"]');
    const regBtn = state.modalEl.querySelector('[data-auth-submit="register"]');
    const tabBtns = state.modalEl.querySelectorAll('[data-auth-tab]');
    const googleBtn = state.modalEl.querySelector('.auth-google-btn');

    if (loginBtn) {
      loginBtn.disabled = loading;
      loginBtn.textContent = loading ? 'Đang đăng nhập...' : 'Đăng nhập';
    }
    if (regBtn) {
      regBtn.disabled = loading;
      regBtn.textContent = loading ? 'Đang tạo tài khoản...' : 'Đăng ký';
    }
    if (googleBtn) {
      googleBtn.disabled = loading;
      if (!loading) {
        const labelEl = googleBtn.querySelector('.auth-google-btn-label');
        if (labelEl) labelEl.textContent = 'Tiếp tục với Google';
      }
    }
    tabBtns.forEach((btn) => {
      btn.disabled = loading;
    });
  }

  function switchTab(tab) {
    state.activeTab = tab === 'register' ? 'register' : 'login';
    if (!state.modalEl) return;

    const loginTab = state.modalEl.querySelector('[data-auth-tab="login"]');
    const regTab = state.modalEl.querySelector('[data-auth-tab="register"]');
    const loginForm = state.modalEl.querySelector('[data-auth-form="login"]');
    const regForm = state.modalEl.querySelector('[data-auth-form="register"]');
    const titleEl = state.modalEl.querySelector('#authModalTitle');

    const isLogin = state.activeTab === 'login';
    if (loginTab) {
      loginTab.classList.toggle('active', isLogin);
      loginTab.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    }
    if (regTab) {
      regTab.classList.toggle('active', !isLogin);
      regTab.setAttribute('aria-selected', !isLogin ? 'true' : 'false');
    }
    if (loginForm) {
      loginForm.classList.toggle('hidden', !isLogin);
      loginForm.hidden = !isLogin;
    }
    if (regForm) {
      regForm.classList.toggle('hidden', isLogin);
      regForm.hidden = isLogin;
    }
    if (titleEl) {
      titleEl.textContent = isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản';
    }

    setModalError('');
  }

  function getEffectiveGoogleRedirectUri() {
    if (state.googleRedirectUri) {
      return state.googleRedirectUri;
    }
    if (global.location && global.location.origin) {
      return global.location.origin + '/translate-web/api/auth/google-callback.php';
    }
    return '/translate-web/api/auth/google-callback.php';
  }

  function hideSetupNote() {
    if (!state.modalEl) return;
    const noteEl = state.modalEl.querySelector('.auth-setup-note');
    if (!noteEl) return;
    noteEl.classList.add('hidden');
    noteEl.hidden = true;
    noteEl.innerHTML = '';
  }

  function showSetupNote() {
    if (!state.modalEl) return;
    const noteEl = state.modalEl.querySelector('.auth-setup-note');
    if (!noteEl) return;

    const redirectUri = getEffectiveGoogleRedirectUri();
    noteEl.innerHTML =
      '<p class="auth-setup-note-title">Đăng nhập Google chưa được cấu hình</p>' +
      '<p>Cần khai báo <code>google_client_id</code> và <code>google_client_secret</code> trong tệp <code>translate-web/api/config.local.php</code>.</p>' +
      '<p>Trong Google Cloud Console, hãy thêm <strong>Authorized redirect URI</strong> sau:</p>' +
      '<div class="auth-setup-uri-row">' +
        '<code>' + escapeHtml(redirectUri) + '</code>' +
        '<button type="button" class="auth-copy-uri-btn" data-copy-redirect-uri>Sao chép</button>' +
      '</div>';

    noteEl.classList.remove('hidden');
    noteEl.hidden = false;

    const copyBtn = noteEl.querySelector('[data-copy-redirect-uri]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
            await global.navigator.clipboard.writeText(redirectUri);
            copyBtn.textContent = 'Đã chép';
            setTimeout(() => {
              if (copyBtn.isConnected) copyBtn.textContent = 'Sao chép';
            }, 2000);
          }
        } catch (_) {}
      });
    }
  }

  function resetGoogleAuxViews() {
    if (!state.modalEl) return;
    hideSetupNote();
    const slotEl = state.modalEl.querySelector('.auth-google-slot');
    if (slotEl) {
      slotEl.classList.add('hidden');
      slotEl.hidden = true;
      slotEl.innerHTML = '';
    }
    setGoogleBtnState(false, 'Tiếp tục với Google');
  }

  async function triggerGisFallback() {
    if (!state.modalEl || !state.googleClientId) return;
    const slotEl = state.modalEl.querySelector('.auth-google-slot');
    setGoogleBtnState(true, 'Đang tải Google Sign-In...');

    try {
      await loadGsiScript();
      if (!global.google || !global.google.accounts || !global.google.accounts.id) {
        throw new Error('Google Identity Services unavailable');
      }

      const isDark = typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'dark';

      global.google.accounts.id.initialize({
        client_id: state.googleClientId,
        callback: handleCredentialResponse
      });

      if (slotEl) {
        slotEl.innerHTML = '';
        slotEl.classList.remove('hidden');
        slotEl.hidden = false;
        global.google.accounts.id.renderButton(slotEl, {
          type: 'standard',
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          logo_alignment: 'left',
          width: 340
        });
      }

      if (typeof global.google.accounts.id.prompt === 'function') {
        global.google.accounts.id.prompt();
      }
    } catch (err) {
      console.warn('LingoAuth GIS load error:', err);
      setModalError('Không thể tải Google Sign-In. Vui lòng thử lại hoặc đăng nhập bằng email.');
    } finally {
      if (!state.busy) {
        setGoogleBtnState(false, 'Tiếp tục với Google');
      }
    }
  }

  function handleGoogleButtonClick() {
    if (state.busy) return;
    setModalError('');
    hideSetupNote();

    if (state.googleOAuthReady) {
      state.busy = true;
      setGoogleBtnState(true, 'Đang chuyển hướng tới Google...');
      if (global.location) {
        global.location.href = AUTH_GOOGLE_START_URL;
      }
      return;
    }

    if (state.googleClientId) {
      triggerGisFallback();
      return;
    }

    showSetupNote();
  }

  function ensureModal() {
    if (typeof document === 'undefined') return null;
    if (state.modalEl && document.body.contains(state.modalEl)) {
      return state.modalEl;
    }

    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'modal auth-modal hidden';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'authModalTitle');

    modal.innerHTML =
      '<div class="modal-backdrop" data-auth-backdrop></div>' +
      '<div class="modal-container auth-modal-container">' +
        '<header class="modal-header auth-modal-header">' +
          '<h2 id="authModalTitle" class="auth-modal-title">Đăng nhập</h2>' +
          '<button type="button" class="icon-btn close-btn auth-modal-close" title="Đóng" aria-label="Đóng hộp thoại đăng nhập">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">' +
              '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
            '</svg>' +
          '</button>' +
        '</header>' +
        '<div class="modal-body auth-modal-body">' +
          '<div class="auth-error-msg hidden" role="alert" aria-live="polite" hidden></div>' +
          '<div class="auth-google-section">' +
            '<button type="button" class="auth-google-btn" data-auth-google>' +
              '<svg class="auth-google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
                '<path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.6l3.99 3.1C6.21 6.86 8.87 4.75 12 4.75z"/>' +
                '<path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3.01h3.86c2.26-2.09 3.56-5.17 3.56-8.83z"/>' +
                '<path fill="#FBBC05" d="M5.27 14.3c-.24-.71-.38-1.47-.38-2.3s.14-1.59.38-2.3V6.6H1.28C.47 8.21 0 10.05 0 12s.47 3.79 1.28 5.4l3.99-3.1z"/>' +
                '<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.79-2.11-6.73-4.96H1.28v3.12C3.26 21.31 7.31 24 12 24z"/>' +
              '</svg>' +
              '<span class="auth-google-btn-label">Tiếp tục với Google</span>' +
            '</button>' +
            '<div class="auth-google-slot hidden" aria-label="Đăng nhập với Google" hidden></div>' +
            '<div class="auth-setup-note hidden" role="status" aria-live="polite" hidden></div>' +
          '</div>' +
          '<div class="auth-divider"><span>hoặc tiếp tục bằng email</span></div>' +
          '<div class="auth-tabs" role="tablist" aria-label="Chế độ tài khoản">' +
            '<button type="button" id="authTabLogin" class="auth-tab active" data-auth-tab="login" role="tab" aria-selected="true" aria-controls="authLoginForm">Đăng nhập</button>' +
            '<button type="button" id="authTabRegister" class="auth-tab" data-auth-tab="register" role="tab" aria-selected="false" aria-controls="authRegisterForm">Đăng ký</button>' +
          '</div>' +
          '<form id="authLoginForm" class="auth-form" data-auth-form="login" novalidate>' +
            '<div class="auth-field">' +
              '<label class="auth-label" for="authLoginEmail">Email</label>' +
              '<input type="email" id="authLoginEmail" class="auth-input" autocomplete="email" placeholder="you@example.com" required>' +
            '</div>' +
            '<div class="auth-field">' +
              '<label class="auth-label" for="authLoginPassword">Mật khẩu</label>' +
              '<input type="password" id="authLoginPassword" class="auth-input" autocomplete="current-password" placeholder="Nhập mật khẩu" required>' +
            '</div>' +
            '<button type="submit" class="auth-submit-btn" data-auth-submit="login">Đăng nhập</button>' +
          '</form>' +
          '<form id="authRegisterForm" class="auth-form hidden" data-auth-form="register" novalidate hidden>' +
            '<div class="auth-field">' +
              '<label class="auth-label" for="authRegisterName">Tên hiển thị</label>' +
              '<input type="text" id="authRegisterName" class="auth-input" autocomplete="name" maxlength="100" placeholder="Ví dụ: Minh Anh (không bắt buộc)">' +
            '</div>' +
            '<div class="auth-field">' +
              '<label class="auth-label" for="authRegisterEmail">Email</label>' +
              '<input type="email" id="authRegisterEmail" class="auth-input" autocomplete="email" placeholder="you@example.com" required>' +
            '</div>' +
            '<div class="auth-field">' +
              '<label class="auth-label" for="authRegisterPassword">Mật khẩu</label>' +
              '<input type="password" id="authRegisterPassword" class="auth-input" autocomplete="new-password" minlength="6" placeholder="Ít nhất 6 ký tự" required>' +
            '</div>' +
            '<div class="auth-field">' +
              '<label class="auth-label" for="authRegisterConfirm">Xác nhận mật khẩu</label>' +
              '<input type="password" id="authRegisterConfirm" class="auth-input" autocomplete="new-password" minlength="6" placeholder="Nhập lại mật khẩu" required>' +
            '</div>' +
            '<button type="submit" class="auth-submit-btn" data-auth-submit="register">Đăng ký</button>' +
          '</form>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    state.modalEl = modal;

    const backdrop = modal.querySelector('[data-auth-backdrop]');
    const closeBtn = modal.querySelector('.auth-modal-close');
    const googleBtn = modal.querySelector('[data-auth-google]');
    const loginTab = modal.querySelector('[data-auth-tab="login"]');
    const regTab = modal.querySelector('[data-auth-tab="register"]');
    const loginForm = modal.querySelector('[data-auth-form="login"]');
    const regForm = modal.querySelector('[data-auth-form="register"]');

    if (backdrop) {
      backdrop.addEventListener('click', () => closeModal());
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal());
    }
    if (googleBtn) {
      googleBtn.addEventListener('click', handleGoogleButtonClick);
    }
    if (loginTab) {
      loginTab.addEventListener('click', () => {
        if (!state.busy) {
          switchTab('login');
          const emailInput = modal.querySelector('#authLoginEmail');
          if (emailInput) emailInput.focus();
        }
      });
    }
    if (regTab) {
      regTab.addEventListener('click', () => {
        if (!state.busy) {
          switchTab('register');
          const nameInput = modal.querySelector('#authRegisterName');
          if (nameInput) nameInput.focus();
        }
      });
    }
    if (loginForm) {
      loginForm.addEventListener('submit', handleLoginSubmit);
    }
    if (regForm) {
      regForm.addEventListener('submit', handleRegisterSubmit);
    }

    if (!state.keydownBound) {
      state.keydownBound = true;
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.modalOpen && !state.busy) {
          event.preventDefault();
          closeModal();
        }
      });
    }

    return modal;
  }

  function openModal(initialTab) {
    const modal = ensureModal();
    if (!modal) return;

    state.lastFocusedEl = document.activeElement || null;
    state.modalOpen = true;
    resetGoogleAuxViews();
    switchTab(initialTab === 'register' ? 'register' : 'login');
    setSubmitLoading(false);

    modal.classList.remove('hidden');
    modal.hidden = false;

    const openBtn = state.containerEl ? state.containerEl.querySelector('.auth-open-btn') : null;
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'true');
    }

    const focusTarget = state.activeTab === 'register'
      ? modal.querySelector('#authRegisterName')
      : modal.querySelector('#authLoginEmail');
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }

  function closeModal(force) {
    if (!force && state.busy) return;
    state.modalOpen = false;

    if (state.modalEl) {
      state.modalEl.classList.add('hidden');
      state.modalEl.hidden = true;
      setModalError('');
      setSubmitLoading(false);
      resetGoogleAuxViews();
    }

    const openBtn = state.containerEl ? state.containerEl.querySelector('.auth-open-btn') : null;
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'false');
    }

    if (state.lastFocusedEl && typeof state.lastFocusedEl.focus === 'function' && document.contains(state.lastFocusedEl)) {
      state.lastFocusedEl.focus();
    } else if (openBtn && typeof openBtn.focus === 'function') {
      openBtn.focus();
    }
    state.lastFocusedEl = null;
  }

  async function submitAuthRequest(url, payload, fallbackError) {
    state.busy = true;
    setModalError('');
    setSubmitLoading(true);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      const contentType = getResponseContentType(res);
      const data = contentType.includes('application/json')
        ? await res.json().catch(() => null)
        : null;

      if (res.ok && data && data.authenticated && data.user) {
        state.user = data.user;
        state.busy = false;
        closeModal(true);
        render();
        notifyAuthChange(state.user);
        return;
      }

      const errorText = (data && typeof data.error === 'string' && data.error.trim())
        ? data.error.trim()
        : fallbackError;
      setModalError(errorText);
    } catch (err) {
      console.error('Auth request failed:', err);
      setModalError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    }

    state.busy = false;
    setSubmitLoading(false);
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    if (state.busy || !state.modalEl) return;

    const emailEl = state.modalEl.querySelector('#authLoginEmail');
    const passwordEl = state.modalEl.querySelector('#authLoginPassword');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!isValidEmail(email)) {
      setModalError('Vui lòng nhập địa chỉ email hợp lệ.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (!password) {
      setModalError('Vui lòng nhập mật khẩu.');
      if (passwordEl) passwordEl.focus();
      return;
    }

    await submitAuthRequest(
      AUTH_LOGIN_URL,
      { email, password },
      'Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.'
    );
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (state.busy || !state.modalEl) return;

    const nameEl = state.modalEl.querySelector('#authRegisterName');
    const emailEl = state.modalEl.querySelector('#authRegisterEmail');
    const passwordEl = state.modalEl.querySelector('#authRegisterPassword');
    const confirmEl = state.modalEl.querySelector('#authRegisterConfirm');

    const displayName = nameEl ? nameEl.value.trim().slice(0, 100) : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const confirmPassword = confirmEl ? confirmEl.value : '';

    if (!isValidEmail(email)) {
      setModalError('Vui lòng nhập địa chỉ email hợp lệ.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (password.length < 6) {
      setModalError('Mật khẩu phải có ít nhất 6 ký tự.');
      if (passwordEl) passwordEl.focus();
      return;
    }
    if (password !== confirmPassword) {
      setModalError('Mật khẩu xác nhận không khớp.');
      if (confirmEl) confirmEl.focus();
      return;
    }

    await submitAuthRequest(
      AUTH_REGISTER_URL,
      { displayName, email, password },
      'Đăng ký thất bại. Vui lòng thử lại.'
    );
  }

  async function handleCredentialResponse(response) {
    if (!response || !response.credential || state.busy) return;
    state.busy = true;
    setModalError('');
    setSubmitLoading(true);

    try {
      const res = await fetch(AUTH_GOOGLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ credential: response.credential })
      });
      const contentType = getResponseContentType(res);
      const data = contentType.includes('application/json')
        ? await res.json().catch(() => null)
        : null;

      if (res.ok && data && data.authenticated && data.user) {
        state.user = data.user;
        state.busy = false;
        closeModal(true);
        render();
        notifyAuthChange(state.user);
        return;
      }

      const errorText = (data && typeof data.error === 'string' && data.error.trim())
        ? data.error.trim()
        : 'Đăng nhập Google không thành công.';
      setModalError(errorText);
      console.warn('Google sign-in rejected:', res.status, data || contentType);
    } catch (err) {
      console.error('Google sign-in request failed:', err);
      setModalError('Không thể xác thực tài khoản Google. Vui lòng thử lại.');
    }

    state.busy = false;
    setSubmitLoading(false);
    render();
  }

  async function handleLogout() {
    if (state.busy) return;
    state.busy = true;
    render();

    try {
      await fetch(AUTH_LOGOUT_URL, {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch (err) {
      console.warn('Logout request error:', err);
    }

    state.user = null;
    state.busy = false;
    render();
    notifyAuthChange(null);
  }

  function getAuthErrorMessage(code) {
    const clean = String(code || '').trim();
    if (!clean) {
      return 'Đăng nhập Google không thành công. Vui lòng thử lại.';
    }
    if (Object.prototype.hasOwnProperty.call(AUTH_ERROR_MESSAGES, clean)) {
      return AUTH_ERROR_MESSAGES[clean];
    }
    return 'Đăng nhập Google không thành công (' + clean + '). Vui lòng thử lại.';
  }

  function consumeAuthErrorFromUrl() {
    if (!global.location || typeof URLSearchParams === 'undefined') return '';
    try {
      const url = new URL(global.location.href);
      const authError = url.searchParams.get('auth_error');
      if (!authError) return '';

      url.searchParams.delete('auth_error');
      const cleanedSearch = url.searchParams.toString();
      const nextUrl = url.pathname + (cleanedSearch ? '?' + cleanedSearch : '') + (url.hash || '');
      if (global.history && typeof global.history.replaceState === 'function') {
        global.history.replaceState(null, '', nextUrl);
      }
      return authError.trim();
    } catch (_) {
      return '';
    }
  }

  async function fetchSession() {
    const emptySession = {
      authenticated: false,
      user: null,
      googleClientId: null,
      googleOAuthReady: false,
      googleRedirectUri: null
    };
    try {
      const res = await fetch(AUTH_ME_URL, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const contentType = getResponseContentType(res);
      if (!res.ok || !contentType.includes('application/json')) {
        return emptySession;
      }
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        return emptySession;
      }
      return {
        authenticated: Boolean(data.authenticated && data.user),
        user: data.authenticated && data.user ? data.user : null,
        googleClientId: data.googleClientId ? String(data.googleClientId).trim() : null,
        googleOAuthReady: Boolean(data.googleOAuthReady),
        googleRedirectUri: data.googleRedirectUri ? String(data.googleRedirectUri).trim() : null
      };
    } catch (err) {
      console.warn('LingoAuth session check failed:', err);
      return emptySession;
    }
  }

  function init(options = {}) {
    try {
      state.containerEl = options.containerEl || null;
      state.onAuthChange = typeof options.onAuthChange === 'function' ? options.onAuthChange : null;

      if (!state.containerEl) {
        state.user = null;
        return Promise.resolve(null);
      }

      if (!state.i18nSubscribed && global.LingoI18n && typeof global.LingoI18n.onChange === 'function') {
        state.i18nSubscribed = true;
        global.LingoI18n.onChange(() => render());
      }

      const authError = consumeAuthErrorFromUrl();
      return fetchSession()
        .then((session) => {
          state.user = session && session.user ? session.user : null;
          state.googleClientId = session ? session.googleClientId : null;
          state.googleOAuthReady = Boolean(session && session.googleOAuthReady);
          state.googleRedirectUri = (session && session.googleRedirectUri) || null;
          render();

          if (authError) {
            openModal('login');
            setModalError(getAuthErrorMessage(authError));
          }

          return state.user;
        })
        .catch((err) => {
          console.warn('LingoAuth init error:', err);
          try {
            state.user = null;
            state.googleClientId = null;
            state.googleOAuthReady = false;
            state.googleRedirectUri = null;
            render();
          } catch (_) {}
          return null;
        });
    } catch (err) {
      console.warn('LingoAuth init error:', err);
      try {
        state.user = null;
        state.googleClientId = null;
        state.googleOAuthReady = false;
        state.googleRedirectUri = null;
        render();
      } catch (_) {}
      return Promise.resolve(null);
    }
  }

  function getUser() {
    return state.user;
  }

  const LingoAuth = {
    init,
    getUser,
    logout: handleLogout
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LingoAuth;
  }
  global.LingoAuth = LingoAuth;
})(typeof window !== 'undefined' ? window : this);
