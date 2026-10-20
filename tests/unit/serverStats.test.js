const { ChannelType } = require('discord.js');
const { test, eq, deepEq } = require('./_harness');
const { removeGuild } = require('../../src/systems/serverStats');

test('removeGuild preserves manual channels and deletes managed stats channels', async () => {
  const modelPath = require.resolve('../../src/database/models/GuildConfig');
  const originalModel = require.cache[modelPath];
  let update = null;
  require.cache[modelPath] = {
    id: modelPath,
    filename: modelPath,
    loaded: true,
    exports: {
      findOne: () => ({
        lean: async () => ({
          features: {
            serverStats: {
              memberChannelId: 'members',
              joinsChannelId: 'joins',
              leavesChannelId: 'leaves',
              categoryId: 'stats'
            }
          }
        })
      }),
      updateOne: async (filter, value) => { update = { filter, value }; }
    }
  };

  const channels = new Map();
  function addChannel(id, type, parentId) {
    const channel = {
      id,
      type,
      parentId,
      delete: async () => channels.delete(id),
      setParent: async (newParentId) => { channel.parentId = newParentId; }
    };
    channels.set(id, channel);
    return channel;
  }

  addChannel('stats', ChannelType.GuildCategory, null);
  addChannel('members', ChannelType.GuildVoice, 'stats');
  addChannel('joins', ChannelType.GuildVoice, 'stats');
  addChannel('leaves', ChannelType.GuildVoice, 'stats');
  const manual = addChannel('manual', ChannelType.GuildText, 'stats');
  const guild = {
    id: '123456789012345678',
    channels: {
      cache: {
        get: (id) => channels.get(id) || null,
        filter: (predicate) => Array.from(channels.values()).filter(predicate)
      },
      fetch: async () => null
    }
  };

  try {
    await removeGuild(guild);
    eq(manual.parentId, null);
    eq(channels.has('manual'), true);
    eq(channels.has('members'), false);
    eq(channels.has('joins'), false);
    eq(channels.has('leaves'), false);
    eq(channels.has('stats'), false);
    deepEq(update, {
      filter: { guildId: guild.id },
      value: {
        $set: {
          'features.serverStats.memberChannelId': null,
          'features.serverStats.joinsChannelId': null,
          'features.serverStats.leavesChannelId': null,
          'features.serverStats.categoryId': null
        }
      }
    });
  } finally {
    if (originalModel) require.cache[modelPath] = originalModel;
    else delete require.cache[modelPath];
  }
});