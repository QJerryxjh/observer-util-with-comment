import { proxyToRaw, rawToProxy } from './internals'
import { storeObservable } from './store'
import * as builtIns from './builtIns'
import baseHandlers from './handlers'

export function observable(obj = {}) {
  // if it is already an observable or it should not be wrapped, return it
  if (proxyToRaw.has(obj) || !builtIns.shouldInstrument(obj)) {
    // 已经是可观察的,直接返回其自身
    // 是普通内置对象,直接返回自身,比如string,number
    return obj
  }
  // if it already has a cached observable wrapper, return it
  // otherwise create a new observable
  // 如果已经有一个缓存的可观察外壳,返回他
  // 否则创建一个新的可观察对象
  return rawToProxy.get(obj) || createObservable(obj)
}

function createObservable(obj) {
  // if it is a complex built-in object or a normal object, wrap it
  // 获取对象的代理处理函数,否则使用基础的处理函数
  const handlers = builtIns.getHandlers(obj) || baseHandlers
  const observable = new Proxy(obj, handlers)
  // save these to switch between the raw object and the wrapped object with ease later
  rawToProxy.set(obj, observable)
  proxyToRaw.set(observable, obj)
  // init basic data structures to save and cleanup later (observable.prop -> reaction) connections
  // 初始化基本数据对象,方便后期存储和清理可观察对象的键值与reaction的连接
  storeObservable(obj)
  return observable
}

/**
 * 是否是可观察的对象,每次创建一个可观察之后,都会把原始对象及以他创建的可观察对象保存下来,判断是否可观察的时候,就是判断是否在此集合内部
 * @param {*} obj 目标对象
 * @returns 
 */
export function isObservable(obj) {
  return proxyToRaw.has(obj)
}

/**
 * 获取可观察对象的原始对象,如果传入不是可观察对象,则返回其自身
 * @param {*} obj 目标对象
 * @returns 
 */
export function raw(obj) {
  return proxyToRaw.get(obj) || obj
}
