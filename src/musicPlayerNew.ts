'use strict';

import Discord = require('discord.js');
import ytdl = require('ytdl-core');

import childProcess = require('child_process');

import env = require('./env');
import util = require('./util');
import db = require('./db');

export class MusicPlayer {
  /**
   * Current playlist
   */
  private playList: {
    /**
     * YouTube video ID
     */
    videoId: string,
    /**
     * YouTube video direct download link
     */
    videoDownloadLink: string | null,
    /**
     * YouTube video direct download link expiration as UNIX timestamp
     */
    videoDownloadLinkExpiration: number | null,
    /**
     * YouTube video title
     */
    videoTitle: string,
    /**
     * YouTube video duration in seconds
     */
    videoDuration: number,
    /**
     * Discord user ID of user that added the video to the playlist
     */
    addedBy: string
  }[];

  /**
   * Index of the current song
   */
  private currentSong: number

  /**
   * Whether the player is ready
   */
  private ready: boolean;

  /**
   * Current text channel
   */
  private textChannel: Discord.TextChannel;
  /**
   * Current voice channel
   */
  private voiceChannel: Discord.VoiceChannel;

  /**
   * Current voice connection
   */
  private voiceConnection?: Discord.VoiceConnection;
  /**
   * Current stream dispatcher
   */
  private streamDispatcher?: Discord.StreamDispatcher;

  /**
   * FFMpeg encoder process
   */
  private ffmpegEncoder?: childProcess.ChildProcessWithoutNullStreams;

  /**
   * Timer that starts after playlist is over
   */
  private playlistEndDisconnectTimer: NodeJS.Timeout;
  /**
   * Timer that starts when the current voice channel is empty
   */
  private emptyVoiceChannelDisconnectTimer: NodeJS.Timeout;

  /**
   * Lock for music player object creation
   */
  public static lockMusicPlayerCreation = false;

  constructor(
    textChannel: Discord.TextChannel,
    voiceChannel: Discord.VoiceChannel,
    playList: {
      video?: {
        youtubeLink: string,
        addedBy: string,
      }
      playlistName?: string
    }
  ) {
    this.textChannel = textChannel;
    this.voiceChannel = voiceChannel;

    this.playList = [];
    this.currentSong = -1;

    this.ready = false;

    this.playlistEndDisconnectTimer = setTimeout(() => { }, 1);
    this.emptyVoiceChannelDisconnectTimer = setTimeout(() => { }, 1);

    if (MusicPlayer.lockMusicPlayerCreation === false) {
      MusicPlayer.lockMusicPlayerCreation = true;
      if (playList.video !== undefined) {
        this.addSong(playList.video.youtubeLink, playList.video.addedBy)
          .then(() => {
            this.ready = true;
            MusicPlayer.lockMusicPlayerCreation = false;
          });
      } else {
        // Playlist stuff
      }
    }
  }

