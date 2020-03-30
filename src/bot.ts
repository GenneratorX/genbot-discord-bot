'use strict';

import Discord = require('discord.js');
import ytdl = require('ytdl-core-discord');
import env = require('./env');
const client = new Discord.Client();

let currentVoiceChannel: Discord.VoiceChannel;
let connection: Discord.VoiceConnection;
let dispatcher: Discord.StreamDispatcher;
let isPlaying = false;
let songQueue: { videoID: string; videoTitle: string; videoDuration: string; addedBy: string }[];

client.on('ready', () => {
  if (client.user !== null) {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setStatus('online');
    client.user.setActivity('your requests', { type: 'LISTENING' });
  }
});

client.on('message', (msg: Discord.Message) => {
  if ((msg.channel.id !== '363672801451966464' && msg.channel.id !== '363106595132932098') ||
    msg.author.bot === true ||
    msg.content.startsWith(env.BOT_PREFIX) === false) return;

  const split = msg.content.split(' ');
  const command = (split.shift() as string).substring(1);
  const param = split.join(' ');

  console.log(`[COMMAND] ${command} [PARAM] ${param}`);

  switch (command) {
    case 'play': commandPlay(msg, param); break;
    case 'p': commandPlay(msg, param); break;
    case 'start': commandStartStop(msg, command); break;
    case 'stop': commandStartStop(msg, command); break;
    case 's': commandStartStop(msg, command); break;
    case 'queue': commandQueue(msg); break;
    case 'q': commandQueue(msg); break;
    case 'about': commandAbout(msg); break;
    case 'despre': commandAbout(msg); break;
    case 'help': commandHelp(msg); break;
    case 'h': commandHelp(msg); break;
    default:
      msg.channel.send(
        new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription(`Nu am auzit de comanda aia. ` +
            `Scrie **${env.BOT_PREFIX}help** pentru a vizualiza lista de comenzi`)
      );
      break;
  }
});

/**
 * Prepares the song to be played by the bot
 * @param msg Discord message object
 * @param param Message command parameter
 */
function commandPlay(msg: Discord.Message, param: string): void {
  if (param.length > 0) {
    if (msg.member !== null && msg.member.voice.channel !== null) {
      getSongInfo(param)
        .then((info) => {
          currentVoiceChannel = (msg.member as Discord.GuildMember).voice.channel as Discord.VoiceChannel;
          queueControl('add', {
            videoID: info.videoID,
            videoTitle: info.videoTitle,
            videoDuration: info.videoDuration,
            addedBy: msg.author.id,
          });
          msg.channel.send(
            new Discord.MessageEmbed()
              .setColor('#00FF00')
              .setAuthor('Adăugare melodie')
              .setTitle(info.videoTitle)
              .addFields(
                { name: 'Adăugat de', value: `<@${msg.author.id}>`, inline: true },
                { name: 'Durata', value: info.videoDuration, inline: true },
                {
                  name: 'Link YouTube',
                  value: `https://www.youtube.com/watch?v=${info.videoID}`,
                }
              )
          );
        })
        .catch(() => {
          msg.channel.send(
            new Discord.MessageEmbed()
              .setColor('#FF0000')
              .setTitle('Link-ul introdus este invalid!')
          );
        });
    } else {
      msg.channel.send(
        new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setTitle('Intră într-o cameră de voce că altfel o să ascult melodia singur!')
      );
    }
  } else {
    msg.channel.send(
      new Discord.MessageEmbed()
        .setColor('#00FF00')
        .setTitle(`${env.BOT_PREFIX}play <link YouTube>`)
        .setDescription(
          `Redă sunetul din videoclipul introdus în camera curentă.\nVarianta scurtă a comenzii: ` +
          `**${env.BOT_PREFIX}p <link YouTube>**`)
        .addField('Exemple',
          `${env.BOT_PREFIX}play <https://www.youtube.com/watch?v=dQw4w9WgXcQ>\n` +
          `${env.BOT_PREFIX}p <https://youtube.com/watch?v=r_0JjYUe5jo>`)
    );
  }
}

/**
 * Pauses/Unpauses the song playback
 * @param msg Discord message object
 * @param command Message command parameter
 */
function commandStartStop(msg: Discord.Message, command: string): void {
  if (isPlaying === true) {
    if (command === 'stop' || command === 's') {
      dispatcher.pause(true);
      isPlaying = false;
      msg.channel.send(
        new Discord.MessageEmbed()
          .setColor('#FFFF00')
          .setTitle('Opresc melodia imediat!')
      );
    }
  } else {
    if (songQueue !== undefined && songQueue.length !== 0) {
      if (command === 'start' || command === 's') {
        dispatcher.resume();
        isPlaying = true;
        msg.channel.send(
          new Discord.MessageEmbed()
            .setColor('#FFFF00')
            .setTitle('Continuăm de unde am rămas!')
        );
      }
    }
  }
}

/**
 * Displays the song queue
 * @param msg Message command parameter
 */
