import html from './admin-listings.html?raw';
import './admin-listings.css';
import { mountAdminShell,cell,actionButton,renderPager } from '../../components/admin-shell/admin-shell.js';
import { createListingModals } from '../../components/listing-modals/listing-modals.js';
import { formatPrice } from '../../utils/format-price.js';
import { formatDate } from '../../utils/format-date.js';
import { createListingThumbnail } from '../../components/listing-thumbnail.js';
import { showError } from '../../services/toast-service.js';
import { bindFilterReset } from '../../utils/filter-reset.js';
export const title='Listings Management';
export function mount(container,{auth}) {
  container.innerHTML=html;
  const shell=mountAdminShell(container,{auth}),form=container.querySelector('form'),table=container.querySelector('[data-admin-table]'),rows=container.querySelector('tbody'),pager=container.querySelector('[data-admin-pager]');
  const focusFallback=()=>container.querySelector('h1');
  let service,page=1,revision=0,rowsEvents=new AbortController(),categories,requestedSearch='';
  const modals=createListingModals({auth,focusFallback,onChanged:load,deleteOperation:async id=>service.deleteAdminListing(id)});
  async function load(){
    const search=form.elements.search.value.trim(),category=form.elements.category.value;requestedSearch=search;
    const current=++revision;table.hidden=true;pager.replaceChildren();shell.feedback('Loading all listings…');
    try{
      service=await import('../../services/admin-service.js');
      const categoryService=await import('../../services/categories-service.js');
      const [data,available]=await Promise.all([service.getAdminListings({page,search,category}),categories||categoryService.getCategories()]);
      if(!shell.isCurrent()||current!==revision)return;
      if(!categories){categories=available;for(const item of categories)form.elements.category.add(new Option(item.name,item.id));}
      if(!data.rows.length&&page>1&&data.total){page=Math.ceil(data.total/20);return load();}
      rowsEvents.abort();rowsEvents=new AbortController();rows.replaceChildren();
      for(const listing of data.rows){
        const row=document.createElement('tr');row.dataset.adminListingId=listing.id;
        const image=cell('');image.append(createListingThumbnail(listing,{signal:rowsEvents.signal}));
        const owner=cell(listing.owner?.username||'Seller','admin-owner');
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
  bindFilterReset(form,{signal:shell.events.signal,onClear:()=>{page=1;void load();},onSearchCleared:()=>{if(requestedSearch){page=1;void load();}}});
  void load();const cleanup=()=>{shell.dispose();rowsEvents.abort();modals.dispose();};cleanup.canLeave=()=>modals.canLeave();return cleanup;
}
