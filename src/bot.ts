'use strict';

import Discord = require('discord.js');

import env = require('./env');
import db = require('./db');
import { MusicPlayer } from './musicPlayer';

const client = new Discord.Client();
const textChannels: string[] = [];

let musicPlayer: MusicPlayer;

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

client.on('message', msg => {
  if (
    textChannels.includes(msg.channel.id) === true &&
    msg.author.bot === false &&
    msg.content.startsWith(env.BOT_PREFIX) === true
  ) {
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
      case 'remove': commandRemove(param); break;
      case 'r': commandRemove(param); break;
      case 'playlist': commandPlaylist(msg, param); break;
      case 'about': commandAbout(msg); break;
      case 'despre': commandAbout(msg); break;
      case 'help': commandHelp(msg); break;
      case 'h': commandHelp(msg); break;
      default:
        msg.channel.send(
          new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setDescription(`Nu am auzit de comanda aia. ` +
              `Scrie **${env.BOT_PREFIX}help** pentru a vizualiza lista de comenzi.`)
        );
        break;
    }
  }
});

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

/**
 * Prepares the song to be played/paused by the bot
 * @param msg Discord message object
 * @param param Message command parameter
 * @param command Message command
 */
function commandPlayPause(msg: Discord.Message, param: string, command: string) {
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
 */
function commandSkip() {
  if (musicPlayer !== undefined) {
    musicPlayer.skipSong();
  }
}

/**
 * Displays the song queue
 */
function commandQueue() {
  if (musicPlayer !== undefined) {
    musicPlayer.displaySongQueue();
  }
}

/**
 * Remove a song from the song queue
 * @param param Message command parameter
 */
function commandRemove(param: string) {
  if (musicPlayer !== undefined) {
    musicPlayer.removeSong(parseInt(param, 10) - 1);
  }
}

/**
 * Saves a playlist to the database
 * @param msg Discord message object
 * @param param Message command parameter
 */
function commandPlaylist(msg: Discord.Message, param: string) {
  if (musicPlayer !== undefined) {
    const split = param.split(' ');
    const command = split.shift() as string;
    const parameter = split.join(' ');
    switch (command) {
      case 'save': musicPlayer.savePlaylist(parameter, msg.author.id); break;
      case 'load': musicPlayer.loadPlaylist(parameter); break;
      case 'delete': musicPlayer.removePlaylist(parameter); break;
      case '': musicPlayer.showPlaylists(); break;
      default: musicPlayer.showPlaylistSongs(command);
    }
  }
}

/**
 * Displays the about page
 * @param msg Message command parameter
 */
function commandAbout(msg: Discord.Message) {
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
function commandHelp(msg: Discord.Message) {
  msg.channel.send(
    new Discord.MessageEmbed()
      .setColor('#0000FF')
      .setTitle('Pagină comenzi bot')
      .setDescription('Funcționalitățile bot-ului sunt descrise prin combinații *comandă*-*parametrii*.\n' +
        ' * Parametrii obligatorii sunt marcați sub forma ** *<parametru>* **\n' +
        ' * Parametrii opționali sunt marcați sub forma ** *[parametru]* **'
      )
      .addFields({
        name: `\`1.\` **${env.BOT_PREFIX}play / ${env.BOT_PREFIX}p *[link YouTube]* **`,
        value: 'Redă sunetul din videoclipul introdus sau pornește redarea sunetului dacă acesta a fost oprit',
      }, {
        name: `\`2.\` **${env.BOT_PREFIX}pause / ${env.BOT_PREFIX}p**`,
        value: 'Oprește redarea melodiei curente',
      }, {
        name: `\`3.\` **${env.BOT_PREFIX}skip / ${env.BOT_PREFIX}s**`,
        value: 'Trece la melodia următoare dacă există',
      }, {
        name: `\`4.\` **${env.BOT_PREFIX}queue / ${env.BOT_PREFIX}q**`,
        value: 'Afișează lista de redare',
      }, {
        name: `\`5.\` **${env.BOT_PREFIX}remove / ${env.BOT_PREFIX}r *<poziție melodie>* **`,
        value: 'Șterge melodia din lista de redare',
      }, {
        name: `\`6.\` **${env.BOT_PREFIX}playlist *[nume playlist]* **`,
        value: 'Afișează listele de redare salvate sau melodiile aflate într-o listă de redare dacă numele acesteia ' +
          'este specificat\n' +
          '-----------------------------------------------------------------------------------------------',
      }, {
        name: `\`6.1.\` **${env.BOT_PREFIX}playlist load *<nume playlist>* **`,
        value: 'Încarcă melodiile salvate în lista de redare specificată și începe redarea',
        inline: true,
      }, {
        name: `\`6.2.\` **${env.BOT_PREFIX}playlist save *<nume playlist>* **`,
        value: 'Salvează melodiile introduse într-o listă de redare cu numele introdus',
        inline: true,
      }, {
        name: `\`6.3.\` **${env.BOT_PREFIX}playlist delete *<nume playlist>* **`,
        value: 'Șterge lista de redare specificată\n' +
          '-----------------------------------------------------------------------------------------------',
      }, {
        name: `\`0.\` **${env.BOT_PREFIX}about / ${env.BOT_PREFIX}despre**`,
        value: 'Afișează informații despre bot',
      })
  );
}

client.login(env.BOT_TOKEN);
