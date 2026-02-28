// Giveaways module extension for OzarkDashboard
// Configures GamerPower giveaways posting per guild + live preview.

(function () {
  if (!window.OzarkDashboard) return;

  const D = window.OzarkDashboard;
  const state = D.state;
  const apiGet = D.apiGet;
  const apiPost = D.apiPost;
  const toast = D.toast;
  const t = D.t;
  const escapeHtml = D.escapeHtml;

  function getGuildId() {
    return state && state.guildId ? String(state.guildId) : '';
  }

  function q(id) { return document.getElementById(id); }

  function readChecks(containerId) {
    const root = q(containerId);
    if (!root) return [];
    const out = [];
    root.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (cb && cb.checked) out.push(String(cb.value || '').trim());
    });
    return out.filter(Boolean);
  }

  function setChecks(containerId, values) {
    const set = new Set((values || []).map(function (v) { return String(v); }));
    const root = q(containerId);
    if (!root) return;
    root.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (!cb) return;
      cb.checked = set.has(String(cb.value || ''));
    });
  }

  const sampleCache = {}; // key(platform|type) -> sample item
  let renderToken = 0;

  function formatDatePill(dmy) {
    return '<span class="giveaway-preview__ts">' + escapeHtml(dmy || '—') + '</span>';
  }

  async function loadSampleFor(platform, type) {
    const guildId = getGuildId();
    if (!guildId) return null;
    const key = String(platform || 'steam') + '|' + String(type || 'game');
    if (sampleCache[key]) return sampleCache[key];
    try {
      const data = await apiGet('/giveaways/sample?guildId=' + encodeURIComponent(guildId) +
        '&platform=' + encodeURIComponent(platform || 'steam') +
        '&type=' + encodeURIComponent(type || 'game'));
      const item = data && data.item ? data.item : null;
      if (item) sampleCache[key] = item;
      return item;
    } catch (_) {
      return null;
    }
  }

  async function renderPreview() {
    const enabled = !!(q('giveawaysEnabled') && q('giveawaysEnabled').checked);
    const platforms = readChecks('giveawaysPlatforms');
    const types = readChecks('giveawaysTypes');

    const primaryPlatform = (platforms[0] || 'steam');
    const pLower = String(primaryPlatform).toLowerCase();
    const showSteam = pLower.includes('steam');
    const showEpic = pLower.includes('epic');

    const logoUrl = platformLogoUrl(primaryPlatform);

    const token = ++renderToken;
    const sample = await loadSampleFor(primaryPlatform, (types[0] || 'game'));
    if (token !== renderToken) return; // stale

    const example = sample || {
      title: 'Just Move: Clean City Messy Battle',
      worth: '€15.79',
      end_date: '04/03/2026',
      publisher: 'FreeStuff',
      image: '',
      giveaway_url: 'https://store.steampowered.com/',
      gamerpower_url: 'https://www.gamerpower.com/',
      open_giveaway_url: 'https://www.gamerpower.com/open/'
    };

    // Avoid mixed-content blocking on HTTPS dashboards.
    const imgUrl = (function normalize(u) {
      u = String(u || '');
      if (u.startsWith('http://')) return 'https://' + u.slice('http://'.length);
      return u;
    })(example.image);

    const root = q('giveawaysPreview');
    if (!root) return;

    if (!enabled) {
      root.innerHTML = '<div class="empty">' + escapeHtml(t('giveaways_preview_disabled') || 'Ativa para ver a preview.') + '</div>';
      return;
    }

    const title = escapeHtml(String(example.title || '').replace(/\s*\(?(steam|epic|ubisoft)\)?\s*giveaway\s*$/i, '').replace(/\s*giveaway\s*$/i, '').trim() || 'Giveaway');
    // Screenshot style: strikethrough worth then "Free until".
    const worthHtml = example.worth ? ('<span class="giveaway-preview__worth">' + escapeHtml(example.worth) + '</span>') : '';
    const meta = (worthHtml ? ('<span class="giveaway-preview__worth-wrap">' + worthHtml + '</span> ') : '') +
      '<span><b>Free</b> until ' + formatDatePill(example.end_date || '—') + '</span>';

    const footerLeft = 'via .rabbitstuff.xyz';
    const footerRight = example.publisher ? ('© ' + escapeHtml(example.publisher)) : '';

    const linkBrowser = '<a class="giveaway-preview__linkbtn" href="#" onclick="return false;"><b>Open in browser ↗</b></a>';
    const linkClient = showSteam
      ? '<a class="giveaway-preview__linkbtn" href="#" onclick="return false;"><b>Open in Steam Client ↗</b></a>'
      : (showEpic
          ? '<a class="giveaway-preview__linkbtn" href="#" onclick="return false;"><b>Open in Epic Games ↗</b></a>'
          : '<a class="giveaway-preview__linkbtn" href="#" onclick="return false;"><b>Open in Ubisoft Games ↗</b></a>'
        );

    root.innerHTML =
      '<div class="giveaway-preview__header">' +
        '<div>' +
          '<div class="giveaway-preview__title">' + title + '</div>' +
          '<div class="giveaway-preview__meta-line">' + meta + '</div>' +
          '<div class="giveaway-preview__actions">' +
            linkBrowser + (linkClient ? linkClient : '') +
          '</div>' +
        '</div>' +
        (logoUrl ? ('<div class="giveaway-preview__thumb"><img alt="" src="' + escapeHtml(logoUrl) + '" /></div>') : '') +
      '</div>' +
      (imgUrl ? ('<div class="giveaway-preview__image"><img alt="" src="' + escapeHtml(imgUrl) + '" /></div>') : '') +
      '<div class="giveaway-preview__footer">' +
        '<span>' + escapeHtml(footerLeft) + '</span>' +
        (footerRight ? '<span>' + footerRight + '</span>' : '') +
      '</div>';

    function platformLabel(p) {
      p = String(p || '').toLowerCase();
      if (p.includes('steam')) return 'Steam';
      if (p.includes('epic')) return 'Epic Games Store';
      if (p.includes('ubisoft') || p.includes('uplay')) return 'Ubisoft';
      return p || 'Platform';
    }

    function platformLogoUrl(p) {
      p = String(p || '').toLowerCase();
      if (p.includes('steam')) return '/assets/platform-badges/steam.png';
      if (p.includes('epic')) return '/assets/platform-badges/epic.png';
      if (p.includes('ubisoft') || p.includes('uplay')) return '/assets/platform-badges/ubisoft.png';
      return '';
    }
  }

  async function loadChannelsIntoSelect() {
    const guildId = getGuildId();
    const sel = q('giveawaysChannel');
    if (!guildId || !sel) return;

    const desired = sel.dataset.desiredValue || sel.value || '';

    sel.innerHTML = '<option value="">' + escapeHtml(t('select_channel') || 'Seleciona um canal') + '</option>';

    let data = null;
    try {
      // NOTE: dashboard.js already prefixes API_BASE ("/api"), so paths here must be relative.
      data = await apiGet('/guilds/' + encodeURIComponent(guildId) + '/channels');
    } catch (e) {
      data = null;
    }

    const items = data && (data.items || data.channels) ? (data.items || data.channels) : [];
    items.forEach(function (ch) {
      if (!ch || !ch.id) return;
      const opt = document.createElement('option');
      opt.value = String(ch.id);
      opt.textContent = (ch.name ? '#' + ch.name : ch.id);
      sel.appendChild(opt);
    });

    // Reapply desired value when options arrive
    if (desired) {
      const exists = !!sel.querySelector('option[value="' + CSS.escape(desired) + '"]');
      if (exists) {
        sel.value = desired;
        delete sel.dataset.desiredValue;
      } else {
        sel.value = '';
      }
    }
  }

  async function loadGiveawaysConfig() {
    const guildId = getGuildId();
    if (!guildId) return;

    const data = await apiGet('/giveaways/config?guildId=' + encodeURIComponent(guildId));

    const cfg = data && data.giveaways ? data.giveaways : {};
    if (q('giveawaysEnabled')) q('giveawaysEnabled').checked = !!cfg.enabled;

    const sel = q('giveawaysChannel');
    if (sel) {
      const v = cfg.channelId ? String(cfg.channelId) : '';
      sel.dataset.desiredValue = v;
      sel.value = v;
    }

    setChecks('giveawaysPlatforms', cfg.platforms || ['steam']);
    setChecks('giveawaysTypes', cfg.types || ['game']);

    if (q('giveawaysPoll')) q('giveawaysPoll').value = String(cfg.pollIntervalSeconds != null ? cfg.pollIntervalSeconds : 60);
    if (q('giveawaysMaxPerCycle')) q('giveawaysMaxPerCycle').value = String(cfg.maxPerCycle != null ? cfg.maxPerCycle : 0);

    await renderPreview();
  }

  async function saveGiveaways() {
    const guildId = getGuildId();
    if (!guildId) return;

    const enabled = !!(q('giveawaysEnabled') && q('giveawaysEnabled').checked);
    const sel = q('giveawaysChannel');
    const channelId = sel && sel.value ? String(sel.value) : null;

    const platforms = readChecks('giveawaysPlatforms');
    const types = readChecks('giveawaysTypes');

    const poll = q('giveawaysPoll') ? Number(q('giveawaysPoll').value) : 60;
    const maxPer = q('giveawaysMaxPerCycle') ? Number(q('giveawaysMaxPerCycle').value) : 0;

    // Basic validation UX
    if (enabled && (!channelId || channelId.length < 5)) {
      toast('error', t('giveaways_err_channel') || 'Seleciona um canal de publicação.');
      return;
    }

    const payload = {
      guildId: guildId,
      giveaways: {
        enabled: enabled,
        channelId: channelId,
        platforms: platforms.length ? platforms : ['steam'],
        types: types.length ? types : ['game'],
        pollIntervalSeconds: Math.max(60, Math.min(3600, Math.trunc(poll || 60))),
        maxPerCycle: Math.max(0, Math.min(50, Math.trunc(maxPer || 0)))
      }
    };

    const saved = await apiPost('/giveaways/config', payload);

    toast('ok', t('saved') || 'Guardado');
    const hint = q('giveawaysSavedHint');
    if (hint) {
      hint.textContent = (t('saved_now') || 'Guardado agora') + ' • ' + (D.formatDateTime ? D.formatDateTime(Date.now()) : '');
      setTimeout(function () { hint.textContent = ''; }, 3500);
    }

    // Keep UI in sync with what the server persisted (prevents "snap back").
    if (saved && saved.giveaways) {
      const cfg = saved.giveaways;
      if (q('giveawaysEnabled')) q('giveawaysEnabled').checked = !!cfg.enabled;
      const sel2 = q('giveawaysChannel');
      if (sel2) {
        const v2 = cfg.channelId ? String(cfg.channelId) : '';
        sel2.dataset.desiredValue = v2;
        // Apply immediately to avoid apparent "revert" before channels are reloaded.
        sel2.value = v2;
      }
      setChecks('giveawaysPlatforms', cfg.platforms || ['steam']);
      setChecks('giveawaysTypes', cfg.types || ['game']);
      if (q('giveawaysPoll')) q('giveawaysPoll').value = String(cfg.pollIntervalSeconds != null ? cfg.pollIntervalSeconds : 60);
      if (q('giveawaysMaxPerCycle')) q('giveawaysMaxPerCycle').value = String(cfg.maxPerCycle != null ? cfg.maxPerCycle : 0);
    }

    // Reload channels to make sure the chosen value exists in the select.
    await loadChannelsIntoSelect();
    await renderPreview();
  }

  async function sendTest() {
    const guildId = getGuildId();
    if (!guildId) return;
    const enabled = !!(q('giveawaysEnabled') && q('giveawaysEnabled').checked);
    const sel = q('giveawaysChannel');
    const channelId = sel && sel.value ? String(sel.value) : '';
    if (!enabled) {
      toast('error', 'Ativa giveaways para testar.');
      return;
    }
    if (!channelId) {
      toast('error', 'Seleciona um canal de publicação.');
      return;
    }
    const platforms = readChecks('giveawaysPlatforms');
    const platform = (platforms[0] || 'steam');
    await apiPost('/giveaways/test', { guildId, channelId, platform });
    toast('ok', 'Teste enviado.');
  }

  function bindEvents() {
    // Prevent duplicate listeners when the user re-opens the subtab.
    if (D.__giveawaysBound) return;
    D.__giveawaysBound = true;

    const ids = ['giveawaysEnabled', 'giveawaysChannel', 'giveawaysPoll', 'giveawaysMaxPerCycle'];
    ids.forEach(function (id) {
      const el = q(id);
      if (!el) return;
      el.addEventListener('change', function () { renderPreview(); });
      el.addEventListener('input', function () { renderPreview(); });
    });

    ['giveawaysPlatforms', 'giveawaysTypes'].forEach(function (id) {
      const wrap = q(id);
      if (!wrap) return;
      wrap.addEventListener('change', function () { renderPreview(); });
    });

    const btn = q('giveawaysSaveBtn');
    if (btn) btn.addEventListener('click', function () { saveGiveaways().catch(function () { toast('error', 'Erro ao guardar'); }); });

    const testBtn = q('giveawaysTestBtn');
    if (testBtn) testBtn.addEventListener('click', function () { sendTest().catch(function () { toast('error', 'Erro ao enviar teste'); }); });
  }

  // Public hook for core tab switcher
  D.loadGiveaways = async function () {
    bindEvents();
    await loadChannelsIntoSelect();
    await loadGiveawaysConfig();
  };
})();
