// public/js/dashboard.freetokeep.js
(function () {
  window.OzarkDashboard = window.OzarkDashboard || {};

  var apiGet = function (p) { return window.OzarkDashboard.apiGet(p); };
  var apiPost = function (p, b) { return window.OzarkDashboard.apiPost(p, b); };
  var t = function (k) { return (window.OzarkDashboard.t ? window.OzarkDashboard.t(k) : k); };
  var toast = function (m, type) { if (window.OzarkDashboard.toast) window.OzarkDashboard.toast(m, type); };
  var setPanelLoading = window.OzarkDashboard.setPanelLoading || function () {};

  function gid() {
    return (window.OzarkDashboard.getGuildId && window.OzarkDashboard.getGuildId()) || (window.OzarkDashboard.state && window.OzarkDashboard.state.guildId) || '';
  }

  var els = {};
  function q(id) { return document.getElementById(id); }

  function readForm() {
    return {
      enabled: !!els.enabled.checked,
      guildId: gid(),
      channelId: els.channel.value || null,
      pollIntervalSeconds: Number(els.interval.value || 60),
      // 0 => unlimited
      maxPerCycle: Number(els.max.value || 0),
      platforms: {
        epic: !!els.epic.checked,
        steam: !!els.steam.checked,
        ubisoft: !!els.ubisoft.checked
      },
      types: {
        keep: !!els.keep.checked,
        weekend: !!els.weekend.checked
      },
      embedOptions: {
        showPrice: !!els.sp.checked,
        showUntil: !!els.su.checked,
        showThumbnail: !!els.st.checked,
        showImage: !!els.si.checked,
        showButtons: !!els.sb.checked,
        showFooter: !!els.sf.checked,
        showSteamClientButton: !!els.sc.checked
      }
    };
  }

  function writeForm(cfg) {
    cfg = cfg || {};
    els.enabled.checked = cfg.enabled === true;
    els.channel.value = cfg.channelId || '';
    els.interval.value = (cfg.pollIntervalSeconds != null ? cfg.pollIntervalSeconds : 60);
    els.max.value = (cfg.maxPerCycle != null ? cfg.maxPerCycle : 0);
    els.epic.checked = !cfg.platforms || cfg.platforms.epic !== false;
    els.steam.checked = !cfg.platforms || cfg.platforms.steam !== false;
    els.ubisoft.checked = !cfg.platforms || cfg.platforms.ubisoft !== false;
    els.keep.checked = !cfg.types || cfg.types.keep !== false;
    els.weekend.checked = !!(cfg.types && cfg.types.weekend);
    var eo = cfg.embedOptions || {};
    els.sp.checked = eo.showPrice !== false;
    els.su.checked = eo.showUntil !== false;
    els.st.checked = eo.showThumbnail !== false;
    els.si.checked = eo.showImage !== false;
    els.sb.checked = eo.showButtons !== false;
    els.sf.checked = eo.showFooter !== false;
    els.sc.checked = eo.showSteamClientButton !== false;
  }

  async function loadChannels() {
    var guildId = gid();
    if (!guildId) return;
    var data = await apiGet('/guilds/' + encodeURIComponent(guildId) + '/channels');
    // API payload varies across builds: accept both {channels: []} and {items: []}
    var items = (data && (data.items || data.channels)) ? (data.items || data.channels) : [];

    // Preserve selection even when the option list is empty (async load race)
    var current = els.channel.value || els.channel.dataset.desiredValue || '';
    els.channel.innerHTML = '';
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '-- selecionar --';
    els.channel.appendChild(opt0);
    items.forEach(function (ch) {
      if (!ch || !ch.id) return;
      var opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = (ch.name ? ('#' + ch.name) : ch.id);
      els.channel.appendChild(opt);
    });

    if (current) {
      els.channel.value = current;
      if (els.channel.value !== current) {
        // Option not present (yet) - keep it around until a future refresh
        els.channel.dataset.desiredValue = current;
      } else {
        delete els.channel.dataset.desiredValue;
      }
    }
  }

  function renderPreview(preview) {
    var box = els.preview;
    if (!preview || !preview.embed) {
      box.innerHTML = '<div class="empty">' + t('common_no_data') + '</div>';
      return;
    }
    var e = preview.embed;
    var title = e.title || '';
    // URL is intentionally not embedded in the title (no hyperlink).
    // Navigation is handled by buttons.
    var url = '';
    var desc = e.description || '';
    var thumb = (e.thumbnail && e.thumbnail.url) ? e.thumbnail.url : '';
    var img = (e.image && e.image.url) ? e.image.url : '';
    var footer = (e.footer && e.footer.text) ? e.footer.text : '';

    // Discord-style components (link buttons)
    var components = Array.isArray(preview.components) ? preview.components : [];
    var buttons = [];
    components.forEach(function (row) {
      if (!row || !Array.isArray(row.components)) return;
      row.components.forEach(function (c) {
        if (!c || c.type !== 2 || c.style !== 5 || !c.url) return;
        buttons.push({ label: String(c.label || 'Open'), url: String(c.url) });
      });
    });

    var html = '';
    html += '<div class="card ftk-preview">';
    html +=   '<div class="ftk-preview-header">';
    html +=     '<div class="ftk-preview-text">';
    // Title must be bold only, with no hyperlinking
    html +=       '<div class="ftk-preview-title">' + window.OzarkDashboard.escapeHtml(title) + '</div>';
    if (desc) html += '<div class="ftk-preview-desc">' + window.OzarkDashboard.escapeHtml(desc) + '</div>';
    // no URL line
    html +=     '</div>';
    if (thumb) html += '<img class="ftk-preview-thumb" src="' + window.OzarkDashboard.escapeHtml(thumb) + '" alt="" />';
    html +=   '</div>';

    if (img) html += '<img class="ftk-preview-image" src="' + window.OzarkDashboard.escapeHtml(img) + '" alt="" />';

    if (buttons.length) {
      html += '<div class="ftk-preview-actions">';
      buttons.forEach(function (b) {
        html += '<a class="ftk-action-btn" href="' + window.OzarkDashboard.escapeHtml(b.url) + '" target="_blank" rel="noreferrer">' +
                window.OzarkDashboard.escapeHtml(b.label) +
                '</a>';
      });
      html += '</div>';
    }

    if (footer) html += '<div class="ftk-preview-footer">' + window.OzarkDashboard.escapeHtml(footer) + '</div>';
    html += '</div>';
    box.innerHTML = html;
  }

  async function loadConfig() {
    var guildId = gid();
    if (!guildId) return;
    setPanelLoading('ftkPreviewPanel', true);
    try {
      var res = await apiGet('/freetokeep/config?guildId=' + encodeURIComponent(guildId));
      if (res && res.ok) {
        writeForm(res.config || {});
      }
    } finally {
      setPanelLoading('ftkPreviewPanel', false);
    }
  }

  async function loadRecent() {
    var guildId = gid();
    if (!guildId) return;
    var res = await apiGet('/freetokeep/recent?guildId=' + encodeURIComponent(guildId));
    var items = (res && res.items) ? res.items : [];
    var list = els.recent;
    if (!items.length) {
      list.innerHTML = '<div class="empty">Sem envios ainda.</div>';
      return;
    }
    list.innerHTML = '';
    items.forEach(function (it) {
      var div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = '<div style="font-weight:600;">' + window.OzarkDashboard.escapeHtml(it.title || '') + '</div>' +
        '<div class="hint" style="margin-top:2px;">' + window.OzarkDashboard.escapeHtml((it.platform || '').toUpperCase() + ' • ' + (it.type || '')) + (it.isTest ? ' • TEST' : '') + '</div>';
      list.appendChild(div);
    });
  }

  var previewTimer = null;
  function queuePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      previewNow().catch(function () {});
    }, 250);
  }

  async function previewNow() {
    var guildId = gid();
    if (!guildId) return;
    var f = readForm();
    var qs = [
      'guildId=' + encodeURIComponent(guildId),
      'epic=' + (f.platforms.epic ? '1' : '0'),
      'steam=' + (f.platforms.steam ? '1' : '0'),
      'ubisoft=' + (f.platforms.ubisoft ? '1' : '0'),
      'keep=' + (f.types.keep ? '1' : '0'),
      'weekend=' + (f.types.weekend ? '1' : '0'),
      'sp=' + (f.embedOptions.showPrice ? '1' : '0'),
      'su=' + (f.embedOptions.showUntil ? '1' : '0'),
      'st=' + (f.embedOptions.showThumbnail ? '1' : '0'),
      'si=' + (f.embedOptions.showImage ? '1' : '0'),
      'sb=' + (f.embedOptions.showButtons ? '1' : '0'),
      'sf=' + (f.embedOptions.showFooter ? '1' : '0'),
      'sc=' + (f.embedOptions.showSteamClientButton ? '1' : '0')
    ].join('&');

    setPanelLoading('ftkPreviewPanel', true);
    try {
      var res = await apiGet('/freetokeep/preview?' + qs);
      if (res && res.ok && res.preview) renderPreview(res.preview);
    } catch (e) {
      els.preview.innerHTML = '<div class="empty">Erro ao gerar preview.</div>';
    } finally {
      setPanelLoading('ftkPreviewPanel', false);
    }
  }

  async function saveConfig() {
    var f = readForm();
    if (!f.guildId) return;
    setPanelLoading('ftkPreviewPanel', true);
    try {
      var res = await apiPost('/freetokeep/config', f);
      if (res && res.ok) {
        toast(t('common_saved') || 'Guardado', 'success');
        // Avoid "values jump back" when channels haven't populated yet
        await loadChannels();
        await loadConfig();
        await loadRecent();
        await previewNow();
      } else {
        toast(t('common_save_failed') || 'Falha ao guardar', 'error');
      }
    } catch (e) {
      toast(t('common_save_failed') || 'Falha ao guardar', 'error');
    } finally {
      setPanelLoading('ftkPreviewPanel', false);
    }
  }

  async function testSend() {
    var f = readForm();
    if (!f.guildId) return;
    if (!f.channelId) {
      toast('Seleciona um canal primeiro.', 'warn');
      return;
    }
    setPanelLoading('ftkPreviewPanel', true);
    try {
      // pick a representative platform/type for the test
      var platform = f.platforms.steam ? 'steam' : (f.platforms.ubisoft ? 'ubisoft' : 'epic');
      var type = f.types.weekend ? 'weekend' : 'keep';
      var body = {
        guildId: f.guildId,
        channelId: f.channelId,
        platform: platform,
        type: type,
        embedOptions: f.embedOptions
      };
      var res = await apiPost('/freetokeep/test-send', body);
      if (res && res.ok) {
        toast('Teste enviado.', 'success');
        await loadRecent();
      } else {
        toast('Falha ao enviar teste.', 'error');
      }
    } catch (e) {
      toast('Falha ao enviar teste.', 'error');
    } finally {
      setPanelLoading('ftkPreviewPanel', false);
    }
  }

  function wire() {
    els.enabled = q('ftkEnabled');
    els.channel = q('ftkChannel');
    els.interval = q('ftkInterval');
    els.max = q('ftkMax');
    els.epic = q('ftkPlatEpic');
    els.steam = q('ftkPlatSteam');
    els.ubisoft = q('ftkPlatUbisoft');
    els.keep = q('ftkTypeKeep');
    els.weekend = q('ftkTypeWeekend');
    els.sp = q('ftkShowPrice');
    els.su = q('ftkShowUntil');
    els.st = q('ftkShowThumb');
    els.si = q('ftkShowImage');
    els.sb = q('ftkShowButtons');
    els.sf = q('ftkShowFooter');
    els.sc = q('ftkShowSteamClient');
    els.preview = q('ftkPreview');
    els.recent = q('ftkRecentList');

    q('btnFtkSave').addEventListener('click', function () { saveConfig(); });
    q('btnFtkReload').addEventListener('click', function () { window.OzarkDashboard.loadFreeToKeep(); });
    q('btnFtkPreview').addEventListener('click', function () { previewNow(); });
    q('btnFtkTestSend').addEventListener('click', function () { testSend(); });

    // Live preview on any option change
    [
      els.enabled, els.channel, els.interval, els.max,
      els.epic, els.steam, els.ubisoft, els.keep, els.weekend,
      els.sp, els.su, els.st, els.si, els.sb, els.sf, els.sc
    ].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', queuePreview);
    });

    // If the user explicitly changed the channel, that value becomes the source of truth.
    if (els.channel) {
      els.channel.addEventListener('change', function () {
        delete els.channel.dataset.desiredValue;
      });
    }
  }

  window.OzarkDashboard.loadFreeToKeep = async function () {
    try {
      if (!q('extras-freetokeep-panel')) return;
      if (!els.preview) wire();
      await loadChannels();
      await loadConfig();
      await loadRecent();
      await previewNow();
    } catch (e) {
      console.error('FreeToKeep load failed', e);
    }
  };
})();
