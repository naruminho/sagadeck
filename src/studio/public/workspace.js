window.SagaWorkspace = function () {
  // Cada editor tem sua própria apresentação aberta, mesmo no Studio local.
  const workspaceId = crypto.randomUUID();
  const scopedURL = value => { const u = new URL(value, location.href); if (u.origin === location.origin) u.searchParams.set('_workspace', workspaceId); return u.href; };
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== location.origin) return originalFetch(input, options);
    const headers = new Headers(options?.headers || input?.headers);
    headers.set('x-sagadeck-workspace', workspaceId);
    return originalFetch(input, { ...options, headers });
  };
  return scopedURL;
};
