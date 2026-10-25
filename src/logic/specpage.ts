// What the build reads from the start of a spec's page for its spec panel: its abstract and its editors. Specs come
// from several generators, so each is tried in turn: Bikeshed's and processed ReSpec's h-card markup, an Editors list
// of plain dd elements, a ReSpec source page's respecConfig, and an Internet-Draft's authors; and for the abstract,
// whatever has the abstract id, a heading that says Abstract or Overview, and the page's description.
export interface Editor {
  name: string;
  org?: string;
  w3cid?: number; // the editor's W3C account, which the build looks up the editor's GitHub account by
  github?: string; // the editor's GitHub login
}

export interface PageFacts {
  abstract?: string[]; // its paragraphs, as plain text
  editors?: Editor[];
}

// A longer abstract is cut at this many paragraphs, which no abstract on 25 October 2026 had more than.
export const MAX_PARAGRAPHS = 5;

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName);

// A ReSpec source page writes its links in a shorthand that ReSpec expands only when the page runs: [=term=],
// [^element^], {{IDL}}, and [[REF]]. Each becomes its text, and a reference its bracketed name.
const unshorten = (s: string) =>
  s
    .replace(/\[=([^\]]*?)=\]/g, '$1')
    .replace(/\[\^([^\]]*?)\^\]/g, '$1')
    .replace(/\{\{([^}]*)\}\}/g, '$1')
    .replace(/\[\[!?([^\]]*)\]\]/g, '[$1]');

const paragraphs = (els: Element[]) => els.map((el) => unshorten(text(el))).filter(Boolean).slice(0, MAX_PARAGRAPHS);

// An abstract section's text without its heading, for one that puts its text in no paragraph at all.
function bareText(section: Element): string[] {
  const parts = [...section.childNodes].filter((n) => !(n.nodeType === 1 && isHeading(n as Element)));
  const all = unshorten(parts.map((n) => n.textContent ?? '').join('').replace(/\s+/g, ' ').trim());
  return all ? [all] : [];
}

// The paragraphs after a heading, up to the next heading: each one that's a p, or that holds some.
function afterHeading(heading: Element): string[] {
  const found: Element[] = [];
  for (let el = heading.nextElementSibling; el && !isHeading(el); el = el.nextElementSibling) {
    found.push(...(el.tagName === 'P' ? [el] : el.querySelectorAll('p')));
  }
  return paragraphs(found);
}

function abstractOf(doc: Document): string[] {
  const marked = doc.getElementById('abstract');
  if (marked) {
    const ps = isHeading(marked) ? [] : [...marked.querySelectorAll('p')];
    const found = isHeading(marked) ? afterHeading(marked) : ps.length > 0 ? paragraphs(ps) : bareText(marked);
    if (found.length > 0) return found;
  }
  const headings = [...doc.querySelectorAll('h1, h2, h3')];
  for (const title of ['abstract', 'overview']) {
    const heading = headings.find((h) => text(h).toLowerCase() === title);
    const found = heading ? afterHeading(heading) : [];
    if (found.length > 0) return found;
  }
  // An RFC's description ends with the RFC Editor's tag for its status ("[STANDARDS-TRACK]"), which the chip says.
  const content = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  const description = content.replace(/\s+/g, ' ').replace(/\s*\[[A-Z -]+\]$/, '').trim();
  return description ? [description] : [];
}

// The dt a dd belongs to: the nearest one before it.
function termOf(dd: Element): Element | undefined {
  for (let el = dd.previousElementSibling; el; el = el.previousElementSibling) if (el.tagName === 'DT') return el;
  return undefined;
}

const isFormer = (dd: Element) => /former/i.test(text(termOf(dd)));

// A name with the org after it, in parentheses or after a comma, as plain text puts it.
function splitName(plain: string): Editor | undefined {
  const m = /^([^,(]+?)\s*(?:\(([^)]*)\)|,\s*(.+))?$/.exec(plain);
  if (!m) return undefined;
  const org = (m[2] ?? m[3])?.trim();
  return org ? { name: m[1], org } : { name: m[1] };
}

// An editor from a dd: its h-card's name and org when it has one, or else the text before the email address. An h-card
// with an empty name is no editor at all.
function editorOf(dd: Element): Editor | undefined {
  const named = dd.querySelector('.p-name, .fn');
  if (!named) return splitName(text(dd).replace(/<[^>]*>?\s*$/, '').trim());
  const org = text(dd.querySelector('.p-org, .org'));
  if (org) return text(named) ? { name: text(named), org } : undefined;
  // Only parentheses split a name in an h-card, since a comma can be part of the name itself (Jr.).
  const m = /^(.+?)\s*\(([^)]*)\)$/.exec(text(named));
  if (m) return { name: m[1], org: m[2] };
  return text(named) ? { name: text(named) } : undefined;
}

