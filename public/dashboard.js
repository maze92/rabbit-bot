// Estado simples
const state = {
  lang: 'pt',
  guildChannelsCache: {}, // guildId -> canais
  gameNewsFeedsByGuild: {}, // guildId -> feeds (editor)
};


// Simple toast helper
function toast(message) {
  try {
    if (!message) return;
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '1.5rem';
      container.style.right = '1.5rem';
      container.style.zIndex = '9999';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '0.5rem';
      document.body.appendChild(container);
    }

    const el = document.createElement('div');
    el.textContent = message;
    el.style.background = 'rgba(0, 0, 0, 0.85)';
    el.style.color = '#fff';
    el.style.padding = '0.5rem 0.75rem';
    el.style.borderRadius = '4px';
    el.style.fontSize = '0.85rem';
    el.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.35)';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';

    container.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => {
        el.remove();
        if (!container.children.length) {
          container.remove();
        }
      }, 200);
    }, 3000);
  } catch (e) {
    console.error('toast error:', e);
  }
}

const DASH_TOKEN_KEY = 'DASHBOARD_TOKEN';

// Traducoes
const I18N = {
  pt: {
    // Topbar / layout
    app_subtitle: 'Painel de gestao e moderacao',
    select_guild: 'Selecione um servidor',
    badge_bot_online: '* Bot online',

    // Tabs
    tab_overview: 'Visao geral',
    tab_logs: 'Moderacao',
    tab_cases: 'Casos',
    tab_tickets: 'Tickets',
    tab_gamenews: 'GameNews',
    tab_user: 'Utilizadores',
    tab_config: 'Configuracao',

    // Overview
    overview_title: 'Visao geral',
    overview_hint: 'Resumo de alto nivel sobre o estado do bot, servidores ligados e atividade recente.',
    kpi_guilds: 'Servidores ligados',
    kpi_users: 'Utilizadores monitorizados',
    kpi_actions_24h: 'Acoes de moderacao (ultimas 24h)',

    // Logs
    logs_title: 'Hub de moderacao',
    logs_hint: 'Consulta centralizada de avisos, mutes, bans e restantes acoes de moderacao.',
    logs_search_placeholder: 'Procurar por utilizador, moderador ou detalhe do log',
    logs_filter_all: 'Todos os tipos',
    logs_reload: 'Recarregar',
    logs_empty: 'Nao existem registos para o filtro atual.',
    logs_loading: 'A carregar logs...',
    logs_error_generic: 'Nao foi possivel carregar os logs.',
    logs_error_http: 'Erro ao carregar logs.',
    logs_user_label: 'Utilizador',
    logs_executor_label: 'Moderador',
    logs_timestamp_label: 'Data',

    // Cases
    cases_title: 'Casos',
    cases_hint: 'Visao consolidada das infracoes de cada utilizador ao longo do tempo.',
    cases_empty: 'Ainda nao existem casos registados para este servidor.',
    cases_loading: 'A carregar casos...',
    cases_error_generic: 'Nao foi possivel carregar os casos.',
    cases_error_http: 'Erro ao carregar casos.',

    // Tickets
    tickets_title: 'Tickets',
    tickets_hint: 'Gestao de pedidos de suporte e tickets abertos nos servidores configurados.',
    tickets_empty: 'Nao foram encontrados tickets para o periodo selecionado.',
    tickets_loading: 'A carregar tickets...',
    tickets_error_generic: 'Nao foi possivel carregar os tickets.',
    tickets_error_http: 'Erro ao carregar tickets.',

    // GameNews
    gamenews_title: 'GameNews',
    gamenews_hint: 'Estado dos feeds de noticias, ultimos envios e potenciais falhas na publicacao.',
    gamenews_empty: 'Nenhum feed de GameNews se encontra configurado neste momento.',
    gamenews_loading: 'A carregar estado dos feeds...',
    gamenews_error_generic: 'Nao foi possivel carregar o estado dos feeds.',
    gamenews_error_http: 'Erro ao carregar GameNews.',

    gamenews_editor_title: 'Configuracao de feeds',
    gamenews_editor_hint: 'Adiciona, edita ou remove feeds e escolhe o canal onde as noticias serao enviadas.',
    gamenews_add_feed: 'Adicionar feed',
    gamenews_save_feeds: 'Guardar alteracoes',
    gamenews_feeds_loading: 'A carregar configuracao de feeds...',
    gamenews_feeds_empty: 'Ainda nao existem feeds configurados. Adiciona o primeiro feed para comecar.',
    gamenews_feeds_error_generic: 'Nao foi possivel carregar a configuracao de feeds.',
    gamenews_feeds_error_http: 'Erro ao carregar os feeds de GameNews.',

    // Users
    users_title: 'Utilizadores',
    users_hint: 'Consulta rapida de metricas e historico de casos de cada utilizador.',
    users_empty: 'Selecione um servidor para ver utilizadores.',

    // Config
    config_title: 'Configuracao do servidor',
    config_hint: 'Defina canais, cargos de staff e preferencias de registo para este servidor.',
    config_empty: 'Em breve: integracao direta com a API do OzarkBot para guardar estas definicoes.',

    // Mensagens auxiliares
    warn_select_guild: 'Selecione um servidor para aceder as restantes seccoes.',
    language_changed: 'Idioma alterado.',
  },

  en: {
    // Topbar / layout
    app_subtitle: 'Moderation and management dashboard',
    select_guild: 'Select a server',
    badge_bot_online: '* Bot online',

    // Tabs
    tab_overview: 'Overview',
    tab_logs: 'Moderation',
    tab_cases: 'Cases',
    tab_tickets: 'Tickets',
    tab_gamenews: 'GameNews',
    tab_user: 'Users',
    tab_config: 'Configuration',

    // Overview
    overview_title: 'Overview',
    overview_hint: 'High-level summary of bot status, connected guilds and recent activity.',
    kpi_guilds: 'Connected guilds',
    kpi_users: 'Monitored users',
    kpi_actions_24h: 'Moderation actions (last 24h)',

    // Logs
    logs_title: 'Moderation hub',
    logs_hint: 'Central place to review warns, mutes, bans and other moderation events.',
    logs_search_placeholder: 'Search by user, moderator or log details',
    logs_filter_all: 'All types',
    logs_reload: 'Reload',
    logs_empty: 'There are no records matching the current filter.',
    logs_loading: 'Loading logs...',
    logs_error_generic: 'Could not load logs.',
    logs_error_http: 'Error loading logs.',
    logs_user_label: 'User',
    logs_executor_label: 'Moderator',
    logs_timestamp_label: 'Date',

    // Cases
    cases_title: 'Cases',
    cases_hint: 'Consolidated view of each user's infractions over time.',
    cases_empty: 'No cases have been registered for this server yet.',
    cases_loading: 'Loading cases...',
    cases_error_generic: 'Could not load cases.',
    cases_error_http: 'Error loading cases.',

    // Tickets
    tickets_title: 'Tickets',
    tickets_hint: 'Manage support requests and open tickets across your configured guilds.',
    tickets_empty: 'No tickets were found for the selected period.',
    tickets_loading: 'Loading tickets...',
    tickets_error_generic: 'Could not load tickets.',
    tickets_error_http: 'Error loading tickets.',

    // GameNews
    gamenews_title: 'GameNews',
    gamenews_hint: 'Status of news feeds, recent posts and any delivery failures.',
    gamenews_empty: 'No GameNews feeds are configured at the moment.',
    gamenews_loading: 'Loading feed status...',
    gamenews_error_generic: 'Could not load feed status.',
    gamenews_error_http: 'Error loading GameNews.',

    gamenews_editor_title: 'Feeds configuration',
    gamenews_editor_hint: 'Add, edit or remove feeds and choose which channel will receive each feed.',
    gamenews_add_feed: 'Add feed',
    gamenews_save_feeds: 'Save changes',
    gamenews_feeds_loading: 'Loading feed configuration...',
    gamenews_feeds_empty: 'No feeds have been configured yet. Add your first feed to get started.',
    gamenews_feeds_error_generic: 'Could not load feed configuration.',
    gamenews_feeds_error_http: 'Error loading GameNews feeds.',

    // Users
    users_title: 'Users',
    users_hint: 'Quick access to metrics, case history and actions applied per user.',
    users_empty: 'Select a server to list and analyse its users.',

    // Config
    config_title: 'Server configuration',
    config_hint: 'Configure channels, staff roles and logging preferences for this server.',
    config_empty: 'Coming soon: direct integration with the OzarkBot API to persist these settings.',

    // Helper messages
    warn_select_guild: 'Select a server to access the other sections.',
    language_changed: 'Language updated.',
  },
};

