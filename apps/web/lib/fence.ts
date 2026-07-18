/**
 * react-markdown gives a code element a `language-<lang>` class for fenced
 * blocks. Return the language, or null for inline code / unlabeled fences.
 */
export function fenceLanguage(className?: string): string | null {
  const match = /(?:^|\s)language-([^\s]+)/.exec(className ?? "");
  return match ? match[1]! : null;
}
