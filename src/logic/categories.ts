// Guesses each spec's category. No upstream source files specs by topic, so this reads what upstream does say about a
// spec, in order, and takes the first answer: a few core specs by name; a title about animation; a working group whose
// name gives the topic away; the organization; keywords in the shortname and title; the web-features group most of the
// spec's features belong to; the other working groups; and WHATWG's own specs. A spec none of those place is Other.
import type { SpecLike } from './rows.ts';

export const CATEGORIES = [
  'Accessibility', 'Animation', 'CSS', 'Core', 'Debugging and reporting', 'Devices and sensors', 'Events', 'Forms and editing',
  'Graphics and typography', 'HTTP and networking', 'JavaScript', 'Machine learning', 'Media', 'Mixed reality', 'Payments and identity',
  'Performance', 'Platform interaction', 'Real-time communication', 'Security and privacy', 'Storage and files', 'Testing and automation',
  'WebAssembly', 'Workers and offline', 'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

// The specs the rest of the platform is built on, which no group or keyword picks out on its own.
const CORE = new Set(['dom', 'html', 'infra', 'url', 'urlpattern', 'encoding', 'webidl', 'streams', 'mimesniff', 'quirks', 'compat', 'DOM-Parsing', 'compression', 'observable']);

// Checked before the CSS Working Group, which publishes most of the specs these words pick out.
const ANIMATION = ['animation', 'transition'];

// Groups whose names say the topic outright, so they win over any keyword in a title.
const STRONG_GROUPS: Record<string, Category> = {
  'Cascading Style Sheets (CSS) Working Group': 'CSS',
  TC39: 'JavaScript',
  'WebAssembly Working Group': 'WebAssembly',
  'WebAssembly Community Group': 'WebAssembly',
  'Immersive Web Working Group': 'Mixed reality',
  'Immersive Web Community Group': 'Mixed reality',
  'Accessible Rich Internet Applications Working Group': 'Accessibility',
  'SVG Accessibility Task Force': 'Accessibility',
};

// Organizations that publish specs on one topic.
const ORGS: Record<string, Category> = {
  'Khronos Group': 'Graphics and typography',
  'Ecma International': 'JavaScript',
  IETF: 'HTTP and networking',
  'Alliance for Open Media': 'Media',
  'ISO/IEC': 'Media',
};

// Keywords for the topics that cut across groups, which the Web Platform Incubator Community Group's specs depend on. A
// word matches a whole word of the shortname or title; a part matches anywhere in them. The order settles a spec that
// two rules would claim, so a specific topic comes before a broad one.
interface Rule {
  category: Category;
  words?: readonly string[];
  parts?: readonly string[];
}

const KEYWORDS: readonly Rule[] = [
  { category: 'Accessibility', words: ['aria', 'wai'], parts: ['-aam', 'accname', 'accessib'] },
  { category: 'Payments and identity', words: ['webauthn', 'fedcm', 'identity', 'login', 'authentication', 'otp'], parts: ['payment', 'credential', 'one-time-code', 'email-verification'] },
  {
    category: 'Devices and sensors',
    words: ['bluetooth', 'usb', 'webusb', 'serial', 'webhid', 'hid', 'gamepad', 'sensor', 'sensors', 'accelerometer', 'gyroscope', 'magnetometer', 'geolocation', 'battery', 'vibration', 'nfc', 'webnfc'],
    parts: ['wake-lock', 'wakelock', 'compute-pressure', 'ambient-light', 'device-posture', 'idle-detection', 'deviceorientation', 'web-serial', 'geolocation', 'sensor'],
  },
  { category: 'Workers and offline', parts: ['service-worker', 'serviceworker', 'service worker', 'background-sync', 'background-fetch', 'periodic-background', 'content-index'] },
  {
    category: 'Security and privacy',
    words: ['csp', 'security', 'integrity', 'sanitizer', 'privacy', 'fingerprinting', 'tracking', 'topics', 'attribution', 'isolation', 'cors', 'webcrypto', 'cryptography'],
    parts: ['document-policy', 'trust-token', 'private state', 'content-security', 'mixed-content', 'trusted-types', 'secure-contexts', 'permissions-policy', 'fetch-metadata', 'private-network', 'storage-access', 'private-state', 'shared-storage', 'fenced', 'protected-audience', 'turtledove', 'related-website', 'first-party'],
  },
  { category: 'Storage and files', words: ['indexeddb', 'storage', 'filesystem', 'entries'], parts: ['file-api', 'fileapi', 'file-system', 'file api', 'web-locks', 'cookie-store', 'storage-buckets'] },
  { category: 'Debugging and reporting', words: ['console', 'reporting', 'crash', 'deprecation', 'intervention'], parts: ['network-error', 'self-profiling'] },
  {
    category: 'Performance',
    words: ['timing', 'performance', 'longtasks', 'preload', 'prefetch', 'prerender', 'prerendering', 'speculation', 'priority'],
    parts: ['long-tasks', 'resource-hints', 'idlecallback', 'idle-callback', 'layout-instability', 'largest-contentful', 'compile-hints', 'scheduling', 'input-pending'],
  },
  { category: 'Real-time communication', words: ['webrtc'], parts: ['mst-content-hint'] },
  {
    category: 'Events',
    words: ['pointerevents', 'uievents', 'touch', 'keyboard', 'pointer', 'scrollend'],
    parts: ['pointer-events', 'ui-events', 'touch-events', 'input-events', 'input-device', 'pointerlock', 'keyboard-lock', 'keyboard-map', 'overscroll'],
  },
  { category: 'Forms and editing', words: ['clipboard', 'selection', 'editing', 'editcontext', 'execcommand', 'forms', 'autofill', 'contenteditable'], parts: ['edit-context'] },
  {
    category: 'Graphics and typography',
    words: ['webgl', 'webgpu', 'wgsl', 'svg', 'canvas', 'png', 'gif', 'jpeg', 'font', 'fonts', 'woff', 'woff2', 'image', 'images', 'compositing', 'mathml', 'offscreen', 'eyedropper', 'ruby', 'ink'],
    parts: ['filter-effects', 'shape-detection'],
  },
  {
    category: 'Media',
    words: ['media', 'audio', 'video', 'webcodecs', 'eme', 'mse', 'ttml', 'webvtt', 'av1', 'avif', 'speech', 'midi', 'captions', 'imsc', 'datacue', 'autoplay'],
    parts: [
      'encrypted-media', 'media-source', 'picture-in-picture', 'remote-playback', 'web-audio', 'webaudio', 'media-session', 'audio-output', 'mediasession',
      'mediacapture', 'media-capture', 'screen-capture', 'mediastream', 'image-capture', 'current-tab',
    ],
  },
  { category: 'Mixed reality', words: ['webxr', 'xr', 'immersive'] },
  { category: 'WebAssembly', words: ['wasm', 'webassembly'], parts: ['wasm-'] },
  { category: 'Machine learning', words: ['webnn', 'neural', 'ml', 'translator', 'summarizer', 'prompt', 'handwriting'] },
  { category: 'Testing and automation', words: ['webdriver', 'automation'] },
  {
    category: 'HTTP and networking',
    words: ['http', 'https', 'websocket', 'websockets', 'webtransport', 'beacon', 'cookie', 'cookies', 'fetch', 'dns', 'tls', 'quic', 'network', 'networking', 'xhr', 'xmlhttprequest', 'netinfo', 'savedata'],
    parts: ['client-hints', 'web-transport', 'fetch-later', 'network-information', 'signed-exchange', 'webpackage'],
  },
  { category: 'CSS', parts: ['css-'] },
  {
    category: 'Platform interaction',
    words: ['notification', 'notifications', 'push', 'share', 'badging', 'fullscreen', 'permissions', 'visibility', 'manifest', 'navigation', 'window', 'launch', 'contacts', 'contact', 'screen', 'screens', 'presentation', 'lifecycle', 'portals', 'webextensions'],
    parts: ['screen-orientation', 'page-visibility', 'web-share', 'file-handling', 'protocol-handler', 'window-management', 'get-installed', 'managed-configuration', 'device-attributes', 'web-app', 'launch-handler', 'capability-delegation', 'digital-goods'],
  },
];

// web-features' top-level groups, as categories. A group missing here gives no answer.
const WF_GROUPS: Record<string, Category> = {
  animation: 'Animation', canvas: 'Graphics and typography', clipboard: 'Forms and editing', 'clipping-shapes-masking': 'CSS',
  'compute-pressure': 'Devices and sensors', cookies: 'HTTP and networking', 'credential-management': 'Payments and identity', css: 'CSS',
  dom: 'Core', fetch: 'HTTP and networking', 'file-system': 'Storage and files', gamepad: 'Devices and sensors', geolocation: 'Devices and sensors',
  html: 'Core', http: 'HTTP and networking', images: 'Graphics and typography', integrity: 'Security and privacy', javascript: 'JavaScript',
  mathml: 'Graphics and typography', messaging: 'Core', 'parsing-and-serialization': 'Core', payments: 'Payments and identity',
  performance: 'Performance', print: 'CSS', 'progressive-web-app': 'Platform interaction', 'reading-order': 'CSS',
  reporting: 'Debugging and reporting', 'resource-hints': 'Performance', ruby: 'CSS', scrolling: 'CSS', security: 'Security and privacy',
  selection: 'Forms and editing', sensors: 'Devices and sensors', speech: 'Media', storage: 'Storage and files', streams: 'Core',
  svg: 'Graphics and typography', 'text-fragments': 'Core', 'view-transitions': 'Animation', 'web-audio': 'Media', 'web-components': 'Core',
  webassembly: 'WebAssembly', webdriver: 'Testing and automation', webgl: 'Graphics and typography', webgpu: 'Graphics and typography',
  webrtc: 'Real-time communication', webxr: 'Mixed reality', workers: 'Workers and offline', worklets: 'Core', xml: 'Core',
};

// The remaining groups, each with the topic most of its specs share, for a spec nothing above has placed.
const OTHER_GROUPS: Record<string, Category> = {
  'WebGL Working Group': 'Graphics and typography',
  'OpenGL ES Working Group': 'Graphics and typography',
  'GPU for the Web Working Group': 'Graphics and typography',
  'SVG Working Group': 'Graphics and typography',
  'Web Fonts Working Group': 'Graphics and typography',
  'Portable Network Graphics (PNG) Working Group': 'Graphics and typography',
  'Math Working Group': 'Graphics and typography',
  'Media Working Group': 'Media',
  'Audio Working Group': 'Media',
  'Audio Community Group': 'Media',
  'Codec Working Group': 'Media',
  'Timed Text Working Group': 'Media',
  'Web Real-Time Communications Working Group': 'Real-time communication',
  'Screen Capture Community Group': 'Media',
  'HTTP Working Group': 'HTTP and networking',
  'QUIC Working Group': 'HTTP and networking',
  'Web Application Security Working Group': 'Security and privacy',
  'Web Security Working Group': 'Security and privacy',
  'Privacy Community Group': 'Security and privacy',
  'Privacy Working Group': 'Security and privacy',
  'Web Performance Working Group': 'Performance',
  'Devices and Sensors Working Group': 'Devices and sensors',
  'Peripheral APIs Workstream': 'Devices and sensors',
  'Web NFC Community Group': 'Devices and sensors',
  'Web Payments Working Group': 'Payments and identity',
  'Federated Identity Working Group': 'Payments and identity',
  'Web Authentication Working Group': 'Payments and identity',
  'FIDO2 Technical Working Group': 'Payments and identity',
  'Web Editing Working Group': 'Forms and editing',
  'Pointer Events Working Group': 'Events',
  'Second Screen Working Group': 'Platform interaction',
  'Web Applications Working Group': 'Platform interaction',
  'Web Machine Learning Working Group': 'Machine learning',
  'Web Machine Learning Community Group': 'Machine learning',
  'Browser Testing and Tools Working Group': 'Testing and automation',
  'Storage Workstream': 'Storage and files',
};

// Upstream records are untyped JSON; each reader reads only the fields it keeps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

const list = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const bare = (url: string) => url.split('#')[0].replace(/[/]+$/, '');

// For each spec URL web-features cites, how many of the features citing it belong to each top-level group.
function groupCounts(webFeatures: unknown): Map<string, Map<string, number>> {
  const wf = webFeatures as Raw;
  const groups = wf && typeof wf.groups === 'object' && !Array.isArray(wf.groups) ? wf.groups : {};
  const features = wf && typeof wf.features === 'object' && !Array.isArray(wf.features) ? wf.features : {};
  const top = (id: string) => {
    let g = id;
    for (let i = 0; i < 20 && typeof groups[g]?.parent === 'string'; i++) g = groups[g].parent;
    return g;
  };
  const counts = new Map<string, Map<string, number>>();
  for (const f of Object.values(features) as Raw[]) {
    if (!f || f.kind !== 'feature') continue;
    for (const url of list(f.spec)) {
      const byGroup = counts.get(bare(url)) ?? new Map<string, number>();
      for (const g of new Set(list(f.group).map(top))) byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
      counts.set(bare(url), byGroup);
    }
  }
  return counts;
}

export function makeCategorizer(webFeatures: unknown, specs: SpecLike[]): (spec: SpecLike) => Category {
  const counts = groupCounts(webFeatures);
  const fromFeatures = (spec: SpecLike): Category | undefined => {
    const total = new Map<string, number>();
    for (const url of new Set([spec.url, spec.nightlyUrl].filter((u): u is string => !!u).map(bare))) {
      for (const [g, n] of counts.get(url) ?? []) total.set(g, (total.get(g) ?? 0) + n);
    }
    const ranked = [...total].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return ranked.map(([g]) => WF_GROUPS[g]).find((c) => c !== undefined);
  };
  const categorize = (spec: SpecLike): Category => {
    if (CORE.has(spec.shortname)) return 'Core';
    const text = `${spec.shortname} ${spec.title}`.toLowerCase();
    const words = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
    if (ANIMATION.some((p) => text.includes(p))) return 'Animation';
    const strong = spec.groups.map((g) => STRONG_GROUPS[g]).find((c) => c !== undefined);
    if (strong) return strong;
    if (Object.hasOwn(ORGS, spec.organization)) return ORGS[spec.organization];
    const rule = KEYWORDS.find((r) => r.words?.some((w) => words.has(w)) || r.parts?.some((p) => text.includes(p)));
    if (rule) return rule.category;
    const featured = fromFeatures(spec);
    if (featured) return featured;
    const grouped = spec.groups.map((g) => OTHER_GROUPS[g]).find((c) => c !== undefined);
    if (grouped) return grouped;
    return spec.organization === 'WHATWG' ? 'Core' : 'Other';
  };
  const known = new Map(specs.map((s) => [s.shortname, categorize(s)]));
  return (spec) => known.get(spec.shortname) ?? categorize(spec);
}
