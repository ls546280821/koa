
'use strict';

/**
 * Module dependencies.
 */

const contentDisposition = require('content-disposition');
const ensureErrorHandler = require('error-inject');
const getType = require('cache-content-type');
const onFinish = require('on-finished');
const isJSON = require('koa-is-json');
const escape = require('escape-html');
const typeis = require('type-is').is;
const statuses = require('statuses');
const destroy = require('destroy');
const assert = require('assert');
const extname = require('path').extname;
const vary = require('vary');
const only = require('only');
const util = require('util');

/**
 * Prototype.
 */
// 响应头队形
module.exports = {

  /**
   * Return the request socket.
   *
   * @return {Connection}
   * @api public
   */

  get socket() {
    // 返回响应头socket对象
    return this.res.socket;
  },

  /**
   * Return response header.
   *
   * @return {Object}
   * @api public
   */

  get header() {
    // 返回响应头
    // 如果存在getHeaders方法则通过getHeaders获取响应头
    const { res } = this;
    return typeof res.getHeaders === 'function'
      ? res.getHeaders()
      : res._headers || {};  // Node < 7.7
  },

  /**
   * Return response header, alias as response.header
   *
   * @return {Object}
   * @api public
   */

  get headers() {
    // 返回响应头，同get header
    return this.header;
  },

  /**
   * Get response status code.
   *
   * @return {Number}
   * @api public
   */

  get status() {
    // 返回响应状态码
    return this.res.statusCode;
  },

  /**
   * Set response status code.
   *
   * @param {Number} code
   * @api public
   */

  set status(code) {
    // 设置响应状态码
    if (this.headerSent) return;

    // 状态码必须为一个数字
    assert(Number.isInteger(code), 'status code must be a number');
    // 状态码必须为100-900之间
    assert(code >= 100 && code <= 999, `invalid status code: ${code}`);
    // 这里将做一个标识为证明已经设置过状态码
    this._explicitStatus = true;
    // 设置响应状态码
    this.res.statusCode = code;
    // 如果http1.x则添加状态信息（statuses中的codes.json）
    if (this.req.httpVersionMajor < 2) this.res.statusMessage = statuses[code];
    // 如果存在body而且响应状态码为empty codes则将body置空（204 205 304）
    if (this.body && statuses.empty[code]) this.body = null;
  },

  /**
   * Get response status message
   *
   * @return {String}
   * @api public
   */

  get message() {
    // 获取响应状态信息
    return this.res.statusMessage || statuses[this.status];
  },

  /**
   * Set response status message
   *
   * @param {String} msg
   * @api public
   */

  set message(msg) {
    // 设置响应状态信息
    this.res.statusMessage = msg;
  },

  /**
   * Get response body.
   *
   * @return {Mixed}
   * @api public
   */

  get body() {
    // 返回响应body
    return this._body;
  },

  /**
   * Set response body.
   *
   * @param {String|Buffer|Object|Stream} val
   * @api public
   */

  set body(val) {
    // 设置响应body
    const original = this._body; // 获取上一次body
    this._body = val; // 缓存本次body

    // no content
    if (null == val) {
      // 如果body 为空且当前状态码不为empty code则重置状态码为204
      if (!statuses.empty[this.status]) this.status = 204;
      // 移除与body相关的请求头
      this.remove('Content-Type');
      this.remove('Content-Length');
      this.remove('Transfer-Encoding');
      return;
    }

    // set the status
    // 如果没有设置过状态码则将状态码改为默认200
    if (!this._explicitStatus) this.status = 200;

    // set the content-type only if not yet set
    // 判断是否设置过content-type
    const setType = !this.header['content-type'];

    // string
    if ('string' == typeof val) {
      // 判断如果body为字符串
      // 如果已经设置了content-type则判断字符串是否由<开头，true则认为是html，false为text文本
      if (setType) this.type = /^\s*</.test(val) ? 'html' : 'text';
      // 设置body的长度（此处的长度不是字符的长度，而是字节长度）
      this.length = Buffer.byteLength(val);
      return;
    }

    // buffer
    if (Buffer.isBuffer(val)) {
      // 判断body是否为Buffer类型
      // 如果已经设置了content-type则重置type bin
      if (setType) this.type = 'bin';
      // body长度直接为buffer长度
      this.length = val.length;
      return;
    }

    // stream
    if ('function' == typeof val.pipe) {
      onFinish(this.res, destroy.bind(null, val));
      ensureErrorHandler(val, err => this.ctx.onerror(err));

      // overwriting
      if (null != original && original != val) this.remove('Content-Length');

      if (setType) this.type = 'bin';
      return;
    }

    // json
    // 到这一步的时候认为body是一个json
    this.remove('Content-Length');
    this.type = 'json';
  },

  /**
   * Set Content-Length field to `n`.
   *
   * @param {Number} n
   * @api public
   */

  set length(n) {
    // 设置content-length
    this.set('Content-Length', n);
  },

  /**
   * Return parsed response Content-Length when present.
   *
   * @return {Number}
   * @api public
   */

  get length() {
    // 获取content-length
    // 这里判断如果已经有了content-length则直接返回，没有的话则通过body判断
    const len = this.header['content-length'];
    const body = this.body;

    if (null == len) {
      // 如果长度为空、body为空则跳过
      if (!body) return;
      if ('string' == typeof body) return Buffer.byteLength(body);
      if (Buffer.isBuffer(body)) return body.length;
      if (isJSON(body)) return Buffer.byteLength(JSON.stringify(body));
      return;
    }

    // 返回长度的整数部分
    return Math.trunc(len) || 0;
  },

  /**
   * Check if a header has been written to the socket.
   *
   * @return {Boolean}
   * @api public
   */

  get headerSent() {
    // 返回响应头是否设置了socket
    return this.res.headersSent;
  },

  /**
   * Vary on `field`.
   *
   * @param {String} field
   * @api public
   */

  vary(field) {
    // 设置请求头的vary字段用于缓存请求
    // https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Vary
    if (this.headerSent) return;

    vary(this.res, field);
  },

  /**
   * Perform a 302 redirect to `url`.
   *
   * The string "back" is special-cased
   * to provide Referrer support, when Referrer
   * is not present `alt` or "/" is used.
   *
   * Examples:
   *
   *    this.redirect('back');
   *    this.redirect('back', '/index.html');
   *    this.redirect('/login');
   *    this.redirect('http://google.com');
   *
   * @param {String} url
   * @param {String} [alt]
   * @api public
   */

  redirect(url, alt) {
    // 重定向
    // location
    // 这里将back作为一个保留关键词，此时会从header中Referrer、alt（传参）、/（根路径）取
    if ('back' == url) url = this.ctx.get('Referrer') || alt || '/';
    // 设置响应头Location 为url
    // https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Location
    this.set('Location', url);

    // status
    // 如果不是重定向的状态码则默认改为302状态码
    if (!statuses.redirect[this.status]) this.status = 302;

    // html
    if (this.ctx.accepts('html')) {
      // 如果是html将url中的字符串进行转义
      url = escape(url);
      // 将content-type重置为html（用户响应为html）
      this.type = 'text/html; charset=utf-8';
      // 重置响应body
      this.body = `Redirecting to <a href="${url}">${url}</a>.`;
      return;
    }

    // text
    // 将content-type重置为text（用户响应为text）
    this.type = 'text/plain; charset=utf-8';
    // 重置响应body
    this.body = `Redirecting to ${url}.`;
  },

  /**
   * Set Content-Disposition header to "attachment" with optional `filename`.
   *
   * @param {String} filename
   * @api public
   */

  attachment(filename, options) {
    // 设置响应头Content-Disposition
    // https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Content-Disposition
    // 获取文件的扩展类型
    // http://nodejs.cn/api/path.html#path_path_extname_path
    if (filename) this.type = extname(filename);
    this.set('Content-Disposition', contentDisposition(filename, options));
  },

  /**
   * Set Content-Type response header with `type` through `mime.lookup()`
   * when it does not contain a charset.
   *
   * Examples:
   *
   *     this.type = '.html';
   *     this.type = 'html';
   *     this.type = 'json';
   *     this.type = 'application/json';
   *     this.type = 'png';
   *
   * @param {String} type
   * @api public
   */

  set type(type) {
    // 设置content-type
    // 这里做了一个LRU的缓存，优先从LRU中取，如有有直接返回，没有的话返回一个新的+缓存
    // getType内部缓存了一大堆的content-type类型
    // 此时type为可识别的content-type
    type = getType(type);
    // 如果type正确则设置，不存在则清空content-type
    if (type) {
      this.set('Content-Type', type);
    } else {
      this.remove('Content-Type');
    }
  },

  /**
   * Return the response mime type void of
   * parameters such as "charset".
   *
   * @return {String}
   * @api public
   */

  get type() {
    // 返回content-type，如果没有则返回''，存在的话返回第一个content-type
    const type = this.get('Content-Type');
    if (!type) return '';
    return type.split(';', 1)[0];
  },


  /**
   * Set the Last-Modified date using a string or a Date.
   *
   *     this.response.lastModified = new Date();
   *     this.response.lastModified = '2013-09-13';
   *
   * @param {String|Date} type
   * @api public
   */

  set lastModified(val) {
    // 重置Last-Modified的时间
    if ('string' == typeof val) val = new Date(val);
    this.set('Last-Modified', val.toUTCString());
  },

  /**
   * Get the Last-Modified date in Date form, if it exists.
   *
   * @return {Date}
   * @api public
   */

  get lastModified() {
    // 获取Last-Modified的时间，如果不存在则返回当前时间
    const date = this.get('last-modified');
    if (date) return new Date(date);
  },

  /**
   * Set the ETag of a response.
   * This will normalize the quotes if necessary.
   *
   *     this.response.etag = 'md5hashsum';
   *     this.response.etag = '"md5hashsum"';
   *     this.response.etag = 'W/"123456789"';
   *
   * @param {String} etag
   * @api public
   */

  set etag(val) {
    // 设置etag
    // https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/ETag
    if (!/^(W\/)?"/.test(val)) val = `"${val}"`; // 非 W/" 开头，默认外层包裹""
    this.set('ETag', val);
  },

  /**
   * Get the ETag of a response.
   *
   * @return {String}
   * @api public
   */

  get etag() {
    // 返回etag
    return this.get('ETag');
  },

  /**
   * Check whether the response is one of the listed types.
   * Pretty much the same as `this.request.is()`.
   *
   * @param {String|Array} types...
   * @return {String|false}
   * @api public
   */

  is(types) {
    // 判断检查响应头的content-type是否是列出的类型之一
    // true则返回content-type，false直接返回
    const type = this.type;
    if (!types) return type || false;
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(type, types);
  },

  /**
   * Return response header.
   *
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   * @param {String} field
   * @return {String}
   * @api public
   */

  get(field) {
    // 返回请求头的指定字段
    return this.header[field.toLowerCase()] || '';
  },

  /**
   * Set header `field` to `val`, or pass
   * an object of header fields.
   *
   * Examples:
   *
   *    this.set('Foo', ['bar', 'baz']);
   *    this.set('Accept', 'application/json');
   *    this.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' });
   *
   * @param {String|Object|Array} field
   * @param {String} val
   * @api public
   */

  set(field, val) {
    // 设置指定响应头字段
    if (this.headerSent) return;

    if (2 == arguments.length) {
      // 当argument为2个的时候：则认为是key、value，将value全部置为字符串后再赋值到header
      // 这里会将val全部置为string
      if (Array.isArray(val)) val = val.map(v => typeof v === 'string' ? v : String(v));
      else if (typeof val !== 'string') val = String(val);
      this.res.setHeader(field, val);
    } else {
      // 当argument个数不为2个时，默认取第一个参数，并且认为其是一个对象，进行遍历赋值
      for (const key in field) {
        this.set(key, field[key]);
      }
    }
  },

  /**
   * Append additional header `field` with value `val`.
   *
   * Examples:
   *
   * ```
   * this.append('Link', ['<http://localhost/>', '<http://localhost:3000/>']);
   * this.append('Set-Cookie', 'foo=bar; Path=/; HttpOnly');
   * this.append('Warning', '199 Miscellaneous warning');
   * ```
   *
   * @param {String} field
   * @param {String|Array} val
   * @api public
   */

  append(field, val) {
    // 对响应头增加新的字段
    // 先从响应头头拿新的字段对应的value
    const prev = this.get(field);

    if (prev) {
      // 如果之前已经设置过了该字段，则进行拼接
      val = Array.isArray(prev)
        ? prev.concat(val)
        : [prev].concat(val);
    }

    // 设置指定响应头字段
    return this.set(field, val);
  },

  /**
   * Remove header `field`.
   *
   * @param {String} name
   * @api public
   */

  remove(field) {
    // 清除指定响应头的字段
    if (this.headerSent) return;

    this.res.removeHeader(field);
  },

  /**
   * Checks if the request is writable.
   * Tests for the existence of the socket
   * as node sometimes does not set it.
   *
   * @return {Boolean}
   * @api private
   */

  get writable() {
    // 返回是否可编辑
    // can't write any more after response finished
    if (this.res.finished) return false; // 已经响应过了则不可编辑

    const socket = this.res.socket;
    // There are already pending outgoing res, but still writable
    // https://github.com/nodejs/node/blob/v4.4.7/lib/_http_server.js#L486
    if (!socket) return true;
    return socket.writable;
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    // 查询函数
    if (!this.res) return;
    const o = this.toJSON();
    o.body = this.body;
    return o;
  },

  /**
   * Return JSON representation.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    // 返回response json表达
    return only(this, [
      'status',
      'message',
      'header'
    ]);
  },

  /**
   * Flush any set headers, and begin the body
   */
  flushHeaders() {
    this.res.flushHeaders();
  }
};

/**
 * Custom inspection implementation for newer Node.js versions.
 *
 * @return {Object}
 * @api public
 */
if (util.inspect.custom) {
  module.exports[util.inspect.custom] = module.exports.inspect;
}
