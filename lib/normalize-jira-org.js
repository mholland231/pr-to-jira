/**
 * Settings should store only the subdomain (e.g. "mycompany" for mycompany.atlassian.net).
 * Strips https://, paths, and any .atlassian.net suffix so pasted URLs still work.
 */
function normalizeJiraOrg(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  s = s.split('/')[0];
  s = s.split(':')[0];
  while (s.endsWith('.atlassian.net')) {
    s = s.slice(0, -'.atlassian.net'.length);
  }
  s = s.replace(/\.+$/, '');
  return s;
}
