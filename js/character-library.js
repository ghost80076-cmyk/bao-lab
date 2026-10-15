/* IndexedDB-first storage for imported characters and their local cover images. */
(() => {
  if (typeof CharacterEngine === "undefined") return;

  const engine = CharacterEngine;
  const DB_NAME = "bao-lab-character-library";
  const DB_VERSION = 1;
  const STORE = "characters";
  const legacyLoad = engine.loadCustom.bind(engine);
  let db = null;
  let readyPromise = null;
  let writeQueue = Promise.resolve();
  let cache = legacyLoad();
  let fallback = typeof indexedDB === "undefined";
  const covers = new Map();
  const objectUrls = new Map();
  const assetCollections = new Map(), assetUrls = new Map(), attachments = new Map();
  const assetKey = (owner,id) => owner+"::"+id;
  const clearAssets = owner => { for(const [key,url] of assetUrls) if(key.startsWith(owner+"::")){URL.revokeObjectURL(url);assetUrls.delete(key);} };
  const assetURL = (owner,id) => {
    const asset=assetCollections.get(owner)?.find(x=>x.id===id), key=assetKey(owner,id);
    if(!asset?.blob) return "";
    if(!assetUrls.has(key))assetUrls.set(key,URL.createObjectURL(asset.blob));
    return assetUrls.get(key);
  };
  const resolveAssets = character => {
    for(const key of ["avatar","reading_background"]){
      const ref=String(character[key]||"");
      const asset=character.asset_manifest?.assets?.find(x=>x.role===(key==='avatar'?'cover':'background'));
      const id=ref.startsWith('yorubay-asset://')?ref.slice(16):ref.startsWith('blob:')?asset?.id:null;
      const url=id?assetURL(character.id,id):'';if(url)character[key]=url;
    }
    return character;
  };

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value)); }
  };

  const revoke = id => {
    const url = objectUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(id);
  };

  const materialize = record => {
    const character = engine.normalize(clone(record.character || record));
    assetCollections.set(character.id, record.assets || []);
    attachments.set(character.id,record.packageFiles || {});
    resolveAssets(character);
    const cover = record.cover instanceof Blob ? record.cover : null;
    if (cover && typeof URL?.createObjectURL === "function") {
      revoke(character.id);
      const url = URL.createObjectURL(cover);
      objectUrls.set(character.id, url);
      covers.set(character.id, cover);
      character.avatar = url;
    }
    character.source = "local-import";
    return character;
  };

  const normalizeWithoutAssets=engine.normalize.bind(engine);
  engine.normalize=raw=>resolveAssets(normalizeWithoutAssets(raw));

  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const next = request.result;
      if (!next.objectStoreNames.contains(STORE)) next.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      db = request.result;
      db.onversionchange = () => db?.close?.();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("本機角色資料庫無法開啟。"));
  });

  const request = (mode, action) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = action(store); }
    catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error || result?.error || new Error("本機角色資料庫操作失敗。"));
    tx.onabort = () => reject(tx.error || new Error("本機角色資料庫操作已中止。"));
  });

  const refreshApp = () => {
    if (!window.App || !Array.isArray(App.characters)) return;
    const builtIn = App.characters.filter(item => item.source !== "local-import");
    const seen = new Set();
    App.characters = [...engine.loadCustom(), ...builtIn].filter(item => !seen.has(item.id) && seen.add(item.id));
    const active = document.querySelector(".category-portal.active")?.dataset.category || "all";
    App.renderCharacters?.(active);
  };

  const persistLegacyFallback = () => {
    try {
      const safe = cache.map(character => {
        const copy = clone(character);
        if (String(copy.avatar || "").startsWith("blob:")) delete copy.avatar;
        return copy;
      });
      localStorage.setItem(engine.storageKey, JSON.stringify(safe));
    } catch (error) {
      console.warn("BAO/LAB imported-character fallback failed:", error);
    }
  };

  const ready = () => {
    if (readyPromise) return readyPromise;
    if (fallback) return Promise.resolve(null);
    readyPromise = open().then(async () => {
      let records = await request("readonly", store => store.getAll());
      if (!records.length && cache.length) {
        await request("readwrite", store => {
          cache.forEach(character => store.put({ id: character.id, character: clone(character), cover: null, updatedAt: new Date().toISOString() }));
        });
        records = await request("readonly", store => store.getAll());
        try { localStorage.removeItem(engine.storageKey); } catch {}
      }
      cache = records.map(materialize);
      refreshApp();
      return db;
    }).catch(error => {
      fallback = true;
      console.warn("BAO/LAB character IndexedDB unavailable; using localStorage fallback:", error);
      return null;
    });
    return readyPromise;
  };

  const upsertCache = (character, cover = undefined) => {
    const normalized = engine.normalize(character);
    normalized.source = "local-import";
    const prior = cache.find(item => item.id === normalized.id);
    if (cover instanceof Blob && typeof URL?.createObjectURL === "function") {
      revoke(normalized.id);
      const url = URL.createObjectURL(cover);
      objectUrls.set(normalized.id, url);
      covers.set(normalized.id, cover);
      normalized.avatar = url;
    } else if (prior && String(prior.avatar || "").startsWith("blob:")) {
      normalized.avatar = prior.avatar;
    }
    cache = [normalized, ...cache.filter(item => item.id !== normalized.id)].slice(0, 100);
    return normalized;
  };

  const saveAsync = async (character, options = {}) => {
    await ready();
    const normalized=engine.normalize(character);
    const cover = options.cover instanceof Blob ? options.cover : covers.get(character.id) || null;
    const assets=options.assets || assetCollections.get(character.id) || [];
    const packageFiles=options.packageFiles || attachments.get(character.id) || {};
    if(assets.length && (!db || fallback)) throw new Error("瀏覽器圖片儲存不可用，請保留作品 ZIP 並改用允許本機儲存的瀏覽器。");
    if(!normalized.asset_manifest && assets.length)normalized.asset_manifest={version:1,assets:assets.map(({blob,...meta})=>meta)};
    const storedCharacter=clone(normalized);
    for(const field of ["avatar","reading_background"]){
      const role=field==='avatar'?'cover':'background';
      const asset=normalized.asset_manifest?.assets?.find(x=>x.role===role);
      if(asset && String(storedCharacter[field]||'').startsWith('blob:'))storedCharacter[field]='yorubay-asset://'+asset.id;
    }
    if(String(storedCharacter.avatar||'').startsWith('blob:'))delete storedCharacter.avatar;
    // Commit character, media and attachments together; a quota failure leaves the previous card intact.
    if(db && !fallback)await request("readwrite",store=>store.put({id:normalized.id,character:storedCharacter,cover,assets,packageFiles,updatedAt:new Date().toISOString()}));
    clearAssets(normalized.id);
    assetCollections.set(normalized.id,assets);attachments.set(normalized.id,packageFiles);
    const saved=upsertCache(resolveAssets(engine.normalize(storedCharacter)),cover || undefined);
    if(!db || fallback)persistLegacyFallback();
    return saved;
  };

  engine.loadCustom = () => cache.map(character => engine.normalize(character));
  engine.loadCustomAsync = async () => { await ready(); return engine.loadCustom(); };
  engine.readyCustomLibrary = ready;
  engine.saveCustomAsync = saveAsync;
  engine.saveCustom = character => {
    const saved = upsertCache(character);
    writeQueue = writeQueue.then(() => saveAsync(saved)).catch(error => console.warn("BAO/LAB imported-character write failed:", error));
    return saved;
  };
  engine.removeCustom = id => {
    cache = cache.filter(character => character.id !== id);
    covers.delete(id); revoke(id); clearAssets(id);assetCollections.delete(id);attachments.delete(id);
    if (!db || fallback) persistLegacyFallback();
    else writeQueue = writeQueue.then(() => request("readwrite", store => store.delete(id))).catch(error => console.warn("BAO/LAB imported-character delete failed:", error));
  };
  engine.exportCustomLibrary = async () => {
    await ready();
    await writeQueue;
    const records = db && !fallback ? await request("readonly", store => store.getAll()) : cache.map(character => ({ id: character.id, character, cover: null }));
    return Promise.all(records.map(async record => ({
      id: record.id,
      character: clone(record.character || record),
      packageFiles: Object.fromEntries(Object.entries(record.packageFiles || {}).map(([name,data])=>[name,Array.from(data)])),
      assets: await Promise.all((record.assets||[]).map(async asset=>({...asset,blob:undefined,base64:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(asset.blob);})}))),
      cover: record.cover instanceof Blob ? await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(record.cover);
      }) : null
    })));
  };
  engine.importCustomLibrary = async records => {
    if (!Array.isArray(records) || records.length > 100) throw new Error("裝置搬家包的角色資料無效或超過 100 張。 ");
    await ready();
    for (const record of records) {
      const character = engine.normalize(record?.character || {});
      let cover = null;
      if (typeof record?.cover === "string" && /^data:image\/png;base64,/i.test(record.cover)) {
        const binary = atob(record.cover.split(",")[1] || "");
        if (binary.length > 10 * 1024 * 1024) throw new Error(`角色「${character.name}」的封面超過 10 MB。`);
        cover = new Blob([Uint8Array.from(binary, value => value.charCodeAt(0))], { type: "image/png" });
      }
      const assets=(record.assets||[]).map(asset=>{
        if(typeof asset.base64!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(asset.base64))throw new Error('搬家包圖片格式無效。');
        const data=Uint8Array.from(atob(asset.base64.split(',')[1]),c=>c.charCodeAt(0));
        if(data.length>10*1024*1024)throw new Error('搬家包單張圖片超過 10 MB。');
        return {...asset,base64:undefined,blob:new Blob([data],{type:asset.mime})};
      });
      const packageFiles=Object.fromEntries(Object.entries(record.packageFiles||{}).map(([name,data])=>[name,new Uint8Array(data)]));
      await saveAsync(character, { cover,assets,packageFiles });
    }
    refreshApp();
    return engine.loadCustom();
  };
  engine.getWorkAssetURL=assetURL;
  engine.getWorkAssets=id => (assetCollections.get(id)||[]).map(x=>({...x}));
  engine.getWorkPackageFiles=id => clone(attachments.get(id)||{});
  engine.exportWorkPackage=async id => {
    await ready();await writeQueue;
    const record=db&&!fallback?await request('readonly',store=>store.get(id)):null;
    if(!record)throw new Error('找不到可匯出的本機作品。');
    const files=Object.assign(Object.create(null),record.packageFiles||{}),assets=record.character.asset_manifest?.assets||[];
    for(const asset of record.assets||[])files[asset.path]=new Uint8Array(await asset.blob.arrayBuffer());
    return window.BAOWorkPackageCore.build({character:record.character,assets,files,adaptation:record.character.import_metadata?.package_adaptation});
  };
  engine.characterLibraryStatus = () => ({ mode: db && !fallback ? "indexedDB" : "localStorage", count: cache.length });
  engine.flushCustomLibrary = () => writeQueue;

  void ready();
})();
