'use strict';

import Discord = require('discord.js');
import env = require('./env');
import { MusicPlayer } from './musicPlayer';
const client = new Discord.Client();

let musicPlayer: MusicPlayer;

client.on('ready', () => {
  if (client.user !== null) {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setStatus('online');
    client.user.setActivity('your requests!', { type: 'LISTENING' });
  }
});

client.on('error', error => {
  console.log(error);
});

client.on('message', (msg: Discord.Message) => {
  if ((msg.channel.id !== '363672801451966464' && msg.channel.id !== '363106595132932098') ||
    msg.author.bot === true ||
    msg.content.startsWith(env.BOT_PREFIX) === false) return;

  const split = msg.content.split(' ');
  const command = (split.shift() as string).substring(1);
  const param = split.join(' ');

  console.log(`[COMMAND L=${command.length}] ${command} [PARAM L=${param.length}] ${param}`);

  switch (command) {
    case 'play': commandPlayPause(msg, param, command); break;
    case 'pause': commandPlayPause(msg, param, command); break;
    case 'p': commandPlayPause(msg, param, command); break;
    case 'skip': commandSkip(); break;
    case 's': commandSkip(); break;
    case 'queue': commandQueue(); break;
    case 'q': commandQueue(); break;
    case 'about': commandAbout(msg); break;
    case 'despre': commandAbout(msg); break;
    case 'help': commandHelp(msg); break;
    case 'h': commandHelp(msg); break;
    case 'sa':
      client.channels.fetch('363672801451966464').then(chn => {
        if (chn.type === 'text') {
          (chn as Discord.TextChannel).send('sa');
        }
      });
      break;
    default:
      msg.channel.send(
        new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription(`Nu am auzit de comanda aia. ` +
            `Scrie **${env.BOT_PREFIX}help** pentru a vizualiza lista de comenzi.`)
      );
      break;
  }
});

/**
 * Prepares the song to be played/paused by the bot
 * @param msg Discord message object
 * @param param Message command parameter
 * @param command Message command
 */
function commandPlayPause(msg: Discord.Message, param: string, command: string): void {
  if (param.length > 0) {
    if (musicPlayer !== undefined && musicPlayer.songCount !== 0) {
      musicPlayer.addSong(param, msg.author.id);
    } else {
      if (msg.member !== null && msg.member.voice.channel !== null) {
        musicPlayer = new MusicPlayer(
          param,
          msg.author.id,
          msg.channel as Discord.TextChannel,
          msg.member.voice.channel
        );
      } else {
        msg.channel.send(
          new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Intră într-o cameră de voce că altfel o să ascult melodia singur!')
        );
      }
    }
  } else {
    if (musicPlayer !== undefined && musicPlayer.songCount !== 0) {
      if (musicPlayer.isplaying === true) {
        if (command === 'pause' || command === 'p') {
          musicPlayer.pause();
        }
      } else {
        if (command === 'play' || command === 'p') {
          musicPlayer.unpause();
        }
      }
    }
  }
}

/**
 * Skips the current song if there is any
 * @param msg Discord message object
 */
function commandSkip(): void {
  if (musicPlayer !== undefined) {
    musicPlayer.skipSong();
  }
}

/**
 * Displays the song queue
 * @param msg Message command parameter
 */
function commandQueue(): void {
  if (musicPlayer !== undefined) {
    musicPlayer.displaySongQueue();
  }
}

/**
 * Displays the about page
 * @param msg Message command parameter
 */
function commandAbout(msg: Discord.Message): void {
  msg.channel.send(
    new Discord.MessageEmbed()
      .setColor('#0000FF')
      .setTitle('Despre')
      .setDescription('Bot de muzică destinat __exclusiv__ comunității **BOOSTED SHITZ**!')
      .addFields({
        name: 'Dezvoltator',
        value: '<@242758294525968388>',
        inline: true,
      }, {
        name: 'Licență',
        value: 'GPLv3',
        inline: true,
      }, {
        name: 'Versiune',
        value: env.BOT_VERSION,
        inline: true,
      }, {
        name: '**Codul sursă este disponibil la adresa**',
        value: 'https://github.com/GenneratorX/genbot-discord-bot',
      })
  );
}

/**
 * Displays the help page
 * @param msg Message command parameter
 */
function commandHelp(msg: Discord.Message): void {
  msg.channel.send(
    new Discord.MessageEmbed()
      .setColor('#0000FF')
      .setTitle('Pagină comenzi bot')
      .addFields({
        name: `\`1.\` **${env.BOT_PREFIX}play / ${env.BOT_PREFIX}p [link YouTube]**`,
        value: 'Redă sunetul din videoclipul introdus sau pornește redarea sunetului dacă acesta a fost oprit',
      }, {
        name: `\`2.\` **${env.BOT_PREFIX}pause / ${env.BOT_PREFIX}p**`,
        value: 'Oprește redarea videoclipului curent',
      }, {
        name: `\`3.\` **${env.BOT_PREFIX}skip / ${env.BOT_PREFIX}s**`,
        value: 'Trece la melodia următoare dacă există',
      }, {
        name: `\`4.\` **${env.BOT_PREFIX}queue / ${env.BOT_PREFIX}q**`,
        value: 'Afișează lista de redare',
      }, {
        name: `\`0.\` **${env.BOT_PREFIX}about / ${env.BOT_PREFIX}despre**`,
        value: 'Afișează informații despre bot',
      })
  );
}

client.login(env.BOT_TOKEN);
