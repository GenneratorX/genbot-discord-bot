'use strict';

import Discord = require('discord.js');
import ytdl = require('ytdl-core');

import env = require('./env');
import db = require('./db');

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
                .setTitle(Discord.Util.escapeMarkdown(videoInfo.videoDetails.title))
                .addFields({
                  name: 'Adăugat de',
                  value: `<@${addedBy}>`,
                  inline: true,
                }, {
                  name: 'Durata',
                  value: prettyPrintDuration(parseInt(videoInfo.videoDetails.lengthSeconds, 10)),
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
            this.sendSimpleMessage(
              'Videoclipul introdus nu este disponibil pentru redare! Încearcă alt link.', 'error'
            );
          }
        })
        .catch(error => {
          switch (error.message) {
            case 'This is a private video. Please sign in to verify that you may see it.':
              this.sendSimpleMessage('Videoclipul introdus este privat! Încearcă alt link.', 'error');
              break;
            default:
              console.log(error);
              this.sendSimpleMessage('Ceva nu a mers bine ... mai încearcă odată!', 'error');
          }
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
          console.log(`  [SONG START] ${this.songList[songPosition].ytdlVideoInfo.videoDetails.videoId} ` +
            `[AUDIO BITRATE=${this.songList[songPosition].ytdlVideoInfo.formats[0].audioBitrate}]`);
          this.isPlaying = true;
          this.currentTextChannel.send(
            new Discord.MessageEmbed()
              .setColor('#00FF00')
              .setAuthor('În curs de redare...')
              .setTitle(
                '🎵🎵 ' +
                Discord.Util.escapeMarkdown(this.songList[songPosition].ytdlVideoInfo.videoDetails.title) +
                '🎵🎵')
              .addFields({
                name: 'Adăugat de',
                value: `<@${this.songList[songPosition].addedBy}>`,
                inline: true,
              }, {
                name: 'Link YouTube',
                value:
                  'https://www.youtube.com/watch?v=' +
                  this.songList[songPosition].ytdlVideoInfo.videoDetails.videoId,
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
            `**\`${i + 1}.\` ${Discord.Util.escapeMarkdown(this.songList[i].ytdlVideoInfo.videoDetails.title)} ` +
            `[${prettyPrintDuration(parseInt(this.songList[i].ytdlVideoInfo.videoDetails.lengthSeconds, 10))}] ` +
            `[<@${this.songList[i].addedBy}>]**\n` +
            `**==========================================================**\n\n`;
        } else {
          newSong =
            `\`${i + 1}.\` ${Discord.Util.escapeMarkdown(this.songList[i].ytdlVideoInfo.videoDetails.title)} ` +
            `**[${prettyPrintDuration(parseInt(this.songList[i].ytdlVideoInfo.videoDetails.lengthSeconds, 10))}] ` +
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
   * Saves the playlist to the database
   * @param playlistName Playlist name
   * @param playlistCreator Playlist creator id
   */
  async savePlaylist(playlistName: string, playlistCreator: string) {
    if (this.songList.length > 0) {
      playlistName = playlistName.trim().replace(/\s+/g, ' ');
      if (playlistName.length > 2 && playlistName.length < 51) {
        const query = await db.query(
          'SELECT playlist_name FROM playlist WHERE LOWER(playlist_name) = LOWER($1)', [playlistName]
        );
        if (query.length === 0) {
          const playlistId: string = (await db.query(
            'INSERT INTO playlist VALUES (DEFAULT, $1, $2, DEFAULT) RETURNING playlist_id;',
            [playlistName, playlistCreator]
          ))[0].playlist_id;

          let insertQuery = 'INSERT INTO playlist_song VALUES ';
          const insertParameters: string[] = [];
          let j = 1;

          for (let i = 0; i < this.songList.length; i++) {
            insertQuery += `($${j++},$${j++},$${j++}),`;
            insertParameters.push(playlistId);
            insertParameters.push(this.songList[i].ytdlVideoInfo.videoDetails.videoId);
            insertParameters.push(this.songList[i].addedBy);
          }

          insertQuery = insertQuery.slice(0, -1) + ';';
          await db.query(insertQuery, insertParameters);

          this.sendSimpleMessage(`Am salvat lista de redare cu numele '${playlistName}'.`, 'success');

        } else {
          this.sendSimpleMessage('Există deja o listă de redare cu acest nume. Folosește alt nume!', 'error');
        }
      } else {
        this.sendSimpleMessage('Numele listei de redare trebuie să conțină între 3 și 50 caractere!', 'error');
      }
    } else {
      this.sendSimpleMessage(
        'Nu cred că pot crea o listă de redare fără melodii. Adaugă una și după mai vorbim!', 'error'
      );
    }
  }

  /**
   * Loads a playlist from the database
   * @param playlistName Playlist name
   */
  async loadPlaylist(playlistName: string) {
    playlistName = playlistName.trim().replace(/\s+/g, ' ');
    if (playlistName.length > 0) {
      const searchQuery = await db.query(
        'SELECT playlist_id, playlist_name FROM playlist WHERE playlist_name ILIKE $1;', [`%${playlistName}%`]
      );
      if (searchQuery.length === 1) {
        this.sendSimpleMessage(
          `Am găsit o listă de redare cu numele '${searchQuery[0].playlist_name}'. ` +
          'Așteaptă un moment până încarc toate melodiile...',
          'notification'
        );
        while (this.songList.length > 0) {
          this.songList.pop();
        }
        this.loadSongsFromPlaylist(searchQuery[0].playlist_id);
      } else {
        if (searchQuery.length > 1) {
          this.sendSimpleMessage('Există mai multe liste de redare care conțin numele introdus!', 'notification');
        } else {
          this.sendSimpleMessage('Nu există o listă de redare cu acel nume!', 'error');
        }
      }
    } else {
      this.sendSimpleMessage('Introdu și tu măcar un caracter, ca să știu ce să caut!', 'error');
    }
  }

  /**
   * Displays the playlists stored in the database
   */
  async showPlaylists() {
    const searchQuery = await db.query('SELECT playlist_name, created_by FROM playlist;');
    if (searchQuery.length > 0) {
      const playlistsEmbed = new Discord.MessageEmbed()
        .setColor('#00FF00')
        .setTitle('Liste de redare');

      let playlists = '';
      for (let i = 0; i < searchQuery.length; i++) {
        playlists +=
          `\`${i + 1}.\` ${Discord.Util.escapeMarkdown(searchQuery[i].playlist_name)} ` +
          `**[<@${searchQuery[i].created_by}>]**\n`;
      }

      playlistsEmbed.setDescription(playlists);
      this.currentTextChannel.send(playlistsEmbed);
    } else {
      this.sendSimpleMessage('Nu există liste de redare salvate!', 'notification');
    }
  }

  /**
   * Loads the songs of a playlist stored in the database
   * @param playlistId Playlist ID
   */
  async loadSongsFromPlaylist(playlistId: string) {
    const playlistQuery = await db.query(
      'SELECT video_id, added_by FROM playlist_song WHERE playlist_id = $1;', [playlistId]
    );

    const videoInfo: Promise<ytdl.videoInfo>[] = [];
    for (let i = 0; i < playlistQuery.length; i++) {
      videoInfo.push(ytdl.getInfo(`https://www.youtube.com/watch?v=${playlistQuery[i].video_id}`));
    }

    const allVideoInfo = await Promise.allSettled(videoInfo);
    let rejectedVideos = 0;
    for (let i = 0; i < allVideoInfo.length; i++) {
      if (allVideoInfo[i].status === 'fulfilled') {
        const cleanVideoInfo =
          this.cleanYtdlVideoInfoObject((allVideoInfo[i] as PromiseFulfilledResult<ytdl.videoInfo>).value);

        if (cleanVideoInfo.player_response.playabilityStatus.status === 'OK') {
          this.songList.push({
            ytdlVideoInfo: cleanVideoInfo,
            addedBy: playlistQuery[i].added_by,
          });
        } else {
          rejectedVideos++;
        }
      } else {
        rejectedVideos++;
      }
    }

    if (rejectedVideos === 0) {
      this.sendSimpleMessage('Lista de redare a fost încărcată în totalitate!', 'success');
      this.playSong(0);
    } else {
      if (rejectedVideos < allVideoInfo.length) {
        this.sendSimpleMessage(
          `Am încărcat o parte din lista de redare. ${rejectedVideos} melodii nu au putut fi încărcate!`, 'notification'
        );
        this.playSong(0);
      } else {
        this.sendSimpleMessage('Nu am putut să încarc nicio melodie din lista de redare!', 'error');
      }
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
        .setDescription(message)
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
      duration += parseInt(this.songList[i].ytdlVideoInfo.videoDetails.lengthSeconds, 10);
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
  const hours = Math.floor(duration / 3600).toString();
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
