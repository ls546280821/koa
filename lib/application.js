
'use strict';

/**
 * Module dependencies.
 */

const isGeneratorFunction = require('is-generator-function');
const debug = require('debug')('koa:application');
const onFinished = require('on-finished');
const response = require('./response');
const compose = require('koa-compose');
const isJSON = require('koa-is-json');
const context = require('./context');
const request = require('./request');
const statuses = require('statuses');
const Emitter = require('events');
const util = require('util');
const Stream = require('stream');
const http = require('http');
const only = require('only');
const convert = require('koa-convert');
const deprecate = require('depd')('koa');

/**
 * Expose `Application` class.
 * Inherits from `Emitter.prototype`.
 */

module.exports = class Application extends Emitter {
  /**
   * Initialize a new `Application`.
   *
   * @api public
   */

  constructor() {
    super();

    this.proxy = false; // 是否可信代理头部
    this.middleware = []; // 中间件列表
    this.subdomainOffset = 2; // 子域偏移量
    this.env = process.env.NODE_ENV || 'development'; // 环境变量
    this.context = Object.create(context); // 内容主体
    this.request = Object.create(request); // 请求主体
    this.response = Object.create(response); // 响应主体
    // 自定义查询对象函数 http://nodejs.cn/api/util.html#util_custom_inspection_functions_on_objects
    if (util.inspect.custom) {
      this[util.inspect.custom] = this.inspect;
    }
  }

  /**
   * Shorthand for:
   *
   *    http.createServer(app.callback()).listen(...)
   *
   * @param {Mixed} ...
   * @return {Server}
   * @api public
   */

  // 初始化
  listen(...args) {
    debug('listen');
    // 创建新的http server http://nodejs.cn/api/http.html#http_http_createserver_options_requestlistener
    const server = http.createServer(this.callback());
    // 启动 HTTP 服务器监听连接
    // 这里将参数直接透传，所以参数可以参考：http://nodejs.cn/api/net.html#net_server_listen
    return server.listen(...args);
  }

  /**
   * Return JSON representation.
   * We only bother showing settings.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    // 返回实例属性的json格式
    // only：拷贝一个对象并返回指定的字段
    // https://github.com/tj/node-only/blob/master/index.js
    return only(this, [
      'subdomainOffset',
      'proxy',
      'env'
    ]);
  }

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  // 查询函数
  inspect() {
    return this.toJSON();
  }

  /**
   * Use the given middleware `fn`.
   *
   * Old-style middleware will be converted.
   *
   * @param {Function} fn
   * @return {Application} self
   * @api public
   */

  // 添加中间件
  use(fn) {
    // 判断中间件必须为函数
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!');
    // 判断是否为Generator函数
    if (isGeneratorFunction(fn)) {
      deprecate('Support for generators will be removed in v3. ' +
                'See the documentation for examples of how to convert old middleware ' +
                'https://github.com/koajs/koa/blob/master/docs/migration.md');
      // 使用koa-convert库将Generator函数外层包裹promise内部使用co进行遍历
      fn = convert(fn);
    }
    debug('use %s', fn._name || fn.name || '-');
    this.middleware.push(fn);
    // 方便链式调用
    return this;
  }

  /**
   * Return a request handler callback
   * for node's native http server.
   *
   * @return {Function}
   * @api public
   */

  // http server的回调
  callback() {
    // 调用koa-compose库对中间件队列进行遍历并返回promise对象
    // 详情看koa-compose文件
    const fn = compose(this.middleware);

    // 返回监听error事件的监听数
    // http://nodejs.cn/api/events.html#events_emitter_listenercount_eventname
    // 如果没有监听error事件则添加error事件监听器
    // http://nodejs.cn/api/events.html#events_emitter_on_eventname_listener
    if (!this.listenerCount('error')) this.on('error', this.onerror);

    // http server回调方法
    const handleRequest = (req, res) => {
      // 创建ctx
      const ctx = this.createContext(req, res);
      // 开始执行中间件
      return this.handleRequest(ctx, fn);
    };

    return handleRequest;
  }

  /**
   * Handle request in callback.
   *
   * @api private
   */

  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res;
    res.statusCode = 404; // 默认将状态码设为404
    const onerror = err => ctx.onerror(err); // 错误处理
    const handleResponse = () => respond(ctx); // 响应函数
    onFinished(res, onerror);
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
  }

  /**
   * Initialize a new context.
   *
   * @api private
   */

  // ctx创建函数
  createContext(req, res) {
    const context = Object.create(this.context);
    const request = context.request = Object.create(this.request);
    const response = context.response = Object.create(this.response);
    context.app = request.app = response.app = this;
    context.req = request.req = response.req = req;
    context.res = request.res = response.res = res;
    request.ctx = response.ctx = context;
    request.response = response;
    response.request = request;
    context.originalUrl = request.originalUrl = req.url;
    context.state = {};
    return context;
  }

  /**
   * Default error handler.
   *
   * @param {Error} err
   * @api private
   */

  // 错误处理，error事件监听器
  onerror(err) {
    // err必须为Error类
    if (!(err instanceof Error)) throw new TypeError(util.format('non-error thrown: %j', err));

    if (404 == err.status || err.expose) return;
    if (this.silent) return;

    const msg = err.stack || err.toString();
    console.error();
    console.error(msg.replace(/^/gm, '  '));
    console.error();
  }
};

/**
 * Response helper.
 */
// 响应函数
function respond(ctx) {
  // allow bypassing koa
  if (false === ctx.respond) return;

  if (!ctx.writable) return;

  const res = ctx.res;
  let body = ctx.body;
  const code = ctx.status;

  // ignore body
  // 指定状态码会忽略body 204 205 304
  if (statuses.empty[code]) {
    // strip headers
    ctx.body = null;
    return res.end();
  }

  if ('HEAD' == ctx.method) {
    if (!res.headersSent && isJSON(body)) {
      ctx.length = Buffer.byteLength(JSON.stringify(body));
    }
    return res.end();
  }

  // status body
  if (null == body) {
    if (ctx.req.httpVersionMajor >= 2) {
      // http2.0 body 置为状态码
      body = String(code);
    } else {
      // http1.x body
      body = ctx.message || String(code);
    }
    if (!res.headersSent) {
      ctx.type = 'text';
      ctx.length = Buffer.byteLength(body);
    }
    return res.end(body);
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body);
  if ('string' == typeof body) return res.end(body);
  if (body instanceof Stream) return body.pipe(res);

  // body: json
  body = JSON.stringify(body);
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body);
  }
  res.end(body);
}
