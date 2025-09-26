class RefImpl { 
  _value;
  constructor(value) {
    this._value = value
  }
  get value() {
    return this._value
  }
  set value(newValue) {
    this._value = newValue
  }
}

export function ref(value) {
  return new RefImpl(value)
}