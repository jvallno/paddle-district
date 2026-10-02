// Hash router. parseHash is pure (node-tested); createRouter is browser-only.
export function parseHash(hash, fallback = 'home') {
  const clean = (hash || '').replace(/^#\/?/, '');
  if (!clean) return { name: fallback, param: null };
  const [name, param] = clean.split('/');
  return { name, param: param || null };
}

// Wires hashchange events to route handlers. Before each render it fires a
// `view:teardown` event on the container so the previous view can unsubscribe.
export function createRouter(routes, options = {}) {
  const guard = options.guard || (() => true);
  const fallback = options.fallback || 'home';
  const container = options.container;

  function render() {
    const { name, param } = parseHash(window.location.hash, fallback);
    if (!guard(name)) return;
    const handler = routes[name] || routes[fallback];
    container.dispatchEvent(new CustomEvent('view:teardown'));
    container.innerHTML = '';
    handler(container, param);
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
    // Remove the hashchange listener so a torn-down shell (e.g. after sign-out)
    // stops guarding navigation.
    stop() {
      window.removeEventListener('hashchange', render);
    },
    navigate(name, param) {
      window.location.hash = param ? `#/${name}/${param}` : `#/${name}`;
    },
  };
}
