// effect.ts
import { Link } from './system'

export let activeSub: ReactiveEffect

export class ReactiveEffect {
  constructor(public fn: Function) {}

  run() {
    // 先将当前的 Effect 存储，用于处理嵌套逻辑
    const prevSub = activeSub
    // 每次执行 fn 之前，把 this 实例放到 activeSub 上
    activeSub = this
    // 注意用try catch
    try {
      return this.fn()
    } finally {
      // 执行完毕后，清空 activeSub
      activeSub = prevSub
    }
  }
  /*
   * 如果依赖数据发生变化，由此方法通知更新。
   */
  notify() {
    this.scheduler()
  }
  
  /*
   * 默认的调度器，直接调用 run 方法。
   * 如果用户传入了自定义的 scheduler，它会作为实例属性覆盖掉这个原型方法。
   */
  scheduler() {
    this.run()
  }
}

export function effect(fn, options) {
  const e = new ReactiveEffect(fn)
  
  // 将 options (包含 scheduler) 合并到 effect 实例上
  Object.assign(e, options)
  
  e.run()

  /*
   * 绑定 this，确保 runner 函数在外部被调用时，
   * 内部的 this 依然指向 effect 实例 e。
   * 如果直接 return e.run，会丢失 this 上下文。
   */
  const runner = e.run.bind(e)

  // 将 effect 实例挂载到 runner 函数上，方便外部访问
  runner.effect = e
  
  return runner
}