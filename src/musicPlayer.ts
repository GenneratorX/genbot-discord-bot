'use strict';

import Discord = require('discord.js');
import ytdl = require('ytdl-core');

import childProcess = require('child_process');

import { client } from './bot';

import env = require('./env');
import util = require('./util');
import db = require('./db');
import { EventEmitter } from 'events';

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
  public ready: boolean;

  /**
   * Song loading queue
   */
  private loadingQueue: string[];

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
  private ffmpegEncoder?: childProcess.ChildProcessByStdio<null, any, null>;
  /**
   * Batch video loader
   */
  private batchVideoLoader?: BatchVideoLoader;

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
    this.loadingQueue = [];

    this.playlistEndDisconnectTimer = setTimeout(() => { }, 1);
    this.emptyVoiceChannelDisconnectTimer = setTimeout(() => { }, 1);

    if (MusicPlayer.lockMusicPlayerCreation === false) {
      MusicPlayer.lockMusicPlayerCreation = true;
      if (playList.video !== undefined) {
        this.addSong(playList.video.youtubeLink, playList.video.addedBy)
          .then(() => {
            if (this.playList.length !== 0) {
              this.ready = true;
            }
            MusicPlayer.lockMusicPlayerCreation = false;
          });
      } else {
        this.loadSavedPlaylist(playList.playlistName as string)
          .then(() => {
            MusicPlayer.lockMusicPlayerCreation = false;
          });
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
      const youtubeVideoId = ytdl.getVideoID(youtubeLink);
      if (this.alreadyExists(youtubeVideoId) === false) {
        if (this.loadingQueue.includes(youtubeVideoId) === false) {
          this.loadingQueue.push(youtubeVideoId);
          try {
            const videoInfo = await ytdl.getInfo(youtubeLink);
            if (videoInfo.player_response.playabilityStatus.status === 'OK') {
              const bestQualityFormat = MusicPlayer.getBestQualityDownloadFormat(videoInfo);
              const videoTitle = Discord.Util.escapeMarkdown(videoInfo.videoDetails.title);
              const videoDuration = parseInt(videoInfo.videoDetails.lengthSeconds, 10);

              this.playList.push({
                videoId: videoInfo.videoDetails.videoId,
                videoDownloadLink: bestQualityFormat.videoDownloadLink,
                videoDownloadLinkExpiration: bestQualityFormat.videoDownloadLinkExpiration,
                videoTitle: videoTitle,
                videoDuration: videoDuration,
                addedBy: addedBy,
              });

              this.textChannel.send(
                new Discord.MessageEmbed({
                  color: util.colorGreen,
                  author: { name: 'Adăugare melodie' },
                  title: videoTitle,
                  fields: [{
                    name: 'Adăugat de',
                    value: `<@${addedBy}>`,
                    inline: true,
                  }, {
                    name: 'Durata',
                    value: util.prettyPrintDuration(videoDuration),
                    inline: true,
                  }, {
                    name: 'Poziție',
                    value: this.playList.length,
                    inline: true,
                  }],
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
              case 'Unable to retrieve video metadata':
                this.sendSimpleMessage('Nu am putut accesa videoclipul ... mai încearcă odată!', 'error');
                break;
              case 'Status code: 429':
                this.sendSimpleMessage(
                  'YouTube-ul m-a blocat pentru o vreme așa că nu voi putea reda videoclipuri pentru o vreme.', 'error'
                );
                break;
              default:
                console.log(error);
                this.sendSimpleMessage('Ceva nu a mers bine ... mai încearcă odată!', 'error');
            }
          }
          this.loadingQueue.splice(this.loadingQueue.indexOf(youtubeVideoId), 1);
        } else {
          this.sendSimpleMessage('Videoclipul introdus este în curs de încărcare. Așteptă și tu puțin!', 'error');
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
      clearTimeout(this.playlistEndDisconnectTimer);
      this.currentSong = songPosition;
      try {
        await this.createVoiceConnection();
        this.createStreamDispatcher();

        this.textChannel.send(
          new Discord.MessageEmbed({
            color: util.colorGreen,
            author: { name: 'În curs de redare...' },
            title: `🎵🎵 ${this.playList[songPosition].videoTitle} 🎵🎵`,
            fields: [{
              name: 'Adăugat de',
              value: `<@${this.playList[songPosition].addedBy}>`,
              inline: true,
            }, {
              name: 'Link YouTube',
              value: `https://www.youtube.com/watch?v=${this.playList[songPosition].videoId}`,
              inline: true,
            }],
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
      (client.user as Discord.ClientUser).setActivity({ type: 'WATCHING', name: 'time pass by ⏲️' });
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
        (this.streamDispatcher as Discord.StreamDispatcher).end();
      }

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
   * Displays the current playlist songs in a pretty format
   * @param playlist Playlist object
   */
  showPlaylistSongs() {
    if (this.playList.length !== 0) {
      const songs: string[] = [];
      let playListDuration = 0;
      for (let i = 0; i < this.playList.length; i++) {
        playListDuration += this.playList[i].videoDuration;
        if (i === this.currentSong) {
          songs.push(
            `**==================== [ MELODIA CURENTĂ ] ====================**\n` +
            `**\`${i + 1}.\` ${this.playList[i].videoTitle} ` +
            `[${util.prettyPrintDuration(this.playList[i].videoDuration)}] ` +
            `[<@${this.playList[i].addedBy}>]**\n` +
            `**==========================================================**\n`
          );
        } else {
          songs.push(
            `\`${i + 1}.\` ${this.playList[i].videoTitle} ` +
            `**[${util.prettyPrintDuration(this.playList[i].videoDuration)}] ` +
            `[<@${this.playList[i].addedBy}>]**\n`
          );
        }
      }

      util.sendComplexMessage({
        color: util.colorGreen,
        title: 'Listă de redare',
        footer:
          `Număr melodii: ${this.playList.length} | ` +
          `Durată: ${util.prettyPrintDuration(playListDuration)}`,
        paragraph: songs,
      }, this.textChannel);

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
      const playList: string[] = [];
      for (let i = 0; i < query.length; i++) {
        playList.push(
          `\`${i + 1}.\` ${Discord.Util.escapeMarkdown(query[i].playlist_name)} **[<@${query[i].created_by}>]**\n`
        );
      }

      util.sendComplexMessage({
        color: util.colorGreen,
        title: 'Liste de redare',
        footer: `Număr liste de redare: ${query.length}`,
        paragraph: playList,
      }, textChannel);

    } else {
      textChannel.send(
        new Discord.MessageEmbed({
          color: util.colorBlue,
          description: 'Nu există liste de redare salvate!',
        })
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
              `Am găsit o listă de redare cu numele **${Discord.Util.escapeMarkdown(playlists[0].playlistName)}**` +
              '. Așteaptă un moment până încarc melodiile...',
          })
        );

        const songs: { video_id: string, added_by: string }[] = await db.query(
          'SELECT video_id, added_by FROM playlist_song WHERE playlist_id = $1;',
          [playlists[0].playlistId]
        );

        const youtubeVideoId: string[] = [];
        for (let i = 0; i < songs.length; i++) {
          youtubeVideoId.push(songs[i].video_id);
        }

        const playList: string[] = [];

        let songCount = 0;
        let failedSongCount = 0;
        let playlistDuration = 0;

        new BatchVideoLoader()
          .on('videoLoaded', videoInfo => {
            if (videoInfo.error === undefined) {
              playlistDuration += videoInfo.videoDuration;
              playList.push(
                `\`${songCount + 1}.\` [${videoInfo.videoTitle}]` +
                `(https://www.youtube.com/watch?v=${songs[songCount].video_id}) ` +
                `**[${util.prettyPrintDuration(videoInfo.videoDuration)}] ` +
                `[<@${songs[songCount].added_by}>]**\n`
              );
            } else {
              failedSongCount++;
              let errorReason: string;
              switch (videoInfo.error) {
                case 'unplayableVideo': errorReason = '**VIDEOCLIP INDISPONIBIL**'; break;
                case 'privateVideo': errorReason = '**VIDEOCLIP PRIVAT**'; break;
                case 'playerConfigNotFound': errorReason = '**EROARE LA OBȚINEREA VIDEOCLIPULUI**'; break;
                case 'videoMetadataNotFount': errorReason = '**EROARE LA OBȚINEREA VIDEOCLIPULUI**'; break;
                case 'rateLimit': errorReason = '**EROARE API YOUTUBE (429)**'; break;
                default: errorReason = '**EROARE GENERICĂ**';
              }
              playList.push(
                `\`${songCount + 1}.\` [${errorReason}](https://www.youtube.com/watch?v=${songs[songCount].video_id})` +
                ` **[<@${songs[songCount].added_by}>]**\n`
              );
            }
            songCount++;
          })
          .on('videoBatchLoaded', () => {
            util.sendComplexMessage({
              color: util.colorGreen,
              title: `${Discord.Util.escapeMarkdown(playlists[0].playlistName)}`,
              footer:
                `Număr melodii: ${songs.length} ` +
                `${failedSongCount !== 0 ? `(${songs.length - failedSongCount} valabile)` : ''} ` +
                `| Durată: ${util.prettyPrintDuration(playlistDuration)}`,
              paragraph: playList,
            }, textChannel);
          })
          .loadPlaylist(youtubeVideoId, true);

      } else {
        let matches = '';
        for (let i = 0; i < playlists.length; i++) {
          matches += `\u25cf ${playlists[i].playlistName}\n`;
        }

        textChannel.send(
          new Discord.MessageEmbed({
            color: util.colorBlue,
            description: `**Există mai multe liste de redare cu nume similare:**\n${matches}`,
          })
        );
      }
    } else {
      textChannel.send(
        new Discord.MessageEmbed({
          color: util.colorRed,
          description: 'Nu există o listă de redare cu acel nume!',
        })
      );
    }
  }

  /**
   * Saves the current playlist to the database
   * @param playlistName Playlist name
   * @param playlistCreator Discord user ID of user that created the playlist
   */
  async savePlaylist(playlistName: string, playlistCreator: string) {
    if (this.playList.length > 0) {
      if (playlistName.length >= 3 && playlistName.length <= 50) {
        const playlistSearch = await db.query(
          'SELECT playlist_name FROM playlist WHERE LOWER(playlist_name) = LOWER($1);',
          [playlistName]
        );
        if (playlistSearch.length === 0) {
          const playlistCreate: { playlist_id: string }[] = await db.query(
            'INSERT INTO playlist VALUES (DEFAULT, $1, $2, DEFAULT) RETURNING playlist_id;',
            [playlistName, playlistCreator]
          );
          const newPlaylistId = playlistCreate[0].playlist_id;

          let insertQuery = 'INSERT INTO playlist_song VALUES ';
          const insertParameters: string[] = [];

          let j = 1;
          for (let i = 0; i < this.playList.length; i++) {
            insertQuery += `($${j++}, $${j++}, $${j++}),`;
            insertParameters.push(
              newPlaylistId,
              this.playList[i].videoId,
              this.playList[i].addedBy
            );
          }

          await db.query(insertQuery.slice(0, -1) + ';', insertParameters);
          this.sendSimpleMessage(`Am salvat lista de redare cu numele **\`${playlistName}\`**.`, 'success');
        } else {
          this.sendSimpleMessage('Există deja o listă de redare cu acest nume. Folosește alt nume!', 'error');
        }
      } else {
        this.sendSimpleMessage('Numele listei de redare trebuie să conțină între 3 și 50 caractere!', 'error');
      }
    } else {
      this.sendSimpleMessage(
        'Nu cred că pot crea o listă de redare fără melodii. Adaugă una și după mai vorbim!',
        'error'
      );
    }
  }

  /**
   * Removes a playlist from the database
   * @param textChannel Discord text channel
   * @param playlistName Playlist name
   */
  static async removeSavedPlaylist(textChannel: Discord.TextChannel, playlistName: string) {
    if (playlistName.length > 0) {
      const playlists = await MusicPlayer.searchSavedPlaylistsByName(playlistName);
      if (playlists.length > 0) {
        if (playlists.length === 1) {
          await db.query('DELETE FROM playlist WHERE playlist_id = $1;', [playlists[0].playlistId]);
          textChannel.send(
            new Discord.MessageEmbed({
              color: util.colorGreen,
              description: `Am șters lista de redare cu numele **\`${playlists[0].playlistName}\`**.`,
            })
          );
        } else {
          let matches = '';
          for (let i = 0; i < playlists.length; i++) {
            matches += `\u25cf ${playlists[i].playlistName}\n`;
          }

          textChannel.send(
            new Discord.MessageEmbed({
              color: util.colorBlue,
              description: `**Există mai multe liste de redare cu nume similare:**\n${matches}`,
            })
          );
        }
      } else {
        textChannel.send(
          new Discord.MessageEmbed({
            color: util.colorRed,
            description: 'Nu există o listă de redare cu acel nume!',
          })
        );
      }
    } else {
      textChannel.send(
        new Discord.MessageEmbed({
          color: util.colorRed,
          description: 'Poate îmi spui și mie ce listă de redare vrei să ștergi.',
        })
      );
    }
  }

  /**
   * Loads the songs of a saved playlist
   * @param playlistName Playlist name
   */
  async loadSavedPlaylist(playlistName: string) {
    if (playlistName.length > 0) {
      const playlists = await MusicPlayer.searchSavedPlaylistsByName(playlistName);
      if (playlists.length > 0) {
        if (playlists.length === 1) {
          this.sendSimpleMessage(
            `Am găsit o listă de redare cu numele **${Discord.Util.escapeMarkdown(playlists[0].playlistName)}**. ` +
            'Așteaptă un moment până încarc melodiile...',
            'notification'
          );

          const songs: { video_id: string, added_by: string }[] = await db.query(
            'SELECT video_id, added_by FROM playlist_song WHERE playlist_id = $1;',
            [playlists[0].playlistId]
          );

          const youtubeVideoId: string[] = [];
          for (let i = 0; i < songs.length; i++) {
            youtubeVideoId.push(songs[i].video_id);
          }
          this.loadingQueue = youtubeVideoId;

          let songCount = 0;
          const failedSong: string[] = [];
          let firstSongLoaded = false;

          this.batchVideoLoader = new BatchVideoLoader();
          this.batchVideoLoader
            .on('videoLoaded', videoInfo => {
              if (videoInfo.error === undefined) {
                if (firstSongLoaded === false) {
                  firstSongLoaded = true;
                  this.playList.splice(0, this.playList.length);
                  this.playList.push({
                    ...videoInfo,
                    videoId: songs[songCount].video_id,
                    addedBy: songs[songCount].added_by,
                  });


                  if (this.ready === true) {
                    this.currentSong = -1;
                    (this.streamDispatcher as Discord.StreamDispatcher).end();
                  } else {
                    this.ready = true;
                    this.playSong(0).then(() => {
                      this.checkOnCurrentVoiceChannelUsers();
                    });
                  }
                } else {
                  this.playList.push({
                    ...videoInfo,
                    videoId: songs[songCount].video_id,
                    addedBy: songs[songCount].added_by,
                  });
                }
              } else {
                let errorReason: string;
                switch (videoInfo.error) {
                  case 'unplayableVideo': errorReason = '**VIDEOCLIP INDISPONIBIL**'; break;
                  case 'privateVideo': errorReason = '**VIDEOCLIP PRIVAT**'; break;
                  case 'playerConfigNotFound': errorReason = '**EROARE LA OBȚINEREA VIDEOCLIPULUI**'; break;
                  case 'videoMetadataNotFount': errorReason = '**EROARE LA OBȚINEREA VIDEOCLIPULUI**'; break;
                  case 'rateLimit': errorReason = '**EROARE API YOUTUBE (429)**'; break;
                  default: errorReason = '**EROARE GENERICĂ**';
                }
                failedSong.push(
                  `\`${songCount + 1}.\` https://www.youtube.com/watch?v=${songs[songCount].video_id} ` +
                  `[${errorReason}]\n`
                );
              }
              songCount++;
            })
            .on('videoBatchLoaded', () => {
              if (failedSong.length !== youtubeVideoId.length) {
                if (failedSong.length === 0) {
                  this.sendSimpleMessage('Lista de redare a fost încărcată în totalitate!', 'success');
                } else {
                  if (failedSong.length === 1) {
                    failedSong.unshift(
                      'Am încărcat toată lista de redare cu excepția unei melodii. ' +
                      `**Melodia care nu este inclusă în lista de redare este:**\n`
                    );
                  } else {
                    failedSong.unshift(
                      `Am încărcat o parte din lista de redare. **${failedSong.length} melodii** nu au putut fi ` +
                      `încărcate. \n**Melodiile care nu au fost incluse în lista de redare sunt:**\n`
                    );
                  }
                  util.sendComplexMessage({
                    color: util.colorBlue,
                    title: '',
                    footer: '',
                    paragraph: failedSong,
                  }, this.textChannel);
                }
              } else {
                this.sendSimpleMessage('Nu am putut să încarc nicio melodie din lista de redare!', 'error');
              }
            })
            .loadPlaylist(youtubeVideoId);
        } else {
          let matches = '';
          for (let i = 0; i < playlists.length; i++) {
            matches += `\u25cf ${playlists[i].playlistName}\n`;
          }

          this.sendSimpleMessage(`**Există mai multe liste de redare cu nume similare:**\n${matches}`, 'notification');
        }
      } else {
        this.sendSimpleMessage('Nu există o listă de redare cu acel nume!', 'error');
      }
    } else {
      this.sendSimpleMessage('Poate îmi spui și mie ce listă de redare vrei să încarci.', 'error');
    }
  }

  /**
   * Changes the current voice channel
   * @param newVoiceChannel New Discord voice channel
   */
  updateVoiceChannel(newVoiceChannel: Discord.VoiceChannel) {
    this.voiceChannel = newVoiceChannel;
  }

  /**
   * Checks if there are any non bot users in the current voice channel and starts a leave timeout if there arent any
   */
  checkOnCurrentVoiceChannelUsers() {
    if (this.voiceChannel.members.find(member => member.user.bot === false) === undefined) {
      this.emptyVoiceChannelDisconnectTimer = setTimeout(() => {
        this.dispose();
        this.sendSimpleMessage('Am rămas singur ... așa că am ieșit!', 'notification');
      }, 300000); // 5 minutes
    } else {
      clearTimeout(this.emptyVoiceChannelDisconnectTimer);
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
  static getBestQualityDownloadFormat(videoInfo: ytdl.videoInfo) {
    let highestQualityAudioFormatURL: string;

    if (videoInfo.videoDetails.isLiveContent === false) {
      highestQualityAudioFormatURL =
        ytdl.chooseFormat(videoInfo.formats, { filter: 'audioonly', quality: 'highestaudio' }).url;
    } else {
      highestQualityAudioFormatURL = ytdl.chooseFormat(videoInfo.formats, { quality: [93, 94, 95, 96, 91, 92] }).url;
    }

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

      if (this.voiceConnection.voice !== null) {
        this.voiceConnection.voice.setSelfDeaf(true);
      }

      this.voiceConnection.on('disconnect', () => {
        if (this.ready === true) {
          this.dispose();
        }
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
        '-vn',
        '-f', 'webm',
        '-b:a', this.voiceChannel.bitrate.toString(),
        '-compression_level', '10',
        '-application', 'audio',
        '-af', 'dynaudnorm=f=150',
        'pipe:1'
      ];

      this.ffmpegEncoder = childProcess.spawn('ffmpeg', ffmpegParams, {
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      this.streamDispatcher =
        (this.voiceConnection as Discord.VoiceConnection).play(this.ffmpegEncoder.stdout, env.DISPATCHER_CONFIG);

      this.streamDispatcher.on('start', () => {
        console.log(`  [SONG START] ${this.playList[this.currentSong].videoId}`);
        (client.user as Discord.ClientUser).setActivity({
          type: 'LISTENING',
          name: `🎵 ${this.playList[this.currentSong].videoTitle} 🎵`,
        });
      });

      this.streamDispatcher.on('finish', () => {
        console.log('  [SONG END]');

        this.killFFmpegEncoder();

        if (this.playList[this.currentSong] !== undefined) {
          this.playList[this.currentSong].videoDownloadLink = null;
          this.playList[this.currentSong].videoDownloadLinkExpiration = null;
        }

        this.playSong(this.currentSong + 1);
      });

      this.streamDispatcher.on('error', error => {
        console.log(error);
        this.sendSimpleMessage('Ceva nu a mers bine la redarea videoclipului ... trec la următorul!', 'error');

        this.killFFmpegEncoder();

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
          const bestQualityFormat = MusicPlayer.getBestQualityDownloadFormat(videoInfo);
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
      new Discord.MessageEmbed({
        color: messageColor,
        description: message,
      })
    ).catch(error => {
      util.errorDisplay('MessageSend', error);
    });
  }

  /**
   * Kills the ffmpeg encoder child process
   */
  private killFFmpegEncoder() {
    if (this.ffmpegEncoder !== undefined) {
      this.ffmpegEncoder.kill('SIGKILL');
    }
  }

  /**
   * Disposes the batch video loader
   */
  private disposeBatchVideoLoader() {
    if (this.batchVideoLoader !== undefined) {
      this.batchVideoLoader.dispose();
    }
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
   * Current voice channel
   */
  get currentVoiceChannel() {
    return this.voiceChannel;
  }

  /**
   * Current voice server ip address
   */
  get currentVoiceServerIp(): { connected: true, ip: string } | { connected: false } {
    if (this.voiceConnection !== undefined && this.voiceConnection.status !== 4) {
      return {
        connected: true,
        // @ts-ignore
        ip: this.voiceConnection.authentication.ip,
      };
    }
    return {
      connected: false,
    };
  }

  /**
   * Disposes the player object
   */
  private dispose() {
    this.ready = false;
    this.voiceChannel.leave();

    this.killFFmpegEncoder();
    this.disposeBatchVideoLoader();

    this.playList.splice(0, this.playList.length);
    this.currentSong = -1;

    clearTimeout(this.playlistEndDisconnectTimer);
    clearTimeout(this.emptyVoiceChannelDisconnectTimer);

    util.randomPresence();

    console.log('[DISPOSE]');
  }
}

class BatchVideoLoader extends EventEmitter {
  /**
   * Video list to load
   */
  private youtubeVideoIdList: string[];
  /**
   * Whether the batch video loader was disposed
   */
  private disposed: boolean;

  constructor() {
    super();
    this.youtubeVideoIdList = [];
    this.disposed = false;
  }

  /**
   * Loads multiple YouTube videos in batches
   * @param youtubeVideoId YouTube video IDs
   * @param basicInfo Whether to load only basic info about videos
   * @param batchSize Maximum video load batch size
   */
  async loadPlaylist(youtubeVideoId: string[], basicInfo = false, batchSize = 3) {
    this.youtubeVideoIdList = youtubeVideoId;

    let getVideoInfo;

    if (basicInfo === false) {
      getVideoInfo = ytdl.getInfo;
    } else {
      getVideoInfo = ytdl.getBasicInfo;
    }

    for (let i = 0; i < this.youtubeVideoIdList.length; i += batchSize) {
      const videoBatchPromise: Promise<ytdl.videoInfo>[] = [];
      for (let j = i; (j < i + batchSize) && (j < this.youtubeVideoIdList.length); j++) {
        videoBatchPromise.push(getVideoInfo(this.youtubeVideoIdList[j]));
      }

      const videoBatch = await Promise.allSettled(videoBatchPromise);

      for (let j = 0; j < videoBatch.length; j++) {
        const parsedVideo = BatchVideoLoader.parseVideoInfo(videoBatch[j], basicInfo);
        this.emit('videoLoaded', parsedVideo);
      }
    }

    this.emit('videoBatchLoaded');
    this.dispose();
  }

  /**
   * Parses a settled promise of a ytdl video object
   * @param videoInfoPromise Video info object
   * @returns Pretty video info
   */
  private static parseVideoInfo(videoInfoPromise: PromiseSettledResult<ytdl.videoInfo>, basicInfo = false) {
    if (videoInfoPromise.status === 'fulfilled') {
      const videoInfo = (videoInfoPromise as PromiseFulfilledResult<ytdl.videoInfo>).value;
      if (videoInfo.player_response.playabilityStatus.status === 'OK') {
        if (basicInfo === false) {
          const bestQualityFormat = MusicPlayer.getBestQualityDownloadFormat(videoInfo);
          return {
            videoDownloadLink: bestQualityFormat.videoDownloadLink,
            videoDownloadLinkExpiration: bestQualityFormat.videoDownloadLinkExpiration,
            videoTitle: Discord.Util.escapeMarkdown(videoInfo.videoDetails.title),
            videoDuration: parseInt(videoInfo.videoDetails.lengthSeconds, 10),
          };
        }
        return {
          videoTitle: Discord.Util.escapeMarkdown(videoInfo.videoDetails.title),
          videoDuration: parseInt(videoInfo.videoDetails.lengthSeconds, 10),
        };
      }
      return { error: 'unplayableVideo' };
    } else {
      let errorReason: string;
      switch ((videoInfoPromise as PromiseRejectedResult).reason.message) {
        case 'This is a private video. Please sign in to verify that you may see it.':
          errorReason = 'privateVideo';
          break;
        case 'Video unavailable':
          errorReason = 'unavailableVideo';
          break;
        case 'Could not find player config':
          errorReason = 'playerConfigNotFound';
          break;
        case 'Unable to retrieve video metadata':
          errorReason = 'videoMetadataNotFound';
          break;
        case 'Status code: 429':
          errorReason = 'rateLimit';
          break;
        default:
          errorReason = 'otherError';
          console.log((videoInfoPromise as PromiseRejectedResult).reason.message);
      }
      return { error: errorReason };
    }
  }

  /**
   * Disposes the batch video loader object
   */
  dispose() {
    if (this.disposed === false) {
      this.removeAllListeners('videoLoaded');
      this.removeAllListeners('videoBatchLoaded');
      this.youtubeVideoIdList.splice(0, this.youtubeVideoIdList.length);
      this.disposed = true;
    }
  }
}
