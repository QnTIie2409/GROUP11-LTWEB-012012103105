document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. Dark / Light Theme Toggle
  // =========================================================================
  const themeToggle = document.getElementById('theme-toggle');
  const body = document.body;
  const themeIcon = themeToggle.querySelector('i');

  // Load saved theme from localStorage or system preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    body.classList.remove('dark-theme');
    themeIcon.classList.replace('fa-moon', 'fa-sun');
  } else {
    body.classList.add('dark-theme');
    themeIcon.classList.replace('fa-sun', 'fa-moon');
  }

  themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-theme');
    const isDark = body.classList.contains('dark-theme');

    if (isDark) {
      themeIcon.classList.replace('fa-sun', 'fa-moon');
      localStorage.setItem('theme', 'dark');
    } else {
      themeIcon.classList.replace('fa-moon', 'fa-sun');
      localStorage.setItem('theme', 'light');
    }
  });

  // =========================================================================
  // 2. Mobile Menu Toggle
  // =========================================================================
  const menuToggle = document.getElementById('menu-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');
  const menuIcon = menuToggle.querySelector('i');

  menuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('open');
    if (navMenu.classList.contains('open')) {
      menuIcon.classList.replace('fa-bars', 'fa-xmark');
    } else {
      menuIcon.classList.replace('fa-xmark', 'fa-bars');
    }
  });

  // Close mobile menu when clicking a link
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('open');
      menuIcon.classList.replace('fa-xmark', 'fa-bars');
    });
  });

  // =========================================================================
  // 3. Scroll Progress Indicator & Active Nav Link
  // =========================================================================
  const progressBar = document.getElementById('scroll-progress');
  const sections = document.querySelectorAll('section[id]');

  window.addEventListener('scroll', () => {
    // Progress bar
    const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    progressBar.style.width = scrolled + '%';

    // Active nav link highlight
    const scrollY = window.pageYOffset;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');
      const activeLink = document.querySelector(`.nav-list a[href*="${sectionId}"]`);

      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        if (activeLink) activeLink.classList.add('active');
      } else {
        if (activeLink) activeLink.classList.remove('active');
      }
    });
  });

  // =========================================================================
  // 4. Typing Effect for Subtitle
  // =========================================================================
  const typingElement = document.getElementById('typing-text');
  const phrases = [
    'Sinh viên UTH',
    'Người đang học lập trình web',
    'Người thích chơi game và coi anime',
  ];

  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typingSpeed = 100;

  function type() {
    const currentPhrase = phrases[phraseIndex];

    if (isDeleting) {
      typingElement.textContent = currentPhrase.substring(0, charIndex - 1);
      charIndex--;
      typingSpeed = 50;
    } else {
      typingElement.textContent = currentPhrase.substring(0, charIndex + 1);
      charIndex++;
      typingSpeed = 100;
    }

    if (!isDeleting && charIndex === currentPhrase.length) {
      isDeleting = true;
      typingSpeed = 1800; // Pause at end of sentence
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      typingSpeed = 400; // Pause before new word
    }

    setTimeout(type, typingSpeed);
  }

  type();
});
