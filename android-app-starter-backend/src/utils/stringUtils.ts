/**
 * Utilitários para busca textual sem sensibilidade a acentos.
 *
 * normalizeSearchText serve para filtros em memória, quando os dois lados da
 * comparação são strings JavaScript. buildAccentFoldedRegex serve para buscas
 * MongoDB com $regex, porque collation não afeta regex.
 */

/**
 * Normaliza uma string para busca sem acentos.
 *
 * A decomposição NFD remove marcas diacríticas da maioria dos idiomas latinos;
 * os casos que ela não decompõe são tratados explicitamente.
 */
export function normalizeSearchText(text: string | null | undefined): string {
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
 * Monta uma RegExp expandida para consultas MongoDB com $regex.
 *
 * O MongoDB armazena os acentos originais e collation não afeta $regex; por
 * isso cada letra base é expandida para uma classe com variantes acentuadas.
 */
export function buildAccentFoldedRegex(term: string): RegExp {
  if (!term) return new RegExp('', 'i');

  // Passo 1: normaliza para letras base.
  const normalized = normalizeSearchText(term);

  // Passo 2: mapeia cada letra base para variantes Unicode comuns.
  // O mapa fica em minúsculas; a flag 'i' cobre maiúsculas/minúsculas.
  const accentMap: Record<string, string> = {
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

  // Passo 3: monta o padrão caractere por caractere.
  const pattern = normalized
    .split('')
    .map((char) => {
      // Escapa caracteres especiais de regex antes de expandir variantes.
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
