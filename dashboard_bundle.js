
    // ------------------------------
    // State
    // ------------------------------
    const state = {
      token: localStorage.getItem('DASHBOARD_TOKEN') || '',
      guildId: '',
      guilds: [],
      feeds: [],
      config: null,
      schema: null,
      user: null,

      // logs pagination
      logs: {
        page: 1,
        limit: 50,
        total: 0,
        items: []
      },

      // cases pagination
      cases: {
        page: 1,
        limit: 25,
        total: 0,
        items: []
      },

      // tickets pagination
      tickets: {
        page: 1,
        limit: 25,
        total: 0,
        items: []
      }
    };

    // ------------------------------
    

    // ------------------------------
    // i18n (PT/EN)
    // ------------------------------
    state.lang = (localStorage.getItem('OZARK_LANG') || 'pt').toLowerCase();

    const I18N = {
      pt: {
        login_title: 'Ozark Dashboard',
        login_sub: 'Autentica para aceder ao painel.',
        login_hint: 'Introduz o DASHBOARD_TOKEN. Fica guardado apenas no teu browser.',
        login_btn: 'Entrar',
        login_token_placeholder: 'DASHBOARD_TOKEN',
        login_tip_badge: 'Dica',
        login_tip: 'Se mudares o token, podes fazer logout no topo.',

        btn_refresh: 'Atualizar',
        btn_logout: 'Logout',
        btn_change_token: 'Mudar token',

        badge_bot_online: '● Bot online',
        badge_bot_offline: '● Bot offline',
        badge_server: 'Servidor: {name}',
        badge_auth_ok: 'Auth: OK',
        badge_auth_missing: 'Auth: Token em falta',
        badge_auth_invalid: 'Auth: Token inválido',

        toast_unauthorized_set_token: 'Não autorizado: define o token.',
        toast_download_failed: 'Falha no download.',
        toast_token_saved: 'Token guardado.',
        toast_token_cleared: 'Token removido. Faz login novamente.',
        toast_paste_token: 'Cola primeiro o token.',

        session_title: 'Sessão',
        session_hint: 'Autenticação do painel e ações rápidas.',
        session_note: 'O token fica guardado apenas no teu browser. Usa Logout para remover.',
        session_ok: 'Sessão ativa',

        select_guild_top: 'Seleciona um servidor no topo.',
        select_guild_first: 'Seleciona um servidor primeiro.',
        no_tickets: 'Sem tickets',
        select_a_guild: 'Seleciona um servidor',

        page_x_of_y: 'Página {p} / {max}',
        total_n: 'Total: {n}',
      },
      en: {
        login_title: 'Ozark Dashboard',
        login_sub: 'Authenticate to access the dashboard.',
        login_hint: 'Enter the DASHBOARD_TOKEN. It is stored only in your browser.',
        login_btn: 'Sign in',
        login_token_placeholder: 'DASHBOARD_TOKEN',
        login_tip_badge: 'Tip',
        login_tip: 'If you change the token, you can logout from the top bar.',

        btn_refresh: 'Refresh',
        btn_logout: 'Logout',
        btn_change_token: 'Change token',

        badge_bot_online: '● Bot online',
        badge_bot_offline: '● Bot offline',
        badge_server: 'Server: {name}',
        badge_auth_ok: 'Auth: OK',
        badge_auth_missing: 'Auth: Missing token',
        badge_auth_invalid: 'Auth: Invalid token',

        toast_unauthorized_set_token: 'Unauthorized: set token.',
        toast_download_failed: 'Download failed.',
        toast_token_saved: 'Token saved.',
        toast_token_cleared: 'Token removed. Please sign in again.',
        toast_paste_token: 'Paste the token first.',

        session_title: 'Session',
        session_hint: 'Dashboard authentication and quick actions.',
        session_note: 'The token is stored only in your browser. Use Logout to remove it.',
        session_ok: 'Session active',

        select_guild_top: 'Select a server at the top.',
        select_guild_first: 'Select a server first.',
        no_tickets: 'No tickets',
        select_a_guild: 'Select a server',

        page_x_of_y: 'Page {p} / {max}',
        total_n: 'Total: {n}',
      }
    };

    function t(key, vars) {
      const lang = I18N[state.lang] ? state.lang : 'pt';
      let s = I18N[lang][key] || I18N.pt[key] || key;
      if (vars) {
        for (const [k,v] of Object.entries(vars)) {
          s = s.replaceAll('{' + k + '}', String(v));
        }
      }
      return s;
    }

    function applyI18n() {
      const lang = I18N[state.lang] ? state.lang : 'pt';
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (!k) return;
        el.textContent = t(k);
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const k = el.getAttribute('data-i18n-placeholder');
        if (!k) return;
        el.setAttribute('placeholder', t(k));
      });

      const lp = document.getElementById('langPicker');
      if (lp) lp.value = lang;
      const llp = document.getElementById('loginLangPicker');
      if (llp) llp.value = lang;

      // refresh badges texts
      updateBadges();
    }

// Helpers
    // ------------------------------
    const $ = (id) => document.getElementById(id);

    
    function updateBadges() {
      const bot = $('badgeBot');
      const g = $('badgeGuild');
      const a = $('badgeAuth');

      if (bot) {
        const ok = !!state.health?.botOnline;
        bot.className = 'badge ' + (ok ? 'ok' : 'bad');
        bot.textContent = ok ? t('badge_bot_online') : t('badge_bot_offline');
      }

      if (g) {
        const name = state.guildMap?.[state.guildId]?.name || '—';
        g.className = 'badge';
        g.textContent = t('badge_server', { name });
      }

      if (a) {
        const has = !!state.token;
        a.className = 'badge ' + (has ? 'ok' : 'warn');
        a.textContent = has ? t('badge_auth_ok') : t('badge_auth_missing');
      }
    }

