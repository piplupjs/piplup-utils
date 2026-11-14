export function execSequentially(...funcs: unknown[]) {
  return (...args: unknown[]) => {
    funcs.forEach((func) => {
      if (typeof func === 'function') {
        func(...args);
      }
    });
  };
}
