cookies
==========================

A cookie parser for Deno based on the same API as the built-in Map object. This package also uses the third party library Keygrip `https://deno.land/x/keygrip` to sign cookies. Heavily based on `https://github.com/pillarjs/cookies`.


API
--------------------------

```js
import { CookieJar } from "https://deno.land/x/cookies/mod.ts";
```

### [cookies = new CookieJar(req, res [, opts])](#cookiejar)

Instansiates a new cookie jar. Contains cookies for the request and manages them via the response headers. It is named CookieJar to avoid confusion with the Cookies type within Deno's standard library.

**Returns:** An instance of a CookieJar class.

#### Parameters
* `req {ServerRequest}` - Server request.
* `res {Response}` - Server response.
* `opts {CookieJarOptions}` - Optional options.
  * `keys {string[] | Keygrip}` - List of keys to construct a Keygrip instance, a Keygrip instance can also be passed directly. Without keys cookies cannot be signed.
  * `secure {boolean}` - If the connection is considered secure (https), this is used to prevent secure cookies being sent over an unencrypted connection.


### [cookies.get( name [, opts ] )](#get)

Gets the value of a cookie.

**Returns:** A string with the cookies value if the cookie exists, otherwise returns undefined. However if the cookie is signed it returns undefined if the signature does not match.

#### Parameters
* `name {string}` - Cookie name.
* `opts {CookieJarOptions}` - Optional options.
  * `signed {boolean}` - Defaults to true if keys are set


### [cookies.set( name, value [, opts ] )](#set)

Sets the value of a cookie, however won't overwrite if cookie is already set, unless the overwrite option is truthy.

**Returns:** The same CookieJar object, to be able to chain together multiple with other methods.

#### Parameters
* `name {string}` - Name of cookie to setCookie name.
* `value {any}` - .
* `opts {CookieJarOptions}` - Optional options.
  * `maxAge {number | string}` - Could be a number in seconds or string in the format from the [ms](https://deno.land/x/ms) module.
  * `expires {Date | number | string}` -
  * `path {string}` - Which URL path the cookie should be available in. Defaults to '/'.
  * `domain {string}` - Which domains the cookie should be available to, will include subdomains of the specified domain.
  * `secure {boolean}` - If the cookie should only be sent through a secure connection aka HTTPS. Defaults to false.
  * `httpOnly {boolean}` - If cookie should only be available in the HTTP response and not available thorugh scripts. Defaults to true.
  * `signed {boolean}` - If the cookie should be signed. Defaults to true if any keys are set.
  * `overwrite {boolean}` - Won't overwrite if cookie is already set if not true, Defaults to false.
  * `sameSite {"strict" | "lax" | "none" | true}` - SameSite attribute, for more info see [https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite](MDN for SameSite).


### [cookies.has( name )](#has)

Checks for the exsistence of a cookie.

**Returns:** A boolean indicating if a cookie with the same name exists.

#### Parameters
* `name {string}` - Name of cookie to check for.


### [cookies.delete( name [, opts] )](#delete)

Deletes a cookie from Has the same effect as setting a cookie to null.

**Returns:** a boolean indicating if the deletion was successfull.

#### Parameters
* `name {string}` - Name of cookie to delete.
* `opts {CookieJarOptions}` - Optional options.
  * `path {string}` - Which URL path the cookie should be available in. Defaults to '/'.
  * `domain {string}` - Which domains the cookie should be available to, will include subdomains of the specified domain.
  * `secure {boolean}` - If the cookie should only be sent through a secure connection aka HTTPS. Defaults to false.
  * `httpOnly {boolean}` - If cookie should only be available in the HTTP response and not available thorugh scripts. Defaults to true.
  * `signed {boolean}` - If the cookie should be signed. Defaults to true if any keys are set.
  * `sameSite {"strict" | "lax" | "none" | true}` - SameSite attribute, for more info see [https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite](MDN for SameSite).


### [cookies.clear()](#clear)

Deletes all the cookies stored in the CookieJar, same as setting each individual cookie to null or an empty string. However some cookies require to be deleted in a specific way due to some specified parameters. See [delete](#delete) for more information.

**Returns:** void.


Examples
--------------------------

### Store last visit as a signed cookie

```js
import { serve, Response } from 'https://deno.land/std/http/server.ts';
import { CookieJar } from 'https://deno.land/x/cookies/mod.ts';

const server = serve({ port: 3000 });
console.log('Server listening on port 3000');

for await (const req of server) {
  const res: Response = {
    status: 404,
    headers: new Headers([
      ['Content-Type', 'text/plain'],
    ]),
  };
  const cookies = new CookieJar(req, res, {
    keys: ['secret', 'keys'],
    secure: true,
  });

  // Get a cookie (sign it to protect against spoofing)
  const lastVisit = cookies.get('LastVisit', { signed: true });
  if (!lastVisit) {
    res.body = 'Welcome first time user!';
    // Set the cookie to a value
    cookies.set('LastVisit', Date.now(), { signed: true });
  } else {
    const timestamp = new Date(lastVisit).toISOString();
    res.body = `Welcome back! Nothing much changed since your last visit at ${timestamp}.`;
  }

  req.respond(res);
}
```


Testing
--------------------------

```sh
$ deno test
```

References
--------------------------

- [RFC 6265: HTTP State Management Mechanism][rfc-6265]

[rfc-6265]: https://tools.ietf.org/html/rfc6265

License
--------------------------

[MIT](./LICENSE)
