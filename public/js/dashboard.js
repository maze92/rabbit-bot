(function () {
  'use strict';

  function clearInlineError(el) {
      if (!el) return;
      el.classList.remove('input-error');
      // remove adjacent error node created by setInlineError
      var next = el.nextElementSibling;
      if (next && next.classList && next.classList.contains('field-error') && next.dataset && next.dataset.for === el.id) {
        next.remove();
      }
    }

    function setInlineError(el, msg) {
      if (!el) return;
      el.classList.add('input-error');
      var next = el.nextElementSibling;
      if (next && next.classList && next.classList.contains('field-error') && next.dataset && next.dataset.for === el.id) {
        next.textContent = msg || '';
        return;
      }
      var div = document.createElement('div');
      div.className = 'field-error';
      div.dataset.for = el.id;
      div.textContent = msg || '';
      el.insertAdjacentElement('afterend', div);
    }

    function clearInlineErrors(ids) {
      (ids || []).forEach(function (id) {
        clearInlineError(document.getElementById(id));
      });
    }

  // Global namespace for multi-file-friendly dashboard
  window.OzarkDashboard = window.OzarkDashboard || {};

  const state = {
    lang: 'pt',
    guildId: null,
    currentTab: 'overview',
    guilds: [],
    dashboardUsers: [],
    dashboardUsersEditingId: null,
    me: null,
    perms: {},
    trustDirty: false,
    trustLastSavedAt: null,
    currentTrustConfig: null,
    trustExtraOverride: null
  };

  
  function formatDateTime(ts) {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return '—';
      const opts = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };
      const tz = state && state.guildTimezone ? state.guildTimezone : undefined;
      const lang = state && state.lang ? state.lang : 'pt';
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', tz ? Object.assign({ timeZone: tz }, opts) : opts).format(d);
    } catch {
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return String(ts);
      }
    }
  }

