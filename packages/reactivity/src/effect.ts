export let activeSub;
export function effect(fn) {
  activeSub = fn;
  fn();
  activeSub = undefined;
}