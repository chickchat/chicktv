import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../features.js', import.meta.url), 'utf8');
function sharedStatus(entries, channel) {
  const context = {};
  vm.createContext(context);
  const start = features.indexOf('function sharedChannelStatus(');
  const end = features.indexOf('async function checkSharedStatus()', start);
  vm.runInContext(features.slice(start, end), context);
  return context.sharedChannelStatus(entries, channel);
}
function fixture() {
  class Element {
    constructor(cls='',text='') {this.className=cls;this.textContent=text;this.children=[];this.dataset={};this.attributes={};this.classList={toggle:(name,on)=>{const list=new Set(this.className.split(' ').filter(Boolean));on?list.add(name):list.delete(name);this.className=[...list].join(' ');}};}
    append(...nodes) {for(const node of nodes){if(typeof node==='object')node.parent=this;this.children.push(node);}}
    replaceChildren(...nodes) {this.children=[];this.append(...nodes);}
    setAttribute(name,value) {this.attributes[name]=value;}
    querySelectorAll(selector) {return this.children.filter(node=>typeof node==='object'&&node.className.split(' ').includes(selector.slice(1)));}
    after(...nodes) {this.parent.children.splice(this.parent.children.indexOf(this)+1,0,...nodes);}
  }
  const nodes={'#channels':new Element(),'#personal-channels':new Element(),'#status-note':new Element()};
  const channels=[
    {identityKey:'soop:sample',displayname:'SOOP sample',platform:'embed',custom:true},
    {identityKey:'vl:offline',displayname:'Offline Kick',platform:'vl'},
    {identityKey:'vl:unknown',displayname:'Unverified Kick',platform:'vl'},
  ];
  const liveStates=new Map([['soop:sample',true],['vl:offline',false],['vl:unknown',null]]);
  const context={channels,liveStates,screenOnlineChannelKeys:new Set(),screens:[0],selected:0,hideOfflineChannels:true,
    screenChannelKey:channel=>channel.identityKey,channelKey:channel=>channel.identityKey,
    subscriptions:new Set(),alertText:()=>'',openAlertSettings(){},
    $:selector=>nodes[selector],el:(_tag,cls,text)=>new Element(cls,text),
    document:{createTextNode:text=>text,documentElement:{lang:'en'}},
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function renderTabs()'),app.indexOf('function sourceUrl(')),context);
  vm.runInContext(features.slice(features.indexOf('const originalRenderTabs = renderTabs;'),features.indexOf('function channelKey(')),context);
  return {context,liveStates,nodes,visible:()=>Object.fromEntries(['#channels','#personal-channels'].map(id=>[id,nodes[id].querySelectorAll('.channel').map(button=>button.dataset.channelKey)]))};
}

test('live-only rails hide offline and unverified Kick channels; Show offline keeps their true states',()=>{
  const f=fixture();f.context.renderTabs();
  assert.deepEqual(f.visible(),{'#channels':[],'#personal-channels':['soop:sample']});
  assert.equal(f.nodes['#status-note'].textContent,'Online channels: 1');
  f.context.hideOfflineChannels=false;f.context.renderTabs();
  assert.deepEqual(f.visible()['#channels'],['vl:offline','vl:unknown']);
  const buttons=f.nodes['#channels'].querySelectorAll('.channel');
  assert.equal(buttons[0].title,'Offline');assert.equal(buttons[1].title,'Live status unknown');
  assert.equal(f.liveStates.get('vl:unknown'),null);
  assert.deepEqual(f.context.screens,[0],'rail filtering must preserve the selected screen');
});

test('SOOP online/offline transitions update green styling, visibility and count without recreating screens',()=>{
  const f=fixture();f.context.renderTabs();
  assert.match(f.nodes['#personal-channels'].querySelectorAll('.channel')[0].className,/channel-online/);
  f.liveStates.set('soop:sample',false);f.context.renderTabs();
  assert.equal(f.visible()['#personal-channels'].length,0);
  assert.equal(f.nodes['#status-note'].textContent,'Online channels: 0');
  f.liveStates.set('soop:sample',true);f.context.renderTabs();
  assert.deepEqual(f.visible()['#personal-channels'],['soop:sample']);
  assert.equal(f.nodes['#status-note'].textContent,'Online channels: 1');
});

test('shared Kick status treats a missing channel as offline and matches channel IDs case-insensitively',()=>{
  const feed=[
    {platform:'vl',details:'COLLARTV',status:'offline'},
    {platform:'vl',details:'LIVE-NAME',status:'live'},
    {platform:'vl',details:'STALE-NAME',status:'unknown'},
  ];
  assert.equal(sharedStatus(feed,{platform:'vl',details:'collartv'}),'offline');
  assert.equal(sharedStatus(feed,{platform:'VL',details:'live-name'}),'live');
  assert.equal(sharedStatus(feed,{platform:'vl',details:'missing-name'}),'offline');
  assert.equal(sharedStatus(feed,{platform:'vl',details:'stale-name'}),'unknown');
});
