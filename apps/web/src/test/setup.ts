import '@testing-library/jest-dom/vitest'

// jsdom에는 ResizeObserver가 없다. Radix Checkbox가 <form> 안에서 숨은 input 크기를 잴 때 쓴다.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
