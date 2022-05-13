import {
  registerReactionForOperation,
  getReactionsForOperation,
  releaseReaction
} from './store'

// reactions can call each other and form a call stack
const reactionStack = []
let isDebugging = false

export function runAsReaction (reaction, fn, context, args) {
  // do not build reactive relations, if the reaction is unobserved
  if (reaction.unobserved) {
    // 如果已经被取消观察了,则直接运行返回结果
    return Reflect.apply(fn, context, args)
  }

  // only run the reaction if it is not already in the reaction stack
  // TODO: improve this to allow explicitly recursive reactions
  // 如果reactionStack中已有该reaction,则不运行
  if (reactionStack.indexOf(reaction) === -1) {
    // release the (obj -> key -> reactions) connections
    // and reset the cleaner connections
    // 解绑
    releaseReaction(reaction)

    try {
      // set the reaction as the currently running one
      // this is required so that we can create (observable.prop -> reaction) pairs in the get trap
      // 推到reaction栈顶
      reactionStack.push(reaction)
      // 运行fn
      return Reflect.apply(fn, context, args)
    } finally {
      // always remove the currently running flag from the reaction when it stops execution
      // 从reaction栈中推出
      reactionStack.pop()
      console.log(reactionStack)
    }
  }
}

// register the currently running reaction to be queued again on obj.key mutations
/**
 * 为目标对象上key属性添加reaction
 * @param {*} operation 操作,包含目标对象,属性key,this指向,操作类型
 */
export function registerRunningReactionForOperation (operation) {
  // get the current reaction from the top of the stack
  // 从栈顶获取当前正在运行的reaction
  const runningReaction = reactionStack[reactionStack.length - 1]
  if (runningReaction) {
    // 如果当前有正在运行的reaction,则收集依赖
    debugOperation(runningReaction, operation)
    // 为目标对象的key属性的reactions集合追加当前正在运行的reaction
    registerReactionForOperation(runningReaction, operation)
  }
}

/**
 * 可观察对象改变后传播更改,触发reaction
 * @param {*} operation
 */
export function queueReactionsForOperation (operation) {
  // iterate and queue every reaction, which is triggered by obj.key mutation
  // 由obj.key 触发的操作,迭代并排队触发改操作的reaction
  getReactionsForOperation(operation).forEach(queueReaction, operation)
}

/**
 * 排队运行reaction
 * 追加debugger配置可以调试
 * 追加scheduler可以以该调度来运行reaction
 * @param {*} reaction
 */
function queueReaction (reaction) {
  // 调用reaction的debugger
  debugOperation(reaction, this)
  // queue the reaction for later execution or run it immediately
  if (typeof reaction.scheduler === 'function') {
    // 如果reaction的调度器为函数,则直接使用调度器调用该reaction
    reaction.scheduler(reaction)
  } else if (typeof reaction.scheduler === 'object') {
    // 如果reaction的调度器为一个对象,则使用该调度器的add方法添加改reaction给调度器
    reaction.scheduler.add(reaction)
  } else {
    // 如果reaction的调度器不为函数也不为对象,直接调用reaction
    reaction()
  }
}

/**
 * 如果reaction有debugger且当前没有正在运行的debugger,调用reaction的debugger
 * @param {*} reaction
 * @param {*} operation
 */
function debugOperation (reaction, operation) {
  if (reaction.debugger && !isDebugging) {
    console.log('debugger=========')
    // 如果reaction有配置debugger参数,并且现在没有正在debugger
    try {
      // 把当前debugger状态置为true
      isDebugging = true
      // 调用reaction的debugger函数,以operation为参数
      reaction.debugger(operation)
    } finally {
      // 把当前debugger状态置为false
      isDebugging = false
    }
  }
}

/**
 * 根绝reaction栈判断是否正在运行reaction
 * @returns 是否正在运行reaction
 */
export function hasRunningReaction () {
  return reactionStack.length > 0
}
