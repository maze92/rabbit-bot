// public/js/dashboard.features.js
//
// Tab "Funcionalidades": renderiza e guarda as funcionalidades opcionais
// definidas em GuildConfig.features. Cada funcionalidade tem um interruptor
// independente e uma área de configuração própria.

(function () {
  'use strict';

  var NS = (window.OzarkDashboard = window.OzarkDashboard || {});

  function byId(id) { return document.getElementById(id); }
  function t(key, params) { return NS.t ? NS.t(key, params) : key; }
  function esc(v) { return NS.escapeHtml ? NS.escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v); }
  function notify(msg, opts) { if (typeof NS.toast === 'function') NS.toast(msg, opts); }
  function guildId() { return (NS.state && NS.state.guildId) ? NS.state.guildId : null; }
  // camelCase -> snake_case (ex.: messageLogs -> message_logs), para casar as chaves i18n.
  function snake(s) { return String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(); }
  var premiumActive = false;
  var staticPremiumCards = null;

  function getStaticPremiumCards() {
    if (staticPremiumCards) return staticPremiumCards;
    var source = byId('extrasGrid');
    staticPremiumCards = source
      ? Array.prototype.filter.call(source.children, function (child) {
        return child.classList && child.classList.contains('feature-card');
      })
      : [];
    return staticPremiumCards;
  }

  function appendStaticPremiumCards(grid) {
    getStaticPremiumCards().forEach(function (card) {
      grid.appendChild(card);
    });
  }

  var FEATURES = [
    {
      key: 'messageLogs',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'bool', name: 'ignoreBots', label: 'features_ignore_bots' }
      ]
    },
    {
      key: 'reactionRoles',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'text', name: 'messageId', label: 'features_message_id' },
        { type: 'entries' }
      ]
    },
    {
      key: 'autoKick',
      fields: [
        { type: 'number', name: 'infractionsToKick', label: 'features_infractions', min: 1, max: 100 }
      ],
      presets: [
        { id: 'soft', label: 'preset_autokick_soft', values: { infractionsToKick: 5 } },
        { id: 'strict', label: 'preset_autokick_strict', values: { infractionsToKick: 3 } },
        { id: 'severe', label: 'preset_autokick_severe', values: { infractionsToKick: 1 } }
      ]
    },
    {
      key: 'levels',
      fields: [
        { type: 'number', name: 'xpMin', label: 'features_xp_min', min: 1, max: 1000 },
        { type: 'number', name: 'xpMax', label: 'features_xp_max', min: 1, max: 1000 },
        { type: 'number', name: 'cooldownSeconds', label: 'features_cooldown', min: 0, max: 86400 },
        { type: 'channel', name: 'announceChannelId', label: 'features_announce_channel' }
      ],
      presets: [
        { id: 'casual', label: 'preset_levels_casual', values: { xpMin: 15, xpMax: 25, cooldownSeconds: 60 } },
        { id: 'fast', label: 'preset_levels_fast', values: { xpMin: 30, xpMax: 50, cooldownSeconds: 30 } },
        { id: 'slow', label: 'preset_levels_slow', values: { xpMin: 5, xpMax: 10, cooldownSeconds: 180 } }
      ]
    },
    {
      key: 'starboard',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'number', name: 'threshold', label: 'features_threshold', min: 1, max: 100 },
        { type: 'text', name: 'emoji', label: 'features_emoji', placeholder: '⭐' }
      ],
      presets: [
        { id: 'classic', label: 'preset_starboard_classic', values: { threshold: 3, emoji: '⭐' } },
        { id: 'strict', label: 'preset_starboard_strict', values: { threshold: 5, emoji: '⭐' } },
        { id: 'easy', label: 'preset_starboard_easy', values: { threshold: 2, emoji: '🔥' } }
      ]
    },
    {
      key: 'polls',
      fields: []
    },
    {
      key: 'verification',
      fields: [
        { type: 'role', name: 'roleId', label: 'features_role' },
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'number', name: 'kickAfterMinutes', label: 'features_kick_after', min: 0, max: 10080 },
        { type: 'text', name: 'title', label: 'features_title', placeholderKey: 'features_placeholder_verify_title', maxLength: 120 },
        { type: 'textarea', name: 'description', label: 'features_description', placeholderKey: 'features_placeholder_verify_description', maxLength: 500 },
        { type: 'text', name: 'buttonLabel', label: 'features_button_label', placeholderKey: 'features_placeholder_verify_button', maxLength: 80 },
        { type: 'publish' }
      ],
      presets: [
        { id: 'never', label: 'preset_verify_never', values: { kickAfterMinutes: 0 } },
        { id: 'hour', label: 'preset_verify_hour', values: { kickAfterMinutes: 60 } },
        { id: 'day', label: 'preset_verify_day', values: { kickAfterMinutes: 1440 } },
        { id: 'week', label: 'preset_verify_week', values: { kickAfterMinutes: 10080 } }
      ]
    },
    {
      key: 'tickets',
      premiumModule: 'tickets',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'text', name: 'openEmoji', label: 'features_open_emoji', placeholderKey: 'features_placeholder_ticket_open_emoji', maxLength: 64 },
        { type: 'text', name: 'closeEmoji', label: 'features_close_emoji', placeholderKey: 'features_placeholder_ticket_close_emoji', maxLength: 64 },
        { type: 'text', name: 'panelTitle', label: 'features_title', placeholderKey: 'features_placeholder_ticket_title', maxLength: 120 },
        { type: 'textarea', name: 'panelDescription', label: 'features_description', placeholderKey: 'features_placeholder_ticket_description', maxLength: 500 },
        { type: 'textarea', name: 'alreadyOpenMessage', label: 'features_already_open_message', placeholderKey: 'features_placeholder_ticket_already_open', maxLength: 300 },
        { type: 'textarea', name: 'welcomeMessage', label: 'features_welcome_message', placeholderKey: 'features_placeholder_ticket_welcome', maxLength: 1200 },
        { type: 'textarea', name: 'closeMessage', label: 'features_close_message', placeholderKey: 'features_placeholder_ticket_close', maxLength: 300 },
        { type: 'publish' }
      ]
    },
    {
      key: 'welcome',
      preview: 'welcome',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'textarea', name: 'message', label: 'features_message', placeholderKey: 'features_placeholder_welcome_message', maxLength: 500 },
        { type: 'bool', name: 'embed', label: 'features_embed' },
        { type: 'text', name: 'color', label: 'features_color', placeholderKey: 'features_placeholder_welcome_color' },
        { type: 'text', name: 'bannerUrl', label: 'features_banner_url', placeholderKey: 'features_placeholder_banner_url' }
      ],
      presets: [
        { id: 'plain', label: 'preset_welcome_plain', values: { embed: false, message: 'Bem-vindo(a) {user} ao {server}! Já somos {memberCount} membros.', color: '#7c3aed' } },
        { id: 'card', label: 'preset_welcome_card', values: { embed: true, message: 'Bem-vindo(a) {user} ao {server}! Já somos {memberCount} membros.', color: '#7c3aed' } },
        { id: 'vip', label: 'preset_welcome_vip', values: { embed: true, message: 'Que bom ter-te por cá, {user}! Entraste no {server} e já somos {memberCount}. Lê as regras e diverte-te.', color: '#7c3aed' } }
      ]
    },
    {
      key: 'goodbye',
      preview: 'goodbye',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'textarea', name: 'message', label: 'features_message', placeholderKey: 'features_placeholder_goodbye_message', maxLength: 500 },
        { type: 'bool', name: 'embed', label: 'features_embed' },
        { type: 'text', name: 'color', label: 'features_color', placeholderKey: 'features_placeholder_goodbye_color' },
        { type: 'text', name: 'bannerUrl', label: 'features_banner_url', placeholderKey: 'features_placeholder_banner_url' }
      ],
      presets: [
        { id: 'plain', label: 'preset_goodbye_plain', values: { embed: false, message: '{user} saiu do servidor.', color: '#ef4444' } },
        { id: 'card', label: 'preset_goodbye_card', values: { embed: true, message: 'Até à próxima, {user}. O {server} ficou com {memberCount} membros.', color: '#ef4444' } }
      ]
    },
    {
      key: 'serverStats',
      fields: [
        { type: 'bool', name: 'showMembers', label: 'features_stats_show_members' },
        { type: 'text', name: 'memberTemplate', label: 'features_stats_member', placeholderKey: 'features_placeholder_stats_member', maxLength: 100 },
        { type: 'bool', name: 'showJoins', label: 'features_stats_show_joins' },
        { type: 'text', name: 'joinsTemplate', label: 'features_stats_joins', placeholderKey: 'features_placeholder_stats_joins', maxLength: 100 },
        { type: 'bool', name: 'showLeaves', label: 'features_stats_show_leaves' },
        { type: 'text', name: 'leavesTemplate', label: 'features_stats_leaves', placeholderKey: 'features_placeholder_stats_leaves', maxLength: 100 }
      ],
      presets: [
        { id: 'members', label: 'preset_stats_members', values: { showMembers: true, showJoins: false, showLeaves: false, memberTemplate: '👥 Membros: {count}' } },
        { id: 'emojis', label: 'preset_stats_emojis', values: { showMembers: true, showJoins: true, showLeaves: true, memberTemplate: '👥 {count} membros', joinsTemplate: '📥 +{count} (7d)', leavesTemplate: '📤 -{count} (7d)' } },
        { id: 'plain', label: 'preset_stats_plain', values: { showMembers: true, showJoins: true, showLeaves: true, memberTemplate: 'Membros: {count}', joinsTemplate: 'Entradas 7d: {count}', leavesTemplate: 'Saídas 7d: {count}' } }
      ]
    }
  ];

  var current = {};      // Valores carregados da API (por funcionalidade).
  var channels = null;   // Cache de canais do guild.
  var roles = null;      // Cache de cargos do guild.
  var metaGuildId = null;
  var loading = false;

  // -----------------------------
  // Helpers de render
  // -----------------------------

  function optionList(items, selected, noneLabel, isRole) {
    var html = '<option value="">' + esc(noneLabel) + '</option>';
    var sel = String(selected == null ? '' : selected);
    (items || []).forEach(function (it) {
      if (!it || !it.id) return;
      var id = String(it.id);
      var name = it.name ? String(it.name) : id;
      var label = isRole ? ('@' + name) : ('#' + name);
      html += '<option value="' + esc(id) + '"' + (sel === id ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    return html;
  }

  function entryRowHtml(entry) {
    var emoji = entry && entry.emoji ? String(entry.emoji) : '';
    var roleId = entry && entry.roleId ? String(entry.roleId) : '';
    return '' +
      '<div class="feature-entry" data-role="entry-row">' +
        '<input class="input" type="text" data-entry="emoji" maxlength="64" placeholder="' + esc(t('features_placeholder_emoji')) + '" value="' + esc(emoji) + '" />' +
        '<select class="select" data-entry="roleId">' + optionList(roles, roleId, t('features_role'), true) + '</select>' +
        '<button type="button" class="btn xs danger" data-role="entry-remove">' + esc(t('features_remove')) + '</button>' +
      '</div>';
  }

  function fieldHtml(feature, field, value) {
    var v = value == null ? '' : value;
    var placeholder = field.placeholderKey ? t(field.placeholderKey) : field.placeholder;

    if (field.type === 'channel' || field.type === 'role') {
      var items = field.type === 'channel' ? channels : roles;
      return '<div class="field">' +
        '<label>' + esc(t(field.label)) + '</label>' +
        '<select class="select" data-field="' + esc(field.name) + '">' + optionList(items, v, t(field.type === 'channel' ? 'select_channel' : 'features_role'), field.type === 'role') + '</select>' +
        '</div>';
    }

    if (field.type === 'number') {
      return '<div class="field">' +
        '<label>' + esc(t(field.label)) + '</label>' +
        '<input class="input" type="number" data-field="' + esc(field.name) + '"' +
          (typeof field.min === 'number' ? ' min="' + field.min + '"' : '') +
          (typeof field.max === 'number' ? ' max="' + field.max + '"' : '') +
          ' value="' + esc(v) + '" />' +
        '</div>';
    }

    if (field.type === 'textarea') {
      return '<div class="field field--full">' +
        '<label>' + esc(t(field.label)) + '</label>' +
        '<textarea class="input" rows="3" data-field="' + esc(field.name) + '"' +
          (typeof field.maxLength === 'number' ? ' maxlength="' + field.maxLength + '"' : '') +
          (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
          '>' + esc(v) + '</textarea>' +
        '</div>';
    }

    if (field.type === 'bool') {
      var checked = value === true;
      return '<div class="field">' +
        '<label class="switch"><input type="checkbox" data-field="' + esc(field.name) + '"' + (checked ? ' checked' : '') + ' /><span class="slider"></span></label>' +
        '<span class="switch-label">' + esc(t(field.label)) + '</span>' +
        '</div>';
    }

    if (field.type === 'entries') {
      var entries = Array.isArray(value) ? value : [];
      var rows = entries.map(entryRowHtml).join('');
      return '<div class="field">' +
        '<label>' + esc(t('features_entries')) + '</label>' +
        '<div class="feature-entries" data-role="entries">' + rows + '</div>' +
        '<button type="button" class="btn xs" data-role="add-entry">' + esc(t('features_add_entry')) + '</button>' +
        '</div>';
    }

    if (field.type === 'publish') {
      var messageId = (current[feature] && current[feature].messageId) ? String(current[feature].messageId) : '';
      return '<div class="feature-card__publish">' +
        '<div class="hint" data-role="message-id">' + (messageId ? esc(t('features_message_published', { id: messageId })) : '') + '</div>' +
        '</div>';
    }

    return '<div class="field">' +
      '<label>' + esc(t(field.label)) + '</label>' +
      '<input class="input" type="text" data-field="' + esc(field.name) + '"' +
        (typeof field.maxLength === 'number' ? ' maxlength="' + field.maxLength + '"' : ' maxlength="64"') +
        (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
        ' value="' + esc(v) + '" />' +
      '</div>';
  }

  // -----------------------------
  // Pré-visualização de embeds (boas-vindas / saída)
  // -----------------------------

  function sampleGuildName() {
    var gid = guildId();
    var list = (NS.state && NS.state.guilds) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === gid) return list[i].name || 'Servidor';
    }
    return 'Servidor';
  }

  // Substitui os placeholders por valores de exemplo, iguais aos que o bot usa.
  function applySampleVars(text) {
    return String(text || '')
      .replace(/\{user\}/g, '@Membro')
      .replace(/\{username\}/g, 'Membro')
      .replace(/\{tag\}/g, 'Membro')
      .replace(/\{server\}/g, sampleGuildName())
      .replace(/\{memberCount\}/g, '1 234');
  }

  function escNl(v) { return esc(v).replace(/\n/g, '<br>'); }

  function readCardField(card, name) {
    return card.querySelector('[data-field="' + name + '"]');
  }

  function renderEmbedPreview(card, feature, box) {
    var msgEl = readCardField(card, 'message');
    var colorEl = readCardField(card, 'color');
    var embedEl = readCardField(card, 'embed');
    var bannerEl = readCardField(card, 'bannerUrl');

    var message = applySampleVars(msgEl ? msgEl.value : '');
    var color = colorEl ? String(colorEl.value || '').trim() : '';
    var isEmbed = embedEl ? !!embedEl.checked : false;
    var banner = bannerEl ? String(bannerEl.value || '').trim() : '';

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      color = feature.preview === 'goodbye' ? '#ef4444' : '#7c3aed';
    }

    var emptyHtml = '<span class="embed-preview__empty">' + esc(t('preview_empty')) + '</span>';

    if (!isEmbed) {
      box.classList.add('embed-preview--plain');
      box.innerHTML = '<div class="embed-preview__plain">' + (message ? escNl(message) : emptyHtml) + '</div>';
      return;
    }

    box.classList.remove('embed-preview--plain');
    box.style.setProperty('--embed-accent', color);

    var footer = feature.preview === 'goodbye'
      ? t('preview_footer_goodbye')
      : t('preview_footer_welcome');
    var title = feature.preview === 'goodbye'
      ? t('preview_goodbye_title')
      : t('preview_welcome_title');

    box.innerHTML =
      '<div class="embed-preview__box">' +
        '<div class="embed-preview__content">' +
          '<div class="embed-preview__author">' +
            '<span class="embed-preview__avatar" aria-hidden="true"></span>' +
            '<span class="embed-preview__author-name">' + esc(sampleGuildName()) + '</span>' +
          '</div>' +
          '<div class="embed-preview__title">' + esc(title) + '</div>' +
          '<div class="embed-preview__desc">' + (message ? escNl(message) : emptyHtml) + '</div>' +
          (/^https?:\/\//i.test(banner) ? '<img class="embed-preview__image" src="' + esc(banner) + '" alt="" />' : '') +
          '<div class="embed-preview__footer">' +
            '<span>' + esc(footer) + '</span>' +
            '<span class="embed-preview__time">' + esc(t('preview_now')) + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="embed-preview__thumb" aria-hidden="true"></span>' +
      '</div>';
  }

  function cardHtml(feature) {
    var v = current[feature.key] || {};
    var enabled = v.enabled === true;
    var premiumModule = feature.premiumModule ? String(feature.premiumModule) : '';

    var fields = (feature.fields || []).map(function (f) {
      return fieldHtml(feature.key, f, v[f.name]);
    }).join('');

    var hasPublish = (feature.fields || []).some(function (f) { return f.type === 'publish'; });
    var publishLabel = (current[feature.key] && current[feature.key].messageId) ? t('features_republish') : t('features_publish');
    var actionsRight = hasPublish && !(feature.key === 'tickets' && current[feature.key] && current[feature.key].messageId)
      ? '<button class="btn xs" type="button" data-role="publish">' + esc(publishLabel) + '</button>'
      : '';

    // Chaves construídas fora do t(...) para o audit i18n não as interpretar como literais.
    var nameKey = 'feature_' + snake(feature.key) + '_name';
    var descKey = 'feature_' + snake(feature.key) + '_desc';

    // Presets: em vez de preencher tudo à mão, um clique aplica um conjunto
    // de valores recomendados (a configuração continua editável depois).
    var presetsHtml = (feature.presets && feature.presets.length)
      ? '<div class="feature-presets" data-role="presets">' +
          '<span class="feature-presets__label">' + esc(t('features_presets')) + '</span>' +
          feature.presets.map(function (p) {
            return '<button type="button" class="chip preset-chip" data-role="preset" data-preset="' + esc(p.id) + '">' +
              esc(t(p.label)) + '</button>';
          }).join('') +
        '</div>'
      : '';

    // Só faz sentido avisar "ativa para configurar" quando a funcionalidade tem campos.
    var hasFields = !!(feature.fields && feature.fields.length);
    var offHintHtml = hasFields
      ? '<p class="hint' + (enabled ? ' hidden' : '') + '" data-role="off-hint">' + esc(t('features_disabled_hint')) + '</p>'
      : '';

    // Pré-visualização (boas-vindas/saída): espelha o embed enviado ao Discord.
    var previewHtml = feature.preview
      ? '<div class="embed-preview-wrap">' +
          '<span class="feature-presets__label">' + esc(t('preview_label')) + '</span>' +
          '<div class="embed-preview" data-role="preview"></div>' +
        '</div>'
      : '';

    return '' +
      '<article class="feature-card' + (enabled ? '' : ' is-off') + '"' +
        ' data-feature="' + esc(feature.key) + '"' +
        (premiumModule ? ' data-premium="true" data-premium-module="' + esc(premiumModule) + '"' : '') +
      '>' +
        '<div class="feature-card__head">' +
          '<label class="switch" title="' + esc(t('features_enabled')) + '">' +
            '<input type="checkbox" data-role="enabled"' + (enabled ? ' checked' : '') + ' />' +
            '<span class="slider"></span>' +
          '</label>' +
          '<h3 class="feature-card__name">' + esc(t(nameKey)) + '</h3>' +
          (premiumModule
            ? '<button type="button" class="btn xs btn-ghost premium-card__offer hidden" data-premium-action="offer" data-i18n="premium_offer_button" aria-haspopup="dialog">' + esc(t('premium_offer_button')) + '</button>'
            : '') +
          '<button type="button" class="icon-btn feature-card__toggle" data-role="toggle" aria-expanded="false" aria-controls="feature-body-' + esc(feature.key) + '" title="' + esc(t('features_details')) + '">▾</button>' +
        '</div>' +
        '<p class="hint">' + esc(t(descKey)) + '</p>' +
        '<div class="feature-card__body hidden" id="feature-body-' + esc(feature.key) + '">' +
          presetsHtml +
          (fields ? '<div class="feature-card__fields">' + fields + '</div>' : '') +
          previewHtml +
          offHintHtml +
          '<div class="feature-card__actions">' +
            '<div class="feature-card__actions-left">' +
              '<button class="btn xs" type="button" data-role="save">' + esc(t('common_save')) + '</button>' +
              '<button class="btn xs" type="button" data-role="test">' + esc(t('features_test')) + '</button>' +
              '<span class="hint" data-role="status"></span>' +
            '</div>' +
            '<div class="feature-card__actions-right">' + actionsRight + '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render() {
    var grid = byId('featuresGrid');
    if (!grid) return;
    grid.innerHTML = FEATURES.map(cardHtml).join('');
    appendStaticPremiumCards(grid);
    Array.prototype.slice.call(grid.querySelectorAll('.feature-card')).forEach(wireCard);
    applyPremiumState();
  }

  function applyPremiumState(active) {
    if (typeof active === 'boolean') premiumActive = active;
    var grid = byId('featuresGrid');
    if (!grid) return;
    Array.prototype.slice.call(grid.querySelectorAll('.feature-card')).forEach(function (card) {
      if (card.getAttribute('data-premium') === 'true') {
        card.setAttribute('data-premium-locked', premiumActive ? 'false' : 'true');
        var offerButton = card.querySelector('[data-premium-action="offer"]');
        if (offerButton) offerButton.classList.toggle('hidden', premiumActive);
        var detailsToggle = card.querySelector('.feature-card__toggle');
        if (detailsToggle) detailsToggle.classList.toggle('hidden', !premiumActive);
      }
      applyDisabled(card);
    });
  }

  // -----------------------------
  // Interação
  // -----------------------------

  function cardFor(key) {
    var grid = byId('featuresGrid');
    return grid ? grid.querySelector('.feature-card[data-feature="' + key + '"]') : null;
  }

  function setCardExpanded(card, expanded) {
    var body = card && card.querySelector('.feature-card__body');
    var toggle = card && card.querySelector('.feature-card__toggle');
    if (!body || !toggle) return false;

    if (expanded && card.parentElement) {
      Array.prototype.forEach.call(card.parentElement.children, function (sibling) {
        if (sibling !== card && sibling.classList && sibling.classList.contains('is-expanded')) {
          setCardExpanded(sibling, false);
        }
      });
    }

    body.inert = !expanded;
    body.classList.toggle('hidden', !expanded);
    card.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    return expanded;
  }

  function toggleCardDetails(card) {
    var body = card && card.querySelector('.feature-card__body');
    return body ? setCardExpanded(card, body.classList.contains('hidden')) : false;
  }

  function applyDisabled(card) {
    if (!card) return;
    var enabledEl = card.querySelector('[data-role="enabled"]');
    var on = !!(enabledEl && enabledEl.checked);
    var premiumLocked = card.getAttribute('data-premium') === 'true' && !premiumActive;
    card.classList.toggle('is-off', !on);
    card.classList.toggle('is-premium-locked', premiumLocked);
    var offHint = card.querySelector('[data-role="off-hint"]');
    if (offHint) offHint.classList.toggle('hidden', on);
    Array.prototype.slice.call(card.querySelectorAll('[data-field], [data-entry], [data-role="save"], [data-role="test"], [data-role="add-entry"], [data-role="entry-remove"], [data-role="publish"]')).forEach(function (el) {
      el.disabled = !on || premiumLocked;
    });
    if (enabledEl) enabledEl.disabled = premiumLocked;
  }

  function wireCard(card) {
    var key = card.getAttribute('data-feature');
    var feature = FEATURES.filter(function (f) { return f.key === key; })[0];
    if (!feature) return;

    var toggle = card.querySelector('[data-role="toggle"]');
    var enabledEl = card.querySelector('[data-role="enabled"]');
    var saveBtn = card.querySelector('[data-role="save"]');
    var testBtn = card.querySelector('[data-role="test"]');
    var publishBtn = card.querySelector('[data-role="publish"]');
    var addEntryBtn = card.querySelector('[data-role="add-entry"]');
    var entriesBox = card.querySelector('[data-role="entries"]');
    var presetsBox = card.querySelector('[data-role="presets"]');
    var previewBox = card.querySelector('[data-role="preview"]');

    if (toggle) {
      toggle.addEventListener('click', function () {
        toggleCardDetails(card);
      });
    }

    if (enabledEl) {
      enabledEl.addEventListener('change', function () {
        applyDisabled(card);
        saveFeature(key);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () { saveFeature(key); });
    }

    if (testBtn) {
      testBtn.addEventListener('click', function () { testFeature(key); });
    }

    if (publishBtn) {
      publishBtn.addEventListener('click', function () { publishFeature(key); });
    }

    if (addEntryBtn && entriesBox) {
      addEntryBtn.addEventListener('click', function () {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = entryRowHtml(null);
        var row = wrapper.firstChild;
        entriesBox.appendChild(row);
        applyDisabled(card);
      });
    }

    if (presetsBox) {
      presetsBox.addEventListener('click', function (ev) {
        var btn = (ev.target && ev.target.closest) ? ev.target.closest('[data-role="preset"]') : null;
        if (!btn) return;
        applyPreset(key, btn.getAttribute('data-preset'), btn);
      });
    }

    if (previewBox) {
      var refreshPreview = function () { renderEmbedPreview(card, feature, previewBox); };
      var fieldsWrap = card.querySelector('.feature-card__fields');
      if (fieldsWrap) {
        // Atualiza em tempo real enquanto o utilizador escreve/muda as opções.
        fieldsWrap.addEventListener('input', refreshPreview);
        fieldsWrap.addEventListener('change', refreshPreview);
      }
      refreshPreview();
    }

    card.addEventListener('click', function (ev) {
      var target = ev.target;
      if (target && target.closest && target.closest('[data-role="entry-remove"]')) {
        var row = target.closest('[data-role="entry-row"]');
        if (row && row.parentNode) row.parentNode.removeChild(row);
      }
    });

    applyDisabled(card);
  }

  function collect(key) {
    var feature = FEATURES.filter(function (f) { return f.key === key; })[0];
    var card = cardFor(key);
    var prev = current[key] || {};
    var out = {};
    Object.keys(prev).forEach(function (k) { out[k] = prev[k]; });
    if (!feature || !card) return out;

    var enabledEl = card.querySelector('[data-role="enabled"]');
    out.enabled = !!(enabledEl && enabledEl.checked);

    (feature.fields || []).forEach(function (f) {
      if (f.type === 'publish') return;

      if (f.type === 'entries') {
        out.entries = Array.prototype.slice.call(card.querySelectorAll('[data-role="entry-row"]')).map(function (row) {
          var emojiEl = row.querySelector('[data-entry="emoji"]');
          var roleEl = row.querySelector('[data-entry="roleId"]');
          return {
            emoji: emojiEl ? String(emojiEl.value || '').trim() : '',
            roleId: roleEl ? String(roleEl.value || '').trim() : ''
          };
        }).filter(function (e) { return e.emoji && e.roleId; });
        return;
      }

      var el = card.querySelector('[data-field="' + f.name + '"]');
      if (!el) return;

      if (f.type === 'bool') {
        out[f.name] = !!el.checked;
      } else if (f.type === 'number') {
        var n = parseInt(el.value, 10);
        out[f.name] = Number.isFinite(n) ? n : (prev[f.name] != null ? prev[f.name] : null);
      } else {
        var v = String(el.value || '').trim();
        out[f.name] = v ? v : null;
      }
    });

    return out;
  }

  // Aplica um preset: escreve os valores recomendados nos campos, liga a
  // funcionalidade (se estiver desligada) e guarda. A configuração continua
  // editável à mão depois disto.
  async function applyPreset(key, presetId, btn) {
    var feature = FEATURES.filter(function (f) { return f.key === key; })[0];
    var card = cardFor(key);
    if (!feature || !card || !feature.presets) return;

    var preset = feature.presets.filter(function (p) { return p.id === presetId; })[0];
    if (!preset) return;

    if (btn) btn.disabled = true;

    var enabledEl = card.querySelector('[data-role="enabled"]');
    if (enabledEl && !enabledEl.checked) {
      enabledEl.checked = true;
      applyDisabled(card);
    }

    Object.keys(preset.values || {}).forEach(function (name) {
      var el = card.querySelector('[data-field="' + name + '"]');
      if (!el) return;
      var val = preset.values[name];
      if (el.type === 'checkbox') {
        el.checked = val === true;
      } else {
        el.value = val == null ? '' : String(val);
      }
    });

    var previewBox = card.querySelector('[data-role="preview"]');
    if (previewBox) renderEmbedPreview(card, feature, previewBox);

    var ok = await saveFeature(key, true);
    notify(ok ? t('features_preset_applied') : t('features_save_error'), { type: ok ? 'success' : 'error' });

    if (btn) btn.disabled = false;
    applyDisabled(card);
  }

  function updateMessageIdLabel(key) {
    var card = cardFor(key);
    if (!card) return;
    var label = card.querySelector('[data-role="message-id"]');
    if (!label) return;
    var id = current[key] && current[key].messageId ? String(current[key].messageId) : '';
    label.textContent = id ? t('features_message_published', { id: id }) : '';
  }

  async function saveFeature(key, silent) {
    var gid = guildId();
    if (!gid) return;

    var card = cardFor(key);
    var value = collect(key);
    var saveBtn = card ? card.querySelector('[data-role="save"]') : null;
    var statusEl = card ? card.querySelector('[data-role="status"]') : null;

    // Proteção contra duplo clique / pedidos repetidos.
    if (saveBtn) saveBtn.disabled = true;

    try {
      var res = await NS.apiPost('/features', { guildId: gid, feature: key, value: value });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      current[key] = (res && res.value) ? res.value : value;
      if (!silent) {
        if (statusEl) statusEl.textContent = '';
        notify(t('features_saved'), { type: 'success' });
      }
      if (value && Object.prototype.hasOwnProperty.call(value, 'messageId')) updateMessageIdLabel(key);
      return true;
    } catch (err) {
      console.error('Feature save error', err);
      if (statusEl) statusEl.textContent = '';
      notify(t(err && err.apiMessage === 'PREMIUM_REQUIRED' ? 'premium_lock_hint' : 'features_save_error'), { type: 'error' });
      return false;
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      applyDisabled(card);
    }
  }

  // Guarda a configuração atual e envia uma amostra da funcionalidade.
  async function testFeature(key) {
    var gid = guildId();
    if (!gid) return;

    var card = cardFor(key);
    var btn = card ? card.querySelector('[data-role="test"]') : null;
    var statusEl = card ? card.querySelector('[data-role="status"]') : null;
    if (btn) btn.disabled = true;

    try {
      var saved = await saveFeature(key, true);
      if (!saved) throw new Error('SAVE_FAILED');
      var res = await NS.apiPost('/features/' + encodeURIComponent(key) + '/test', { guildId: gid });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      var infoKey = res.info ? ('features_test_info_' + res.info) : 'features_test_ok';
      if (statusEl) statusEl.textContent = t(infoKey);
      notify(t(infoKey), { type: 'success' });
    } catch (err) {
      console.error('Feature test error', err);
      if (statusEl) statusEl.textContent = '';
      notify(t(err && err.apiMessage === 'PREMIUM_REQUIRED' ? 'premium_lock_hint' : 'features_test_error'), { type: 'error' });
    } finally {
      if (btn) btn.disabled = false;
      applyDisabled(card);
    }
  }

  async function publishFeature(key) {
    var gid = guildId();
    if (!gid) return;

    var card = cardFor(key);
    var btn = card ? card.querySelector('[data-role="publish"]') : null;
    if (btn) btn.disabled = true;

    try {
      var saved = await saveFeature(key, true);
      if (!saved) throw new Error('SAVE_FAILED');
      var res = await NS.apiPost('/features/' + encodeURIComponent(key) + '/publish', { guildId: gid });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      if (res.value) current[key] = res.value;
      updateMessageIdLabel(key);
      notify(t('features_publish_ok'), { type: 'success' });
    } catch (err) {
      console.error('Feature publish error', err);
      notify(t(err && err.apiMessage === 'PREMIUM_REQUIRED' ? 'premium_lock_hint' : 'features_publish_error'), { type: 'error' });
    } finally {
      if (btn) btn.disabled = false;
      applyDisabled(card);
    }
  }

  // -----------------------------
  // Carregamento
  // -----------------------------

  async function loadMeta(gid) {
    if (metaGuildId !== gid) {
      channels = null;
      roles = null;
      metaGuildId = gid;
    }
    if (channels && roles) return;

    try {
      var ch = await NS.apiGet('/guilds/' + encodeURIComponent(gid) + '/channels');
      channels = (ch && (ch.items || ch.channels)) ? (ch.items || ch.channels) : [];
    } catch (err) {
      channels = channels || [];
    }

    try {
      var meta = await NS.apiGet('/guilds/' + encodeURIComponent(gid) + '/meta');
      roles = (meta && meta.roles) ? meta.roles : [];
    } catch (err) {
      roles = roles || [];
    }
  }

  async function loadFeatures() {
    var grid = byId('featuresGrid');
    if (!grid) return;

    var gid = guildId();
    if (!gid) {
      grid.innerHTML = '';
      appendStaticPremiumCards(grid);
      return;
    }
    if (loading) return;
    loading = true;

    try {
      await loadMeta(gid);
      var data = await NS.apiGet('/features?guildId=' + encodeURIComponent(gid));
      current = (data && data.features) ? data.features : {};
      render();
    } catch (err) {
      console.error('Features load error', err);
      notify(t('features_load_error'), { type: 'error' });
    } finally {
      loading = false;
    }
  }

  NS.loadFeatures = loadFeatures;
  NS.applyPremiumState = applyPremiumState;
  NS.toggleFeatureCard = toggleCardDetails;
})();
