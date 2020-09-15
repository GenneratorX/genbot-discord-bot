'use strict';

import Discord = require('discord.js');

import env = require('./env');
import db = require('./db');
import command = require('./command');

import { musicPlayer } from './command';

const client = new Discord.Client();
export const textChannels: string[] = [];

client.on('ready', () => {
  if (client.user !== null) {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setStatus('online');
    client.user.setActivity('your requests!', { type: 'LISTENING' });
  }

  db.query('SELECT text_channel_id FROM text_channel;')
    .then(query => {
      for (let i = 0; i < query.length; i++) {
        textChannels.push(query[i].text_channel_id);
      }
    })
    .catch(error => {
      console.log(error);
      process.exit(1);
    });
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

client.login(env.BOT_TOKEN);
