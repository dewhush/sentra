await import('./addon-fit.js');
const F = globalThis.FitAddon?.FitAddon ?? globalThis.FitAddon;
export class FitAddon extends (F ?? class {}) {}
