/* Optional phone presentation data adapter. No model calls, storage or HTML execution. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOPhoneUICore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const obj = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const txt = (value, max = 300) => String(value ?? '').slice(0, max);
  const arr = (value, max = 30) => Array.isArray(value) ? value.slice(0, max) : [];
  const allowedApps = ['phone', 'kakao', 'x', 'instagram', 'spotify'];
  // No active content, executable URLs, or arbitrary remote HTTP media.
  function media(value) {
    const url = txt(value, 2048).trim();
    if (/^https:\/\/[^\s<>"']+$/i.test(url)) return url;
    if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(url) && url.length <= 350000) return url;
    if (/^(?:(?:assets|media|uploads)\/)?[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif|mp3|m4a|ogg|wav|mp4|webm)$/i.test(url) && !url.split('/').includes('..')) return url;
    return '';
  }
  const defaultConfig = () => ({
    enabled: true, wallpaper: '', userName: '', contactName: '', twitterHandle: '',
    weather: { place: '', temp: '', desc: '', high: '', low: '' },
    events: [], calls: [], chat: [], tweets: [],
    instagram: { callerName: '', avatar: '', video: '', selfVideo: '', messages: [] },
    spotify: { cover: '', playlistName: '', creator: '', tracks: [] }
  });
  function normalize(value) {
    if (!obj(value) || value.enabled === false) return null;
    const weather = obj(value.weather) ? value.weather : {};
    const ig = obj(value.instagram) ? value.instagram : {};
    const sp = obj(value.spotify) ? value.spotify : {};
    return {
      enabled: true,
      wallpaper: media(value.wallpaper),
      userName: txt(value.userName, 80),
      contactName: txt(value.contactName, 80),
      twitterHandle: txt(value.twitterHandle, 80),
      weather: Object.fromEntries(['place', 'temp', 'desc', 'high', 'low'].map(k => [k, txt(weather[k], 60)])),
      events: arr(value.events, 8).filter(obj).map(item => ({ time: txt(item.time, 24), title: txt(item.title, 120) })),
      calls: arr(value.calls, 25).filter(obj).map(group => ({
        group: txt(group.group, 64),
        items: arr(group.items, 30).filter(obj).map(item => ({
          name: txt(item.name || value.contactName, 80), type: txt(item.type, 30),
          time: txt(item.time, 32), count: txt(item.count, 10)
        }))
      })),
      chat: arr(value.chat, 150).filter(obj).map(item => ({
        from: item.from === 'me' || item.from === '我' || item.from === '나' ? 'me' : 'them',
        time: txt(item.time, 30), text: txt(item.text, 1600)
      })),
      tweets: arr(value.tweets, 80).map(item => typeof item === 'string'
        ? { text: txt(item, 2000), date: '', likes: '', replies: '', reposts: '' }
        : obj(item) ? { text: txt(item.text, 2000), date: txt(item.date, 40),
          likes: txt(item.likes, 20), replies: txt(item.replies, 20), reposts: txt(item.reposts, 20) } : null).filter(Boolean),
      instagram: {
        callerName: txt(ig.callerName || value.contactName, 80), avatar: media(ig.avatar),
        video: media(ig.video), selfVideo: media(ig.selfVideo),
        messages: arr(ig.messages, 80).filter(obj).map(item => ({
          from: ['me', '我', '나'].includes(item.from) ? 'me' : 'them',
          text: txt(item.text, 1000),
          delay: Math.max(0, Math.min(600, Number(item.delay) || 0))
        }))
      },
      spotify: {
        cover: media(sp.cover), playlistName: txt(sp.playlistName, 120),
        creator: txt(sp.creator || value.userName, 80),
        tracks: arr(sp.tracks || sp.songs, 80).filter(obj).map(item => ({
          title: txt(item.title, 120), artist: txt(item.artist, 100),
          audio: media(item.audio), cover: media(item.cover || sp.cover),
          duration: Math.max(1, Math.min(36000, Number(item.duration) || 180))
        }))
      },
      apps: arr(value.apps, 12).map(item => txt(item, 30)).filter(item => allowedApps.includes(item))
    };
  }
  return Object.freeze({ normalize, defaultConfig, media, allowedApps });
});
