import Discord = require('discord.js');
const client = new Discord.Client();
const { prefix, token } = require('./config.json');

client.on('ready', () => {
  if (client.user !== null) {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setStatus('online');
    client.user.setActivity('sunt un papagal!');
  }
});

client.on('message', (msg: Discord.Message) => {
  if ((msg.channel.id !== '363672801451966464' && msg.channel.id !== '363106595132932098') ||
    msg.author.bot === true ||
    msg.content.startsWith(prefix) === false) return;

  const split = msg.content.split(' ');
  const command = split.shift().substring(1);
  const param = split.join(' ');

  console.log(`[COMMAND] ${command} [PARAM] ${param}`);
  switch (command) {
    case `repeta`:
      if (param.length > 0) {
        msg.channel.send(`**Matale ai spus:** ${param}`);
      } else {
        msg.channel.send(`Păi dă-mi un mesaj să îl repet, băi! <:cmonBruh:646737462256992296>`);
      }
      break;
    default: break;
  }
});

client.login(token);