function commandQueue(msg: Discord.Message): void {
  if (songQueue !== undefined && songQueue.length > 0) {
    let musicList = `**Melodia curentă**\n` +
      `${songQueue[0].videoTitle} **[${songQueue[0].videoDuration}]** \`Adăugat de\` <@${songQueue[0].addedBy}>\n` +
      `-----------------------------------------------------------------------------------------------\n`;
    for (let i = 1; i < songQueue.length; i++) {
      musicList += `\`${i}.\` ${songQueue[i].videoTitle} **[${songQueue[i].videoDuration}]** ` +
        `\`Adăugat de\` <@${songQueue[i].addedBy}>\n\n`;
    }
    msg.channel.send(new Discord.MessageEmbed()
      .setColor('#00FF00')
      .setTitle('Listă de redare')
      .setDescription(musicList)
    );
  } else {
    msg.channel.send(
      new Discord.MessageEmbed()
        .setColor('#FFFF00')
        .setTitle('Lista de redare este goală!')
    );
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
      .addFields(
        { name: 'Dezvoltator', value: '<@242758294525968388>', inline: true },
        { name: 'Licență', value: 'GPLv3', inline: true },
        { name: 'Versiune', value: env.BOT_VERSION, inline: true },
        {
          name: '**Codul sursă este disponibil la adresa**',
          value: 'https://github.com/GenneratorX/genbot-discord-bot',
        }
      )
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
      .addFields(
        {
          name: `\`1.\` **${env.BOT_PREFIX}play / ${env.BOT_PREFIX}p <link YouTube>**`,
          value: 'Redă sunetul din videoclipul introdus',
        },
        {
          name: `\`2.\` **${env.BOT_PREFIX}stop / ${env.BOT_PREFIX}s**`,
          value: 'Oprește redarea videoclipului curent',
        },
        {
          name: `\`3.\` **${env.BOT_PREFIX}start / ${env.BOT_PREFIX}s**`,
          value: 'Repornește redarea videclipului curent',
        },
        {
          name: `\`4.\` **${env.BOT_PREFIX}queue / ${env.BOT_PREFIX}q**`,
          value: 'Afișează lista de redare',
        },
        {
          name: `\`0.\` **${env.BOT_PREFIX}about / ${env.BOT_PREFIX}despre**`,
          value: 'Afișează informații despre bot',
        }
      )
  );
}

/**
 * Starts playing a song in the current voice channel
 * @param ytLink YouTube [video link | video ID]
 */
async function musicControl(ytLink: string): Promise<void> {
  connection = await currentVoiceChannel.join();
  dispatcher = connection.play(await ytdl(ytLink, env.YTDL_CONFIG), env.DISPATCHER_CONFIG);

  dispatcher.on('start', () => {
    console.log(`Song started ${ytLink}`);
    isPlaying = true;
  });

  dispatcher.on('finish', () => {
    console.log(`Song ended ${ytLink}`);

    isPlaying = false;
    queueControl('remove');

    if (songQueue.length === 0) {
      connection.disconnect();
    }
  });

  dispatcher.on('error', console.error);

  connection.on('disconnect', () => {
    console.log(`Am ieșit!`);
    songQueue.length = 0;
    isPlaying = false;
  });

}

/**
 * Adds/Removes songs from the song queue
 * @param action Add/Remove YouTube link from song queue
 * @param videoInfo Video information object
 */
function queueControl(action: 'add' | 'remove',
  videoInfo?: { videoID: string; videoTitle: string; videoDuration: string; addedBy: string }): void {
  if (action === 'add' && videoInfo !== undefined) {
    if (songQueue !== undefined && songQueue.length > 0) {
      songQueue.push(videoInfo);
    } else {
      songQueue = [videoInfo];
      musicControl(videoInfo.videoID);
    }
  } else {
    if (songQueue.length > 0) {
      songQueue.shift();
      if (songQueue.length > 0) {
        musicControl(songQueue[0].videoID);
      }
    }
  }
}

/**
 * Gets the song info of a YouTube video
 * @param ytLink YouTube video URL to get the song info from
 * @return Song info
 */
async function getSongInfo(ytLink: string): Promise<{ videoID: string; videoTitle: string; videoDuration: string }> {
  if (ytdl.validateURL(ytLink) === true) {
    const songInfo = await ytdl.getBasicInfo(ytLink);

    let minutes = Math.floor(songInfo.player_response.videoDetails.lengthSeconds / 60).toString();
    let seconds = (songInfo.player_response.videoDetails.lengthSeconds % 60).toString();

    if (minutes.length === 1) {
      minutes = '0' + minutes;
    }
    if (seconds.length === 1) {
      seconds = '0' + seconds;
    }

    return {
      videoID: songInfo.player_response.videoDetails.videoId,
      videoTitle: songInfo.player_response.videoDetails.title,
      videoDuration: `${minutes}:${seconds}`,
    };
  }
  throw new Error('invalidYTLink');
}

client.login(env.BOT_TOKEN);
