// Shared reset behavior; each page owns its routing, data reload and pagination.
export function bindFilterReset(form, { signal, button = form.querySelector('[data-clear-filters]'), searchName = 'search', onClear, onSearchCleared } = {}) {
  const search = form.elements.namedItem(searchName);
  button?.addEventListener('click', event => {
    event.preventDefault();
    form.reset();
    onClear?.();
    search?.focus();
  }, { signal });
  const cleared = () => { if (search && !search.value.trim()) onSearchCleared?.(); };
  search?.addEventListener('input', cleared, { signal });
  search?.addEventListener('search', cleared, { signal });
}
