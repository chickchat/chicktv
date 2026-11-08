import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const features=fs.readFileSync(new URL('../features.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('saved online alerts survive refresh; only an offline observation re-arms them',()=>{
  let alerts=0;
  const context={channelKey:c=>c.key,liveStates:new Map(),notifiedOnline:new Set(['twitch:sample']),subscriptions:new Set(['twitch:sample']),saveNotifiedOnline(){},alertText:()=>'',showOnlineAlert(){alerts++},showDesktopOnlineAlert(){}};
  vm.createContext(context);
  vm.runInContext(features.slice(features.indexOf('function recordAvailability('),features.indexOf('const liveStates =')),context);
  const c={key:'twitch:sample'};
  context.recordAvailability(c,true,true);context.recordAvailability(c,true,false);
  assert.equal(alerts,0);
  context.recordAvailability(c,false,false);context.recordAvailability(c,true,false);context.recordAvailability(c,true,false);
  assert.equal(alerts,1);
});
test('availability checks execute sequentially even when startup requests overlap',async()=>{
  let active=0,max=0;
  const context={runAvailabilityCheck:async()=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));active--;}};
  vm.createContext(context);
  vm.runInContext(features.slice(features.indexOf('let availabilityQueue'),features.indexOf('async function runAvailabilityCheck')),context);
  await Promise.all([context.checkAvailability(true),context.checkAvailability(false)]);
  assert.equal(max,1);
});
test('a pinned channel can be replaced when it goes offline after startup',()=>{
  const channels=[{key:'original'},{key:'replacement'}];
  const states=new Map([['original',true],['replacement',true]]);
  const context={channels,screens:[0],screenPinned:[true],screenPinnedKeys:['original'],pinnedFallbackEnabled:true,screenChannelKey:c=>c.key,channelKey:c=>c.key,liveStates:states,renderScreens(){},renderTabs(){},renderPinnedReplacements(){}};
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function applyPinnedFallback('),app.indexOf('function renderPinnedReplacements(')),context);
  context.applyPinnedFallback();assert.equal(context.screens[0],0);
  states.set('original',false);context.applyPinnedFallback();assert.equal(context.screens[0],1);
  assert.equal(context.screenPinnedKeys[0],'original');
});
test('an offline replacement hands a pinned screen to the next online channel',()=>{
  const channels=['original','first','second','third'].map(key=>({key}));
  const states=new Map([['original',false],['first',true],['second',true],['third',true]]);
  const context={channels,screens:[0],screenPinned:[true],screenPinnedKeys:['original'],pinnedFallbackEnabled:true,screenChannelKey:c=>c.key,channelKey:c=>c.key,liveStates:states,renderScreens(){},renderTabs(){},renderPinnedReplacements(){}};
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function applyPinnedFallback('),app.indexOf('function renderPinnedReplacements(')),context);
  context.applyPinnedFallback();assert.equal(context.screens[0],1);
  states.set('first',false);context.applyPinnedFallback();assert.equal(context.screens[0],2);
  states.set('second',false);context.applyPinnedFallback();assert.equal(context.screens[0],3);
  assert.equal(context.screenPinnedKeys[0],'original');
  states.set('third',false);context.applyPinnedFallback();assert.equal(context.screens[0],3,'keep the current screen when no online choice exists');
  states.set('original',true);context.applyPinnedFallback();assert.equal(context.screens[0],0,'return to the original when it is the only online choice');
});
test('replacement handoff preserves another screen and a working replacement',()=>{
  const channels=['original','first','second','other'].map(key=>({key}));
  const states=new Map([['original',false],['first',false],['second',true],['other',true]]);
  const context={channels,screens:[1,2],screenPinned:[true,false],screenPinnedKeys:['original',null],pinnedFallbackEnabled:true,screenChannelKey:c=>c.key,channelKey:c=>c.key,liveStates:states,renderScreens(){},renderTabs(){},renderPinnedReplacements(){}};
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function applyPinnedFallback('),app.indexOf('function renderPinnedReplacements(')),context);
  context.applyPinnedFallback();assert.deepEqual(context.screens,[3,2]);
  states.set('original',true);context.applyPinnedFallback();assert.deepEqual(context.screens,[3,2],'do not interrupt a live replacement');
});
