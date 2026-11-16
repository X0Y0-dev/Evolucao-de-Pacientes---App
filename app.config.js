module.exports = ({ config }) => {
  // Cleartext HTTP (usesCleartextTraffic no Android e NSAllowsArbitraryLoads no iOS)
  // ativado apenas fora de produção para permitir chamadas HTTP na rede local em desenvolvimento.
  const isDev = process.env.APP_ENV !== 'production';

  return {
    ...config,
    updates: {
      url: 'https://u.expo.dev/2aa52259-0ba5-44d1-91e6-0feb1a4ab307',
    },
    runtimeVersion: {
      policy: 'fingerprint',
    },
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
