// ============================================
// SCROLL RESTORATION
// Prevent browser from restoring scroll position on reload
// ============================================
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// ============================================
// DOM REFERENCES
// ============================================
const year = document.querySelector('#year');
const mediaOpeners = document.querySelectorAll('[data-lightbox-src]');
const imageModal = document.querySelector('#image-modal');
const modalImage = imageModal ? imageModal.querySelector('img') : null;
const modalClose = imageModal ? imageModal.querySelector('.modal-close') : null;
const navToggle = document.querySelector('#nav-toggle');
const navMenu = document.querySelector('#nav-menu');
const navLinks = document.querySelectorAll('.nav-link');
const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
const menuBtn = document.querySelector('#menu-btn');
const menuPanel = document.querySelector('#menu-panel');
const menuClose = document.querySelector('#menu-close');
const menuItems = document.querySelectorAll('.menu-item');
let navItems = Array.from(document.querySelectorAll('[data-nav]'));

// ============================================
// UTILITIES
// ============================================
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// VIDEO CATEGORIES — TXT File System
// ============================================

const CATEGORIES = [
  { slug: 'ugc',      label: 'UGC',       txt: 'ugc.txt',      route: 'ugc',         icon: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>' },
  { slug: 'shoting',  label: 'Shooting',  txt: 'shooting.txt', route: 'shooting',    icon: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>' },
  { slug: 'stores',   label: 'Stores',    txt: 'stores.txt',   route: 'stores',      icon: '<path d="M3 9l1-5h16l1 5"></path><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"></path><path d="M9 21v-6h6v6"></path><path d="M3 9h18"></path>' },
  { slug: 'events',   label: 'Events',    txt: 'events.txt',   route: 'events',      icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
  { slug: 'services', label: 'Services',  txt: 'services.txt',  route: 'services',    icon: '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6L12 2z"></path>' },
  { slug: 'gallery',  label: 'Gallery',   txt: 'gallery.txt',  route: 'gallery',     icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>', expanded: true },
  { slug: 'drone',    label: 'Locations', txt: 'drone.txt',     route: 'drone',       icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>' }
];

// Static nav items rendered in the expanded section (no TXT data files)
const EXPANDED_NAV_ITEMS = [
  { label: 'Model',       nav: 'models',      href: '/model',       icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>' },
  { label: 'Media Buyer', nav: 'media-buyer', href: '/media-buyer', icon: '<path d="M3 3v18h18"></path><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>' },
  { label: 'Voice Over',  nav: 'voiceover',   href: '/voice-over',  icon: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>' }
];

// ============================================
// CENTRAL CONFIG — Loaded from data/config.json
// All editable content (titles, descriptions, SEO, etc.) is stored
// in data/config.json. Edit that single file to customize the site.
// ============================================
let siteConfig = null;

async function loadSiteConfig() {
  try {
    const response = await fetch('/data/config.json');
    if (!response.ok) return;
    siteConfig = await response.json();
  } catch {
    siteConfig = null;
  }
}

// Get a config value for a category slug, with fallback
function getConfig(slug, key, fallback) {
  if (!siteConfig || !siteConfig.categories || !siteConfig.categories[slug]) return fallback;
  const val = siteConfig.categories[slug][key];
  return (val !== undefined && val !== '') ? val : fallback;
}

// Build pageMeta from config (replaces hardcoded pageMeta object)
// Fallback values ensure the site works even if config.json hasn't loaded yet.
function buildPageMeta() {
  const meta = {};

  // Static pages — from config or hardcoded fallbacks
  const sp = (siteConfig && siteConfig._static_pages) ? siteConfig._static_pages : {};
  meta['home'] = {
    title: sp.home ? sp.home.seoTitle : DEFAULT_TITLE,
    desc: sp.home ? sp.home.seoDescription : DEFAULT_DESC,
    crumb: sp.home ? sp.home.crumb : 'Home'
  };
  meta['home-portfolio'] = {
    title: (sp['home-portfolio'] && sp['home-portfolio'].seoTitle) || 'Portfolio | Photography Pixel',
    desc: (sp['home-portfolio'] && sp['home-portfolio'].seoDescription) || 'استعرض أحدث أعمالنا الإبداعية: فيديوهات UGC، تصوير، محلات تجارية، أعراس وخدمات احترافية في أيت ملول - أكادير.',
    crumb: (sp['home-portfolio'] && sp['home-portfolio'].crumb) || 'Portfolio'
  };
  meta['home-contact'] = {
    title: (sp['home-contact'] && sp['home-contact'].seoTitle) || 'Contact | Photography Pixel',
    desc: (sp['home-contact'] && sp['home-contact'].seoDescription) || 'تواصل مع وكالة Photography Pixel لخدمات التصوير والتسويق الرقمي في أيت ملول - أكادير. واتساب، إنستغرام، بريد إلكتروني.',
    crumb: (sp['home-contact'] && sp['home-contact'].crumb) || 'Contact'
  };
  meta['equipment'] = {
    title: (sp.equipment && sp.equipment.seoTitle) || 'Equipment | Photography Pixel',
    desc: (sp.equipment && sp.equipment.seoDescription) || 'تعرف على معدات الاستوديو الاحترافية المستخدمة في وكالة Photography Pixel.',
    crumb: (sp.equipment && sp.equipment.crumb) || 'Equipment'
  };

  // Category pages (cat-{slug})
  CATEGORIES.forEach(cat => {
    const pageKey = 'cat-' + cat.slug;
    meta[pageKey] = {
      title: getConfig(cat.slug, 'seoTitle', cat.label + ' | Photography Pixel'),
      desc: getConfig(cat.slug, 'seoDescription', ''),
      crumb: getConfig(cat.slug, 'label', cat.label)
    };
  });

  // Expanded nav items (models, media-buyer, voiceover)
  EXPANDED_NAV_ITEMS.forEach(item => {
    meta[item.nav] = {
      title: getConfig(item.nav, 'seoTitle', item.label + ' | Photography Pixel'),
      desc: getConfig(item.nav, 'seoDescription', ''),
      crumb: getConfig(item.nav, 'label', item.label)
    };
  });

  return meta;
}

// Apply config values to static HTML pages (models, media-buyer, voiceover)
function applyConfigToStaticPages() {
  if (!siteConfig) return;

  const pageMap = {
    'page-models': 'models',
    'page-media-buyer': 'media-buyer',
    'page-voiceover': 'voiceover',
    'page-equipment': 'equipment'
  };

  for (const [pageId, slug] of Object.entries(pageMap)) {
    const page = document.getElementById(pageId);
    if (!page) continue;
    const catConfig = siteConfig.categories && siteConfig.categories[slug];
    if (!catConfig) continue;

    const heading = page.querySelector('.sub-page-heading');
    if (heading && catConfig.title) heading.textContent = catConfig.title;

    const subtitle = page.querySelector('.sub-page-subtitle');
    if (subtitle && catConfig.subtitle) subtitle.textContent = catConfig.subtitle;
  }
}

// Cache for fetched category URLs — avoids duplicate network requests
// when getSearchIndex() re-reads the same TXT files after loadVideoCategories().
// Stores the in-flight Promise so concurrent callers share one fetch.
const categoryUrlCache = {};

// Fetch a TXT file and return an array of validated, deduplicated URLs
function fetchCategoryUrls(txtFile) {
  if (categoryUrlCache[txtFile]) return categoryUrlCache[txtFile];

  const loadPromise = (async () => {
    try {
      const response = await fetch('/data/' + txtFile);
      if (!response.ok) return [];
      const text = await response.text();

      // Remove UTF-8 BOM if present
      const cleaned = text.replace(/^\uFEFF/, '');

      const seen = new Set();
      const urls = [];

      for (const line of cleaned.split(/\r?\n/)) {
        const url = line.trim();
        if (!url) continue;
        if (isWistiaEntry(url)) {
          if (!isValidWistiaMediaId(getWistiaMediaId(url))) {
            console.warn('[Wistia] Skipping invalid media entry in ' + txtFile + ': ' + url);
            continue;
          }
        } else if (!/^https:\/\//.test(url)) {
          continue;
        }
        if (seen.has(url)) continue;

        seen.add(url);
        urls.push(url);
      }

      return urls;
    } catch {
      return [];
    }
  })();

  categoryUrlCache[txtFile] = loadPromise;
  // Don't cache failures permanently — allow a retry on the next call
  loadPromise.catch(() => { delete categoryUrlCache[txtFile]; });
  return loadPromise;
}

// ============================================
// DETERMINISTIC HOURLY SHUFFLE (UGC only)
// Reorders an array based on the current clock hour so that:
// - The order is stable during the same hour (refresh = same order).
// - The order changes when the hour changes.
// - All visitors during the same hour see the same order.
// - No video is duplicated or lost — every item appears exactly once.
// ============================================
function hourlyShuffle(array) {
  var now = new Date();
  var seed = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + '-' +
    String(now.getHours()).padStart(2, '0');

  // Convert seed string to a 32-bit integer hash
  var hash = 0;
  for (var i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }

  // Mulberry32 — fast deterministic PRNG
  function mulberry32(a) {
    return function() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rng = mulberry32(hash);
  var result = array.slice();

  // Fisher-Yates shuffle
  for (var j = result.length - 1; j > 0; j--) {
    var k = Math.floor(rng() * (j + 1));
    var temp = result[j];
    result[j] = result[k];
    result[k] = temp;
  }

  return result;
}

function isWistiaEntry(value) {
  return /^[^|\s]+\|wistia$/i.test(value);
}

function getWistiaMediaId(value) {
  if (!isWistiaEntry(value)) return null;
  return value.split('|')[0].trim();
}

function isValidWistiaMediaId(mediaId) {
  return typeof mediaId === 'string' && /^[A-Za-z0-9]+$/.test(mediaId);
}

let wistiaPlayerReady = null;
const wistiaMediaReady = new Map();

function loadWistiaPlayer(mediaId) {
  if (!wistiaPlayerReady) {
    wistiaPlayerReady = new Promise((resolve, reject) => {
      if (customElements.get('wistia-player')) {
        resolve();
        return;
      }

      const existing = document.querySelector(
        'script[src="https://fast.wistia.com/player.js"]'
      );

      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => {
          reject(new Error('Could not load https://fast.wistia.com/player.js'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://fast.wistia.com/player.js';
      script.async = true;

      script.onload = resolve;
      script.onerror = () => {
        reject(new Error('Could not load https://fast.wistia.com/player.js'));
      };

      document.head.appendChild(script);
    });

    wistiaPlayerReady.catch(err => {
      console.error('[Wistia] The Aurora player script could not be loaded:', err);
    });
  }

  if (!wistiaMediaReady.has(mediaId)) {
    const promise = wistiaPlayerReady.then(() => {
      return new Promise((resolve, reject) => {
        const src = 'https://fast.wistia.com/embed/' + mediaId + '.js';

        const existing = document.querySelector(
          'script[src="' + src + '"]'
        );

        if (existing) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.type = 'module';

        script.onload = resolve;
        script.onerror = () => {
          reject(new Error('Could not load ' + src));
        };

        document.head.appendChild(script);
      });
    });

    promise.catch(err => {
      console.error('[Wistia] Failed to initialize media "' + mediaId + '":', err);
    });

    wistiaMediaReady.set(mediaId, promise);
  }

  return wistiaMediaReady.get(mediaId);
}

// ============================================
// WISTIA PLAYER HARDENING
// Keeps play / pause / seek fully usable while blocking:
// - fullscreen (button, keyboard shortcut, double click, direct API calls)
// - clicks on the Wistia logo / branding at the bottom of the player
// - any external Wistia navigation coming out of the player
// All guards are scoped strictly to <wistia-player> elements, so the rest
// of the website (and any non-Wistia embed) behaves exactly as before.
// ============================================

var wistiaRestrictionsInstalled = false;
var hardenedWistiaPlayers = new WeakSet();

function isInsideWistiaPlayer(node) {
  try {
    var current = node;
    for (var i = 0; i < 12 && current; i++) {
      if (current.nodeType === 1 && current.localName === 'wistia-player') return true;
      var root = typeof current.getRootNode === 'function' ? current.getRootNode() : null;
      if (root && root !== current && root.host) {
        current = root.host;
        continue;
      }
      current = current.parentNode;
    }
  } catch (err) {
    return false;
  }
  return false;
}

function wistiaEventPath(event) {
  try {
    if (typeof event.composedPath === 'function') {
      var path = event.composedPath();
      if (path && path.length) return path;
    }
  } catch (err) {}
  return [event.target];
}

function wistiaEventInvolvesPlayer(event) {
  var path = wistiaEventPath(event);
  for (var i = 0; i < path.length; i++) {
    var node = path[i];
    if (node && node.nodeType === 1 && node.localName === 'wistia-player') return true;
  }
  return isInsideWistiaPlayer(event.target);
}

// True when the event's real (composed) target path reaches one of the
// restricted areas: any link, the fullscreen control, or the Wistia logo.
function wistiaEventHitsRestrictedTarget(event) {
  var path = wistiaEventPath(event);
  for (var i = 0; i < path.length; i++) {
    var node = path[i];
    if (!node || node.nodeType !== 1) continue;
    if (node.localName === 'a' && (node.getAttribute('href') || node.getAttribute('target'))) return true;
    var label = '';
    try {
      label = (node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title'))) || '';
    } catch (err) {}
    if (label && label.toLowerCase().indexOf('fullscreen') !== -1) return true;
    var cls = typeof node.className === 'string' ? node.className : '';
    if (cls.indexOf('wistia-logo') !== -1) return true;
  }
  return false;
}

function guardRestrictedWistiaEvent(event) {
  try {
    if (!wistiaEventInvolvesPlayer(event)) return;
    if (!wistiaEventHitsRestrictedTarget(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  } catch (err) {}
}

function wistiaFullscreenError() {
  try {
    return new DOMException('Fullscreen is disabled for this player.', 'InvalidStateError');
  } catch (err) {
    var error = new Error('Fullscreen is disabled for this player.');
    error.name = 'InvalidStateError';
    return error;
  }
}

function installWistiaRestrictions() {
  if (wistiaRestrictionsInstalled) return;
  wistiaRestrictionsInstalled = true;

  // --- Fullscreen API: nothing inside a Wistia player may go fullscreen ---
  var elementMethods = [
    'requestFullscreen',
    'webkitRequestFullscreen',
    'webkitEnterFullScreen',
    'msRequestFullscreen',
    'mozRequestFullScreen'
  ];
  var videoMethods = ['webkitEnterFullscreen', 'webkitEnterFullScreen'];
  var targets = [];
  if (typeof Element !== 'undefined') targets.push({ proto: Element.prototype, methods: elementMethods });
  if (typeof HTMLVideoElement !== 'undefined') targets.push({ proto: HTMLVideoElement.prototype, methods: videoMethods });

  targets.forEach(function (target) {
    target.methods.forEach(function (method) {
      var original = target.proto[method];
      if (typeof original !== 'function') return;
      try {
        Object.defineProperty(target.proto, method, {
          configurable: true,
          writable: true,
          value: function () {
            if (isInsideWistiaPlayer(this)) {
              var rejection = Promise.reject(wistiaFullscreenError());
              rejection.catch(function () {});
              return rejection;
            }
            return original.apply(this, arguments);
          }
        });
      } catch (err) {}
    });
  });

  // --- Restricted clicks (Wistia logo, links, fullscreen button) ---
  ['click', 'auxclick', 'contextmenu', 'dragstart'].forEach(function (type) {
    window.addEventListener(type, guardRestrictedWistiaEvent, true);
  });

  // Double click inside the player would otherwise toggle fullscreen
  window.addEventListener('dblclick', function (event) {
    try {
      if (!wistiaEventInvolvesPlayer(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    } catch (err) {}
  }, true);

  // "f" fullscreen shortcut, only while the focus is inside the player
  window.addEventListener('keydown', function (event) {
    try {
      if (!wistiaEventInvolvesPlayer(event)) return;
      if (String(event.key || '').toLowerCase() !== 'f') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    } catch (err) {}
  }, true);
}

function hardenWistiaPlayer(host) {
  if (!host || host.nodeType !== 1 || host.localName !== 'wistia-player') return;
  if (hardenedWistiaPlayers.has(host)) return;
  hardenedWistiaPlayers.add(host);
  installWistiaRestrictions();
}

// Lazy Wistia mounting. The <wistia-player> element is only inserted into the
// DOM once its card is close to the viewport, so off-screen cards do not
// download the player bundle, the per-media module or the poster image.
// Once mounted the card behaves exactly like a normal Wistia card.
var WISTIA_LAZY_ROOT_MARGIN = '600px';
var wistiaLazyObserver = null;

function mountWistiaSlot(slot) {
  if (!slot || slot.getAttribute('data-wistia-mounted') === '1') return;
  var mediaId = slot.getAttribute('data-wistia-media-id');
  if (!isValidWistiaMediaId(mediaId)) return;
  slot.setAttribute('data-wistia-mounted', '1');
  slot.innerHTML =
    '<wistia-player media-id="' + mediaId + '" aspect="0.5625" ' +
    'style="display:block;width:100%;height:100%;"></wistia-player>';
  hardenWistiaPlayer(slot.firstChild);
  loadWistiaPlayer(mediaId);
}

function observeWistiaSlot(slot) {
  if (!slot) return;
  if (typeof IntersectionObserver === 'undefined') {
    mountWistiaSlot(slot);
    return;
  }
  if (!wistiaLazyObserver) {
    wistiaLazyObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        mountWistiaSlot(entry.target);
      });
    }, { root: null, rootMargin: WISTIA_LAZY_ROOT_MARGIN, threshold: 0 });
  }
  wistiaLazyObserver.observe(slot);
}

function createReelCard(value) {
  var card = document.createElement('article');
  card.className = 'reel-card';

  if (isWistiaEntry(value)) {
    var mediaId = getWistiaMediaId(value);
    var validMediaId = isValidWistiaMediaId(mediaId);

    if (!validMediaId) {
      console.error('[Wistia] Invalid media ID in video list: "' + value + '"');
    }

    card.innerHTML =
      '<div style="width:100%;aspect-ratio:9/16;position:relative;z-index:1;background:#000;overflow:hidden;border-radius:inherit;">' +
        (validMediaId
          ? '<div class="wistia-lazy-slot" data-wistia-media-id="' + mediaId + '" style="display:block;width:100%;height:100%;"></div>' +
            '<div class="wistia-branding-guard" aria-hidden="true"></div>'
          : '') +
      '</div>';

    if (validMediaId) {
      observeWistiaSlot(card.querySelector('.wistia-lazy-slot'));
    }

    return card;
  }

  card.innerHTML =
    '<div style="width:100%;aspect-ratio:9/16;position:relative;z-index:1;background:#000;overflow:hidden;border-radius:inherit;">' +
      '<iframe src="' + value + '" ' +
        'style="position:absolute;left:0;top:0;width:100%;height:100%;border:0;" ' +
        'frameborder="0" allow="autoplay; encrypted-media" loading="lazy"></iframe>' +
      '<div class="reel-card-fullscreen-guard" aria-hidden="true"></div>' +
    '</div>';

  return card;
}

function renderVideoCards(urls, containerId, slug, limit) {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  const list = limit ? urls.slice(0, limit) : urls;
  const fragment = document.createDocumentFragment();

  list.forEach(url => {
    const card = createReelCard(url);
    fragment.appendChild(card);

    card.classList.add('reveal-scale');
    const delay = Math.min(Math.floor(fragment.children.length / 3), 5);
    card.classList.add('reveal-delay-' + (delay + 1));
    revealObserver.observe(card);
  });

  grid.innerHTML = '';
  grid.appendChild(fragment);

  forceActivateRevealCards(grid);
}

// Force-activate reveal cards already in viewport (iOS Safari fix)
function forceActivateRevealCards(grid) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      grid.querySelectorAll('.reveal-scale:not(.active), .reveal:not(.active), .reveal-fade:not(.active)').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < vh && rect.bottom > 0) {
          el.classList.add('active');
        }
      });
    });
  });
}

function ensureCategoryContainers() {
  if (CATEGORIES.length === 0) return;

  const servicesNavMain = document.getElementById('services-nav-main');
  const servicesNavExpanded = document.getElementById('services-nav-expanded');
  const portfolioShell = document.querySelector('.portfolio-shell');
  const mainEl = document.querySelector('main.page');
  if (!portfolioShell) return;

  function createCircleElement(label, nav, href, icon) {
    const circle = document.createElement('a');
    circle.href = href;
    circle.className = 'service-circle';
    circle.setAttribute('data-nav', nav);
    circle.innerHTML =
      '<div class="service-circle-icon">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          icon +
        '</svg>' +
      '</div>' +
      '<span class="service-circle-label">' + label + '</span>';
    return circle;
  }

  CATEGORIES.forEach(cat => {
    const slug = cat.slug;

    // Featured preview block on homepage
    if (!document.getElementById('home-grid-' + slug)) {
      const preview = document.createElement('div');
      preview.className = 'featured-preview';
      preview.innerHTML =
        '<h3 class="featured-preview-title">' + getConfig(slug, 'title', cat.label) + '</h3>' +
        '<div class="video-grid active" data-panel="' + slug + '" id="home-grid-' + slug + '"></div>' +
        '<a href="/' + cat.route + '" class="view-all-btn" data-nav="cat-' + slug + '">' + getConfig(slug, 'buttonLabel', 'عرض المزيد') + '</a>';
      portfolioShell.appendChild(preview);
    }

    // Service circle in nav — main or expanded section
    const navTarget = cat.expanded ? servicesNavExpanded : servicesNavMain;
    const navAttr = 'cat-' + slug;
    if (navTarget && !navTarget.querySelector('[data-nav="' + navAttr + '"]')) {
      navTarget.appendChild(createCircleElement(getConfig(slug, 'label', cat.label), navAttr, '/' + cat.route, cat.icon));
    }

    // Category page-view
    if (!document.getElementById('page-cat-' + slug)) {
      const pageView = document.createElement('div');
      pageView.className = 'page-view';
      pageView.id = 'page-cat-' + slug;
      pageView.setAttribute('data-page', 'cat-' + slug);
      pageView.innerHTML =
        '<section class="sub-page-section reveal">' +
          '<h2 class="sub-page-heading">' + getConfig(slug, 'title', cat.label) + '</h2>' +
          '<p class="sub-page-subtitle">' + getConfig(slug, 'subtitle', cat.label + ' Videos') + '</p>' +
          '<div class="video-grid" data-panel="' + slug + '-full" id="grid-cat-' + slug + '"></div>' +
        '</section>';
      if (mainEl) mainEl.appendChild(pageView);
    }
  });

  // Render static expanded nav items (Model, Media Buyer, Voice Over)
  if (servicesNavExpanded) {
    EXPANDED_NAV_ITEMS.forEach(item => {
      if (!servicesNavExpanded.querySelector('[data-nav="' + item.nav + '"]')) {
        servicesNavExpanded.appendChild(createCircleElement(getConfig(item.nav, 'label', item.label), item.nav, item.href, item.icon));
      }
    });
  }

  // Initialize toggle button
  const toggleBtn = document.getElementById('categories-toggle');
  if (toggleBtn && !toggleBtn._toggleBound) {
    toggleBtn._toggleBound = true;
    toggleBtn.addEventListener('click', function() {
      const isOpen = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!isOpen));
      if (servicesNavExpanded) {
        servicesNavExpanded.setAttribute('aria-hidden', String(isOpen));
        servicesNavExpanded.classList.toggle('open');
      }
    });
  }

  // Refresh navItems collection
  navItems = Array.from(document.querySelectorAll('[data-nav]'));
  navItems.forEach(item => {
    if (item.id === 'menu-btn') return;
    if (item._routerBound) return;
    item._routerBound = true;
    item.addEventListener('click', function(e) {
      const nav = this.dataset.nav;
      if (!nav) return;
      e.preventDefault();
      navigateTo(nav);
      if (menuPanel && menuPanel.classList.contains('active')) closeMenu();
    });
  });
}

// Per-category video URL lists in display order (populated once at load).
// Full grids are rendered lazily on first visit of each page (see
// ensurePageContentLoaded) so hidden pages don't create/load iframes.
const categoryDisplayUrls = {};
const renderedPages = new Set();
let categoryUrlsReady = null;

async function loadVideoCategories() {
  await loadSiteConfig();
  pageMeta = buildPageMeta();
  applyConfigToStaticPages();
  ensureCategoryContainers();

  // Fetch every TXT once (shared by homepage previews, category pages
  // and the search index). Rendering is deferred to page activation.
  categoryUrlsReady = Promise.all(CATEGORIES.map(async cat => {
    const urls = await fetchCategoryUrls(cat.txt);

    // Remove empty featured preview block (e.g. gallery.txt is empty)
    if (urls.length === 0) {
      const emptyPreview = document.getElementById('home-grid-' + cat.slug);
      if (emptyPreview) emptyPreview.parentElement.remove();
      return;
    }

    // Deterministic hourly shuffle — UGC only
    categoryDisplayUrls[cat.slug] = cat.slug === 'ugc' ? hourlyShuffle(urls) : urls;
  }));

  // Resolve the route — may lazily render the active page's content
  // (awaits categoryUrlsReady, which is already in flight).
  handleRoute();

  // If the current page is the homepage, render its featured previews now
  if (isHomeActive()) renderHomePreviews();
}

function isHomeActive() {
  const active = document.querySelector('.page-view.active');
  return !!active && active.id === 'page-home';
}

// Render the 3-per-category featured previews inside the (visible) homepage.
// Runs once, when the homepage first becomes active.
async function renderHomePreviews() {
  if (renderedPages.has('home-featured')) return;
  if (!categoryUrlsReady) return; // data not initialized yet — retried after load
  renderedPages.add('home-featured');

  await categoryUrlsReady;

  CATEGORIES.forEach(cat => {
    renderVideoCards(categoryDisplayUrls[cat.slug] || [], 'home-grid-' + cat.slug, cat.slug, 3);
  });
}

// Render the full grid of a category page on first visit.
async function renderCategoryPage(slug) {
  const urls = categoryDisplayUrls[slug] || await fetchCategoryUrls(
    (CATEGORIES.find(cat => cat.slug === slug) || {}).txt || (slug + '.txt')
  );
  // Deterministic hourly shuffle — UGC only (same order as homepage previews)
  const displayUrls = slug === 'ugc' ? hourlyShuffle(urls) : urls;
  renderVideoCards(displayUrls, 'grid-cat-' + slug, slug);
}

// Lazily load/render the content of a page the first time it is shown.
// Keeps hidden pages free of iframes/images until they are actually visited.
function ensurePageContentLoaded(pageName) {
  if (pageName.indexOf('cat-') === 0) {
    if (!renderedPages.has(pageName)) {
      renderedPages.add(pageName);
      renderCategoryPage(pageName.slice(4));
    }
  } else if (pageName.indexOf('home') === 0) {
    renderHomePreviews();
  } else if (pageName === 'models') {
    if (!renderedPages.has(pageName)) {
      renderedPages.add(pageName);
      loadModels();
    }
  } else if (pageName === 'media-buyer') {
    if (!renderedPages.has(pageName)) {
      renderedPages.add(pageName);
      loadMediaBuyer();
    }
  } else if (pageName === 'voiceover') {
    if (!renderedPages.has(pageName)) {
      renderedPages.add(pageName);
      document.dispatchEvent(new Event('pp:load-voiceovers'));
    }
  }
}

// ============================================
// YEAR
// ============================================
if (year) {
  year.textContent = new Date().getFullYear();
}

// ============================================
// IMAGE PREVIEW / LIGHTBOX
// ============================================
function openImagePreview(opener) {
  if (!imageModal || !modalImage) return;

  modalImage.src = opener.dataset.lightboxSrc;
  modalImage.alt = opener.dataset.lightboxAlt || '';
  imageModal.classList.add('active');
  imageModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeImagePreview() {
  if (!imageModal || !modalImage) return;

  imageModal.classList.remove('active');
  imageModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  modalImage.removeAttribute('src');
  modalImage.alt = '';
}

mediaOpeners.forEach(opener => {
  opener.addEventListener('click', () => openImagePreview(opener));
});

if (modalClose) {
  modalClose.addEventListener('click', closeImagePreview);
}

if (imageModal) {
  imageModal.addEventListener('click', event => {
    if (event.target === imageModal) closeImagePreview();
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeImagePreview();
});

// ============================================
// VIDEO SEARCH
// ============================================
let searchIndex = null;

async function getSearchIndex() {
  if (searchIndex) return searchIndex;

  searchIndex = [];

  const results = await Promise.all(
    CATEGORIES.map(async cat => {
      const urls = await fetchCategoryUrls(cat.txt);
      return urls.map(url => ({
        title: decodeURIComponent(url.split('/').pop() || '') || url,
        video: url,
        category: cat.slug
      }));
    })
  );

  searchIndex = results.flat();
  return searchIndex;
}

function renderSearchResults(query) {
  const resultsContainer = document.getElementById('video-search-results');
  const grid = document.getElementById('search-results-grid');
  const countEl = document.getElementById('search-results-count');
  const noResultsEl = document.getElementById('search-no-results');
  const featuredPreviews = document.querySelectorAll('.featured-preview');

  if (!resultsContainer || !grid) return;

  if (!query || query.trim() === '') {
    resultsContainer.hidden = true;
    if (noResultsEl) noResultsEl.hidden = true;
    featuredPreviews.forEach(el => el.style.display = '');
    return;
  }

  const q = query.toLowerCase().trim();
  const results = searchIndex.filter(item =>
    (item.title || '').toLowerCase().includes(q)
  );

  featuredPreviews.forEach(el => el.style.display = 'none');
  resultsContainer.hidden = false;

  if (countEl) {
    countEl.textContent = results.length + ' نتيجة لـ "' + query.trim() + '"';
  }

  grid.innerHTML = '';

  if (results.length === 0) {
    if (noResultsEl) noResultsEl.hidden = false;
    return;
  }

  if (noResultsEl) noResultsEl.hidden = true;

  const fragment = document.createDocumentFragment();

  results.forEach(item => {
    const card = createReelCard(item.video);
    fragment.appendChild(card);

    card.classList.add('reveal-scale');
    const delay = Math.min(Math.floor(fragment.children.length / 3), 5);
    card.classList.add('reveal-delay-' + (delay + 1));
    revealObserver.observe(card);
  });

  grid.appendChild(fragment);
  forceActivateRevealCards(grid);
}

function initVideoSearch() {
  const input = document.getElementById('video-search-input');
  if (!input) return;

  const debouncedSearch = debounce(async function() {
    await getSearchIndex();
    renderSearchResults(input.value);
  }, 200);

  input.addEventListener('input', debouncedSearch);
}

// ============================================
// MOBILE NAVIGATION TOGGLE
// ============================================
if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    const isActive = navToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
    navToggle.setAttribute('aria-expanded', String(isActive));
    navToggle.setAttribute('aria-label', isActive ? 'إغلاق القائمة' : 'فتح القائمة');
  });

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('active');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'فتح القائمة');
    });
  });

  document.addEventListener('click', event => {
    if (!navToggle.contains(event.target) && !navMenu.contains(event.target)) {
      navMenu.classList.remove('active');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'فتح القائمة');
    }
  });
}

