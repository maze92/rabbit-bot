// src/commands/warn.js

const { PermissionsBitField } = require('discord.js');
const config = require('../config/defaultConfig');

const logger = require('../systems/logger');
const warningsService = require('../systems/warningsService');
const infractionsService = require('../systems/infractionsService');
const { t } = require('../systems/i18n');
const { isStaff } = require('../utils/staff');
const { safeDM } = require('../utils/dm');
const { getTrustConfig, getEffectiveMaxWarnings } = require('../utils/trust');

function stripTargetFromArgs(args, targetId) {
  if (!Array.isArray(args) || !targetId) return [];

  return args.filter((a) => {
    if (!a) return false;
    const s = String(a);
    const isMention = s.includes(`<@${targetId}>`) || s.includes(`<@!${targetId}>`);
    const isRawId = s === targetId;
    return !isMention && !isRawId;
  });
}

// isStaff and safeDM live in src/utils now

module.exports = {
  name: 'warn',
  description: 'Issue a warning to a user',

  async execute(message, args, client) {
    try {
      if (!message?.guild) return;
      if (!message.member) return;

      const guild = message.guild;
      const botMember = guild.members.me;
      if (!botMember) return;

      if (!isStaff(message.member)) {
        return message.reply(t('common.noPermission')).catch(() => null);
      }

      const target = message.mentions.members.first();
      if (!target) {
        return message
          .reply(t('common.usage', null, `${config.prefix}warn @user [reason...]`))
          .catch(() => null);
      }

      if (target.id === message.author.id) {
        return message.reply(t('warn.cannotWarnSelf')).catch(() => null);
      }

      if (target.id === client.user.id) {
        return message.reply(t('warn.cannotWarnBot')).catch(() => null);
      }

      if (target.roles.highest.position >= botMember.roles.highest.position) {
        return message.reply(t('warn.roleHierarchyBot')).catch(() => null);
      }

      const executorIsAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!executorIsAdmin && target.roles.highest.position >= message.member.roles.highest.position) {
        return message.reply(t('warn.roleHierarchyUser')).catch(() => null);
      }

      if (!executorIsAdmin && target.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply(t('warn.cannotWarnAdmin')).catch(() => null);
      }

      const cleanedArgs = stripTargetFromArgs(args, target.id);
      const reason = cleanedArgs.join(' ').trim() || t('common.noReason');

      const dbUser = await warningsService.addWarning(guild.id, target.id, 1);
      const baseMaxWarnings = config.maxWarnings ?? 3;

      // Aplicar mesma lógica de Trust Score que o AutoMod
      const trustCfg = getTrustConfig();
      let trustValue = trustCfg.base;
      if (dbUser && Number.isFinite(dbUser.trust)) {
        trustValue = dbUser.trust;
      }
      const effectiveMaxWarnings = getEffectiveMaxWarnings(baseMaxWarnings, trustCfg, trustValue);

      // Cria a infração com Case ID (se o sistema estiver ativo)
      const inf = await infractionsService
        .create({
          guild,
          user: target.user,
          moderator: message.author,
          type: 'WARN',
          reason,
          duration: null
        })
        .catch(() => null);

      await message.channel
        .send(
          t('warn.channelConfirm', null, {
            userMention: `${target}`,
            warnings: dbUser.warnings,
            maxWarnings: effectiveMaxWarnings,
            reason
          })
        )
        .catch(() => null);

      if (config.notifications?.dmOnWarn) {
        await safeDM(
          target.user,
          t('warn.dmText', null, {
            guildName: guild.name,
            warnings: dbUser.warnings,
            maxWarnings: effectiveMaxWarnings,
            reason
          })
        );
      }

      // Trust fica interno (apenas em logs). Aqui também colocamos o Case ID, se existir.
      const casePrefix = inf?.caseId ? `Case: **#${inf.caseId}**\n` : '';
      const description =
        casePrefix +
        t('log.actions.manualWarn', null, {
          reason,
          warnings: dbUser.warnings,
          maxWarnings: effectiveMaxWarnings,
          trust: dbUser.trust ?? 'N/A'
        });

      await logger(
        client,
        'Manual Warn',
        target.user,
        message.author,
        description,
        guild
      );
    } catch (err) {
      console.error('[warn] Error:', err);
      await message.reply(t('common.unexpectedError')).catch(() => null);
    }
  }
};