const API_BASE = '/api';
  const TOKEN_KEY = 'DASHBOARD_TOKEN';
  const GUILD_KEY = 'DASHBOARD_GUILD_ID';
    const LANG_KEY = 'OZARK_DASH_LANG';

  // Initialize language from localStorage (if available)
  try {
    var storedLang = null;
    try {
      storedLang = localStorage.getItem('OZARK_DASH_LANG');
    } catch (e) {}
    if (storedLang === 'pt' || storedLang === 'en') {
      state.lang = storedLang;
    }
  } catch (e) {}


  // Capture OAuth callback token from URL (?token=...&selectGuild=...)
  try {
    const params = new URLSearchParams(window.location.search || '');
    const urlToken = params.get('token');
    if (urlToken) {
      try { localStorage.setItem(TOKEN_KEY, urlToken); } catch (e) {}
    }
    // If a fresh token arrived and guild selection is required, clear previous selection
    if (urlToken && params.get('selectGuild') === '1') {
      try { localStorage.removeItem(GUILD_KEY); } catch (e) {}
    }
    if (urlToken || params.has('selectGuild')) {
      params.delete('token');
      params.delete('selectGuild');
      const qs = params.toString();
      const newUrl = window.location.pathname + (qs ? ('?' + qs) : '') + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
  } catch (e) {}


  // -----------------------------
  // Small helpers
  // -----------------------------

  
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
    } catch (e) {
      // ignore
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      // ignore
    }
  }

  function getStoredGuildId() {
    try {
      return localStorage.getItem(GUILD_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setStoredGuildId(guildId) {
    try {
      if (guildId) localStorage.setItem(GUILD_KEY, guildId);
    } catch (e) {}
  }


  function decodeJwtPayload(token) {
    try {
      var parts = String(token || '').split('.');
      if (parts.length < 2) return null;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = atob(b64);
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  // For Discord OAuth tokens, mint a "server-scoped" token after the user selects a guild.
  async function ensureGuildScopedToken(guildId) {
    if (!guildId) return true;
    var raw = getToken();
    if (!raw) return false;

    var payload = decodeJwtPayload(raw);
    if (!payload || payload.t !== 'oauth') return true;

    if (payload.profile && payload.profile !== 'UNSCOPED' && payload.selectedGuildId === guildId) {
      return true;
    }

    try {
      var res = await apiPost('/auth/select-guild', { guildId: guildId });
      if (res && res.ok && res.token) {
        setToken(res.token);
        await loadMe().catch(function () {});
        return true;
      }
      toast(t('guild_select_error_access'));
      return false;
    } catch (e) {
      toast((e && e.apiMessage) ? e.apiMessage : t('guild_select_error_generic'));
      return false;
    }
  }


  function getAuthHeaders() {
    const headers = {};
    const token = getToken();
    if (token) {
      // Backend aceita tanto Authorization Bearer como x-dashboard-token.
      headers['x-dashboard-token'] = token;
    }
    return headers;
  }



  function handleAuthError(status) {
    if (status === 401) {
      clearToken();
      try {
        // Sessão expirada ou token inválido: recarrega para voltar ao ecrã de login.
        window.location.reload();
      } catch (e) {
        console.error('Failed to reload after 401', e);
      }
    }
  }

  async function apiGet(path, options) {
    const opts = options || {};
    async function sleep(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    }

    async function fetchWithRetry(attempt) {
      const res = await fetch(API_BASE + path, {
        method: 'GET',
        headers: getAuthHeaders(),
        signal: opts.signal
      });

      if (!res.ok) {
        // Retry only for transient GET failures.
        const retriable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
        if (retriable && attempt < 2) {
          let waitMs = 0;
          const ra = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
          if (res.status === 429 && ra) {
            const sec = Number(ra);
            if (Number.isFinite(sec) && sec > 0) waitMs = Math.min(10_000, sec * 1000);
          }
          if (!waitMs) {
            waitMs = (res.status === 429 ? 900 : 400) * Math.pow(2, attempt);
          }
          await sleep(waitMs);
          return fetchWithRetry(attempt + 1);
        }
      }

      return res;
    }

    const res = await fetchWithRetry(0);
    let payload = null;
    try {
      // Tentar ler JSON mesmo em erro, para extrair mensagem da API
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  async function apiPost(path, body, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify(body || {}),
      signal: opts.signal
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  async function apiPut(path, body, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify(body || {}),
      signal: opts.signal
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  async function apiPatch(path, body, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify(body || {}),
      signal: opts.signal
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  async function apiDelete(path, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: opts.signal
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      handleAuthError(res.status);
      const msg = payload && (payload.error || payload.message);
      const err = new Error(msg || `HTTP ${res.status} for ${path}`);
      err.status = res.status;
      if (msg) err.apiMessage = msg;
      err.payload = payload;
      throw err;
    }
    return payload;
  }


  function createLogRow(log) {
    const row = document.createElement('div');
    row.className = 'list-item';

    // Título simples; cai para i18n ou "Log" se não existir
    const fallbackTitle = (typeof t === 'function' && t('logs_default_title')) || 'Log';
    const title = log.title || fallbackTitle;

    // Linha meta: utilizador, moderador, data/hora (localizada)
    const metaParts = [];

    const userLabel = (typeof t === 'function' && t('logs_user_label')) || 'User';
    const modLabel = (typeof t === 'function' && t('logs_mod_label')) || 'Mod';

    if (log.user && log.user.tag) {
      metaParts.push(userLabel + ': ' + log.user.tag);
    }
    if (log.executor && log.executor.tag) {
      metaParts.push(modLabel + ': ' + log.executor.tag);
    }
    if (log.time) {
      try {
        const d = new Date(log.time);
        if (!isNaN(d.getTime())) {
          metaParts.push(d.toLocaleString());
        }
      } catch (e) {
        // se der erro mantemos só os restantes campos
      }
    }

    const metaText = metaParts.join(' • ');

    // Descrição em linha separada (se existir)
    const desc = log.description || '';

    row.innerHTML = `
        <div class="title">${escapeHtml(title)}</div>
        <div class="subtitle">${escapeHtml(metaText)}</div>
        ${desc ? `<div class="subtitle small">${escapeHtml(desc)}</div>` : ''}
      `;

    return row;
  }
  function createCaseRow(c) {
    const row = document.createElement('div');
    row.className = 'list-item';

    const title = (c.type || 'CASE') + ' • ' + (c.userId || '—');
    const subtitleParts = [];

    if (c.caseId) subtitleParts.push('#' + c.caseId);
    if (c.reason) subtitleParts.push(c.reason);
    if (c.createdAt) subtitleParts.push(new Date(c.createdAt).toLocaleString());

    row.innerHTML = `
          <div class="title">${escapeHtml(title)}</div>
          <div class="subtitle">${escapeHtml(subtitleParts.join(' • '))}</div>
        `;

    return row;
  }

  

  function toast(message) {
    const id = 'rabbitToast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.right = '16px';
      el.style.bottom = '16px';
      el.style.padding = '10px 14px';
      el.style.background = 'rgba(0,0,0,0.75)';
      el.style.color = '#fff';
      el.style.borderRadius = '6px';
      el.style.fontSize = '13px';
      el.style.zIndex = '9999';
      el.style.transition = 'opacity 0.25s ease';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.style.opacity = '0';
    }, 2400);
  }


  function withLoading(promiseFactory, opts) {
    opts = opts || {};
    var onStart = typeof opts.onStart === 'function' ? opts.onStart : null;
    var onError = typeof opts.onError === 'function' ? opts.onError : null;
    var onFinally = typeof opts.onFinally === 'function' ? opts.onFinally : null;
    var toastOnError = opts.toastOnError || null;

    if (onStart) {
      try { onStart(); } catch (e) { console.error(e); }
    }

    return Promise.resolve()
      .then(function () { return promiseFactory(); })
      .catch(function (err) {
        console.error(err);
        if (toastOnError) {
          toast(toastOnError);
        }
        if (onError) {
          try { onError(err); } catch (e2) { console.error(e2); }
        }
        throw err;
      })
      .finally(function () {
        if (onFinally) {
          try { onFinally(); } catch (e3) { console.error(e3); }
        }
      });
  }
  window.OzarkDashboard.withLoading = withLoading;

 
  function showPanelLoading(panelId) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.add('panel-loading');
    setTimeout(function () {
      panel.classList.remove('panel-loading');
    }, 350);
  }

 function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return value
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // -----------------------------
  // i18n (simplificado)
  // -----------------------------

  function t(key, params) {
    if (window.OzarkDashboard && window.OzarkDashboard.I18n) {
      return window.OzarkDashboard.I18n.t(key, params || {});
    }
    return key;
  }

  function applyI18n() {
    document.documentElement.lang = state.lang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      el.setAttribute('placeholder', t(key));
    });

    const warn = document.getElementById('tabWarning');
    if (warn) warn.textContent = t('warn_select_guild');

    // Re-render badges because they include translated labels.
    try { updateAccessBadges(); } catch (e) {}
  }

  async function refreshBotStatusBadge() {
    const el = document.getElementById('badgeBot');
    if (!el) return;

    try {
      const res = await fetch('/health', { method: 'GET' });
      if (!res.ok) throw new Error('Health failed');
      const data = await res.json();

      const ok = !!data.ok && !!data.discordReady;

      el.classList.remove('status-online', 'status-offline');

      if (ok) {
        el.classList.add('status-online');
        el.textContent = t('badge_bot_online');
      } else {
        el.classList.add('status-offline');
        el.textContent = t('badge_bot_offline');
      }
    } catch (e) {
      console.error('Failed to refresh bot status badge', e);
      el.classList.remove('status-online');
      el.classList.add('status-offline');
      el.textContent = t('badge_bot_offline');
    }
  }

  function updateAccessBadges() {
    var elProfile = document.getElementById('badgeProfile');
    var elAccess = document.getElementById('badgeAccess');
    if (!elProfile || !elAccess) return;

    var me = state.me;
    if (!me) {
      elProfile.classList.add('hidden');
      elAccess.classList.add('hidden');
      elProfile.textContent = '';
      elAccess.textContent = '';
      return;
    }

    var profileKey = 'profile_unscoped';
    var profile = (me && me.profile) ? String(me.profile) : '';
    if (profile === 'ADMIN') profileKey = 'profile_admin';
    else if (profile === 'MANAGER') profileKey = 'profile_manager';
    else if (profile === 'VIEWER') profileKey = 'profile_viewer';
    else if (profile === 'UNSCOPED') profileKey = 'profile_unscoped';
    else if (me.role === 'ADMIN') profileKey = 'profile_admin';

    var profileLabel = t(profileKey);
    elProfile.textContent = t('badge_profile', { profile: profileLabel });
    elProfile.classList.remove('hidden');

    var perms = (state.perms && typeof state.perms === 'object') ? state.perms : {};
    var scoped = !!(me.selectedGuildId || (me.profile && me.profile !== 'UNSCOPED'));
    var canManage = !!(me.role === 'ADMIN' || perms.canEditConfig || perms.canActOnCases || perms.canManageTickets || perms.canManageGameNews);

    var accessLabel;
    if (!scoped && me.oauth) {
      accessLabel = t('access_select_guild');
      elAccess.classList.remove('badge-readonly', 'badge-manage');
    } else {
      accessLabel = canManage ? t('access_manage') : t('access_readonly');
      elAccess.classList.toggle('badge-manage', canManage);
      elAccess.classList.toggle('badge-readonly', !canManage);
    }

    elAccess.textContent = t('badge_access', { access: accessLabel });
    elAccess.classList.remove('hidden');
  }




function setLang(newLang) {
  state.lang = (newLang || 'pt').toLowerCase();

  try {
    localStorage.setItem(LANG_KEY, state.lang);
  } catch (e) {}

  if (
    window.OzarkDashboard &&
    window.OzarkDashboard.I18n &&
    typeof window.OzarkDashboard.I18n.init === 'function'
  ) {
    window.OzarkDashboard.I18n.init(state.lang).then(function () {
      applyI18n();
    });
  } else {
    applyI18n();
  }
}

// -----------------------------
  // Tab / layout helpers
  // -----------------------------

  function setTab(name) {
    const tabsRequiringGuild = ['logs', 'gamenews', 'user', 'config', 'tickets'];
    if (!state.guildId && tabsRequiringGuild.indexOf(name) !== -1) {
      // Em vez de mudar tab, certifica-nos que overview está ativo
      state.currentTab = 'overview';
      const warn = document.getElementById('tabWarning');
      if (warn) {
        warn.style.display = 'block';
      }
      // Reforçar botões ativos
      document.querySelectorAll('.section').forEach(function (sec) {
        sec.classList.remove('active');
      });
      document.querySelectorAll('.tabs button[data-tab]').forEach(function (btn) {
        btn.classList.remove('active');
      });
      const section = document.getElementById('tab-overview');
      const button = document.querySelector('.tabs button[data-tab="overview"]');
      if (section) section.classList.add('active');
      if (button) button.classList.add('active');
      return;
    }
    state.currentTab = name;

    // Avoid "opening on the right" if the previous view caused horizontal scroll.
    try {
      window.scrollTo(0, window.scrollY || 0);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    } catch (e) {}

    // Reset seleção de utilizadores / GameNews ao entrar nas tabs
    if (name === 'user') {
      const userDetail = document.getElementById('userDetailPanel');
      if (userDetail) {
        userDetail.innerHTML = `<div class="empty">${escapeHtml(t('users_detail_empty'))}</div>`;
      }
      const userList = document.querySelector('#tab-user .list');
      if (userList) {
        userList.querySelectorAll('.list-item').forEach(function (row) {
          row.classList.remove('active');
        });
      }
    } else if (name === 'gamenews') {
      state.activeGameNewsFeedIndex = null;
      const feedDetail = document.getElementById('gamenewsFeedDetailPanel');
      if (feedDetail) {
        feedDetail.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_detail_empty'))}</div>`;
      }
      const feedList = document.getElementById('gamenewsFeedsList');
      if (feedList) {
        feedList.querySelectorAll('.list-item').forEach(function (row) {
          row.classList.remove('active');
        });
      }
    }


    document.querySelectorAll('.section').forEach(function (sec) {
      sec.classList.remove('active');
    });
    document.querySelectorAll('.tabs button[data-tab]').forEach(function (btn) {
      btn.classList.remove('active');
    });

    const section = document.getElementById('tab-' + name);
    const button = document.querySelector('.tabs button[data-tab="' + name + '"]');
    if (section) section.classList.add('active');
    if (button) button.classList.add('active');

    updateTabAccess();
    if (name === 'overview') {
      loadOverview().catch(function () {});
    } else if (name === 'logs') {
      if (window.OzarkDashboard.loadModerationOverview) {
        window.OzarkDashboard.loadModerationOverview().catch(function () {});
      }
      if (window.OzarkDashboard.loadCases) {
        window.OzarkDashboard.loadCases({ reset: true }).catch(function () {});
      }
      window.OzarkDashboard.loadLogs().catch(function () {});
    } else if (name === 'gamenews') {
      window.OzarkDashboard.loadGameNews().catch(function () {});
      loadTempVoiceConfig().catch(function () {});
      loadTempVoiceActive().catch(function () {});
      // Garantir que canais/roles de configuração estão disponíveis para Tickets/Extras
      loadGuildConfig().catch(function () {});
    } else if (name === 'user') {
      window.OzarkDashboard.loadUsers().catch(function () {});
    } else if (name === 'config') {
      loadGuildConfig().catch(function () {});
    }
  }

  function updateTabAccess() {
    const warn = document.getElementById('tabWarning');
    const hasGuild = !!state.guildId;
    if (warn) {
      warn.style.display = hasGuild ? 'none' : 'block';
    }

    const p = (state && state.perms && typeof state.perms === 'object') ? state.perms : {};
    const isAuthed = !!(state && state.me);
    const canViewLogs = !!p.canViewLogs;
    const canActOnCases = !!p.canActOnCases;
    const canManageTickets = !!p.canManageTickets;
    const canManageGameNews = !!p.canManageGameNews;
    const canViewConfig = !!(p.canViewConfig || p.canEditConfig);
    const canEditConfig = !!p.canEditConfig;

    // While OAuth is unscoped (before selecting a guild), disable everything that requires permissions.
    const requiresPerms = hasGuild && isAuthed;

    const tabRules = {
      logs: requiresPerms && canViewLogs,
      user: requiresPerms && canActOnCases,
      gamenews: requiresPerms && (canManageGameNews || canManageTickets || canEditConfig),
      tickets: requiresPerms && canManageTickets,
      config: requiresPerms && canViewConfig
    };

    const tabs = ['logs', 'gamenews', 'user', 'config', 'tickets'];
    tabs.forEach(function (name) {
      const btn = document.querySelector('.tabs button[data-tab="' + name + '"]');
      if (!btn) return;
      btn.disabled = !hasGuild || !tabRules[name];
    });

    // If current tab becomes inaccessible, fallback to overview.
    if (state.currentTab && state.currentTab !== 'overview') {
      const allowed = tabRules[state.currentTab] === true;
      if (!hasGuild || !allowed) {
        setTab('overview');
      }
    }
  }

  // -----------------------------
  // Overview
  // -----------------------------

  async function loadOverview() {
    const guildsEl = document.getElementById('kpiGuilds');
    const usersEl = document.getElementById('kpiUsers');
    const actionsEl = document.getElementById('kpiActions24h');
    if (!guildsEl || !usersEl || !actionsEl) return;

    try {
      const data = await apiGet('/overview');
      if (!data || data.ok === false) {
        throw new Error('Bad payload');
      }
      guildsEl.textContent = String(data.guilds ?? 0);
      usersEl.textContent = String(data.users ?? 0);
      actionsEl.textContent = String(data.actions24h ?? 0);
    } catch (err) {
      console.error('Overview load error', err);
      toast(err && err.apiMessage ? err.apiMessage : t('overview_error_generic'));
    }
  }

  // -----------------------------
  // Guilds + Users
  // -----------------------------

  async function loadGuilds() {
    const select = document.getElementById('guildPicker');
    if (!select) return;

    select.innerHTML = '';
    const optLoading = document.createElement('option');
    optLoading.value = '';
    optLoading.textContent = t('guilds_loading_option');
    select.appendChild(optLoading);

    try {
      const res = await apiGet('/guilds');
      const items = (res && res.items) || [];
      state.guilds = items;
      select.innerHTML = '';

      const optEmpty = document.createElement('option');
      optEmpty.value = '';
      optEmpty.textContent = t('select_guild');
      select.appendChild(optEmpty);

      items.forEach(function (g) {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        select.appendChild(opt);
      });

      // Restore last selected guild if present and still allowed.
      if (!state.guildId) {
        var stored = getStoredGuildId();
        if (stored && items.some(function (g) { return g && g.id === stored; })) {
          state.guildId = stored;
        }
      }

      // Auto-select if there's only one guild available.
      if (!state.guildId && items.length === 1 && items[0] && items[0].id) {
        state.guildId = items[0].id;
        setStoredGuildId(state.guildId);
      }

      if (state.guildId) {
        select.value = state.guildId;
        await ensureGuildScopedToken(state.guildId);
        updateTabAccess();
      } else {
        // Force selection when multiple guilds are available.
        try { showGuildSelect(items); } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to load guilds', err);
      toast(err && err.apiMessage ? err.apiMessage : t('guilds_error_generic'));
    }
  }

  async function loadMe() {
    try {
      const res = await apiGet('/auth/me');
      state.me = (res && res.user) ? res.user : null;
      state.perms = (state.me && state.me.permissions && typeof state.me.permissions === 'object') ? state.me.permissions : {};
      applyPermissionGates();
      updateTabAccess();
      updateAccessBadges();
    } catch (e) {
      state.me = null;
      state.perms = {};
      applyPermissionGates();
      updateTabAccess();
      updateAccessBadges();
    }
  }

  function applyPermissionGates() {
    // Trust controls live inside the Config tab (Extras -> Trust).
    const canEdit = !!(state.me && (state.me.role === 'ADMIN' || state.perms.canEditConfig));
    const trustInputs = [
      'trustPresetSelect',
      'btnApplyTrustPreset',
      'btnSaveTrustConfig',
      'trustBaseInput',
      'trustMinInput',
      'trustMaxInput',
      'trustWarnPenaltyInput',
      'trustMutePenaltyInput',
      'trustRegenPerDayInput',
      'trustRegenMaxDaysInput',
      'trustLowThresholdInput',
      'trustHighThresholdInput'
    ];
    trustInputs.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.disabled = !canEdit;
    });
  }

  // -----------------------------
  // Trust presets (Config -> Extras -> Trust)
  // -----------------------------

  const TRUST_PRESETS = {
    balanced: {
      base: 50,
      min: 0,
      max: 100,
      warnPenalty: 8,
      mutePenalty: 20,
      regenPerDay: 2,
      regenMaxDays: 21,
      lowThreshold: 25,
      highThreshold: 75,
      lowTrustWarningsPenalty: 1,
      lowTrustMessagesPenalty: 2,
      highTrustMessagesBonus: 1,
      lowTrustMuteMultiplier: 2.0,
      highTrustMuteMultiplier: 0.6
    },
    strict: {
      base: 40,
      min: 0,
      max: 100,
      warnPenalty: 10,
      mutePenalty: 25,
      regenPerDay: 1,
      regenMaxDays: 14,
      lowThreshold: 35,
      highThreshold: 80,
      lowTrustWarningsPenalty: 1,
      lowTrustMessagesPenalty: 2,
      highTrustMessagesBonus: 0,
      lowTrustMuteMultiplier: 2.2,
      highTrustMuteMultiplier: 0.7
    },
    relaxed: {
      base: 60,
      min: 0,
      max: 100,
      warnPenalty: 6,
      mutePenalty: 15,
      regenPerDay: 3,
      regenMaxDays: 30,
      lowThreshold: 20,
      highThreshold: 70,
      lowTrustWarningsPenalty: 0,
      lowTrustMessagesPenalty: 1,
      highTrustMessagesBonus: 2,
      lowTrustMuteMultiplier: 1.6,
      highTrustMuteMultiplier: 0.55
    }
  };

  function readNum(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = Number(el.value);
    return Number.isFinite(v) ? v : null;
  }

  function setNum(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = (value === null || value === undefined) ? '' : String(value);
  }

  function getTrustInputs() {
    return {
      base: readNum('trustBaseInput'),
      min: readNum('trustMinInput'),
      max: readNum('trustMaxInput'),
      warnPenalty: readNum('trustWarnPenaltyInput'),
      mutePenalty: readNum('trustMutePenaltyInput'),
      regenPerDay: readNum('trustRegenPerDayInput'),
      regenMaxDays: readNum('trustRegenMaxDaysInput'),
      lowThreshold: readNum('trustLowThresholdInput'),
      highThreshold: readNum('trustHighThresholdInput')
    };
  }

  function setTrustInputs(cfg) {
    const c = cfg || {};
    setNum('trustBaseInput', c.base);
    setNum('trustMinInput', c.min);
    setNum('trustMaxInput', c.max);
    setNum('trustWarnPenaltyInput', c.warnPenalty);
    setNum('trustMutePenaltyInput', c.mutePenalty);
    setNum('trustRegenPerDayInput', c.regenPerDay);
    setNum('trustRegenMaxDaysInput', c.regenMaxDays);
    setNum('trustLowThresholdInput', c.lowThreshold);
    setNum('trustHighThresholdInput', c.highThreshold);
  }

  function nearlyEqual(a, b) {
    return Number(a) === Number(b);
  }

  function detectTrustPreset(cfg) {
    const c = cfg || {};
    const keys = [
      'base','min','max',
      'warnPenalty','mutePenalty',
      'regenPerDay','regenMaxDays',
      'lowThreshold','highThreshold',
      'lowTrustWarningsPenalty','lowTrustMessagesPenalty','highTrustMessagesBonus',
      'lowTrustMuteMultiplier','highTrustMuteMultiplier'
    ];
    for (const [name, preset] of Object.entries(TRUST_PRESETS)) {
      const ok = keys.every((k) => nearlyEqual(c[k], preset[k]));
      if (ok) return name;
    }
    return 'custom';
  }

  function validateTrustCore(cfg) {
    const c = cfg || {};
    const req = ['base','min','max','warnPenalty','mutePenalty','regenPerDay','regenMaxDays','lowThreshold','highThreshold'];
    const allFieldIds = [
      'trustBaseInput','trustMinInput','trustMaxInput',
      'trustWarnPenaltyInput','trustMutePenaltyInput',
      'trustRegenPerDayInput','trustRegenMaxDaysInput',
      'trustLowThresholdInput','trustHighThresholdInput'
    ];

    for (const k of req) {
      if (!Number.isFinite(Number(c[k]))) {
        return { ok: false, msg: t('trust_invalid_numbers'), fields: allFieldIds };
      }
    }

    const min = Number(c.min);
    const max = Number(c.max);
    const base = Number(c.base);
    const low = Number(c.lowThreshold);
    const high = Number(c.highThreshold);

    if (min < 0 || max > 100 || min >= max) {
      return { ok: false, msg: t('trust_invalid_range'), fields: ['trustMinInput','trustMaxInput'] };
    }
    if (base < min || base > max) {
      return { ok: false, msg: t('trust_invalid_base'), fields: ['trustBaseInput'] };
    }
    if (low < min || high > max || low >= high) {
      return { ok: false, msg: t('trust_invalid_thresholds'), fields: ['trustLowThresholdInput','trustHighThresholdInput','trustMinInput','trustMaxInput'] };
    }
    if (Number(c.warnPenalty) < 0 || Number(c.mutePenalty) < 0) {
      return { ok: false, msg: t('trust_invalid_penalties'), fields: ['trustWarnPenaltyInput','trustMutePenaltyInput'] };
    }
    if (Number(c.regenPerDay) < 0 || Number(c.regenMaxDays) < 0) {
      return { ok: false, msg: t('trust_invalid_regen'), fields: ['trustRegenPerDayInput','trustRegenMaxDaysInput'] };
    }
    return { ok: true };
  }

  function buildTrustPatch(core, presetKey) {
    const k = (presetKey || 'custom');
    const baseExtra = state.currentTrustConfig || TRUST_PRESETS.balanced;
    const presetExtra = TRUST_PRESETS[k];
    const extra = (presetExtra && k !== 'custom') ? presetExtra : (state.trustExtraOverride || baseExtra);

    return {
      trust: {
        base: Number(core.base),
        min: Number(core.min),
        max: Number(core.max),
        warnPenalty: Number(core.warnPenalty),
        mutePenalty: Number(core.mutePenalty),
        regenPerDay: Number(core.regenPerDay),
        regenMaxDays: Number(core.regenMaxDays),
        lowThreshold: Number(core.lowThreshold),
        highThreshold: Number(core.highThreshold),

        // Advanced knobs (kept stable unless a preset is applied)
        lowTrustWarningsPenalty: Number(extra.lowTrustWarningsPenalty),
        lowTrustMessagesPenalty: Number(extra.lowTrustMessagesPenalty),
        highTrustMessagesBonus: Number(extra.highTrustMessagesBonus),
        lowTrustMuteMultiplier: Number(extra.lowTrustMuteMultiplier),
        highTrustMuteMultiplier: Number(extra.highTrustMuteMultiplier)
      }
    };
  }

  
  // -----------------------------
  // Logs de moderação + Tickets
  // -----------------------------

  function renderLogs(items) {
    const listEl = document.getElementById('logsList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('logs_empty');
      listEl.appendChild(empty);
      return;
    }

    items.forEach(function (log) {
      const row = createLogRow(log);
      listEl.appendChild(row);
    });
  }

  

  // -----------------------------
  // Cases (infractions history)
  // -----------------------------

  

// -----------------------------
  // Tickets
  // -----------------------------

  function renderTickets(items) {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('tickets_empty');
      listEl.appendChild(empty);
      return;
    }

    items.forEach(function (tkt) {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.dataset.ticketId = String(tkt._id || tkt.id);

      const created = tkt.createdAt ? new Date(tkt.createdAt).toLocaleString() : '—';
      const status = tkt.status || 'OPEN';

      // Se tivermos informação da última resposta, usamos para um rótulo mais amigável
      let statusLabel = status;
      if (status === 'CLOSED') {
        statusLabel = t('tickets_status_closed');
      } else if (tkt.reopenedAt) {
        statusLabel = t('tickets_status_reopened');
      } else if (tkt.lastResponderName) {
        statusLabel = t('tickets_status_answered');
      } else {
        statusLabel = t('tickets_status_open');
      }

      let actionsHtml = '';

      if (status !== 'CLOSED') {
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-reply">Responder</button>';
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-close">Fechar</button>';
      } else {
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-reopen">Reabrir</button>';
        actionsHtml += '  <button type="button" class="btn btn-small btn-ticket-delete">Apagar</button>';
      }

      // Texto da última resposta, se existir
      let lastResponderHtml = '';
      if (tkt.lastResponderName) {
        lastResponderHtml =
          '<div class="subtitle small">' +
          escapeHtml(t('tickets_last_reply')) +
          ' ' +
          escapeHtml(tkt.lastResponderName) +
          '</div>';
      }

      row.innerHTML =
        '<div class="title">#' +
        escapeHtml(String(tkt._id || '').slice(-6)) +
        ' • ' +
        escapeHtml(tkt.subject || tkt.topic || 'Ticket') +
        '</div>' +
        '<div class="subtitle">' +
        escapeHtml(tkt.userTag || tkt.userId || '') +
        ' • ' +
        escapeHtml(statusLabel) +
        ' • ' +
        escapeHtml(created) +
        '</div>' +
        lastResponderHtml +
        '<div class="actions" style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">' +
        actionsHtml +
        '</div>';

      listEl.appendChild(row);
    });
  }

  async function loadTickets() {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!state.guildId) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('warn_select_guild');
      listEl.appendChild(empty);
      return;
    }

    const loading = document.createElement('div');
    loading.className = 'empty';
    loading.textContent = t('tickets_loading');
    listEl.appendChild(loading);

    try {
      const res = await apiGet('/tickets?guildId=' + encodeURIComponent(state.guildId));
      renderTickets((res && res.items) || []);
    } catch (err) {
      console.error('Failed to load tickets', err);
      listEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('tickets_error_generic');
      listEl.appendChild(empty);
    }
  }


