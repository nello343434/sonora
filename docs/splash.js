/* Intro : le logo se dessine point par point, puis glisse à gauche et « Sonora » se dessine trait par trait.
   Animée en JavaScript (Web Animations, transform/opacity uniquement) : fluide et indépendante des réglages Windows. */
(function () {
  var sp = document.getElementById('splash'); if (!sp) return;
  function A(el, kf, d, delay, ease) { try { return el.animate(kf, { duration: d, delay: delay, easing: ease || 'ease', fill: 'forwards' }); } catch (e) { return null; } }
  var logo = sp.querySelector('.sp-logo'), name = sp.querySelector('.sp-name'), row = sp.querySelector('.sp-row');
  var gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  var shift = (name.getBoundingClientRect().width + gap) / 2;
  logo.style.transform = 'translateX(' + shift + 'px)';
  // 1) le logo se dessine : chaque barre se trace point par point
  sp.querySelectorAll('.ld').forEach(function (d) {
    var b = +d.getAttribute('data-b'), j = +d.getAttribute('data-j'), n = +d.getAttribute('data-n');
    A(d, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1.35)', offset: .6 }, { opacity: 1, transform: 'scale(1)' }], 260, 200 + b * 110 + (j / n) * 580, 'cubic-bezier(.3,.7,.3,1)');
  });
  // 2) le logo glisse vers la gauche
  A(logo, [{ transform: 'translateX(' + shift + 'px)' }, { transform: 'translateX(0px)' }], 520, 1450, 'cubic-bezier(.65,0,.25,1)');
  // 3) « Sonora » se dessine lettre par lettre (trait, puis remplissage)
  sp.querySelectorAll('.tc').forEach(function (p, k) {
    var L = 0; try { L = Math.ceil(p.getTotalLength()) + 2; } catch (e) { L = 0; }
    p.style.strokeDasharray = L + ' ' + L; p.style.strokeDashoffset = L;
    var t = 1700 + k * 150;
    A(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], 480, t, 'cubic-bezier(.45,0,.2,1)');
    A(p, [{ fillOpacity: 0 }, { fillOpacity: 1 }], 250, t + 400, 'ease-out');
  });
  // 4) fondu vers l'appli
  A(sp, [{ opacity: 1 }, { opacity: 0 }], 400, 3400, 'ease-in');
  setTimeout(function () { sp.style.display = 'none'; }, 3850);
})();
