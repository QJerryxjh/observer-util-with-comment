export { observe, unobserve } from './observer'
export { observable, isObservable, raw } from './observable'
export { logConnectionMap } from './store'
import { proxyToRaw, rawToProxy } from './internals'
export const logProxyAndRowMap = () => {
    console.log('proxyToRaw', proxyToRaw)
    console.log('rawToProxy', rawToProxy)
}
