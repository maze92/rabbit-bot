// public/js/dashboard.premium.js
//
// Estado premium por servidor. Os módulos extra e as licenças são sempre
// associados à guild selecionada.

(function () {
  'use strict';

  var NS = (window.OzarkDashboard = window.OzarkDashboard || {});

  function byId(id) { return document.getElementById(id); }
  function t(key, params) { return NS.t ? NS.t(key, params) : key; }
  function notify(msg, opts) { if (typeof NS.toast === 'function') NS.toast(msg, opts); }
  function guildId() { return (NS.state && NS.state.guildId) ? NS.state.guildId : null; }

  var premium = null;   // { enabled, active, until, note, activatedAt }
  var paymentPlan = null;
  var serverDetails = null;
  var loading = false;
  var checkoutLoading = false;
  var adminGuilds = [];
  var adminPayments = [];
  var paymentsPage = 1;
  var paymentsPages = 0;

  function isAdmin() {
    var me = NS.state && NS.state.me;
    return !!(me && (me.role === 'BOT_ADMIN' || me.role === 'BOT_OWNER'));
  }

  function isBotOwner() {
    var me = NS.state && NS.state.me;
    return !!(me && me.role === 'BOT_OWNER');
  }

  function canStartCheckout() {
    var me = NS.state && NS.state.me;
    var permissions = me && me.permissions;
    return !!(me && (
      me.role === 'BOT_ADMIN' ||
      me.role === 'BOT_OWNER' ||
      (permissions && permissions.canEditConfig === true)
    ));
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
    var paidActive = !!(premium && premium.active);
    var active = paidActive;

    if (grid) grid.classList.toggle('is-premium-locked', !active);

    Array.prototype.slice.call(document.querySelectorAll('[data-premium="true"]')).forEach(function (card) {
      card.setAttribute('data-premium-locked', active ? 'false' : 'true');
      card.classList.toggle('is-premium-locked', !active);
      Array.prototype.slice.call(card.querySelectorAll('button, input, select, textarea')).forEach(function (el) {
        if (el.getAttribute('data-premium-action') !== 'offer') el.disabled = !active;
      });
      var offerButton = card.querySelector('[data-premium-action="offer"]');
      if (offerButton) offerButton.classList.toggle('hidden', active);
      Array.prototype.slice.call(card.querySelectorAll('[data-role="premium-hint"]')).forEach(function (hintEl) {
        hintEl.classList.toggle('hidden', active);
      });
    });

    var status = byId('premiumStatus');
    if (status) {
      status.textContent = paidActive
        ? t('premium_active')
        : (premium && premium.status === 'EXPIRED' ? t('premium_expired') : t('premium_inactive'));
      status.classList.toggle('premium-status--on', active);
    }

    var meta = byId('premiumMeta');
    if (meta) {
      var parts = [];
      if (paidActive) {
        parts.push(premium && premium.until
          ? t('premium_until', { date: fmtDate(premium.until) })
          : t('premium_forever'));
      }
      if (premium && premium.note) parts.push(premium.note);
      meta.textContent = parts.join(' · ');
    }

    var guildName = byId('premiumGuildName');
    if (guildName) {
      guildName.textContent = serverDetails && serverDetails.name || '';
      guildName.classList.toggle('hidden', !guildName.textContent);
    }
    var identity = byId('premiumGuildIdentity');
    if (identity) {
      var identityParts = [];
      if (serverDetails && (serverDetails.ownerName || serverDetails.ownerId)) {
        identityParts.push(t('premium_server_owner') + ': ' + (serverDetails.ownerName || t('premium_server_unknown')) +
          (serverDetails.ownerId ? ' (' + serverDetails.ownerId + ')' : ''));
      }
      if (serverDetails && (serverDetails.purchaserDiscordUsername || serverDetails.purchaserDiscordUserId)) {
        identityParts.push(t('premium_server_payer') + ': ' +
          (serverDetails.purchaserDiscordUsername || t('premium_server_unknown')) +
          (serverDetails.purchaserDiscordUserId ? ' (' + serverDetails.purchaserDiscordUserId + ')' : ''));
      }
      identity.textContent = identityParts.join(' · ');
      identity.classList.toggle('hidden', identityParts.length === 0);
    }
    var hint = byId('premiumHint');
    if (hint) {
      // Mantém o `data-i18n` em sincronia para o applyI18n() traduzir corretamente.
      var hintKey = paidActive
        ? 'premium_active_hint'
        : (paymentPlan && paymentPlan.available ? 'premium_purchase_hint' : 'premium_lock_hint');
      hint.setAttribute('data-i18n', hintKey);
      hint.textContent = t(hintKey, paymentPlan ? {
        price: formatMoney(paymentPlan.amount, paymentPlan.currency),
        days: paymentPlan.durationDays
      } : {});
    }

    var checkoutBtn = byId('btnPremiumCheckout');
    var offerCheckoutBtn = byId('btnPremiumOfferCheckout');
    if (checkoutBtn) {
      var canRenew = paidActive && premium && premium.until;
      var canPurchase = canStartCheckout() && paymentPlan && paymentPlan.available && (!paidActive || canRenew);
      checkoutBtn.classList.toggle('hidden', !canPurchase);
      checkoutBtn.textContent = canPurchase
        ? t('premium_checkout_button', { price: formatMoney(paymentPlan.amount, paymentPlan.currency) })
        : '';
      checkoutBtn.disabled = checkoutLoading;
      if (offerCheckoutBtn) {
        offerCheckoutBtn.classList.toggle('hidden', !canPurchase);
        offerCheckoutBtn.textContent = checkoutBtn.textContent;
        offerCheckoutBtn.disabled = checkoutLoading;
      }
    }

    var settingsForm = byId('premiumSettingsForm');
    if (settingsForm) settingsForm.classList.toggle('hidden', !isBotOwner());

    if (typeof NS.applyPremiumState === 'function') NS.applyPremiumState(active);
  }

  function openPremiumOffer(card) {
    var dialog = byId('premiumOfferDialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    var title = byId('premiumOfferTitle');
    var cardTitle = card && card.querySelector('.feature-card__name');
    if (title) {
      title.textContent = t('premium_offer_title', {
        module: cardTitle ? cardTitle.textContent : ''
      });
    }

    var plan = byId('premiumOfferPlan');
    var hasOffer = paymentPlan && paymentPlan.amount && paymentPlan.currency && paymentPlan.durationDays;
    if (plan) {
      plan.textContent = hasOffer
        ? t('premium_offer_plan', {
          days: paymentPlan.durationDays,
          price: formatMoney(paymentPlan.amount, paymentPlan.currency)
        })
        : t('premium_offer_plan_unavailable');
    }

    var status = byId('premiumOfferStatus');
    if (status) {
      var message = !guildId()
        ? 'premium_offer_select_guild'
        : !paymentPlan || !paymentPlan.available
          ? 'premium_offer_unavailable'
          : canStartCheckout()
            ? 'premium_offer_checkout_ready'
            : 'premium_offer_admin_required';
      status.textContent = t(message);
    }

    applyLock();
    if (!dialog.open) dialog.showModal();
  }

  async function loadPremium() {
    var gid = guildId();
    var grid = byId('extrasGrid');
    if (!gid) {
      premium = { enabled: false, active: false };
      paymentPlan = null;
      serverDetails = null;
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
      serverDetails = (res && res.server) ? res.server : null;
    } catch (err) {
      console.error('Premium load error', err);
      premium = { enabled: false, active: false };
      paymentPlan = null;
      serverDetails = null;
    } finally {
      loading = false;
      applyLock();
    }
  }

  function localDateTime(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  function renderAdminGuilds() {
    var list = byId('premiumGuildsList');
    if (!list || !isAdmin()) return;
    var query = String((byId('premiumAdminSearch') || {}).value || '').trim().toLowerCase();
    var items = adminGuilds.filter(function (item) {
      return !query || [item.guildId, item.guildName, item.ownerId, item.ownerName, item.purchasedByUserId, item.purchaserName, item.note, item.latestPayment && item.latestPayment.paypalPayerEmail]
        .some(function (value) { return String(value || '').toLowerCase().includes(query); });
    });
    list.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('premium_admin_empty');
      list.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement('article');
      row.className = 'list-item premium-guild-row';
      var summary = document.createElement('div');
      summary.className = 'premium-guild-row__summary';
      var title = document.createElement('strong');
      title.textContent = item.guildName || item.guildId;
      var state = document.createElement('span');
      state.className = 'premium-status' + (item.active ? ' premium-status--on' : '');
      state.textContent = item.active
        ? t('premium_admin_active')
        : (item.enabled ? t('premium_admin_expired') : t('premium_admin_disabled'));
      summary.appendChild(title);
      summary.appendChild(state);
      row.appendChild(summary);
      var guildMeta = document.createElement('small');
      guildMeta.textContent = [
        t('premium_admin_guild_id') + ': ' + item.guildId,
        item.ownerName || item.ownerId
          ? t('premium_server_owner') + ': ' + (item.ownerName || t('premium_server_unknown')) + (item.ownerId ? ' (' + item.ownerId + ')' : '')
          : '',
        item.purchaserName || item.purchasedByUserId
          ? t('premium_server_payer') + ': ' + (item.purchaserName || t('premium_server_unknown')) + (item.purchasedByUserId ? ' (' + item.purchasedByUserId + ')' : '')
          : '',
        item.note || '',
        item.until ? t('premium_until', { date: formatPaymentDate(item.until) }) : t('premium_admin_permanent'),
      ].filter(Boolean).join(' · ');
      row.appendChild(guildMeta);

      if (item.latestPayment) {
        var payment = document.createElement('small');
        payment.textContent = [
          formatMoney(item.latestPayment.amount, item.latestPayment.currency),
          item.latestPayment.paypalPayerEmail || '',
          formatPaymentDate(item.latestPayment.completedAt),
          item.latestPayment.paypalCaptureId || ''
        ].filter(Boolean).join(' · ');
        row.appendChild(payment);
        if (item.latestPayment.approvalUrl) {
          var approval = document.createElement('a');
          approval.href = item.latestPayment.approvalUrl;
          approval.target = '_blank';
          approval.rel = 'noopener noreferrer';
          approval.textContent = t('premium_reference_link');
          row.appendChild(approval);
        }
      }

      var form = document.createElement('form');
      form.className = 'premium-guild-row__form';
      form.dataset.guildId = item.guildId;
      var enabledLabel = document.createElement('label');
      enabledLabel.className = 'premium-guild-row__switch';
      var enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = item.enabled;
      enabledLabel.appendChild(enabled);
      enabledLabel.appendChild(document.createTextNode(t('premium_admin_enable')));

      var untilLabel = document.createElement('label');
      untilLabel.textContent = t('premium_admin_until');
      var until = document.createElement('input');
      until.className = 'input';
      until.type = 'datetime-local';
      until.value = localDateTime(item.until);
      until.setAttribute('aria-label', t('premium_admin_until'));
      untilLabel.appendChild(until);

      var note = document.createElement('input');
      note.className = 'input';
      note.type = 'text';
      note.maxLength = 200;
      note.value = item.note || '';
      note.placeholder = t('premium_admin_note');

      var save = document.createElement('button');
      save.className = 'btn xs';
      save.type = 'submit';
      save.textContent = t(enabled.checked ? 'premium_admin_save_guild' : 'premium_admin_activate_guild');
      enabled.addEventListener('change', function () {
        save.textContent = t(enabled.checked ? 'premium_admin_save_guild' : 'premium_admin_deactivate_guild');
      });
      form.appendChild(enabledLabel);
      form.appendChild(untilLabel);
      form.appendChild(note);
      form.appendChild(save);
      row.appendChild(form);
      list.appendChild(row);
    });
  }

  function renderAdminPayments() {
    var list = byId('premiumPaymentsList');
    if (!list || !isAdmin()) return;
    list.innerHTML = '';
    if (!adminPayments.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('premium_payments_empty');
      list.appendChild(empty);
    } else {
      adminPayments.forEach(function (item) {
        var row = document.createElement('article');
        row.className = 'list-item premium-payment-row';
        var title = document.createElement('strong');
        title.textContent = item.guildName || item.guildId || t('premium_server_unknown');
        row.appendChild(title);
        var metadata = document.createElement('small');
        var statusKey = 'premium_payment_status_' + String(item.status || '').toLowerCase();
        metadata.textContent = [
          item.status ? t(statusKey) : '',
          item.guildId ? t('premium_admin_guild_id') + ': ' + item.guildId : '',
          item.purchaserDiscordUsername || item.purchaserDiscordUserId
            ? t('premium_server_payer') + ': ' + (item.purchaserDiscordUsername || item.purchaserDiscordUserId)
            : '',
          item.paypalPayerEmail || '',
          item.amount ? formatMoney(item.amount, item.currency) : '',
          formatPaymentDate(item.completedAt || item.createdAt),
          item.expiresAt ? t('premium_until', { date: formatPaymentDate(item.expiresAt) }) : '',
          item.paypalCaptureId || ''
        ].filter(Boolean).join(' · ');
        row.appendChild(metadata);
        list.appendChild(row);
      });
    }

    var pageLabel = byId('premiumPaymentsPage');
    if (pageLabel) pageLabel.textContent = t('premium_payments_page', {
      page: paymentsPages ? paymentsPage : 0,
      pages: paymentsPages
    });
    var previous = byId('premiumPaymentsPrevious');
    var next = byId('premiumPaymentsNext');
    if (previous) previous.disabled = paymentsPage <= 1;
    if (next) next.disabled = !paymentsPages || paymentsPage >= paymentsPages;
  }

  async function loadAdminData() {
    if (!isAdmin()) return;
    try {
      var statusFilter = byId('premiumPaymentsStatus');
      var paymentQuery = new URLSearchParams({
        page: String(paymentsPage),
        pageSize: '50',
        status: statusFilter ? statusFilter.value : 'ALL'
      });
      var results = await Promise.all([
        isBotOwner() ? NS.apiGet('/premium/admin/settings') : Promise.resolve(null),
        NS.apiGet('/premium/admin/guilds'),
        NS.apiGet('/premium/payments?' + paymentQuery.toString())
      ]);
      var settings = results[0] && results[0].settings;
      adminGuilds = results[1] && Array.isArray(results[1].items) ? results[1].items : [];
      adminPayments = results[2] && Array.isArray(results[2].items) ? results[2].items : [];
      paymentsPage = results[2] && results[2].page || 1;
      paymentsPages = results[2] && results[2].pages || 0;
      if (settings && isBotOwner()) {
        byId('premiumAdminAmount').value = settings.amount || '';
        byId('premiumAdminCurrency').value = settings.currency || 'EUR';
        byId('premiumAdminDuration').value = settings.durationDays || '';
        byId('premiumAdminPaymentLink').value = settings.paymentLink || '';
        paymentPlan = Object.assign({}, paymentPlan || {}, settings, { available: paymentPlan && paymentPlan.available });
      }
      renderAdminGuilds();
      renderAdminPayments();
      applyLock();
    } catch (err) {
      console.error('Premium admin data error', err);
      var list = byId('premiumGuildsList');
      if (list) list.textContent = t('premium_payments_error');
      var paymentsList = byId('premiumPaymentsList');
      if (paymentsList) paymentsList.textContent = t('premium_payments_error');
    }
  }

  async function savePremiumSettings(event) {
    event.preventDefault();
    var status = byId('premiumSettingsStatus');
    try {
      var res = await NS.apiPatch('/premium/admin/settings', {
        amount: byId('premiumAdminAmount').value,
        currency: byId('premiumAdminCurrency').value,
        durationDays: byId('premiumAdminDuration').value,
        paymentLink: byId('premiumAdminPaymentLink').value
      });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      await loadPremium();
      if (status) status.textContent = t('premium_admin_saved');
    } catch (err) {
      console.error('Premium settings save error', err);
      if (status) status.textContent = t('premium_admin_save_error');
    }
  }

  async function saveGuild(guildId, values, form) {
    var button = form && form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      var res = await NS.apiPatch('/premium/admin/guilds/' + encodeURIComponent(guildId), values);
      if (!res || res.ok === false) throw new Error((res && res.error) || 'ERROR');
      notify(t('premium_admin_saved'), { type: 'success' });
      await loadAdminData();
      return true;
    } catch (err) {
      console.error('Premium guild update error', err);
      notify(t('premium_admin_save_error'), { type: 'error' });
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function grantGuild(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var guildId = String(byId('premiumAdminGuildId').value || '').trim();
    var untilValue = byId('premiumAdminGuildUntil').value
      ? new Date(byId('premiumAdminGuildUntil').value).toISOString()
      : null;
    var saved = await saveGuild(guildId, {
      enabled: true,
      until: untilValue,
      note: byId('premiumAdminGuildNote').value
    }, form);
    if (saved) form.reset();
  }

  async function startCheckout(event) {
    var gid = guildId();
    var button = event && event.currentTarget;
    if (!gid || !canStartCheckout() || !paymentPlan || !paymentPlan.available || checkoutLoading) return;
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
      applyLock();
    }
  }

  NS.loadPremium = loadPremium;
  NS.loadPremiumAdmin = loadAdminData;
  NS.isPremiumActive = function () { return !!(premium && premium.active); };
  NS.isPremiumModuleLocked = function () { return !(NS.isPremiumActive()); };

  document.addEventListener('DOMContentLoaded', function () {
    var checkoutBtn = byId('btnPremiumCheckout');
    if (checkoutBtn) checkoutBtn.addEventListener('click', function (event) { startCheckout(event); });
    var offerCheckoutBtn = byId('btnPremiumOfferCheckout');
    if (offerCheckoutBtn) offerCheckoutBtn.addEventListener('click', function (event) { startCheckout(event); });
    var extrasGrid = byId('extrasGrid');
    if (extrasGrid) extrasGrid.addEventListener('click', function (event) {
      var offer = event.target.closest('[data-premium-action="offer"]');
      if (!offer) return;
      var card = offer.closest('[data-premium="true"]');
      if (card && card.getAttribute('data-premium-locked') === 'true') openPremiumOffer(card);
    });
    var offerDialog = byId('premiumOfferDialog');
    [byId('btnClosePremiumOffer'), byId('btnCancelPremiumOffer')].forEach(function (button) {
      if (button) button.addEventListener('click', function () {
        if (offerDialog && offerDialog.open) offerDialog.close();
      });
    });
    if (offerDialog) offerDialog.addEventListener('click', function (event) {
      if (event.target === offerDialog) offerDialog.close();
    });

    var settingsForm = byId('premiumSettingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', savePremiumSettings);
    var grantForm = byId('premiumAdminGrantForm');
    if (grantForm) grantForm.addEventListener('submit', grantGuild);
    var guildList = byId('premiumGuildsList');
    if (guildList) guildList.addEventListener('submit', function (event) {
      var form = event.target.closest('form[data-guild-id]');
      if (!form) return;
      event.preventDefault();
      var fields = form.querySelectorAll('input');
      var untilValue = fields[1].value ? new Date(fields[1].value).toISOString() : null;
      saveGuild(form.dataset.guildId, {
        enabled: fields[0].checked,
        until: untilValue,
        note: fields[2].value
      }, form);
    });
    var accountSearch = byId('premiumAdminSearch');
    if (accountSearch) accountSearch.addEventListener('input', renderAdminGuilds);
    var paymentStatus = byId('premiumPaymentsStatus');
    if (paymentStatus) paymentStatus.addEventListener('change', function () {
      paymentsPage = 1;
      loadAdminData();
    });
    var previousPage = byId('premiumPaymentsPrevious');
    if (previousPage) previousPage.addEventListener('click', function () {
      if (paymentsPage > 1) {
        paymentsPage -= 1;
        loadAdminData();
      }
    });
    var nextPage = byId('premiumPaymentsNext');
    if (nextPage) nextPage.addEventListener('click', function () {
      if (paymentsPage < paymentsPages) {
        paymentsPage += 1;
        loadAdminData();
      }
    });

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
