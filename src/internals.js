/**
 * 可观察对象为键,原始对象为值的集合
 */
export const proxyToRaw = new WeakMap()
/**
 * 原始对象为键,可观察对象为值的集合
 */
export const rawToProxy = new WeakMap()