// ============================================
// MENU PANEL
// ============================================
function closeMenu() {
  if (!menuPanel) return;
  menuPanel.classList.remove('active');
  menuPanel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  document.body.style.overscrollBehavior = '';
}

if (menuBtn && menuPanel) {
  menuBtn.addEventListener('click', () => {
    menuPanel.classList.add('active');
    menuPanel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
  });

  if (menuClose) {
    menuClose.addEventListener('click', closeMenu);
  }

  menuItems.forEach(item => {
    item.addEventListener('click', closeMenu);
  });

  menuPanel.addEventListener('click', e => {
    if (e.target === menuPanel) closeMenu();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menuPanel.classList.contains('active')) {
      closeMenu();
    }
  });
}

// ============================================
// BOTTOM NAVIGATION
// Click handler: active state toggle + ripple effect
// ============================================
bottomNavItems.forEach(item => {
  item.addEventListener('click', function(e) {
    bottomNavItems.forEach(i => i.classList.remove('active'));
    this.classList.add('active');

    // Ripple effect
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = this.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    this.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
});

// ============================================
// SPA ROUTER — Clean URL Routing
// ============================================

// Route map: URL path → page name
const ROUTES = {
  'ugc': 'cat-ugc',
  'stores': 'cat-stores',
  'events': 'cat-events',
  'shooting': 'cat-shoting',
  'photography': 'cat-services',
  'services': 'cat-services',
  'gallery': 'cat-gallery',
  'drone': 'cat-drone',
  'portfolio': 'home-portfolio',
  'voice-over': 'voiceover',
  'media-buyer': 'media-buyer',
  'model': 'models',
  'contact': 'home-contact',
  'equipment': 'equipment'
};

// Reverse map: page name → URL path
const PAGE_TO_ROUTE = {};
for (const [path, page] of Object.entries(ROUTES)) {
  PAGE_TO_ROUTE[page] = path;
}
PAGE_TO_ROUTE['home'] = '';

// Detect base path once at load time (handles root and subdirectory deployments)
const BASE_PATH = (function() {
  const segments = window.location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return '';

  // If first segment is a known route, we're at root
  if (ROUTES[segments[0]]) return '';

  // If second segment is a known route, first segment is the base
  if (segments.length > 1 && ROUTES[segments[1]]) return '/' + segments[0];

  // No route in URL — entire path (minus filename) is the base
  return window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
})();

function buildUrl(route) {
  return route ? BASE_PATH + '/' + route : BASE_PATH + '/';
}

function getCurrentRoute() {
  let path = window.location.pathname;
  if (BASE_PATH && path.startsWith(BASE_PATH)) {
    path = path.slice(BASE_PATH.length);
  }
  return path.replace(/^\//, '').replace(/\/$/, '');
}

function navigateTo(pageName) {
  const route = PAGE_TO_ROUTE[pageName] ?? '';
  const currentRoute = getCurrentRoute();

  // Don't push duplicate history entries
  if (route === currentRoute) {
    showPage(pageName);
    return;
  }

  history.pushState({ page: pageName }, '', buildUrl(route));
  showPage(pageName);
}

function handleRoute() {
  const route = getCurrentRoute();
  const pageName = ROUTES[route] || 'home';

  // Browser back/forward: close any open overlay so its scroll lock
  // (body overflow: hidden) doesn't stick on the newly shown page.
  if (imageModal && imageModal.classList.contains('active')) closeImagePreview();
  if (menuPanel && menuPanel.classList.contains('active')) closeMenu();
  document.dispatchEvent(new Event('pp:stop-voiceover'));

  showPage(pageName);
}

window.addEventListener('popstate', handleRoute);

// ============================================
// DYNAMIC SEO META UPDATES
// ============================================
const BASE_URL = 'https://photographypixell.com';
const DEFAULT_TITLE = 'Photography Pixel | وكالة تصوير وتسويق رقمي في أيت ملول - أكادير';
const DEFAULT_DESC = 'Photography Pixel: وكالة تصوير وتسويق رقمي متخصصة في صناعة المحتوى، تصوير المنتجات، المحلات التجارية، فيديوهات UGC والأعراس في أيت ملول - أكادير.';

// pageMeta is now built dynamically from data/config.json via buildPageMeta().
// Fallback values ensure the site works even if config.json fails to load.
let pageMeta = buildPageMeta();

function updatePageMeta(pageName) {
  const meta = pageMeta[pageName] || pageMeta['home'];

  // Title
  document.title = meta.title;

  // Description
  setMetaContent('meta[name="description"]', meta.desc);

  // Canonical
  const route = PAGE_TO_ROUTE[pageName] ?? '';
  const canonical = BASE_URL + '/' + route;
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) canonicalEl.setAttribute('href', canonical);

  // Open Graph
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.desc);
  setMetaContent('meta[property="og:url"]', canonical);

  // Twitter
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.desc);

  // BreadcrumbList JSON-LD
  const breadcrumbScripts = document.querySelectorAll('script[type="application/ld+json"]');
  breadcrumbScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      if (data['@type'] === 'BreadcrumbList') {
        data.itemListElement = [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: BASE_URL + '/'
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: meta.crumb,
            item: canonical
          }
        ];
        script.textContent = JSON.stringify(data, null, 2);
      }
    } catch (e) { /* skip non-JSON blocks */ }
  });
}

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

