/* ============================================================
   Palm Desert Appraiser — Site JavaScript
   ============================================================ */

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', nav.classList.contains('open'));
    });
    // Close nav on link click (mobile)
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var wasOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.faq-item').forEach(function (el) { el.classList.remove('open'); });
      // Toggle current
      if (!wasOpen) item.classList.add('open');
    });
  });

  // Contact form submission
  var form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = form.querySelector('.btn-submit');
      var successEl = document.getElementById('form-success');
      var errorEl = document.getElementById('form-error');
      successEl.style.display = 'none';
      errorEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Sending…';

      try {
        var data = Object.fromEntries(new FormData(form));
        var res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          successEl.style.display = 'block';
          form.reset();
        } else {
          throw new Error('Server returned ' + res.status);
        }
      } catch (err) {
        errorEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Message';
      }
    });
  }

  // Check URL params for form status (fallback for non-JS submission)
  var params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'success') {
    var el = document.getElementById('form-success');
    if (el) { el.style.display = 'block'; var f = document.getElementById('contact-form'); if (f) f.style.display = 'none'; }
  }
});
