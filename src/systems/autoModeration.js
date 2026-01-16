// src/systems/autoModeration.js
// ============================================================
// AutoMod 2.0 (com Trust Score)
// ------------------------------------------------------------
// Faz:
// - deteta banned words
// - apaga mensagem (se o bot tiver ManageMessages)
// - adiciona warning (warningsService)
// - cria infração WARN (infractionsService)
// - aplica timeout (MUTE) se atingir maxWarnings
// - ajusta trust score do utilizador via warningsService
//
// UX Upgrade (Ponto 3.1):
// ✅ Tenta enviar DM ao utilizador quando recebe WARN/MUTE
//    (toggle em config.notifications.dmOnWarn/dmOnMute)
//
// Regras recomendadas (config.trust ou defaults):
// - WARN  → trust -= 5
// - MUTE  → trust -= 15
// - a cada X dias sem infração → trust regenera (+1/dia até máximo)
// - trust < 10  → menos tolerância (menos avisos antes do mute, mute mais longo)
// - trust > 60  → pode ser usado para suavizar castigos leves (no futuro)
//
// NOTA IMPORTANTE:
// - Quem altera trust é o warningsService (addWarning/applyMutePenalty).
//   Aqui no AutoMod só LÊMOS o trust para decidir severidade.
// ============================================================

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('./logger');
const warningsService = require('./warningsService');
const infractionsService = require('./infractionsService');

// ------------------------------------------------------------
// Helpers de Trust (apenas leitura / interpretação)
// ------------------------------------------------------------

/**
 * Lê config.trust com defaults seguros.
 * Aqui só precisamos dos limiares e multiplicadores (não mexemos no trust).
 */
function getTrustConfig() {
  const cfg = config.trust || {};

  return {
    enabled: cfg.enabled !== false,

    base: cfg.base ?? 30,
    min: cfg.min ?? 0,
    max: cfg.max ?? 100,

    lowThreshold: cfg.lowThreshold ?? 10,         // trust muito baixo
    highThreshold: cfg.highThreshold ?? 60,       // trust "bom"

    lowTrustWarningsPenalty: cfg.lowTrustWarningsPenalty ?? 1, // reduz nº de avisos tolerados
    lowTrustMuteMultiplier: cfg.lowTrustMuteMultiplier ?? 1.5, // aumenta duração do mute
    highTrustMuteMultiplier: cfg.highTrustMuteMultiplier ?? 0.8 // reduz ligeiramente o mute
  };
}

/**
 * Calcula quantos avisos podem ser dados até ao mute,
 * ajustando pela trust (menos tolerância se trust muito baixa).
 */
function getEffectiveMaxWarnings(baseMaxWarnings, trustCfg, trustValue) {
  if (!trustCfg.enabled) return baseMaxWarnings;

  const t = Number.isFinite(trustValue) ? trustValue : trustCfg.base;
  let effective = baseMaxWarnings;

  // trust muito baixa → reduz nº de avisos tolerados (mais agressivo)
  if (t <= trustCfg.lowThreshold) {
    effective = Math.max(
      1,
      baseMaxWarnings - trustCfg.lowTrustWarningsPenalty
    );
  }

  // (Opcional futuro) Para trust alta podias dar +1 aviso:
  // if (t >= trustCfg.highThreshold) effective = baseMaxWarnings + 1;

  return effective;
}

/**
 * Ajusta duração do mute conforme trust (sem alterar trust).
 */
function getEffectiveMuteDuration(baseMs, trustCfg, trustValue) {
  if (!trustCfg.enabled) return baseMs;

  const t = Number.isFinite(trustValue) ? trustValue : trustCfg.base;
  let duration = baseMs;

  if (t <= trustCfg.lowThreshold) {
    duration = Math.round(baseMs * trustCfg.lowTrustMuteMultiplier);
  } else if (t >= trustCfg.highThreshold) {
    duration = Math.round(baseMs * trustCfg.highTrustMuteMultiplier);
  }

  // Garante pelo menos 30s e no máximo 28 dias (limite Discord)
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_MS = 30 * 1000;
  const MAX_MS = 28 * DAY_MS;

  if (!Number.isFinite(duration) || duration < MIN_MS) duration = MIN_MS;
  if (duration > MAX_MS) duration = MAX_MS;

  return duration;
}

