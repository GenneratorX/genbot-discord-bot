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
          if (videoInfo.player_response.playabilityStatus.status === 'OK') {
            videoInfo = this.cleanYtdlVideoInfoObject(videoInfo);
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
          } else {
            this.sendSimpleMessage('Videoclipul introdus nu este disponibil pentru redare! Încearcă alt link', 'error');
          }
        })
        .catch(error => {
          console.log(error);
          this.sendSimpleMessage('Ceva nu a mers bine ... mai încearcă odată!', 'error');
        });
    } else {
      this.sendSimpleMessage('Link-ul introdus este invalid!', 'error');
    }
  }

  /**
   * Remove a song from the song queue
   * @param songPosition Position of the song in the song queue
   */
  removeSong(songPosition: number) {
    if (isNaN(songPosition) === false && songPosition >= 0) {
      if (this.songList[songPosition] !== undefined) {
        this.songList.splice(songPosition, 1);

        if (songPosition === this.currentSong) {
          if (this.songList[songPosition] !== undefined) {
            this.playSong(songPosition);
          } else {
            if (this.streamDispatcher !== undefined) {
              this.streamDispatcher.end();
            }
          }
        }

        if (songPosition < this.currentSong) {
          this.currentSong--;
        }

        this.sendSimpleMessage(`Am șters melodia aflată pe poziția ${songPosition + 1}`, 'notification');
      } else {
        this.sendSimpleMessage(`Poziția **${songPosition + 1}** nu există!`, 'error');
      }
    } else {
      this.sendSimpleMessage('Poziția trebuie să fie un număr întreg pozitiv!', 'error');
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
        if (this.voiceConnection === undefined) {
          console.log(`[CREATED VOICE CONNECTION]`);
          this.voiceConnection = await this.currentVoiceChannel.join();

          this.voiceConnection.on('disconnect', () => {
            console.log(`[DISCONNECTED FROM VOICE CHANNEL]`);
            clearTimeout(this.disconnectTimer);
            while (this.songList.length > 0) {
              this.songList.pop();
            }
          });

          this.voiceConnection.on('error', error => {
            console.log(error);
            this.isPlaying = false;
            this.sendSimpleMessage('Am avut o problemă la conectare ... mai încearcă odată!', 'error');
          });
        }

        this.streamDispatcher = this.voiceConnection.play(
          ytdl.downloadFromInfo(this.songList[songPosition].ytdlVideoInfo, env.YTDL_CONFIG),
          env.DISPATCHER_CONFIG
        );

        this.streamDispatcher.on('start', () => {
          console.log(`  [SONG START] ${this.songList[songPosition].ytdlVideoInfo.video_id} ` +
            `[AUDIO BITRATE=${this.songList[songPosition].ytdlVideoInfo.formats[0].audioBitrate}]`);
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
          console.log(`  [SONG END]`);
          this.isPlaying = false;
          this.playSong(songPosition + 1);
        });

        this.streamDispatcher.on('error', error => {
          console.log(error);
          this.isPlaying = false;
          this.playSong(songPosition + 1);

          this.sendSimpleMessage('Ceva nu a mers bine la redarea melodiei ... trec la următoarea!', 'error');
        });
      } catch (error) {
        console.log(error);
        switch (error.message) {
          case 'You do not have permission to join this voice channel.':
            this.sendSimpleMessage('Nu am permisiunile necesare pentru a intra în camera de voce!', 'error');
            break;
          case 'Connection not established within 15 seconds.':
            this.sendSimpleMessage(
              'Am încercat să intru în camera de voce însă nu am reușit. O să încerc să intru iar imediat!', 'error'
            );
            this.playSong(songPosition);
            break;
          default: this.sendSimpleMessage('Ceva nu a mers bine ... mai încearcă odată!', 'error');
        }
      }
    } else {
      this.currentSong = -1;
      this.disconnectTimer = setTimeout(() => {
        if (this.voiceConnection !== undefined) {
          this.voiceConnection.disconnect();
        }
        this.sendSimpleMessage('Am stat degeaba 5 minute ... așa că am ieșit!', 'notification');
      }, 300000); // 5 minutes
    }
  }

  /**
   * Pauses the current song
   */
  pause() {
    if (this.isPlaying === true && this.streamDispatcher !== undefined) {
      this.streamDispatcher.pause(true);
      this.isPlaying = false;
      this.sendSimpleMessage('Opresc melodia imediat!', 'notification');
    }
  }

  /**
   * Unpauses the current song
   */
  unpause() {
    if (this.isPlaying === false && this.streamDispatcher !== undefined && this.streamDispatcher.destroyed === false) {
      this.streamDispatcher.resume();
      this.isPlaying = true;
      this.sendSimpleMessage('Continuăm de unde am rămas!', 'notification');
    }
  }

  /**
   * Skips the current song
   */
  skipSong() {
    if (this.currentSong !== -1 && this.streamDispatcher !== undefined) {
      this.streamDispatcher.end();
      this.sendSimpleMessage('Trecem la următoarea melodie...', 'notification');
    }
  }

  /**
   * Displays the song queue in a pretty format
   */
  displaySongQueue() {
    const MAX_DESCRIPTION_LENGTH = 2048;
    if (this.songList.length > 0) {
      let songQueueEmbed = new Discord.MessageEmbed()
        .setColor('#00FF00')
        .setTitle('Listă de redare');

      for (let i = 0; i < this.songList.length; i++) {
        let newSong = '';
        if (i === this.currentSong) {
          newSong =
            `\n**==================== [ MELODIA CURENTĂ ] ====================**\n` +
            `**\`${i + 1}.\` ${Discord.Util.escapeMarkdown(this.songList[i].ytdlVideoInfo.title)} ` +
            `[${prettyPrintDuration(this.songList[i].ytdlVideoInfo.player_response.videoDetails.lengthSeconds)}] ` +
            `[<@${this.songList[i].addedBy}>]**\n` +
            `**==========================================================**\n\n`;
        } else {
          newSong =
            `\`${i + 1}.\` ${Discord.Util.escapeMarkdown(this.songList[i].ytdlVideoInfo.title)} ` +
            `**[${prettyPrintDuration(this.songList[i].ytdlVideoInfo.player_response.videoDetails.lengthSeconds)}] ` +
            `[<@${this.songList[i].addedBy}>]**\n`;
        }


        if (songQueueEmbed.description !== undefined) {
          if (songQueueEmbed.description.length + newSong.length <= MAX_DESCRIPTION_LENGTH) {
            songQueueEmbed.setDescription(songQueueEmbed.description + newSong);
          } else {
            this.currentTextChannel.send(songQueueEmbed);
            songQueueEmbed = new Discord.MessageEmbed()
              .setColor('#00FF00')
              .setDescription(newSong);
          }
        } else {
          songQueueEmbed.setDescription(newSong);
        }
      }
      this.currentTextChannel.send(
        songQueueEmbed.setFooter(
          `Număr melodii: ${this.songList.length} | ` +
          `Durată: ${prettyPrintDuration(this.songQueueDuration)}`
        ));
    } else {
      this.sendSimpleMessage('Lista de redare este goală!', 'notification');
    }
  }

  /**
   * Removes unnecessary data from the YTDL video info object
   * @param videoInfo YTDL video info object
   * @returns Clean YTDL video info object
   */
  private cleanYtdlVideoInfoObject(videoInfo: ytdl.videoInfo) {
    /**
     * Remove all formats but the highest quality one
     */
    const highestQualityAudioFormat =
      ytdl.chooseFormat(videoInfo.formats, { filter: 'audioonly', quality: 'highestaudio' });
    while (videoInfo.formats.length > 0) {
      videoInfo.formats.pop();
    }
    videoInfo.formats.push(highestQualityAudioFormat);

    /**
     * Remove related videos
     */
    while (videoInfo.related_videos.length > 0) {
      videoInfo.related_videos.pop();
    }

    return videoInfo;
  }

  /**
   * Sends a message to the current text channel
   * @param message Message to send
   * @param type Message type
   */
  private sendSimpleMessage(message: string, type?: 'error' | 'notification' | 'success') {
    let messageColor;

    switch (type) {
      case 'error': messageColor = '#FF0000'; break;
      case 'notification': messageColor = '#FFFF00'; break;
      default: messageColor = '#00FF00';
    }

    this.currentTextChannel.send(
      new Discord.MessageEmbed()
        .setColor(messageColor)
        .setTitle(message)
    );
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
 * Prints duration in hours:minutes:seconds format
 * @param duration Duration in seconds
 * @returns Pretty time
 */
function prettyPrintDuration(duration: number) {
  let hours = Math.floor(duration / 3600).toString();
  let minutes = Math.floor(duration % 3600 / 60).toString();
  let seconds = (duration % 60).toString();

  if (minutes.length === 1) {
    minutes = '0' + minutes;
  }
  if (seconds.length === 1) {
    seconds = '0' + seconds;
  }

  if (hours === '0') {
    return `${minutes}:${seconds}`;
  }

  if (hours.length === 1) {
    return `0${hours}:${minutes}:${seconds}`;
  }

  return `${hours}:${minutes}:${seconds}`;
}
