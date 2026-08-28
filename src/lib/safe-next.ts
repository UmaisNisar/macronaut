/**
 * Where a sign-in is allowed to land.
 *
 * `next` arrives on the query string, so it is whatever the person who sent
 * the link decided it should be. Checking that it starts with "/" is the
 * obvious guard and it is not enough: a browser reads "//evil.example" as a
 * protocol-relative URL and leaves the site entirely, and several of them
 * treat a backslash the same way. A sign-in that completes and then lands
 * somewhere else is the shape of a convincing phishing hop, so anything with
 * a second separator in front is refused outright rather than cleaned up —
 * repairing a hostile string tends to produce another hostile string.
 *
 * Kept out of the route so it can be tested without standing up an OAuth
 * exchange, which is the only way that code path can be reached.
 */

/**
 * Tabs, newlines and other control characters are stripped by a browser's URL
 * parser, so a value approved here can turn into a different one immediately
 * afterwards.
 *
 * Written as a loop rather than a character class on purpose: a regex of raw
 * control characters is invisible in a diff and easy to mangle by accident,
 * which is not a property you want in a security check.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** One slash, then something that is not another separator. */
const ONE_SLASH = /^\/(?![/\\])/;

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (hasControlCharacter(next)) return "/";
  return ONE_SLASH.test(next) ? next : "/";
}