// ------------------------------------------------------------
// Helpers UX: DM ao utilizador (Ponto 3.1)
// ------------------------------------------------------------

/**
 * Tenta enviar DM ao user (sem crashar se DMs estiverem fechadas).
 * - Respeita config.notifications
 */
async function trySendDM(user, content) {
  try {
    if (!user) return;
    if (!content) return;
    await user.send({ content }).catch(() => null);
  } catch {
    // nunca deixar o AutoMod falhar por causa de DM
  }
}

/**
 * Formata minutos de forma simples para mensagens
 */
function minutesFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60000));
}

// ============================================================
// Handler principal do AutoMod
// ============================================================
module.exports = async function autoModeration(message, client) {
  try {
    // --------------------------------------------------------
    // Validações básicas
    // --------------------------------------------------------
    if (!message?.guild) return;
    if (!message?.content) return;
    if (message.author?.bot) return;
    if (!message.member) return;

    // evita processar a mesma mensagem duas vezes
    if (message._autoModHandled) return;
    message._autoModHandled = true;

    const guild = message.guild;
    const botMember = guild.members.me;
    if (!botMember) return;

    const trustCfg = getTrustConfig();

    // --------------------------------------------------------
    // Bypass: Administradores
    // --------------------------------------------------------
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    // Hierarquia: user com cargo >= ao bot não pode ser moderado
    if (message.member.roles.highest.position >= botMember.roles.highest.position) {
      return;
    }

    // --------------------------------------------------------
    // Preparar lista de banned words
    // --------------------------------------------------------
    const bannedWords = [
      ...(config.bannedWords?.pt || []),
      ...(config.bannedWords?.en || [])
    ];

    const baseMaxWarnings = config.maxWarnings ?? 3;
    const baseMuteDuration = config.muteDuration ?? (10 * 60 * 1000); // 10 min

    // --------------------------------------------------------
    // Normalizar conteúdo da mensagem
    // --------------------------------------------------------
    const cleanContent = message.content
      .replace(/https?:\/\/\S+/gi, '')             // remove links
      .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')     // emojis custom
      .replace(/[^\w\s]/g, '')                     // pontuação
      .toLowerCase();

    // --------------------------------------------------------
    // Detetar banned words com suporte a variações tipo "leet"
    // --------------------------------------------------------
    const foundWord = bannedWords.find(word => {
      const pattern = String(word)
        .replace(/a/gi, '[a4@]')
        .replace(/e/gi, '[e3]')
        .replace(/i/gi, '[i1!]')
        .replace(/o/gi, '[o0]')
        .replace(/u/gi, '[uü]')
        .replace(/s/gi, '[s5$]');

      return new RegExp(`\\b${pattern}\\b`, 'i').test(cleanContent);
    });

    if (!foundWord) return;

    // --------------------------------------------------------
    // Permissões do bot
    // --------------------------------------------------------
    const perms = message.channel.permissionsFor(botMember);
    const canDelete = perms?.has(PermissionsBitField.Flags.ManageMessages);
    const canTimeout = perms?.has(PermissionsBitField.Flags.ModerateMembers);

    // Apagar mensagem ofensiva (se possível)
    if (canDelete) {
      await message.delete().catch(() => null);
    }

    // --------------------------------------------------------
    // +1 warning via warningsService
    // --------------------------------------------------------
    // IMPORTANTE:
    // - warningsService.addWarning já:
    //   * garante existência do user
    //   * faz regeneração de trust
    //   * aplica penalização de WARN
    const dbUser = await warningsService.addWarning(guild.id, message.author.id, 1);

    const currentTrust = Number.isFinite(dbUser.trust)
      ? dbUser.trust
      : trustCfg.base;

    // --------------------------------------------------------
    // Criar infração WARN
    // --------------------------------------------------------
    await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'WARN',
      reason: `AutoMod detected banned word: ${foundWord}`,
      duration: null
    }).catch(() => null);

    // --------------------------------------------------------
    // Calcular nº de warnings até mute, ajustado pela trust
    // --------------------------------------------------------
    const effectiveMaxWarnings = getEffectiveMaxWarnings(
      baseMaxWarnings,
      trustCfg,
      currentTrust
    );

    // --------------------------------------------------------
    // Aviso no canal
    // --------------------------------------------------------
    await message.channel.send({
      content:
        `⚠️ ${message.author}, inappropriate language is not allowed.\n` +
        `**Warning:** ${dbUser.warnings}/${effectiveMaxWarnings}\n` +
        (trustCfg.enabled
          ? `🔐 **Trust:** ${currentTrust}/${trustCfg.max}\n`
          : '')
    }).catch(() => null);

    // --------------------------------------------------------
    // ✅ DM ao utilizador (WARN) - Ponto 3.1
    // --------------------------------------------------------
    if (config.notifications?.dmOnWarn) {
      const dmText =
        `⚠️ You received an **automatic WARN** on the server. **${guild.name}**.\n` +
        `📝 Reason: **Inappropriate language** (detected word: "${foundWord}")\n` +
        `📌 Warnings: **${dbUser.warnings}/${effectiveMaxWarnings}**` +
        (trustCfg.enabled ? `\n🔐 Trust: **${currentTrust}/${trustCfg.max}**` : '');

      await trySendDM(message.author, dmText);
    }

    // --------------------------------------------------------
    // Log do WARN automático
    // --------------------------------------------------------
    await logger(
      client,
      'Automatic Warn',
      message.author,
      client.user,
      `Word: **${foundWord}**\n` +
      `Warnings: **${dbUser.warnings}/${effectiveMaxWarnings}**\n` +
      (trustCfg.enabled ? `Trust: **${currentTrust}/${trustCfg.max}**\n` : '') +
      `Deleted: **${canDelete ? 'yes' : 'no'}**`,
      guild
    );

    // --------------------------------------------------------
    // Ainda não atingiu limite para mute? Então termina aqui.
    // --------------------------------------------------------
    if (dbUser.warnings < effectiveMaxWarnings) {
      return;
    }

    // --------------------------------------------------------
    // Timeout automático (MUTE) se atingiu ou ultrapassou limite
    // --------------------------------------------------------
    if (!canTimeout || !message.member.moderatable) return;

    // duração do mute ajustada pela trust
    const effectiveMute = getEffectiveMuteDuration(
      baseMuteDuration,
      trustCfg,
      currentTrust
    );

    await message.member.timeout(effectiveMute, 'AutoMod: exceeded warning limit');

    // infração MUTE
    await infractionsService.create({
      guild,
      user: message.author,
      moderator: client.user,
      type: 'MUTE',
      reason: 'AutoMod: exceeded warning limit',
      duration: effectiveMute
    }).catch(() => null);

    // penalização extra de trust por MUTE (centralizada no warningsService)
    let afterMuteUser = dbUser;
    try {
      afterMuteUser = await warningsService.applyMutePenalty(guild.id, message.author.id);
    } catch {
      // se falhar, não quebra o fluxo
    }

    const trustAfterMute = Number.isFinite(afterMuteUser.trust)
      ? afterMuteUser.trust
      : currentTrust;

    await message.channel.send(
      `🔇 ${message.author} has been muted for **${Math.round(effectiveMute / 60000)} minutes** due to repeated infractions.`
    ).catch(() => null);

    // --------------------------------------------------------
    // ✅ DM ao utilizador (MUTE) - Ponto 3.1
    // --------------------------------------------------------
    if (config.notifications?.dmOnMute) {
      const mins = minutesFromMs(effectiveMute);

      const dmText =
        `🔇 You were **automatically mutated** on the server **${guild.name}**.\n` +
        `⏱️ Duration: **${mins} minutes**\n` +
        `📝 Reason: **Excedeste o limite de warnings**\n` +
        (trustCfg.enabled ? `🔐 Trust: **${trustAfterMute}/${trustCfg.max}**` : '');

      await trySendDM(message.author, dmText);
    }

    await logger(
      client,
      'Automatic Mute',
      message.author,
      client.user,
      `Duration: **${Math.round(effectiveMute / 60000)} minutes**\n` +
      (trustCfg.enabled ? `Trust after mute: **${trustAfterMute}/${trustCfg.max}**` : ''),
      guild
    );

    // reset warnings após mute (mas trust fica com penalização)
    await warningsService.resetWarnings(guild.id, message.author.id).catch(() => null);

  } catch (err) {
    console.error('[AutoMod] Critical error:', err);
  }
};
