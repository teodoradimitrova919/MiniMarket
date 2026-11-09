import html from './admin-categories.html?raw';
import './admin-categories.css';
import {mountAdminShell,cell,actionButton,renderPager} from '../../components/admin-shell/admin-shell.js';
import {createAdminDialog,field,detail} from '../../components/admin-dialog/admin-dialog.js';
import {formatDate} from '../../utils/format-date.js';
import {showError} from '../../services/toast-service.js';
import {bindFilterReset} from '../../utils/filter-reset.js';
export const title='Categories Management';
export function mount(container,{auth}){
  container.innerHTML=html;
  const shell=mountAdminShell(container,{auth}),form=container.querySelector('form'),table=container.querySelector('[data-admin-table]'),rows=container.querySelector('tbody'),pager=container.querySelector('[data-admin-pager]');
  const dialog=createAdminDialog({focusFallback:()=>container.querySelector('[data-add-category]')});
  let page=1,revision=0,requestedSearch='',rowsEvents=new AbortController();
  function edit(category,trigger){
    dialog.open({title:category?'Edit Category':'Add Category',nodes:[field('Category name','name',{value:category?.name||''})],dirty:true,onSave:async form=>{
      const service=await import('../../services/categories-service.js');
      if(category)await service.updateCategory(category.id,form.elements.name.value);else await service.createCategory(form.elements.name.value);
      await load();
    }},trigger);
  }
  function remove(category,trigger){
    if(category.listingCount){dialog.open({title:'Category is in use',nodes:[detail('Category',category.name),detail('Listings',category.listingCount),detail('Next step','Reassign or remove these listings before deleting the category.')]},trigger);return;}
    dialog.open({title:'Delete Category',nodes:[detail('Category',category.name),detail('Warning','This permanently deletes the category. Listings are never deleted by this operation.')],submitLabel:'Delete Category',destructive:true,onSave:async()=>{
      const {deleteCategory}=await import('../../services/categories-service.js');await deleteCategory(category.id);await load();
    }},trigger);
  }
  async function load(){
    const search=form.elements.search.value.trim();requestedSearch=search;
    const current=++revision;table.hidden=true;pager.replaceChildren();shell.feedback('Loading categories…');
    try{
      const {getAdminCategories}=await import('../../services/admin-service.js');const data=await getAdminCategories({page,search});
      if(!shell.isCurrent()||current!==revision)return;
      if(!data.rows.length&&page>1&&data.total){page=Math.ceil(data.total/20);return load();}
      rowsEvents.abort();rowsEvents=new AbortController();rows.replaceChildren();
      for(const category of data.rows){
        const row=document.createElement('tr');row.dataset.categoryId=category.id;const actions=cell('');const group=document.createElement('div');group.className='d-flex flex-wrap gap-2';
        group.append(actionButton('View',event=>dialog.open({title:'Category Details',nodes:[detail('Name',category.name),detail('ID',category.id),detail('Listings',category.listingCount),detail('Created',formatDate(category.created_at))]},event.currentTarget),rowsEvents.signal),actionButton('Edit',event=>edit(category,event.currentTarget),rowsEvents.signal),actionButton('Delete',event=>remove(category,event.currentTarget),rowsEvents.signal,'outline-danger'));
        actions.append(group);row.append(cell(category.name),cell(category.listingCount),cell(formatDate(category.created_at)),actions);rows.append(row);
      }
      shell.clear();table.hidden=!data.rows.length;if(!data.rows.length)shell.feedback('No categories match your search.');
      renderPager(pager,{page,total:data.total,signal:rowsEvents.signal,onChange:value=>{page=value;void load();}});
    }catch{if(shell.isCurrent()&&current===revision){shell.feedback('Categories could not be loaded.',load);showError('Admin categories could not be loaded. Please try again.');}}
  }
  container.querySelector('[data-add-category]').addEventListener('click',event=>edit(null,event.currentTarget),{signal:shell.events.signal});
  form.addEventListener('submit',event=>{event.preventDefault();page=1;void load();},{signal:shell.events.signal});
  bindFilterReset(form,{signal:shell.events.signal,onClear:()=>{page=1;void load();},onSearchCleared:()=>{if(requestedSearch){page=1;void load();}}});
  void load();const cleanup=()=>{shell.dispose();rowsEvents.abort();dialog.dispose();};cleanup.canLeave=dialog.canLeave;return cleanup;
}
