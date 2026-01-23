// Estado simples
const state = {
  lang: 'pt',
};

// Traduções
const I18N = {
  pt: {
    app_subtitle: 'Painel de gestão e moderação',
    select_guild: 'Selecione um servidor',
    badge_bot_online: '● Bot online',

    tab_overview: 'Visão geral',
    tab_logs: 'Moderação',
    tab_cases: 'Casos',
    tab_tickets: 'Tickets',
    tab_gamenews: 'GameNews',
    tab_user: 'Utilizadores',
    tab_config: 'Configuração',

    overview_title: 'Visão geral',
    overview_hint: 'Resumo rápido do estado do bot, servidores e atividades recentes.',
    kpi_guilds: 'Servidores ligados',
    kpi_users: 'Utilizadores monitorizados',
    kpi_actions_24h: 'Ações de moderação (24h)',

    logs_title: 'Hub de moderação',
    logs_hint: 'Consulta de avisos, mutes, bans e outros eventos de moderação.',
    logs_search_placeholder: 'Procurar utilizador ou moderador',
    logs_filter_all: 'Todos os tipos',
    logs_reload: 'Recarregar',
    logs_empty: 'Sem logs para o filtro atual.',

    cases_title: 'Casos',
    cases_hint: 'Histórico de infrações agregadas por utilizador.',
    cases_empty: 'Ainda não existem casos registados.',

    tickets_title: 'Tickets',
    tickets_hint: 'Gestão de pedidos de suporte e tickets abertos nos servidores.',
    tickets_empty: 'Nenhum ticket encontrado.',

    gamenews_title: 'GameNews',
    gamenews_hint: 'Estado dos feeds de notícias e últimos envios para o Discord.',
    gamenews_empty: 'Nenhum feed configurado.',

    users_title: 'Utilizadores',
    users_hint: 'Consulta rápida de métricas e histórico de cada utilizador.',
    users_empty: 'Selecione um servidor para ver utilizadores.',

    config_title: 'Configuração do servidor',
    config_hint: 'Ajuste canais, cargos de staff e preferências de registo.',
    config_empty: 'Em breve: integração com a API do OzarkBot para guardar definições.',

    language_changed: 'Idioma alterado.',
  },
  en: {
    app_subtitle: 'Moderation & management panel',
    select_guild: 'Select a server',
    badge_bot_online: '● Bot online',

    tab_overview: 'Overview',
    tab_logs: 'Moderation',
    tab_cases: 'Cases',
    tab_tickets: 'Tickets',
    tab_gamenews: 'GameNews',
    tab_user: 'Users',
    tab_config: 'Configuration',

    overview_title: 'Overview',
    overview_hint: 'Quick summary of bot status, guilds and recent activity.',
    kpi_guilds: 'Connected guilds',
    kpi_users: 'Monitored users',
    kpi_actions_24h: 'Moderation actions (24h)',

    logs_title: 'Moderation hub',
    logs_hint: 'Inspect warns, mutes, bans and other moderation events.',
    logs_search_placeholder: 'Search by user or moderator',
    logs_filter_all: 'All types',
    logs_reload: 'Reload',
    logs_empty: 'No logs for the current filter.',

    cases_title: 'Cases',
    cases_hint: 'History of infractions grouped by user.',
    cases_empty: 'No cases have been registered yet.',

    tickets_title: 'Tickets',
    tickets_hint: 'Manage support requests and open tickets across guilds.',
    tickets_empty: 'No tickets found.',

    gamenews_title: 'GameNews',
    gamenews_hint: 'Status of news feeds and latest posts sent to Discord.',
    gamenews_empty: 'No feeds configured.',

    users_title: 'Users',
    users_hint: 'Quick view of metrics and history per user.',
    users_empty: 'Select a server to list users.',

    config_title: 'Server configuration',
    config_hint: 'Adjust channels, staff roles and logging preferences.',
    config_empty: 'Coming soon: direct integration with OzarkBot API.',

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

function initTabs() {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;

  tabsEl.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;
    const name = tabEl.dataset.tab;
    if (!name) return;
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

  // Listener de idioma
  const langPicker = document.getElementById('langPicker');
  if (langPicker) {
    langPicker.addEventListener('change', (e) => {
      setLang(e.target.value);
      // opcional: pequeno aviso visual
      console.log(t('language_changed'));
    });
  }
});
