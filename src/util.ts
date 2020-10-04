'use strict';

import Discord = require('discord.js');

export const colorGreen = 620396;
export const colorBlue = 3184824;
export const colorRed = 13840686;
export const maxEmbedDescriptionLength = 2048;

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
    if (embed.description !== undefined) {
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
