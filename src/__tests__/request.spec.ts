jest.mock('@jupyterlab/coreutils', () => ({
  URLExt: { join: (a: string, ...parts: string[]) => [a, ...parts].join('') }
}));

const makeRequestMock = jest.fn();

jest.mock('@jupyterlab/services', () => ({
  ServerConnection: {
    makeSettings: jest.fn(() => ({ baseUrl: '/base/' })),
    makeRequest: makeRequestMock,
    ResponseError: class ResponseError extends Error {
      response: any;
      constructor(response: any, message: any) {
        super(message);
        this.response = response;
      }
    },
    NetworkError: class NetworkError extends Error {}
  }
}));

import { requestAPI } from '../request';

describe('requestAPI', () => {
  beforeEach(() => {
    makeRequestMock.mockReset();
  });

  test('returns parsed JSON on success', async () => {
    const fakeResponse = {
      ok: true,
      text: async () => JSON.stringify({ hello: 'world' })
    };
    makeRequestMock.mockResolvedValueOnce(fakeResponse);

    const res = await requestAPI('test');
    expect(res).toEqual({ hello: 'world' });
    expect(makeRequestMock).toHaveBeenCalled();
  });

  test('throws ResponseError on non-ok response', async () => {
    const fakeResponse = {
      ok: false,
      text: async () => JSON.stringify({ message: 'bad' })
    };
    makeRequestMock.mockResolvedValueOnce(fakeResponse);

    await expect(requestAPI('bad')).rejects.toThrow();
  });
});
