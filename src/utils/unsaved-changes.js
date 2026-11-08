export function createUnsavedChangesGuard(form, readValues) {
  let baseline = JSON.stringify(readValues());
  let listening = false;
  const events = new AbortController();
  const isDirty = () => JSON.stringify(readValues()) !== baseline;
  function beforeUnload(event) {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  }
  function update() {
    const dirty = isDirty();
    if (dirty && !listening) window.addEventListener('beforeunload', beforeUnload);
    if (!dirty && listening) window.removeEventListener('beforeunload', beforeUnload);
    listening = dirty;
  }
  form.addEventListener('input', update, { signal: events.signal });
  form.addEventListener('change', update, { signal: events.signal });
  return {
    isDirty,
    canLeave: () => !isDirty() || window.confirm('You have unsaved changes. Leave without saving?'),
    markClean() { baseline = JSON.stringify(readValues()); update(); },
    dispose() { events.abort(); window.removeEventListener('beforeunload', beforeUnload); },
  };
}
