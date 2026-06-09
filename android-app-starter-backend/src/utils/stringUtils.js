/**
 * String utilities for accent-insensitive text search.
 *
 * Two complementary functions are provided, each suited to a different context:
 *
 *  - normalizeSearchText: for JS-side filtering (same NFD logic as frontend).
 *    Use when BOTH sides of the comparison are JavaScript strings (e.g. filtering
 *    cached DTOs in Node).
 *
 *  - buildAccentFoldedRegex: for MongoDB $regex queries.
 *    MongoDB stores documents with accents; collation does NOT affect $regex.
 *    This function expands each base letter in the search term into a character
 *    class covering all common Unicode accented variants, so that a regex built
 *    from "acao" will match documents containing "ação", "acão", etc.
 */

/**
 * Normalizes a string for accent-insensitive search.
 * NFD decomposition removes combining diacritical marks (U+0300–U+036F) from
 * virtually all Latin script languages (pt, en, es, de, fr, etc.).
 * Special cases that NFD does not decompose are handled explicitly.
 *
 * @param {string|null|undefined} text
 * @returns {string}
 *
 * @example
 *   normalizeSearchText('ação')   // 'acao'
 *   normalizeSearchText('über')   // 'uber'
 *   normalizeSearchText('señor')  // 'senor'
 *   normalizeSearchText('straße') // 'strasse'
 */
export function normalizeSearchText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Builds an accent-folded RegExp for MongoDB $regex queries.
 *
 * Why: MongoDB stores strings with their original accents. Collation only
 * affects comparison operators ($eq, sort, etc.) — NOT $regex. The only way
 * to make a $regex match accent-insensitively without changing the schema is
 * to expand each letter in the search term into a character class that covers
 * all its accented Unicode variants.
 *
 * Strategy:
 *   1. Normalize the input term (NFD + special cases) so "ação" → "acao".
 *   2. Escape regex special characters.
 *   3. Replace each base letter with a character class covering all common
 *      Unicode accented variants across Latin script languages (pt, en, es,
 *      de, fr, and others).
 * 
 * Result: searching `"acao"` generates the regex `/[aáàâãäåāăą][cçćĉċč][aáàâãäåāăą][oóòôõöøōŏő]/i`, 
 * which matches any document containing `"ação"`, `"Ação"`, `"acao"`, etc.
 *
 * @param {string} term - Raw search term from the user.
 * @returns {RegExp} - Case-insensitive regex ready for MongoDB $regex.
 *
 * @example
 *   buildAccentFoldedRegex('acao')   // matches "ação", "acão", "acao", …
 *   buildAccentFoldedRegex('uber')   // matches "über", "uber", …
 *   buildAccentFoldedRegex('senor')  // matches "señor", "senor", …
 */
export function buildAccentFoldedRegex(term) {
  if (!term) return new RegExp('', 'i');

  // Step 1 – normalize to base letters (same as normalizeSearchText)
  const normalized = normalizeSearchText(term);

  // Step 2 – accent map: base letter → all common Unicode variants
  // Covers: Portuguese, Spanish, French, German and other Latin scripts.
  // Note: the map is lowercase; the regex flag 'i' handles case-insensitivity.
  const accentMap = {
    a: 'aáàâãäåāăą',
    e: 'eéèêëēĕęě',
    i: 'iíìîïīĭį',
    o: 'oóòôõöøōŏő',
    u: 'uúùûüūŭůű',
    c: 'cçćĉċč',
    n: 'nñńņň',
    s: 'sśŝşš',
    z: 'zźżž',
    y: 'yýÿ',
    l: 'lĺļľł',
    r: 'rŕŗř',
    d: 'dďđ',
    t: 'tţť',
    g: 'gĝğġģ',
    h: 'hĥħ',
  };

  // Step 3 – build the pattern char by char
  const pattern = normalized
    .split('')
    .map(char => {
      // Escape regex special characters first
      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const variants = accentMap[escaped];
      if (variants) {
        return `[${variants}]`;
      }
      return escaped;
    })
    .join('');

  return new RegExp(pattern, 'i');
}
