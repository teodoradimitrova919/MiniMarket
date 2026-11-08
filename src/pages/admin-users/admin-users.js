import html from './admin-users.html?raw';
import './admin-users.css';
import {mountAdminShell,cell,actionButton,renderPager} from '../../components/admin-shell/admin-shell.js';
import {createAdminDialog,field,detail} from '../../components/admin-dialog/admin-dialog.js';
import {formatDate} from '../../utils/format-date.js';
import {showError} from '../../services/toast-service.js';
export const title='Users Management';
export function mount(container,{auth}){
  container.innerHTML=html;
  const shell=mountAdminShell(container,{auth}),form=container.querySelector('form'),table=container.querySelector('[data-admin-table]'),rows=container.querySelector('tbody'),pager=container.querySelector('[data-admin-pager]');
  const dialog=createAdminDialog({focusFallback:()=>container.querySelector('h1')});
  let service,page=1,revision=0,actionRevision=0,rowsEvents=new AbortController();
  async function view(user,trigger){
    const current=++actionRevision;
    try{const data=await service.getAdminUser(user.id);if(!shell.isCurrent()||current!==actionRevision)return;
      dialog.open({title:'User Details',nodes:[detail('ID',data.user.id),detail('Email',data.user.email),detail('Display name',data.user.username),detail('Role',data.user.role),detail('Registered',formatDate(data.user.created_at)),detail('Listings',data.user.listingCount),detail('Deletion pending',data.user.deletionPending?'Yes':'No')]},trigger);
    }catch(error){if(shell.isCurrent())showError(error.message);}
  }
  function edit(user,trigger){
    actionRevision++;
    dialog.open({title:'Edit User',nodes:[field('Display name','username',{value:user.username,maxLength:80}),field('Email address','email',{value:user.email,type:'email',maxLength:254,help:'Administrator email changes take effect directly, without a confirmation email.'}),field('Role','role',{value:user.role,options:[{label:'User',value:'user'},{label:'Administrator',value:'admin'}],help:'Administrators can manage all listings, categories, and users. At least one administrator must remain.'})],dirty:true,onSave:async form=>{
      const patch={};
      for(const name of ['username','email','role'])if(form.elements[name].value!==user[name])patch[name]=form.elements[name].value;
      if(!Object.keys(patch).length)return;
      await service.updateAdminUser(user.id,patch);
      if(user.id===auth.getState().user?.id)await auth.refresh();
      if(shell.isCurrent())await load();
    }},trigger);
  }
  async function remove(user,trigger){
    const current=++actionRevision;
    try{
      const data=await service.getUserDeletionImpact(user.id);if(!shell.isCurrent()||current!==actionRevision)return;
      const {impact}=data;
      dialog.open({title:'Permanently Delete User',nodes:[detail('Email',data.user.email),detail('Owned listings',impact.listings),detail('Listing images',impact.images),detail('PDF documents',impact.documents||0),detail('Attachments',impact.attachments||0),detail('Own favorites',impact.ownFavorites),detail('Favorites of owned listings',impact.listingFavorites),detail('Warning','Deletion is permanent. The account is frozen, files and dependent records are cleaned up, then the Auth account is deleted. A partial failure must be retried; ownership is never transferred.'),field('Type the user email to confirm','confirmation',{type:'email',maxLength:254})],destructive:true,submitLabel:'Delete User',onSave:async form=>{
        if(form.elements.confirmation.value!==data.user.email){form.elements.confirmation.setCustomValidity('Type the exact user email.');form.elements.confirmation.classList.add('is-invalid');form.elements.confirmation.addEventListener('input',()=>form.elements.confirmation.setCustomValidity(''),{once:true,signal:shell.events.signal});const error=new Error('Type the exact user email to confirm deletion.');error.code='VALIDATION_ERROR';throw error;}
        await service.deleteAdminUser(user.id,form.elements.confirmation.value);await load();
      }},trigger);
    }catch(error){if(shell.isCurrent())showError(error.message);}
  }
  async function load(){
    const current=++revision;actionRevision++;table.hidden=true;pager.replaceChildren();shell.feedback('Loading registered users…');
    try{
      service=await import('../../services/admin-service.js');const data=await service.getAdminUsers({page,pageSize:20,search:form.elements.search.value});
      if(!shell.isCurrent()||current!==revision)return;
      if(!data.users.length&&page>1&&data.total){page=Math.ceil(data.total/20);return load();}
      rowsEvents.abort();rowsEvents=new AbortController();rows.replaceChildren();
      for(const user of data.users){
        const row=document.createElement('tr');row.dataset.userId=user.id;const name=cell(user.username);const id=document.createElement('span');id.className='admin-user-id';id.textContent=user.id;name.append(id);
        const actions=cell(''),group=document.createElement('div');group.className='d-flex flex-wrap gap-2';
        const del=actionButton(user.deletionPending?'Retry deletion':'Delete',event=>remove(user,event.currentTarget),rowsEvents.signal,'outline-danger');
        del.disabled=user.id===auth.getState().user.id;if(del.disabled)del.title='You cannot delete your own account from the Admin Panel.';
        group.append(actionButton('View',event=>view(user,event.currentTarget),rowsEvents.signal),actionButton('Edit',event=>edit(user,event.currentTarget),rowsEvents.signal),del);actions.append(group);
        row.append(name,cell(user.email),cell(user.role),cell(formatDate(user.created_at)),cell(user.listingCount),actions);rows.append(row);
      }
      shell.clear();table.hidden=!data.users.length;if(!data.users.length)shell.feedback('No users match your search.');
      renderPager(pager,{page,total:data.total,signal:rowsEvents.signal,onChange:value=>{page=value;void load();}});
    }catch{if(shell.isCurrent()&&current===revision){shell.feedback('Registered users could not be loaded.',load);showError('Users could not be loaded. Please try again.');}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();page=1;void load();},{signal:shell.events.signal});
  void load();const cleanup=()=>{shell.dispose();rowsEvents.abort();dialog.dispose();};cleanup.canLeave=dialog.canLeave;return cleanup;
}