  /**
   * Adds a song to the song queue
   * @param youtubeLink YouTube link to add to the song queue
   * @param addedBy ID of the user that added the link
   */
  async addSong(youtubeLink: string, addedBy: string) {
    if (ytdl.validateURL(youtubeLink) === true) {
      if (this.alreadyExists(ytdl.getVideoID(youtubeLink)) === false) {
        try {
          const videoInfo = await ytdl.getInfo(youtubeLink);
          if (videoInfo.player_response.playabilityStatus.status === 'OK') {
            const bestQualityFormat = this.getBestQualityDownloadFormat(videoInfo);

            this.playList.push({
              videoId: videoInfo.videoDetails.videoId,
              videoDownloadLink: bestQualityFormat.videoDownloadLink,
              videoDownloadLinkExpiration: bestQualityFormat.videoDownloadLinkExpiration,
              videoTitle: Discord.Util.escapeMarkdown(videoInfo.videoDetails.title),
              videoDuration: parseInt(videoInfo.videoDetails.lengthSeconds, 10),
              addedBy: addedBy,
            });

            this.textChannel.send(
              new Discord.MessageEmbed()
                .setColor(util.colorGreen)
                .setAuthor('Adăugare melodie')
                .setTitle(videoInfo.videoDetails.title)
                .addFields({
                  name: 'Adăugat de',
                  value: `<@${addedBy}>`,
                  inline: true,
                }, {
                  name: 'Durata',
                  value: util.prettyPrintDuration(parseInt(videoInfo.videoDetails.lengthSeconds, 10)),
                  inline: true,
                }, {
                  name: 'Poziție',
                  value: this.playList.length,
                  inline: true,
                })
            );

            if (this.currentSong === -1) {
              this.playSong(this.playList.length - 1);
            }

          } else {
            this.sendSimpleMessage('Videoclipul introdus nu este disponibil! Încearcă alt link.', 'error');
          }
        } catch (error) {
          switch (error.message) {
            case 'This is a private video. Please sign in to verify that you may see it.':
              this.sendSimpleMessage('Videoclipul introdus este privat! Încearcă alt link.', 'error');
              break;
            case 'Video unavailable':
              this.sendSimpleMessage('Videoclipul introdus nu este disponibil! Încearcă alt link.', 'error');
              break;
            case 'Could not find player config':
              this.sendSimpleMessage('Nu am putut accesa videoclipul ... mai încearcă odată!', 'error');
              break;
            default:
              console.log(error);
              this.sendSimpleMessage('Ceva nu a mers bine ... mai încearcă odată!', 'error');
          }
        }
      } else {
        this.sendSimpleMessage('Videoclipul introdus există deja în lista de redare!', 'error');
      }
    } else {
      this.sendSimpleMessage('Link-ul introdus este invalid!', 'error');
    }
  }

