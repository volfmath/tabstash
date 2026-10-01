# Tabstash Privacy Policy

Effective date: 2026-10-01

This policy applies to the free Tabstash browser extension, version 0.2.0 and
later versions that link to this document.

## Summary

Tabstash is a local browser-session manager. It does not operate a backend,
create accounts, show ads, use analytics, or sell or share user data.

## Information handled by the extension

Tabstash handles the following information only when the user starts an action:

- When saving a session, it reads the URL and title of tabs in the selected
  current window or selected ordinary windows.
- It stores session names, tab URLs, tab titles, window structure, and language
  preference in `storage.local`. Short-lived save previews, imported backup
  previews, and restore task state are kept in `storage.session`.
- When the user exports or imports a JSON backup, the file is read or written
  locally by the browser. It is not uploaded to Tabstash or to a Tabstash
  server.

Tabstash does not save cookies, page contents, browsing history, or login
state. Private-window tabs and unsupported pages are not persisted in a
session, although their URL and title can be read briefly while the user is
shown the save preview. Only `http:` and `https:` tabs are included in a
session. URLs may contain sensitive query parameters, so exported backups
should be treated as sensitive files.

## Sharing and transmission

Tabstash does not transmit the handled information to a developer-controlled
server, third-party analytics service, or advertising network. The extension
has no host permissions, content scripts, or remote code.

The Settings page contains links to the public GitHub repository and issue
tracker. Those pages open only after the user clicks a link; the extension does
not attach session, tab, or URL data to those links. GitHub's own privacy policy
applies after the user leaves the extension.

The public issue tracker is not a private support channel. Before opening an
issue, remove exported backup JSON, cookies, login links, access tokens, session
names, tab titles, URLs (including sensitive query parameters), and personal
information visible in screenshots or logs. Share only the smallest
reproduction details needed to investigate a problem.

## Retention and deletion

Saved sessions and language preference remain in the browser's persistent
`storage.local` until the user deletes them, clears extension data, or
uninstalls the extension. The user can export a backup, delete individual
sessions, or clear the browser's extension data through browser settings.
Preview tokens and imported backup previews are short-lived and expire after
their workflow timeout. Restore task summaries are kept temporarily in
`storage.session`, at most ten entries, so the user can see completion, partial
failure, or an unconfirmed result; a stale running task is marked unconfirmed
rather than automatically retried.

## Permissions

- `tabs`: read tab URLs and titles for a user-requested save and create tabs
  during a user-requested restore.
- `storage`: store persistent sessions and preferences in `storage.local`, and
  short-lived previews and restore task state in `storage.session`.

## Changes and contact

This policy may be updated when Tabstash's data practices change. The current
version is always published at this URL. Questions, bug reports, and privacy
requests can be submitted through the public issue tracker:

<https://github.com/volfmath/tabstash/issues/>
