const connectionStore = new WeakMap()
const ITERATION_KEY = Symbol('iteration key')

/**
 * 存储可观察对象的reaction,键为原始对象,值为map(map的键为原始对象的属性,值为原始对象的对应键的reaction)
 * @param {*} obj 原始对象
 */
export function storeObservable (obj) {
  // this will be used to save (obj.key -> reaction) connections later
  connectionStore.set(obj, new Map())
}

/**
 * 为操作添加reaction,加在全局connectionStore的相应可观察对象上key属性的reaction集合上
 * @param {*} reaction 需要添加的reaction
 * @param {*} param1 操作参数,包含目标对象,操作的键,操作类型
 */
export function registerReactionForOperation (reaction, { target, key, type }) {
  if (type === 'iterate') {
    key = ITERATION_KEY
  }
  // 获取到目标对象的reaction的map结构
  const reactionsForObj = connectionStore.get(target)
  // 获取目标对象上键为[key]的对应的reactions
  let reactionsForKey = reactionsForObj.get(key)
  // 如果没有map结构上没有对应该键的reactions集合
  if (!reactionsForKey) {
    // 创建一个空的集合并且赋值在map上
    reactionsForKey = new Set()
    reactionsForObj.set(key, reactionsForKey)
  }
  // save the fact that the key is used by the reaction during its current run
  if (!reactionsForKey.has(reaction)) {
    // 如果当前reactions集合上没有该reaction,则在集合内添加上该reaction
    reactionsForKey.add(reaction)
    // 为reaction上的cleaners添加 针对该key的 reaction集合
    reaction.cleaners.push(reactionsForKey)
  }
}

/**
 * 获取操作的reactions
 * @param {*} param0 操作信息,包含目标对象,操作类型,操作属性键
 * @returns 返回该操作涉及的所有reactions
 */
export function getReactionsForOperation ({ target, key, type }) {
  // 获得
  const reactionsForTarget = connectionStore.get(target)
  const reactionsForKey = new Set()

  if (type === 'clear') {
    // 清空操作,把每一个属性的reactions都添加进来reactionsForKey(只有map和set有此操作)
    reactionsForTarget.forEach((_, key) => {
      addReactionsForKey(reactionsForKey, reactionsForTarget, key)
    })
  } else {
    // 否则只加当前操作的key的reactions
    addReactionsForKey(reactionsForKey, reactionsForTarget, key)
  }

  if (type === 'add' || type === 'delete' || type === 'clear') {
    // 改变数组长度的操作,要把当前目标对象的长度的reactions也添加到reactionsForKey中
    const iterationKey = Array.isArray(target) ? 'length' : ITERATION_KEY
    addReactionsForKey(reactionsForKey, reactionsForTarget, iterationKey)
  }

  return reactionsForKey
}

/**
 * 在reactionsForKey中追加reactionsForTarget中key对应的reactions
 * @param {*} reactionsForKey 针对key的reactions集合
 * @param {*} reactionsForTarget 针对目标对象的reactions集合的map结构
 * @param {*} key 具体的键
 */
function addReactionsForKey (reactionsForKey, reactionsForTarget, key) {
  // 在map结构中取出针对key值的reactions集合
  const reactions = reactionsForTarget.get(key)
  // 把取到的reactions全部推入reactionsForKey集合
  reactions && reactions.forEach(reactionsForKey.add, reactionsForKey)
}

// 释放reaction,取消reaction
export function releaseReaction (reaction) {
  if (reaction.cleaners) {
    // 如果reaction有观察的可观察值,则把其删除
    reaction.cleaners.forEach(releaseReactionKeyConnection, reaction)
  }
  reaction.cleaners = []
}
/**
 * 删除reactionsForKey上的reaction(this)
 * @param {*} reactionsForKey 针对某个key的reactions集合
 */
function releaseReactionKeyConnection (reactionsForKey) {
  // 删除在可观察对象
  reactionsForKey.delete(this)
}

export const logConnectionMap = () => {
  console.log(connectionStore)
}
