import 'fake-indexeddb/auto';

// a base local recusa rodar fora do navegador; nos testes, o "navegador" é o Node
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}
