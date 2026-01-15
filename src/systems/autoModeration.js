// src/systems/autoModeration.js
// ============================================================
// Sistema de AutoModeração
// - Deteta palavras proibidas (inclui frases)
// - Aplica warn automático (MongoDB)
// - Tenta apagar a mensagem (se tiver permissões e hierarquia permitir)
// - Aplica timeout ao atingir o limite
// - Logs centralizados via logger.js (Discord + Dashboard)
// ============================================================

const { PermissionsBitField } = require('discord.js');
const User = require('../database/models/User');
const config = require('../config/defaultConfig');
const logger = require('./logger');

/**
 * Normaliza texto para melhorar a deteção:
 * - remove links e emojis custom
 * - troca pontuação por espaços (mantém separação de palavras)
 * - lowercase
 * - colapsa espaços repetidos
 */
function normalizeContent(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, '')               // remove links
    .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')      // remove emojis custom
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')            // pontuação/símbolos -> espaço (unicode)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Constrói uma regex para apanhar:
 * - palavras simples: "shit"
 * - frases: "filho da puta"
 * - pequenas variações (leet básico): a->a4@, e->e3, i->i1!, o->o0, s->s5$
 *
 * Estratégia:
 * - Em vez de usar \b (falha com acentos e frases), usamos "delimitadores por espaço"
 * - Vamos testar em " hay = ` ${normalized} ` " e procurar " pattern " com espaços.
 */
function buildBannedRegex(wordOrPhrase) {
  const raw = String(wordOrPhrase || '').toLowerCase().trim();
  if (!raw) return null;

  // Escapar regex, mas vamos trabalhar caracter a caracter para aplicar leet
  // Também permitir múltiplos espaços na frase com \s+
  const parts = raw.split(/\s+/);

  const leetify = (w) =>
    w
      .replace(/a/g, '[a4@]')
      .replace(/e/g, '[e3]')
      .replace(/i/g, '[i1!]')
      .replace(/o/g, '[o0]')
      .replace(/u/g, '[uü]')
      .replace(/s/g, '[s5$]');

  // Escapa caracteres especiais de regex, depois aplica leet
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pattern = parts
    .map(p => leetify(escapeRegex(p)))
    .join('\\s+'); // suporta frases com espaços

  // Procurar com delimitadores por espaço (evita apanhar dentro de outras palavras)
  // Ex: " shit " ou " filho\s+da\s+puta "
  return new RegExp(`\\s${pattern}\\s`, 'i');
}

