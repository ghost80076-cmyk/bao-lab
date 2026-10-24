/* Opt-in phone events from the existing main-story response; never a second model request. */
(() => {
  'use strict';
  const Core = window.BAOPhoneStoryCore;
  if (!Core || !window.BAOPhoneUICore || typeof App === 'undefined' || typeof Chat === 'undefined' || window.BAOPhoneStoryBridge) return;
  const enabled = () => Boolean(window.BAOPhoneUICore.normalize(App.activeCharacter?.phone_ui));
  const originalAdd = Chat.add.bind(Chat);
  // Called by App only AFTER its in-flight story / message-signature guard.
  // Invalid, empty or non-phone updates leave the original prose untouched.
  Chat.add = function(role, content) {
    if (role !== 'assistant' || !enabled() || !window.GameState?.current ||
        this.messages.at(-1)?.role !== 'user') return originalAdd(role, content);
    const parsed = Core.extract(content);
    const message = originalAdd(role, parsed.text);
    if (parsed.patch) {
      Core.apply(GameState.current, parsed.patch, message.id);
      window.BAOPhoneUI?.refreshFromState?.();
    }
    return message;
  };
  const oldRender = App.renderStoryMessage.bind(App);
  App.renderStoryMessage = function(content, role='assistant', greeting=false, ...rest) {
    const clean = enabled() && role === 'assistant' && !greeting
      ? Core.extract(content).text : content;
    return oldRender(clean, role, greeting, ...rest);
  };
  if (typeof App.wrapBuildSystemPrompt === 'function') {
    App.wrapBuildSystemPrompt('phone-ui:optional-event-contract', function(next,...args) {
      const text=next(...args);
      return enabled() ? text + '\n\n' + Core.PROMPT : text;
    });
  }
  window.BAOPhoneStoryBridge = Object.freeze({enabled});
})();