// Instant scroll to top — bypasses CSS scroll-behavior:smooth so page
// changes and initial loads never visibly "animate" from an old position.
function scrollToTopInstant() {
  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  root.style.scrollBehavior = prevBehavior;
}

// Stop video playback inside a page-view that is being hidden. Cross-origin
// iframes cannot be paused from the parent page, so
// the only reliable way to stop them (and any ghost audio) is to re-navigate
// the iframe to its own src — the player reloads paused. Iframes that were
// still lazily deferred stay deferred (no extra load).
function resetPageVideos(pageEl) {
  if (!pageEl) return;
  pageEl.querySelectorAll('.reel-card iframe').forEach(iframe => {
    const src = iframe.getAttribute('src');
    if (src) iframe.src = src;
  });
  pageEl.querySelectorAll('.reel-card wistia-player').forEach(player => {
    if (typeof player.pause !== 'function') return;
    try {
      player.pause();
    } catch (err) {
      console.warn('[Wistia] Could not pause player:', err);
    }
  });
}

// ============================================
// SPA PAGE NAVIGATION SYSTEM
// ============================================
function showPage(pageName) {
  updatePageMeta(pageName);

  const previousActive = document.querySelector('.page-view.active');

  // Re-query page views to include dynamically created pages
  const allPageViews = document.querySelectorAll('.page-view');
  allPageViews.forEach(pv => pv.classList.remove('active'));

  const targetPage = document.getElementById('page-' + pageName);
  if (targetPage) {
    targetPage.classList.add('active');
  } else if (pageName.indexOf('home') === 0) {
    const homePage = document.getElementById('page-home');
    if (homePage) homePage.classList.add('active');
  }

  // Stop any playing video (ghost audio) in the page we just left
  if (previousActive && !previousActive.classList.contains('active')) {
    resetPageVideos(previousActive);
  }

  // Update bottom nav active states
  bottomNavItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.nav === pageName) {
      item.classList.add('active');
    }
  });

  // Update category card active states
  document.querySelectorAll('.services-nav .service-circle, .services-nav-expanded .service-circle').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.nav === pageName) {
      item.classList.add('active');
    }
  });

  // Handle scroll targets for home page
  if (pageName === 'home' || pageName.indexOf('home') === 0) {
    if (pageName === 'home-portfolio') {
      setTimeout(() => {
        const portfolio = document.getElementById('portfolio');
        if (portfolio) portfolio.scrollIntoView(true);
      }, 50);
    } else if (pageName === 'home-contact') {
      setTimeout(() => {
        const contact = document.getElementById('contact');
        if (contact) contact.scrollIntoView(true);
      }, 50);
    } else {
      scrollToTopInstant();
    }
  } else {
    scrollToTopInstant();
  }

  // Toggle SEO content sections (portfolio/contact unique content)
  document.querySelectorAll('.seo-content-section').forEach(el => {
    el.classList.remove('active');
  });
  if (pageName === 'home-portfolio') {
    const seoSection = document.getElementById('portfolio-intro');
    if (seoSection) seoSection.classList.add('active');
  } else if (pageName === 'home-contact') {
    const seoSection = document.getElementById('contact-info');
    if (seoSection) seoSection.classList.add('active');
  }

  // Trigger reveal observer for newly visible elements
  let revealContainer = targetPage;
  if (!revealContainer && pageName.indexOf('home') === 0) {
    revealContainer = document.getElementById('page-home');
  }
  if (revealContainer) {
    revealContainer.querySelectorAll('.reveal, .reveal-fade, .reveal-scale').forEach(el => {
      if (!el.classList.contains('active')) {
        revealObserver.observe(el);
      }
    });

    // Force-activate reveal elements already in viewport
    forceActivateRevealCards(revealContainer);
  }

  // Lazily render this page's content (videos/models/etc.) on first visit
  ensurePageContentLoaded(pageName);
}