// -----------------------------
  // Guild Config
  // -----------------------------

  function setConfigStatus(msg) {
    var el = document.getElementById('configStatus');
    if (!el) return;
    el.textContent = msg || '';
  }

  function setConfigDirty(isDirty) {
    state.configDirty = !!isDirty;
    var btn = document.getElementById('btnSaveGuildConfig');
    if (btn) btn.disabled = !state.configDirty;
    setConfigStatus(state.configDirty ? t('config_status_unsaved') : t('config_status_loaded'));
  }

  function markConfigDirty() {
    setConfigDirty(true);
  }

  function bindConfigDirtyListeners() {
    var ids = [
      'configLogChannel',
      'configDashboardLogChannel',
      'configTicketChannel',
      'configStaffRoles',
      'configStaffRolesTickets',
      'configStaffRolesModeration',
      'configStaffRolesGameNews',
      'configStaffRolesLogs',
      'configDashAdmins',
      'configDashManagers',
      'configDashViewers',
      'configServerLanguage',
      'configServerTimezone'
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.dirtyBound) return;
      el.dataset.dirtyBound = '1';
      function onDirty() {
        clearInlineError(el);
        markConfigDirty();
      }
      el.addEventListener('change', onDirty);
      el.addEventListener('input', onDirty);
    });
  }

  async function loadGuildConfig() {
    if (!state.guildId) {
      updateTabAccess();
      return;
    }

    const statusEl = document.getElementById('configStatus');
    if (statusEl) {
      statusEl.textContent = t('config_loading');
    }

    try {
      const meta = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/meta');
      const cfg = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/config');

      const channels = (meta && meta.channels) || [];
      const roles = (meta && meta.roles) || [];
      const voiceChannels = (meta && meta.voiceChannels) || [];
      const categories = (meta && meta.categories) || [];
      const conf = cfg && cfg.config ? cfg.config : {};

      // Cache meta for UI helpers
      state._guildMeta = state._guildMeta || {};
      state._guildMeta.roles = roles;
      state._guildMeta.channels = channels;
      state._guildMeta.voiceChannels = voiceChannels;
      state._guildMeta.categories = categories;

      // Server language / timezone (guild-level settings)
      state.guildLanguage = (conf && typeof conf.language === 'string') ? conf.language : 'auto';
      state.guildTimezone = (conf && typeof conf.timezone === 'string' && conf.timezone.trim()) ? conf.timezone.trim() : null;



      const logSelect = document.getElementById('configLogChannel');
      const dashLogSelect = document.getElementById('configDashboardLogChannel');
      const ticketSelect = document.getElementById('configTicketChannel');
      const staffSelect = document.getElementById('configStaffRoles');
      const staffTicketsSelect = document.getElementById('configStaffRolesTickets');
      const staffModerationSelect = document.getElementById('configStaffRolesModeration');
      const staffGameNewsSelect = document.getElementById('configStaffRolesGameNews');
      const staffLogsSelect = document.getElementById('configStaffRolesLogs');
      const langSelect = document.getElementById('configServerLanguage');
      const tzSelect = document.getElementById('configServerTimezone');
      if (langSelect) langSelect.value = state.guildLanguage || 'auto';
      if (tzSelect) tzSelect.value = state.guildTimezone || '';

      if (logSelect) {
        logSelect.innerHTML = '';
        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = t('common_none_option');
        logSelect.appendChild(optNone);

        channels.forEach(function (ch) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = '#' + ch.name + ' (' + ch.id + ')';
          if (conf.logChannelId && conf.logChannelId === ch.id) opt.selected = true;
          logSelect.appendChild(opt);
        });
      }

      if (dashLogSelect) {
        dashLogSelect.innerHTML = '';
        const optNone2 = document.createElement('option');
        optNone2.value = '';
        optNone2.textContent = t('common_none_option');
        dashLogSelect.appendChild(optNone2);

        channels.forEach(function (ch) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = '#' + ch.name + ' (' + ch.id + ')';
          if (conf.dashboardLogChannelId && conf.dashboardLogChannelId === ch.id) opt.selected = true;
          dashLogSelect.appendChild(opt);
        });
      }

      if (ticketSelect) {
        ticketSelect.innerHTML = '';
        const optNone3 = document.createElement('option');
        optNone3.value = '';
        optNone3.textContent = t('common_none_option');
        ticketSelect.appendChild(optNone3);

        channels.forEach(function (ch) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = '#' + ch.name + ' (' + ch.id + ')';
          if (conf.ticketThreadChannelId && conf.ticketThreadChannelId === ch.id) opt.selected = true;
          ticketSelect.appendChild(opt);
        });
      }

      function fillRoleMultiSelect(sel, selectedIds) {
        if (!sel) return;
        const selected = Array.isArray(selectedIds) ? selectedIds : [];
        sel.innerHTML = '';
        roles.forEach(function (r) {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = '@' + r.name + ' (' + r.id + ')';
          if (selected.indexOf(r.id) !== -1) opt.selected = true;
          sel.appendChild(opt);
        });
      }

      fillRoleMultiSelect(staffSelect, conf.staffRoleIds);

      const byFeat = conf && conf.staffRolesByFeature ? conf.staffRolesByFeature : {};

      fillRoleMultiSelect(staffTicketsSelect, byFeat.tickets);
      fillRoleMultiSelect(staffModerationSelect, byFeat.moderation);
      fillRoleMultiSelect(staffGameNewsSelect, byFeat.gamenews);
      fillRoleMultiSelect(staffLogsSelect, byFeat.logs);

      // Presets: copy global staff roles -> all feature lists, or clear all feature overrides.
      const btnApplyGlobal = document.getElementById('btnStaffPresetApplyGlobal');
      const btnClearOverrides = document.getElementById('btnStaffPresetClearOverrides');

      function getSelectedValues(sel) {
        const out = [];
        if (!sel) return out;
        Array.prototype.forEach.call(sel.selectedOptions || [], function (opt) {
          if (opt && opt.value) out.push(opt.value);
        });
        return out;
      }

      function setSelectedValues(sel, values) {
        if (!sel) return;
        const set = new Set(Array.isArray(values) ? values : []);
        Array.prototype.forEach.call(sel.options || [], function (opt) {
          opt.selected = set.has(opt.value);
        });
      }

      // Role-picker UX: chips + add dropdown, backed by the hidden multi-select.
      function setupRolePicker(multiId) {
        const multi = document.getElementById(multiId);
        const chips = document.getElementById(multiId + 'Chips');
        const addSel = document.getElementById(multiId + 'Add');
        const addBtn = document.getElementById(multiId + 'AddBtn');
        if (!multi || !chips || !addSel || !addBtn) return;

        function rebuildAddOptions() {
          const selected = new Set(getSelectedValues(multi));
          addSel.innerHTML = '';
          const opt0 = document.createElement('option');
          opt0.value = '';
          opt0.textContent = t('config_rolepicker_placeholder');
          addSel.appendChild(opt0);

          Array.prototype.forEach.call(multi.options || [], function (opt) {
            if (!opt || !opt.value) return;
            if (selected.has(opt.value)) return;
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.textContent;
            addSel.appendChild(o);
          });
        }

        function renderChips() {
          const selected = getSelectedValues(multi);
          chips.innerHTML = '';

          if (!selected.length) {
            const empty = document.createElement('div');
            empty.className = 'hint';
            empty.textContent = t('config_rolepicker_empty');
            chips.appendChild(empty);
            return;
          }

          selected.forEach(function (id) {
            const opt = Array.prototype.find.call(multi.options || [], function (o) { return o.value === id; });
            const label = opt ? opt.textContent : id;

            const chip = document.createElement('div');
            chip.className = 'role-chip';

            const name = document.createElement('span');
            name.className = 'name';
            // Render as role name without the id suffix for readability.
            name.textContent = label.replace(/\s*\([0-9]+\)\s*$/, '').replace(/^@/, '');

            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'remove';
            rm.textContent = '✕';
            rm.addEventListener('click', function () {
              const next = getSelectedValues(multi).filter(function (x) { return x !== id; });
              setSelectedValues(multi, next);
              renderAll();
              markConfigDirty();
            });

            chip.appendChild(name);
            chip.appendChild(rm);
            chips.appendChild(chip);
          });
        }

        function renderAll() {
          renderChips();
          rebuildAddOptions();
        }

        if (!addBtn.dataset.bound) {
          addBtn.dataset.bound = '1';
          addBtn.addEventListener('click', function () {
            const id = addSel.value;
            if (!id) return;
            const current = getSelectedValues(multi);
            if (current.indexOf(id) === -1) {
              current.push(id);
              setSelectedValues(multi, current);
              renderAll();
              markConfigDirty();
            }
          });

          // Keep chips in sync when presets apply/clear overrides.
          multi.addEventListener('change', function () {
            renderAll();
          });
        }

        renderAll();
      }

      // Activate role pickers for staff roles.
      setupRolePicker('configStaffRoles');
      setupRolePicker('configStaffRolesTickets');
      setupRolePicker('configStaffRolesModeration');
      setupRolePicker('configStaffRolesGameNews');
      setupRolePicker('configStaffRolesLogs');
      setupRolePicker('configDashAdmins');
      setupRolePicker('configDashManagers');
      setupRolePicker('configDashViewers');

      if (btnApplyGlobal && !btnApplyGlobal.dataset.bound) {
        btnApplyGlobal.dataset.bound = '1';
        btnApplyGlobal.addEventListener('click', function () {
          const global = getSelectedValues(staffSelect);
          setSelectedValues(staffTicketsSelect, global);
          setSelectedValues(staffModerationSelect, global);
          setSelectedValues(staffGameNewsSelect, global);
          setSelectedValues(staffLogsSelect, global);
          [staffTicketsSelect, staffModerationSelect, staffGameNewsSelect, staffLogsSelect].forEach(function (sel) {
            if (sel) sel.dispatchEvent(new Event('change'));
          });
          toast(t('config_staff_preset_applied'));
          markConfigDirty();
        });
      }

      if (btnClearOverrides && !btnClearOverrides.dataset.bound) {
        btnClearOverrides.dataset.bound = '1';
        btnClearOverrides.addEventListener('click', function () {
          setSelectedValues(staffTicketsSelect, []);
          setSelectedValues(staffModerationSelect, []);
          setSelectedValues(staffGameNewsSelect, []);
          setSelectedValues(staffLogsSelect, []);
          [staffTicketsSelect, staffModerationSelect, staffGameNewsSelect, staffLogsSelect].forEach(function (sel) {
            if (sel) sel.dispatchEvent(new Event('change'));
          });
          toast(t('config_staff_preset_cleared'));
          markConfigDirty();
        });
      }

      // Trust config preview (read-only, global)
      const trust = conf && conf.trust ? conf.trust : null;
      const baseEl = document.getElementById('trustBaseValue');
      const minMaxEl = document.getElementById('trustMinMaxValue');
      const penaltiesEl = document.getElementById('trustPenaltiesValue');
      const regenEl = document.getElementById('trustRegenValue');
      const riskEl = document.getElementById('trustRiskValue');

      const baseInput = document.getElementById('trustBaseInput');
      const minInput = document.getElementById('trustMinInput');
      const maxInput = document.getElementById('trustMaxInput');
      const warnInput = document.getElementById('trustWarnPenaltyInput');
      const muteInput = document.getElementById('trustMutePenaltyInput');
      const regenPerDayInput = document.getElementById('trustRegenPerDayInput');
      const regenMaxDaysInput = document.getElementById('trustRegenMaxDaysInput');
      const lowThresholdInput = document.getElementById('trustLowThresholdInput');
      const highThresholdInput = document.getElementById('trustHighThresholdInput');

      if (trust && baseEl && minMaxEl && penaltiesEl && regenEl && riskEl) {
        state.currentTrustConfig = trust;
        const base = Number.isFinite(Number(trust.base)) ? Number(trust.base) : null;
        const min = Number.isFinite(Number(trust.min)) ? Number(trust.min) : null;
        const max = Number.isFinite(Number(trust.max)) ? Number(trust.max) : null;

        baseEl.textContent = base !== null ? String(base) : '—';
        minMaxEl.textContent = min !== null && max !== null ? min + ' / ' + max : '—';

        if (baseInput) baseInput.value = base !== null ? String(base) : '';

        if (minInput) minInput.value = min !== null ? String(min) : '';
        if (maxInput) maxInput.value = max !== null ? String(max) : '';

        const warnPenalty = Number.isFinite(Number(trust.warnPenalty)) ? Number(trust.warnPenalty) : null;
        const mutePenalty = Number.isFinite(Number(trust.mutePenalty)) ? Number(trust.mutePenalty) : null;
        penaltiesEl.textContent =
          warnPenalty !== null && mutePenalty !== null
            ? 'WARN: -' + warnPenalty + ' • MUTE: -' + mutePenalty
            : '—';

        if (warnInput) warnInput.value = warnPenalty !== null ? String(warnPenalty) : '';
        if (muteInput) muteInput.value = mutePenalty !== null ? String(mutePenalty) : '';

        const regenPerDay = Number.isFinite(Number(trust.regenPerDay)) ? Number(trust.regenPerDay) : null;
        const regenMaxDays = Number.isFinite(Number(trust.regenMaxDays)) ? Number(trust.regenMaxDays) : null;
        regenEl.textContent =
          regenPerDay !== null && regenMaxDays !== null
            ? regenPerDay + ' / dia até ' + regenMaxDays + ' dias'
            : '—';

        if (regenPerDayInput) regenPerDayInput.value = regenPerDay !== null ? String(regenPerDay) : '';
        if (regenMaxDaysInput) regenMaxDaysInput.value = regenMaxDays !== null ? String(regenMaxDays) : '';

        const lowT = Number.isFinite(Number(trust.lowTrustThreshold || trust.lowThreshold)) ? Number(trust.lowTrustThreshold || trust.lowThreshold) : null;
        const highT = Number.isFinite(Number(trust.highTrustThreshold || trust.highThreshold)) ? Number(trust.highTrustThreshold || trust.highThreshold) : null;
        if (lowT !== null && highT !== null) {
          riskEl.textContent = `< ${lowT} (risco) • > ${highT} (confiança)`;
        } else {
          riskEl.textContent = '—';
        }

        if (lowThresholdInput) lowThresholdInput.value = lowT !== null ? String(lowT) : '';
        if (highThresholdInput) highThresholdInput.value = highT !== null ? String(highT) : '';

        // Preset selection (best-effort)
        var presetSelect = document.getElementById('trustPresetSelect');
        if (presetSelect) {
          presetSelect.value = detectTrustPreset(trust);
        }
      } else if (baseEl && minMaxEl && penaltiesEl && regenEl && riskEl) {
        // No guild-specific trust config found; show the global defaults so the UI is didactic.
        var defaultBase = 50;
        var defaultMin = 0;
        var defaultMax = 100;
        var defaultWarnPenalty = 8;
        var defaultMutePenalty = 20;
        var defaultRegenPerDay = 2;
        var defaultRegenMaxDays = 21;
        var defaultLowThreshold = 25;
        var defaultHighThreshold = 75;

        baseEl.textContent = String(defaultBase);
        minMaxEl.textContent = defaultMin + ' / ' + defaultMax;
        penaltiesEl.textContent = 'WARN: -' + defaultWarnPenalty + ' • MUTE: -' + defaultMutePenalty;
        regenEl.textContent = defaultRegenPerDay + ' / dia até ' + defaultRegenMaxDays + ' dias';
        riskEl.textContent = '< ' + defaultLowThreshold + ' (risco) • > ' + defaultHighThreshold + ' (confiança)';

        if (baseInput) baseInput.value = String(defaultBase);
        if (minInput) minInput.value = String(defaultMin);
        if (maxInput) maxInput.value = String(defaultMax);
        if (warnInput) warnInput.value = String(defaultWarnPenalty);
        if (muteInput) muteInput.value = String(defaultMutePenalty);
        if (regenPerDayInput) regenPerDayInput.value = String(defaultRegenPerDay);
        if (regenMaxDaysInput) regenMaxDaysInput.value = String(defaultRegenMaxDays);
        if (lowThresholdInput) lowThresholdInput.value = String(defaultLowThreshold);
        if (highThresholdInput) highThresholdInput.value = String(defaultHighThreshold);

        state.currentTrustConfig = Object.assign({}, TRUST_PRESETS.balanced);
        var presetSelect2 = document.getElementById('trustPresetSelect');
        if (presetSelect2) presetSelect2.value = 'balanced';
      }

      bindConfigDirtyListeners();
      setConfigDirty(false);
    } catch (err) {
      console.error('Failed to load guild config', err);
      setConfigStatus(t('config_error_generic'));
    }
  }

  function setDashboardUserPermInputs(perms) {
    var p = perms || {};
    var viewLogs = document.getElementById('permViewLogs');
    var actOnCases = document.getElementById('permActOnCases');
    var manageTickets = document.getElementById('permManageTickets');
    var manageGameNews = document.getElementById('permManageGameNews');
    var viewConfig = document.getElementById('permViewConfig');
    var editConfig = document.getElementById('permEditConfig');
    var manageUsers = document.getElementById('permManageUsers');

    if (viewLogs) viewLogs.checked = !!p.canViewLogs;
    if (actOnCases) actOnCases.checked = !!p.canActOnCases;
    if (manageTickets) manageTickets.checked = !!p.canManageTickets;
    if (manageGameNews) manageGameNews.checked = !!p.canManageGameNews;
    if (viewConfig) viewConfig.checked = !!p.canViewConfig;
    if (editConfig) editConfig.checked = !!p.canEditConfig;
    if (manageUsers) manageUsers.checked = !!p.canManageUsers;
  }

  function getDashboardUserPermInputs() {
    var viewLogs = document.getElementById('permViewLogs');
    var actOnCases = document.getElementById('permActOnCases');
    var manageTickets = document.getElementById('permManageTickets');
    var manageGameNews = document.getElementById('permManageGameNews');
    var viewConfig = document.getElementById('permViewConfig');
    var editConfig = document.getElementById('permEditConfig');
    var manageUsers = document.getElementById('permManageUsers');

    return {
      canViewLogs: !!(viewLogs && viewLogs.checked),
      canActOnCases: !!(actOnCases && actOnCases.checked),
      canManageTickets: !!(manageTickets && manageTickets.checked),
      canManageGameNews: !!(manageGameNews && manageGameNews.checked),
      canViewConfig: !!(viewConfig && viewConfig.checked),
      canEditConfig: !!(editConfig && editConfig.checked),
      canManageUsers: !!(manageUsers && manageUsers.checked)
    };
  }

  function parseAllowedGuildIdsText(raw) {
    if (!raw) return [];
    var parts = String(raw).split(',');
    var out = [];
    parts.forEach(function (p) {
      var s = (p || '').trim();
      if (!s) return;
      // Accept mentions or mixed text; keep digits only.
      s = s.replace(/\D/g, '');
      if (!s) return;
      if (out.indexOf(s) === -1) out.push(s);
    });
    return out.slice(0, 200);
  }

  

  function openDashboardUserEditor(user) {
    var editor = document.getElementById('dashboardUsersEditor');
    if (!editor) return;

    var titleEl = document.getElementById('dashboardUsersEditorTitle');
    var usernameInput = document.getElementById('dashboardUserUsername');
    var passwordInput = document.getElementById('dashboardUserPassword');
    var passwordHint = document.getElementById('dashboardUserPasswordHint');
    var roleSelect = document.getElementById('dashboardUserRole');
    var allowedInput = document.getElementById('dashboardUserAllowedGuilds');

    state.dashboardUsersEditingId = user && user.id ? String(user.id) : null;

    if (user && user.id) {
      if (titleEl) titleEl.textContent = t('config_dashboard_users_editor_edit_title');
      if (usernameInput) {
        usernameInput.value = user.username || '';
        usernameInput.disabled = true;
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.disabled = true;
      }
      if (passwordHint) {
        passwordHint.textContent =
          t('config_dashboard_users_password_edit_hint');
      }
      if (roleSelect) {
        roleSelect.value = user.role === 'ADMIN' ? 'ADMIN' : 'MOD';
      }
      setDashboardUserPermInputs(user.permissions || {});
      if (allowedInput) {
        var ag = Array.isArray(user.allowedGuildIds) ? user.allowedGuildIds : [];
        allowedInput.value = ag.join(', ');
      }
    } else {
      if (titleEl) titleEl.textContent = t('config_dashboard_users_editor_new_title');
      if (usernameInput) {
        usernameInput.value = '';
        usernameInput.disabled = false;
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.disabled = false;
      }
      if (passwordHint) {
        passwordHint.textContent =
          t('config_dashboard_users_password_hint');
      }
      if (roleSelect) {
        roleSelect.value = 'MOD';
      }
      setDashboardUserPermInputs({
        canViewLogs: true,
        canActOnCases: true,
        canManageTickets: false,
        canManageGameNews: false,
        canViewConfig: true,
        canEditConfig: false,
        canManageUsers: false
      });
      if (allowedInput) allowedInput.value = '';
    }

    editor.classList.remove('hidden');
  }

  function closeDashboardUserEditor() {
    var editor = document.getElementById('dashboardUsersEditor');
    if (editor) editor.classList.add('hidden');
    state.dashboardUsersEditingId = null;
  }

  function renderDashboardUsersList() {
    var listEl = document.getElementById('dashboardUsersList');
    if (!listEl) return;
    var users = state.dashboardUsers || [];
    listEl.innerHTML = '';

    if (!users.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent =
        t('config_dashboard_users_list_empty');
      listEl.appendChild(empty);
      return;
    }

    users.forEach(function (u) {
      var item = document.createElement('div');
      item.className = 'dashboard-user-item';

      var main = document.createElement('div');
      main.className = 'dashboard-user-main';

      var usernameEl = document.createElement('div');
      usernameEl.className = 'username';
      usernameEl.textContent = u.username || '—';

      var meta = document.createElement('div');
      meta.className = 'meta';

      var roleBadge = document.createElement('span');
      roleBadge.className = 'badge-role ' + (u.role === 'ADMIN' ? 'admin' : 'mod');
      roleBadge.textContent =
        u.role === 'ADMIN'
          ? (t('config_dashboard_users_role_admin'))
          : (t('config_dashboard_users_role_mod'));

      meta.appendChild(roleBadge);

      var perms = u.permissions || {};
      var labels = [];
      if (perms.canViewLogs) labels.push(t('config_dashboard_users_perm_view_logs'));
      if (perms.canActOnCases) labels.push(t('config_dashboard_users_perm_act_on_cases'));
      if (perms.canManageTickets) labels.push(t('config_dashboard_users_perm_manage_tickets'));
      if (perms.canManageGameNews) labels.push(t('config_dashboard_users_perm_manage_gamenews'));
      if (perms.canViewConfig) labels.push(t('config_dashboard_users_perm_view_config'));
      if (perms.canEditConfig) labels.push(t('config_dashboard_users_perm_edit_config'));
      if (perms.canManageUsers) labels.push(t('config_dashboard_users_perm_manage_users'));

      if (labels.length) {
        var permsSpan = document.createElement('span');
        permsSpan.textContent = labels.join(' • ');
        meta.appendChild(permsSpan);
      }

      if (Array.isArray(u.allowedGuildIds) && u.allowedGuildIds.length) {
        var gSpan = document.createElement('span');
        gSpan.textContent = t('config_dashboard_users_allowed_guilds_badge', { count: u.allowedGuildIds.length });
        meta.appendChild(gSpan);
      }

      main.appendChild(usernameEl);
      main.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn small';
      editBtn.textContent = t('config_dashboard_users_edit_button');
      editBtn.addEventListener('click', function () {
        openDashboardUserEditor(u);
      });

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn small danger';
      deleteBtn.textContent = t('config_dashboard_users_delete_button');
      deleteBtn.addEventListener('click', function () {
        confirmDeleteDashboardUser(u);
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      main.appendChild(actions);
      item.appendChild(main);

      listEl.appendChild(item);
    });
  }

  async function loadDashboardUsers() {
    var listEl = document.getElementById('dashboardUsersList');
    var statusEl = document.getElementById('dashboardUsersStatus');
    var allowedInput = document.getElementById('dashboardUserAllowedGuilds');
    var addBtn = document.getElementById('btnDashboardUsersAdd');
    var editor = document.getElementById('dashboardUsersEditor');
    if (!listEl) return;

    // UX: o editor "Novo utilizador" só deve aparecer quando o utilizador clica em
    // Adicionar/Editar. Ao entrar na tab Configuração (ou ao recarregar), garante que
    // fica escondido e limpa o estado de edição.
    closeDashboardUserEditor();

    listEl.innerHTML =
      '<div class="empty">' +
      escapeHtml(t('config_dashboard_users_loading')) +
      '</div>';
    if (statusEl) statusEl.textContent = '';

    try {
      var res = await apiGet('/auth/users');
      var users = (res && res.users) || [];
      state.dashboardUsers = users;
      renderDashboardUsersList();
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.classList.remove('disabled');
      }
    } catch (err) {
      console.error('Failed to load dashboard users', err);
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_no_permission');
      }
      listEl.innerHTML = '';
      if (addBtn) {
        addBtn.disabled = true;
        addBtn.classList.add('disabled');
      }
      if (editor) {
        editor.classList.add('hidden');
      }
    }
  }

  async function saveDashboardUserFromEditor() {
    var usernameInput = document.getElementById('dashboardUserUsername');
    var passwordInput = document.getElementById('dashboardUserPassword');
    var roleSelect = document.getElementById('dashboardUserRole');
    var allowedInput = document.getElementById('dashboardUserAllowedGuilds');
    var statusEl = document.getElementById('dashboardUsersStatus');
    var allowedInput = document.getElementById('dashboardUserAllowedGuilds');

    var role = roleSelect ? roleSelect.value : 'MOD';
    var perms = getDashboardUserPermInputs();
    var editingId = state.dashboardUsersEditingId || null;

    var payload = {
      role: role === 'ADMIN' ? 'ADMIN' : 'MOD',
      permissions: perms
    };

    payload.allowedGuildIds = parseAllowedGuildIdsText(allowedInput ? allowedInput.value : '');

    try {
      if (!editingId) {
        var username = usernameInput ? usernameInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value : '';
        if (!username || !password) {
          if (statusEl) {
            statusEl.textContent =
              t('config_dashboard_users_error_required');
          }
          return;
        }
        payload.username = username;
        payload.password = password;
        await apiPost('/auth/users', payload);
      } else {
        await apiPut('/auth/users/' + encodeURIComponent(editingId), payload);
      }

      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_save_success');
      }
      closeDashboardUserEditor();
      await loadDashboardUsers();
    } catch (err) {
      console.error('Failed to save dashboard user', err);
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_save_error');
      }
    }
  }

  async function confirmDeleteDashboardUser(user) {
    if (!user || !user.id) return;
    var statusEl = document.getElementById('dashboardUsersStatus');
    var allowedInput = document.getElementById('dashboardUserAllowedGuilds');
    var msg =
      t('config_dashboard_users_delete_confirm');
    if (!window.confirm(msg)) return;

    try {
      await apiDelete('/auth/users/' + encodeURIComponent(user.id));
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_delete_success');
      }
      await loadDashboardUsers();
    } catch (err) {
      console.error('Failed to delete dashboard user', err);
      if (statusEl) {
        statusEl.textContent =
          t('config_dashboard_users_delete_error');
      }
    }
  }



    async function saveGuildConfig() {
      if (!state.guildId) return;

      if (!state.configDirty) {
        toast(t('config_nothing_to_save'));
        return;
      }

      setConfigStatus(t('config_loading'));

      const logSelect = document.getElementById('configLogChannel');
      const dashLogSelect = document.getElementById('configDashboardLogChannel');
      const ticketSelect = document.getElementById('configTicketChannel');
      const staffSelect = document.getElementById('configStaffRoles');
      const staffTicketsSelect = document.getElementById('configStaffRolesTickets');
      const staffModerationSelect = document.getElementById('configStaffRolesModeration');
      const staffGameNewsSelect = document.getElementById('configStaffRolesGameNews');
      const staffLogsSelect = document.getElementById('configStaffRolesLogs');
      const statusEl = document.getElementById('configStatus');
      const langSelect = document.getElementById('configServerLanguage');
      const tzSelect = document.getElementById('configServerTimezone');

      const logChannelId = logSelect && logSelect.value ? logSelect.value : null;
      const dashLogChannelId = dashLogSelect && dashLogSelect.value ? dashLogSelect.value : null;
      const ticketThreadChannelId = ticketSelect && ticketSelect.value ? ticketSelect.value : null;

      const staffRoleIds = [];
      if (staffSelect) {
        Array.prototype.forEach.call(staffSelect.selectedOptions || [], function (opt) {
          if (opt.value) staffRoleIds.push(opt.value);
        });
      }

      function readRoleMultiSelect(sel) {
        const out = [];
        if (!sel) return out;
        Array.prototype.forEach.call(sel.selectedOptions || [], function (opt) {
          if (opt.value) out.push(opt.value);
        });
        return out;
      }

      const staffRolesByFeature = {
        tickets: readRoleMultiSelect(staffTicketsSelect),
        moderation: readRoleMultiSelect(staffModerationSelect),
        gamenews: readRoleMultiSelect(staffGameNewsSelect),
        logs: readRoleMultiSelect(staffLogsSelect)
      };

      const language = langSelect && langSelect.value ? langSelect.value : 'auto';
      const timezone = tzSelect && tzSelect.value ? tzSelect.value.trim() || null : null;

      // Inline validation (low risk): validate IDs and timezone format before POST
      function isSnowflake(id) {
        return typeof id === 'string' && /^\d{5,25}$/.test(id);
      }

      // Clear previous field errors
      clearInlineError(logSelect);
      clearInlineError(dashLogSelect);
      clearInlineError(ticketSelect);
      clearInlineError(staffSelect);
      clearInlineError(staffTicketsSelect);
      clearInlineError(staffModerationSelect);
      clearInlineError(staffGameNewsSelect);
      clearInlineError(staffLogsSelect);
      clearInlineError(tzSelect);

      if (logChannelId && !isSnowflake(logChannelId)) {
        setInlineError(logSelect, t('config_invalid_channel_id'));
        setConfigStatus(t('config_invalid_channel_id'));
        toast(t('config_invalid_channel_id'));
        return;
      }
      if (dashLogChannelId && !isSnowflake(dashLogChannelId)) {
        setInlineError(dashLogSelect, t('config_invalid_channel_id'));
        setConfigStatus(t('config_invalid_channel_id'));
        toast(t('config_invalid_channel_id'));
        return;
      }
      if (ticketThreadChannelId && !isSnowflake(ticketThreadChannelId)) {
        setInlineError(ticketSelect, t('config_invalid_channel_id'));
        setConfigStatus(t('config_invalid_channel_id'));
        toast(t('config_invalid_channel_id'));
        return;
      }

      var allRoleIds = staffRoleIds
        .concat(staffRolesByFeature.tickets || [])
        .concat(staffRolesByFeature.moderation || [])
        .concat(staffRolesByFeature.gamenews || [])
        .concat(staffRolesByFeature.logs || []);

      for (var i = 0; i < allRoleIds.length; i++) {
        if (allRoleIds[i] && !isSnowflake(allRoleIds[i])) {
          // Mark the most relevant select
          setInlineError(staffSelect || staffTicketsSelect || staffModerationSelect || staffGameNewsSelect || staffLogsSelect, t('config_invalid_role_id'));
          setConfigStatus(t('config_invalid_role_id'));
          toast(t('config_invalid_role_id'));
          return;
        }
      }

      if (timezone) {
        var tzOk = /^[A-Za-z_]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/.test(timezone)
          || /^UTC$/i.test(timezone)
          || /^Etc\/(GMT|UTC)([+-]?\d{1,2})?$/.test(timezone);
        if (!tzOk) {
          setInlineError(tzSelect, t('config_invalid_timezone'));
          setConfigStatus(t('config_invalid_timezone'));
          toast(t('config_invalid_timezone'));
          return;
        }
      }

      try {
        await apiPost('/guilds/' + encodeURIComponent(state.guildId) + '/config', {
          logChannelId: logChannelId,
          dashboardLogChannelId: dashLogChannelId,
          ticketThreadChannelId: ticketThreadChannelId,
          staffRoleIds: staffRoleIds,
          staffRolesByFeature: staffRolesByFeature,
          language: language,
          timezone: timezone,
        });

        state.guildLanguage = language;
        state.guildTimezone = timezone;

        if (state.guildLanguage && state.guildLanguage !== 'auto') {
          setLang(state.guildLanguage);
        } else {
          setLang(state.lang || 'pt');
        }

        // mark clean + update UI
        state.configDirty = false;
        var btnSave = document.getElementById('btnSaveGuildConfig');
        if (btnSave) btnSave.disabled = true;
        setConfigStatus(t('config_saved'));
        toast(t('config_saved'));
      } catch (err) {
        console.error('Failed to save guild config', err);
        setConfigStatus(t('config_error_generic'));
        toast(t('config_error_save'));
      }
    }


    function getGuildMetaList(kind) {
      const m = state._guildMeta || {};
      return (kind && m[kind]) ? m[kind] : [];
    }

    function getVoiceChannelNameById(id) {
      if (!id) return null;
      const list = getGuildMetaList('voiceChannels');
      const found = list.find(function (c) { return c && c.id === id; });
      return found ? found.name : null;
    }

    
    async function ensureGuildMetaForTempVoice() {
      if (!state.guildId) return;
      state._guildMeta = state._guildMeta || {};
      var hasVoice = Array.isArray(state._guildMeta.voiceChannels) && state._guildMeta.voiceChannels.length;
      var hasCats = Array.isArray(state._guildMeta.categories) && state._guildMeta.categories.length;
      if (hasVoice && hasCats) return;
      try {
        const meta = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/meta');
        if (meta) {
          state._guildMeta.voiceChannels = Array.isArray(meta.voiceChannels) ? meta.voiceChannels : [];
          state._guildMeta.categories = Array.isArray(meta.categories) ? meta.categories : [];
        }
      } catch (e) {}
    }

