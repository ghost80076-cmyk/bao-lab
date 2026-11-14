'use strict';
// Opt-in lab only: synthetic local stories, no providers or production user data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const root = path.resolve(args.root || path.join(__dirname, '..'));
const label = args.label || 'candidate';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = {'.js':'application/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => { if(error) {res.writeHead(404).end();return;} res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(data); });
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,serviceWorkers:'block'});
    const page = await context.newPage();
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(() => {
      const lab = window.__readingLab = {raf:{},mutations:0,renderCalls:0,longTasks:[],events:[],callbacks:{},intervals:new Map()};
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => {
        const source = new Error().stack.split('\n').find(line => line.includes('/js/'))?.match(/\/js\/([^?:)]+)/)?.[1] || 'other';
        return raf(time => {lab.raf[source]=(lab.raf[source]||0)+1;callback(time);});
      };
      const interval = window.setInterval, clear = window.clearInterval;
      window.setInterval = (callback, delay, ...args) => {
        const source = new Error().stack.split('\n').find(line => line.includes('/js/'))?.match(/\/js\/([^?:)]+)/)?.[1] || 'other';
        const id = interval(() => {lab.callbacks[source]=(lab.callbacks[source]||0)+1; callback(...args);}, delay);
        lab.intervals.set(id, {source,delay}); return id;
      };
      window.clearInterval = id => {lab.intervals.delete(id);return clear(id);};
      new MutationObserver(records => {lab.mutations += records.filter(record => document.getElementById('chat-view')?.contains(record.target) || record.target.closest?.('#bao-phone-stage')).length;}).observe(document,{childList:true,subtree:true});
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => list.getEntries().forEach(entry=>lab.longTasks.push(entry.duration))).observe({type:'longtask'});
      if (PerformanceObserver.supportedEntryTypes.includes('event')) new PerformanceObserver(list => list.getEntries().filter(e=>e.interactionId).forEach(e=>lab.events.push(e.duration))).observe({type:'event',durationThreshold:16});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});
    await page.waitForFunction(()=>window.BAOChatExperience && window.BAOSceneRenderIntegrity && window.BAOPhoneUI && window.BAOStorySurface && window.BAOExtensionLoadHealth?.snapshot().story==='ready');
    const cdp=await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.evaluate(()=>{const render=BAOSceneHTML.render;BAOSceneHTML.render=function(...a){__readingLab.renderCalls++;return render.apply(this,a);};});
    const seed = async (rounds, phone=false) => page.evaluate(({rounds,phone})=>{
      App.activeCharacter=CharacterEngine.normalize({id:'reading-lab-'+rounds,name:'閱讀效能測試',greeting:'夜色裡的故事。',system_prompt:'故事',supported_modes:{immersive:true,world:true},phone_ui:phone?{enabled:true,apps:['notes','photos','instagram','spotify'],storyTime:'23:17',storyDate:'週六',notes:[{id:'memo',title:'碼頭',text:'燈光下的街道。'}]}:undefined});
      App.config={persona:{name:'玩家'},narrativeMode:'immersive',displayMode:'text',api:{type:'custom',model:'lab',baseUrl:'https://example.invalid',key:''},memory:{mode:'rounds',maxRounds:20,maxContext:32000,cache:false}};
      GameState.create(App.activeCharacter,App.config); Chat.reset();
      for(let i=0;i<rounds;i++){Chat.add('user','繼續閱讀。');Chat.add('assistant','夜色裡的故事，燈光下的街道。'.repeat(12));}
      App.renderChatShell(false);App.showView('chat');
    },{rounds,phone});
    const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    const snapshot=()=>page.evaluate(()=>({raf:{...__readingLab.raf},mutations:__readingLab.mutations,renderCalls:__readingLab.renderCalls,longTasks:[...__readingLab.longTasks],events:[...__readingLab.events],callbacks:{...__readingLab.callbacks},activeIntervals:[...__readingLab.intervals.values()],dom:document.querySelectorAll('*').length}));
    const reset=()=>page.evaluate(()=>{Object.assign(__readingLab,{raf:{},mutations:0,renderCalls:0,longTasks:[],events:[],callbacks:{}});});
    const records=[];
    async function sample(name,duration,action) {
      await reset();const start=await metrics(), begin=Date.now();
      if(action) await action(); else await sleep(duration);
      const end=await metrics(), data=await snapshot(), elapsed=Date.now()-begin;
      const delta=key=>+(1000*(end[key]-start[key])).toFixed(2);
      records.push({name,elapsedMs:elapsed,taskMs:delta('TaskDuration'),scriptMs:delta('ScriptDuration'),layoutMs:delta('LayoutDuration'),recalcMs:delta('RecalcStyleDuration'),cpuMainThreadPercent:+(delta('TaskDuration')/elapsed*100).toFixed(2),heapMiB:+(end.JSHeapUsedSize/1048576).toFixed(2),heapDeltaMiB:+((end.JSHeapUsedSize-start.JSHeapUsedSize)/1048576).toFixed(2),nodes:end.Nodes,listeners:end.JSEventListeners,...data});
      console.log(JSON.stringify({label,...records.at(-1)}));
    }
    await seed(5); await sleep(2500); await sample('short-idle',10000);
    await seed(100); await sleep(2500); await sample('long-idle',10000);
    await sample('continuous-reading-60s',60000,async()=>{
      const deadline=Date.now()+60000;
      while(Date.now()<deadline){await page.locator('#chat-stream').evaluate(el=>{el.scrollTop=Math.max(0,el.scrollTop-240)||el.scrollHeight;});await sleep(1000);}
    });
    await sample('typing-and-menu',0,async()=>{await page.locator('#user-input').fill('我停下來仔細觀察街道。');await page.locator('#bao-mobile-composer-tools').click();await page.keyboard.press('Escape');await sleep(500);});
    await sample('story-switches-10',0,async()=>{for(let i=0;i<10;i++){await seed(i%2?100:5);await sleep(200);}await sleep(1000);});
    await cdp.send('HeapProfiler.collectGarbage');const afterSwitchGC=await metrics();
    await sample('after-switch-idle',10000);
    await seed(5,true);await sleep(1500);await page.locator('#bao-phone-launch').click();await sample('phone-fixed-clock-idle',10000);
    // Real CDP page lifecycle freeze/resume; this is not an OS thermal test.
    await sample('background-freeze-resume',0,async()=>{await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await sleep(5000);await cdp.send('Page.setWebLifecycleState',{state:'active'});await sleep(1000);});
    await page.keyboard.press('Escape');await sleep(500);await sample('phone-closed-idle',5000);
    const finalGC=await cdp.send('HeapProfiler.collectGarbage').then(metrics);
    const animations=await page.evaluate(()=>document.getAnimations().map(a=>({state:a.playState,target:a.effect?.target?.className,name:a.animationName})).slice(0,40));
    const report={label,root,browser:browser.version(),viewport:'390x844 @3x',cpuThrottle:4,physicalDevice:false,records,afterSwitchGC,finalGC,animations};
    const out=path.join(__dirname,'../test-results/mobile-reading-performance');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
    const summary=process.env.GITHUB_STEP_SUMMARY;
    if(summary)fs.appendFileSync(summary,`\n### ${label} · ${browser.version()} · 390×844 · CPU 4×\n\n| Scenario | Task ms | Main-thread % | Heap MiB | DOM mutations | rAF callbacks | Renders | Long tasks |\n|---|---:|---:|---:|---:|---:|---:|---:|\n`+records.map(r=>`|${r.name}|${r.taskMs}|${r.cpuMainThreadPercent}|${r.heapMiB}|${r.mutations}|${Object.values(r.raf).reduce((a,b)=>a+b,0)}|${r.renderCalls}|${r.longTasks.length}|`).join('\n')+'\n');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
