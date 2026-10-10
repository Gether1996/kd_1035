/** lower case without diacritics: "Pěchota" and "pechota" find the same event, "sun tzu" finds "Sun Tzu Prime" */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