// Helpers
function t(key) {
  const lang = I18N[state.lang] ? state.lang : 'pt';
  return I18N[lang][key] ?? I18N.pt[key] ?? key;
}

function applyI18n() {
  document.documentElement.lang = state.lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (!k) return;
    el.textContent = t(k);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (!k) return;
    el.setAttribute('placeholder', t(k));
  });

  const warn = document.getElementById('tabWarning');
  if (warn) warn.textContent = t('warn_select_guild');
}

function setLang(newLang) {
  state.lang = (newLang || 'pt').toLowerCase();
  try {
    localStorage.setItem('OZARK_LANG_SIMPLE', state.lang);
  } catch {}

  const lp = document.getElementById('langPicker');
  if (lp) lp.value = state.lang;

  applyI18n();
}

// ==== TOKEN DASHBOARD (DASHBOARD_TOKEN) ====

// Le token, migrando da key antiga se existir
function getStoredToken() {
  let jwt = null;

  try {
    jwt = localStorage.getItem(DASH_TOKEN_KEY);
    if (!jwt) {
      const legacy = localStorage.getItem('OZARK_DASH_JWT');
      if (legacy) {
        jwt = legacy;
        localStorage.setItem(DASH_TOKEN_KEY, legacy);
        localStorage.removeItem('OZARK_DASH_JWT');
      }
    }
  } catch {
    jwt = null;
  }

  return jwt || null;
}

function setStoredToken(jwt) {
  try {
    if (!jwt) {
      localStorage.removeItem(DASH_TOKEN_KEY);
    } else {
      localStorage.setItem(DASH_TOKEN_KEY, jwt);
    }
  } catch {
    // ignore
  }
}

// Pede e guarda o token da dashboard (DASHBOARD_TOKEN)
function ensureDashToken() {
  let jwt = getStoredToken();
  if (!jwt) {
    const msgPt = 'Introduz o token da dashboard (DASHBOARD_TOKEN do .env):';
    const msgEn = 'Enter the dashboard token (DASHBOARD_TOKEN from .env):';
    const ask = state.lang === 'en' ? msgEn : msgPt;

    const input = window.prompt(ask, '');
    if (input) {
      jwt = input.trim();
      if (jwt) {
        setStoredToken(jwt);
      }
    }
  }
  return jwt || null;
}

function getAuthHeaders() {
  const headers = {};
  const jwt = ensureDashToken();
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
    headers['x-dashboard-token'] = jwt;
  }
  return headers;
}

// Sanitizacao simples de texto para evitar XSS
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

// Tabs
function setTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });

  document.querySelectorAll('.section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `tab-${name}`);
  });
}

// Bloqueio de tabs sem servidor (versao simples + garantida)
function updateTabAccess() {
  const guildPicker = document.getElementById('guildPicker');
  const warning = document.getElementById('tabWarning');
  const needsGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];

  const currentGuild = guildPicker?.value || '';
  const hasGuild = !!currentGuild;

  // marcar/desmarcar tabs visualmente
  document.querySelectorAll('.tab').forEach((tab) => {
    const name = tab.dataset.tab;
    if (!name) return;
    if (needsGuild.includes(name)) {
      tab.classList.toggle('disabled', !hasGuild);
    }
  });

  // aviso
  if (!hasGuild) {
    if (warning) warning.classList.add('visible');

    // se estivermos numa tab que exige guild, volta para overview
    const active = document.querySelector('.tab.active');
    const activeName = active?.dataset.tab;
    if (activeName && needsGuild.includes(activeName)) {
      setTab('overview');
    }
  } else {
    if (warning) warning.classList.remove('visible');
  }
}

// Carrega lista de servidores reais a partir da API
async function loadGuilds() {
  const guildPicker = document.getElementById('guildPicker');
  if (!guildPicker) return;

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch('/api/guilds', { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/guilds:', err);
    updateTabAccess();
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/guilds:', resp.status);
    updateTabAccess();
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/guilds:', err);
    updateTabAccess();
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];

  // Limpa opcoes atuais (mantem placeholder)
  const placeholder = guildPicker.querySelector('option[value=""]');
  guildPicker.innerHTML = '';
  if (placeholder) {
    guildPicker.appendChild(placeholder);
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.setAttribute('data-i18n', 'select_guild');
    opt.textContent = t('select_guild');
    guildPicker.appendChild(opt);
  }

  items.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    guildPicker.appendChild(opt);
  });

  updateTabAccess();
}

// ==== LOGS: ligacao a API /api/logs ====