  /**
   * Starts playing a song in the current voice channel
   * @param songPosition Position of the song in the song queue
   */
  async playSong(songPosition: number) {
    if (this.playList[songPosition] !== undefined) {
      this.currentSong = songPosition;
      try {
        await this.createVoiceConnection();
        this.createStreamDispatcher();

        this.textChannel.send(
          new Discord.MessageEmbed()
            .setColor(util.colorGreen)
            .setAuthor('În curs de redare...')
            .setTitle('🎵🎵 ' + this.playList[songPosition].videoTitle + ' 🎵🎵')
            .addFields({
              name: 'Adăugat de',
              value: `<@${this.playList[songPosition].addedBy}>`,
              inline: true,
            }, {
              name: 'Link YouTube',
              value: `https://www.youtube.com/watch?v=${this.playList[songPosition].videoId}`,
              inline: true,
            })
        );

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
      this.playlistEndDisconnectTimer = setTimeout(() => {
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
    if (this.streamDispatcher !== undefined && this.streamDispatcher.paused === false) {
      this.streamDispatcher.pause(true);
      this.sendSimpleMessage('Opresc melodia imediat!', 'notification');
    }
  }

  /**
   * Unpauses the current song
   */
  unpause() {
    if (this.streamDispatcher !== undefined && this.streamDispatcher.paused === true) {
      this.streamDispatcher.resume();
      this.sendSimpleMessage('Continuăm de unde am rămas!', 'notification');
    }
  }

  /**
   * Skips the current playing song
   */
  skip() {
    if (this.currentSong !== -1) {
      (this.streamDispatcher as Discord.StreamDispatcher).end();
      this.sendSimpleMessage('Trecem la următoarea melodie...', 'notification');
    }
  }

  /**
   * Remove a song from the playlist
   * @param songPosition Position of the song in the playlist
   */
  removeSong(songPosition: number) {
    if (songPosition >= 0 && this.playList[songPosition] !== undefined) {
      this.playList.splice(songPosition, 1);

      if (this.currentSong === songPosition) {
        this.currentSong--;
      }

      (this.streamDispatcher as Discord.StreamDispatcher).end();
      this.sendSimpleMessage(`Am șters melodia aflată pe poziția **\`${songPosition + 1}\`** !`, 'success');
    } else {
      if (isNaN(songPosition) === false) {
        this.sendSimpleMessage(`Poziția **\`${songPosition + 1}\`** nu există în lista de redare!`, 'error');
      } else {
        this.sendSimpleMessage(
          'Probabil trebuie să introduci un număr după comanda de ștergere și nu niște litere!', 'error'
        );
      }
    }
  }

  /**
   * Displays the playlist songs in a pretty format
   * @param playlist Playlist object
   */
  showPlaylistSongs(playlist?: {
    videoId?: string,
    videoDownloadLink?: string | null,
    videoDownloadLinkExpiration?: number | null,
    videoTitle: string,
    videoDuration: number,
    addedBy: string
  }[]
  ) {
    let playList: { videoTitle: string, videoDuration: number, addedBy: string }[] = [];
    if (playlist !== undefined) {
      playList = playlist;
    } else {
      playList = this.playList;
    }

    if (playList.length !== 0) {
      let playListEmbed = new Discord.MessageEmbed()
        .setColor(util.colorGreen)
        .setTitle('Listă de redare');

      for (let i = 0; i < playList.length; i++) {
        let newSong: string;
        if (i === this.currentSong) {
          newSong =
            `**==================== [ MELODIA CURENTĂ ] ====================**\n` +
            `**\`${i + 1}.\` ${playList[i].videoTitle} ` +
            `[${util.prettyPrintDuration(playList[i].videoDuration)}] ` +
            `[<@${playList[i].addedBy}>]**\n` +
            `**==========================================================**\n`;
        } else {
          newSong =
            `\`${i + 1}.\` ${playList[i].videoTitle} ` +
            `**[${util.prettyPrintDuration(playList[i].videoDuration)}] ` +
            `[<@${playList[i].addedBy}>]**\n`;
        }

        if (playListEmbed.description !== undefined) {
          if (playListEmbed.description.length + newSong.length <= util.maxEmbedDescriptionLength) {
            playListEmbed.setDescription(playListEmbed.description + newSong);
          } else {
            this.textChannel.send(playListEmbed);
            playListEmbed = new Discord.MessageEmbed()
              .setColor(util.colorGreen)
              .setDescription(newSong);
          }
        } else {
          playListEmbed.setDescription(newSong);
        }
      }

      this.textChannel.send(
        playListEmbed.setFooter(
          `Număr melodii: ${playList.length} | ` +
          `Durată: ${util.prettyPrintDuration(this.playlistDuration(playList))}`
        ));

    } else {
      this.sendSimpleMessage('Lista de redare este goală!', 'notification');
    }
  }

  /**
   * Displays the playlists stored in the database
   * @param textChannel Discord text channel
   */
  static async showSavedPlaylists(textChannel: Discord.TextChannel) {
    const query = await db.query('SELECT playlist_name, created_by FROM playlist;');
    if (query.length > 0) {
      let playlistsEmbed = new Discord.MessageEmbed()
        .setColor(util.colorGreen)
        .setTitle('Liste de redare');

      for (let i = 0; i < query.length; i++) {
        const playlist =
          `\`${i + 1}.\` ${query[i].playlist_name} ` +
          `**[<@${query[i].created_by}>]**\n`;
        if (playlistsEmbed.description !== undefined) {
          if (playlistsEmbed.description.length + playlist.length <= util.maxEmbedDescriptionLength) {
            playlistsEmbed.setDescription(playlistsEmbed.description + playlist);
          } else {
            textChannel.send(playlistsEmbed);
            playlistsEmbed = new Discord.MessageEmbed()
              .setColor(util.colorGreen)
              .setDescription(playlist);
          }
        } else {
          playlistsEmbed.setDescription(playlist);
        }
      }

      textChannel.send(
        playlistsEmbed.setFooter(`Număr liste de redare: ${query.length}`)
      );
    } else {
      textChannel.send(
        new Discord.MessageEmbed()
          .setColor(util.colorBlue)
          .setDescription('Nu există liste de redare salvate!')
      );
    }
  }

  /**
   * Displays the songs of a saved playlist
   * @param textChannel Discord text channel
   * @param playlistName Playlist name
   */
  static async showSavedPlaylistSongs(textChannel: Discord.TextChannel, playlistName: string) {
    const playlists = await MusicPlayer.searchSavedPlaylistsByName(playlistName);
    if (playlists.length > 0) {
      if (playlists.length === 1) {
        textChannel.send(
          new Discord.MessageEmbed({
            color: util.colorBlue,
            description:
              `Am găsit o listă de redare cu numele **\`${playlists[0].playlistName}\`**. ` +
              'Așteaptă un moment până încarc melodiile...',
          })
        );

        const songs: { video_id: string, added_by: string }[] = await db.query(
          'SELECT video_id, added_by FROM playlist_song WHERE playlist_id = $1;',
          [playlists[0].playlistId]
        );

        const songInfo: Promise<ytdl.videoInfo>[] = [];
        for (let i = 0; i < songs.length; i++) {
          songInfo.push(ytdl.getBasicInfo(songs[i].video_id));
        }

        const allSongInfo = await Promise.allSettled(songInfo);

        const playlist: string[] = [];
        let playlistDuration = 0;
        let failedSongCount = 0;

        for (let i = 0; i < allSongInfo.length; i++) {
          if (allSongInfo[i].status === 'fulfilled') {
            const song = (allSongInfo[i] as PromiseFulfilledResult<ytdl.videoInfo>).value;
            const duration = parseInt(song.videoDetails.lengthSeconds, 10);
            playlistDuration += duration;
            playlist.push(
              `\`${i + 1}.\` [${Discord.Util.escapeMarkdown(song.videoDetails.title)}]` +
              `(https://www.youtube.com/watch?v=${songs[i].video_id}) ` +
              `**[${util.prettyPrintDuration(duration)}] ` +
              `[<@${songs[i].added_by}>]**\n`
            );
          } else {
            failedSongCount++;
            let errorReason: string;
            switch ((allSongInfo[i] as PromiseRejectedResult).reason.message) {
              case 'This is a private video. Please sign in to verify that you may see it.':
                errorReason = '**VIDEOCLIP PRIVAT**';
                break;
              case 'Video unavailable':
                errorReason = '**VIDEOCLIP INDISPONIBIL**';
                break;
              case 'Could not find player config':
                errorReason = '**EROARE LA OBȚINEREA VIDEOCLIPULUI**';
                break;
              default:
                errorReason = '**EROARE GENERICĂ**';
                console.log((allSongInfo[i] as PromiseRejectedResult).reason.message);
            }
            playlist.push(
              `\`${i + 1}.\` [${errorReason}](https://www.youtube.com/watch?v=${songs[i].video_id}) ` +
              `**[<@${songs[i].added_by}>]**\n`
            );
          }
        }
        util.sendComplexMessage({
          color: util.colorGreen,
          title: `${playlists[0].playlistName}`,
          footer: `Număr melodii: ${songs.length} ${failedSongCount !== 0 ? `(${failedSongCount} valabile)` : ''} ` +
            `| Durată: ${util.prettyPrintDuration(playlistDuration)}`,
          paragraph: playlist,
        }, textChannel);
      } else {
        let matches = '';
        for (let i = 0; i < playlists.length; i++) {
          matches += `\u25cf ${playlists[i].playlistName}\n`;
        }

        textChannel.send(
          new Discord.MessageEmbed()
            .setColor(util.colorBlue)
            .setDescription(`**Există mai multe liste de redare cu nume similare:**\n${matches}`)
        );
      }
    } else {
      textChannel.send(
        new Discord.MessageEmbed()
          .setColor(util.colorRed)
          .setDescription('Nu există o listă de redare cu acel nume!')
      );
    }
  }

  /**
   * Checks if a video exists in the playlist
   * @param videoId YouTube video ID
   * @returns Whether the video exists in the playlist
   */
  private alreadyExists(videoId: string) {
    for (let i = 0; i < this.playList.length; i++) {
      if (this.playList[i].videoId === videoId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets the best quality audio stream download link
   * @param videoInfo YTDL Video info object
   * @returns Download link and expiration as UNIX timestamp
   */
  private getBestQualityDownloadFormat(videoInfo: ytdl.videoInfo) {
    const highestQualityAudioFormatURL =
      ytdl.chooseFormat(videoInfo.formats, { filter: 'audioonly', quality: 'highestaudio' }).url;

    const downloadLinkExpiration = new URL(highestQualityAudioFormatURL).searchParams.get('expire');

    let linkExpiration: number;
    if (downloadLinkExpiration !== null) {
      linkExpiration = parseInt(downloadLinkExpiration, 10) - 40;
    } else {
      /**
       * Typical YouTube link expiration is about 6 hours
       * or 21540 seconds according to streamingData.expiresInSenconds.
       * Subtract 40 seconds from that to account for download/processing delays
       */
      linkExpiration = util.unixTimestamp() + 21500;
    }

    return { videoDownloadLink: highestQualityAudioFormatURL, videoDownloadLinkExpiration: linkExpiration };
  }

  /**
   * Creates a voice connection in the current voice channel
   */
  private async createVoiceConnection() {
    if (this.voiceConnection === undefined || this.voiceConnection.status === 4) {
      this.voiceConnection = await this.voiceChannel.join();
      this.voiceConnection.voice.setSelfDeaf(true);

      this.voiceConnection.on('disconnect', () => {
        this.dispose();
      });

      this.voiceConnection.on('error', error => {
        console.log(error);
        this.sendSimpleMessage('Am avut o problemă la conectare ... mai încearcă odată!', 'error');
      });
    }
  }

  /**
   * Creates a stream dispatcher using the current voice connection
   */
  private async createStreamDispatcher() {
    const valid = await this.checkDownloadLinkValidity();
    if (valid.isValid === true) {
      const ffmpegParams = [
        /**
         * Must use reconnect. Otherwise ffmpeg stops mid song most of the time with an EOF for some reason.
         */
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', this.playList[this.currentSong].videoDownloadLink as string,
        /**
         * Using WEBM instead of Opus because Opus gives `Error: Did not find the EBML tag at the start of the stream`
         * if it is used in combination with `type: webm/opus` stream option
         */
        '-f', 'webm',
        '-b:a', this.voiceChannel.bitrate.toString(),
        '-compression_level', '10',
        '-application', 'audio',
        '-af', 'dynaudnorm=f=150',
        'pipe:1'
      ];

      this.ffmpegEncoder = childProcess.spawn('ffmpeg', ffmpegParams);
      this.streamDispatcher =
        (this.voiceConnection as Discord.VoiceConnection).play(this.ffmpegEncoder.stdout, env.DISPATCHER_CONFIG);

      this.streamDispatcher.on('start', () => {
        console.log(`  [SONG START] ${this.playList[this.currentSong].videoId}`);
      });

      this.streamDispatcher.on('finish', () => {
        console.log('  [SONG END]');

        if (this.ffmpegEncoder !== undefined) {
          this.ffmpegEncoder.kill();
        }

        if (this.playList[this.currentSong] !== undefined) {
          this.playList[this.currentSong].videoDownloadLink = null;
          this.playList[this.currentSong].videoDownloadLinkExpiration = null;
        }

        this.playSong(this.currentSong + 1);
      });

      this.streamDispatcher.on('error', error => {
        console.log(error);
        this.sendSimpleMessage('Ceva nu a mers bine la redarea videoclipului ... trec la următoarul!', 'error');

        if (this.ffmpegEncoder !== undefined) {
          this.ffmpegEncoder.kill();
        }

        this.playList[this.currentSong].videoDownloadLink = null;
        this.playList[this.currentSong].videoDownloadLinkExpiration = null;

        this.playSong(this.currentSong + 1);

      });
    } else {
      switch (valid.reason) {
        case 'This is a private video. Please sign in to verify that you may see it.':
          this.sendSimpleMessage(
            'Videoclipul a devenit privat între timp și nu mai poate fi redat ... trec la următorul!', 'error'
          );
          break;
        default:
          this.sendSimpleMessage('Videoclipul nu mai este disponibil pentru redare ... trec la următoarul!', 'error');
      }
      this.playSong(this.currentSong + 1);
    }
  }

  /**
   * Checks if a video download link is valid and tries to generate a new one if expired/missing
   * @returns Whether the download link is valid
   */
  private async checkDownloadLinkValidity(): Promise<{ isValid: true } | { isValid: false, reason: string }> {
    if (
      this.playList[this.currentSong].videoDownloadLinkExpiration === null ||
      this.playList[this.currentSong].videoDownloadLinkExpiration as number < util.unixTimestamp()
    ) {
      try {
        const videoInfo = await ytdl.getInfo(this.playList[this.currentSong].videoId);
        if (videoInfo.player_response.playabilityStatus.status === 'OK') {
          const bestQualityFormat = this.getBestQualityDownloadFormat(videoInfo);
          this.playList[this.currentSong].videoDownloadLink = bestQualityFormat.videoDownloadLink;
          this.playList[this.currentSong].videoDownloadLinkExpiration = bestQualityFormat.videoDownloadLinkExpiration;
          return { isValid: true };
        }
        return { isValid: false, reason: 'Video unavailable' };
      } catch (error) {
        console.log(error);
        return { isValid: false, reason: error.message };
      }
    }
    return { isValid: true };
  }

  /**
   * Gets the duration in seconds of a playlist
   * @param playlist Playlist object
   * @returns Duration of the playlist in seconds
   */
  private playlistDuration(playlist?: {
    videoId?: string,
    videoDownloadLink?: string | null,
    videoDownloadLinkExpiration?: number | null,
    videoTitle: string,
    videoDuration: number,
    addedBy: string
  }[]
  ) {
    let playList: { videoTitle: string, videoDuration: number, addedBy: string }[] = [];
    if (playlist !== undefined) {
      playList = playlist;
    } else {
      playList = this.playList;
    }

    let duration = 0;
    for (let i = 0; i < playList.length; i++) {
      duration += playList[i].videoDuration;
    }

    return duration;
  }

  /**
   * Searches for saved playlists in the database by name
   * @param playlistName Playlist name
   * @returns Playlists that match the playlist name
   */
  private static async searchSavedPlaylistsByName(playlistName: string) {
    const playlists: { playlistId: string, playlistName: string, createdBy: string }[] = await db.query(
      'SELECT playlist_id "playlistId", playlist_name "playlistName", created_by "createdBy" ' +
      'FROM playlist ' +
      'WHERE playlist_name ILIKE $1;',
      [`%${playlistName}%`]
    );

    let matchedPlaylist: { playlistId: string, playlistName: string, createdBy: string } | undefined;
    for (let i = 0; i < playlists.length; i++) {
      if (playlists[i].playlistName === playlistName) {
        matchedPlaylist = playlists[i];
        break;
      }
    }

    if (matchedPlaylist !== undefined) {
      return [matchedPlaylist];
    }
    return playlists;
  }

  /**
   * Sends a message to the current text channel
   * @param message Message to send
   * @param type Message type
   */
  private sendSimpleMessage(message: string, type?: 'error' | 'notification' | 'success') {
    let messageColor;

    switch (type) {
      case 'error': messageColor = util.colorRed; break;
      case 'notification': messageColor = util.colorBlue; break;
      default: messageColor = util.colorGreen;
    }

    this.textChannel.send(
      new Discord.MessageEmbed()
        .setColor(messageColor)
        .setDescription(message)
    ).catch(error => {
      util.errorDisplay('MessageSend', error);
    });
  }

  /**
   * Whether the player is paused
   */
  get paused() {
    if (this.streamDispatcher !== undefined) {
      return this.streamDispatcher.paused;
    }
    return true;
  }

  /**
   * Disposes the player object
   */
  private dispose() {
    if (this.ffmpegEncoder !== undefined) {
      this.ffmpegEncoder.kill();
    }

    this.voiceChannel.leave();

    this.playList = [];
    this.currentSong = -1;
    this.ready = false;

    console.log(this.ready);

    clearTimeout(this.playlistEndDisconnectTimer);
    clearTimeout(this.emptyVoiceChannelDisconnectTimer);
  }
}
