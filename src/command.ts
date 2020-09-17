'use strict';

import Discord = require('discord.js');

import env = require('./env');
import bot = require('./bot');

import { MusicPlayer } from './musicPlayer';

export let musicPlayer: MusicPlayer;

interface Commands extends Command {
  /**
   * Sub-commands of a command
   */
  subCommands?: Command[]
}

interface Command {
  /**
   * Command name
   */
  name: string,
  /**
   * Command function
   */
  function: (message: Discord.Message, lastParameter: string) => void, // eslint-disable-line no-unused-vars
}

export const commands: Commands[] = [
  {
    name: 'p',
    function: commandPlayPause,
  }, {
    name: 'play',
    function: commandPlay,
  }, {
    name: 'pause',
    function: commandPause,
  }, {
    name: 'skip',
    function: commandSkip,
  }, {
    name: 'queue',
    function: commandQueue,
  }, {
    name: 'remove',
    function: commandRemove,
  }, {
    name: 'playlist',
    function: commandPlaylist,
    subCommands: [
      {
        name: 'save',
        function: commandPlaylistSave,
      }, {
        name: 'load',
        function: commandPlaylistLoad,
      }, {
        name: 'delete',
        function: commandPlaylistDelete,
      }
    ],
  }, {
    name: 'latency',
    function: commandLatency,
  }, {
    name: 'about',
    function: commandAbout,
  }, {
    name: 'help',
    function: commandHelp,
  }
];

/**
 * Parses a user message
 * @param message Discord message object
 */
export function onMessage(message: Discord.Message) {
  if (message.content.charAt(0) === env.BOT_PREFIX) {
    if (message.author.bot === false) {
      if (bot.textChannels.includes(message.channel.id) === true) {
        const trimmedMessage = message.content.replace(/\s+/g, ' ');
        const cutString = splitAfterFirstSpace(trimmedMessage.substring(1));

        const lowercaseCommand = cutString.beforeSpace.toLowerCase();

        let matchedCommands: Commands[] = [];
        for (let i = 0; i < commands.length; i++) {
          if (commands[i].name === lowercaseCommand) {
            matchedCommands = [commands[i]];
            break;
          } else {
            if (commands[i].name.startsWith(lowercaseCommand) === true) {
              matchedCommands.push(commands[i]);
            }
          }
        }

        if (matchedCommands.length === 1) {
          if (matchedCommands[0].subCommands !== undefined && matchedCommands[0].subCommands.length > 0) {
            const cutString2 = splitAfterFirstSpace(cutString.afterSpace);

            const lowercaseSubCommand = cutString2.beforeSpace.toLowerCase();

            let matchedSubCommands: Command[] = [];
            for (let i = 0; i < matchedCommands[0].subCommands.length; i++) {
              if (matchedCommands[0].subCommands[i].name === lowercaseSubCommand) {
                matchedSubCommands = [matchedCommands[0].subCommands[i]];
                break;
              } else {
                if (matchedCommands[0].subCommands[i].name.startsWith(lowercaseSubCommand) === true) {
                  matchedSubCommands.push(matchedCommands[0].subCommands[i]);
                }
              }
            }

            if (matchedSubCommands.length === 1) {
              console.log(
                `[COMMAND L=${cutString.beforeSpace.length + cutString2.beforeSpace.length + 1}] ` +
                `${cutString.beforeSpace} ${cutString2.beforeSpace} ` +
                `[PARAMETER L=${cutString2.afterSpace.length}] ${cutString2.afterSpace}`
              );
              matchedSubCommands[0].function(message, cutString2.afterSpace);
            } else {
              console.log(
                `[COMMAND L=${cutString.beforeSpace.length}] ${cutString.beforeSpace} ` +
                `[PARAMETER L=${cutString2.beforeSpace.length}] ${cutString2.beforeSpace}`
              );
              matchedCommands[0].function(message, cutString2.beforeSpace);
            }
          } else {
            console.log(
              `[COMMAND L=${cutString.beforeSpace.length}] ${cutString.beforeSpace} ` +
              `[PARAMETER L=${cutString.afterSpace.length}] ${cutString.afterSpace}`
            );
            matchedCommands[0].function(message, cutString.afterSpace);
          }
        } else {
          const embed = new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Nu am auzit de comanda aia!')
            .setDescription('');

          if (matchedCommands.length !== 0) {
            let matchedCommandsText = '';
            for (let i = 0; i < matchedCommands.length; i++) {
              matchedCommandsText += `${env.BOT_PREFIX}${matchedCommands[i].name}\n`;
            }
            embed.description = `Comenzi care seamănă:\n**${matchedCommandsText}**`;
          }
          embed.description += `\nScrie **${env.BOT_PREFIX}help** pentru a vizualiza lista de comenzi.`;
          message.channel.send(embed);
        }
      }
    }
  }
}