async function loadLogs(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.getElementById('logsList');
  const typeEl = document.getElementById('logType');
  const searchEl = document.getElementById('logSearch');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  const type = typeEl?.value || '';
  const search = searchEl?.value || '';

  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  // Estado de loading
  listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '20');
  params.set('guildId', guildId);
  if (type) params.set('type', type);
  if (search) params.set('search', search);

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch(`/api/logs?${params.toString()}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/logs:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/logs:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('logs_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) esta configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/logs:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('logs_empty'))}</div>`;
    return;
  }

  const html = items
    .map((item) => {
      const title = item.title || item.type || '';
      const userTag = item.user?.tag || item.userId || '-';
      const execTag = item.executor?.tag || item.moderatorId || '-';
      const time = item.time || item.createdAt || '';
      const description = item.description || item.reason || '';
      return `
        <div class="card">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(title)}</strong>
              ${
                description
                  ? `<div class="hint">${escapeHtml(description)}</div>`
                  : ''
              }
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              <div>${escapeHtml(t('logs_user_label'))}: ${escapeHtml(userTag)}</div>
              <div>${escapeHtml(t('logs_executor_label'))}: ${escapeHtml(execTag)}</div>
              <div>${escapeHtml(t('logs_timestamp_label'))}: ${escapeHtml(time)}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  // Store as current editable set (per guild)
  state.gameNewsFeedsByGuild[guildId] = items;

  // Click -> open modal editor
  listEl.querySelectorAll('[data-feed-idx]').forEach((el) => {
    el.addEventListener('click', async () => {
      const idx = Number(el.getAttribute('data-feed-idx'));
      const feed = items[idx];
      if (!feed) return;
      await openGameNewsFeedModal({ guildId, feed, isNew: false });
    });
  });
}


// ==== CASES: ligacao a /api/cases ====

async function loadCases(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.getElementById('casesList') || document.querySelector('#tab-cases .list');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '20');
  params.set('guildId', guildId);

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch(`/api/cases?${params.toString()}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/cases:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/cases:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('cases_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) esta configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/cases:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('cases_empty'))}</div>`;
    return;
  }

  const html = items
    .map((c) => {
      const user = c.userId || '-';
      const type = c.type || '';
      const caseId = c.caseId != null ? `#${c.caseId}` : '';
      const reason = c.reason || '';
      const createdAt = c.createdAt || '';
      return `
        <div class="card">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(user)}</strong>
              ${
                reason
                  ? `<div class="hint">${escapeHtml(reason)}</div>`
                  : ''
              }
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              ${caseId ? `<div>Case: ${escapeHtml(caseId)}</div>` : ''}
              ${type ? `<div>Tipo: ${escapeHtml(type)}</div>` : ''}
              ${createdAt ? `<div>Criado em: ${escapeHtml(createdAt)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  // Store as current editable set (per guild)
  state.gameNewsFeedsByGuild[guildId] = items;

  // Click -> open modal editor
  listEl.querySelectorAll('[data-feed-idx]').forEach((el) => {
    el.addEventListener('click', async () => {
      const idx = Number(el.getAttribute('data-feed-idx'));
      const feed = items[idx];
      if (!feed) return;
      await openGameNewsFeedModal({ guildId, feed, isNew: false });
    });
  });
}


// ==== TICKETS: ligacao a /api/tickets ====

async function loadTickets(page = 1) {
  const guildPicker = document.getElementById('guildPicker');
  const listEl = document.querySelector('#tab-tickets .list');

  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_loading'))}</div>`;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '20');
  params.set('guildId', guildId);
  // Opcionalmente poderiamos passar status/userId no futuro

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch(`/api/tickets?${params.toString()}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/tickets:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/tickets:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('tickets_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) esta configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/tickets:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('tickets_empty'))}</div>`;
    return;
  }

  

  
var html = '';
for (var i = 0; i < items.length; i++) {
  var tkt = items[i] || {};
  var ticketId = tkt._id || tkt.id || '';
  var userId = tkt.userId || tkt.createdById || '-';
  var channelId = tkt.channelId || '-';
  var status = tkt.status || 'OPEN';
  var createdAt = tkt.createdAt || '';
  var closedAt = tkt.closedAt || null;
  var subject = tkt.subject || tkt.topic || '';
  var lastMsgAt = tkt.lastMessageAt || '';

  var title = subject;
  if (!title) {
    if (state.lang === 'en') {
      title = 'Ticket from ' + userId;
    } else {
      title = 'Ticket de ' + userId;
    }
  }

  var metaHtml = '';

  if (createdAt) {
    metaHtml += '<div>' +
      (state.lang === 'en' ? 'Created at' : 'Criado em') +
      ': ' + escapeHtml(createdAt) +
    '</div>';
  }
  if (closedAt) {
    metaHtml += '<div>' +
      (state.lang === 'en' ? 'Closed at' : 'Fechado em') +
      ': ' + escapeHtml(closedAt) +
    '</div>';
  }
  if (lastMsgAt) {
    metaHtml += '<div>' +
      (state.lang === 'en' ? 'Last message' : 'Ultima msg') +
      ': ' + escapeHtml(lastMsgAt) +
    '</div>';
  }

  html += '' +
    '<div class="card ticket-row" data-ticket-id="' + escapeHtml(ticketId) + '">' +
      '<div class="row gap" style="justify-content: space-between; align-items:flex-start;">' +
        '<div>' +
          '<strong>' + escapeHtml(title) + '</strong>' +
          '<div class="hint">' +
            (state.lang === 'en' ? 'User' : 'Utilizador') + ': ' + escapeHtml(userId) + '<br>' +
            (state.lang === 'en' ? 'Channel' : 'Canal') + ': ' + escapeHtml(channelId) +
          '</div>' +
        '</div>' +
        '<div style="text-align:right; font-size:11px; color:var(--text-muted);">' +
          '<div>Status: ' + escapeHtml(status) + '</div>' +
          metaHtml +
        '</div>' +
      '</div>' +
      '<div class="row gap" style="margin-top:8px; justify-content:flex-end;">' +
        '<button type="button" class="btn small" data-action="reply">' +
          escapeHtml(t('tickets_btn_reply') || (state.lang === 'en' ? 'Reply' : 'Responder')) +
        '</button>' +
        '<button type="button" class="btn small danger" data-action="close">' +
          escapeHtml(t('tickets_btn_close') || (state.lang === 'en' ? 'Close ticket' : 'Fechar ticket')) +
        '</button>' +
      '</div>' +
    '</div>';
}
const html = html;


  listEl.innerHTML = html;


  listEl.innerHTML = html;

  // Liga eventos de Responder / Fechar
  listEl.querySelectorAll('.ticket-row').forEach((row) => {
    const ticketId = row.getAttribute('data-ticket-id') || '';
    if (!ticketId) return;

    const replyBtn = row.querySelector('button[data-action="reply"]');
    const closeBtn = row.querySelector('button[data-action="close"]');

    if (replyBtn) {
      replyBtn.addEventListener('click', async () => {
        const guildId = guildPicker?.value || '';
        if (!guildId) return;

        const promptMsg = state.lang === 'en'
          ? 'Reply to this ticket:'
          : 'Resposta para este ticket:';

        const content = window.prompt(promptMsg, '');
        if (!content || !content.trim()) return;

        const headers = getAuthHeaders();
        headers['Content-Type'] = 'application/json';

        try {
          const resp = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/reply`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ guildId, content: content.trim() })
          });

          if (!resp.ok) {
            console.error('HTTP error /api/tickets/:ticketId/reply:', resp.status);
            toast(
              state.lang === 'en'
                ? 'Failed to send reply.'
                : 'Falha ao enviar resposta.'
            );
            return;
          }

          toast(
            state.lang === 'en'
              ? 'Reply sent.'
              : 'Resposta enviada.'
          );
          loadTickets().catch((err) => console.error('Erro loadTickets (after reply):', err));
        } catch (err) {
          console.error('Erro /api/tickets/:ticketId/reply:', err);
          toast(
            state.lang === 'en'
              ? 'Failed to send reply.'
              : 'Falha ao enviar resposta.'
          );
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        const guildId = guildPicker?.value || '';
        if (!guildId) return;

        const confirmMsg = state.lang === 'en'
          ? 'Close this ticket? The channel will be updated on Discord.'
          : 'Fechar este ticket? O canal sera atualizado no Discord.';

        const confirmed = window.confirm(confirmMsg);
        if (!confirmed) return;

        const headers = getAuthHeaders();
        headers['Content-Type'] = 'application/json';

        try {
          const resp = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/close`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ guildId })
          });

          if (!resp.ok) {
            console.error('HTTP error /api/tickets/:ticketId/close:', resp.status);
            toast(
              state.lang === 'en'
                ? 'Failed to close ticket.'
                : 'Falha ao fechar o ticket.'
            );
            return;
          }

          toast(
            state.lang === 'en'
              ? 'Ticket closed.'
              : 'Ticket fechado.'
          );
          loadTickets().catch((err) => console.error('Erro loadTickets (after close):', err));
        } catch (err) {
          console.error('Erro /api/tickets/:ticketId/close:', err);
          toast(
            state.lang === 'en'
              ? 'Failed to close ticket.'
              : 'Falha ao fechar o ticket.'
          );
        }
      });
    }
  });

}

