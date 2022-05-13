import { runAsReaction } from './reactionRunner'
import { releaseReaction } from './store'

const IS_REACTION = Symbol('is reaction')

export function observe(fn, options = {}) {
  // wrap the passed function in a reaction, if it is not already one
  // 如果传入的函数不是一个reaction函数,则用reaction包裹一下
  const reaction = fn[IS_REACTION]
    ? fn
    : function reaction() {
      return runAsReaction(reaction, fn, this, arguments)
    }
  // save the scheduler and debugger on the reaction
  reaction.scheduler = options.scheduler
  reaction.debugger = options.debugger
  // save the fact that this is a reaction
  reaction[IS_REACTION] = true
  // run the reaction once if it is not a lazy one
  // 不是懒运行函数,则直接先运行一次,reaction只有在被运行一次之后才会收集到依赖,所以如果reaction之前没有运行过,observe监听的值不会被监听
  if (!options.lazy) {
    reaction()
  }
  return reaction
}

export function unobserve(reaction) {
  // do nothing, if the reaction is already unobserved
  // 如果reaction已经被取消观察了,则什么也不做
  if (!reaction.unobserved) {
    // indicate that the reaction should not be triggered any more
    reaction.unobserved = true
    // release (obj -> key -> reaction) connections
    releaseReaction(reaction)
  }
  // unschedule the reaction, if it is scheduled
  // 如果reaction已经被调度,则取消调度
  if (typeof reaction.scheduler === 'object') {
    reaction.scheduler.delete(reaction)
  }
}
