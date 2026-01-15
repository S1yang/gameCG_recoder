export {};

declare global {
  interface Window {
    galrec: {
      getApiBase: () => Promise<string>;
    };
  }
}