function populateTempVoiceSelects() {
      const addBaseSel = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
      const catSel = document.getElementById('tempVoiceCategoryId');

      if (addBaseSel) {
        const current = addBaseSel.value || '';
        addBaseSel.innerHTML = '';
        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = t('common_select_placeholder') || '-';
        addBaseSel.appendChild(optNone);

        getGuildMetaList('voiceChannels').forEach(function (ch) {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = ch.name;
          addBaseSel.appendChild(opt);
        });
        addBaseSel.value = current;
      }

      if (catSel) {
        const current = catSel.value || '';
        catSel.innerHTML = '';
        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = t('common_none_option');
        catSel.appendChild(optNone);

        getGuildMetaList('categories').forEach(function (c) {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          catSel.appendChild(opt);
        });
        catSel.value = current;
      }
    }

    async function loadTempVoiceConfig() {
      if (!state.guildId) return;

      try {
        const res = await apiGet(`/temp-voice/config?guildId=${encodeURIComponent(state.guildId)}`);
        if (!res || !res.ok) return;

        var cfg = res.config || {};
        var enabledSel = document.getElementById('tempVoiceEnabled');
        var baseIdInput = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
        var catInput = document.getElementById('tempVoiceCategoryId');
        var delayInput = document.getElementById('tempVoiceDeleteDelay');
        var maxUsersInput = document.getElementById('tempVoiceMaxUsers');

        // Ensure guild meta is available (voice channels + categories)
        await ensureGuildMetaForTempVoice();
        populateTempVoiceSelects();

        var baseIds = Array.isArray(cfg.baseChannelIds) ? cfg.baseChannelIds : [];

        state.tempVoiceBase = state.tempVoiceBase || { items: [], selectedIndex: -1 };
        state.tempVoiceBase.items = baseIds.slice();
        state.tempVoiceBase.selectedIndex = -1;

        if (enabledSel) {
          enabledSel.value = cfg.enabled ? 'true' : 'false';
        }
        if (baseIdInput) {
          baseIdInput.value = '';
        }
        if (catInput) {
          catInput.value = cfg.categoryId || '';
        }
        if (delayInput) {
          delayInput.value = typeof cfg.deleteDelaySeconds === 'number' ? String(cfg.deleteDelaySeconds) : '10';
        }
        if (maxUsersInput) {
          maxUsersInput.value = (cfg.maxUsersPerRoom !== null && cfg.maxUsersPerRoom !== undefined) ? String(cfg.maxUsersPerRoom) : '';
        }

        if (typeof renderTempVoiceBaseList === 'function') {
          renderTempVoiceBaseList();
        }
      } catch (err) {
        console.error('Failed to load temp voice config', err);
      }
    }

    async function saveTempVoiceConfig() {
      if (!state.guildId) return;

      var enabledSel = document.getElementById('tempVoiceEnabled');
      var catInput = document.getElementById('tempVoiceCategoryId');
      var delayInput = document.getElementById('tempVoiceDeleteDelay');
      var maxUsersInput = document.getElementById('tempVoiceMaxUsers');

var enabled = enabledSel && enabledSel.value === 'true';
      var categoryId = (catInput && catInput.value) || '';
      var delayRaw = (delayInput && delayInput.value) || '10';

      var baseChannelIds = (state.tempVoiceBase && state.tempVoiceBase.items || []).filter(function (s) { return !!s; });

      var delaySeconds = parseInt(delayRaw, 10);
      if (!Number.isFinite(delaySeconds) || delaySeconds < 2) delaySeconds = 10;

      var maxUsers = null;
      try {
        var raw = (maxUsersInput && maxUsersInput.value) ? String(maxUsersInput.value).trim() : '';
        if (raw) {
          var n = parseInt(raw, 10);
          if (Number.isFinite(n) && n >= 1 && n <= 99) maxUsers = n;
        }
      } catch (e) {}



      try {
        const body = {
          guildId: state.guildId,
          enabled: enabled,
          baseChannelIds: baseChannelIds,
          categoryId: categoryId,
          deleteDelaySeconds: delaySeconds,
          maxUsersPerRoom: maxUsers
        };
        const res = await apiPost('/temp-voice/config', body);
        if (res && res.ok) {
          toast(t('tempvoice_saved'));
          loadTempVoiceConfig().catch(function () {});
        } else {
          toast(t('tempvoice_save_error'), 'error');
        }
      } catch (err) {
        console.error('Failed to save temp voice config', err);
        toast(t('tempvoice_save_error'), 'error');
      }
    }

    async function loadTempVoiceActive() {
      if (!state.guildId) return;

      try {
        const res = await apiGet(`/temp-voice/active?guildId=${encodeURIComponent(state.guildId)}`);
        const listEl = document.getElementById('tempVoiceActiveList');
        if (!listEl) return;

        listEl.innerHTML = '';

        if (!res || !res.ok || !Array.isArray(res.items) || !res.items.length) {
          listEl.innerHTML = `<div class="empty">${escapeHtml(t('tempvoice_active_empty'))}</div>`;
          return;
        }

        res.items.forEach(function (item) {
          var el = document.createElement('div');
          el.className = 'list-item';
          el.innerHTML = `
            <div class="row space">
              <div>
                <div class="title">${escapeHtml(item.channelName || getVoiceChannelNameById(item.channelId) || (item.channelId ? ('#' + item.channelId) : ''))}</div>
                <div class="subtitle">
                  ${escapeHtml(t('tempvoice_active_owner_label') || 'Owner')}: ${escapeHtml(item.ownerTag || item.ownerId || '?')}
                  · ${escapeHtml(t('tempvoice_active_base_label') || 'Base')}: ${escapeHtml(item.baseChannelName || getVoiceChannelNameById(item.baseChannelId) || item.baseChannelId || '?')}
                </div>
              </div>
            </div>
          `;          listEl.appendChild(el);
        });
      } catch (err) {
        console.error('Failed to load temp voice active list', err);
      }
    }



  function renderTempVoiceBaseList() {
    var listEl = document.getElementById('tempVoiceBaseList');
    if (!listEl) return;

    listEl.innerHTML = '';

    var items = state.tempVoiceBase.items || [];
    if (!items.length) {
      listEl.innerHTML = '<div class="empty">' + escapeHtml(t('tempvoice_base_list_empty')) + '</div>';
      return;
    }

    items.forEach(function (id, index) {
      var row = document.createElement('div');
      row.className = 'list-item' + (index === state.tempVoiceBase.selectedIndex ? ' active' : '');
      row.dataset.index = String(index);
      row.innerHTML = `
        <div class="row space">
          <div>
            <div class="title">${escapeHtml(getVoiceChannelNameById(id) || id || "")}</div>
            <div class="subtitle">${escapeHtml(t('tempvoice_base_list_hint'))}</div>
          </div>
        </div>
      `;
      row.addEventListener('click', function () {
        // mostrar estado de loading ao estilo dos feeds
        if (typeof showPanelLoading === 'function') {
          showPanelLoading('tempVoiceDetailPanel');
        }
        selectTempVoiceBaseIndex(index);
      });
      listEl.appendChild(row);
    });
  }

    function selectTempVoiceBaseIndex(index) {
      var items = state.tempVoiceBase.items || [];
      var emptyEl = document.getElementById('tempVoiceDetailEmpty');
      var contentEl = document.getElementById('tempVoiceDetailContent');
      var currentLabel = document.getElementById('tempVoiceCurrentBaseLabel');

      if (index < 0 || index >= items.length) {
        state.tempVoiceBase.selectedIndex = -1;
        var baseIdInput = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
        if (baseIdInput) baseIdInput.value = '';
        if (emptyEl) emptyEl.style.display = '';
        if (contentEl) contentEl.style.display = 'none';
        if (currentLabel) currentLabel.textContent = t('tempvoice_current_base') + ' (nenhum selecionado)';
        renderTempVoiceBaseList();
        return;
      }

      state.tempVoiceBase.selectedIndex = index;
      var baseIdInput2 = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
      if (baseIdInput2) baseIdInput2.value = '';
      if (emptyEl) emptyEl.style.display = 'none';
      if (contentEl) contentEl.style.display = '';
      if (currentLabel) currentLabel.textContent = (t('tempvoice_current_base') || 'Canal base:') + ' ' + (getVoiceChannelNameById(items[index]) || items[index] || '');
      renderTempVoiceBaseList();
    }
