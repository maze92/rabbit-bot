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
      ]
    },
    {
      key: 'levels',
      fields: [
        { type: 'number', name: 'xpMin', label: 'features_xp_min', min: 1, max: 1000 },
        { type: 'number', name: 'xpMax', label: 'features_xp_max', min: 1, max: 1000 },
        { type: 'number', name: 'cooldownSeconds', label: 'features_cooldown', min: 0, max: 86400 },
        { type: 'channel', name: 'announceChannelId', label: 'features_announce_channel' }
      ]
    },
    {
      key: 'starboard',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'number', name: 'threshold', label: 'features_threshold', min: 1, max: 100 },
        { type: 'text', name: 'emoji', label: 'features_emoji', placeholder: '⭐' }
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
        { type: 'publish' }
      ]
    },
    {
      key: 'welcome',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'textarea', name: 'message', label: 'features_message', placeholder: 'Bem-vindo(a) {user} ao {server}!' },
        { type: 'bool', name: 'embed', label: 'features_embed' },
        { type: 'text', name: 'color', label: 'features_color', placeholder: '#7c3aed' },
        { type: 'text', name: 'bannerUrl', label: 'features_banner_url', placeholder: 'https://…' }
      ]
    },
    {
      key: 'goodbye',
      fields: [
        { type: 'channel', name: 'channelId', label: 'features_channel' },
        { type: 'textarea', name: 'message', label: 'features_message', placeholder: '{user} saiu do servidor.' },
        { type: 'bool', name: 'embed', label: 'features_embed' },
        { type: 'text', name: 'color', label: 'features_color', placeholder: '#ef4444' },
        { type: 'text', name: 'bannerUrl', label: 'features_banner_url', placeholder: 'https://…' }
      ]
    },
    {
      key: 'serverStats',
      fields: [
        { type: 'text', name: 'memberTemplate', label: 'features_stats_member', placeholder: '👥 Membros: {count}' },
        { type: 'text', name: 'joinsTemplate', label: 'features_stats_joins', placeholder: '📥 Entradas (7d): {count}' },
        { type: 'text', name: 'leavesTemplate', label: 'features_stats_leaves', placeholder: '📤 Saídas (7d): {count}' }
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
        '<textarea class="input" rows="3" maxlength="500" data-field="' + esc(field.name) + '"' +
          (field.placeholder ? ' placeholder="' + esc(field.placeholder) + '"' : '') +
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
      '<input class="input" type="text" data-field="' + esc(field.name) + '" maxlength="64"' +
        (field.placeholder ? ' placeholder="' + esc(field.placeholder) + '"' : '') +
        ' value="' + esc(v) + '" />' +
      '</div>';
  }

  function cardHtml(feature) {
    var v = current[feature.key] || {};
    var enabled = v.enabled === true;

    var fields = (feature.fields || []).map(function (f) {
      return fieldHtml(feature.key, f, v[f.name]);
    }).join('');

    var hasPublish = (feature.fields || []).some(function (f) { return f.type === 'publish'; });
    var publishLabel = (current[feature.key] && current[feature.key].messageId) ? t('features_republish') : t('features_publish');
    var actionsRight = hasPublish
      ? '<button class="btn xs" type="button" data-role="publish">' + esc(publishLabel) + '</button>'
      : '';

    // Chaves construídas fora do t(...) para o audit i18n não as interpretar como literais.
    var nameKey = 'feature_' + snake(feature.key) + '_name';
    var descKey = 'feature_' + snake(feature.key) + '_desc';

    // Só faz sentido avisar "ativa para configurar" quando a funcionalidade tem campos.
    var hasFields = !!(feature.fields && feature.fields.length);
    var offHintHtml = hasFields
      ? '<p class="hint' + (enabled ? ' hidden' : '') + '" data-role="off-hint">' + esc(t('features_disabled_hint')) + '</p>'
      : '';

    return '' +
      '<article class="feature-card' + (enabled ? '' : ' is-off') + '" data-feature="' + esc(feature.key) + '">' +
        '<div class="feature-card__head">' +
          '<label class="switch" title="' + esc(t('features_enabled')) + '">' +
            '<input type="checkbox" data-role="enabled"' + (enabled ? ' checked' : '') + ' />' +
            '<span class="slider"></span>' +
          '</label>' +
          '<h3 class="feature-card__name">' + esc(t(nameKey)) + '</h3>' +
          '<button type="button" class="icon-btn feature-card__toggle" data-role="toggle" aria-expanded="false" aria-controls="feature-body-' + esc(feature.key) + '" title="' + esc(t('features_details')) + '">▾</button>' +
        '</div>' +
        '<p class="hint">' + esc(t(descKey)) + '</p>' +
        '<div class="feature-card__body hidden" id="feature-body-' + esc(feature.key) + '">' +
          (fields ? '<div class="feature-card__fields">' + fields + '</div>' : '') +
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
    Array.prototype.slice.call(grid.querySelectorAll('.feature-card')).forEach(wireCard);
  }

  // -----------------------------
  // Interação
  // -----------------------------

  function cardFor(key) {
    var grid = byId('featuresGrid');
    return grid ? grid.querySelector('.feature-card[data-feature="' + key + '"]') : null;
  }

  function applyDisabled(card) {
    if (!card) return;
    var enabledEl = card.querySelector('[data-role="enabled"]');
    var on = !!(enabledEl && enabledEl.checked);
    card.classList.toggle('is-off', !on);
    var offHint = card.querySelector('[data-role="off-hint"]');
    if (offHint) offHint.classList.toggle('hidden', on);
    Array.prototype.slice.call(card.querySelectorAll('[data-field], [data-entry], [data-role="save"], [data-role="test"], [data-role="add-entry"], [data-role="entry-remove"], [data-role="publish"]')).forEach(function (el) {
      el.disabled = !on;
    });
  }

  function wireCard(card) {
    var key = card.getAttribute('data-feature');
    var feature = FEATURES.filter(function (f) { return f.key === key; })[0];
    if (!feature) return;

    var toggle = card.querySelector('[data-role="toggle"]');
    var body = card.querySelector('.feature-card__body');
    var enabledEl = card.querySelector('[data-role="enabled"]');
    var saveBtn = card.querySelector('[data-role="save"]');
    var testBtn = card.querySelector('[data-role="test"]');
    var publishBtn = card.querySelector('[data-role="publish"]');
    var addEntryBtn = card.querySelector('[data-role="add-entry"]');
    var entriesBox = card.querySelector('[data-role="entries"]');

    if (toggle && body) {
      toggle.addEventListener('click', function () {
        var isHidden = body.classList.toggle('hidden');
        toggle.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
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
      publishBtn.addEventListener('click', function () { publishVerification(); });
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

  function updateMessageIdLabel() {
    var card = cardFor('verification');
    if (!card) return;
    var label = card.querySelector('[data-role="message-id"]');
    if (!label) return;
    var id = current.verification && current.verification.messageId ? String(current.verification.messageId) : '';
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
        if (statusEl) statusEl.textContent = t('features_saved');
        notify(t('features_saved'), { type: 'success' });
      }
      if (key === 'verification') updateMessageIdLabel();
      return true;
    } catch (err) {
      console.error('Feature save error', err);
      if (statusEl) statusEl.textContent = '';
      notify(t('features_save_error'), { type: 'error' });
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
      notify(t('features_test_error'), { type: 'error' });
    } finally {
      if (btn) btn.disabled = false;
      applyDisabled(card);
    }
  }

  async function publishVerification() {
    var gid = guildId();
    if (!gid) return;

    var card = cardFor('verification');
    var btn = card ? card.querySelector('[data-role="publish"]') : null;
    if (btn) btn.disabled = true;

    try {
      var res = await NS.apiPost('/features/verification/publish', { guildId: gid });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      if (res.value) current.verification = res.value;
      updateMessageIdLabel();
      notify(t('features_publish_ok'), { type: 'success' });
    } catch (err) {
      console.error('Verification publish error', err);
      notify(t('features_publish_error'), { type: 'error' });
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
})();
