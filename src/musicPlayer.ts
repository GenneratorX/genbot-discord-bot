'use strict';

import Discord = require('discord.js');
import ytdl = require('ytdl-core');

import env = require('./env');

export class MusicPlayer {

  private songList: {
    ytdlVideoInfo: ytdl.videoInfo,
    addedBy: string,
  }[];

  private currentTextChannel: Discord.TextChannel;
  private currentVoiceChannel: Discord.VoiceChannel;
  private currentSong: number;
  private isPlaying: boolean;

  private voiceConnection?: Discord.VoiceConnection;
  private streamDispatcher?: Discord.StreamDispatcher;

  private disconnectTimer: NodeJS.Timeout;

  /**
   * @param youtubeLink YouTube link to play
   * @param addedBy ID of the user that sent the link
   * @param textChannel Text channel object of the message containing the link
   * @param voiceChannel Voice channel object of the user that sent the message
   */
  constructor(
    youtubeLink: string,
    addedBy: string,
    textChannel: Discord.TextChannel,
    voiceChannel: Discord.VoiceChannel
  ) {
    this.songList = [];
    this.currentSong = -1;
    this.isPlaying = false;

    this.currentTextChannel = textChannel;
    this.currentVoiceChannel = voiceChannel;

    this.disconnectTimer = setTimeout(() => { }, 100);

    this.addSong(youtubeLink, addedBy);
  }

  /**
   * Adds a song to the song queue
   * @param youtubeLink YouTube link to add to the song queue
   * @param addedBy ID of the user that added the link
   */
  addSong(youtubeLink: string, addedBy: string) {
    if (ytdl.validateURL(youtubeLink) === true) {
      ytdl.getInfo(youtubeLink)
        .then(videoInfo => {
          this.songList.push({
            ytdlVideoInfo: videoInfo,
            addedBy: addedBy,
          });
          this.currentTextChannel.send(
            new Discord.MessageEmbed()
              .setColor('#00FF00')
              .setAuthor('Adăugare melodie')
              .setTitle(Discord.Util.escapeMarkdown(videoInfo.title))
              .addFields({
                name: 'Adăugat de',
                value: `<@${addedBy}>`,
                inline: true,
              }, {
                name: 'Durata',
                value: prettyPrintDuration(videoInfo.player_response.videoDetails.lengthSeconds),
                inline: true,
              }, {
                name: 'Poziție',
                value: this.songList.length,
                inline: true,
              })
          );
          if (this.currentSong === -1) {
            this.playSong(this.songList.length - 1);
          }
        })
        .catch(error => {
          console.log(error);
          this.currentTextChannel.send(
            new Discord.MessageEmbed()
              .setColor('#FF0000')
              .setTitle('Ceva nu a mers bine ... mai încearcă odată!')
          );
        });
    } else {
      this.currentTextChannel.send(
        new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setTitle('Link-ul introdus este invalid!')
      );
    }
  }

  /**
   * Remove a song from the song queue
   * @param songPosition Position of the song in the song queue
   */
  removeSong(songPosition: number) {
    if (this.songList[songPosition] !== undefined) {
      this.songList.splice(songPosition, 1);
      if (songPosition === this.currentSong) {
        this.playSong(songPosition);
      }
    } else {
      this.currentTextChannel.send(
        new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setTitle(`Poziția **${songPosition}** nu există!`)
      );
    }
  }

  /**
   * Starts the playback of a song
   * @param songPosition Position of the song in the song queue
   */
  async playSong(songPosition: number) {
    if (this.songList[songPosition] !== undefined) {
      clearTimeout(this.disconnectTimer);
      this.currentSong = songPosition;
      try {
        if (this.voiceConnection === undefined || this.voiceConnection.status === 4) {
          this.voiceConnection = await this.currentVoiceChannel.join();

          this.voiceConnection.on('disconnect', () => {
            console.log(`[DISCONNECTED FROM VOICE CHANNEL]`);
            this.songList.length = 0;
          });

          this.voiceConnection.on('error', error => {
            console.log(error);
            this.isPlaying = false;
            this.currentTextChannel.send(
              new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Am avut o problemă la conectare ... mai încearcă odată!')
            );
          });
        }

        this.streamDispatcher = this.voiceConnection.play(
          ytdl.downloadFromInfo(this.songList[songPosition].ytdlVideoInfo, env.YTDL_CONFIG),
          env.DISPATCHER_CONFIG
        );

        this.streamDispatcher.on('start', () => {
          console.log(`  [SONG START] ${this.songList[songPosition].ytdlVideoInfo.video_id}`);
          this.isPlaying = true;
          this.currentTextChannel.send(
            new Discord.MessageEmbed()
              .setColor('#00FF00')
              .setAuthor('În curs de redare...')
              .setTitle(`🎵🎵 ${Discord.Util.escapeMarkdown(this.songList[songPosition].ytdlVideoInfo.title)} 🎵🎵`)
              .addFields({
                name: 'Adăugat de',
                value: `<@${this.songList[songPosition].addedBy}>`,
                inline: true,
              }, {
                name: 'Link YouTube',
                value: `https://www.youtube.com/watch?v=${this.songList[songPosition].ytdlVideoInfo.video_id}`,
                inline: true,
              })
          );
        });

        this.streamDispatcher.on('finish', () => {
          console.log(`  [SONG END]   ${this.songList[songPosition].ytdlVideoInfo.video_id}`);
          this.isPlaying = false;
          this.playSong(songPosition + 1);
        });

        this.streamDispatcher.on('error', error => {
          console.log(error);
          this.isPlaying = false;
          this.playSong(songPosition + 1);

          this.currentTextChannel.send(
            new Discord.MessageEmbed()
              .setColor('#FF0000')
              .setTitle('Ceva nu a mers bine la redarea melodiei ... trec la următoarea!')
          );
        });
      } catch (error) {
        console.log(error);
        this.currentTextChannel.send(
          new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Ceva nu a mers bine ... mai încearcă odată!')
        );
      }
    } else {
      this.currentSong = -1;
      this.disconnectTimer = setTimeout(() => {
        if (this.voiceConnection !== undefined) {
          this.voiceConnection.disconnect();
        }
        this.currentTextChannel.send(
          new Discord.MessageEmbed()
            .setColor('#FFFF00')
            .setTitle('Nimeni nu m-a mai băgat în seamă de ceva timp așa că am ieșit!')
        );
      }, 10000); // 5 minutes = 300000
    }
  }

