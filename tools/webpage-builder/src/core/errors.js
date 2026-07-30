/**
 * Fehlerklassen mit stabilen Codes.
 *
 * Die Exit-Codes sind Teil des oeffentlichen Vertrags — eine fremde KI
 * entscheidet daran, was zu tun ist. Nie aendern ohne AGENTS.md anzupassen.
 */

export const EXIT = {
  OK: 0,
  PARTIAL: 1,
  BAD_INPUT: 2,
  MISSING_KEY: 3,
  NETWORK: 4,
};

export class WbError extends Error {
  /**
   * @param {string} code    maschinenlesbarer Code, z.B. 'MISSING_KEY'
   * @param {string} message was passiert ist
   * @param {string} hint    was der Aufrufer dagegen tun kann — im Klartext
   * @param {number} exit    passender Exit-Code
   */
  constructor(code, message, hint = '', exit = EXIT.BAD_INPUT) {
    super(message);
    this.name = 'WbError';
    this.code = code;
    this.hint = hint;
    this.exit = exit;
  }

  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

export const badInput = (msg, hint) =>
  new WbError('BAD_INPUT', msg, hint, EXIT.BAD_INPUT);

export const missingKey = (envName, wofuer) =>
  new WbError(
    'MISSING_KEY',
    `Umgebungsvariable ${envName} fehlt (benoetigt fuer ${wofuer}).`,
    `Trage ${envName} in tools/webpage-builder/.env ein. Vorlage: .env.example`,
    EXIT.MISSING_KEY,
  );

export const networkError = (msg, hint = 'Netzwerk oder API pruefen, danach erneut aufrufen — der Cache haelt bereits erledigte Schritte.') =>
  new WbError('NETWORK', msg, hint, EXIT.NETWORK);

/** Wandelt beliebige Fehler in die einheitliche Form. */
export function normalizeError(err) {
  if (err instanceof WbError) return err;
  const msg = err?.message ?? String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(msg)) {
    return networkError(msg);
  }
  return new WbError('INTERNAL', msg, 'Unerwarteter Fehler. Mit --verbose erneut aufrufen fuer den Stacktrace.', EXIT.BAD_INPUT);
}
