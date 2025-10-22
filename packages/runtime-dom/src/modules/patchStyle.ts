export function patchStyle(el, prevValue, nextValue) {
  const style = el.style
  if (nextValue) {
    /**
     * 把新的样式全部生效，设置到 style 中
     */
    for (const key in nextValue) {
      style[key] = nextValue[key]
    }
  }

  if (prevValue) {
    /**
     * 把之前有的，但是现在没有的，给它删掉
     * 之前是 { background:'red' } => { color:'red' } 就要把 backgroundColor 删掉，把 color 应用上
     */
    for (const key in prevValue) {
      if (nextValue?.[key] == null) {
        style[key] = null
      }
    }
  }
}