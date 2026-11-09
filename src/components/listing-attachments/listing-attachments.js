import html from './listing-attachments.html?raw';
import './listing-attachments.css';
import {validateAttachmentFile,formatFileSize,MAX_LISTING_IMAGES,MAX_LISTING_DOCUMENTS} from '../../utils/attachment-validation.js';
import {serviceError} from '../../utils/service-errors.js';
import {showError,showSuccess} from '../../services/toast-service.js';

export function mountListingAttachments(container,{listingId,editable=false,imageContainer,onPendingChange,onImagesChange,onBusyChange}={}){
  container.innerHTML=html;
  const events=new AbortController();let renderEvents=new AbortController();
  const imageInput=container.querySelector('[data-select-images]'),documentInput=container.querySelector('[data-select-documents]');
  const fields=container.querySelector('fieldset'),status=container.querySelector('[data-attachment-status]'),error=container.querySelector('[data-attachment-error]');
  const gallery=container.querySelector('[data-attachment-images]'),documents=container.querySelector('[data-attachment-documents]'),pendingRegion=container.querySelector('[data-pending-attachments]');
  if(imageContainer){
    imageContainer.append(gallery);
    container.querySelector('h3').textContent='Documents';
    container.classList.add('listing-attachments-documents');
  }
  const retry=container.querySelector('[data-attachment-retry]'),cleanupButton=container.querySelector('[data-attachment-cleanup]');
  const unique=crypto.randomUUID();imageInput.id=`attachment-images-${unique}`;documentInput.id=`attachment-documents-${unique}`;
  container.querySelector('[data-image-label]').htmlFor=imageInput.id;container.querySelector('[data-document-label]').htmlFor=documentInput.id;
  fields.hidden=!editable;cleanupButton.hidden=!editable;
  let active=true,loading=false,externalBusy=false,uploading=false,cleaning=false,revision=0,records=[],pending=[];
  const deleting=new Set(),objectUrls=new Set(),timers=new Set(),blankWindows=new Set();
  const api=()=>import('../../services/attachment-service.js');
  const isBusy=()=>loading||uploading||cleaning||deleting.size>0;
  const message=text=>{if(active){error.textContent=text;error.hidden=!text;}};
  function controls(){
    if(!active)return;
    onBusyChange?.(isBusy());
    fields.disabled=externalBusy||isBusy()||loading;
    container.querySelectorAll('[data-remove-attachment],[data-remove-pending],[data-attachment-cleanup]').forEach(button=>{button.disabled=externalBusy||isBusy();});
  }
  function button(text,handler,signal=renderEvents.signal,variant='outline-secondary'){
    const node=document.createElement('button');node.type='button';node.className=`btn btn-sm btn-${variant}`;node.textContent=text;node.addEventListener('click',handler,{signal});return node;
  }
  function caption(row){
    const node=document.createElement('div'),name=document.createElement('span'),size=document.createElement('span');
    name.className='attachment-name';name.textContent=row.original_filename||row.file?.name;
    size.className='attachment-size d-block';size.textContent=formatFileSize(row.size_bytes??row.file?.size);
    node.append(name,size);return node;
  }
  function release(entry){if(entry.preview){URL.revokeObjectURL(entry.preview);objectUrls.delete(entry.preview);}}
  function renderPending(){
    pendingRegion.replaceChildren();
    const selection=container.querySelector('[data-attachment-selection]');
    selection.hidden=!pending.length;
    selection.textContent=pending.length?`${pending.length} ${pending.length===1?'file is':'files are'} added and ready. Save the listing to upload ${pending.length===1?'it':'them'}.`:'';
    for(const entry of pending){
      const column=document.createElement('div');column.className='col';const figure=document.createElement('figure');figure.className='attachment-tile mb-0';
      if(entry.file.type.startsWith('image/')){if(!entry.preview){entry.preview=URL.createObjectURL(entry.file);objectUrls.add(entry.preview);}const image=document.createElement('img');image.src=entry.preview;image.alt=`Selected image: ${entry.file.name}`;figure.append(image);}
      const info=document.createElement('figcaption');info.append(caption(entry));const remove=button('Remove selected file',()=>{
        if(externalBusy||isBusy())return;release(entry);pending=pending.filter(item=>item!==entry);renderPending();onPendingChange?.();
      },events.signal);remove.dataset.removePending='';info.append(remove);figure.append(info);column.append(figure);pendingRegion.append(column);
    }
    controls();
  }
  function validatePending(){
    for(const entry of pending)validateAttachmentFile(entry.file);
    const images=records.filter(row=>row.mime_type.startsWith('image/')).length+pending.filter(entry=>entry.file.type.startsWith('image/')).length;
    const pdfs=records.filter(row=>row.mime_type==='application/pdf').length+pending.filter(entry=>entry.file.type==='application/pdf').length;
    if(images>MAX_LISTING_IMAGES||pdfs>MAX_LISTING_DOCUMENTS)throw serviceError('Each listing can have up to 5 images and 5 PDF documents.','VALIDATION_ERROR');
  }
  function selectFiles(input,images){
    if(externalBusy||isBusy())return;
    const additions=[];
    try{
      for(const file of input.files){const info=validateAttachmentFile(file);if(images!==info.type.startsWith('image/'))throw serviceError(images?'Choose JPG, PNG, or WebP images.':'Choose PDF documents.','VALIDATION_ERROR');additions.push({file,token:crypto.randomUUID()});}
      if(!additions.length)return;
      pending.push(...additions);validatePending();message('');renderPending();onPendingChange?.();
      showSuccess(additions.length===1?`${additions[0].file.name} added. Save the listing to upload it.`:`${additions.length} files added. Save the listing to upload them.`);
    }catch(problem){pending=pending.filter(entry=>!additions.includes(entry));message(problem.message);}
    input.value='';
  }
  async function openFile(row,download=false){
    let preview;
    if(!download){preview=window.open('about:blank','_blank');if(!preview){message('Allow a new tab to view this file.');return;}preview.opener=null;blankWindows.add(preview);}
    try{
      const service=await api(),url=await service.getAttachmentUrl(row.id,{download,force:true});
      if(!active){preview?.close();return;}
      if(preview){blankWindows.delete(preview);preview.location.replace(url);}
      else{
        const response=await fetch(url,{signal:events.signal});if(!response.ok)throw new Error('This file is missing or its link has expired. Please try again.');
        const blobUrl=URL.createObjectURL(await response.blob());objectUrls.add(blobUrl);
        const link=document.createElement('a');link.href=blobUrl;link.download=row.original_filename;link.hidden=true;document.body.append(link);link.click();link.remove();
        const timer=setTimeout(()=>{URL.revokeObjectURL(blobUrl);objectUrls.delete(blobUrl);timers.delete(timer);},1000);timers.add(timer);
      }
    }catch(problem){preview?.close();if(active){message(problem.message||'This file could not be opened. Please try again.');showError('This file could not be opened. Please try again.');}}
    finally{if(preview)blankWindows.delete(preview);}
  }
  async function remove(row){
    if(externalBusy||isBusy()||!window.confirm(`Permanently remove “${row.original_filename}”?`))return;
    deleting.add(row.id);controls();message('');
    try{const service=await api();await service.deleteAttachment(row.id);if(!active)return;records=records.filter(item=>item.id!==row.id);await render();}
    catch(problem){if(active)message(problem.message);}
    finally{deleting.delete(row.id);controls();}
  }
  async function render(){
    const current=++revision,images=records.filter(row=>row.mime_type.startsWith('image/'));
    let signed=new Map();try{if(images.length)signed=await(await api()).getAttachmentUrls(images.map(row=>row.id));}catch{if(active)message('Image previews could not be loaded. Use View or Try again.');}
    if(!active||current!==revision)return;
    renderEvents.abort();renderEvents=new AbortController();gallery.replaceChildren();documents.replaceChildren();
    onImagesChange?.(images.length>0);
    if(imageContainer)container.querySelector('h3').hidden=!records.some(row=>row.mime_type==='application/pdf');
    for(const row of records){
      const isImage=row.mime_type.startsWith('image/');const item=document.createElement(isImage?'figure':'li');item.className=isImage?'attachment-tile mb-0':'list-group-item';
      if(isImage){
        const placeholder=document.createElement('div');placeholder.className='attachment-preview-missing';placeholder.textContent='Preview unavailable';
        const image=document.createElement('img');image.alt=row.original_filename;image.loading='lazy';image.hidden=!signed.has(row.id);placeholder.hidden=signed.has(row.id);
        const fallback=()=>{image.hidden=true;placeholder.hidden=false;};
        image.addEventListener('error',async()=>{try{const url=await(await api()).getAttachmentUrl(row.id,{force:true});if(!active||renderEvents.signal.aborted)return;image.addEventListener('error',fallback,{once:true,signal:renderEvents.signal});image.src=url;}catch{if(active)fallback();}},{once:true,signal:renderEvents.signal});
        if(signed.has(row.id))image.src=signed.get(row.id);item.append(image,placeholder);
      }
      const body=document.createElement(isImage?'figcaption':'div');body.append(caption(row));
      const actions=document.createElement('div');actions.className='d-flex flex-wrap gap-2 mt-2';actions.append(button(isImage?'View image':'View PDF',()=>void openFile(row)),button('Download',()=>void openFile(row,true)));
      if(editable){const removeButton=button('Remove',()=>void remove(row),renderEvents.signal,'outline-danger');removeButton.dataset.removeAttachment=row.id;actions.append(removeButton);}
      body.append(actions);item.append(body);
      if(isImage){const column=document.createElement('div');column.className='col';column.dataset.attachmentId=row.id;column.append(item);gallery.append(column);}else{item.dataset.attachmentId=row.id;documents.append(item);}
    }
    if(!uploading&&!loading)status.textContent=records.length?`${images.length} images · ${records.length-images.length} documents`:'No attachments yet.';
    renderPending();controls();
  }
  async function load(){
    if(loading||!active||!listingId)return;loading=true;status.textContent='Loading attachments…';retry.hidden=true;controls();message('');
    try{records=await(await api()).getListingAttachments(listingId);if(active)await render();}
    catch{if(active){message('Attachments could not be loaded. Please try again.');retry.hidden=false;}}
    finally{loading=false;if(active){status.textContent=records.length?`${records.length} attachments`:'No attachments yet.';controls();}}
  }
  imageInput.addEventListener('change',()=>selectFiles(imageInput,true),{signal:events.signal});documentInput.addEventListener('change',()=>selectFiles(documentInput,false),{signal:events.signal});
  retry.addEventListener('click',()=>void load(),{signal:events.signal});
  cleanupButton.addEventListener('click',async()=>{
    if(!listingId||externalBusy||isBusy())return;cleaning=true;controls();
    try{const removed=await(await api()).cleanupUnregisteredAttachments(listingId);if(active){message('');status.textContent=`Removed ${removed} unused files.`;}}
    catch(problem){if(active){message(problem.message);showError('File cleanup failed. Please retry.');}}
    finally{cleaning=false;controls();}
  },{signal:events.signal});
  if(listingId)void load();else{status.textContent='Files will upload after your listing is created.';cleanupButton.hidden=true;}
  return {
    validatePending,showError:message,isBusy,
    pendingSignature:()=>pending.map(entry=>entry.token),
    setBusy(value){externalBusy=value;controls();},
    setListingId(id){listingId=id;cleanupButton.hidden=!editable;},
    async uploadPending(){
      if(!listingId)throw serviceError('Save the listing before uploading files.','VALIDATION_ERROR');
      if(uploading)throw serviceError('File uploads are already in progress.','VALIDATION_ERROR');
      validatePending();uploading=true;controls();const queue=[...pending];let completed=0;
      try{for(const entry of queue){if(!active)throw new Error('The listing was saved. Return to its editor to finish uploading files.');status.textContent=`Uploading file ${completed+1} of ${queue.length}…`;const record=await(await api()).uploadAttachment(listingId,entry.file);if(!active)return;records.push(record);pending=pending.filter(item=>item!==entry);release(entry);completed++;onPendingChange?.();await render();}}
      finally{uploading=false;if(active){await render();controls();}}
    },
    dispose(){active=false;events.abort();renderEvents.abort();if(imageContainer)gallery.remove();for(const url of objectUrls)URL.revokeObjectURL(url);for(const timer of timers)clearTimeout(timer);for(const tab of blankWindows)tab.close();},
  };
}
