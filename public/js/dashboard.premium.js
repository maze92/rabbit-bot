// public/js/dashboard.premium.js
//
// Estado premium por servidor. Os módulos "extra" (GameNews, voz temporária,
// tickets, trust e giveaways) só funcionam com premium ativo. Esta camada
// apenas reflete esse estado na interface: bloqueia os cartões e permite a um
// administrador do bot ativar/desativar o premium manualmente.

(function () {
  'use strict';

  var NS = (window.OzarkDashboard = window.OzarkDashboard || {});

  function byId(id) { return document.getElementById(id); }
  function t(key, params) { return NS.t ? NS.t(key, params) : key; }
  function notify(msg, opts) { if (typeof NS.toast === 'function') NS.toast(msg, opts); }
  function guildId() { return (NS.state && NS.state.guildId) ? NS.state.guildId : null; }

  var premium = null;   // { enabled, active, until, note, activatedAt }
  var paymentPlan = null;
  var loading = false;
  var checkoutLoading = false;

  function isAdmin() {
    var me = NS.state && NS.state.me;
    return !!(me && me.role === 'BOT_ADMIN');
  }

  function isGuildAdmin() {
    var me = NS.state && NS.state.me;
    return !!(me && (me.role === 'GUILD_ADMIN' || me.role === 'ADMIN'));
  }

  function formatMoney(amount, currency) {
    try {
      var locale = (NS.state && NS.state.lang) || document.documentElement.lang || 'pt-PT';
      return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(Number(amount));
    } catch {
      return String(amount) + ' ' + String(currency || '');
    }
  }

  function formatPaymentDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }

  // Data legível (dd/mm/aaaa) para o "válido até".
  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString();
    } catch {
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

    var profileBadge = byId('badgeProfile');
    if (profileBadge) profileBadge.classList.toggle('badge-premium', active);

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
      var hintKey = active
        ? 'premium_active_hint'
        : (paymentPlan && paymentPlan.available ? 'premium_purchase_hint' : 'premium_lock_hint');
      hint.setAttribute('data-i18n', hintKey);
      hint.textContent = t(hintKey, paymentPlan ? {
        price: formatMoney(paymentPlan.amount, paymentPlan.currency),
        days: paymentPlan.durationDays
      } : {});
    }

    var admin = isAdmin();
    var checkoutBtn = byId('btnPremiumCheckout');
    var permanent = active && !(premium && premium.until);
    if (checkoutBtn) {
      var canPurchase = isGuildAdmin() && paymentPlan && paymentPlan.available && !permanent;
      checkoutBtn.classList.toggle('hidden', !canPurchase);
      checkoutBtn.textContent = canPurchase
        ? t('premium_checkout_button', { price: formatMoney(paymentPlan.amount, paymentPlan.currency) })
        : '';
      checkoutBtn.disabled = checkoutLoading;
    }

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

    var history = byId('premiumPaymentHistory');
    if (history) history.classList.toggle('hidden', !admin);

    if (typeof NS.applyPremiumState === 'function') NS.applyPremiumState(active);
  }

  async function loadPremium() {
    var gid = guildId();
    var grid = byId('extrasGrid');
    if (!gid) {
      premium = { enabled: false, active: false };
      paymentPlan = null;
      if (grid) grid.classList.add('is-premium-locked');
      applyLock();
      return;
    }
    if (loading) return;
    loading = true;

    try {
      var res = await NS.apiGet('/premium?guildId=' + encodeURIComponent(gid));
      premium = (res && res.premium) ? res.premium : { enabled: false, active: false };
      paymentPlan = (res && res.payment) ? res.payment : null;
      if (isAdmin()) loadPaymentHistory();
    } catch (err) {
      console.error('Premium load error', err);
      premium = { enabled: false, active: false };
      paymentPlan = null;
    } finally {
      loading = false;
      applyLock();
    }
  }

  async function loadPaymentHistory() {
    var list = byId('premiumPaymentsList');
    if (!list || !isAdmin()) return;
    try {
      var res = await NS.apiGet('/premium/payments');
      var items = (res && Array.isArray(res.items)) ? res.items : [];
      list.innerHTML = '';
      if (!items.length) {
        var empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('premium_payments_empty');
        list.appendChild(empty);
        return;
      }

      items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'list-item premium-payment-row';
        var title = document.createElement('strong');
        title.textContent = item.guildId + ' · ' + formatMoney(item.amount, item.currency);
        var detail = document.createElement('small');
        detail.textContent = [
          (item.discordUsername || 'Discord') + ' (' + (item.discordUserId || '—') + ')',
          item.paypalPayerEmail || 'PayPal email unavailable',
          formatPaymentDate(item.completedAt),
          t('premium_until', { date: formatPaymentDate(item.expiresAt) })
        ].join(' · ');
        row.appendChild(title);
        row.appendChild(detail);
        list.appendChild(row);
      });
    } catch (err) {
      console.error('Premium payment history error', err);
      list.textContent = t('premium_payments_error');
    }
  }

  async function startCheckout() {
    var gid = guildId();
    var button = byId('btnPremiumCheckout');
    if (!gid || checkoutLoading) return;
    checkoutLoading = true;
    applyLock();
    try {
      var res = await NS.apiPost('/premium/checkout', { guildId: gid });
      var approvalUrl = new URL(res && res.approvalUrl);
      if (approvalUrl.protocol !== 'https:' || !/(^|\.)paypal\.com$/i.test(approvalUrl.hostname)) {
        throw new Error('INVALID_PAYPAL_APPROVAL_URL');
      }
      window.location.assign(approvalUrl.toString());
    } catch (err) {
      console.error('Premium checkout error', err);
      notify(t('premium_checkout_error'), { type: 'error' });
    } finally {
      checkoutLoading = false;
      if (button) button.disabled = false;
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
    var checkoutBtn = byId('btnPremiumCheckout');
    if (checkoutBtn) checkoutBtn.addEventListener('click', startCheckout);

    var activateBtn = byId('btnPremiumActivate');
    if (activateBtn) {
      activateBtn.addEventListener('click', function () { setPremium(true); });
    }
    var deactivateBtn = byId('btnPremiumDeactivate');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', function () { setPremium(false); });
    }

    window.addEventListener('dashboard:premium-return', function (event) {
      var status = event && event.detail ? event.detail.status : '';
      if (status === 'success') {
        loadPremium();
        notify(t('premium_payment_success'), { type: 'success' });
      } else if (status === 'cancelled') {
        notify(t('premium_payment_cancelled'), { type: 'info' });
      } else if (status === 'error') {
        notify(t('premium_payment_error'), { type: 'error' });
      }
    });
    applyLock();
  });
})();
