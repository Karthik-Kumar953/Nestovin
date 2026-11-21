import * as Crypto from 'expo-crypto';

/**
 * A client event id for one check-in attempt. The same id is re-sent when a
 * request fails on the network, so the server returns the first outcome
 * instead of recording a second attempt.
 */
export const newClientEventId = () => `ci-${Crypto.randomUUID()}`;
