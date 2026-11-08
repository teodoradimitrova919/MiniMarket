import { showError } from '../services/toast-service.js';
import './favorite-controls.css';

// One scoped read per mounted view, never a query per card. No account-global cache.
export function mountFavoriteControls(root, { auth, initialIds, onRemoved } = {}) {
  const api = () => import('../services/favorites-service.js');
  const events = new AbortController();
  let active = true, revision = 0, ready = initialIds !== undefined;
  let userId = auth?.getState().user?.id;
  let saved = new Set(initialIds || []);
  const pending = new Set();
  function refresh() {
    if (!active) return;
    for (const button of root.querySelectorAll('[data-favorite-id]')) {
      const id = button.dataset.favoriteId, selected = saved.has(id);
      button.disabled = pending.has(id);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-busy', String(pending.has(id)));
      button.setAttribute('aria-label', `${selected ? 'Remove from' : 'Add to'} favorites: ${button.dataset.favoriteTitle || 'listing'}`);
      button.title = selected ? 'Remove from favorites' : 'Save to favorites';
      button.querySelector('i').className = `bi bi-heart${selected ? '-fill' : ''}`;
    }
  }
  async function load() {
    if (!userId) { ready = true; refresh(); return; }
    const request = ++revision;
    try {
      const ids = await (await api()).getFavoriteIds();
      if (!active || request !== revision) return;
      saved = new Set(ids); ready = true; refresh();
    } catch { if (active && request === revision) showError('Saved listings could not be loaded. Click a heart to retry.'); }
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-favorite-id]');
    if (!button || !root.contains(button)) return;
    event.preventDefault(); event.stopPropagation();
    if (!userId) {
      const link = document.createElement('a');
      link.href = `/login?${new URLSearchParams({ returnTo: location.pathname + location.search })}`;
      document.body.append(link); link.click(); link.remove(); return;
    }
    const id = button.dataset.favoriteId;
    if (pending.has(id)) return;
    pending.add(id); refresh();
    const actor = userId;
    try {
      if (!ready) await load();
      if (!active || actor !== userId || !ready) return;
      const selected = saved.has(id);
      const service = await api();
      if (!active || actor !== userId) return;
      try { if (selected) await service.removeFavorite(id); else await service.addFavorite(id); }
      catch (error) { if (!selected && error.code === '23505') saved.add(id); throw error; }
      if (!active || actor !== userId) return;
      if (selected) saved.delete(id); else saved.add(id);
      window.dispatchEvent(new CustomEvent('minimarket:favorites-changed', { detail: { userId: actor, id, saved: !selected } }));
    } catch { /* The mutation service publishes its error toast. Keep the previous state. */ }
    finally { if (actor === userId) { pending.delete(id); refresh(); } }
  }, { signal: events.signal });
  window.addEventListener('minimarket:favorites-changed', event => {
    if (event.detail.userId !== userId) return;
    const { id, saved: selected } = event.detail;
    if (selected) saved.add(id); else saved.delete(id);
    refresh();
    if (!selected) onRemoved?.(id);
  }, { signal: events.signal });
  const unsubscribe = auth?.subscribe(state => {
    if (state.user?.id === userId) return;
    userId = state.user?.id; revision++; saved.clear(); pending.clear(); ready = false; refresh(); void load();
  });
  refresh(); if (!ready) void load();
  return { refresh, dispose() { active = false; revision++; events.abort(); unsubscribe?.(); saved.clear(); pending.clear(); } };
}