// Bind static nav items immediately (dynamic items bound in ensureCategoryContainers)
navItems.forEach(item => {
  if (item.id === 'menu-btn') return;
  if (item._routerBound) return;
  item._routerBound = true;
  item.addEventListener('click', function(e) {
    const nav = this.dataset.nav;
    if (!nav) return;
    e.preventDefault();
    navigateTo(nav);
    if (menuPanel && menuPanel.classList.contains('active')) closeMenu();
  });
});

// ============================================
// MODEL BOOKING — REQUEST FORM → WHATSAPP
// Opens a polished booking form, validates the
// required fields, then hands a structured Arabic
// request to WhatsApp. Event delegation covers the
// dynamically rendered model cards.
// ============================================
(function() {
  'use strict';

  const WA_NUMBER = '212663493003';

  const modal = document.getElementById('booking-modal');
  const form = document.getElementById('booking-form');
  if (!modal || !form) return;

  const closeBtn = document.getElementById('booking-close');
  const cancelBtn = document.getElementById('booking-cancel');
  const submitBtn = document.getElementById('booking-submit');
  const successEl = document.getElementById('booking-success');

  const modelImg = document.getElementById('booking-model-img');
  const modelImgWrap = modelImg ? modelImg.closest('.booking-model-photo') : null;
  const modelNameEl = document.getElementById('booking-model-name');
  const modelCityEl = document.getElementById('booking-model-city');

  const cityInput = document.getElementById('booking-city');
  const nameInput = document.getElementById('booking-name');
  const phoneInput = document.getElementById('booking-phone');
  const dateInput = document.getElementById('booking-date');
  const detailsInput = document.getElementById('booking-details');

  const ERROR_MESSAGES = {
    projectType: 'المرجو اختيار نوع المشروع.',
    shootingLocation: 'المرجو اختيار مكان التصوير.',
    videoCount: 'المرجو اختيار عدد الفيديوهات.',
    customerCity: 'المرجو إدخال مدينة التصوير.',
    customerName: 'المرجو إدخال الاسم الكامل.',
    customerPhone: 'المرجو إدخال رقم الهاتف.'
  };

  let lastFocused = null;
  let submitting = false;

  // ── Validation helpers ─────────────────────
  function fieldEl(name) {
    return form.querySelector('[data-field="' + name + '"]');
  }

  function setFieldError(name, message) {
    const field = fieldEl(name);
    const errorEl = form.querySelector('[data-error-for="' + name + '"]');
    if (field) field.classList.add('has-error');
    if (errorEl) {
      errorEl.textContent = message || '';
      errorEl.classList.add('show');
    }
  }

  function clearFieldError(name) {
    const field = fieldEl(name);
    const errorEl = form.querySelector('[data-error-for="' + name + '"]');
    if (field) field.classList.remove('has-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    }
  }

  function clearAllErrors() {
    form.querySelectorAll('.booking-error').forEach(el => {
      el.textContent = '';
      el.classList.remove('show');
    });
    form.querySelectorAll('.booking-field.has-error').forEach(el => {
      el.classList.remove('has-error');
    });
  }

  function radioValue(name) {
    const checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : '';
  }

  // Accepts Moroccan numbers entered as +212XXXXXXXXX, 00212XXXXXXXXX,
  // 212XXXXXXXXX, 0XXXXXXXXX or bare XXXXXXXXX (mobile 6/7, landline 5).
  function isValidMoroccanPhone(raw) {
    const p = String(raw || '').replace(/[\s\-().]/g, '');
    if (!p) return false;
    return /^(?:\+212|00212|212)[5-7]\d{8}$/.test(p) ||
           /^0[5-7]\d{8}$/.test(p) ||
           /^[5-7]\d{8}$/.test(p);
  }

  function formatDate(value) {
    if (!value) return 'لم يحدد بعد';
    const parts = String(value).split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return value;
  }

  function validate() {
    clearAllErrors();

    const values = {
      projectType: radioValue('projectType'),
      shootingLocation: radioValue('shootingLocation'),
      videoCount: radioValue('videoCount'),
      customerCity: cityInput ? cityInput.value.trim() : '',
      customerName: nameInput ? nameInput.value.trim() : '',
      customerPhone: phoneInput ? phoneInput.value.trim() : ''
    };

    let firstInvalid = null;

    Object.keys(ERROR_MESSAGES).forEach(name => {
      if (!String(values[name] || '').trim()) {
        setFieldError(name, ERROR_MESSAGES[name]);
        if (!firstInvalid) firstInvalid = name;
      }
    });

    if (phoneInput && phoneInput.value.trim() && !isValidMoroccanPhone(phoneInput.value)) {
      setFieldError('customerPhone', 'المرجو إدخال رقم هاتف مغربي صحيح (مثال: 0663493003).');
      if (!firstInvalid) firstInvalid = 'customerPhone';
    }

    if (firstInvalid) {
      const field = fieldEl(firstInvalid);
      if (field) {
        const focusable = field.querySelector('input:not([type="hidden"]), textarea, select');
        if (focusable && typeof focusable.focus === 'function') {
          focusable.focus({ preventScroll: true });
        }
        field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return false;
    }

    return true;
  }

  // ── WhatsApp message ───────────────────────
  function buildMessage() {
    const details = (detailsInput && detailsInput.value.trim()) || 'لا توجد';
    const lines = [
      'السلام عليكم، عندنا طلب حجز من الموقع 📩',
      '',
      '📸 *Photography Pixel — طلب حجز مودل*',
      '',
      '👩 المودل: ' + (modelNameEl.textContent || '—'),
      '🎬 نوع التصوير: ' + radioValue('projectType'),
      '📦 عدد الفيديوهات: ' + radioValue('videoCount'),
      '📍 مكان التصوير: ' + radioValue('shootingLocation'),
      '🏙️ مدينة التصوير: ' + cityInput.value.trim(),
      '📅 التاريخ المقترح: ' + formatDate(dateInput ? dateInput.value : ''),
      '',
      '👤 الاسم الكامل: ' + nameInput.value.trim(),
      '📞 رقم الهاتف: ' + phoneInput.value.trim(),
      '',
      '📝 تفاصيل المشروع:',
      details,
      '',
      'المرجو التواصل مع الزبون لتأكيد التفاصيل والتوفر.',
      '',
      '*ملاحظة: هذا طلب حجز أولي، وليس تأكيداً نهائياً للحجز.*'
    ];
    return lines.join('\n');
  }

  // ── Modal open / close ─────────────────────
  function openModal(card) {
    const name = card.dataset.modelName || '';
    const city = card.dataset.modelCity || '';
    const photo = card.dataset.modelPhoto || '';

    modelNameEl.textContent = name || '—';
    modelCityEl.textContent = city || '';

    if (modelImg) {
      if (photo) {
        modelImg.src = photo;
        modelImg.alt = name;
        if (modelImgWrap) modelImgWrap.classList.remove('is-empty');
      } else {
        modelImg.removeAttribute('src');
        modelImg.alt = '';
        if (modelImgWrap) modelImgWrap.classList.add('is-empty');
      }
    }

    form.reset();
    clearAllErrors();
    if (successEl) successEl.hidden = true;
    submitting = false;
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-loading');

    lastFocused = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    setTimeout(() => {
      const first = form.querySelector('input[name="projectType"]');
      if (first) first.focus({ preventScroll: true });
    }, 60);
  }

  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
  }

  // ── Events ─────────────────────────────────
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.model-book-btn');
    if (!btn) return;

    const card = btn.closest('.model-card');
    if (!card) return;

    e.preventDefault();
    openModal(card);
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', function(e) {
    if (e.target.closest('[data-booking-close]')) closeModal();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // Live-clear field errors once the visitor starts fixing them
  function handleFieldUpdate(e) {
    const field = e.target.closest('[data-field]');
    if (field && field.classList.contains('has-error')) {
      clearFieldError(field.dataset.field);
    }
  }
  form.addEventListener('input', handleFieldUpdate);
  form.addEventListener('change', handleFieldUpdate);

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    if (successEl) successEl.hidden = true;

    const url = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(buildMessage());

    // Open synchronously inside the user gesture so mobile browsers
    // don't treat it as a blocked popup.
    try {
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      window.location.href = url;
    }

    if (successEl) successEl.hidden = false;

    setTimeout(function() {
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
    }, 900);
  });
})();