function addTempVoiceBaseChannel() {
    if (!state.tempVoiceBase) state.tempVoiceBase = { items: [], selectedIndex: -1 };
    if (!Array.isArray(state.tempVoiceBase.items)) state.tempVoiceBase.items = [];

    var baseSel = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
    var val = baseSel ? String(baseSel.value || '').trim() : '';
    if (!val) {
      toast(t('tempvoice_select_base_first') || t('common_select_placeholder') || 'Selecione um canal base primeiro.', 'error');
      return;
    }

    // Avoid duplicates
    if (state.tempVoiceBase.items.indexOf(val) === -1) {
      state.tempVoiceBase.items.push(val);
    }
    state.tempVoiceBase.selectedIndex = state.tempVoiceBase.items.indexOf(val);

    // Reset select for convenience
    if (baseSel) baseSel.value = '';

    renderTempVoiceBaseList();
    selectTempVoiceBaseIndex(state.tempVoiceBase.selectedIndex);
  }

function syncTempVoiceBaseFromInput() {
    // Legacy no-op: base channels are managed via select + list, not manual ID input.
    return;
  }

function deleteTempVoiceBaseAt(index) {
    if (!state.tempVoiceBase || !Array.isArray(state.tempVoiceBase.items)) return;
    if (index < 0 || index >= state.tempVoiceBase.items.length) return;

    state.tempVoiceBase.items.splice(index, 1);
    if (state.tempVoiceBase.items.length === 0) {
      state.tempVoiceBase.selectedIndex = -1;
      var baseIdInput = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
      if (baseIdInput) baseIdInput.value = '';
    } else if (state.tempVoiceBase.selectedIndex >= state.tempVoiceBase.items.length) {
      state.tempVoiceBase.selectedIndex = state.tempVoiceBase.items.length - 1;
      var baseIdInput2 = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
      if (baseIdInput2) baseIdInput2.value = state.tempVoiceBase.items[state.tempVoiceBase.selectedIndex] || '';
    }
    renderTempVoiceBaseList();
  }







  // -----------------------------
  // Init
  // -----------------------------

  document.addEventListener('DOMContentLoaded', function () {
      
    // Bot status badge
    refreshBotStatusBadge();
    setInterval(refreshBotStatusBadge, 20000);

      // i18n inicial
      (function initLang() {
        var lang = 'pt';
        try {
          var stored = localStorage.getItem(LANG_KEY);
          if (stored) lang = stored;
        } catch (e) {}

        state.lang = (lang || 'pt').toLowerCase();

        window.OzarkDashboard = window.OzarkDashboard || {};
        window.OzarkDashboard.I18n = window.OzarkDashboard.I18n || {};

        if (typeof window.OzarkDashboard.I18n.init === 'function') {
          window.OzarkDashboard.I18n.init(state.lang).then(function () {
            applyI18n();
          });
        } else {
          applyI18n();
        }
      })();

    // Tabs
    document.querySelectorAll('.tabs button[data-tab]').forEach(function (btn) {
    // Subtabs inside Extras
    document.querySelectorAll('#tab-gamenews .subtabs .subtab').forEach(function (sub) {
      sub.addEventListener('click', function () {
        var name = sub.getAttribute('data-subtab');
        if (!name) return;

        // Load tickets list when opening the Tickets subtab
        if (name === 'tickets' && window.OzarkDashboard && typeof window.OzarkDashboard.loadTickets === 'function') {
          try {
            window.OzarkDashboard.loadTickets(true);
          } catch (e) {
            console.error('Failed to load tickets', e);
          }
        }

        // Reset estado da voz temporária sempre que se entra na subtab
        if (name === 'tempvoice') {
          try {
            state.tempVoiceBase = state.tempVoiceBase || { items: [], selectedIndex: -1 };
            state.tempVoiceBase.selectedIndex = -1;

            var baseIdInput = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
            if (baseIdInput) baseIdInput.value = '';

            var emptyEl = document.getElementById('tempVoiceDetailEmpty');
            var contentEl = document.getElementById('tempVoiceDetailContent');
            var currentLabel = document.getElementById('tempVoiceCurrentBaseLabel');
            if (emptyEl) emptyEl.style.display = '';
            if (contentEl) contentEl.style.display = 'none';
            if (currentLabel) {
              currentLabel.textContent = t('tempvoice_current_base') + ' (nenhum selecionado)';
            }
            if (typeof renderTempVoiceBaseList === 'function') {
              renderTempVoiceBaseList();
            }
          } catch (e) {
            console.error('Failed to reset temp voice detail', e);
          }
        }

        document.querySelectorAll('#tab-gamenews .subtabs .subtab').forEach(function (btn) {
          btn.classList.remove('active');
        });
        sub.classList.add('active');

        document.querySelectorAll('#tab-gamenews .subtab-panel').forEach(function (panel) {
          panel.classList.remove('active');
        });
        var panel = document.getElementById('extras-' + name + '-panel');
        if (panel) panel.classList.add('active');
      });
    });

      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab');
        if (!tab) return;
        setTab(tab);
      });
    });

    // Guild picker
    var guildPicker = document.getElementById('guildPicker');
    if (guildPicker) {
      guildPicker.addEventListener('change', function () {
        (async function () {
        var v = guildPicker.value || '';
        state.guildId = v || null;
        try {
          if (state.guildId) setStoredGuildId(state.guildId);
          else localStorage.removeItem(GUILD_KEY);
        } catch (e) {}
        // Mint scoped OAuth token (if needed) before enabling tabs.
        var okScoped = await ensureGuildScopedToken(state.guildId);
        if (!okScoped) {
          state.guildId = null;
          try { guildPicker.value = ''; } catch (e) {}
          updateTabAccess();
          setTab('overview');
          return;
        }

        updateTabAccess();

        // Se nenhum servidor estiver selecionado, volta sempre para a visão geral.
        if (!state.guildId) {
          setTab('overview');
          return;
        }

        if (state.currentTab !== 'overview') {
          // reload current tab data when guild changes
          if (state.currentTab === 'logs') {
            window.OzarkDashboard.loadLogs().catch(function () {});
          } else if (state.currentTab === 'gamenews') {
            window.OzarkDashboard.loadGameNews().catch(function () {});
            loadTempVoiceConfig().catch(function () {});
            loadTempVoiceActive().catch(function () {});

            // If Tickets subtab is open, refresh ticket list
            try {
              var activeSub = document.querySelector('#tab-gamenews .subtabs .subtab.active');
              var subName = activeSub ? activeSub.getAttribute('data-subtab') : '';
              if (subName === 'tickets' && window.OzarkDashboard && typeof window.OzarkDashboard.loadTickets === 'function') {
                window.OzarkDashboard.loadTickets(true);
              }
            } catch (e) {}
          } else if (state.currentTab === 'user') {
            window.OzarkDashboard.loadUsers().catch(function () {});
          } else if (state.currentTab === 'config') {
            loadGuildConfig().catch(function () {});
          }
        }
        })().catch(function () {
          // ignore
        });
      });
    }

          // Temp voice config
      var btnDeleteTempVoiceBase = document.getElementById('btnDeleteTempVoiceBase');
      if (btnDeleteTempVoiceBase) {
        btnDeleteTempVoiceBase.addEventListener('click', function () {
          if (!state.tempVoiceBase) return;
          var idx = state.tempVoiceBase.selectedIndex;
          if (typeof deleteTempVoiceBaseAt === 'function') {
            deleteTempVoiceBaseAt(idx);
          }
        });
      }


      // Temp voice base channels
      var btnTempVoiceAddBase = document.getElementById('btnTempVoiceAddBase');
      if (btnTempVoiceAddBase) {
        btnTempVoiceAddBase.addEventListener('click', function () {
          addTempVoiceBaseChannel();
        });
      }
      var baseIdInput = document.getElementById('tempVoiceAddBaseSelect') || document.getElementById('tempVoiceBaseId');
      if (baseIdInput) {
        // Selecting a voice channel and clicking "Adicionar" adds it to the base list.
        // Also allow quick-add on change (optional).
        if (!baseIdInput.dataset.boundTempVoiceAdd) {
          baseIdInput.dataset.boundTempVoiceAdd = '1';
          baseIdInput.addEventListener('change', function () {
            // Do not auto-add if user just cleared it
            if (String(baseIdInput.value || '').trim()) {
              // Keep it explicit: only auto-add if there are no bases yet
              if (!state.tempVoiceBase || !Array.isArray(state.tempVoiceBase.items) || state.tempVoiceBase.items.length === 0) {
                addTempVoiceBaseChannel();
              }
            }
          });
        }
      }


      var btnSaveTempVoice = document.getElementById('btnSaveTempVoice');
      if (btnSaveTempVoice) {
        btnSaveTempVoice.addEventListener('click', function () {
          saveTempVoiceConfig().catch(function () {});
        });
      }

