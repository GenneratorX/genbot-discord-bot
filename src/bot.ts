import Discord = require('discord.js');
import ytdl = require('ytdl-core-discord');
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
    case 'play': case 'p':
      if (param.length > 0) {
        if (msg.member.voice.channel !== null) {
          if (ytdl.validateURL(param) === true) {
            playback(msg.member.voice.channel, param);
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
      break;
    default: break;
  }
});

/**
 * Start playing song in specific channel
 * @param voiceChannel Voice channel to join
 * @param ytLink YouTube video link
 */
async function playback(voiceChannel: Discord.VoiceChannel, ytLink: string): Promise<void> {
  const connection = await voiceChannel.join();
  const dispatcher = connection.play(
    await ytdl(ytLink, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }),
    {
      bitrate: 'auto',
      highWaterMark: 1,
      type: 'opus',
      volume: false,
    });

  dispatcher.on('start', () => {
    console.log('Song started');
  });

  dispatcher.on('finish', () => {
    console.log('Song ended');
    connection.disconnect();
  });

  dispatcher.on('error', console.error);
}

client.login(token);
