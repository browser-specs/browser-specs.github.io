import { describe, it, expect } from 'vitest';
import { CATEGORIES, makeCategorizer } from '../src/logic/categories.ts';
import type { SpecLike } from '../src/logic/rows.ts';

const ch = String.fromCharCode;

// Real browser-specs entries, with their titles, orgs, and groups as browser-specs had them on 22 October 2026.
const CASES: [string, string, string, string[], string][] = [
  ['dom', 'DOM', 'WHATWG', ['DOM Workstream'], 'Core'],
  ['urlpattern', 'URL Pattern', 'WHATWG', ['URL Workstream'], 'Core'],
  ['DOM-Parsing', 'DOM Parsing and Serialization', 'W3C', ['Web Platform Working Group'], 'Core'],
  ['fetch', 'Fetch', 'WHATWG', ['Fetch Workstream'], 'HTTP and networking'],
  ['rfc9110', 'HTTP Semantics', 'IETF', ['HTTP Working Group'], 'HTTP and networking'],
  ['css-anchor-position-1', 'CSS Anchor Positioning Module Level 1', 'W3C', ['Cascading Style Sheets (CSS) Working Group'], 'CSS'],
  ['web-animations-1', 'Web Animations', 'W3C', ['Cascading Style Sheets (CSS) Working Group'], 'Animation'],
  ['css-transitions-2', 'CSS Transitions Module Level 2', 'W3C', ['Cascading Style Sheets (CSS) Working Group'], 'Animation'],
  ['webgpu', 'WebGPU', 'W3C', ['GPU for the Web Working Group'], 'Graphics and typography'],
  ['ANGLE_instanced_arrays', 'WebGL ANGLE_instanced_arrays Khronos Ratified Extension Specification', 'Khronos Group', ['WebGL Working Group'], 'Graphics and typography'],
  ['mathml-core', 'MathML Core', 'W3C', ['Math Working Group'], 'Graphics and typography'],
  ['ecmascript', `ECMAScript${ch(0xae)} 2027 Language${ch(0xa0)}Specification`, 'Ecma International', ['TC39'], 'JavaScript'],
  ['webxr', 'WebXR Device API', 'W3C', ['Immersive Web Working Group'], 'Mixed reality'],
  ['webrtc', 'WebRTC: Real-Time Communication in Browsers', 'W3C', ['Web Real-Time Communications Working Group'], 'Real-time communication'],
  ['payment-request', 'Payment Request API', 'W3C', ['Web Payments Working Group'], 'Payments and identity'],
  ['webauthn-3', 'Web Authentication: An API for accessing Public Key Credentials - Level 3', 'W3C', ['Web Authentication Working Group'], 'Payments and identity'],
  ['service-workers', 'Service Workers Nightly', 'W3C', ['Web Applications Working Group'], 'Workers and offline'],
  ['CSP3', 'Content Security Policy Level 3', 'W3C', ['Web Application Security Working Group'], 'Security and privacy'],
  ['resource-timing', 'Resource Timing', 'W3C', ['Web Performance Working Group'], 'Performance'],
  ['requestidlecallback', 'requestIdleCallback()', 'W3C', ['Web Performance Working Group'], 'Performance'],
  ['reporting-1', 'Reporting API', 'W3C', ['Web Performance Working Group'], 'Debugging and reporting'],
  ['console', 'Console', 'WHATWG', ['Console Workstream'], 'Debugging and reporting'],
  ['wai-aria-1.2', 'Accessible Rich Internet Applications (WAI-ARIA)', 'W3C', ['Accessible Rich Internet Applications Working Group'], 'Accessibility'],
  ['bluetooth', 'WebBluetooth', 'WHATWG', ['Peripheral APIs Workstream'], 'Devices and sensors'],
  ['uievents', 'UI Events', 'W3C', ['Web Applications Working Group'], 'Events'],
  ['clipboard-apis', 'Clipboard API and events', 'W3C', ['Web Editing Working Group'], 'Forms and editing'],
  ['wasm-core-2', 'WebAssembly Core Specification', 'W3C', ['WebAssembly Working Group'], 'WebAssembly'],
  ['notifications', 'Notifications API', 'WHATWG', ['Notifications API Workstream'], 'Platform interaction'],
  ['media-source-2', `Media Source Extensions${ch(0x2122)}`, 'W3C', ['Media Working Group'], 'Media'],
  ['webnn', 'Web Neural Network API', 'W3C', ['Web Machine Learning Working Group'], 'Machine learning'],
  ['webdriver2', 'WebDriver', 'W3C', ['Browser Testing and Tools Working Group'], 'Testing and automation'],
  ['zzz-thing', 'Zzz Thing', 'W3C', ['Web Platform Incubator Community Group'], 'Other'],
];

const spec = (shortname: string, title: string, organization: string, groups: string[]): SpecLike => ({
  shortname,
  title,
  url: `https://example.test/${shortname}/`,
  organization,
  groups,
});

describe('makeCategorizer', () => {
  const categorize = makeCategorizer({ features: {}, groups: {} }, CASES.map(([s, t, o, g]) => spec(s, t, o, g)));

  it.each(CASES)('files %s (%s) as %s', (shortname, title, org, groups, category) => {
    expect(categorize(spec(shortname, title, org, groups))).toBe(category);
  });

  it("uses web-features' group when nothing else says", () => {
    const zzz = { ...spec('zzz-store', 'Zzz Thing', 'W3C', ['Web Platform Incubator Community Group']), url: 'https://wicg.github.io/zzz/' };
    const webFeatures = {
      groups: { storage: { name: 'Storage' }, 'storage-quota': { name: 'Storage quota', parent: 'storage' } },
      features: {
        f1: { kind: 'feature', group: 'storage-quota', spec: ['https://wicg.github.io/zzz/#x'] },
        f2: { kind: 'feature', group: ['storage'], spec: 'https://wicg.github.io/zzz/#y' },
        f3: { kind: 'moved', redirect_target: 'f1' },
      },
    };
    expect(makeCategorizer(webFeatures, [zzz])(zzz)).toBe('Storage and files');
  });

  it('only ever answers one of CATEGORIES, even from a web-features file of the wrong shape', () => {
    const odd = makeCategorizer({ features: [], groups: 7 }, []);
    const all = CASES.map(([s, t, o, g]) => odd(spec(s, t, o, g)));
    expect(all.every((c) => (CATEGORIES as readonly string[]).includes(c))).toBe(true);
    expect(makeCategorizer(null, [])(spec('zzz', 'Zzz', 'W3C', []))).toBe('Other');
  });
});
