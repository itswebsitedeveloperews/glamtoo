/** Escape script termination and HTML-sensitive characters without altering JSON. */
export function serializeStructuredData(data) {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
