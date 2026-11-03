/**
 * VŨ TRUNG HIẾU — NEO BRUTALISM PORTFOLIO
 * Mobile Drawer, Physical Throwable Sleeve Deck, Dynamic Project Modal, Form Validation
 */

document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================================================================
  // 1. MOBILE NAVIGATION DRAWER
  // =========================================================================
  const menuToggle = document.getElementById('menu-toggle');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const drawerClose = document.getElementById('drawer-close');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerLinks = document.querySelectorAll('.drawer-link');

  function openDrawer() {
    if (!mobileDrawer) return;
    mobileDrawer.classList.add('open');
    if (drawerBackdrop) drawerBackdrop.classList.add('active');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'true');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    if (!mobileDrawer) return;
    mobileDrawer.classList.remove('open');
    if (drawerBackdrop) drawerBackdrop.classList.remove('active');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (menuToggle) menuToggle.addEventListener('click', openDrawer);
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  drawerLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeDrawer();
    });
  });

  // =========================================================================
  // 2. THROWABLE PHYSICAL CARD DECK (Dự án tiêu biểu)
  // Pointer Events API with Dragging, Physics Throw, and Indicator Sync
  // =========================================================================
  const deck = document.getElementById('throwable-deck');
  if (deck) {
    const cards = Array.from(deck.querySelectorAll('.sleeve-card'));
    const dots = Array.from(document.querySelectorAll('#deck-dots .dot'));
    const titleEl = document.getElementById('deck-active-title');
    const counterEl = document.getElementById('deck-counter');
    const prevBtn = document.getElementById('deck-prev-btn');
    const nextBtn = document.getElementById('deck-next-btn');

    let activeIndex = 0;
    const totalCards = cards.length;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isAnimating = false;

    function getStackConfigs() {
      const isMobile = window.innerWidth <= 720;
      if (prefersReducedMotion || isMobile) {
        return [
          { x: 0, y: 0, scale: 1.0, rotate: 0, zIndex: 10, opacity: 1.0 },
          { x: 8, y: -6, scale: 0.98, rotate: 0, zIndex: 9, opacity: 0.85 },
          { x: 16, y: -12, scale: 0.96, rotate: 0, zIndex: 8, opacity: 0.7 }
        ];
      }
      return [
        { x: 0, y: 0, scale: 1.0, rotate: 0, zIndex: 10, opacity: 1.0 },
        { x: 12, y: -10, scale: 0.96, rotate: 2.2, zIndex: 9, opacity: 0.9 },
        { x: 22, y: -20, scale: 0.92, rotate: -2.0, zIndex: 8, opacity: 0.75 }
      ];
    }

    function renderStack(animate = true) {
      const configs = getStackConfigs();

      cards.forEach((card, i) => {
        const relIndex = (i - activeIndex + totalCards) % totalCards;
        const config = configs[Math.min(relIndex, configs.length - 1)];

        card.style.zIndex = config.zIndex;
        card.style.pointerEvents = relIndex === 0 ? 'auto' : 'none';

        if (!animate || prefersReducedMotion) {
          card.style.transition = 'none';
        } else {
          card.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
        }

        card.style.transform = `translate3d(${config.x}px, ${config.y}px, 0) scale(${config.scale}) rotate(${config.rotate}deg)`;
        card.style.opacity = config.opacity;
      });

      const currentCard = cards[activeIndex];
      const code = currentCard.dataset.code || `ED-00${activeIndex + 1}`;
      const name = currentCard.dataset.name || 'ARCHIVE';
      if (titleEl) titleEl.textContent = `${code} // ${name}`;
      if (counterEl) counterEl.textContent = `0${activeIndex + 1} / 0${totalCards}`;

      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === activeIndex);
      });
    }

    renderStack(false);

    function getTopCard() {
      return cards[activeIndex];
    }

    deck.addEventListener('pointerdown', (e) => {
      if (isAnimating) return;
      // Do not initiate drag if user is clicking a button or link inside the card
      if (e.target.closest('button') || e.target.closest('a')) return;
      const topCard = getTopCard();
      if (!topCard) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentX = e.clientX;
      currentY = e.clientY;

      deck.setPointerCapture(e.pointerId);
      topCard.style.transition = 'none';
    });

    deck.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const topCard = getTopCard();
      if (!topCard) return;

      currentX = e.clientX;
      currentY = e.clientY;
      const dx = currentX - startX;
      const dy = currentY - startY;

      const rotation = dx * 0.05;
      topCard.style.transform = `translate3d(${dx}px, ${dy * 0.25}px, 0) rotate(${rotation}deg) scale(1.02)`;
    });

    function throwTopCard(direction = 1) {
      if (isAnimating) return;
      isAnimating = true;
      playClickSfx('woosh');

      const topCard = getTopCard();
      const deckWidth = deck.offsetWidth || 340;
      const throwDist = (direction > 0 ? 1 : -1) * (deckWidth * 1.3);
      const throwRot = (direction > 0 ? 25 : -25);

      if (prefersReducedMotion) {
        activeIndex = (activeIndex + 1) % totalCards;
        renderStack(false);
        isAnimating = false;
        return;
      }

      topCard.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
      topCard.style.transform = `translate3d(${throwDist}px, -30px, 0) rotate(${throwRot}deg) scale(0.95)`;
      topCard.style.opacity = '0';

      setTimeout(() => {
        activeIndex = (activeIndex + 1) % totalCards;
        renderStack(true);
        isAnimating = false;
      }, 300);
    }

    function reStackPrevious() {
      if (isAnimating) return;
      isAnimating = true;
      playClickSfx('woosh');

      activeIndex = (activeIndex - 1 + totalCards) % totalCards;
      const topCard = getTopCard();
      const deckWidth = deck.offsetWidth || 340;

      if (prefersReducedMotion) {
        renderStack(false);
        isAnimating = false;
        return;
      }

      topCard.style.transition = 'none';
      topCard.style.transform = `translate3d(-${deckWidth * 1.2}px, -20px, 0) rotate(-20deg) scale(0.9)`;
      topCard.style.opacity = '0';

      requestAnimationFrame(() => {
        renderStack(true);
        setTimeout(() => {
          isAnimating = false;
        }, 320);
      });
    }

    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;

      try {
        deck.releasePointerCapture(e.pointerId);
      } catch (_) {}

      const topCard = getTopCard();
      if (!topCard) return;

      const dx = currentX - startX;
      const deckWidth = deck.offsetWidth || 340;
      const threshold = deckWidth * 0.12;

      if (Math.abs(dx) > threshold) {
        throwTopCard(dx > 0 ? 1 : -1);
      } else {
        topCard.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        topCard.style.transform = 'translate3d(0, 0, 0) scale(1) rotate(0deg)';
      }
    }

    deck.addEventListener('pointerup', endDrag);
    deck.addEventListener('pointercancel', endDrag);

    deck.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        throwTopCard(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        reStackPrevious();
      }
    });

    if (nextBtn) nextBtn.addEventListener('click', () => throwTopCard(1));
    if (prevBtn) prevBtn.addEventListener('click', () => reStackPrevious());

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        if (isAnimating || idx === activeIndex) return;
        activeIndex = idx;
        renderStack(true);
      });
    });

    window.addEventListener('resize', () => {
      renderStack(false);
    });
  }

  // =========================================================================
  // 3. INTERACTIVE PROJECT MODAL (Bắt buộc theo Barem mục 6: Tối thiểu 2 dự án)
  // =========================================================================
  const projectModal = document.getElementById('project-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalBadge = document.getElementById('modal-badge');
  const modalTitle = document.getElementById('modal-title');
  const modalImg = document.getElementById('modal-img');
  const modalDesc = document.getElementById('modal-desc');
  const modalFeatures = document.getElementById('modal-features');
  const modalTechTags = document.getElementById('modal-tech-tags');
  const modalRepoLink = document.getElementById('modal-repo-link');
  const modalImgLink = document.getElementById('modal-img-link');
  const modalTriggerBtns = document.querySelectorAll('.btn-project-modal');

  const projectsData = {
    ntc: {
      badge: "PROJECT #01 // CLI & AI AUTOMATION",
      title: "NOVEL TRANSLATION CLI",
      img: "images/ntc-preview.jpg",
      desc: "Dự án công cụ dòng lệnh dịch novel tự động với giao diện Terminal TUI trực quan. Hỗ trợ cào dữ liệu truyện hàng loạt từ các nền tảng web, kết nối trực tiếp với mô hình AI Google Gemini (gemini-3.5-flash-lite), đồng thời tích hợp ma trận xưng hô và glossary thông minh tự cập nhật để đảm bảo tính nhất quán của danh xưng và thuật ngữ trong toàn bộ tác phẩm.",
      features: [
        "Quản lý theo 30+ batch hàng trăm chương truyện lớn, lưu trữ an toàn bằng SQLite",
        "Xem trước nội dung chương song ngữ (Bản RAW gốc và Bản Dịch AI chuẩn xác)",
        "Ma trận xưng hô & Glossary 4 phân hệ (Tất cả, Nhân vật, Xưng hô, Thuật ngữ)",
        "Tích hợp mô hình Google Gemini API tối ưu chi phí và tốc độ dịch thuật tự nhiên"
      ],
      tech: ["Python 3", "Google Gemini API", "SQLite", "Textual / Rich TUI", "Glossary Matrix"],
      link: "https://github.com/hieuvnj"
    },
    tts: {
      badge: "PROJECT #02 // AUDIO & TEXT-TO-SPEECH",
      title: "TTS NOVEL READER",
      img: "images/tts-reader.jpg",
      desc: "Ứng dụng đọc truyện bằng giọng nói nhân tạo thông minh, hỗ trợ xử lý tiểu thuyết chương dài với hơn 16,000+ đoạn văn. Tích hợp chuyển đổi linh hoạt giữa chế độ NGHE audio và ĐỌC văn bản, trình phát âm thanh chuyên nghiệp với giọng đọc tự nhiên và bộ nhớ tiến độ thông minh.",
      features: [
        "Chuyển đổi linh hoạt giữa 2 chế độ NGHE và VĂN BẢN",
        "Giọng đọc AI tự nhiên, hỗ trợ bộ nhớ tiến độ đọc chính xác",
        "Giao diện trình phát audio hiện đại với thanh thời lượng, waveform và điều khiển thông minh",
        "Hỗ trợ lưu trữ dữ liệu nghe truyện ngoại tuyến không cần kết nối mạng"
      ],
      tech: ["Python", "Text-to-Speech Engine", "Web Audio API", "JavaScript", "Offline Cache"],
      link: "https://github.com/hieuvnj"
    }
  };

  function openProjectModal(projectKey) {
    const data = projectsData[projectKey];
    if (!data || !projectModal) return;

    if (modalBadge) modalBadge.textContent = data.badge;
    if (modalTitle) modalTitle.textContent = data.title;
    if (modalImg) {
      modalImg.src = data.img;
      modalImg.alt = data.title;
      modalImg.onclick = () => window.open(data.img, '_blank');
    }
    if (modalImgLink) {
      modalImgLink.href = data.img;
    }
    if (modalDesc) modalDesc.textContent = data.desc;

    if (modalFeatures) {
      modalFeatures.innerHTML = '';
      data.features.forEach(feat => {
        const li = document.createElement('li');
        li.textContent = feat;
        modalFeatures.appendChild(li);
      });
    }

    if (modalTechTags) {
      modalTechTags.innerHTML = '';
      data.tech.forEach(t => {
        const span = document.createElement('span');
        span.className = 'tech-pill';
        span.textContent = t;
        modalTechTags.appendChild(span);
      });
    }

    if (modalRepoLink) {
      modalRepoLink.href = data.link;
    }

    projectModal.classList.add('open');
    projectModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeProjectModal() {
    if (!projectModal) return;
    projectModal.classList.remove('open');
    projectModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  modalTriggerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const pKey = btn.dataset.project;
      openProjectModal(pKey);
    });
  });

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeProjectModal);

  if (projectModal) {
    projectModal.addEventListener('click', (e) => {
      if (e.target === projectModal) {
        closeProjectModal();
      }
    });
  }

  // Close modals or drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectModal();
      closeDrawer();
    }
  });

  // =========================================================================
  // 4. CONTACT FORM VALIDATION (Bắt buộc theo Barem mục 15: 0.5đ)
  // =========================================================================
  const contactForm = document.getElementById('contact-form');
  const nameInput = document.getElementById('contact-name');
  const emailInput = document.getElementById('contact-email');
  const subjectInput = document.getElementById('contact-subject');
  const messageInput = document.getElementById('contact-message');

  const nameError = document.getElementById('name-error');
  const emailError = document.getElementById('email-error');
  const subjectError = document.getElementById('subject-error');
  const messageError = document.getElementById('message-error');
  const formAlert = document.getElementById('form-alert');

  function clearError(inputEl, errorEl) {
    if (inputEl) inputEl.classList.remove('has-error');
    if (errorEl) errorEl.textContent = '';
  }

  function setError(inputEl, errorEl, message) {
    if (inputEl) inputEl.classList.add('has-error');
    if (errorEl) errorEl.textContent = message;
  }

  // Real-time cleanup on user typing
  if (nameInput) nameInput.addEventListener('input', () => clearError(nameInput, nameError));
  if (emailInput) emailInput.addEventListener('input', () => clearError(emailInput, emailError));
  if (subjectInput) subjectInput.addEventListener('input', () => clearError(subjectInput, subjectError));
  if (messageInput) messageInput.addEventListener('input', () => clearError(messageInput, messageError));

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      let isValid = true;

      // 1. Validate Name
      const nameVal = nameInput ? nameInput.value.trim() : '';
      if (!nameVal) {
        setError(nameInput, nameError, 'Vui lòng nhập họ và tên của bạn.');
        isValid = false;
      } else if (nameVal.length < 2) {
        setError(nameInput, nameError, 'Họ và tên phải có tối thiểu 2 ký tự.');
        isValid = false;
      } else {
        clearError(nameInput, nameError);
      }

      // 2. Validate Email
      const emailVal = emailInput ? emailInput.value.trim() : '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal) {
        setError(emailInput, emailError, 'Vui lòng cung cấp địa chỉ email.');
        isValid = false;
      } else if (!emailRegex.test(emailVal)) {
        setError(emailInput, emailError, 'Địa chỉ email không hợp lệ (ví dụ: name@example.com).');
        isValid = false;
      } else {
        clearError(emailInput, emailError);
      }

      // 3. Validate Subject
      const subjectVal = subjectInput ? subjectInput.value.trim() : '';
      if (!subjectVal) {
        setError(subjectInput, subjectError, 'Vui lòng nhập tiêu đề tin nhắn.');
        isValid = false;
      } else {
        clearError(subjectInput, subjectError);
      }

      // 4. Validate Message
      const messageVal = messageInput ? messageInput.value.trim() : '';
      if (!messageVal) {
        setError(messageInput, messageError, 'Vui lòng nhập nội dung cần trao đổi.');
        isValid = false;
      } else if (messageVal.length < 10) {
        setError(messageInput, messageError, 'Nội dung tin nhắn quá ngắn (tối thiểu 10 ký tự).');
        isValid = false;
      } else {
        clearError(messageInput, messageError);
      }

      // Focus first field with error
      if (!isValid) {
        if (formAlert) formAlert.style.display = 'none';
        const firstErrorField = contactForm.querySelector('.has-error');
        if (firstErrorField) firstErrorField.focus();
        return;
      }

      // Success notification
      if (formAlert) {
        formAlert.className = 'form-alert success';
        formAlert.innerHTML = `<strong><i class="fa-solid fa-circle-check"></i> GỬI TIN NHẮN THÀNH CÔNG!</strong> Cảm ơn ${nameVal}, thông tin liên hệ của bạn đã được ghi nhận vào hệ thống. Mình sẽ phản hồi sớm nhất qua email <strong>${emailVal}</strong>.`;
        formAlert.style.display = 'block';
      }

      contactForm.reset();

      setTimeout(() => {
        if (formAlert) formAlert.style.display = 'none';
      }, 8000);
    });
  }

  // =========================================================================
  // 5. LIVE SAIGON CLOCK (UTC+7)
  // =========================================================================
  const saigonClockEl = document.getElementById('saigon-clock');
  function updateSaigonClock() {
    if (!saigonClockEl) return;
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      saigonClockEl.textContent = `SAIGON // ${timeStr}`;
    } catch (_) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      saigonClockEl.textContent = `SAIGON // ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
  }
  updateSaigonClock();
  setInterval(updateSaigonClock, 1000);

  // =========================================================================
  // 6. SYNTHESIZED TACTILE WEB AUDIO SFX (No External Sound Files)
  // =========================================================================
  let audioCtx = null;
  let sfxEnabled = true;

  try {
    const savedPref = localStorage.getItem('folio_sfx_pref');
    if (savedPref !== null) {
      sfxEnabled = savedPref === 'true';
    }
  } catch (_) {}

  const sfxToggleBtn = document.getElementById('sfx-toggle');
  const sfxIcon = document.getElementById('sfx-icon');
  const sfxLabel = document.getElementById('sfx-label');

  function updateSfxToggleUI() {
    if (!sfxToggleBtn) return;
    if (sfxEnabled) {
      sfxToggleBtn.classList.remove('muted');
      if (sfxIcon) sfxIcon.className = 'fa-solid fa-volume-high';
      if (sfxLabel) sfxLabel.textContent = 'SFX: BẬT';
    } else {
      sfxToggleBtn.classList.add('muted');
      if (sfxIcon) sfxIcon.className = 'fa-solid fa-volume-xmark';
      if (sfxLabel) sfxLabel.textContent = 'SFX: TẮT';
    }
  }
  updateSfxToggleUI();

  function initAudioContext() {
    if (!audioCtx && typeof window.AudioContext !== 'undefined') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playClickSfx(pitch = 'normal') {
    if (!sfxEnabled || prefersReducedMotion) return;
    try {
      initAudioContext();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;

      let startFreq = 480;
      let endFreq = 120;
      let duration = 0.04;

      if (pitch === 'high') {
        startFreq = 880;
        endFreq = 440;
        duration = 0.05;
      } else if (pitch === 'low') {
        startFreq = 240;
        endFreq = 80;
        duration = 0.06;
      } else if (pitch === 'woosh') {
        startFreq = 300;
        endFreq = 90;
        duration = 0.12;
      }

      osc.type = pitch === 'high' ? 'sine' : 'square';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + duration);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (_) {}
  }

  if (sfxToggleBtn) {
    sfxToggleBtn.addEventListener('click', () => {
      sfxEnabled = !sfxEnabled;
      try {
        localStorage.setItem('folio_sfx_pref', String(sfxEnabled));
      } catch (_) {}
      updateSfxToggleUI();
      if (sfxEnabled) {
        playClickSfx('high');
        showToast('ÂM THANH TƯƠNG TÁC: ĐÃ BẬT');
      } else {
        showToast('ÂM THANH TƯƠNG TÁC: ĐÃ TẮT');
      }
    });
  }

  // Tactile click sounds on button presses
  document.addEventListener('click', (e) => {
    const clickable = e.target.closest('.btn-neo, .btn-icon, .filter-chip, .tab-strip-btn, .theme-toggle-btn');
    if (clickable && clickable !== sfxToggleBtn) {
      playClickSfx('normal');
    }
  });

  // =========================================================================
  // 7. BRUTALIST TOAST NOTIFICATION & ONE-CLICK CLIPBOARD COPY
  // =========================================================================
  const toastEl = document.getElementById('neo-toast');
  let toastTimer = null;

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2600);
  }

  function copyToClipboard(text, label = '') {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        playClickSfx('high');
        showToast(`ĐÃ SAO CHÉP: ${label || text}`);
      }).catch(() => {
        fallbackCopy(text, label);
      });
    } else {
      fallbackCopy(text, label);
    }
  }

  function fallbackCopy(text, label) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      playClickSfx('high');
      showToast(`ĐÃ SAO CHÉP: ${label || text}`);
    } catch (_) {
      showToast(`KHÔNG THỂ SAO CHÉP: ${text}`);
    }
  }

  document.addEventListener('click', (e) => {
    const copyTarget = e.target.closest('[data-copy]');
    if (copyTarget) {
      e.preventDefault();
      const val = copyTarget.getAttribute('data-copy');
      const label = copyTarget.getAttribute('data-copy-label') || val;
      copyToClipboard(val, label);
    }
  });

  // =========================================================================
  // 8. TACTILE SCROLL PROGRESS TAPE & FLOATING BACK TO TOP BUTTON
  // =========================================================================
  const progressTape = document.getElementById('scroll-progress-tape');
  const progressFill = document.getElementById('progress-fill');
  const progressBadge = document.getElementById('progress-badge');
  const backToTopBtn = document.getElementById('back-to-top-btn');

  function handleScrollProgress() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const percent = scrollHeight > 0 ? Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100))) : 0;

    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressBadge) {
      progressBadge.textContent = `${percent}%`;
      progressBadge.classList.toggle('visible', percent > 5);
    }
    if (progressTape) {
      progressTape.setAttribute('aria-valuenow', percent);
    }

    if (backToTopBtn) {
      backToTopBtn.classList.toggle('visible', scrollTop > 320);
    }
  }

  window.addEventListener('scroll', handleScrollProgress, { passive: true });
  handleScrollProgress();

  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      playClickSfx('high');
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      });
    });
  }

  // =========================================================================
  // 9. SCROLL SNAP & SECTION SPY (Neo Brutalism Side Nav & Header Sync)
  // =========================================================================
  const snapSectionIds = ['hero-portal', 'statement', 'about-goals', 'skills', 'projects', 'contact', 'close'];
  const snapDots = document.querySelectorAll('.snap-dot');
  const desktopNavLinks = document.querySelectorAll('.nav-links .nav-link');
  const drawerNavLinks = document.querySelectorAll('.drawer-nav .drawer-link');

  let activeSectionId = 'hero-portal';

  function setActiveSnapSection(currentId) {
    if (!currentId) return;
    activeSectionId = currentId;

    // Update Side Snap Dots
    snapDots.forEach(dot => {
      const target = dot.getAttribute('data-section');
      dot.classList.toggle('active', target === currentId);
    });

    // Update Desktop Header Nav Links
    desktopNavLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.toggle('active', href === `#${currentId}`);
    });

    // Update Mobile Drawer Links
    drawerNavLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.toggle('active', href === `#${currentId}`);
    });
  }

  // IntersectionObserver for Section Spying
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveSnapSection(entry.target.id);
        }
      });
    }, {
      root: null,
      rootMargin: '-30% 0px -40% 0px',
      threshold: 0
    });

    snapSectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) sectionObserver.observe(el);
    });
  }

  // Fallback in scroll listener for top and bottom limits
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    if (scrollY < 80) {
      setActiveSnapSection('hero-portal');
    } else if ((window.innerHeight + scrollY) >= (document.documentElement.scrollHeight - 50)) {
      setActiveSnapSection('close');
    }
  }, { passive: true });

  // Snap dot click handling with smooth scroll & click sound
  snapDots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      playClickSfx('normal');
      const targetId = dot.getAttribute('data-section');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });
        setActiveSnapSection(targetId);
      }
    });
  });
});