// Logs controls
    var btnReloadLogs = document.getElementById('btnReloadLogs');
    if (btnReloadLogs) {
      btnReloadLogs.addEventListener('click', function () {
        window.OzarkDashboard.loadLogs().catch(function () {});
      });
    }

    var logTypeSelect = document.getElementById('logType');
    if (logTypeSelect) {
      logTypeSelect.addEventListener('change', function () {
        window.OzarkDashboard.loadLogs().catch(function () {});
      });
    }

    var logSearchInput = document.getElementById('logSearch');
    if (logSearchInput) {
      logSearchInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          window.OzarkDashboard.loadLogs().catch(function () {});
        }
      });
    }

    // Config buttons
    var btnReloadGuildConfig = document.getElementById('btnReloadGuildConfig');
    if (btnReloadGuildConfig) {
      btnReloadGuildConfig.addEventListener('click', function () {
        loadGuildConfig().catch(function () {});
      });
    }

    var btnSaveGuildConfig = document.getElementById('btnSaveGuildConfig');
    if (btnSaveGuildConfig) {
      btnSaveGuildConfig.addEventListener('click', function () {
        saveGuildConfig().catch(function () {});
      });
    }

    // Trust presets + save (Config -> Extras -> Trust)
    var trustPresetSelect = document.getElementById('trustPresetSelect');
    var btnApplyTrustPreset = document.getElementById('btnApplyTrustPreset');
    var btnSaveTrustConfig = document.getElementById('btnSaveTrustConfig');
    var trustSaveStatus = document.getElementById('trustSaveStatus');

    function setTrustStatus(msg) {
      if (!trustSaveStatus) return;
      trustSaveStatus.textContent = msg || '';
    }

    function markTrustDirty() {
      state.trustDirty = true;
      setTrustStatus(t('trust_status_unsaved'));
    }

    // Bind input changes -> mark dirty + switch to "custom"
    var trustInputIds = [
      'trustBaseInput','trustMinInput','trustMaxInput',
      'trustWarnPenaltyInput','trustMutePenaltyInput',
      'trustRegenPerDayInput','trustRegenMaxDaysInput',
      'trustLowThresholdInput','trustHighThresholdInput'
    ];
    trustInputIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('input', function () {
        clearInlineError(el);
        if (trustPresetSelect) trustPresetSelect.value = 'custom';
        state.trustExtraOverride = null;
        markTrustDirty();
      });
    });
    // Presets: update the numeric fields immediately when selecting a preset
    // (still only persists after clicking "Guardar Trust").
    if (trustPresetSelect && !trustPresetSelect.dataset.boundChange) {
      trustPresetSelect.dataset.boundChange = '1';
      trustPresetSelect.addEventListener('change', function () {
        var key = trustPresetSelect.value || 'custom';
        if (!TRUST_PRESETS[key] || key === 'custom') {
          // Custom: do nothing; user edits the fields manually.
          return;
        }
        setTrustInputs(TRUST_PRESETS[key]);
        state.trustExtraOverride = TRUST_PRESETS[key];
        markTrustDirty();
        setTrustStatus(t('trust_status_preset_applied'));
      });
    }


    if (btnApplyTrustPreset && !btnApplyTrustPreset.dataset.bound) {
      btnApplyTrustPreset.dataset.bound = '1';
      btnApplyTrustPreset.addEventListener('click', function () {
        if (!trustPresetSelect) return;
        var key = trustPresetSelect.value || 'custom';
        if (!TRUST_PRESETS[key]) {
          trustPresetSelect.value = 'custom';
          return;
        }
        setTrustInputs(TRUST_PRESETS[key]);
        state.trustExtraOverride = TRUST_PRESETS[key];
        markTrustDirty();
        setTrustStatus(t('trust_status_preset_applied'));
        toast(t('trust_preset_applied'));
      });
    }

    if (btnSaveTrustConfig && !btnSaveTrustConfig.dataset.bound) {
      btnSaveTrustConfig.dataset.bound = '1';
      btnSaveTrustConfig.addEventListener('click', function () {
        (async function () {
          try {
            var core = getTrustInputs();
            var v = validateTrustCore(core);
            // Clear previous inline errors
            clearInlineErrors([
              'trustBaseInput','trustMinInput','trustMaxInput',
              'trustWarnPenaltyInput','trustMutePenaltyInput',
              'trustRegenPerDayInput','trustRegenMaxDaysInput',
              'trustLowThresholdInput','trustHighThresholdInput'
            ]);
            if (!v.ok) {
              (v.fields || []).forEach(function (id) {
                setInlineError(document.getElementById(id), v.msg);
              });
              setTrustStatus(v.msg);
              toast(v.msg);
              return;
            }
            var presetKey = trustPresetSelect ? trustPresetSelect.value : 'custom';
            var patch = buildTrustPatch(core, presetKey);

            btnSaveTrustConfig.disabled = true;
            btnSaveTrustConfig.classList.add('is-loading');

            var res = await apiPatch('/config', patch);
            if (!res || res.ok === false) {
              throw new Error((res && (res.error || res.message)) || 'SAVE_FAILED');
            }

            state.trustDirty = false;
            state.trustLastSavedAt = Date.now();
            state.trustExtraOverride = null;
            if (res.config && res.config.trust) {
              state.currentTrustConfig = res.config.trust;
              if (trustPresetSelect) {
                trustPresetSelect.value = detectTrustPreset(res.config.trust);
              }
            }

            setTrustStatus(t('trust_status_saved'));
            toast(t('trust_save_ok'));
            // Refresh config panel to update computed preview labels
            loadGuildConfig().catch(function () {});
          } catch (e) {
            console.error('Failed to save trust config', e);
            var msg = (e && e.apiMessage) ? e.apiMessage : (e && e.message ? e.message : t('trust_save_error'));
            setTrustStatus(msg);
            toast(msg);
          } finally {
            btnSaveTrustConfig.disabled = false;
            btnSaveTrustConfig.classList.remove('is-loading');
            applyPermissionGates();
          }
        })();
      });
    }

    // Login form
    var loginScreen = document.getElementById('loginScreen');
    var loginDiscordBtn = document.getElementById('loginDiscordBtn');
    var loginError = document.getElementById('loginError');

    // Guild selector overlay
    var guildSelectScreen = document.getElementById('guildSelectScreen');
    var guildSelectList = document.getElementById('guildSelectList');
    var guildSelectError = document.getElementById('guildSelectError');

    function showGuildSelect(items) {
      if (!guildSelectScreen || !guildSelectList) return;
      if (!Array.isArray(items) || items.length < 2) {
        guildSelectScreen.classList.add('hidden');
        return;
      }
      guildSelectList.innerHTML = '';
      if (guildSelectError) guildSelectError.textContent = '';

      items.forEach(function (g) {
        if (!g || !g.id) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'guild-select-item';

        var name = document.createElement('div');
        name.className = 'guild-select-name';
        name.textContent = g.name || g.id;

        var sub = document.createElement('div');
        sub.className = 'hint';
        sub.textContent = g.id;

        btn.appendChild(name);
        btn.appendChild(sub);

        btn.addEventListener('click', function () {
          state.guildId = g.id;
          setStoredGuildId(g.id);

          try {
            var guildPicker = document.getElementById('guildPicker');
            if (guildPicker) guildPicker.value = g.id;
          } catch (e) {}

          (async function () {
            var okScoped = await ensureGuildScopedToken(state.guildId);
            if (!okScoped) {
              if (guildSelectError) guildSelectError.textContent = t('guild_select_error_access');
              return;
            }
            updateTabAccess();
            guildSelectScreen.classList.add('hidden');
            setTab('overview');
          })().catch(function () {});
        });

        guildSelectList.appendChild(btn);
      });

      guildSelectScreen.classList.remove('hidden');
    }

    function showLogin() {
      if (loginScreen) loginScreen.classList.remove('hidden');
      if (loginError) loginError.textContent = '';
      try { if (loginDiscordBtn) loginDiscordBtn.focus(); } catch (e) {}
    }

    function hideLogin() {
      if (loginScreen) loginScreen.classList.add('hidden');
      if (loginError) loginError.textContent = '';
    }

    // Carrega guilds e visão geral inicial, se já houver token guardado
    if (getToken()) {
      hideLogin();
      loadMe().catch(function () {});
      loadGuilds().catch(function () {});
      setTab('overview');
    } else {
      // OAuth login button
      if (loginDiscordBtn && !loginDiscordBtn.dataset.bound) {
        loginDiscordBtn.dataset.bound = '1';
        loginDiscordBtn.addEventListener('click', function () {
          try { window.location.href = '/api/auth/discord'; } catch (e) {}
        });
      }

      // Add bot (invite) button
      var addBotBtn = document.getElementById('addBotBtn');
      if (addBotBtn && !addBotBtn.dataset.bound) {
        addBotBtn.dataset.bound = '1';
        addBotBtn.addEventListener('click', function () {
          (async function () {
            try {
              var r = await apiGet('/invite');
              if (r && r.ok && r.url) {
                window.open(r.url, '_blank', 'noopener');
              } else {
                toast(t('add_bot_error'));
              }
            } catch (e) {
              toast(t('add_bot_error'));
            }
          })();
        });
      }
        showLogin();
    }
});

  // Expose key parts on global namespace for future multi-file split
  window.OzarkDashboard.state = state;
  window.OzarkDashboard.API_BASE = API_BASE;
  window.OzarkDashboard.getToken = getToken;
  window.OzarkDashboard.setToken = setToken;
  window.OzarkDashboard.clearToken = clearToken;
  window.OzarkDashboard.apiGet = apiGet;
  window.OzarkDashboard.apiPost = apiPost;
  window.OzarkDashboard.toast = toast;
  window.OzarkDashboard.t = t;
  window.OzarkDashboard.escapeHtml = escapeHtml;
  window.OzarkDashboard.formatDateTime = formatDateTime;
  window.OzarkDashboard.setTab = setTab;
  window.OzarkDashboard.loadGuilds = loadGuilds;

  // Moderation (logs / cases)
  window.OzarkDashboard.createLogRow = createLogRow;
  window.OzarkDashboard.createCaseRow = createCaseRow;
  window.OzarkDashboard.renderLogs = renderLogs;

  // JSON import/export helpers for guild config
  