module.exports = async function autoModeration(message, client) {
  try {
    // ------------------------------------------------------------
    // Validações básicas
    // ------------------------------------------------------------
    if (!message?.guild) return;            // ignora DMs
    if (!message?.content) return;
    if (message.author?.bot) return;

    // Evitar processar a mesma mensagem várias vezes
    if (message._autoModHandled) return;
    message._autoModHandled = true;

    // Garantir member (às vezes vem vazio)
    if (!message.member) {
      try {
        await message.guild.members.fetch(message.author.id);
      } catch {
        // se não der para obter member, continuamos mas algumas checks podem falhar
      }
    }

    const guild = message.guild;
    const botMember = guild.members.me;
    if (!botMember) return;

    // ------------------------------------------------------------
    // Configurações
    // ------------------------------------------------------------
    const bannedWords = [
      ...(config.bannedWords?.pt || []),
      ...(config.bannedWords?.en || [])
    ];

    const maxWarnings = config.maxWarnings ?? 3;
    const muteDuration = config.muteDuration ?? 10 * 60 * 1000;

    // (Opcional) se quiseres que Admins também sejam moderados, mete false
    const bypassAdmins = config.autoModBypassAdmins ?? true;

    // ------------------------------------------------------------
    // Normalizar conteúdo e procurar palavra/frase proibida
    // ------------------------------------------------------------
    const normalized = normalizeContent(message.content);
    if (!normalized) return;

    // hack simples para usar "delimitadores por espaço"
    const hay = ` ${normalized} `;

    let foundWord = null;
    for (const w of bannedWords) {
      const re = buildBannedRegex(w);
      if (!re) continue;
      if (re.test(hay)) {
        foundWord = w;
        break;
      }
    }

    if (!foundWord) return;

    // ------------------------------------------------------------
    // Determinar se conseguimos moderar / apagar
    // (NÃO fazemos return cedo: mesmo que não possa apagar, ainda damos warn)
    // ------------------------------------------------------------
    const member = message.member;

    // Bypass admins (se ativo)
    if (bypassAdmins && member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
      console.log(`[AutoMod] Admin bypass: ${message.author.tag}`);
      return;
    }

    // Permissões do bot no canal
    const channelPerms = message.channel.permissionsFor(botMember);

    const canDelete =
      !!channelPerms?.has(PermissionsBitField.Flags.ManageMessages) &&
      message.deletable; // discord.js já avalia algumas condições

    const canTimeout =
      !!channelPerms?.has(PermissionsBitField.Flags.ModerateMembers);

    // Hierarquia: se o user tem role >= bot, o bot não consegue moderar/timeout (e às vezes nem delete)
    const higherOrEqualRole =
      member?.roles?.highest?.position >= botMember.roles.highest.position;

    // ------------------------------------------------------------
    // 1) Tentar apagar mensagem (se der)
    // ------------------------------------------------------------
    let deleteResult = 'not_attempted';

    if (canDelete && !higherOrEqualRole) {
      try {
        await message.delete();
        deleteResult = 'deleted';
      } catch (err) {
        deleteResult = `failed: ${err?.message || 'unknown error'}`;
        console.warn(`[AutoMod] Delete failed for ${message.author.tag}: ${err?.message || err}`);
      }
    } else {
      // Não conseguimos apagar -> explicar no log
      if (!channelPerms?.has(PermissionsBitField.Flags.ManageMessages)) {
        deleteResult = 'skipped: missing ManageMessages';
      } else if (higherOrEqualRole) {
        deleteResult = 'skipped: target role >= bot role';
      } else if (!message.deletable) {
        deleteResult = 'skipped: message not deletable';
      } else {
        deleteResult = 'skipped: unknown';
      }
    }

    // ------------------------------------------------------------
    // 2) DB: obter/criar user e somar warning
    // ------------------------------------------------------------
    let dbUser = await User.findOne({
      userId: message.author.id,
      guildId: guild.id
    });

    if (!dbUser) {
      dbUser = await User.create({
        userId: message.author.id,
        guildId: guild.id,
        warnings: 0,
        trust: 30
      });
    }

    dbUser.warnings += 1;
    await dbUser.save();

    // ------------------------------------------------------------
    // 3) Aviso no canal
    // ------------------------------------------------------------
    await message.channel.send({
      content:
        `⚠️ ${message.author}, inappropriate language is not allowed.\n` +
        `**Warning:** ${dbUser.warnings}/${maxWarnings}`
    }).catch(() => null);

    // ------------------------------------------------------------
    // 4) Log (Discord + Dashboard via logger.js)
    // ------------------------------------------------------------
    await logger(
      client,
      'Automatic Warn',
      message.author,
      client.user,
      `Word detected: **${foundWord}**\n` +
      `Warnings: **${dbUser.warnings}/${maxWarnings}**\n` +
      `Delete: **${deleteResult}**`,
      guild
    );

    // ------------------------------------------------------------
    // 5) Timeout automático ao atingir limite (se der)
    // ------------------------------------------------------------
    if (dbUser.warnings >= maxWarnings) {
      if (!canTimeout) {
        console.warn(`[AutoMod] Missing ModerateMembers for timeout in #${message.channel?.name}`);
        return;
      }

      if (higherOrEqualRole) {
        console.warn(`[AutoMod] Cannot timeout ${message.author.tag} (role >= bot)`);
        return;
      }

      if (!member?.moderatable) {
        console.warn(`[AutoMod] Member not moderatable: ${message.author.tag}`);
        return;
      }

      try {
        await member.timeout(muteDuration, 'Exceeded automatic warning limit');

        await message.channel.send(
          `🔇 ${message.author} has been muted for ${Math.round(muteDuration / 60000)} minutes due to repeated infractions.`
        ).catch(() => null);

        await logger(
          client,
          'Automatic Mute',
          message.author,
          client.user,
          `Duration: **${Math.round(muteDuration / 60000)} minutes**`,
          guild
        );

        // Reset warnings após mute
        dbUser.warnings = 0;
        await dbUser.save();
      } catch (err) {
        console.error('[AutoMod] Timeout failed:', err?.message || err);
      }
    }
  } catch (err) {
    console.error('[AutoMod] Critical error:', err);
  }
};
