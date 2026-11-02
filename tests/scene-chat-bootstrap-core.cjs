'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.SCENE_CHAT_SOURCE || 'js/scene-chat-integration.js','utf8');
for(const bridgeReady of [false,true]){
  const context={window:{BAOScenePresentation:{}},document:{querySelector(){return null;},getElementById(){return null;}},localStorage:{getItem(){return '{"enabled":true,"type":"intimacy"}';}}};
  vm.createContext(context);
  vm.runInContext(`const App={renderChatShell(){return 'shell';},async sendMessage(){return 'reply';}};const Chat={messages:[]};${bridgeReady?'window.App=App;window.Chat=Chat;':''}`,context);
  vm.runInContext(source,context);
  assert.ok(context.window.BAOSceneChat,'initialize using parser bindings even before bridge publication');
  assert.equal(context.window.BAOSceneChat.prefs.type,'intimacy');
  assert.equal(vm.runInContext('App.renderChatShell()',context),'shell','preserve wrapped result');
  assert.equal(vm.runInContext('Chat.messages.length',context),0,'presentation bootstrap does not write story history');
  if(!bridgeReady)assert.equal(context.window.App,undefined,'bootstrap does not need to publish or replace globals');
}
console.log('PASS scene bootstrap before/after global bridge, persisted preference and unchanged shell/history');
