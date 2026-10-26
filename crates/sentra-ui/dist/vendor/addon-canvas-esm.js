await import('./addon-canvas.js');
const C = globalThis.CanvasAddon?.CanvasAddon ?? globalThis.CanvasAddon;
export class CanvasAddon extends (C ?? class {}) {}
