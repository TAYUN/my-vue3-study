import { activeSub } from './effect'

enum ReactiveFlags {
  IS_REF = '__v_isRef'
}

class RefImpl {
  _value; // 保存实际值
   // ref 标记，证明这是一个 ref 对象
  [ReactiveFlags.IS_REF] = true

  subs
  constructor(value){
    this._value = value
  }

  // 收集依赖
  get value(){ 
    // 当有人访问时，可以获取 activeSub
    if(activeSub){
      // 当存在 activeSub 时存储它，以便更新后触发
      this.subs = activeSub
    }
    return this._value
  }

  // 触发更新
  set value(newValue){ 
    this._value = newValue
    // 通知 effect 重新执行，获取最新的 value
    this.subs?.()
  }
}

export function ref(value){
  return new RefImpl(value)
}

export function isRef(value){
  return !!(value && value[ReactiveFlags.IS_REF])
}
