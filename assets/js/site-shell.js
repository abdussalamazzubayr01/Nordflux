(function () {
  var SHELL_PATH = '/html/shell.html';

  function currentPageRef() {
    var pathname = window.location.pathname || '/html/index.html';
    var fileName = pathname.substring(pathname.lastIndexOf('/') + 1) || 'index.html';
    var suffix = (window.location.search || '') + (window.location.hash || '');
    return fileName + suffix;
  }

  function redirectToShell() {
    if (/\/html\/shell\.html$/i.test(window.location.pathname)) return;
    var target = currentPageRef();
    var shellUrl = SHELL_PATH + '?page=' + encodeURIComponent(target);
    window.location.replace(shellUrl);
  }

  if (window.top === window.self) {
    redirectToShell();
    return;
  }

  try {
    window.parent.postMessage({
      type: 'nordluxe:navigation',
      page: currentPageRef(),
      title: document.title || 'NORDLUXE'
    }, window.location.origin);
  } catch (err) {
    // Ignore cross-context messaging errors.
  }
})();
