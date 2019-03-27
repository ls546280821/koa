'use strict'

/**
 * Expose compositor.
 */

module.exports = compose

/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * @param {Array} middleware
 * @return {Function}
 * @api public
 */

function compose (middleware) {
  // 中间件队列必须是一个数组
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')
  // 遍历每一个中间件必须为函数
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
  }

  /**
   * @param {Object} context
   * @return {Promise}
   * @api public
   */

  return function (context, next) {
    // last called middleware #
    let index = -1 // 当前执行索引
    return dispatch(0)
    function dispatch (i) {
      // 容错处理，当传入索引小于执行索引时异常
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      index = i
      let fn = middleware[i]
      // 中间件执行完后，执行传入的next方法
      if (i === middleware.length) fn = next
      // 容错处理
      if (!fn) return Promise.resolve()
      try {
        // 洋葱模型的原因，中间件的next都是下一个中间件外层包了promise
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)))
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}