function toast(msg, kind = 'info') {
      const node = document.createElement('div');
      node.className = 'toastItem';
      node.innerHTML = `<div class="row" style="justify-content: space-between; gap: 10px;">
        <span>${msg}</span>
        <span class="badge ${kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : kind === 'warn' ? 'warn' : 'info'}">${kind.toUpperCase()}</span>
      </div>`;
      $('toast').appendChild(node);
      setTimeout(() => node.remove(), 4200);
    }

    function headers() {
      const h = {};
      if (state.token) h['x-dashboard-token'] = state.token;
      return h;
    }

    function markUnauthorized() {
      // token exists but backend refused -> likely invalid token
      const a = $('badgeAuth');
      if (a) {
        a.className = 'badge bad';
        a.textContent = state.token ? t('badge_auth_invalid') : t('badge_auth_missing');
      }
    }

    
    async function apiGet(url) {
      const res = await fetch(url, { headers: headers() });
      if (res.status === 401) {
        markUnauthorized();
        throw new Error('UNAUTHORIZED');
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Request failed');
      return json;
    }

    async function apiPost(url, body) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      if (res.status === 401) {
        markUnauthorized();
        throw new Error('UNAUTHORIZED');
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Request failed');
      return json;
    }

function safeDate(iso) {
      if (!iso) return 'N/A';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return 'N/A';
      return d.toLocaleString();
    }

    function uptimeLabel(seconds) {
      const s = Number(seconds || 0);
      if (!Number.isFinite(s) || s < 0) return 'N/A';
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m`;
      return `${s}s`;
    }

    function trustBadge(trust) {
      const t = Number(trust);
      if (!Number.isFinite(t)) return { label: 'trust: N/A', cls: 'info' };
      const low = state.config?.trust?.lowThreshold ?? 10;
      const high = state.config?.trust?.highThreshold ?? 60;
      if (t <= low) return { label: `trust: ${t} (High risk)`, cls: 'bad' };
      if (t >= high) return { label: `trust: ${t} (Low risk)`, cls: 'ok' };
      return { label: `trust: ${t} (Medium risk)`, cls: 'warn' };
    }

    function parseTrustFromText(text) {
      const s = String(text || '');
      const m = s.match(/Trust\s*:\s*\*\*(\d+)/i);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    }

    function selectedGuild() {
      return state.guildId || '';
    }

    function escHtml(s) {
      return String(s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // download helper (blob)
    async function downloadWithAuth(url, filename) {
      const res = await fetch(url, { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      if (!res.ok) {
        toast(t('toast_download_failed'), 'bad');
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
    }

    // ------------------------------
    // Tabs
    // ------------------------------
    function setTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === `tab-${name}`));
      try { localStorage.setItem('ozark.activeTab', name); } catch {}
    }
    $('tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      setTab(t.dataset.tab);

      // lazy load
      if (t.dataset.tab === 'logs') loadLogsPage(1).catch(() => null);
      if (t.dataset.tab === 'cases') loadCasesPage(1).catch(() => null);
      if (t.dataset.tab === 'tickets') loadTicketsPage(1).catch(() => null);
    });

    // ------------------------------
    // Token
    // ------------------------------
    function setDashboardToken(newToken, opts = { reload: true }) {
      const t = (newToken || '').trim();
      if (!t) return;

      state.token = t;
      try {
        localStorage.setItem('DASHBOARD_TOKEN', state.token);
      } catch {
        // ignore
      }

      updateBadges();
      toast(t('toast_token_saved'), 'ok');

      if (opts.reload) {
        // reload para refazer socket + boot limpo
        setTimeout(() => location.reload(), 600);
      }
    }

    // Botão lá de cima: "Set Token" (prompt)
    $('btnToken')?.addEventListener('click', () => {
      const current = state.token || '';
      const t = prompt('Enter DASHBOARD_TOKEN:', current);
      if (!t || !t.trim()) return;
      setDashboardToken(t, { reload: true });
    });

    // Limpar token guardado
    $('btnClearToken')?.addEventListener('click', () => {
      try { localStorage.removeItem('DASHBOARD_TOKEN'); } catch {}
      state.token = '';
      const inp = $('tokenInput');
      if (inp) inp.value = '';
      updateBadges();
      toast(t('toast_token_cleared'), 'info');
    });

    // Campo de baixo: input + "Guardar token"
    $('btnSaveToken')?.addEventListener('click', () => {
      const inp = $('tokenInput');
      if (!inp) return;
      const t = (inp.value || '').trim();
      if (!t) {
        toast(t('toast_paste_token'), 'bad');
        return;
      }
      setDashboardToken(t, { reload: true });
    });

    // Pré-encher o input se já houver token no browser
    (function initTokenField() {
      const inp = $('tokenInput');
      if (inp && state.token) {
        inp.value = state.token;
      }
      updateBadges();
    })();

    // ------------------------------
    // Guilds
    // ------------------------------
    async function loadGuilds() {
      const res = await fetch('/api/guilds', { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      const json = await res.json();
      state.guilds = Array.isArray(json.items) ? json.items : [];
      const sel = $('guildPicker');
      const cur = sel.value;
      sel.innerHTML = '<option value="">Todos os servidores</option>';
      state.guildMap = {};
      for (const g of state.guilds) state.guildMap[g.id] = g;
      for (const g of state.guilds) {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        sel.appendChild(opt);
      }
      if (cur) sel.value = cur;
      $('kpiGuilds').textContent = String(state.guilds.length);
    }

    $('guildPicker').addEventListener('change', async () => {
      state.guildId = $('guildPicker').value;

      // Reset paginations on guild change
      state.logs.page = 1;
      state.cases.page = 1;

      // user tab depends on guild
      $('userStatus').textContent = state.guildId ? 'Servidor selecionado' : 'Seleciona um servidor';

      // Refresh current tab data
      await loadLogsPage(1).catch(() => null);
      await loadCasesPage(1).catch(() => null);
      renderFeeds();
      await loadGuildConfigUI().catch(() => null);
      updateBadges();
      await loadKpis().catch(() => null);
      await loadTimeline().catch(() => null);
    });

    // ------------------------------
    // Health
    // ------------------------------
    async function refreshHealth() {
      try {
        const res = await fetch('/health');
        const data = await res.json();
        state.health = data;
        const ok = !!data.ok;
        $('healthBadge').textContent = ok ? 'OK' : 'ISSUES';
        $('healthBadge').className = `badge ${ok ? 'ok' : 'bad'}`;

        $('healthDiscord').textContent = `Discord: ${data.discordReady ? 'ready' : 'not ready'}`;
        $('healthDiscord').className = `badge ${data.discordReady ? 'ok' : 'bad'}`;

        $('healthMongo').textContent = `Mongo: ${data.mongoConnected ? 'connected' : 'disconnected'}`;
        $('healthMongo').className = `badge ${data.mongoConnected ? 'ok' : 'bad'}`;

        $('healthGameNews').textContent = `GameNews: ${data.gameNewsRunning ? 'running' : 'stopped'}`;
        $('healthGameNews').className = `badge ${data.gameNewsRunning ? 'ok' : 'warn'}`;

        $('healthUptime').textContent = `Uptime: ${uptimeLabel(data.uptimeSeconds)}`;
        updateBadges();
      } catch (e) {
        $('healthBadge').textContent = 'ERROR';
        $('healthBadge').className = 'badge bad';
      }
    }
    $('btnHealth').addEventListener('click', refreshHealth);
    $('btnKpi')?.addEventListener('click', loadKpis);
    $('btnTimeline')?.addEventListener('click', loadTimeline);

    // ------------------------------
    // Config
    // ------------------------------
    function renderConfigBadges() {
      const c = state.config;
      if (!c) return;
      $('cfgLang').textContent = `language: ${c.language || 'n/a'}`;
      $('cfgLang').className = 'badge info';

      const tr = c.trust?.enabled ? 'on' : 'off';
      $('cfgTrust').textContent = `trust: ${tr}`;
      $('cfgTrust').className = `badge ${c.trust?.enabled ? 'ok' : 'warn'}`;

      const as = c.antiSpam?.enabled ? 'on' : 'off';
      $('cfgAntiSpam').textContent = `antiSpam: ${as}`;
      $('cfgAntiSpam').className = `badge ${c.antiSpam?.enabled ? 'ok' : 'warn'}`;

      const sl = c.slash?.enabled ? 'on' : 'off';
      $('cfgSlash').textContent = `slash: ${sl}`;
      $('cfgSlash').className = `badge ${c.slash?.enabled ? 'ok' : 'warn'}`;
    }

    async function loadConfig() {
      const res = await fetch('/api/config', { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        toast('Failed to load config.', 'bad');
        return;
      }
      state.config = json.config;
      state.schema = json.schema;
      $('cfgView').value = JSON.stringify(json.config, null, 2);
      renderConfigBadges();
      $('cfgAllowedHint').innerHTML = `Allowed: <span class="mono">${(json.schema?.allowedPaths || []).join(', ')}</span>`;
    }

    async function saveConfigPatch() {
      let patch = null;
      try {
        patch = JSON.parse($('cfgPatch').value || '{}');
      } catch {
        toast('Patch JSON invalid.', 'bad');
        return;
      }

      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify(patch)
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast(json.error || 'Failed saving config.', 'bad');
        return;
      }

      state.config = json.config;
      $('cfgView').value = JSON.stringify(state.config, null, 2);
      renderConfigBadges();
      toast(`Config saved. Applied: ${json.applied?.length || 0}`, 'ok');
    }

    $('btnLoadConfig').addEventListener('click', loadConfig);
    $('btnSaveConfig').addEventListener('click', saveConfigPatch);

    // ------------------------------
    // Definições do Servidor (canais de logs)
    // ------------------------------
    async function loadGuildMeta() {
      if (!state.guildId) {
        toast('Seleciona um servidor no topo.', 'bad');
        return { channels: [], roles: [] };
      }
      const json = await apiGet(`/api/guilds/${state.guildId}/meta`);
      return {
        channels: Array.isArray(json.channels) ? json.channels : [],
        roles: Array.isArray(json.roles) ? json.roles : []
      };
    }

    function fillChannelSelect(selectEl, items, selectedId, labelNone) {
      if (!selectEl) return;
      selectEl.innerHTML = '';
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = labelNone || '— Nenhum —';
      selectEl.appendChild(opt0);

      (items || []).forEach((it) => {
        const opt = document.createElement('option');
        opt.value = it.id;
        opt.textContent = `#${it.name}`;
        if (selectedId && String(selectedId) === String(it.id)) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }

    function fillRoleMultiSelect(selectEl, roles, selectedIds) {
      if (!selectEl) return;
      const selected = new Set((selectedIds || []).map((x) => String(x)));
      selectEl.innerHTML = '';
      (roles || []).forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        if (selected.has(String(r.id))) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }

    async function loadGuildConfigUI() {
      try {
        if (!state.guildId) {
          toast('Seleciona um servidor no topo.', 'bad');
          return;
        }
        $('guildConfigStatus').textContent = 'A carregar...';

        const [meta, cfg] = await Promise.all([
          loadGuildMeta(),
          apiGet(`/api/guilds/${state.guildId}/config`)
        ]);

        fillChannelSelect($('selLogChannel'), meta.channels, cfg?.config?.logChannelId, '— Usa default (log-bot) —');
        fillChannelSelect($('selDashboardLogChannel'), meta.channels, cfg?.config?.dashboardLogChannelId, '— Usa automático (dashboard-logs) —');
        fillRoleMultiSelect($('selStaffRoles'), meta.roles, cfg?.config?.staffRoleIds || []);

        $('guildConfigStatus').textContent = 'Definições carregadas.';
        updateBadges();
      } catch (e) {
        $('guildConfigStatus').textContent = '';
        if (String(e.message || '').includes('UNAUTHORIZED')) return toast(t('toast_unauthorized_set_token'), 'bad');
        toast(`Erro a carregar: ${e.message || e}`, 'bad');
      }
    }

    async function saveGuildConfigUI() {
      try {
        if (!state.guildId) {
          toast('Seleciona um servidor no topo.', 'bad');
          return;
        }

        const body = {
          logChannelId: $('selLogChannel')?.value || null,
          dashboardLogChannelId: $('selDashboardLogChannel')?.value || null,
          staffRoleIds: Array.from($('selStaffRoles')?.selectedOptions || []).map(o => o.value)
        };

        $('guildConfigStatus').textContent = 'A guardar...';
        await apiPost(`/api/guilds/${state.guildId}/config`, body);
        $('guildConfigStatus').textContent = 'Definições guardadas.';
        toast('Servidor atualizado.', 'ok');
        updateBadges();
      } catch (e) {
        $('guildConfigStatus').textContent = '';
        if (String(e.message || '').includes('UNAUTHORIZED')) return toast(t('toast_unauthorized_set_token'), 'bad');
        toast(`Erro a guardar: ${e.message || e}`, 'bad');
      }
    }

    
    async function testGuildLogsUI() {
      try {
        if (!state.guildId) {
          toast('Seleciona um servidor no topo.', 'bad');
          return;
        }

        $('logChannelTestStatus').textContent = 'A testar...';
        $('dashLogChannelTestStatus').textContent = 'A testar...';

        const body = {
          logChannelId: $('selLogChannel')?.value || null,
          dashboardLogChannelId: $('selDashboardLogChannel')?.value || null
        };

        const json = await apiPost(`/api/guilds/${state.guildId}/test-log-channels`, body);
        const results = Array.isArray(json.results) ? json.results : [];

        const botRes = results.find(r => r.label === 'Canal de logs do bot') || null;
        const dashRes = results.find(r => r.label === 'Canal de logs do dashboard') || null;

        function setStatus(el, r) {
          if (!el) return;
          if (!r) { el.textContent = ''; return; }
          if (r.ok) {
            el.textContent = '✅ OK — mensagem enviada.';
          } else {
            el.textContent = `❌ Falhou — ${r.error || 'sem detalhe'}`;
          }
        }

        setStatus($('logChannelTestStatus'), botRes);
        setStatus($('dashLogChannelTestStatus'), dashRes);

        toast('Teste concluído.', 'ok');
      } catch (e) {
        $('logChannelTestStatus').textContent = '';
        $('dashLogChannelTestStatus').textContent = '';
        if (String(e.message || '').includes('UNAUTHORIZED')) return toast(t('toast_unauthorized_set_token'), 'bad');
        toast(`Erro no teste: ${e.message || e}`, 'bad');
      }
    }

$('btnLoadGuildConfig')?.addEventListener('click', loadGuildConfigUI);
    $('btnSaveGuildConfig')?.addEventListener('click', saveGuildConfigUI);
    $('btnTestGuildLogs')?.addEventListener('click', testGuildLogsUI);


    // ------------------------------
    
    // ------------------------------
    // KPIs + Timeline
    // ------------------------------
    function parseIso(s) {
      try { return new Date(s).getTime(); } catch { return 0; }
    }

    async function loadKpis() {
      try {
        // fetch a big page of logs for last 24h then count in browser (simple and reliable)
        const guildId = state.guildId || '';
        const json = await apiGet(`/api/logs?limit=200&page=1${guildId ? `&guildId=${encodeURIComponent(guildId)}` : ''}`);
        const items = Array.isArray(json.items) ? json.items : [];

        const since = Date.now() - 24 * 60 * 60 * 1000;

        let warn=0, mute=0, unmute=0, dash=0;
        for (const it of items) {
          const t = parseIso(it.time || it.createdAt || '');
          if (t && t < since) continue;

          const title = String(it.title || '').toLowerCase();
          if (title.includes('warn')) warn++;
          if (title.includes('mute') && !title.includes('unmute')) mute++;
          if (title.includes('unmute')) unmute++;
          if (title.includes('dashboard')) dash++;
        }

        $('kpiWarn').textContent = String(warn);
        $('kpiMute').textContent = String(mute);
        $('kpiUnmute').textContent = String(unmute);
        $('kpiDashboard').textContent = String(dash);
      } catch (e) {
        // ignore noisy errors
      }
    }

    function renderTimeline(items) {
      const wrap = $('timelineList');
      if (!wrap) return;
      if (!items || !items.length) {
        wrap.innerHTML = '<div class="hint">Sem eventos recentes.</div>';
        return;
      }

      wrap.innerHTML = '';
      for (const it of items.slice(0, 15)) {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'flex-start';
        row.style.borderBottom = '1px solid var(--border)';
        row.style.padding = '10px 0';

        const left = document.createElement('div');
        left.style.flex = '1';

        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.textContent = it.title || '—';

        const desc = document.createElement('div');
        desc.className = 'hint';
        desc.textContent = (it.description || '').slice(0, 140);

        left.appendChild(title);
        left.appendChild(desc);

        const right = document.createElement('div');
        right.style.minWidth = '160px';
        right.style.textAlign = 'right';

        const when = document.createElement('div');
        when.className = 'hint';
        when.textContent = safeDate(it.time || it.createdAt);

        const who = document.createElement('div');
        who.className = 'hint';
        const ex = it.executor?.tag ? `por ${it.executor.tag}` : '';
        who.textContent = ex;

        right.appendChild(when);
        right.appendChild(who);

        row.appendChild(left);
        row.appendChild(right);
        wrap.appendChild(row);
      }
    }

    async function loadTimeline() {
      try {
        const guildId = state.guildId || '';
        const type = ($('timelineType')?.value || '').trim().toLowerCase();
        const json = await apiGet(`/api/logs?limit=100&page=1${guildId ? `&guildId=${encodeURIComponent(guildId)}` : ''}${type ? `&type=${encodeURIComponent(type)}` : ''}`);
        const items = Array.isArray(json.items) ? json.items : [];
        renderTimeline(items);
      } catch (e) {
        // ignore
      }
    }

// Logs (Server-side pagination)
    // ------------------------------
    function logColor(title) {
      const t = String(title || '').toLowerCase();
      if (t.includes('warn')) return 'warn';
      if (t.includes('mute')) return 'bad';
      if (t.includes('unmute')) return 'ok';
      if (t.includes('clear')) return 'info';
      if (t.includes('anti-spam')) return 'warn';
      if (t.includes('game news')) return 'info';
      return 'info';
    }

    function renderLogs(items) {
      const list = $('logsList');
      list.innerHTML = '';

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'card';
        empty.innerHTML = `<h2>No logs</h2><div class="hint">Sem logs para o filtro atual.</div>`;
        list.appendChild(empty);
        return;
      }

      for (const log of items) {
        const div = document.createElement('div');
        div.className = 'logItem';
        const trust = parseTrustFromText(log.description);
        const tb = trust != null ? trustBadge(trust) : null;

        const userTag = log.user?.tag || log.user || 'N/A';
        const execTag = log.executor?.tag || log.executor || 'N/A';
        const guild = log.guild?.name ? `${log.guild.name}` : (log.guild?.id ? log.guild.id : '');

        div.innerHTML = `
          <div class="logHead">
            <div class="logTitle">
              <span class="badge ${logColor(log.title)}">${escHtml(log.title || 'Log')}</span>
              ${tb ? `<span class="badge ${tb.cls}">${escHtml(tb.label)}</span>` : ''}
              ${guild ? `<span class="badge">${escHtml(guild)}</span>` : ''}
            </div>
            <div class="mono">${safeDate(log.time || log.createdAt || log.timestamp || Date.now())}</div>
          </div>
          <div class="logDesc">${escHtml(log.description || '')}</div>
          <div class="logMeta">👤 ${escHtml(userTag)} • 🛠 ${escHtml(execTag)}</div>
        `;
        list.appendChild(div);
      }
    }

    function updateLogsPagerUI() {
      const p = state.logs.page;
      const lim = state.logs.limit;
      const total = state.logs.total;

      const maxPage = Math.max(Math.ceil(total / lim) || 1, 1);

      $('logsPageBadge').textContent = `Page ${p} / ${maxPage}`;
      $('logsTotalBadge').textContent = `Total: ${total}`;
      $('btnPrevLogs').disabled = p <= 1;
      $('btnNextLogs').disabled = p >= maxPage;

      $('kpiLogs').textContent = String(state.logs.items.length);
    }

    function buildLogsUrl(page) {
      const gid = selectedGuild();
      const search = ($('logSearch').value || '').trim();
      const type = ($('logType').value || '').trim();
      const limit = parseInt($('logLimit').value || '50', 10) || 50;

      state.logs.limit = Math.min(Math.max(limit, 1), 200);

      const url = new URL('/api/logs', location.origin);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(state.logs.limit));
      if (gid) url.searchParams.set('guildId', gid);
      if (search) url.searchParams.set('search', search);
      if (type) url.searchParams.set('type', type);
      return url;
    }

    async function loadLogsPage(page) {
      const url = buildLogsUrl(page);
      const res = await fetch(url.toString(), { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast(json.error || 'Failed to load logs.', 'bad');
        return;
      }

      state.logs.page = page;
      state.logs.total = Number(json.total ?? 0) || 0;
      state.logs.items = Array.isArray(json.items) ? json.items : [];

      renderLogs(state.logs.items);
      updateLogsPagerUI();
    }

    async function exportLogsCsv() {
      const url = buildLogsUrl(state.logs.page);
      url.pathname = '/api/logs/export.csv';
      await downloadWithAuth(url.toString(), 'ozark-logs.csv');
    }

    $('btnReloadLogs').addEventListener('click', () => loadLogsPage(1).catch(() => null));
    $('btnExportCsv').addEventListener('click', () => exportLogsCsv().catch(() => null));

    $('logSearch').addEventListener('input', () => {
      // debounce-ish: quick reset to page 1
      clearTimeout(window.__logSearchT);
      window.__logSearchT = setTimeout(() => loadLogsPage(1).catch(() => null), 250);
    });
    $('logType').addEventListener('change', () => loadLogsPage(1).catch(() => null));
    $('logLimit').addEventListener('change', () => loadLogsPage(1).catch(() => null));

    $('btnPrevLogs').addEventListener('click', () => loadLogsPage(Math.max(state.logs.page - 1, 1)).catch(() => null));
    $('btnNextLogs').addEventListener('click', () => loadLogsPage(state.logs.page + 1).catch(() => null));

    // ------------------------------
    // Cases (Server-side pagination)
    // ------------------------------
    function caseTypeBadge(type) {
      const t = String(type || '').toUpperCase();
      if (t === 'MUTE' || t === 'BAN') return 'bad';
      if (t === 'WARN') return 'warn';
      return 'info';
    }

    function updateCasesPagerUI() {
      const p = state.cases.page;
      const lim = state.cases.limit;
      const total = state.cases.total;

      const maxPage = Math.max(Math.ceil(total / lim) || 1, 1);

      $('casesPageBadge').textContent = `Page ${p} / ${maxPage}`;
      $('casesTotalBadge').textContent = `Total: ${total}`;
      $('btnPrevCases').disabled = p <= 1;
      $('btnNextCases').disabled = p >= maxPage;
    }

    function buildCasesUrl(page) {
      const guildId = selectedGuild();
      const q = ($('casesQ').value || '').trim();
      const userId = ($('casesUserId').value || '').trim();
      const type = ($('casesType').value || '').trim();
      const source = ($('casesSource')?.value || '').trim();
      const limit = parseInt($('casesLimit').value || '25', 10) || 25;

      state.cases.limit = Math.min(Math.max(limit, 1), 100);

      const url = new URL('/api/cases', location.origin);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(state.cases.limit));
      if (guildId) url.searchParams.set('guildId', guildId);
      if (q) url.searchParams.set('q', q);
      if (userId) url.searchParams.set('userId', userId);
      if (type) url.searchParams.set('type', type);
      if (source) url.searchParams.set('source', source);
      return url;
    }

    function renderCases(items) {
      const list = $('casesList');
      list.innerHTML = '';

      const gid = selectedGuild();
      if (!gid) {
        const empty = document.createElement('div');
        empty.className = 'card';
        empty.innerHTML = `<h2>' + t('select_a_guild') + '</h2><div class="hint">Seleciona uma guild no topo para pesquisar cases.</div>`;
        list.appendChild(empty);
        return;
      }

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'card';
        empty.innerHTML = `<h2>No cases</h2><div class="hint">Sem cases para o filtro atual.</div>`;
        list.appendChild(empty);
        return;
      }

      for (const c of items) {
        const div = document.createElement('div');
        div.className = 'logItem';

        const typeCls = caseTypeBadge(c.type);
        const caseId = c.caseId != null ? `#${c.caseId}` : '(no caseId)';
        const reason = escHtml(c.reason || '');
        const userId = escHtml(c.userId || '');
        const modId = escHtml(c.moderatorId || '');
        const source = escHtml(c.source || 'unknown');

        div.innerHTML = `
          <div class="logHead">
            <div class="logTitle">
              <span class="badge info">Case ${escHtml(caseId)}</span>
              <span class="badge ${typeCls}">${escHtml(c.type || 'N/A')}</span>
              <span class="badge">source: <span class="mono">${source}</span></span>
              <span class="badge">user: <span class="mono">${userId}</span></span>
            </div>
            <div class="mono">${safeDate(c.createdAt)}</div>
          </div>
          <div class="logDesc">${reason}</div>
          <div class="logMeta">🛠 moderatorId: <span class="mono">${modId}</span></div>
        `;

        div.addEventListener('click', () => openCaseModal(c.caseId).catch(() => null));
        list.appendChild(div);
      }
    }

    async function loadCasesPage(page) {
      const gid = selectedGuild();
      if (!gid) {
        // still render empty prompt
        state.cases.items = [];
        state.cases.total = 0;
        renderCases([]);
        updateCasesPagerUI();
        return;
      }

      const url = buildCasesUrl(page);
      const res = await fetch(url.toString(), { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast(json.error || 'Failed to load cases.', 'bad');
        return;
      }

      state.cases.page = page;
      state.cases.total = Number(json.total ?? 0) || 0;
      state.cases.items = Array.isArray(json.items) ? json.items : [];

      renderCases(state.cases.items);
      updateCasesPagerUI();
    }

        $('btnReloadCases').addEventListener('click', () => loadCasesPage(1).catch(() => null));
    $('casesQ').addEventListener('input', () => {
      clearTimeout(window.__casesSearchT);
      window.__casesSearchT = setTimeout(() => loadCasesPage(1).catch(() => null), 250);
    });
    $('casesUserId').addEventListener('input', () => {
      clearTimeout(window.__casesUserT);
      window.__casesUserT = setTimeout(() => loadCasesPage(1).catch(() => null), 250);
    });
    $('casesType').addEventListener('change', () => loadCasesPage(1).catch(() => null));
    $('casesSource')?.addEventListener('change', () => loadCasesPage(1).catch(() => null));
    $('casesLimit').addEventListener('change', () => loadCasesPage(1).catch(() => null));
    $('btnPrevCases').addEventListener('click', () => loadCasesPage(Math.max(state.cases.page - 1, 1)).catch(() => null));
    $('btnNextCases').addEventListener('click', () => loadCasesPage(state.cases.page + 1).catch(() => null));

    // ------------------------------
    // Case details modal
    // ------------------------------
    // Case details modal
    // ------------------------------
    const caseModal = {
      current: null
    };

    async function openCaseModal(caseId) {
      const gid = selectedGuild();
      if (!gid) return;

      const id = parseInt(String(caseId), 10);
      if (!Number.isFinite(id) || id <= 0) return;

      $('caseBadge').textContent = 'Case';
      $('caseTitle').textContent = `#${id}`;
      $('caseBody').innerHTML = `<div class="hint">Loading…</div>`;
      $('caseOverlay').classList.add('show');

      const url = new URL('/api/case', location.origin);
      url.searchParams.set('guildId', gid);
      url.searchParams.set('caseId', String(id));

      const res = await fetch(url.toString(), { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        closeCaseModal();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast(json.error || 'Failed loading case.', 'bad');
        closeCaseModal();
        return;
      }

      caseModal.current = json.item;

      const item = json.item || {};
      const typeCls = caseTypeBadge(item.type);
      const dur = item.duration ? `${Math.round(Number(item.duration)/1000)}s` : 'N/A';

      $('caseBody').innerHTML = `
        <div class="row" style="justify-content: space-between;">
          <div class="row" style="gap: 10px;">
            <span class="badge info">Case #${escHtml(item.caseId)}</span>
            <span class="badge ${typeCls}">${escHtml(item.type)}</span>
          </div>
          <span class="badge info">${escHtml(safeDate(item.createdAt))}</span>
        </div>

        <div style="height: 10px;"></div>

        <div class="card" style="background: rgba(0,0,0,0.20);">
          <div class="hint">User</div>
          <div class="mono">${escHtml(item.userTag || item.userId || 'N/A')} (${escHtml(item.userId || '')})</div>

          <div style="height: 10px;"></div>

          <div class="hint">Moderator</div>
          <div class="mono">${escHtml(item.moderatorTag || item.moderatorId || 'N/A')} (${escHtml(item.moderatorId || '')})</div>

          <div style="height: 10px;"></div>

          <div class="hint">Duration</div>
          <div class="mono">${escHtml(dur)}</div>

          <div style="height: 10px;"></div>

          <div class="hint">Reason</div>
          <div class="mono">${escHtml(item.reason || '')}</div>
        </div>

        <div class="hint" style="margin-top: 10px;">
          guildId: <span class="mono">${escHtml(item.guildId || '')}</span>
        </div>
      `;
    }

    function closeCaseModal() {
      $('caseOverlay').classList.remove('show');
    }

    $('caseClose').addEventListener('click', closeCaseModal);
    $('caseClose2').addEventListener('click', closeCaseModal);
    $('caseOverlay').addEventListener('click', (e) => { if (e.target === $('caseOverlay')) closeCaseModal(); });

    $('caseCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(caseModal.current || {}, null, 2));
        toast('Case JSON copied.', 'ok');
      } catch {
        toast('Failed to copy.', 'bad');
      }
    });

    // ------------------------------
    // GameNews
    // ------------------------------
    function computePaused(f) {
      if (!f.pausedUntil) return false;
      const d = new Date(f.pausedUntil);
      if (Number.isNaN(d.getTime())) return false;
      return d.getTime() > Date.now();
    }

    function renderFeeds() {
      const grid = $('feedsGrid');
      const pausedOnly = $('feedsPausedOnly').value === '1';

      const normalized = (state.feeds || []).map(f => ({
        source: f.source || f.feedName || 'Unknown',
        feedName: f.feedName || f.source || 'Unknown',
        feedUrl: f.feedUrl || null,
        channelId: f.channelId || null,
        failCount: Number(f.failCount ?? 0),
        pausedUntil: f.pausedUntil || null,
        lastSentAt: f.lastSentAt || null,
        lastHashesCount: Number(f.lastHashesCount ?? 0),
        paused: computePaused(f),
        updatedAt: f.updatedAt || null
      }));

      const filtered = pausedOnly ? normalized.filter(x => x.paused) : normalized;
      filtered.sort((a,b) => (a.paused !== b.paused) ? (a.paused ? -1 : 1) : b.failCount - a.failCount);

      const total = normalized.length;
      const pausedCount = normalized.filter(x => x.paused).length;
      $('kpiFeeds').textContent = String(total);
      $('feedsSummary').textContent = `Feeds: ${total} • Paused: ${pausedCount}`;
      $('feedsSummary').className = `badge ${pausedCount ? 'warn' : 'ok'}`;

      grid.innerHTML = '';
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'card';
        empty.innerHTML = `<h2>No feeds</h2><div class="hint">Sem dados de status.</div>`;
        grid.appendChild(empty);
        return;
      }

      for (const f of filtered) {
        const card = document.createElement('div');
        card.className = 'card';
        const statusCls = f.paused ? 'warn' : (f.failCount > 0 ? 'bad' : 'ok');
        const statusText = f.paused ? 'PAUSED' : (f.failCount > 0 ? 'WARN' : 'OK');

        card.innerHTML = `
          <div class="row" style="justify-content: space-between;">
            <h2 style="margin:0;">${escHtml(f.feedName)}</h2>
            <span class="badge ${statusCls}">${escHtml(statusText)}</span>
          </div>
          <div class="hint"><span class="mono">source:</span> <span class="mono">${escHtml(f.source)}</span></div>
          ${f.feedUrl ? `<div class="hint"><span class="mono">feedUrl:</span> <span class="mono">${escHtml(f.feedUrl)}</span></div>` : ''}
          ${f.channelId ? `<div class="hint"><span class="mono">channelId:</span> <span class="mono">${escHtml(f.channelId)}</span></div>` : ''}
          <div class="row" style="margin-top: 10px;">
            <span class="badge">failCount: ${escHtml(String(f.failCount))}</span>
            <span class="badge">lastHashes: ${escHtml(String(f.lastHashesCount))}</span>
          </div>
          <div class="hint" style="margin-top: 10px;">lastSentAt: <b>${escHtml(safeDate(f.lastSentAt))}</b></div>
          <div class="hint">pausedUntil: <b>${escHtml(safeDate(f.pausedUntil))}</b></div>
        `;

        grid.appendChild(card);
      }
    }

    async function loadFeeds() {
      const res = await fetch('/api/gamenews-status', { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        toast('Failed to load GameNews.', 'bad');
        return;
      }
      state.feeds = Array.isArray(json.items) ? json.items : [];
      renderFeeds();
    }
    $('btnReloadFeeds').addEventListener('click', loadFeeds);
    $('feedsPausedOnly').addEventListener('change', renderFeeds);

    // ------------------------------
    // User Inspector
    // ------------------------------
    function renderUser() {
      const card = $('userCard');
      const list = $('userInfractions');
      const hint = $('userInfHint');

      if (!state.user) {
        card.innerHTML = `<h2>User Summary</h2><div class="hint">Carrega um utilizador para ver detalhes.</div>`;
        list.innerHTML = '';
        hint.textContent = 'Nenhum dado.';
        return;
      }

      const u = state.user;
      const d = u.discord || {};
      const db = u.db || {};
      const tb = trustBadge(db.trust);

      const avatar = d.avatarUrl ? `<img src="${escHtml(d.avatarUrl)}" width="52" height="52" style="border-radius: 16px; border: 1px solid var(--border);"/>` : '';

      card.innerHTML = `
        <div class="row" style="justify-content: space-between; align-items: flex-start;">
          <div class="row" style="align-items:center;">
            ${avatar}
            <div>
              <div style="font-weight: 800; font-size: 14px;">${escHtml(d.tag || d.username || d.id)}</div>
              <div class="hint">ID: <span class="mono">${escHtml(d.id)}</span></div>
            </div>
          </div>
          <div class="row">
            <span class="badge ${tb.cls}">${escHtml(tb.label)}</span>
            <span class="badge">warnings: ${escHtml(String(db.warnings ?? 0))}</span>
          </div>
        </div>

        <div class="row" style="margin-top: 10px;">
          <span class="badge info">created: ${escHtml(safeDate(d.createdAt))}</span>
          <span class="badge info">joined: ${escHtml(safeDate(d.joinedAt))}</span>
        </div>

        <div class="hint" style="margin-top: 10px;">Roles (${(d.roles || []).length}): ${(d.roles || []).slice(0,6).map(r => `<span class="mono">${escHtml(r.name)}</span>`).join(', ')}${(d.roles||[]).length>6?'…':''}</div>

        <div style="height: 10px;"></div>
        <div class="row">
          <button class="btn-primary" id="actWarn">Warn</button>
          <button class="btn-primary" id="actMute">Mute</button>
          <button id="actUnmute">Unmute</button>
        </div>
      `;

      // Infractions
      const infra = Array.isArray(u.infractions) ? u.infractions : [];
      hint.textContent = infra.length ? '' : 'Sem infrações recentes.';
      list.innerHTML = '';

      for (const inf of infra) {
        const div = document.createElement('div');
        div.className = 'logItem';
        const cls = inf.type === 'MUTE' ? 'bad' : inf.type === 'WARN' ? 'warn' : 'info';
        div.innerHTML = `
          <div class="logHead">
            <div class="logTitle">
              <span class="badge ${cls}">${escHtml(inf.type)}</span>
              ${inf.caseId != null ? `<span class="badge info">Case #${escHtml(String(inf.caseId))}</span>` : ''}
              ${inf.duration ? `<span class="badge">duration: ${escHtml(String(Math.round(inf.duration/1000)))}s</span>` : ''}
            </div>
            <div class="mono">${escHtml(safeDate(inf.createdAt || inf.time))}</div>
          </div>
          <div class="logDesc">${escHtml(String(inf.reason || ''))}</div>
        `;
        list.appendChild(div);
      }

      // action bindings
      $('actWarn').addEventListener('click', () => openActionModal('warn'));
      $('actMute').addEventListener('click', () => openActionModal('mute'));
      $('actUnmute').addEventListener('click', () => openActionModal('unmute'));
    }

    async function loadUser() {
      const guildId = selectedGuild();
      const userId = ($('userId').value || '').trim();
      const limit = Number($('userInfLimit').value || 10);

      if (!guildId) {
        toast('Seleciona um servidor primeiro.', 'warn');
        return;
      }
      if (!userId) {
        toast('Tens de colocar o ID do utilizador.', 'warn');
        return;
      }

      const url = new URL('/api/user', location.origin);
      url.searchParams.set('guildId', guildId);
      url.searchParams.set('userId', userId);
      url.searchParams.set('limit', String(limit));

      const res = await fetch(url.toString(), { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        toast(json.error || 'Failed to load user.', 'bad');
        return;
      }
      state.user = json;
      $('userStatus').textContent = 'User loaded';
      $('userStatus').className = 'badge ok';
      renderUser();
    }

    $('btnLoadUser').addEventListener('click', loadUser);
    $('userInfLimit').addEventListener('change', () => { if (state.user) loadUser(); });

    // ------------------------------
    // Modal Actions (confirm + preview)
    // ------------------------------
    const modal = {
      type: null
    };

    function openActionModal(type) {
      if (!state.user) return;
      modal.type = type;
      const guildId = selectedGuild();
      const userId = state.user.discord?.id || $('userId').value.trim();

      $('modalType').textContent = type.toUpperCase();
      $('modalTarget').textContent = `Servidor: ${guildId} • Utilizador: ${userId}`;
      $('modalReason').value = '';
      $('modalDuration').value = '';
      $('modalDuration').style.display = type === 'mute' ? 'block' : 'none';
      $('durationPresets').style.display = type === 'mute' ? 'flex' : 'none';

      updatePreview();
      $('overlay').classList.add('show');
      $('modalReason').focus();
    }

    function closeModal() {
      $('overlay').classList.remove('show');
    }

    function updatePreview() {
      const type = modal.type;
      const guildId = selectedGuild();
      const u = state.user?.discord;
      const reason = ($('modalReason').value || '').trim() || '(no reason)';
      const duration = ($('modalDuration').value || '').trim();

      let lines = [];
      lines.push(`<div class="row" style="justify-content: space-between;">
        <h2 style="margin:0;">Preview</h2>
        <span class="badge info">${escHtml(type?.toUpperCase())}</span>
      </div>`);
      lines.push(`<div class="hint">Guild: <span class="mono">${escHtml(guildId || 'N/A')}</span></div>`);
      lines.push(`<div class="hint">User: <span class="mono">${escHtml(u?.tag || u?.id || 'N/A')}</span></div>`);
      if (type === 'mute') lines.push(`<div class="hint">Duration: <span class="mono">${escHtml(duration || 'default')}</span></div>`);
      lines.push(`<div class="hint">Reason: <span class="mono">${escHtml(reason)}</span></div>`);
      $('modalPreview').innerHTML = lines.join('');
    }

    $('modalReason').addEventListener('input', updatePreview);
    $('modalDuration').addEventListener('input', updatePreview);

    // duration preset buttons
    $('durationPresets').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-dur]');
      if (!btn) return;
      $('modalDuration').value = btn.dataset.dur;
      updatePreview();
      $('modalDuration').focus();
    });

    $('modalClose').addEventListener('click', closeModal);
    $('modalCancel').addEventListener('click', closeModal);
    $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeModal(); });

    async function confirmAction() {
      const type = modal.type;
      const guildId = selectedGuild();
      const userId = state.user?.discord?.id || $('userId').value.trim();
      const reason = ($('modalReason').value || '').trim();
      const duration = ($('modalDuration').value || '').trim();

      if (!guildId || !userId) {
        toast('Missing guild/user.', 'bad');
        return;
      }

      const body = { guildId, userId };
      if (reason) body.reason = reason;
      if (type === 'mute' && duration) body.duration = duration;

      const res = await fetch(`/api/mod/${type}`, {
        method: 'POST',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast(json.error || `Failed ${type}.`, 'bad');
        return;
      }

      toast(`${type.toUpperCase()} executed.`, 'ok');
      closeModal();

      // refresh user + logs + cases (because actions create infractions)
      await loadUser().catch(() => null);
      await loadLogsPage(1).catch(() => null);
      await loadCasesPage(1).catch(() => null);
    }

    $('modalConfirm').addEventListener('click', confirmAction);

    // ------------------------------
    // Socket
    // ------------------------------
    const socket = io({
      auth: state.token ? { token: state.token } : {}
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    // Keep these for realtime feel (doesn't override paginated views)
    socket.on('gamenews_status', async (feeds) => {
      state.feeds = Array.isArray(feeds) ? feeds : [];
      renderFeeds();
      try {
        await loadKpis().catch(() => null);
        await loadTimeline().catch(() => null);
      } catch {
        // ignore
      }
    });

    socket.on('config', (cfg) => {
      state.config = cfg;
      renderConfigBadges();
      if (document.activeElement !== $('cfgView')) {
        $('cfgView').value = JSON.stringify(cfg, null, 2);
      }
    });

    // ------------------------------
    // Boot
    // ------------------------------
    async function boot() {
      await loadGuilds().catch(() => null);
      updateBadges();
      await loadConfig().catch(() => null);
      await loadLogsPage(1).catch(() => null);
      await loadCasesPage(1).catch(() => null);
      await loadFeeds().catch(() => null);
      await refreshHealth().catch(() => null);
      await loadKpis().catch(() => null);
      await loadTimeline().catch(() => null);

      // init dropdowns default values into state
      state.logs.limit = parseInt($('logLimit').value || '50', 10) || 50;
      state.cases.limit = parseInt($('casesLimit').value || '25', 10) || 25;
      state.tickets.limit = parseInt($('ticketsLimit').value || '25', 10) || 25;
    }

    $('btnReloadAll').addEventListener('click', boot);
    // ------------------------------
    // Init
    // ------------------------------
    (function initDashboard() {
      // restore last tab
      try {
        const last = localStorage.getItem('ozark.activeTab') || 'overview';
        setTab(last);
      } catch {
        setTab('overview');
      }

      // auto boot if token exists
      if (state.token) {
        boot();
      } else {
        updateBadges();
      }
    })();


    // ------------------------------
    // Tickets
    // ------------------------------
    function updateTicketsPagerUI() {
      const p = state.tickets.page || 1;
      const total = state.tickets.total || 0;
      const limit = state.tickets.limit || 25;
      const maxPage = total > 0 ? Math.ceil(total / limit) : 1;
      const pageBadge = document.getElementById('ticketsPageBadge');
      const totalBadge = document.getElementById('ticketsTotalBadge');
      if (pageBadge) pageBadge.textContent = t('page_x_of_y', { p, max: maxPage });
      if (totalBadge) totalBadge.textContent = t('total_n', { n: total });
      if (document.getElementById('btnPrevTickets')) document.getElementById('btnPrevTickets').disabled = p <= 1;
      if (document.getElementById('btnNextTickets')) document.getElementById('btnNextTickets').disabled = p >= maxPage;
    }

    function buildTicketsUrl(page) {
      const guildId = selectedGuild();
      const userId = (document.getElementById('ticketsUserId')?.value || '').trim();
      const status = (document.getElementById('ticketsStatus')?.value || '').trim();
      const limitEl = document.getElementById('ticketsLimit');
      const limit = parseInt(limitEl?.value || '25', 10) || 25;

      state.tickets.limit = Math.min(Math.max(limit, 1), 100);

      const url = new URL('/api/tickets', location.origin);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(state.tickets.limit));
      if (guildId) url.searchParams.set('guildId', guildId);
      if (userId) url.searchParams.set('userId', userId);
      if (status) url.searchParams.set('status', status);
      return url;
    }

    function renderTickets(items) {
      const list = document.getElementById('ticketsList');
      if (!list) return;
      list.innerHTML = '';

      const gid = selectedGuild();
      if (!gid) {
        const empty = document.createElement('div');
        empty.className = 'card';
        empty.innerHTML = '<h2>' + t('select_a_guild') + '</h2><div class="hint">Seleciona uma guild no topo para ver tickets.</div>';
        list.appendChild(empty);
        return;
      }

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'card';
        empty.innerHTML = '<h2>' + t('no_tickets') + '</h2><div class="hint">Sem tickets para o filtro atual.</div>';
        list.appendChild(empty);
        return;
      }

      for (const t of items) {
        const div = document.createElement('div');
        div.className = 'logItem';

        const status = (t.status || 'UNKNOWN').toUpperCase();
        const statusCls = status === 'OPEN' ? 'ok' : 'warn';
        const userId = escHtml(t.userId || '');
        const channelId = escHtml(t.channelId || '');
        const topic = escHtml(t.topic || 'Ticket');

        const closeBtnHtml = status === 'OPEN'
          ? `<div class="row" style="margin-top: 8px;"><button class="btnSmall btnCloseTicket" data-ticket-id="${escHtml(t._id || '')}">Close ticket</button></div>`
          : '';

        div.innerHTML = `
          <div class="logHead">
            <div class="logTitle">
              <span class="badge ${statusCls}">${escHtml(status)}</span>
              <span class="badge">user: <span class="mono">${userId}</span></span>
              <span class="badge">channel: <span class="mono">${channelId}</span></span>
            </div>
            <div class="mono">${safeDate(t.createdAt)}</div>
          </div>
          <div class="logDesc">${topic}</div>
          <div class="logMeta">🧾 ticketId: <span class="mono">${escHtml(t._id || '')}</span></div>
          ${closeBtnHtml}
        `;

        const btn = div.querySelector('.btnCloseTicket');
        if (btn) {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const id = btn.getAttribute('data-ticket-id');
            closeTicket(id);
          });
        }

        list.appendChild(div);
      }
    }

    async function closeTicket(ticketId) {
      const gid = selectedGuild();
      if (!gid) {
        toast('Select a guild first.', 'bad');
        return;
      }
      const id = (ticketId || '').trim();
      if (!id) return;

      if (!confirm('Close this ticket?')) return;

      const res = await fetch(`/api/tickets/${encodeURIComponent(id)}/close`, {
        method: 'POST',
        headers: {
          ...headers(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ guildId: gid })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast(json.error || 'Failed to close ticket.', 'bad');
        return;
      }

      toast('Ticket closed.', 'ok');
      loadTicketsPage(state.tickets.page || 1).catch(() => null);
    }

    async function loadTicketsPage(page) {
      const gid = selectedGuild();
      if (!gid) {
        state.tickets.items = [];
        state.tickets.total = 0;
        renderTickets([]);
        updateTicketsPagerUI();
        return;
      }

      const url = buildTicketsUrl(page);
      const res = await fetch(url.toString(), { headers: headers() });
      if (res.status === 401) {
        toast(t('toast_unauthorized_set_token'), 'bad');
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast(json.error || 'Failed to load tickets.', 'bad');
        return;
      }

      state.tickets.page = json.page || page || 1;
      state.tickets.total = json.total || 0;
      state.tickets.items = Array.isArray(json.items) ? json.items : [];

      renderTickets(state.tickets.items);
      updateTicketsPagerUI();
    }

    if (document.getElementById('btnReloadTickets')) {
      document.getElementById('btnReloadTickets').addEventListener('click', () => loadTicketsPage(1).catch(() => null));
      document.getElementById('ticketsUserId').addEventListener('input', () => {
        clearTimeout(window.__ticketsUserT);
        window.__ticketsUserT = setTimeout(() => loadTicketsPage(1).catch(() => null), 250);
      });
      document.getElementById('ticketsStatus').addEventListener('change', () => loadTicketsPage(1).catch(() => null));
      document.getElementById('ticketsLimit').addEventListener('change', () => loadTicketsPage(1).catch(() => null));
      document.getElementById('btnPrevTickets').addEventListener('click', () => loadTicketsPage(Math.max(state.tickets.page - 1, 1)).catch(() => null));
      document.getElementById('btnNextTickets').addEventListener('click', () => loadTicketsPage(state.tickets.page + 1).catch(() => null));
    }


setInterval(refreshHealth, 5000);
    setInterval(() => {
      if (!state.token) return;
      socket.emit('requestGameNewsStatus');
      socket.emit('requestConfig');
    }, 5000);
  