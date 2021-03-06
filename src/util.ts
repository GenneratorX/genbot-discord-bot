'use strict';

import Discord = require('discord.js');

import net = require('net');
import { performance } from 'perf_hooks';

import { client } from './bot';
import { musicPlayer } from './command';

export const colorGreen = 620396;
export const colorBlue = 3184824;
export const colorRed = 13840686;
export const maxEmbedDescriptionLength = 2048;

const presenceList: Discord.ActivityOptions[] = [
  { type: 'LISTENING', name: 'noone' },
  { type: 'LISTENING', name: 'your requests' },
  { type: 'PLAYING', name: 'with your feelings' },
  { type: 'WATCHING', name: 'paint dry' },
  { type: 'WATCHING', name: 'YOU' }
];
let lastPresenceIndex = presenceList.length + 1;

/**
 * Splits a string after the first space
 * @param string String to split
 * @returns Object containing two strings
 */
export function splitAfterFirstSpace(string: string) {
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

/**
 * Displays an error in the logs
 * @param errorType Error type to display
 * @param error Error
 */
export function errorDisplay(errorType: string, error: Error) {
  console.log(`[Error][${errorType}] ${error}`);
}

/**
 * Prints duration in hours:minutes:seconds format
 * @param duration Duration in seconds
 * @returns Pretty time
 */
export function prettyPrintDuration(duration: number) {
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

/**
 * Gets the current UNIX timestamp
 * @returns Current UNIX timestamp
 */
export function unixTimestamp() {
  return Math.floor(+new Date() / 1000);
}

/**
 * Sends a complex message to a text channel
 * @param message Message properties
 * @param textChannel Text channel to send to
 */
export function sendComplexMessage(
  message: {
    color: number,
    title: string,
    footer?: string,
    paragraph: string[]
  },
  textChannel: Discord.TextChannel
) {
  let embed = new Discord.MessageEmbed({ color: message.color, title: message.title });
  for (let i = 0; i < message.paragraph.length; i++) {
    if (embed.description !== null) {
      if (embed.description.length + message.paragraph[i].length <= maxEmbedDescriptionLength) {
        embed.setDescription(embed.description + message.paragraph[i]);
      } else {
        textChannel.send(embed);
        embed = new Discord.MessageEmbed({ color: message.color, description: message.paragraph[i] });
      }
    } else {
      embed.setDescription(message.paragraph[i]);
    }
  }

  embed.setFooter(message.footer);
  textChannel.send(embed);
}

/**
 * Gets the duration of a TCP 3-way handshake to a hostname
 * @param hostname Hostname
 * @param port TCP port
 * @param connectionTimeout Connection timeout in ms
 * @returns Duration in ms
 */
export function tcpPing(hostname: string, port: number, connectionTimeout?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(connectionTimeout || 2000);
    let start: number;

    if (net.isIP(hostname) !== 0) {
      start = performance.now();
    }

    socket.once('lookup', () => {
      start = performance.now();
    }).once('connect', () => {
      const end = performance.now();
      socket.destroy();
      resolve(end - start);
    }).once('error', () => {
      socket.destroy();
      reject('connectionError');
    }).once('timeout', () => {
      socket.destroy();
      reject('connectionTimeout');
    }).connect(port, hostname);
  });
}

/**
 * Sets a random bot presence from a predefined list
 */
export function randomPresence() {
  if (musicPlayer === undefined || musicPlayer.ready === false) {
    let randomPresenceIndex = Math.floor(Math.random() * presenceList.length);
    while (randomPresenceIndex === lastPresenceIndex) {
      randomPresenceIndex = Math.floor(Math.random() * presenceList.length);
    }
    (client.user as Discord.ClientUser).setActivity(presenceList[randomPresenceIndex]).then(() => {
      lastPresenceIndex = randomPresenceIndex;
    });
  }
}
