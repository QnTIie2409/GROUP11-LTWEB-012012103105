/**
 * CHROMA EDITIONS — Sound Archive
 * Portal Hero, Throwable Card Deck & Motion System
 */

document.addEventListener('DOMContentLoaded', () => {
  // Check user preference for reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================================================================
  // 1. PORTAL HERO SCROLL-BOUND MOTION (100% reversible, driven by scroll)
  // =========================================================================
  const portalSection = document.getElementById('hero-portal');
  const panelLeft = document.getElementById('panel-left');
  const panelRight = document.getElementById('panel-right');
  const heroBleedImg = document.getElementById('hero-bleed-img');
  const heroDuotone = document.getElementById('hero-duotone');
  const dotAmber = document.getElementById('dot-amber');
  const dotTeal = document.getElementById('dot-teal');
  const wmLeft = document.getElementById('wm-left');
  const wmRight = document.getElementById('wm-right');
  const portalWordmark = document.getElementById('portal-wordmark');

  // Statement orb element for drift
  const statementOrb = document.getElementById('statement-orb');
  const statementSection = document.getElementById('statement');

  function updatePortal() {
    if (!portalSection) return;

    if (prefersReducedMotion) {
      // Finished state for reduced motion
      if (panelLeft) panelLeft.style.transform = 'translateX(-105%)';
      if (panelRight) panelRight.style.transform = 'translateX(105%)';
      if (heroBleedImg) heroBleedImg.style.transform = 'scale(1)';
      if (heroDuotone) heroDuotone.style.opacity = '0.35';
      if (dotAmber) dotAmber.style.transform = 'translate(-45vw, -40vh)';
      if (dotTeal) dotTeal.style.transform = 'translate(45vw, 40vh)';
      if (portalWordmark) {
        portalWordmark.style.transform = 'scale(1.35)';
        portalWordmark.style.letterSpacing = '-0.06em';
      }
      if (wmLeft) wmLeft.style.transform = 'translateX(-38vw)';
      if (wmRight) wmRight.style.transform = 'translateX(38vw)';
      return;
    }

    const rect = portalSection.getBoundingClientRect();
    const scrollDistance = portalSection.offsetHeight - window.innerHeight;

    // Progress from 0 (at top of hero) to 1 (when hero scroll finishes)
    let progress = -rect.top / scrollDistance;
    progress = Math.max(0, Math.min(1, progress));

    // A. Two Opaque Panels: Part outward past their own width (105% clears frame)
    const panelOffset = progress * 105;
    if (panelLeft) panelLeft.style.transform = `translateX(-${panelOffset}%)`;
    if (panelRight) panelRight.style.transform = `translateX(${panelOffset}%)`;

    // B. Hero Background Image: Settle from 1.15 overscale down to 1.0
    const imgScale = 1.15 - progress * 0.15;
    if (heroBleedImg) heroBleedImg.style.transform = `scale(${imgScale})`;

    // C. Duotone Wash: Opacity rises from 0 to 0.35
    const duotoneOpacity = progress * 0.35;
    if (heroDuotone) heroDuotone.style.opacity = duotoneOpacity.toFixed(3);

    // D. Two Traveling Accent Dots: travel from center outward to opposite corners
    const dotX = progress * 45; // vw
    const dotY = progress * 40; // vh
    if (dotAmber) dotAmber.style.transform = `translate(-${dotX}vw, -${dotY}vh)`;
    if (dotTeal) dotTeal.style.transform = `translate(${dotX}vw, ${dotY}vh)`;

    // E. The Portal Title: Scale up + Tighten tracking + Halves travel to edges
    const titleScale = 1.0 + progress * 0.42;
    // letter-spacing tightens from -0.02em down to -0.07em
    const tracking = -0.02 - progress * 0.05;
    if (portalWordmark) {
      portalWordmark.style.transform = `scale(${titleScale})`;
      portalWordmark.style.letterSpacing = `${tracking}em`;
    }

    // First span travels left, second span travels right
    const spanTravel = progress * 42; // vw
    if (wmLeft) wmLeft.style.transform = `translateX(-${spanTravel}vw)`;
    if (wmRight) wmRight.style.transform = `translateX(${spanTravel}vw)`;

    // F. Statement Orb Drift & Rotation on scroll
    if (statementSection && statementOrb) {
      const stmtRect = statementSection.getBoundingClientRect();
      if (stmtRect.top < window.innerHeight && stmtRect.bottom > 0) {
        const stmtProgress = (window.innerHeight - stmtRect.top) / (window.innerHeight + stmtRect.height);
        const orbY = (stmtProgress - 0.5) * 80; // px drift
        const orbRot = stmtProgress * 45; // deg
        statementOrb.style.transform = `translateY(${orbY}px) rotate(${orbRot}deg)`;
      }
    }
  }

  // Bind scroll with requestAnimationFrame for smooth 60/120fps performance
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updatePortal();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // Initial call on load
  updatePortal();

  // =========================================================================
  // 2. THROWABLE PHYSICAL CARD DECK
  // =========================================================================
  const deck = document.getElementById('throwable-deck');
  if (!deck) return;

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

  // Stacking offsets: scale, translate, rotate
  const stackConfigs = [
    { x: 0, y: 0, scale: 1.0, rotate: 0, zIndex: 10, opacity: 1.0 },
    { x: 12, y: -10, scale: 0.96, rotate: 2.2, zIndex: 9, opacity: 0.9 },
    { x: 22, y: -20, scale: 0.92, rotate: -2.0, zIndex: 8, opacity: 0.75 },
    { x: 30, y: -28, scale: 0.88, rotate: 2.8, zIndex: 7, opacity: 0.55 },
    { x: 36, y: -34, scale: 0.84, rotate: -1.5, zIndex: 6, opacity: 0.35 },
    { x: 40, y: -38, scale: 0.80, rotate: 1.0, zIndex: 5, opacity: 0.2 }
  ];

  function renderStack(animate = true) {
    cards.forEach((card, i) => {
      // Compute relative position in stack from current activeIndex
      const relIndex = (i - activeIndex + totalCards) % totalCards;
      const config = stackConfigs[Math.min(relIndex, stackConfigs.length - 1)];

      card.style.zIndex = config.zIndex;
      card.style.pointerEvents = relIndex === 0 ? 'auto' : 'none';

      if (!animate) {
        card.style.transition = 'none';
      } else {
        card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease';
      }

      card.style.transform = `translate3d(${config.x}px, ${config.y}px, 0) scale(${config.scale}) rotate(${config.rotate}deg)`;
      card.style.opacity = config.opacity;
    });

    // Update metadata & indicators
    const currentCard = cards[activeIndex];
    const code = currentCard.dataset.code || `ED-00${activeIndex + 1}`;
    const name = currentCard.dataset.name || 'ARCHIVE';
    if (titleEl) titleEl.textContent = `${code} // ${name}`;
    if (counterEl) counterEl.textContent = `0${activeIndex + 1} / 0${totalCards}`;

    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === activeIndex);
    });
  }

  // Initialize physical stack
  renderStack(false);

  // Top card pointer drag handling
  function getTopCard() {
    return cards[activeIndex];
  }

  deck.addEventListener('pointerdown', (e) => {
    if (isAnimating) return;
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

    // Track horizontal drag with slight rotation and scale
    const rotation = dx * 0.055;
    topCard.style.transform = `translate3d(${dx}px, ${dy * 0.25}px, 0) rotate(${rotation}deg) scale(1.02)`;
  });

  function throwTopCard(direction = 1) {
    if (isAnimating) return;
    isAnimating = true;

    const topCard = getTopCard();
    const deckWidth = deck.offsetWidth || 340;
    const throwDist = (direction > 0 ? 1 : -1) * (deckWidth * 1.35);
    const throwRot = (direction > 0 ? 32 : -32);

    topCard.style.transition = 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
    topCard.style.transform = `translate3d(${throwDist}px, -40px, 0) rotate(${throwRot}deg) scale(0.95)`;
    topCard.style.opacity = '0';

    setTimeout(() => {
      // Advance active index
      activeIndex = (activeIndex + 1) % totalCards;
      renderStack(true);
      isAnimating = false;
    }, 320);
  }

  function reStackPrevious() {
    if (isAnimating) return;
    isAnimating = true;

    activeIndex = (activeIndex - 1 + totalCards) % totalCards;
    const topCard = getTopCard();
    const deckWidth = deck.offsetWidth || 340;

    // Bring in from left with animation
    topCard.style.transition = 'none';
    topCard.style.transform = `translate3d(-${deckWidth * 1.2}px, -30px, 0) rotate(-25deg) scale(0.9)`;
    topCard.style.opacity = '0';

    requestAnimationFrame(() => {
      renderStack(true);
      setTimeout(() => {
        isAnimating = false;
      }, 350);
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
    const threshold = deckWidth * 0.1; // 10% threshold

    if (Math.abs(dx) > threshold) {
      throwTopCard(dx > 0 ? 1 : -1);
    } else {
      // Snap back smoothly
      topCard.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      topCard.style.transform = 'translate3d(0, 0, 0) scale(1) rotate(0deg)';
    }
  }

  deck.addEventListener('pointerup', endDrag);
  deck.addEventListener('pointercancel', endDrag);

  // Keyboard navigation on deck (Tab focused + Left/Right arrows)
  deck.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      throwTopCard(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      reStackPrevious();
    }
  });

  // Manual Control Buttons
  if (nextBtn) {
    nextBtn.addEventListener('click', () => throwTopCard(1));
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', () => reStackPrevious());
  }

  // Allow clicking on progress dots
  dots.forEach((dot, idx) => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      if (isAnimating || idx === activeIndex) return;
      activeIndex = idx;
      renderStack(true);
    });
  });
});
