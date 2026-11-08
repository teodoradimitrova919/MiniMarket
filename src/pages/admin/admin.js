import html from './admin.html?raw';
import './admin.css';
import { mountAdminShell } from '../../components/admin-shell/admin-shell.js';
import { showError } from '../../services/toast-service.js';
export const title='Admin Dashboard';
export function mount(container,{auth}) {
  container.innerHTML=html;
  const shell=mountAdminShell(container,{auth});
  const content=container.querySelector('[data-admin-stats]');
  let loading=false;
  async function load(){
    if(loading)return;loading=true;shell.feedback('Loading marketplace statistics…');content.hidden=true;
    try{
      const {getAdminStats}=await import('../../services/admin-service.js');
      const stats=await getAdminStats();if(!shell.isCurrent())return;
      for(const [name,value] of Object.entries({listings:stats.totalListings,categories:stats.totalCategories,users:stats.totalUsers}))container.querySelector(`[data-total-${name}]`).textContent=value;
      shell.clear();content.hidden=false;
    }catch{if(shell.isCurrent()){shell.feedback('Admin statistics could not be loaded.',load);showError('Admin statistics could not be loaded. Please try again.');}}
    finally{loading=false;}
  }
  void load();return shell.dispose;
}
