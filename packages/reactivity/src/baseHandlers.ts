import { hasChange, isObject } from '@vue/shared'
import { track, trigger } from './dep'
import { isRef } from './ref'
import { reactive } from './reactive'

export const mutableHandlers = {
  get(target, key, receiver) {
    // 收集依赖：绑定 target 的属性与 effect 的关系
    track(target, key)
    const res = Reflect.get(target, key, receiver)

    // S情况五1：将包含 ref 的 Reactive 对象解构并保持同步
    if (isRef(res)) {
      // ref 传入 reactive 后，当 reactive 更新同名字段时，ref.value 也要同步更新
      return res.value
    }

    // S情况六：初始化嵌套 Reactive 对象
    if (isObject(res)) {
      // 如果 res 是对象，则将其转为响应式对象（惰性转换）
      return reactive(res)
    }
    return res
  },
  set(target, key, newValue, receiver) {
    // S情况三：Reactive 对象重复赋相同数值
    const oldValue = target[key]

    // S情况五2：将包含 ref 的 Reactive 对象解构并保持同步
    // 若把 state.a 直接换成一个新的 ref，原有变量 a 不应被动同步（这是预期的非同步）
    /**
     * const a = ref(0)
     * target = { a }
     * 当执行 target.a = 1 时，本质上是 a.value = 1
     */
    // todo 还有疑问，这里
    if (isRef(oldValue) && !isRef(newValue)) {
      oldValue.value = newValue
      // 更新了 ref 的值，ref那边已经触发了依赖effect更新，reactive这里不用再触发
      // 直接返回，避免下方 trigger 再触发一次（双重触发）
      return true
    }

    const res = Reflect.set(target, key, newValue, receiver)
    if (hasChange(newValue, oldValue)) {
      // 仅当值确实变化时才触发更新
      trigger(target, key)
    }
    return res
  },
}
