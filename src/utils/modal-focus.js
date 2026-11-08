export function bindModalTabLoop(dialog,signal) {
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||event.defaultPrevented) return;
    const controls=[...dialog.querySelectorAll('a[href], button, input, textarea, select, [tabindex]')]
      .filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&element.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(!first){event.preventDefault();dialog.focus();}
    else if(event.shiftKey&&[first,dialog].includes(document.activeElement)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  },{signal});
}
