/**
 * Prerender Script — Photography Pixel
 *
 * Reads index.html as a template and generates static HTML for every
 * public route with unique <title>, meta description, canonical URL,
 * Open Graph tags, Twitter Cards, BreadcrumbList JSON-LD, and
 * VideoObject JSON-LD (for video category pages).
 *
 * Run:  node build.mjs
 * Output: /<route>/index.html for each route
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://photographypixell.com';

// ── Helpers ──────────────────────────────────────────────

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getConfig(slug, key, fallback) {
  const cat = config.categories && config.categories[slug];
  if (!cat) return fallback;
  const val = cat[key];
  return (val !== undefined && val !== '') ? val : fallback;
}

function getStaticConfig(page, key, fallback) {
  const sp = config._static_pages || {};
  const entry = sp[page];
  if (!entry) return fallback;
  const val = entry[key];
  return (val !== undefined && val !== '') ? val : fallback;
}

function readVideoUrls(txtFile) {
  try {
    const text = fs.readFileSync(path.join(__dirname, 'data', txtFile), 'utf-8');
    const seen = new Set();
    const urls = [];
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const url = line.trim();
      if (!url || !url.startsWith('https://')) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    return urls;
  } catch {
    return [];
  }
}

function generateVideoSchema(videos, categoryLabel) {
  if (!videos || videos.length === 0) return null;
  // Honest, valid VideoObject entries: no invented titles, thumbnails,
  // dates, durations or direct-video URLs. Bamboo embed URLs are exposed
  // only as embedUrl (player URL), never as contentUrl/encodingFormat.
  const graph = videos.map((url, i) => {
    return {
      '@type': 'VideoObject',
      name: `${categoryLabel} Video ${String(i + 1).padStart(2, '0')} — Photography Pixel`,
      description: `${categoryLabel} video by Photography Pixel — وكالة تصوير وتسويق رقمي في أيت ملول - أكادير.`,
      embedUrl: url,
      inLanguage: 'ar'
    };
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}

// ── Read template & config ──────────────────────────────

const baseHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'config.json'), 'utf-8'));

// ── Route definitions ───────────────────────────────────

const DEFAULT_TITLE = getStaticConfig('home', 'seoTitle', 'Photography Pixel | وكالة تصوير وتسويق رقمي في أيت ملول - أكادير');
const DEFAULT_DESC = getStaticConfig('home', 'seoDescription', 'Photography Pixel: وكالة تصوير وتسويق رقمي متخصصة في صناعة المحتوى، تصوير المنتجات، المحلات التجارية، فيديوهات UGC والأعراس في أيت ملول - أكادير.');

const staticRoutes = [
  {
    route: '', page: 'home',
    title: getStaticConfig('home', 'seoTitle', DEFAULT_TITLE),
    desc: getStaticConfig('home', 'seoDescription', DEFAULT_DESC),
    crumb: getStaticConfig('home', 'crumb', 'Home')
  },
  {
    route: 'portfolio', page: 'home-portfolio',
    title: getStaticConfig('home-portfolio', 'seoTitle', 'Portfolio | Photography Pixel'),
    desc: getStaticConfig('home-portfolio', 'seoDescription', 'استعرض أحدث أعمالنا الإبداعية: فيديوهات UGC، تصوير، محلات تجارية، أعراس وخدمات احترافية في أيت ملول - أكادير.'),
    crumb: getStaticConfig('home-portfolio', 'crumb', 'Portfolio')
  },
  {
    route: 'contact', page: 'home-contact',
    title: getStaticConfig('home-contact', 'seoTitle', 'Contact | Photography Pixel'),
    desc: getStaticConfig('home-contact', 'seoDescription', 'تواصل مع وكالة Photography Pixel لخدمات التصوير والتسويق الرقمي في أيت ملول - أكادير. واتساب، إنستغرام، بريد إلكتروني.'),
    crumb: getStaticConfig('home-contact', 'crumb', 'Contact')
  },
  {
    route: 'equipment', page: 'equipment',
    title: getStaticConfig('equipment', 'seoTitle', 'Equipment | Photography Pixel'),
    desc: getStaticConfig('equipment', 'seoDescription', 'تعرف على معدات الاستوديو الاحترافية المستخدمة في وكالة Photography Pixel.'),
    crumb: getStaticConfig('equipment', 'crumb', 'Equipment')
  },
  {
    route: 'model', page: 'models',
    title: getConfig('models', 'seoTitle', 'Models | Photography Pixel'),
    desc: getConfig('models', 'seoDescription', 'تعرف على موديلات الاستوديو المتاحة للحجز من وكالة Photography Pixel في أيت ملول - أكادير.'),
    crumb: getConfig('models', 'label', 'Model')
  },
  {
    route: 'media-buyer', page: 'media-buyer',
    title: getConfig('media-buyer', 'seoTitle', 'Media Buyer | Photography Pixel'),
    desc: getConfig('media-buyer', 'seoDescription', 'معرض الحملات الإعلانية وأدائها من وكالة Photography Pixel — نتائج قياسية على منصات التواصل الاجتماعي.'),
    crumb: getConfig('media-buyer', 'label', 'Media Buyer')
  },
  {
    route: 'voice-over', page: 'voiceover',
    title: getConfig('voiceover', 'seoTitle', 'Voice Over | Photography Pixel'),
    desc: getConfig('voiceover', 'seoDescription', 'خدمات التعليق الصوتي الاحترافي بالعربية من وكالة Photography Pixel — للإعلانات، الوثائقيات، والمحتوى المؤسسي.'),
    crumb: getConfig('voiceover', 'label', 'Voice Over')
  }
];

const categoryDefs = [
  { route: 'ugc',      page: 'cat-ugc',      slug: 'ugc',      txt: 'ugc.txt',      label: 'UGC' },
  { route: 'shooting', page: 'cat-shoting',  slug: 'shoting',  txt: 'shooting.txt',  label: 'Shooting' },
  { route: 'stores',   page: 'cat-stores',   slug: 'stores',   txt: 'stores.txt',   label: 'Stores' },
  { route: 'events',   page: 'cat-events',   slug: 'events',   txt: 'events.txt',   label: 'Events' },
  { route: 'services', page: 'cat-services', slug: 'services', txt: 'services.txt', label: 'Services' },
  { route: 'gallery',  page: 'cat-gallery',  slug: 'gallery',  txt: 'gallery.txt',  label: 'Gallery' },
  { route: 'drone',    page: 'cat-drone',    slug: 'drone',    txt: 'drone.txt',    label: 'Locations' }
];

const categoryRoutes = categoryDefs.map(def => {
  const videos = readVideoUrls(def.txt);
  return {
    ...def,
    title: getConfig(def.slug, 'seoTitle', `${def.label} | Photography Pixel`),
    desc: getConfig(def.slug, 'seoDescription', `${def.label} videos by Photography Pixel.`),
    crumb: getConfig(def.slug, 'label', def.label),
    heading: getConfig(def.slug, 'title', def.label),
    subtitle: getConfig(def.slug, 'subtitle', `${def.label} Videos`),
    videos
  };
});

// ── HTML generation ─────────────────────────────────────

// Arabic-first category intro copy (grounded in actual services only).
// Rendered on each category page to reinforce geo + service keywords.
const categoryIntroCopy = {
  ugc: 'فيديوهات UGC (محتوى المُنشئين) ننتجها للعلامات التجارية والمتاجر في أكادير والمغرب — محتوى إبداعي يقدّم المنتجات بشكل طبيعي يناسب الإعلانات ووسائل التواصل.',
  shoting: 'تصوير احترافي للمنتجات والشخصي والملابس في أكادير والمغرب. محتوى بصري متكامل يساعد المتاجر والعلامات التجارية على عرض منتجاتها في الإعلانات والمتاجر الإلكترونية.',
  stores: 'فيديوهات تصوير المحلات التجارية والمتاجر في المغرب — محتوى بصري احترافي يساعد المحلات على عرض منتجاتها وخدماتها بشكل جذاب.',
  events: 'تصوير الأعراس والمناسبات في أكادير والمغرب — تغطية كاملة للحدث بجودة سينمائية عالية.',
  services: 'إنتاج فيديو تسويقي للشركات والمؤسسات في أكادير والمغرب — من التصوير إلى التسليم، لفيديوهات إعلانية وعروض ومحتوى مؤسسي احترافي.',
  drone: 'تصوير المواقع والأماكن في أكادير والمغرب — لقطات سينمائية احترافية لإبراز مواقع وأماكن التصوير بدقة عالية.',
  gallery: null
};

function generateCategoryLinks(excludeRoute) {
  const links = [];
  for (const def of categoryDefs) {
    if (def.route === excludeRoute) continue;
    const label = getConfig(def.slug, 'label', def.label);
    links.push(`            <a href="/${def.route}" class="seo-link">${escapeAttr(label)}</a>`);
  }
  links.push(`            <a href="/model" class="seo-link">Model</a>`);
  links.push(`            <a href="/media-buyer" class="seo-link">Media Buyer</a>`);
  links.push(`            <a href="/voice-over" class="seo-link">Voice Over</a>`);
  links.push(`            <a href="/equipment" class="seo-link">Equipment</a>`);
  links.push(`            <a href="/contact" class="seo-link">Contact</a>`);
  return links;
}

function generateRouteHtml(route) {
  let html = baseHtml;
  const canonical = route.route ? `${BASE_URL}/${route.route}` : `${BASE_URL}/`;

  // 1. <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(route.title)}</title>`);

  // 2. meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escapeAttr(route.desc)}"`
  );

  // 2b. /gallery has no real content yet — keep the route usable but exclude
  // it from search indexes until real gallery content is added.
  if (route.page === 'cat-gallery') {
    html = html.replace(
      /<meta name="robots" content="[^"]*"/,
      '<meta name="robots" content="noindex, follow"'
    );
  }

  // 3. canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${canonical}"`
  );

  // 4. Open Graph
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${escapeAttr(route.title)}"`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${escapeAttr(route.desc)}"`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${canonical}"`
  );

  // 5. Twitter
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${escapeAttr(route.title)}"`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${escapeAttr(route.desc)}"`
  );

  // 6. BreadcrumbList JSON-LD
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: route.crumb, item: canonical }
    ]
  };
  const breadcrumbJson = JSON.stringify(breadcrumb, null, 4);
  html = html.replace(
    /<script type="application\/ld\+json">\s*\{(?:(?!<\/script>)[\s\S])*?"@type":\s*"BreadcrumbList"(?:(?!<\/script>)[\s\S])*?\}\s*<\/script>/,
    `<script type="application/ld+json">\n    ${breadcrumbJson}\n    </script>`
  );

  // 7. VideoObject JSON-LD (category pages with videos)
  if (route.videos && route.videos.length > 0) {
    const videoSchema = generateVideoSchema(route.videos, route.label);
    if (videoSchema) {
      const videoJson = JSON.stringify(videoSchema, null, 2);
      // Insert before </head>, after the last existing JSON-LD block
      html = html.replace(
        /(\s*<\/head>)/,
        `\n    <script type="application/ld+json">\n${videoJson}\n    </script>$1`
      );
    }
  }

  // 8. Set active page-view div
  if (route.page === 'home-portfolio') {
    // Inject a distinct, category-catalog portfolio intro so /portfolio is
    // unique content (not a near-duplicate of the homepage). Video counts are
    // real (computed from data/*.txt at build time) — nothing is fabricated.
    const catLinks = generateCategoryLinks('portfolio');
    const catalogItems = [];
    for (const cat of categoryRoutes) {
      if (cat.slug === 'gallery') continue; // no content yet
      const count = cat.videos ? cat.videos.length : 0;
      const label = escapeAttr(getConfig(cat.slug, 'label', cat.label));
      const desc = escapeAttr(getConfig(cat.slug, 'seoDescription', `${cat.label} videos by Photography Pixel.`));
      catalogItems.push(
        `          <div class="seo-catalog-item">`,
        `            <h3 class="seo-catalog-title"><a href="/${cat.route}">${label}</a></h3>`,
        `            <p class="seo-catalog-text">${desc}</p>`,
        `            <span class="seo-catalog-count">${count} فيديو</span>`,
        `          </div>`
      );
    }
    const portfolioIntro = [
      `      <section class="seo-content-section reveal" id="portfolio-intro">`,
      `        <h2 class="seo-content-heading">تصفح معرض الأعمال حسب الفئة</h2>`,
      `        <p class="seo-content-text">Photography Pixel وكالة تصوير وتسويق رقمي في أيت ملول - أكادير، المغرب. اختر فئة من فئات الأعمال أدناه للاطلاع على أمثلة حقيقية من أعمالنا، أو تواصل معنا مباشرة لتخطيط مشروعك.</p>`,
      `        <div class="seo-catalog">`,
      ...catalogItems,
      `        </div>`,
      `        <p class="seo-content-text">خدمات إضافية: <a class="seo-inline-link" href="/model">استوديو الموديلات</a>، <a class="seo-inline-link" href="/media-buyer">إدارة الحملات الإعلانية</a>، <a class="seo-inline-link" href="/voice-over">التعليق الصوتي</a>، <a class="seo-inline-link" href="/equipment">معداتنا</a>.</p>`,
      `        <nav class="seo-links-nav" aria-label="الفئات">`,
      ...catLinks,
      `        </nav>`,
      `      </section>`
    ].join('\n');
    html = html.replace(
      /\s*<!-- Video category pages are dynamically generated by script\.js -->\s*\n\s*<\/main>/,
      `\n${portfolioIntro}\n    </main>`
    );
  } else if (route.page === 'home-contact') {
    // Inject contact info section before </main> for unique content
    const contactInfo = [
      `      <section class="seo-content-section reveal" id="contact-info">`,
      `        <h2 class="seo-content-heading">تواصل مع Photography Pixel</h2>`,
      `        <p class="seo-content-text">وكالة Photography Pixel لخدمات التصوير والتسويق الرقمي في أيت ملول - أكادير، المغرب. نقدم خدمات تصوير المنتجات، المحلات التجارية، الأعراس، فيديوهات UGC، والحملات الإعلانية.</p>`,
      `        <div class="seo-contact-grid">`,
      `          <a href="https://wa.me/212663493003" class="seo-contact-item" target="_blank" rel="noreferrer noopener">`,
      `            <span class="seo-contact-label">WhatsApp</span>`,
      `            <span class="seo-contact-value">+212 663 493 003</span>`,
      `          </a>`,
      `          <a href="https://www.instagram.com/photographypixell" class="seo-contact-item" target="_blank" rel="noreferrer noopener">`,
      `            <span class="seo-contact-label">Instagram</span>`,
      `            <span class="seo-contact-value">@photographypixell</span>`,
      `          </a>`,
      `          <a href="mailto:photographypexil@gmail.com" class="seo-contact-item">`,
      `            <span class="seo-contact-label">Email</span>`,
      `            <span class="seo-contact-value">photographypexil@gmail.com</span>`,
      `          </a>`,
      `        </div>`,
      `        <p class="seo-content-text">العنوان: أيت ملول - أكادير، المغرب. ساعات العمل: الإثنين - السبت، 9:00 صباحاً - 7:00 مساءً.</p>`,
      `      </section>`
    ].join('\n');
    html = html.replace(
      /\s*<!-- Video category pages are dynamically generated by script\.js -->\s*\n\s*<\/main>/,
      `\n${contactInfo}\n    </main>`
    );
  } else if (route.page === 'home') {
    // Homepage — no change needed
  } else if (route.page.startsWith('cat-')) {
    // Remove active from page-home
    html = html.replace(
      'class="page-view active" id="page-home"',
      'class="page-view" id="page-home"'
    );

    // Remove the homepage H1 (its page-view is hidden on category routes,
    // so exactly one H1 remains on the page — the category heading below).
    html = html.replace('<h1>Photography Pixel</h1>', '');

    // Inject category page-view div before </main>
    const slug = route.page.slice(4);
    const hasVideos = route.videos && route.videos.length > 0;
    const catLinks = generateCategoryLinks(route.route);
    const catHtml = [
      `      <div class="page-view active" id="page-${route.page}" data-page="${route.page}">`,
      `        <section class="sub-page-section reveal">`,
      `          <h1 class="sub-page-heading">${escapeAttr(route.heading)}</h1>`,
      `          <p class="sub-page-subtitle">${escapeAttr(route.subtitle)}</p>`,
      `          <p class="seo-description">${escapeAttr(route.desc)}</p>`,
      `          <div class="video-grid" data-panel="${slug}-full" id="grid-cat-${slug}"></div>`
    ];

    const introCopy = categoryIntroCopy[slug];
    if (introCopy) {
      catHtml.push(
        `          <p class="seo-content-text">${introCopy} <a class="seo-inline-link" href="/contact">للحجز والاستفسار، تواصل معنا</a>.</p>`
      );
    }

    if (!hasVideos) {
      catHtml.push(
        `          <div class="seo-empty-notice">`,
        `            <p>جاري تحديث هذه الصفحة بمحتوى جديد. استعرض فئات أخرى من أعمالنا:</p>`,
        `          </div>`
      );
    }

    catHtml.push(
      `          <nav class="seo-links-nav" aria-label="الفئات">`,
      ...catLinks,
      `          </nav>`,
      `        </section>`,
      `      </div>`
    );

    html = html.replace(
      /\s*<!-- Video category pages are dynamically generated by script\.js -->\s*\n\s*<\/main>/,
      `\n${catHtml.join('\n')}\n    </main>`
    );
  } else {
    // Static pages: swap active class
    html = html.replace(
      'class="page-view active" id="page-home"',
      'class="page-view" id="page-home"'
    );
    html = html.replace(
      `class="page-view" id="page-${route.page}"`,
      `class="page-view active" id="page-${route.page}"`
    );

    // Remove the homepage H1 (its page-view is hidden on static sub-routes).
    // Its short heading would otherwise be read as the page's only H1.
    html = html.replace('<h1>Photography Pixel</h1>', '');

    // Promote the active route's heading from <h2> to <h1> so each page has
    // exactly one H1. Styling is class-based (.sub-page-heading) and a
    // universal reset zeroes heading margins — visual output is unchanged.
    if (route.page === 'models') {
      html = html.replace(
        '<h2 class="sub-page-heading">المودل</h2>',
        '<h1 class="sub-page-heading">المودل</h1>'
      );
    } else if (route.page === 'media-buyer') {
      html = html.replace(
        '<h2 class="sub-page-heading">Media Buyer</h2>',
        '<h1 class="sub-page-heading">Media Buyer</h1>'
      );
    } else if (route.page === 'equipment') {
      html = html.replace(
        '<h2 class="sub-page-heading">معداتنا</h2>',
        '<h1 class="sub-page-heading">معداتنا</h1>'
      );
    } else if (route.page === 'voiceover') {
      html = html.replace(
        '<h2 class="sub-page-heading reveal reveal-delay-1">Voice Over</h2>',
        '<h1 class="sub-page-heading reveal reveal-delay-1">Voice Over</h1>'
      );
    }

    // Inject unique SEO content for each static page
    const catLinks = generateCategoryLinks(route.route);
    let seoSection = '';

    if (route.page === 'models') {
      seoSection = [
        `      <section class="seo-content-section active" id="seo-models">`,
        `        <h2 class="seo-content-heading">استوديو موديلات Photography Pixel</h2>`,
        `        <p class="seo-content-text">موديلات احترافية متاحة للحجز في أكادير وأيت ملول. نوفّر موديلات لجميع أنواع التصوير: UGC، تصوير المنتجات، الجلسات الإعلانية، الأعراس، والفعاليات. جميع الموديلات لديهم خبرة في التصوير الاحترافي ومتاحون للحجز الفوري عبر واتساب.</p>`,
        `        <p class="seo-content-text">لحجز موديل، تواصل معنا عبر واتساب: +212 663 493 003 أو عبر صفحة <a href="/contact" class="seo-inline-link">تواصل معنا</a>.</p>`,
        `        <nav class="seo-links-nav" aria-label="الفئات">`,
        ...catLinks,
        `        </nav>`,
        `      </section>`
      ].join('\n');
    } else if (route.page === 'media-buyer') {
      seoSection = [
        `      <section class="seo-content-section active" id="seo-media-buyer">`,
        `        <h2 class="seo-content-heading">إدارة الحملات الإعلانية — Photography Pixel</h2>`,
        `        <p class="seo-content-text">خدمات إدارة الحملات الإعلانية على فيسبوك وإنستغرام. نتائج قياسية في جلب العملاء عبر واتساب والمبيعات المباشرة. نستخدم استهدافاً دقيقاً وإبداعياً للوصول إلى الجمهور المناسب لمنتجك أو خدمتك في المغرب.</p>`,
        `        <p class="seo-content-text">نتائجنا تشمل: حملات بـ ROAS تصل إلى 6.1x، أكثر من 350 رسالة لكل حملة، واستهداف جغرافي دقيق لأكادير وأيت ملول والمناطق المحيطة.</p>`,
        `        <nav class="seo-links-nav" aria-label="الفئات">`,
        ...catLinks,
        `        </nav>`,
        `      </section>`
      ].join('\n');
    } else if (route.page === 'equipment') {
      seoSection = [
        `      <section class="seo-content-section active" id="seo-equipment">`,
        `        <h2 class="seo-content-heading">معدات الاستوديو الاحترافية — Photography Pixel</h2>`,
        `        <p class="seo-content-text">نستخدم معدات احترافية متطورة لضمان أعلى جودة في جميع أعمالنا. تشمل معداتنا كاميرات احترافية، عدسات متخصصة، إضاءة استوديو، معدات صوتية، واجهزة تصوير جوي (درون). جميع المعدات تتيح لنا تقديم محتوى بصري بجودة سينمائية.</p>`,
        `        <p class="seo-content-text">سواء كنت تحتاج إلى تصوير منتجات، محلات تجارية، أو فيديوهات UGC، فإن معداتنا توفر نتائج احترافية تلبي متطلبات العلامات التجارية والشركات في المغرب.</p>`,
        `        <nav class="seo-links-nav" aria-label="الفئات">`,
        ...catLinks,
        `        </nav>`,
        `      </section>`
      ].join('\n');
    } else if (route.page === 'voiceover') {
      seoSection = [
        `      <section class="seo-content-section active" id="seo-voiceover">`,
        `        <h2 class="seo-content-heading">التعليق الصوتي الاحترافي — Photography Pixel</h2>`,
        `        <p class="seo-content-text">خدمات تعليق صوتي احترافي بالعربية لجميع أنواع المحتوى: الإعلانات التجارية، الوثائقيات، المحتوى المؤسسي، ومحتوى التواصل الاجتماعي. نقدم جودة عالية مع إمكانية التحكم في النبرة والإيقاع حسب طبيعة المحتوى.</p>`,
        `        <p class="seo-content-text">تشمل خدماتنا: التعليق الصوتي للإعلانات، الأفلام القصيرة، العروض التقديمية، ومحتوى يوتيوب. تواصل معنا للاستماع لعينات صوتية ولحجز جلسة تسجيل.</p>`,
        `        <nav class="seo-links-nav" aria-label="الفئات">`,
        ...catLinks,
        `        </nav>`,
        `      </section>`
      ].join('\n');
    }

    if (seoSection) {
      html = html.replace(
        /\s*<!-- Video category pages are dynamically generated by script\.js -->\s*\n\s*<\/main>/,
        `\n${seoSection}\n    </main>`
      );
    }
  }

  return html;
}

// ── Sitemap generation ──────────────────────────────────

function generateSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const entries = [];

  // Homepage
  entries.push({ loc: `${BASE_URL}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' });

  // Portfolio (high priority)
  entries.push({ loc: `${BASE_URL}/portfolio`, lastmod: today, changefreq: 'weekly', priority: '0.9' });

  // Category pages with videos
  for (const route of categoryRoutes) {
    const hasVideos = route.videos && route.videos.length > 0;
    entries.push({
      loc: `${BASE_URL}/${route.route}`,
      lastmod: today,
      changefreq: hasVideos ? 'weekly' : 'monthly',
      priority: hasVideos ? '0.8' : '0.6'
    });
  }

  // Static pages
  for (const route of staticRoutes) {
    if (route.route === '' || route.route === 'portfolio') continue; // Already added
    entries.push({
      loc: `${BASE_URL}/${route.route}`,
      lastmod: today,
      changefreq: 'monthly',
      priority: route.route === 'contact' ? '0.6' : '0.7'
    });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];

  for (const e of entries) {
    xml.push('  <url>');
    xml.push(`    <loc>${e.loc}</loc>`);
    xml.push(`    <lastmod>${e.lastmod}</lastmod>`);
    xml.push(`    <changefreq>${e.changefreq}</changefreq>`);
    xml.push(`    <priority>${e.priority}</priority>`);
    xml.push('  </url>');
  }

  xml.push('</urlset>');
  return xml.join('\n') + '\n';
}

// ── Build all routes ─────────────────────────────────────

const allRoutes = [...staticRoutes, ...categoryRoutes];
let generated = 0;

console.log('\n━━━ Photography Pixel — Prerender Build ━━━\n');

for (const route of allRoutes) {
  // Skip homepage — already in root
  if (route.route === '') {
    console.log(`  ✓ / (homepage — already in root, no file generated)`);
    continue;
  }

  const html = generateRouteHtml(route);
  const outputDir = path.join(__dirname, route.route);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf-8');
  generated++;

  const videoCount = route.videos ? ` — ${route.videos.length} VideoObjects` : '';
  console.log(`  ✓ /${route.route}/index.html${videoCount}`);
}

console.log(`\n  ${generated} prerendered pages generated.\n`);

// ── Generate sitemap.xml ────────────────────────────────
const sitemapXml = generateSitemap();
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemapXml, 'utf-8');
console.log(`  ✓ sitemap.xml updated (${allRoutes.length} URLs)\n`);
