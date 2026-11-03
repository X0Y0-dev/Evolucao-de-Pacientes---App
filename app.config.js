module.exports = ({ config }) => {
  // Cleartext HTTP (usesCleartextTraffic no Android e NSAllowsArbitraryLoads no iOS)
  // ativado apenas fora de produção para permitir chamadas HTTP na rede local em desenvolvimento.
  const isDev = process.env.APP_ENV !== 'production';

  return {
    ...config,
    android: {
      ...config.android,
      ...(isDev ? { usesCleartextTraffic: true } : {}),
    },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(isDev
          ? {
              NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: true,
              },
            }
          : {}),
      },
    },
  };
};
