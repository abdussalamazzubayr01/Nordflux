(function () {
  // Automatic iframe shell redirect disabled to preserve clean URLs (e.g. nordluxe.io)
  if (window.top !== window.self) {
    try {
      var pathname = window.location.pathname || '/index.html';
      var fileName = pathname.substring(pathname.lastIndexOf('/') + 1) || 'index.html';
      var suffix = (window.location.search || '') + (window.location.hash || '');
      var currentPageRef = fileName + suffix;

      window.parent.postMessage({
        type: 'nordluxe:navigation',
        page: currentPageRef,
        title: document.title || 'NORDLUXE'
      }, window.location.origin);
    } catch (err) {
      // Ignore cross-context messaging errors.
    }
  }
})();
