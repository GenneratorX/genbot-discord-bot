'use strict';

import Discord = require('discord.js');

import env = require('./env');
import db = require('./db');
import command = require('./command');

import { musicPlayer } from './command';

const client = new Discord.Client();
export const textChannels: string[] = [];

/**
 * Initialize database and Discord Gateway connection
 */
function init() {
  db.query('SELECT text_channel_id FROM text_channel;')
    .then(query => {
      for (let i = 0; i < query.length; i++) {
        textChannels.push(query[i].text_channel_id);
      }
      console.log(' -> Connected to database');
    }).catch(error => {
      console.log(error);
      process.exit(1);
    });

  client.login(env.BOT_TOKEN).catch(err => {
    console.log(err);
    process.exit(1);
  });
}

client.on('ready', () => {
  if (client.user !== null) {
    console.log(' -> Connected to Discord Gateway');
    client.user.setStatus('online');
    client.user.setActivity('your requests!', { type: 'LISTENING' });
  }
});

client.on('error', error => {
  console.log(error);
});

client.on('message', command.onMessage);
client.on('voiceStateUpdate', (oldState, newState) => {
  const oldUserChannel = oldState.channel;
  const newUserChannel = newState.channel;

  if (musicPlayer !== undefined && oldUserChannel !== newUserChannel) {
    if (newState.id === (client.user as Discord.ClientUser).id) {
      if (newUserChannel !== null) {
        musicPlayer.voiceChannel = newUserChannel as Discord.VoiceChannel;
      }
    } else {
      if (musicPlayer.voiceChannel.members.find(client => client.user.bot === false) !== undefined) {
        musicPlayer.enableNoUsersDisconnectTimer(false);
      } else {
        musicPlayer.enableNoUsersDisconnectTimer();
      }
    }
  }
});

function exitCleanup() {
  process.exit(1);
}

process.on('exit', () => {
  db.pool.end();
  console.log(' -> Disconnected from database!');
  client.destroy();
  console.log(' -> Disconnected from Discord Gateway!');
});

process.on('SIGINT', exitCleanup);
process.on('SIGUSR1', exitCleanup);
process.on('SIGUSR2', exitCleanup);
process.on('SIGTERM', exitCleanup);
process.on('uncaughtException', exitCleanup);

init();
