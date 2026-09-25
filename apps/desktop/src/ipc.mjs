import {publicFailure,failure} from './errors.mjs';
export function isTrustedSender(event,window,expectedUrl) {
 return Boolean(window && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame &&
  event.senderFrame?.url?.startsWith('file:') && (!expectedUrl || event.senderFrame.url===expectedUrl));
}
export function createDispatcher({getWindow,handlers,expectedUrl}) {
 let busy=false;
 return async(event,method,payload)=>{
  let acquired=false;
  try {
   if(!isTrustedSender(event,getWindow(),expectedUrl)||!Object.hasOwn(handlers,method))throw failure('IPC_DENIED');
   if(busy)throw failure('OPERATION_BUSY');
   busy=true;acquired=true;return {ok:true,value:await handlers[method](payload)};
  }catch(error){return {ok:false,error:publicFailure(error)};}
  finally{if(acquired)busy=false;}
 };
}
