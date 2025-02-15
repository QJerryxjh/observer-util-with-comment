import { observable } from '../observable'
import {
  registerRunningReactionForOperation,
  queueReactionsForOperation,
  hasRunningReaction
} from '../reactionRunner'
import { proxyToRaw, rawToProxy } from '../internals'

const hasOwnProperty = Object.prototype.hasOwnProperty

function findObservable (obj) {
  const observableObj = rawToProxy.get(obj)
  if (hasRunningReaction() && typeof obj === 'object' && obj !== null) {
    // 正在运行reaction并且obj是一个对象
    if (observableObj) {
      // 如果已经创建过可观察对象,直接返回可观察对象
      return observableObj
    }
    // 没有对应的可观察对象,则用原始对象创建可观察对象后返回该可观察对象
    return observable(obj)
  }
  // 如果当前没有在运行reaction或者obj不是对象,则返回可观察对象,如果没有观察,则返回该原始对象
  return observableObj || obj
}

/**
 * 为迭代器添加补丁增强,返回应当返回的value的对应可观察对象
 * @param {*} iterator 原始迭代器
 * @param {*} isEntries 是否是枚举键与值,使用Object.entries来进行枚举
 * @returns 返回修补后的迭代器
 */
function patchIterator (iterator, isEntries) {
  const originalNext = iterator.next
  iterator.next = () => {
    // 调用原始迭代器
    let { done, value } = originalNext.call(iterator)
    if (!done) {
      // 如果没有运行结束
      if (isEntries) {
        // 返回可观察值
        value[1] = findObservable(value[1])
      } else {
        value = findObservable(value)
      }
    }
    // 如果已经运行结束,直接返回不做修补,此时的value为undefined
    return { done, value }
  }
  return iterator
}

const instrumentations = {
  has (key) {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, key, type: 'has' })
    return proto.has.apply(target, arguments)
  },
  get (key) {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, key, type: 'get' })
    return findObservable(proto.get.apply(target, arguments))
  },
  add (key) {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    const hadKey = proto.has.call(target, key)
    // forward the operation before queueing reactions
    const result = proto.add.apply(target, arguments)
    if (!hadKey) {
      queueReactionsForOperation({ target, key, value: key, type: 'add' })
    }
    return result
  },
  set (key, value) {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    const hadKey = proto.has.call(target, key)
    const oldValue = proto.get.call(target, key)
    // forward the operation before queueing reactions
    const result = proto.set.apply(target, arguments)
    if (!hadKey) {
      queueReactionsForOperation({ target, key, value, type: 'add' })
    } else if (value !== oldValue) {
      queueReactionsForOperation({ target, key, value, oldValue, type: 'set' })
    }
    return result
  },
  delete (key) {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    const hadKey = proto.has.call(target, key)
    const oldValue = proto.get ? proto.get.call(target, key) : undefined
    // forward the operation before queueing reactions
    const result = proto.delete.apply(target, arguments)
    if (hadKey) {
      queueReactionsForOperation({ target, key, oldValue, type: 'delete' })
    }
    return result
  },
  clear () {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    const hadItems = target.size !== 0
    const oldTarget = target instanceof Map ? new Map(target) : new Set(target)
    // forward the operation before queueing reactions
    const result = proto.clear.apply(target, arguments)
    if (hadItems) {
      queueReactionsForOperation({ target, oldTarget, type: 'clear' })
    }
    return result
  },
  forEach (cb, ...args) {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, type: 'iterate' })
    // swap out the raw values with their observable pairs
    // before passing them to the callback
    const wrappedCb = (value, ...rest) => cb(findObservable(value), ...rest)
    return proto.forEach.call(target, wrappedCb, ...args)
  },
  keys () {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, type: 'iterate' })
    return proto.keys.apply(target, arguments)
  },
  values () {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, type: 'iterate' })
    const iterator = proto.values.apply(target, arguments)
    return patchIterator(iterator, false)
  },
  entries () {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, type: 'iterate' })
    const iterator = proto.entries.apply(target, arguments)
    return patchIterator(iterator, true)
  },
  [Symbol.iterator] () {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, type: 'iterate' })
    const iterator = proto[Symbol.iterator].apply(target, arguments)
    return patchIterator(iterator, target instanceof Map)
  },
  get size () {
    const target = proxyToRaw.get(this)
    const proto = Reflect.getPrototypeOf(this)
    registerRunningReactionForOperation({ target, type: 'iterate' })
    return Reflect.get(proto, 'size', target)
  }
}

const collectionsHandlers = {
  get (target, key, receiver) {
    // instrument methods and property accessors to be reactive
    target = hasOwnProperty.call(instrumentations, key)
      ? instrumentations
      : target
    return Reflect.get(target, key, receiver)
  }
}

export default collectionsHandlers