  /**
   * Pauses the current song
   */
  pause() {
    if (this.isPlaying === true && this.streamDispatcher !== undefined) {
      this.streamDispatcher.pause(true);
      this.isPlaying = false;
      this.currentTextChannel.send(
        new Discord.MessageEmbed()
          .setColor('#FFFF00')
          .setTitle('Opresc melodia imediat!')
      );
    }
  }

  /**
   * Unpauses the current song
   */
  unpause() {
    if (this.isPlaying === false && this.streamDispatcher !== undefined && this.streamDispatcher.destroyed === false) {
      this.streamDispatcher.resume();
      this.isPlaying = true;
      this.currentTextChannel.send(
        new Discord.MessageEmbed()
          .setColor('#FFFF00')
          .setTitle('Continuăm de unde am rămas!')
      );
    }
  }

  /**
   * Skips the current song
   */
  skipSong() {
    if (this.currentSong !== -1 && this.streamDispatcher !== undefined) {
      this.streamDispatcher.end();
      this.currentTextChannel.send(
        new Discord.MessageEmbed()
          .setColor('#FFFF00')
          .setTitle('Trecem la următoarea melodie...')
      );
    }
  }

  /**
   * Displays the song queue in a pretty format
   */
  displaySongQueue() {
    if (this.songList.length > 0) {
      let songQueue = '';
      for (let i = 0; i < this.songList.length; i++) {
        if (i === this.currentSong) {
          songQueue +=
            `**===========================================================**\n` +
            `\`${i + 1}.\` **${Discord.Util.escapeMarkdown(this.songList[i].ytdlVideoInfo.title)} ` +
            `[${prettyPrintDuration(this.songList[i].ytdlVideoInfo.player_response.videoDetails.lengthSeconds)}]** ` +
            `\`Adăugat de\`<@${this.songList[i].addedBy}>\n` +
            `**===========================================================**\n`;
        } else {
          songQueue +=
            `\`${i + 1}.\` ${Discord.Util.escapeMarkdown(this.songList[i].ytdlVideoInfo.title)} ` +
            `**[${prettyPrintDuration(this.songList[i].ytdlVideoInfo.player_response.videoDetails.lengthSeconds)}]** ` +
            `\`Adăugat de\`<@${this.songList[i].addedBy}>\n`;
        }
      }
      this.currentTextChannel.send(
        new Discord.MessageEmbed()
          .setColor('#00FF00')
          .setTitle('Listă de redare')
          .setDescription(songQueue)
          .setFooter(
            `Număr melodii: ${this.songList.length} | ` +
            `Durată: ${prettyPrintDuration(this.songQueueDuration)}`
          )
      );
    } else {
      this.currentTextChannel.send(
        new Discord.MessageEmbed()
          .setColor('#FFFF00')
          .setTitle('Lista de redare este goală!')
      );
    }
  }

  /**
   * Play status
   */
  get isplaying() {
    return this.isPlaying;
  }

  /**
   * Song queue length
   */
  get songCount() {
    return this.songList.length;
  }

  /**
   * Song queue duration
   */
  get songQueueDuration() {
    let duration = 0;
    for (let i = 0; i < this.songList.length; i++) {
      duration += parseInt(this.songList[i].ytdlVideoInfo.length_seconds);
    }
    return duration;
  }
}

/**
 * Prints duration in minutes:seconds format
 * @param duration Duration in seconds
 * @returns Pretty time
 */
function prettyPrintDuration(duration: number) {
  let minutes = Math.floor(duration / 60).toString();
  let seconds = (duration % 60).toString();

  if (minutes.length === 1) {
    minutes = '0' + minutes;
  }
  if (seconds.length === 1) {
    seconds = '0' + seconds;
  }

  return `${minutes}:${seconds}`;
}
