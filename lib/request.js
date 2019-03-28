
'use strict';

/**
 * Module dependencies.
 */

const URL = require('url').URL;
const net = require('net');
const accepts = require('accepts');
const contentType = require('content-type');
const stringify = require('url').format;
const parse = require('parseurl');
const qs = require('querystring');
const typeis = require('type-is');
const fresh = require('fresh');
const only = require('only');
const util = require('util');

const IP = Symbol('context#ip');

/**
 * Prototype.
 */
// 请求头
module.exports = {

  /**
   * Return request header.
   *
   * @return {Object}
   * @api public
   */

  get header() {
    // 获取请求头
    return this.req.headers;
  },

  /**
   * Set request header.
   *
   * @api public
   */

  set header(val) {
    // 设置请求头
    this.req.headers = val;
  },

  /**
   * Return request header, alias as request.header
   *
   * @return {Object}
   * @api public
   */

  get headers() {
    // 获取请求头
    return this.req.headers;
  },

  /**
   * Set request header, alias as request.header
   *
   * @api public
   */

  set headers(val) {
    // 设置请求头
    this.req.headers = val;
  },

  /**
   * Get request URL.
   *
   * @return {String}
   * @api public
   */

  get url() {
    // 获取请求路径（不包括路径）
    return this.req.url;
  },

  /**
   * Set request URL.
   *
   * @api public
   */

  set url(val) {
    // 设置请求路径
    this.req.url = val;
  },

  /**
   * Get origin of URL.
   *
   * @return {String}
   * @api public
   */

  get origin() {
    // 获取请求源，协议+域名
    return `${this.protocol}://${this.host}`;
  },

  /**
   * Get full request URL.
   *
   * @return {String}
   * @api public
   */

  get href() {
    // 返回完整请求路径
    // support: `GET http://example.com/foo`
    // 如果http:// 和 https:// 协议开头则返回originalUrl(即request.url)
    // 否则返回请求源与请求路径拼接
    // originalUrl 为 request.url
    if (/^https?:\/\//i.test(this.originalUrl)) return this.originalUrl;
    return this.origin + this.originalUrl;
  },

  /**
   * Get request method.
   *
   * @return {String}
   * @api public
   */

  get method() {
    // 获取请求方法
    return this.req.method;
  },

  /**
   * Set request method.
   *
   * @param {String} val
   * @api public
   */

  set method(val) {
    // 设置请求方法
    this.req.method = val;
  },

  /**
   * Get request pathname.
   *
   * @return {String}
   * @api public
   */

  get path() {
    // 获取请求的path路径
    return parse(this.req).pathname;
  },

  /**
   * Set pathname, retaining the query-string when present.
   *
   * @param {String} path
   * @api public
   */

  set path(path) {
    // 设置请求的path路径
    const url = parse(this.req);
    if (url.pathname === path) return;

    url.pathname = path;
    url.path = null;
    // 重置url
    this.url = stringify(url);
  },

  /**
   * Get parsed query-string.
   *
   * @return {Object}
   * @api public
   */

  get query() {
    const str = this.querystring;
    const c = this._querycache = this._querycache || {};
    // 这里对queryString做了一个缓存，优先从_querycache缓存取
    // 如果没有的话则新建一个缓存字段
    // http://nodejs.cn/api/querystring.html#querystring_querystring_parse_str_sep_eq_options
    return c[str] || (c[str] = qs.parse(str));
  },

  /**
   * Set query-string as an object.
   *
   * @param {Object} obj
   * @api public
   */

  set query(obj) {
    // 设置queryString
    // http://nodejs.cn/api/querystring.html#querystring_querystring_stringify_obj_sep_eq_options
    this.querystring = qs.stringify(obj);
  },

  /**
   * Get query string.
   *
   * @return {String}
   * @api public
   */

  get querystring() {
    if (!this.req) return '';
    // 返回url queryString
    return parse(this.req).query || '';
  },

  /**
   * Set querystring.
   *
   * @param {String} str
   * @api public
   */

  set querystring(str) {
    // 设置queryString与set query相同只是参数类型不同而已
    const url = parse(this.req);
    if (url.search === `?${str}`) return;

    url.search = str;
    url.path = null;
    // 重置url
    this.url = stringify(url);
  },

  /**
   * Get the search string. Same as the querystring
   * except it includes the leading ?.
   *
   * @return {String}
   * @api public
   */

  get search() {
    // 获取 ? + queryString
    if (!this.querystring) return '';
    return `?${this.querystring}`;
  },

  /**
   * Set the search string. Same as
   * request.querystring= but included for ubiquity.
   *
   * @param {String} str
   * @api public
   */

  set search(str) {
    // 设置queryString同上set queryString
    this.querystring = str;
  },

  /**
   * Parse the "Host" header field host
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   *
   * @return {String} hostname:port
   * @api public
   */

  get host() {
    // 获取host
    const proxy = this.app.proxy;
    // 如果设置了可信代理请求头则取header中的X-Forwarded-Host
    let host = proxy && this.get('X-Forwarded-Host');
    if (!host) {
      // 如果为http2则host为header的:authority
      if (this.req.httpVersionMajor >= 2) host = this.get(':authority');
      // 如果为http1.x则取header的Host
      if (!host) host = this.get('Host');
    }
    if (!host) return '';
    return host.split(/\s*,\s*/, 1)[0];
  },

  /**
   * Parse the "Host" header field hostname
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   *
   * @return {String} hostname
   * @api public
   */

  get hostname() {
    // 通过request的headers.host获取hostname
    const host = this.host;
    if (!host) return '';
    if ('[' == host[0]) return this.URL.hostname || ''; // IPv6
    return host.split(':', 1)[0];
  },

  /**
   * Get WHATWG parsed URL.
   * Lazily memoized.
   *
   * @return {URL|Object}
   * @api public
   */

  get URL() {
    // 返回一个URL对象并缓存该对象
    /* istanbul ignore else */
    if (!this.memoizedURL) {
      const protocol = this.protocol;
      const host = this.host;
      const originalUrl = this.originalUrl || ''; // avoid undefined in template string
      try {
        this.memoizedURL = new URL(`${protocol}://${host}${originalUrl}`);
      } catch (err) {
        this.memoizedURL = Object.create(null);
      }
    }
    return this.memoizedURL;
  },

  /**
   * Check if the request is fresh, aka
   * Last-Modified and/or the ETag
   * still match.
   *
   * @return {Boolean}
   * @api public
   */

  get fresh() {
    // 判断当前请求的数据是否发生变化（通过ETag和Last-Modified判断）
    // true为发生了变化，false为未发生变化
    const method = this.method;
    const s = this.ctx.status;

    // GET or HEAD for weak freshness validation only
    if ('GET' != method && 'HEAD' != method) return false;

    // 2xx or 304 as per rfc2616 14.26
    if ((s >= 200 && s < 300) || 304 == s) {
      return fresh(this.header, this.response.header);
    }

    return false;
  },

  /**
   * Check if the request is stale, aka
   * "Last-Modified" and / or the "ETag" for the
   * resource has changed.
   *
   * @return {Boolean}
   * @api public
   */

  get stale() {
    // 请求的数据是否变化
    // true为未发生变化，false为发生了变化
    return !this.fresh;
  },

  /**
   * Check if the request is idempotent.
   *
   * @return {Boolean}
   * @api public
   */

  get idempotent() {
    // 判断是否为幂等请求方法
    // 幂等请求是指无论调用多少次都不会出现不同结果的HTTP方法
    const methods = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'];
    return !!~methods.indexOf(this.method);
  },

  /**
   * Return the request socket.
   *
   * @return {Connection}
   * @api public
   */

  get socket() {
    // 获取request的Socket对象
    // http://nodejs.cn/api/net.html#net_class_net_socket
    return this.req.socket;
  },

  /**
   * Get the charset when present or undefined.
   *
   * @return {String}
   * @api public
   */

  get charset() {
    // 获取请求头的字符集
    try {
      const { parameters } = contentType.parse(this.req);
      return parameters.charset || '';
    } catch (e) {
      return '';
    }
  },

  /**
   * Return parsed Content-Length when present.
   *
   * @return {Number}
   * @api public
   */

  get length() {
    // 返回请求头Content-Length
    const len = this.get('Content-Length');
    if (len == '') return;
    return ~~len;
  },

  /**
   * Return the protocol string "http" or "https"
   * when requested with TLS. When the proxy setting
   * is enabled the "X-Forwarded-Proto" header
   * field will be trusted. If you're running behind
   * a reverse proxy that supplies https for you this
   * may be enabled.
   *
   * @return {String}
   * @api public
   */

  get protocol() {
    // 如果socket存在encrypted字段则认为是https协议
    if (this.socket.encrypted) return 'https';
    // 如果没有相信代理请求头则认为是http协议
    if (!this.app.proxy) return 'http';
    // 从request header中获取X-Forwarded-Proto字段判断
    const proto = this.get('X-Forwarded-Proto');
    return proto ? proto.split(/\s*,\s*/, 1)[0] : 'http';
  },

  /**
   * Short-hand for:
   *
   *    this.protocol == 'https'
   *
   * @return {Boolean}
   * @api public
   */

  get secure() {
    // 默认https协议为安全状态
    return 'https' == this.protocol;
  },

  /**
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list.
   *
   * For example if the value were "client, proxy1, proxy2"
   * you would receive the array `["client", "proxy1", "proxy2"]`
   * where "proxy2" is the furthest down-stream.
   *
   * @return {Array}
   * @api public
   */

  get ips() {
    // 返回代理服务器的ip地址（数组）
    // 如果没有设置可信代理则返回空数组
    const proxy = this.app.proxy;
    const val = this.get('X-Forwarded-For');
    return proxy && val
      ? val.split(/\s*,\s*/)
      : [];
  },

  /**
   * Return request's remote address
   * When `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list and return the first one
   *
   * @return {String}
   * @api public
   */

  get ip() {
    // 返回客户端设备IP，优先从X-Forwarded-For中取，如果没有则从socket中取并缓存
    // socket.remoteAddress为来自 TCP 连接，表示与服务端建立 TCP 连接的设备 IP
    if (!this[IP]) {
      this[IP] = this.ips[0] || this.socket.remoteAddress || '';
    }
    return this[IP];
  },

  set ip(_ip) {
    // 重置客户端设备IP
    this[IP] = _ip;
  },

  /**
   * Return subdomains as an array.
   *
   * Subdomains are the dot-separated parts of the host before the main domain
   * of the app. By default, the domain of the app is assumed to be the last two
   * parts of the host. This can be changed by setting `app.subdomainOffset`.
   *
   * For example, if the domain is "tobi.ferrets.example.com":
   * If `app.subdomainOffset` is not set, this.subdomains is
   * `["ferrets", "tobi"]`.
   * If `app.subdomainOffset` is 3, this.subdomains is `["tobi"]`.
   *
   * @return {Array}
   * @api public
   */

  get subdomains() {
    // 返回子域名数组
    const offset = this.app.subdomainOffset; // 子域名偏移量
    const hostname = this.hostname; // 域名
    if (net.isIP(hostname)) return []; // 如果为ip则返回空数组
    return hostname
      .split('.')
      .reverse()
      .slice(offset);
  },

  /**
   * Get accept object.
   * Lazily memoized.
   *
   * @return {Object}
   * @api private
   */
  get accept() {
    // 获取Accept对象（包含请求头以及negotiator（包含request））并缓存该对象
    return this._accept || (this._accept = accepts(this.req));
  },

  /**
   * Set accept object.
   *
   * @param {Object}
   * @api private
   */
  set accept(obj) {
    // 重置_accept对象
    return this._accept = obj;
  },

  /**
   * Check if the given `type(s)` is acceptable, returning
   * the best match when true, otherwise `false`, in which
   * case you should respond with 406 "Not Acceptable".
   *
   * The `type` value may be a single mime type string
   * such as "application/json", the extension name
   * such as "json" or an array `["json", "html", "text/plain"]`. When a list
   * or array is given the _best_ match, if any is returned.
   *
   * Examples:
   *
   *     // Accept: text/html
   *     this.accepts('html');
   *     // => "html"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('html');
   *     // => "html"
   *     this.accepts('text/html');
   *     // => "text/html"
   *     this.accepts('json', 'text');
   *     // => "json"
   *     this.accepts('application/json');
   *     // => "application/json"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('image/png');
   *     this.accepts('png');
   *     // => false
   *
   *     // Accept: text/*;q=.5, application/json
   *     this.accepts(['html', 'json']);
   *     this.accepts('html', 'json');
   *     // => "json"
   *
   * @param {String|Array} type(s)...
   * @return {String|Array|false}
   * @api public
   */

  accepts(...args) {
    // 判断请求头的Accept支持的content-Type
    return this.accept.types(...args);
  },

  /**
   * Return accepted encodings or best fit based on `encodings`.
   *
   * Given `Accept-Encoding: gzip, deflate`
   * an array sorted by quality is returned:
   *
   *     ['gzip', 'deflate']
   *
   * @param {String|Array} encoding(s)...
   * @return {String|Array}
   * @api public
   */

  acceptsEncodings(...args) {
    // 判断请求头的Accept是否支持指定压缩方式
    return this.accept.encodings(...args);
  },

  /**
   * Return accepted charsets or best fit based on `charsets`.
   *
   * Given `Accept-Charset: utf-8, iso-8859-1;q=0.2, utf-7;q=0.5`
   * an array sorted by quality is returned:
   *
   *     ['utf-8', 'utf-7', 'iso-8859-1']
   *
   * @param {String|Array} charset(s)...
   * @return {String|Array}
   * @api public
   */

  acceptsCharsets(...args) {
    // 判断请求头的Accept是否支持指定字符集
    return this.accept.charsets(...args);
  },

  /**
   * Return accepted languages or best fit based on `langs`.
   *
   * Given `Accept-Language: en;q=0.8, es, pt`
   * an array sorted by quality is returned:
   *
   *     ['es', 'pt', 'en']
   *
   * @param {String|Array} lang(s)...
   * @return {Array|String}
   * @api public
   */

  acceptsLanguages(...args) {
    return this.accept.languages(...args);
  },

  /**
   * Check if the incoming request contains the "Content-Type"
   * header field, and it contains any of the give mime `type`s.
   * If there is no request body, `null` is returned.
   * If there is no content type, `false` is returned.
   * Otherwise, it returns the first `type` that matches.
   *
   * Examples:
   *
   *     // With Content-Type: text/html; charset=utf-8
   *     this.is('html'); // => 'html'
   *     this.is('text/html'); // => 'text/html'
   *     this.is('text/*', 'application/json'); // => 'text/html'
   *
   *     // When Content-Type is application/json
   *     this.is('json', 'urlencoded'); // => 'json'
   *     this.is('application/json'); // => 'application/json'
   *     this.is('html', 'application/*'); // => 'application/json'
   *
   *     this.is('html'); // => false
   *
   * @param {String|Array} types...
   * @return {String|false|null}
   * @api public
   */

  is(types) {
    // 判断请求头中的content-type是否包含了指定的type
    if (!types) return typeis(this.req);
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(this.req, types);
  },

  /**
   * Return the request mime type void of
   * parameters such as "charset".
   *
   * @return {String}
   * @api public
   */

  get type() {
    // 获取请求头的Content-Type
    const type = this.get('Content-Type');
    if (!type) return '';
    return type.split(';')[0];
  },

  /**
   * Return request header.
   *
   * The `Referrer` header field is special-cased,
   * both `Referrer` and `Referer` are interchangeable.
   *
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   *     this.get('Something');
   *     // => ''
   *
   * @param {String} field
   * @return {String}
   * @api public
   */

  get(field) {
    // 获取请求头的指定字段
    const req = this.req;
    switch (field = field.toLowerCase()) {
      case 'referer':
      case 'referrer':
        return req.headers.referrer || req.headers.referer || '';
      default:
        return req.headers[field] || '';
    }
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    // 查询函数
    if (!this.req) return;
    return this.toJSON();
  },

  /**
   * Return JSON representation.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    // 返回request JSON表达形式
    return only(this, [
      'method',
      'url',
      'header'
    ]);
  }
};

/**
 * Custom inspection implementation for newer Node.js versions.
 *
 * @return {Object}
 * @api public
 */

/* istanbul ignore else */
if (util.inspect.custom) {
  module.exports[util.inspect.custom] = module.exports.inspect;
}