// ==== GAMENEWS: estado (/api/gamenews-status) ====

async function loadGameNewsStatus() {
  ensureGameNewsEditorLayout();
  const listEl = document.getElementById('gamenewsStatusList');
  if (!listEl) return;

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_loading'))}</div>`;

  const headers = getAuthHeaders();

  let resp;
  try {
    const guildPicker = document.getElementById('guildPicker');
  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  resp = await fetch(`/api/gamenews-status?guildId=${encodeURIComponent(guildId)}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/gamenews-status:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/gamenews-status:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('gamenews_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) esta configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/gamenews-status:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_error_generic'))}</div>`;
    return;
  }

  const items = data.items || [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_empty'))}</div>`;
    return;
  }

  const html = items
    .map((feed) => {
      const name = feed.feedName || feed.source || 'Feed';
      const url = feed.feedUrl || '';
      const channelId = feed.channelId || '-';
      const enabled = feed.enabled !== false;
      const failCount = feed.failCount ?? 0;
      const lastSentAt = feed.lastSentAt || '';
      const lastHashesCount = feed.lastHashesCount ?? 0;
      const pausedUntil = feed.pausedUntil || null;

      return `
        <div class="card">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(name)}</strong>
              <div class="hint">
                ${url ? `Feed: ${escapeHtml(url)}<br>` : ''}
                Canal: ${escapeHtml(channelId)}
              </div>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              <div>Ativo: ${enabled ? 'Sim' : 'Nao'}</div>
              <div>Falhas: ${escapeHtml(failCount)}</div>
              <div>Ultimo envio: ${escapeHtml(lastSentAt || '-')}</div>
              <div>Hashes recentes: ${escapeHtml(lastHashesCount)}</div>
              ${pausedUntil ? `<div>Pausado ate: ${escapeHtml(pausedUntil)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  // Store as current editable set (per guild)
  state.gameNewsFeedsByGuild[guildId] = items;

  // Click -> open modal editor
  listEl.querySelectorAll('[data-feed-idx]').forEach((el) => {
    el.addEventListener('click', async () => {
      const idx = Number(el.getAttribute('data-feed-idx'));
      const feed = items[idx];
      if (!feed) return;
      await openGameNewsFeedModal({ guildId, feed, isNew: false });
    });
  });
}



function ensureGameNewsEditorLayout() {
  // Hide the old inline editor list to avoid duplicates - we use a modal editor instead.
  const feedsList = document.getElementById('gamenewsFeedsList');
  if (feedsList) feedsList.style.display = 'none';

  const btnSave = document.getElementById('btnSaveGameNewsFeeds');
  if (btnSave) btnSave.style.display = 'none';

  // Keep "Adicionar feed" button visible as a small action.
  const btnAdd = document.getElementById('btnAddGameNewsFeed');
  if (btnAdd) {
    btnAdd.classList.remove('primary');
    btnAdd.classList.add('btn');
  }
}

function buildModalShell() {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.55)';
  overlay.style.zIndex = '9998';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '1rem';

  const box = document.createElement('div');
  box.style.width = 'min(720px, 100%)';
  box.style.background = 'var(--card, #0f1115)';
  box.style.border = '1px solid rgba(255,255,255,0.08)';
  box.style.borderRadius = '10px';
  box.style.boxShadow = '0 12px 40px rgba(0,0,0,0.45)';
  box.style.padding = '1rem';
  box.style.zIndex = '9999';

  overlay.appendChild(box);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  return { overlay, box };
}

async function saveGameNewsFeedsForGuild(guildId, feeds) {
  const headers = getAuthHeaders();
  headers['Content-Type'] = 'application/json';

  const resp = await fetch(`/api/gamenews/feeds?guildId=${encodeURIComponent(guildId)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ guildId, feeds })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${text || ''}`.trim());
  }

  const data = await resp.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function openGameNewsFeedModal({ guildId, feed, isNew }) {
  const channels = await fetchGuildChannelsForGameNews(guildId);

  const { overlay, box } = buildModalShell();

  const title = document.createElement('div');
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.justifyContent = 'space-between';
  title.style.gap = '0.75rem';

  const h = document.createElement('h3');
  h.style.margin = '0';
  h.textContent = isNew ? (state.lang === 'en' ? 'Add feed' : 'Adicionar feed') : (state.lang === 'en' ? 'Edit feed' : 'Editar feed');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn';
  closeBtn.type = 'button';
  closeBtn.textContent = state.lang === 'en' ? 'Close' : 'Fechar';
  closeBtn.addEventListener('click', () => overlay.remove());

  title.appendChild(h);
  title.appendChild(closeBtn);

  const form = document.createElement('div');
  form.style.display = 'grid';
  form.style.gridTemplateColumns = '1fr 1fr';
  form.style.gap = '0.75rem';
  form.style.marginTop = '0.75rem';

  function field(label, inputEl, full = false) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '0.35rem';
    if (full) wrap.style.gridColumn = '1 / -1';

    const l = document.createElement('label');
    l.style.fontSize = '0.85rem';
    l.style.opacity = '0.9';
    l.textContent = label;

    wrap.appendChild(l);
    wrap.appendChild(inputEl);
    return wrap;
  }

  const inName = document.createElement('input');
  inName.className = 'input';
  inName.placeholder = 'GameSpot';
  inName.value = feed?.name || '';

  const inUrl = document.createElement('input');
  inUrl.className = 'input';
  inUrl.placeholder = 'https://.../rss';
  inUrl.value = feed?.feedUrl || '';

  const selChannel = document.createElement('select');
  selChannel.className = 'select';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = state.lang === 'en' ? 'Select channel' : 'Selecione o canal';
  selChannel.appendChild(opt0);
  for (const ch of channels) {
    const o = document.createElement('option');
    o.value = ch.id;
    o.textContent = `#${ch.name}`;
    selChannel.appendChild(o);
  }
  selChannel.value = feed?.channelId || '';

  const selLogChannel = document.createElement('select');
  selLogChannel.className = 'select';
  const optL = document.createElement('option');
  optL.value = '';
  optL.textContent = state.lang === 'en' ? 'Select logs channel (optional)' : 'Canal de logs (opcional)';
  selLogChannel.appendChild(optL);
  for (const ch of channels) {
    const o = document.createElement('option');
    o.value = ch.id;
    o.textContent = `#${ch.name}`;
    selLogChannel.appendChild(o);
  }
  selLogChannel.value = feed?.logChannelId || '';

  const inInterval = document.createElement('input');
  inInterval.className = 'input';
  inInterval.type = 'number';
  inInterval.min = '0';
  inInterval.placeholder = state.lang === 'en' ? 'Interval (minutes)' : 'Intervalo (minutos)';
  inInterval.value = feed?.intervalMs ? String(Math.round(Number(feed.intervalMs) / 60000)) : '';

  const chkEnabled = document.createElement('input');
  chkEnabled.type = 'checkbox';
  chkEnabled.checked = feed?.enabled !== false;

  const enabledWrap = document.createElement('div');
  enabledWrap.style.display = 'flex';
  enabledWrap.style.alignItems = 'center';
  enabledWrap.style.gap = '0.5rem';
  enabledWrap.appendChild(chkEnabled);
  const enabledTxt = document.createElement('div');
  enabledTxt.textContent = state.lang === 'en' ? 'Enabled' : 'Ativo';
  enabledWrap.appendChild(enabledTxt);

  form.appendChild(field(state.lang === 'en' ? 'Name' : 'Nome', inName));
  form.appendChild(field(state.lang === 'en' ? 'Enabled' : 'Ativo', enabledWrap));
  form.appendChild(field('RSS URL', inUrl, true));
  form.appendChild(field(state.lang === 'en' ? 'News channel' : 'Canal de noticias', selChannel));
  form.appendChild(field(state.lang === 'en' ? 'Logs channel' : 'Canal de logs', selLogChannel));
  form.appendChild(field(state.lang === 'en' ? 'Interval (min)' : 'Intervalo (min)', inInterval));

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'space-between';
  actions.style.alignItems = 'center';
  actions.style.gap = '0.75rem';
  actions.style.marginTop = '1rem';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.gap = '0.5rem';

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '0.5rem';

  const btnDelete = document.createElement('button');
  btnDelete.className = 'btn danger';
  btnDelete.type = 'button';
  btnDelete.textContent = state.lang === 'en' ? 'Delete' : 'Eliminar';
  btnDelete.style.display = isNew ? 'none' : 'inline-flex';

  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn';
  btnCancel.type = 'button';
  btnCancel.textContent = state.lang === 'en' ? 'Cancel' : 'Cancelar';

  const btnSave = document.createElement('button');
  btnSave.className = 'btn primary';
  btnSave.type = 'button';
  btnSave.textContent = state.lang === 'en' ? 'Save' : 'Guardar';

  btnCancel.addEventListener('click', () => overlay.remove());

  btnSave.addEventListener('click', async () => {
    const name = (inName.value || '').trim() || 'Feed';
    const feedUrl = (inUrl.value || '').trim();
    const channelId = selChannel.value || '';
    const logChannelId = selLogChannel.value || '';
    const enabled = chkEnabled.checked;

    const mins = Number(inInterval.value || 0);
    const intervalMs = Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60_000) : null;

    if (!feedUrl || !channelId) {
      toast(state.lang === 'en' ? 'RSS URL and channel are required.' : 'O URL RSS e o canal sao obrigatorios.');
      return;
    }

    const list = Array.isArray(state.gameNewsFeedsByGuild[guildId]) ? [...state.gameNewsFeedsByGuild[guildId]] : [];

    if (isNew) {
      list.push({ name, feedUrl, channelId, logChannelId: logChannelId || null, enabled, intervalMs });
    } else {
      const idx = list.findIndex((x) => x && x.id === feed.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], name, feedUrl, channelId, logChannelId: logChannelId || null, enabled, intervalMs };
      }
    }

    try {
      const saved = await saveGameNewsFeedsForGuild(guildId, list.map((x) => ({
        name: x.name,
        feedUrl: x.feedUrl,
        channelId: x.channelId,
        logChannelId: x.logChannelId || null,
        enabled: x.enabled !== false,
        intervalMs: x.intervalMs ?? null
      })));

      state.gameNewsFeedsByGuild[guildId] = saved;
      toast(state.lang === 'en' ? 'Saved.' : 'Guardado.');
      overlay.remove();
      await loadGameNewsStatus();
    } catch (e) {
      console.error('saveGameNewsFeedsForGuild error:', e);
      toast(state.lang === 'en' ? 'Failed to save.' : 'Falha ao guardar.');
    }
  });

  btnDelete.addEventListener('click', async () => {
    const list = Array.isArray(state.gameNewsFeedsByGuild[guildId]) ? [...state.gameNewsFeedsByGuild[guildId]] : [];
    const next = list.filter((x) => x && x.id !== feed.id);

    try {
      const saved = await saveGameNewsFeedsForGuild(guildId, next.map((x) => ({
        name: x.name,
        feedUrl: x.feedUrl,
        channelId: x.channelId,
        logChannelId: x.logChannelId || null,
        enabled: x.enabled !== false,
        intervalMs: x.intervalMs ?? null
      })));

      state.gameNewsFeedsByGuild[guildId] = saved;
      toast(state.lang === 'en' ? 'Deleted.' : 'Eliminado.');
      overlay.remove();
      await loadGameNewsStatus();
    } catch (e) {
      console.error('delete feed error:', e);
      toast(state.lang === 'en' ? 'Failed to delete.' : 'Falha ao eliminar.');
    }
  });

  left.appendChild(btnDelete);
  right.appendChild(btnCancel);
  right.appendChild(btnSave);

  actions.appendChild(left);
  actions.appendChild(right);

  box.appendChild(title);
  box.appendChild(form);
  box.appendChild(actions);

  document.body.appendChild(overlay);
}

