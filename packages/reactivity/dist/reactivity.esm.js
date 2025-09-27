// packages/reactivity/src/effect.ts
var activeSub;
function effect(fn) {
  activeSub = fn;
  fn();
  activeSub = void 0;
}

// packages/reactivity/src/ref.ts
var RefImpl = class {
  _value;
  // 保存实际值
  // ref 标记，证明这是一个 ref 对象
  ["__v_isRef" /* IS_REF */] = true;
  subs;
  constructor(value) {
    this._value = value;
  }
  // 收集依赖
  get value() {
    if (activeSub) {
      this.subs = activeSub;
    }
    return this._value;
  }
  // 触发更新
  set value(newValue) {
    this._value = newValue;
    this.subs?.();
  }
};
function ref(value) {
  return new RefImpl(value);
}
function isRef(value) {
  return !!(value && value["__v_isRef" /* IS_REF */]);
}
export {
  activeSub,
  effect,
  isRef,
  ref
};
