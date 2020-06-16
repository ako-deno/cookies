/*!
 * cookies
 * Copyright(c) 2014 Jed Schmidt, http://jed.is/
 * Copyright(c) 2015-2016 Douglas Christopher Wilson
 * Copyright(c) 2020 Christian Norrman
 * MIT Licensed
 */
import {
  getCookies,
  setCookie,
  deleteCookie,
  Cookie,
  Response,
  ServerRequest,
  Keygrip,
} from './deps.ts';

/**
 * RegExp to match field-content in RFC 7230 sec 3.2
 *
 * field-content = field-vchar [ 1*( SP / HTAB ) field-vchar ]
 * field-vchar   = VCHAR / obs-text
 * obs-text      = %x80-FF
 */
const FIELD_CONTENT_REGEXP = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
const SAME_SITE = [ true, 'strict', 'lax', 'none' ];

export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  signed?: boolean;
  overwrite?: boolean;
  sameSite?: 'strict' | 'lax' | 'none' | true;
}

export interface CookieJarOptions {
  keys?: string[]|Keygrip;
  secure?: boolean;
}

export class CookieJar extends Map<string, string> {
  #res: Response;
  #secure?: boolean;
  #keys?: Keygrip;

  constructor(req: ServerRequest, res: Response, opts?: CookieJarOptions) {
    super();
    this.#res = res;
    this.#secure = !!opts?.secure;

    if (opts) {
      const { keys } = opts;
      if (keys) {
        this.#keys = keys instanceof Keygrip ? keys : new Keygrip(keys);
      }
    }

    // Set initial cookies
    const cookies = getCookies(req);
    for (const key of Object.keys(cookies)) {
      super.set(key, cookies[key]);
    }
  }

  get(name: string, opts?: Pick<CookieOptions, 'signed'>): string|undefined {
    const signed = opts?.signed ?? !!this.#keys;
    const value = super.get(name);
    if (!signed) {
      return value;
    }

    const signedName = `${name}.sig`;
    const remote = super.get(signedName);
    if (remote) {
      const data = `${name}=${value}`;
      if (!this.#keys) {
        throw new Error('Keys required for signed cookies');
      }

      const idx = this.#keys.index(data, remote);
      if (idx == -1) {
        this.delete(signedName);
      } else {
        idx && this.set(signedName, this.#keys.sign(data), { signed: false });
        return value;
      }
    }
  }

  set(name: string, value: string|null|undefined, opts: CookieOptions = {}): this {
    if (!value) {
      this.delete(name);
      return this;
    }

    if (!FIELD_CONTENT_REGEXP.test(name)) {
      throw new TypeError('argument name is invalid');
    } else if (!FIELD_CONTENT_REGEXP.test(value)) {
      throw new TypeError('argument value is invalid');
    } else if (opts.path && !FIELD_CONTENT_REGEXP.test(opts.path)) {
      throw new TypeError('option path is invalid');
    } else if (opts.domain && !FIELD_CONTENT_REGEXP.test(opts.domain)) {
      throw new TypeError('option domain is invalid');
    } else if (opts.sameSite && !SAME_SITE.includes(opts.sameSite)) {
      throw new TypeError('option sameSite is invalid');
    }

    const secure = !!opts.secure;
    if (!this.#secure && secure) {
      throw new Error('Cannot send secure cookie over unencrypted connection');
    }

    // Create cookie
    const cookie = {
      name, value, secure,
      path: opts.path ?? '/',
      httpOnly: opts.httpOnly ?? true,
      maxAge: opts.maxAge,
    } as Cookie;

    this.setCookie(cookie, opts);
    const signed = opts.signed ?? !!this.#keys;
    if (signed) {
      if (!this.#keys) {
        throw new Error('.keys required for signed cookies');
      }

      cookie.name += '.sig';
      cookie.value = this.#keys.sign(`${cookie.name}=${cookie.value}`);
      this.setCookie(cookie, opts);
    }

    return this;
  }

  // Only sets cookie if overwrite is false or doesn't already exist
  private setCookie(cookie: Cookie, opts: CookieOptions): void {
    if (opts.overwrite || !super.has(cookie.name)) {
      setCookie(this.#res, cookie);
      super.set(cookie.name, cookie.value);
    }
  }

  delete(name: string): boolean {
    if (!FIELD_CONTENT_REGEXP.test(name)) {
      throw new TypeError('argument name is invalid');
    }

    deleteCookie(this.#res, name);
    return super.delete(name);
  }

  clear(): void {
    for (const key of this.keys()) {
      deleteCookie(this.#res, key);
    }
    super.clear();
  }
}

