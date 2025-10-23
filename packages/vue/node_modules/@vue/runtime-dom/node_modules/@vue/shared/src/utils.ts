export function isObject(value) {
  return typeof value === 'object' && value !== null
}

/**
 * 看一下值有没有变
 * @param newValue
 * @param oldValue
 */
export function hasChange(newValue, oldValue) {
  return !Object.is(newValue, oldValue)
}

export function isFunction(value) {
  return typeof value === 'function'
}

export function isString(value) {
  return typeof value === 'string'
}

export function isNumber(value) {
  return typeof value === 'number'
}

export function isOn(key) {
  return /^on[A-Z]/.test(key)
}

export const isArray = Array.isArray

export function hasOwn(object, key) {
  return Object.hasOwn(object, key)
}