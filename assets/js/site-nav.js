(function () {
  var ACTIVITY_KEY = 'nordluxeActivityLog';
  var SEARCH_KEY = 'nordluxeSearchHistory';
  var PRODUCT_INDEX = [
    { title: 'Nordic Parka', category: 'Outerwear', price: '$890', keywords: 'parka jacket winter nordic down fur waterproof warm hood outerwear coat', url: 'product.html?id=nordic-parka', image: 'ChatGPT%20Image%20Feb%201%2C%202026%2C%2003_15_39%20PM.png' },
    { title: 'Heritage Sweater', category: 'Tops & Shirts', price: '$450', keywords: 'sweater knit heritage wool merino cable nordic pattern top shirt', url: 'product.html?id=heritage-sweater', image: 'ChatGPT%20Image%20Feb%201%2C%202026%2C%2003_16_33%20PM.png' },
    { title: 'Arctic Boots', category: 'Accessories', price: '$620', keywords: 'boots arctic winter footwear leather sole insulated waterproof shoes', url: 'product.html?id=arctic-boots', image: 'ChatGPT%20Image%20Feb%201%2C%202026%2C%2003_19_23%20PM.png' },
    { title: 'Wool Scarf', category: 'Accessories', price: '$180', keywords: 'scarf wool accessory neck warm winter woven norwegian', url: 'product.html?id=wool-scarf', image: 'ChatGPT%20Image%20Feb%201%2C%202026%2C%2003_19_35%20PM.png' },
    { title: 'Minimalist Coat', category: 'Outerwear', price: '$980', keywords: 'coat minimalist outerwear cashmere clean line danish repellent', url: 'product.html?id=minimalist-coat', image: 'https://images.unsplash.com/photo-1548883354-94bcfe321cbb?w=120&q=80' },
    { title: 'Nordluxe Hoodie', category: 'Tops & Shirts', price: '$390', keywords: 'hoodie streetwear casual cotton comfort pullover top shirt', url: 'product.html?id=nordluxe-hoodie', image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=120&q=80' },
    { title: 'Premium Trousers', category: 'Bottoms', price: '$450', keywords: 'trousers pants tailored wool blend bottom formal slim', url: 'product.html?id=premium-trousers', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=120&q=80' },
    { title: 'Collections', category: 'Page', price: '', keywords: 'catalog products collection browse all', url: 'collections.html', image: '' },
    { title: 'About', category: 'Page', price: '', keywords: 'brand story company nordluxe who we are', url: 'about.html', image: '' }
  ];

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('nordluxeUser') || '{}');
    } catch (e) {
      return {};
    }
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
    var items = readList(ACTIVITY_KEY);
    var normalized = Object.assign({ at: new Date().toISOString() }, activity || {});
    items.unshift(normalized);
    writeList(ACTIVITY_KEY, items, 120);
  }

  function pushSearch(term, source) {
    if (!term) return;
    var cleaned = String(term).trim();
    if (!cleaned) return;

    var searches = readList(SEARCH_KEY);
    searches.unshift({ term: cleaned, source: source || 'site', at: new Date().toISOString() });
    writeList(SEARCH_KEY, searches, 80);
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
    window.Storage.prototype.setItem = function (key, value) {
      var oldCart = null;
      if (key === 'nordluxeCart') {
        try {
          oldCart = JSON.parse(localStorage.getItem('nordluxeCart') || '[]');
        } catch (e) {
          oldCart = [];
        }
      }

      nativeSetItem.apply(this, arguments);

      if (key === 'nordluxeCart') {
        try {
          var newCart = JSON.parse(localStorage.getItem('nordluxeCart') || '[]');
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

    window.__nordluxeStorageTrackingPatched = true;
  }

  function ensureStyle() {
    if (document.getElementById('global-nav-style')) return;

    var style = document.createElement('style');
    style.id = 'global-nav-style';
    style.textContent = [
      '#globalNavHamburgerLeft{display:flex;align-items:center;z-index:1500;margin-right:10px;}',
      '#globalNavSearchAfterLogo{display:flex;align-items:center;margin-left:10px;z-index:1500;}',
      '#globalNavUserRight{position:absolute;right:16px;top:50%;transform:translateY(-50%);display:flex;align-items:center;z-index:1500;}',
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
      '.global-search-price{color:#f0c879;font-weight:700;font-size:13px;}',
      '.global-search-empty{padding:16px;color:#c2ab80;font-size:13px;line-height:1.5;background:linear-gradient(160deg,rgba(20,18,16,.95),rgba(14,14,17,.95));border:1px dashed rgba(225,181,93,.45);border-radius:10px;}',
      '.global-search-results-count{padding:8px 14px 0;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#7f6838;}',
      '#globalHamburgerMenu{position:fixed;top:0;right:-320px;width:300px;max-width:85vw;height:100vh;background:#111;color:#f4f4f4;z-index:3000;transition:right .25s ease;padding:20px;box-shadow:-6px 0 20px rgba(0,0,0,.35);overflow-y:auto;}',
      '#globalHamburgerMenu.open{right:0;}',
      '#globalHamburgerBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2999;display:none;}',
      '#globalHamburgerBackdrop.open{display:block;}',
      '#globalHamburgerMenu h3{margin:8px 0 18px 0;color:#ffd700;font-size:16px;letter-spacing:.5px;}',
      '#globalHamburgerMenu a,#globalHamburgerMenu button{display:block;width:100%;text-align:left;margin:8px 0;padding:10px 12px;border-radius:8px;border:1px solid #2b2b2b;background:#1a1a1a;color:#eee;text-decoration:none;cursor:pointer;font-size:14px;}',
      '#globalHamburgerMenu a:hover,#globalHamburgerMenu button:hover{background:#222;border-color:#d19b48;color:#ffd700;}',
      '#globalHamburgerMenu .danger{border-color:#7a2c2c;color:#ffb3b3;}',
      '#globalHamburgerMenu .danger:hover{border-color:#ff6b6b;color:#fff;}',
      'nav{position:relative;}',
      '@media (max-width:768px){#globalNavUserRight{right:10px;}#globalNavSearchAfterLogo{margin-left:6px;}#globalSearchPanel{top:74px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function searchProducts(term) {
    var q = String(term || '').trim().toLowerCase();
    if (!q || q.length < 2) return [];

    var tokens = q.split(/\s+/).filter(function (t) { return t.length >= 2; });

    return PRODUCT_INDEX
      .map(function (item) {
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

  function renderSearchResults(term) {
    var resultsWrap = document.getElementById('globalSearchResults');
    if (!resultsWrap) return;

    var q = String(term || '').trim();
    if (!q || q.length < 2) {
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
      var priceLabel = item.price ? '<span class="global-search-price">' + item.price + '</span>' : '';
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
      nav.appendChild(rightControls);
    }

    renderControls(leftControls, rightControls);
    renderSearchControl(nav);

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

    patchLocalStorageTracking();
    trackCurrentPage();
    trackSearchInputs();

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