// The GitHub login a profile URL names: https://github.com/<login>, and nothing deeper.
export function githubLogin(href: string | null | undefined): string | undefined {
  return /^https?:\/\/github\.com\/([A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)\/?$/.exec(href ?? '')?.[1];
}

// An editor with the W3C ID their dd carries, and the GitHub account it links, if any.
function withAccounts(editor: Editor, dd: Element): Editor {
  const w3cid = Number.parseInt(dd.getAttribute('data-editor-id') ?? '', 10);
  const github = [...dd.querySelectorAll('a[href]')].map((a) => githubLogin(a.getAttribute('href'))).find(Boolean);
  return { ...editor, ...(w3cid > 0 ? { w3cid } : {}), ...(github ? { github } : {}) };
}

function markupEditors(doc: Document): Editor[] {
  const cards = [...doc.querySelectorAll('dd.editor, dd.p-author')];
  if (cards.length > 0) {
    return cards.filter((dd) => !isFormer(dd)).flatMap((dd) => {
      const editor = editorOf(dd);
      return editor ? [withAccounts(editor, dd)] : [];
    });
  }
  const term = [...doc.querySelectorAll('dt')].find((dt) => /^editors?\b(?!'|’)/i.test(text(dt)));
  const out: Editor[] = [];
  for (let el = term?.nextElementSibling; el && el.tagName === 'DD'; el = el.nextElementSibling) {
    const editor = editorOf(el);
    if (editor) out.push(withAccounts(editor, el));
  }
  return out;
}

function draftAuthors(doc: Document): Editor[] {
  return [...doc.querySelectorAll('.authors .author')].flatMap((author): Editor[] => {
    const name = text(author.querySelector('.author-name')).replace(/,\s*Ed\.$/, '');
    if (!name) return [];
    const org = text(author.querySelector('.org'));
    return [org ? { name, org } : { name }];
  });
}

// The string value of a key in a JavaScript object literal's source.
function stringValue(source: string, key: string): string | undefined {
  const m = new RegExp(`\\b${key}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`).exec(source);
  return m?.[2].trim() || undefined;
}

// The editors a ReSpec config's source lists, which ReSpec itself turns into markup only when the page runs: each
// object in its editors array that has a name and no retiredDate (ReSpec lists those as former editors), with its
// w3cid, and its url when that's a GitHub profile.
export function respecEditors(source: string): Editor[] {
  const start = /\beditors\s*:\s*\[/.exec(source);
  if (!start) return [];
  const objects: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = start.index + start[0].length, brackets = 1; i < source.length && brackets > 0; i++) {
    const c = source[i];
    if (c === '[') brackets++;
    else if (c === ']') brackets--;
    else if (c === '{' && depth++ === 0) from = i;
    else if (c === '}' && --depth === 0) objects.push(source.slice(from, i + 1));
  }
  return objects.flatMap((o): Editor[] => {
    const name = stringValue(o, 'name');
    if (!name || stringValue(o, 'retiredDate')) return [];
    const org = stringValue(o, 'company');
    const w3cid = Number.parseInt(/\bw3cid\s*:\s*["']?(\d+)/.exec(o)?.[1] ?? '', 10);
    const github = githubLogin(stringValue(o, 'url'));
    return [{ name, ...(org ? { org } : {}), ...(w3cid > 0 ? { w3cid } : {}), ...(github ? { github } : {}) }];
  });
}

function configEditors(doc: Document): Editor[] {
  const script = [...doc.querySelectorAll('script')].find((s) => s.textContent?.includes('respecConfig'));
  return script ? respecEditors(script.textContent ?? '') : [];
}

const unique = (editors: Editor[]) => editors.filter((e, i) => editors.findIndex((o) => o.name === e.name) === i);

// A WebGL extension's abstract, from the overview in its extension.xml, which the registry's page is made from: in the
// overview's order, the sentence the page gives for the extension one mirrors, and the overview's paragraphs, those
// in its divs, and the features it lists. It leaves out the boilerplate the page puts around those ("Consult the above
// extension for documentation"), and names no editors, since an extension lists only its contributors.
export function readWebglExtension(doc: Document): PageFacts {
  const overview = doc.querySelector('overview');
  if (!overview) return {};
  const found = [...overview.children].flatMap((el): string[] => {
    const mirrored = el.localName === 'mirrors' ? el.getAttribute('name') : null;
    if (mirrored) return [`This extension exposes the ${mirrored} functionality to WebGL.`];
    if (el.localName === 'p') return paragraphs([el]);
    if (el.localName === 'div') return paragraphs([...el.querySelectorAll('p')]);
    if (el.localName === 'features') return paragraphs([...el.querySelectorAll('feature')]);
    return [];
  });
  return found.length > 0 ? { abstract: found.slice(0, MAX_PARAGRAPHS) } : {};
}

export function readSpecPage(doc: Document): PageFacts {
  const facts: PageFacts = {};
  const abstract = abstractOf(doc);
  if (abstract.length > 0) facts.abstract = abstract;
  for (const read of [markupEditors, configEditors, draftAuthors]) {
    const editors = unique(read(doc));
    if (editors.length > 0) {
      facts.editors = editors;
      break;
    }
  }
  return facts;
}
