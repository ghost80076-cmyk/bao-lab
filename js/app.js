const App = {
  characters: [],
  activeCharacter: null,
  prompts: {},
  modelPresets: [],
  currentStep: 1,
  config: {},

  async init() {
    this.bindNavigation();
    this.bindBuilder();
    await Promise.all([
      this.loadCharacters(),
      this.loadPrompts(),
      this.loadModels()
    ]);
    this.populateAPIControls();
    this.showView("home");
  },

  bindNavigation() {
    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => this.showView(btn.dataset.view));
    });

    document.querySelectorAll(".filter").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        this.renderCharacters(btn.dataset.filter);
      });
    });
  },

  bindBuilder() {
    document.querySelectorAll('input[name="narrative-mode"]').forEach(r => {
      r.addEventListener("change", () => {
        document.querySelectorAll('input[name="narrative-mode"]').forEach(x => x.closest(".choice-card").classList.remove("selected"));
        r.closest(".choice-card").classList.add("selected");
      });
    });

    document.querySelectorAll('input[name="display-mode"]').forEach(r => {
      r.addEventListener("change", () => {
        document.querySelectorAll('input[name="display-mode"]').forEach(x => x.closest(".choice-card").classList.remove("selected"));
        r.closest(".choice-card").classList.add("selected");
      });
    });

    document.querySelectorAll(".step").forEach(step => {
      step.addEventListener("click", () => this.setStep(Number(step.dataset.step)));
    });

    document.querySelectorAll(".ui-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".ui-tab").forEach(x => x.classList.remove("active"));
        tab.classList.add("active");
        this.renderUIPanel(tab.dataset.panel);
      });
    });

    document.getElementById("api-type").addEventListener("change", () => this.populateModelOptions());

    document.getElementById("user-input").addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  },

  async loadCharacters() {
    const manifest = await (await fetch("data/characters.json")).json();
    this.characters = await Promise.all(
      manifest.map(async item => await (await fetch(item.file)).json())
    );
    this.renderCharacters("all");
  },

  async loadPrompts() {
    const [immersive, world] = await Promise.all([
      fetch("data/prompts/immersive.json").then(r => r.json()),
      fetch("data/prompts/world.json").then(r => r.json())
    ]);
    this.prompts = { immersive, world };
  },

  async loadModels() {
    this.modelPresets = await (await fetch("data/presets/models.json")).json();
  },

  populateAPIControls() {
    const apiType = document.getElementById("api-type");
    const providers = [...new Set(this.modelPresets.map(x => x.provider))];
    apiType.innerHTML = providers.map(p => `<option value="${this.escapeAttr(p)}">${this.escapeHTML(p)}</option>`).join("");
    this.populateModelOptions();
  },

  populateModelOptions() {
    const type = document.getElementById("api-type").value;
    const items = this.modelPresets.filter(x => x.provider === type);
    const modelSelect = document.getElementById("model-select");
    modelSelect.innerHTML = items.map(x => `<option value="${this.escapeAttr(x.model)}">${this.escapeHTML(x.label)}</option>`).join("");

    const first = items[0];
    document.getElementById("base-url").value = first?.base_url || "";
  },

  renderCharacters(filter = "all") {
    const list = document.getElementById("character-list");
    let chars = this.characters;

    if (filter === "adult") chars = chars.filter(c => c.rating === "adult");
    else if (filter !== "all") chars = chars.filter(c =>
      (c.audience || []).includes(filter) || (c.categories || []).includes(filter)
    );

    list.innerHTML = chars.length ? chars.map(c => `
      <article class="character-card" onclick="App.openCharacter('${c.id}')">
        <img src="${this.escapeAttr(c.avatar)}" alt="${this.escapeAttr(c.name)}">
        <div class="character-content">
          <div class="eyebrow">${c.rating === "adult" ? "18+ / ADULT" : "ORIGINAL CHARACTER"}</div>
          <h3>${this.escapeHTML(c.name)}</h3>
          <p>${this.escapeHTML(c.description)}</p>
          <div class="tags">${(c.tags || []).map(t => `<span class="tag">#${this.escapeHTML(t)}</span>`).join("")}</div>
        </div>
      </article>`).join("")
      : `<p class="note">這個分類目前還沒有作品。</p>`;
  },

  openCharacter(id) {
    this.activeCharacter = this.characters.find(c => c.id === id);
    this.renderDetail();
    this.showView("detail");
  },

  renderDetail() {
    const c = this.activeCharacter;
    document.getElementById("character-detail").innerHTML = `
      <div class="detail-layout">
        <img class="detail-image" src="${this.escapeAttr(c.avatar)}" alt="${this.escapeAttr(c.name)}">
        <div class="detail-copy">
          <div class="eyebrow">${c.rating === "adult" ? "18+ CHARACTER" : "ORIGINAL CHARACTER"}</div>
          <h1>${this.escapeHTML(c.name)}</h1>
          <div class="tags">${(c.tags || []).map(t => `<span class="tag">#${this.escapeHTML(t)}</span>`).join("")}</div>
          <p>${this.escapeHTML(c.description)}</p>
          <div class="quote">${this.escapeHTML(c.quote || "")}</div>
          <button class="primary" onclick="App.openBuilder()">開始故事</button>
        </div>
      </div>`;
  },

  openBuilder() {
    document.getElementById("builder-character-chip").textContent = this.activeCharacter.name;
    this.setStep(1);
    this.showView("builder");
  },

  showCharacterDetail() {
    this.showView("detail");
  },

  setStep(step) {
    this.currentStep = Math.max(1, Math.min(5, step));
    document.querySelectorAll(".builder-step").forEach(p =>
      p.classList.toggle("active", Number(p.dataset.stepPanel) === this.currentStep)
    );
    document.querySelectorAll(".step").forEach(s =>
      s.classList.toggle("active", Number(s.dataset.step) === this.currentStep)
    );

    document.getElementById("prev-step").classList.toggle("hidden", this.currentStep === 1);
    document.getElementById("next-step").classList.toggle("hidden", this.currentStep === 5);
    document.getElementById("start-story").classList.toggle("hidden", this.currentStep !== 5);
  },

  nextStep() { this.setStep(this.currentStep + 1); },
  prevStep() { this.setStep(this.currentStep - 1); },

  collectConfig() {
    return {
      narrativeMode: document.querySelector('input[name="narrative-mode"]:checked').value,
      displayMode: document.querySelector('input[name="display-mode"]:checked').value,
      persona: {
        name: document.getElementById("persona-name").value.trim() || "未命名玩家",
        gender: document.getElementById("persona-gender").value,
        identity: document.getElementById("persona-identity").value.trim(),
        relationship: document.getElementById("persona-relationship").value.trim(),
        personality: document.getElementById("persona-personality").value.trim(),
        extra: document.getElementById("persona-extra").value.trim()
      },
      api: {
        type: document.getElementById("api-type").value,
        model: document.getElementById("model-select").value,
        baseUrl: document.getElementById("base-url").value.trim(),
        key: document.getElementById("api-key").value.trim()
      },
      memory: {
        mode: document.getElementById("memory-mode").value,
        maxRounds: Number(document.getElementById("max-rounds").value || 20),
        maxContext: Number(document.getElementById("max-context").value || 64000),
        cache: document.getElementById("cache-enabled").checked
      }
    };
  },

  startStory() {
    this.config = this.collectConfig();
    Chat.reset();
    GameState.create(this.activeCharacter, this.config);

    document.getElementById("chat-title").textContent = this.activeCharacter.name;
    document.getElementById("chat-narrative").textContent = this.config.narrativeMode === "world" ? "世界模擬" : "單角色沉浸";
    document.getElementById("chat-display").textContent = this.config.displayMode === "ui" ? "互動 UI" : "純文本";
    document.getElementById("chat-persona").textContent = this.config.persona.name;
    document.getElementById("chat-model").textContent = this.config.api.model;
    document.getElementById("usage-memory").textContent = `0/${this.config.memory.maxRounds}`;
    document.getElementById("usage-context").textContent = "—";
    document.getElementById("usage-turn").textContent = "—";
    document.getElementById("usage-cache").textContent = "—";

    document.getElementById("chat-character-card").innerHTML = `
      <img src="${this.escapeAttr(this.activeCharacter.avatar)}" alt="${this.escapeAttr(this.activeCharacter.name)}">
      <div class="eyebrow">ACTIVE CHARACTER</div>
      <h3>${this.escapeHTML(this.activeCharacter.name)}</h3>`;

    document.getElementById("chat-stream").innerHTML =
      `<div class="message assistant"><div class="bubble">${this.formatMessage(this.activeCharacter.greeting)}</div></div>`;

    document.getElementById("game-ui").classList.toggle("hidden", this.config.displayMode !== "ui");
    this.renderUIPanel("npc");
    this.showView("chat");
  },

  renderUIPanel(panel) {
    const s = GameState.current;
    if (!s) return;
    const ui = document.getElementById("ui-panel");

    if (panel === "npc") {
      ui.innerHTML = `<div class="npc-grid">${(s.npcs || []).map(n => `
        <div class="npc-card">
          <strong>${this.escapeHTML(n.name)}</strong><br>
          <span>${this.escapeHTML(n.role || "NPC")}</span><br>
          <span>情緒：${this.escapeHTML(n.mood || "未知")}</span><br>
          <span>位置：${this.escapeHTML(n.location || "未知")}</span><br>
          <span>關係：${this.escapeHTML(String(n.relationship ?? "未設定"))}</span>
        </div>`).join("") || "目前沒有 NPC。"}</div>`;
    } else if (panel === "status") {
      ui.innerHTML = `<div class="state-grid">
        <div class="state-box"><small>時間</small><b>${this.escapeHTML(s.time)}</b></div>
        <div class="state-box"><small>地點</small><b>${this.escapeHTML(s.location)}</b></div>
        <div class="state-box"><small>敘事</small><b>${this.config.narrativeMode === "world" ? "世界模擬" : "單角色沉浸"}</b></div>
      </div>`;
    } else if (panel === "events") {
      ui.innerHTML = (s.events || []).map(x => `• ${this.escapeHTML(x)}`).join("<br>");
    } else if (panel === "memory") {
      ui.innerHTML = s.memory.length
        ? s.memory.map(x => `• ${this.escapeHTML(x)}`).join("<br>")
        : `目前尚無長期記憶。最近保留 ${this.config.memory.maxRounds} 輪。`;
    }
  },

  buildSystemPrompt() {
    const c = this.activeCharacter;
    const p = this.config.persona;
    const mode = this.prompts[this.config.narrativeMode];

    return [
      c.system_prompt,
      "",
      "【敘事模式】",
      mode.prompt,
      "",
      "【玩家 Persona】",
      `名稱：${p.name}`,
      `性別：${p.gender}`,
      `身分：${p.identity || "未指定"}`,
      `個性：${p.personality || "未指定"}`,
      `與角色的初始關係：${p.relationship || "未指定"}`,
      `其他設定：${p.extra || "無"}`,
      "",
      "不得替玩家決定台詞、心理或行動。",
      this.config.displayMode === "ui"
        ? "目前使用互動 UI。不要每輪重新輸出完整 UI HTML，敘事正常輸出即可。"
        : "目前使用純文本模式。不要輸出 RPG 狀態面板。"
    ].join("\n");
  },

  async sendMessage() {
    const input = document.getElementById("user-input");
    const text = input.value.trim();
    if (!text) return;

    const stream = document.getElementById("chat-stream");
    stream.insertAdjacentHTML("beforeend",
      `<div class="message user"><div class="bubble">${this.formatMessage(text)}</div></div>`
    );
    input.value = "";
    Chat.add("user", text);

    const loading = document.createElement("div");
    loading.className = "message assistant";
    loading.innerHTML = `<div class="bubble">正在生成……</div>`;
    stream.appendChild(loading);
    stream.scrollTop = stream.scrollHeight;

    try {
      const messages = [
        { role: "system", content: this.buildSystemPrompt() },
        ...Chat.recent(this.config.memory.maxRounds, this.config.memory.mode)
      ];

      const result = await API.send(this.config.api, messages);
      Chat.add("assistant", result.text);
      loading.innerHTML = `<div class="bubble">${this.formatMessage(result.text)}</div>`;

      GameState.addEvent(`玩家與 ${this.activeCharacter.name} 完成一輪互動。`);

      const usage = result.usage || {};
      document.getElementById("usage-context").textContent =
        usage.prompt_tokens ? `${usage.prompt_tokens.toLocaleString()} tok` : "—";
      document.getElementById("usage-turn").textContent =
        usage.completion_tokens ? `${usage.completion_tokens.toLocaleString()} tok` : "—";
      document.getElementById("usage-cache").textContent =
        usage.cached_tokens ? `${usage.cached_tokens.toLocaleString()} tok` : "—";
      document.getElementById("usage-memory").textContent =
        `${Math.ceil(Chat.messages.length / 2)}/${this.config.memory.maxRounds}`;

      stream.scrollTop = stream.scrollHeight;
    } catch (err) {
      loading.innerHTML = `<div class="bubble">連線失敗：${this.escapeHTML(err.message)}</div>`;
    }
  },

  exitChat() {
    this.showView("detail");
  },

  showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(`${name}-view`)?.classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" });
  },

  formatMessage(str = "") {
    return this.escapeHTML(str).replace(/\n/g, "<br>");
  },

  escapeHTML(str = "") {
    return String(str).replace(/[&<>"']/g, s => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[s]));
  },

  escapeAttr(str = "") {
    return this.escapeHTML(str);
  }
};

window.addEventListener("DOMContentLoaded", () => App.init());