// ============================================
// DYNAMIC MODELS LOADER
// ============================================
function formatModelCategory(category) {
  if (!category) return '';
  const labelMap = {
    'ugc': 'UGC',
    'servisec': 'Services',
    'shoting': 'Shooting',
    'store': 'Stores',
    'stores': 'Stores',
    'event': 'Events',
    'events': 'Events'
  };
  return String(category)
    .toLowerCase()
    .split(/[_\s]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => labelMap[part] || part)
    .join('، ');
}

function createModelCard(model) {
  const card = document.createElement('article');
  card.className = 'model-card reveal-scale';
  card.dataset.modelName = model.name;
  card.dataset.modelCity = model.city;
  card.dataset.modelPhoto = model.photo;

  const availClass = model.available ? 'available' : 'unavailable';
  const availText = model.available ? 'متاح' : 'غير متاح';

  // Known intrinsic dimensions (avoid layout shift for lazy images)
  const modelImgDims = {
    '/assets/models/maryam hawara.webp': [1080, 1920],
    '/assets/models/model dris.webp': [1200, 1800],
    '/assets/models/model hanan.webp': [1200, 1800],
    '/assets/models/model hasna.webp': [1200, 1800],
    '/assets/models/yousef.jpg': [522, 906],
    '/assets/models/kholoud.jpg': [1036, 1280]
  };
  const dims = modelImgDims[model.photo] || [];
  const dimAttrs = dims[0] ? ` width="${dims[0]}" height="${dims[1]}"` : '';

  // Only render attribute rows that actually have data
  const attrParts = [];
  if (model.age && String(model.age).trim()) {
    attrParts.push(`<span class="model-attr"><span class="model-attr-label">العمر</span><span class="model-attr-value">${model.age}</span></span>`);
  }
  if (model.height && String(model.height).trim()) {
    attrParts.push(`<span class="model-attr"><span class="model-attr-label">الطول</span><span class="model-attr-value">${model.height}</span></span>`);
  }
  attrParts.push(`<span class="model-attr"><span class="model-attr-label">المدينة</span><span class="model-attr-value">${model.city || ''}</span></span>`);
  if (model.category && String(model.category).trim()) {
    attrParts.push(`<span class="model-attr"><span class="model-attr-label">الفئات</span><span class="model-attr-value">${formatModelCategory(model.category)}</span></span>`);
  }
  if (model.experience && String(model.experience).trim()) {
    attrParts.push(`<span class="model-attr"><span class="model-attr-label">الخبرة</span><span class="model-attr-value">${model.experience}</span></span>`);
  }
  const attrHtml = attrParts.join('\n        ');

  const descRaw = (model.description || '').trim();
  const showDesc = descRaw && descRaw !== '—';

  card.innerHTML = `
    <div class="model-photo">
      <img src="${model.photo}" alt="${model.name}" loading="lazy" decoding="async"${dimAttrs}>
    </div>
    <div class="model-body">
      <h3 class="model-name">${model.name}</h3>
      <div class="model-availability ${availClass}">${availText}</div>
      <div class="model-attributes">
        ${attrHtml}
      </div>
      ${showDesc ? `<p class="model-desc">${model.description}</p>` : ''}
      <a href="#" class="button primary model-book-btn">${getConfig('models', 'ctaText', 'احجز هذا المودل')}</a>
    </div>
  `;

  return card;
}

