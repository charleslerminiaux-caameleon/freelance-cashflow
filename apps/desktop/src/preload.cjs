const {contextBridge,ipcRenderer}=require('electron');
const bridge={};
for(const method of ['getState','retryStart','inspect','apply','saveAndStart','openSupabase','open','quit']) {
 bridge[method]=payload=>ipcRenderer.invoke('cashflow:setup',method,payload);
}
contextBridge.exposeInMainWorld('cashflowDesktop',Object.freeze(bridge));
