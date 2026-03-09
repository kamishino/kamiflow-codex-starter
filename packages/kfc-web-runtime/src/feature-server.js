import Fastify from "fastify";

function resolvePort(address, fallbackPort) {
  return address && typeof address === "object" && "port" in address ? Number(address.port) : Number(fallbackPort);
}

export async function createFeatureServer(options = {}) {
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 0);
  const fastify = Fastify({ logger: false });
  const state = {
    fastify,
    feature: {},
    readyStarted: false
  };

  if (typeof options.setup === "function") {
    state.feature = (await options.setup(fastify)) || {};
  }

  async function ready() {
    if (!state.readyStarted) {
      state.readyStarted = true;
      if (typeof options.onBeforeReady === "function") {
        await options.onBeforeReady({
          fastify,
          feature: state.feature,
          host,
          port
        });
      }
    }
    await fastify.ready();
  }

  async function listen() {
    await ready();
    await fastify.listen({ host, port });
    const actualPort = resolvePort(fastify.server.address(), port);
    const base = {
      port: actualPort,
      url: `http://${host}:${actualPort}`
    };
    if (typeof options.onAfterListen === "function") {
      const extra = (await options.onAfterListen({
        fastify,
        feature: state.feature,
        host,
        port: actualPort
      })) || {};
      return { ...base, ...extra };
    }
    return base;
  }

  async function close() {
    await fastify.close();
    if (typeof options.onAfterClose === "function") {
      await options.onAfterClose({
        fastify,
        feature: state.feature,
        host,
        port
      });
    }
  }

  return {
    fastify,
    ...state.feature,
    ready,
    listen,
    close
  };
}
