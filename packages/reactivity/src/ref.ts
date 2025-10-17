import { hasChange, isObject } from '@vue/shared'
import { activeSub } from './effect'
import { link, Link, propagate } from './system'
import { reactive } from './reactive'

export enum ReactiveFlags {
  IS_REF = '__v_isRef',
}

class RefImpl {
  _value; // 保存实际值
  // ref 标记，证明这是一个 ref 对象
  [ReactiveFlags.IS_REF] = true

  // 订阅者effect链表头节点，指向第一个订阅者
  subs: Link

  // 订阅者effect链表尾节点，指向最后一个订阅者
  subsTail: Link
  constructor(value) {
    // S情况四：嵌套对象传入 ref
    // 如果 value 是对象，则先转为响应式对象
    this._value = isObject(value) ? reactive(value) : value
  }

  // 收集依赖
  get value() {
    // 当有人访问时，可以获取 activeSub
    if (activeSub) {
      trackRef(this)
    }
    return this._value
  }

  // 触发更新
  set value(newValue) {
    if (hasChange(newValue, this._value)) {
      // S情况四：嵌套对象传入 ref
      // 值发生变化，则触发更新
      this._value = isObject(newValue) ? reactive(newValue) : newValue
      if (this.subs) {
        triggerRef(this)
      }
    }
  }
}

export function ref(value) {
  return new RefImpl(value)
}

export function isRef(value) {
  return !!(value && value[ReactiveFlags.IS_REF])
}

export function trackRef(dep) {
  link(dep, activeSub)
}

export function triggerRef(dep) {
  propagate(dep.subs)
}

class ObjectRefImpl {
  [ReactiveFlags.IS_REF] = true
  constructor(
    public _object,
    public _key,
  ) {}
  get value() {
    return this._object[this._key]
  }
  set value(newValue) {
    this._object[this._key] = newValue
  }
}
export function toRef(target, key) {
  return new ObjectRefImpl(target, key)
}

export function toRefs(object) {
  const res = {}
  for (const key in object) {
    res[key] = toRef(object, key)
  }
  return res
}

export function unref(ref) {
  return isRef(ref) ? ref.value : ref
}

export function proxyRefs(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const res = Reflect.get(target, key, receiver)
      /**
       * 自动解包
       */
      return unref(res)
    },
    set(target, key, newValue, receiver) {
      if (isRef(target[key]) && !isRef(newValue)) {
        // 若把 state.a 直接换成一个新的 ref，原有变量 a 不应被动同步（这是预期的非同步）
        /**
         * const a = ref(0)
         * target = { a }
         * 当执行 target.a = 1 时，本质上是 a.value = 1
         */
        target[key].value = newValue
        return true
      }
      return Reflect.set(target, key, newValue, receiver)
    },
  })
}
