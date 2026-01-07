module.exports = (client) => {
  client.once('clientReady', () => {
    console.log(`${client.user.tag} is online!`);
  });
};
