/*!
 * Based on https://github.com/pillarjs/cookies/blob/master/index.js
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
  SameSite,
  ms,
} from "./deps.ts";

/**
 * RegExp to match field-content in RFC 7230 sec 3.2
 * field-content = field-vchar [ 1*( SP / HTAB ) field-vchar ]
 * field-vchar   = VCHAR / obs-text
 * obs-text      = %x80-FF
 * @constant
 * @private
 */
const FIELD_CONTENT_REGEXP = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;

/**
 * Maps same_site values to the correct value.
 * @constant
 * @private
 */
const SAME_SITE: Record<string, SameSite> = {
  true: "Strict",
  strict: "Strict",
  lax: "Lax",
  none: "None",
};

/**
 * Options to pass for CookieJar methods
 * @interface
 */
export interface CookieOptions {
  maxAge?: number | string;
  expires?: Date | number | string;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  signed?: boolean;
  overwrite?: boolean;
  sameSite?: SameSite | true;
}

/**
 * Options for CookieJar initialization
 * @interface
 */
export interface CookieJarOptions {
  keys?: string[] | Keygrip;
  secure?: boolean;
}

/**
 * Cookie manager for Deno built on top of the Map built-in collection
 * @class
 */
export class CookieJar extends Map<string, string> {
  #res: Response;
  #secure: boolean = false;
  #keys?: Keygrip;

  /**
   * @param {ServerRequest} req
   * @param {Response} res
   * @param {CookieJarOptions} [opts]
   */
  constructor(req: ServerRequest, res: Response, opts?: CookieJarOptions) {
    super();
    this.#res = res;

    if (opts) {
      const { keys, secure } = opts;
      this.#secure = !!secure;
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

  /**
   * Sets a cookie in the response header,
   *
   * @param {string} name Cookie name
   * @param {string|null|undefined} value Cookie value
   * @param {CookieOptions} opts
   * 
   * @returns {boolean}
   * @throws {TypeError|Error}
   * @private
   */
  private setCookie(
    name: string,
    value: string | null | undefined,
    opts: CookieOptions,
  ): boolean {
    let {
      secure, maxAge, expires, sameSite, domain,
      path = '/',
      httpOnly = true,
    } = opts;
    if (!this.#secure && secure) {
      throw new Error("Cannot send secure cookie over unencrypted connection");
    }

    // Parse sameSite
    if (sameSite) {
      const key = String(sameSite).toLowerCase();
      sameSite = SAME_SITE[key];
      if (typeof opts.sameSite != "string") {
        throw new TypeError("option sameSite is invalid");
      }
    }

    // Parse maxAge
    if (maxAge && typeof maxAge == "string") {
      const res = ms(maxAge) as number;
      if (res == null || isNaN(res)) {
        throw new TypeError("maxAge string invalid");
      }
      maxAge = (res / 1000) | 0;
    }

    // Parse expires
    if (expires) {
      if (typeof expires == "string") {
        const time = ms(expires);
        if (typeof time == "number") {
          expires = Date.now() + time;
        }
      }

      expires = new Date(expires);
    }

    // Create cookie
    const cookie = {
      name, value, secure, domain, path, httpOnly, sameSite, maxAge, expires,
    } as Cookie;
    setCookie(this.#res, cookie);

    const signed = opts.signed ?? !!this.#keys;
    if (signed) {
      if (!this.#keys) {
        throw new Error(".keys required for signed cookies");
      }

      cookie.name += ".sig";
      cookie.value = this.#keys.sign(`${cookie.name}=${cookie.value}`);
      setCookie(this.#res, cookie);
    }
    return true;
  }

  /**
   * Gets a cookie,
   * Only sets cookie if overwrite is false or doesn't already exist
   * @param {string} name
   * @param {object} [opts] Optional cookie options, only signed will be used.
   *
   * @throws {TypeError|Error}
   * @returns {string|undefined}
   */
  get(name: string, opts?: Pick<CookieOptions, "signed">): string | undefined {
    const signed = opts?.signed ?? !!this.#keys;
    const value = super.get(name);

    if (signed) {
      const signatureName = `${name}.sig`;
      const signature = super.get(signatureName);

      if (signature) {
        if (!this.#keys) {
          throw new Error("Keys required for signed cookies");
        }

        const data = `${name}=${value}`;
        const idx = this.#keys.index(data, signature);
        if (idx == -1) {
          return this.delete(signatureName), void 0;
        } else if (idx) {
          this.set(signatureName, this.#keys.sign(data), { signed: false });
        }
      }
    }

    return value;
  }

  /**
   * Sets a new cookie, if value is empty and there are no options the delete method is used instead.
   * If any parameter is invalid it will throw a TypeError
   * @param {string} name Cookie name
   * @param {*} value Cookie value
   * @param {CookieOptions} [opts] Cookie options, optional.
   *
   * @throws {TypeError|Error}
   * @returns {this}
   */
  set(name: string, value: any, options?: CookieOptions): this {
    if (!value && !options) {
      return this.delete(name), this;
    }

    const opts = options ?? {};
    value = value && String(value);

    if (!opts.overwrite && super.has(name)) {
      return this;
    } else if (!FIELD_CONTENT_REGEXP.test(name)) {
      throw new TypeError("argument name is invalid");
    } else if (value && !FIELD_CONTENT_REGEXP.test(value)) {
      throw new TypeError("argument value is invalid");
    } else if (opts.path && !FIELD_CONTENT_REGEXP.test(opts.path)) {
      throw new TypeError("option path is invalid");
    } else if (opts.domain && !FIELD_CONTENT_REGEXP.test(opts.domain)) {
      throw new TypeError("option domain is invalid");
    }

    this.setCookie(name, value, opts);
    if (opts.signed ?? this.#keys) {
      if (!this.#keys) {
        throw new Error(".keys required for signed cookies");
      }

      name += ".sig";
      value = this.#keys.sign(`${name}=${value}`);
      this.setCookie(name, value, opts);
    }

    return this;
  }

  /**
   * Deletes a specific cookie.
   * Will not guarantee all cookies to be deleted, as some might have special parameters set.
   * If this is the case use the delete method with same value in the parameters: path, domain, secure, httpOnly, sameSite.
   * @param {string} name Cookie name
   * @param {object} [opts] Cookie options, optional. (without expires and maxAge)
   *
   * @throws {TypeError|Error}
   * @returns {boolean}
   */
  delete(
    name: string,
    opts?: Exclude<CookieOptions, "expires" | "maxAge" | "overwrite">,
  ): boolean {
    if (!FIELD_CONTENT_REGEXP.test(name)) {
      throw new TypeError("argument name is invalid");
    }

    // Some cookies can only get removed with params set
    if (opts) {
      opts.maxAge = "";
      opts.expires = new Date(0);
      return this.setCookie(name, "", opts) && super.delete(name);
    }

    deleteCookie(this.#res, name);
    return super.delete(name);
  }

  /**
   * Clears all the set cookies.
   * Will not guarantee all cookies to be deleted, as some might have special parameters set.
   * If this is the case use the delete method with same value in the parameters: path, domain, secure, httpOnly, sameSite.
   *
   * @returns {void}
   */
  clear(): void {
    for (const key of this.keys()) {
      const idx = key.lastIndexOf(".sig");
      if (idx != -1 && super.has(key.substring(0, idx))) {
        continue;
      }

      deleteCookie(this.#res, key);
    }
    super.clear();
  }
}