async function exportGuildConfigJson() {
  if (!state.guildId) return;
  if (typeof document === 'undefined') return;

  try {
    const cfg = await apiGet('/guilds/' + encodeURIComponent(state.guildId) + '/config');
    const conf = cfg && cfg.config ? cfg.config : {};

    const payload = {
      guildId: conf.guildId || state.guildId || null,
      language: typeof conf.language === 'string' ? conf.language : 'auto',
      timezone: (typeof conf.timezone === 'string' && conf.timezone.trim()) ? conf.timezone.trim() : null,
      logChannelId: conf.logChannelId || null,
      dashboardLogChannelId: conf.dashboardLogChannelId || null,
      ticketThreadChannelId: conf.ticketThreadChannelId || null,
      staffRoleIds: Array.isArray(conf.staffRoleIds) ? conf.staffRoleIds : []
    };

    const json = JSON.stringify(payload, null, 2);

    const ta = document.getElementById('configJsonExport');
    if (ta) {
      ta.value = json;
    }

    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rabbit-guild-config-' + (payload.guildId || 'unknown') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Unable to trigger automatic JSON download:', e);
    }

    toast(t('config_saved'));
  } catch (err) {
    console.error('Failed to export guild config JSON', err);
    toast(t('config_error_generic'));
  }
}