/**
 * Checks if user command is play or pause
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandPlayPause(message: Discord.Message, lastParameter: string) {
  if (lastParameter.length > 0) {
    commandPlay(message, lastParameter);
  } else {
    if (musicPlayer !== undefined) {
      if (musicPlayer.isplaying === true) {
        musicPlayer.pause();
      } else {
        musicPlayer.unpause();
      }
    }
  }
}

/**
 * Plays/unpauses current playing song
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandPlay(message: Discord.Message, lastParameter: string) {
  if (musicPlayer !== undefined) {
    if (lastParameter.length > 0) {
      musicPlayer.addSong(lastParameter, message.author.id);
    } else {
      musicPlayer.unpause();
    }
  } else {
    if (lastParameter.length > 0) {
      if (message.member !== null && message.member.voice.channel !== null) {
        musicPlayer = new MusicPlayer(
          lastParameter,
          message.author.id,
          message.channel as Discord.TextChannel,
          message.member.voice.channel
        );
      } else {
        message.channel.send(
          new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Intră într-o cameră de voce că altfel o să ascult melodia singur!')
        );
      }
    }
  }
}

/**
 * Pauses current playing song
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandPause() {
  if (musicPlayer !== undefined) {
    musicPlayer.pause();
  }
}

/**
 * Skips current playing song
 */
function commandSkip() {
  if (musicPlayer !== undefined) {
    musicPlayer.skipSong();
  }
}

/**
 * Displays song queue
 */
function commandQueue() {
  if (musicPlayer !== undefined) {
    musicPlayer.displaySongQueue();
  }
}

/**
 * Removes a song from song queue
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandRemove(message: Discord.Message, lastParameter: string) {
  if (musicPlayer !== undefined) {
    musicPlayer.removeSong(parseInt(lastParameter, 10) - 1);
  }
}

/**
 * Displays playlist info
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandPlaylist(message: Discord.Message, lastParameter: string) {
  if (musicPlayer !== undefined) {
    if (lastParameter.length > 0) {
      musicPlayer.showPlaylistSongs(lastParameter);
    } else {
      musicPlayer.showPlaylists();
    }
  }
}

/**
 * Saves a playlists to database
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandPlaylistSave(message: Discord.Message, lastParameter: string) {
  if (musicPlayer !== undefined) {
    musicPlayer.savePlaylist(lastParameter, message.author.id);
  }
}

/**
 * Loads a playlists from database
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandPlaylistLoad(message: Discord.Message, lastParameter: string) {
  if (musicPlayer !== undefined) {
    musicPlayer.loadPlaylist(lastParameter);
  }
}

/**
 * Deletes a playlists from database
 * @param message Discord message
 * @param lastParameter Command last parameter
 */
function commandPlaylistDelete(message: Discord.Message, lastParameter: string) {
  if (musicPlayer !== undefined) {
    musicPlayer.removePlaylist(lastParameter);
  }
}

/**
 * Displays bot latency
 * @param message Discord message
 */
function commandLatency(message: Discord.Message) {
  message.channel.send(
    new Discord.MessageEmbed()
      .setColor('#0000FF')
      .setDescription(`**Latență (Bot - Server Discord):** ${bot.client.ws.ping}ms`)
  );
}

/**
 * Displays bot info
 * @param message Discord message
 */
function commandAbout(message: Discord.Message) {
  message.channel.send(
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
 * Displays command documentation
 * @param message Discord message
 */
function commandHelp(message: Discord.Message) {
  message.channel.send(
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

/**
 * Splits a string after the first space
 * @param string String to split
 * @returns Object containing two strings
 */
function splitAfterFirstSpace(string: string) {
  const firstSpaceIndex = string.indexOf(' ');

  if (firstSpaceIndex !== -1) {
    return {
      beforeSpace: string.substring(0, firstSpaceIndex),
      afterSpace: string.substring(firstSpaceIndex + 1),
    };
  }

  return {
    beforeSpace: string,
    afterSpace: '',
  };
}
