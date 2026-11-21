// @ts-check
// Options from the page address (?q=low&novfx&water=speed:2). Read once per page load; every module asks here
// instead of parsing location.search itself. Compatible with the URLSearchParams methods the game uses (has, get).

export class Options {
  /** @param {string | URLSearchParams} [search] */
  constructor(search = '') {
    this.params = new URLSearchParams(search);
  }

  /** @param {string} key */
  has(key) {
    return this.params.has(key);
  }

  /** @param {string} key @returns {string | null} */
  get(key) {
    return this.params.get(key);
  }

  /**
   * A switch: `?key` or `?key=1` is on, `?key=0` is off, absent gives the fallback.
   * @param {string} key
   * @param {boolean} [fallback]
   */
  flag(key, fallback = false) {
    return this.has(key) ? this.get(key) !== '0' : fallback;
  }

  /**
   * A number, or the fallback when the option is absent, empty or not a number.
   * @template T
   * @param {string} key
   * @param {T} fallback
   * @returns {number | T}
   */
  num(key, fallback) {
    const v = this.get(key);
    return v !== null && v !== '' && !Number.isNaN(+v) ? +v : fallback;
  }

  /**
   * Overrides for a table of numbers, written `?key=name:value,name:value`. Only names the table already has are
   * taken. Changes `into` in place and returns it.
   * @template {Record<string, number>} T
   * @param {string} key
   * @param {T} into
   * @returns {T}
   */
  tune(key, into) {
    for (const part of (this.get(key) || '').split(',')) {
      const [k, v] = part.split(':');
      if (k in into && v !== undefined && !Number.isNaN(+v)) /** @type {Record<string, number>} */ (into)[k] = +v;
    }
    return into;
  }
}

/** The options of this page load (empty outside a browser, e.g. in node tests). */
export const OPTIONS = new Options(typeof location !== 'undefined' ? location.search : '');
