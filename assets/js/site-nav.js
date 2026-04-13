(function () {
  var ACTIVITY_KEY = 'nordluxeActivityLog';
  var SEARCH_KEY = 'nordluxeSearchHistory';
  var COOKIE_NOTICE_KEY = 'nordluxeCookieNoticeAccepted';
  var INSTAGRAM_URL = 'https://www.instagram.com/nord.luxe01?utm_source=qr&igsh=MW9nOW96eXJlc2IzdQ==';
  var TIKTOK_URL = 'http://tiktok.com/@nordluxe2';
  var WHATSAPP_URL = 'https://wa.me/2347017298740';
  var PRODUCT_INDEX = [
    { title: 'Nordluxe Long Ascension White', category: 'Longs', price: '₦100,000', originalPrice: '₦120,000', keywords: 'long ascension white nordluxe luxury preorder outfit wear', url: 'collections.html', image: '/assets/images/white%20long.png' },
    { title: 'Nordluxe Short Ascension White', category: 'Shorts', price: '₦80,000', originalPrice: '₦100,000', keywords: 'short ascension white nordluxe luxury preorder outfit wear', url: 'collections.html', image: '/assets/images/wite%20short.png' },
    { title: 'Nordluxe Long Ascension Black', category: 'Longs', price: '₦100,000', originalPrice: '₦120,000', keywords: 'long ascension black nordluxe luxury preorder outfit wear', url: 'collections.html', image: '/assets/images/long%20black.png' },
    { title: 'Nordluxe Short Ascension Black', category: 'Shorts', price: '₦80,000', originalPrice: '₦100,000', keywords: 'short ascension black nordluxe luxury preorder outfit wear', url: 'collections.html', image: '/assets/images/black%20short.png' },
    { title: 'Cloak White', category: 'Cloaks', price: '₦110,000', originalPrice: '₦140,000', keywords: 'cloak white nordluxe luxury preorder cape outerwear royal', url: 'collections.html', image: '/assets/images/cloak%20white.png' },
    { title: 'Cloak Black', category: 'Cloaks', price: '₦110,000', originalPrice: '₦140,000', keywords: 'cloak black nordluxe luxury preorder cape outerwear royal', url: 'collections.html', image: '/assets/images/cloak%20black.png' },
    { title: 'Nordluxe Full Ascension White Bundle', category: 'Bundles', price: '₦380,000', keywords: 'bundle white full ascension nordluxe set package long short cloak', url: 'collections.html', image: '/assets/images/cloak%20white.png' },
    { title: 'Nordluxe Full Ascension Black Bundle', category: 'Bundles', price: '₦380,000', keywords: 'bundle black full ascension nordluxe set package long short cloak', url: 'collections.html', image: '/assets/images/cloak%20black.png' },
    { title: 'Full Package (White + Black) Complete Collection', category: 'Bundles', price: '₦580,000', originalPrice: '₦610,000', keywords: 'full package white black complete collection nordluxe bundle set all', url: 'collections.html', image: '/assets/images/Full%20package.png' },
    { title: 'Collections', category: 'Page', price: '', keywords: 'catalog products collection browse all shop', url: 'collections.html', image: '' },
    { title: 'About', category: 'Page', price: '', keywords: 'brand story company nordluxe who we are', url: 'about.html', image: '' },
    { title: 'Contact', category: 'Page', price: '', keywords: 'contact us reach nordluxe support help', url: 'contact.html', image: '' }
  ];

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('nordluxeUser') || '{}');
    } catch (e) {
      return {};
    }
  }

  function getUserId() {
    var user = getStoredUser();
    return user.uid || user.id || '';
  }

  function getUserKey(base) {
    var uid = getUserId();
    return uid ? base + '_' + uid : base;
  }

  function isSignedIn() {
    var user = getStoredUser();
    return localStorage.getItem('nordluxeLoggedIn') === 'true' || !!(user && (user.uid || user.id || user.email));
  }

  function userDisplay() {
    var user = getStoredUser();
    return {
      name: user.name || user.displayName || user.email || 'User',
      photo: user.photoURL || user.profilePic || ''
    };
  }

  function readList(key) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeList(key, items, maxItems) {
    var limit = typeof maxItems === 'number' ? maxItems : 60;
    localStorage.setItem(key, JSON.stringify(items.slice(0, limit)));
  }

  function pushActivity(activity) {
    var items = readList(getUserKey('nordluxeActivityLog'));
    var normalized = Object.assign({ at: new Date().toISOString() }, activity || {});
    items.unshift(normalized);
    writeList(getUserKey('nordluxeActivityLog'), items, 120);
    postAnalyticsEvent(normalized.type || 'activity', normalized.title || 'Activity', normalized.details || '');
  }

  function pushSearch(term, source) {
    if (!term) return;
    var cleaned = String(term).trim();
    if (!cleaned) return;

    var searches = readList(getUserKey('nordluxeSearchHistory'));
    searches.unshift({ term: cleaned, source: source || 'site', at: new Date().toISOString() });
    writeList(getUserKey('nordluxeSearchHistory'), searches, 80);
    pushActivity({ type: 'search', title: 'Search: ' + cleaned, details: 'Source: ' + (source || 'site') });
  }

  function trackCurrentPage() {
    var path = (window.location.pathname || '').split('/').pop() || 'index.html';
    var url = new URL(window.location.href);
    var query = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('search') || url.searchParams.get('term');
    var productId = url.searchParams.get('id');

    if (query) {
      pushSearch(query, path);
    }

    if (path === 'product.html' && productId) {
      pushActivity({ type: 'product-view', title: 'Viewed product', details: 'ID: ' + productId });
    } else {
      pushActivity({ type: 'page-view', title: 'Visited page', details: path });
    }
  }

  function getAnalyticsSessionId() {
    var key = 'nordluxeLiveSessionId';
    var existing = localStorage.getItem(key);
    if (existing && existing.length > 10) return existing;

    var generated = '';
    try {
      if (window.crypto && window.crypto.randomUUID) {
        generated = window.crypto.randomUUID();
      }
    } catch (e) {
      // ignore
    }

    if (!generated) {
      generated = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
    }

    localStorage.setItem(key, generated);
    return generated;
  }

  function getExistingAnalyticsSessionId() {
    var key = 'nordluxeLiveSessionId';
    var existing = localStorage.getItem(key);
    if (existing && existing.length > 10) return existing;
    return '';
  }

  function postAnalyticsEvent(eventType, title, details) {
    var sessionId = getAnalyticsSessionId();
    if (!sessionId) return;

    var user = getStoredUser();
    var payload = JSON.stringify({
      sessionId: sessionId,
      type: String(eventType || '').slice(0, 50),
      title: String(title || '').slice(0, 160),
      details: String(details || '').slice(0, 220),
      page: window.location.pathname || '/',
      userEmail: (user && user.email) ? String(user.email) : '',
      userName: (user && (user.name || user.displayName)) ? String(user.name || user.displayName) : '',
      at: Date.now()
    });

    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function () {
      // Ignore event delivery failures in client UI.
    });
  }

  function endLiveSession(reason) {
    var sessionId = getExistingAnalyticsSessionId();
    if (!sessionId) return;

    var payload = JSON.stringify({
      sessionId: sessionId,
      reason: reason || 'ended',
      at: Date.now()
    });

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/session-end', blob);
        return;
      } catch (e) {
        // fall through to fetch
      }
    }

    fetch('/api/analytics/session-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function () {
      // Ignore session-end failures in client UI.
    });
  }

  function sendLiveHeartbeat() {
    var sessionId = getAnalyticsSessionId();
    var user = getStoredUser();
    var payload = JSON.stringify({
      sessionId: sessionId,
      page: window.location.pathname || '/',
      title: document.title || '',
      isLoggedIn: isSignedIn(),
      userEmail: (user && user.email) ? String(user.email) : '',
      userName: (user && (user.name || user.displayName)) ? String(user.name || user.displayName) : '',
      at: Date.now()
    });
    var endpoint = '/api/analytics/heartbeat';

    if (navigator.sendBeacon && document.visibilityState === 'hidden') {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      } catch (e) {
        // fall through to fetch
      }
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function () {
      // Ignore analytics heartbeat failures in client UI.
    });
  }

  function startLiveHeartbeat() {
    sendLiveHeartbeat();
    setInterval(sendLiveHeartbeat, 15000);

    document.addEventListener('visibilitychange', function () {
      sendLiveHeartbeat();
    });

    window.addEventListener('pagehide', function () {
      sendLiveHeartbeat();
    });
  }

  function bootLiveTrackingOnce() {
    if (window.__nordluxeLiveTrackingBooted) return;
    window.__nordluxeLiveTrackingBooted = true;

    patchLocalStorageTracking();
    trackCurrentPage();
    startLiveHeartbeat();
    trackSearchInputs();
  }

  function trackSearchInputs() {
    var tracked = new WeakSet();
    var selector = 'input[type="search"], input[name*="search" i], input[id*="search" i], input[placeholder*="search" i]';
    var inputs = document.querySelectorAll(selector);

    inputs.forEach(function (input) {
      if (!input || tracked.has(input)) return;
      tracked.add(input);

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          pushSearch(input.value, 'input-enter');
        }
      });

      input.addEventListener('change', function () {
        pushSearch(input.value, 'input-change');
      });
    });
  }

  function patchLocalStorageTracking() {
    if (window.__nordluxeStorageTrackingPatched) return;
    if (!window.Storage || !window.Storage.prototype || !window.Storage.prototype.setItem) return;

    var nativeSetItem = window.Storage.prototype.setItem;
    var nativeRemoveItem = window.Storage.prototype.removeItem;
    var nativeClear = window.Storage.prototype.clear;
    window.Storage.prototype.setItem = function (key, value) {
      var oldCart = null;
      var oldLoggedIn = localStorage.getItem('nordluxeLoggedIn');
      if (key.indexOf('nordluxeCart') === 0) {
        try {
          oldCart = JSON.parse(localStorage.getItem(key) || '[]');
        } catch (e) {
          oldCart = [];
        }
      }

      nativeSetItem.apply(this, arguments);

      if (key === 'nordluxeLoggedIn') {
        var nextLoggedIn = String(value);
        if (oldLoggedIn !== 'true' && nextLoggedIn === 'true') {
          sendLiveHeartbeat();
          postAnalyticsEvent('auth-login', 'Customer logged in', window.location.pathname || '/');
        }
        if (oldLoggedIn === 'true' && nextLoggedIn !== 'true') {
          endLiveSession('logout');
        }
      }

      if (key.indexOf('nordluxeCart') === 0) {
        try {
          var newCart = JSON.parse(localStorage.getItem(key) || '[]');
          var oldCount = Array.isArray(oldCart) ? oldCart.length : 0;
          var newCount = Array.isArray(newCart) ? newCart.length : 0;
          if (newCount > oldCount) {
            pushActivity({ type: 'cart', title: 'Added to cart', details: 'Items in cart: ' + newCount });
          } else if (newCount < oldCount) {
            pushActivity({ type: 'cart', title: 'Removed from cart', details: 'Items in cart: ' + newCount });
          }
        } catch (e) {
          // no-op
        }
      }
    };

    window.Storage.prototype.removeItem = function (key) {
      var shouldEndSession = key === 'nordluxeLoggedIn' || key === 'nordluxeUser';
      nativeRemoveItem.apply(this, arguments);
      if (shouldEndSession) {
        endLiveSession('logout');
      }
    };

    window.Storage.prototype.clear = function () {
      nativeClear.apply(this, arguments);
      endLiveSession('ended');
    };

    window.__nordluxeStorageTrackingPatched = true;
  }

  function ensureStyle() {
    if (document.getElementById('global-nav-style')) return;

    var style = document.createElement('style');
    style.id = 'global-nav-style';
    style.textContent = [
      '#globalNavHamburgerLeft{display:flex;align-items:center;z-index:1500;margin-right:10px;}',
      '#globalNavSearchAfterLogo{display:flex;align-items:center;margin-left:10px;z-index:1500;}',
      '#globalNavUserRight{display:flex;align-items:center;z-index:1500;margin-left:12px;flex-shrink:0;}',
      '.nav-control-btn{width:40px;height:40px;border-radius:50%;border:1px solid #d19b48;background:#d19b48;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
      '.nav-control-btn:hover{filter:brightness(1.08);}',
      '.nav-control-btn img{width:100%;height:100%;border-radius:50%;object-fit:cover;}',
      '#globalSearchBtn{width:40px;height:40px;border-radius:50%;border:1px solid #6e5326;background:linear-gradient(145deg,#1e1a14,#2b241b);color:#e5c78c;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(255,220,160,.18),0 7px 14px rgba(0,0,0,.28);}',
      '#globalSearchBtn:hover{background:linear-gradient(145deg,#292217,#382d1f);color:#f2d49a;transform:translateY(-1px);}',
      '#globalSearchBtn svg{width:18px;height:18px;display:block;}',
      '#globalSearchBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(2px);z-index:3199;display:none;}',
      '#globalSearchBackdrop.open{display:block;}',
      '#globalSearchPanel{position:fixed;left:50%;top:90px;transform:translateX(-50%);width:min(740px,92vw);background:linear-gradient(165deg,#0d0d10 0%,#151319 55%,#1e1912 100%);border:1px solid #8e6a2f;border-radius:16px;box-shadow:0 26px 68px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,215,140,.14);z-index:3200;display:none;overflow:hidden;}',
      '#globalSearchPanel.open{display:block;}',
      '#globalSearchTopline{padding:11px 14px 0 14px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#f0c879;font-weight:700;text-shadow:0 0 12px rgba(240,200,121,.3);}',
      '#globalSearchPanelHeader{display:flex;gap:8px;padding:10px 14px 14px;border-bottom:1px solid rgba(240,194,106,.24);background:linear-gradient(180deg,rgba(255,215,130,.08),rgba(255,215,130,.02));}',
      '#globalSearchInput{flex:1;padding:11px 13px;border:1px solid #7f622f;border-radius:10px;font-size:14px;outline:none;background:linear-gradient(180deg,#111216,#17131c);color:#f3dfb8;box-shadow:inset 0 1px 0 rgba(255,215,150,.06),0 0 0 1px rgba(0,0,0,.4);}',
      '#globalSearchInput:focus{border-color:#d3a858;box-shadow:0 0 0 2px rgba(211,168,88,.22),inset 0 1px 0 rgba(255,215,150,.08);}',
      '#globalSearchInput::placeholder{color:#a48a56;}',
      '#globalSearchSubmit{padding:11px 15px;border:1px solid #a97b34;background:linear-gradient(145deg,#7f5a22,#ba8a3d);color:#fff6e4;border-radius:10px;cursor:pointer;font-size:12px;letter-spacing:.6px;font-weight:700;text-transform:uppercase;box-shadow:0 8px 18px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,225,160,.18);}',
      '#globalSearchSubmit:hover{filter:brightness(1.08);transform:translateY(-1px);}',
      '#globalSearchResults{max-height:380px;overflow-y:auto;padding:10px;}',
      '.global-search-item{display:flex;align-items:center;gap:10px;padding:8px 10px;margin:6px 0;border:1px solid rgba(233,189,108,.28);border-radius:10px;text-decoration:none;color:#f3dfb8;background:linear-gradient(160deg,rgba(25,22,17,.95),rgba(17,17,20,.96));box-shadow:0 8px 18px rgba(0,0,0,.28);transition:all .18s ease;}',
      '.global-search-item:hover{border-color:#e3b96a;background:linear-gradient(160deg,rgba(38,32,22,.96),rgba(20,18,24,.98));transform:translateY(-1px);}',
      '.global-search-thumb{width:52px;height:52px;border-radius:8px;overflow:hidden;flex-shrink:0;border:1px solid rgba(211,168,88,.3);background:#1c1914;}',
      '.global-search-thumb img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.global-search-thumb-empty{background:linear-gradient(135deg,#1c1914,#252018);}',
      '.global-search-item-body{flex:1;min-width:0;}',
      '.global-search-item-title{font-weight:700;font-size:14px;letter-spacing:.25px;color:#f8dfad;}',
      '.global-search-item-meta{margin-top:4px;font-size:12px;color:#b7a077;display:flex;gap:6px;align-items:center;}',
      '.global-search-badge{background:rgba(211,168,88,.18);border:1px solid rgba(211,168,88,.36);color:#e8c47a;border-radius:999px;padding:2px 7px;font-size:11px;letter-spacing:.3px;}',
      '.global-search-price-group{display:flex;align-items:baseline;gap:8px;}',
      '.global-search-price-old{color:#9f8a63;font-size:12px;text-decoration:line-through;opacity:.85;}',
      '.global-search-price{color:#f0c879;font-weight:700;font-size:13px;}',
      '.global-search-empty{padding:16px;color:#c2ab80;font-size:13px;line-height:1.5;background:linear-gradient(160deg,rgba(20,18,16,.95),rgba(14,14,17,.95));border:1px dashed rgba(225,181,93,.45);border-radius:10px;}',
      '.global-search-results-count{padding:8px 14px 0;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#7f6838;}',
      '.nordluxe-dual-price{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}',
      '.nordluxe-old-price{color:#9f8a63;font-size:.88em;text-decoration:line-through;opacity:.85;}',
      '.nordluxe-current-price{color:inherit;font-weight:700;}',
      '#globalHamburgerMenu{position:fixed;top:0;right:-320px;width:300px;max-width:85vw;height:100vh;background:#111;color:#f4f4f4;z-index:3000;transition:right .25s ease;padding:20px;box-shadow:-6px 0 20px rgba(0,0,0,.35);overflow-y:auto;}',
      '#globalHamburgerMenu.open{right:0;}',
      '#globalHamburgerBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2999;display:none;}',
      '#globalHamburgerBackdrop.open{display:block;}',
      '#globalHamburgerMenu h3{margin:8px 0 18px 0;color:#ffd700;font-size:16px;letter-spacing:.5px;}',
      '#globalHamburgerMenu a,#globalHamburgerMenu button{display:block;width:100%;text-align:left;margin:8px 0;padding:10px 12px;border-radius:8px;border:1px solid #2b2b2b;background:#1a1a1a;color:#eee;text-decoration:none;cursor:pointer;font-size:14px;}',
      '#globalHamburgerMenu a:hover,#globalHamburgerMenu button:hover{background:#222;border-color:#d19b48;color:#ffd700;}',
      '#globalHamburgerMenu .danger{border-color:#7a2c2c;color:#ffb3b3;}',
      '#globalHamburgerMenu .danger:hover{border-color:#ff6b6b;color:#fff;}',
      '.footer-cookie-policy-link{font-weight:600;}',
      '.footer-social-links{display:inline-flex;align-items:center;gap:12px;}',
      '.footer-instagram-link{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:inherit;vertical-align:middle;}',
      '.footer-instagram-link svg{width:20px;height:20px;display:block;}',
      '.footer-tiktok-link{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:inherit;vertical-align:middle;}',
      '.footer-tiktok-link svg{width:20px;height:20px;display:block;}',
      '.footer-whatsapp-link{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:inherit;vertical-align:middle;}',
      '.footer-whatsapp-link svg{width:20px;height:20px;display:block;}',
      '#nordluxeCookieNotice{position:fixed;left:16px;right:16px;bottom:16px;z-index:3300;display:none;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;border:1px solid rgba(209,155,72,.45);background:linear-gradient(150deg,rgba(21,18,14,.97),rgba(35,28,19,.96));box-shadow:0 18px 42px rgba(0,0,0,.4);color:#f3dfb8;}',
      '#nordluxeCookieNotice.open{display:flex;}',
      '#nordluxeCookieNotice p{margin:0;font-size:13px;line-height:1.5;}',
      '#nordluxeCookieNotice a{color:#ffd991;text-decoration:underline;text-underline-offset:2px;}',
      '#nordluxeCookieNoticeActions{display:flex;gap:8px;align-items:center;flex-shrink:0;}',
      '#nordluxeCookieNoticeActions button,#nordluxeCookieNoticeActions a{padding:8px 12px;border-radius:8px;border:1px solid #a67a36;font-size:12px;letter-spacing:.4px;font-weight:700;text-transform:uppercase;text-decoration:none;}',
      '#nordluxeCookieNoticeRead{background:transparent;color:#f2d49a;}',
      '#nordluxeCookieNoticeAccept{background:linear-gradient(145deg,#7f5a22,#ba8a3d);color:#fff6e4;cursor:pointer;}',
      '@media (max-width:768px){#globalNavUserRight{margin-left:8px;}#globalNavSearchAfterLogo{margin-left:6px;}#globalSearchPanel{top:74px;}#nordluxeCookieNotice{left:10px;right:10px;bottom:10px;padding:12px;flex-direction:column;}#nordluxeCookieNoticeActions{width:100%;justify-content:flex-end;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function instagramIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5zm8.93 1.35a1.17 1.17 0 1 1 0 2.34 1.17 1.17 0 0 1 0-2.34zM12 6.85A5.15 5.15 0 1 1 6.85 12 5.16 5.16 0 0 1 12 6.85zm0 1.8A3.35 3.35 0 1 0 15.35 12 3.36 3.36 0 0 0 12 8.65z"/></svg>';
  }

  function tiktokIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14.69 3c.18 1.45.99 2.82 2.18 3.66a5.5 5.5 0 0 0 3.08 1v2.72a8.14 8.14 0 0 1-3.93-1.06v6.23a5.56 5.56 0 1 1-5.57-5.55c.31 0 .61.03.9.08v2.81a2.91 2.91 0 0 0-.9-.14 2.79 2.79 0 1 0 2.79 2.8V3h1.45z"/></svg>';
  }

  function whatsappIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.5 2 2 6.39 2 11.81c0 1.74.47 3.44 1.37 4.94L2 22l5.44-1.41a10.15 10.15 0 0 0 4.6 1.1h.01c5.54 0 10.05-4.39 10.05-9.81C22.09 6.39 17.58 2 12.04 2zm5.86 13.92c-.25.69-1.47 1.31-2.03 1.4-.52.08-1.18.12-1.9-.1-.44-.13-1-.32-1.72-.62-3.02-1.28-4.99-4.25-5.14-4.45-.14-.19-1.23-1.6-1.23-3.05 0-1.45.78-2.16 1.05-2.46.27-.3.59-.38.79-.38.2 0 .4 0 .58.01.18.01.42-.07.66.47.25.56.84 1.93.91 2.07.07.14.12.31.02.5-.1.19-.15.31-.3.48-.15.17-.31.38-.44.5-.15.15-.3.31-.13.61.17.29.76 1.23 1.63 2 1.13.99 2.08 1.3 2.37 1.45.29.15.46.12.63-.07.17-.19.74-.84.94-1.13.2-.29.39-.24.66-.15.27.09 1.71.79 2 0.93.29.14.48.21.55.33.07.12.07.72-.18 1.41z"/></svg>';
  }

  function ensureInstagramLinks() {
    document.querySelectorAll('a').forEach(function (link) {
      if (!link) return;

      var href = String(link.getAttribute('href') || '').trim();
      var text = String(link.textContent || '').trim().toLowerCase();
      var isInstagramLink = href === '#' || href.indexOf('instagram.com') !== -1 || text.indexOf('instagram') !== -1 || text.indexOf('@nord.luxe01') !== -1 || text.indexOf('@nordluxe') !== -1;

      if (!isInstagramLink) return;

      link.href = INSTAGRAM_URL;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      var inFooter = !!link.closest('footer');
      if (inFooter) {
        link.classList.add('footer-instagram-link');
        link.setAttribute('aria-label', 'Visit NORDLUXE on Instagram');
        link.innerHTML = instagramIconSvg();

        var footerParent = link.parentElement;
        if (footerParent) {
          footerParent.classList.add('footer-social-links');
          if (!footerParent.querySelector('[data-nordluxe-tiktok-link]')) {
            var tiktokLink = document.createElement('a');
            tiktokLink.href = TIKTOK_URL;
            tiktokLink.target = '_blank';
            tiktokLink.rel = 'noopener noreferrer';
            tiktokLink.className = 'footer-tiktok-link';
            tiktokLink.setAttribute('aria-label', 'Visit NORDLUXE on TikTok');
            tiktokLink.setAttribute('data-nordluxe-tiktok-link', 'true');
            tiktokLink.innerHTML = tiktokIconSvg();
            footerParent.appendChild(tiktokLink);
          }
          if (!footerParent.querySelector('[data-nordluxe-whatsapp-link]')) {
            var whatsappLink = document.createElement('a');
            whatsappLink.href = WHATSAPP_URL;
            whatsappLink.target = '_blank';
            whatsappLink.rel = 'noopener noreferrer';
            whatsappLink.className = 'footer-whatsapp-link';
            whatsappLink.setAttribute('aria-label', 'Contact NORDLUXE on WhatsApp');
            whatsappLink.setAttribute('data-nordluxe-whatsapp-link', 'true');
            whatsappLink.innerHTML = whatsappIconSvg();
            footerParent.appendChild(whatsappLink);
          }
        }
      }
    });
  }

  function ensureTikTokLinks() {
    document.querySelectorAll('a').forEach(function (link) {
      if (!link) return;

      var href = String(link.getAttribute('href') || '').trim().toLowerCase();
      var text = String(link.textContent || '').trim().toLowerCase();
      var isTikTokLink = href.indexOf('tiktok.com') !== -1 || text.indexOf('tiktok') !== -1 || text.indexOf('@nordluxe2') !== -1;

      if (!isTikTokLink) return;

      link.href = TIKTOK_URL;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  function ensureWhatsAppLinks() {
    document.querySelectorAll('a').forEach(function (link) {
      if (!link) return;

      var href = String(link.getAttribute('href') || '').trim().toLowerCase();
      var text = String(link.textContent || '').trim().toLowerCase();
      var isWhatsAppLink = href.indexOf('wa.me') !== -1 || href.indexOf('whatsapp') !== -1 || text.indexOf('whatsapp') !== -1 || text.indexOf('701 729 8740') !== -1;

      if (!isWhatsAppLink) return;

      link.href = WHATSAPP_URL;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  function ensureFooterPolicyLink() {
    var footer = document.querySelector('footer');
    if (!footer) return;
    if (footer.querySelector('[data-nordluxe-policies-links]')) return;

    var policiesContainer = document.createElement('div');
    policiesContainer.setAttribute('data-nordluxe-policies-links', 'true');
    policiesContainer.style.marginTop = '16px';
    policiesContainer.style.paddingTop = '12px';
    policiesContainer.style.borderTop = '1px solid rgba(209, 155, 72, 0.2)';
    policiesContainer.style.fontSize = '13px';

    var policies = [
      { href: 'payment-policy.html', text: 'Payment Policy' },
      { href: 'preorder-policy.html', text: 'Pre-Order Policy' },
      { href: 'refund-policy.html', text: 'Refund Policy' },
      { href: 'shipping-policy.html', text: 'Shipping Policy' },
      { href: 'cookie-policy.html', text: 'Cookie Policy' }
    ];

    policies.forEach(function(policy, index) {
      if (index > 0) {
        policiesContainer.appendChild(document.createTextNode(' • '));
      }
      var a = document.createElement('a');
      a.href = policy.href;
      a.textContent = policy.text;
      a.style.color = '#d19b48';
      a.style.textDecoration = 'none';
      a.style.marginRight = '6px';
      a.style.marginLeft = '6px';
      a.setAttribute('data-nordluxe-policy-link', policy.href);
      a.addEventListener('mouseover', function() {
        this.style.textDecoration = 'underline';
      });
      a.addEventListener('mouseout', function() {
        this.style.textDecoration = 'none';
      });
      policiesContainer.appendChild(a);
    });

    footer.appendChild(policiesContainer);
  }

  function closeCookieNotice() {
    var banner = document.getElementById('nordluxeCookieNotice');
    if (!banner) return;
    banner.classList.remove('open');
  }

  function showCookieNotice() {
    if (localStorage.getItem(COOKIE_NOTICE_KEY) === 'true') return;

    var banner = document.getElementById('nordluxeCookieNotice');
    if (!banner) {
      banner = document.createElement('aside');
      banner.id = 'nordluxeCookieNotice';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-live', 'polite');
      banner.innerHTML = [
        '<p>NORDLUXE uses essential session and storage technologies to keep login, cart, and core site features working. We currently do not run marketing trackers. Read details in our <a href="cookie-policy.html">Cookie Policy</a>.</p>',
        '<div id="nordluxeCookieNoticeActions">',
        '<a id="nordluxeCookieNoticeRead" href="cookie-policy.html">Read Policy</a>',
        '<button type="button" id="nordluxeCookieNoticeAccept">Got It</button>',
        '</div>'
      ].join('');
      document.body.appendChild(banner);

      var acceptBtn = document.getElementById('nordluxeCookieNoticeAccept');
      if (acceptBtn) {
        acceptBtn.addEventListener('click', function () {
          localStorage.setItem(COOKIE_NOTICE_KEY, 'true');
          closeCookieNotice();
        });
      }
    }

    banner.classList.add('open');
  }

  function searchProducts(term) {
    var q = String(term || '').trim().toLowerCase();
    if (!q) return [];

    var tokens = q.split(/\s+/).filter(function (t) { return t.length >= 1; });

    return PRODUCT_INDEX
      .map(function (item) {
        if (item.category === 'Page') {
          return { item: item, score: 0 };
        }

        var haystack = (item.title + ' ' + item.category + ' ' + item.keywords).toLowerCase();
        var titleLower = item.title.toLowerCase();
        var score = 0;

        // Exact title match
        if (titleLower === q) score += 20;
        // Title starts with query
        if (titleLower.indexOf(q) === 0) score += 12;
        // Title contains full query
        if (titleLower.indexOf(q) !== -1) score += 8;
        // Entire haystack contains full query
        if (haystack.indexOf(q) !== -1) score += 4;

        // Per-token scoring (partial word matching)
        tokens.forEach(function (token) {
          if (titleLower.indexOf(token) !== -1) score += 6;
          else if (haystack.indexOf(token) !== -1) score += 2;
        });

        return { item: item, score: score };
      })
      .filter(function (entry) { return entry.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 8)
      .map(function (entry) { return entry.item; });
  }

  function parsePriceValue(value) {
    var num = parseFloat(String(value || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(num) ? num : NaN;
  }

  function formatPriceValue(value) {
    return '₦' + Math.round(value).toLocaleString('en-US');
  }

  function getHigherDisplayPrice(currentDisplayPrice) {
    var current = parsePriceValue(currentDisplayPrice);
    if (!Number.isFinite(current)) return '';

    var higher = Math.ceil((current * 1.25) / 10) * 10;
    if (higher <= current) {
      higher = current + Math.max(10, Math.round(current * 0.1));
    }

    return formatPriceValue(higher);
  }

  function renderDualPriceHtml(currentDisplayPrice) {
    if (!currentDisplayPrice) return '';
    var higherDisplayPrice = getHigherDisplayPrice(currentDisplayPrice);
    if (!higherDisplayPrice) {
      return '<span class="nordluxe-current-price">' + currentDisplayPrice + '</span>';
    }

    return '<span class="nordluxe-old-price">' + higherDisplayPrice + '</span><span class="nordluxe-current-price">' + currentDisplayPrice + '</span>';
  }

  function applyDualPriceToElement(el) {
    if (!el) return;

    var currentDisplayPrice = (el.dataset && el.dataset.currentPrice)
      ? String(el.dataset.currentPrice).trim()
      : String(el.textContent || '').trim();

    if (!currentDisplayPrice || currentDisplayPrice.indexOf('$') === -1) return;

    if (el.dataset) {
      el.dataset.currentPrice = currentDisplayPrice;
    }

    el.classList.add('nordluxe-dual-price');
    el.innerHTML = renderDualPriceHtml(currentDisplayPrice);
  }

  function applyDualPrices(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.price, .product-price, .similar-price').forEach(applyDualPriceToElement);
  }

  function observeDualPriceTargets() {
    if (window.__nordluxeDualPriceObserver || !window.MutationObserver || !document.body) return;

    var selector = '.price, .product-price, .similar-price';
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'characterData') {
          var parent = mutation.target && mutation.target.parentElement;
          if (parent && parent.matches && parent.matches(selector)) {
            applyDualPriceToElement(parent);
          }
          return;
        }

        mutation.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches(selector)) {
            applyDualPriceToElement(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll(selector).forEach(applyDualPriceToElement);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__nordluxeDualPriceObserver = observer;
  }

  function renderSearchResults(term) {
    var resultsWrap = document.getElementById('globalSearchResults');
    if (!resultsWrap) return;

    var q = String(term || '').trim();
    if (!q) {
      resultsWrap.innerHTML = '<div class="global-search-empty">Search by product name or properties, e.g. "arctic boots", "wool", "parka".</div>';
      return;
    }

    var results = searchProducts(term);
    if (!results.length) {
      resultsWrap.innerHTML = '<div class="global-search-empty">No matching products for \u201c' + q + '\u201d. Try a name like <em>parka</em>, <em>boots</em> or <em>wool</em>.</div>';
      return;
    }

    var countLabel = '<div class="global-search-results-count">' + results.length + ' result' + (results.length === 1 ? '' : 's') + ' found</div>';

    resultsWrap.innerHTML = countLabel + results.map(function (item) {
      var thumb = item.image
        ? '<div class="global-search-thumb"><img src="' + item.image + '" alt="' + item.title + '" /></div>'
        : '<div class="global-search-thumb global-search-thumb-empty"></div>';
      var categoryBadge = item.category && item.category !== 'Page'
        ? '<span class="global-search-badge">' + item.category + '</span>'
        : '';
      var priceLabel = item.price
        ? (item.originalPrice
          ? '<span class="global-search-price-group"><span class="global-search-price-old">' + item.originalPrice + '</span><span class="global-search-price">' + item.price + '</span></span>'
          : '<span class="global-search-price">' + item.price + '</span>')
        : '';
      return '<a class="global-search-item" href="' + item.url + '">' + thumb + '<div class="global-search-item-body"><div class="global-search-item-title">' + item.title + '</div><div class="global-search-item-meta">' + categoryBadge + priceLabel + '</div></div></a>';
    }).join('');
  }

  function closeSearch() {
    var panel = document.getElementById('globalSearchPanel');
    var backdrop = document.getElementById('globalSearchBackdrop');
    if (panel) panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  function openSearch() {
    var panel = document.getElementById('globalSearchPanel');
    var backdrop = document.getElementById('globalSearchBackdrop');
    var input = document.getElementById('globalSearchInput');
    if (panel) panel.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    renderSearchResults('');
    if (input) input.focus();
  }

  function closeMenu() {
    var menu = document.getElementById('globalHamburgerMenu');
    var backdrop = document.getElementById('globalHamburgerBackdrop');
    if (menu) menu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  function openMenu() {
    var menu = document.getElementById('globalHamburgerMenu');
    var backdrop = document.getElementById('globalHamburgerBackdrop');
    if (menu) menu.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
  }

  async function doLogout() {
    try {
      if (window.firebaseSignOut && window.firebaseAuth) {
        await window.firebaseSignOut(window.firebaseAuth);
      }
    } catch (e) {
      console.error('Sign out error:', e);
    }

    endLiveSession('logout');
    localStorage.removeItem('nordluxeLoggedIn');
    localStorage.removeItem('nordluxeUser');
    closeMenu();
    window.location.href = 'login.html';
  }

  function renderMenu(menu) {
    var loggedIn = isSignedIn();
    var links = [
      '<h3>Menu</h3>',
      '<a href="index.html">Home</a>',
      '<a href="collections.html">Collection</a>',
      '<a href="about.html">About</a>',
      '<a href="contact.html">Contact</a>',
      '<a href="story.html">Story</a>',
      '<a href="cart.html">Cart</a>'
    ];

    if (loggedIn) {
      links.push('<a href="profile.html">My Profile</a>');
      links.push('<button type="button" id="globalLogoutAction" class="danger">Logout</button>');
    } else {
      links.push('<a href="login.html">Login / Signup</a>');
    }

    menu.innerHTML = links.join('');

    var logoutBtn = document.getElementById('globalLogoutAction');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', doLogout);
    }
  }

  function renderControls(leftControls, rightControls) {
    var display = userDisplay();
    var iconHtml = display.photo
      ? '<img src="' + display.photo + '" alt="User" />'
      : '👤';

    leftControls.innerHTML = '<button type="button" id="globalHamburgerBtn" class="nav-control-btn" aria-label="Open menu">☰</button>';
    rightControls.innerHTML = '<button type="button" id="globalUserBtn" class="nav-control-btn" aria-label="User account">' + iconHtml + '</button>';

    var hb = document.getElementById('globalHamburgerBtn');
    var userBtn = document.getElementById('globalUserBtn');
    if (hb) hb.addEventListener('click', openMenu);
    if (userBtn) {
      userBtn.addEventListener('click', function () {
        window.location.href = 'profile.html';
      });
    }
  }

  function renderSearchControl(nav) {
    var searchWrap = document.getElementById('globalNavSearchAfterLogo');
    var logo = nav.querySelector('.logo');
    var host = logo && logo.parentNode ? logo.parentNode : nav;

    if (!searchWrap) {
      searchWrap = document.createElement('div');
      searchWrap.id = 'globalNavSearchAfterLogo';
      if (logo && logo.nextSibling) {
        host.insertBefore(searchWrap, logo.nextSibling);
      } else {
        host.appendChild(searchWrap);
      }
    }

    searchWrap.innerHTML = '<button type="button" id="globalSearchBtn" aria-label="Search products"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.9 14.5h-.74l-.26-.25a6.47 6.47 0 10-.7.7l.25.26v.74L20 21.5 21.5 20l-5.6-5.5zM10.5 15a4.5 4.5 0 110-9 4.5 4.5 0 010 9z"/></svg></button>';

    var searchBackdrop = document.getElementById('globalSearchBackdrop');
    if (!searchBackdrop) {
      searchBackdrop = document.createElement('div');
      searchBackdrop.id = 'globalSearchBackdrop';
      searchBackdrop.addEventListener('click', closeSearch);
      document.body.appendChild(searchBackdrop);
    }

    var searchPanel = document.getElementById('globalSearchPanel');
    if (!searchPanel) {
      searchPanel = document.createElement('div');
      searchPanel.id = 'globalSearchPanel';
      searchPanel.innerHTML = [
        '<div id="globalSearchTopline">NORDLUXE Product Search</div>',
        '<div id="globalSearchPanelHeader">',
        '<input type="search" id="globalSearchInput" placeholder="Search products like parka, boots, sweater..." />',
        '<button type="button" id="globalSearchSubmit">Search</button>',
        '</div>',
        '<div id="globalSearchResults"></div>'
      ].join('');
      document.body.appendChild(searchPanel);
    }

    var openBtn = document.getElementById('globalSearchBtn');
    var input = document.getElementById('globalSearchInput');
    var submit = document.getElementById('globalSearchSubmit');

    if (openBtn) {
      openBtn.addEventListener('click', openSearch);
    }

    if (submit) {
      submit.addEventListener('click', function () {
        var term = input ? input.value : '';
        pushSearch(term, 'nav-search');
        renderSearchResults(term);
      });
    }

    if (input) {
      input.addEventListener('input', function () {
        renderSearchResults(input.value);
      });

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          var term = input.value;
          pushSearch(term, 'nav-search-enter');
          renderSearchResults(term);
        }
        if (event.key === 'Escape') {
          closeSearch();
        }
      });
    }
  }

  function init() {
    // Keep analytics/live tracking active on all pages, even those without nav markup.
    bootLiveTrackingOnce();

    var nav = document.querySelector('nav');
    if (!nav) return;

    ensureStyle();

    nav.querySelectorAll('.user-menu,.user-dropdown').forEach(function (el) {
      el.style.display = 'none';
    });

    var quickLogoutBtn = document.getElementById('quickLogoutBtn');
    if (quickLogoutBtn) quickLogoutBtn.style.display = 'none';

    var existingStatus = document.getElementById('userStatus');
    if (existingStatus) existingStatus.style.display = 'none';

    var leftControls = document.getElementById('globalNavHamburgerLeft');
    if (!leftControls) {
      leftControls = document.createElement('div');
      leftControls.id = 'globalNavHamburgerLeft';
      var logo = nav.querySelector('.logo');
      if (logo && logo.parentNode) {
        logo.parentNode.insertBefore(leftControls, logo);
      } else {
        nav.insertBefore(leftControls, nav.firstChild);
      }
    }

    var rightControls = document.getElementById('globalNavUserRight');
    if (!rightControls) {
      rightControls = document.createElement('div');
      rightControls.id = 'globalNavUserRight';
      var navLinks = nav.querySelector('.nav-links');
      if (navLinks) {
        navLinks.appendChild(rightControls);
      } else {
        nav.appendChild(rightControls);
      }
    }

    renderControls(leftControls, rightControls);
    renderSearchControl(nav);
    ensureInstagramLinks();
    ensureTikTokLinks();
    ensureWhatsAppLinks();
    ensureFooterPolicyLink();
    showCookieNotice();

    var backdrop = document.getElementById('globalHamburgerBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'globalHamburgerBackdrop';
      backdrop.addEventListener('click', closeMenu);
      document.body.appendChild(backdrop);
    }

    var menu = document.getElementById('globalHamburgerMenu');
    if (!menu) {
      menu = document.createElement('aside');
      menu.id = 'globalHamburgerMenu';
      document.body.appendChild(menu);
    }

    renderMenu(menu);

    applyDualPrices(document);
    observeDualPriceTargets();

    window.addEventListener('storage', function () {
      renderControls(leftControls, rightControls);
      renderMenu(menu);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeSearch();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();