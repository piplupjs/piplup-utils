export function execSequentially(...funcs: unknown[]) {
  return function (...args: unknown[]) {
    funcs.forEach((func) => {
      if (typeof func === 'function') {
        func(...args);
      }
    });
  };
}
