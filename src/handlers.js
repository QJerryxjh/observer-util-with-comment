import { observable } from './observable'
import { proxyToRaw, rawToProxy } from './internals'
import {
  registerRunningReactionForOperation,
  queueReactionsForOperation,
  hasRunningReaction
} from './reactionRunner'

const hasOwnProperty = Object.prototype.hasOwnProperty
const wellKnownSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => Symbol[key])
    .filter(value => typeof value === 'symbol')
)

// intercept get operations on observables to know which reaction uses their properties
/**
 * 为target拦截get操作,以便于了解哪个reactions使用他们的属性
 * @param {*} target 目标对象
 * @param {*} key 操作属性
 * @param {*} receiver this
 * @returns 
 */
function get(target, key, receiver) {
  const result = Reflect.get(target, key, receiver)
  // do not register (observable.prop -> reaction) pairs for well known symbols
  // these symbols are frequently retrieved in low level JavaScript under the hood
  // 对已知的symbols不注册可观察对象属性的reaction
  // 这些属性在js底层经常使用
  if (typeof key === 'symbol' && wellKnownSymbols.has(key)) {
    return result
  }
  // register and save (observable.prop -> runningReaction)
  // 为目标对象key属性注册reaction
  registerRunningReactionForOperation({ target, key, receiver, type: 'get' })
  // if we are inside a reaction and observable.prop is an object wrap it in an observable too
  // this is needed to intercept property access on that object too (dynamic observable tree)
  // 获取对应可观察对象
  const observableResult = rawToProxy.get(result)
  if (hasRunningReaction() && typeof result === 'object' && result !== null) {
    if (observableResult) {
      return observableResult
    }
    // do not violate the none-configurable none-writable prop get handler invariant
    // fall back to none reactive mode in this case, instead of letting the Proxy throw a TypeError
    // 没有创建可观察
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
    if (
      !descriptor ||
      !(descriptor.writable === false && descriptor.configurable === false)
    ) {
      // 如果没有该属性或者该属性不是不可配置的,则将该属性值创建可观察并返回,达到深度创建可观察目的
      return observable(result)
    }
  }
  // otherwise return the observable wrapper if it is already created and cached or the raw object
  return observableResult || result
}

function has(target, key) {
  const result = Reflect.has(target, key)
  // register and save (observable.prop -> runningReaction)
  // 注册reaction
  registerRunningReactionForOperation({ target, key, type: 'has' })
  return result
}

function ownKeys(target) {
  // 注册reaction
  registerRunningReactionForOperation({ target, type: 'iterate' })
  return Reflect.ownKeys(target)
}

// intercept set operations on observables to know when to trigger reactions
/**
 * 设值操作
 * @param {*} target 目标对象
 * @param {*} key 操作的key
 * @param {*} value 设置的值
 * @param {*} receiver 调用发起方
 * @returns 
 */
function set(target, key, value, receiver) {
  // make sure to do not pollute the raw object with observables
  if (typeof value === 'object' && value !== null) {
    // 如果value是观察对象,置为原始对象
    value = proxyToRaw.get(value) || value
  }
  // save if the object had a descriptor for this key
  // 目标对象上是否已经有此键
  const hadKey = hasOwnProperty.call(target, key)
  // save if the value changed because of this set operation
  const oldValue = target[key]
  // execute the set operation before running any reaction
  const result = Reflect.set(target, key, value, receiver)
  // do not queue reactions if the target of the operation is not the raw receiver
  // (possible because of prototypal inheritance)
  // target不是原始receiver,则不排队触发reactions
  // 可能是由于原型继承
  if (target !== proxyToRaw.get(receiver)) {
    console.log('截取到target不是receiver的原始值');
    return result
  }
  // queue a reaction if it's a new property or its value changed
  if (!hadKey) {
    // 之前没有该键值,则是创建,排队运行reactions
    queueReactionsForOperation({ target, key, value, receiver, type: 'add' })
  } else if (value !== oldValue) {
    // 是更新update,此时新旧值不相等,则排队运行reactions
    queueReactionsForOperation({
      target,
      key,
      value,
      oldValue,
      receiver,
      type: 'set'
    })
  }
  return result
}

function deleteProperty(target, key) {
  // save if the object had the key
  const hadKey = hasOwnProperty.call(target, key)
  const oldValue = target[key]
  // execute the delete operation before running any reaction
  const result = Reflect.deleteProperty(target, key)
  // only queue reactions for delete operations which resulted in an actual change
  if (hadKey) {
    // 如果之前有值,则排队触发reactions
    queueReactionsForOperation({ target, key, oldValue, type: 'delete' })
  }
  return result
}

export default { get, has, ownKeys, set, deleteProperty }
