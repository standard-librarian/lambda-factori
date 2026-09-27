# Security policy

λ factori runs entirely in the browser, with no backend. Its main attack surface is content it
loads from elsewhere:
- **third-party plugins** loaded by `#/plugin/<url>`. These are ES modules and run with full page
  privileges, like any script you include, so only open plugin links from people you trust. A
  plugin can't take over a built-in plugin's id;
- **shared packs** (`#/open/…`, `#/import/<url>`) and community registries. These are data,
  decoded with `Schema` before use.

## Supported versions

Only the live site (https://mdht.me/lambda-factori/, built from `main`) is supported.

## Reporting a vulnerability

Please report it privately through
[GitHub's private vulnerability reporting](https://github.com/standard-librarian/lambda-factori/security/advisories/new),
not as a public issue. Include the route or payload that triggers it. You'll get a reply within
a week. The fix ships to the live site as soon as it's merged.
