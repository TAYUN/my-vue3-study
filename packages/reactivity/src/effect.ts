// effect.ts
import { Link } from './system'

export let activeSub: ReactiveEffect

export class ReactiveEffect {
  constructor(public fn: Function) {}

  run() {
    // 每次执行 fn 之前，把 this 实例放到 activeSub 上
    activeSub = this
    // 注意用try catch
    try {
      return this.fn()
    } finally {
      // 执行完毕后，清空 activeSub
      activeSub = undefined
    }
  }
}

export function effect(fn) {
  const e = new ReactiveEffect(fn)
  e.run()
}
