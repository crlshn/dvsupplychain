/* =========================================================================
   DV SUPPLY CHAIN ANALYTICS — LANDING PAGE
   Vanilla JavaScript únicamente (sin librerías ni frameworks)
   ========================================================================= */
(() => {
  'use strict';

  /* -----------------------------------------------------------------------
     1. NAVBAR: cambia de estilo al hacer scroll
     ----------------------------------------------------------------------- */
  const navbar = document.getElementById('navbar');
  const updateNavbarStyle = () => {
    navbar.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  updateNavbarStyle();
  window.addEventListener('scroll', updateNavbarStyle, { passive: true });

  /* -----------------------------------------------------------------------
     2. MENÚ RESPONSIVE (hamburguesa)
     ----------------------------------------------------------------------- */
  const navToggle = document.getElementById('navToggle');
  const primaryNav = document.getElementById('primaryNav');

  const closeMobileMenu = () => {
    primaryNav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Abrir menú de navegación');
  };

  navToggle.addEventListener('click', () => {
    const isOpen = primaryNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
  });

  primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobileMenu));

  /* -----------------------------------------------------------------------
     3. SMOOTH SCROLL para enlaces internos (a excepción de los que abren el modal,
        que se resuelven en su propio handler más abajo)
     ----------------------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]:not(.js-open-modal)').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* -----------------------------------------------------------------------
     4. ANIMACIONES AL APARECER (Intersection Observer)
     ----------------------------------------------------------------------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* -----------------------------------------------------------------------
     5. CONTADORES ANIMADOS (franja de resultados)
     ----------------------------------------------------------------------- */
  const counters = document.querySelectorAll('.js-counter');

  const animateCounter = (el) => {
    const target = parseFloat(el.dataset.target || '0');
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    let startTime = null;

    const step = (timestamp) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
      const current = Math.round(target * eased);
      el.textContent = `${prefix}${current}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = `${prefix}${target}${suffix}`;
      }
    };
    requestAnimationFrame(step);
  };

  if (counters.length) {
    if ('IntersectionObserver' in window) {
      const counterObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animateCounter(entry.target);
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.6 }
      );
      counters.forEach((el) => counterObserver.observe(el));
    } else {
      counters.forEach(animateCounter);
    }
  }

  /* -----------------------------------------------------------------------
     6. MODAL "AGENDA UNA REUNIÓN ESTRATÉGICA"
     ----------------------------------------------------------------------- */
  const modalOverlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('scheduleModal');
  const modalClose = document.getElementById('modalClose');
  const modalBody = document.getElementById('modalBody');
  const successPanel = document.getElementById('formSuccess');
  const successClose = document.getElementById('successClose');
  const openModalTriggers = document.querySelectorAll('.js-open-modal');

  let lastFocusedEl = null;

  const getFocusableEls = () =>
    modal.querySelectorAll('a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])');

  const trapFocus = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(getFocusableEls());
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const openModal = (e) => {
    if (e) e.preventDefault();
    lastFocusedEl = document.activeElement;
    modalOverlay.hidden = false;
    // Forzar reflow para que la transición de opacidad se dispare correctamente
    void modalOverlay.offsetWidth;
    modalOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const firstField = document.getElementById('name');
    if (firstField) firstField.focus();

    document.addEventListener('keydown', handleModalKeydown);
  };

  const closeModal = () => {
    modalOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleModalKeydown);

    setTimeout(() => {
      modalOverlay.hidden = true;
    }, 250);

    if (lastFocusedEl) lastFocusedEl.focus();
  };

  const handleModalKeydown = (e) => {
    if (e.key === 'Escape') closeModal();
    trapFocus(e);
  };

  openModalTriggers.forEach((trigger) => trigger.addEventListener('click', openModal));
  modalClose.addEventListener('click', closeModal);
  successClose.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  /* -----------------------------------------------------------------------
     7. VALIDACIÓN DEL FORMULARIO DE AGENDAMIENTO
     ----------------------------------------------------------------------- */
  const scheduleForm = document.getElementById('scheduleForm');

  const fields = {
    name: {
      input: document.getElementById('name'),
      error: document.getElementById('nameError'),
      validate: (v) => (v.trim().length >= 2 ? '' : 'Ingresa tu nombre completo.'),
    },
    email: {
      input: document.getElementById('email'),
      error: document.getElementById('emailError'),
      validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Ingresa un email corporativo válido.'),
    },
    company: {
      input: document.getElementById('company'),
      error: document.getElementById('companyError'),
      validate: (v) => (v.trim().length >= 2 ? '' : 'Ingresa el nombre de tu empresa.'),
    },
    role: {
      input: document.getElementById('role'),
      error: document.getElementById('roleError'),
      validate: (v) => (v.trim().length >= 2 ? '' : 'Ingresa tu cargo.'),
    },
  };

  const setFieldError = (field, message) => {
    field.error.textContent = message;
    field.input.closest('.form__group').classList.toggle('has-error', Boolean(message));
  };

  Object.values(fields).forEach((field) => {
    field.input.addEventListener('input', () => setFieldError(field, field.validate(field.input.value)));
  });

  scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();

    let isValid = true;
    Object.values(fields).forEach((field) => {
      const message = field.validate(field.input.value);
      setFieldError(field, message);
      if (message) isValid = false;
    });

    if (!isValid) {
      const firstInvalid = scheduleForm.querySelector('.has-error input, .has-error textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // No hay backend: se simula el envío y se muestra confirmación in-modal.
    modalBody.hidden = true;
    successPanel.hidden = false;
    successPanel.querySelector('.btn').focus();
  });

  /* Al cerrar el modal, se restablece el formulario para la próxima apertura */
  const resetModalState = () => {
    scheduleForm.reset();
    Object.values(fields).forEach((field) => setFieldError(field, ''));
    modalBody.hidden = false;
    successPanel.hidden = true;
  };
  modalClose.addEventListener('click', resetModalState);
  successClose.addEventListener('click', resetModalState);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) resetModalState();
  });

  /* -----------------------------------------------------------------------
     8. BOTÓN "VOLVER ARRIBA"
     ----------------------------------------------------------------------- */
  const backToTop = document.getElementById('backToTop');

  const toggleBackToTop = () => {
    const shouldShow = window.scrollY > 560;
    backToTop.hidden = false; // permanece en el DOM para animar opacidad
    backToTop.classList.toggle('is-visible', shouldShow);
    if (!shouldShow) {
      // Oculta completamente tras la transición para no interceptar clics
      setTimeout(() => {
        if (!backToTop.classList.contains('is-visible')) backToTop.hidden = true;
      }, 250);
    }
  };
  window.addEventListener('scroll', toggleBackToTop, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* -----------------------------------------------------------------------
     9. AÑO DINÁMICO EN EL FOOTER
     ----------------------------------------------------------------------- */
  document.getElementById('year').textContent = new Date().getFullYear();
})();