async function importGuildConfigJson() {
  if (!state.guildId) return;
  if (typeof document === 'undefined') return;

  const ta = document.getElementById('configJsonImport');
  if (!ta || !ta.value.trim()) {
    toast(t('config_error_generic'));
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(ta.value);
  } catch (e) {
    console.error('Invalid JSON for import', e);
    toast(t('config_error_generic'));
    return;
  }

  const payload = {
    logChannelId: parsed.logChannelId || null,
    dashboardLogChannelId: parsed.dashboardLogChannelId || null,
    ticketThreadChannelId: parsed.ticketThreadChannelId || null,
    staffRoleIds: Array.isArray(parsed.staffRoleIds) ? parsed.staffRoleIds.filter(Boolean) : []
  };

  if (typeof parsed.language === 'string') {
    payload.language = parsed.language;
  }
  if (typeof parsed.timezone === 'string') {
    payload.timezone = parsed.timezone;
  }

  try {
    await apiPost('/guilds/' + encodeURIComponent(state.guildId) + '/config', payload);
    toast(t('config_saved'));

    if (payload.language) {
      state.guildLanguage = payload.language;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'timezone')) {
      state.guildTimezone = payload.timezone;
    }

    if (state.guildLanguage && state.guildLanguage !== 'auto') {
      setLang(state.guildLanguage);
    }

    await loadGuildConfig();
  } catch (err) {
    console.error('Failed to import guild config JSON', err);
    toast(t('config_error_save'));
  }
}

  window.OzarkDashboard.exportGuildConfigJson = exportGuildConfigJson;
  window.OzarkDashboard.importGuildConfigJson = importGuildConfigJson;

})(); // close main dashboard IIFE

// Wire JSON import/export buttons (safe even if DOMContentLoaded already ran)
(function () {
  if (typeof document === 'undefined') return;
  function bindJsonButtons() {
    var btnExport = document.getElementById('configJsonExportBtn');
    var btnImport = document.getElementById('configJsonImportBtn');
    if (btnExport && window.OzarkDashboard && typeof window.OzarkDashboard.exportGuildConfigJson === 'function') {
      btnExport.addEventListener('click', function () {
        window.OzarkDashboard.exportGuildConfigJson().catch(function () {});
      }, { once: true });
    }
    if (btnImport && window.OzarkDashboard && typeof window.OzarkDashboard.importGuildConfigJson === 'function') {
      btnImport.addEventListener('click', function () {
        window.OzarkDashboard.importGuildConfigJson().catch(function () {});
      }, { once: true });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindJsonButtons);
  } else {
    bindJsonButtons();
  }
})();