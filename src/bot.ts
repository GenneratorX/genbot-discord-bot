import Discord = require('discord.js');
import ytdl = require('ytdl-core-discord');
const client = new Discord.Client();
const { prefix, token } = require('./config.json');

let currentVoiceChannel: Discord.VoiceChannel;
let connection: Discord.VoiceConnection;
let dispatcher: Discord.StreamDispatcher;
let isPlaying = false;
let songQueue: string[] = [];
const ytdlConfig = {
  quality: 'highestaudio',
  highWaterMark: 1 << 25,
};
const dispatcherConfig: { bitrate: 'auto'; fec: boolean; highWaterMark: number; type: 'opus'; volume: boolean } = {
  bitrate: 'auto',
  fec: true,
  highWaterMark: 1,
  type: 'opus',
  volume: false,
};

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

  if (command === 'repeta') {
    if (param.length > 0) {
      msg.channel.send(`**Matale ai spus:** ${param}`);
    } else {
      msg.channel.send(`Păi dă-mi un mesaj să îl repet, băi! <:cmonBruh:646737462256992296>`);
    }
    return;
  }

  if (command === 'play' || command === 'p') {
    if (param.length > 0) {
      if (msg.member.voice.channel !== null) {
        if (ytdl.validateURL(param) === true) {
          currentVoiceChannel = msg.member.voice.channel;
          queueControl('add', param);
          ytdl.getBasicInfo(param)
            .then((info) => {
              const minutes = Math.floor(info.player_response.videoDetails.lengthSeconds / 60);
              const seconds = info.player_response.videoDetails.lengthSeconds % 60;

              msg.channel.send(
                new Discord.MessageEmbed()
                  .setColor('#00FF00')
                  .setAuthor('--------------- ÎN CURS DE REDARE ---------------')
                  .setTitle(info.player_response.videoDetails.title)
                  .addFields(
                    { name: 'Adăugat de', value: `<@${msg.author.id}>`, inline: true },
                    { name: 'Durata', value: `${minutes}:${seconds}`, inline: true },
                    {
                      name: 'Link YouTube',
                      value: `https://www.youtube.com/watch?v=${info.player_response.videoDetails.videoId}`,
                    }
                  )
              );
            })
            .catch(console.log);
        } else {
          msg.channel.send(
            new Discord.MessageEmbed()
              .setColor('#FF0000')
              .setTitle('Link-ul introdus este invalid!')
          );
        }
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
          .setTitle(`${prefix}play <link YouTube>`)
          .setDescription(
            `Redă sunetul din videoclipul introdus în camera curentă.\nVarianta scurtă a comenzii: ` +
            `**${prefix}p <link YouTube>**`)
          .addField('Exemple',
            `${prefix}play <https://www.youtube.com/watch?v=dQw4w9WgXcQ>\n` +
            `${prefix}p <https://youtube.com/watch?v=r_0JjYUe5jo>`)
      );
    }
    return;
  }

  if (command === 'start' || command === 'stop' || command === 's') {
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
      if (songQueue.length !== 0) {
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
    return;
  }
});

/**
 * Starts playing a song in the current voice channel
 * @param ytLink YouTube video link
 */
async function musicControl(ytLink: string): Promise<void> {
  connection = await currentVoiceChannel.join();
  dispatcher = connection.play(await ytdl(ytLink, ytdlConfig), dispatcherConfig);

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

  connection.on('closing', () => {
    console.log(`Am ieșit!`);
    songQueue.length = 0;
    isPlaying = false;
  });

}

/**
 * Adds/Removes songs from the song queue
 * @param action Add/Remove YouTube link from song queue
 * @param ytLink The YouTube link to add
 */
function queueControl(action: 'add' | 'remove', ytLink?: string): void {
  if (action === 'add' && ytLink !== undefined) {
    if (songQueue.length > 0) {
      songQueue.push(ytLink);
    } else {
      songQueue = [ytLink];
      musicControl(ytLink);
    }
  } else {
    if (songQueue.length > 0) {
      songQueue.shift();
      if (songQueue.length > 0) {
        musicControl(songQueue[0]);
      }
    }
  }
}

client.login(token);
