// Small in-memory view state. Supabase owns session persistence and token refresh.
export function createAuthState() {
  let state = { ready: false, user: null, profile: null, error: null };
  const listeners = new Set();
  const timers = new Set();
  let service;
  let unsubscribe;
  let revision = 0;
  let disposed = false;
  let initialization;
  function publish(next) {
    if (disposed) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  }
  async function synchronize(session) {
    const request = ++revision;
    if (!session) { publish({ ready: true, user: null, profile: null, error: null }); return; }
    const changed = session.user.id !== state.user?.id;
    if (changed || !state.ready) publish({ ready: false, user: null, profile: null, error: null });
    try {
      const user = await service.getCurrentUser();
      if (request !== revision || disposed) return;
      if (!user || user.id !== session.user.id) return synchronize(null);
      const profile = await service.getCurrentProfile(user.id);
      if (request === revision) publish({ ready: true, user, profile, error: null });
    } catch (error) {
      if (request === revision) publish({ ready: true, user: null, profile: null, error: error.message });
    }
  }
  async function refresh() {
    if (disposed || !service) return;
    const request = ++revision;
    try {
      const session = await service.getSession();
      if (request === revision) await synchronize(session);
    } catch (error) {
      if (request === revision) publish({ ready: true, user: null, profile: null, error: error.message });
    }
  }
  function initialize() {
    if (!initialization) initialization = (async () => {
      try {
        service = await import('./auth-service.js');
        if (disposed) return;
        unsubscribe = service.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_OUT') { void synchronize(null); return; }
          // Never await Auth methods inside the SDK's synchronous callback/lock.
          const timer = setTimeout(() => { timers.delete(timer); void synchronize(session); }, 0);
          timers.add(timer);
        });
        await refresh();
      } catch (error) {
        publish({ ready: true, user: null, profile: null, error: error.message });
      }
    })();
    return initialization;
  }
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    initialize, refresh,
    dispose() { disposed = true; revision += 1; unsubscribe?.(); timers.forEach(clearTimeout); listeners.clear(); },
  };
}
