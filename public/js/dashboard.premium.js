// public/js/dashboard.premium.js
//
// Estado premium por servidor. Os módulos "extra" (GameNews, voz temporária,
// tickets, trust e giveaways) só funcionam com premium ativo. Esta camada
// apenas reflete esse estado na interface: bloqueia os cartões e permite a um
// admin da dashboard ativar/desativar o premium manualmente.

(function () {
  'use strict';

  var NS = (window.OzarkDashboard = window.OzarkDashboard || {});

  function byId(id) { return document.getElementById(id); }
  function t(key, params) { return NS.t ? NS.t(key, params) : key; }
  function notify(msg, opts) { if (typeof NS.toast === 'function') NS.toast(msg, opts); }
  function guildId() { return (NS.state && NS.state.guildId) ? NS.state.guildId : null; }

  var premium = null;   // { enabled, active, until, note, activatedAt }
  var loading = false;

  function isAdmin() {
    var me = NS.state && NS.state.me;
    return !!(me && me.role === 'ADMIN');
  }

  // Data legível (dd/mm/aaaa) para o "válido até".
  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString();
    } catch (_) {
      return '';
    }
  }

  // Bloqueia/desbloqueia a interação com os cartões extra e reflete o estado
  // do premium (ativo/inativo, validade e nota) no painel do topo.
  function applyLock() {
    var grid = byId('extrasGrid');
    var active = !!(premium && premium.active);

    if (grid) grid.classList.toggle('is-premium-locked', !active);

    Array.prototype.slice.call(document.querySelectorAll('[data-premium="true"]')).forEach(function (card) {
      card.setAttribute('data-premium-locked', active ? 'false' : 'true');
      card.classList.toggle('is-premium-locked', !active);
      Array.prototype.slice.call(card.querySelectorAll('button, input, select, textarea')).forEach(function (el) {
        el.disabled = !active;
      });
      Array.prototype.slice.call(card.querySelectorAll('[data-role="premium-hint"]')).forEach(function (hintEl) {
        hintEl.classList.toggle('hidden', active);
      });
    });

    var status = byId('premiumStatus');
    if (status) {
      status.textContent = active ? t('premium_active') : t('premium_inactive');
      status.classList.toggle('premium-status--on', active);
    }

    var meta = byId('premiumMeta');
    if (meta) {
      var parts = [];
      if (active) {
        parts.push(premium && premium.until
          ? t('premium_until', { date: fmtDate(premium.until) })
          : t('premium_forever'));
      }
      if (premium && premium.note) parts.push(premium.note);
      meta.textContent = parts.join(' · ');
    }

    var hint = byId('premiumHint');
    if (hint) {
      // Mantém o `data-i18n` em sincronia para o applyI18n() traduzir corretamente.
      var hintKey = active ? 'premium_active_hint' : 'premium_lock_hint';
      hint.setAttribute('data-i18n', hintKey);
      hint.textContent = t(hintKey);
    }

    var admin = isAdmin();
    var activateBtn = byId('btnPremiumActivate');
    if (activateBtn) {
      activateBtn.classList.toggle('hidden', !admin || active);
      activateBtn.disabled = false;
    }
    var deactivateBtn = byId('btnPremiumDeactivate');
    if (deactivateBtn) {
      deactivateBtn.classList.toggle('hidden', !admin || !active);
      deactivateBtn.disabled = false;
    }

    if (typeof NS.applyPremiumState === 'function') NS.applyPremiumState(active);
  }

  async function loadPremium() {
    var gid = guildId();
    var grid = byId('extrasGrid');
    if (!gid) {
      premium = { enabled: false, active: false };
      if (grid) grid.classList.add('is-premium-locked');
      applyLock();
      return;
    }
    if (loading) return;
    loading = true;

    try {
      var res = await NS.apiGet('/premium?guildId=' + encodeURIComponent(gid));
      premium = (res && res.premium) ? res.premium : { enabled: false, active: false };
    } catch (err) {
      console.error('Premium load error', err);
      premium = { enabled: false, active: false };
    } finally {
      loading = false;
      applyLock();
    }
  }

  async function setPremium(enabled) {
    var gid = guildId();
    if (!gid) return;

    var btn = byId('btnPremiumActivate');
    if (btn) btn.disabled = true;

    try {
      var res = await NS.apiPost('/premium', { guildId: gid, enabled: enabled });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      premium = res.premium || { enabled: false, active: false };
      notify(enabled ? t('premium_activated') : t('premium_deactivated'), { type: 'success' });
    } catch (err) {
      console.error('Premium update error', err);
      notify(t('premium_update_error'), { type: 'error' });
    } finally {
      applyLock();
    }
  }

  NS.loadPremium = loadPremium;
  NS.isPremiumActive = function () { return !!(premium && premium.active); };
  NS.isPremiumModuleLocked = function () { return !(premium && premium.active); };

  document.addEventListener('DOMContentLoaded', function () {
    var activateBtn = byId('btnPremiumActivate');
    if (activateBtn) {
      activateBtn.addEventListener('click', function () { setPremium(true); });
    }
    var deactivateBtn = byId('btnPremiumDeactivate');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', function () { setPremium(false); });
    }
    applyLock();
  });
})();
