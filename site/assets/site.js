(function () {
  'use strict';

  var nav = document.getElementById('nav');

  // 滚动时导航收起一点、加一层底
  var onScroll = function () {
    if (window.scrollY > 12) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // 进场：滚到哪，哪一块轻轻浮上来
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('is-in'); });
  }

  // 同一时间只展开一个常见问题
  var faqs = document.querySelectorAll('.faq__item');
  Array.prototype.forEach.call(faqs, function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      Array.prototype.forEach.call(faqs, function (other) {
        if (other !== item) other.open = false;
      });
    });
  });
})();