async function loadModels() {
  const grid = document.getElementById('models-grid');
  if (!grid) return;

  try {
    const response = await fetch('/data/models.json');
    const models = await response.json();

    grid.innerHTML = '';

    models.forEach(model => {
      const card = createModelCard(model);
      grid.appendChild(card);
      revealObserver.observe(card);
    });
  } catch (error) {
    // Failed to load models — grid stays empty
  }
}

// ============================================
// DYNAMIC MEDIA BUYER LOADER
// ============================================
function createBuyerCard(campaign) {
  const card = document.createElement('article');
  card.className = 'buyer-card reveal-scale';

  card.innerHTML = `
    <div class="buyer-screenshot">
      <img src="${campaign.screenshot}" alt="${campaign.campaign}" loading="lazy" decoding="async" width="1600" height="978">
    </div>
    <div class="buyer-body">
      <h3 class="buyer-campaign">${campaign.campaign}</h3>
      <div class="buyer-meta">
        <span class="buyer-platform">${campaign.platform}</span>
        <span class="buyer-objective">${campaign.objective}</span>
        <span class="buyer-messages">${campaign.messages}</span>
      </div>
      <div class="buyer-result">${campaign.result}</div>
      <p class="buyer-desc">${campaign.description}</p>
    </div>
  `;

  return card;
}

async function loadMediaBuyer() {
  const grid = document.getElementById('buyer-grid');
  if (!grid) return;

  try {
    const response = await fetch('/data/media-buyer.json');
    const campaigns = await response.json();

    grid.innerHTML = '';

    campaigns.forEach(campaign => {
      const card = createBuyerCard(campaign);
      grid.appendChild(card);
      revealObserver.observe(card);
    });
  } catch (error) {
    // Failed to load media buyer campaigns — grid stays empty
  }
}

// ============================================
// SCROLL REVEAL ANIMATIONS
// ============================================
const observerOptions = {
  root: null,
  rootMargin: '0px 0px -100px 0px',
  threshold: 0.1
};

const revealCallback = (entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
      observer.unobserve(entry.target);
    }
  });
};

const revealObserver = new IntersectionObserver(revealCallback, observerOptions);

// ============================================
// DOM CONTENT LOADED
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  scrollToTopInstant();

  // loadVideoCategories() calls handleRoute() after dynamic pages are created.
  // Calling handleRoute() here would race — category page-views don't exist yet.

  // Critical path: fetch config + video data, create containers, resolve route.
  // Grids/models/voiceovers render lazily when their page is first shown
  // (ensurePageContentLoaded) instead of being preloaded up front.
  loadVideoCategories();
  initVideoSearch();

  // Add reveal classes to key elements (single query batch)
  const revealAdditions = [
    ['.profile-card', 'reveal'],
    ['.portfolio-shell', 'reveal reveal-delay-2'],
    ['.footer', 'reveal reveal-delay-3'],
    ['.avatar-ring', 'reveal-scale'],
    ['.profile-info', 'reveal reveal-delay-1'],
    ['.profile-line', 'reveal reveal-delay-2'],
    ['.bio', 'reveal-fade reveal-delay-2']
  ];

  revealAdditions.forEach(([sel, cls]) => {
    const el = document.querySelector(sel);
    if (el) {
      el.classList.add(...cls.split(' '));
    }
  });

  // Observe all reveal elements in a single pass
  document.querySelectorAll('.reveal, .reveal-fade, .reveal-scale').forEach(el => {
    revealObserver.observe(el);
  });

  // Page transition
  document.body.classList.add('page-transition');
  setTimeout(() => {
    document.body.classList.remove('page-transition');
  }, 600);

  // Force-activate reveal elements already in viewport (single layout pass)
  forceActivateRevealCards(document);
});

