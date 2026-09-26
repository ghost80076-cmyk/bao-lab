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
    const cover = options.cover instanceof Blob ? options.cover : covers.get(character.id) || null;
    const saved = upsertCache(character, cover || undefined);
    if (!db || fallback) {
      persistLegacyFallback();
      return saved;
    }
    const storedCharacter = clone(saved);
    if (String(storedCharacter.avatar || "").startsWith("blob:")) delete storedCharacter.avatar;
    await request("readwrite", store => store.put({ id: saved.id, character: storedCharacter, cover, updatedAt: new Date().toISOString() }));
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
    covers.delete(id); revoke(id);
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
      await saveAsync(character, { cover });
    }
    refreshApp();
    return engine.loadCustom();
  };
  engine.characterLibraryStatus = () => ({ mode: db && !fallback ? "indexedDB" : "localStorage", count: cache.length });
  engine.flushCustomLibrary = () => writeQueue;

  void ready();
})();
