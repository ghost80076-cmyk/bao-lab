/* Portable work packages. No storage, network, script execution or prompt changes. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOWorkPackageCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const SCHEMA = 'yorubay-work-package', VERSION = 1;
  const LIMITS = Object.freeze({ archive: 32*1024*1024, total: 64*1024*1024, file: 10*1024*1024, json: 8*1024*1024, files: 256, assets: 200 });
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const clone = x => JSON.parse(JSON.stringify(x));
  const idOK = x => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(x) && !['constructor','prototype','__proto__'].includes(x);
  function path(value) {
    if (typeof value !== 'string' || !value || value.length > 240 || /[\\\u0000-\u001f:]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('作品包檔案路徑無效：'+String(value).slice(0,100));
    return value;
  }
  const bookIdOK=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9_-]{0,79}$/.test(x)&&!['constructor','prototype','__proto__'].includes(x);
  const jsonBytes = value => encoder.encode(JSON.stringify(value));
  function jsonFile(files, name) {
    path(name); const bytes = files[name];
    if (!(bytes instanceof Uint8Array) || bytes.length > LIMITS.json) throw new Error('缺少或過大的 JSON：'+name);
    return JSON.parse(decoder.decode(bytes));
  }
  const crcTable = Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes) { let n=0xffffffff; for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8); return (n^0xffffffff)>>>0; }
  function checkFiles(files) {
    const entries=Object.entries(files); if (!entries.length || entries.length>LIMITS.files) throw new Error('作品包最多 256 個檔案。');
    let total=0;
    for(const [name,data] of entries){path(name);if(!(data instanceof Uint8Array)||data.length>LIMITS.file)throw new Error('單檔超過 10 MB：'+name);total+=data.length;}
    if(total>LIMITS.total)throw new Error('作品包解開後超過 64 MB。');
    return entries;
  }
  function zip(files) {
    const entries=checkFiles(files), local=[],central=[]; let offset=0,centralSize=0;
    for(const [name,bytes] of entries){
      const filename=encoder.encode(name), checksum=crc32(bytes), header=new Uint8Array(30+filename.length), h=new DataView(header.buffer);
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,checksum,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,filename.length,true);header.set(filename,30);
      const directory=new Uint8Array(46+filename.length),d=new DataView(directory.buffer);
      d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,checksum,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,filename.length,true);d.setUint32(42,offset,true);directory.set(filename,46);
      local.push(header,bytes);central.push(directory);offset+=header.length+bytes.length;centralSize+=directory.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    const result=new Uint8Array(offset+centralSize+22); if(result.length>LIMITS.archive)throw new Error('ZIP 超過 32 MB；請拆分圖片包，保留原圖。');
    let cursor=0;for(const part of [...local,...central,end]){result.set(part,cursor);cursor+=part.length;}return result;
  }
  async function inflate(data, size) {
    if(typeof DecompressionStream!=='function')throw new Error('這個瀏覽器無法解開壓縮 ZIP；請更新瀏覽器或由 Creator 重新打包。');
    const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let count=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>size||count>LIMITS.file)throw new Error('ZIP 解壓縮長度超出宣告值。');parts.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
    const out=new Uint8Array(count);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
  }
  async function unzip(bytes, options = {}) {
    if(!(bytes instanceof Uint8Array)||bytes.length>LIMITS.archive||bytes.length<22)throw new Error('ZIP 無效或超過 32 MB。');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=Object.create(null),names=new Set();let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
    if(end<0)throw new Error('找不到 ZIP 目錄。');
    const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
    if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>LIMITS.files||start+size!==end)throw new Error('不支援分割、ZIP64 或過多檔案的 ZIP。');
    let cursor=start,total=0;const records=[];
    for(let i=0;i<count;i++){
      if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)throw new Error('ZIP 目錄不完整。');
      const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),checksum=view.getUint32(cursor+16,true),packed=view.getUint32(cursor+20,true),length=view.getUint32(cursor+24,true),nl=view.getUint16(cursor+28,true),el=view.getUint16(cursor+30,true),cl=view.getUint16(cursor+32,true),offset=view.getUint32(cursor+42,true);
      if(cursor+46+nl+el+cl>end)throw new Error('ZIP 檔名長度無效。');
      const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nl)),directory=name.endsWith('/');path(directory?name.slice(0,-1):name);
      if(names.has(name))throw new Error('ZIP 有重複路徑：'+name);names.add(name);
      if(flags&1||![0,8].includes(method)||((view.getUint32(cursor+38,true)>>>16)&0xf000)===0xa000||view.getUint16(cursor+34,true))throw new Error('不支援加密、連結或此壓縮方式：'+name);
      total+=length;if(length>LIMITS.file||total>Math.min(LIMITS.total,options.maxTotal||LIMITS.total))throw new Error('ZIP 解開後超過容量上限。');
      if(offset+30>start||view.getUint32(offset,true)!==0x04034b50||view.getUint16(offset+6,true)!==flags||view.getUint16(offset+8,true)!==method)throw new Error('ZIP 檔案標頭無效。');
      const localName=view.getUint16(offset+26,true),localExtra=view.getUint16(offset+28,true),begin=offset+30+localName+localExtra;
      if(begin+packed>start||decoder.decode(bytes.subarray(offset+30,offset+30+localName))!==name)throw new Error('ZIP 檔案內容越界。');
      records.push({name,directory,method,checksum,packed,length,begin});cursor+=46+nl+el+cl;
    }
    if(cursor!==end)throw new Error('ZIP 目錄大小不符。');
    for(const rec of records){const data=bytes.subarray(rec.begin,rec.begin+rec.packed);const result=rec.method===0?data.slice():await inflate(data,rec.length);if(result.length!==rec.length||crc32(result)!==rec.checksum)throw new Error('ZIP 檔案校驗失敗：'+rec.name);if(!rec.directory)files[rec.name]=result;}
    checkFiles(files);return files;
  }
  function imageMime(bytes) {
    if(bytes[0]===137&&decoder.decode(bytes.subarray(1,4))==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
    if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return 'image/webp';
    if(String.fromCharCode(...bytes.subarray(0,6)).match(/^GIF8[79]a$/))return 'image/gif';
    return '';
  }
  function normalizeAsset(raw,files) {
    if(!object(raw)||!idOK(raw.id))throw new Error('圖片 ID 無效。');
    const name=path(raw.path),bytes=files[name],mime=bytes&&imageMime(bytes);
    if(!mime)throw new Error('圖片缺少或格式不支援（PNG/JPEG/WebP/GIF）：'+name);
    const role=raw.role||'gallery';if(!['cover','background','scene','portrait','gallery'].includes(role))throw new Error('圖片用途無效：'+role);
    const when=raw.when||[];if(!Array.isArray(when)||when.length>8)throw new Error('圖片條件最多 8 個。');
    for(const rule of when)if(!object(rule)||typeof rule.path!=='string'||! /^(location|time|modules(?:\.[a-zA-Z0-9_-]+){1,5})$/.test(rule.path)||rule.path.split('.').some(x=>['__proto__','constructor','prototype'].includes(x))||!['string','number','boolean'].includes(typeof rule.equals))throw new Error('圖片條件需指定 location、time 或 modules 路徑與 equals。');
    return {id:raw.id,path:name,role,name:String(raw.name||raw.id).slice(0,120),...(raw.source_uri?{source_uri:String(raw.source_uri).slice(0,500)}:{}),when:clone(when),mime};
  }
  function assemble(manifest,files) {
    checkFiles(files);if(!object(manifest)||manifest.schema!==SCHEMA||manifest.version!==VERSION)throw new Error('作品包版本不支援。');
    const character=jsonFile(files,manifest.character),worldbooks=manifest.worldbooks||[];
    if(!object(character)||!Array.isArray(worldbooks)||worldbooks.length>6)throw new Error('角色或世界書清單無效（最多 6 包）。');
    if(!Array.isArray(manifest.assets||[])||(manifest.assets||[]).length>LIMITS.assets)throw new Error('最多 200 張作品圖片。');
    const assets=(manifest.assets||[]).map(raw=>normalizeAsset(raw,files));if(new Set(assets.map(x=>x.id)).size!==assets.length)throw new Error('作品圖片 ID 重複。');
    if(assets.filter(x=>x.role==='cover').length>1||assets.filter(x=>x.role==='background').length>1)throw new Error('封面與閱讀背景各只能指定一張。');
    let initial;if(object(character.gameplay)){character.gameplay.initial_state ||= {};initial=character.gameplay.initial_state;}else{character.initial_state ||= {};initial=character.initial_state;}
    const library=clone(initial.worldbookLibrary||{version:1,enabled:[],installed:[],pinned:{}}),ids=new Set((library.installed||[]).map(x=>x.meta?.id));
    for(const item of worldbooks){const entry=typeof item==='string'?{path:item,enabled:true}:item,book=jsonFile(files,entry.path);if(!object(book)||book.schema!=='yorubay-worldbook-pack'||book.version!==1||!bookIdOK(book.meta?.id)||!Array.isArray(book.entries))throw new Error('世界書快照無效。');if(ids.has(book.meta.id))throw new Error('世界書 ID 重複：'+book.meta.id);ids.add(book.meta.id);library.installed.push(book);if(entry.enabled!==false&&!library.enabled.includes(book.meta.id))library.enabled.push(book.meta.id);if(entry.pinned===true&&!Object.prototype.hasOwnProperty.call(library.pinned,book.meta.id))library.pinned[book.meta.id]=book;}
    if(worldbooks.length)initial.worldbookLibrary=library;
    const regex=manifest.regex?jsonFile(files,manifest.regex):null;
    if(regex){character.import_metadata ||= {};character.import_metadata.work_package_regex=regex;}
    if(assets.length){character.asset_manifest={version:1,assets};for(const asset of assets){if(asset.role==='cover'){character.avatar='yorubay-asset://'+asset.id;if(object(character.meta))character.meta.avatar=character.avatar;}if(asset.role==='background'){character.reading_background='yorubay-asset://'+asset.id;character.presentation ||= {};character.presentation.reading_background=character.reading_background;}}}
    for(const ref of [character.avatar,character.meta?.avatar,character.reading_background,character.presentation?.reading_background])if(typeof ref==='string'&&ref.startsWith('yorubay-asset://')&&!assets.some(a=>a.id===ref.slice(16)))throw new Error('圖片引用沒有對應原圖：'+ref);
    character.import_metadata ||= {};character.import_metadata.package_adaptation=clone(manifest.adaptation||{});
    return {character,assets:assets.map(asset=>({...asset,bytes:files[asset.path]})),regex,manifest:clone(manifest),files};
  }
  function build(input) {
    const character=clone(input.character), files=Object.assign(Object.create(null),input.files||{}),assets=clone(input.assets||character.asset_manifest?.assets||[]),worldbooks=[];
    const initial=character.gameplay?.initial_state||character.initial_state,lib=initial?.worldbookLibrary;
    const books=[...(lib?.installed||[]),...(input.worldbooks||[])];const ids=new Set();
    for(const book of books){if(!bookIdOK(book?.meta?.id)||ids.has(book.meta.id))throw new Error('世界書 ID 無效或重複。');ids.add(book.meta.id);const name='worldbooks/'+book.meta.id+'.json';files[name]=jsonBytes(book);worldbooks.push({path:name,enabled:lib?.installed?.some(x=>x.meta.id===book.meta.id)?lib.enabled.includes(book.meta.id):true,pinned:Boolean(lib?.pinned?.[book.meta.id])});}
    // Pinned snapshots may intentionally differ from installed copies. Keep them verbatim.
    if(lib)lib.installed=[];
    delete character.asset_manifest;
    const regex=input.regex||character.import_metadata?.work_package_regex;
    if(character.import_metadata)delete character.import_metadata.work_package_regex;
    const manifest={schema:SCHEMA,version:VERSION,character:'character.json',worldbooks,assets,adaptation:clone(input.adaptation||{})};
    files['character.json']=jsonBytes(character);if(regex){manifest.regex='regex.json';files['regex.json']=jsonBytes(regex);}
    files['manifest.json']=jsonBytes(manifest);const result=assemble(manifest,files);return {...result,bytes:zip(files)};
  }
  function matchAsset(assets,state,role='scene') {
    const value=key=>key.split('.').reduce((v,k)=>v&&Object.prototype.hasOwnProperty.call(v,k)?v[k]:undefined,state);
    return (assets||[]).filter(a=>a.role===role&&(a.when||[]).every(r=>value(r.path)===r.equals)).sort((a,b)=>(b.when?.length||0)-(a.when?.length||0))[0]||null;
  }
  return Object.freeze({SCHEMA,VERSION,LIMITS,path,idOK,jsonBytes,jsonFile,crc32,zip,unzip,imageMime,assemble,build,matchAsset});
});
