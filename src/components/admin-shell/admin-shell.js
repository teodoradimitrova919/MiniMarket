import html from './admin-shell.html?raw';
import './admin-shell.css';

export function mountAdminShell(container,{auth}) {
  container.querySelector('[data-admin-nav]').innerHTML=html;
  const table=container.querySelector('.admin-table');
  if(table){
    table.tabIndex=0;table.setAttribute('role','region');table.setAttribute('aria-label','Management table; scroll horizontally to see all columns');
    const hint=document.createElement('p');hint.className='small text-muted d-md-none';hint.textContent='Scroll the table sideways to see all columns and actions.';table.before(hint);
  }
  for(const link of container.querySelectorAll('.admin-nav a')) {
    if(link.getAttribute('href')===location.pathname){link.classList.add('active');link.setAttribute('aria-current','page');}
  }
  const events=new AbortController();
  let active=true;
  const id=auth.getState().user.id;
  const isCurrent=()=>active&&auth.getState().user?.id===id&&auth.getState().profile?.role==='admin';
  const status=container.querySelector('[data-admin-status]');
  function feedback(message,retry) {
    const panel=document.createElement('div');panel.className='admin-feedback';panel.setAttribute('role',retry?'alert':'status');
    const text=document.createElement('p');text.className='mb-0';text.textContent=message;panel.append(text);
    if(retry){const button=actionButton('Try again',retry,events.signal);button.classList.add('d-block');panel.append(button);}
    status.replaceChildren(panel);
  }
  return {events,isCurrent,feedback,clear:()=>status.replaceChildren(),dispose(){active=false;events.abort();}};
}
export function cell(value,className='') { const td=document.createElement('td');td.textContent=value ?? '—';td.className=className;return td; }
export function actionButton(label,handler,signal,variant='outline-secondary') {
  const button=document.createElement('button');button.type='button';button.className=`btn btn-sm btn-${variant}`;button.textContent=label;
  button.addEventListener('click',handler,{signal});return button;
}
export function renderPager(host,{page,total,onChange,signal}) {
  host.replaceChildren();
  const pages=Math.max(1,Math.ceil(total/20));
  const previous=actionButton('Previous',()=>onChange(page-1),signal);previous.disabled=page<=1;
  const next=actionButton('Next',()=>onChange(page+1),signal);next.disabled=page>=pages;
  const text=document.createElement('span');text.className='small text-muted';text.textContent=`Page ${page} of ${pages} · ${total} records`;
  host.append(previous,text,next);
}
