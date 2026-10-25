// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readSpecPage, respecEditors } from '../src/logic/specpage.ts';

const page = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('readSpecPage', () => {
  it("reads a Bikeshed spec's abstract and editors, and leaves out its former editors", () => {
    const doc = page(`
      <dl>
        <dt class="editor">Editors:
        <dd class="editor h-card p-author vcard"><a class="fn p-name u-url url" href="https://svgees.us/">Chris Lilley</a> (<span class="org p-org">W3C</span>)
        <dd class="editor h-card p-author vcard"><a class="fn p-name u-url url" href="https://una.im">Una Kravets</a> (<span class="org p-org">Google</span>)
        <dt class="editor">Former Editor:
        <dd class="editor h-card p-author vcard"><a class="fn p-name u-url url" href="https://nerdy.dev">Adam Argyle</a> (<span class="org p-org">Google</span>)
        <dt>Test Suite:
        <dd><a href="https://wpt.fyi/results/css/css-color/">wpt</a>
      </dl>
      <div class="p-summary" data-fill-with="abstract">
        <h2 class="heading no-num no-ref no-toc settled" id="abstract"><span class="content">Abstract</span></h2>
        <p>This module extends <code>color-mix()</code>
          with more colors.</p>
        <p><a href="https://www.w3.org/TR/CSS/">CSS</a> is a language for describing the rendering of documents.</p>
      </div>
      <nav id="toc"><h2>Table of Contents</h2><p>not this</p></nav>`);
    expect(readSpecPage(doc)).toEqual({
      abstract: ['This module extends color-mix() with more colors.', 'CSS is a language for describing the rendering of documents.'],
      editors: [{ name: 'Chris Lilley', org: 'W3C' }, { name: 'Una Kravets', org: 'Google' }],
    });
  });

  it("reads a processed ReSpec spec's abstract section and its editors", () => {
    const doc = page(`
      <dl>
        <dt>Editor:</dt><dd class="editor p-author h-card vcard"> <span class="p-name fn">Matt Reynolds</span> (<a class="p-org org h-org" href="https://www.google.com/">Google</a>) </dd>
        <dt>Former editors:</dt><dd class="editor p-author h-card vcard"><span class="p-name fn">Reilly Grant</span></dd>
      </dl>
      <section id="abstract" class="introductory"><h2>Abstract</h2><p>This document describes an API for HID devices.</p></section>
      <section id="sotd"><p>not this</p></section>`);
    expect(readSpecPage(doc)).toEqual({
      abstract: ['This document describes an API for HID devices.'],
      editors: [{ name: 'Matt Reynolds', org: 'Google' }],
    });
  });

  it("reads a ReSpec source page's editors from its respecConfig", () => {
    const doc = page(`
      <script class="remove">
        var respecConfig = {
          specStatus: "CG-DRAFT",
          // only "name" is required
          editors: [
            { name: "Kenneth Rohde Christiansen", company: "Intel", companyURL: "https://intel.com/", },
            { name: 'François Beaufort', company: 'Google LLC' },
          ],
          formerEditors: [{ name: "Zoltan Kis", company: "Intel" }],
        };
      </script>
      <section id="abstract"><p>Web NFC enables wireless communication.</p></section>`);
    expect(readSpecPage(doc)).toEqual({
      abstract: ['Web NFC enables wireless communication.'],
      editors: [{ name: 'Kenneth Rohde Christiansen', org: 'Intel' }, { name: 'François Beaufort', org: 'Google LLC' }],
    });
  });

  it("reads an Internet-Draft's authors, without their Ed. marks, and its abstract", () => {
    const doc = page(`
      <dl id="identifiers">
        <dt class="label-authors">Authors:</dt>
        <dd class="authors">
          <div class="author"><div class="author-name">A. van Kesteren, <span class="editor">Ed.</span></div><div class="org">Apple</div></div>
          <div class="author"><div class="author-name">J. Hofmann</div><div class="org">Google</div></div>
        </dd>
      </dl>
      <section id="section-abstract">
        <h2 id="abstract"><a href="#abstract" class="selfRef">Abstract</a></h2>
        <p id="section-abstract-1">This document defines the HTTP Cookie and Set-Cookie header fields.</p>
      </section>
      <div id="status-of-memo"><h2>Status of This Memo</h2><p>not this</p></div>`);
    expect(readSpecPage(doc)).toEqual({
      abstract: ['This document defines the HTTP Cookie and Set-Cookie header fields.'],
      editors: [{ name: 'A. van Kesteren', org: 'Apple' }, { name: 'J. Hofmann', org: 'Google' }],
    });
  });

  it('reads editors from plain dd elements after an Editors dt, with the org after the name', () => {
    const doc = page(`
      <dl>
        <dt>Editor's Draft:</dt><dd><a href="https://example.test/">https://example.test/</a></dd>
        <dt class="top-editors">Editors:</dt>
        <dd>Cyril Concolato, Telecom ParisTech &lt;<a href="mailto:c@example.test">c@example.test</a>&gt;</dd>
        <dd data-editor-id="14760">Karl Dubost, Apple, Inc. &lt;<a href="mailto:k@example.test">k@example.test</a>&gt;</dd>
        <dd>Doug Schepers</dd>
        <dt>Feedback:</dt><dd>www-svg@w3.org</dd>
      </dl>`);
    expect(readSpecPage(doc).editors).toEqual([
      { name: 'Cyril Concolato', org: 'Telecom ParisTech' },
      { name: 'Karl Dubost', org: 'Apple, Inc.' },
      { name: 'Doug Schepers' },
    ]);
  });

  it('finds an abstract by its heading when nothing has the abstract id', () => {
    const doc = page(`<hr><h2 class="no-toc">Abstract</h2><p> This is Version 2.0 of the WebGL Specification. </p><p>More.</p><h2>Status</h2><p>not this</p>`);
    expect(readSpecPage(doc).abstract).toEqual(['This is Version 2.0 of the WebGL Specification.', 'More.']);
  });

  it("takes a WebGL extension's Overview as its abstract", () => {
    const doc = page(`<h2 class="no-toc">Name</h2><p>EXT_blend_minmax</p><h2 class="no-toc">Overview</h2><p>This extension exposes the EXT_blend_minmax functionality to WebGL.</p><ul><li>not this</li></ul><h2>IDL</h2>`);
    expect(readSpecPage(doc).abstract).toEqual(['This extension exposes the EXT_blend_minmax functionality to WebGL.']);
  });

  it("falls back to the page's description for its abstract", () => {
    const doc = page(`<head><meta name="description" content="The WebSocket Protocol enables two-way communication."></head><body><p>Hi</p></body>`);
    expect(readSpecPage(doc)).toEqual({ abstract: ['The WebSocket Protocol enables two-way communication.'] });
  });

  it("drops the status tag an RFC's description ends with", () => {
    const doc = page(`<meta name="description" content="It uses HTTP connections (e.g., long polling). [STANDARDS-TRACK]">`);
    expect(readSpecPage(doc).abstract).toEqual(['It uses HTTP connections (e.g., long polling).']);
  });

  it('keeps at most MAX_PARAGRAPHS paragraphs, and skips empty ones', () => {
    const ps = Array.from({ length: 8 }, (_, i) => `<p>${i}</p>`).join('<p> </p>');
    expect(readSpecPage(page(`<section id="abstract">${ps}</section>`)).abstract).toEqual(['0', '1', '2', '3', '4']);
  });

  it('lists an editor once, however many times the page names them', () => {
    const dd = '<dd class="editor p-author h-card vcard"><span class="p-name fn">Anne</span></dd>';
    expect(readSpecPage(page(`<dl><dt>Editors:</dt>${dd}${dd}</dl>`)).editors).toEqual([{ name: 'Anne' }]);
  });

  it('takes the text of an abstract section that has no paragraphs', () => {
    const doc = page(`<section id="abstract"> This specification defines an API that provides information about the battery. </section>`);
    expect(readSpecPage(doc).abstract).toEqual(['This specification defines an API that provides information about the battery.']);
  });

  it("drops the shorthand a ReSpec source page's abstract links with", () => {
    const doc = page(`<section id="abstract"><p>It sends [=MIDI messages=] to the [^audio^] element, as {{MIDIAccess}} does [[WEBIDL]].</p></section>`);
    expect(readSpecPage(doc).abstract).toEqual(['It sends MIDI messages to the audio element, as MIDIAccess does [WEBIDL].']);
  });

  it('skips an h-card with no name, and splits an org out of a name that has it in parentheses', () => {
    const doc = page(`<dl><dt>Editors:</dt>
      <dd class="editor p-author h-card vcard"><span class="p-name fn"></span></dd>
      <dd class="editor p-author h-card vcard"><span class="p-name fn">Andreas Rossberg (Dfinity Stiftung)</span></dd></dl>`);
    expect(readSpecPage(doc).editors).toEqual([{ name: 'Andreas Rossberg', org: 'Dfinity Stiftung' }]);
  });

  it('gives nothing for a page with neither', () => {
    expect(readSpecPage(page('<h1>Title</h1><p>Text</p>'))).toEqual({});
  });
});

describe('respecEditors', () => {
  it('gives nothing for a config with no editors list', () => {
    expect(respecEditors('var respecConfig = { specStatus: "ED" };')).toEqual([]);
  });

  it('leaves out an editor who has retired', () => {
    expect(respecEditors('editors: [{ name: "A" }, { name: "B", retiredDate: "2020-01-01" }]')).toEqual([{ name: 'A' }]);
  });
});
