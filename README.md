# Browser specs

The sources for https://html-now.github.io/: a list of every browser spec in [browser-specs](https://github.com/w3c/browser-specs), one row per level, with which engines implement it, its web-platform-tests pass rates, and its MDN articles and Can I Use features.

Nothing in it is kept by hand. Every hour, a GitHub Actions workflow builds the site from browser-specs, [webref](https://github.com/w3c/webref)’s crawl (for each spec’s date), [web-features](https://github.com/web-platform-dx/web-features) (for its categories), and the data files [Web Specs Companion](https://github.com/sideshowbarker/web-specs-companion) builds from [BCD](https://github.com/mdn/browser-compat-data), [mdn/content](https://github.com/mdn/content), [caniuse-db](https://github.com/Fyrd/caniuse), and [wpt.fyi](https://wpt.fyi/), and deploys it when anything has changed. A spec’s platform footprint comes from webref’s backrefs, links, refs, and idlparsed extracts for it, fetched on every build. And a spec’s category is a guess, made by `src/logic/categories.ts` from what those sources say about it.

## Building it

Needs Node 24. `npm ci`, then `npm run build` writes the site into `_site/`, and `python3 -m http.server -d _site` serves it. `npm test` runs the tests, and `npm run yardstick` checks the category guesses against the old hand-kept list.

## License

[CC0 1.0](LICENSE). The browser logos in `site/icons/browsers/` are from [alrra/browser-logos](https://github.com/alrra/browser-logos/tree/58881b84c4d73adc03c06fa2c275a7abee02d935/src), under the MIT license in `LICENSE.txt` beside them; the logos themselves are trademarks of Mozilla, Apple, and Google.