// ============================================
// VOICE OVER SECTION
// ============================================
(function() {
  'use strict';

  const voGrid = document.getElementById('voiceover-grid');
  const voEmpty = document.getElementById('voiceover-empty');
  const voModal = document.getElementById('vo-modal');

  if (!voModal) return;

  // Modal elements
  const voOverlay = voModal.querySelector('.vo-modal-overlay');
  const voCloseBtn = voModal.querySelector('.vo-modal-close');
  const voCoverImg = voModal.querySelector('.vo-cover');
  const voTitle = voModal.querySelector('.vo-title');
  const voCategory = voModal.querySelector('.vo-category');
  const voDuration = voModal.querySelector('.vo-duration');
  const voDesc = voModal.querySelector('.vo-description');
  const voCanvas = document.getElementById('vo-waveform');
  const voCtx = voCanvas.getContext('2d');
  const voLoading = document.getElementById('vo-loading');
  const voPlayPauseBtn = voModal.querySelector('.vo-play-pause');
  const voPlayIcon = voModal.querySelector('.vo-icon-play');
  const voPauseIcon = voModal.querySelector('.vo-icon-pause');
  const voSkipBackBtn = voModal.querySelector('.vo-skip-back');
  const voSkipFwdBtn = voModal.querySelector('.vo-skip-forward');
  const voCurrentTime = voModal.querySelector('.vo-current-time');
  const voTotalTime = voModal.querySelector('.vo-total-time');
  const voVolumeSlider = voModal.querySelector('.vo-volume-slider');
  const voSpeedBtn = voModal.querySelector('.vo-speed-btn');
  const voSpeedMenu = voModal.querySelector('.vo-speed-menu');

  // State
  let audio = null;
  let audioCtx = null;
  let audioBlobUrl = null;
  let waveformBars = [];
  let rafId = null;
  let lastFocused = null;
  let isDragging = false;

  // ============================================
  // Helpers
  // ============================================
  function formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function showPlayIcon() {
    voPlayIcon.style.display = 'inline';
    voPauseIcon.style.display = 'none';
    voPlayPauseBtn.setAttribute('aria-label', 'Play');
  }

  function showPauseIcon() {
    voPlayIcon.style.display = 'none';
    voPauseIcon.style.display = 'inline';
    voPlayPauseBtn.setAttribute('aria-label', 'Pause');
  }

  function showLoading(show) {
    voLoading.hidden = !show;
  }

  // Safari-compatible decode wrapper (callback-based API)
  function decodeAudioData(ctx, buffer) {
    return new Promise((resolve, reject) => {
      try {
        ctx.decodeAudioData(buffer, resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ============================================
  // Card Creation
  // ============================================
  function createVoiceOverCard(item, index) {
    const card = document.createElement('article');
    card.className = 'vo-card reveal-scale';
    card.style.transitionDelay = (Math.min(index, 5) * 0.1) + 's';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Play voice over: ' + (item.title || ''));
    card.dataset.audio = item.audio || '';
    card.dataset.cover = item.cover || '';
    card.dataset.title = item.title || '';
    card.dataset.category = item.category || '';
    card.dataset.description = item.description || '';
    card.dataset.duration = item.duration || '';

    card.innerHTML = `
      <div class="vo-card-cover">
        <img src="${item.cover || ''}" alt="${item.title || ''}" loading="lazy" decoding="async" width="736" height="490">
        <div class="vo-card-overlay">
          <span class="vo-card-play">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </span>
        </div>
      </div>
      <div class="vo-card-body">
        <h3 class="vo-card-title">${item.title || ''}</h3>
        <div class="vo-card-meta">
          <span class="vo-card-category">${item.category || ''}</span>
          <span class="vo-card-duration">${item.duration || ''}</span>
        </div>
        <p class="vo-card-desc">${item.description || ''}</p>
      </div>
    `;

    card.addEventListener('click', () => openModal(card));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(card);
      }
    });

    return card;
  }

  // ============================================
  // Load Voice Overs
  // ============================================
  async function loadVoiceOvers() {
    if (!voGrid) return;

    try {
      const response = await fetch('/data/voiceover.json');
      const items = await response.json();

      voGrid.innerHTML = '';

      if (!items || items.length === 0) {
        voGrid.hidden = true;
        voEmpty.hidden = false;
        if (typeof revealObserver !== 'undefined') {
          revealObserver.observe(voEmpty);
        } else {
          voEmpty.classList.add('active');
        }
        return;
      }

      voEmpty.hidden = true;
      voGrid.hidden = false;

      items.forEach((item, index) => {
        const card = createVoiceOverCard(item, index);
        voGrid.appendChild(card);
        if (typeof revealObserver !== 'undefined') {
          revealObserver.observe(card);
        }
      });
    } catch (err) {
      // Failed to load voice overs
      voGrid.hidden = true;
      voEmpty.hidden = false;
      if (typeof revealObserver !== 'undefined') {
        revealObserver.observe(voEmpty);
      }
    }
  }

  // ============================================
  // Modal
  // ============================================
  function openModal(card) {
    lastFocused = card;

    voCoverImg.src = card.dataset.cover || '';
    voCoverImg.alt = card.dataset.title || '';
    voTitle.textContent = card.dataset.title || '';
    voCategory.textContent = card.dataset.category || '';
    voDuration.textContent = card.dataset.duration || '';
    voDesc.textContent = card.dataset.description || '';

    showPlayIcon();
    voCurrentTime.textContent = '0:00';
    voTotalTime.textContent = card.dataset.duration || '0:00';
    voVolumeSlider.value = 1;

    waveformBars = [];
    canvasWidth = 0;
    canvasHeight = 0;
    voCtx.clearRect(0, 0, voCanvas.width, voCanvas.height);

    voModal.classList.add('active');
    voModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    loadAudio(card.dataset.audio);

    setTimeout(() => voPlayPauseBtn.focus(), 100);
  }

  function closeModal(restoreFocus) {
    if (restoreFocus === undefined) restoreFocus = true;

    voModal.classList.remove('active');
    voModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      audioBlobUrl = null;
    }

    voSpeedMenu.hidden = true;
    voSpeedBtn.setAttribute('aria-expanded', 'false');

    showPlayIcon();

    if (restoreFocus && lastFocused) {
      lastFocused.focus();
    }
  }

  // ============================================
  // Audio Loading & Waveform
  // ============================================
  async function loadAudio(url) {
    if (!url) {
      // No audio URL provided
      showLoading(false);
      return;
    }

    showLoading(true);

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
      audioBlobUrl = URL.createObjectURL(new Blob([arrayBuffer]));

      if (!audio) {
        audio = new Audio();
        audio.controlsList = 'nodownload';
        audio.preload = 'auto';
        audio.volume = 1;

        audio.addEventListener('loadedmetadata', () => {
          if (isFinite(audio.duration) && !isNaN(audio.duration)) {
            voTotalTime.textContent = formatTime(audio.duration);
          }
        });

        audio.addEventListener('ended', () => {
          showPlayIcon();
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          drawWaveform();
        });

        audio.addEventListener('canplay', () => showLoading(false));
        audio.addEventListener('waiting', () => showLoading(true));
        audio.addEventListener('playing', () => showLoading(false));
        audio.addEventListener('error', () => {
          showLoading(false);
          // Audio playback error
        });

        audio.addEventListener('contextmenu', e => e.preventDefault());
      }

      audio.src = audioBlobUrl;

      // Decode for waveform using Web Audio API
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Safari suspends AudioContext until a user gesture
        if (audioCtx.state === 'suspended') audioCtx.resume();

        // slice(0) creates a copy since decodeAudioData may detach the buffer
        const audioBuffer = await decodeAudioData(audioCtx, arrayBuffer.slice(0));
        generateWaveform(audioBuffer);
      } catch (decodeErr) {
        // Waveform decode failed, using fallback
        generatePseudoWaveform();
      }

    } catch (err) {
      // Failed to load audio
      showLoading(false);
    }
  }

  function generateWaveform(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const samples = 180;
    const blockSize = Math.floor(channelData.length / samples);
    const bars = [];

    for (let i = 0; i < samples; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < blockSize; j++) {
        const idx = i * blockSize + j;
        if (idx < channelData.length) {
          sum += Math.abs(channelData[idx]);
          count++;
        }
      }
      bars.push(count > 0 ? sum / count : 0);
    }

    // Normalize
    let max = 0;
    for (let k = 0; k < bars.length; k++) {
      if (bars[k] > max) max = bars[k];
    }

    waveformBars = max > 0
      ? bars.map(v => v / max)
      : bars.map(() => 0.5);

    drawWaveform();
  }

  function generatePseudoWaveform() {
    const samples = 180;
    waveformBars = [];
    for (let i = 0; i < samples; i++) {
      const val = 0.3 + 0.3 * Math.sin(i * 0.1) + 0.2 * Math.sin(i * 0.3) + 0.1 * Math.random();
      waveformBars.push(Math.max(0.1, Math.min(1, val)));
    }
    drawWaveform();
  }

  let canvasWidth = 0;
  let canvasHeight = 0;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = voCanvas.getBoundingClientRect();

    if (rect.width === 0) return false;

    voCanvas.width = rect.width * dpr;
    voCanvas.height = rect.height * dpr;
    voCtx.setTransform(1, 0, 0, 1, 0, 0);
    voCtx.scale(dpr, dpr);

    canvasWidth = rect.width;
    canvasHeight = rect.height;
    return true;
  }

  function drawWaveform() {
    if (canvasWidth === 0) { if (!resizeCanvas()) return; }

    const width = canvasWidth;
    const height = canvasHeight;
    const barCount = waveformBars.length;

    if (barCount === 0) return;

    const barWidth = width / barCount;
    const progress = (audio && audio.duration && isFinite(audio.duration))
      ? audio.currentTime / audio.duration
      : 0;

    voCtx.clearRect(0, 0, width, height);

    for (let i = 0; i < barCount; i++) {
      const barHeight = Math.max(2, waveformBars[i] * height * 0.9);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      if (i / barCount <= progress) {
        voCtx.fillStyle = '#2F6BFF';
      } else {
        voCtx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      }

      voCtx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }
  }

  // ============================================
  // Player Controls
  // ============================================
  function togglePlay() {
    if (!audio || !audio.src) return;

    if (audio.paused) {
      audio.play().then(() => {
        showPauseIcon();
        startProgressLoop();
      }).catch(err => {
        // Play failed
      });
    } else {
      audio.pause();
      showPlayIcon();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  }

  function startProgressLoop() {
    if (rafId) cancelAnimationFrame(rafId);

    function loop() {
      if (audio && !audio.paused) {
        drawWaveform();
        voCurrentTime.textContent = formatTime(audio.currentTime);
        rafId = requestAnimationFrame(loop);
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function seekToPosition(clientX) {
    if (!audio || !audio.duration || !isFinite(audio.duration)) return;

    const rect = voCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = ratio * audio.duration;

    drawWaveform();
    voCurrentTime.textContent = formatTime(audio.currentTime);
    voCanvas.setAttribute('aria-valuenow', Math.round(ratio * 100));
  }

  function skip(seconds) {
    if (!audio) return;
    const newTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
    audio.currentTime = newTime;
    drawWaveform();
    voCurrentTime.textContent = formatTime(newTime);
  }

  function setVolume(value) {
    if (audio) audio.volume = parseFloat(value);
  }

  function setSpeed(speed) {
    if (audio) audio.playbackRate = parseFloat(speed);
    voSpeedBtn.textContent = speed + 'x';
    voSpeedMenu.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.speed === speed);
    });
  }

  // ============================================
  // Focus Trap
  // ============================================
  function getFocusableElements() {
    return Array.prototype.slice.call(voModal.querySelectorAll(
      'button:not([hidden]):not([disabled]), input:not([hidden]):not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // ============================================
  // Event Listeners
  // ============================================
  voPlayPauseBtn.addEventListener('click', togglePlay);
  voSkipBackBtn.addEventListener('click', () => skip(-10));
  voSkipFwdBtn.addEventListener('click', () => skip(10));
  voVolumeSlider.addEventListener('input', e => setVolume(e.target.value));

  // Speed control
  voSpeedBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isExpanded = voSpeedBtn.getAttribute('aria-expanded') === 'true';
    voSpeedMenu.hidden = isExpanded;
    voSpeedBtn.setAttribute('aria-expanded', String(!isExpanded));
  });

  voSpeedMenu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      setSpeed(btn.dataset.speed);
      voSpeedMenu.hidden = true;
      voSpeedBtn.setAttribute('aria-expanded', 'false');
      voSpeedBtn.focus();
    });
  });

  // Close speed menu on outside click
  document.addEventListener('click', e => {
    if (!voSpeedMenu.hidden && !voSpeedBtn.contains(e.target) && !voSpeedMenu.contains(e.target)) {
      voSpeedMenu.hidden = true;
      voSpeedBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Modal close
  voCloseBtn.addEventListener('click', () => closeModal(true));
  voOverlay.addEventListener('click', () => closeModal(true));

  // Waveform interaction (mouse)
  voCanvas.addEventListener('mousedown', e => {
    isDragging = true;
    seekToPosition(e.clientX);
  });

  document.addEventListener('mousemove', e => {
    if (isDragging) seekToPosition(e.clientX);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Waveform interaction (touch)
  voCanvas.addEventListener('touchstart', e => {
    if (e.touches.length > 0) seekToPosition(e.touches[0].clientX);
  }, { passive: true });

  voCanvas.addEventListener('touchmove', e => {
    if (e.touches.length > 0) {
      e.preventDefault();
      seekToPosition(e.touches[0].clientX);
    }
  }, { passive: false });

  // Keyboard support
  voModal.addEventListener('keydown', e => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeModal(true);
        break;
      case ' ':
        if (document.activeElement !== voVolumeSlider) {
          e.preventDefault();
          togglePlay();
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skip(-10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        skip(10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (audio) {
          audio.volume = Math.min(1, audio.volume + 0.1);
          voVolumeSlider.value = audio.volume;
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (audio) {
          audio.volume = Math.max(0, audio.volume - 0.1);
          voVolumeSlider.value = audio.volume;
        }
        break;
      case 'Tab':
        trapFocus(e);
        break;
    }
  });

  // Redraw waveform on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (voModal.classList.contains('active')) {
        resizeCanvas();
        drawWaveform();
      }
    }, 250);
  });

  // Stop audio and close the player modal (used on SPA navigation)
  function stopVoiceOver() {
    if (voModal.classList.contains('active')) {
      closeModal(false);
    } else if (audio && !audio.paused) {
      audio.pause();
      showPlayIcon();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  }

  // Stop audio when navigating away via [data-nav]
  document.addEventListener('click', e => {
    const navItem = e.target.closest('[data-nav]');
    if (navItem && navItem.dataset.nav !== 'voiceover') {
      stopVoiceOver();
    }
  }, true); // capture phase — runs before existing nav handlers

  // Pause audio when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audio && !audio.paused) {
      audio.pause();
      showPlayIcon();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  });

  // SPA router hooks: lazy-load on first visit of the Voice Over page,
  // stop playback when navigating via browser back/forward.
  let voLoaded = false;
  document.addEventListener('pp:load-voiceovers', () => {
    if (voLoaded) return;
    voLoaded = true;
    loadVoiceOvers();
  });
  document.addEventListener('pp:stop-voiceover', stopVoiceOver);
})();

