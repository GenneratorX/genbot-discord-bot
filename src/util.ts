'use strict';

export const colorGreen = '#09776c';
export const colorBlue = '#3098b8';
export const colorRed = '#d3312e';

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
export function unixTimestamp(): number {
  return Math.floor(+new Date() / 1000);
}
