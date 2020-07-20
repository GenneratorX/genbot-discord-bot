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

  private songListEndDisconnectTimer: NodeJS.Timeout;
  private noUsersDisconnectTimer: NodeJS.Timeout;

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

    this.songListEndDisconnectTimer = setTimeout(() => { }, 100);
    this.noUsersDisconnectTimer = setTimeout(() => { }, 100);

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
          if (this.isInSongList(videoInfo.videoDetails.videoId) === false) {
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
          } else {
            this.sendSimpleMessage(
              'Videoclipul introdus există deja în lista de redare!', 'error'
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
      clearTimeout(this.songListEndDisconnectTimer);
      this.currentSong = songPosition;
      try {
        if (this.voiceConnection === undefined || this.voiceConnection.status === 4) {
          console.log(`[CREATED VOICE CONNECTION]`);
          this.voiceConnection = await this.currentVoiceChannel.join();

          this.voiceConnection.on('disconnect', () => {
            console.log(`[DISCONNECTED FROM VOICE CHANNEL]`);
            this.destroy();
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
      this.songListEndDisconnectTimer = setTimeout(() => {
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
   * @param queue Song queue object
   */
  displaySongQueue(queue?: { ytdlVideoInfo: ytdl.videoInfo, addedBy: string }[]) {
    const MAX_DESCRIPTION_LENGTH = 2048;
    let songs: { ytdlVideoInfo: ytdl.videoInfo, addedBy: string }[] = [];
    if (queue !== undefined) {
      songs = queue;
    } else {
      songs = this.songList;
    }

    if (songs.length > 0) {
      let songQueueEmbed = new Discord.MessageEmbed()
        .setColor('#00FF00')
        .setTitle('Listă de redare');

      for (let i = 0; i < songs.length; i++) {
        let newSong = '';
        if (i === this.currentSong) {
          newSong =
            `\n**==================== [ MELODIA CURENTĂ ] ====================**\n` +
            `**\`${i + 1}.\` ${Discord.Util.escapeMarkdown(songs[i].ytdlVideoInfo.videoDetails.title)} ` +
            `[${prettyPrintDuration(parseInt(songs[i].ytdlVideoInfo.videoDetails.lengthSeconds, 10))}] ` +
            `[<@${songs[i].addedBy}>]**\n` +
            `**==========================================================**\n\n`;
        } else {
          newSong =
            `\`${i + 1}.\` ${Discord.Util.escapeMarkdown(songs[i].ytdlVideoInfo.videoDetails.title)} ` +
            `**[${prettyPrintDuration(parseInt(songs[i].ytdlVideoInfo.videoDetails.lengthSeconds, 10))}] ` +
            `[<@${songs[i].addedBy}>]**\n`;
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
          `Număr melodii: ${songs.length} | ` +
          `Durată: ${prettyPrintDuration(this.getSongQueueDuration(songs))}`
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
    if (
      this.currentVoiceChannel.members.size !== 0 &&
      (this.currentVoiceChannel.members.first() as Discord.GuildMember).user.bot === false
    ) {
      const searchResult = await this.searchPlaylistByName(playlistName);
      this.displayPlaylistSearchStatus(searchResult);
      if (searchResult.error === false) {
        const { playlists, exactMatchPosition } = searchResult;
        if (playlists.length === 1 || exactMatchPosition !== undefined) {
          let playlistToLoad: number;
          if (playlistName.length === 1) {
            playlistToLoad = 0;
          } else {
            playlistToLoad = exactMatchPosition as number;
          }

          this.sendSimpleMessage(
            `Am găsit o listă de redare cu numele **${playlists[playlistToLoad].playlistName}**. ` +
            'Așteaptă un moment până încarc melodiile...',
            'notification'
          );

          while (this.songList.length > 0) {
            this.songList.pop();
          }

          const songs = await this.loadSongsFromPlaylist(playlists[playlistToLoad].playlistId);
          const rejectedSongs: string[] = [];

          for (let i = 0; i < songs.length; i++) {
            if (songs[i].error === undefined) {
              this.songList.push({
                ytdlVideoInfo: songs[i].ytdlVideoInfo as ytdl.videoInfo,
                addedBy: songs[i].addedBy,
              });
            } else {
              let errorMessage = '';
              switch (songs[i].error) {
                case 'VIDEO_NOT_AVAILABLE': errorMessage = 'Videoclip indisponibil'; break;
                case 'PRIVATE_VIDEO': errorMessage = 'Videoclip privat'; break;
                case 'NETWORK_ERROR': errorMessage = 'Eroare la preluare'; break;
              }
              rejectedSongs.push(
                `\`${i + 1}.\` https://www.youtube.com/watch?v=${songs[i].videoId} **[${errorMessage}]**\n`
              );
            }
          }

          if (rejectedSongs.length === 0) {
            this.sendSimpleMessage('Lista de redare a fost încărcată în totalitate!', 'success');
            this.playSong(0);
          } else {
            if (rejectedSongs.length < songs.length) {
              const rejectedSongsEmbedd = new Discord.MessageEmbed().setColor('#FFFF00');
              if (rejectedSongs.length === 1) {
                rejectedSongsEmbedd.setDescription(
                  `Am încărcat o parte din lista de redare. **O melodie** nu a putut fi încărcată!\n` +
                  `**Melodia care nu a fost inclusă în lista de redare este:**\n${rejectedSongs[0]}`
                );
              } else {
                rejectedSongsEmbedd.setDescription(
                  `Am încărcat o parte din lista de redare. **${rejectedSongs.length} melodii** nu au putut fi ` +
                  `încărcate!\n**Melodiile care nu a fost incluse în lista de redare sunt:**\n${rejectedSongs.join('')}`
                );
              }
              this.currentTextChannel.send(rejectedSongsEmbedd);
              this.playSong(0);
            } else {
              this.sendSimpleMessage('Nu am putut să încarc nicio melodie din lista de redare!', 'error');
            }
          }
        }
      }
    } else {
      this.sendSimpleMessage('Intră în camera de voce că altfel o să ascult melodiile singur!', 'error');
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
   * Displays the songs of a playlist
   * @param playlistName Playlist name
   */
  async showPlaylistSongs(playlistName: string) {
    const searchResult = await this.searchPlaylistByName(playlistName);
    this.displayPlaylistSearchStatus(searchResult);
    if (searchResult.error === false) {
      const { playlists, exactMatchPosition } = searchResult;
      if (playlists.length === 1 || exactMatchPosition !== undefined) {
        let playlistToShow: number;
        if (playlists.length === 1) {
          playlistToShow = 0;
        } else {
          playlistToShow = exactMatchPosition as number;
        }

        this.sendSimpleMessage(
          `Am găsit o listă de redare cu numele **${playlists[playlistToShow].playlistName}**. ` +
          'Așteaptă un moment până încarc melodiile...',
          'notification'
        );

        const songs = await this.loadSongsFromPlaylist(playlists[playlistToShow].playlistId);
        const rejectedSongs: string[] = [];
        const queue: { ytdlVideoInfo: ytdl.videoInfo, addedBy: string }[] = [];

        for (let i = 0; i < songs.length; i++) {
          if (songs[i].error === undefined) {
            queue.push({ ytdlVideoInfo: songs[i].ytdlVideoInfo as ytdl.videoInfo, addedBy: songs[i].addedBy });
          } else {
            let errorMessage = '';
            switch (songs[i].error) {
              case 'VIDEO_NOT_AVAILABLE': errorMessage = 'Videoclip indisponibil'; break;
              case 'PRIVATE_VIDEO': errorMessage = 'Videoclip privat'; break;
              case 'NETWORK_ERROR': errorMessage = 'Eroare la preluare'; break;
            }
            rejectedSongs.push(
              `\`${i + 1}.\` https://www.youtube.com/watch?v=${songs[i].videoId} **[${errorMessage}]**\n`
            );
          }
        }

        if (rejectedSongs.length === 0) {
          this.sendSimpleMessage('Lista de redare a fost încărcată în totalitate!', 'success');
          this.displaySongQueue(queue);
        } else {
          if (rejectedSongs.length < songs.length) {
            if (rejectedSongs.length === 1) {
              this.sendSimpleMessage(
                `Am încărcat o parte din lista de redare. **O melodie** nu a putut fi încărcată!\n` +
                `**Melodia care nu a fost inclusă în lista de redare este:**\n${rejectedSongs[0]}`,
                'notification'
              );
            } else {
              this.sendSimpleMessage(
                `Am încărcat o parte din lista de redare. **${rejectedSongs.length} melodii** nu au putut fi ` +
                `încărcate!\n**Melodiile care nu a fost incluse în lista de redare sunt:**\n${rejectedSongs.join('')}`,
                'notification'
              );
            }
            this.displaySongQueue(queue);
          } else {
            this.sendSimpleMessage('Nu am putut să încarc nicio melodie din lista de redare!', 'error');
          }
        }
      }
    }
  }

  /**
   * Removes a playlist from the database
   * @param playlistName Playlist name
   */
  async removePlaylist(playlistName: string) {
    const searchResult = await this.searchPlaylistByName(playlistName);
    this.displayPlaylistSearchStatus(searchResult);
    if (searchResult.error === false) {
      const { playlists, exactMatchPosition } = searchResult;
      if (playlists.length === 1 || exactMatchPosition !== undefined) {
        let playlistToDelete: number;
        if (playlists.length === 1) {
          playlistToDelete = 0;
        } else {
          playlistToDelete = exactMatchPosition as number;
        }

        this.sendSimpleMessage(
          `Am șters lista de redare cu numele **${playlists[playlistToDelete].playlistName}**.`,
          'notification'
        );
        db.query('DELETE FROM playlist WHERE playlist_id = $1;', [playlists[playlistToDelete].playlistId]);
      }
    }
  }

  /**
   * Loads the songs of a playlist stored in the database
   * @param playlistId Playlist ID
   * @returns Object containing info about the songs
   */
  async loadSongsFromPlaylist(playlistId: string) {
    const songList: { videoId: string, addedBy: string, ytdlVideoInfo?: ytdl.videoInfo, error?: string }[] = [];

    const playlistQuery = await db.query(
      'SELECT video_id, added_by FROM playlist_song WHERE playlist_id = $1;', [playlistId]
    );

    const videoInfo: Promise<ytdl.videoInfo>[] = [];
    for (let i = 0; i < playlistQuery.length; i++) {
      videoInfo.push(ytdl.getInfo(`https://www.youtube.com/watch?v=${playlistQuery[i].video_id}`));
    }

    const allVideoInfo = await Promise.allSettled(videoInfo);
    for (let i = 0; i < allVideoInfo.length; i++) {
      songList.push({ videoId: playlistQuery[i].video_id, addedBy: playlistQuery[i].added_by });
      if (allVideoInfo[i].status === 'fulfilled') {
        const ytdlVideoInfo = (allVideoInfo[i] as PromiseFulfilledResult<ytdl.videoInfo>).value;
        if (ytdlVideoInfo.player_response.playabilityStatus.status === 'OK') {
          songList[i].ytdlVideoInfo = this.cleanYtdlVideoInfoObject(ytdlVideoInfo);
        } else {
          songList[i].error = 'VIDEO_NOT_AVAILABLE';
        }
      } else {
        const error = (allVideoInfo[i] as PromiseRejectedResult).reason;
        switch (error.message) {
          case 'This is a private video. Please sign in to verify that you may see it.':
            songList[i].error = 'PRIVATE_VIDEO';
            break;
          default:
            songList[i].error = 'NETWORK_ERROR';
        }
      }
    }
    return songList;
  }

  /**
   * Sets the status of the no users in voice channel disconnect timer
   * @param enable Whether to enable the disconnect timer
   */
  enableNoUsersDisconnectTimer(enable?: boolean) {
    if (enable === false) {
      clearTimeout(this.noUsersDisconnectTimer);
    } else {
      this.noUsersDisconnectTimer = setTimeout(() => {
        this.destroy();
        this.sendSimpleMessage('Am rămas singur ... așa că am ieșit!', 'notification');
      }, 300000); // 5 minutes
    }
  }

  /**
   * Searches for playlists in the database
   * @param playlistName Playlist name
   * @returns Playlists that matches the playlist name
   */
  private async searchPlaylistByName(playlistName: string): Promise<{
    error: false,
    exactMatchPosition?: number,
    playlists: {
      playlistId: string,
      playlistName: string,
      createdBy: string
    }[]
  } | {
    error: true
  }> {
    playlistName = playlistName.replace(/\s+/g, ' ');
    if (playlistName.length > 0) {
      const playlists: { playlistId: string, playlistName: string, createdBy: string }[] = await db.query(
        'SELECT playlist_id "playlistId", playlist_name "playlistName", created_by "createdBy" ' +
        'FROM playlist WHERE playlist_name ILIKE $1;',
        [`%${playlistName}%`]
      );

      let exactMatchPosition;
      for (let i = 0; i < playlists.length; i++) {
        if (playlists[i].playlistName === playlistName) {
          exactMatchPosition = i;
          i = playlists.length;
        }
      }

      return { error: false, exactMatchPosition: exactMatchPosition, playlists: playlists };
    }
    return { error: true };
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
   * Helper function that displays playlist search status messages
   * @param searchStatus Playlist search object
   */
  private displayPlaylistSearchStatus(searchStatus: {
    error: false,
    exactMatchPosition?: number,
    playlists: {
      playlistId: string,
      playlistName: string,
      createdBy: string
    }[]
  } | {
    error: true
  }) {
    if (searchStatus.error === false) {
      const { playlists } = searchStatus;
      if (playlists.length > 1) {
        const multipleMatches: string[] = [];
        for (let i = 0; i < playlists.length; i++) {
          multipleMatches.push(`\u25cf ${playlists[i].playlistName} **[<@${playlists[i].createdBy}>]**\n`);
        }
        this.sendSimpleMessage(
          `**Există mai multe liste de redare care conțin numele introdus:**\n${multipleMatches.join('')}`,
          'notification'
        );
      } else {
        if (playlists.length === 0) {
          this.sendSimpleMessage('Nu există o listă de redare cu acel nume!', 'error');
        }
      }
    } else {
      this.sendSimpleMessage('Introdu și tu măcar un caracter, ca să știu ce să caut!', 'error');
    }
  }

  /**
   * Checks if a song is in the song list
   * @param videoId YouTube video ID
   * @returns Whether the song is a duplicate
   */
  private isInSongList(videoId: string) {
    for (let i = 0; i < this.songList.length; i++) {
      if (this.songList[i].ytdlVideoInfo.videoDetails.videoId === videoId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets the duration in seconds of a song queue
   * @param queue Song queue object
   * @returns Duration of the song queue in seconds
   */
  private getSongQueueDuration(queue?: { ytdlVideoInfo: ytdl.videoInfo, addedBy: string }[]) {
    let duration = 0;
    let songs: { ytdlVideoInfo: ytdl.videoInfo, addedBy: string }[] = [];
    if (queue !== undefined) {
      songs = queue;
    } else {
      songs = this.songList;
    }

    for (let i = 0; i < songs.length; i++) {
      duration += parseInt(songs[i].ytdlVideoInfo.videoDetails.lengthSeconds, 10);
    }
    return duration;
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
   * Destroys the player object
   */
  private destroy() {
    while (this.songList.length > 0) {
      this.songList.pop();
    }
    this.currentSong = -1;
    this.isPlaying = false;

    clearTimeout(this.songListEndDisconnectTimer);
    clearTimeout(this.noUsersDisconnectTimer);

    this.voiceChannel.leave();
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
   * Gets or
   */
  get voiceChannel() {
    return this.currentVoiceChannel;
  }

  /**
   * updates the current voice channel
   */
  set voiceChannel(newVoiceChannel: Discord.VoiceChannel) {
    this.currentVoiceChannel = newVoiceChannel;
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