// ==== GAMENEWS: editor de feeds (/api/gamenews/feeds) ====

async function fetchGuildChannelsForGameNews(guildId) {
  if (!guildId) return [];

  if (state.guildChannelsCache[guildId]) {
    return state.guildChannelsCache[guildId];
  }

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/channels`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/guilds/:guildId/channels:', err);
    return [];
  }

  if (!resp.ok) {
    console.error('HTTP error /api/guilds/:guildId/channels:', resp.status);
    return [];
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/guilds/:guildId/channels:', err);
    return [];
  }

  const items = Array.isArray(data.items) ? data.items : [];
  state.guildChannelsCache[guildId] = items;
  return items;
}

async function loadGameNewsFeedsEditor() {
  const listEl = document.getElementById('gamenewsFeedsList');
  if (!listEl) return;

  const guildPicker = document.getElementById('guildPicker');
  const guildId = guildPicker?.value || '';

  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_loading'))}</div>`;

  const headers = getAuthHeaders();
  headers['Content-Type'] = 'application/json';

  let resp;
  try {
    resp = await fetch(`/api/gamenews/feeds?guildId=${encodeURIComponent(guildId)}`, { headers });
  } catch (err) {
    console.error('Erro ao chamar /api/gamenews/feeds:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_error_generic'))}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/gamenews/feeds:', resp.status);

    if (resp.status === 401) {
      listEl.innerHTML = `<div class="empty">
        ${escapeHtml(t('gamenews_feeds_error_http'))} (401)<br><br>
        ${
          state.lang === 'en'
            ? 'Check if the dashboard token (DASHBOARD_TOKEN) is configured and correct.'
            : 'Verifica se o token da dashboard (DASHBOARD_TOKEN) esta configurado e correto.'
        }
      </div>`;
    } else {
      listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_error_http'))} (${resp.status})</div>`;
    }
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/gamenews/feeds:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_error_generic'))}</div>`;
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const channels = await fetchGuildChannelsForGameNews(guildId);

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('gamenews_feeds_empty'))}</div>`;
    return;
  }

  const html = items
    .map((feed, idx) => {
      const name = feed.name || 'Feed';
      const url = feed.feedUrl || '';
      const channelId = feed.channelId || '';
      const enabled = feed.enabled !== false;
      const intervalMs = typeof feed.intervalMs === 'number' ? feed.intervalMs : null;
      const intervalMinutes = intervalMs ? Math.round(intervalMs / 60000) : '';

      const channelOptions = [
        `<option value="">${escapeHtml(state.lang === 'en' ? 'Select a channel' : 'Selecione um canal')}</option>`,
        ...channels.map(
          (ch) => `<option value="${escapeHtml(ch.id)}"${ch.id === channelId ? ' selected' : ''}># ${escapeHtml(ch.name)}</option>`
        ),
      ].join('');

      return `
        <div class="card gamenews-feed-row" data-index="${idx}">
          <div class="row gap">
            <div class="col">
              <label>${escapeHtml(state.lang === 'en' ? 'Name' : 'Nome')}</label>
              <input class="input gn-name" value="${escapeHtml(name)}" />
            </div>
            <div class="col">
              <label>Feed URL</label>
              <input class="input gn-url" value="${escapeHtml(url)}" />
            </div>
          </div>
          <div class="row gap" style="margin-top:8px; align-items:flex-end;">
            <div class="col">
              <label>${escapeHtml(state.lang === 'en' ? 'Channel' : 'Canal')}</label>
              <select class="select gn-channel">
                ${channelOptions}
              </select>
            </div>
            <div class="col">
              <label>${escapeHtml(state.lang === 'en' ? 'Interval (minutes, optional)' : 'Intervalo (minutos, opcional)')}</label>
              <input class="input gn-interval" type="number" min="0" step="1" value="${intervalMinutes}" />
            </div>
            <div class="col" style="text-align:right;">
              <label style="display:block; margin-bottom:4px;">
                <input type="checkbox" class="gn-enabled" ${enabled ? 'checked' : ''} />
                ${escapeHtml(state.lang === 'en' ? 'Enabled' : 'Ativo')}
              </label>
              <button type="button" class="btn danger gn-remove">${escapeHtml(state.lang === 'en' ? 'Remove' : 'Remover')}</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  // Liga eventos de remocao
  listEl.querySelectorAll('.gn-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.gamenews-feed-row');
      if (row) row.remove();
    });
  });
}

async function saveGameNewsFeeds() {
  const listEl = document.getElementById('gamenewsFeedsList');
  if (!listEl) return;

  const rows = Array.from(listEl.querySelectorAll('.gamenews-feed-row'));
  const feeds = [];

  for (const row of rows) {
    const name = row.querySelector('.gn-name')?.value?.trim() || 'Feed';
    const feedUrl = row.querySelector('.gn-url')?.value?.trim() || '';
    const channelId = row.querySelector('.gn-channel')?.value || '';
    const intervalStr = row.querySelector('.gn-interval')?.value || '';
    const enabled = !!row.querySelector('.gn-enabled')?.checked;

    if (!feedUrl || !channelId) continue;

    let intervalMs = null;
    const minutes = Number(intervalStr);
    if (Number.isFinite(minutes) && minutes > 0) {
      intervalMs = Math.round(minutes * 60 * 1000);
    }

    feeds.push({ name, feedUrl, channelId, enabled, intervalMs });
  }

  const headers = getAuthHeaders();
  headers['Content-Type'] = 'application/json';

  let resp;
  try {
    resp = await fetch(`/api/gamenews/feeds?guildId=${encodeURIComponent(guildId)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ feeds }),
    });
  } catch (err) {
    console.error('Erro ao enviar /api/gamenews/feeds:', err);
    alert(state.lang === 'en' ? 'Failed to save GameNews feeds.' : 'Falha ao guardar os feeds de GameNews.');
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/gamenews/feeds POST:', resp.status);
    alert(
      (state.lang === 'en' ? 'Error saving GameNews feeds: ' : 'Erro ao guardar os feeds de GameNews: ') +
        String(resp.status)
    );
    return;
  }

  // Recarrega editor e estado apos guardar
  await loadGameNewsFeedsEditor();
  await loadGameNewsStatus();

  alert(state.lang === 'en' ? 'GameNews feeds saved.' : 'Feeds de GameNews guardados com sucesso.');
}

