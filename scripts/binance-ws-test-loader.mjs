export async function resolve(specifier, context, nextResolve) {
  if (specifier === "ws") {
    return {
      url: new URL("./binance-ws-test-socket.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
