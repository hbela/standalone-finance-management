export function renderHandoffHtml(scheme: string, provider: string): string {
  const target = `${scheme}://oauth/${provider}`;
  const targetJson = JSON.stringify(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Opening Standalone Finance Management</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0; padding: 2.5rem 1.5rem; max-width: 32rem; margin-inline: auto;
    line-height: 1.5; }
  h1 { font-size: 1.25rem; margin-top: 0; }
  p  { margin: 0.5rem 0 1rem; }
  a.btn { display: inline-block; padding: 0.75rem 1.25rem; border-radius: 999px;
    background: #1f8fff; color: #fff; text-decoration: none; font-weight: 600; }
  a.btn:focus-visible { outline: 3px solid #1f8fff44; outline-offset: 2px; }
  .muted { color: #6b7280; font-size: 0.875rem; }
</style>
</head>
<body>
  <h1>Opening Standalone Finance Management…</h1>
  <p id="status">If the app does not open automatically, tap the button below.</p>
  <p><a id="open-app" class="btn" href="#">Open the app</a></p>
  <p class="muted">You can close this tab once the app is open.</p>
<script>
(function () {
  var target = ${targetJson};
  var hash = window.location.hash || "";
  var deepLink = target + hash;
  var link = document.getElementById("open-app");
  link.setAttribute("href", deepLink);
  try { window.location.replace(deepLink); } catch (err) { /* ignore */ }
})();
</script>
</body>
</html>`;
}
