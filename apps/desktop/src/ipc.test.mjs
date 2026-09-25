import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isTrustedSender,createDispatcher} from './ipc.mjs';
test('rejects foreign windows and subframes before calling privileged handlers',async()=>{
 const mainFrame={url:'file:///app/index.html'};const webContents={mainFrame};
 const window={webContents};let calls=0;
 const dispatch=createDispatcher({getWindow:()=>window,handlers:{getState:async()=>{calls++;return {step:'welcome'};}}});
 assert.equal(isTrustedSender({sender:webContents,senderFrame:mainFrame},window),true);
 const result=await dispatch({sender:webContents,senderFrame:{url:mainFrame.url}},'getState');
 assert.equal(result.ok,false);assert.equal(calls,0);
 assert.deepEqual(await dispatch({sender:webContents,senderFrame:mainFrame},'getState'),{ok:true,value:{step:'welcome'}});
});
test('does not serialize raw errors or allow unknown operations',async()=>{
 const frame={url:'file:///app/index.html'},window={webContents:{mainFrame:frame}};
 const dispatch=createDispatcher({getWindow:()=>window,handlers:{getState:async()=>{throw Error('secret');}}});
 assert.equal(JSON.stringify(await dispatch({sender:window.webContents,senderFrame:frame},'getState')).includes('secret'),false);
 assert.equal((await dispatch({sender:window.webContents,senderFrame:frame},'arbitrary')).ok,false);
});

test('rejected concurrent callers cannot unlock an ongoing privileged operation',async()=>{
 const frame={url:'file:///app/index.html'},window={webContents:{mainFrame:frame}};
 const event={sender:window.webContents,senderFrame:frame};let release;let calls=0;
 const dispatch=createDispatcher({getWindow:()=>window,handlers:{inspect:async()=>{calls++;await new Promise(r=>{release=r;});}}});
 const first=dispatch(event,'inspect');await Promise.resolve();
 assert.equal((await dispatch(event,'inspect')).ok,false);
 const third=await Promise.race([dispatch(event,'inspect'),new Promise(r=>setTimeout(()=>r({ok:true}),20))]);
 release();assert.equal(third.ok,false);assert.equal(calls,1);await first;
});
