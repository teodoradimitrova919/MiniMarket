import html from './admin-listings.html?raw';
import './admin-listings.css';
import { mountAdminShell,cell,actionButton,renderPager } from '../../components/admin-shell/admin-shell.js';
import { createListingModals } from '../../components/listing-modals/listing-modals.js';
import { formatPrice } from '../../utils/format-price.js';
import { formatDate } from '../../utils/format-date.js';
import { safeImageUrl } from '../../utils/image-url.js';
import { showError } from '../../services/toast-service.js';
export const title='Listings Management';
export function mount(container,{auth}) {
  container.innerHTML=html;
  const shell=mountAdminShell(container,{auth}),form=container.querySelector('form'),table=container.querySelector('[data-admin-table]'),rows=container.querySelector('tbody'),pager=container.querySelector('[data-admin-pager]');
  const focusFallback=()=>container.querySelector('h1');
  let service,page=1,revision=0,rowsEvents=new AbortController(),categories;
  const modals=createListingModals({auth,focusFallback,onChanged:load,deleteOperation:async id=>service.deleteAdminListing(id)});
  async function load(){
    const current=++revision;table.hidden=true;pager.replaceChildren();shell.feedback('Loading all listings…');
    try{
      service=await import('../../services/admin-service.js');
      const categoryService=await import('../../services/categories-service.js');
      const [data,available]=await Promise.all([service.getAdminListings({page,search:form.elements.search.value,category:form.elements.category.value}),categories||categoryService.getCategories()]);
      if(!shell.isCurrent()||current!==revision)return;
      if(!categories){categories=available;for(const item of categories)form.elements.category.add(new Option(item.name,item.id));}
      if(!data.rows.length&&page>1&&data.total){page=Math.ceil(data.total/20);return load();}
      rowsEvents.abort();rowsEvents=new AbortController();rows.replaceChildren();
      for(const listing of data.rows){
        const row=document.createElement('tr');row.dataset.adminListingId=listing.id;
        const image=cell('');const url=safeImageUrl(listing.attachment_image_url || listing.image_url);
        if(url){
          const img=document.createElement('img');img.src=url;img.alt=listing.title;img.className='admin-thumbnail';
          const signal=rowsEvents.signal;
          const fallback=()=>{img.hidden=true;image.append(document.createTextNode('No photo'));};
          img.addEventListener('error',async()=>{
            if(!listing.attachment_image_id){fallback();return;}
            try{
              const { getAttachmentUrl }=await import('../../services/attachment-service.js');
              const refreshed=await getAttachmentUrl(listing.attachment_image_id,{force:true});
              if(signal.aborted)return;
              img.addEventListener('error',fallback,{once:true,signal});img.src=refreshed;
            }catch{if(!signal.aborted)fallback();}
          },{once:true,signal});
          image.append(img);
        }
        else{const placeholder=document.createElement('span');placeholder.className='admin-thumbnail admin-thumbnail-placeholder';placeholder.textContent='—';image.append(placeholder);}
        const owner=cell('','admin-owner');owner.append(document.createTextNode(listing.owner?.username||'Seller'),document.createElement('br'),document.createTextNode(listing.owner_id));
        const actions=cell('');const group=document.createElement('div');group.className='d-flex flex-wrap gap-2';
        for(const [label,handler,variant] of [['View',event=>modals.openView(listing.id,event.currentTarget)],['Edit',event=>modals.openEdit(listing.id,event.currentTarget)],['Delete',event=>modals.openDelete(listing,event.currentTarget),'outline-danger']])group.append(actionButton(label,handler,rowsEvents.signal,variant));
        actions.append(group);row.append(image,cell(listing.title,'admin-title'),cell(listing.category?.name),cell(formatPrice(listing.price)),owner,cell(formatDate(listing.created_at)),actions);rows.append(row);
      }
      shell.clear();table.hidden=!data.rows.length;if(!data.rows.length)shell.feedback('No listings match these filters.');
      renderPager(pager,{page,total:data.total,signal:rowsEvents.signal,onChange:value=>{page=value;void load();}});
    }catch{if(shell.isCurrent()&&current===revision){shell.feedback('Listings could not be loaded.',load);showError('Admin listings could not be loaded. Please try again.');}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();page=1;void load();},{signal:shell.events.signal});
  form.elements.category.addEventListener('change',()=>{page=1;void load();},{signal:shell.events.signal});
  void load();const cleanup=()=>{shell.dispose();rowsEvents.abort();modals.dispose();};cleanup.canLeave=()=>modals.canLeave();return cleanup;
}