// Tabs & navegacao
function initTabs() {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;

  const needsGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];
  const protectedTabs = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];

  tabsEl.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;

    const name = tabEl.dataset.tab;
    if (!name) return;

    const guildPicker = document.getElementById('guildPicker');
    const currentGuild = guildPicker?.value || '';

    // 1) Bloqueio por servidor
    if (!currentGuild && needsGuild.includes(name)) {
      updateTabAccess();
      return;
    }

    // 2) Bloqueio por token (auth)
    if (protectedTabs.includes(name)) {
      const existing = getStoredToken();
      const jwt = existing || ensureDashToken();
      if (!jwt) {
        // Cancelou o prompt > nao muda de tab
        return;
      }
    }

    // 3) Ativar tab
    setTab(name);

    // 4) Lazy load consoante a tab
    if (name === 'overview') {
      loadOverview().catch((err) => console.error('Erro loadOverview:', err));
    }
    if (name === 'logs') {
      loadLogs().catch((err) => console.error('Erro loadLogs:', err));
    }
    if (name === 'cases') {
      loadCases().catch((err) => console.error('Erro loadCases:', err));
    }
    if (name === 'tickets') {
      loadTickets().catch((err) => console.error('Erro loadTickets:', err));
    }
    if (name === 'gamenews') {
      loadGameNewsStatus().catch((err) => console.error('Erro loadGameNewsStatus:', err));
      loadGameNewsFeedsEditor().catch((err) => console.error('Erro loadGameNewsFeedsEditor:', err));
    }
    if (name === 'user') {
      loadUsers().catch((err) => console.error('Erro loadUsers:', err));
    }
    if (name === 'config') {
      loadGuildConfig().catch((err) => console.error('Erro loadGuildConfig:', err));
    }
  });
}



