(function () {
  var PROTECTED_PAGE_NAMES = [
    'shop.html',
    'collections.html',
    'product.html',
    'cart.html',
    'checkout.html',
    'orders.html',
    'order-request.html',
    'preorder-dashboard.html',
    'contact.html'
  ];
  var PROTECTED_PATH_PATTERN = /\/(shop|collection|collections|product|cart|checkout|orders|order-request|preorder-dashboard|contact)(\.html)?$/i;
  var LOGIN_PAGE_PATHS = ['/login', '/html/login.html', '/login.html', '/html/logout.html'];
  var REDIRECT_MESSAGE_KEY = 'nordluxeAuthRedirectMessage';
  var REDIRECT_TARGET_KEY = 'nordluxeAuthRedirectTarget';
  var LOGIN_REDIRECT_MESSAGE = 'Please log in or create an account to continue shopping and access NordLuxe services.';
  var CONTACT_LINK_SELECTOR = 'a[href^="mailto:" i],a[href^="tel:" i],a[href*="wa.me" i],a[href*="whatsapp" i],.contact-option-btn,.footer-whatsapp-link';

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('nordluxeUser') || '{}');
    } catch (error) {
      return {};
    }
  }

  function isSignedIn() {
    var user = getStoredUser();
    return localStorage.getItem('nordluxeLoggedIn') === 'true' || !!(user && (user.uid || user.id || user.email));
  }

  function setAuthCookie() {
    document.cookie = 'nordluxeAuth=true; path=/; max-age=2592000; SameSite=Lax';
  }

  function clearAuthCookie() {
    document.cookie = 'nordluxeAuth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }

  function syncAuthCookie() {
    if (isSignedIn()) {
      setAuthCookie();
    } else {
      clearAuthCookie();
    }
  }

  function getCurrentPath() {
    return window.location.pathname || '/';
  }

  function getCurrentUrl() {
    return (getCurrentPath() || '/') + (window.location.search || '') + (window.location.hash || '');
  }

  function isLoginPage() {
    return LOGIN_PAGE_PATHS.indexOf(getCurrentPath()) !== -1 || /\/login(?:\.html)?$/i.test(getCurrentPath());
  }

  function isProtectedPage() {
    var path = getCurrentPath();
    var fileName = path.substring(path.lastIndexOf('/') + 1) || '';
    return PROTECTED_PAGE_NAMES.indexOf(fileName) !== -1 || PROTECTED_PATH_PATTERN.test(path);
  }

  function resolveRedirectTarget(fallbackPath) {
    var params = new URLSearchParams(window.location.search || '');
    var redirectParam = params.get('redirect');
    if (redirectParam) {
      return redirectParam;
    }

    var storedTarget = localStorage.getItem(REDIRECT_TARGET_KEY);
    if (storedTarget) {
      return storedTarget;
    }

    return fallbackPath || '/';
  }

  function redirectToLogin(targetPath) {
    var resolvedTarget = targetPath || getCurrentUrl();
    if (!resolvedTarget || /\/login(?:\.html)?$/i.test(resolvedTarget)) {
      resolvedTarget = '/';
    }

    localStorage.setItem(REDIRECT_MESSAGE_KEY, LOGIN_REDIRECT_MESSAGE);
    localStorage.setItem(REDIRECT_TARGET_KEY, resolvedTarget);
    window.location.replace('/html/login.html?redirect=' + encodeURIComponent(resolvedTarget));
  }

  function getProtectedRouteFromHref(href) {
    if (!href) return '';

    try {
      var url = new URL(href, window.location.href);
      var pathName = url.pathname || '';
      var fileName = pathName.substring(pathName.lastIndexOf('/') + 1) || '';
      if (PROTECTED_PAGE_NAMES.indexOf(fileName) !== -1 || PROTECTED_PATH_PATTERN.test(pathName)) {
        return url.pathname + url.search + url.hash;
      }
    } catch (error) {
      return '';
    }

    return '';
  }

  function isRestrictedContactLink(link) {
    if (!link) return false;

    var href = String(link.getAttribute('href') || '').trim().toLowerCase();
    var text = String(link.textContent || '').trim().toLowerCase();
    if (!href && !text) return false;

    return href.indexOf('mailto:') === 0 ||
      href.indexOf('tel:') === 0 ||
      href.indexOf('wa.me') !== -1 ||
      href.indexOf('whatsapp') !== -1 ||
      text.indexOf('whatsapp') !== -1 ||
      text.indexOf('email') !== -1 ||
      /\+?[0-9][0-9\s\-()]{6,}/.test(text);
  }

  function hideRestrictedContactInfo() {
    var hiddenAttr = 'data-auth-hidden';
    var selector = CONTACT_LINK_SELECTOR;

    if (isSignedIn()) {
      document.querySelectorAll('[' + hiddenAttr + '="true"]').forEach(function (el) {
        var previousDisplay = el.getAttribute('data-auth-prev-display');
        if (previousDisplay !== null) {
          el.style.display = previousDisplay;
        } else {
          el.style.removeProperty('display');
        }
        el.removeAttribute(hiddenAttr);
        el.removeAttribute('data-auth-prev-display');
      });
      return;
    }

    document.querySelectorAll(selector).forEach(function (el) {
      if (el.getAttribute(hiddenAttr) === 'true') return;
      el.setAttribute(hiddenAttr, 'true');
      el.setAttribute('data-auth-prev-display', el.style.display || '');
      el.style.display = 'none';
    });

    document.querySelectorAll('p,span,li,div').forEach(function (el) {
      if (!el || el.children.length) return;
      var text = String(el.textContent || '').trim();
      if (!text) return;

      if (/email\s*:|whatsapp\s*:|phone\s*:|nord\.luxe@gmail\.com|\+?[0-9][0-9\s\-()]{6,}/i.test(text)) {
        if (el.getAttribute(hiddenAttr) === 'true') return;
        el.setAttribute(hiddenAttr, 'true');
        el.setAttribute('data-auth-prev-display', el.style.display || '');
        el.style.display = 'none';
      }
    });
  }

  function guardContactModalOpener() {
    if (typeof window.openContactModal !== 'function') return;
    if (window.openContactModal.__authWrapped) return;

    var original = window.openContactModal;
    var wrapped = function () {
      if (!isSignedIn()) {
        redirectToLogin(getCurrentUrl());
        return;
      }
      return original.apply(this, arguments);
    };

    wrapped.__authWrapped = true;
    window.openContactModal = wrapped;
  }

  function guardAddToCart() {
    if (typeof window.addCart !== 'function') return;
    if (window.addCart.__authWrapped) return;

    var original = window.addCart;
    var wrapped = function () {
      if (!isSignedIn()) {
        redirectToLogin(getCurrentUrl());
        return;
      }
      return original.apply(this, arguments);
    };

    wrapped.__authWrapped = true;
    window.addCart = wrapped;
  }

  // Exposed utility for inline onclick guards
  window.requireAuth = function (fn) {
    if (isSignedIn()) {
      if (typeof fn === 'function') fn();
    } else {
      redirectToLogin(getCurrentUrl());
    }
  };

  function protectShopNowButtons() {
    document.addEventListener('click', function (event) {
      var target = event.target;
      var protectedLink = target && target.closest ? target.closest('a[href]') : null;
      var actionButton = target && target.closest ? target.closest('button,[role="button"]') : null;

      if (!isSignedIn()) {
        if (protectedLink) {
          if (isRestrictedContactLink(protectedLink)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            redirectToLogin(getCurrentUrl());
            return;
          }

          var route = getProtectedRouteFromHref(protectedLink.getAttribute('href'));
          if (route) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            redirectToLogin(route);
            return;
          }
        }

        if (actionButton) {
          var buttonText = String(actionButton.textContent || '').toLowerCase();
          var actionClass = String(actionButton.className || '').toLowerCase();
          var isShopAction = actionClass.indexOf('shop-now-btn') !== -1 || actionClass.indexOf('buy-now-btn') !== -1 || buttonText.indexOf('shop now') !== -1 || buttonText.indexOf('enquire') !== -1;
          if (isShopAction) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            redirectToLogin(getCurrentUrl());
          }
        }
      }
    }, true);
  }

  function init() {
    if (window.__nordluxeAuthGuardBooted) {
      return;
    }
    window.__nordluxeAuthGuardBooted = true;

    syncAuthCookie();
    protectShopNowButtons();
    hideRestrictedContactInfo();
    guardContactModalOpener();
    guardAddToCart();

    window.addEventListener('storage', function () {
      syncAuthCookie();
      hideRestrictedContactInfo();
    });

    setTimeout(guardContactModalOpener, 100);
    setTimeout(guardContactModalOpener, 600);
    setTimeout(guardAddToCart, 100);
    setTimeout(guardAddToCart, 600);

    if (!isSignedIn()) {
      if (isProtectedPage() && !isLoginPage()) {
        redirectToLogin(getCurrentUrl());
        return;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
