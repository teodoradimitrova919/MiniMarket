import Modal from 'bootstrap/js/dist/modal';
import html from './admin-dialog.html?raw';
import { createUnsavedChangesGuard } from '../../utils/unsaved-changes.js';
import { bindModalTabLoop } from '../../utils/modal-focus.js';
import { showError } from '../../services/toast-service.js';
import { wasReported } from '../../utils/operation-feedback.js';

export function field(label,name,{value='',type='text',required=true,maxLength=100,help='',accept,options}={}) {
  const wrapper=document.createElement('div');wrapper.className='mb-3';
  const id=`admin-${name}`;
  const caption=document.createElement('label');caption.className='form-label';caption.htmlFor=id;caption.textContent=label;
  const input=document.createElement(options?'select':'input');input.id=id;input.name=name;input.required=required;input.className=options?'form-select':'form-control';
  if(options)for(const option of options)input.add(new Option(option.label,option.value));
  else{input.type=type;input.maxLength=maxLength;}
  if(type!=='file') input.value=value;
  if(accept) input.accept=accept;
  const error=document.createElement('div');error.className='invalid-feedback';error.id=`${id}-error`;error.textContent='Enter a valid value for this field.';input.setAttribute('aria-describedby',error.id);
  wrapper.append(caption,input,error);
  if(help){const hint=document.createElement('p');hint.className='form-text';hint.textContent=help;wrapper.append(hint);}
  return wrapper;
}
export function detail(label,value) {
  const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=`${label}: `;p.append(strong,document.createTextNode(String(value ?? '—')));return p;
}
export function createAdminDialog({focusFallback}) {
  const host=document.createElement('div');host.innerHTML=html;document.body.append(host);
  const dialog=host.firstElementChild,modal=new Modal(dialog),events=new AbortController();
  const form=dialog.querySelector('form'),content=dialog.querySelector('[data-dialog-content]'),error=dialog.querySelector('[data-dialog-error]');
  const submit=dialog.querySelector('[data-dialog-submit]');
  let active=true,pending=false,force=false,opener,onSubmit,guard,opened=false;
  const read=()=>[...form.querySelectorAll('[name]')].map(input=>[input.name,input.type==='file'?[...input.files].map(file=>file.name):input.value]);
  bindModalTabLoop(dialog,events.signal);
  dialog.addEventListener('hide.bs.modal',event=>{if(!force&&(pending||!(guard?.canLeave()??true)))event.preventDefault();},{signal:events.signal});
  dialog.addEventListener('hidden.bs.modal',()=>{
    guard?.dispose();guard=undefined;content.replaceChildren();opened=false;
    if(active)(opener?.isConnected?opener:focusFallback())?.focus({preventScroll:true});
  },{signal:events.signal});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(pending||!onSubmit)return;
    for(const input of form.querySelectorAll('input[type="text"],input[type="email"]'))input.value=input.value.trim();
    form.classList.add('was-validated');
    if(!form.checkValidity()){form.querySelector(':invalid')?.focus();return;}
    pending=true;error.hidden=true;
    dialog.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=true;});
    form.setAttribute('aria-busy','true');
    try {
      const result=await onSubmit(form);
      if(!active)return;
      guard?.markClean();
      if(!result?.keepOpen){force=true;modal.hide();force=false;}
    }catch(problem){
      if(active){error.textContent=problem.message || 'The operation failed. Please retry.';error.hidden=false;error.focus();if(!wasReported(problem)&&problem.code!=='VALIDATION_ERROR')showError(error.textContent);}
    }finally{pending=false;if(active){dialog.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=false;});form.setAttribute('aria-busy','false');}}
  },{signal:events.signal});
  return {
    open({title,nodes,onSave,submitLabel='Save',destructive=false,dirty=false},trigger=document.activeElement){
      if(!active||opened)return;
      opened=true;opener=trigger;onSubmit=onSave;content.replaceChildren(...nodes);error.hidden=true;form.classList.remove('was-validated');
      dialog.querySelector('.modal-title').textContent=title;
      submit.textContent=submitLabel;submit.hidden=!onSave;submit.className=`btn btn-${destructive?'danger':'primary'}`;
      dialog.querySelector('[data-dialog-cancel]').textContent=onSave?'Cancel':'Close';
      if(dirty)guard=createUnsavedChangesGuard(form,read);
      modal.show(trigger);content.querySelector('input')?.focus();
    },
    canLeave:()=>pending ? window.confirm('A request is in progress. Leaving will not cancel it. Leave this page?') : guard?.canLeave()??true,
    dispose(){active=false;force=true;events.abort();guard?.dispose();modal.hide();modal.dispose();host.remove();},
  };
}