// ==== OVERVIEW METRICS (/api/overview) ====

async function loadOverview() {
  const gEl = document.getElementById('kpiGuilds');
  const uEl = document.getElementById('kpiUsers');
  const aEl = document.getElementById('kpiActions24h');

  if (!gEl || !uEl || !aEl) return;

  gEl.textContent = '...';
  uEl.textContent = '...';
  aEl.textContent = '...';

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch('/api/overview', { headers });
  } catch (err) {
    console.error('Erro a chamar /api/overview:', err);
    gEl.textContent = '0';
    uEl.textContent = '0';
    aEl.textContent = '0';
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/overview:', resp.status);
    gEl.textContent = '0';
    uEl.textContent = '0';
    aEl.textContent = '0';
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/overview:', err);
    gEl.textContent = '0';
    uEl.textContent = '0';
    aEl.textContent = '0';
    return;
  }

  gEl.textContent = String(data.guilds ?? 0);
  uEl.textContent = String(data.users ?? 0);
  aEl.textContent = String(data.actions24h ?? 0);
}

// ==== USERS TAB (/api/guilds/:guildId/users) ====

async function loadUsers() {
  const listEl = document.querySelector('#tab-user .list');
  const guildPicker = document.getElementById('guildPicker');
  if (!listEl) return;

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('warn_select_guild'))}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_loading') || 'A carregar utilizadores...')}</div>`;

  const headers = getAuthHeaders();

  let resp;
  try {
    resp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/users`, { headers });
  } catch (err) {
    console.error('Erro a chamar /api/guilds/:guildId/users:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_error_generic') || 'Nao foi possivel carregar os utilizadores.')}</div>`;
    return;
  }

  if (!resp.ok) {
    console.error('HTTP error /api/guilds/:guildId/users:', resp.status);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_error_http') || 'Erro ao carregar utilizadores.')} (${resp.status})</div>`;
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    console.error('Erro a ler JSON de /api/guilds/:guildId/users:', err);
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_error_generic') || 'Nao foi possivel carregar os utilizadores.')}</div>`;
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t('users_empty'))}</div>`;
    return;
  }

  const html = items
    .map((u) => {
      const tag = u.tag || `${u.username || 'User'}#${u.discriminator || '0000'}`;
      const roles = (u.roles || []).map((r) => r.name).join(', ');
      const joined = u.joinedAt || '';

      return `
        <div class="card user-row" data-user-id="${escapeHtml(u.id || '')}">
          <div class="row gap" style="justify-content: space-between; align-items:flex-start;">
            <div>
              <strong>${escapeHtml(tag)}</strong>
              <div class="hint">
                ${u.bot ? 'Bot - ' : ''}
                ${
                  roles
                    ? escapeHtml(roles)
                    : escapeHtml(state.lang === 'en' ? 'No special roles' : 'Sem cargos especiais')
                }
              </div>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted);">
              ${
                joined
                  ? `<div>${
                      state.lang === 'en' ? 'Joined:' : 'Entrou em:'
                    } ${escapeHtml(String(joined))}</div>`
                  : ''
              }
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.innerHTML = html;

  // Store as current editable set (per guild)
  state.gameNewsFeedsByGuild[guildId] = items;

  // Click -> open modal editor
  listEl.querySelectorAll('[data-feed-idx]').forEach((el) => {
    el.addEventListener('click', async () => {
      const idx = Number(el.getAttribute('data-feed-idx'));
      const feed = items[idx];
      if (!feed) return;
      await openGameNewsFeedModal({ guildId, feed, isNew: false });
    });
  });
}


// ==== CONFIG TAB (/api/guilds/:guildId/meta + /config) ====

async function loadGuildConfig() {
  const guildPicker = document.getElementById('guildPicker');
  const statusEl = document.getElementById('configStatus');
  const logSelect = document.getElementById('configLogChannel');
  const dashLogSelect = document.getElementById('configDashboardLogChannel');
  const staffSelect = document.getElementById('configStaffRoles');

  if (!guildPicker || !logSelect || !dashLogSelect || !staffSelect) return;

  const guildId = guildPicker.value || '';
  if (!guildId) {
    if (statusEl) statusEl.textContent = t('warn_select_guild');
    return;
  }

  const headers = getAuthHeaders();

  // Metadados (canais + roles)
  let meta;
  try {
    const metaResp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/meta`, { headers });
    if (!metaResp.ok) throw new Error('HTTP ' + metaResp.status);
    meta = await metaResp.json();
  } catch (err) {
    console.error('Erro a carregar meta do servidor:', err);
    if (statusEl) {
      statusEl.textContent =
        t('config_save_error') || 'Erro ao carregar metadados do servidor.';
    }
    return;
  }

  const channels = Array.isArray(meta.channels) ? meta.channels : [];
  const roles = Array.isArray(meta.roles) ? meta.roles : [];

  logSelect.innerHTML =
    '<option value="">(nenhum)</option>' +
    channels
      .map((c) => `<option value="${escapeHtml(c.id)}">#${escapeHtml(c.name)}</option>`)
      .join('');

  dashLogSelect.innerHTML =
    '<option value="">(nenhum)</option>' +
    channels
      .map((c) => `<option value="${escapeHtml(c.id)}">#${escapeHtml(c.name)}</option>`)
      .join('');

  staffSelect.innerHTML = roles
    .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`)
    .join('');

  // Config atual
  try {
    const cfgResp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`, { headers });
    if (!cfgResp.ok) throw new Error('HTTP ' + cfgResp.status);
    const cfgData = await cfgResp.json();
    const cfg = (cfgData && cfgData.config) || {};

    if (cfg.logChannelId) logSelect.value = cfg.logChannelId;
    if (cfg.dashboardLogChannelId) dashLogSelect.value = cfg.dashboardLogChannelId;

    if (Array.isArray(cfg.staffRoleIds)) {
      Array.from(staffSelect.options).forEach((opt) => {
        opt.selected = cfg.staffRoleIds.includes(opt.value);
      });
    }
    if (statusEl) statusEl.textContent = '';
  } catch (err) {
    console.error('Erro a carregar config do servidor:', err);
    if (statusEl) {
      statusEl.textContent =
        t('config_save_error') || 'Erro ao carregar configuracao do servidor.';
    }
  }
}

