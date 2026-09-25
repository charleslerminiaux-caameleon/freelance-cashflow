import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyDatabase,inspectDatabase} from './supabase-inspection.mjs';
const manifest=[{version:'001',filename:'001_core.sql',sha256:'a',tables:['app_settings'],functions:[]}];
test('rejects foreign objects and future or gapped histories instead of guessing',()=>{
 for(const data of [
  {tables:['payroll'],functions:[],versions:[]},
  {tables:['app_settings'],functions:[],versions:['999']},
  {tables:[],functions:[],versions:['001']}
 ])assert.equal(classifyDatabase({...data,manifest}).kind,'incompatible');
 assert.equal(classifyDatabase({tables:[],functions:[],versions:[],manifest}).kind,'empty');
 assert.equal(classifyDatabase({tables:['app_settings'],functions:[],versions:['001'],manifest}).kind,'compatible');
});
test('bounds network failures and never follows credential-bearing redirects',async()=>{
 const config={projectRef:'abcdefghijklmnopqrst',url:'https://abcdefghijklmnopqrst.supabase.co',anonKey:'public',serviceRoleKey:'private'};
 await assert.rejects(inspectDatabase({config,accessToken:'test',manifest,request:async(url,options)=>{
  assert.equal(options.redirect,'error');throw Error('private');
 }}),e=>e.code==='SUPABASE_UNAVAILABLE'&&!e.message.includes('private'));
});
