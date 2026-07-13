// Minimal type stub for react-test-renderer (no @types package installed)
declare module 'react-test-renderer' {
  import * as React from 'react';

  interface ReactTestRenderer {
    update(nextElement: React.ReactElement): void;
    unmount(): void;
    getInstance(): any;
    toJSON(): any;
    root: any;
  }

  function create(element: React.ReactElement, options?: any): ReactTestRenderer;
  function act(callback: () => void | Promise<void>): void | Promise<void>;

  export { create, act };
  export default { create, act };
}