async function saveGuildConfig() {
  const guildPicker = document.getElementById('guildPicker');
  const statusEl = document.getElementById('configStatus');
  const logSelect = document.getElementById('configLogChannel');
  const dashLogSelect = document.getElementById('configDashboardLogChannel');
  const staffSelect = document.getElementById('configStaffRoles');

  const guildId = guildPicker?.value || '';
  if (!guildId) {
    if (statusEl) statusEl.textContent = t('warn_select_guild');
    return;
  }

  const headers = getAuthHeaders();
  headers['Content-Type'] = 'application/json';

  const staffRoleIds = Array.from(staffSelect.selectedOptions).map((o) => o.value);

  const body = {
    logChannelId: logSelect.value || null,
    dashboardLogChannelId: dashLogSelect.value || null,
    staffRoleIds
  };

  try {
    const resp = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      if (statusEl) {
        statusEl.textContent =
          t('config_save_error') || 'Erro ao guardar configuracao.';
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent =
        t('config_save_ok') || 'Configuracao guardada com sucesso.';
    }
  } catch (err) {
    console.error('Erro a guardar config do servidor:', err);
    if (statusEl) {
      statusEl.textContent =
        t('config_save_error') || 'Erro ao guardar configuracao.';
    }
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  // idioma inicial
  const saved = (localStorage.getItem('OZARK_LANG_SIMPLE') || 'pt').toLowerCase();
  state.lang = saved;
  const lp = document.getElementById('langPicker');
  if (lp) lp.value = saved;

  applyI18n();
  initTabs();
  loadOverview().catch((err) => console.error('Erro loadOverview:', err));

  // Guild picker + carregamento de servidores reais
  const guildPicker = document.getElementById('guildPicker');
  if (guildPicker) {
    updateTabAccess();

    guildPicker.addEventListener('change', () => {
      updateTabAccess();

      const activeName = document.querySelector('.tab.active')?.dataset.tab;

      if (activeName === 'overview') {
        loadOverview().catch((err) => console.error('Erro loadOverview (guild change):', err));
      }
      if (activeName === 'logs') {
        loadLogs().catch((err) => console.error('Erro loadLogs (guild change):', err));
      }
      if (activeName === 'cases') {
        loadCases().catch((err) => console.error('Erro loadCases (guild change):', err));
      }
      if (activeName === 'tickets') {
        loadTickets().catch((err) => console.error('Erro loadTickets (guild change):', err));
      }
      if (activeName === 'gamenews') {
        loadGameNewsStatus().catch((err) => console.error('Erro loadGameNewsStatus (guild change):', err));
        loadGameNewsFeedsEditor().catch((err) => console.error('Erro loadGameNewsFeedsEditor (guild change):', err));
      }
      if (activeName === 'user') {
        loadUsers().catch((err) => console.error('Erro loadUsers (guild change):', err));
      }
      if (activeName === 'config') {
        loadGuildConfig().catch((err) => console.error('Erro loadGuildConfig (guild change):', err));
      }
    });

    // Carrega lista de servidores apos DOM estar pronto
    loadGuilds().catch((err) => console.error('Erro loadGuilds:', err));
  } else {
    updateTabAccess();
  }

  // Listener de idioma
  const langPicker = document.getElementById('langPicker');
  if (langPicker) {
    langPicker.addEventListener('change', (e) => {
      setLang(e.target.value);
      console.log(t('language_changed'));
    });
  }

  // Botao "Recarregar" nos logs
  const reloadBtn = document.getElementById('btnReloadLogs');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      loadLogs().catch((err) => console.error('Erro loadLogs (reload):', err));
    });
  }

  // Enter no campo de pesquisa dispara reload
  const searchEl = document.getElementById('logSearch');
  if (searchEl) {
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadLogs().catch((err) => console.error('Erro loadLogs (enter search):', err));
      }
    });
  }

  // Botoes do editor de GameNews
  const btnAddFeed = document.getElementById('btnAddGameNewsFeed');
  if (btnAddFeed) {
    btnAddFeed.addEventListener('click', async () => {
      const guildPicker = document.getElementById('guildPicker');
      const guildId = guildPicker?.value || '';
      if (!guildId) {
        toast(state.lang === 'en' ? 'Select a server first.' : 'Seleciona um servidor primeiro.');
        return;
      }
      await openGameNewsFeedModal({ guildId, feed: {}, isNew: true });
    });
  }

  const btnSaveFeeds = document.getElementById('btnSaveGameNewsFeeds');
  if (btnSaveFeeds) {
    btnSaveFeeds.addEventListener('click', () => {
      saveGameNewsFeeds().catch((err) => console.error('Erro saveGameNewsFeeds:', err));
    });
  }


  // Botoes de configuracao do servidor
  const btnReloadCfg = document.getElementById('btnReloadGuildConfig');
  if (btnReloadCfg) {
    btnReloadCfg.addEventListener('click', () => {
      loadGuildConfig().catch((err) => console.error('Erro loadGuildConfig (reload):', err));
    });
  }

  const btnSaveCfg = document.getElementById('btnSaveGuildConfig');
  if (btnSaveCfg) {
    btnSaveCfg.addEventListener('click', () => {
      saveGuildConfig().catch((err) => console.error('Erro saveGuildConfig:', err));
    });
  }
});