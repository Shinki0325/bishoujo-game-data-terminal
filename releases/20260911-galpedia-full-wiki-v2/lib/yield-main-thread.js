// Yield without the nested setTimeout clamp on browsers that lack scheduler.
// The same queue is shared by directory decoding, projection and filtering.
let channel = null;
const pending = [];
export function yieldMainThread() {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  if (typeof globalThis.setImmediate === 'function') return new Promise(resolve => globalThis.setImmediate(resolve));
  if (typeof MessageChannel === 'function') {
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = () => pending.shift()?.();
    }
    return new Promise(resolve => { pending.push(resolve); channel.port2.postMessage(null); });
  }
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Stable merge passes preserve native sort tie ordering while bounding each
// synchronous slice. The input array remains the returned array.
export async function sortWithYield(values, compare) {
  const size = values.length, chunk = 128;
  let started = performance.now();
  await yieldMainThread();
  for (let begin = 0; begin < size; begin += chunk) {
    const rows = values.slice(begin, begin + chunk).sort(compare);
    for (let i = 0; i < rows.length; i++) values[begin + i] = rows[i];
    if (performance.now() - started >= 8) { await yieldMainThread(); started = performance.now(); }
  }
  let source = values, target = new Array(size), operations = 0;
  for (let width = chunk; width < size; width *= 2) {
    for (let begin = 0; begin < size; begin += width * 2) {
      let left = begin, right = Math.min(begin + width, size), output = begin;
      const middle = right, end = Math.min(begin + width * 2, size);
      while (left < middle || right < end) {
        target[output++] = right >= end || (left < middle && !(compare(source[left], source[right]) > 0))
          ? source[left++] : source[right++];
        if ((++operations & 127) === 0 && performance.now() - started >= 8) {
          await yieldMainThread(); started = performance.now();
        }
      }
    }
    [source, target] = [target, source];
  }
  if (source !== values) for (let i = 0; i < size; i++) values[i] = source[i];
  await yieldMainThread();
  return values;
}
