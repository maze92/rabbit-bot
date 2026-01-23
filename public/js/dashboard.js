// Estado simples
const state = {
  lang: 'pt',
};

// Traduções
const I18N = {
  pt: {
    // Topbar / layout
    app_subtitle: 'Painel de gestão e moderação',
    select_guild: 'Selecione um servidor',
    badge_bot_online: '● Bot online',

    // Tabs
    tab_overview: 'Visão geral',
    tab_logs: 'Moderação',
    tab_cases: 'Casos',
    tab_tickets: 'Tickets',
    tab_gamenews: 'GameNews',
    tab_user: 'Utilizadores',
    tab_config: 'Configuração',

    // Overview
    overview_title: 'Visão geral',
    overview_hint: 'Resumo de alto nível sobre o estado do bot, servidores ligados e atividade recente.',
    kpi_guilds: 'Servidores ligados',
    kpi_users: 'Utilizadores monitorizados',
    kpi_actions_24h: 'Ações de moderação (últimas 24h)',

    // Logs
    logs_title: 'Hub de moderação',
    logs_hint: 'Consulta centralizada de avisos, mutes, bans e restantes ações de moderação.',
    logs_search_placeholder: 'Procurar por utilizador, moderador ou detalhe do log',
    logs_filter_all: 'Todos os tipos',
    logs_reload: 'Recarregar',
    logs_empty: 'Não existem registos para o filtro atual.',

    // Cases
    cases_title: 'Casos',
    cases_hint: 'Visão consolidada das infrações de cada utilizador ao longo do tempo.',
    cases_empty: 'Ainda não existem casos registados para este servidor.',

    // Tickets
    tickets_title: 'Tickets',
    tickets_hint: 'Gestão de pedidos de suporte e tickets abertos nos servidores configurados.',
    tickets_empty: 'Não foram encontrados tickets para o período selecionado.',

    // GameNews
    gamenews_title: 'GameNews',
    gamenews_hint: 'Estado dos feeds de notícias, últimos envios e potenciais falhas na publicação.',
    gamenews_empty: 'Nenhum feed de GameNews se encontra configurado neste momento.',

    // Users
    users_title: 'Utilizadores',
    users_hint: 'Consulta rápida de métricas, histórico de casos e ações aplicadas a cada utilizador.',
    users_empty: 'Selecione um servidor para listar e analisar os respetivos utilizadores.',

    // Config
    config_title: 'Configuração do servidor',
    config_hint: 'Defina canais, cargos de staff e preferências de registo para este servidor.',
    config_empty: 'Em breve: integração direta com a API do OzarkBot para guardar estas definições.',

    // Mensagens auxiliares
    warn_select_guild: 'Selecione um servidor para aceder às restantes secções.',
    language_changed: 'Idioma alterado.',
  },

  en: {
    // Topbar / layout
    app_subtitle: 'Moderation and management dashboard',
    select_guild: 'Select a server',
    badge_bot_online: '● Bot online',

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

    // Cases
    cases_title: 'Cases',
    cases_hint: 'Consolidated view of each user’s infractions over time.',
    cases_empty: 'No cases have been registered for this server yet.',

    // Tickets
    tickets_title: 'Tickets',
    tickets_hint: 'Manage support requests and open tickets across your configured guilds.',
    tickets_empty: 'No tickets were found for the selected period.',

    // GameNews
    gamenews_title: 'GameNews',
    gamenews_hint: 'Status of news feeds, recent posts and any delivery failures.',
    gamenews_empty: 'No GameNews feeds are configured at the moment.',

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

// Tabs
function setTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });

  document.querySelectorAll('.section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `tab-${name}`);
  });
}

// Bloqueio de tabs sem servidor (versão simples + garantida)
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

    // se por algum motivo estivermos numa tab que exige guild, volta para overview
    const active = document.querySelector('.tab.active');
    const activeName = active?.dataset.tab;
    if (activeName && needsGuild.includes(activeName)) {
      setTab('overview');
    }
  } else {
    if (warning) warning.classList.remove('visible');
  }
}

function initTabs() {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;

  tabsEl.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;

    const name = tabEl.dataset.tab;
    if (!name) return;

    const guildPicker = document.getElementById('guildPicker');
    const currentGuild = guildPicker?.value || '';
    const needsGuild = ['logs', 'cases', 'tickets', 'gamenews', 'user', 'config'];

    // ⚠️ BLOQUEIO: se tentar abrir tab que precisa de servidor e não há servidor → não muda
    if (!currentGuild && needsGuild.includes(name)) {
      updateTabAccess(); // garante que o aviso está visível e overview ativa
      return;
    }

    setTab(name);
  });
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

  // Guild picker
  const guildPicker = document.getElementById('guildPicker');
  if (guildPicker) {
    // estado inicial
    updateTabAccess();

    guildPicker.addEventListener('change', () => {
      updateTabAccess();
    });
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
});