// ============================================
// PREMIUM IMAGE FADE-IN
// Fades in images smoothly after load (no layout shift)
// Handles existing + dynamically created images via MutationObserver
// ============================================
(function() {
  function fadeIn(img) {
    if (!img.src || img.src === '') return;
    if (img.hasAttribute('fetchpriority')) return;
    if (img.classList.contains('pp-img-fade')) return;

    img.classList.add('pp-img-fade');

    if (img.complete && img.naturalWidth > 0) {
      requestAnimationFrame(() => img.classList.add('pp-img-loaded'));
    } else {
      img.addEventListener('load', () => img.classList.add('pp-img-loaded'), { once: true });
      img.addEventListener('error', () => img.classList.add('pp-img-loaded'), { once: true });
    }
  }

  function processImages(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('img').forEach(fadeIn);
  }

  // Process existing images
  processImages(document);

  // Watch for dynamically added images (model cards, buyer cards, VO cards)
  const imgObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IMG') {
          fadeIn(node);
        } else if (node.querySelectorAll) {
          processImages(node);
        }
      });
    });
  });

  imgObserver.observe(document.body, { childList: true, subtree: true });
})();

// ============================================
// PATTERN WATERMARK — Repeating diagonal "Photography Pixel" text overlay
// Additional video protection layer. Does NOT replace existing protection.
// ============================================
(function() {
  'use strict';

  // SVG tile: two rows of "Photography Pixel" offset for diagonal effect.
  // Combined with CSS rotation on the overlay, creates a dense diagonal pattern.
  var SVG_TILE = '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="80">' +
    '<text x="10" y="28" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="bold">Photography Pixel</text>' +
    '<text x="150" y="68" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="bold">Photography Pixel</text>' +
    '</svg>';

  var BG_IMAGE = 'url("data:image/svg+xml,' + encodeURIComponent(SVG_TILE) + '")';
  var CONTAINER_SELECTOR = '.reel-card';
  var WATERMARK_CLASS = 'pp-pattern-watermark';

  // -- Create watermark overlay if missing in container --
  function ensureWatermark(container) {
    if (!container || !container.querySelector) return;
    if (container.querySelector('.' + WATERMARK_CLASS)) return;
    var overlay = document.createElement('div');
    overlay.className = WATERMARK_CLASS;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.backgroundImage = BG_IMAGE;
    container.appendChild(overlay);
  }

  // -- Apply watermarks to all video containers --
  function applyWatermarks(root) {
    (root || document).querySelectorAll(CONTAINER_SELECTOR).forEach(ensureWatermark);
  }

  // -- Anti-removal & dynamic container detection --
  var domObserver = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      var j, node;

      // Recreate watermarks that were removed from the DOM
      for (j = 0; j < m.removedNodes.length; j++) {
        node = m.removedNodes[j];
        if (node.nodeType !== 1) continue;
        if (node.classList && node.classList.contains(WATERMARK_CLASS)) {
          ensureWatermark(m.target);
        }
        if (node.querySelectorAll) applyWatermarks(node);
      }

      // Add watermarks to new video containers
      for (j = 0; j < m.addedNodes.length; j++) {
        node = m.addedNodes[j];
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(CONTAINER_SELECTOR)) ensureWatermark(node);
        if (node.querySelectorAll) {
          applyWatermarks(node);
        }
      }
    }
  });

  // -- Dynamic behavior: subtle changes every 8-12 seconds --
  var dynamicTimer = null;
  function startDynamicBehavior() {
    function update() {
      var overlays = document.querySelectorAll('.' + WATERMARK_CLASS);
      if (overlays.length) {
        var opacity = (0.08 + Math.random() * 0.07).toFixed(3);
        var rotation = (-30 + Math.random() * 10).toFixed(1);
        var posX = Math.round(Math.random() * 30 - 15) + 'px';
        var posY = Math.round(Math.random() * 30 - 15) + 'px';
        for (var i = 0; i < overlays.length; i++) {
          overlays[i].style.setProperty('--pp-wm-opacity', opacity);
          overlays[i].style.setProperty('--pp-wm-rotation', rotation + 'deg');
          overlays[i].style.setProperty('--pp-wm-x', posX);
          overlays[i].style.setProperty('--pp-wm-y', posY);
        }
      }
      dynamicTimer = setTimeout(update, 8000 + Math.random() * 4000);
    }
    update();
  }

  // -- Initialize --
  function init() {
    applyWatermarks();
    startDynamicBehavior();
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
