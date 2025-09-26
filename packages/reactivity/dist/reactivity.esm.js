// packages/reactivity/src/effect.ts
function effect(fn) {
  fn();
}

// packages/reactivity/src/ref.ts
var RefImpl = class {
  _value;
  constructor(value) {
    this._value = value;
  }
  get value() {
    return this._value;
  }
  set value(newValue) {
    this._value = newValue;
  }
};
function ref(value) {
  return new RefImpl(value);
}
export {
  effect,
  ref
};
